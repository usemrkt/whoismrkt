// ─────────────────────────────────────────────────────────────────────────────
// Phase N — Mission Foundation deterministic-logic tests.
//
// Exercises the REAL shared modules (missionTools.ts, missionSchemas.ts,
// missionPlan.ts) the edge functions import — not a reimplementation. Two
// invariants matter most here, per the founder's explicit scoping decision:
// (1) a 'sensitive' tool can NEVER auto-execute (no hasExecutor:true entry
// exists for one), and (2) a schema-valid-but-adversarial plan can never
// produce a dependency cycle, regardless of what depends_on_index values
// the model returns.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { TOOL_NAMES, TOOL_REGISTRY, SAFE_TOOL_NAMES, SENSITIVE_TOOL_NAMES, toolDef } from "../../supabase/functions/_shared/missionTools.ts";
import { AGENT_KEYS } from "../../supabase/functions/_shared/agentRegistry.ts";
import { MissionPlanSchema, StrategyOutputSchema, CampaignDraftOutputSchema } from "../../supabase/functions/_shared/missionSchemas.ts";
import { buildMissionTaskRows } from "../../supabase/functions/_shared/missionPlan.ts";
import { parseStructuredResponse } from "../../supabase/functions/_shared/structuredParser.ts";

describe("Tool registry — the hard safety boundary", () => {
  it("every tool name has a matching, self-consistent registry entry", () => {
    for (const name of TOOL_NAMES) {
      const def = toolDef(name);
      expect(def).toBeDefined();
      expect(def!.name).toBe(name);
      expect(AGENT_KEYS).toContain(def!.agentKey);
    }
  });

  it("NEVER classifies a 'sensitive' tool as having a real executor — this is what makes money/external/outreach/destructive actions structurally prepare-only, not just gated by a policy default", () => {
    for (const name of SENSITIVE_TOOL_NAMES) {
      expect(TOOL_REGISTRY[name].hasExecutor).toBe(false);
      expect(TOOL_REGISTRY[name].manualActionNote).toBeTruthy();
    }
  });

  it("every 'safe' tool DOES have a real executor (nothing in the safe lane is silently a no-op)", () => {
    for (const name of SAFE_TOOL_NAMES) {
      expect(TOOL_REGISTRY[name].hasExecutor).toBe(true);
    }
  });

  it("known money/external-publish/outreach action types are classified 'sensitive', not 'safe'", () => {
    expect(TOOL_REGISTRY.launch_campaign.riskLevel).toBe("sensitive");
    expect(TOOL_REGISTRY.invite_creator_to_campaign.riskLevel).toBe("sensitive");
    expect(TOOL_REGISTRY.request_paid_promotion.riskLevel).toBe("sensitive");
  });

  it("known internal/reversible draft actions are classified 'safe'", () => {
    expect(TOOL_REGISTRY.draft_campaign.riskLevel).toBe("safe");
    expect(TOOL_REGISTRY.draft_content_ideas.riskLevel).toBe("safe");
    expect(TOOL_REGISTRY.draft_outreach_copy.riskLevel).toBe("safe"); // drafts TEXT only, never sends
  });

  it("safe ∪ sensitive covers every tool exactly once", () => {
    const union = new Set([...SAFE_TOOL_NAMES, ...SENSITIVE_TOOL_NAMES]);
    expect(union.size).toBe(TOOL_NAMES.length);
  });
});

