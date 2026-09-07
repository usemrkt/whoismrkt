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
