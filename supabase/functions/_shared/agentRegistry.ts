// ─────────────────────────────────────────────────────────────────────────────
// MRKT Agent Registry (Phase N) — static roster shared by the CMO planner and
// the mission task runner. The source of truth for *display* data (name,
// icon, department) is the `agents` table (seeded once in the Phase N
// migration); this file exists only so schema validation (missionSchemas.ts)
// and the tool registry (missionTools.ts) have a compile-time-checked list
// of valid keys without a DB round-trip on every request. Keep in sync with
// the migration's seed INSERT if a role is ever added or renamed.
// ─────────────────────────────────────────────────────────────────────────────

export const AGENT_KEYS = [
  "cmo", "growth", "content", "social", "creative", "copy",
  "performance", "intelligence", "lifecycle", "analyst",
] as const;

export type AgentKey = typeof AGENT_KEYS[number];

export function isAgentKey(value: unknown): value is AgentKey {
  return typeof value === "string" && (AGENT_KEYS as readonly string[]).includes(value);
}
