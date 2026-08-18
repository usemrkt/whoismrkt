// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub — Marketing Hub
// Business only. The AI-orchestrated intelligence layer on top of every
// existing MRKT module: reads campaigns, pipeline, contracts, deliverables,
// match history, messages and Brand Knowledge, and turns them into one daily
// strategic briefing. Nothing here replaces an existing page — every card
// links out to the real module (Pipeline, Campaigns, Content Planner, Chat).
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Compass, RefreshCw, Loader2, ChevronRight, Sparkles,
  Target, TrendingUp, Megaphone, ListChecks, Users2,
  CalendarDays, FileBarChart, ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/marketing-hub")({
  head: () => ({ meta: [{ title: "Marketing Hub — MRKT" }] }),
  component: MarketingHubPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";
type BriefingItem = { title: string; why: string; action: string; link: string; priority: Priority };
type Briefing = {
  health: { score: number; summary: string };
  weekly_priorities: BriefingItem[];
  opportunities: BriefingItem[];
  campaign_suggestions: BriefingItem[];
  performance_highlights: string[];
  competitor_notes: BriefingItem[] | null;
};
type ActionCenterItem = { label: string; link: string };
type BriefingResponse = { briefing: Briefing; action_center: ActionCenterItem[]; generated_at: string; cached: boolean };

type CalendarItem = { title: string; platform: string; content_type: string; scheduled_date: string; status: string };

type WeeklyReportData = { week_label: string; ai_observations: string; stats: Record<string, number> };

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function priorityColors(p: Priority) {
  if (p === "high")   return { fg: C.red,    bg: C.redMuted,    bdr: C.redBorder };
  if (p === "medium") return { fg: C.amber,  bg: C.amberMuted,  bdr: C.amberBorder };
  return { fg: C.aiBlue, bg: C.accentMuted, bdr: C.aiBlueBorder };
}

function askAIAbout(item: BriefingItem, navigate: ReturnType<typeof useNavigate>) {
  const prompt = `From my Marketing Hub: "${item.title}". ${item.why} Help me act on this now.`;
  localStorage.setItem("mrkt_prefill_prompt", prompt);
  navigate({ to: "/chat" });
}

// ── Briefing item card (priorities / opportunities / campaign ideas / competitor notes) ──

