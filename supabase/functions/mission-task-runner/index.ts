// ─────────────────────────────────────────────────────────────────────────────
// mission-task-runner (Phase N)
//
// The Mission execution engine's worker tick. Internal-only (requireServiceRole)
// — invoked by the Phase N cron every minute, and best-effort-nudged by
// cmo-create-mission right after a Mission is created. Never invoked directly
// by a client.
//
// Each tick:
//   1. Reclaims any expired task leases (a worker that died mid-task).
//   2. Opens approvals for any newly-ready 'sensitive' tasks (never executes
//      them — see missionTools.ts's hard safe/sensitive split).
//   3. Atomically claims a small, bounded batch of 'ready' tasks — either
//      'safe' tasks auto-executing for the first time, or 'sensitive' tasks
//      that already carry a human approval (claim_ready_mission_tasks
//      enforces both rules; nothing here can bypass them).
//   4. Executes each claimed task through its tool's real logic, or — for an
//      approved 'sensitive' task with no executor — records an honest
//      "prepared, not executed" result. One task's failure never touches
//      any other task or mission (spec §16): every executor is isolated in
//      its own try/catch, completing via complete_mission_task's
//      idempotent, lease-checked write.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonOk, jsonErr, AuthError, requireServiceRole } from "../_shared/security.ts";
import { callAI } from "../_shared/router.ts";
import { wrapUntrustedBlock, withTrustBoundaryGuard } from "../_shared/promptSafety.ts";
import { checkAutomatedBudget } from "../_shared/metering.ts";
import { parseStructuredResponse, logValidationFailure } from "../_shared/structuredParser.ts";
import {
  StrategyOutputSchema, CampaignDraftOutputSchema, ContentIdeasOutputSchema, OutreachCopyOutputSchema,
} from "../_shared/missionSchemas.ts";
import { toolDef, type ToolName } from "../_shared/missionTools.ts";
import { getBusinessBrainContext, formatBusinessBrainForPrompt } from "../_shared/businessBrain.ts";
import { processMissionLearnings } from "../_shared/missionLearning.ts";

const BUDGET_FEATURE = "mission_task";
const CLAIM_LIMIT = 5;

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
// deno-lint-ignore no-explicit-any
type MissionTaskRow = any;

const MISSION_PERSONA = withTrustBoundaryGuard(
  `You are a specialist on a business's AI marketing team, completing exactly one assigned step of a larger Mission. Follow the instructions literally, stay tightly scoped to this one step, and output ONLY the requested JSON — no prose, no markdown fences.`
);

async function siblingOutput(supabase: SupabaseClient, missionId: string, tool: string): Promise<unknown | null> {
  const { data } = await supabase
    .from("mission_tasks").select("output_data")
    .eq("mission_id", missionId).eq("tool_name", tool).eq("status", "completed")
    .order("completed_at", { ascending: false }).limit(1).maybeSingle();
  return data?.output_data ?? null;
}

async function missionObjective(supabase: SupabaseClient, missionId: string): Promise<{ objective: string; objective_summary: string | null }> {
  const { data } = await supabase.from("missions").select("objective, objective_summary").eq("id", missionId).single();
  return data ?? { objective: "", objective_summary: null };
}

// ── Safe-tool executors — each returns the validated output to persist, or
// throws (caller records the failure and lets the standard retry/backoff in
// complete_mission_task handle it). None of these ever touch a table outside
// what its own tool description promises. ──────────────────────────────────

// Business Brain is now the single source for canonical + evolving context
// (Phase O) — this tool's own job shrinks to "confirm the Brain loaded and
// hand its CMO-purpose view forward" rather than assembling reads itself.
// Zero AI cost, unchanged from Phase N.
async function execGatherContext(supabase: SupabaseClient, task: MissionTaskRow) {
  const ctx = await getBusinessBrainContext(supabase, task.business_id, "cmo");
  return {
    brand_knowledge: ctx.brand,
    marketing_health_score: ctx.recentHealthScore,
    recent_findings: ctx.recentFindings,
    constraints: ctx.constraints.map((c) => c.statement),
    business_facts_considered: ctx.facts.length,
    unavailable_sources: ctx.unavailableSources,
  };
}

