// ─────────────────────────────────────────────────────────────────────────────
// marketing-health
//
// The executive scorecard (Phase 6). Every score is computed by
// _shared/marketingHealth.ts's computeMarketingHealth() — a pure, deterministic
// function over computeBusinessAnalytics() + buildIntelligenceSummary()'s
// already-existing outputs. This function NEVER calculates a business metric
// itself; its only job is to (a) call the two existing intelligence layers,
// (b) run the deterministic scorer, (c) optionally ask AI to NARRATE the
// already-determined results (never to invent or re-select them), (d) cache
// only that narrative.
//
// Deterministic scores are always fresh, on every call, at zero AI cost —
// only the narrative is cached/credit-gated, exactly mirroring
// market-intelligence-brief's precedent.
//
// POST /functions/v1/marketing-health
// Body: { force_refresh?: boolean }
// Returns: { health, narrative, generated_at, cached }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isRateLimited, DEFAULT_AI_RATE, requireAuth, jsonOk, jsonErr, AuthError } from "../_shared/security.ts";
import { callAI } from "../_shared/router.ts";
import { computeBusinessAnalytics } from "../_shared/analytics.ts";
import { buildIntelligenceSummary } from "../_shared/marketIntelligence.ts";
import { computeMarketingHealth, type MarketingHealthResult } from "../_shared/marketingHealth.ts";

const CREDIT_COST = 5; // matches CREDIT_COST.marketing_health_refresh in src/lib/aiCredits.ts — ~$0.01-0.02 real cost, charged only on cache miss

