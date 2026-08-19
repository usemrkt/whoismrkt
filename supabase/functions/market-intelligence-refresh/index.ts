// ─────────────────────────────────────────────────────────────────────────────
// market-intelligence-refresh
//
// The write path of Market Intelligence (Phase 5): live web search → real,
// cited evidence → deterministic classification/scoring/dedup → structured
// rows in market_intelligence_findings. Opening the Market Intelligence page
// never calls this — that's market-intelligence-brief, a pure read over
// already-stored findings. This function only ever runs when a search family
// is actually due (per market_intelligence_search_cursor), so cost is
// bounded by the cadence design in _shared/marketIntelligence.ts, not by how
// often someone loads a page.
//
// Two callers, one shared runPipeline():
//   - Manual (business's own JWT): requireAuth + rate limit + credit gate,
//     runs up to 3 due families for that one business.
//   - Cron (service-role bearer token, hourly — see the migration's
//     cron.schedule): loops every business with real signal (a brand_knowledge
//     or campaigns row), up to 5 due families each, no credit charge — cost
//     is bounded by cadence, not per-call gating.
//
// POST /functions/v1/market-intelligence-refresh
// Manual body: {} (uses the caller's own business_id)
// Cron body:   { "trigger": "cron" } (service-role auth distinguishes it)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isRateLimited, STRICT_AI_RATE, requireAuth, jsonOk, jsonErr, AuthError } from "../_shared/security.ts";
import { callAI, type AICitation } from "../_shared/router.ts";
import {
  ALL_FAMILIES, FAMILY_CADENCE_HOURS, FAMILY_MAX_USES, staleAfterFor, typeForCategory,
  computeConfidence, computeRelevance, buildDedupeKey, normalizeDomain, entityMatchScore,
  assembleBusinessFacts, reconcileConfirmedCompetitors, planSearches, dueFamilies,
  type SearchFamily, type BusinessFacts, type IntelligenceCategory,
} from "../_shared/marketIntelligence.ts";

const CREDIT_COST = 15; // matches CREDIT_COST.market_intelligence_refresh in src/lib/aiCredits.ts — ~$0.08 real cost (3 families)

const VALID_CATEGORIES: IntelligenceCategory[] = [
  "competitor_activity", "industry_trend", "consumer_trend", "content_trend",
  "pricing_offer_change", "product_launch", "partnership", "campaign_creative_trend",
  "platform_change", "opportunity", "threat", "seasonal_signal",
  "reputation_sentiment", "market_movement",
];

interface ClassifiedCandidate {
  index: number;
  keep: boolean;
  category: IntelligenceCategory;
  competitor_name: string | null;
  market_topic: string | null;
  title: string;
  summary: string;
}

// deno-lint-ignore no-explicit-any
async function runPipeline(serviceClient: any, businessId: string, maxFamilies: number) {
  await reconcileConfirmedCompetitors(serviceClient, businessId);
  const facts = await assembleBusinessFacts(serviceClient, businessId);

  const due = (await dueFamilies(serviceClient, businessId)).slice(0, maxFamilies);
  const { plans, skipped } = planSearches(facts, due);

  let findingsAdded = 0;
  const errors: { family: SearchFamily; message: string }[] = [];

  for (const plan of plans) {
    try {
      const added = await runFamily(serviceClient, businessId, facts, plan.family, plan.queries);
      findingsAdded += added;
      await upsertCursor(serviceClient, businessId, plan.family, "success", added === 0 ? "no_findings" : "success", added);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`market-intelligence-refresh: family "${plan.family}" failed for ${businessId}:`, message);
      errors.push({ family: plan.family, message });
      // Shorter retry on error so a transient failure doesn't wait the full cadence.
      await upsertCursor(serviceClient, businessId, plan.family, "error", "error");
    }
  }

  return {
    families_processed: plans.map((p) => p.family),
    families_skipped:   skipped,
    findings_added:      findingsAdded,
    errors,
  };
}

