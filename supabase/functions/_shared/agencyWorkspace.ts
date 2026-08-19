// ─────────────────────────────────────────────────────────────────────────────
// Agency Workspace — pure read-time aggregation module (Phase 8)
//
// The operations floor. Introduces ZERO new storage and calculates NOTHING
// new about the business — every function here reads real, already-existing
// rows (campaigns, contracts, deliverables, payments, market_intelligence_findings,
// ai_recommendations, marketing_health_snapshots, executive_reports) and
// classifies/labels/buckets them. No AI calls anywhere in this file.
//
// "Department" is a classification applied at READ TIME to real rows, never
// a stored fact — this keeps every department's activity stream honest by
// construction: an item can only appear here if it's a real row somewhere
// else first.
// ─────────────────────────────────────────────────────────────────────────────

import { computeBusinessAnalytics } from "./analytics.ts";
import { buildIntelligenceSummary } from "./marketIntelligence.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type Department = "strategy" | "content" | "brand" | "growth" | "analytics";
export type WorkPriority = "critical" | "high" | "medium" | "low";

export interface ActivityItem {
  department: Department;
  title: string;
  evidence: string;
  occurredAt: string;
  sourceTable: string;
  sourceId: string;
  link: string | null;
}

export interface WorkQueueItem {
  id: string;
  title: string;
  explanation: string | null;
  action: string | null;
  priority: WorkPriority;
  source: string;
  createdAt: string;
  link: string | null;
}

export interface TodaysBriefing {
  completed: ActivityItem[];
  inProgress: ActivityItem[];
  blocked: ActivityItem[];
  needsAttention: ActivityItem[];
  whatsNext: WorkQueueItem[];
}

export interface TimelineItem extends ActivityItem {
  status: "completed" | "current" | "upcoming" | "blocked";
}

export interface DecisionLogItem {
  title: string;
  why: string | null;
  evidence: string | null;
  decidedAt: string;
  source: string;
  link: string | null;
}

const PRIORITY_RANK: Record<WorkPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function daysAgo(n: number): string { return new Date(Date.now() - n * 86_400_000).toISOString(); }
function isToday(iso: string): boolean { return iso.slice(0, 10) === new Date().toISOString().slice(0, 10); }

// ─── Today's Briefing — fully deterministic, zero AI ────────────────────────

