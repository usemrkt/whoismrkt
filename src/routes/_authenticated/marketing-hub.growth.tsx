// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/growth — opportunity-type recommendations + competitive
// positioning, promoted out of the Dashboard into their own dedicated section
// with room to breathe. Same shared data as every other section — no new
// fetch of the briefing itself.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Sparkles, ShieldAlert, TrendingUp, Users2 } from "lucide-react";
import { C } from "@/lib/theme";
import { useMarketingHub, priorityColors } from "@/lib/marketingHub";

export const Route = createFileRoute("/_authenticated/marketing-hub/growth")({
  head: () => ({ meta: [{ title: "Growth — Marketing Hub — MRKT" }] }),
  component: GrowthSection,
});

function GrowthSection() {
  const navigate = useNavigate();
  const { briefing, recommendations } = useMarketingHub();

  if (!briefing) return null;

  const opportunities = recommendations.filter((r) => r.recommendation_type === "opportunity");
  const campaignIdeas = recommendations.filter((r) => r.recommendation_type === "campaign");

  function askAI(title: string, why: string) {
    localStorage.setItem("mrkt_prefill_prompt", `From my Growth team: "${title}". ${why} Help me act on this now.`);
    navigate({ to: "/chat" });
  }

  return (
    <div>
      <h2 style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.7rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: "0 0 4px" }}>
        Growth Opportunities
      </h2>
      <p style={{ fontSize: 13.5, color: C.textTertiary, margin: "0 0 22px" }}>
        Every opportunity your marketing team has found, ranked by priority.
      </p>

      <div className="marketing-hub-grid">
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <TrendingUp size={14} style={{ color: C.textTertiary }} />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Opportunities ({opportunities.length})</div>
          </div>
          {opportunities.length === 0 && (
            <div style={{ padding: "16px 18px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, fontSize: 13, color: C.textTertiary }}>
              No open opportunities right now — check back after your next refresh.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opportunities.map((rec) => {
              const { fg, bg, bdr } = priorityColors(rec.priority);
              const link = rec.meta?.link;
              return (
                <div key={rec.id} style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14 }}>
                  <div className="flex items-start gap-2" style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, flex: 1 }}>{rec.title}</div>
                    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "2px 7px" }}>{rec.priority}</span>
                  </div>
                  {rec.explanation && <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.55, marginBottom: 10 }}>{rec.explanation}</div>}
                  <div className="flex items-center gap-3">
                    {link && <Link to={link as "/"} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>{rec.action || "Open"} <ChevronRight size={12} /></Link>}
                    <button onClick={() => askAI(rec.title, rec.explanation ?? "")} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.textMuted, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 8, padding: "3px 9px", cursor: "pointer" }}>
                      <Sparkles size={11} /> Ask AI Strategist
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {campaignIdeas.length > 0 && (
            <div>
              <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
                <Sparkles size={14} style={{ color: C.textTertiary }} />
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Campaign Ideas</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {campaignIdeas.map((rec) => (
                  <div key={rec.id} style={{ padding: "12px 14px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>{rec.title}</div>
                    {rec.explanation && <div style={{ fontSize: 12, color: C.textTertiary, lineHeight: 1.5 }}>{rec.explanation}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <Users2 size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Competitive Positioning</div>
            </div>
            {briefing.competitor_notes ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {briefing.competitor_notes.map((it, i) => (
                  <div key={i} style={{ padding: "12px 14px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 3 }}>{it.title}</div>
                    <div style={{ fontSize: 12, color: C.textTertiary, lineHeight: 1.5 }}>{it.why}</div>
                  </div>
                ))}
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
        </div>
      </div>
    </div>
  );
}
