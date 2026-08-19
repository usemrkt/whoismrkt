// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/workspace — Agency Workspace: the operations floor. Answers
// "what is my AI marketing department working on right now" — not a chat
// clone, not a dashboard of gauges. Every item here is a real row somewhere
// else in the Marketing Hub; clicking one navigates to the owning section
// rather than trying to act on it here. Agency Workspace orchestrates, it
// does not own.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, type CSSProperties } from "react";
import {
  Building2, Loader2, CheckCircle2, Clock, AlertTriangle, Bell, ListChecks,
  Megaphone, Wand2, ShieldCheck, TrendingUp, BarChart2, History, BookText,
} from "lucide-react";
import { C } from "@/lib/theme";
import {
  useAgencyWorkspace, DEPARTMENT_LABELS, priorityLabel,
  type ActivityItem, type WorkQueueItem, type Department, type WorkPriority,
} from "@/lib/agencyWorkspace";

export const Route = createFileRoute("/_authenticated/marketing-hub/workspace")({
  head: () => ({ meta: [{ title: "Agency Workspace — Marketing Hub — MRKT" }] }),
  component: AgencyWorkspaceSection,
});

const DEPARTMENT_ICONS: Record<Department, ReactNode> = {
  strategy: <Megaphone size={13} style={{ color: C.textTertiary }} />,
  content: <Wand2 size={13} style={{ color: C.textTertiary }} />,
  brand: <ShieldCheck size={13} style={{ color: C.textTertiary }} />,
  growth: <TrendingUp size={13} style={{ color: C.textTertiary }} />,
  analytics: <BarChart2 size={13} style={{ color: C.textTertiary }} />,
};

function priorityColors(p: WorkPriority) {
  if (p === "critical") return { fg: C.red, bg: C.redMuted, bdr: C.redBorder };
  if (p === "high")     return { fg: C.amber, bg: C.amberMuted, bdr: C.amberBorder };
  if (p === "medium")   return { fg: C.aiBlue, bg: C.accentMuted, bdr: C.aiBlueBorder };
  return { fg: C.textTertiary, bg: C.surface, bdr: C.borderSubtle };
}

function LinkOrDiv({ link, children, style }: { link: string | null; children: ReactNode; style?: CSSProperties }) {
  if (link) return <Link to={link as "/"} style={{ ...style, textDecoration: "none", display: "block" }}>{children}</Link>;
  return <div style={style}>{children}</div>;
}

