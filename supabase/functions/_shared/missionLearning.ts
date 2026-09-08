// ─────────────────────────────────────────────────────────────────────────────
// Phase O — Mission → learning extraction.
//
// Runs once per terminal Mission (guarded by missions.learnings_processed_at).
// Deterministic only — no speculative AI call to "guess" a learning. Real
// Mission data either contains a genuine, checkable pattern or it doesn't;
// "no useful learning" is the expected, common, correct result (spec §16),
// not a failure of this module.
//
// Every candidate this module writes goes through memory_candidates, never
// business_facts directly (spec §13) — and every candidate here uses
// source_type 'agent_learned', which decide_memory_candidate/
// upsert_business_fact_internal never auto-promote on their own. Auto-
// promotion in this module is reserved for the one genuinely deterministic,
// measured signal (a repeated, real, counted failure pattern) — everything
// else always lands 'pending' for the owner to review.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface MissionRow {
  id: string;
  business_id: string;
  objective_summary: string | null;
}

// Known, specific provider-failure signatures worth remembering as an
// operational learning — deliberately narrow (a generic substring match
// would create noise, not institutional knowledge).
const KNOWN_ERROR_SIGNATURES: { match: string; label: string }[] = [
  { match: "credit balance is too low", label: "provider_billing_exhausted" },
  { match: "rate_limited", label: "provider_rate_limited" },
];

function classifyError(message: string | null): string | null {
  if (!message) return null;
  for (const sig of KNOWN_ERROR_SIGNATURES) {
    if (message.toLowerCase().includes(sig.match)) return sig.label;
  }
  return null;
}

interface CandidateDraft {
  category: string;
  fact_key: string;
  statement: string;
  structured_value: Record<string, unknown> | null;
  proposed_source_type: "measured" | "ai_inferred" | "market_observed" | "agent_learned";
  proposed_confidence: "verified" | "high" | "medium" | "low";
  evidence: Record<string, unknown>;
  autoPromote: boolean;
}

async function extractCandidates(supabase: SupabaseClient, mission: MissionRow): Promise<CandidateDraft[]> {
  const candidates: CandidateDraft[] = [];

  // Deterministic signal: the SAME tool has now failed with the SAME known
  // error signature at least twice for this business — a real, counted,
  // checkable pattern, not a single incident.
  const { data: failedTasks } = await supabase
    .from("mission_tasks").select("tool_name, error_message")
    .eq("mission_id", mission.id).eq("status", "failed");

  for (const t of failedTasks ?? []) {
    const signature = classifyError(t.error_message);
    if (!signature) continue;

    const { count } = await supabase
      .from("mission_tasks").select("id", { count: "exact", head: true })
      .eq("business_id", mission.business_id).eq("tool_name", t.tool_name).eq("status", "failed")
      .ilike("error_message", `%${KNOWN_ERROR_SIGNATURES.find((s) => s.label === signature)!.match}%`);

    if ((count ?? 0) >= 2) {
      candidates.push({
        category: "constraints",
        fact_key: `tool_reliability:${t.tool_name}:${signature}`,
        statement: `"${t.tool_name}" has failed repeatedly (${count}x) due to ${signature.replace(/_/g, " ")} — check provider configuration/billing before relying on it for future Missions.`,
        structured_value: { tool_name: t.tool_name, error_signature: signature, failure_count: count },
        proposed_source_type: "agent_learned",
        proposed_confidence: (count ?? 0) >= 3 ? "high" : "medium",
        evidence: { mission_id: mission.id, failure_count: count },
        autoPromote: false, // agent_learned always requires review — never auto-promoted, regardless of count
      });
    }
  }

  return candidates;
}

/** Idempotent — safe to call once per tick; the caller should only invoke
 *  this for missions where learnings_processed_at IS NULL. */
export async function processMissionLearnings(supabase: SupabaseClient, mission: MissionRow): Promise<{ candidatesCreated: number }> {
  const candidates = await extractCandidates(supabase, mission);

  for (const c of candidates) {
    const { data: inserted, error } = await supabase
      .from("memory_candidates")
      .insert({
        business_id: mission.business_id, mission_id: mission.id,
        category: c.category, fact_key: c.fact_key, statement: c.statement,
        structured_value: c.structured_value, proposed_source_type: c.proposed_source_type,
        proposed_confidence: c.proposed_confidence, evidence: c.evidence,
      })
      .select("id").single();
    if (error) { console.error("[missionLearning] candidate insert failed:", error); continue; }

    if (c.autoPromote && inserted) {
      const { error: decideErr } = await supabase.rpc("decide_memory_candidate", { p_candidate_id: inserted.id, p_decision: "accepted" });
      if (decideErr) console.error("[missionLearning] auto-promotion failed:", decideErr);
    }
  }

  await supabase.from("mission_events").insert({
    mission_id: mission.id, business_id: mission.business_id, event_type: "learnings_processed", actor: "system",
    message: candidates.length > 0
      ? `Identified ${candidates.length} potential learning(s) from this Mission for your review.`
      : "No useful learning identified from this Mission.",
    payload: { candidate_count: candidates.length },
  });

  await supabase.from("missions").update({ learnings_processed_at: new Date().toISOString() }).eq("id", mission.id);

  return { candidatesCreated: candidates.length };
}