function BriefingCard({ item }: { item: BriefingItem }) {
  const navigate = useNavigate();
  const { fg, bg, bdr } = priorityColors(item.priority);
  return (
    <div style={{ padding: "13px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.015em", flex: 1 }}>{item.title}</div>
        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
          {item.priority}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.55, marginBottom: 10 }}>{item.why}</div>
      <div className="flex items-center gap-3">
        <Link to={item.link as "/"} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>
          {item.action} <ChevronRight size={12} />
        </Link>
        <button
          onClick={() => askAIAbout(item, navigate)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.textMuted, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 8, padding: "3px 9px", cursor: "pointer" }}
        >
          <Sparkles size={11} /> Ask AI Strategist
        </button>
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
      <Icon size={14} style={{ color: C.textTertiary }} />
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>{label}</div>
      {typeof count === "number" && <div style={{ fontSize: 11, color: C.textQuaternary }}>({count})</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function MarketingHubPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [accessChecked, setAccessChecked] = useState(false);
  const [isBusiness, setIsBusiness]       = useState(false);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [data, setData]             = useState<BriefingResponse | null>(null);

  const [calendar, setCalendar]           = useState<CalendarItem[]>([]);
  const [weeklyReport, setWeeklyReport]   = useState<WeeklyReportData | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // ── Business-only gate (mirrors brand-knowledge.tsx) ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle();
      const biz = !!p && (p.account_type === "brand" || p.account_type === "business" || p.account_type === "agency"
        || p.onboarding_path === "business_creator" || p.onboarding_path === "business_marketing");
      if (!biz) { navigate({ to: "/home" }); return; }
      setIsBusiness(true);
      setAccessChecked(true);
    })();
  }, [user, navigate]);

  const loadBriefing = useCallback(async (forceRefresh: boolean) => {
    if (!user) return;
    forceRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("marketing-hub-briefing", {
        body: { force_refresh: forceRefresh },
      });
      if (fnErr) throw fnErr;
      setData(res as BriefingResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your Marketing Hub briefing.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!accessChecked || !isBusiness || !user) return;
    loadBriefing(false);
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("content_planner_items")
      .select("title, platform, content_type, scheduled_date, status")
      .eq("user_id", user.id).gte("scheduled_date", today).lte("scheduled_date", in14)
      .order("scheduled_date", { ascending: true }).limit(8)
      .then(({ data: rows }) => setCalendar((rows as CalendarItem[] | null) ?? []));
  }, [accessChecked, isBusiness, user, loadBriefing]);

  const loadWeeklyReport = useCallback(async () => {
    if (!user || weeklyReport) return;
    setWeeklyLoading(true);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("weekly-report", { body: { user_id: user.id, role: "business" } });
      if (!fnErr && res) setWeeklyReport(res as WeeklyReportData);
    } finally {
      setWeeklyLoading(false);
    }
  }, [user, weeklyReport]);

  if (!accessChecked) {
    return <div className="flex items-center justify-center" style={{ height: "60vh" }}><Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} /></div>;
  }

  const b = data?.briefing;

  return (
    <div style={{ background: C.canvas, minHeight: "100vh" }}>
      <div className="marketing-hub-page-inner">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between" style={{ marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Compass size={17} style={{ color: C.aiBlue }} />
            </div>
            <div>
              <h1 style={{ fontSize: "clamp(1.5rem, 2.2vw, 1.9rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.1 }}>
                Marketing Hub
              </h1>
              <p style={{ fontSize: 12.5, color: C.textTertiary, margin: "2px 0 0" }}>
                Every module, one strategic briefing.
                {data && <> Updated {timeAgo(data.generated_at)}{data.cached ? "" : " · fresh"}.</>}
              </p>
            </div>
          </div>
          <button
            onClick={() => loadBriefing(true)}
            disabled={refreshing || loading}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: C.textSecondary, background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 10, padding: "8px 14px", cursor: refreshing || loading ? "default" : "pointer", opacity: refreshing || loading ? 0.6 : 1 }}
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center" style={{ height: "40vh" }}>
            <Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} />
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: "16px 18px", background: C.redMuted, border: `1px solid ${C.redBorder}`, borderRadius: 14, color: C.textSecondary, fontSize: 13 }}>
            {error} <button onClick={() => loadBriefing(false)} style={{ color: C.aiBlue, fontWeight: 600, marginLeft: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Try again</button>
          </div>
        )}

        {!loading && !error && b && (
          <>
            {/* ── Business Health ────────────────────────────────────────── */}
            <div style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", border: `3px solid ${C.aiBlueBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: C.aiBlue }}>{b.health.score}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary, marginBottom: 3 }}>Business Health</div>
                <div style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.5 }}>{b.health.summary}</div>
              </div>
            </div>

            <div className="marketing-hub-grid">
              {/* ── Left column ─────────────────────────────────────────── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {b.weekly_priorities.length > 0 && (
                  <div>
                    <SectionHeading icon={ListChecks} label="Weekly Priorities" count={b.weekly_priorities.length} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {b.weekly_priorities.map((it, i) => <BriefingCard key={i} item={it} />)}
                    </div>
                  </div>
                )}
                {b.opportunities.length > 0 && (
                  <div>
                    <SectionHeading icon={TrendingUp} label="Growth Opportunities" count={b.opportunities.length} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {b.opportunities.map((it, i) => <BriefingCard key={i} item={it} />)}
                    </div>
                  </div>
                )}
                {b.campaign_suggestions.length > 0 && (
                  <div>
                    <SectionHeading icon={Megaphone} label="Campaign Suggestions" count={b.campaign_suggestions.length} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {b.campaign_suggestions.map((it, i) => <BriefingCard key={i} item={it} />)}
                    </div>
                  </div>
                )}
                {b.competitor_notes ? (
                  <div>
                    <SectionHeading icon={Users2} label="Competitive Positioning" count={b.competitor_notes.length} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {b.competitor_notes.map((it, i) => <BriefingCard key={i} item={it} />)}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "13px 16px", background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 14 }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                      <ShieldAlert size={13} style={{ color: C.textTertiary }} />
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textSecondary }}>No competitive analysis yet</div>
                    </div>
                    <div style={{ fontSize: 12, color: C.textTertiary, lineHeight: 1.5, marginBottom: 8 }}>
                      Name your competitors in Brand Knowledge and MRKT AI will reason about your positioning here.
                    </div>
                    <Link to="/brand-knowledge" style={{ fontSize: 12, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>Add competitors →</Link>
                  </div>
                )}
              </div>

              {/* ── Right column ────────────────────────────────────────── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Action Center — deterministic, always accurate */}
                <div>
                  <SectionHeading icon={Target} label="Action Center" count={data?.action_center.length ?? 0} />
                  {data && data.action_center.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {data.action_center.map((it, i) => (
                        <Link key={i} to={it.link as "/"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12, color: C.textSecondary, fontSize: 12.5, textDecoration: "none" }}>
                          {it.label} <ChevronRight size={13} style={{ color: C.textQuaternary }} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: "13px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, fontSize: 12.5, color: C.textTertiary }}>
                      Inbox zero — nothing needs your attention right now.
                    </div>
                  )}
                </div>

                {/* Performance highlights */}
                {b.performance_highlights.length > 0 && (
                  <div>
                    <SectionHeading icon={Sparkles} label="Performance Highlights" />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {b.performance_highlights.map((h, i) => (
                        <div key={i} style={{ padding: "10px 13px", background: C.greenMuted, border: `1px solid ${C.greenBorder}`, borderRadius: 12, color: C.textSecondary, fontSize: 12.5 }}>{h}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Marketing Calendar strip */}
                <div>
                  <SectionHeading icon={CalendarDays} label="Marketing Calendar" count={calendar.length} />
                  <div style={{ background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, padding: calendar.length ? "6px 0" : "13px 16px" }}>
                    {calendar.length === 0 && <div style={{ fontSize: 12.5, color: C.textTertiary, padding: "0 16px" }}>Nothing scheduled in the next 14 days.</div>}
                    {calendar.map((c, i) => (
                      <div key={i} className="flex items-center justify-between" style={{ padding: "7px 16px", fontSize: 12, color: C.textSecondary }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                        <span style={{ color: C.textQuaternary, flexShrink: 0, marginLeft: 8 }}>{new Date(c.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    ))}
                    <div style={{ padding: "6px 16px 2px" }}>
                      <Link to="/content-planner" style={{ fontSize: 11.5, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>Open full planner →</Link>
                    </div>
                  </div>
                </div>

                {/* Weekly Report embed */}
                <div>
                  <SectionHeading icon={FileBarChart} label="Weekly Report" />
                  <div style={{ background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, padding: "13px 16px" }}>
                    {weeklyReport ? (
                      <div style={{ fontSize: 12.5, color: C.textSecondary, lineHeight: 1.6 }}>{weeklyReport.ai_observations}</div>
                    ) : (
                      <button onClick={loadWeeklyReport} disabled={weeklyLoading} style={{ fontSize: 12.5, fontWeight: 600, color: C.aiBlue, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        {weeklyLoading ? <Loader2 size={12} className="animate-spin" /> : <FileBarChart size={12} />}
                        Load this week's report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
