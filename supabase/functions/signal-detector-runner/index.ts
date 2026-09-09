// ─────────────────────────────────────────────────────────────────────────────
// signal-detector-runner (Phase P)
//
// The proactive-operations cron tick. Internal-only (requireServiceRole) —
// invoked by the phase-p-signal-detector cron every 30 minutes. Never
// invoked directly by a client.
//
// Bounded, business-scoped, cost-aware, observable (spec §31):
//   1. Selects a small, round-robin batch of business accounts (ordered by
//      last_signal_scan_at, oldest/never-scanned first) — every business
//      gets scanned roughly once per full cycle, not every tick.
//   2. For each, runs every registered SignalDetector via
//      runSignalDetectionForBusiness (proactiveOps.ts) — one business's
//      failure never blocks another (each wrapped in its own try/catch).
//   3. Marks each scanned business's last_signal_scan_at = now(), so the
//      next tick picks up a different batch.
//
// Deliberately NOT a leased/SKIP-LOCKED queue like mission-task-runner's
// task claiming — there is no concurrent-worker correctness problem here
// (one cron invocation, sequential, idempotent upserts), so the simpler
// round-robin cursor is the right amount of machinery, not less-tested
// borrowed complexity for a different problem shape.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonOk, jsonErr, AuthError, requireServiceRole } from "../_shared/security.ts";
import { runSignalDetectionForBusiness } from "../_shared/proactiveOps.ts";

const BATCH_LIMIT = 25;

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

    // Same "is this a business account" gate as cmo-create-mission, applied
    // here to decide who's even eligible for proactive scanning.
    const { data: businesses, error: bizErr } = await supabase
      .from("profiles")
      .select("id, account_type, onboarding_path")
      .or("account_type.eq.brand,account_type.eq.business,account_type.eq.agency,onboarding_path.eq.business_creator,onboarding_path.eq.business_marketing")
      .limit(500); // cheap identity query, not the cost driver — the cursor below bounds real work

    if (bizErr) {
      console.error("[signal-detector-runner] business list query failed:", bizErr);
      return jsonErr("Could not list businesses", req, 500);
    }

    const businessIds = (businesses ?? []).map((b: { id: string }) => b.id);
    if (businessIds.length === 0) return jsonOk({ scanned: 0 }, req);

    // Ensure every eligible business has an autonomy-policy row (same lazy
    // upsert cmo-create-mission already does) so the round-robin cursor has
    // something to order by for a business that's never created a Mission.
    await supabase.from("business_autonomy_policy")
      .upsert(businessIds.map((id: string) => ({ business_id: id })), { onConflict: "business_id", ignoreDuplicates: true });

    const { data: cursorRows } = await supabase
      .from("business_autonomy_policy")
      .select("business_id, last_signal_scan_at")
      .in("business_id", businessIds)
      .order("last_signal_scan_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT);

    const batch = (cursorRows ?? []).map((r: { business_id: string }) => r.business_id);

    let signalsUpserted = 0, findingsCreated = 0, recommendationsCreated = 0, resolved = 0, failures = 0;
    for (const businessId of batch) {
      try {
        const r = await runSignalDetectionForBusiness(supabase, businessId);
        signalsUpserted += r.signalsUpserted;
        findingsCreated += r.findingsCreated;
        recommendationsCreated += r.recommendationsCreated;
        resolved += r.resolved;
      } catch (e) {
        failures++;
        console.error(`[signal-detector-runner] detection failed for business ${businessId} — other businesses unaffected:`, e);
      } finally {
        await supabase.from("business_autonomy_policy")
          .update({ last_signal_scan_at: new Date().toISOString() })
          .eq("business_id", businessId);
      }
    }

    return jsonOk({
      scanned: batch.length, signals_upserted: signalsUpserted, findings_created: findingsCreated,
      recommendations_created: recommendationsCreated, resolved, failures,
    }, req);
  } catch (e) {
    console.error("[signal-detector-runner] unhandled error:", e);
    return jsonErr("Internal error", req, 500);
  }
});
