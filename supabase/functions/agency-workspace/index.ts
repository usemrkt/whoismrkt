// ─────────────────────────────────────────────────────────────────────────────
// agency-workspace
//
// The operations floor (Phase 8) — the final orchestration layer. Introduces
// zero new storage and zero AI calls: everything here is a read-time
// aggregation over rows every other Marketing Hub system already writes
// (_shared/agencyWorkspace.ts owns the classification logic). No fake
// collaboration, no simulated conversations — every item traces back to a
// real row in a real table via sourceTable/sourceId/link.
//
// GET/POST /functions/v1/agency-workspace
// Returns: { briefing, departmentActivity, workQueue, timeline, decisionLog, generated_at }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, isRateLimited, DEFAULT_API_RATE, requireAuth, jsonOk, jsonErr, AuthError } from "../_shared/security.ts";
import {
  buildTodaysBriefing, buildDepartmentActivity, buildWorkQueue, buildTimeline, buildDecisionLog,
} from "../_shared/agencyWorkspace.ts";

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey      = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient    = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    let user: { id: string };
    try {
      user = await requireAuth(req, authClient);
    } catch (e) {
      if (e instanceof AuthError) return jsonErr(e.message, req, 401);
      throw e;
    }

    // No AI call anywhere in this function — a generous, general-purpose
    // rate limit is enough (no credit gate needed either; nothing here costs money).
    if (isRateLimited(`agency-workspace:${user.id}`, DEFAULT_API_RATE)) {
      return jsonErr("Too many requests. Please wait a moment and try again.", req, 429);
    }

    const { data: profile } = await serviceClient
      .from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle();
    const isBusiness = profile?.account_type === "brand" || profile?.account_type === "business" || profile?.account_type === "agency"
      || profile?.onboarding_path === "business_creator" || profile?.onboarding_path === "business_marketing";
    if (!isBusiness) return jsonErr("Agency Workspace is available for business accounts.", req, 403);

    const [briefing, departmentActivity, workQueue, timeline, decisionLog] = await Promise.all([
      buildTodaysBriefing(serviceClient, user.id),
      buildDepartmentActivity(serviceClient, user.id),
      buildWorkQueue(serviceClient, user.id),
      buildTimeline(serviceClient, user.id),
      buildDecisionLog(serviceClient, user.id),
    ]);

    return jsonOk({ briefing, departmentActivity, workQueue, timeline, decisionLog, generated_at: new Date().toISOString() }, req);

  } catch (err) {
    console.error("agency-workspace error:", err);
    return jsonErr(err instanceof Error ? err.message : "Failed to load Agency Workspace.", req, 500);
  }
});
