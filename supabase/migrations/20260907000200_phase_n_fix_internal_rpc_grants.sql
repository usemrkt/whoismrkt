-- ─────────────────────────────────────────────────────────────────────────────
-- Phase N hotfix — internal-only RPCs were reachable by anon/authenticated.
--
-- Found during pre-production-validation grant verification (querying
-- pg_proc.proacl directly, not inferred): this project's public schema has
-- ALTER DEFAULT PRIVILEGES granting EXECUTE on every new function to
-- anon/authenticated/service_role automatically (confirmed via
-- pg_default_acl) — a plain `GRANT EXECUTE ... TO service_role` in the
-- Phase N migration therefore ADDED a grant without ever REMOVING the
-- default anon/authenticated one. All 6 internal-only Phase N functions
-- (meant to be called only by the mission-task-runner worker under the
-- service-role key) were live-callable by any authenticated user, and
-- claim_ready_mission_tasks/complete_mission_task specifically would have
-- let one business hijack or forge execution state on ANOTHER business's
-- mission tasks (no ownership check exists in those functions — by design,
-- since they're meant to run as the trusted worker, not a business's own
-- session).
--
-- Root cause confirmed project-wide, not Phase-N-specific: querying
-- complete_market_intelligence_work (Phase G's pre-existing, already-shipped
-- analog) shows the exact same anon/authenticated grant and no internal
-- auth.role() check — flagged separately as a pre-existing finding, not
-- fixed here (out of Phase N's scope; a different subsystem this pass was
-- explicitly told not to touch).
--
-- Two-layer fix, matching the belt-and-suspenders pattern this codebase
-- already uses elsewhere (e.g. check_and_reserve_automated_budget,
-- the vault wrapper RPCs, ai_router_atomic_quota):
--   1. An internal `auth.role() <> 'service_role'` guard — the layer that
--      actually matters, since it holds regardless of what GRANT state
--      exists now or drifts to later.
--   2. Explicit REVOKE of the anon/authenticated grants this project's
--      default privileges added — closes the direct exploit window
--      immediately, doesn't wait on the internal guard alone.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.advance_mission_task_graph(p_mission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed  boolean := true;
  v_rounds   integer := 0;
  v_total    integer;
  v_terminal integer;
  v_failed   integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'advance_mission_task_graph is service-role only';
  END IF;

  WHILE v_changed AND v_rounds < 20 LOOP
    v_changed := false;
    v_rounds := v_rounds + 1;

    UPDATE public.mission_tasks t
    SET status = 'cancelled', error_message = 'Cancelled: a dependency failed or was cancelled.', updated_at = now()
    WHERE t.mission_id = p_mission_id
      AND t.status IN ('blocked','ready')
      AND EXISTS (
        SELECT 1 FROM public.mission_tasks d
        WHERE d.id = ANY(t.depends_on) AND d.status IN ('failed','cancelled')
      );
    IF FOUND THEN v_changed := true; END IF;

    UPDATE public.mission_tasks t
    SET status = 'ready', updated_at = now()
    WHERE t.mission_id = p_mission_id
      AND t.status = 'blocked'
      AND NOT EXISTS (
        SELECT 1 FROM public.mission_tasks d
        WHERE d.id = ANY(t.depends_on) AND d.status <> 'completed'
      );
    IF FOUND THEN v_changed := true; END IF;
  END LOOP;

  SELECT count(*), count(*) FILTER (WHERE status IN ('completed','failed','cancelled')), count(*) FILTER (WHERE status = 'failed')
    INTO v_total, v_terminal, v_failed
  FROM public.mission_tasks WHERE mission_id = p_mission_id;

  IF v_total > 0 AND v_total = v_terminal THEN
    UPDATE public.missions
    SET status = CASE WHEN v_failed > 0 THEN 'failed' ELSE 'completed' END,
        completed_at = now(), updated_at = now()
    WHERE id = p_mission_id AND status NOT IN ('completed','failed','cancelled');
  ELSIF v_total > 0 THEN
    UPDATE public.missions SET status = 'active', updated_at = now()
    WHERE id = p_mission_id AND status = 'planning';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ready_mission_tasks(p_worker_id uuid, p_limit integer DEFAULT 5)
