// ─────────────────────────────────────────────────────────────────────────────
// marketing-hub-briefing
//
// The Marketing Hub's core: aggregates a business's real data across every
// existing module (campaigns, applications, contracts, deliverables, match
// outcomes, trust score, messages, content calendar, brand knowledge) and
// asks MRKT AI to turn it into a structured strategic briefing — business
// health, a per-department report (the "AI Marketing Team"), weekly
// priorities, growth opportunities, campaign suggestions, performance
// highlights, and (only when the business has named competitors in Brand
// Knowledge) AI competitive-positioning notes.
//
// Cached per (user, day) in marketing_hub_briefings so repeat visits are free;
// pass { force_refresh: true } to regenerate. Deterministic "action center"
// facts are computed fresh every call regardless of cache (never stale).
//
// On every fresh generation, weekly_priorities / opportunities /
// campaign_suggestions are ALSO fanned out into individual rows in the
// (previously unused) ai_recommendations table — that's what makes the
// Marketing Hub's task cards individually dismissible/completable without a
// second edge function: the client reads/updates ai_recommendations directly
// via its existing owner RLS policy.
//
// Also returns `campaigns` — real per-campaign summaries (status, budget,
// application counts, contract status, a deterministic "next best action")
// for the Campaign Center section. Like action_center, this is always fresh
// and deterministic — never part of the cached AI `briefing` blob, and costs
// no extra AI call (pure reshaping of data already fetched below).
//
// POST /functions/v1/marketing-hub-briefing
// Body: { force_refresh?: boolean }
// Returns: { briefing, action_center, campaigns, recommendations, generated_at, cached }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isRateLimited, STRICT_AI_RATE, requireAuth, jsonOk, jsonErr, AuthError } from "../_shared/security.ts";
import { callAI } from "../_shared/router.ts";
import { computeBusinessAnalytics } from "../_shared/analytics.ts";

const CREDIT_COST = 10; // matches CREDIT_COST.growth_strategy / profile_audit in src/lib/aiCredits.ts — same "deep intelligence" tier

type Department = "strategy" | "content" | "brand" | "growth" | "analytics";
type BriefingItem = {
  title: string; why: string; action: string; link: string;
  priority: "high" | "medium" | "low"; department?: Department;
};
type Briefing = {
  health:               { score: number; summary: string };
  departments:          Partial<Record<Department, string>>;
  weekly_priorities:    BriefingItem[];
  opportunities:        BriefingItem[];
  campaign_suggestions: BriefingItem[];
  performance_highlights: string[];
  competitor_notes:    BriefingItem[] | null;
};

// recommendation_type mirrors the section an item came from; kept distinct
// from `department` (which department "owns" the item for the org chart).
const TYPE_FOR_SECTION = {
  weekly_priorities: "action",
  opportunities:     "opportunity",
  campaign_suggestions: "campaign",
} as const;

