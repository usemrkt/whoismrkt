// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub/campaigns — Campaign Center, the execution layer beneath the
// AI Marketing Team. Orchestrates the EXISTING campaign system rather than
// duplicating it: real campaign data (already aggregated by
// marketing-hub-briefing, zero extra AI cost), cards link out to the real
// campaign detail page (campaigns.$campaignId.index.tsx), and AI campaign
// ideas hand off to the real creation wizard (campaign-create.tsx) via a
// prefill draft — same localStorage-handoff pattern already used for Chat.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Megaphone, ChevronRight, Sparkles, CalendarClock,
  Circle, CircleDot, CirclePause, CircleCheck,
} from "lucide-react";
import { C } from "@/lib/theme";
import { useMarketingHub, priorityColors, type CampaignSummary } from "@/lib/marketingHub";

export const Route = createFileRoute("/_authenticated/marketing-hub/campaigns")({
  head: () => ({ meta: [{ title: "Campaign Center — Marketing Hub — MRKT" }] }),
  component: CampaignCenterSection,
});

const STATUS_GROUPS = [
  { key: "active",  label: "Active",    icon: CircleDot,   color: "green" as const },
  { key: "draft",   label: "Draft",     icon: Circle,      color: "neutral" as const },
  { key: "paused",  label: "Paused",    icon: CirclePause, color: "amber" as const },
  { key: "closed",  label: "Completed", icon: CircleCheck, color: "neutral" as const },
  { key: "completed", label: "Completed", icon: CircleCheck, color: "neutral" as const },
];

function statusColor(color: "green" | "amber" | "neutral") {
  if (color === "green") return { fg: C.green, bg: C.greenMuted, bdr: C.greenBorder };
  if (color === "amber") return { fg: C.amber, bg: C.amberMuted, bdr: C.amberBorder };
  return { fg: C.textTertiary, bg: "oklch(1 0 0 / 5%)", bdr: C.borderSubtle };
}

function money(c: CampaignSummary): string {
  if (c.compensation_type === "unpaid") return "Unpaid";
  if (c.compensation_type === "gifted") return "Gifted";
  if (c.amount_fixed) return `$${c.amount_fixed.toLocaleString()}`;
  if (c.budget_min && c.budget_max) return `$${c.budget_min.toLocaleString()}–$${c.budget_max.toLocaleString()}`;
  if (c.budget_min) return `From $${c.budget_min.toLocaleString()}`;
  return "Budget not set";
}

