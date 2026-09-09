-- ─────────────────────────────────────────────────────────────────────────────
-- Phase P — Proactive Marketing Operations + Specialist Agent Architecture.
-- Additive to Phase N (Missions) and Phase O (Business Brain). No existing
-- table is dropped or renamed; every alteration below is a nullable/defaulted
-- ADD COLUMN. Reuses `ai_recommendations` (evolved, not replaced) and
-- `agents` (extended with hierarchy, not restructured) per the audit's
-- explicit "do not create ai_recommendations_v2" instruction.
--
-- New closed loop this migration exists to support:
--   detector (TS, deterministic) → marketing_signals → marketing_findings
--   → ai_recommendations (evolved) → [owner: Start Mission] → missions
--   (Phase N, unchanged) → [Phase O Business Brain feeds every step].
--
-- Security posture carried over from Phase N/O exactly:
--   • Every new/altered table is owner-scoped (business_id = auth.uid()),
--     RLS SELECT-only for `authenticated` — mutation is SECURITY DEFINER
--     RPC-only, same as missions/mission_tasks/business_facts.
--   • Worker-only RPCs (called exclusively, directly, by the signal-detector
--     cron's own service-role edge function — never nested inside another
--     SECURITY DEFINER call that a real user session invoked) keep an
--     auth.role() = 'service_role' check AND an explicit REVOKE from
--     anon/authenticated — the same "6 worker-only functions" pattern the
--     live schema-invariant suite already guards for Phase N.
--   • Owner-facing RPCs (dismiss_recommendation) check auth.uid() directly
--     and are GRANTed to authenticated only, never anon.
--   • No new function is ever called BOTH by a worker AND nested inside a
--     user-session SECURITY DEFINER chain — the exact ambiguity that broke
--     advance_mission_task_graph in Phase N is structurally avoided here by
--     keeping worker-only and owner-only RPCs on two disjoint call paths.
--   • search_path pinned on every SECURITY DEFINER function from the start.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. marketing_signals — structured evidence that something potentially
--    meaningful changed. NOT a recommendation. Modeled directly on
--    market_intelligence_findings' shape (dedupe_key, confidence, no stored
--    freshness column — freshness is a pure function of last_detected_at,
--    computed in TS, never a column that can silently drift out of truth).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.marketing_signals (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  detector_key          text        NOT NULL,
  category              text        NOT NULL
                         CHECK (category IN ('performance','campaign','creative','market','business','mission','seasonal')),
  severity              text        NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  -- Reuses Phase O's exact confidence vocabulary for consistency across the
  -- whole "how sure is MRKT" surface — one mental model, not two.
  confidence            text        NOT NULL CHECK (confidence IN ('low','medium','high','verified')),
  status                text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved','dismissed')),
  -- Stable per (business, detector-defined dedupe key) while active — this
  -- IS the mechanism that makes "evolve, don't multiply" (spec §7) real: a
  -- second detection of the same underlying condition updates this row
  -- in place instead of creating a sibling.
  dedupe_key            text        NOT NULL,
  metric_label          text,
  metric_current        numeric,
  metric_baseline       numeric,
  change_pct            numeric,
  window_days           integer,
  data_source           text        NOT NULL,
  affected_objective    text,
  affected_channel      text,
  affected_campaign_id  uuid,
  evidence              jsonb       NOT NULL DEFAULT '{}',
  first_detected_at     timestamptz NOT NULL DEFAULT now(),
  last_detected_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  -- Set only when we actually re-notify (new signal, or a materially
  -- changed one) — suppresses re-notifying on every tick for an unchanged
  -- condition, per spec §7's cooldown requirement.
  cooldown_until         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Exactly one ACTIVE signal per (business, dedupe_key) — a resolved/dismissed
-- one can coexist with a later new active one (real history), same
-- supersession shape as Phase O's business_facts_active_slot_unique.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_signals_active_dedupe_unique
  ON public.marketing_signals (business_id, dedupe_key) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS marketing_signals_business_idx
  ON public.marketing_signals (business_id, status, last_detected_at DESC);

ALTER TABLE public.marketing_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own marketing signals" ON public.marketing_signals
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
-- No INSERT/UPDATE/DELETE policy for authenticated — every mutation goes
-- through upsert_marketing_signal_internal / resolve_marketing_signal_internal.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. marketing_findings — MRKT's interpretation of a signal's evidence.
--    Every row retains its supporting signal (Phase O provenance discipline
--    applied here too: an interpretation must always be traceable to real
--    evidence, never freestanding prose).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.marketing_findings (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id              uuid        REFERENCES public.marketing_signals(id) ON DELETE SET NULL,
  title                  text        NOT NULL,
  summary                text        NOT NULL,
  -- 'deterministic' when the finding is a direct, non-AI restatement of the
  -- signal's own numbers (today's live detectors); 'ai_inferred' reserved
  -- for a future finding that required real interpretation — never implied
  -- to be more certain than it is.
  interpretation_source  text        NOT NULL DEFAULT 'deterministic'
                         CHECK (interpretation_source IN ('deterministic','ai_inferred')),
  confidence             text        NOT NULL CHECK (confidence IN ('low','medium','high','verified')),
  evidence               jsonb       NOT NULL DEFAULT '{}',
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_findings_business_idx
  ON public.marketing_findings (business_id, created_at DESC);

ALTER TABLE public.marketing_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own marketing findings" ON public.marketing_findings
  FOR SELECT TO authenticated USING (auth.uid() = business_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ai_recommendations — EVOLVED, not replaced (audit finding: this table
--    already exists, is already the Marketing Hub's dismissible task-card
--    feed, and already has a `meta jsonb` escape hatch). All new columns are
--    nullable/defaulted — every existing writer (marketing-hub-briefing,
--    mission-task-runner) keeps working unmodified.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_recommendations
  ADD COLUMN IF NOT EXISTS finding_id uuid REFERENCES public.marketing_findings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signal_id  uuid REFERENCES public.marketing_signals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS effort     text,
  ADD COLUMN IF NOT EXISTS risk       text,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS affected_objective text,
  -- The "Proposed Mission" package (spec §10): why_now / found / proposed
  -- response / team / estimated internal AI cost / external spend. NULL for
  -- every recommendation that isn't Mission-shaped (e.g. a plain dismiss-only
  -- tip) — the UI only renders Start-Mission affordances when this is set.
  ADD COLUMN IF NOT EXISTS proposed_mission jsonb,
  ADD COLUMN IF NOT EXISTS dismissed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS converted_to_mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.ai_recommendations
    ADD CONSTRAINT ai_recommendations_confidence_check
    CHECK (confidence IS NULL OR confidence IN ('low','medium','high','verified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_recommendations
    ADD CONSTRAINT ai_recommendations_effort_check
    CHECK (effort IS NULL OR effort IN ('low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_recommendations
    ADD CONSTRAINT ai_recommendations_risk_check
    CHECK (risk IS NULL OR risk IN ('low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ai_recommendations_signal_idx ON public.ai_recommendations (signal_id) WHERE signal_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. missions — one additive column: lineage back to the recommendation a
--    proactively-proposed Mission was started from (NULL for every
--    owner-initiated Mission, unchanged behavior).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS source_recommendation_id uuid REFERENCES public.ai_recommendations(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. business_autonomy_policy — one additive column, the round-robin cursor
--    the signal-detector cron uses to bound its own cost per tick (spec
--    §31/§32: scheduled, bounded, cost-aware). proactive_missions_enabled
--    already existed from Phase N (added ahead of this phase, default
--    false) — reused as-is, still the gate for whether a Proposed Mission
--    may ever be auto-started; it never is in Phase P (Start Mission is
--    always an explicit click) but the flag is left in place for a future
--    phase that might use it, per spec §11's "do not expand autonomy now."
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.business_autonomy_policy
  ADD COLUMN IF NOT EXISTS last_signal_scan_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. meta_campaign_plans — the Meta Ads Specialist's genuine PREPARE-ONLY
--    output (spec §20). A real, structured, expert-level campaign package
--    with zero external side effects. `status` can only ever be 'prepared'
--    in this phase — that CHECK constraint is itself the "never claim
--    launched" guarantee at the schema level, not just a UI convention.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.meta_campaign_plans (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id             uuid        REFERENCES public.missions(id) ON DELETE SET NULL,
  task_id                uuid        REFERENCES public.mission_tasks(id) ON DELETE SET NULL,
  objective              text        NOT NULL,
  funnel_stage           text        NOT NULL CHECK (funnel_stage IN ('acquisition','retargeting','retention')),
  campaign_structure     jsonb       NOT NULL DEFAULT '{}',
  audience_strategy      jsonb       NOT NULL DEFAULT '{}',
  budget_proposal        jsonb       NOT NULL DEFAULT '{}',
  placements             jsonb       NOT NULL DEFAULT '{}',
  creative_requirements  jsonb       NOT NULL DEFAULT '{}',
  copy_requirements      jsonb       NOT NULL DEFAULT '{}',
  test_matrix            jsonb       NOT NULL DEFAULT '{}',
  kpi_targets            jsonb       NOT NULL DEFAULT '{}',
  -- The one and only legal value until a real Meta connector phase adds
  -- others (e.g. 'launched'). Literal, not aspirational.
  status                 text        NOT NULL DEFAULT 'prepared' CHECK (status = 'prepared'),
  meta_connection_required boolean   NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_campaign_plans_business_idx ON public.meta_campaign_plans (business_id, created_at DESC);

ALTER TABLE public.meta_campaign_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own Meta campaign plans" ON public.meta_campaign_plans
  FOR SELECT TO authenticated USING (auth.uid() = business_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. agents — extended with hierarchy/specialty columns (spec §14) and the
--    first-class Meta Ads Specialist (spec §16), reporting to the renamed
--    Performance Marketing Lead (spec §15). No existing key is removed or
--    renamed; 'performance' keeps its key, only its display copy changes.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS reports_to   text REFERENCES public.agents(key),
  ADD COLUMN IF NOT EXISTS specialty    text,
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]',
  -- Maps to businessBrain.ts's AgentPurpose union — lets the UI/agent code
  -- look up "what Business Brain purpose does this agent use" from data
  -- instead of a second hardcoded switch statement.
  ADD COLUMN IF NOT EXISTS knowledge_purpose text;

-- Every existing lead reports to the CMO (a genuine, if shallow, hierarchy —
-- spec §14 "avoid a flat list that assumes every agent is equal").
UPDATE public.agents SET reports_to = 'cmo', knowledge_purpose = key
  WHERE key <> 'cmo' AND reports_to IS NULL;

UPDATE public.agents SET
  name         = 'Performance Marketing Lead',
  role_summary = 'Owns cross-channel paid-acquisition strategy, paid-media budget allocation, and acquisition economics (CAC/CPA/ROAS) across every channel — coordinates platform specialists rather than personally operating every ad platform.',
  specialty    = 'Cross-channel paid acquisition strategy'
  WHERE key = 'performance';

INSERT INTO public.agents (key, name, department, role_summary, icon, reports_to, specialty, capabilities, knowledge_purpose) VALUES
  ('meta_ads', 'Meta Ads Specialist', 'performance',
   'Owns Meta advertising (Facebook + Instagram) end-to-end: campaign strategy, audience/placement planning, creative and copy collaboration, and optimization reasoning. PREPARE-ONLY until a real Meta connector exists — never claims a campaign was created, launched, or changed.',
   'Instagram', 'performance', 'Facebook & Instagram advertising',
   '["campaign_strategy","audience_planning","placement_planning","creative_collaboration","optimization_reasoning"]'::jsonb,
   'meta_ads')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RPCs — signal lifecycle (worker-only: called directly and only by the
--    signal-detector-runner edge function's service-role client, never
--    nested inside a user-session SECURITY DEFINER chain).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_marketing_signal_internal(
  p_business_id uuid, p_detector_key text, p_category text, p_severity text, p_confidence text,
  p_dedupe_key text, p_metric_label text, p_metric_current numeric, p_metric_baseline numeric,
  p_change_pct numeric, p_window_days integer, p_data_source text,
  p_affected_objective text, p_affected_channel text, p_affected_campaign_id uuid,
  p_evidence jsonb, p_cooldown_hours integer DEFAULT 24, p_material_change_pct numeric DEFAULT 5
)
RETURNS TABLE(signal_id uuid, is_new boolean, should_notify boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing        public.marketing_signals%ROWTYPE;
  v_id              uuid;
  v_is_new          boolean := false;
  v_material        boolean := false;
  v_should_notify   boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'upsert_marketing_signal_internal is service-role only';
  END IF;

  SELECT * INTO v_existing FROM public.marketing_signals
    WHERE business_id = p_business_id AND dedupe_key = p_dedupe_key AND status = 'active'
    FOR UPDATE;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.marketing_signals (
      business_id, detector_key, category, severity, confidence, dedupe_key, metric_label,
      metric_current, metric_baseline, change_pct, window_days, data_source,
      affected_objective, affected_channel, affected_campaign_id, evidence,
      first_detected_at, last_detected_at, cooldown_until
    ) VALUES (
      p_business_id, p_detector_key, p_category, p_severity, p_confidence, p_dedupe_key, p_metric_label,
      p_metric_current, p_metric_baseline, p_change_pct, p_window_days, p_data_source,
      p_affected_objective, p_affected_channel, p_affected_campaign_id, p_evidence,
      now(), now(), now() + make_interval(hours => p_cooldown_hours)
    ) RETURNING id INTO v_id;
    v_is_new := true;
    v_should_notify := true; -- a brand-new signal is always worth surfacing
  ELSE
    v_material := (v_existing.metric_current IS NULL OR p_metric_current IS NULL)
                  OR (abs(coalesce(p_metric_current, 0) - coalesce(v_existing.metric_current, 0))
                      >= abs(coalesce(v_existing.metric_current, 1)) * (p_material_change_pct / 100.0));
    v_should_notify := v_material AND (v_existing.cooldown_until IS NULL OR now() >= v_existing.cooldown_until);

    UPDATE public.marketing_signals SET
      severity = p_severity, confidence = p_confidence, metric_current = p_metric_current,
      change_pct = p_change_pct, evidence = p_evidence, last_detected_at = now(), updated_at = now(),
      cooldown_until = CASE WHEN v_should_notify THEN now() + make_interval(hours => p_cooldown_hours) ELSE v_existing.cooldown_until END
    WHERE id = v_existing.id;
    v_id := v_existing.id;
  END IF;

  RETURN QUERY SELECT v_id, v_is_new, v_should_notify;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_marketing_signal_internal(uuid, text, text, text, text, text, text, numeric, numeric, numeric, integer, text, text, text, uuid, jsonb, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_marketing_signal_internal(uuid, text, text, text, text, text, text, numeric, numeric, numeric, integer, text, text, text, uuid, jsonb, integer, numeric) TO service_role;

-- A signal a detector no longer reproduces on a fresh evaluation is real
-- resolution, not silence — mark it so rather than leaving it active
-- forever (spec §7 "resolution states").
CREATE OR REPLACE FUNCTION public.resolve_marketing_signal_internal(p_business_id uuid, p_dedupe_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'resolve_marketing_signal_internal is service-role only';
  END IF;

  UPDATE public.marketing_signals
  SET status = 'resolved', resolved_at = now(), updated_at = now()
  WHERE business_id = p_business_id AND dedupe_key = p_dedupe_key AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_marketing_signal_internal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_marketing_signal_internal(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_marketing_finding_internal(
  p_business_id uuid, p_signal_id uuid, p_title text, p_summary text,
  p_interpretation_source text, p_confidence text, p_evidence jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'create_marketing_finding_internal is service-role only';
  END IF;

  INSERT INTO public.marketing_findings (business_id, signal_id, title, summary, interpretation_source, confidence, evidence)
  VALUES (p_business_id, p_signal_id, p_title, p_summary, p_interpretation_source, p_confidence, p_evidence)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_marketing_finding_internal(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketing_finding_internal(uuid, uuid, text, text, text, text, jsonb) TO service_role;

-- Dedupes at the recommendation layer too (spec §7 applies end-to-end): if
-- an active, undismissed recommendation already exists for this signal,
-- update it in place instead of creating a sibling card.
CREATE OR REPLACE FUNCTION public.create_proactive_recommendation_internal(
  p_business_id uuid, p_finding_id uuid, p_signal_id uuid, p_title text, p_explanation text,
  p_action text, p_priority text, p_confidence text, p_effort text, p_risk text,
  p_estimated_cost_usd numeric, p_affected_objective text, p_proposed_mission jsonb,
  p_recommendation_type text DEFAULT 'proactive', p_source text DEFAULT 'signal_detector'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'create_proactive_recommendation_internal is service-role only';
  END IF;

  SELECT id INTO v_id FROM public.ai_recommendations
    WHERE signal_id = p_signal_id AND status = 'active' AND user_id = p_business_id
    LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.ai_recommendations SET
      title = p_title, explanation = p_explanation, action = p_action, priority = p_priority::recommendation_priority,
      confidence = p_confidence, effort = p_effort, risk = p_risk, estimated_cost_usd = p_estimated_cost_usd,
      affected_objective = p_affected_objective, proposed_mission = p_proposed_mission, finding_id = p_finding_id
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.ai_recommendations (
    user_id, recommendation_type, title, explanation, action, priority, status, source,
    finding_id, signal_id, confidence, effort, risk, estimated_cost_usd, affected_objective, proposed_mission
  ) VALUES (
    p_business_id, p_recommendation_type, p_title, p_explanation, p_action, p_priority::recommendation_priority, 'active', p_source,
    p_finding_id, p_signal_id, p_confidence, p_effort, p_risk, p_estimated_cost_usd, p_affected_objective, p_proposed_mission
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_proactive_recommendation_internal(uuid, uuid, uuid, text, text, text, text, text, text, text, numeric, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_proactive_recommendation_internal(uuid, uuid, uuid, text, text, text, text, text, text, text, numeric, text, jsonb, text, text) TO service_role;

-- ── Owner-facing (top-level, never nested) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.dismiss_recommendation(p_recommendation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_recommendations
  SET status = 'dismissed', is_done = true, dismissed_count = dismissed_count + 1
  WHERE id = p_recommendation_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation not found or not yours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_recommendation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_recommendation(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Cron — the signal-evaluation scheduler. Every 30 minutes, bounded (the
--    edge function itself caps businesses-per-tick via the
--    last_signal_scan_at round-robin cursor added above), idempotent
--    (upsert_marketing_signal_internal is a safe re-run), observable (each
--    run's outcome is visible via marketing_signals.last_detected_at /
--    updated_at). Same vault-based auth pattern as every prior cron in this
--    codebase — no literal JWT ever appears in a cron.schedule command.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
  'phase-p-signal-detector',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/signal-detector-runner',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{"trigger":"cron"}'::jsonb
    );
  $$
);
