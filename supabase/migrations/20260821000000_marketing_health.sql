-- ─────────────────────────────────────────────────────────────────────────────
-- Marketing Health — Phase 6
--
-- Marketing Health calculates nothing new itself beyond three small additive
-- Analytics Engine metrics (see the same-day _shared/analytics.ts change) —
-- it composes computeBusinessAnalytics() + Market Intelligence's
-- buildIntelligenceSummary() into deterministic category scores, then caches
-- only the AI narrative that explains those scores (never the scores
-- themselves, which are free and always fresh). Same (business_id,
-- period_start) daily-cache pattern as marketing_hub_briefings and
-- market_intelligence_briefs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketing_health_snapshots (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date        NOT NULL,
  snapshot     jsonb       NOT NULL DEFAULT '{}',  -- { health: MarketingHealthResult, narrative: {...} }
  model        text,
  provider     text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_health_snapshots_business_period_unique UNIQUE (business_id, period_start)
);

CREATE INDEX IF NOT EXISTS marketing_health_snapshots_business_idx
  ON public.marketing_health_snapshots (business_id, period_start DESC);

ALTER TABLE public.marketing_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own marketing health snapshots"
  ON public.marketing_health_snapshots
  USING     (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);