function CampaignCard({ c }: { c: CampaignSummary }) {
  const group = STATUS_GROUPS.find((g) => g.key === c.status);
  const { fg, bg, bdr } = statusColor(group?.color ?? "neutral");
  const totalApps = c.applications.pending + c.applications.reviewing + c.applications.shortlisted + c.applications.accepted + c.applications.rejected;
  const needsAttention = c.applications.pending > 0 || c.contract_status === "awaiting_signature";

  return (
    <Link to={`/campaigns/${c.id}` as "/"} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ padding: "15px 17px", background: C.surface, border: `1px solid ${needsAttention ? C.aiBlueBorder : C.borderSubtle}`, borderRadius: 14, transition: "border-color 120ms ease" }}>
        <div className="flex items-start justify-between gap-2" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.01em" }}>{c.title}</div>
          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
            {group?.label ?? c.status}
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.textQuaternary, marginBottom: 10 }}>
          {money(c)}{c.deadline && ` · Deadline ${new Date(c.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}{totalApps > 0 && ` · ${totalApps} applicant${totalApps === 1 ? "" : "s"}`}
        </div>
        <div className="flex items-center gap-2" style={{ fontSize: 12, color: needsAttention ? C.aiBlue : C.textTertiary, fontWeight: needsAttention ? 600 : 400 }}>
          {needsAttention && <Sparkles size={11} />}
          {c.next_action}
          <ChevronRight size={12} style={{ marginLeft: "auto", color: C.textQuaternary }} />
        </div>
      </div>
    </Link>
  );
}

function CampaignCenterSection() {
  const navigate = useNavigate();
  const { campaigns, recommendations } = useMarketingHub();
  const [filter, setFilter] = useState<string | null>(null);

  const campaignIdeas = recommendations.filter((r) => r.recommendation_type === "campaign");

  const active    = campaigns.filter((c) => c.status === "active");
  const draft     = campaigns.filter((c) => c.status === "draft");
  const paused    = campaigns.filter((c) => c.status === "paused");
  const completed = campaigns.filter((c) => c.status === "closed" || c.status === "completed");

  const upcoming = campaigns
    .filter((c) => c.deadline && c.status === "active")
    .map((c) => ({ c, daysLeft: Math.ceil((new Date(c.deadline!).getTime() - Date.now()) / 86400000) }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  function launchCampaign(title: string, why: string, action: string) {
    localStorage.setItem("mrkt_campaign_draft", JSON.stringify({
      title,
      description: `${why} ${action}`.trim(),
      campaign_goal: why,
    }));
    navigate({ to: "/campaign-create" });
  }

  const groups: Array<{ key: string; label: string; items: CampaignSummary[] }> = [
    { key: "active", label: "Active", items: active },
    { key: "draft", label: "Draft", items: draft },
    { key: "paused", label: "Paused", items: paused },
    { key: "completed", label: "Completed", items: completed },
  ];
  const visibleGroups = filter ? groups.filter((g) => g.key === filter) : groups;

  return (
    <div>
      <h2 style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.7rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: "0 0 4px" }}>
        Campaign Center
      </h2>
      <p style={{ fontSize: 13.5, color: C.textTertiary, margin: "0 0 18px" }}>
        What your marketing team is executing right now.
      </p>

      {/* ── Status filter chips ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2" style={{ marginBottom: 18, flexWrap: "wrap" }}>
        <button
          onClick={() => setFilter(null)}
          style={{ fontSize: 12, fontWeight: 600, color: !filter ? C.textPrimary : C.textTertiary, background: !filter ? C.raised : "transparent", border: `1px solid ${!filter ? C.borderNormal : C.borderSubtle}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}
        >
          All ({campaigns.length})
        </button>
        {groups.map((g) => (
          <button
            key={g.key}
            onClick={() => setFilter(filter === g.key ? null : g.key)}
            style={{ fontSize: 12, fontWeight: 600, color: filter === g.key ? C.textPrimary : C.textTertiary, background: filter === g.key ? C.raised : "transparent", border: `1px solid ${filter === g.key ? C.borderNormal : C.borderSubtle}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}
          >
            {g.label} ({g.items.length})
          </button>
        ))}
      </div>

      <div className="marketing-hub-grid">
        {/* ── Left: campaign cards by status ─────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {campaigns.length === 0 && (
            <div style={{ padding: "18px 20px", background: C.surface, border: `1px dashed ${C.borderNormal}`, borderRadius: 14 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                <Megaphone size={15} style={{ color: C.textTertiary }} />
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textSecondary }}>No campaigns yet</div>
              </div>
              <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.5, marginBottom: 10 }}>
                Publish your first campaign, or launch one of your AI Team's recommendations on the right.
              </div>
              <Link to="/campaign-create" style={{ fontSize: 12.5, fontWeight: 600, color: C.aiBlue, textDecoration: "none" }}>Create a campaign →</Link>
            </div>
          )}
          {visibleGroups.map((g) => g.items.length > 0 && (
            <div key={g.key}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary, marginBottom: 10 }}>
                {g.label} ({g.items.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.items.map((c) => <CampaignCard key={c.id} c={c} />)}
              </div>
            </div>
          ))}
        </div>

        {/* ── Right: AI campaign ideas + upcoming deadlines ──────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <Sparkles size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Recommended by your AI Team</div>
            </div>
            {campaignIdeas.length === 0 ? (
              <div style={{ padding: "13px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, fontSize: 12.5, color: C.textTertiary }}>
                No campaign ideas right now — check back after your next briefing refresh.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {campaignIdeas.map((rec) => {
                  const { fg, bg, bdr } = priorityColors(rec.priority);
                  return (
                    <div key={rec.id} style={{ padding: "13px 15px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14 }}>
                      <div className="flex items-start gap-2" style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, flex: 1 }}>{rec.title}</div>
                        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: fg, background: bg, border: `1px solid ${bdr}`, borderRadius: 6, padding: "2px 6px" }}>{rec.priority}</span>
                      </div>
                      {rec.explanation && <div style={{ fontSize: 12, color: C.textTertiary, lineHeight: 1.5, marginBottom: 10 }}>{rec.explanation}</div>}
                      <button
                        onClick={() => launchCampaign(rec.title, rec.explanation ?? "", rec.action ?? "")}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#000", background: C.chrome, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
                      >
                        <Megaphone size={12} /> Launch This Campaign
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <CalendarClock size={14} style={{ color: C.textTertiary }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textTertiary }}>Upcoming Deadlines</div>
            </div>
            {upcoming.length === 0 ? (
              <div style={{ padding: "13px 16px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 14, fontSize: 12.5, color: C.textTertiary }}>
                Nothing due in the next 7 days.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {upcoming.map(({ c, daysLeft }) => (
                  <Link key={c.id} to={`/campaigns/${c.id}` as "/"} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 12, color: C.textSecondary, fontSize: 12.5, textDecoration: "none" }}>
                    <span>{c.title}</span>
                    <span style={{ color: daysLeft <= 2 ? C.red : C.textQuaternary, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{daysLeft === 0 ? "Today" : `${daysLeft}d`}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
