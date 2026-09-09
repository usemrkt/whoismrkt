// ─────────────────────────────────────────────────────────────────────────────
// cmo-create-mission (Phase N)
//
// The CMO's command interface: takes a business owner's natural-language
// objective ("Our bookings are down this month, fix it") and turns it into a
// real, persisted Mission — a strategy summary plus a dependency-ordered task
// list assigned to specific agents, each task bound to exactly one tool from
// the reviewed registry in _shared/missionTools.ts. The AI never picks or
// invents an action outside that registry: the response is schema-validated
// (MissionPlanSchema) and the call fails closed on any mismatch — no
// partially-applied mission is ever created from unparsed model output.
//
// 'safe' tasks with no unmet dependencies are inserted 'ready' and will be
// picked up by mission-task-runner on its next tick (nudged immediately
// below, best-effort). 'sensitive' tasks always stop for a human approval —
// see open_pending_sensitive_approvals(), called here so approvals for a
// dependency-free sensitive step appear immediately rather than waiting for
// the next cron tick.
//
// POST /functions/v1/cmo-create-mission
// Body: { objective: string }
// Returns: { mission, tasks }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isRateLimited, STRICT_AI_RATE, requireAuth, jsonOk, jsonErr, AuthError, sanitizeString } from "../_shared/security.ts";
import { callAI } from "../_shared/router.ts";
import { wrapUntrustedBlock, withTrustBoundaryGuard } from "../_shared/promptSafety.ts";
import { consumeCredits, refundCredits } from "../_shared/metering.ts";
import { parseStructuredResponse, logValidationFailure } from "../_shared/structuredParser.ts";
import { MissionPlanSchema, type MissionPlan } from "../_shared/missionSchemas.ts";
import { TOOL_REGISTRY } from "../_shared/missionTools.ts";
import { buildMissionTaskRows } from "../_shared/missionPlan.ts";
import { AGENT_KEYS } from "../_shared/agentRegistry.ts";
import { getBusinessBrainContext, formatBusinessBrainForPrompt } from "../_shared/businessBrain.ts";

const CREDIT_COST = 8; // between marketing_hub_briefing (10) and a single content-gen call — one planning call, no research attached yet

const PLANNER_PERSONA = withTrustBoundaryGuard(
  `You are the MRKT CMO — the strategic lead of a business's AI marketing team. Given a business owner's objective, you decompose it into a short, dependency-ordered plan executed by named specialist agents, each step using exactly one named tool. You never invent a tool, agent, or action outside the lists provided. You output ONLY the JSON object described — no prose, no markdown fences.`
);