async function execBuildStrategy(supabase: SupabaseClient, task: MissionTaskRow) {
  const [brain, mission] = await Promise.all([
    getBusinessBrainContext(supabase, task.business_id, "cmo"),
    missionObjective(supabase, task.mission_id),
  ]);
  const prompt = `Mission objective: ${wrapUntrustedBlock("objective", mission.objective)}

${wrapUntrustedBlock("business_context", formatBusinessBrainForPrompt(brain))}

This step: ${wrapUntrustedBlock("step_instructions", task.title)}${task.input_data && Object.keys(task.input_data).length ? `\nStep hints: ${wrapUntrustedBlock("step_input", JSON.stringify(task.input_data))}` : ""}

Return ONLY: { "headline": string, "pillars": string[] (1-6), "recommended_next_steps": string[] (1-6) }`;

  const result = await callAI({ feature: "mission_strategy", messages: [{ role: "user", content: prompt }], systemPrompt: MISSION_PERSONA, userId: task.business_id, supabase });
  const parsed = parseStructuredResponse(result.content, StrategyOutputSchema, "MissionStrategy.v1");
  if (!parsed.success) {
    logValidationFailure({ feature: "mission_strategy", model: result.model, userId: task.business_id }, parsed);
    throw new Error(`AI returned an invalid strategy: ${parsed.issuesSummary}`);
  }
  return { ...parsed.data, cost_usd: result.estimatedCostUsd };
}

async function execDraftCampaign(supabase: SupabaseClient, task: MissionTaskRow) {
  const [strategy, mission, brain, { data: profile }] = await Promise.all([
    siblingOutput(supabase, task.mission_id, "build_strategy"),
    missionObjective(supabase, task.mission_id),
    getBusinessBrainContext(supabase, task.business_id, "performance"),
    supabase.from("profiles").select("name").eq("id", task.business_id).maybeSingle(),
  ]);
  const prompt = `Mission objective: ${wrapUntrustedBlock("objective", mission.objective)}

${wrapUntrustedBlock("business_context", formatBusinessBrainForPrompt(brain))}

Strategy so far: ${wrapUntrustedBlock("strategy", strategy ? JSON.stringify(strategy) : "none yet — use the objective directly")}

Draft ONE campaign brief for this business to review as a DRAFT (it will not be published automatically). Respect every listed constraint exactly — never propose anything a constraint above forbids. Return ONLY:
{ "title": string, "description": string, "campaign_goal": string, "compensation_type": "paid"|"gifted"|"affiliate"|"revenue_share"|"unpaid", "suggested_niches": string[] (0-6) }`;

  const result = await callAI({ feature: "mission_campaign_draft", messages: [{ role: "user", content: prompt }], systemPrompt: MISSION_PERSONA, userId: task.business_id, supabase });
  const parsed = parseStructuredResponse(result.content, CampaignDraftOutputSchema, "MissionCampaignDraft.v1");
  if (!parsed.success) {
    logValidationFailure({ feature: "mission_campaign_draft", model: result.model, userId: task.business_id }, parsed);
    throw new Error(`AI returned an invalid campaign draft: ${parsed.issuesSummary}`);
  }
  const draft = parsed.data;

  const { data: campaign, error } = await supabase.from("campaigns").insert({
    user_id: task.business_id,
    business_name: profile?.name ?? "Your business",
    title: draft.title,
    description: draft.description,
    campaign_goal: draft.campaign_goal,
    compensation_type: draft.compensation_type,
    required_niches: draft.suggested_niches ?? [],
    status: "draft",
    is_published: false,
  }).select("id").single();
  if (error) throw new Error(`Failed to save campaign draft: ${error.message}`);

  return { ...draft, campaign_id: campaign.id, cost_usd: result.estimatedCostUsd };
}

