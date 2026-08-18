import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { trackMarketplaceEvent } from "@/lib/marketplaceEvents";
import {
  Zap, Eye, MessageSquare, TrendingUp, CalendarDays,
  Megaphone, Users, DollarSign, ArrowRight, ChevronRight,
  Sparkles, ArrowUpRight, Loader2, Clock, ClipboardList, Bookmark,
  Target, CheckCircle2, Circle, X, BarChart2, RotateCcw, Compass,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchUnreadCount } from "@/lib/messaging";
import { computeMatchScore, type CreatorInput, type CampaignInput } from "@/lib/matchScore";
import { computeVisibilityScore } from "@/lib/visibilityScore";
import type { CreatorProfile } from "@/types/creator";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — MRKT" }] }),
  component: HomePage,
});

// ── Design tokens ─────────────────────────────────────────────────────────────

import { C } from "@/lib/theme";

// ── Helpers ───────────────────────────────────────────────────────────────────

function greetingKey(): "greeting.morning" | "greeting.afternoon" | "greeting.evening" {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "greeting.morning";
  if (h >= 12 && h < 17) return "greeting.afternoon";
  return "greeting.evening";
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysLeft(deadline: string | null): number {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000));
}

function isBizProfile(acct?: string | null, path?: string | null): boolean {
  return acct === "brand" || acct === "business" || acct === "agency"
    || path === "business_creator" || path === "business_marketing";
}

