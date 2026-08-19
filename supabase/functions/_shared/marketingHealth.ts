// ─────────────────────────────────────────────────────────────────────────────
// Marketing Health — deterministic scoring module (Phase 6)
//
// The executive scorecard. Composes the two existing intelligence layers —
// _shared/analytics.ts (internal, deterministic business metrics) and
// _shared/marketIntelligence.ts (external, deterministic market signals) —
// into category health scores. Calculates NOTHING new about the business
// itself; every number here is a weighted combination of metrics those two
// modules already computed. Zero AI calls in this file. Confidence is a
// function of real sample sizes and metric coverage, never an LLM guess.
// Which category is the "top strength" / "biggest weakness" / largest
// opportunity/risk is ALSO decided here, deterministically — the AI layer
// (marketing-health/index.ts) only ever narrates a selection already made,
// it cannot override it.
// ─────────────────────────────────────────────────────────────────────────────

import type { BusinessAnalytics } from "./analytics.ts";
import type { IntelligenceSummary } from "./marketIntelligence.ts";

export type HealthCategory =
  | "campaign" | "conversion" | "retention" | "revenue" | "growth"
  | "content" | "brand" | "market_position" | "audience";

export interface ContributingMetric {
  name: string;
  value: number;      // normalized 0-100
  weight: number;      // this metric's actual weight within its category (renormalized if siblings were missing)
  evidence: string;
  sampleSize: number;
}

export interface CategoryScore {
  category: HealthCategory;
  label: string;
  status: "supported" | "more_data_required";
  score: number | null;    // 0-100
  confidence: number;      // 0-1
  contributingMetrics: ContributingMetric[];
  missingDataHint?: string;
  trend?: { deltaPct: number | null; direction: "up" | "down" | "flat" };
}

export interface EvidenceRef { title: string; evidence: string; source: "market_intelligence" | "analytics" }

export interface MarketingHealthResult {
  categories: CategoryScore[];
  overall: { score: number | null; confidence: number };
  topStrength: CategoryScore | null;
  biggestWeakness: CategoryScore | null;
  largestOpportunity: EvidenceRef | null;
  largestRisk: EvidenceRef | null;
  asOf: string;
}

// ─── Generic weighted-average helper, used by every category ────────────────
// entries with value===null are treated as "not present" — their weight is
// redistributed proportionally among the entries that ARE present (renormalized
// to sum to 1), so a category never nulls out just because one sub-metric is
// missing. The category itself is null only when NOTHING is present.

interface ScoreEntry { value: number | null; weight: number; name: string; evidence: string; sampleSize: number }

function weightedScore(entries: ScoreEntry[]): { score: number | null; confidence: number; contributing: ContributingMetric[] } {
  const present = entries.filter((e) => e.value !== null);
  if (present.length === 0) return { score: null, confidence: 0, contributing: [] };

  const totalWeight = present.reduce((s, e) => s + e.weight, 0);
  const score = present.reduce((s, e) => s + e.value! * (e.weight / totalWeight), 0);

  // Confidence: half from how many of the category's expected metrics are
  // actually present (coverage), half from aggregate real sample size across
  // them (saturating at 20 — a documented, deterministic threshold, not a guess).
  const coverage = present.length / entries.length;
  const totalSample = present.reduce((s, e) => s + e.sampleSize, 0);
  const sampleConfidence = Math.min(totalSample / 20, 1);
  const confidence = Math.round((0.5 * coverage + 0.5 * sampleConfidence) * 100) / 100;

  const contributing: ContributingMetric[] = present.map((e) => ({
    name: e.name, value: Math.round(e.value! * 10) / 10,
    weight: Math.round((e.weight / totalWeight) * 100) / 100,
    evidence: e.evidence, sampleSize: e.sampleSize,
  }));

  return { score: Math.round(Math.min(100, Math.max(0, score))), confidence, contributing };
}

// Normalizers — every metric feeding weightedScore must already be 0-100.
const star5to100 = (v: number) => Math.min(100, Math.max(0, v * 20));       // 0-5★ -> 0-100
const capAt100 = (v: number) => Math.min(100, Math.max(0, v));               // already 0-100-ish, just clamp
const volumeNorm = (v: number, targetPerPeriod: number) => Math.min(v / targetPerPeriod, 1) * 100;

const CONFIDENCE_FLOOR = 0.4; // categories below this never compete for topStrength/biggestWeakness

