-- ─────────────────────────────────────────────────────────────────────────────
-- Marketing Hub — foundation
--
-- 1. brand_knowledge — 5 new optional fields. This table is already MRKT's
--    "permanent AI memory" layer (see 20260608020000_brand_knowledge.sql) and
--    is already injected into the AI Strategist's system prompt — competitors,
--    brand_voice, target_audience and marketing_goals already live here, so
--    Marketing Hub reuses them rather than duplicating them on business_profiles.
--    Only the genuinely-missing fields are added here.
-- 2. marketing_hub_briefings — caches the daily AI-generated Marketing Hub
--    briefing per business, same shape/RLS pattern as weekly_report_cache
--    (20260613500000_retention_engine.sql), so repeat visits don't re-spend
--    AI credits.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. brand_knowledge additions ────────────────────────────────────────────

ALTER TABLE public.brand_knowledge
  ADD COLUMN IF NOT EXISTS revenue_range               text,
  ADD COLUMN IF NOT EXISTS marketing_budget_range       text,
  ADD COLUMN IF NOT EXISTS current_marketing_challenges text,
  ADD COLUMN IF NOT EXISTS preferred_growth_channels    text,
  ADD COLUMN IF NOT EXISTS current_social_channels      text;

-- ── 2. marketing_hub_briefings ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketing_hub_briefings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date        NOT NULL,
  briefing     jsonb       NOT NULL DEFAULT '{}',
  model        text,
  provider     text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_hub_briefings_user_period_unique UNIQUE (user_id, period_start)
);

CREATE INDEX IF NOT EXISTS marketing_hub_briefings_user_idx
  ON public.marketing_hub_briefings (user_id, period_start DESC);

ALTER TABLE public.marketing_hub_briefings ENABLE ROW LEVEL SECURITY;

-- Mirrors weekly_report_cache's policy exactly: owner can read/write their own
-- row (writes in practice happen via the service-role client in the edge
-- function, but the policy shape matches the existing precedent).
CREATE POLICY "Users access own marketing hub briefings"
  ON public.marketing_hub_briefings
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
