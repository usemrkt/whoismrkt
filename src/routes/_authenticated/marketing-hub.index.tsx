// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub — executive Dashboard. Reads the shared briefing from the
// layout's context (useMarketingHub) — no independent fetch of the briefing
// itself, only the small extras this section alone needs (calendar strip,
// weekly report, display name for the greeting).
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Sparkles, ChevronRight, Loader2, CheckCircle2, X,
  Target, CalendarDays, FileBarChart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";
import { useMarketingHub, priorityColors, type Recommendation } from "@/lib/marketingHub";

export const Route = createFileRoute("/_authenticated/marketing-hub/")({
  component: DashboardSection,
});

type CalendarItem = { title: string; platform: string; content_type: string; scheduled_date: string; status: string };
type WeeklyReportData = { week_label: string; ai_observations: string; stats: Record<string, number> };

function greetingKey(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const navigate = useNavigate();
  const { dismiss, complete } = useMarketingHub();
  const { fg, bg, bdr } = priorityColors(rec.priority);
  const link = rec.meta?.link;

  function askAI() {
    const prompt = `From my Marketing Team: "${rec.title}". ${rec.explanation ?? ""} Help me act on this now.`;
    localStorage.setItem("mrkt_prefill_prompt", prompt);
    navigate({ to: "/chat" });
  }

  return (
    <div style={{ padding: "13px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14 }}>
      <div className="flex items-start gap-2" style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.015em", flex: 1 }}>{rec.title}</div>
        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
          {rec.priority}
        </span>
        <button onClick={() => dismiss(rec.id)} title="Dismiss" style={{ color: C.textQuaternary, background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
          <X size={13} />
        </button>
      </div>
      {rec.explanation && <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.55, marginBottom: 10 }}>{rec.explanation}</div>}
      <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
        {link && (
          <Link to={link as "/"} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>
            {rec.action || "Open"} <ChevronRight size={12} />
          </Link>
        )}
        <button onClick={askAI} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.textMuted, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 8, padding: "3px 9px", cursor: "pointer" }}>
          <Sparkles size={11} /> Ask AI Strategist
        </button>
        <button onClick={() => complete(rec.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.green, background: C.greenMuted, border: `1px solid ${C.greenBorder}`, borderRadius: 8, padding: "3px 9px", cursor: "pointer", marginLeft: "auto" }}>
          <CheckCircle2 size={11} /> Done
        </button>
      </div>
    </div>
  );
}

function DashboardSection() {
  const { user } = useAuth();
  const { briefing, actionCenter, recommendations } = useMarketingHub();

  const [name, setName] = useState("");
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReportData | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("name").eq("id", user.id).maybeSingle()
      .then(({ data }) => setName(data?.name?.split(" ")[0] ?? user.email?.split("@")[0] ?? ""));

    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    supabase.from("content_planner_items")
      .select("title, platform, content_type, scheduled_date, status")
      .eq("user_id", user.id).gte("scheduled_date", today).lte("scheduled_date", in14)
      .order("scheduled_date", { ascending: true }).limit(8)
      .then(({ data }) => setCalendar((data as CalendarItem[] | null) ?? []));
  }, [user]);

  const loadWeeklyReport = useCallback(async () => {
    if (!user || weeklyReport) return;
    setWeeklyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-report", { body: { user_id: user.id, role: "business" } });
      if (!error && data) setWeeklyReport(data as WeeklyReportData);
    } finally {
      setWeeklyLoading(false);
    }
  }, [user, weeklyReport]);

  if (!briefing) return null;

  return (
    <div>
      {/* ── Executive greeting ─────────────────────────────────────────── */}
      <h2 style={{ fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: "0 0 4px" }}>
        {greetingKey()}{name ? `, ${name}` : ""}.
      </h2>
      <p style={{ fontSize: 14, color: C.textTertiary, margin: "0 0 20px" }}>
        Here's what your marketing team recommends today.
      </p>

      {/* ── Business Health — hero stat ───────────────────────────────── */}
      <div style={{
        padding: "22px 24px", marginBottom: 20, borderRadius: 18,
        background: "linear-gradient(135deg, oklch(0.11 0 0), oklch(0.08 0 0))",
        border: `1px solid ${C.borderSubtle}`, display: "flex", alignItems: "center", gap: 22,
      }}>
        <div style={{ width: 74, height: 74, borderRadius: "50%", border: `4px solid ${C.aiBlueBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.aiBlue }}>{briefing.health.score}</span>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary, marginBottom: 4 }}>Business Health</div>
          <div style={{ fontSize: 15.5, color: C.textPrimary, lineHeight: 1.5, maxWidth: 640 }}>{briefing.health.summary}</div>
        </div>
      </div>

      <div className="marketing-hub-grid">
        {/* ── Left: AI-generated priority cards ──────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recommendations.length === 0 && (
            <div style={{ padding: "16px 18px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, fontSize: 13, color: C.textTertiary }}>
              Your marketing team has no open recommendations right now.
            </div>
          )}
          {recommendations.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
        </div>

        {/* ── Right: obligations + calendar + report ─────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <Target size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Action Center</div>
            </div>
            {actionCenter.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {actionCenter.map((it, i) => (
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

          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <CalendarDays size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Marketing Calendar</div>
            </div>
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

          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <FileBarChart size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Weekly Report</div>
            </div>
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
    </div>
  );
}
