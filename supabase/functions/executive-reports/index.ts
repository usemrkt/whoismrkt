// ─────────────────────────────────────────────────────────────────────────────
// executive-reports
//
// The CEO briefing (Phase 7) — the final composition layer over
// _shared/analytics.ts, _shared/marketIntelligence.ts, and
// _shared/marketingHealth.ts. This function generates nothing new about the
// business itself; it assembles (_shared/executiveReports.ts) and asks AI to
// write the narrative, strictly from the given facts.
//
// Reports are PERMANENT once their period closes — the only report-shaped
// thing in this codebase that isn't a daily-overwrite cache. Reading past
// reports needs no edge function at all (same owner-scoped RLS every other
// table here has); this function only ever generates.
//
// POST /functions/v1/executive-reports
// Body: { report_type: "daily_brief" | "weekly_report" | "monthly_review", force_refresh?: boolean }
// Returns: { report, generated_at, cached }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isRateLimited, DEFAULT_AI_RATE, requireAuth, jsonOk, jsonErr, AuthError } from "../_shared/security.ts";
import { callAI } from "../_shared/router.ts";
import {
  assembleReportInputs, buildContinuityFacts, extractStructuredFields,
  type ReportType, type ReportInputs,
} from "../_shared/executiveReports.ts";
import { priorityForHealthScore } from "../_shared/agencyWorkspace.ts";

const CREDIT_COST: Record<ReportType, number> = {
  daily_brief: 3,       // Haiku, short — ~$0.01 real cost
  weekly_report: 10,    // Sonnet, full structure — ~$0.03-0.05 real cost
  monthly_review: 25,   // Opus, deep, rare — ~$0.10-0.15 real cost
};

const ROUTE_FEATURE: Record<ReportType, string> = {
  daily_brief: "executive_report_daily",
  weekly_report: "executive_report_weekly",
  monthly_review: "executive_report_monthly",
};

const VALID_TYPES: ReportType[] = ["daily_brief", "weekly_report", "monthly_review"];

function fmtMetric(label: string, m: { evidence: string } | null | undefined): string {
  return m ? `${label}: ${m.evidence}` : "";
}

function buildFactsBlock(inputs: ReportInputs): string {
  const { analytics: a, health, intel } = inputs;

  const analyticsLines = [
    fmtMetric("Campaign fill rate", a.campaignFillRate),
    fmtMetric("Creator acceptance rate", a.creatorAcceptanceRate),
    fmtMetric("Deadline adherence", a.deadlineAdherence),
    fmtMetric("Contract conversion", a.contractConversion),
    fmtMetric("Budget utilization", a.budgetUtilization),
    fmtMetric("Repeat creator rate", a.repeatCreatorRate),
    fmtMetric("Review quality", a.reviewQuality),
    `Content volume (30d): ${a.contentVolume.evidence}`,
    fmtMetric("Average campaign duration", a.avgCampaignDurationDays),
    `Campaign velocity: ${a.campaignVelocity.evidence}`,
    fmtMetric("Match win rate", a.matchWinRate),
    fmtMetric("Rehire rate", a.rehireRate),
    a.campaignHealth.avgScore !== null ? `Average campaign health score: ${a.campaignHealth.avgScore}/100 across ${a.campaignHealth.perCampaign.length} campaign(s)` : "",
    a.trend ? `7-day trend: applications ${a.trend.applications.deltaPct ?? "n/a"}%, messages ${a.trend.messages.deltaPct ?? "n/a"}%, pipeline updates ${a.trend.pipelineUpdates.deltaPct ?? "n/a"}% vs. the prior 7 days` : "No week-over-week trend yet (needs 14+ days of history)",
  ].filter(Boolean);

  const healthLines = health.categories.map((c) =>
    c.status === "supported"
      ? `${c.label}: ${c.score}/100 (confidence ${Math.round(c.confidence * 100)}%)`
      : `${c.label}: more data required — ${c.missingDataHint}`,
  );
  healthLines.push(`Overall Marketing Health: ${health.overall.score ?? "not yet computable"}/100`);

  const intelLines = intel ? [
    ...intel.competitorMoves.map((f) => `Competitor activity: ${f.title} — ${f.summary} [${f.competitor ?? "unnamed"}, confidence ${f.confidence}, ${f.freshness}]`),
    ...intel.topOpportunities.map((f) => `Market opportunity: ${f.title} — ${f.summary}`),
    ...intel.topThreats.map((f) => `Market threat: ${f.title} — ${f.summary}`),
    ...intel.relevantTrends.map((f) => `Market trend: ${f.title} — ${f.summary}`),
    ...intel.reputationSignals.map((f) => `Reputation signal: ${f.title} — ${f.summary}`),
  ] : ["No Market Intelligence gathered yet for this business."];

  const continuityLines = buildContinuityFacts(
    health.largestRisk?.title ?? null,
    health.biggestWeakness?.label ?? null,
    inputs.priorReports,
  );

  return [
    "INTERNAL ANALYTICS:", ...analyticsLines.map((l) => `- ${l}`),
    "", "MARKETING HEALTH:", ...healthLines.map((l) => `- ${l}`),
    "", "MARKET INTELLIGENCE:", ...intelLines.map((l) => `- ${l}`),
    ...(continuityLines.length ? ["", "BUSINESS MEMORY (from prior reports, real and already established — do not re-derive, just reference):", ...continuityLines.map((l) => `- ${l}`)] : []),
  ].join("\n");
}

