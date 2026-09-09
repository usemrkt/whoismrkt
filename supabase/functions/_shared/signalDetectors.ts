// ─────────────────────────────────────────────────────────────────────────────
// Phase P — Signal Detector Registry (spec §3-6).
//
// Data → deterministic rule → signal. No detector here calls an LLM to
// "decide if anything looks interesting" (spec §4's explicit prohibition) —
// every evaluate() below is a pure-enough, directly-testable function over
// real rows already in the database (or, for the seasonal detector, real
// wall-clock date math). AI is reserved for INTERPRETING an already-detected
// signal into a Finding's prose (signal-detector-runner does that, cheaply,
// only for signals that actually fired) — never for detection itself.
//
// A detector's evaluate() returns SignalDetectionResult[] — zero, one, or
// several real detections. An empty array is the expected, common, CORRECT
// result for "nothing meaningful right now" or "not enough data yet" — never
// treated as an error, never papered over with a fabricated signal (spec
// §38 "Do not fake the signal").
//
// Registered here but not yet capable of firing (no real data source exists
// yet — e.g. no Meta connector): still listed, `requiresConnector` set, and
// evaluate() honestly short-circuits to []. This is what spec §5/§26/§27
// mean by "future connectors must be able to register additional signals" —
// the registry, not just today's 4 live detectors, is the real deliverable.
// ─────────────────────────────────────────────────────────────────────────────

import { KNOWN_ERROR_SIGNATURES, classifyError } from "./missionLearning.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type SignalCategory = "performance" | "campaign" | "creative" | "market" | "business" | "mission" | "seasonal";
export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high" | "verified";

export interface ProposedMissionPackage {
  title: string;
  why_now: string;
  found: string;
  proposed_response: string;
  team: string[]; // AgentKey[]
  estimated_internal_cost_usd: number;
  external_spend_usd: number; // always 0 in Phase P — no connector exists to spend anything
}

export interface SignalDetectionResult {
  dedupeKey: string;
  category: SignalCategory;
  severity: Severity;
  confidence: Confidence;
  metricLabel: string | null;
  metricCurrent: number | null;
  metricBaseline: number | null;
  changePct: number | null;
  windowDays: number | null;
  dataSource: string;
  affectedObjective: string | null;
  affectedChannel: string | null;
  affectedCampaignId: string | null;
  evidence: Record<string, unknown>;
  findingTitle: string;
  findingSummary: string;
  recommendationTitle: string;
  recommendationExplanation: string;
  recommendationAction: string;
  priority: "critical" | "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  estimatedCostUsd: number;
  proposedMission: ProposedMissionPackage | null;
}

