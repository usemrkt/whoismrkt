// ─────────────────────────────────────────────────────────────────────────────
// MRKT Mission Tool Registry (Phase N).
//
// This is the ONE place a mission task's tool_name is given meaning. The CMO
// planner (cmo-create-mission) may only ever select a tool from this list —
// its Zod schema (missionSchemas.ts) enforces that at parse time — so an AI
// plan can never invent an action outside this reviewed surface (spec §14's
// "LLM → structured proposed action → schema validation → ... → deterministic
// tool invocation", not free-form execution).
//
// riskLevel is the hard safety boundary, not a default that policy can
// override:
//   • 'safe'      — internal, reversible, no third party, no money, no
//                    external publish. May auto-execute (mission-task-runner
//                    lane 1), gated only by the business's own
//                    auto_execute_safe_tasks toggle.
//   • 'sensitive' — money, external publishing, outreach to a third party,
//                    or anything not cleanly reversible. NEVER auto-executes
//                    — always opens a human approval first (Phase N
//                    migration's open_pending_sensitive_approvals /
//                    claim_ready_mission_tasks "lane 2"), regardless of
//                    autonomy level.
//
// hasExecutor distinguishes, among approved 'sensitive' tools, which ones
// this phase actually knows how to perform (true) vs. which ones exist only
// so the mission graph can represent them honestly (false — "prepare-only").
// A prepare-only tool's approval never triggers a real side effect; the
// runner marks it completed with an explicit "prepared, not executed"
// output and a plain-language description of what the business still needs
// to do themselves — never a fabricated "done". See spec §13/§30.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentKey } from "./agentRegistry.ts";

export const TOOL_NAMES = [
  "gather_context",
  "build_strategy",
  "draft_campaign",
  "draft_content_ideas",
  "draft_outreach_copy",
  "invite_creator_to_campaign",
  "launch_campaign",
  "request_paid_promotion",
] as const;

export type ToolName = typeof TOOL_NAMES[number];

export interface ToolDef {
  name: ToolName;
  label: string;
  agentKey: AgentKey;
  riskLevel: "safe" | "sensitive";
  hasExecutor: boolean;
  /** Rough per-call estimate used for the automated-budget pre-check, not a real prediction — see metering.ts's own MAX_SINGLE_REQUEST_COST_USD for the actual backstop. */
  estimatedCostUsd: number;
  description: string;
  /** Shown to the business when a 'sensitive' tool without an executor is approved — never implied by a generic "completed" label. */
  manualActionNote?: string;
}

export const TOOL_REGISTRY: Record<ToolName, ToolDef> = {
  gather_context: {
    name: "gather_context", label: "Gather business context", agentKey: "analyst",
    riskLevel: "safe", hasExecutor: true, estimatedCostUsd: 0,
    description: "Reads the business's existing Brand Knowledge, latest Marketing Health snapshot, and recent Market Intelligence findings — no AI call, no new data created.",
  },
  build_strategy: {
    name: "build_strategy", label: "Build mission strategy", agentKey: "cmo",
    riskLevel: "safe", hasExecutor: true, estimatedCostUsd: 0.03,
    description: "One AI call synthesizing gathered context + the mission objective into a written strategy (headline, pillars, next steps). Text only — no table writes beyond this task's own output.",
  },
  draft_campaign: {
    name: "draft_campaign", label: "Draft a campaign", agentKey: "performance",
    riskLevel: "safe", hasExecutor: true, estimatedCostUsd: 0.02,
    description: "Creates one real campaigns row with status='draft', is_published=false — fully internal and reversible, the business reviews/edits/deletes it like any manually created draft. Never publishes.",
  },
  draft_content_ideas: {
    name: "draft_content_ideas", label: "Draft content ideas", agentKey: "content",
    riskLevel: "safe", hasExecutor: true, estimatedCostUsd: 0.02,
    description: "Generates a short list of content ideas and files them as one ai_recommendations item for review in Content Studio. Drafts only — nothing is scheduled or posted.",
  },
  draft_outreach_copy: {
    name: "draft_outreach_copy", label: "Draft outreach message", agentKey: "copy",
    riskLevel: "safe", hasExecutor: true, estimatedCostUsd: 0.01,
    description: "Writes outreach message text and files it as one ai_recommendations item. Text only — nothing is sent to any creator or third party.",
  },
  invite_creator_to_campaign: {
    name: "invite_creator_to_campaign", label: "Invite a creator to a campaign", agentKey: "growth",
    riskLevel: "sensitive", hasExecutor: false, estimatedCostUsd: 0,
    description: "Contacting a specific creator is a third-party action.",
    manualActionNote: "Prepared for review only. Send the actual invite from Find Creators when you're ready — this Mission does not contact creators on your behalf.",
  },
  launch_campaign: {
    name: "launch_campaign", label: "Publish a campaign", agentKey: "performance",
    riskLevel: "sensitive", hasExecutor: false, estimatedCostUsd: 0,
    description: "Publishing makes a campaign externally visible to creators.",
    manualActionNote: "Prepared for review only. Publish the campaign yourself from Campaign Center when you're ready — this Mission does not make campaigns live on your behalf.",
  },
  request_paid_promotion: {
    name: "request_paid_promotion", label: "Request paid promotion budget", agentKey: "performance",
    riskLevel: "sensitive", hasExecutor: false, estimatedCostUsd: 0,
    description: "Any paid-media spend requires explicit budget sign-off and, today, no ad-platform connector exists to execute it.",
    manualActionNote: "No ad connector is live yet — this step is recorded as a recommendation only, not executed. See Market Intelligence / Growth for manual next steps.",
  },
};

export function toolDef(name: string): ToolDef | undefined {
  return TOOL_REGISTRY[name as ToolName];
}

export const SAFE_TOOL_NAMES = TOOL_NAMES.filter((n) => TOOL_REGISTRY[n].riskLevel === "safe");
export const SENSITIVE_TOOL_NAMES = TOOL_NAMES.filter((n) => TOOL_REGISTRY[n].riskLevel === "sensitive");
