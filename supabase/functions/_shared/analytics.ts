// ─────────────────────────────────────────────────────────────────────────────
// MRKT Analytics Engine  (shared module — imported by every edge function)
//
// Single source of truth for a business's deterministic marketing metrics.
// Every future Marketing Hub section (Marketing Health, Reports, Market
// Intelligence's own reasoning) should call computeBusinessAnalytics() rather
// than re-deriving these numbers — that's the whole point of this module.
//
// Architecture, per the AI Marketing Team audit:
//   Real Data → Analytics Engine (this file, zero AI, zero cost) → AI Interpretation
// NOT: Small Data Payload → LLM → Made-Up Analytics.
//
// Every metric is shaped { value, evidence, sampleSize } — self-documenting by
// construction, so any caller building an AI prompt or an evidence-backed
// recommendation already has a human-readable citation for the number, not
// just the number. A metric is `null` (never a fabricated 0 or average) when
// there isn't enough real data to compute it honestly — e.g. no budget stated
// yet, no reviews yet, fewer than 14 days of daily-metrics history for a trend.
//
// This module is self-contained (fetches its own rows given only a userId) so
// any function can call it without first assembling its own query set — the
// tradeoff is that a caller which ALSO needs the raw campaign/application rows
// for its own purposes (e.g. marketing-hub-briefing's Campaign Center summaries)
// will query some of the same tables a second time. Accepted for now in favor
// of "any consumer just needs a userId" — worth revisiting if it becomes a
// real cost, not before.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface Metric {
  value: number;
  evidence: string;
  sampleSize: number;
}

export interface CampaignHealthSummary {
  campaignId: string;
  title: string;
  score: number;
}

export interface TrendWindow {
  current: number;
  prior: number;
  deltaPct: number | null; // null when prior === 0 (can't express a % change)
}

export interface BusinessAnalytics {
  campaignFillRate: Metric | null;
  creatorAcceptanceRate: Metric | null;
  deadlineAdherence: Metric | null;
  contractConversion: Metric | null;
  budgetUtilization: Metric | null;
  repeatCreatorRate: Metric | null;
  reviewQuality: Metric | null;
  contentVolume: Metric;
  avgCampaignDurationDays: Metric | null;
  campaignVelocity: Metric;
  matchWinRate: Metric | null;
  rehireRate: Metric | null;
  campaignHealth: { avgScore: number | null; perCampaign: CampaignHealthSummary[] };
  trend: { applications: TrendWindow; messages: TrendWindow; pipelineUpdates: TrendWindow } | null;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; // one decimal place
}

