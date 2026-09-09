// ─────────────────────────────────────────────────────────────────────────────
// MRKT Mission structured-output schemas (Phase N).
//
// Every AI output that becomes real execution state — a mission plan, or a
// safe tool's generated artifact — is validated here before it touches the
// database, using the same parseStructuredResponse()/fail-closed pipeline
// every other Marketing Hub AI feature already uses (structuredParser.ts).
// A schema-validation failure never becomes a partially-applied mission —
// the caller refunds credits and surfaces a clean error (spec §24).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "npm:zod@3.24.2";
import { shortText, mediumText, longText } from "./structuredParser.ts";
import { AGENT_KEYS } from "./agentRegistry.ts";
import { TOOL_NAMES } from "./missionTools.ts";

// ── CMO mission plan (cmo-create-mission) ──────────────────────────────────

export const MissionTaskPlanSchema = z.object({
  tool: z.enum(TOOL_NAMES as unknown as [string, ...string[]]),
  agent_key: z.enum(AGENT_KEYS as unknown as [string, ...string[]]),
  title: shortText(140),
  // Deliberately NOT .strict(): each tool interprets only the keys it knows
  // (missionTools.ts executors read named fields and ignore the rest) — this
  // is free-form parameters TO a fixed, reviewed tool, never a free-form
  // instruction the way an unvalidated prose field would be.
  input: z.record(z.any()).optional().default({}),
  // Indices into the plan's own tasks[] array (0-based) that must complete
  // first. Resolved to real task UUIDs server-side, never trusted as IDs.
  depends_on_index: z.array(z.number().int().min(0)).max(9).optional().default([]),
}).strict();

export const MissionPlanSchema = z.object({
  objective_summary: mediumText(300),
  priority: z.enum(["critical", "high", "medium", "low"]),
  target_metrics: z.array(z.object({ name: shortText(80), target: shortText(120) }).strict()).max(5).optional().default([]),
  strategy_summary: longText(1500),
  tasks: z.array(MissionTaskPlanSchema).min(1).max(10),
}).strict();

export type MissionPlan = z.infer<typeof MissionPlanSchema>;

// ── Safe-tool output shapes (mission-task-runner) ───────────────────────────

export const StrategyOutputSchema = z.object({
  headline: shortText(160),
  pillars: z.array(shortText(160)).min(1).max(6),
  recommended_next_steps: z.array(shortText(220)).min(1).max(6),
}).strict();
export type StrategyOutput = z.infer<typeof StrategyOutputSchema>;

export const CampaignDraftOutputSchema = z.object({
  title: shortText(120),
  description: longText(1000),
  campaign_goal: shortText(220),
  compensation_type: z.enum(["paid", "gifted", "affiliate", "revenue_share", "unpaid"]),
  suggested_niches: z.array(shortText(40)).max(6).optional().default([]),
}).strict();
export type CampaignDraftOutput = z.infer<typeof CampaignDraftOutputSchema>;

export const ContentIdeasOutputSchema = z.object({
  items: z.array(z.object({
    platform: shortText(30),
    content_type: shortText(40),
    idea: mediumText(320),
  }).strict()).min(1).max(8),
}).strict();
export type ContentIdeasOutput = z.infer<typeof ContentIdeasOutputSchema>;

export const OutreachCopyOutputSchema = z.object({
  subject: shortText(120).optional(),
  message: longText(800),
}).strict();
export type OutreachCopyOutput = z.infer<typeof OutreachCopyOutputSchema>;

// ── Phase P — Meta Ads Specialist's PREPARE-ONLY output (meta_prepare_campaign_plan) ──
// Every field is planning/strategy text or small structured config — never a
// real Meta object id, never an "executed"/"launched" flag. See
// missionTools.ts's meta_prepare_campaign_plan entry and metaAdsTools.ts's
// header for why this can never become a real API call from here.
export const MetaCampaignPlanOutputSchema = z.object({
  objective: shortText(200),
  funnel_stage: z.enum(["acquisition", "retargeting", "retention"]),
  campaign_structure: z.object({
    campaign_name: shortText(120),
    objective_type: shortText(80),
    ad_sets: z.array(z.object({
      name: shortText(100),
      optimization_event: shortText(80),
      budget_note: shortText(160),
    }).strict()).min(1).max(6),
  }).strict(),
  audience_strategy: z.object({
    approach: z.enum(["broad", "interest_based", "lookalike", "retargeting", "custom"]),
    description: mediumText(400),
    geography: shortText(160),
    exclusions: z.array(shortText(120)).max(6).optional().default([]),
  }).strict(),
  budget_proposal: z.object({
    daily_budget_usd_low: z.number().min(0).max(100000),
    daily_budget_usd_high: z.number().min(0).max(100000),
    rationale: mediumText(300),
  }).strict(),
  placements: z.object({
    approach: z.enum(["advantage_plus", "manual"]),
    surfaces: z.array(shortText(60)).min(1).max(8),
    rationale: shortText(220),
  }).strict(),
  creative_requirements: z.array(shortText(220)).min(1).max(8),
  copy_requirements: z.object({
    hooks: z.array(shortText(160)).min(1).max(6),
    primary_text_direction: mediumText(300),
    cta_options: z.array(shortText(40)).min(1).max(5),
  }).strict(),
  test_matrix: z.array(z.object({
    variable: shortText(80),
    variants: z.array(shortText(120)).min(2).max(4),
  }).strict()).min(1).max(5),
  kpi_targets: z.array(z.object({ metric: shortText(40), target: shortText(80) }).strict()).min(1).max(6),
}).strict();
export type MetaCampaignPlanOutput = z.infer<typeof MetaCampaignPlanOutputSchema>;
