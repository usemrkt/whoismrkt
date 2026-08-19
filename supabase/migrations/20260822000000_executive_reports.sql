-- ─────────────────────────────────────────────────────────────────────────────
-- Executive Reports — Phase 7 (the CEO briefing, the final composition layer)
--
-- Unlike marketing_hub_briefings / market_intelligence_briefs /
-- marketing_health_snapshots (all daily-upsert caches that overwrite), this
-- table is PERMANENT HISTORY — reports accumulate, they are never silently
-- replaced. The permanence rule itself (a report can only be regenerated
-- while its period is still open) is enforced in application code
-- (supabase/functions/executive-reports/index.ts), not here, but the schema
-- is shaped for it: a real unique constraint per (business, type, period)
-- rather than a period-agnostic append-only log, so "the weekly report for
-- 2026-08-11" is always exactly one row, findable directly.
--
-- overall_health_score / priority_recommendation / top_risk / top_opportunity
-- are denormalized out of `narrative` specifically so a FUTURE report's
-- "business memory" context can be assembled with one cheap indexed query
-- over these columns, never by re-parsing old narrative JSONB blobs — this
-- is the concrete mechanism behind "future reports reference previous
-- reports" without building a separate memory feature.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.executive_reports (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type             text        NOT NULL CHECK (report_type IN ('daily_brief', 'weekly_report', 'monthly_review')),
  period_start            date        NOT NULL,
  period_end              date        NOT NULL,
  report_version          integer     NOT NULL DEFAULT 1,
  data_snapshot           jsonb       NOT NULL,  -- frozen deterministic inputs at generation time (ReportInputs)
  narrative               jsonb       NOT NULL,  -- AI-written sections; shape depends on report_type
  overall_health_score    integer,
  priority_recommendation text        NOT NULL,
  top_risk                text,
  top_opportunity         text,
  confidence              numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  model                   text,
  provider                text,
  generation_cost_usd     numeric(10,4),
  generated_at            timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT executive_reports_business_type_period_unique UNIQUE (business_id, report_type, period_start)
);

CREATE INDEX IF NOT EXISTS executive_reports_business_type_idx
  ON public.executive_reports (business_id, report_type, period_start DESC);

ALTER TABLE public.executive_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own executive reports"
  ON public.executive_reports
  USING     (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);
