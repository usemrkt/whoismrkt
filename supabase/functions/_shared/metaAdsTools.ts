// ─────────────────────────────────────────────────────────────────────────────
// Meta Ads Specialist — future tool contracts (Phase P, spec §21-23).
//
// This file implements NOTHING. It exists purely as the reviewed, versioned
// design of the tool surface a future, hardened Meta connector phase will
// wire real executors to — so that phase inherits a shape, not a blank page,
// without this phase ever touching the Meta Marketing API, requesting
// credentials, or fabricating a fake OAuth/connection flow (spec §40).
//
// The one tool that IS real today — meta_prepare_campaign_plan — lives in
// missionTools.ts, exactly like every other safe/internal Mission tool. It
// is not listed below because it already exists; everything below is
// deliberately future/unimplemented.
//
// ── READ vs WRITE separation (spec §21) ─────────────────────────────────────
// READ tools: lower risk, could plausibly be 'safe'/auto-executing once a
// connector exists (they observe Meta, they don't change it).
// WRITE tools: financial/external side effects — under this codebase's own
// risk model (missionTools.ts's header) these can ONLY ever be 'sensitive'
// (requires_approval, no bare auto-execution), never 'safe', regardless of
// autonomy level.
// ─────────────────────────────────────────────────────────────────────────────

export type MetaToolKind = "read" | "write";

export interface FutureMetaToolContract {
  name: string;
  kind: MetaToolKind;
  /**
   * WRITE tools must always be 'sensitive' when this contract is eventually
   * implemented — enforced by convention here (and, once real, by the same
   * TOOL_REGISTRY shape missionTools.ts already uses), not by a type-system
   * trick. A future implementer setting a write tool's riskLevel to 'safe'
   * would be a direct contradiction of this file's own design intent.
   */
  riskLevel: "safe" | "sensitive";
  description: string;
}

// Read surface — future, unimplemented. Exact names may change; the
// important part is the read/write split and that every one of these
// requires a real, verified Meta connection to mean anything.
export const FUTURE_META_READ_TOOLS: readonly FutureMetaToolContract[] = [
  { name: "meta_get_account", kind: "read", riskLevel: "safe", description: "Read ad account identity, status, and currency/timezone." },
  { name: "meta_get_campaigns", kind: "read", riskLevel: "safe", description: "Read existing campaigns and their objectives/status." },
  { name: "meta_get_adsets", kind: "read", riskLevel: "safe", description: "Read ad sets: budget, targeting, optimization event." },
  { name: "meta_get_ads", kind: "read", riskLevel: "safe", description: "Read ads: creative, copy, status." },
  { name: "meta_get_insights", kind: "read", riskLevel: "safe", description: "Read performance metrics (spend, CPM, CTR, CPA, ROAS, etc.)." },
  { name: "meta_get_audiences", kind: "read", riskLevel: "safe", description: "Read custom/lookalike audiences and overlap." },
  { name: "meta_get_tracking_health", kind: "read", riskLevel: "safe", description: "Read Pixel/Conversions API event quality and delivery." },
];

// Write surface — future, unimplemented, ALWAYS 'sensitive'. No autonomy
// level, no owner setting, no agent confidence score ever lets one of these
// skip a real human approval — that boundary is architectural, not a
// default (mirrors missionTools.ts's own "riskLevel is the hard safety
// boundary, not a default that policy can override").
export const FUTURE_META_WRITE_TOOLS: readonly FutureMetaToolContract[] = [
  { name: "meta_create_campaign", kind: "write", riskLevel: "sensitive", description: "Create a new Meta campaign. External, financially consequential." },
  { name: "meta_create_adset", kind: "write", riskLevel: "sensitive", description: "Create a new ad set (sets a real budget)." },
  { name: "meta_create_ad", kind: "write", riskLevel: "sensitive", description: "Create a new ad (publishes creative to a live audience)." },
  { name: "meta_update_budget", kind: "write", riskLevel: "sensitive", description: "Change spend on an existing entity. Financially consequential." },
  { name: "meta_pause_entity", kind: "write", riskLevel: "sensitive", description: "Pause a campaign/ad set/ad. Reversible, but a real external state change." },
  { name: "meta_resume_entity", kind: "write", riskLevel: "sensitive", description: "Resume spend on a paused entity. Financially consequential." },
  { name: "meta_create_audience", kind: "write", riskLevel: "sensitive", description: "Create a custom/lookalike audience on the connected ad account." },
];

// ─────────────────────────────────────────────────────────────────────────────
// The write-safety pipeline every future write tool MUST pass through
// (spec §22) — documented here as the contract, enforced nowhere yet
// because no write executor exists yet. When a future connector phase adds
// one, it inherits this exact ordering, not a fresh design:
//
//   1. Agent reasoning (LLM decides an action is warranted)
//   2. Structured Meta action proposal (typed object, not prose)
//   3. Schema validation (Zod, .strict(), same discipline as missionSchemas.ts)
//   4. Business ownership check (the acting business_id owns the target
//      Meta entity — never trust an ID an LLM produced without verifying it
//      against a synced ownership record)
//   5. Agent capability check (this agent_key is allowed this tool — mirrors
//      missionTools.ts's agentKey field)
//   6. Autonomy policy (business_autonomy_policy — 'sensitive' NEVER
//      auto-executes regardless of level, exactly like today's Mission
//      sensitive tools)
//   7. Spend/budget policy (automated_spend_budgets + a Meta-specific
//      monthly/daily/per-campaign cap — spec §23, see
//      FutureMetaSpendMandate below)
//   8. Approval policy (mission_approvals — the real human-decision table
//      and RPC Phase N already built, not a new approval system)
//   9. Deterministic Meta API adapter (the ONLY code path allowed to touch
//      graph.facebook.com — never an LLM-generated URL/request sent
//      directly, per spec §22's explicit prohibition)
//  10. Meta response verification (the adapter's real response, not the
//      model's expectation, becomes the recorded outcome)
//  11. Audit event (mission_events, same table Phase N already writes)
//  12. Business Brain / performance observation later (a future
//      meta_ads-purpose signal detector reads the real outcome back in —
//      closing the OBSERVE→...→LEARN→OBSERVE loop from spec §2)
//
// Steps 6 (autonomy) and 8 (approval) already exist generically in Phase N
// and would be reused, not rebuilt, by a future connector phase. Nothing in
// Phase P implements steps 4, 7, 9-12 for Meta specifically.
// ─────────────────────────────────────────────────────────────────────────────

// Financial safety parameters (spec §23) — TYPE ONLY, not enforced anywhere
// yet (no write tool exists to enforce them against). Documented so the
// eventual automated_spend_budgets / business_autonomy_policy rows this maps
// to have a known target shape.
export interface FutureMetaSpendMandate {
  maxMonthlySpendUsd: number;
  maxDailySpendUsd: number;
  maxCampaignBudgetUsd: number;
  maxAutonomousBudgetIncreasePct: number;
  /** e.g. "3+ consecutive days of stable CPA below target before scaling" */
  minEvidenceBeforeScaling: string;
  mandatoryApprovalAboveUsd: number;
}