export async function buildTodaysBriefing(supabase: SupabaseClient, businessId: string): Promise<TodaysBriefing> {
  const [
    { data: contracts }, { data: deliverables }, { data: payments },
    { data: campaigns }, { data: findings }, { data: recs },
  ] = await Promise.all([
    supabase.from("contracts").select("id, status, campaign_title, updated_at").eq("business_id", businessId).order("updated_at", { ascending: false }).limit(50),
    supabase.from("campaign_deliverable_submissions").select("id, status, campaign_id, updated_at").eq("business_id", businessId).order("updated_at", { ascending: false }).limit(50),
    supabase.from("campaign_payments").select("id, status, campaign_id, updated_at").eq("business_id", businessId).order("updated_at", { ascending: false }).limit(50),
    supabase.from("campaigns").select("id, title, created_at").eq("user_id", businessId).order("created_at", { ascending: false }).limit(10),
    supabase.from("market_intelligence_findings").select("id, title, category, type, created_at").eq("business_id", businessId).eq("status", "active").order("created_at", { ascending: false }).limit(20),
    supabase.from("ai_recommendations").select("id, title, explanation, action, priority, source, status, created_at, meta").eq("user_id", businessId).order("created_at", { ascending: false }).limit(100),
  ]);

  const completed: ActivityItem[] = [];
  const inProgress: ActivityItem[] = [];
  const blocked: ActivityItem[] = [];
  const needsAttention: ActivityItem[] = [];

  for (const c of contracts ?? []) {
    if (c.status === "accepted" && isToday(c.updated_at)) {
      completed.push({ department: "growth", title: `Contract accepted — ${c.campaign_title}`, evidence: "Creator signed the contract", occurredAt: c.updated_at, sourceTable: "contracts", sourceId: c.id, link: "/contracts" });
    } else if (c.status === "sent") {
      const item: ActivityItem = { department: "growth", title: `Contract awaiting signature — ${c.campaign_title}`, evidence: `Sent ${c.updated_at.slice(0, 10)}`, occurredAt: c.updated_at, sourceTable: "contracts", sourceId: c.id, link: "/contracts" };
      if (c.updated_at < daysAgo(3)) blocked.push(item); else inProgress.push(item);
    }
  }

  for (const d of deliverables ?? []) {
    if (d.status === "approved" && isToday(d.updated_at)) {
      completed.push({ department: "content", title: "Deliverable approved", evidence: "Content approved today", occurredAt: d.updated_at, sourceTable: "campaign_deliverable_submissions", sourceId: d.id, link: "/deliverables" });
    } else if (d.status === "submitted") {
      const item: ActivityItem = { department: "content", title: "Deliverable awaiting review", evidence: `Submitted ${d.updated_at.slice(0, 10)}`, occurredAt: d.updated_at, sourceTable: "campaign_deliverable_submissions", sourceId: d.id, link: "/deliverables" };
      if (d.updated_at < daysAgo(5)) blocked.push(item); else inProgress.push(item);
    }
  }

  for (const p of payments ?? []) {
    if ((p.status === "paid" || p.status === "payout_completed") && isToday(p.updated_at)) {
      completed.push({ department: "analytics", title: "Payment completed", evidence: `Status: ${p.status}`, occurredAt: p.updated_at, sourceTable: "campaign_payments", sourceId: p.id, link: "/payments" });
    }
  }

  for (const c of campaigns ?? []) {
    if (isToday(c.created_at)) {
      needsAttention.push({ department: "strategy", title: `New campaign — ${c.title}`, evidence: "Created today", occurredAt: c.created_at, sourceTable: "campaigns", sourceId: c.id, link: "/campaigns" });
    }
  }

  for (const f of findings ?? []) {
    if (isToday(f.created_at) && (f.type === "threat" || f.type === "competitor")) {
      needsAttention.push({ department: "growth", title: f.title, evidence: `New ${f.category.replace(/_/g, " ")} finding today`, occurredAt: f.created_at, sourceTable: "market_intelligence_findings", sourceId: f.id, link: "/marketing-hub/intelligence" });
    }
  }

  for (const r of recs ?? []) {
    if (r.status === "active" && (r.priority === "critical" || r.priority === "high") && isToday(r.created_at)) {
      needsAttention.push({ department: departmentForSource(r.source), title: r.title, evidence: r.explanation ?? "New high-priority recommendation today", occurredAt: r.created_at, sourceTable: "ai_recommendations", sourceId: r.id, link: r.meta?.link ?? null });
    }
    if (r.status === "active" && r.created_at < daysAgo(14)) {
      blocked.push({ department: departmentForSource(r.source), title: r.title, evidence: `Open since ${r.created_at.slice(0, 10)}, untouched`, occurredAt: r.created_at, sourceTable: "ai_recommendations", sourceId: r.id, link: r.meta?.link ?? null });
    }
  }

  const activeRecs = (recs ?? []).filter((r: { status: string }) => r.status === "active");
  const whatsNext: WorkQueueItem[] = activeRecs
    .map((r: { id: string; title: string; explanation: string | null; action: string | null; priority: WorkPriority; source: string; created_at: string; meta: { link?: string } | null }) => ({
      id: r.id, title: r.title, explanation: r.explanation, action: r.action, priority: r.priority, source: r.source, createdAt: r.created_at, link: r.meta?.link ?? null,
    }))
    .sort((a: WorkQueueItem, b: WorkQueueItem) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, 5);

  return { completed, inProgress, blocked, needsAttention, whatsNext };
}

function departmentForSource(source: string | null): Department {
  if (source === "market_intelligence") return "growth";
  if (source === "marketing_health") return "analytics";
  if (source === "executive_reports") return "strategy";
  return "strategy"; // ai_strategist and any other default
}

// ─── Department Activity ─────────────────────────────────────────────────────