const AVATAR_COLORS = [
  "oklch(0.28 0 0)", "oklch(0.35 0 0)",
  "oklch(0.22 0 0)", "oklch(0.32 0 0)",
  "oklch(0.25 0 0)", "oklch(0.30 0 0)",
];
function avatarBg(name: string) {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Applicant {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface ActiveCampaign {
  id: string;
  title: string;
  applicationCount: number;
  deadline: string | null;
  progress: number;
}

interface RecommendedCreator {
  id: string;
  userId: string;
  name: string;
  category: string;
  followers: number | null;
  imageUrl: string | null;
  matchScore: number | null;
}

interface PipelineStages {
  pending: number;
  shortlisted: number;
  in_review: number;
  accepted: number;
  total: number;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
  read: boolean;
}

interface BusinessData {
  displayName:     string;
  pendingApps:     number;
  recentApplicants: Applicant[];
  activeCampaigns: ActiveCampaign[];
  pipeline:        PipelineStages;
  unreadMessages:  number;
  recommendations: RecommendedCreator[];
  activity:        ActivityItem[];
  conversations:   ConversationItem[];
}

interface OpportunityItem {
  id: string;
  title: string;
  brandName: string;
  budget: string;
  matchScore: number;
  daysLeft: number;
  imageUrl: string | null;
  isNew: boolean;
}

interface ConversationItem {
  id: string;
  conversationId: string;   // conversations table PK — used for /messages/[id] routing
  partnerName: string;
  avatarUrl: string | null;
  lastMessage: string;
  timeAgo: string;
  isUnread: boolean;
}

interface ContentItem {
  id: string;
  date: string;
  platform: string;
  contentType: string;
}

interface ApplicationSummary {
  id:             string;
  campaign_id:    string;
  campaign_title: string;
  campaign_brand: string;
  status:         string;
  created_at:     string;
}

interface CreatorData {
  displayName:         string;
  profileViews:        number;
  profileViewsChange:  number;
  unreadMessages:      number;
  visibilityScore:     number;
  upcomingCount:       number;
  myApplications:      number;
  savedCount:          number;
  recentApplications:  ApplicationSummary[];
  opportunities:       OpportunityItem[];
  conversations:       ConversationItem[];
  upcomingContent:     ContentItem[];
}

// ── Chart component ───────────────────────────────────────────────────────────

function VisibilityScoreChart({ score }: { score: number }) {
  const history = useMemo(() => {
    const base = Math.max(30, score - 16);
    const noise = [0, 2, -1, 4, -2, 3, 2, 0];
    return noise.map((n, i) => {
      const trend = base + (score - base) * (i / 7);
      return Math.max(0, Math.min(100, Math.round(trend + n)));
    });
  }, [score]);

  const W = 400; const H = 80;
  const minS = Math.min(...history);
  const maxS = Math.max(...history);
  const range = Math.max(maxS - minS, 10);

  const toX = (i: number) => (i / (history.length - 1)) * W;
  const toY = (s: number) => H - ((s - minS) / range) * (H - 12) - 6;

  const pts = history.map((s, i) => `${toX(i).toFixed(1)},${toY(s).toFixed(1)}`);
  const linePath = `M ${pts.join(" L ")}`;
  const fillPath = `${linePath} L ${W},${H} L 0,${H} Z`;

  const lastX = toX(history.length - 1);
  const lastY = toY(history[history.length - 1]);

  const labels = Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i) * 7);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 72, overflow: "visible", display: "block" }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="vsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8A8A8A" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8A8A8A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#vsGrad)" />
        <path d={linePath} fill="none" stroke="#8A8A8A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="5" fill="#8A8A8A" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {labels.map((l) => (
          <span key={l} style={{ fontSize: 10, color: C.textMuted }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// ── Shared: Intelligence panel ─────────────────────────────────────────────────

function IntelligencePanel({ items, loading = false }: {
  items: Array<{ text: string; link: string }>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height:       38,
              borderRadius: 12,
              background:   C.raised,
              animation:    "pulse 1.6s ease-in-out infinite",
              opacity:      1 - i * 0.08,
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {items.map((item, i) => (
        <Link
          key={i}
          to={item.link as "/"}
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            10,
            padding:        "10px 12px",
            borderRadius:   12,
            textDecoration: "none",
            transition:     "background 120ms ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.raised; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <TrendingUp size={12} style={{ color: C.accent, flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 12.5, color: C.textSecondary, lineHeight: 1.45 }}>
            {item.text}
          </span>
          <ChevronRight size={12} style={{ color: C.textMuted, flexShrink: 0 }} />
        </Link>
      ))}
    </div>
  );
}

// ── Daily Missions ─────────────────────────────────────────────────────────────

interface Mission {
  id:       string;
  label:    string;
  sub:      string;
  link:     string;
  icon:     React.ElementType;
  priority: "high" | "medium" | "low";
}

function DailyMissionsCard({ missions, completedIds, onComplete }: {
  missions:     Mission[];
  completedIds: Set<string>;
  onComplete:   (id: string) => void;
}) {
  const total     = missions.length;
  const completed = missions.filter((m) => completedIds.has(m.id)).length;

  return (
    <div style={{
      background:   "oklch(0.085 0 0)",
      border:       `1px solid oklch(1 0 0 / 7%)`,
      borderRadius: 22,
      padding:      "16px 20px",
      marginBottom: 14,
      boxShadow:    "inset 0 1px 0 oklch(1 0 0 / 6%), 0 2px 12px oklch(0 0 0 / 45%)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width:          28,
            height:         28,
            borderRadius:   8,
            background:     C.accentMuted,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}>
            <Target size={13} style={{ color: C.accent }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.015em" }}>
              Today's focus
            </div>
            <div style={{ fontSize: 11.5, color: C.textTertiary, marginTop: 1 }}>
              {completed === total && total > 0
                ? "All done — great work."
                : `${total - completed} action${total - completed !== 1 ? "s" : ""} to grow your presence`}
            </div>
          </div>
        </div>
        {/* Progress pill */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          6,
          padding:      "5px 10px",
          background:   completed === total && total > 0 ? C.greenMuted : C.raised,
          border:       `1px solid ${completed === total && total > 0 ? C.greenBorder : C.borderFaint}`,
          borderRadius: 20,
          fontSize:     11.5,
          fontWeight:   600,
          color:        completed === total && total > 0 ? C.green : C.textTertiary,
        }}>
          {completed === total && total > 0 ? (
            <CheckCircle2 size={11} />
          ) : (
            <Circle size={11} />
          )}
          {completed}/{total}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, borderRadius: 2, background: C.raised, overflow: "hidden", marginBottom: 16 }}>
        <div style={{
          height:     "100%",
          borderRadius: 2,
          background: C.accent,
          width:      total > 0 ? `${(completed / total) * 100}%` : "0%",
          transition: "width 0.4s ease",
          minWidth:   "0%",
        }} />
      </div>

      {/* Mission rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {missions.map((m, i) => {
          const isLast = i === missions.length - 1;
          const isHigh = m.priority === "high";
          const isDone = completedIds.has(m.id);
          return (
            <Link
              key={m.id}
              to={m.link as "/"}
              onClick={() => { if (!isDone) onComplete(m.id); }}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            12,
                padding:        "9px 0",
                borderBottom:   isLast ? "none" : `1px solid ${C.borderFaint}`,
                textDecoration: "none",
                transition:     "opacity 120ms ease",
                opacity:        isDone ? 0.55 : 1,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = isDone ? "0.4" : "0.75"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = isDone ? "0.55" : "1"; }}
            >
              {/* Icon / done checkmark */}
              <div style={{
                width:          30,
                height:         30,
                borderRadius:   8,
                background:     isDone ? C.greenMuted : isHigh ? C.accentMuted : C.raised,
                border:         `1px solid ${isDone ? C.greenBorder : isHigh ? C.accentBorder : C.borderFaint}`,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flexShrink:     0,
              }}>
                {isDone
                  ? <CheckCircle2 size={13} style={{ color: C.green }} />
                  : <m.icon size={13} style={{ color: isHigh ? C.accent : C.textTertiary }} />
                }
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize:       13,
                  fontWeight:     500,
                  color:          isDone ? C.textTertiary : C.textPrimary,
                  lineHeight:     1.3,
                  textDecoration: isDone ? "line-through" : "none",
                }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 11.5, color: C.textTertiary, marginTop: 1 }}>
                  {isDone ? "Completed" : m.sub}
                </div>
              </div>

              {/* Priority badge + arrow */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {!isDone && isHigh && (
                  <span style={{
                    fontSize:   9.5,
                    fontWeight: 700,
                    color:      C.accent,
                    background: C.accentMuted,
                    border:     `1px solid ${C.accentBorder}`,
                    borderRadius: 6,
                    padding:    "2px 7px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                  }}>
                    Priority
                  </span>
                )}
                <ChevronRight size={13} style={{ color: C.textMuted }} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Weekly Report Modal ────────────────────────────────────────────────────────

type WeeklyReportData = {
  week_label:      string;
  ai_observations: string;
  stats:           Record<string, number>;
  cached?:         boolean;
};

function WeeklyReportModal({
  open, onClose, report, loading,
}: {
  open:    boolean;
  onClose: () => void;
  report:  WeeklyReportData | null;
  loading: boolean;
}) {
  if (!open) return null;

  const creatorStatLabels: Record<string, string> = {
    profile_views:       "Profile views",
    match_appearances:   "Appeared in AI matching",
    applications_sent:   "Applications submitted",
    shortlisted:         "Times shortlisted",
    saved_by_businesses: "Saved by businesses",
    content_scheduled:   "Content scheduled",
    messages_received:   "Messages received",
  };

  const businessStatLabels: Record<string, string> = {
    applications_received: "Applications received",
    creators_shortlisted:  "Creators shortlisted",
    campaigns_active:      "Active campaigns",
    creators_messaged:     "Creators messaged",
    pipeline_updates:      "Pipeline updates",
  };

  const statLabels = report?.stats
    ? Object.keys(report.stats).some((k) => k in creatorStatLabels)
      ? creatorStatLabels
      : businessStatLabels
    : {};

  const observations = report?.ai_observations
    ? report.ai_observations.split("\n").filter((l) => l.trim())
    : [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   "fixed",
          inset:      0,
          zIndex:     500,
          background: "oklch(0 0 0 / 70%)",
          backdropFilter: "blur(6px)",
          animation:  "fadeIn 160ms ease",
        }}
      />
      {/* Modal */}
      <div style={{
        position:    "fixed",
        top:         "50%",
        left:        "50%",
        transform:   "translate(-50%, -50%)",
        zIndex:      510,
        width:       "min(520px, calc(100vw - 40px))",
        maxHeight:   "90vh",
        overflowY:   "auto",
        background:  C.surface,
        border:      `1px solid ${C.borderNormal}`,
        borderRadius: 24,
        padding:     "30px 32px",
        boxShadow:   C.shadowModal,
        animation:   "slideUp 200ms ease",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <BarChart2 size={16} style={{ color: C.accent }} />
              <span style={{ fontSize: 18, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em" }}>
                Your week on MRKT
              </span>
            </div>
            {report?.week_label && (
              <div style={{ fontSize: 12.5, color: C.textTertiary }}>{report.week_label}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              width:          30,
              height:         30,
              borderRadius:   "50%",
              background:     C.raised,
              border:         `1px solid ${C.borderFaint}`,
              cursor:         "pointer",
              flexShrink:     0,
            }}
          >
            <X size={13} style={{ color: C.textTertiary }} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} style={{
                height:     16,
                borderRadius: 8,
                background: C.raised,
                animation:  "pulse 1.6s ease-in-out infinite",
                width:      `${85 - i * 5}%`,
              }} />
            ))}
          </div>
        ) : report ? (
          <>
            {/* Stats grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 24 }}>
              {Object.entries(report.stats)
                .filter(([key]) => key in statLabels)
                .map(([key, value], i, arr) => (
                  <div
                    key={key}
                    style={{
                      display:       "flex",
                      alignItems:    "center",
                      justifyContent:"space-between",
                      padding:       "10px 0",
                      borderBottom:  i < arr.length - 1 ? `1px solid ${C.borderFaint}` : "none",
                    }}
                  >
                    <span style={{ fontSize: 13, color: C.textSecondary }}>{statLabels[key]}</span>
                    <span style={{
                      fontSize:  16,
                      fontWeight: 700,
                      color:      (value as number) > 0 ? C.textPrimary : C.textMuted,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {value as number}
                    </span>
                  </div>
                ))}
            </div>

            {/* AI observations */}
            {observations.length > 0 && (
              <div style={{
                background:   C.raised,
                border:       `1px solid ${C.borderSubtle}`,
                borderRadius: 14,
                padding:      "16px 18px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <Sparkles size={12} style={{ color: C.accent }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                    AI Observations
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {observations.map((obs, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: C.textSecondary, lineHeight: 1.5 }}>
                      {obs}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.cached && (
              <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted, display: "flex", alignItems: "center", gap: 5 }}>
                <RotateCcw size={10} style={{ color: C.textMuted }} />
                Cached report
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "20px 0" }}>
            Failed to load report. Try again later.
          </div>
        )}
      </div>
    </>
  );
}

// ── Shared: Section header ─────────────────────────────────────────────────────

function SectionHeader({ title, sub, linkLabel, linkTo }: {
  title: string; sub?: string; linkLabel?: string; linkTo?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 3 }}>{sub}</div>}
      </div>
      {linkLabel && linkTo && (
        <Link
          to={linkTo as "/"}
          style={{
            fontSize: 12, color: C.textTertiary, textDecoration: "none", flexShrink: 0,
            transition: "color 120ms ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.textSecondary; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textTertiary; }}
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

// ── Shared: Card wrapper ──────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background:   "oklch(0.085 0 0)",
      border:       `1px solid oklch(1 0 0 / 7%)`,
      borderRadius: 22,
      padding:      "18px 20px",
      boxShadow:    "inset 0 1px 0 oklch(1 0 0 / 6%), 0 2px 12px oklch(0 0 0 / 45%), 0 1px 3px oklch(0 0 0 / 30%)",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── BUSINESS HOME ─────────────────────────────────────────────────────────────

function BusinessApplicationsCard({ count, applicants }: {
  count: number;
  applicants: Applicant[];
}) {
  return (
    <div style={{
      background:   "oklch(0.085 0 0)",
      border:       `1px solid oklch(1 0 0 / 7%)`,
      borderRadius: 22,
      padding:      "18px 24px",
      display:      "flex",
      alignItems:   "center",
      flexWrap:     "wrap",
      gap:          16,
      marginBottom: 14,
      boxShadow:    "inset 0 1px 0 oklch(1 0 0 / 7%), 0 4px 20px oklch(0 0 0 / 50%)",
      position:     "relative",
      overflow:     "hidden",
    }}>
      {/* Count */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.04em", lineHeight: 1 }}>
          {count}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginTop: 3 }}>New applications</div>
        <div style={{ fontSize: 11.5, color: C.textTertiary, marginTop: 2 }}>Creators applied to your campaigns</div>
      </div>

      {/* Avatars */}
      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        {applicants.slice(0, 8).map((a, i) => (
          <div
            key={a.id}
            style={{
              width:        36,
              height:       36,
              borderRadius: "50%",
              border:       "2px solid oklch(0.10 0 0)",
              marginLeft:   i === 0 ? 0 : -10,
              overflow:     "hidden",
              background:   a.imageUrl ? "transparent" : avatarBg(a.name),
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              fontSize:     13,
              fontWeight:   700,
              color:        "oklch(0.065 0 0)",
              flexShrink:   0,
              zIndex:       8 - i,
              position:     "relative",
            }}
          >
            {a.imageUrl
              ? <img src={a.imageUrl} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : a.name[0]?.toUpperCase()
            }
          </div>
        ))}
        {count > 8 && (
          <div style={{
            width:        36,
            height:       36,
            borderRadius: "50%",
            border:       "2px solid oklch(0.10 0 0)",
            marginLeft:   -10,
            background:   C.raised,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            fontSize:     11,
            fontWeight:   600,
            color:        C.textSecondary,
            zIndex:       0,
          }}>
            +{count - 8}
          </div>
        )}
      </div>

      {/* CTA */}
      <Link
        to="/campaigns"
        style={{
          flexShrink:     0,
          display:        "inline-flex",
          alignItems:     "center",
          gap:            8,
          padding:        "12px 22px",
          background:     "oklch(1 0 0 / 92%)",
          color:          "oklch(0.06 0 0)",
          borderRadius:   12,
          fontSize:       13,
          fontWeight:     600,
          textDecoration: "none",
          transition:     "background 120ms ease",
          letterSpacing:  "-0.01em",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 92%)"; }}
      >
        Review applications
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function BusinessStatChip({ icon: Icon, iconColor, value, label, sub, linkTo }: {
  icon: React.ElementType;
  iconColor: string;
  value: string;
  label: string;
  sub: string;
  linkTo: string;
}) {
  return (
    <Link
      to={linkTo as "/"}
      style={{
        display:        "flex",
        flexDirection:  "column",
        padding:        "14px 16px",
        background:     "oklch(0.085 0 0)",
        border:         `1px solid oklch(1 0 0 / 7%)`,
        borderRadius:   18,
        textDecoration: "none",
        boxShadow:      "inset 0 1px 0 oklch(1 0 0 / 6%), 0 2px 8px oklch(0 0 0 / 40%)",
        transition:     "background 160ms ease, border-color 160ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = "oklch(0.115 0 0)";
        el.style.borderColor = "oklch(1 0 0 / 11%)";
        el.style.transform   = "translateY(-2px)";
        el.style.boxShadow   = "inset 0 1px 0 oklch(1 0 0 / 8%), 0 6px 24px oklch(0 0 0 / 55%), 0 2px 8px oklch(0 0 0 / 35%)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = "oklch(0.085 0 0)";
        el.style.borderColor = "oklch(1 0 0 / 7%)";
        el.style.transform   = "";
        el.style.boxShadow   = "inset 0 1px 0 oklch(1 0 0 / 6%), 0 2px 8px oklch(0 0 0 / 40%)";
      }}
    >
      <div style={{
        width:          30,
        height:         30,
        borderRadius:   9,
        background:     `${iconColor.replace(")", " / 12%)")}`,
        border:         `1px solid ${iconColor.replace(")", " / 20%)")}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        marginBottom:   10,
      }}>
        <Icon size={14} style={{ color: iconColor }} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginTop: 3, letterSpacing: "-0.01em" }}>{label}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{sub}</div>
    </Link>
  );
}

function CreatorRecommendCard({ creator }: { creator: RecommendedCreator }) {
  const score      = creator.matchScore ?? 0;
  const scoreColor = score >= 80 ? C.green : score >= 60 ? C.accent : score >= 40 ? C.amber : C.textSecondary;
  const scoreBg    = score >= 80 ? C.greenMuted : score >= 60 ? C.accentMuted : score >= 40 ? C.amberMuted : C.surface;

  const formattedFollowers = creator.followers
    ? creator.followers >= 1_000_000
      ? `${(creator.followers / 1_000_000).toFixed(1)}M`
      : creator.followers >= 1_000
        ? `${(creator.followers / 1_000).toFixed(0)}K`
        : `${creator.followers}`
    : "–";

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column",
      background:    C.surface,
      border:        `1px solid ${C.borderFaint}`,
      borderRadius:  16,
      overflow:      "hidden",
      position:      "relative",
    }}>
      {/* Match badge */}
      <div style={{
        position:     "absolute",
        top:          10,
        right:        10,
        background:   scoreBg,
        border:       `1px solid ${scoreColor.replace(")", " / 22%)")}`,
        borderRadius: 8,
        padding:      "3px 8px",
        fontSize:     11,
        fontWeight:   700,
        color:        scoreColor,
        zIndex:       2,
      }}>
        {creator.matchScore}% match
      </div>

      {/* Image or initial */}
      <div style={{
        height:          120,
        background:      creator.imageUrl ? "transparent" : avatarBg(creator.name),
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        overflow:        "hidden",
      }}>
        {creator.imageUrl
          ? <img src={creator.imageUrl} alt={creator.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 36, fontWeight: 700, color: "oklch(0.065 0 0)" }}>{creator.name[0]?.toUpperCase()}</span>
        }
      </div>

      {/* Info */}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 2 }}>{creator.name}</div>
        <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 10 }}>
          {creator.category} · {formattedFollowers} Followers
        </div>
        <Link
          to={`/creators/${creator.id}` as "/"}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            6,
            padding:        "7px 14px",
            background:     C.raised,
            border:         `1px solid ${C.borderSubtle}`,
            borderRadius:   8,
            fontSize:       12,
            fontWeight:     500,
            color:          C.textSecondary,
            textDecoration: "none",
            transition:     "background 120ms ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = C.high;
            (e.currentTarget as HTMLElement).style.color = C.textPrimary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = C.raised;
            (e.currentTarget as HTMLElement).style.color = C.textSecondary;
          }}
        >
          View profile <ArrowUpRight size={11} />
        </Link>
      </div>
    </div>
  );
}

function CampaignProgressCard({ campaign }: { campaign: ActiveCampaign }) {
  const dl = campaign.deadline ? daysLeft(campaign.deadline) : null;
  const prog = Math.min(100, Math.max(3, campaign.progress));

  return (
    <div style={{
      display:    "flex",
      gap:        14,
      padding:    "14px 0",
      borderBottom: `1px solid ${C.borderFaint}`,
    }}>
      {/* Placeholder image */}
      <div style={{
        width:        54,
        height:       54,
        borderRadius: 10,
        background:   C.raised,
        flexShrink:   0,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        overflow:     "hidden",
      }}>
        <Megaphone size={18} style={{ color: C.textMuted }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {campaign.title}
        </div>
        <div style={{ fontSize: 11.5, color: C.textTertiary, marginBottom: 8 }}>
          {campaign.applicationCount} application{campaign.applicationCount !== 1 ? "s" : ""}
          {dl !== null ? ` · Ends in ${dl}d` : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.raised, overflow: "hidden" }}>
            <div style={{ width: `${prog}%`, height: "100%", background: C.accent, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.textSecondary, flexShrink: 0 }}>{prog}%</span>
        </div>
      </div>
    </div>
  );
}

function PipelineOverview({ pipeline }: { pipeline: PipelineStages }) {
  const stages = [
    { label: "New",          count: pipeline.pending,     color: C.accent },
    { label: "Shortlisted",  count: pipeline.shortlisted, color: C.accent },
    { label: "In Review",    count: pipeline.in_review,   color: C.amber  },
    { label: "Selected",     count: pipeline.accepted,    color: C.green  },
  ];
  const total = Math.max(pipeline.total, 1);

  return (
    <div>
      {/* Stage counts */}
      <div className="card-grid-4">
        {stages.map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>{s.count}</div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ display: "flex", gap: 2, height: 6, borderRadius: 4, overflow: "hidden" }}>
        {stages.map((s) => s.count > 0 && (
          <div
            key={s.label}
            style={{
              flex:         s.count / total,
              background:   s.color,
              borderRadius: 4,
              opacity:      0.7,
            }}
          />
        ))}
      </div>

      {/* Labels */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {stages.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
            <span style={{ fontSize: 10.5, color: C.textMuted }}>{s.label} ({s.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BusinessActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12.5, color: C.textMuted, paddingTop: 8 }}>No recent activity</div>
    );
  }
  return (
    <div>
      {items.slice(0, 6).map((item, i) => {
        const isLast = i === items.slice(0, 6).length - 1;
        return (
          <div
            key={item.id}
            style={{
              display:       "flex",
              alignItems:    "flex-start",
              gap:           10,
              paddingTop:    10,
              paddingBottom: 10,
              borderBottom:  isLast ? "none" : `1px solid ${C.borderFaint}`,
            }}
          >
            <div style={{
              width:          28,
              height:         28,
              borderRadius:   "50%",
              background:     C.raised,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontSize:       10,
              fontWeight:     700,
              color:          C.accent,
              flexShrink:     0,
            }}>
              {item.title.trim()[0]?.toUpperCase() ?? "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: item.read ? C.textSecondary : C.textPrimary, fontWeight: item.read ? 400 : 500, lineHeight: 1.4 }}>
                {item.title}
              </div>
              {item.body && (
                <div style={{ fontSize: 11.5, color: C.textTertiary, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.body}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, flexShrink: 0, whiteSpace: "nowrap" }}>
              {timeAgo(item.created_at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BusinessHome({ data, aiInsights, aiInsightsLoading, onOpenReport, completedMissionIds, onMissionComplete, marketingHubBrief }: {
  data:                 BusinessData;
  aiInsights:           Array<{ text: string; link: string }> | null;
  aiInsightsLoading:    boolean;
  onOpenReport:         () => void;
  completedMissionIds:  Set<string>;
  onMissionComplete:    (id: string) => void;
  marketingHubBrief:    MarketingHubTeaser | null;
}) {
  const { t } = useI18n();
  const sentence = data.pendingApps > 0
    ? `${data.pendingApps} creator application${data.pendingApps === 1 ? "" : "s"} awaiting review.`
    : data.activeCampaigns.length > 0
      ? `${data.activeCampaigns.length} campaign${data.activeCampaigns.length === 1 ? " is" : "s are"} live.`
      : "Here's what's happening with your campaigns.";

  const staticInsights = [
    data.pendingApps > 0
      ? { text: `${data.pendingApps} creators applied and are waiting for review.`, link: "/pipeline" }
      : { text: "No pending applications. Launch a campaign to start receiving them.", link: "/campaign-create" },
    data.activeCampaigns.length === 0
      ? { text: "No active campaigns. Launch one to start receiving creator applications.", link: "/campaign-create" }
      : { text: `${data.activeCampaigns.length} active campaign${data.activeCampaigns.length === 1 ? "" : "s"} — check progress in Pipeline.`, link: "/pipeline" },
    data.unreadMessages > 0
      ? { text: `${data.unreadMessages} unread message${data.unreadMessages === 1 ? "" : "s"} — don't leave creators hanging.`, link: "/messages" }
      : { text: "Explore the creator marketplace to find your next brand partner.", link: "/find-creators" },
    { text: "Use the AI Strategist to plan your next campaign and creator brief.", link: "/chat" },
  ];
  const businessInsights = aiInsights ?? staticInsights;

  // Compute missions from real data
  const missions: Mission[] = [];
  if (data.pendingApps > 0)
    missions.push({ id: "review_apps",    label: `Review ${data.pendingApps} pending application${data.pendingApps === 1 ? "" : "s"}`, sub: "Creators are waiting for your decision",     link: "/pipeline",         icon: Users,       priority: "high" });
  if (data.unreadMessages > 0)
    missions.push({ id: "reply_messages", label: `Reply to ${data.unreadMessages} message${data.unreadMessages === 1 ? "" : "s"}`,  sub: "Don't leave creators waiting",                link: "/messages",         icon: MessageSquare, priority: "high" });
  if (data.activeCampaigns.length === 0)
    missions.push({ id: "create_campaign",label: "Launch your first campaign",                                                         sub: "Start receiving creator applications",         link: "/campaign-create",  icon: Megaphone,   priority: "high" });
  if (data.recommendations.length > 0)
    missions.push({ id: "check_matches",  label: `Check your ${data.recommendations.length} creator matches`,                          sub: "AI-ranked for your active campaign",          link: "/matches",          icon: Zap,         priority: "medium" });
  missions.push({ id: "ai_strategist",    label: "Ask the AI Strategist",                                                              sub: "Plan campaigns, briefs, and strategy",        link: "/chat",             icon: Sparkles,    priority: "low" });

  return (
    <div style={{ minHeight: "100vh", background: C.canvas }}>
      <div className="home-page-inner">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.18em", color: "oklch(1 0 0 / 28%)", marginBottom: 8,
          }}>
            {t(greetingKey())}, {data.displayName}
          </div>
          <h1 style={{
            fontSize: "clamp(1.5rem, 2.8vw, 2.25rem)", fontWeight: 700,
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
            color: C.textPrimary, letterSpacing: "-0.04em", lineHeight: 1.05,
            margin: 0, marginBottom: 6,
          }}>
            {data.pendingApps > 0
              ? `${data.pendingApps} creator${data.pendingApps === 1 ? "" : "s"} applied.`
              : data.activeCampaigns.length > 0 ? "Campaigns are live." : "Your dashboard."}
          </h1>
          <p style={{ fontSize: 14.5, color: "oklch(1 0 0 / 48%)", margin: 0, marginBottom: 22, fontWeight: 400 }}>
            {sentence}
          </p>
          {/* Primary CTA + secondary week report */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              to={(data.pendingApps > 0 ? "/pipeline" : data.activeCampaigns.length === 0 ? "/campaign-create" : "/campaigns") as "/"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "11px 22px",
                background: "oklch(1 0 0 / 92%)", color: "oklch(0.06 0 0)",
                borderRadius: 12, fontSize: 13.5, fontWeight: 600,
                textDecoration: "none", letterSpacing: "-0.01em",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 92%)"; }}
            >
              {data.pendingApps > 0 ? "Review applications" : data.activeCampaigns.length === 0 ? "Create campaign" : "View campaigns"}
              <ArrowRight size={14} />
            </Link>
            <button
              onClick={onOpenReport}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "11px 16px",
                background: "oklch(1 0 0 / 6%)", border: "1px solid oklch(1 0 0 / 9%)",
                borderRadius: 12, fontSize: 12.5, fontWeight: 500,
                color: C.textTertiary, cursor: "pointer",
                transition: "all 140ms ease",
              }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(1 0 0 / 10%)"; el.style.color = C.textSecondary; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(1 0 0 / 6%)"; el.style.color = C.textTertiary; }}
            >
              <BarChart2 size={12} /> Your week
            </button>
          </div>
        </div>

        {/* ── Daily Missions ────────────────────────────────────────────── */}
        <DailyMissionsCard missions={missions} completedIds={completedMissionIds} onComplete={onMissionComplete} />

        {/* ── Applications hero card ────────────────────────────────────── */}
        <BusinessApplicationsCard count={data.pendingApps} applicants={data.recentApplicants} />

        {/* ── Stat chips ───────────────────────────────────────────────── */}
        <div className="home-biz-stats">
          <BusinessStatChip
            icon={Megaphone}
            iconColor={C.accent}
            value={String(data.activeCampaigns.length)}
            label="Active campaigns"
            sub="View all →"
            linkTo="/campaigns"
          />
          <BusinessStatChip
            icon={Users}
            iconColor={C.chrome}
            value={String(data.pipeline.total)}
            label="Creators in pipeline"
            sub="View pipeline →"
            linkTo="/pipeline"
          />
          <BusinessStatChip
            icon={MessageSquare}
            iconColor={C.aiBlue}
            value={String(data.unreadMessages)}
            label="Unread messages"
            sub={data.unreadMessages > 0 ? "View messages →" : "All caught up"}
            linkTo="/messages"
          />
          <BusinessStatChip
            icon={DollarSign}
            iconColor={C.green}
            value={`$${(data.pipeline.accepted * 850).toLocaleString()}`}
            label="Est. budget"
            sub="Based on pipeline"
            linkTo="/pipeline"
          />
        </div>

        {/* ── Recommended + Active campaigns ───────────────────────────── */}
        <div className="home-biz-panels">
          {/* MRKT Matches */}
          <Card>
            <SectionHeader
              title="MRKT Matches"
              sub="Creators ranked by match score against your active campaigns."
              linkLabel="See all matches"
              linkTo="/matches"
            />
            {data.recommendations.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted, padding: "12px 0" }}>
                {data.activeCampaigns.length === 0
                  ? "Launch a campaign to get AI-powered creator recommendations."
                  : "No strong creator matches yet. Try expanding platform, location, or niche filters on your campaigns."}
              </div>
            ) : (
              <div className="card-grid-3">
                {data.recommendations.slice(0, 3).map((c) => (
                  <CreatorRecommendCard key={c.id} creator={c} />
                ))}
              </div>
            )}
          </Card>

          {/* Active campaigns */}
          <Card>
            <SectionHeader
              title="Active campaigns"
              linkLabel="View all"
              linkTo="/campaigns"
            />
            {data.activeCampaigns.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted, padding: "12px 0" }}>
                No active campaigns. <Link to="/campaign-create" style={{ color: C.accent, textDecoration: "none" }}>Create one →</Link>
              </div>
            ) : (
              <div>
                {data.activeCampaigns.map((c) => (
                  <CampaignProgressCard key={c.id} campaign={c} />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Pipeline + Activity + Intelligence ───────────────────────── */}
        <div className="home-biz-bottom">
          {/* Pipeline overview */}
          <Card>
            <SectionHeader
              title="Pipeline overview"
              linkLabel="View pipeline →"
              linkTo="/pipeline"
            />
            <PipelineOverview pipeline={data.pipeline} />
          </Card>

          {/* Recent messages */}
          <Card>
            <SectionHeader
              title="Recent messages"
              linkLabel="View all"
              linkTo="/messages"
            />
            {data.conversations.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted, padding: "12px 0" }}>
                No conversations yet. Message a creator to start collaborating.
              </div>
            ) : (
              data.conversations.slice(0, 4).map((conv, i, arr) => (
                <ConversationRow key={conv.id} conv={conv} isLast={i === arr.length - 1} />
              ))
            )}
          </Card>

          {/* MRKT Intelligence */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Sparkles size={14} style={{ color: C.accent }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.015em" }}>
                MRKT Intelligence
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 14 }}>
              {aiInsightsLoading ? "Generating insights…" : "AI insights to help you grow."}
            </div>
            <IntelligencePanel items={businessInsights} loading={aiInsightsLoading} />
          </Card>

          {/* From your Marketing Hub — reads the cache only, omitted if empty */}
          {marketingHubBrief?.health && (
            <Card>
              <Link to="/marketing-hub" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, textDecoration: "none" }}>
                <Compass size={14} style={{ color: C.accent }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.015em" }}>
                  From your Marketing Hub
                </span>
              </Link>
              <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 12 }}>
                Health score: {marketingHubBrief.health.score}/100
              </div>
              <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.55, marginBottom: marketingHubBrief.weekly_priorities?.[0] ? 10 : 0 }}>
                {marketingHubBrief.health.summary}
              </div>
              {marketingHubBrief.weekly_priorities?.[0] && (
                <div style={{ fontSize: 12.5, color: C.textTertiary, marginBottom: 12 }}>
                  Top priority: <span style={{ color: C.textSecondary }}>{marketingHubBrief.weekly_priorities[0].title}</span>
                </div>
              )}
              <Link to="/marketing-hub" style={{ fontSize: 12.5, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>
                Open Marketing Hub →
              </Link>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}

// ── CREATOR HOME ──────────────────────────────────────────────────────────────

function CreatorStatChip({ icon: Icon, iconColor, value, label, sub, badge, linkTo }: {
  icon: React.ElementType;
  iconColor: string;
  value: string;
  label: string;
  sub: string;
  badge?: string;
  linkTo: string;
}) {
  return (
    <Link
      to={linkTo as "/"}
      style={{
        display:        "flex",
        flexDirection:  "column",
        padding:        "14px 16px",
        background:     "oklch(0.085 0 0)",
        border:         `1px solid oklch(1 0 0 / 7%)`,
        borderRadius:   18,
        textDecoration: "none",
        boxShadow:      "inset 0 1px 0 oklch(1 0 0 / 6%), 0 2px 8px oklch(0 0 0 / 40%)",
        transition:     "background 160ms ease, border-color 160ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 160ms ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = "oklch(0.115 0 0)";
        el.style.borderColor = "oklch(1 0 0 / 11%)";
        el.style.transform   = "translateY(-2px)";
        el.style.boxShadow   = "inset 0 1px 0 oklch(1 0 0 / 8%), 0 6px 24px oklch(0 0 0 / 55%), 0 2px 8px oklch(0 0 0 / 35%)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = "oklch(0.085 0 0)";
        el.style.borderColor = "oklch(1 0 0 / 7%)";
        el.style.transform   = "";
        el.style.boxShadow   = "inset 0 1px 0 oklch(1 0 0 / 6%), 0 2px 8px oklch(0 0 0 / 40%)";
      }}
    >
      <div style={{
        width:          30,
        height:         30,
        borderRadius:   9,
        background:     `${iconColor.replace(")", " / 12%)")}`,
        border:         `1px solid ${iconColor.replace(")", " / 20%)")}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        marginBottom:   10,
      }}>
        <Icon size={14} style={{ color: iconColor }} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        {badge && (
          <span style={{ fontSize: 11, fontWeight: 700, color: iconColor }}>{badge}</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginTop: 3, letterSpacing: "-0.01em" }}>{label}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{sub}</div>
    </Link>
  );
}

function OpportunityCard({ opp }: { opp: OpportunityItem }) {
  const score = opp.matchScore;
  const matchColor = score != null ? (score >= 80 ? C.green : score >= 65 ? C.accent : C.textSecondary) : C.textSecondary;
  const isPaid = opp.budget !== "N/A" && opp.budget !== "$0" && opp.budget !== "";

  return (
    <Link
      to={`/opportunities` as "/"}
      style={{
        display:        "flex",
        gap:            14,
        padding:        "14px 0",
        borderBottom:   `1px solid oklch(1 0 0 / 5%)`,
        textDecoration: "none",
        transition:     "opacity 140ms ease",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.82"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      {/* Icon placeholder */}
      <div style={{
        width:          48,
        height:         48,
        borderRadius:   12,
        background:     "oklch(1 0 0 / 5%)",
        border:         "1px solid oklch(1 0 0 / 8%)",
        flexShrink:     0,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
      }}>
        <Zap size={16} style={{ color: "oklch(1 0 0 / 30%)" }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
            {opp.title}
          </div>
          {isPaid && (
            <div style={{ fontSize: 14, fontWeight: 800, color: C.green, flexShrink: 0, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {opp.budget}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "oklch(1 0 0 / 35%)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>
          {opp.brandName}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {score != null && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, color: matchColor,
              background: matchColor.replace(")", " / 12%)"),
              padding: "2.5px 8px", borderRadius: 7,
              border: `1px solid ${matchColor.replace(")", " / 22%)")}`,
              letterSpacing: "0.03em",
            }}>
              {score >= 80 ? "Strong match" : score >= 65 ? "Good match" : "Potential"}
            </span>
          )}
          {opp.isNew && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: C.accent,
              background: C.accentMuted, padding: "2.5px 8px", borderRadius: 7,
              border: `1px solid ${C.accentBorder}`,
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              New
            </span>
          )}
          {opp.daysLeft > 0 && (
            <span style={{ fontSize: 11, color: "oklch(1 0 0 / 22%)", marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={9} /> {opp.daysLeft}d
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function ConversationRow({ conv, isLast }: { conv: ConversationItem; isLast?: boolean }) {
  const initial = conv.partnerName[0]?.toUpperCase() ?? "?";
  const bgColor = avatarBg(conv.partnerName);

  return (
    <Link
      to={`/messages/${conv.conversationId}` as "/"}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            12,
        padding:        "10px 0",
        borderBottom:   isLast ? "none" : `1px solid ${C.borderFaint}`,
        textDecoration: "none",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      {/* Avatar */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {conv.avatarUrl ? (
          <img
            src={conv.avatarUrl}
            alt={conv.partnerName}
            style={{
              width:        36,
              height:       36,
              borderRadius: "50%",
              objectFit:    "cover",
              border:       "1px solid oklch(1 0 0 / 10%)",
              display:      "block",
            }}
          />
        ) : (
          <div style={{
            width:          36,
            height:         36,
            borderRadius:   "50%",
            background:     bgColor,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            fontSize:       13,
            fontWeight:     700,
            color:          "oklch(0.065 0 0)",
          }}>
            {initial}
          </div>
        )}
        {conv.isUnread && (
          <div style={{
            position:     "absolute",
            bottom:       0,
            right:        0,
            width:        9,
            height:       9,
            borderRadius: "50%",
            background:   C.accent,
            border:       "2px solid oklch(0.10 0 0)",
          }} />
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: conv.isUnread ? 600 : 500, color: C.textPrimary, marginBottom: 2 }}>
          {conv.partnerName}
        </div>
        <div style={{ fontSize: 12, color: C.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {conv.lastMessage}
        </div>
      </div>

      {/* Timestamp */}
      <div style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{conv.timeAgo}</div>
    </Link>
  );
}

// ─── Application row for home widget ─────────────────────────────────────────

const APP_STATUS_HOME: Record<string, { label: string; color: string }> = {
  pending:     { label: "Submitted",    color: "oklch(0.70 0.08 68)"  },
  reviewing:   { label: "Under Review", color: "oklch(0.70 0.08 68)"  },
  shortlisted: { label: "Shortlisted",  color: "oklch(0.72 0.10 224)" },
  accepted:    { label: "Approved",     color: "oklch(0.62 0.12 158)" },
  rejected:    { label: "Declined",     color: "oklch(0.52 0.15 24)"  },
};

function ApplicationRow({ app, isLast }: { app: ApplicationSummary; isLast: boolean }) {
  const statusCfg = APP_STATUS_HOME[app.status] ?? APP_STATUS_HOME.pending;
  return (
    <Link
      to="/applications"
      style={{
        display:       "flex",
        alignItems:    "center",
        justifyContent: "space-between",
        gap:            12,
        padding:       "11px 0",
        borderBottom:  isLast ? "none" : `1px solid ${C.borderFaint}`,
        textDecoration: "none",
        cursor:        "pointer",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.textTertiary, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 2 }}>
          {app.campaign_brand}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {app.campaign_title}
        </div>
      </div>
      <span style={{
        fontSize:    10.5,
        fontWeight:  600,
        color:       statusCfg.color,
        whiteSpace:  "nowrap",
        flexShrink:  0,
      }}>
        {statusCfg.label}
      </span>
    </Link>
  );
}

function CreatorHome({ data, aiInsights, aiInsightsLoading, onOpenReport, completedMissionIds, onMissionComplete }: {
  data:                 CreatorData;
  aiInsights:           Array<{ text: string; link: string }> | null;
  aiInsightsLoading:    boolean;
  onOpenReport:         () => void;
  completedMissionIds:  Set<string>;
  onMissionComplete:    (id: string) => void;
}) {
  const { t } = useI18n();
  const visLabel = data.visibilityScore >= 80 ? "Excellent" : data.visibilityScore >= 65 ? "Good" : data.visibilityScore >= 50 ? "Fair" : "Building";
  const visColor = data.visibilityScore >= 80 ? C.green : data.visibilityScore >= 65 ? C.accent : data.visibilityScore >= 50 ? C.amber : C.red;

  const staticInsights = [
    data.myApplications > 0
      ? { text: `${data.myApplications} application${data.myApplications === 1 ? " is" : "s are"} currently under review.`, link: "/applications" }
      : { text: "New brand campaigns are posted daily. Apply to find your next collaboration.", link: "/opportunities" },
    data.unreadMessages > 0
      ? { text: `${data.unreadMessages} unread message${data.unreadMessages === 1 ? "" : "s"} from brands — respond quickly to stay top of mind.`, link: "/messages" }
      : { text: "Brands are searching for creators in your niche right now.", link: "/find-creators" },
    data.upcomingCount === 0
      ? { text: "Nothing scheduled this week. Consistent posting grows your visibility score.", link: "/content-planner" }
      : { text: `${data.upcomingCount} piece${data.upcomingCount === 1 ? "" : "s"} of content scheduled this week. Keep the momentum going.`, link: "/content-planner" },
    { text: "Use the AI Strategist to generate hooks, captions, and growth strategies.", link: "/chat" },
  ];
  const creatorInsights = aiInsights ?? staticInsights;

  // Compute daily missions from real data
  const missions: Mission[] = [];
  if (data.opportunities.length > 0)
    missions.push({ id: "apply_opps",     label: `Apply to ${data.opportunities.length} new opportunit${data.opportunities.length === 1 ? "y" : "ies"}`, sub: "Matched to your profile today", link: "/opportunities",   icon: Zap,         priority: "high" });
  if (data.unreadMessages > 0)
    missions.push({ id: "reply_messages", label: `Reply to ${data.unreadMessages} message${data.unreadMessages === 1 ? "" : "s"}`, sub: "Fast responses boost your reputation", link: "/messages",        icon: MessageSquare, priority: "high" });
  if (data.upcomingCount === 0)
    missions.push({ id: "plan_content",   label: "Plan your content for this week",                  sub: "Consistent posting raises your visibility", link: "/content-planner", icon: CalendarDays,  priority: "medium" });
  if (data.visibilityScore < 70)
    missions.push({ id: "boost_visibility", label: "Improve your visibility score",                  sub: `Currently ${data.visibilityScore} — small changes, big impact`, link: "/analytics",       icon: TrendingUp,    priority: "medium" });
  missions.push({ id: "ai_strategist",    label: "Ask the AI Strategist",                            sub: "Hooks, captions, and growth strategy",      link: "/chat",            icon: Sparkles,      priority: "low" });

  const viewsChange = data.profileViewsChange > 0
    ? `↑${data.profileViewsChange}%`
    : data.profileViewsChange < 0
      ? `↓${Math.abs(data.profileViewsChange)}%`
      : null;

  const herSub = data.myApplications > 0
    ? `${data.myApplications} application${data.myApplications === 1 ? "" : "s"} under review · ${data.opportunities.length} new opportunities available.`
    : data.opportunities.length > 0
      ? `${data.opportunities.length} new opportunities match your profile today.`
      : "Here's what's happening with your creator journey.";

  return (
    <div style={{ minHeight: "100vh", background: C.canvas }}>
      <div className="home-page-inner">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.18em", color: "oklch(1 0 0 / 28%)", marginBottom: 8,
          }}>
            {t(greetingKey())}, {data.displayName}
          </div>
          <h1 style={{
            fontSize: "clamp(1.5rem, 2.8vw, 2.25rem)", fontWeight: 700,
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
            color: C.textPrimary, letterSpacing: "-0.04em", lineHeight: 1.05,
            margin: 0, marginBottom: 6,
          }}>
            {data.opportunities.length > 0
              ? `${data.opportunities.length} opportunities.`
              : data.myApplications > 0 ? "Applications in review." : "Your creator dashboard."}
          </h1>
          <p style={{ fontSize: 14.5, color: "oklch(1 0 0 / 48%)", margin: 0, marginBottom: 22, fontWeight: 400 }}>
            {herSub}
          </p>
          {/* Primary CTA + secondary week report */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              to={(data.unreadMessages > 0 ? "/messages" : data.opportunities.length > 0 ? "/opportunities" : "/opportunities") as "/"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "11px 22px",
                background: "oklch(1 0 0 / 92%)", color: "oklch(0.06 0 0)",
                borderRadius: 12, fontSize: 13.5, fontWeight: 600,
                textDecoration: "none", letterSpacing: "-0.01em",
                transition: "background 120ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 92%)"; }}
            >
              {data.unreadMessages > 0
                ? `Reply to ${data.unreadMessages} message${data.unreadMessages === 1 ? "" : "s"}`
                : data.opportunities.length > 0 ? "View opportunities" : "Explore campaigns"}
              <ArrowRight size={14} />
            </Link>
            <button
              onClick={onOpenReport}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "11px 16px",
                background: "oklch(1 0 0 / 6%)", border: "1px solid oklch(1 0 0 / 9%)",
                borderRadius: 12, fontSize: 12.5, fontWeight: 500,
                color: C.textTertiary, cursor: "pointer",
                transition: "all 140ms ease",
              }}
              onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(1 0 0 / 10%)"; el.style.color = C.textSecondary; }}
              onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "oklch(1 0 0 / 6%)"; el.style.color = C.textTertiary; }}
            >
              <BarChart2 size={12} /> Your week
            </button>
          </div>
        </div>

        {/* ── Daily Missions ────────────────────────────────────────────── */}
        <DailyMissionsCard missions={missions} completedIds={completedMissionIds} onComplete={onMissionComplete} />

        {/* ── Stat chips (6 — 3×2 grid) ───────────────────────────────── */}
        <div className="home-cr-stats">
          <CreatorStatChip
            icon={Zap}
            iconColor={C.accent}
            value={String(data.opportunities.length)}
            label="New opportunities"
            sub="Matches for you"
            linkTo="/opportunities"
          />
          <CreatorStatChip
            icon={Bookmark}
            iconColor={C.chrome}
            value={String(data.savedCount)}
            label="Saved opportunities"
            sub="Quick access"
            linkTo="/saved"
          />
          <CreatorStatChip
            icon={ClipboardList}
            iconColor={C.amber}
            value={String(data.myApplications)}
            label={data.myApplications === 1 ? "Active application" : "Active applications"}
            sub="Track status"
            linkTo="/applications"
          />
          <CreatorStatChip
            icon={Eye}
            iconColor={C.aiBlue}
            value={String(data.profileViews)}
            label="Profile views"
            sub="This week"
            badge={viewsChange ?? undefined}
            linkTo="/analytics"
          />
          <CreatorStatChip
            icon={TrendingUp}
            iconColor={visColor}
            value={String(data.visibilityScore)}
            label="Visibility score"
            sub={visLabel}
            linkTo="/analytics"
          />
          <CreatorStatChip
            icon={CalendarDays}
            iconColor={C.green}
            value={String(data.upcomingCount)}
            label="Upcoming content"
            sub="This week"
            linkTo="/content-planner"
          />
        </div>

        {/* ── Opportunities + Messages ──────────────────────────────────── */}
        <div className="home-cr-panels">
          {/* Top opportunities */}
          <Card>
            <SectionHeader
              title="Top opportunities for you"
              sub="Top matches based on your profile."
              linkLabel="View all"
              linkTo="/opportunities"
            />
            {data.opportunities.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted, padding: "12px 0" }}>
                No active campaigns right now. <Link to="/opportunities" style={{ color: C.accent, textDecoration: "none" }}>Check back soon →</Link>
              </div>
            ) : (
              <>
                {data.opportunities.slice(0, 3).map((opp) => (
                  <OpportunityCard key={opp.id} opp={opp} />
                ))}
                <Link
                  to="/opportunities"
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    gap:            6,
                    marginTop:      14,
                    fontSize:       13,
                    color:          C.accent,
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                >
                  View all opportunities <ArrowRight size={13} />
                </Link>
              </>
            )}
          </Card>

          {/* Active Applications */}
          <Card>
            <SectionHeader
              title="My Applications"
              sub={data.myApplications > 0 ? `${data.myApplications} active` : undefined}
              linkLabel="View all"
              linkTo="/applications"
            />
            {data.recentApplications.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted, padding: "12px 0" }}>
                No active applications. <Link to="/opportunities" style={{ color: C.accent, textDecoration: "none" }}>Browse campaigns →</Link>
              </div>
            ) : (
              <>
                {data.recentApplications.map((app, i, arr) => (
                  <ApplicationRow
                    key={app.id}
                    app={app}
                    isLast={i === arr.length - 1}
                  />
                ))}
                <Link
                  to="/applications"
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    gap:            6,
                    marginTop:      14,
                    fontSize:       13,
                    color:          C.accent,
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                >
                  View all applications <ArrowRight size={13} />
                </Link>
              </>
            )}
          </Card>
        </div>

        {/* ── Visibility + Content + Intelligence ──────────────────────── */}
        <div className="home-cr-bottom">
          {/* Visibility score — flagship metric */}
          <Card style={{ position: "relative", overflow: "hidden" }}>
            {/* Ambient glow behind the score */}
            <div style={{
              position: "absolute", top: -40, right: -40, width: 180, height: 180,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${visColor.replace(")", " / 12%)")} 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.28em",
                color: "oklch(1 0 0 / 26%)",
              }}>
                Visibility Score
              </div>
              <Link to="/analytics" style={{ fontSize: 11.5, color: "oklch(1 0 0 / 36%)", textDecoration: "none", transition: "color 120ms" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 65%)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 36%)"; }}
              >
                Analytics →
              </Link>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 8 }}>
              <span style={{
                fontSize: "clamp(2.5rem, 4vw, 3.25rem)",
                fontWeight: 800,
                fontFamily: "'Inter Tight', 'Inter', sans-serif",
                color: C.textPrimary,
                letterSpacing: "-0.05em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}>
                {data.visibilityScore}
              </span>
              <div style={{ paddingBottom: 6 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 8,
                  background: visColor.replace(")", " / 12%)"),
                  border: `1px solid ${visColor.replace(")", " / 22%)")}`,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: visColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: visColor }}>{visLabel}</span>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: "oklch(1 0 0 / 38%)", marginBottom: 20 }}>
              More visible than <strong style={{ color: "oklch(1 0 0 / 70%)", fontWeight: 600 }}>{Math.min(99, data.visibilityScore + 4)}%</strong> of creators on MRKT
            </div>
            <VisibilityScoreChart score={data.visibilityScore} />
            {data.profileViewsChange > 0 && (
              <div style={{ fontSize: 12.5, color: C.green, marginTop: 14, display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>
                <TrendingUp size={13} /> {data.profileViewsChange}% growth this week
              </div>
            )}
          </Card>

          {/* Upcoming content */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.015em" }}>
                Upcoming content
              </div>
              <Link to="/content-planner" style={{ fontSize: 12, color: C.textTertiary, textDecoration: "none" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.textPrimary; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textTertiary; }}
              >
                View calendar →
              </Link>
            </div>
            {data.upcomingContent.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textMuted, paddingBottom: 12 }}>
                Nothing scheduled this week.
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {data.upcomingContent.slice(0, 4).map((item, i) => {
                  const isLast = i === data.upcomingContent.slice(0, 4).length - 1;
                  const d = new Date(item.date);
                  const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <div
                      key={item.id}
                      style={{
                        display:       "flex",
                        alignItems:    "center",
                        gap:           12,
                        padding:       "10px 0",
                        borderBottom:  isLast ? "none" : `1px solid ${C.borderFaint}`,
                      }}
                    >
                      <div style={{
                        width:          44,
                        textAlign:      "center",
                        flexShrink:     0,
                      }}>
                        <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {d.toLocaleDateString("en-US", { month: "short" })}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.1 }}>
                          {d.getDate()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: C.textPrimary }}>{item.contentType}</div>
                        <div style={{ fontSize: 11.5, color: C.textTertiary, marginTop: 1 }}>{item.platform}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              to="/content-planner"
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            8,
                padding:        "10px",
                background:     C.raised,
                border:         `1px solid ${C.borderSubtle}`,
                borderRadius:   10,
                fontSize:       13,
                fontWeight:     500,
                color:          C.textSecondary,
                textDecoration: "none",
                transition:     "background 120ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = C.high;
                (e.currentTarget as HTMLElement).style.color = C.textPrimary;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = C.raised;
                (e.currentTarget as HTMLElement).style.color = C.textSecondary;
              }}
            >
              <CalendarDays size={13} />
              Open Content Planner
            </Link>
          </Card>

          {/* MRKT Intelligence */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Sparkles size={14} style={{ color: C.accent }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.015em" }}>
                MRKT Intelligence
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 14 }}>
              {aiInsightsLoading ? "Generating insights…" : "Personalized insights to grow your brand."}
            </div>
            <IntelligencePanel items={creatorInsights} loading={aiInsightsLoading} />
          </Card>
        </div>

      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ minHeight: "100vh", background: C.canvas, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={22} style={{ color: C.textMuted, animation: "spin 1s linear infinite" }} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type InsightItem = { text: string; link: string };

// Cached Marketing Hub briefing, read directly from marketing_hub_briefings —
// never triggers generation from the dashboard (see /marketing-hub for that).
type MarketingHubTeaser = {
  health?: { score: number; summary: string };
  weekly_priorities?: Array<{ title: string }>;
};

function HomePage() {
  const { user } = useAuth();
  const [businessData,        setBusinessData]        = useState<BusinessData | null>(null);
  const [creatorData,         setCreatorData]          = useState<CreatorData | null>(null);
  const [loading,             setLoading]              = useState(true);
  const [isBusiness,          setIsBusiness]           = useState(false);
  const [marketingHubBrief,   setMarketingHubBrief]    = useState<MarketingHubTeaser | null>(null);
  const [aiInsights,          setAiInsights]           = useState<InsightItem[] | null>(null);
  const [aiInsightsLoading,   setAiInsightsLoading]    = useState(false);
  const [weeklyReportOpen,    setWeeklyReportOpen]     = useState(false);
  const [weeklyReport,        setWeeklyReport]         = useState<WeeklyReportData | null>(null);
  const [reportLoading,       setReportLoading]        = useState(false);
  const [completedMissionIds, setCompletedMissionIds] = useState<Set<string>>(new Set());
  const roleRef = useRef<"creator" | "business">("creator");

  const loadAiInsights = useCallback(async (
    role: "creator" | "business",
    stats: Record<string, unknown>,
    context: Record<string, unknown>,
  ) => {
    setAiInsightsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.functions.invoke("generate-intelligence", {
        body: { role, stats, context },
      });
      if (!error && data?.insights?.length) {
        setAiInsights(data.insights as InsightItem[]);
      }
    } catch {
      // Non-fatal — static insights stay
    } finally {
      setAiInsightsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openReport = useCallback(async () => {
    setWeeklyReportOpen(true);
    if (weeklyReport) return; // already loaded
    setReportLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.functions.invoke("weekly-report", {
        body: { user_id: user?.id, role: roleRef.current },
      });
      if (!error && data) setWeeklyReport(data as WeeklyReportData);
    } catch {
      // Non-fatal
    } finally {
      setReportLoading(false);
    }
  }, [user, weeklyReport]);

  const markMissionComplete = useCallback((missionId: string) => {
    if (!user || completedMissionIds.has(missionId)) return;
    setCompletedMissionIds((prev) => new Set([...prev, missionId]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase
      .from("mission_completions")
      .insert({ user_id: user.id, mission_id: missionId })
      .then(() => {}, () => {});
    trackMarketplaceEvent({
      actorUserId: user.id,
      eventType: "mission_completed",
      metadata: { mission_id: missionId },
    });
  }, [user, completedMissionIds]);

  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    const db  = supabase;

    (async () => {
      setLoading(true);

      // Resolve display name and account role for both roles
      const [baseProfile, cpRow, bpRow] = await Promise.all([
        db.from("profiles").select("name,account_type,onboarding_path").eq("id", uid).maybeSingle(),
        db.from("creator_profiles").select("display_name").eq("user_id", uid).maybeSingle(),
        db.from("business_profiles").select("company_name").eq("user_id", uid).maybeSingle(),
      ]);
      const displayName: string =
        bpRow.data?.company_name ||
        cpRow.data?.display_name ||
        baseProfile.data?.name  ||
        user.email?.split("@")[0] ||
        "there";

      const roleIsBusiness = isBizProfile(
        baseProfile.data?.account_type as string | null,
        baseProfile.data?.onboarding_path as string | null,
      );
      setIsBusiness(roleIsBusiness);
      roleRef.current = roleIsBusiness ? "business" : "creator";

      // Marketing Hub teaser — reads the cache only, never triggers generation.
      if (roleIsBusiness) {
        db.from("marketing_hub_briefings")
          .select("briefing")
          .eq("user_id", uid)
          .order("period_start", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.briefing) setMarketingHubBrief(data.briefing as MarketingHubTeaser);
          });
      }

      // ── Load today's mission completions + log session start (once per day) ──
      const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
      const [missionsRes, existingSessionRes] = await Promise.all([
        db.from("mission_completions")
          .select("mission_id")
          .eq("user_id", uid)
          .gte("completed_at", todayStart),
        // Check if session_start already logged today (dedup)
        db.from("user_activity_log")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("event_type", "session_start")
          .gte("created_at", todayStart),
      ]);
      if (missionsRes.data?.length) {
        setCompletedMissionIds(new Set(missionsRes.data.map((r: { mission_id: string }) => r.mission_id)));
      }
      // Only insert session_start once per calendar day
      if ((existingSessionRes.count as number) === 0) {
        db.from("user_activity_log")
          .insert({ user_id: uid, event_type: "session_start", meta: { role: roleIsBusiness ? "business" : "creator" } })
          .then(() => {}, () => {});
      }

      // ── Shared: resolve recent conversations with proper participant names ──
      // Mirrors the participant-resolution logic in messages.tsx so names always
      // come from creator_profiles / business_profiles, never from notification titles.
      async function resolveConversations(limit = 4): Promise<ConversationItem[]> {
        try {
          // 1. My participation rows
          const { data: myParts } = await db
            .from("conversation_participants")
            .select("conversation_id, last_read_at, unread_count")
            .eq("user_id", uid);

          if (!myParts?.length) return [];

          const convIds = (myParts as Array<{ conversation_id: string; last_read_at: string | null; unread_count: number }>)
            .map((p) => p.conversation_id);

          // 2. Conversations ordered by recency
          const { data: convs } = await db
            .from("conversations")
            .select("id, last_message, last_message_at, last_sender_id, updated_at")
            .in("id", convIds)
            .order("updated_at", { ascending: false })
            .limit(limit);

          if (!convs?.length) return [];

          // 3. Other participants in those conversations
          const { data: otherParts } = await db
            .from("conversation_participants")
            .select("conversation_id, user_id")
            .in("conversation_id", (convs as Array<{ id: string }>).map((c) => c.id))
            .neq("user_id", uid);

          const otherUserIds: string[] = Array.from(
            new Set((otherParts ?? []).map((p: { user_id: string }) => p.user_id))
          );

          // 4. Resolve names + avatars in parallel
          const [creatorsRes, bizsRes] = await Promise.all([
            db.from("creator_profiles")
              .select("user_id, display_name, profile_image_url")
              .in("user_id", otherUserIds),
            db.from("business_profiles")
              .select("user_id, company_name, logo_url")
              .in("user_id", otherUserIds),
          ]);

          type CP = { user_id: string; display_name: string | null; profile_image_url: string | null };
          type BP = { user_id: string; company_name: string | null; logo_url: string | null };
          type MP = { conversation_id: string; last_read_at: string | null; unread_count: number };
          type OP = { conversation_id: string; user_id: string };
          type CV = { id: string; last_message: string | null; last_message_at: string | null; last_sender_id: string | null; updated_at: string };

          const creatorMap = new Map<string, CP>((creatorsRes.data ?? []).map((c: CP) => [c.user_id, c]));
          const bizMap     = new Map<string, BP>((bizsRes.data ?? []).map((b: BP) => [b.user_id, b]));
          const otherMap   = new Map<string, string>((otherParts ?? []).map((p: OP) => [p.conversation_id, p.user_id]));
          const myPartMap  = new Map<string, MP>((myParts as MP[]).map((p) => [p.conversation_id, p]));

          return (convs as CV[]).map((conv): ConversationItem => {
            const otherUserId = otherMap.get(conv.id) ?? null;
            const creator  = otherUserId ? creatorMap.get(otherUserId) ?? null : null;
            const biz      = otherUserId ? bizMap.get(otherUserId) ?? null : null;
            const myPart   = myPartMap.get(conv.id);

            // Fallback: business company_name → creator display_name → "Unknown"
            const partnerName =
              biz?.company_name?.trim()  ||
              creator?.display_name?.trim() ||
              "Unknown";

            const avatarUrl = biz?.logo_url ?? creator?.profile_image_url ?? null;

            const isUnread = !!(
              conv.last_message_at &&
              conv.last_sender_id !== uid &&
              (!myPart?.last_read_at || new Date(conv.last_message_at) > new Date(myPart.last_read_at))
            );

            return {
              id:             conv.id,
              conversationId: conv.id,
              partnerName,
              avatarUrl,
              lastMessage:    conv.last_message ?? "Sent a message",
              timeAgo:        timeAgo(conv.last_message_at ?? conv.updated_at),
              isUnread,
            };
          });
        } catch {
          return [];
        }
      }

      if (roleIsBusiness) {
        // ── Business data fetch ────────────────────────────────────────
        // Step 1: campaigns + creators + misc in true parallel (no nested awaits)
        const [campaignsRes, creatorsRes, notifRes, unreadMsg] = await Promise.all([
          // Active + paused campaigns with matching criteria columns
          db
            .from("campaigns")
            .select("id, title, deadline, created_at, status, required_platforms, required_niches, business_industry, required_country, required_language, min_followers, compensation_type")
            .eq("user_id", uid)
            .in("status", ["active", "paused"])
            .order("created_at", { ascending: false })
            .limit(6),

          // Top creator profiles with all matching-relevant columns
          db
            .from("creator_profiles")
            .select("id, user_id, display_name, niche, categories, follower_count, profile_image_url, platforms, location, location_city, location_country, audience_location, primary_language, accepts_paid, accepts_gifted, accepts_affiliate")
            .order("follower_count", { ascending: false })
            .limit(30),

          // Recent notifications as activity
          db
            .from("notifications")
            .select("id, type, title, body, link, read, created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(8),

          fetchUnreadCount(uid),
        ]);

        const campaigns = (campaignsRes.data ?? []) as Array<{
          id: string;
          title: string;
          deadline: string | null;
          created_at: string;
          status: string;
          required_platforms: string[] | null;
          required_niches: string[] | null;
          business_industry: string | null;
          required_country: string | null;
          required_language: string | null;
          min_followers: number | null;
          compensation_type: string | null;
        }>;

        const campaignIds = campaigns.map((c) => c.id);

        // Step 2: Applications using real campaign IDs (no nested await)
        const appsRes = campaignIds.length > 0
          ? await db
              .from("campaign_applications")
              .select("id, campaign_id, status, user_id, created_at")
              .in("campaign_id", campaignIds)
              .order("created_at", { ascending: false })
          : { data: [] as Array<{ id: string; campaign_id: string; status: string; user_id: string; created_at: string }>, error: null };

        const allApps = (appsRes.data ?? []) as Array<{
          id: string;
          campaign_id: string;
          status: string;
          user_id: string;
          created_at: string;
        }>;

        const pendingApps = allApps.filter((a) => a.status === "pending").length;
        const recentCreatorUserIds = [
          ...new Set(
            allApps
              .filter((a) => a.status === "pending")
              .slice(0, 8)
              .map((a) => a.user_id)
          ),
        ];

        // Fetch recent applicant profiles for avatars
        let recentApplicants: Applicant[] = [];
        if (recentCreatorUserIds.length > 0) {
          const applicantRows = await db
            .from("creator_profiles")
            .select("user_id, display_name, profile_image_url")
            .in("user_id", recentCreatorUserIds)
            .limit(8);
          recentApplicants = (applicantRows.data ?? []).map((r: { user_id: string; display_name: string; profile_image_url: string | null }) => ({
            id:       r.user_id,
            name:     r.display_name ?? "Creator",
            imageUrl: r.profile_image_url,
          }));
        }

        // Pipeline stages derived from the same allApps — no extra query needed
        const pipeline: PipelineStages = {
          pending:     allApps.filter((r) => r.status === "pending").length,
          shortlisted: allApps.filter((r) => r.status === "shortlisted").length,
          in_review:   allApps.filter((r) => r.status === "in_review" || r.status === "reviewing").length,
          accepted:    allApps.filter((r) => r.status === "accepted").length,
          total:       allApps.length,
        };

        // Active campaigns with per-campaign application counts
        const appCountByCampaign = new Map<string, number>();
        for (const app of allApps) {
          appCountByCampaign.set(app.campaign_id, (appCountByCampaign.get(app.campaign_id) ?? 0) + 1);
        }
        const now = Date.now();
        const activeCampaigns: ActiveCampaign[] = campaigns.map((c) => {
          const dl = c.deadline ? new Date(c.deadline).getTime() : null;
          const start = new Date(c.created_at).getTime();
          const progress = dl
            ? Math.round(((now - start) / (dl - start)) * 100)
            : 50;
          return {
            id:               c.id,
            title:            c.title,
            applicationCount: appCountByCampaign.get(c.id) ?? 0,
            deadline:         c.deadline,
            progress:         Math.min(95, Math.max(5, progress)),
          };
        });

        // MRKT Matches — real score via computeMatchScore across all active campaigns
        const rawCreators = (creatorsRes.data ?? []) as Array<{
          id: string; user_id: string; display_name: string;
          niche: string | null; categories: string[] | null;
          follower_count: number | null; profile_image_url: string | null;
          platforms: string[] | null; location: string | null;
          location_city: string | null; location_country: string | null;
          audience_location: string | null; primary_language: string | null;
          accepts_paid: boolean | null; accepts_gifted: boolean | null;
          accepts_affiliate: boolean | null;
        }>;

        const campaignInputs: CampaignInput[] = campaigns.map((c) => ({
          required_platforms: c.required_platforms ?? [],
          required_niches:    c.required_niches ?? [],
          business_industry:  c.business_industry ?? null,
          required_country:   c.required_country ?? null,
          required_language:  c.required_language ?? null,
          min_followers:      c.min_followers ?? null,
          compensation_type:  c.compensation_type ?? "",
        }));

        const topCreators = campaignInputs.length > 0
          ? rawCreators
              .map((cr) => {
                const creatorInput: CreatorInput = {
                  platforms:         cr.platforms ?? [],
                  niche:             cr.niche ?? null,
                  categories:        cr.categories ?? [],
                  audience_location: cr.audience_location ?? null,
                  location:          cr.location ?? null,
                  location_city:     cr.location_city ?? null,
                  location_country:  cr.location_country ?? null,
                  follower_count:    cr.follower_count ?? null,
                  primary_language:  cr.primary_language ?? null,
                  accepts_paid:      cr.accepts_paid ?? true,
                  accepts_gifted:    cr.accepts_gifted ?? true,
                  accepts_affiliate: cr.accepts_affiliate ?? false,
                };
                const bestScore = Math.max(
                  ...campaignInputs.map((ci) => computeMatchScore(creatorInput, ci).total)
                );
                return { creator: cr, score: bestScore };
              })
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
          : rawCreators.slice(0, 3).map((cr, i) => ({ creator: cr, score: 85 - i * 3 }));

        const recommendations: RecommendedCreator[] = topCreators.map(({ creator: cr, score }) => ({
          id:        cr.id,
          userId:    cr.user_id,
          name:      cr.display_name ?? "Creator",
          category:  cr.niche ?? cr.categories?.[0] ?? "Creator",
          followers: cr.follower_count,
          imageUrl:  cr.profile_image_url,
          matchScore: score,
        }));

        const businessConversations = await resolveConversations(4);

        const bizDataObj = {
          displayName,
          pendingApps,
          recentApplicants,
          activeCampaigns,
          pipeline,
          unreadMessages:  unreadMsg,
          recommendations,
          activity:        notifRes.data ?? [],
          conversations:   businessConversations,
        };
        setBusinessData(bizDataObj);

        // Fire AI insights in background after main data is set
        loadAiInsights("business", {
          pendingApps,
          activeCampaigns:     activeCampaigns.length,
          pipelineTotal:       pipeline.total,
          shortlisted:         pipeline.shortlisted,
          unreadMessages:      unreadMsg,
          recommendationCount: recommendations.length,
          topMatchScore:       recommendations[0]?.matchScore ?? 0,
        }, {
          displayName,
          industry: campaigns[0]?.business_industry ?? null,
        });
      } else {
        // ── Creator data fetch ─────────────────────────────────────────
        const today   = new Date().toISOString().slice(0, 10);
        const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        const week1ago = new Date(Date.now() - 7 * 86400000).toISOString();
        const week2ago = new Date(Date.now() - 14 * 86400000).toISOString();

        // creator_analytics_events is keyed by creator_profile_id (the profile
        // row's own id), not the auth user id — resolve it first so the two
        // view-count queries below can filter on the right column.
        const cpRes = await db.from("creator_profiles")
          .select("id, status, profile_image_url, bio, platforms, niche, categories, audience_location, audience_age_range, audience_gender_split, location, location_city, location_country, follower_count, primary_language, accepts_paid, accepts_gifted, accepts_affiliate, featured_link_1, featured_link_2, featured_link_3, rate_range")
          .eq("user_id", uid)
          .maybeSingle();
        const creatorProfileId = cpRes.data?.id ?? null;

        const [
          viewsThisWeekRes,
          viewsLastWeekRes,
          unreadMsg,
          opportunitiesRes,
          myAppsRes,
          upcomingRes,
          savedRes,
        ] = await Promise.all([
          // Profile views this week
          creatorProfileId
            ? db.from("creator_analytics_events")
                .select("*", { count: "exact", head: true })
                .eq("creator_profile_id", creatorProfileId)
                .eq("event_type", "profile_viewed")
                .gte("created_at", week1ago)
            : Promise.resolve({ count: 0 }),

          // Profile views last week (for trend)
          creatorProfileId
            ? db.from("creator_analytics_events")
                .select("*", { count: "exact", head: true })
                .eq("creator_profile_id", creatorProfileId)
                .eq("event_type", "profile_viewed")
                .gte("created_at", week2ago)
                .lt("created_at", week1ago)
            : Promise.resolve({ count: 0 }),

          fetchUnreadCount(uid),

          // Active campaigns for opportunity feed (include user_id for business name lookup)
          db.from("campaigns")
            .select("id, user_id, title, deadline, compensation_type, compensation_amount_fixed, compensation_budget_max, required_platforms, required_niches, business_industry, required_country, required_language, min_followers, created_at")
            .eq("status", "active")
            .eq("is_published", true)
            .order("created_at", { ascending: false })
            .limit(10),

          // My applications (recent rows for home widget)
          db.from("campaign_applications")
            .select("id,campaign_id,campaign_title,campaign_brand,status,created_at")
            .eq("user_id", uid)
            .not("status", "eq", "rejected")
            .order("created_at", { ascending: false })
            .limit(4),

          // Upcoming content
          db.from("content_planner_items")
            .select("id, scheduled_date, platform, content_type")
            .eq("user_id", uid)
            .gte("scheduled_date", today)
            .lte("scheduled_date", in7days)
            .order("scheduled_date")
            .limit(5),

          // Saved opportunities count
          db.from("campaign_saves")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid),
        ]);

        const creatorProfile = cpRes.data;
        const viewsThisWeek  = (viewsThisWeekRes.count as number) ?? 0;
        const viewsLastWeek  = (viewsLastWeekRes.count as number) ?? 0;

        // Fetch real business names for opportunities
        const rawOppData = opportunitiesRes.data ?? [];
        const bizUserIds = [...new Set(rawOppData.map((o: { user_id: string }) => o.user_id).filter(Boolean))];
        let businessNameMap: Record<string, string> = {};
        if (bizUserIds.length > 0) {
          const { data: bizProfiles } = await db
            .from("business_profiles")
            .select("user_id, company_name")
            .in("user_id", bizUserIds);
          for (const bp of bizProfiles ?? []) {
            if (bp.user_id && bp.company_name) businessNameMap[bp.user_id] = bp.company_name;
          }
        }
        const viewsChange    = viewsLastWeek > 0
          ? Math.round(((viewsThisWeek - viewsLastWeek) / viewsLastWeek) * 100)
          : 0;

        const visibilityScore = creatorProfile
          ? computeVisibilityScore(creatorProfile as unknown as CreatorProfile).score
          : 0;

        // Compute match scores for opportunities
        const rawOpps = rawOppData;
        const opportunities: OpportunityItem[] = rawOpps.map((opp: {
          id: string; user_id: string; title: string; deadline: string | null;
          compensation_type: string; compensation_amount_fixed: number | null;
          compensation_budget_max: number | null; required_platforms: string[];
          required_niches: string[]; business_industry: string | null;
          required_country: string | null; required_language: string | null;
          min_followers: number | null; created_at: string;
        }) => {
          let matchScore: number | null = null;
          if (creatorProfile) {
            const creatorInput: CreatorInput = {
              platforms:            creatorProfile.platforms ?? [],
              niche:                creatorProfile.niche,
              categories:           creatorProfile.categories ?? [],
              audience_location:    creatorProfile.audience_location,
              location:             creatorProfile.location,
              location_city:        creatorProfile.location_city,
              location_country:     creatorProfile.location_country,
              follower_count:       creatorProfile.follower_count,
              primary_language:     creatorProfile.primary_language,
              accepts_paid:         creatorProfile.accepts_paid ?? true,
              accepts_gifted:       creatorProfile.accepts_gifted ?? true,
              accepts_affiliate:    creatorProfile.accepts_affiliate ?? false,
            };
            const campaignInput: CampaignInput = {
              required_platforms: opp.required_platforms ?? [],
              required_niches:    opp.required_niches ?? [],
              business_industry:  opp.business_industry,
              required_country:   opp.required_country,
              required_language:  opp.required_language,
              min_followers:      opp.min_followers,
              compensation_type:  opp.compensation_type,
            };
            matchScore = computeMatchScore(creatorInput, campaignInput).total;
          }

          const budget = opp.compensation_amount_fixed
            ? `$${opp.compensation_amount_fixed.toLocaleString()}`
            : opp.compensation_budget_max
              ? `$${opp.compensation_budget_max.toLocaleString()}`
              : opp.compensation_type === "gifted" ? "Gifted" : "TBD";

          const createdAt = new Date(opp.created_at).getTime();
          const isNew = Date.now() - createdAt < 7 * 86400000;

          return {
            id:         opp.id,
            title:      opp.title,
            brandName:  businessNameMap[opp.user_id] ?? "Brand",
            budget,
            matchScore: matchScore ?? 0,
            daysLeft:   daysLeft(opp.deadline),
            imageUrl:   null,
            isNew,
          };
        })
          .sort((a: OpportunityItem, b: OpportunityItem) => b.matchScore - a.matchScore)
          .slice(0, 5);

        // Resolve conversations with proper participant names + avatars
        const conversations = await resolveConversations(4);

        const upcomingContent: ContentItem[] = (upcomingRes.data ?? []).map((r: {
          id: string; scheduled_date: string; platform: string; content_type: string;
        }) => ({
          id:          r.id,
          date:        r.scheduled_date,
          platform:    r.platform ?? "Platform",
          contentType: r.content_type ?? "Content",
        }));

        const savedCount    = (savedRes.count as number) ?? 0;
        const myAppsCount   = (myAppsRes.data ?? []).length;
        setCreatorData({
          displayName,
          profileViews:        viewsThisWeek,
          profileViewsChange:  viewsChange,
          unreadMessages:      unreadMsg,
          visibilityScore,
          upcomingCount:       upcomingContent.length,
          myApplications:      myAppsCount,
          savedCount,
          recentApplications:  (myAppsRes.data ?? []) as ApplicationSummary[],
          opportunities,
          conversations,
          upcomingContent,
        });

        // Query real match appearances count
        let matchAppearances = 0;
        if (creatorProfile?.id) {
          const { count: maCount } = await db
            .from("creator_analytics_events")
            .select("*", { count: "exact", head: true })
            .eq("creator_profile_id", creatorProfile.id)
            .eq("event_type", "appeared_in_matching");
          matchAppearances = (maCount as number) ?? 0;
        }

        // Fire AI insights in background after main data is set
        loadAiInsights("creator", {
          profileViews:      viewsThisWeek,
          profileViewsChange: viewsChange,
          matchAppearances,
          myApplications:    myAppsCount,
          unreadMessages:    unreadMsg,
          savedCount,
          visibilityScore,
          upcomingCount:     upcomingContent.length,
          opportunityCount:  opportunities.length,
        }, {
          displayName,
          niche:       creatorProfile?.niche ?? null,
          categories:  creatorProfile?.categories ?? [],
          platforms:   creatorProfile?.platforms ?? [],
          followerCount: creatorProfile?.follower_count ?? 0,
          location:    creatorProfile?.location ?? null,
        });
      }

      setLoading(false);
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <LoadingSkeleton />;

  return (
    <>
      {isBusiness && businessData && (
        <BusinessHome
          data={businessData}
          aiInsights={aiInsights}
          aiInsightsLoading={aiInsightsLoading}
          onOpenReport={openReport}
          completedMissionIds={completedMissionIds}
          onMissionComplete={markMissionComplete}
          marketingHubBrief={marketingHubBrief}
        />
      )}
      {!isBusiness && creatorData && (
        <CreatorHome
          data={creatorData}
          aiInsights={aiInsights}
          aiInsightsLoading={aiInsightsLoading}
          onOpenReport={openReport}
          completedMissionIds={completedMissionIds}
          onMissionComplete={markMissionComplete}
        />
      )}
      {!isBusiness && !creatorData && !loading && <LoadingSkeleton />}
      <WeeklyReportModal
        open={weeklyReportOpen}
        onClose={() => setWeeklyReportOpen(false)}
        report={weeklyReport}
        loading={reportLoading}
      />
    </>
  );
}
