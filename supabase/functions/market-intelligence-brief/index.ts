// ─────────────────────────────────────────────────────────────────────────────
// market-intelligence-brief
//
// The read path of Market Intelligence (Phase 5). Safe to call on every page
// load: a cache hit on market_intelligence_briefs for (business, today) costs
// nothing — no search, no AI call, no credit gate. This is what satisfies
// "opening the page does not automatically trigger expensive searches" —
// live search only ever happens in market-intelligence-refresh, gated by
// market_intelligence_search_cursor.
//
// Competitors/opportunities/threats/trends/feed are all deterministic reads
// over already-stored findings — no AI call for any of them. Only the
// Executive Brief's 3-5 "what matters now" items are synthesized, and only
// on a cache miss (or explicit force_refresh), reasoning over already-scored,
// already-deduplicated evidence — never raw search noise.
//
// POST /functions/v1/market-intelligence-brief
// Body: { force_refresh?: boolean }
// Returns: { brief, competitors, opportunities, threats, trends, feed_findings, generated_at, cached }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isRateLimited, DEFAULT_AI_RATE, requireAuth, jsonOk, jsonErr, AuthError } from "../_shared/security.ts";
import { callAI } from "../_shared/router.ts";
import { freshnessState, type FreshnessState } from "../_shared/marketIntelligence.ts";

const CREDIT_COST = 3; // matches CREDIT_COST.market_intelligence_brief in src/lib/aiCredits.ts — ~$0.017 real cost, charged only on cache miss