function todayPeriodStart(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Narrative {
  overall_narrative: string;
  category_why: Record<string, string>;
  top_strength_explanation: string | null;
  biggest_weakness_explanation: string | null;
  largest_opportunity_explanation: string | null;
  largest_risk_explanation: string | null;
  highest_priority_action: string;
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

    if (isRateLimited(`marketing-health:${user.id}`, DEFAULT_AI_RATE)) {
      return jsonErr("Too many requests. Please wait a moment and try again.", req, 429);
    }

    const { data: profile } = await serviceClient
      .from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle();
    const isBusiness = profile?.account_type === "brand" || profile?.account_type === "business" || profile?.account_type === "agency"
      || profile?.onboarding_path === "business_creator" || profile?.onboarding_path === "business_marketing";
    if (!isBusiness) return jsonErr("Marketing Health is available for business accounts.", req, 403);

    const body = await req.json().catch(() => ({})) as { force_refresh?: boolean };
    const periodStart = todayPeriodStart();

    // ── Always-fresh, always-free: the two existing intelligence layers ────
    const [analytics, intelSummary] = await Promise.all([
      computeBusinessAnalytics(serviceClient, user.id),
      buildIntelligenceSummary(serviceClient, user.id),
    ]);
    const health: MarketingHealthResult = computeMarketingHealth(analytics, intelSummary);

    // ── Cache check on the narrative only ─────────────────────────────────
    if (!body.force_refresh) {
      const { data: cached } = await serviceClient
        .from("marketing_health_snapshots").select("*")
        .eq("business_id", user.id).eq("period_start", periodStart).maybeSingle();
      if (cached) {
        const cachedNarrative = (cached.snapshot as { narrative?: Narrative })?.narrative ?? null;
        return jsonOk({ health, narrative: cachedNarrative, generated_at: cached.generated_at, cached: true }, req);
      }
    }

    // ── Nothing supported yet — honest, no AI call, no charge ─────────────
    const anySupported = health.categories.some((c) => c.status === "supported");
    if (!anySupported) {
      return jsonOk({
        health, narrative: { overall_narrative: "Not enough verified business data yet to score Marketing Health.", category_why: {}, top_strength_explanation: null, biggest_weakness_explanation: null, largest_opportunity_explanation: null, largest_risk_explanation: null, highest_priority_action: "Publish a campaign and gather creator applications to unlock Marketing Health." },
        generated_at: new Date().toISOString(), cached: false,
      }, req);
    }

    // ── Credit gate — only reached when there's something real to narrate ─
    const { data: creditRows, error: creditErr } = await serviceClient.rpc(
      "consume_ai_credits", { p_user_id: user.id, p_cost: CREDIT_COST },
    );
    if (creditErr) {
      console.error("consume_ai_credits error:", creditErr);
      return jsonErr("Unable to verify AI credits right now. Please try again shortly.", req, 503);
    }
    const creditResult = Array.isArray(creditRows) ? creditRows[0] : creditRows;
    if (!creditResult?.allowed) {
      return jsonErr("You've reached your monthly AI credit limit. Upgrade your plan for more.", req, 402);
    }

    // ── Narration — reasons over the ALREADY-DETERMINED deterministic result;
    //    the prompt is explicit that it cannot change the selection. ───────
    const supportedCats = health.categories.filter((c) => c.status === "supported");
    const categoryLines = supportedCats.map((c) =>
      `- ${c.label}: ${c.score}/100 (confidence ${Math.round(c.confidence * 100)}%). Contributing: ${c.contributingMetrics.map((m) => `${m.name}=${m.value} [${m.evidence}]`).join("; ")}`,
    ).join("\n");
    const unsupportedCats = health.categories.filter((c) => c.status === "more_data_required").map((c) => c.label);

    const prompt = `You are the AI Marketing Team explaining a real, already-computed Marketing Health scorecard to a business owner. Every number below was computed deterministically — you are NOT deciding scores, strengths, weaknesses, opportunities, or risks. Those have already been chosen. Your only job is to explain WHY, in plain executive language, citing the real evidence given. Never invent a number, category, or fact not present below.

OVERALL SCORE: ${health.overall.score ?? "not yet computable"}/100 (confidence ${Math.round(health.overall.confidence * 100)}%)

CATEGORIES (already scored):
${categoryLines}

CATEGORIES WITH INSUFFICIENT DATA (do not score these, do not imply a score for them): ${unsupportedCats.join(", ") || "none"}

ALREADY-CHOSEN top strength: ${health.topStrength ? `${health.topStrength.label} (${health.topStrength.score}/100)` : "none yet — insufficient confidence"}
ALREADY-CHOSEN biggest weakness: ${health.biggestWeakness ? `${health.biggestWeakness.label} (${health.biggestWeakness.score}/100)` : "none yet — insufficient confidence"}
ALREADY-CHOSEN largest opportunity: ${health.largestOpportunity ? `${health.largestOpportunity.title} — ${health.largestOpportunity.evidence}` : "none identified yet"}
ALREADY-CHOSEN largest risk: ${health.largestRisk ? `${health.largestRisk.title} — ${health.largestRisk.evidence}` : "none identified yet"}

Return ONLY valid JSON, no prose, no markdown fences:
{
  "overall_narrative": "<2-3 sentences, executive tone, citing real category scores>",
  "category_why": { "<category label>": "<one sentence, cites its real contributing metrics>", ... one entry per scored category above },
  "top_strength_explanation": ${health.topStrength ? '"<1-2 sentences explaining why this is the top strength, citing its real evidence>"' : "null"},
  "biggest_weakness_explanation": ${health.biggestWeakness ? '"<1-2 sentences, same>"' : "null"},
  "largest_opportunity_explanation": ${health.largestOpportunity ? '"<1-2 sentences, same>"' : "null"},
  "largest_risk_explanation": ${health.largestRisk ? '"<1-2 sentences, same>"' : "null"},
  "highest_priority_action": "<one concrete, specific next action, grounded in the weakest real evidence above>"
}`;

    let result;
    try {
      result = await callAI({
        feature: "marketing_health_narrative",
        messages: [{ role: "user", content: prompt }],
        userId: user.id,
        supabase: serviceClient,
      });
    } catch (aiErr) {
      console.error("marketing-health AI call failed:", aiErr);
      return jsonErr("MRKT AI is temporarily unavailable. Please try again shortly.", req, 503);
    }

    const cleaned = result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    let narrative: Narrative;
    try {
      narrative = JSON.parse(cleaned);
    } catch {
      console.error("marketing-health: failed to parse AI JSON:", cleaned.slice(0, 500));
      return jsonErr("MRKT AI returned an unexpected response. Please try again.", req, 502);
    }

    const generatedAt = new Date().toISOString();
    await serviceClient.from("marketing_health_snapshots").upsert({
      business_id:  user.id,
      period_start: periodStart,
      snapshot:     { health, narrative },
      model:        result.model,
      provider:     result.provider,
      generated_at: generatedAt,
    }, { onConflict: "business_id,period_start" });

    return jsonOk({ health, narrative, generated_at: generatedAt, cached: false }, req);

  } catch (err) {
    console.error("marketing-health error:", err);
    return jsonErr(err instanceof Error ? err.message : "Failed to compute Marketing Health.", req, 500);
  }
});
