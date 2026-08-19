// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/reports — Executive Reports: the CEO briefing. A pure
// composition layer over Analytics/Market Intelligence/Marketing Health —
// this page renders what the server already assembled and wrote. Reading
// experience over dashboard clutter: no charts, no gauges, clean prose
// sections in the order a real CMO briefing would follow. Reports are
// permanent — the history list is not a cache, it's the business's actual
// marketing record.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  FileText, Loader2, Sparkles, ShieldAlert, Target, TrendingUp, Megaphone,
  Wand2, Users2, DollarSign, ChevronRight,
} from "lucide-react";
import { C } from "@/lib/theme";
import {
  useReportHistory, useGenerateReport, isDailyNarrative, periodLabel,
  type ReportType, type ExecutiveReport, type FullNarrative,
} from "@/lib/executiveReports";

export const Route = createFileRoute("/_authenticated/marketing-hub/reports")({
  head: () => ({ meta: [{ title: "Executive Reports — Marketing Hub — MRKT" }] }),
  component: ExecutiveReportsSection,
});

const TYPE_LABELS: Record<ReportType, string> = {
  daily_brief: "Daily Brief",
  weekly_report: "Weekly Executive Report",
  monthly_review: "Monthly Business Review",
};

function ExecutiveReportsSection() {
  const [reportType, setReportType] = useState<ReportType>("weekly_report");
  const { loading, error: historyError, reports, reload } = useReportHistory(reportType);
  const { generate, generating, error: genError } = useGenerateReport();
  const [selected, setSelected] = useState<ExecutiveReport | null>(null);

  useEffect(() => { setSelected(reports[0] ?? null); }, [reports]);

  async function handleGenerate() {
    const r = await generate(reportType, false);
    if (r) { await reload(); setSelected(r); }
  }

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.7rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: 0 }}>
          Executive Reports
        </h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: C.textPrimary, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 10, padding: "8px 14px", cursor: generating ? "default" : "pointer", opacity: generating ? 0.6 : 1 }}
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Generate {TYPE_LABELS[reportType]}
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: C.textTertiary, margin: "0 0 20px" }}>
        The CEO briefing — assembled from Analytics, Market Intelligence, and Marketing Health. Permanently stored.
      </p>

      {/* ── Type selector ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1" style={{ marginBottom: 22, padding: 4, borderRadius: 12, background: C.surface, border: `1px solid ${C.borderSubtle}`, width: "fit-content" }}>
        {(Object.keys(TYPE_LABELS) as ReportType[]).map((t) => (
          <button
            key={t}
            onClick={() => setReportType(t)}
            style={{ padding: "7px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer",
              color: reportType === t ? C.textPrimary : C.textTertiary, background: reportType === t ? C.raised : "transparent" }}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {(historyError || genError) && (
        <div style={{ padding: "14px 16px", background: C.redMuted, border: `1px solid ${C.redBorder}`, borderRadius: 14, color: C.textSecondary, fontSize: 13, marginBottom: 20 }}>
          {historyError || genError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center" style={{ height: "30vh" }}>
          <Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} />
        </div>
      ) : reports.length === 0 ? (
        <div style={{ padding: "24px 22px", background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 16 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <FileText size={16} style={{ color: C.textTertiary }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textSecondary }}>No {TYPE_LABELS[reportType].toLowerCase()} yet</div>
          </div>
          <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.6 }}>
            Generate the first one — it becomes a permanent part of this business's marketing history.
          </div>
        </div>
      ) : (
        <div className="marketing-hub-grid" style={{ gridTemplateColumns: "260px 1fr", gap: 20 }}>
          {/* ── History list ──────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, marginBottom: 4 }}>History</div>
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${selected?.id === r.id ? C.aiBlueBorder : C.borderSubtle}`,
                  background: selected?.id === r.id ? C.accentMuted : C.surface, cursor: "pointer" }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.textPrimary }}>{periodLabel(r)}</div>
                <div style={{ fontSize: 11, color: C.textTertiary }}>Health {r.overall_health_score ?? "—"}/100</div>
              </button>
            ))}
          </div>

          {/* ── Report reading pane ───────────────────────────────────── */}
          <div>{selected && <ReportView report={selected} />}</div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
        {icon}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>{title}</div>
      </div>
      <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function ReportView({ report }: { report: ExecutiveReport }) {
  const n = report.narrative;

  if (isDailyNarrative(n)) {
    return (
      <div style={{ padding: "20px 22px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.textPrimary, marginBottom: 12 }}>{n.headline}</div>
        {n.changes_today.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {n.changes_today.map((c, i) => <div key={i} style={{ fontSize: 13, color: C.textSecondary, marginBottom: 4 }}>• {c}</div>)}
          </div>
        )}
        {n.priority_items.map((p, i) => (
          <div key={i} style={{ padding: "10px 12px", background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textPrimary }}>{p.title}</div>
            <div style={{ fontSize: 12, color: C.textTertiary }}>{p.why}</div>
          </div>
        ))}
      </div>
    );
  }

  const full = n as FullNarrative;
  return (
    <div>
      {/* Executive Summary */}
      <div style={{ padding: "20px 22px", background: C.surface, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary, marginBottom: 8 }}>Executive Summary</div>
        <div className="flex items-baseline gap-2" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: C.textPrimary }}>{report.overall_health_score ?? "—"}</span>
          <span style={{ fontSize: 13, color: C.textTertiary }}>/100 overall marketing health</span>
        </div>
        <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.7, marginBottom: 10 }}>{full.executive_summary.overall_health} {full.executive_summary.major_change}</div>
        <div className="marketing-hub-grid" style={{ gap: 10, marginBottom: 12 }}>
          <SummaryLine icon={<Sparkles size={12} style={{ color: C.aiBlue }} />} label="Top Win" text={full.executive_summary.top_win} />
          <SummaryLine icon={<ShieldAlert size={12} style={{ color: C.red }} />} label="Biggest Risk" text={full.executive_summary.biggest_risk} />
          <SummaryLine icon={<Target size={12} style={{ color: C.green }} />} label="Biggest Opportunity" text={full.executive_summary.biggest_opportunity} />
        </div>
        <div style={{ padding: "12px 14px", background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.aiBlue, marginBottom: 3 }}>Priority Recommendation</div>
          <div style={{ fontSize: 13, color: C.textPrimary }}>{full.executive_summary.priority_recommendation}</div>
        </div>
      </div>

      <Section icon={<Megaphone size={14} style={{ color: C.textTertiary }} />} title="Marketing Performance">
        <p><b>Campaigns:</b> {full.marketing_performance.campaigns}</p>
        <p><b>Growth:</b> {full.marketing_performance.growth}</p>
        <p><b>Content:</b> {full.marketing_performance.content}</p>
        <p><b>Revenue:</b> {full.marketing_performance.revenue}</p>
        <p><b>Conversions:</b> {full.marketing_performance.conversions}</p>
        <p><b>Retention:</b> {full.marketing_performance.retention}</p>
        <p><b>Brand:</b> {full.marketing_performance.brand}</p>
      </Section>

      <Section icon={<TrendingUp size={14} style={{ color: C.textTertiary }} />} title="Market Intelligence">
        <p><b>Competitor activity:</b> {full.market_intelligence.competitor_activity}</p>
        <p><b>Industry changes:</b> {full.market_intelligence.industry_changes}</p>
        <p><b>Consumer trends:</b> {full.market_intelligence.consumer_trends}</p>
        <p><b>Platform updates:</b> {full.market_intelligence.platform_updates}</p>
      </Section>

      <Section icon={<Megaphone size={14} style={{ color: C.textTertiary }} />} title="Campaign Review">
        <p><b>Launched:</b> {full.campaign_review.launched}</p>
        <p><b>Completed:</b> {full.campaign_review.completed}</p>
        <p><b>Performance:</b> {full.campaign_review.performance}</p>
        <p><b>Health:</b> {full.campaign_review.health}</p>
        <p><b>Lessons learned:</b> {full.campaign_review.lessons_learned}</p>
      </Section>

      <Section icon={<Wand2 size={14} style={{ color: C.textTertiary }} />} title="Content Review">
        <p><b>Production:</b> {full.content_review.production}</p>
        <p><b>Consistency:</b> {full.content_review.consistency}</p>
        <p><b>Creative performance:</b> {full.content_review.creative_performance}</p>
        <p><b>Content health:</b> {full.content_review.content_health}</p>
      </Section>

      <Section icon={<Users2 size={14} style={{ color: C.textTertiary }} />} title="Growth Review">
        <p><b>Acquisition:</b> {full.growth_review.acquisition}</p>
        <p><b>Creator network:</b> {full.growth_review.creator_network}</p>
        <p><b>Partnerships:</b> {full.growth_review.partnerships}</p>
        <p><b>Expansion:</b> {full.growth_review.expansion}</p>
      </Section>

      {full.risks.length > 0 && (
        <Section icon={<ShieldAlert size={14} style={{ color: C.textTertiary }} />} title="Risks">
          {full.risks.map((r, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: C.textPrimary }}>{r.title}</span> <span style={{ fontSize: 10.5, color: C.red }}>({r.severity})</span>
              <div style={{ fontSize: 12, color: C.textTertiary }}>{r.evidence}</div>
            </div>
          ))}
        </Section>
      )}

      {full.opportunities.length > 0 && (
        <Section icon={<Target size={14} style={{ color: C.textTertiary }} />} title="Opportunities">
          {full.opportunities.map((o, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: C.textPrimary }}>{o.title}</span> <span style={{ fontSize: 10.5, color: C.green }}>({o.expected_impact} impact)</span>
              <div style={{ fontSize: 12, color: C.textTertiary }}>{o.evidence}</div>
            </div>
          ))}
        </Section>
      )}

      <div style={{ padding: "18px 20px", background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 16 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <DollarSign size={14} style={{ color: C.aiBlue }} />
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.aiBlue }}>AI CMO Recommendation</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>{full.ai_cmo_recommendation.recommendation}</div>
        <div style={{ fontSize: 12.5, color: C.textSecondary, lineHeight: 1.6 }}>{full.ai_cmo_recommendation.why}</div>
      </div>
    </div>
  );
}

function SummaryLine({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textTertiary }}>{label}</span>
      </div>
      <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>{text}</div>
    </div>
  );
}