function buildPrompt(inputs: ReportInputs): string {
  const facts = buildFactsBlock(inputs);
  const periodLabel = inputs.periodStart === inputs.periodEnd ? inputs.periodStart : `${inputs.periodStart} to ${inputs.periodEnd}`;

  if (inputs.reportType === "daily_brief") {
    return `You are the AI CMO writing a short Daily Brief for ${periodLabel}. Use ONLY the facts below — never invent a number, trend, competitor, or score. This is a busy executive's first read of the day: short, high-priority only, "what changed."

FACTS:
${facts}

Return ONLY valid JSON, no prose, no markdown fences:
{
  "headline": "<one sharp sentence — the single most important thing today>",
  "changes_today": ["<short factual sentence>", ...] (0-3 items, only real changes — empty array if nothing material changed),
  "priority_items": [{ "title": "...", "why": "<cites a real fact above>" }] (1-2 items max),
  "confidence": <0-1, reflecting how much real evidence backs this brief>
}`;
  }

  const reportLabel = inputs.reportType === "weekly_report" ? "Weekly Executive Report" : "Monthly Business Review";
  const strategicNote = inputs.reportType === "monthly_review"
    ? "This is the Monthly Business Review — go deeper on trend direction and strategic framing than a weekly report would; this is read by the CEO to understand the trajectory of the business's marketing, not just this period's events."
    : "This is the Weekly Executive Report — MRKT's heartbeat report; concise but complete, every section grounded in a real fact.";

  return `You are the AI CMO delivering the ${reportLabel} for ${periodLabel}, in the voice a world-class CMO would use briefing a CEO. ${strategicNote} Use ONLY the facts below — never invent a metric, trend, competitor, score, or claim of recurrence not explicitly given. If a section has no real evidence, say so plainly rather than padding it.

FACTS:
${facts}

Return ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:
{
  "executive_summary": {
    "overall_health": "<one sentence citing the real overall score>",
    "major_change": "<the single most significant real change since last period, or 'No major change since the last report' if genuinely nothing changed>",
    "top_win": "<a real positive, or 'No standout win this period' if none>",
    "biggest_risk": "<the real biggest risk, grounded in a fact above>",
    "biggest_opportunity": "<the real biggest opportunity, grounded in a fact above>",
    "priority_recommendation": "<ONE specific, actionable recommendation — not a list>",
    "confidence": <0-1>
  },
  "marketing_performance": { "campaigns": "...", "growth": "...", "content": "...", "revenue": "...", "conversions": "...", "retention": "...", "brand": "..." },
  "market_intelligence": { "competitor_activity": "...", "industry_changes": "...", "consumer_trends": "...", "platform_updates": "...", "opportunities": ["..."], "threats": ["..."] },
  "campaign_review": { "launched": "...", "completed": "...", "performance": "...", "health": "...", "lessons_learned": "..." },
  "content_review": { "production": "...", "consistency": "...", "creative_performance": "...", "publishing": "...", "content_health": "..." },
  "growth_review": { "acquisition": "...", "creator_network": "...", "partnerships": "...", "expansion": "..." },
  "risks": [{ "title": "...", "evidence": "...", "severity": "high|medium|low" }],
  "opportunities": [{ "title": "...", "evidence": "...", "expected_impact": "high|medium|low" }],
  "ai_cmo_recommendation": { "recommendation": "<ONE prioritized recommendation, the report's conclusion>", "why": "...", "evidence": ["..."], "confidence": <0-1> }
}
Every "why"/section must cite a specific fact above. If a section genuinely has nothing to report (e.g. zero campaigns), say that plainly — never pad with generic advice. Tone: senior CMO, direct, executive.`;
}

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey      = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient    = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    let user: { id: string };
    try {
      user = await requireAuth(req, authClient);
    } catch (e) {
      if (e instanceof AuthError) return jsonErr(e.message, req, 401);
      throw e;
    }

    if (isRateLimited(`executive-reports:${user.id}`, DEFAULT_AI_RATE)) {
      return jsonErr("Too many requests. Please wait a moment and try again.", req, 429);
    }

    const { data: profile } = await serviceClient
      .from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle();
    const isBusiness = profile?.account_type === "brand" || profile?.account_type === "business" || profile?.account_type === "agency"
      || profile?.onboarding_path === "business_creator" || profile?.onboarding_path === "business_marketing";
    if (!isBusiness) return jsonErr("Executive Reports are available for business accounts.", req, 403);

    const body = await req.json().catch(() => ({})) as { report_type?: string; force_refresh?: boolean };
    const reportType = body.report_type as ReportType;
    if (!VALID_TYPES.includes(reportType)) {
      return jsonErr(`report_type must be one of: ${VALID_TYPES.join(", ")}`, req, 400);
    }

    const inputs = await assembleReportInputs(serviceClient, user.id, reportType);

    const { data: existing } = await serviceClient
      .from("executive_reports").select("*")
      .eq("business_id", user.id).eq("report_type", reportType).eq("period_start", inputs.periodStart).maybeSingle();

    if (existing && !body.force_refresh) {
      return jsonOk({ report: existing, generated_at: existing.generated_at, cached: true }, req);
    }

    // ── Permanence rule: a closed period is history — it cannot be regenerated ──
    if (existing) {
      const periodClosed = new Date(inputs.periodEnd + "T23:59:59Z").getTime() < Date.now();
      if (periodClosed) {
        return jsonErr("This report is part of your permanent business history and can't be regenerated — its period has closed.", req, 409);
      }
    }

    // ── Credit gate ────────────────────────────────────────────────────────
    const { data: creditRows, error: creditErr } = await serviceClient.rpc(
      "consume_ai_credits", { p_user_id: user.id, p_cost: CREDIT_COST[reportType] },
    );
    if (creditErr) {
      console.error("consume_ai_credits error:", creditErr);
      return jsonErr("Unable to verify AI credits right now. Please try again shortly.", req, 503);
    }
    const creditResult = Array.isArray(creditRows) ? creditRows[0] : creditRows;
    if (!creditResult?.allowed) {
      return jsonErr("You've reached your monthly AI credit limit. Upgrade your plan for more.", req, 402);
    }

    const prompt = buildPrompt(inputs);

    let result;
    try {
      result = await callAI({
        feature: ROUTE_FEATURE[reportType],
        messages: [{ role: "user", content: prompt }],
        userId: user.id,
        supabase: serviceClient,
      });
    } catch (aiErr) {
      console.error("executive-reports AI call failed:", aiErr);
      return jsonErr("MRKT AI is temporarily unavailable. Please try again shortly.", req, 503);
    }

    const cleaned = result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    // deno-lint-ignore no-explicit-any
    let narrative: any;
    try {
      narrative = JSON.parse(cleaned);
    } catch {
      console.error("executive-reports: failed to parse AI JSON:", cleaned.slice(0, 500));
      return jsonErr("MRKT AI returned an unexpected response. Please try again.", req, 502);
    }

    const extracted = extractStructuredFields(reportType, narrative, inputs);
    const generatedAt = new Date().toISOString();

    const { data: saved, error: saveErr } = await serviceClient.from("executive_reports").upsert({
      business_id: user.id,
      report_type: reportType,
      period_start: inputs.periodStart,
      period_end: inputs.periodEnd,
      data_snapshot: { analytics: inputs.analytics, intel: inputs.intel, health: inputs.health, priorReports: inputs.priorReports, _meta: { assembled_at: generatedAt } },
      narrative,
      overall_health_score: extracted.overall_health_score,
      priority_recommendation: extracted.priority_recommendation,
      top_risk: extracted.top_risk,
      top_opportunity: extracted.top_opportunity,
      confidence: extracted.confidence,
      model: result.model,
      provider: result.provider,
      generation_cost_usd: result.estimatedCostUsd,
      generated_at: generatedAt,
    }, { onConflict: "business_id,report_type,period_start" }).select("*").single();

    if (saveErr || !saved) {
      console.error("executive-reports: save failed", saveErr);
      return jsonErr("Report generated but failed to save. Please try again.", req, 500);
    }

    // ── Agency Workspace fan-out (Phase 8) — same guarded pattern as
    // marketing-health's: skip if an identical active recommendation already
    // exists, so a recurring priority recommendation (Phase 7's own
    // continuity mechanism may legitimately repeat one) doesn't pile up
    // duplicate queue items for the same real issue.
    const { data: alreadyQueued } = await serviceClient
      .from("ai_recommendations").select("id").eq("user_id", user.id)
      .eq("source", "executive_reports").eq("status", "active").eq("title", extracted.priority_recommendation).maybeSingle();
    if (!alreadyQueued) {
      await serviceClient.from("ai_recommendations").insert({
        user_id: user.id, recommendation_type: "action", title: extracted.priority_recommendation,
        explanation: reportType === "daily_brief" ? null : (narrative as { executive_summary?: { major_change?: string } }).executive_summary?.major_change ?? null,
        action: null, priority: priorityForHealthScore(extracted.overall_health_score),
        status: "active", source: "executive_reports",
        meta: { link: "/marketing-hub/reports", source_report_id: saved.id },
      });
    }

    return jsonOk({ report: saved, generated_at: generatedAt, cached: false }, req);

  } catch (err) {
    console.error("executive-reports error:", err);
    return jsonErr(err instanceof Error ? err.message : "Failed to generate report.", req, 500);
  }
});