// deno-lint-ignore no-explicit-any
async function upsertCursor(serviceClient: any, businessId: string, family: SearchFamily, status: "success" | "error", runStatus: "success" | "no_findings" | "error", findingsAdded = 0) {
  const now = new Date();
  const retryHours = runStatus === "error" ? Math.min(FAMILY_CADENCE_HOURS[family] / 4, 6) : FAMILY_CADENCE_HOURS[family];
  const nextEligible = new Date(now.getTime() + retryHours * 3_600_000);

  const { data: existing } = await serviceClient
    .from("market_intelligence_search_cursor")
    .select("consecutive_empty_runs")
    .eq("business_id", businessId).eq("search_family", family).maybeSingle();

  await serviceClient.from("market_intelligence_search_cursor").upsert({
    business_id: businessId,
    search_family: family,
    last_run_at: now.toISOString(),
    next_eligible_at: nextEligible.toISOString(),
    last_run_status: runStatus,
    last_run_search_count: findingsAdded,
    consecutive_empty_runs: runStatus === "no_findings" ? (existing?.consecutive_empty_runs ?? 0) + 1 : 0,
    updated_at: now.toISOString(),
  }, { onConflict: "business_id,search_family" });
}

// deno-lint-ignore no-explicit-any
async function runFamily(
  serviceClient: any, businessId: string, facts: BusinessFacts,
  family: SearchFamily, queries: string[],
): Promise<number> {
  // ── Step 1: retrieval — Anthropic web search, fast tier ──────────────────
  const searchPrompt = `Search the web for real, current information on: ${queries.map((q) => `"${q}"`).join(" and ")}.
Business context (for relevance only — do not repeat this back): ${facts.businessName ?? "a business"}, industry: ${facts.category ?? "unspecified"}, location: ${facts.location ?? "unspecified"}.
Report what you actually find, plainly, with sources. If nothing meaningful turns up, say so — do not speculate or pad the answer.`;

  const searchResult = await callAI({
    feature: "market_intelligence_search",
    messages: [{ role: "user", content: searchPrompt }],
    userId: businessId,
    supabase: serviceClient,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: FAMILY_MAX_USES[family] }],
  });

  const citations = dedupeCitationsByUrl(searchResult.citations ?? []);
  if (!citations.length) return 0; // honest — nothing found, no findings fabricated

  // ── Step 2: structured pull — already done, citations ARE structured ─────
  // ── Step 3: classification — cheap fast-tier call, real judgment only ────
  const knownCompetitorNames = facts.competitors.map((c) => c.name);
  const classifyPrompt = `You are classifying real web search citations for a business's market intelligence feed. For EACH citation below, decide if it contains a genuinely meaningful, specific market signal for THIS business — discard generic, irrelevant, or vague results.

Business: ${facts.businessName ?? "unspecified"}, industry: ${facts.category ?? "unspecified"}, location: ${facts.location ?? "unspecified"}.
Known competitors: ${knownCompetitorNames.length ? knownCompetitorNames.join(", ") : "none known yet"}.
Search family: ${family}.

CITATIONS:
${citations.map((c, i) => `[${i}] "${c.title}" (${c.url})\nQuote: "${c.citedText}"`).join("\n\n")}

Return ONLY a JSON array, one object per citation index above, no prose, no markdown fences:
[{
  "index": <int>,
  "keep": <bool — true only if this is a genuinely meaningful, specific, business-relevant signal>,
  "category": "<one of: ${VALID_CATEGORIES.join("|")}>",
  "competitor_name": "<exact company name if this citation is specifically about a named competing business, else null — never invent a name not present in the citation>",
  "market_topic": "<short topic tag, e.g. 'UAE fitness apparel pricing', or null>",
  "title": "<a short, specific finding title, grounded in the quote>",
  "summary": "<one tightly grounded sentence paraphrasing the quote — never add claims beyond what the quote supports>"
}]
If keep is false, category/competitor_name/market_topic/title/summary may be minimal placeholders — they will be discarded.`;

  const classifyResult = await callAI({
    feature: "market_intelligence_classify",
    messages: [{ role: "user", content: classifyPrompt }],
    userId: businessId,
    supabase: serviceClient,
  });

  let candidates: ClassifiedCandidate[];
  try {
    const cleaned = classifyResult.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    candidates = JSON.parse(cleaned);
  } catch {
    console.error(`market-intelligence-refresh: failed to parse classify JSON for family "${family}"`, classifyResult.content.slice(0, 300));
    return 0; // fail closed — never persist unparsed/guessed data
  }

  let added = 0;
  for (const cand of candidates) {
    if (!cand.keep) continue;
    if (!VALID_CATEGORIES.includes(cand.category)) continue;
    const citation = citations[cand.index];
    if (!citation) continue;

    const persisted = await persistFinding(serviceClient, businessId, facts, family, queries[0] ?? "", citation, cand);
    if (persisted) added++;
  }
  return added;
}

