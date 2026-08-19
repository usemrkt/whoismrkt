// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/intelligence — Market Intelligence: MRKT's external
// intelligence layer. Real, cited, deduplicated market/competitor signals,
// deterministically scored, reasoned over only after being stored — never
// "search → LLM reads results → LLM writes advice."
//
// Independent data source from the rest of the Hub (see src/lib/marketIntelligence.ts
// for why) — this section does its own fetch via market-intelligence-brief,
// which is a pure cached read; the "Refresh" button is the only action that
// can trigger real search spend, and even then only for families actually
// due (server-gated, never forced by a page load).
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  Radar, RefreshCw, Loader2, Sparkles, Megaphone, Wand2, ListPlus,
  ShieldAlert, TrendingUp, Target, Building2, ExternalLink,
} from "lucide-react";
import { C } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import {
  useMarketIntelligence, askAICMO, createCampaignFromFinding, createContentFromFinding, addFindingToGrowth,
  freshnessLabel, type Finding, type FreshnessState,
} from "@/lib/marketIntelligence";

export const Route = createFileRoute("/_authenticated/marketing-hub/intelligence")({
  head: () => ({ meta: [{ title: "Market Intelligence — Marketing Hub — MRKT" }] }),
  component: MarketIntelligenceSection,
});

function freshnessColors(f: FreshnessState) {
  if (f === "fresh")  return { fg: C.green, bg: C.greenMuted, bdr: C.greenBorder };
  if (f === "aging")  return { fg: C.amber, bg: C.amberMuted, bdr: C.amberBorder };
  return { fg: C.textTertiary, bg: C.surface, bdr: C.borderSubtle }; // stale / historical
}

function FreshnessBadge({ f }: { f: FreshnessState }) {
  const { fg, bg, bdr } = freshnessColors(f);
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "2px 7px" }}>
      {freshnessLabel(f)}
    </span>
  );
}

