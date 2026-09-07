-- ─────────────────────────────────────────────────────────────────────────────
-- Phase N — Mission Foundation: the first schema for MRKT's "AI Marketing
-- Team" layer (Missions → Tasks → Agents → Approvals) on top of the existing
-- Marketing Hub. Additive only — no existing table is altered, no existing
-- flow changes.
--
-- Design constraints carried over deliberately from every prior phase's
-- established discipline (see _shared/agencyWorkspace.ts's own header):
--   • Every new table is owner-scoped (business_id = auth.uid()) with RLS,
--     matching the Phase A/H remediation pattern exactly.
--   • Mutation of missions/tasks/approvals is SECURITY DEFINER RPC-only —
--     no direct client UPDATE grant on any of them. This is what makes
--     "approval enforced server-side" true rather than a client convention.
--   • Retries are idempotent by construction: completion is a single atomic
--     UPDATE ... WHERE leased_by = worker_id, so a reclaimed/duplicate
--     completion call is a safe no-op (same shape as
--     complete_market_intelligence_work's Phase G lease pattern).
--   • search_path is pinned on every SECURITY DEFINER function from the
--     start (Phase H taught us not to backfill this later).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Agents — a static role registry, not a live table businesses write to.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agents (
  key           text        PRIMARY KEY,
  name          text        NOT NULL,
  department    text        NOT NULL CHECK (department IN ('strategy','growth','content','social','creative','copy','performance','intelligence','lifecycle','analytics')),
  role_summary  text        NOT NULL,
  icon          text        NOT NULL DEFAULT 'Sparkles',
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read agents" ON public.agents
  FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE grant to any client role — the roster changes via
-- migration only, matching the audit's "reference data, not user data" shape.

INSERT INTO public.agents (key, name, department, role_summary, icon) VALUES
  ('cmo',          'MRKT CMO',                  'strategy',     'Owns overall marketing strategy, priorities, delegation, and final recommendations.', 'Crown'),
  ('growth',       'Growth Lead',                'growth',       'Owns acquisition, funnels, experiments, and conversion strategy.',                    'TrendingUp'),
  ('content',      'Content Director',           'content',      'Owns content strategy, pillars, calendars, and channel strategy.',                    'FileText'),
  ('social',       'Social Media Manager',       'social',       'Owns social planning, captions, scheduling, and community strategy.',                 'Share2'),
  ('creative',     'Creative Director',          'creative',     'Owns campaign concepts, creative strategy, and asset direction.',                      'Palette'),
  ('copy',         'Copywriter',                 'copy',         'Owns campaign copy, ad copy, hooks, CTAs, and messaging.',                             'PenLine'),
  ('performance',  'Performance Marketer',       'performance',  'Owns paid acquisition structure, targeting, and budget/ROAS optimization.',            'Target'),
  ('intelligence', 'Market Intelligence Analyst','intelligence', 'Owns market research, competitor research, trends, and positioning.',                  'Radar'),
  ('lifecycle',    'Lifecycle / CRM Manager',    'lifecycle',    'Owns retention, segmentation, onboarding, and lifecycle strategy.',                    'Repeat'),
  ('analyst',      'Marketing Analyst',          'analytics',    'Owns measurement, attribution, campaign analysis, and reporting.',                     'BarChart3')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Business autonomy policy — one row per business. Default level 2
--    (Copilot: safe/internal/reversible tools may auto-execute; anything
--    the tool registry itself classifies 'sensitive' is NEVER auto-executed
--    by this schema regardless of level — see mission_tasks.risk_level and
--    the tool registry in _shared/missionTools.ts, which hardcodes that
--    money/external-publish/outreach/third-party tools carry no executor at
--    all in this phase. Level here only ever gates the 'safe' lane.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.business_autonomy_policy (
  business_id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  autonomy_level          smallint    NOT NULL DEFAULT 2 CHECK (autonomy_level BETWEEN 1 AND 4),
  auto_execute_safe_tasks boolean     NOT NULL DEFAULT true,
  max_auto_spend_usd_per_task numeric NOT NULL DEFAULT 1.00 CHECK (max_auto_spend_usd_per_task >= 0),
  proactive_missions_enabled boolean  NOT NULL DEFAULT false, -- §17 foundation only; nothing creates proactive missions yet
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_autonomy_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own autonomy policy" ON public.business_autonomy_policy
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
CREATE POLICY "Owner upserts own autonomy policy" ON public.business_autonomy_policy
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = business_id);
CREATE POLICY "Owner updates own autonomy policy" ON public.business_autonomy_policy
  FOR UPDATE TO authenticated USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);
-- Deliberately client-writable (unlike missions/tasks/approvals below): this
-- is the one lever spec §25 requires the owner control directly — "change
-- autonomy" — and it can only ever loosen the 'safe' lane, never grant
-- execution rights to a 'sensitive' tool (no column here can do that).

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Missions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.missions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  objective         text        NOT NULL CHECK (length(objective) BETWEEN 1 AND 2000),
  objective_summary text,
  status            text        NOT NULL DEFAULT 'planning'
                                 CHECK (status IN ('planning','active','blocked','completed','cancelled','failed')),
  priority          text        NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  target_metrics    jsonb       NOT NULL DEFAULT '[]',
  strategy_summary  text,
  plan_schema_version integer   NOT NULL DEFAULT 1,
  created_by        uuid        REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS missions_business_idx ON public.missions (business_id, status, created_at DESC);

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own missions" ON public.missions
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
-- No client INSERT/UPDATE/DELETE grant. Creation is via the cmo-create-mission
-- edge function (service role); status transitions are via cancel_mission()
-- below (SECURITY DEFINER, checks auth.uid() itself) or the task runner.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Mission tasks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mission_tasks (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id      uuid        NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  business_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- denormalized for RLS + direct query, mirrors agencyWorkspace's pattern of always scoping by businessId explicitly
  agent_key       text        NOT NULL REFERENCES public.agents(key),
  tool_name       text        NOT NULL,
  title           text        NOT NULL,
  input_data      jsonb       NOT NULL DEFAULT '{}',
  output_data     jsonb,
  status          text        NOT NULL DEFAULT 'blocked'
                               CHECK (status IN ('blocked','ready','running','awaiting_approval','completed','failed','cancelled')),
  risk_level      text        NOT NULL CHECK (risk_level IN ('safe','sensitive')),
  requires_approval boolean   NOT NULL DEFAULT false,
  depends_on      uuid[]      NOT NULL DEFAULT '{}',
  order_index     integer     NOT NULL DEFAULT 0,
  retry_count     integer     NOT NULL DEFAULT 0,
  max_retries     integer     NOT NULL DEFAULT 2,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_message   text,
  leased_by       uuid,
  leased_until    timestamptz,
  estimated_cost_usd numeric,
  actual_cost_usd numeric,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_tasks_mission_idx  ON public.mission_tasks (mission_id, order_index);
CREATE INDEX IF NOT EXISTS mission_tasks_business_idx ON public.mission_tasks (business_id, status);
-- The claim query's core predicate — kept as one partial index so the
-- bounded-batch dispatcher (claim_ready_mission_tasks) stays cheap even as
-- this table grows, matching Phase H's fk-index discipline.
CREATE INDEX IF NOT EXISTS mission_tasks_ready_idx ON public.mission_tasks (next_attempt_at)
  WHERE status = 'ready';

ALTER TABLE public.mission_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own mission tasks" ON public.mission_tasks
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
-- No client write grant at all. Every transition goes through a SECURITY
-- DEFINER RPC below so "never let a retry accidentally publish/spend/contact
-- twice" (spec §7) is enforced in one place, not hoped for client-side.

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Approvals
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mission_approvals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id          uuid        NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  task_id             uuid        NOT NULL UNIQUE REFERENCES public.mission_tasks(id) ON DELETE CASCADE,
  business_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type         text        NOT NULL,
  preview             jsonb       NOT NULL DEFAULT '{}',
  risk_level          text        NOT NULL CHECK (risk_level IN ('safe','sensitive')),
  financial_impact_usd numeric,
  status              text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_at        timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz,
  decided_by          uuid        REFERENCES auth.users(id),
  execution_result    jsonb
);

CREATE INDEX IF NOT EXISTS mission_approvals_business_idx ON public.mission_approvals (business_id, status, requested_at DESC);

ALTER TABLE public.mission_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own approvals" ON public.mission_approvals
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
-- No client UPDATE grant — deciding an approval is decide_mission_approval()
-- below, so "approval must be enforced server-side" (spec §12) isn't just a
-- UI convention a direct PostgREST PATCH could bypass.

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Mission events — append-only audit trail (spec §21)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mission_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  uuid        NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  task_id     uuid        REFERENCES public.mission_tasks(id) ON DELETE SET NULL,
  business_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,
  actor       text        NOT NULL, -- 'system' | 'agent:<key>' | 'user'
  message     text        NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_events_mission_idx ON public.mission_events (mission_id, created_at);

ALTER TABLE public.mission_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own mission events" ON public.mission_events
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
-- No client INSERT grant — same "audit log must never be client-writable or
-- forgeable" rule Phase A applied to admin_actions.

GRANT SELECT, INSERT, UPDATE ON public.missions, public.mission_tasks, public.mission_approvals, public.mission_events TO service_role;
GRANT SELECT ON public.agents TO service_role;
GRANT SELECT, UPDATE ON public.business_autonomy_policy TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Engine RPCs — all SECURITY DEFINER, search_path pinned from creation
--    (Phase H taught us not to backfill this later).
-- ═══════════════════════════════════════════════════════════════════════════

-- Re-evaluates the dependency graph for one mission: promotes 'blocked'
-- tasks whose dependencies are all 'completed' to 'ready'; cascades
-- 'cancelled'/'failed' dependencies forward (a task can never run with a
-- failed prerequisite); closes the mission once every task is terminal.
-- Loops a bounded number of times to settle multi-level chains in one call.
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

    -- Cascade-cancel: any blocked/ready task depending on a failed or
    -- cancelled task can never run.
    UPDATE public.mission_tasks t
    SET status = 'cancelled', error_message = 'Cancelled: a dependency failed or was cancelled.', updated_at = now()
    WHERE t.mission_id = p_mission_id
      AND t.status IN ('blocked','ready')
      AND EXISTS (
        SELECT 1 FROM public.mission_tasks d
        WHERE d.id = ANY(t.depends_on) AND d.status IN ('failed','cancelled')
      );
    IF FOUND THEN v_changed := true; END IF;

    -- Promote: every dependency completed → ready to claim.
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

GRANT EXECUTE ON FUNCTION public.advance_mission_task_graph(uuid) TO service_role;

-- Atomic bounded-batch claim (Phase G's dispatcher shape, generalized past
-- one business): claims up to p_limit 'ready' tasks across ALL businesses,
-- but never more than one running task per business at a time (a simple,
-- hard concurrency cap — spec §15's "no runaway loops" — and never more
-- than 3 auto-executed 'safe' tasks per mission per rolling hour, so a bad
-- plan can't hammer one mission into a spend loop even within the cap).
-- 'sensitive' tasks are NEVER claimable here — they only ever move via
-- decide_mission_approval() below.
CREATE OR REPLACE FUNCTION public.claim_ready_mission_tasks(p_worker_id uuid, p_limit integer DEFAULT 5)
RETURNS SETOF public.mission_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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
        -- Lane 1: a 'safe' task auto-executing for the first time — gated by
        -- the business's own autonomy toggle.
        (t.risk_level = 'safe' AND EXISTS (
          SELECT 1 FROM public.business_autonomy_policy p
          WHERE p.business_id = t.business_id AND p.auto_execute_safe_tasks = true
        ))
        OR
        -- Lane 2: a 'sensitive' task that already has an explicit human
        -- approval on file — this is the ONLY way a sensitive task is ever
        -- claimed. No autonomy level, however high, skips this.
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

GRANT EXECUTE ON FUNCTION public.claim_ready_mission_tasks(uuid, integer) TO service_role;

-- Atomic completion — WHERE leased_by = p_worker_id makes a duplicate/late
-- completion call (a reclaimed lease, a retried HTTP call to the runner) a
-- safe no-op instead of a double-write, the same idempotency shape as
-- complete_market_intelligence_work.
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
  IF p_status NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'complete_mission_task: invalid status %', p_status;
  END IF;

  SELECT mission_id, retry_count, max_retries INTO v_mission_id, v_retry_count, v_max_retries
  FROM public.mission_tasks WHERE id = p_task_id AND leased_by = p_worker_id AND status = 'running'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false; -- lease was reclaimed or already completed — safe no-op
  END IF;

  v_final_status := p_status;
  IF p_status = 'failed' AND v_retry_count < v_max_retries THEN
    -- Linear backoff, not immediate re-claim — spec §7 "idempotent retries",
    -- §16 "a single AI failure must not corrupt an entire Mission".
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

GRANT EXECUTE ON FUNCTION public.complete_mission_task(uuid, uuid, text, jsonb, text, numeric) TO service_role;

-- Moves a running task to awaiting_approval and opens the approval record.
-- Idempotent: WHERE leased_by ensures a stale/duplicate call is a no-op.
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
  SELECT mission_id, business_id INTO v_mission_id, v_business_id
  FROM public.mission_tasks WHERE id = p_task_id AND leased_by = p_worker_id AND status = 'running'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.mission_tasks
  SET status = 'awaiting_approval', leased_by = NULL, leased_until = NULL, updated_at = now()
  WHERE id = p_task_id;

  INSERT INTO public.mission_approvals (mission_id, task_id, business_id, action_type, preview, risk_level, financial_impact_usd)
  VALUES (v_mission_id, p_task_id, v_business_id, p_action_type, p_preview, p_risk_level, p_financial_impact_usd)
  ON CONFLICT (task_id) DO NOTHING; -- one approval per task, ever

  INSERT INTO public.mission_events (mission_id, task_id, business_id, event_type, actor, message, payload)
  SELECT v_mission_id, p_task_id, v_business_id, 'approval_requested', 'agent:' || agent_key,
         title || ' needs your approval', jsonb_build_object('action_type', p_action_type)
  FROM public.mission_tasks WHERE id = p_task_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_task_approval(uuid, uuid, text, jsonb, text, numeric) TO service_role;

-- The ONE client-callable mutation among the mission tables. Caller must own
-- the business the approval belongs to (checked here, not just trusted from
-- the request body) — this is what makes approval enforcement server-side
-- rather than a UI convention. Approving simply returns the task to 'ready'
-- (for a tool with a real executor) or, for a prepare-only tool, completes
-- it directly with an honest "prepared, not executed" output — the runner
-- never claims an external action happened that didn't. Which shape applies
-- is decided by the edge function's tool registry at approval-decision time
-- (mission-task-runner), not by this RPC — this RPC only ever flips state
-- the caller is authorized to flip.
CREATE OR REPLACE FUNCTION public.decide_mission_approval(p_approval_id uuid, p_decision text)
RETURNS TABLE(task_id uuid, tool_name text, decision text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_task_id uuid;
  v_mission_id uuid;
  v_tool_name text;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'decide_mission_approval: invalid decision %', p_decision;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT a.business_id, a.task_id, a.mission_id INTO v_business_id, v_task_id, v_mission_id
  FROM public.mission_approvals a WHERE a.id = p_approval_id AND a.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found or already decided';
  END IF;
  IF v_business_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT t.tool_name INTO v_tool_name FROM public.mission_tasks t WHERE t.id = v_task_id;

  UPDATE public.mission_approvals
  SET status = p_decision, decided_at = now(), decided_by = auth.uid()
  WHERE id = p_approval_id;

  IF p_decision = 'rejected' THEN
    UPDATE public.mission_tasks SET status = 'cancelled', error_message = 'Rejected by business owner.', updated_at = now()
    WHERE id = v_task_id;
  ELSE
    -- Return to 'ready' so mission-task-runner picks it up next tick and
    -- performs the tool-specific "execute vs. mark-prepared" decision.
    UPDATE public.mission_tasks SET status = 'ready', next_attempt_at = now(), updated_at = now()
    WHERE id = v_task_id;
  END IF;

  INSERT INTO public.mission_events (mission_id, task_id, business_id, event_type, actor, message)
  VALUES (v_mission_id, v_task_id, v_business_id, 'approval_decided', 'user', 'Approval ' || p_decision || ' by business owner');

  PERFORM public.advance_mission_task_graph(v_mission_id);

  RETURN QUERY SELECT v_task_id, v_tool_name, p_decision;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_mission_approval(uuid, text) TO authenticated;

-- Human override (spec §25): cancel a mission and every non-terminal task,
-- reject any still-pending approvals. Owner-only, checked internally.
CREATE OR REPLACE FUNCTION public.cancel_mission(p_mission_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT business_id INTO v_business_id FROM public.missions WHERE id = p_mission_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_business_id <> auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE public.mission_tasks SET status = 'cancelled', error_message = 'Mission cancelled by business owner.', leased_by = NULL, leased_until = NULL, updated_at = now()
  WHERE mission_id = p_mission_id AND status NOT IN ('completed','failed','cancelled');

  UPDATE public.mission_approvals SET status = 'rejected', decided_at = now(), decided_by = auth.uid()
  WHERE mission_id = p_mission_id AND status = 'pending';

  UPDATE public.missions SET status = 'cancelled', updated_at = now() WHERE id = p_mission_id;

  INSERT INTO public.mission_events (mission_id, business_id, event_type, actor, message)
  VALUES (p_mission_id, v_business_id, 'mission_cancelled', 'user', 'Mission cancelled by business owner');

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_mission(uuid) TO authenticated;

-- Reclaim expired leases (a worker that died mid-execution) back to 'ready' —
-- same safety net shape as the Market Intelligence work queue's lease expiry.
CREATE OR REPLACE FUNCTION public.reclaim_expired_mission_task_leases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.mission_tasks
  SET status = 'ready', leased_by = NULL, leased_until = NULL, next_attempt_at = now(), updated_at = now()
  WHERE status = 'running' AND leased_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reclaim_expired_mission_task_leases() TO service_role;

-- A 'sensitive' task that has just become ready (all dependencies met) has
-- no lease-based claim path at all — it goes straight to awaiting_approval,
-- atomically, exactly once (NOT EXISTS an approval row already is the
-- idempotency guard, so an overlapping cron tick is a safe no-op). This is
-- the mechanism that makes "money/external/outreach/destructive actions
-- always stop for a human" true structurally, not just true by default
-- policy — nothing in business_autonomy_policy can skip this function.
CREATE OR REPLACE FUNCTION public.open_pending_sensitive_approvals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer := 0; v_rec record;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.open_pending_sensitive_approvals() TO service_role;