export async function buildDepartmentActivity(supabase: SupabaseClient, businessId: string): Promise<Record<Department, ActivityItem[]>> {
  const [
    { data: briefings }, { data: healthSnapshots }, { data: assets }, { data: contentItems },
    { data: recs }, { data: findings }, { data: healthScores },
  ] = await Promise.all([
    supabase.from("marketing_hub_briefings").select("period_start, briefing, generated_at").eq("user_id", businessId).order("period_start", { ascending: false }).limit(2),
    supabase.from("marketing_health_snapshots").select("period_start, snapshot, generated_at").eq("business_id", businessId).order("period_start", { ascending: false }).limit(2),
    supabase.from("generated_assets").select("id, created_at").eq("user_id", businessId).order("created_at", { ascending: false }).limit(5),
    supabase.from("content_planner_items").select("id, title, status, updated_at").eq("user_id", businessId).order("updated_at", { ascending: false }).limit(5),
    supabase.from("ai_recommendations").select("id, title, explanation, source, recommendation_type, created_at, meta").eq("user_id", businessId).order("created_at", { ascending: false }).limit(20),
    supabase.from("market_intelligence_findings").select("id, title, summary, category, created_at").eq("business_id", businessId).eq("status", "active").order("created_at", { ascending: false }).limit(10),
    supabase.from("campaign_health_scores").select("campaign_id, score, computed_at").eq("user_id", businessId).order("computed_at", { ascending: false }).limit(5),
  ]);

  const activity: Record<Department, ActivityItem[]> = { strategy: [], content: [], brand: [], growth: [], analytics: [] };

  // Strategy — health-score delta between the two most recent briefings, real ai_strategist recs
  const b = briefings ?? [];
  if (b.length === 2 && b[0].briefing?.health?.score !== undefined && b[1].briefing?.health?.score !== undefined) {
    const delta = b[0].briefing.health.score - b[1].briefing.health.score;
    if (delta !== 0) {
      activity.strategy.push({ department: "strategy", title: `Overall business health ${delta > 0 ? "improved" : "declined"} ${Math.abs(delta)} points`, evidence: `${b[1].briefing.health.score} → ${b[0].briefing.health.score}`, occurredAt: b[0].generated_at, sourceTable: "marketing_hub_briefings", sourceId: b[0].period_start, link: "/marketing-hub" });
    }
  }
  for (const r of (recs ?? []).filter((r: { source: string }) => r.source === "ai_strategist").slice(0, 5)) {
    activity.strategy.push({ department: "strategy", title: r.title, evidence: r.explanation ?? "", occurredAt: r.created_at, sourceTable: "ai_recommendations", sourceId: r.id, link: r.meta?.link ?? "/marketing-hub" });
  }

  // Content — real asset generations, real content-item status changes
  for (const a of assets ?? []) {
    activity.content.push({ department: "content", title: "New creative asset generated", evidence: "", occurredAt: a.created_at, sourceTable: "generated_assets", sourceId: a.id, link: "/marketing-hub/content" });
  }
  for (const c of contentItems ?? []) {
    activity.content.push({ department: "content", title: `${c.title} — ${c.status}`, evidence: "", occurredAt: c.updated_at, sourceTable: "content_planner_items", sourceId: c.id, link: "/content-planner" });
  }

  // Brand — Brand Health category delta, reputation-sentiment findings
  const h = healthSnapshots ?? [];
  if (h.length === 2) {
    const brandNow = h[0].snapshot?.health?.categories?.find((c: { category: string }) => c.category === "brand");
    const brandPrior = h[1].snapshot?.health?.categories?.find((c: { category: string }) => c.category === "brand");
    if (brandNow?.score != null && brandPrior?.score != null && brandNow.score !== brandPrior.score) {
      const delta = brandNow.score - brandPrior.score;
      activity.brand.push({ department: "brand", title: `Brand Health ${delta > 0 ? "improved" : "declined"} ${Math.abs(delta)} points`, evidence: `${brandPrior.score} → ${brandNow.score}`, occurredAt: h[0].generated_at, sourceTable: "marketing_health_snapshots", sourceId: h[0].period_start, link: "/marketing-hub/health" });
    }
  }
  for (const f of (findings ?? []).filter((f: { category: string }) => f.category === "reputation_sentiment")) {
    activity.brand.push({ department: "brand", title: f.title, evidence: f.summary, occurredAt: f.created_at, sourceTable: "market_intelligence_findings", sourceId: f.id, link: "/marketing-hub/intelligence" });
  }

  // Growth — real opportunity recommendations, real Market Intelligence opportunities
  for (const r of (recs ?? []).filter((r: { recommendation_type: string }) => r.recommendation_type === "opportunity").slice(0, 5)) {
    activity.growth.push({ department: "growth", title: r.title, evidence: r.explanation ?? "", occurredAt: r.created_at, sourceTable: "ai_recommendations", sourceId: r.id, link: r.meta?.link ?? "/marketing-hub/growth" });
  }
  const intel = await buildIntelligenceSummary(supabase, businessId);
  for (const o of intel?.topOpportunities ?? []) {
    activity.growth.push({ department: "growth", title: o.title, evidence: o.summary, occurredAt: intel!.asOf, sourceTable: "market_intelligence_findings", sourceId: o.title, link: "/marketing-hub/intelligence" });
  }

  // Analytics — campaign health-score changes, overall Marketing Health delta
  for (const s of healthScores ?? []) {
    activity.analytics.push({ department: "analytics", title: `Campaign health score: ${s.score}/100`, evidence: "", occurredAt: s.computed_at, sourceTable: "campaign_health_scores", sourceId: s.campaign_id, link: "/marketing-hub/campaigns" });
  }
  if (h.length === 2 && h[0].snapshot?.health?.overall?.score != null && h[1].snapshot?.health?.overall?.score != null) {
    const delta = h[0].snapshot.health.overall.score - h[1].snapshot.health.overall.score;
    if (delta !== 0) {
      activity.analytics.push({ department: "analytics", title: `Marketing Health ${delta > 0 ? "improved" : "declined"} ${Math.abs(delta)} points`, evidence: `${h[1].snapshot.health.overall.score} → ${h[0].snapshot.health.overall.score}`, occurredAt: h[0].generated_at, sourceTable: "marketing_health_snapshots", sourceId: h[0].period_start, link: "/marketing-hub/health" });
    }
  }

  return activity;
}

