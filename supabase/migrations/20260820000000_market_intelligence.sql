-- ─────────────────────────────────────────────────────────────────────────────
-- Market Intelligence — Phase 5 (external intelligence layer)
--
-- Phase 4C built the internal half of MRKT's intelligence architecture
-- (match_outcomes / campaign_health_scores / business_daily_metrics, computed
-- by _shared/analytics.ts). This migration builds the external half: real
-- market/competitor signals, retrieved live via Anthropic web search, stored
-- as structured evidence, scored deterministically — never fabricated.
--
--   market_competitors                  — confirmed (business-stated, from
--                                          brand_knowledge.competitors) vs
--                                          potential (only ever created tied
--                                          to a specific discovered finding).
--   market_intelligence_findings        — the structured store. Every field
--                                          the design requires; nothing is
--                                          prose-only.
--   market_intelligence_finding_sources — corroborating sources beyond the
--                                          primary one (deduplication/clustering).
--   market_intelligence_search_cursor   — one row per (business, search
--                                          family); the mechanism that
--                                          guarantees opening the page never
--                                          triggers a live search.
--   market_intelligence_briefs          — daily-cached Executive Brief
--                                          synthesis, same pattern as
--                                          marketing_hub_briefings.
--
-- No stored freshness column: a stored freshness state that itself goes
-- stale is a trap. freshness_state (fresh/aging/stale/historical) is a pure
-- function of (fetched_at, stale_after, now), computed identically in TS
-- wherever needed — never a column that can silently drift out of truth.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. market_competitors ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.market_competitors (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                   text        NOT NULL,
  domain                 text,
  aliases                text[]      NOT NULL DEFAULT '{}',
  status                 text        NOT NULL DEFAULT 'confirmed'
                         CHECK (status IN ('confirmed', 'potential')),
  source                 text        NOT NULL DEFAULT 'brand_knowledge'
                         CHECK (source IN ('brand_knowledge', 'finding_discovered', 'manual')),
  -- Confirmed competitors are certain by construction (the business said so)
  -- — confidence is null for them. Potential competitors carry a real,
  -- deterministically computed entity-match confidence.
  confidence             numeric(3,2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  first_seen_finding_id  uuid,  -- FK added below, after market_intelligence_findings exists
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_competitors_business_name_unique UNIQUE (business_id, name)
);

CREATE INDEX IF NOT EXISTS market_competitors_business_idx
  ON public.market_competitors (business_id, status);

ALTER TABLE public.market_competitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own market competitors"
  ON public.market_competitors
  USING     (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- ── 2. market_intelligence_findings ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.market_intelligence_findings (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Coarse UI-section bucket, derived deterministically from `category` in TS.
  type                  text        NOT NULL
                        CHECK (type IN ('competitor', 'opportunity', 'threat', 'trend', 'market_signal')),

  -- Fine-grained taxonomy (14 categories).
  category              text        NOT NULL
                        CHECK (category IN (
                          'competitor_activity', 'industry_trend', 'consumer_trend',
                          'content_trend', 'pricing_offer_change', 'product_launch',
                          'partnership', 'campaign_creative_trend', 'platform_change',
                          'opportunity', 'threat', 'seasonal_signal',
                          'reputation_sentiment', 'market_movement'
                        )),

  title                 text        NOT NULL,
  summary               text        NOT NULL,  -- tightly grounded paraphrase of `evidence`
  evidence              text        NOT NULL,  -- literal cited_text quote from the source

  source_url            text        NOT NULL,
  source_domain         text        NOT NULL,
  source_title          text,
  source_published_at   timestamptz,           -- nullable — only set when parseable from page_age

  fetched_at            timestamptz NOT NULL DEFAULT now(),

  competitor_id         uuid        REFERENCES public.market_competitors(id) ON DELETE SET NULL,
  market_topic          text,

  confidence            numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  relevance             numeric(3,2) NOT NULL CHECK (relevance  BETWEEN 0 AND 1),
  stale_after           timestamptz NOT NULL,  -- freshness threshold, computed at insert from category cadence

  search_family         text        NOT NULL
                        CHECK (search_family IN (
                          'competitor_updates', 'industry_developments', 'consumer_behavior',
                          'seasonal_moments', 'category_trends', 'content_trends',
                          'local_market_changes', 'platform_algorithm_changes',
                          'pricing_offer_changes', 'partnership_opportunities'
                        )),
  search_query          text        NOT NULL,          -- the literal query Claude ran
  raw_metadata          jsonb       NOT NULL DEFAULT '{}',

  status                text        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'dismissed', 'archived', 'superseded')),

  dedupe_key            text        NOT NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT market_intelligence_findings_business_dedupe_unique UNIQUE (business_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS mif_business_status_type_idx
  ON public.market_intelligence_findings (business_id, status, type);
CREATE INDEX IF NOT EXISTS mif_business_category_idx
  ON public.market_intelligence_findings (business_id, category);
CREATE INDEX IF NOT EXISTS mif_business_stale_after_idx
  ON public.market_intelligence_findings (business_id, stale_after);
CREATE INDEX IF NOT EXISTS mif_business_created_idx
  ON public.market_intelligence_findings (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mif_competitor_idx
  ON public.market_intelligence_findings (competitor_id) WHERE competitor_id IS NOT NULL;

ALTER TABLE public.market_intelligence_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own market intelligence findings"
  ON public.market_intelligence_findings
  USING     (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- Now that findings exists, close the loop on market_competitors.first_seen_finding_id
ALTER TABLE public.market_competitors
  ADD CONSTRAINT market_competitors_first_seen_finding_fk
  FOREIGN KEY (first_seen_finding_id) REFERENCES public.market_intelligence_findings(id) ON DELETE SET NULL;

-- ── 3. market_intelligence_finding_sources (corroboration / clustering) ────

CREATE TABLE IF NOT EXISTS public.market_intelligence_finding_sources (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id           uuid        NOT NULL REFERENCES public.market_intelligence_findings(id) ON DELETE CASCADE,
  business_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- denormalized for single-policy RLS
  source_url           text        NOT NULL,
  source_domain        text        NOT NULL,
  source_title         text,
  cited_text           text,
  source_published_at  timestamptz,
  fetched_at           timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mifs_finding_url_unique UNIQUE (finding_id, source_url)
);

CREATE INDEX IF NOT EXISTS mifs_finding_idx ON public.market_intelligence_finding_sources (finding_id);

ALTER TABLE public.market_intelligence_finding_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own finding sources"
  ON public.market_intelligence_finding_sources
  USING     (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- ── 4. market_intelligence_search_cursor (the cost-control mechanism) ──────

CREATE TABLE IF NOT EXISTS public.market_intelligence_search_cursor (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_family             text        NOT NULL
                            CHECK (search_family IN (
                              'competitor_updates', 'industry_developments', 'consumer_behavior',
                              'seasonal_moments', 'category_trends', 'content_trends',
                              'local_market_changes', 'platform_algorithm_changes',
                              'pricing_offer_changes', 'partnership_opportunities'
                            )),
  last_run_at               timestamptz,
  -- '-infinity' default guarantees a brand-new (business, family) pair is
  -- immediately "due" the first time the planner checks it — no special case.
  next_eligible_at          timestamptz NOT NULL DEFAULT '-infinity',
  last_run_status           text CHECK (last_run_status IN ('success', 'no_findings', 'error', 'skipped_no_signal')),
  last_run_search_count     integer     NOT NULL DEFAULT 0,
  consecutive_empty_runs    integer     NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mi_cursor_business_family_unique UNIQUE (business_id, search_family)
);

CREATE INDEX IF NOT EXISTS mi_cursor_due_idx
  ON public.market_intelligence_search_cursor (next_eligible_at);

ALTER TABLE public.market_intelligence_search_cursor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own search cursor"
  ON public.market_intelligence_search_cursor
  USING     (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- ── 5. market_intelligence_briefs (daily Executive Brief cache) ───────────
-- Same pattern as marketing_hub_briefings exactly — one JSON blob per
-- (business, day), because synthesis IS a single-shot narrative, unlike the
-- findings themselves which need per-row freshness.

CREATE TABLE IF NOT EXISTS public.market_intelligence_briefs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date        NOT NULL,
  brief        jsonb       NOT NULL DEFAULT '{}',
  model        text,
  provider     text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mi_briefs_business_period_unique UNIQUE (business_id, period_start)
);

CREATE INDEX IF NOT EXISTS mi_briefs_business_idx
  ON public.market_intelligence_briefs (business_id, period_start DESC);

ALTER TABLE public.market_intelligence_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own market intelligence briefs"
  ON public.market_intelligence_briefs
  USING     (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

-- ── 6. Hourly cron — actual spend is gated by market_intelligence_search_cursor,
--       not by cron frequency. Hourly polling gives adequate resolution against
--       24h-14d cadences at negligible DB cost (a cursor read per business per
--       tick), and only spends AI/search money on businesses with due families.
--       Same net.http_post + vault.decrypted_secrets pattern as Phase 4C's
--       compute-daily-metrics cron — vault is already correctly seeded. ──────

SELECT cron.schedule(
  'market-intelligence-refresh',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT value FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/market-intelligence-refresh',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{"trigger":"cron"}'::jsonb
    );
  $$
);
