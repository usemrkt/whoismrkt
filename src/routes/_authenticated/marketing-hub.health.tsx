// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/health — Marketing Health: the executive scorecard. Every
// score is deterministic (computed server-side by _shared/marketingHealth.ts
// from the existing Analytics Engine + Market Intelligence layers) — this
// page only renders what the server already decided. No gauges, no decorative
// circles, no vanity metrics: plain numbers, real evidence, one clear action.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute } from "@tanstack/react-router";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Activity, RefreshCw, Loader2, ChevronDown, TrendingUp, TrendingDown, Minus,
  ShieldAlert, Target, Sparkles,
} from "lucide-react";
import { C } from "@/lib/theme";
import { useMarketingHealth, scoreColorKind, type CategoryScore } from "@/lib/marketingHealth";

export const Route = createFileRoute("/_authenticated/marketing-hub/health")({
  head: () => ({ meta: [{ title: "Marketing Health — Marketing Hub — MRKT" }] }),
  component: MarketingHealthSection,
});

function kindColors(kind: "good" | "ok" | "poor" | "unknown") {
  if (kind === "good") return { fg: C.green, bg: C.greenMuted, bdr: C.greenBorder };
  if (kind === "ok")   return { fg: C.amber, bg: C.amberMuted, bdr: C.amberBorder };
  if (kind === "poor") return { fg: C.red,   bg: C.redMuted,   bdr: C.redBorder };
  return { fg: C.textTertiary, bg: C.surface, bdr: C.borderSubtle };
}