function todayPeriodStart(): string {
  return new Date().toISOString().slice(0, 10);
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

    if (isRateLimited(`marketing-hub-briefing:${user.id}`, STRICT_AI_RATE)) {
      return jsonErr("Too many requests. Please wait a moment before refreshing again.", req, 429);
    }

    const body = await req.json().catch(() => ({})) as { force_refresh?: boolean };
    const periodStart = todayPeriodStart();

    // ── Business-only ────────────────────────────────────────────────────────
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("account_type, onboarding_path, name")
      .eq("id", user.id)
      .maybeSingle();
    const isBusiness = profile?.account_type === "brand" || profile?.account_type === "business" || profile?.account_type === "agency"
      || profile?.onboarding_path === "business_creator" || profile?.onboarding_path === "business_marketing";
    if (!isBusiness) return jsonErr("Marketing Hub is available for business accounts.", req, 403);

    // ── Always-fresh deterministic aggregation (action center + AI input) ────
    // Cross-business metrics (win/rehire rate, etc.) now come from the shared
    // Analytics Engine (_shared/analytics.ts) — the single source of truth
    // every future Marketing Hub section reads from — rather than being
    // computed inline here a second time.
    const [
      analytics,
      { data: campaigns },
      { data: brand },
      { data: businessIntel },
      { data: contracts },
      { data: deliverables },
      { data: convos },
      { data: upcomingContent },
    ] = await Promise.all([
      computeBusinessAnalytics(serviceClient, user.id),
      serviceClient.from("campaigns")
        .select("id, title, status, is_published, compensation_type, compensation_amount_fixed, compensation_budget_min, compensation_budget_max, deadline, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
      serviceClient.from("brand_knowledge").select("*").eq("business_user_id", user.id).maybeSingle(),
      serviceClient.from("business_intelligence").select("*").eq("user_id", user.id).maybeSingle(),
      serviceClient.from("contracts")
        .select("id, campaign_id, status, campaign_title, sent_at, accepted_at").eq("business_id", user.id)
        .order("created_at", { ascending: false }).limit(50),
      serviceClient.from("campaign_deliverable_submissions")
        .select("id, status, submitted_at").eq("business_id", user.id).limit(200),
      serviceClient.from("conversation_participants")
        .select("unread_count").eq("user_id", user.id).gt("unread_count", 0),
      serviceClient.from("content_planner_items")
        .select("title, platform, content_type, scheduled_date, status")
        .eq("user_id", user.id)
        .gte("scheduled_date", periodStart)
        .lte("scheduled_date", new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
        .order("scheduled_date", { ascending: true }),
    ]);

    let applicationCounts: Record<string, number> = {};
    const perCampaignApps: Record<string, Record<string, number>> = {};
    const campaignIds = (campaigns ?? []).map((c) => c.id);
    if (campaignIds.length > 0) {
      const { data: apps } = await serviceClient
        .from("campaign_applications").select("campaign_id, status").in("campaign_id", campaignIds);
      applicationCounts = (apps ?? []).reduce((acc: Record<string, number>, a) => {
        acc[a.status] = (acc[a.status] ?? 0) + 1;
        return acc;
      }, {});
      for (const a of apps ?? []) {
        (perCampaignApps[a.campaign_id] ??= {})[a.status] = (perCampaignApps[a.campaign_id]?.[a.status] ?? 0) + 1;
      }
    }

    // Per-campaign contract status — real signal, no fabrication: a campaign
    // has a contract sent-but-unsigned, one accepted, or none at all.
    const perCampaignContractStatus: Record<string, "awaiting_signature" | "signed"> = {};
    for (const c of contracts ?? []) {
      if (!c.campaign_id) continue;
      if (c.status === "accepted") perCampaignContractStatus[c.campaign_id] = "signed";
      else if (c.status === "sent" && perCampaignContractStatus[c.campaign_id] !== "signed") perCampaignContractStatus[c.campaign_id] = "awaiting_signature";
    }

    // Deterministic per-campaign "next best action" — no AI call, just the
    // same kind of real-count logic action_center already uses.
    function nextActionFor(campaignId: string, deadline: string | null, status: string): string {
      const a = perCampaignApps[campaignId] ?? {};
      const pending = a["pending"] ?? 0;
      if (pending > 0) return `${pending} applicant${pending === 1 ? "" : "s"} awaiting review`;
      if (perCampaignContractStatus[campaignId] === "awaiting_signature") return "Contract sent — awaiting signature";
      const daysLeft = deadline ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000) : null;
      if (status === "active" && daysLeft !== null && daysLeft <= 3 && daysLeft >= 0) return `Deadline in ${daysLeft} day${daysLeft === 1 ? "" : "s"} — consider promoting`;
      if (status === "active" && Object.keys(a).length === 0) return "No applicants yet — check visibility";
      if (status === "draft") return "Not yet published";
      return "On track — no action needed";
    }

    const campaignSummaries = (campaigns ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      deadline: c.deadline,
      compensation_type: c.compensation_type,
      budget_min: c.compensation_budget_min,
      budget_max: c.compensation_budget_max,
      amount_fixed: c.compensation_amount_fixed,
      applications: {
        pending:     perCampaignApps[c.id]?.["pending"] ?? 0,
        reviewing:   perCampaignApps[c.id]?.["reviewing"] ?? 0,
        shortlisted: perCampaignApps[c.id]?.["shortlisted"] ?? 0,
        accepted:    perCampaignApps[c.id]?.["accepted"] ?? 0,
        rejected:    perCampaignApps[c.id]?.["rejected"] ?? 0,
      },
      contract_status: perCampaignContractStatus[c.id] ?? "none",
      next_action: nextActionFor(c.id, c.deadline, c.status),
    }));

    const activeCampaigns    = (campaigns ?? []).filter((c) => c.status === "active");
    const pendingApplications = applicationCounts["pending"] ?? 0;
    const pendingDeliverables = (deliverables ?? []).filter((d) => d.status === "submitted").length;
    const unreadMessages      = (convos ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);
    const contractsAwaiting   = (contracts ?? []).filter((c) => c.status === "sent").length;

    // Deterministic action center — always accurate, never depends on the AI call.
    const actionCenter = [
      pendingApplications > 0 && { label: `${pendingApplications} new applicant${pendingApplications === 1 ? "" : "s"} awaiting review`, link: "/pipeline" },
      pendingDeliverables > 0 && { label: `${pendingDeliverables} deliverable${pendingDeliverables === 1 ? "" : "s"} submitted for approval`, link: "/deliverables" },
      unreadMessages > 0 && { label: `${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}`, link: "/messages" },
      contractsAwaiting > 0 && { label: `${contractsAwaiting} contract${contractsAwaiting === 1 ? "" : "s"} sent, awaiting signature`, link: "/contracts" },
    ].filter(Boolean);

    // Current recommendation cards for today, respecting any dismiss/complete
    // the user has already done — read fresh on every call regardless of
    // briefing cache state, so a cached page load never resurrects a
    // dismissed card.
    const fetchRecommendations = async () => {
      const { data } = await serviceClient
        .from("ai_recommendations")
        .select("id, recommendation_type, title, explanation, action, priority, status, meta")
        .eq("user_id", user.id)
        .eq("source", "ai_strategist")
        .eq("status", "active")
        .contains("meta", { period_start: periodStart })
        .order("created_at", { ascending: true });
      return data ?? [];
    };

    // ── Cache check ────────────────────────────────────────────────────────
    if (!body.force_refresh) {
      const { data: cached } = await serviceClient
        .from("marketing_hub_briefings").select("*")
        .eq("user_id", user.id).eq("period_start", periodStart).maybeSingle();
      if (cached) {
        const recommendations = await fetchRecommendations();
        return jsonOk({ briefing: cached.briefing, action_center: actionCenter, campaigns: campaignSummaries, recommendations, generated_at: cached.generated_at, cached: true }, req);
      }
    }

    // ── Credit gate (fails closed, mirrors content-plan-generate) ────────────
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

    // ── Build prompt from real, aggregated data ──────────────────────────────
    const competitors = brand?.competitors?.trim();
    const facts: string[] = [
      `Business: ${brand?.brand_description?.slice(0, 200) ?? businessIntel?.company_name ?? profile?.name ?? "This business"} (industry: ${businessIntel?.industry ?? "unspecified"})`,
      `Trust score: ${businessIntel?.trust_score ?? "not yet computed"} (tier: ${businessIntel?.trust_tier ?? "new"})`,
      `Campaigns: ${campaigns?.length ?? 0} total, ${activeCampaigns.length} active`,
      `Applications: ${Object.entries(applicationCounts).map(([s, n]) => `${n} ${s}`).join(", ") || "none yet"}`,
      `Contracts: ${contracts?.length ?? 0} total, ${contractsAwaiting} awaiting signature`,
      `Deliverables awaiting review: ${pendingDeliverables}`,
      analytics.matchWinRate ? `Creator-match acceptance rate: ${analytics.matchWinRate.evidence}` : "No match-outcome history yet",
      analytics.rehireRate ? `Rehire rate: ${analytics.rehireRate.evidence}` : "",
      `Unread messages: ${unreadMessages}`,
      `Upcoming content (14d): ${(upcomingContent ?? []).length} scheduled pieces`,
      brand?.target_audience ? `Target audience: ${brand.target_audience.slice(0, 200)}` : "",
      brand?.marketing_goals ? `Stated marketing goals: ${brand.marketing_goals.slice(0, 200)}` : "",
      brand?.marketing_budget_range ? `Marketing budget: ${brand.marketing_budget_range}` : "",
      brand?.current_marketing_challenges ? `Current challenges: ${brand.current_marketing_challenges.slice(0, 200)}` : "",
      brand?.preferred_growth_channels ? `Preferred growth channels: ${brand.preferred_growth_channels}` : "",
      competitors ? `Named competitors: ${competitors}` : "",
    ].filter(Boolean);

    const prompt = `You are the AI Marketing Team for a business on MRKT, producing today's briefing. Use ONLY the facts below — never invent numbers. You are writing AS the team — each department block should read like that specialist reporting in, not like a generic AI answer.

FACTS:
${facts.map((f) => `- ${f}`).join("\n")}

Return ONLY valid JSON, no prose, no markdown fences, matching exactly this shape:
{
  "health": { "score": <0-100 integer, your holistic assessment>, "summary": "<one sharp sentence>" },
  "departments": {
    "strategy":  "<2-3 sentences, the AI Marketing Strategist reporting on overall direction and what matters most right now>",
    "content":   "<2-3 sentences, the AI Content Manager reporting on the content calendar and posting cadence>",
    "brand":     "<2-3 sentences, the AI Brand Manager reporting on brand knowledge completeness and positioning>",
    "growth":    "<2-3 sentences, the AI Growth lead reporting on trust score and pipeline momentum>",
    "analytics": "<2-3 sentences, the AI Analytics lead reporting on campaign/creator-match performance so far>"
  },
  "weekly_priorities": [ { "title": "...", "why": "...", "action": "...", "link": "/campaigns|/pipeline|/find-creators|/content-planner|/messages|/chat", "priority": "high|medium|low", "department": "strategy|content|brand|growth|analytics" } ] (3-4 items),
  "opportunities": [ same item shape incl. department ] (2-3 items, growth-oriented),
  "campaign_suggestions": [ same item shape incl. department ] (1-2 items, only if genuinely warranted by the facts — omit rather than pad),
  "performance_highlights": [ "<short factual sentence>", ... ] (1-3 items, only real positives from the facts — empty array if none),
  "competitor_notes": ${competitors ? `[ same item shape incl. department ] (1-3 items reasoning about positioning against: ${competitors})` : "null"}
}
Every "why" must cite a specific fact above. Every department block must also cite a specific fact — if there's nothing real to report for a department (e.g. zero campaigns), say that plainly rather than filling space. Never generic ("post more content"). Tone: senior marketing team, direct, executive — confident, not chatty.`;

    let result;
    try {
      result = await callAI({
        feature: "marketing_hub_briefing",
        messages: [{ role: "user", content: prompt }],
        userId: user.id,
        supabase: serviceClient,
      });
    } catch (aiErr) {
      console.error("marketing-hub-briefing AI call failed:", aiErr);
      return jsonErr("MRKT AI is temporarily unavailable. Please try again shortly.", req, 503);
    }

    const cleaned = result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    let briefing: Briefing;
    try {
      briefing = JSON.parse(cleaned);
    } catch {
      console.error("marketing-hub-briefing: failed to parse AI JSON:", cleaned.slice(0, 500));
      return jsonErr("MRKT AI returned an unexpected response. Please try again.", req, 502);
    }

    const generatedAt = new Date().toISOString();
    await serviceClient.from("marketing_hub_briefings").upsert({
      user_id:      user.id,
      period_start: periodStart,
      briefing,
      model:        result.model,
      provider:     result.provider,
      generated_at: generatedAt,
    }, { onConflict: "user_id,period_start" });

    // ── Fan out into ai_recommendations — one row per actionable item ────────
    // Clear out today's previous AI-strategist rows first (only ones still
    // 'active' — a user's dismiss/complete choice is never touched) so a
    // force-refresh doesn't accumulate duplicates alongside the new set.
    await serviceClient
      .from("ai_recommendations")
      .delete()
      .eq("user_id", user.id)
      .eq("source", "ai_strategist")
      .eq("status", "active")
      .contains("meta", { period_start: periodStart });

    const newRows = (["weekly_priorities", "opportunities", "campaign_suggestions"] as const)
      .flatMap((section) => (briefing[section] ?? []).map((item) => ({
        user_id:            user.id,
        recommendation_type: TYPE_FOR_SECTION[section],
        title:               item.title,
        explanation:          item.why,
        action:               item.action,
        priority:             item.priority,
        status:               "active",
        source:               "ai_strategist",
        meta:                 { link: item.link, department: item.department ?? null, period_start: periodStart },
      })));

    if (newRows.length > 0) {
      await serviceClient.from("ai_recommendations").insert(newRows);
    }

    const recommendations = await fetchRecommendations();

    return jsonOk({ briefing, action_center: actionCenter, campaigns: campaignSummaries, recommendations, generated_at: generatedAt, cached: false }, req);

  } catch (err) {
    console.error("marketing-hub-briefing error:", err);
    return jsonErr(err instanceof Error ? err.message : "Failed to generate briefing.", req, 500);
  }
});