RETURNS SETOF public.mission_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_ready_mission_tasks is service-role only';
  END IF;

  RETURN QUERY
  WITH businesses_at_capacity AS (
    SELECT DISTINCT business_id FROM public.mission_tasks WHERE status = 'running'
  ),
  missions_over_hourly_cap AS (
    SELECT mission_id FROM public.mission_tasks
    WHERE status = 'completed' AND completed_at > now() - interval '1 hour'
    GROUP BY mission_id HAVING count(*) >= 3
  ),
  candidates AS (
    SELECT t.id FROM public.mission_tasks t
    WHERE t.status = 'ready'
      AND t.next_attempt_at <= now()
      AND t.business_id NOT IN (SELECT business_id FROM businesses_at_capacity)
      AND t.mission_id NOT IN (SELECT mission_id FROM missions_over_hourly_cap)
      AND (
        (t.risk_level = 'safe' AND EXISTS (
          SELECT 1 FROM public.business_autonomy_policy p
          WHERE p.business_id = t.business_id AND p.auto_execute_safe_tasks = true
        ))
        OR
        (t.risk_level = 'sensitive' AND EXISTS (
          SELECT 1 FROM public.mission_approvals a WHERE a.task_id = t.id AND a.status = 'approved'
        ))
      )
    ORDER BY t.order_index, t.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.mission_tasks t
  SET status = 'running', leased_by = p_worker_id, leased_until = now() + interval '2 minutes',
      started_at = COALESCE(t.started_at, now()), updated_at = now()
  FROM candidates c
  WHERE t.id = c.id
  RETURNING t.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mission_task(
  p_task_id uuid, p_worker_id uuid, p_status text, p_output jsonb DEFAULT NULL,
  p_error text DEFAULT NULL, p_actual_cost_usd numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mission_id uuid;
  v_retry_count integer;
  v_max_retries integer;
  v_final_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'complete_mission_task is service-role only';
  END IF;
  IF p_status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'complete_mission_task: invalid status %', p_status;
  END IF;

  SELECT mission_id, retry_count, max_retries INTO v_mission_id, v_retry_count, v_max_retries
  FROM public.mission_tasks WHERE id = p_task_id AND leased_by = p_worker_id AND status = 'running'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_final_status := p_status;
  IF p_status = 'failed' AND v_retry_count < v_max_retries THEN
    UPDATE public.mission_tasks
    SET status = 'ready', retry_count = retry_count + 1,
        next_attempt_at = now() + (retry_count + 1) * interval '2 minutes',
        error_message = p_error, leased_by = NULL, leased_until = NULL, updated_at = now()
    WHERE id = p_task_id;
    PERFORM public.advance_mission_task_graph(v_mission_id);
    RETURN true;
  END IF;

  UPDATE public.mission_tasks
  SET status = v_final_status, output_data = COALESCE(p_output, output_data), error_message = p_error,
      actual_cost_usd = p_actual_cost_usd, completed_at = now(), leased_by = NULL, leased_until = NULL, updated_at = now()
  WHERE id = p_task_id;

  INSERT INTO public.mission_events (mission_id, task_id, business_id, event_type, actor, message, payload)
  SELECT v_mission_id, p_task_id, business_id,
         CASE WHEN v_final_status = 'completed' THEN 'task_completed' ELSE 'task_failed' END,
         'agent:' || agent_key, title || CASE WHEN v_final_status = 'failed' THEN ' — failed: ' || COALESCE(p_error, 'unknown error') ELSE ' — completed' END,
         jsonb_build_object('tool_name', tool_name, 'status', v_final_status)
  FROM public.mission_tasks WHERE id = p_task_id;

  PERFORM public.advance_mission_task_graph(v_mission_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_task_approval(
  p_task_id uuid, p_worker_id uuid, p_action_type text, p_preview jsonb,
  p_risk_level text, p_financial_impact_usd numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mission_id uuid;
  v_business_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'request_task_approval is service-role only';
  END IF;

  SELECT mission_id, business_id INTO v_mission_id, v_business_id
  FROM public.mission_tasks WHERE id = p_task_id AND leased_by = p_worker_id AND status = 'running'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.mission_tasks
  SET status = 'awaiting_approval', leased_by = NULL, leased_until = NULL, updated_at = now()
  WHERE id = p_task_id;

  INSERT INTO public.mission_approvals (mission_id, task_id, business_id, action_type, preview, risk_level, financial_impact_usd)
  VALUES (v_mission_id, p_task_id, v_business_id, p_action_type, p_preview, p_risk_level, p_financial_impact_usd)
  ON CONFLICT (task_id) DO NOTHING;

  INSERT INTO public.mission_events (mission_id, task_id, business_id, event_type, actor, message, payload)
  SELECT v_mission_id, p_task_id, v_business_id, 'approval_requested', 'agent:' || agent_key,
         title || ' needs your approval', jsonb_build_object('action_type', p_action_type)
  FROM public.mission_tasks WHERE id = p_task_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_expired_mission_task_leases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'reclaim_expired_mission_task_leases is service-role only';
  END IF;

  UPDATE public.mission_tasks
  SET status = 'ready', leased_by = NULL, leased_until = NULL, next_attempt_at = now(), updated_at = now()
  WHERE status = 'running' AND leased_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_pending_sensitive_approvals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer := 0; v_rec record;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'open_pending_sensitive_approvals is service-role only';
  END IF;

  FOR v_rec IN
    SELECT t.id, t.mission_id, t.business_id, t.tool_name, t.title, t.input_data
    FROM public.mission_tasks t
    WHERE t.status = 'ready' AND t.risk_level = 'sensitive'
      AND NOT EXISTS (SELECT 1 FROM public.mission_approvals a WHERE a.task_id = t.id)
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    UPDATE public.mission_tasks SET status = 'awaiting_approval', updated_at = now() WHERE id = v_rec.id;

    INSERT INTO public.mission_approvals (mission_id, task_id, business_id, action_type, preview, risk_level)
    VALUES (
      v_rec.mission_id, v_rec.id, v_rec.business_id, v_rec.tool_name,
      jsonb_build_object('title', v_rec.title, 'tool_name', v_rec.tool_name, 'input', v_rec.input_data),
      'sensitive'
    )
    ON CONFLICT (task_id) DO NOTHING;

    INSERT INTO public.mission_events (mission_id, task_id, business_id, event_type, actor, message)
    VALUES (v_rec.mission_id, v_rec.id, v_rec.business_id, 'approval_requested', 'system', v_rec.title || ' needs your approval');

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── Explicit revokes — close the grant window immediately, don't rely on
-- the internal guard alone (belt-and-suspenders, matches Phase A's style).
REVOKE EXECUTE ON FUNCTION public.advance_mission_task_graph(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_ready_mission_tasks(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_mission_task(uuid, uuid, text, jsonb, text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_task_approval(uuid, uuid, text, jsonb, text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reclaim_expired_mission_task_leases() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.open_pending_sensitive_approvals() FROM anon, authenticated;

-- The two genuinely client-callable RPCs keep `authenticated` (each already
-- has its own internal auth.uid()-ownership check) but never needed `anon` —
-- an anonymous caller has no JWT-derived uid, so today's behavior is already
-- a safe "Unauthorized" exception either way; this just removes the
-- unnecessary grant rather than depending on that internal check alone.
REVOKE EXECUTE ON FUNCTION public.decide_mission_approval(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_mission(uuid) FROM anon;