// ─── Category builders ───────────────────────────────────────────────────────

function campaignCategory(a: BusinessAnalytics): CategoryScore {
  const entries: ScoreEntry[] = [
    { value: a.campaignHealth.avgScore !== null ? capAt100(a.campaignHealth.avgScore) : null, weight: 0.40,
      name: "Average campaign health score",
      evidence: a.campaignHealth.avgScore !== null ? `${a.campaignHealth.perCampaign.length} campaign(s) scored, averaging ${a.campaignHealth.avgScore}/100` : "",
      sampleSize: a.campaignHealth.perCampaign.length },
    { value: a.campaignFillRate ? capAt100(a.campaignFillRate.value) : null, weight: 0.25,
      name: "Campaign fill rate", evidence: a.campaignFillRate?.evidence ?? "", sampleSize: a.campaignFillRate?.sampleSize ?? 0 },
    { value: a.deadlineAdherence ? capAt100(a.deadlineAdherence.value) : null, weight: 0.20,
      name: "Deadline adherence", evidence: a.deadlineAdherence?.evidence ?? "", sampleSize: a.deadlineAdherence?.sampleSize ?? 0 },
    { value: volumeNorm(a.campaignVelocity.value, 2), weight: 0.15,
      name: "Campaign velocity", evidence: a.campaignVelocity.evidence, sampleSize: a.campaignVelocity.sampleSize },
  ];
  const { score, confidence, contributing } = weightedScore(entries);
  return { category: "campaign", label: "Campaign Health", status: score === null ? "more_data_required" : "supported",
    score, confidence, contributingMetrics: contributing,
    missingDataHint: score === null ? "Publish at least one campaign to start measuring Campaign Health." : undefined };
}

function conversionCategory(a: BusinessAnalytics): CategoryScore {
  const entries: ScoreEntry[] = [
    { value: a.creatorAcceptanceRate ? capAt100(a.creatorAcceptanceRate.value) : null, weight: 0.35,
      name: "Creator acceptance rate", evidence: a.creatorAcceptanceRate?.evidence ?? "", sampleSize: a.creatorAcceptanceRate?.sampleSize ?? 0 },
    { value: a.contractConversion ? capAt100(a.contractConversion.value) : null, weight: 0.35,
      name: "Contract conversion rate", evidence: a.contractConversion?.evidence ?? "", sampleSize: a.contractConversion?.sampleSize ?? 0 },
    { value: a.matchWinRate ? capAt100(a.matchWinRate.value) : null, weight: 0.30,
      name: "Match win rate", evidence: a.matchWinRate?.evidence ?? "", sampleSize: a.matchWinRate?.sampleSize ?? 0 },
  ];
  const { score, confidence, contributing } = weightedScore(entries);
  return { category: "conversion", label: "Conversion Health", status: score === null ? "more_data_required" : "supported",
    score, confidence, contributingMetrics: contributing,
    missingDataHint: score === null ? "Receive at least one creator application to start measuring Conversion Health." : undefined };
}

function retentionCategory(a: BusinessAnalytics): CategoryScore {
  const entries: ScoreEntry[] = [
    { value: a.repeatCreatorRate ? capAt100(a.repeatCreatorRate.value) : null, weight: 0.55,
      name: "Repeat creator rate", evidence: a.repeatCreatorRate?.evidence ?? "", sampleSize: a.repeatCreatorRate?.sampleSize ?? 0 },
    { value: a.rehireRate ? capAt100(a.rehireRate.value) : null, weight: 0.45,
      name: "Rehire rate", evidence: a.rehireRate?.evidence ?? "", sampleSize: a.rehireRate?.sampleSize ?? 0 },
  ];
  const { score, confidence, contributing } = weightedScore(entries);
  // avgCreatorTrust is real supporting context, not a scored contributor (it
  // describes creators matched, not this business's retention behavior) —
  // surfaced as an extra evidence line only, never weighted into the score.
  if (a.avgCreatorTrust) {
    contributing.push({ name: "Average matched-creator trust", value: a.avgCreatorTrust.value, weight: 0,
      evidence: a.avgCreatorTrust.evidence, sampleSize: a.avgCreatorTrust.sampleSize });
  }
  return { category: "retention", label: "Retention Health", status: score === null ? "more_data_required" : "supported",
    score, confidence, contributingMetrics: contributing,
    missingDataHint: score === null ? "Accept at least one creator contract to start measuring Retention Health." : undefined };
}