function toolCatalogForPrompt(): string {
  return Object.values(TOOL_REGISTRY)
    .map((t) => `- "${t.name}" (agent: ${t.agentKey}, risk: ${t.riskLevel}${t.hasExecutor ? "" : ", PREPARE-ONLY — never actually executes, only records what you'd need to do yourself"}): ${t.description}`)
    .join("\n");
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

    if (isRateLimited(`cmo-create-mission:${user.id}`, STRICT_AI_RATE)) {
      return jsonErr("Too many requests. Please wait a moment before starting another Mission.", req, 429);
    }

    // ── Business-only (same gate as every other Marketing Hub surface) ─────
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("account_type, onboarding_path")
      .eq("id", user.id)
      .maybeSingle();
    const isBusiness = profile?.account_type === "brand" || profile?.account_type === "business" || profile?.account_type === "agency"
      || profile?.onboarding_path === "business_creator" || profile?.onboarding_path === "business_marketing";
    if (!isBusiness) return jsonErr("Missions are available for business accounts.", req, 403);

    const body = await req.json().catch(() => ({})) as { objective?: string; source_recommendation_id?: string };
    const objective = sanitizeString(body.objective ?? "", 2000).trim();
    if (objective.length < 8) {
      return jsonErr("Describe the outcome you want in a bit more detail.", req, 400);
    }

    // Phase P — "Start Mission" from a Proposed Mission card passes this
    // through. Ownership is verified before it's trusted for anything (a
    // spoofed/foreign id here must never let this Mission masquerade as
    // this business's own recommendation, or convert someone else's card).
    let sourceRecommendationId: string | null = null;
    if (typeof body.source_recommendation_id === "string" && body.source_recommendation_id) {
      const { data: rec } = await serviceClient
        .from("ai_recommendations").select("id").eq("id", body.source_recommendation_id).eq("user_id", user.id).maybeSingle();
      if (rec) sourceRecommendationId = rec.id;
    }

    // Ensure an autonomy policy row exists (defaults: level 2, safe tasks
    // auto-execute) — never overwrites an existing, possibly-tightened row.
    // If this fails, safe tasks simply won't auto-execute until it's fixed
    // (claim_ready_mission_tasks requires a matching row) — logged so that
    // degradation is visible rather than a silently-stalled Mission.
    const { error: policyErr } = await serviceClient.from("business_autonomy_policy")
      .upsert({ business_id: user.id }, { onConflict: "business_id", ignoreDuplicates: true });
    if (policyErr) console.error("[cmo-create-mission] business_autonomy_policy upsert failed:", user.id, policyErr);

    let brainCtx;
    try {
      brainCtx = await getBusinessBrainContext(serviceClient, user.id, "cmo");
    } catch (e) {
      console.error("[cmo-create-mission] Business Brain context load failed:", e);
      return jsonErr("Couldn't load your business context. Please try again shortly.", req, 502);
    }

    const { allowed, remaining } = await consumeCredits(serviceClient, user.id, CREDIT_COST);
    if (!allowed) {
      return jsonErr(`Not enough AI credits for Mission planning (need ${CREDIT_COST}, have ${remaining}).`, req, 402);
    }

    const prompt = `${wrapUntrustedBlock("business_objective", objective)}

${wrapUntrustedBlock("business_context", formatBusinessBrainForPrompt(brainCtx))}

Available agents (use these exact keys for "agent_key"): ${AGENT_KEYS.join(", ")}.

Available tools (use these exact names for "tool", one per task):
${toolCatalogForPrompt()}

Return ONLY this JSON shape:
{
  "objective_summary": string (<=300 chars, restate the goal plainly),
  "priority": "critical"|"high"|"medium"|"low",
  "target_metrics": [{"name": string, "target": string}] (0-5 items, omit if genuinely unclear),
  "strategy_summary": string (<=1500 chars, the actual plan of attack),
  "tasks": [
    {
      "tool": one of the tool names above,
      "agent_key": one of the agent keys above,
      "title": string (<=140 chars, plain description of this step),
      "input": object (small, tool-relevant hints only, may be empty),
      "depends_on_index": [array of 0-based indices into this SAME tasks array, earlier tasks only]
    }
  ] (1-10 items, ordered so dependencies come before dependents)
}

Build a realistic sequence: gather_context and/or build_strategy first if useful, then concrete artifacts (draft_campaign, draft_content_ideas, draft_outreach_copy, meta_prepare_campaign_plan) that depend on the strategy step, and only include a PREPARE-ONLY tool (invite_creator_to_campaign, launch_campaign, request_paid_promotion) as a final step representing what the business owner will need to approve or do themselves — never as the only step. If the objective is specifically about Facebook/Instagram/Meta advertising, delegate that work to agent_key "meta_ads" (the Meta Ads Specialist) using tool "meta_prepare_campaign_plan" — never use the generic "performance" agent for Meta-specific campaign planning.`;

    let aiResult;
    try {
      aiResult = await callAI({
        feature: "mission_planning",
        messages: [{ role: "user", content: prompt }],
        systemPrompt: PLANNER_PERSONA,
        userId: user.id,
        supabase: serviceClient,
      });
    } catch (e) {
      await refundCredits(serviceClient, user.id, CREDIT_COST);
      console.error("[cmo-create-mission] callAI failed:", e);
      return jsonErr("MRKT AI couldn't build a plan right now. Please try again shortly.", req, 502);
    }

    const parsed = parseStructuredResponse<MissionPlan>(aiResult.content, MissionPlanSchema, "MissionPlan.v1");
    if (!parsed.success) {
      await refundCredits(serviceClient, user.id, CREDIT_COST);
      logValidationFailure({ feature: "mission_planning", model: aiResult.model, userId: user.id }, parsed);
      return jsonErr("MRKT AI couldn't build a valid plan for that objective — try rephrasing it more specifically.", req, 502);
    }

    const plan = parsed.data;

    const { data: mission, error: missionErr } = await serviceClient
      .from("missions")
      .insert({
        business_id: user.id,
        objective,
        objective_summary: plan.objective_summary,
        priority: plan.priority,
        target_metrics: plan.target_metrics,
        strategy_summary: plan.strategy_summary,
        created_by: user.id,
        status: "planning",
        source_recommendation_id: sourceRecommendationId,
      })
      .select()
      .single();

    if (missionErr || !mission) {
      await refundCredits(serviceClient, user.id, CREDIT_COST);
      console.error("[cmo-create-mission] mission insert failed:", missionErr);
      return jsonErr("Couldn't save the Mission. Please try again.", req, 500);
    }

    // Best-effort lineage close-out — a failure here never invalidates the
    // Mission itself (already created and valid); it just means the source
    // recommendation card keeps showing as active instead of converted.
    //
    // status='completed' (NOT 'converted') — ai_recommendations' pre-existing
    // CHECK constraint (from 20260615200000_launch_readiness.sql, predating
    // Phase N/O/P) only allows 'active'|'dismissed'|'completed'. 'completed'
    // is the right existing value here: this recommendation's job — becoming
    // a Mission — is done. `converted_to_mission_id` (Phase P's own column)
    // is what actually distinguishes "completed by conversion" from any
    // other way a recommendation reaches 'completed'.
    if (sourceRecommendationId) {
      const { error: convertErr } = await serviceClient.from("ai_recommendations")
        .update({ status: "completed", is_done: true, converted_to_mission_id: mission.id })
        .eq("id", sourceRecommendationId).eq("user_id", user.id);
      if (convertErr) console.error("[cmo-create-mission] recommendation conversion update failed:", convertErr);
    }

    const taskIds = plan.tasks.map(() => crypto.randomUUID());
    const taskRows = buildMissionTaskRows(plan, user.id, mission.id, taskIds);

    const { error: tasksErr } = await serviceClient.from("mission_tasks").insert(taskRows);
    if (tasksErr) {
      console.error("[cmo-create-mission] task insert failed:", tasksErr);
      await serviceClient.from("missions").update({ status: "failed" }).eq("id", mission.id);
      await refundCredits(serviceClient, user.id, CREDIT_COST);
      return jsonErr("Couldn't save the Mission's tasks. Please try again.", req, 500);
    }

    const { error: eventErr } = await serviceClient.from("mission_events").insert({
      mission_id: mission.id, business_id: user.id, event_type: "mission_created", actor: "agent:cmo",
      message: `Mission created: ${plan.objective_summary}`, payload: { task_count: taskRows.length },
    });
    if (eventErr) console.error("[cmo-create-mission] mission_created event insert failed (mission itself is still valid):", eventErr);

    // Settle the graph immediately (promotes anything already satisfied, and
    // marks the mission 'active') and open any dependency-free sensitive
    // approvals right away rather than waiting for the next cron tick. Both
    // are self-healing if this call fails — the cron's own tick runs the
    // same two functions every minute regardless — logged for observability.
    const { error: advanceErr } = await serviceClient.rpc("advance_mission_task_graph", { p_mission_id: mission.id });
    if (advanceErr) console.error("[cmo-create-mission] advance_mission_task_graph failed (cron will retry next tick):", advanceErr);
    const { error: openErr } = await serviceClient.rpc("open_pending_sensitive_approvals");
    if (openErr) console.error("[cmo-create-mission] open_pending_sensitive_approvals failed (cron will retry next tick):", openErr);

    // Best-effort nudge so a business doesn't wait for the next cron tick to
    // see the first task move — the cron schedule is the real guarantee,
    // this just improves perceived latency. Never blocks the response.
    fetch(`${supabaseUrl}/functions/v1/mission-task-runner`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ trigger: "mission_created" }),
    }).catch(() => {});

    const { data: tasks } = await serviceClient.from("mission_tasks").select("*").eq("mission_id", mission.id).order("order_index");

    return jsonOk({ mission, tasks: tasks ?? [] }, req);
  } catch (e) {
    console.error("[cmo-create-mission] unhandled error:", e);
    return jsonErr("Something went wrong creating your Mission.", req, 500);
  }
});