describe("MissionPlanSchema — fail-closed on malformed or adversarial AI output", () => {
  const validPlan = {
    objective_summary: "Recover declining bookings this month.",
    priority: "high",
    target_metrics: [{ name: "bookings", target: "+15% MoM" }],
    strategy_summary: "Diagnose the funnel, then run a recovery promotion.",
    tasks: [
      { tool: "gather_context", agent_key: "analyst", title: "Gather context", input: {}, depends_on_index: [] },
      { tool: "build_strategy", agent_key: "cmo", title: "Build strategy", input: {}, depends_on_index: [0] },
    ],
  };

  it("accepts a well-formed plan", () => {
    const result = MissionPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it("rejects a plan referencing a tool outside the registry — the AI can never invent an action", () => {
    const bad = { ...validPlan, tasks: [{ ...validPlan.tasks[0], tool: "delete_all_campaigns" }] };
    expect(MissionPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a plan referencing an unknown agent_key", () => {
    const bad = { ...validPlan, tasks: [{ ...validPlan.tasks[0], agent_key: "ghost_agent" }] };
    expect(MissionPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown top-level field (.strict()) — the model can't smuggle in an extra instruction-shaped key", () => {
    const bad = { ...validPlan, auto_approve_everything: true };
    expect(MissionPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than 10 tasks", () => {
    const bad = { ...validPlan, tasks: Array.from({ length: 11 }, () => validPlan.tasks[0]) };
    expect(MissionPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty tasks array", () => {
    const bad = { ...validPlan, tasks: [] };
    expect(MissionPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("goes through the real fail-closed parser on garbage model output (extra prose, no JSON)", () => {
    const result = parseStructuredResponse("Sure! Here's my plan: I'll just wing it.", MissionPlanSchema, "MissionPlan.v1");
    expect(result.success).toBe(false);
  });
});

describe("buildMissionTaskRows — dependency resolution can never produce a cycle", () => {
  const plan = MissionPlanSchema.parse({
    objective_summary: "Test",
    priority: "medium",
    strategy_summary: "Test strategy",
    tasks: [
      { tool: "gather_context", agent_key: "analyst", title: "A" },
      { tool: "build_strategy", agent_key: "cmo", title: "B", depends_on_index: [0] },
      { tool: "draft_campaign", agent_key: "performance", title: "C", depends_on_index: [1] },
    ],
  });

  it("gives every task a stable id from the caller-supplied list, in order", () => {
    const ids = ["id-a", "id-b", "id-c"];
    const rows = buildMissionTaskRows(plan, "biz-1", "mission-1", ids);
    expect(rows.map((r) => r.id)).toEqual(ids);
    expect(rows.every((r) => r.business_id === "biz-1" && r.mission_id === "mission-1")).toBe(true);
  });

  it("resolves depends_on_index to real task ids and marks a task with dependencies 'blocked'", () => {
    const ids = ["id-a", "id-b", "id-c"];
    const rows = buildMissionTaskRows(plan, "biz-1", "mission-1", ids);
    expect(rows[0].status).toBe("ready"); // no deps
    expect(rows[1].depends_on).toEqual(["id-a"]);
    expect(rows[1].status).toBe("blocked");
    expect(rows[2].depends_on).toEqual(["id-b"]);
  });

  it("drops a self-referencing or forward-referencing index instead of honoring it — this is what makes a cycle structurally impossible regardless of model output", () => {
    const adversarial = MissionPlanSchema.parse({
      objective_summary: "Test", priority: "medium", strategy_summary: "Test",
      tasks: [
        { tool: "gather_context", agent_key: "analyst", title: "A", depends_on_index: [0] },       // self-reference
        { tool: "build_strategy", agent_key: "cmo", title: "B", depends_on_index: [2] },            // forward reference
        { tool: "draft_campaign", agent_key: "performance", title: "C", depends_on_index: [0, 1] }, // valid backward refs
      ],
    });
    const ids = ["id-a", "id-b", "id-c"];
    const rows = buildMissionTaskRows(adversarial, "biz-1", "mission-1", ids);
    expect(rows[0].depends_on).toEqual([]); // self-ref dropped → not blocked on itself
    expect(rows[0].status).toBe("ready");
    expect(rows[1].depends_on).toEqual([]); // forward-ref dropped
    expect(rows[1].status).toBe("ready");
    expect(rows[2].depends_on).toEqual(["id-a", "id-b"]); // both valid backward refs kept
  });

  it("assigns risk_level/requires_approval straight from the tool registry, never from AI-supplied data", () => {
    const ids = ["id-a", "id-b", "id-c"];
    const rows = buildMissionTaskRows(plan, "biz-1", "mission-1", ids);
    expect(rows[0].risk_level).toBe("safe");
    expect(rows[0].requires_approval).toBe(false);
  });

  it("throws rather than silently truncating on a taskIds/tasks length mismatch", () => {
    expect(() => buildMissionTaskRows(plan, "biz-1", "mission-1", ["only-one-id"])).toThrow();
  });
});

describe("Safe-tool output schemas — fail closed on malformed AI artifacts", () => {
  it("StrategyOutputSchema rejects an unknown extra field", () => {
    const bad = { headline: "x", pillars: ["a"], recommended_next_steps: ["b"], confidence: 0.9 };
    expect(StrategyOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("CampaignDraftOutputSchema rejects an invalid compensation_type", () => {
    const bad = { title: "x", description: "y", campaign_goal: "z", compensation_type: "crypto" };
    expect(CampaignDraftOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("CampaignDraftOutputSchema accepts a well-formed draft", () => {
    const ok = { title: "x", description: "y", campaign_goal: "z", compensation_type: "gifted", suggested_niches: ["beauty"] };
    expect(CampaignDraftOutputSchema.safeParse(ok).success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase P — Meta Ads Specialist hierarchy + PREPARE-ONLY invariant. Extends
// (never replaces) the generic tool-registry invariants above, which already
// cover meta_prepare_campaign_plan via TOOL_NAMES/SAFE_TOOL_NAMES iteration.
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase P — specialist hierarchy + capability boundaries", () => {
  it("meta_ads is a real, valid agent key the schema/planner can assign tasks to", () => {
    expect(AGENT_KEYS).toContain("meta_ads");
  });

  it("meta_prepare_campaign_plan is owned by the Meta Ads Specialist, not the generic Performance agent", () => {
    expect(TOOL_REGISTRY.meta_prepare_campaign_plan.agentKey).toBe("meta_ads");
  });

  it("meta_prepare_campaign_plan is 'safe'/hasExecutor:true — a real, internal, reversible deliverable", () => {
    expect(TOOL_REGISTRY.meta_prepare_campaign_plan.riskLevel).toBe("safe");
    expect(TOOL_REGISTRY.meta_prepare_campaign_plan.hasExecutor).toBe(true);
  });

  it("NO Meta write tool (create/update/pause/resume/etc.) exists anywhere in the real tool registry — spec §40", () => {
    const writeToolNames = ["meta_create_campaign", "meta_create_adset", "meta_create_ad", "meta_update_budget", "meta_pause_entity", "meta_resume_entity", "meta_create_audience"];
    for (const name of writeToolNames) {
      expect(TOOL_NAMES as readonly string[]).not.toContain(name);
    }
  });

  it("every future Meta write tool contract is documented as 'sensitive' — never 'safe' by design", async () => {
    const { FUTURE_META_WRITE_TOOLS } = await import("../../supabase/functions/_shared/metaAdsTools.ts");
    expect(FUTURE_META_WRITE_TOOLS.length).toBeGreaterThan(0);
    for (const t of FUTURE_META_WRITE_TOOLS) expect(t.riskLevel).toBe("sensitive");
  });
});