export async function computeBusinessAnalytics(supabase: SupabaseClient, userId: string): Promise<BusinessAnalytics> {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86400000).toISOString();

  const [
    { data: campaigns },
    { data: applications },
    { data: contracts },
    { data: deliverables },
    { data: payments },
    { data: reviews },
    { data: assets },
    { data: contentItems },
    { data: matchOutcomes },
    { data: healthScores },
    { data: dailyMetrics },
  ] = await Promise.all([
    supabase.from("campaigns").select("id, title, status, is_published, created_at, updated_at, compensation_type, compensation_amount_fixed, compensation_budget_min, compensation_budget_max").eq("user_id", userId),
    supabase.from("campaign_applications").select("campaign_id, status").in("campaign_id",
      (await supabase.from("campaigns").select("id").eq("user_id", userId)).data?.map((c: { id: string }) => c.id) ?? []),
    supabase.from("contracts").select("status, creator_id, business_id").eq("business_id", userId),
    supabase.from("campaign_deliverable_submissions").select("status, submitted_at, deadline").eq("business_id", userId),
    supabase.from("campaign_payments").select("status, gross_amount_cents, campaign_id").eq("business_id", userId),
    supabase.from("reviews").select("rating").eq("reviewed_user_id", userId),
    supabase.from("generated_assets").select("id, created_at").eq("user_id", userId).gte("created_at", days(30)),
    supabase.from("content_planner_items").select("id, created_at").eq("user_id", userId).gte("created_at", days(30)),
    supabase.from("match_outcomes").select("was_accepted, was_rehired, creator_profile_id").eq("business_user_id", userId),
    supabase.from("campaign_health_scores").select("campaign_id, score").eq("user_id", userId),
    supabase.from("business_daily_metrics").select("metric_date, applications_received, messages_sent, pipeline_updates").eq("user_id", userId).order("metric_date", { ascending: false }).limit(30),
  ]);

  const camps = campaigns ?? [];
  const publishedCamps = camps.filter((c: { is_published: boolean }) => c.is_published);
  const apps = applications ?? [];

  // ── Campaign fill rate: of published campaigns, how many got ≥1 application ──
  let campaignFillRate: Metric | null = null;
  if (publishedCamps.length > 0) {
    const withApps = new Set(apps.map((a: { campaign_id: string }) => a.campaign_id));
    const filled = publishedCamps.filter((c: { id: string }) => withApps.has(c.id)).length;
    campaignFillRate = { value: pct(filled, publishedCamps.length), sampleSize: publishedCamps.length,
      evidence: `${filled} of ${publishedCamps.length} published campaigns received at least one application` };
  }

  // ── Creator acceptance rate ───────────────────────────────────────────────
  let creatorAcceptanceRate: Metric | null = null;
  if (apps.length > 0) {
    const accepted = apps.filter((a: { status: string }) => a.status === "accepted").length;
    creatorAcceptanceRate = { value: pct(accepted, apps.length), sampleSize: apps.length,
      evidence: `${accepted} of ${apps.length} applications accepted` };
  }

  // ── Deadline adherence ────────────────────────────────────────────────────
  const delivs = (deliverables ?? []).filter((d: { submitted_at: string | null; deadline: string | null }) => d.submitted_at && d.deadline);
  let deadlineAdherence: Metric | null = null;
  if (delivs.length > 0) {
    const onTime = delivs.filter((d: { submitted_at: string; deadline: string }) => new Date(d.submitted_at) <= new Date(d.deadline)).length;
    deadlineAdherence = { value: pct(onTime, delivs.length), sampleSize: delivs.length,
      evidence: `${onTime} of ${delivs.length} deliverables submitted on or before their deadline` };
  }

  // ── Contract conversion: of contracts that reached "sent", how many accepted ─
  const reachedSent = (contracts ?? []).filter((c: { status: string }) => c.status === "sent" || c.status === "accepted" || c.status === "declined");
  let contractConversion: Metric | null = null;
  if (reachedSent.length > 0) {
    const accepted = reachedSent.filter((c: { status: string }) => c.status === "accepted").length;
    contractConversion = { value: pct(accepted, reachedSent.length), sampleSize: reachedSent.length,
      evidence: `${accepted} of ${reachedSent.length} sent contracts were accepted` };
  }

  // ── Budget utilization: real paid amount vs. stated campaign budgets ─────
  const paidCents = (payments ?? []).filter((p: { status: string }) => p.status === "paid" || p.status === "payout_completed")
    .reduce((s: number, p: { gross_amount_cents: number }) => s + (p.gross_amount_cents ?? 0), 0);
  const statedBudget = camps.reduce((s: number, c: { compensation_amount_fixed: number | null; compensation_budget_max: number | null }) =>
    s + (c.compensation_amount_fixed ?? c.compensation_budget_max ?? 0), 0);
  let budgetUtilization: Metric | null = null;
  if (statedBudget > 0) {
    const paidDollars = paidCents / 100;
    budgetUtilization = { value: pct(paidDollars, statedBudget), sampleSize: camps.length,
      evidence: `$${paidDollars.toLocaleString()} paid against $${statedBudget.toLocaleString()} in stated campaign budgets` };
  }

  // ── Repeat creator rate: creators with >1 accepted contract with this business ─
  const acceptedByCreator: Record<string, number> = {};
  for (const c of (contracts ?? []).filter((c: { status: string }) => c.status === "accepted")) {
    acceptedByCreator[c.creator_id] = (acceptedByCreator[c.creator_id] ?? 0) + 1;
  }
  const distinctCreators = Object.keys(acceptedByCreator).length;
  let repeatCreatorRate: Metric | null = null;
  if (distinctCreators > 0) {
    const repeat = Object.values(acceptedByCreator).filter((n) => n > 1).length;
    repeatCreatorRate = { value: pct(repeat, distinctCreators), sampleSize: distinctCreators,
      evidence: `${repeat} of ${distinctCreators} creators worked with more than once` };
  }

  // ── Review-based quality (ratings received from creators) ────────────────
  let reviewQuality: Metric | null = null;
  if (reviews && reviews.length > 0) {
    const avg = reviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / reviews.length;
    reviewQuality = { value: Math.round(avg * 10) / 10, sampleSize: reviews.length,
      evidence: `average ${Math.round(avg * 10) / 10}★ across ${reviews.length} review${reviews.length === 1 ? "" : "s"} from creators` };
  }

  // ── Content production volume (last 30 days) — always real, can be 0 ─────
  const assetCount = (assets ?? []).length;
  const contentCount = (contentItems ?? []).length;
  const contentVolume: Metric = { value: assetCount + contentCount, sampleSize: assetCount + contentCount,
    evidence: `${assetCount} asset${assetCount === 1 ? "" : "s"} generated and ${contentCount} content piece${contentCount === 1 ? "" : "s"} scheduled in the last 30 days` };

  // ── Average campaign duration (closed/completed campaigns only) ──────────
  // Caveat: campaigns has no explicit completion timestamp — updated_at is
  // used as a proxy for when a closed/completed campaign last changed state.
  const closedCamps = camps.filter((c: { status: string }) => c.status === "closed" || c.status === "completed");
  let avgCampaignDurationDays: Metric | null = null;
  if (closedCamps.length > 0) {
    const totalDays = closedCamps.reduce((s: number, c: { created_at: string; updated_at: string }) =>
      s + (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 86400000, 0);
    avgCampaignDurationDays = { value: Math.round(totalDays / closedCamps.length), sampleSize: closedCamps.length,
      evidence: `average of ${Math.round(totalDays / closedCamps.length)} days across ${closedCamps.length} closed/completed campaign${closedCamps.length === 1 ? "" : "s"} (proxy: updated_at − created_at)` };
  }

  // ── Campaign velocity (last 90 days) ──────────────────────────────────────
  const recent90 = camps.filter((c: { created_at: string }) => new Date(c.created_at) >= new Date(days(90))).length;
  const campaignVelocity: Metric = { value: Math.round((recent90 / 3) * 10) / 10, sampleSize: recent90,
    evidence: `${recent90} campaign${recent90 === 1 ? "" : "s"} launched in the last 90 days (~${Math.round((recent90 / 3) * 10) / 10}/month)` };

  // ── Match outcomes (now populated by the Phase 4C triggers) ──────────────
  const outcomes = matchOutcomes ?? [];
  let matchWinRate: Metric | null = null;
  let rehireRate: Metric | null = null;
  if (outcomes.length > 0) {
    const wins = outcomes.filter((m: { was_accepted: boolean }) => m.was_accepted).length;
    matchWinRate = { value: pct(wins, outcomes.length), sampleSize: outcomes.length,
      evidence: `${wins} of ${outcomes.length} creator matches were accepted` };

    const hired = outcomes.filter((m: { was_accepted: boolean }) => m.was_accepted);
    if (hired.length > 0) {
      const rehired = hired.filter((m: { was_rehired: boolean }) => m.was_rehired).length;
      rehireRate = { value: pct(rehired, hired.length), sampleSize: hired.length,
        evidence: `${rehired} of ${hired.length} hired creators were brought back for a second collaboration` };
    }
  }

  // ── Campaign health (compute_campaign_health, now wired) ─────────────────
  const healthRows = healthScores ?? [];
  const titleById = new Map(camps.map((c: { id: string; title: string }) => [c.id, c.title]));
  const perCampaign: CampaignHealthSummary[] = healthRows.map((h: { campaign_id: string; score: number }) => ({
    campaignId: h.campaign_id, title: (titleById.get(h.campaign_id) as string) ?? "Untitled campaign", score: h.score,
  }));
  const avgHealth = healthRows.length > 0
    ? Math.round(healthRows.reduce((s: number, h: { score: number }) => s + h.score, 0) / healthRows.length)
    : null;

  // ── Trend (business_daily_metrics, now cron-populated) — null until ≥14 days
  //    of real history exist, never a fabricated delta from thin data ───────
  const daily = dailyMetrics ?? [];
  let trend: BusinessAnalytics["trend"] = null;
  if (daily.length >= 14) {
    const last7 = daily.slice(0, 7);
    const prior7 = daily.slice(7, 14);
    const sum = (rows: typeof daily, key: "applications_received" | "messages_sent" | "pipeline_updates") =>
      rows.reduce((s: number, r: Record<string, number>) => s + (r[key] ?? 0), 0);
    const window = (key: "applications_received" | "messages_sent" | "pipeline_updates"): TrendWindow => {
      const current = sum(last7, key);
      const prior = sum(prior7, key);
      return { current, prior, deltaPct: prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : null };
    };
    trend = { applications: window("applications_received"), messages: window("messages_sent"), pipelineUpdates: window("pipeline_updates") };
  }

  return {
    campaignFillRate, creatorAcceptanceRate, deadlineAdherence, contractConversion,
    budgetUtilization, repeatCreatorRate, reviewQuality, contentVolume,
    avgCampaignDurationDays, campaignVelocity, matchWinRate, rehireRate,
    campaignHealth: { avgScore: avgHealth, perCampaign },
    trend,
  };
}
