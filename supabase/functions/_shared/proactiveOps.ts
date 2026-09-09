// ─────────────────────────────────────────────────────────────────────────────
// Phase P — proactive-operations orchestration.
//
// Runs every registered SignalDetector for one business, and turns a real
// detection into the persisted chain: marketing_signals → marketing_findings
// → ai_recommendations (spec §2's OBSERVE → DETECT → UNDERSTAND → PRIORITIZE
// → RECOMMEND → PROPOSE MISSION). Called once per business per cron tick by
// signal-detector-runner — never inline in a user-facing request path.
//
// One detector throwing NEVER blocks the others (spec §37 "provider
// failure" test) — each is wrapped individually and logged, not fatal to
// the tick.
// ─────────────────────────────────────────────────────────────────────────────

import { SIGNAL_DETECTORS, type SignalDetectionResult } from "./signalDetectors.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ProactiveOpsResult {
  signalsUpserted: number;
  findingsCreated: number;
  recommendationsCreated: number;
  resolved: number;
}

export async function runSignalDetectionForBusiness(
  supabase: SupabaseClient, businessId: string,
): Promise<ProactiveOpsResult> {
  const result: ProactiveOpsResult = { signalsUpserted: 0, findingsCreated: 0, recommendationsCreated: 0, resolved: 0 };

  // Cost control (spec §32) — reuses Phase C's existing automated-spend
  // budget mechanism rather than a bespoke one. Today's detectors are all
  // deterministic ($0 real cost), so this reserves nothing meaningful yet,
  // but it creates the per-business 'proactive_ops' budget row and exercises
  // the same enforcement path a future AI-driven detector would draw down —
  // "ensure today's architecture will not prevent it later" (spec §23).
  const { data: budget, error: budgetErr } = await supabase.rpc("check_and_reserve_automated_budget", {
    p_business_id: businessId, p_feature: "proactive_ops", p_estimated_cost_usd: 0,
  });
  if (budgetErr) {
    console.error(`[proactiveOps] budget check failed for ${businessId}:`, budgetErr);
    return result; // fail closed — no signal processing without a working budget gate
  }
  const budgetRow = Array.isArray(budget) ? budget[0] : budget;
  if (budgetRow && budgetRow.allowed === false) return result; // monthly proactive-ops budget exhausted

  for (const detector of SIGNAL_DETECTORS) {
    if (detector.requiresConnector) continue; // registered, architecturally real, not evaluated (no data source yet)

    let detections: SignalDetectionResult[] = [];
    try {
      detections = await detector.evaluate(supabase, businessId);
    } catch (e) {
      console.error(`[proactiveOps] detector "${detector.key}" failed for ${businessId} — skipping, other detectors unaffected:`, e);
      continue;
    }

    const detectedKeys = new Set(detections.map((d) => d.dedupeKey));

    // Resolution: a previously-active signal from THIS detector that this
    // run did not reproduce means the condition genuinely cleared.
    const { data: existingActive } = await supabase
      .from("marketing_signals").select("dedupe_key")
      .eq("business_id", businessId).eq("detector_key", detector.key).eq("status", "active");
    for (const row of existingActive ?? []) {
      if (!detectedKeys.has(row.dedupe_key)) {
        const { error } = await supabase.rpc("resolve_marketing_signal_internal", {
          p_business_id: businessId, p_dedupe_key: row.dedupe_key,
        });
        if (!error) result.resolved++;
        else console.error(`[proactiveOps] resolve failed for ${detector.key}/${row.dedupe_key}:`, error);
      }
    }

    for (const d of detections) {
      const { data: upsertRows, error: upsertErr } = await supabase.rpc("upsert_marketing_signal_internal", {
        p_business_id: businessId, p_detector_key: detector.key, p_category: d.category, p_severity: d.severity,
        p_confidence: d.confidence, p_dedupe_key: d.dedupeKey, p_metric_label: d.metricLabel,
        p_metric_current: d.metricCurrent, p_metric_baseline: d.metricBaseline, p_change_pct: d.changePct,
        p_window_days: d.windowDays, p_data_source: d.dataSource, p_affected_objective: d.affectedObjective,
        p_affected_channel: d.affectedChannel, p_affected_campaign_id: d.affectedCampaignId, p_evidence: d.evidence,
        p_cooldown_hours: detector.cooldownHours,
      });
      if (upsertErr || !upsertRows?.[0]) {
        console.error(`[proactiveOps] upsert_marketing_signal_internal failed for ${detector.key}/${d.dedupeKey}:`, upsertErr);
        continue;
      }
      result.signalsUpserted++;
      const { signal_id, should_notify } = upsertRows[0] as { signal_id: string; is_new: boolean; should_notify: boolean };
      if (!should_notify) continue; // dedupe/cooldown — condition unchanged, don't re-notify (spec §7)

      const { data: findingId, error: findingErr } = await supabase.rpc("create_marketing_finding_internal", {
        p_business_id: businessId, p_signal_id: signal_id, p_title: d.findingTitle, p_summary: d.findingSummary,
        p_interpretation_source: "deterministic", p_confidence: d.confidence, p_evidence: d.evidence,
      });
      if (findingErr || !findingId) {
        console.error(`[proactiveOps] create_marketing_finding_internal failed for ${detector.key}/${d.dedupeKey}:`, findingErr);
        continue;
      }
      result.findingsCreated++;

      const { error: recErr } = await supabase.rpc("create_proactive_recommendation_internal", {
        p_business_id: businessId, p_finding_id: findingId, p_signal_id: signal_id,
        p_title: d.recommendationTitle, p_explanation: d.recommendationExplanation, p_action: d.recommendationAction,
        p_priority: d.priority, p_confidence: d.confidence, p_effort: d.effort, p_risk: d.risk,
        p_estimated_cost_usd: d.estimatedCostUsd, p_affected_objective: d.affectedObjective,
        p_proposed_mission: d.proposedMission, p_recommendation_type: "proactive", p_source: `signal:${detector.key}`,
      });
      if (recErr) console.error(`[proactiveOps] create_proactive_recommendation_internal failed for ${detector.key}/${d.dedupeKey}:`, recErr);
      else result.recommendationsCreated++;
    }
  }

  return result;
}