// ─── Unified Work Queue — reads ai_recommendations directly, no new table ───

export async function buildWorkQueue(supabase: SupabaseClient, businessId: string): Promise<WorkQueueItem[]> {
  const { data: recs } = await supabase
    .from("ai_recommendations")
    .select("id, title, explanation, action, priority, source, created_at, meta")
    .eq("user_id", businessId).eq("status", "active")
    .order("created_at", { ascending: false });

  return (recs ?? [])
    .map((r: { id: string; title: string; explanation: string | null; action: string | null; priority: WorkPriority; source: string; created_at: string; meta: { link?: string } | null }) => ({
      id: r.id, title: r.title, explanation: r.explanation, action: r.action, priority: r.priority, source: r.source, createdAt: r.created_at, link: r.meta?.link ?? null,
    }))
    .sort((a: WorkQueueItem, b: WorkQueueItem) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

// ─── Timeline — re-presents the same activity + work queue, no new data ─────

export async function buildTimeline(supabase: SupabaseClient, businessId: string): Promise<TimelineItem[]> {
  const activity = await buildDepartmentActivity(supabase, businessId);
  const all = Object.values(activity).flat();
  const items: TimelineItem[] = all.map((a) => ({ ...a, status: "current" as const }));
  return items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

// ─── Decision Log — real completed recommendations + real report recommendations ─

export async function buildDecisionLog(supabase: SupabaseClient, businessId: string): Promise<DecisionLogItem[]> {
  const [{ data: completedRecs }, { data: reports }] = await Promise.all([
    supabase.from("ai_recommendations").select("id, title, explanation, action, source, created_at, meta").eq("user_id", businessId).eq("status", "completed").order("created_at", { ascending: false }).limit(20),
    supabase.from("executive_reports").select("id, report_type, period_start, priority_recommendation, generated_at").eq("business_id", businessId).order("period_start", { ascending: false }).limit(10),
  ]);

  const fromRecs: DecisionLogItem[] = (completedRecs ?? []).map((r: { id: string; title: string; explanation: string | null; action: string | null; source: string; created_at: string; meta: { link?: string } | null }) => ({
    title: r.title, why: r.explanation, evidence: r.action, decidedAt: r.created_at, source: r.source, link: r.meta?.link ?? null,
  }));

  const fromReports: DecisionLogItem[] = (reports ?? []).map((r: { id: string; report_type: string; period_start: string; priority_recommendation: string; generated_at: string }) => ({
    title: r.priority_recommendation, why: `From the ${r.report_type.replace("_", " ")} for ${r.period_start}`, evidence: null, decidedAt: r.generated_at, source: "executive_reports", link: "/marketing-hub/reports",
  }));

  return [...fromRecs, ...fromReports].sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1));
}

// ─── Deterministic priority promotion — used by the two fan-out points ──────
// A real threshold, not AI preference. Score < 25 on a category/overall scale
// is the same "genuinely severe" cutoff used consistently across both callers.

export function priorityForHealthScore(score: number | null): WorkPriority {
  if (score === null) return "medium";
  return score < 25 ? "critical" : "high";
}