function dedupeCitationsByUrl(citations: AICitation[]): AICitation[] {
  const seen = new Set<string>();
  const out: AICitation[] = [];
  for (const c of citations) {
    if (!c.url || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function persistFinding(
  serviceClient: any, businessId: string, facts: BusinessFacts,
  family: SearchFamily, searchQuery: string, citation: AICitation, cand: ClassifiedCandidate,
): Promise<boolean> {
  const now = new Date();
  const sourceDomain = normalizeDomain(citation.url);
  const category = cand.category;
  const dedupeKey = buildDedupeKey(category, citation.url, cand.title || citation.title);

  // ── Resolve competitor (confirmed match, or a new "potential" row) ───────
  let competitorId: string | null = null;
  let competitorDomain: string | null = null;
  if (cand.competitor_name) {
    const norm = cand.competitor_name.trim().toLowerCase();
    const confirmed = facts.competitors.find((c) =>
      c.name.toLowerCase() === norm || c.aliases.some((a) => a.toLowerCase() === norm));
    if (confirmed) {
      const { data: row } = await serviceClient
        .from("market_competitors").select("id, domain").eq("business_id", businessId).eq("name", confirmed.name).maybeSingle();
      competitorId = row?.id ?? null;
      competitorDomain = row?.domain ?? null;
    }
    // else: leave competitorId null here — a "potential" competitor row is
    // only created AFTER the finding exists (needs first_seen_finding_id),
    // handled below once we have the finding's id.
  }

  // ── Dedup check ────────────────────────────────────────────────────────
  const { data: existing } = await serviceClient
    .from("market_intelligence_findings")
    .select("id, status, source_url")
    .eq("business_id", businessId).eq("dedupe_key", dedupeKey).maybeSingle();

  const additionalSourceCount = existing
    ? (await serviceClient.from("market_intelligence_finding_sources").select("id", { count: "exact", head: true }).eq("finding_id", existing.id)).count ?? 0
    : 0;

  const confidence = computeConfidence({
    sourceDomain,
    businessOwnDomain: facts.website,
    competitorDomain,
    publishedAt: null, // Anthropic's page_age is a free-text string, not reliably parseable to a Date — treated as unknown-age (recencyScore's honest default) rather than guessed
    citedText: citation.citedText,
    additionalSourceCount,
    competitorMentionedName: cand.competitor_name,
    knownCompetitors: facts.competitors,
  });
  const relevance = computeRelevance({
    fromBusinessScopedQuery: true, // every query in this pipeline is business-scoped by construction
    competitorMatched: !!competitorId,
    locationMentioned: !!(facts.location && (cand.title + cand.summary).toLowerCase().includes(facts.location.toLowerCase())),
    keywordOverlapCount: [facts.category, facts.industry].filter((k) => k && (cand.title + cand.summary).toLowerCase().includes(k.toLowerCase())).length,
  });

  if (existing) {
    if (existing.source_url === citation.url) {
      // Same primary source re-fetched — bump fetched_at only.
      await serviceClient.from("market_intelligence_findings").update({
        fetched_at: now.toISOString(), stale_after: staleAfterFor(family, now).toISOString(), updated_at: now.toISOString(),
      }).eq("id", existing.id);
      return false; // not a new finding
    }
    if (existing.status === "active") {
      // Corroboration — a different source for the same story.
      await serviceClient.from("market_intelligence_finding_sources").upsert({
        finding_id: existing.id, business_id: businessId,
        source_url: citation.url, source_domain: sourceDomain, source_title: citation.title,
        cited_text: citation.citedText, fetched_at: now.toISOString(),
      }, { onConflict: "finding_id,source_url" });
      await serviceClient.from("market_intelligence_findings").update({
        confidence, updated_at: now.toISOString(),
      }).eq("id", existing.id);
      return false; // not a new finding row
    }
    // Reactivate a stale/archived finding with fresh evidence.
    await serviceClient.from("market_intelligence_findings").update({
      status: "active", summary: cand.summary || citation.citedText.slice(0, 300),
      evidence: citation.citedText, source_url: citation.url, source_domain: sourceDomain, source_title: citation.title,
      fetched_at: now.toISOString(), stale_after: staleAfterFor(family, now).toISOString(),
      confidence, relevance, updated_at: now.toISOString(),
    }).eq("id", existing.id);
    return true;
  }

  // ── New finding ────────────────────────────────────────────────────────
  const { data: inserted, error } = await serviceClient.from("market_intelligence_findings").insert({
    business_id: businessId,
    type: typeForCategory(category),
    category,
    title: cand.title || citation.title,
    summary: cand.summary || citation.citedText.slice(0, 300),
    evidence: citation.citedText,
    source_url: citation.url,
    source_domain: sourceDomain,
    source_title: citation.title,
    competitor_id: competitorId,
    market_topic: cand.market_topic,
    confidence, relevance,
    stale_after: staleAfterFor(family, now).toISOString(),
    search_family: family,
    search_query: searchQuery,
    raw_metadata: {},
    dedupe_key: dedupeKey,
  }).select("id").single();

  if (error || !inserted) {
    console.error("market-intelligence-refresh: insert failed", error);
    return false;
  }

  // A named competitor that isn't in the confirmed list — create a
  // "potential" competitor row, tied to this exact finding as its evidence.
  // Never a bare guess: it only exists because a real, cited finding named it.
  if (cand.competitor_name && !competitorId) {
    const entityConfidence = entityMatchScore(cand.competitor_name, facts.competitors);
    if (entityConfidence < 1.0) { // not already an exact-match confirmed competitor
      const { data: potential } = await serviceClient.from("market_competitors").upsert({
        business_id: businessId, name: cand.competitor_name.trim(), status: "potential",
        source: "finding_discovered", confidence: entityConfidence, first_seen_finding_id: inserted.id,
        updated_at: now.toISOString(),
      }, { onConflict: "business_id,name" }).select("id").maybeSingle();
      if (potential?.id) {
        await serviceClient.from("market_intelligence_findings").update({ competitor_id: potential.id }).eq("id", inserted.id);
      }
    }
  }

  return true;
}

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    const isCronCall = !!serviceKey && authHeader.replace(/^Bearer\s+/i, "") === serviceKey;

    if (isCronCall) {
      // ── Cron mode: loop every business with real signal ──────────────────
      const [{ data: brandBusinesses }, { data: campaignBusinesses }] = await Promise.all([
        serviceClient.from("brand_knowledge").select("business_user_id"),
        serviceClient.from("campaigns").select("user_id"),
      ]);
      const businessIds = Array.from(new Set([
        ...(brandBusinesses ?? []).map((b: { business_user_id: string }) => b.business_user_id),
        ...(campaignBusinesses ?? []).map((c: { user_id: string }) => c.user_id),
      ]));

      const results = [];
      for (const businessId of businessIds) {
        try {
          // 3 (not 5) per business per cron tick — real E2E testing showed a
          // single invocation processing multiple businesses at 5 families
          // each can approach the edge function's execution time ceiling
          // (search+classify against real web results is not fast). Smaller
          // batches per tick, same hourly cadence, picks up the remainder
          // next tick — never lossy, just spread over more ticks.
          const r = await runPipeline(serviceClient, businessId, 3);
          results.push({ business_id: businessId, ...r });
        } catch (e) {
          console.error(`market-intelligence-refresh cron: business ${businessId} failed:`, e);
          results.push({ business_id: businessId, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return jsonOk({ mode: "cron", businesses_processed: businessIds.length, results }, req);
    }

    // ── Manual mode: the caller's own business account ─────────────────────
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    let user: { id: string };
    try {
      user = await requireAuth(req, authClient);
    } catch (e) {
      if (e instanceof AuthError) return jsonErr(e.message, req, 401);
      throw e;
    }

    if (isRateLimited(`market-intelligence-refresh:${user.id}`, STRICT_AI_RATE)) {
      return jsonErr("Too many requests. Please wait a moment before refreshing again.", req, 429);
    }

    const { data: profile } = await serviceClient
      .from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle();
    const isBusiness = profile?.account_type === "brand" || profile?.account_type === "business" || profile?.account_type === "agency"
      || profile?.onboarding_path === "business_creator" || profile?.onboarding_path === "business_marketing";
    if (!isBusiness) return jsonErr("Market Intelligence is available for business accounts.", req, 403);

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

    const result = await runPipeline(serviceClient, user.id, 3);
    return jsonOk({ mode: "manual", ...result }, req);

  } catch (err) {
    console.error("market-intelligence-refresh error:", err);
    return jsonErr(err instanceof Error ? err.message : "Failed to refresh market intelligence.", req, 500);
  }
});
