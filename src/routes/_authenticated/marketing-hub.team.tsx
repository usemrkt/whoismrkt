// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/team — the AI Marketing Team org chart. The centerpiece:
// You → AI CMO → five real departments (each backed by real data already
// aggregated in the shared briefing, zero extra AI calls) → two honestly
// "not connected yet" slots (Paid Ads, SEO) that need integrations this repo
// doesn't have yet, rather than a fabricated score.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Crown, Sparkles, Compass, FileText, Palette, TrendingUp, BarChart3,
  Megaphone, Search, ChevronDown, ChevronRight, Lock,
} from "lucide-react";
import { C } from "@/lib/theme";
import { useMarketingHub, priorityColors, type Department } from "@/lib/marketingHub";

export const Route = createFileRoute("/_authenticated/marketing-hub/team")({
  head: () => ({ meta: [{ title: "AI Marketing Team — MRKT" }] }),
  component: TeamSection,
});

type DeptDef = {
  key: Department;
  label: string;
  role: string;
  icon: React.ElementType;
  link?: { to: string; label: string };
};

const DEPARTMENTS: DeptDef[] = [
  { key: "strategy",  label: "Strategy",  role: "AI Marketing Strategist", icon: Compass,     link: undefined },
  { key: "content",   label: "Content",   role: "AI Content Manager",      icon: FileText,    link: { to: "/content-planner", label: "Open Content Planner" } },
  { key: "brand",     label: "Brand",     role: "AI Brand Manager",        icon: Palette,     link: { to: "/brand-knowledge", label: "Open Brand Knowledge" } },
  { key: "growth",    label: "Growth",    role: "AI Growth Lead",          icon: TrendingUp,  link: { to: "/marketing-hub/growth", label: "Open Growth" } },
  { key: "analytics", label: "Analytics", role: "AI Analytics Lead",       icon: BarChart3,   link: undefined },
];

const NOT_CONNECTED: Array<{ key: string; label: string; role: string; icon: React.ElementType; needs: string }> = [
  { key: "paid_ads", label: "Paid Ads", role: "AI Media Buyer", icon: Megaphone, needs: "Connect a Meta or Google Ads account to activate paid media planning and spend recommendations." },
  { key: "seo",      label: "SEO",      role: "AI SEO Specialist", icon: Search, needs: "Connect your website to activate technical SEO audits and keyword opportunities." },
];

function OrgCard({ icon: Icon, label, role, active, accent, locked, onClick }: {
  icon: React.ElementType; label: string; role: string; active?: boolean; accent?: boolean; locked?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: "16px 10px", borderRadius: 14, cursor: onClick ? "pointer" : "default",
        background: active ? C.raised : C.surface,
        border: `1px solid ${active ? C.aiBlueBorder : C.borderSubtle}`,
        opacity: locked ? 0.62 : 1,
        transition: "all 120ms ease",
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
        background: accent ? C.accentMuted : locked ? "oklch(1 0 0 / 5%)" : C.raised,
        border: `1px solid ${accent ? C.aiBlueBorder : C.borderSubtle}`,
      }}>
        {locked ? <Lock size={15} style={{ color: C.textQuaternary }} /> : <Icon size={17} style={{ color: accent ? C.aiBlue : C.textSecondary }} />}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textPrimary, textAlign: "center" }}>{label}</div>
      <div style={{ fontSize: 10.5, color: C.textQuaternary, textAlign: "center", lineHeight: 1.3 }}>{role}</div>
    </button>
  );
}

function Stem() {
  return <div style={{ width: 1, height: 18, background: C.borderNormal, margin: "0 auto" }} />;
}

