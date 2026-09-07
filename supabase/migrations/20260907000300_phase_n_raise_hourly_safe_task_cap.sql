-- ─────────────────────────────────────────────────────────────────────────────
-- Phase N tuning — raise the per-mission hourly safe-task cap from 3 to 10.
--
-- Found live during production validation: a real, non-adversarial 7-task
-- Mission plan (5 'safe' tasks) legitimately hit the original conservative
-- guess of 3/hour within 17 minutes, stalling a genuinely-progressing
-- Mission for up to an hour with no misbehavior involved. The cap's purpose
-- (spec: "no runaway loops") is still served at 10 — that's still a hard,
-- low ceiling against a genuinely pathological plan (this tool registry
-- only allows up to 10 tasks per mission in total, per MissionPlanSchema),
-- while no longer choking a normal, realistic Mission. The per-business
-- concurrency cap (1 running task at a time) is untouched and remains the
-- primary anti-runaway-spend control; this is a secondary, per-mission
-- backstop, not the main defense.
-- ─────────────────────────────────────────────────────────────────────────────

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
    GROUP BY mission_id HAVING count(*) >= 10
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

REVOKE EXECUTE ON FUNCTION public.claim_ready_mission_tasks(uuid, integer) FROM anon, authenticated;