export interface SignalDetector {
  key: string;
  category: SignalCategory;
  dataRequirements: string[];
  cooldownHours: number;
  /** Set only for a detector that cannot fire yet — documents WHY, never silently omitted from the registry. */
  requiresConnector?: string;
  evaluate: (supabase: SupabaseClient, businessId: string) => Promise<SignalDetectionResult[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE — mission_repeated_tool_failure
// Same underlying data and vocabulary as Phase O's missionLearning.ts (spec
// §3's "Mission signal: repeated tool failure detected"), reused rather than
// duplicated. Different output artifact: an institutional-memory candidate
// (Phase O) vs. an operational recommendation the CMO can act on today.
// ═══════════════════════════════════════════════════════════════════════════

const missionRepeatedToolFailure: SignalDetector = {
  key: "mission_repeated_tool_failure",
  category: "mission",
  dataRequirements: ["mission_tasks"],
  cooldownHours: 24,
  evaluate: async (supabase, businessId) => {
    const { data: failedTasks } = await supabase
      .from("mission_tasks").select("tool_name, error_message")
      .eq("business_id", businessId).eq("status", "failed");

    const seen = new Set<string>();
    const results: SignalDetectionResult[] = [];

    for (const t of failedTasks ?? []) {
      const signature = classifyError(t.error_message);
      if (!signature) continue;
      const key = `${t.tool_name}:${signature}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const { count } = await supabase
        .from("mission_tasks").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("tool_name", t.tool_name).eq("status", "failed")
        .ilike("error_message", `%${KNOWN_ERROR_SIGNATURES.find((s) => s.label === signature)!.match}%`);

      const n = count ?? 0;
      if (n < 2) continue; // one incident is noise, not a pattern

      const severity: Severity = n >= 4 ? "high" : "medium";
      results.push({
        dedupeKey: `mission_repeated_tool_failure:${t.tool_name}:${signature}`,
        category: "mission", severity, confidence: "high",
        metricLabel: "failed_task_count", metricCurrent: n, metricBaseline: 2, changePct: null, windowDays: null,
        dataSource: "mission_tasks",
        affectedObjective: null, affectedChannel: null, affectedCampaignId: null,
        evidence: { tool_name: t.tool_name, error_signature: signature, failure_count: n },
        findingTitle: `"${t.tool_name}" is failing repeatedly`,
        findingSummary: `${t.tool_name} has failed ${n} time(s) with the same underlying cause (${signature.replace(/_/g, " ")}). This is a real, counted pattern across your Missions, not a one-off.`,
        recommendationTitle: `Fix "${t.tool_name}" reliability before running more Missions`,
        recommendationExplanation: `Your marketing team's ${t.tool_name} step has failed ${n} times for the same reason (${signature.replace(/_/g, " ")}). Until it's resolved, Missions that depend on it will keep failing the same way.`,
        recommendationAction: signature === "provider_billing_exhausted"
          ? "Check your AI provider's billing/credit balance, then retry the affected Mission."
          : "Review the underlying provider issue, then retry the affected Mission.",
        priority: severity === "high" ? "high" : "medium",
        effort: "low", risk: "low", estimatedCostUsd: 0,
        proposedMission: {
          title: `Work around the "${t.tool_name}" outage`,
          why_now: `"${t.tool_name}" has failed ${n} times in a row for the same reason — every Mission step that depends on it is currently blocked.`,
          found: `Repeated failure signature: ${signature.replace(/_/g, " ")}.`,
          proposed_response: "Gather the current context and prepare a manual/alternate path for the affected work while the underlying issue is resolved.",
          team: ["analyst", "cmo"],
          estimated_internal_cost_usd: 0.05,
          external_spend_usd: 0,
        },
      });
    }

    return results;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LIVE — marketing_health_decline
// Trailing comparison over real marketing_health_snapshots rows. Honestly
// returns [] (not a fabricated signal) when fewer than 2 real snapshots
// exist for a business — spec §38's "insufficient data" is a correct
// outcome, not something to work around.
// ═══════════════════════════════════════════════════════════════════════════

const MATERIAL_DECLINE_THRESHOLD_PCT = 15;

const marketingHealthDecline: SignalDetector = {
  key: "marketing_health_decline",
  category: "performance",
  dataRequirements: ["marketing_health_snapshots"],
  cooldownHours: 48,
  evaluate: async (supabase, businessId) => {
    const { data: snapshots } = await supabase
      .from("marketing_health_snapshots").select("period_start, snapshot")
      .eq("business_id", businessId).order("period_start", { ascending: false }).limit(2);

    if (!snapshots || snapshots.length < 2) return []; // insufficient data — honest silence

    const currentScore = snapshots[0]?.snapshot?.health?.overall?.score;
    const baselineScore = snapshots[1]?.snapshot?.health?.overall?.score;
    if (typeof currentScore !== "number" || typeof baselineScore !== "number" || baselineScore === 0) return [];

    const changePct = ((currentScore - baselineScore) / baselineScore) * 100;
    if (changePct > -MATERIAL_DECLINE_THRESHOLD_PCT) return []; // not a material decline

    const severity: Severity = changePct <= -30 ? "high" : "medium";
    return [{
      dedupeKey: "marketing_health_decline",
      category: "performance", severity, confidence: "high",
      metricLabel: "marketing_health_score", metricCurrent: currentScore, metricBaseline: baselineScore,
      changePct: Math.round(changePct * 10) / 10, windowDays: null, dataSource: "marketing_health_snapshots",
      affectedObjective: "overall marketing health", affectedChannel: null, affectedCampaignId: null,
      evidence: { current_period: snapshots[0].period_start, baseline_period: snapshots[1].period_start, current_score: currentScore, baseline_score: baselineScore },
      findingTitle: "Marketing Health score declined materially",
      findingSummary: `Marketing Health dropped from ${baselineScore} to ${currentScore} (${changePct.toFixed(1)}%) since the last snapshot.`,
      recommendationTitle: "Review what's driving the Marketing Health decline",
      recommendationExplanation: `Your Marketing Health score fell ${Math.abs(changePct).toFixed(1)}% since ${snapshots[1].period_start}.`,
      recommendationAction: "Open Marketing Health to see which factor moved, then start a Mission to address it.",
      priority: severity === "high" ? "high" : "medium",
      effort: "medium", risk: "low", estimatedCostUsd: 0,
      proposedMission: {
        title: "Recover Marketing Health",
        why_now: `Marketing Health fell ${Math.abs(changePct).toFixed(1)}% since the last snapshot.`,
        found: `Score moved from ${baselineScore} to ${currentScore}.`,
        proposed_response: "Gather current context, build a strategy addressing the decline, and draft next steps.",
        team: ["analyst", "cmo"],
        estimated_internal_cost_usd: 0.05,
        external_spend_usd: 0,
      },
    }];
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LIVE — competitor_activity_increase
// Real market_intelligence_findings counts, trailing 7d vs. prior 7d.
// Correctly returns [] for a business with no/sparse findings yet.
// ═══════════════════════════════════════════════════════════════════════════

const competitorActivityIncrease: SignalDetector = {
  key: "competitor_activity_increase",
  category: "market",
  dataRequirements: ["market_intelligence_findings"],
  cooldownHours: 72,
  evaluate: async (supabase, businessId) => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const recentStart = new Date(now - 7 * day).toISOString();
    const priorStart = new Date(now - 14 * day).toISOString();

    const [{ count: recentCount }, { count: priorCount }] = await Promise.all([
      supabase.from("market_intelligence_findings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("category", "competitor_activity").gte("created_at", recentStart),
      supabase.from("market_intelligence_findings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("category", "competitor_activity").gte("created_at", priorStart).lt("created_at", recentStart),
    ]);

    const recent = recentCount ?? 0, prior = priorCount ?? 0;
    if (recent < 3 || prior === 0) return []; // not enough signal either way to compare responsibly
    const changePct = ((recent - prior) / prior) * 100;
    if (changePct < 100) return []; // require at least a doubling — "materially increased," not noise

    return [{
      dedupeKey: "competitor_activity_increase",
      category: "market", severity: "medium", confidence: "medium",
      metricLabel: "competitor_activity_findings_7d", metricCurrent: recent, metricBaseline: prior,
      changePct: Math.round(changePct), windowDays: 7, dataSource: "market_intelligence_findings",
      affectedObjective: "competitive position", affectedChannel: null, affectedCampaignId: null,
      evidence: { recent_count: recent, prior_count: prior },
      findingTitle: "Competitor promotional activity increased",
      findingSummary: `MRKT found ${recent} competitor-activity findings this week vs. ${prior} the week before.`,
      recommendationTitle: "Review recent competitor activity",
      recommendationExplanation: `Competitor activity findings ${changePct >= 0 ? "rose" : "fell"} ${Math.abs(changePct)}% week-over-week.`,
      recommendationAction: "Open Market Intelligence to see what changed.",
      priority: "low", effort: "low", risk: "low", estimatedCostUsd: 0,
      proposedMission: null, // informational — not every recommendation needs a Mission (spec §10 "strongest")
    }];
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LIVE — seasonal_moment_approaching
// Pure calendar math, zero data dependency, always correct regardless of
// when it runs — the cleanest possible "deterministic rule, not an LLM
// vibe-check" detector (spec §4).
// ═══════════════════════════════════════════════════════════════════════════

// Exported for direct unit testing (tests/unit/signalDetectors.test.ts) —
// pure date math, the cleanest possible "deterministic rule" surface.
export function nthWeekdayOfMonth(year: number, month0: number, weekday: number, n: number): Date {
  const d = new Date(Date.UTC(year, month0, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === weekday) { count++; if (count === n) return d; }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function nextOccurrence(monthIndexFn: (year: number) => Date, now: Date): Date {
  let candidate = monthIndexFn(now.getUTCFullYear());
  if (candidate.getTime() < now.getTime()) candidate = monthIndexFn(now.getUTCFullYear() + 1);
  return candidate;
}

const SEASONAL_MOMENTS: { key: string; label: string; date: (year: number) => Date }[] = [
  { key: "black_friday", label: "Black Friday", date: (y) => nthWeekdayOfMonth(y, 10, 5, 4) },
  { key: "valentines_day", label: "Valentine's Day", date: (y) => new Date(Date.UTC(y, 1, 14)) },
  { key: "new_year", label: "New Year", date: (y) => new Date(Date.UTC(y, 0, 1)) },
];

const SEASONAL_WINDOW_DAYS = 30;

const seasonalMomentApproaching: SignalDetector = {
  key: "seasonal_moment_approaching",
  category: "seasonal",
  dataRequirements: [], // wall-clock only
  cooldownHours: 24 * 14, // re-notifying about the same moment daily would be noise
  evaluate: async (_supabase, _businessId) => {
    const now = new Date();
    const results: SignalDetectionResult[] = [];
    for (const moment of SEASONAL_MOMENTS) {
      const occurrence = nextOccurrence(moment.date, now);
      const daysUntil = Math.round((occurrence.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (daysUntil < 0 || daysUntil > SEASONAL_WINDOW_DAYS) continue;

      results.push({
        dedupeKey: `seasonal_moment_approaching:${moment.key}:${occurrence.getUTCFullYear()}`,
        category: "seasonal", severity: daysUntil <= 10 ? "medium" : "low", confidence: "verified",
        metricLabel: "days_until", metricCurrent: daysUntil, metricBaseline: null, changePct: null,
        windowDays: SEASONAL_WINDOW_DAYS, dataSource: "calendar",
        affectedObjective: "seasonal campaign planning", affectedChannel: null, affectedCampaignId: null,
        evidence: { moment: moment.label, date: occurrence.toISOString().slice(0, 10), days_until: daysUntil },
        findingTitle: `${moment.label} is ${daysUntil} day(s) away`,
        findingSummary: `${moment.label} falls on ${occurrence.toISOString().slice(0, 10)}, ${daysUntil} day(s) from now.`,
        recommendationTitle: `Plan for ${moment.label}`,
        recommendationExplanation: `${moment.label} is coming up in ${daysUntil} day(s) — a seasonal opportunity worth a dedicated plan.`,
        recommendationAction: "Start a Mission to prepare seasonal content and campaign ideas.",
        priority: daysUntil <= 10 ? "medium" : "low", effort: "low", risk: "low", estimatedCostUsd: 0,
        proposedMission: {
          title: `Prepare for ${moment.label}`,
          why_now: `${moment.label} is ${daysUntil} day(s) away.`,
          found: "Seasonal calendar moment approaching.",
          proposed_response: `Build a strategy and draft content/campaign ideas ahead of ${moment.label}.`,
          team: ["cmo", "content"],
          estimated_internal_cost_usd: 0.05,
          external_spend_usd: 0,
        },
      });
    }
    return results;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FUTURE — registered, cannot fire (no Meta connector exists). Proves the
// registry supports future connectors (spec §26/§27) without fabricating
// data no connection can actually produce.
// ═══════════════════════════════════════════════════════════════════════════

const metaCpaDeterioration: SignalDetector = {
  key: "meta_cpa_deterioration",
  category: "performance",
  dataRequirements: ["meta_ads_insights (future connector)"],
  cooldownHours: 24,
  requiresConnector: "meta_ads",
  evaluate: async (_supabase, _businessId) => [], // no live Meta data source yet — always empty, never fabricated
};

export const SIGNAL_DETECTORS: SignalDetector[] = [
  missionRepeatedToolFailure,
  marketingHealthDecline,
  competitorActivityIncrease,
  seasonalMomentApproaching,
  metaCpaDeterioration,
];