function TeamSection() {
  const navigate = useNavigate();
  const { briefing, recommendations } = useMarketingHub();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!briefing) return null;

  const dept = DEPARTMENTS.find((d) => d.key === expanded);
  const notConnected = NOT_CONNECTED.find((d) => d.key === expanded);
  const deptItems = dept ? recommendations.filter((r) => r.meta?.department === dept.key) : [];

  function askAI(prompt: string) {
    localStorage.setItem("mrkt_prefill_prompt", prompt);
    navigate({ to: "/chat" });
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        {/* You */}
        <div className="flex justify-center">
          <OrgCard icon={Crown} label="You" role="Founder / CEO" />
        </div>
        <Stem />
        {/* AI CMO */}
        <div className="flex justify-center">
          <OrgCard icon={Sparkles} label="AI CMO" role="Chief Marketing Officer" accent />
        </div>
        <Stem />

        {/* Department row */}
        <div className="marketing-hub-orgchart-row">
          {DEPARTMENTS.map((d) => (
            <div key={d.key}>
              <div style={{ height: 12, borderTop: `1px solid ${C.borderNormal}`, marginBottom: 0 }} />
              <div style={{ paddingTop: 0 }}>
                <OrgCard
                  icon={d.icon} label={d.label} role={d.role}
                  active={expanded === d.key}
                  onClick={() => setExpanded(expanded === d.key ? null : d.key)}
                />
              </div>
            </div>
          ))}
          {NOT_CONNECTED.map((d) => (
            <div key={d.key}>
              <div style={{ height: 12, borderTop: `1px dashed ${C.borderSubtle}`, marginBottom: 0 }} />
              <OrgCard
                icon={d.icon} label={d.label} role={d.role} locked
                active={expanded === d.key}
                onClick={() => setExpanded(expanded === d.key ? null : d.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Expanded department panel ─────────────────────────────────── */}
      {dept && (
        <div style={{ background: C.surface, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 16, padding: "20px 22px", marginBottom: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-2">
              <dept.icon size={16} style={{ color: C.aiBlue }} />
              <div style={{ fontSize: 14.5, fontWeight: 700, color: C.textPrimary }}>AI {dept.label} {dept.label === "Analytics" ? "Lead" : "Manager"}</div>
            </div>
            <button onClick={() => setExpanded(null)} style={{ color: C.textQuaternary, background: "none", border: "none", cursor: "pointer" }}><ChevronDown size={16} /></button>
          </div>
          <p style={{ fontSize: 13.5, color: C.textSecondary, lineHeight: 1.65, margin: "0 0 16px" }}>
            {briefing.departments[dept.key] ?? "No report yet — refresh your briefing to generate one."}
          </p>
          {deptItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {deptItems.map((it) => {
                const { fg, bg, bdr } = priorityColors(it.priority);
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", background: C.raised, border: `1px solid ${C.borderSubtle}`, borderRadius: 10, gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: C.textSecondary }}>{it.title}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "2px 6px", flexShrink: 0 }}>{it.priority}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
            {dept.link && (
              <Link to={dept.link.to as "/"} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>
                {dept.link.label} <ChevronRight size={13} />
              </Link>
            )}
            <button
              onClick={() => askAI(`Talk to me as my ${dept.role}. Here's the current report: "${briefing.departments[dept.key] ?? ""}" Give me more detail and next steps.`)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.textMuted, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}
            >
              <Sparkles size={12} /> Talk to {dept.label}
            </button>
          </div>
        </div>
      )}

      {notConnected && (
        <div style={{ background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 16, padding: "20px 22px", marginBottom: 20 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <Lock size={15} style={{ color: C.textQuaternary }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textSecondary }}>{notConnected.label} — Not connected yet</div>
          </div>
          <p style={{ fontSize: 13, color: C.textTertiary, lineHeight: 1.6, margin: 0 }}>{notConnected.needs}</p>
        </div>
      )}

      {!dept && !notConnected && (
        <div style={{ textAlign: "center", padding: "8px 0 4px", fontSize: 12.5, color: C.textQuaternary }}>
          Click a department to open their report.
        </div>
      )}
    </div>
  );
}