function todayPeriodStart(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FindingRow {
  id: string; type: string; category: string; title: string; summary: string; evidence: string;
  source_url: string; source_domain: string; source_title: string | null;
  competitor_id: string | null; confidence: number; relevance: number;
  fetched_at: string; stale_after: string; created_at: string;
}

function withFreshness<T extends { fetched_at: string; stale_after: string }>(rows: T[]): (T & { freshness: FreshnessState })[] {
  const now = new Date();
  return rows.map((r) => ({ ...r, freshness: freshnessState(new Date(r.fetched_at), new Date(r.stale_after), now) }));
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

    if (isRateLimited(`market-intelligence-brief:${user.id}`, DEFAULT_AI_RATE)) {
      return jsonErr("Too many requests. Please wait a moment and try again.", req, 429);
    }

    const { data: profile } = await serviceClient
      .from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle();
    const isBusiness = profile?.account_type === "brand" || profile?.account_type === "business" || profile?.account_type === "agency"
      || profile?.onboarding_path === "business_creator" || profile?.onboarding_path === "business_marketing";
    if (!isBusiness) return jsonErr("Market Intelligence is available for business accounts.", req, 403);

    const body = await req.json().catch(() => ({})) as { force_refresh?: boolean };
    const periodStart = todayPeriodStart();

    // ── Always-fresh deterministic reads (never gated, never cost anything) ──
    const [{ data: competitors }, { data: findings }] = await Promise.all([
      serviceClient.from("market_competitors")
        .select("id, name, domain, status, source, confidence, created_at")
        .eq("business_id", user.id).order("status", { ascending: true }).order("created_at", { ascending: false }),
      serviceClient.from("market_intelligence_findings")
        .select("id, type, category, title, summary, evidence, source_url, source_domain, source_title, competitor_id, confidence, relevance, fetched_at, stale_after, created_at")
        .eq("business_id", user.id).eq("status", "active")
        .order("created_at", { ascending: false }).limit(300),
    ]);

    const activeFindings = withFreshness((findings ?? []) as FindingRow[]).filter((f) => f.freshness !== "historical");
    const rankedByScore = [...activeFindings].sort((a, b) => (b.relevance * b.confidence) - (a.relevance * a.confidence));

    const competitorsOut = competitors ?? [];
    const opportunities  = rankedByScore.filter((f) => f.type === "opportunity");
    const threats         = rankedByScore.filter((f) => f.type === "threat");
    const trends           = rankedByScore.filter((f) => f.type === "trend");
    const competitorMoves = rankedByScore.filter((f) => f.type === "competitor");
    const feedFindings     = withFreshness((findings ?? []) as FindingRow[]).slice(0, 50); // chronological, all types, for the Intelligence Feed

    const hasAnyFindings = activeFindings.length > 0;

    // ── Cache check on the Executive Brief synthesis only ─────────────────
    if (!body.force_refresh) {
      const { data: cached } = await serviceClient
        .from("market_intelligence_briefs").select("*")
        .eq("business_id", user.id).eq("period_start", periodStart).maybeSingle();
      if (cached) {
        return jsonOk({
          brief: cached.brief, competitors: competitorsOut,
          opportunities, threats, trends, competitor_moves: competitorMoves,
          feed_findings: feedFindings, generated_at: cached.generated_at, cached: true,
        }, req);
      }
    }

    // ── No findings yet — honest empty state, no AI call, no charge ──────
    if (!hasAnyFindings) {
      const emptyBrief = {
        top_items: [] as unknown[],
        headline: "Not enough verified market data yet.",
      };
      return jsonOk({
        brief: emptyBrief, competitors: competitorsOut,
        opportunities: [], threats: [], trends: [], competitor_moves: [],
        feed_findings: feedFindings, generated_at: new Date().toISOString(), cached: false,
      }, req);
    }

    // ── Credit gate — only reached on a real synthesis call ──────────────
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

    // ── Synthesis — reasons over already-stored, already-scored findings ──
    const topForSynthesis = rankedByScore.slice(0, 15);
    const factsBlock = topForSynthesis.map((f, i) =>
      `[${i}] (${f.type}/${f.category}, confidence ${f.confidence}, ${f.freshness}) "${f.title}" — ${f.summary} | Evidence: "${f.evidence}" (source: ${f.source_domain})`,
    ).join("\n");

    const prompt = `You are the AI Marketing Team producing today's Market Intelligence Executive Brief. Use ONLY the findings below — every item must cite one by its [index]. Never invent a finding, competitor, or number not present below. If there is little to report, say so plainly rather than padding.

FINDINGS:
${factsBlock}

Return ONLY valid JSON, no prose, no markdown fences:
{
  "headline": "<one sharp sentence summarizing the state of the market right now>",
  "top_items": [
    { "finding_index": <int, references the [index] above>, "why_it_matters": "<1-2 sentences>", "recommended_action": "<short actionable sentence, or null if none warranted>" }
  ]
}
top_items: 3-5 items, ranked by real importance to this business — not just the highest-confidence items, but the ones most worth acting on.`;

    let result;
    try {
      result = await callAI({
        feature: "market_intelligence_synthesis",
        messages: [{ role: "user", content: prompt }],
        userId: user.id,
        supabase: serviceClient,
      });
    } catch (aiErr) {
      console.error("market-intelligence-brief AI call failed:", aiErr);
      return jsonErr("MRKT AI is temporarily unavailable. Please try again shortly.", req, 503);
    }

    const cleaned = result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    let synthesized: { headline: string; top_items: { finding_index: number; why_it_matters: string; recommended_action: string | null }[] };
    try {
      synthesized = JSON.parse(cleaned);
    } catch {
      console.error("market-intelligence-brief: failed to parse AI JSON:", cleaned.slice(0, 500));
      return jsonErr("MRKT AI returned an unexpected response. Please try again.", req, 502);
    }

    const brief = {
      headline: synthesized.headline,
      top_items: (synthesized.top_items ?? [])
        .map((item) => {
          const f = topForSynthesis[item.finding_index];
          if (!f) return null;
          return {
            finding_id: f.id, title: f.title, category: f.category,
            why_it_matters: item.why_it_matters, evidence: f.evidence,
            source_url: f.source_url, source_domain: f.source_domain,
            freshness: f.freshness, confidence: f.confidence,
            recommended_action: item.recommended_action ?? null,
          };
        })
        .filter(Boolean),
    };

    const generatedAt = new Date().toISOString();
    await serviceClient.from("market_intelligence_briefs").upsert({
      business_id:  user.id,
      period_start: periodStart,
      brief,
      model:        result.model,
      provider:     result.provider,
      generated_at: generatedAt,
    }, { onConflict: "business_id,period_start" });

    return jsonOk({
      brief, competitors: competitorsOut,
      opportunities, threats, trends, competitor_moves: competitorMoves,
      feed_findings: feedFindings, generated_at: generatedAt, cached: false,
    }, req);

  } catch (err) {
    console.error("market-intelligence-brief error:", err);
    return jsonErr(err instanceof Error ? err.message : "Failed to load market intelligence.", req, 500);
  }
});