async function execDraftContentIdeas(supabase: SupabaseClient, task: MissionTaskRow) {
  const [strategy, mission, brain] = await Promise.all([
    siblingOutput(supabase, task.mission_id, "build_strategy"),
    missionObjective(supabase, task.mission_id),
    getBusinessBrainContext(supabase, task.business_id, "content"),
  ]);
  const prompt = `Mission objective: ${wrapUntrustedBlock("objective", mission.objective)}

${wrapUntrustedBlock("business_context", formatBusinessBrainForPrompt(brain))}

Strategy so far: ${wrapUntrustedBlock("strategy", strategy ? JSON.stringify(strategy) : "none yet — use the objective directly")}

Suggest 3-8 concrete content ideas supporting this Mission. Respect every listed constraint exactly. Return ONLY:
{ "items": [{ "platform": string, "content_type": string, "idea": string }] }`;

  const result = await callAI({ feature: "mission_content_draft", messages: [{ role: "user", content: prompt }], systemPrompt: MISSION_PERSONA, userId: task.business_id, supabase });
  const parsed = parseStructuredResponse(result.content, ContentIdeasOutputSchema, "MissionContentIdeas.v1");
  if (!parsed.success) {
    logValidationFailure({ feature: "mission_content_draft", model: result.model, userId: task.business_id }, parsed);
    throw new Error(`AI returned invalid content ideas: ${parsed.issuesSummary}`);
  }

  // ai_recommendations' REAL live shape (confirmed against production, not
  // assumed from the migration file — a CREATE TABLE IF NOT EXISTS in
  // 20260615200000_launch_readiness.sql was a no-op against the table that
  // already existed since 20260505172132, so the table kept its ORIGINAL
  // columns: recommendation_type/explanation/action, not type/body/
  // action_label/action_link. See src/lib/marketingHub.tsx's Recommendation
  // type for the authoritative contract every existing Hub surface reads.
  const { error: recErr } = await supabase.from("ai_recommendations").insert({
    user_id: task.business_id, recommendation_type: "action",
    title: `Content ideas — ${mission.objective_summary ?? "Mission"}`,
    explanation: parsed.data.items.map((i) => `[${i.platform} / ${i.content_type}] ${i.idea}`).join("\n"),
    action: "Review in Content Studio",
    priority: "medium", status: "active", source: "mission",
    meta: { link: "/marketing-hub/content", mission_id: task.mission_id, items: parsed.data.items },
  });
  if (recErr) throw new Error(`Failed to save content ideas: ${recErr.message}`);

  return { ...parsed.data, cost_usd: result.estimatedCostUsd };
}

async function execDraftOutreachCopy(supabase: SupabaseClient, task: MissionTaskRow) {
  const [strategy, mission, brain] = await Promise.all([
    siblingOutput(supabase, task.mission_id, "build_strategy"),
    missionObjective(supabase, task.mission_id),
    getBusinessBrainContext(supabase, task.business_id, "copy"),
  ]);
  const prompt = `Mission objective: ${wrapUntrustedBlock("objective", mission.objective)}

${wrapUntrustedBlock("business_context", formatBusinessBrainForPrompt(brain))}

Strategy so far: ${wrapUntrustedBlock("strategy", strategy ? JSON.stringify(strategy) : "none yet — use the objective directly")}

Draft ONE short outreach message a business could send a matched creator — this is a DRAFT for the business to review and send themselves; it will not be sent automatically. Respect every listed constraint and match the stated brand voice/tone exactly. Return ONLY:
{ "subject": string (optional), "message": string }`;

  const result = await callAI({ feature: "mission_outreach_draft", messages: [{ role: "user", content: prompt }], systemPrompt: MISSION_PERSONA, userId: task.business_id, supabase });
  const parsed = parseStructuredResponse(result.content, OutreachCopyOutputSchema, "MissionOutreachCopy.v1");
  if (!parsed.success) {
    logValidationFailure({ feature: "mission_outreach_draft", model: result.model, userId: task.business_id }, parsed);
    throw new Error(`AI returned invalid outreach copy: ${parsed.issuesSummary}`);
  }

  const { error: recErr } = await supabase.from("ai_recommendations").insert({
    user_id: task.business_id, recommendation_type: "action",
    title: "Outreach message draft",
    explanation: parsed.data.message,
    action: "Review in Find Creators",
    priority: "low", status: "active", source: "mission",
    meta: { link: "/find-creators", mission_id: task.mission_id, ...parsed.data },
  });
  if (recErr) throw new Error(`Failed to save outreach draft: ${recErr.message}`);

  return { ...parsed.data, cost_usd: result.estimatedCostUsd };
}

const SAFE_EXECUTORS: Record<string, (s: SupabaseClient, t: MissionTaskRow) => Promise<Record<string, unknown>>> = {
  gather_context: execGatherContext,
  build_strategy: execBuildStrategy,
  draft_campaign: execDraftCampaign,
  draft_content_ideas: execDraftContentIdeas,
  draft_outreach_copy: execDraftOutreachCopy,
};

// If complete_mission_task's own RPC call fails to execute (network blip to
// Supabase, not a tool/provider failure — that's already reflected in
// p_status/p_error by the time this is called), the task is not silently
// left claiming a false status: it just stays 'running' under this worker's
// lease, which reclaim_expired_mission_task_leases() picks back up to
// 'ready' once the lease expires. Logged here so that self-healing path is
// observable, not silent.
async function completeTask(supabase: SupabaseClient, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc("complete_mission_task", args);
  if (error) console.error("[mission-task-runner] complete_mission_task RPC failed (task stays leased until reclaim):", args.p_task_id, error);
}