function MarketIntelligenceSection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { loading, refreshing, error, data, refresh } = useMarketIntelligence();

  const hasAnything = data.opportunities.length + data.threats.length + data.trends.length + data.competitorMoves.length + data.feedFindings.length > 0;
  const confirmedCompetitors = useMemo(() => data.competitors.filter((c) => c.status === "confirmed"), [data.competitors]);
  const potentialCompetitors = useMemo(() => data.competitors.filter((c) => c.status === "potential"), [data.competitors]);

  function actions(finding: Finding) {
    return (
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginTop: 8 }}>
        <button onClick={() => askAICMO(finding, navigate)} style={pillBtnStyle}>
          <Sparkles size={11} /> Ask AI CMO
        </button>
        <button onClick={() => createCampaignFromFinding(finding, navigate)} style={pillBtnStyle}>
          <Megaphone size={11} /> Create Campaign
        </button>
        <button onClick={() => createContentFromFinding(finding, navigate)} style={pillBtnStyle}>
          <Wand2 size={11} /> Create Content
        </button>
        {user && (
          <button onClick={() => addFindingToGrowth(finding, user.id)} style={pillBtnStyle}>
            <ListPlus size={11} /> Add to Growth
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: "40vh" }}>
        <Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.7rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: 0 }}>
          Market Intelligence
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
        Real, cited market and competitor signals — never fabricated. Refresh only searches what's actually due.
      </p>

      {error && (
        <div style={{ padding: "14px 16px", background: C.redMuted, border: `1px solid ${C.redBorder}`, borderRadius: 14, color: C.textSecondary, fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {!hasAnything && !error && (
        <div style={{ padding: "24px 22px", background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 16, marginBottom: 24 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <Radar size={16} style={{ color: C.textTertiary }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textSecondary }}>Not enough verified market data yet</div>
          </div>
          <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.6, marginBottom: 10 }}>
            MRKT hasn't gathered market intelligence for your business yet. Hit Refresh to run your first search cycle,
            or name your competitors in Brand Knowledge first for sharper, more targeted results.
          </div>
          <Link to="/brand-knowledge" style={{ fontSize: 12.5, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>Set up Brand Knowledge →</Link>
        </div>
      )}

      {/* ── Executive Brief ─────────────────────────────────────────────── */}
      {data.brief.top_items.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <Target size={14} style={{ color: C.textTertiary }} />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Executive Brief</div>
          </div>
          {data.brief.headline && (
            <div style={{ fontSize: 13.5, color: C.textSecondary, marginBottom: 12, lineHeight: 1.5 }}>{data.brief.headline}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.brief.top_items.map((item) => (
              <div key={item.finding_id} style={{ padding: "16px 18px", background: C.surface, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 14 }}>
                <div className="flex items-start gap-2" style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.textPrimary, flex: 1 }}>{item.title}</div>
                  <FreshnessBadge f={item.freshness} />
                </div>
                <div style={{ fontSize: 12.5, color: C.textSecondary, lineHeight: 1.55, marginBottom: 8 }}>{item.why_it_matters}</div>
                <div style={{ fontSize: 11.5, color: C.textTertiary, lineHeight: 1.5, marginBottom: 8, fontStyle: "italic" }}>
                  "{item.evidence}" — <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: C.aiBlue, textDecoration: "none" }}>{item.source_domain} <ExternalLink size={9} style={{ display: "inline" }} /></a>
                </div>
                {item.recommended_action && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.aiBlue, marginBottom: 4 }}>→ {item.recommended_action}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="marketing-hub-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* ── Competitors ──────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <Building2 size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Competitors</div>
            </div>
            {data.competitors.length === 0 ? (
              <div style={{ padding: "16px 18px", background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 14 }}>
                <div style={{ fontSize: 12.5, color: C.textSecondary, fontWeight: 700, marginBottom: 4 }}>MRKT doesn't know your competitors yet</div>
                <div style={{ fontSize: 12, color: C.textTertiary, lineHeight: 1.5, marginBottom: 8 }}>
                  Name them in Brand Knowledge and Market Intelligence will start tracking their activity.
                </div>
                <Link to="/brand-knowledge" style={{ fontSize: 12, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>Add competitors →</Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {confirmedCompetitors.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {confirmedCompetitors.map((c) => (
                      <div key={c.id} style={{ padding: "10px 14px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: C.textTertiary }}>
                          {data.competitorMoves.filter((f) => f.competitor_id === c.id).length} recent finding{data.competitorMoves.filter((f) => f.competitor_id === c.id).length === 1 ? "" : "s"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {potentialCompetitors.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: C.textMuted, marginBottom: 6 }}>
                      Potential — MRKT found signals suggesting these may be competitors
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {potentialCompetitors.map((c) => (
                        <div key={c.id} style={{ padding: "10px 14px", background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.textSecondary }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: C.textTertiary }}>Confidence: {c.confidence !== null ? Math.round(c.confidence * 100) : "—"}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Opportunities ────────────────────────────────────────────── */}
          <FindingGroup icon={<TrendingUp size={14} style={{ color: C.textTertiary }} />} label={`Opportunities (${data.opportunities.length})`} findings={data.opportunities} actions={actions} empty="No evidence-backed opportunities right now." />

          {/* ── Threats ──────────────────────────────────────────────────── */}
          <FindingGroup icon={<ShieldAlert size={14} style={{ color: C.textTertiary }} />} label={`Threats (${data.threats.length})`} findings={data.threats} actions={actions} empty="No threats detected right now." />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* ── Trends ───────────────────────────────────────────────────── */}
          <FindingGroup icon={<Sparkles size={14} style={{ color: C.textTertiary }} />} label={`Trends (${data.trends.length})`} findings={data.trends} actions={actions} empty="No relevant trends detected right now." />

          {/* ── Intelligence Feed ────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <Radar size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Intelligence Feed</div>
            </div>
            {data.feedFindings.length === 0 ? (
              <div style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12, fontSize: 12.5, color: C.textTertiary }}>
                Nothing gathered yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.feedFindings.map((f) => (
                  <a key={f.id} href={f.source_url} target="_blank" rel="noreferrer" style={{ display: "block", padding: "10px 12px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 10, textDecoration: "none" }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.textMuted }}>{f.category.replace(/_/g, " ")}</span>
                      <FreshnessBadge f={f.freshness} />
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.textSecondary }}>{f.title}</div>
                    <div style={{ fontSize: 10.5, color: C.textMuted }}>{f.source_domain}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const pillBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
  color: C.textMuted, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`,
  borderRadius: 8, padding: "3px 9px", cursor: "pointer",
};

function FindingGroup({ icon, label, findings, actions, empty }: {
  icon: ReactNode; label: string; findings: Finding[]; actions: (f: Finding) => ReactNode; empty: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
        {icon}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>{label}</div>
      </div>
      {findings.length === 0 ? (
        <div style={{ padding: "16px 18px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, fontSize: 13, color: C.textTertiary }}>
          {empty}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {findings.map((f) => (
            <div key={f.id} style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14 }}>
              <div className="flex items-start gap-2" style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, flex: 1 }}>{f.title}</div>
                <FreshnessBadge f={f.freshness} />
              </div>
              <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.55, marginBottom: 6 }}>{f.summary}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>
                <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: C.textMuted, textDecoration: "none" }}>{f.source_domain}</a>
                {" · "}confidence {Math.round(f.confidence * 100)}%
              </div>
              {actions(f)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