function ScoreBar({ score }: { score: number | null }) {
  const kind = scoreColorKind(score);
  const { fg } = kindColors(kind);
  return (
    <div style={{ width: "100%", height: 5, borderRadius: 3, background: C.borderSubtle, overflow: "hidden" }}>
      <div style={{ width: `${score ?? 0}%`, height: "100%", background: fg, borderRadius: 3, transition: "width 300ms ease" }} />
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const label = confidence >= 0.75 ? "High confidence" : confidence >= 0.4 ? "Medium confidence" : "Low confidence";
  return <span style={{ fontSize: 10, color: C.textMuted }}>{label} ({Math.round(confidence * 100)}%)</span>;
}

function TrendIcon({ direction }: { direction?: "up" | "down" | "flat" }) {
  if (!direction || direction === "flat") return <Minus size={12} style={{ color: C.textTertiary }} />;
  return direction === "up" ? <TrendingUp size={12} style={{ color: C.green }} /> : <TrendingDown size={12} style={{ color: C.red }} />;
}

function MarketingHealthSection() {
  const { loading, refreshing, error, health, narrative, refresh } = useMarketingHealth();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "40vh" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} />
      </div>
    );
  }

  const overallKind = scoreColorKind(health?.overall.score ?? null);
  const overallColors = kindColors(overallKind);

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.7rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: 0 }}>
          Marketing Health
        </h2>
        <button
          onClick={refresh}
          disabled={refreshing}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: C.textSecondary, background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 10, padding: "8px 14px", cursor: refreshing ? "default" : "pointer", opacity: refreshing ? 0.6 : 1 }}
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: C.textTertiary, margin: "0 0 22px" }}>
        The executive scorecard — every score is deterministic and traceable back to real evidence.
      </p>

      {error && (
        <div style={{ padding: "14px 16px", background: C.redMuted, border: `1px solid ${C.redBorder}`, borderRadius: 14, color: C.textSecondary, fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {health && (
        <>
          {/* ── Executive summary ─────────────────────────────────────────── */}
          <div style={{ padding: "22px 24px", background: C.surface, border: `1px solid ${overallColors.bdr}`, borderRadius: 16, marginBottom: 24 }}>
            <div className="flex items-center gap-4" style={{ marginBottom: 18, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary, marginBottom: 4 }}>Overall Marketing Health</div>
                <div className="flex items-baseline gap-2">
                  <span style={{ fontSize: 40, fontWeight: 800, color: overallColors.fg, letterSpacing: "-0.03em" }}>
                    {health.overall.score ?? "—"}
                  </span>
                  <span style={{ fontSize: 15, color: C.textTertiary }}>/100</span>
                </div>
                <ConfidenceBadge confidence={health.overall.confidence} />
              </div>
              {narrative?.overall_narrative && (
                <div style={{ flex: 1, minWidth: 240, fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
                  {narrative.overall_narrative}
                </div>
              )}
            </div>

            <div className="marketing-hub-grid" style={{ gap: 12 }}>
              <SummaryItem icon={<Sparkles size={13} style={{ color: C.aiBlue }} />} label="Top Strength"
                value={health.topStrength?.label} explanation={narrative?.top_strength_explanation} empty="None with enough confidence yet" />
              <SummaryItem icon={<ShieldAlert size={13} style={{ color: C.red }} />} label="Biggest Weakness"
                value={health.biggestWeakness?.label} explanation={narrative?.biggest_weakness_explanation} empty="None with enough confidence yet" />
              <SummaryItem icon={<Target size={13} style={{ color: C.green }} />} label="Largest Opportunity"
                value={health.largestOpportunity?.title} explanation={narrative?.largest_opportunity_explanation} empty="None identified yet" />
              <SummaryItem icon={<ShieldAlert size={13} style={{ color: C.amber }} />} label="Largest Risk"
                value={health.largestRisk?.title} explanation={narrative?.largest_risk_explanation} empty="None identified yet" />
            </div>

            {narrative?.highest_priority_action && (
              <div style={{ marginTop: 16, padding: "12px 14px", background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.aiBlue, marginBottom: 3 }}>Highest Priority Action</div>
                <div style={{ fontSize: 13, color: C.textPrimary }}>{narrative.highest_priority_action}</div>
              </div>
            )}
          </div>

          {/* ── Category grid ────────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {health.categories.map((cat) => (
              <CategoryCard key={cat.category} cat={cat} why={narrative?.category_why?.[cat.label]}
                isExpanded={expanded === cat.category} onToggle={() => setExpanded(expanded === cat.category ? null : cat.category)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryItem({ icon, label, value, explanation, empty }: {
  icon: ReactNode; label: string; value?: string; explanation?: string | null; empty: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textTertiary }}>{label}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: value ? C.textPrimary : C.textMuted, marginBottom: 2 }}>
        {value ?? empty}
      </div>
      {explanation && <div style={{ fontSize: 11.5, color: C.textTertiary, lineHeight: 1.5 }}>{explanation}</div>}
    </div>
  );
}

function CategoryCard({ cat, why, isExpanded, onToggle }: {
  cat: CategoryScore; why?: string; isExpanded: boolean; onToggle: () => void;
}) {
  if (cat.status === "more_data_required") {
    return (
      <div style={{ padding: "16px 18px", background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textSecondary, marginBottom: 4 }}>{cat.label}</div>
        <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 6 }}>More data required</div>
        <div style={{ fontSize: 11.5, color: C.textTertiary, lineHeight: 1.5 }}>{cat.missingDataHint}</div>
      </div>
    );
  }

  const cardStyle: CSSProperties = { padding: "16px 18px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, cursor: "pointer" };

  return (
    <div style={cardStyle} onClick={onToggle}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary }}>{cat.label}</div>
        <div className="flex items-center gap-2">
          {cat.trend && <TrendIcon direction={cat.trend.direction} />}
          <ChevronDown size={14} style={{ color: C.textTertiary, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
        </div>
      </div>
      <div className="flex items-baseline gap-1" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: C.textPrimary }}>{cat.score}</span>
        <span style={{ fontSize: 12, color: C.textTertiary }}>/100</span>
      </div>
      <ScoreBar score={cat.score} />
      <div style={{ marginTop: 8 }}><ConfidenceBadge confidence={cat.confidence} /></div>
      {why && <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5, marginTop: 8 }}>{why}</div>}

      {isExpanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderSubtle}` }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, marginBottom: 8 }}>
            Contributing metrics
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cat.contributingMetrics.map((m) => (
              <div key={m.name}>
                <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
                  <span style={{ color: C.textSecondary, fontWeight: 600 }}>{m.name}</span>
                  <span style={{ color: C.textTertiary }}>{m.value}{m.weight > 0 ? ` · weight ${Math.round(m.weight * 100)}%` : ""}</span>
                </div>
                {m.evidence && <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{m.evidence}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
