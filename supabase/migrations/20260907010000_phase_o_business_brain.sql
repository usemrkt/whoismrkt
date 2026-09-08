-- ─────────────────────────────────────────────────────────────────────────────
-- Phase O — Business Brain: provenance-aware, evolving business knowledge.
-- Additive only. brand_knowledge is untouched — every existing consumer
-- (chat, marketing-hub-briefing, cmo-create-mission, market-intelligence-
-- refresh) keeps reading it exactly as before. business_facts is a NEW layer
-- for everything brand_knowledge structurally cannot represent: provenance,
-- confidence, freshness, and supersession (a superseded fact is never
-- deleted — only marked and linked forward, so history survives).
--
-- Schema shape modeled directly on market_intelligence_findings (this
-- project's own proven prior art for confidence/freshness/status), not
-- invented fresh — same discipline as Phase N modeling missions on top of
-- the existing agencyWorkspace/leased-queue patterns.
--
-- Freshness is a pure function, never a stored column — same precedent
-- Market Intelligence already established (`stale_after`/computed freshness
-- in _shared/marketIntelligence.ts). expires_at is stored; "is this fact
-- currently stale" is computed at retrieval time, not written back by a
-- cron.
--
-- The nested-SECURITY-DEFINER lesson from Phase N's own production bug
-- (advance_mission_task_graph's auth.role() check broke its own legitimate
-- caller, decide_mission_approval) is applied proactively here:
-- upsert_business_fact_internal carries NO internal auth.role() check at
-- all — it is protected purely by its GRANT (service_role only), which
-- stays correct however deep the call nests, because Postgres privilege-
-- checks a SECURITY DEFINER function's own calls against ITS owner
-- (postgres), not the original top-level caller's role. Only genuinely
-- top-level entry points (submit_user_stated_fact, decide_memory_candidate)
-- carry an auth.role()/auth.uid() check, because for them auth.role()
-- correctly reflects the real caller.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.business_facts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category          text        NOT NULL CHECK (category IN (
                                 'brand','audience','products','competitors',
                                 'marketing','constraints','performance','preference'
                                )),
  -- Stable slot identifier within (business_id, category) — same key on a
  -- later write supersedes the current active row in that slot rather than
  -- creating a second, competing "truth". e.g. 'primary_audience',
  -- 'max_campaign_budget', 'prohibited_claims', 'content_pattern:reels_vs_static'.
  fact_key          text        NOT NULL CHECK (length(fact_key) BETWEEN 1 AND 120),
  statement         text        NOT NULL CHECK (length(statement) BETWEEN 1 AND 1000),
  structured_value  jsonb,
  source_type       text        NOT NULL CHECK (source_type IN (
                                 'user_stated','business_data','connected_source',
                                 'measured','ai_inferred','market_observed','agent_learned'
                                )),
  -- Free-form pointer to what actually backs this fact — a mission_id/
  -- task_id, a market_intelligence_findings id, an evidence summary. Never
  -- structurally trusted on its own; source_type + confidence carry the
  -- actual authority.
  source_reference  jsonb       NOT NULL DEFAULT '{}',
  confidence        text        NOT NULL CHECK (confidence IN ('verified','high','medium','low')),
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','stale','rejected')),
  superseded_by     uuid        REFERENCES public.business_facts(id),
  observed_at       timestamptz NOT NULL DEFAULT now(),
  verified_at       timestamptz,
  expires_at        timestamptz,
  created_by        uuid        REFERENCES auth.users(id),
  agent_key         text        REFERENCES public.agents(key),
  mission_id        uuid        REFERENCES public.missions(id) ON DELETE SET NULL,
  metadata          jsonb       NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- THE supersession guarantee: at most one active row per business/category/
-- key. A new write must first flip the old row to 'superseded', never just
-- insert alongside it — enforced structurally, not by convention.
CREATE UNIQUE INDEX IF NOT EXISTS business_facts_active_slot_unique
  ON public.business_facts (business_id, category, fact_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS business_facts_business_idx ON public.business_facts (business_id, status, category);

ALTER TABLE public.business_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own business facts" ON public.business_facts
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
-- No client write grant — every write goes through submit_user_stated_fact
-- or the internal/candidate-promotion path below.

-- ═══════════════════════════════════════════════════════════════════════════
-- Memory candidates — agents PROPOSE, they never write business_facts
-- directly. user_stated/business_data/connected_source facts don't need
-- candidate review at all (a user's own statement, or a deterministic read
-- of canonical data, carries its own authority) — only measured/ai_inferred/
-- market_observed/agent_learned conclusions go through this staging table.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.memory_candidates (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id            uuid        REFERENCES public.missions(id) ON DELETE SET NULL,
  agent_key             text        REFERENCES public.agents(key),
  category              text        NOT NULL CHECK (category IN (
                                     'brand','audience','products','competitors',
                                     'marketing','constraints','performance','preference'
                                    )),
  fact_key              text        NOT NULL CHECK (length(fact_key) BETWEEN 1 AND 120),
  statement             text        NOT NULL CHECK (length(statement) BETWEEN 1 AND 1000),
  structured_value      jsonb,
  proposed_source_type  text        NOT NULL CHECK (proposed_source_type IN ('measured','ai_inferred','market_observed','agent_learned')),
  proposed_confidence   text        NOT NULL CHECK (proposed_confidence IN ('verified','high','medium','low')),
  evidence              jsonb       NOT NULL DEFAULT '{}',
  status                text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','superseded')),
  reviewed_at           timestamptz,
  reviewed_by           uuid        REFERENCES auth.users(id),
  promoted_fact_id      uuid        REFERENCES public.business_facts(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_candidates_business_idx ON public.memory_candidates (business_id, status, created_at DESC);

ALTER TABLE public.memory_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own memory candidates" ON public.memory_candidates
  FOR SELECT TO authenticated USING (auth.uid() = business_id);
-- No client write grant — candidates are created by the service client
-- (mission-completion hook) and decided only via decide_memory_candidate.

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- Internal primitive — supersede-then-insert, atomic. NO auth.role() check:
-- protected purely by GRANT (service_role only, below). Safe to call nested
-- from decide_memory_candidate regardless of THAT function's own caller,
-- because Postgres privilege-checks this call against decide_memory_
-- candidate's owner (postgres), not the original end-user session — the
-- exact mechanism whose absence broke advance_mission_task_graph in Phase N.
CREATE OR REPLACE FUNCTION public.upsert_business_fact_internal(
  p_business_id uuid, p_category text, p_fact_key text, p_statement text,
  p_structured_value jsonb, p_source_type text, p_source_reference jsonb,
  p_confidence text, p_created_by uuid, p_agent_key text, p_mission_id uuid,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prev_id uuid;
  v_new_id  uuid;
BEGIN
  UPDATE public.business_facts
  SET status = 'superseded'
  WHERE business_id = p_business_id AND category = p_category AND fact_key = p_fact_key AND status = 'active'
  RETURNING id INTO v_prev_id;

  INSERT INTO public.business_facts (
    business_id, category, fact_key, statement, structured_value, source_type,
    source_reference, confidence, created_by, agent_key, mission_id, expires_at
  ) VALUES (
    p_business_id, p_category, p_fact_key, p_statement, p_structured_value, p_source_type,
    COALESCE(p_source_reference, '{}'::jsonb), p_confidence, p_created_by, p_agent_key, p_mission_id, p_expires_at
  ) RETURNING id INTO v_new_id;

  IF v_prev_id IS NOT NULL THEN
    UPDATE public.business_facts SET superseded_by = v_new_id WHERE id = v_prev_id;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_business_fact_internal(uuid, text, text, text, jsonb, text, jsonb, text, uuid, text, uuid, timestamptz) FROM anon, authenticated;

-- The ONLY way an authenticated user can ever write a business_fact — always
-- user_stated/high confidence, hardcoded here regardless of any caller
-- input, and ownership-checked. This is the "owner correction" entry point
-- (spec §17): a fresh call here on an existing fact_key supersedes it.
CREATE OR REPLACE FUNCTION public.submit_user_stated_fact(
  p_business_id uuid, p_category text, p_fact_key text, p_statement text,
  p_structured_value jsonb DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_business_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- No separate audit-event table: business_facts' own supersession chain
  -- (this row's created_at/created_by, and the prior active row's
  -- superseded_by pointing here) already IS the history — a second log
  -- would just be a duplicate of what the fact rows themselves record.
  v_id := public.upsert_business_fact_internal(
    p_business_id, p_category, p_fact_key, p_statement, p_structured_value,
    'user_stated', jsonb_build_object('submitted_by_user', true), 'high',
    auth.uid(), NULL, NULL, p_expires_at
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_user_stated_fact(uuid, text, text, text, jsonb, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_user_stated_fact(uuid, text, text, text, jsonb, timestamptz) FROM anon;

-- Decide a pending memory candidate. Callable by the real business owner
-- (manual review) or by the service client (deterministic auto-promotion
-- for high-confidence measured candidates) — auth.role() correctly reflects
-- the real caller here since this is always a top-level entry point, never
-- called nested from another SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.decide_memory_candidate(p_candidate_id uuid, p_decision text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidate public.memory_candidates;
  v_fact_id   uuid;
BEGIN
  IF p_decision NOT IN ('accepted','rejected') THEN
    RAISE EXCEPTION 'decide_memory_candidate: invalid decision %', p_decision;
  END IF;

  SELECT * INTO v_candidate FROM public.memory_candidates WHERE id = p_candidate_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate not found or already decided';
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR v_candidate.business_id <> auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
  END IF;

  UPDATE public.memory_candidates
  SET status = p_decision, reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_candidate_id;

  IF p_decision = 'accepted' THEN
    v_fact_id := public.upsert_business_fact_internal(
      v_candidate.business_id, v_candidate.category, v_candidate.fact_key, v_candidate.statement,
      v_candidate.structured_value, v_candidate.proposed_source_type,
      v_candidate.evidence || jsonb_build_object('candidate_id', p_candidate_id),
      v_candidate.proposed_confidence, NULL, v_candidate.agent_key, v_candidate.mission_id, NULL
    );
    UPDATE public.memory_candidates SET promoted_fact_id = v_fact_id WHERE id = p_candidate_id;
    RETURN v_fact_id;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_memory_candidate(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.decide_memory_candidate(uuid, text) FROM anon;