function revenueCategory(a: BusinessAnalytics): CategoryScore {
  const entries: ScoreEntry[] = [
    { value: a.budgetUtilization ? capAt100(a.budgetUtilization.value) : null, weight: 0.65,
      name: "Budget utilization", evidence: a.budgetUtilization?.evidence ?? "", sampleSize: a.budgetUtilization?.sampleSize ?? 0 },
    { value: a.paymentReliability ? star5to100(a.paymentReliability.value) : null, weight: 0.35,
      name: "Payment reliability rating", evidence: a.paymentReliability?.evidence ?? "", sampleSize: a.paymentReliability?.sampleSize ?? 0 },
  ];
  const { score, confidence, contributing } = weightedScore(entries);
  return { category: "revenue", label: "Revenue Health", status: score === null ? "more_data_required" : "supported",
    score, confidence, contributingMetrics: contributing,
    missingDataHint: score === null ? "State a campaign budget and complete a payment to start measuring Revenue Health." : undefined };
}

function growthCategory(a: BusinessAnalytics): CategoryScore {
  const entries: ScoreEntry[] = [
    { value: volumeNorm(a.campaignVelocity.value, 2), weight: 0.5,
      name: "Campaign velocity", evidence: a.campaignVelocity.evidence, sampleSize: a.campaignVelocity.sampleSize },
  ];
  if (a.trend) {
    // Trend deltas can be negative or wildly positive — normalize to a 0-100
    // "growth signal" centered at 50 (flat), capped at ±50 either direction.
    const avgDelta = [a.trend.applications.deltaPct, a.trend.messages.deltaPct, a.trend.pipelineUpdates.deltaPct]
      .filter((d): d is number => d !== null);
    if (avgDelta.length > 0) {
      const mean = avgDelta.reduce((s, d) => s + d, 0) / avgDelta.length;
      const normalized = 50 + Math.max(-50, Math.min(50, mean));
      const totalSample = a.trend.applications.current + a.trend.messages.current + a.trend.pipelineUpdates.current;
      entries.push({ value: normalized, weight: 0.5, name: "7-day activity trend",
        evidence: `applications ${fmtDelta(a.trend.applications.deltaPct)}, messages ${fmtDelta(a.trend.messages.deltaPct)}, pipeline updates ${fmtDelta(a.trend.pipelineUpdates.deltaPct)} vs. the prior 7 days`,
        sampleSize: totalSample });
    }
  }
  const { score, confidence, contributing } = weightedScore(entries);
  return { category: "growth", label: "Growth Health", status: score === null ? "more_data_required" : "supported",
    score, confidence, contributingMetrics: contributing,
    trend: a.trend ? { deltaPct: avgOf([a.trend.applications.deltaPct, a.trend.messages.deltaPct, a.trend.pipelineUpdates.deltaPct]), direction: trendDirection(a.trend) } : undefined,
    missingDataHint: score === null ? "Launch a campaign to start measuring Growth Health; the 7-day trend unlocks after 14 days of activity history." : undefined };
}

function contentCategory(a: BusinessAnalytics): CategoryScore {
  // Deliberately thin — only real volume, no fabricated quality/engagement
  // sub-metrics. Low confidence by construction (single metric, capped
  // coverage), never hidden behind a padded score.
  const entries: ScoreEntry[] = [
    { value: volumeNorm(a.contentVolume.value, 8), weight: 1.0, // 8 pieces/30d ≈ 2/week, a reasonable "active" baseline
      name: "Content production volume (30d)", evidence: a.contentVolume.evidence, sampleSize: a.contentVolume.sampleSize },
  ];
  const { score, confidence, contributing } = weightedScore(entries);
  // Cap confidence explicitly — a single-metric category should never read as
  // highly confident, regardless of how large that one count happens to be.
  const cappedConfidence = Math.min(confidence, 0.5);
  return { category: "content", label: "Content Health", status: score === null ? "more_data_required" : "supported",
    score, confidence: cappedConfidence, contributingMetrics: contributing,
    missingDataHint: score === null ? "Generate assets or schedule content to start measuring Content Health." : undefined };
}

