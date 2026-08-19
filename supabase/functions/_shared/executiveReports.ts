// ─────────────────────────────────────────────────────────────────────────────
// Executive Reports — pure composition module (Phase 7)
//
// Calculates NOTHING new about a business. Gathers computeBusinessAnalytics(),
// buildIntelligenceSummary(), and computeMarketingHealth() exactly as they
// already exist, plus one cheap indexed query against executive_reports'
// structured columns for "business memory" continuity — never a recomputation
// of anything the other three engines already own.
//
// Continuity ("this risk was also flagged last month") is determined
// deterministically here, by real keyword overlap between structured fields —
// never left to the AI to infer or invent. The AI only ever writes prose
// around a fact this module has already established.
// ─────────────────────────────────────────────────────────────────────────────

import { computeBusinessAnalytics, type BusinessAnalytics } from "./analytics.ts";
import { buildIntelligenceSummary, type IntelligenceSummary } from "./marketIntelligence.ts";
import { computeMarketingHealth, type MarketingHealthResult } from "./marketingHealth.ts";

export type ReportType = "daily_brief" | "weekly_report" | "monthly_review";

export interface PriorReportRow {
  period_start: string;
  priority_recommendation: string;
  top_risk: string | null;
  top_opportunity: string | null;
  overall_health_score: number | null;
}

export interface ReportInputs {
  reportType: ReportType;
  periodStart: string;
  periodEnd: string;
  analytics: BusinessAnalytics;
  intel: IntelligenceSummary | null;
  health: MarketingHealthResult;
  priorReports: PriorReportRow[]; // last 4 reports of the SAME type, most recent first
}

// ─── Period computation — deterministic, UTC-based ───────────────────────────

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

export function currentPeriod(reportType: ReportType, now: Date = new Date()): { periodStart: string; periodEnd: string } {
  if (reportType === "daily_brief") {
    const d = iso(now);
    return { periodStart: d, periodEnd: d };
  }
  if (reportType === "weekly_report") {
    const day = now.getUTCDay(); // 0=Sun..6=Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diffToMonday));
    const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
    return { periodStart: iso(monday), periodEnd: iso(sunday) };
  }
  // monthly_review
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { periodStart: iso(first), periodEnd: iso(last) };
}

// ─── Deterministic continuity detection ──────────────────────────────────────

const STOPWORDS = new Set(["this","that","with","from","have","been","were","will","your","business","report","week","month","today"]);

function keywords(s: string | null): Set<string> {
  if (!s) return new Set();
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)));
}

function overlaps(a: string | null, b: string | null): boolean {
  const A = keywords(a), B = keywords(b);
  if (A.size === 0 || B.size === 0) return false;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.min(A.size, B.size) >= 0.3;
}

// Only counts an UNBROKEN streak from the most recent prior report backward —
// "third consecutive week" must mean consecutive, not "appeared 3 times ever."
function recurrenceStreak(current: string | null, prior: PriorReportRow[], field: "top_risk" | "priority_recommendation"): { count: number; dates: string[] } {
  if (!current) return { count: 0, dates: [] };
  const dates: string[] = [];
  for (const r of prior) {
    if (overlaps(current, r[field])) dates.push(r.period_start);
    else break; // streak broken
  }
  return { count: dates.length, dates };
}

export function buildContinuityFacts(currentTopRisk: string | null, currentPriorityRecommendation: string | null, priorReports: PriorReportRow[]): string[] {
  const facts: string[] = [];
  const riskStreak = recurrenceStreak(currentTopRisk, priorReports, "top_risk");
  if (riskStreak.count > 0) {
    facts.push(`This risk (or a closely related one) was also the top risk in the ${riskStreak.count} most recent prior report${riskStreak.count === 1 ? "" : "s"} (${riskStreak.dates.join(", ")}) — it has not yet been resolved.`);
  }
  const recStreak = recurrenceStreak(currentPriorityRecommendation, priorReports, "priority_recommendation");
  if (recStreak.count > 0) {
    facts.push(`A closely related priority recommendation was already made in the ${recStreak.count} most recent prior report${recStreak.count === 1 ? "" : "s"} (${recStreak.dates.join(", ")}) — it has not yet been acted on, or has not shown results yet.`);
  }
  return facts;
}

// ─── Assembly ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
export async function assembleReportInputs(supabase: any, businessId: string, reportType: ReportType): Promise<ReportInputs> {
  const { periodStart, periodEnd } = currentPeriod(reportType);

  const [analytics, intel, { data: priorReports }] = await Promise.all([
    computeBusinessAnalytics(supabase, businessId),
    buildIntelligenceSummary(supabase, businessId),
    supabase.from("executive_reports")
      .select("period_start, priority_recommendation, top_risk, top_opportunity, overall_health_score")
      .eq("business_id", businessId).eq("report_type", reportType)
      .order("period_start", { ascending: false }).limit(4),
  ]);

  const health = computeMarketingHealth(analytics, intel);

  return { reportType, periodStart, periodEnd, analytics, intel, health, priorReports: (priorReports ?? []) as PriorReportRow[] };
}

// ─── Structured-field extraction (for the queryable columns) ────────────────
// Pulled from the AI's own parsed narrative — a plain field-selection, not a
// calculation. Falls back to the deterministic health/intel selection
// (Phase 6's own topStrength/biggestWeakness/largestRisk/largestOpportunity)
// if the AI's narrative is missing a field, so the queryable columns are
// never empty when real deterministic evidence exists.
export interface ExtractedFields {
  overall_health_score: number | null;
  priority_recommendation: string;
  top_risk: string | null;
  top_opportunity: string | null;
  confidence: number;
}

// deno-lint-ignore no-explicit-any
export function extractStructuredFields(reportType: ReportType, narrative: any, inputs: ReportInputs): ExtractedFields {
  if (reportType === "daily_brief") {
    return {
      overall_health_score: inputs.health.overall.score,
      priority_recommendation: narrative.priority_items?.[0]?.title ?? inputs.health.biggestWeakness?.label ?? "Review Marketing Health for priorities.",
      top_risk: inputs.health.largestRisk?.title ?? null,
      top_opportunity: inputs.health.largestOpportunity?.title ?? null,
      confidence: typeof narrative.confidence === "number" ? narrative.confidence : inputs.health.overall.confidence,
    };
  }
  const summary = narrative.executive_summary ?? {};
  return {
    overall_health_score: inputs.health.overall.score,
    priority_recommendation: summary.priority_recommendation ?? inputs.health.biggestWeakness?.label ?? "Review Marketing Health for priorities.",
    top_risk: summary.biggest_risk ?? inputs.health.largestRisk?.title ?? null,
    top_opportunity: summary.biggest_opportunity ?? inputs.health.largestOpportunity?.title ?? null,
    confidence: typeof summary.confidence === "number" ? summary.confidence : inputs.health.overall.confidence,
  };
}
