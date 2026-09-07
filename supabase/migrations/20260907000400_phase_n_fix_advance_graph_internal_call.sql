-- ─────────────────────────────────────────────────────────────────────────────
-- Phase N hotfix #2 — advance_mission_task_graph's own internal
-- auth.role()='service_role' guard (added in the previous grant hotfix)
-- broke its legitimate caller: decide_mission_approval (callable by a real
-- authenticated business owner) invokes it via PERFORM as an internal step.
--
-- Root cause: auth.role() reflects the JWT claims of the ORIGINAL top-level
-- caller — it is NOT changed by SECURITY DEFINER's privilege elevation, no
-- matter how many SECURITY DEFINER layers the call passes through. So when
-- an 'authenticated' user calls decide_mission_approval, which then PERFORMs
-- advance_mission_task_graph internally, auth.role() inside that nested call
-- still reads 'authenticated' — tripping the guard every time, 100% of the
-- time, for every real approval decision. Confirmed live: the exact error
-- "advance_mission_task_graph is service-role only" surfaced to a real user
-- clicking Approve, and mission_approvals never updated.
--
-- The REVOKE from the previous hotfix is NOT affected by this bug and
-- remains the real protection here: a direct external call to
-- advance_mission_task_graph as 'authenticated' is still denied at the
-- GRANT level (permission denied before the function body even runs),
-- because Postgres privilege-checks a called function against the CALLING
-- function's effective role — decide_mission_approval is SECURITY DEFINER
-- owned by postgres, so its internal call to advance_mission_task_graph is
-- privilege-checked as postgres (which has full owner rights), while a
-- direct REST call from a client is privilege-checked as the client's own
-- role (authenticated/anon), which has no grant. This is exactly why the
-- grant-level REVOKE is sufficient on its own for this one function, and the
-- redundant internal check must be removed rather than patched further.
--
-- Every other Phase N function keeping its auth.role() guard is unaffected:
-- none of them are ever called transitively from an authenticated (as
-- opposed to service_role) context — only advance_mission_task_graph has
-- this specific dual-caller shape.
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

-- Grant state is UNCHANGED by this migration (still no anon/authenticated
-- EXECUTE grant, from the previous hotfix) — this migration only removes
-- the broken internal check from the function body.