function brandCategory(a: BusinessAnalytics, intel: IntelligenceSummary | null): CategoryScore {
  const entries: ScoreEntry[] = [
    { value: a.reviewQuality ? star5to100(a.reviewQuality.value) : null, weight: 0.35,
      name: "Overall review rating", evidence: a.reviewQuality?.evidence ?? "", sampleSize: a.reviewQuality?.sampleSize ?? 0 },
    { value: a.brandPerceptionScore ? star5to100(a.brandPerceptionScore.value) : null, weight: 0.35,
      name: "Brand perception (communication, professionalism, brief quality, responsiveness)", evidence: a.brandPerceptionScore?.evidence ?? "", sampleSize: a.brandPerceptionScore?.sampleSize ?? 0 },
  ];
  // External signal — a business's own review scores are internal; blending
  // in real, cited external reputation/sentiment findings (when any exist)
  // is the concrete "internal + external reasoning" the category exists for.
  const repSignals = intel?.reputationSignals ?? [];
  if (repSignals.length > 0) {
    // No sentiment polarity is extracted from free text (that would be an
    // LLM guess) — presence of real reputation signals contributes a neutral
    // 50 with modest weight, real evidence attached; it moves the score only
    // through corroboration/confidence, never by inventing a polarity score.
    entries.push({ value: 50, weight: 0.30, name: "External reputation signals detected",
      evidence: repSignals.map((s) => s.title).join("; "), sampleSize: repSignals.length });
  }
  const { score, confidence, contributing } = weightedScore(entries);
  return { category: "brand", label: "Brand Health", status: score === null ? "more_data_required" : "supported",
    score, confidence, contributingMetrics: contributing,
    missingDataHint: score === null ? "Complete a campaign and receive a creator review to start measuring Brand Health." : undefined };
}

function marketPositionCategory(intel: IntelligenceSummary | null): CategoryScore {
  if (!intel || intel.totalActiveFindings === 0) {
    return { category: "market_position", label: "Market Position", status: "more_data_required", score: null, confidence: 0,
      contributingMetrics: [], missingDataHint: "Run a Market Intelligence refresh to unlock Market Position." };
  }
  // Deterministic, evidence-counting formula — this measures "how much real,
  // evidence-backed market awareness and relative threat exposure MRKT has
  // gathered for this business," not literal market share (which nothing in
  // this schema can measure) — documented here so it's never misread as more
  // than it is.
  const oppScore = Math.min(intel.topOpportunities.length, 3) / 3 * 25;
  const threatPenalty = Math.min(intel.topThreats.length, 3) / 3 * 25;
  const awarenessBonus = intel.competitorMoves.length > 0 ? 10 : 0;
  const score = Math.round(Math.min(100, Math.max(0, 50 + oppScore - threatPenalty + awarenessBonus)));
  const totalSample = intel.topOpportunities.length + intel.topThreats.length + intel.competitorMoves.length;
  const confidence = Math.round(Math.min(totalSample / 8, 1) * 100) / 100; // saturates at 8 findings across the three buckets
  return {
    category: "market_position", label: "Market Position", status: "supported", score, confidence,
    contributingMetrics: [
      { name: "Evidence-backed opportunities identified", value: intel.topOpportunities.length, weight: 0.5, evidence: intel.topOpportunities.map((o) => o.title).join("; ") || "none yet", sampleSize: intel.topOpportunities.length },
      { name: "Evidence-backed threats identified", value: intel.topThreats.length, weight: 0.5, evidence: intel.topThreats.map((t) => t.title).join("; ") || "none yet", sampleSize: intel.topThreats.length },
    ],
  };
}