async function runTask(supabase: SupabaseClient, workerId: string, task: MissionTaskRow): Promise<void> {
  const def = toolDef(task.tool_name as ToolName);
  if (!def) {
    await completeTask(supabase, { p_task_id: task.id, p_worker_id: workerId, p_status: "failed", p_error: `Unknown tool "${task.tool_name}"` });
    return;
  }

  // 'sensitive' tasks only ever reach here already approved (enforced by
  // claim_ready_mission_tasks). A tool with no executor is never "run" — it
  // is honestly recorded as prepared, never claimed as done.
  if (def.riskLevel === "sensitive") {
    if (!def.hasExecutor) {
      await completeTask(supabase, {
        p_task_id: task.id, p_worker_id: workerId, p_status: "completed",
        p_output: { prepared: true, executed: false, manual_action_required: def.manualActionNote ?? "This step requires you to complete it manually." },
      });
      return;
    }
    // No 'sensitive' tool has a real executor in this phase — defensive only.
    await completeTask(supabase, { p_task_id: task.id, p_worker_id: workerId, p_status: "failed", p_error: "This action type is not yet implemented." });
    return;
  }

  const executor = SAFE_EXECUTORS[task.tool_name];
  if (!executor) {
    await completeTask(supabase, { p_task_id: task.id, p_worker_id: workerId, p_status: "failed", p_error: `No executor wired for "${task.tool_name}"` });
    return;
  }

  if (def.estimatedCostUsd > 0) {
    const budget = await checkAutomatedBudget(supabase, task.business_id, BUDGET_FEATURE, def.estimatedCostUsd);
    if (!budget.allowed) {
      await completeTask(supabase, { p_task_id: task.id, p_worker_id: workerId, p_status: "failed", p_error: "Monthly automated Mission budget reached for this business." });
      return;
    }
  }

  try {
    const output = await executor(supabase, task);
    const cost = typeof output.cost_usd === "number" ? output.cost_usd : null;
    await completeTask(supabase, { p_task_id: task.id, p_worker_id: workerId, p_status: "completed", p_output: output, p_actual_cost_usd: cost });
  } catch (e) {
    console.error(`[mission-task-runner] task ${task.id} (${task.tool_name}) failed:`, e);
    await completeTask(supabase, { p_task_id: task.id, p_worker_id: workerId, p_status: "failed", p_error: e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500) });
  }
}

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    requireServiceRole(req);
  } catch (e) {
    if (e instanceof AuthError) return jsonErr(e.message, req, 401);
    throw e;
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const { data: reclaimed, error: reclaimErr } = await supabase.rpc("reclaim_expired_mission_task_leases");
    if (reclaimErr) console.error("[mission-task-runner] reclaim_expired_mission_task_leases failed:", reclaimErr);

    const { data: opened, error: openErr } = await supabase.rpc("open_pending_sensitive_approvals");
    if (openErr) console.error("[mission-task-runner] open_pending_sensitive_approvals failed:", openErr);

    const workerId = crypto.randomUUID();
    const { data: claimed, error: claimErr } = await supabase.rpc("claim_ready_mission_tasks", { p_worker_id: workerId, p_limit: CLAIM_LIMIT });
    if (claimErr) {
      console.error("[mission-task-runner] claim failed:", claimErr);
      return jsonErr("Claim failed", req, 500);
    }

    const tasks: MissionTaskRow[] = claimed ?? [];
    for (const task of tasks) {
      await runTask(supabase, workerId, task);
    }

    // Phase O: extract learnings from any Mission that reached a terminal
    // state and hasn't been processed yet. Small bounded batch, same
    // dispatcher shape as everything else in this tick — never blocks task
    // execution above, runs after.
    let learningsProcessed = 0;
    const { data: terminalMissions } = await supabase
      .from("missions").select("id, business_id, objective_summary")
      .in("status", ["completed", "failed"]).is("learnings_processed_at", null).limit(5);
    for (const mission of terminalMissions ?? []) {
      try {
        const { candidatesCreated } = await processMissionLearnings(supabase, mission);
        learningsProcessed++;
        if (candidatesCreated > 0) console.log(`[mission-task-runner] mission ${mission.id}: ${candidatesCreated} learning candidate(s) created`);
      } catch (e) {
        console.error(`[mission-task-runner] learning extraction failed for mission ${mission.id}:`, e);
      }
    }

    return jsonOk({ reclaimed_leases: reclaimed ?? 0, sensitive_approvals_opened: opened ?? 0, tasks_claimed: tasks.length, missions_learnings_processed: learningsProcessed }, req);
  } catch (e) {
    console.error("[mission-task-runner] unhandled error:", e);
    return jsonErr("Internal error", req, 500);
  }
});