function AgencyWorkspaceSection() {
  const { loading, error, data } = useAgencyWorkspace();

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "40vh" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <Building2 size={18} style={{ color: C.aiBlue }} />
        <h2 style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.7rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: 0 }}>
          Agency Workspace
        </h2>
      </div>
      <p style={{ fontSize: 13.5, color: C.textTertiary, margin: "0 0 22px" }}>
        What your AI marketing department is working on right now — every item is real, traced back to its own system.
      </p>

      {error && (
        <div style={{ padding: "14px 16px", background: C.redMuted, border: `1px solid ${C.redBorder}`, borderRadius: 14, color: C.textSecondary, fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── Today's Briefing ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <Bell size={14} style={{ color: C.textTertiary }} />
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Today's Briefing</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <BriefingColumn icon={<Bell size={13} style={{ color: C.aiBlue }} />} label="Needs Attention" items={data.briefing.needsAttention} empty="Nothing new to flag." />
          <BriefingColumn icon={<Clock size={13} style={{ color: C.amber }} />} label="In Progress" items={data.briefing.inProgress} empty="Nothing in progress." />
          <BriefingColumn icon={<AlertTriangle size={13} style={{ color: C.red }} />} label="Blocked" items={data.briefing.blocked} empty="Nothing blocked." />
          <BriefingColumn icon={<CheckCircle2 size={13} style={{ color: C.green }} />} label="Completed Today" items={data.briefing.completed} empty="Nothing completed yet today." />
        </div>
        {data.briefing.whatsNext.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, marginBottom: 6 }}>What's Next</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.briefing.whatsNext.map((w) => <WorkQueueRow key={w.id} item={w} compact />)}
            </div>
          </div>
        )}
      </div>

      <div className="marketing-hub-grid" style={{ gridTemplateColumns: "1fr 340px", gap: 20 }}>
        <div>
          {/* ── Department Activity ───────────────────────────────────── */}
          <div style={{ marginBottom: 28 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <ListChecks size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Department Activity</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => (
                <div key={d} style={{ padding: "12px 14px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    {DEPARTMENT_ICONS[d]}
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: C.textSecondary }}>{DEPARTMENT_LABELS[d]}</span>
                  </div>
                  {data.departmentActivity[d].length === 0 ? (
                    <div style={{ fontSize: 11.5, color: C.textMuted }}>No recent activity.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {data.departmentActivity[d].slice(0, 4).map((a, i) => (
                        <LinkOrDiv key={i} link={a.link} style={{ fontSize: 11.5, color: C.textSecondary, lineHeight: 1.4 }}>
                          {a.title}
                          {a.evidence && <div style={{ fontSize: 10.5, color: C.textMuted }}>{a.evidence}</div>}
                        </LinkOrDiv>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Timeline ───────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <History size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Timeline</div>
            </div>
            {data.timeline.length === 0 ? (
              <div style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12, fontSize: 12.5, color: C.textTertiary }}>
                No activity recorded yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.timeline.slice(0, 15).map((t, i) => (
                  <LinkOrDiv key={i} link={t.link} style={{ padding: "10px 12px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 10 }}>
                    <div className="flex items-center gap-2">
                      {DEPARTMENT_ICONS[t.department]}
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary }}>{t.title}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 2 }}>{new Date(t.occurredAt).toLocaleDateString()}</div>
                  </LinkOrDiv>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* ── Unified Work Queue ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <ListChecks size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Work Queue ({data.workQueue.length})</div>
            </div>
            {data.workQueue.length === 0 ? (
              <div style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12, fontSize: 12.5, color: C.textTertiary }}>
                Nothing open right now.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.workQueue.map((w) => <WorkQueueRow key={w.id} item={w} />)}
              </div>
            )}
          </div>

          {/* ── Decision Log ───────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <BookText size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Decision Log</div>
            </div>
            {data.decisionLog.length === 0 ? (
              <div style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12, fontSize: 12.5, color: C.textTertiary }}>
                No decisions recorded yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.decisionLog.slice(0, 10).map((d, i) => (
                  <LinkOrDiv key={i} link={d.link} style={{ padding: "10px 12px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary }}>{d.title}</div>
                    {d.why && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{d.why}</div>}
                  </LinkOrDiv>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BriefingColumn({ icon, label, items, empty }: { icon: ReactNode; label: string; items: ActivityItem[]; empty: string }) {
  return (
    <div style={{ padding: "12px 14px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary }}>{label} ({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11.5, color: C.textMuted }}>{empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.slice(0, 4).map((a, i) => (
            <LinkOrDiv key={i} link={a.link} style={{ fontSize: 11.5, color: C.textSecondary, lineHeight: 1.4 }}>{a.title}</LinkOrDiv>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkQueueRow({ item, compact }: { item: WorkQueueItem; compact?: boolean }) {
  const { fg, bg, bdr } = priorityColors(item.priority);
  return (
    <LinkOrDiv link={item.link} style={{ padding: compact ? "8px 10px" : "10px 12px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 10 }}>
      <div className="flex items-start gap-2" style={{ marginBottom: item.explanation ? 3 : 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, flex: 1 }}>{item.title}</div>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 5, padding: "1px 6px", flexShrink: 0 }}>
          {priorityLabel(item.priority)}
        </span>
      </div>
      {!compact && item.explanation && <div style={{ fontSize: 11, color: C.textTertiary, lineHeight: 1.4 }}>{item.explanation}</div>}
    </LinkOrDiv>
  );
}
