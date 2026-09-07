// ─────────────────────────────────────────────────────────────────────────────
// Mission plan → task rows (Phase N).
//
// Extracted as a pure, directly-testable function (same discipline as
// queryClient.ts's shouldClearQueryCache) rather than left inline in
// cmo-create-mission/index.ts — this is exactly the kind of "dependency
// handling / malformed AI output" logic spec §28 asks to have deterministic
// tests, and it's also the one place a schema-valid-but-adversarial plan
// (self-referencing or forward-referencing depends_on_index, trying to
// build a cycle) gets neutralized: only indices strictly earlier than a
// task's own position are honored, which makes a cycle structurally
// impossible regardless of what the model returns.
// ─────────────────────────────────────────────────────────────────────────────

import type { MissionPlan } from "./missionSchemas.ts";
import { toolDef } from "./missionTools.ts";

export interface MissionTaskRow {
  id: string;
  mission_id: string;
  business_id: string;
  agent_key: string;
  tool_name: string;
  title: string;
  input_data: Record<string, unknown>;
  risk_level: "safe" | "sensitive";
  requires_approval: boolean;
  depends_on: string[];
  order_index: number;
  status: "ready" | "blocked";
}

/**
 * `taskIds` must already be generated (one per plan.tasks entry, same
 * order) — the caller owns id generation so it can insert/rollback as one
 * transaction-shaped operation.
 */
export function buildMissionTaskRows(
  plan: MissionPlan, businessId: string, missionId: string, taskIds: string[],
): MissionTaskRow[] {
  if (taskIds.length !== plan.tasks.length) {
    throw new Error("buildMissionTaskRows: taskIds length must match plan.tasks length");
  }

  return plan.tasks.map((t, idx) => {
    const def = toolDef(t.tool);
    if (!def) throw new Error(`buildMissionTaskRows: unknown tool "${t.tool}" (schema validation should have prevented this)`);

    // Only indices strictly BEFORE this task's own position are honored —
    // this is what makes a dependency cycle structurally impossible, not
    // merely unlikely, regardless of what depends_on_index the model chose.
    const dependsOn = [...new Set(t.depends_on_index.filter((i) => i >= 0 && i < idx))].map((i) => taskIds[i]);

    return {
      id: taskIds[idx],
      mission_id: missionId,
      business_id: businessId,
      agent_key: t.agent_key,
      tool_name: t.tool,
      title: t.title,
      input_data: t.input ?? {},
      risk_level: def.riskLevel,
      requires_approval: def.riskLevel === "sensitive",
      depends_on: dependsOn,
      order_index: idx,
      status: dependsOn.length > 0 ? "blocked" : "ready",
    };
  });
}
