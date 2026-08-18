// ─────────────────────────────────────────────────────────────────────────────
// weekly-report
//
// Generates a personalized weekly report for a creator or business.
// Queries the DB for the current week's activity, generates AI observations,
// caches the result in weekly_report_cache.
//
// Input: { user_id, role: "creator" | "business" }
// Output: { stats, ai_observations, week_label, cached }
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, requireAuth, AuthError } from "../_shared/security.ts";

const MODEL      = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1200;
const ANTHROPIC  = "https://api.anthropic.com/v1/messages";

type CreatorStats = {
  profile_views:       number;
  match_appearances:   number;
  applications_sent:   number;
  shortlisted:         number;
  saved_by_businesses: number;
  content_scheduled:   number;
  messages_received:   number;
};

type BusinessStats = {
  applications_received: number;
  creators_shortlisted:  number;
  creators_messaged:     number;
  matches_generated:     number;
  campaigns_active:      number;
  pipeline_updates:      number;
};

Deno.serve(async (req: Request) => {
  const CORS = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, supabaseKey);

    // Authenticate the caller and force the report to their own account —
    // never trust a user_id passed in the request body (previously this let
    // any logged-in user read another user's private weekly analytics).
    const authedUser = await requireAuth(req, db);
    const user_id = authedUser.id;

    const body = await req.json().catch(() => ({}));
    const { role } = body as { role: "creator" | "business" };

    // Week boundaries (Mon–Sun)
    const now       = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const monday    = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().slice(0, 10);
    const weekLabel = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      + " – " + now.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    // Check cache
    const { data: cached } = await db
      .from("weekly_report_cache")
      .select("*")
      .eq("user_id", user_id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (cached) {
      return new Response(JSON.stringify({
        stats:            cached.stats,
        ai_observations:  cached.ai_insights,
        week_label:       weekLabel,
        cached:           true,
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const weekAgo = monday.toISOString();

    let stats: CreatorStats | BusinessStats;

    if (role === "creator") {
      // Fetch creator profile id
      const { data: cp } = await db
        .from("creator_profiles")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      const creatorProfileId = cp?.id ?? null;

      const [viewsRes, matchRes, appsRes, shortlistRes, savedRes, contentRes, msgRes] = await Promise.all([
        // profile views this week
        creatorProfileId
          ? db.from("creator_analytics_events")
              .select("*", { count: "exact", head: true })
              .eq("creator_profile_id", creatorProfileId)
              .eq("event_type", "profile_viewed")
              .gte("created_at", weekAgo)
          : Promise.resolve({ count: 0 }),

        // match appearances
        creatorProfileId
          ? db.from("creator_analytics_events")
              .select("*", { count: "exact", head: true })
              .eq("creator_profile_id", creatorProfileId)
              .eq("event_type", "appeared_in_matching")
              .gte("created_at", weekAgo)
          : Promise.resolve({ count: 0 }),

        // applications sent
        db.from("campaign_applications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user_id)
          .gte("created_at", weekAgo),

        // shortlisted
        db.from("campaign_applications")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user_id)
          .eq("status", "shortlisted"),

        // saved by businesses
        creatorProfileId
          ? db.from("project_saved_creators")
              .select("*", { count: "exact", head: true })
              .eq("creator_profile_id", creatorProfileId)
              .gte("created_at", weekAgo)
          : Promise.resolve({ count: 0 }),

        // content scheduled
        db.from("content_planner_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user_id)
          .gte("date", weekStart),

        // messages received
        db.from("messages")
          .select("*", { count: "exact", head: true })
          .neq("sender_id", user_id)
          .gte("created_at", weekAgo),
      ]);

      stats = {
        profile_views:       viewsRes.count ?? 0,
        match_appearances:   matchRes.count ?? 0,
        applications_sent:   appsRes.count ?? 0,
        shortlisted:         shortlistRes.count ?? 0,
        saved_by_businesses: savedRes.count ?? 0,
        content_scheduled:   contentRes.count ?? 0,
        messages_received:   msgRes.count ?? 0,
      } satisfies CreatorStats;

    } else {
      // Business stats
      const [appsRes, shortlistRes, campsRes, msgRes, pipelineRes] = await Promise.all([
        // applications received this week
        db.from("campaign_applications")
          .select("campaign_id, status, created_at, campaigns!inner(user_id)")
          .eq("campaigns.user_id", user_id)
          .gte("created_at", weekAgo),

        // creators shortlisted
        db.from("campaign_applications")
          .select("campaign_id, status, campaigns!inner(user_id)")
          .eq("campaigns.user_id", user_id)
          .eq("status", "shortlisted"),

        // active campaigns
        db.from("campaigns")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user_id)
          .eq("status", "active"),

        // messages sent this week
        db.from("messages")
          .select("*", { count: "exact", head: true })
          .eq("sender_id", user_id)
          .gte("created_at", weekAgo),

        // pipeline updates
        db.from("campaign_applications")
          .select("campaign_id, status, updated_at, campaigns!inner(user_id)")
          .eq("campaigns.user_id", user_id)
          .gte("updated_at", weekAgo),
      ]);

      stats = {
        applications_received: appsRes.data?.length ?? 0,
        creators_shortlisted:  shortlistRes.data?.length ?? 0,
        campaigns_active:      campsRes.count ?? 0,
        creators_messaged:     msgRes.count ?? 0,
        pipeline_updates:      pipelineRes.data?.length ?? 0,
        matches_generated:     0,
      } satisfies BusinessStats;
    }

    // Generate AI observations
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    let aiObservations = "";

    if (apiKey) {
      const prompt = role === "creator"
        ? buildCreatorObservationsPrompt(stats as CreatorStats, weekLabel)
        : buildBusinessObservationsPrompt(stats as BusinessStats, weekLabel);

      try {
        const res = await fetch(ANTHROPIC, {
          method:  "POST",
          headers: {
            "x-api-key":         apiKey,
            "anthropic-version": "2023-06-01",
            "content-type":      "application/json",
          },
          body: JSON.stringify({
            model:      MODEL,
            max_tokens: MAX_TOKENS,
            messages:   [{ role: "user", content: prompt }],
          }),
        });
        if (res.ok) {
          const d = await res.json() as { content: Array<{ text: string }> };
          aiObservations = d.content[0]?.text?.trim() ?? "";
        }
      } catch {
        // Non-fatal; return without AI observations
      }
    }

    // Cache the report
    await db.from("weekly_report_cache").upsert({
      user_id,
      week_start:  weekStart,
      stats,
      ai_insights: aiObservations || null,
    }, { onConflict: "user_id,week_start" });

    return new Response(JSON.stringify({
      stats,
      ai_observations: aiObservations,
      week_label:      weekLabel,
      cached:          false,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

function buildCreatorObservationsPrompt(stats: CreatorStats, week: string): string {
  return `You are MRKT's analytics engine. Write 3 short, data-driven observations for a creator's weekly report.

Week: ${week}

Stats:
• Profile views: ${stats.profile_views}
• Appeared in AI matching: ${stats.match_appearances}
• Applications submitted: ${stats.applications_sent}
• Currently shortlisted: ${stats.shortlisted}
• Saved by businesses: ${stats.saved_by_businesses}
• Content scheduled: ${stats.content_scheduled}
• Messages received: ${stats.messages_received}

Rules:
- Each observation must reference a specific number from the data
- Be honest — if numbers are low, suggest improvement, don't sugarcoat
- One observation per line, no bullet points, no numbering
- Under 80 characters per line
- No generic motivational language
- Return plain text only, 3 lines`;
}

function buildBusinessObservationsPrompt(stats: BusinessStats, week: string): string {
  return `You are MRKT's analytics engine. Write 3 short, data-driven observations for a business's weekly report.

Week: ${week}

Stats:
• Applications received: ${stats.applications_received}
• Creators shortlisted: ${stats.creators_shortlisted}
• Active campaigns: ${stats.campaigns_active}
• Creators messaged: ${stats.creators_messaged}
• Pipeline updates: ${stats.pipeline_updates}

Rules:
- Each observation must reference a specific number from the data
- Be direct — if pipeline needs attention, say so clearly
- One observation per line, no bullet points, no numbering
- Under 80 characters per line
- No generic business-speak
- Return plain text only, 3 lines`;
}