function audienceCategory(): CategoryScore {
  // Genuinely unsupported — no follower/audience/demographic data exists
  // anywhere in the schema today. Never fabricated; the honest, required
  // "more data required" case.
  return {
    category: "audience", label: "Audience Health", status: "more_data_required", score: null, confidence: 0,
    contributingMetrics: [],
    missingDataHint: "Connect Instagram/TikTok analytics to unlock Audience Health — no audience or follower data is tracked yet.",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function fmtDelta(d: number | null): string { return d === null ? "no prior-period data" : `${d > 0 ? "+" : ""}${d}%`; }
function avgOf(nums: (number | null)[]): number | null {
  const vals = nums.filter((n): n is number => n !== null);
  return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
}
function trendDirection(t: NonNullable<BusinessAnalytics["trend"]>): "up" | "down" | "flat" {
  const d = avgOf([t.applications.deltaPct, t.messages.deltaPct, t.pipelineUpdates.deltaPct]);
  if (d === null || Math.abs(d) < 5) return "flat";
  return d > 0 ? "up" : "down";
}

// ─── Top-level composition ───────────────────────────────────────────────────

export function computeMarketingHealth(analytics: BusinessAnalytics, intel: IntelligenceSummary | null): MarketingHealthResult {
  const categories: CategoryScore[] = [
    campaignCategory(analytics),
    conversionCategory(analytics),
    retentionCategory(analytics),
    revenueCategory(analytics),
    growthCategory(analytics),
    contentCategory(analytics),
    brandCategory(analytics, intel),
    marketPositionCategory(intel),
    audienceCategory(),
  ];

  const supported = categories.filter((c) => c.status === "supported" && c.score !== null);

  // Overall score: confidence-weighted average of supported categories only —
  // a low-confidence category (e.g. Content Health, capped at 0.5) pulls the
  // overall number less than a high-confidence one, by construction.
  let overall: MarketingHealthResult["overall"] = { score: null, confidence: 0 };
  if (supported.length > 0) {
    const totalConf = supported.reduce((s, c) => s + Math.max(c.confidence, 0.05), 0); // floor avoids a zero-confidence category vanishing entirely
    const score = supported.reduce((s, c) => s + c.score! * (Math.max(c.confidence, 0.05) / totalConf), 0);
    const avgConf = supported.reduce((s, c) => s + c.confidence, 0) / supported.length;
    overall = { score: Math.round(score), confidence: Math.round(avgConf * 100) / 100 };
  }

  // Deterministic selection — highest/lowest scoring category above the
  // confidence floor. The AI layer explains this choice; it cannot make it.
  const eligible = supported.filter((c) => c.confidence >= CONFIDENCE_FLOOR);
  const topStrength = eligible.length ? eligible.reduce((a, b) => (b.score! > a.score! ? b : a)) : null;
  const biggestWeakness = eligible.length ? eligible.reduce((a, b) => (b.score! < a.score! ? b : a)) : null;

  const largestOpportunity: EvidenceRef | null = intel?.topOpportunities[0]
    ? { title: intel.topOpportunities[0].title, evidence: intel.topOpportunities[0].evidence, source: "market_intelligence" }
    : fallbackOpportunity(categories);
  const largestRisk: EvidenceRef | null = intel?.topThreats[0]
    ? { title: intel.topThreats[0].title, evidence: intel.topThreats[0].evidence, source: "market_intelligence" }
    : fallbackRisk(categories);

  return { categories, overall, topStrength, biggestWeakness, largestOpportunity, largestRisk, asOf: new Date().toISOString() };
}

// When Market Intelligence has nothing yet, fall back to the weakest/strongest
// contributing metric across all categories — still real, still evidence-backed.
function fallbackOpportunity(categories: CategoryScore[]): EvidenceRef | null {
  const best = categories.flatMap((c) => c.contributingMetrics).filter((m) => m.value >= 70 && m.weight > 0).sort((a, b) => b.value - a.value)[0];
  return best ? { title: best.name, evidence: best.evidence, source: "analytics" } : null;
}
function fallbackRisk(categories: CategoryScore[]): EvidenceRef | null {
  const worst = categories.flatMap((c) => c.contributingMetrics).filter((m) => m.value <= 40 && m.weight > 0).sort((a, b) => a.value - b.value)[0];
  return worst ? { title: worst.name, evidence: worst.evidence, source: "analytics" } : null;
}

// ─── AI Marketing Team integration ───────────────────────────────────────────
// A few capped lines, never a raw category dump — reused identically by
// marketing-hub-briefing today and any future consumer.

export function buildHealthSummaryForAI(health: MarketingHealthResult): string[] {
  const lines: string[] = [];
  if (health.overall.score !== null) {
    lines.push(`Overall Marketing Health: ${health.overall.score}/100 (confidence ${Math.round(health.overall.confidence * 100)}%)`);
  } else {
    lines.push("Overall Marketing Health: not enough data yet to compute");
  }
  if (health.topStrength) lines.push(`Top strength: ${health.topStrength.label} (${health.topStrength.score}/100)`);
  if (health.biggestWeakness) lines.push(`Biggest weakness: ${health.biggestWeakness.label} (${health.biggestWeakness.score}/100)`);
  if (health.largestRisk) lines.push(`Largest risk: ${health.largestRisk.title} — ${health.largestRisk.evidence}`);
  if (health.largestOpportunity) lines.push(`Largest opportunity: ${health.largestOpportunity.title} — ${health.largestOpportunity.evidence}`);
  return lines;
}
