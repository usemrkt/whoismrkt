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
  Crown,
  Sparkles,
  Compass,
  FileText,
  Palette,
  TrendingUp,
  BarChart3,
  Megaphone,
  Search,
  ChevronDown,
  ChevronRight,
  Lock,
  Rocket,
  Loader2,
} from "lucide-react";
import { C } from "@/lib/theme";
import {
  useMarketingHub,
  priorityColors,
  BriefingUnavailable,
  type Department,
} from "@/lib/marketingHub";
import { MarketingHubErrorFallback } from "@/components/MarketingHubErrorBoundary";
import {
  useMissionsQuery,
  useMissionDetailQuery,
  useCreateMissionMutation,
  useDecideApprovalMutation,
  useCancelMissionMutation,
  useAgentsQuery,
  missionProgress,
  TASK_STATUS_LABEL,
  MISSION_STATUS_LABEL,
  type Mission,
  type TaskStatus,
} from "@/lib/missions";

export const Route = createFileRoute("/_authenticated/marketing-hub/team")({
  errorComponent: ({ error, reset }) => <MarketingHubErrorFallback error={error} reset={reset} />,
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
  {
    key: "strategy",
    label: "Strategy",
    role: "AI Marketing Strategist",
    icon: Compass,
    link: undefined,
  },
  {
    key: "content",
    label: "Content",
    role: "AI Content Manager",
    icon: FileText,
    link: { to: "/content-planner", label: "Open Content Planner" },
  },
  {
    key: "brand",
    label: "Brand",
    role: "AI Brand Manager",
    icon: Palette,
    link: { to: "/brand-knowledge", label: "Open Brand Knowledge" },
  },
  {
    key: "growth",
    label: "Growth",
    role: "AI Growth Lead",
    icon: TrendingUp,
    link: { to: "/marketing-hub/growth", label: "Open Growth" },
  },
  {
    key: "analytics",
    label: "Analytics",
    role: "AI Analytics Lead",
    icon: BarChart3,
    link: undefined,
  },
];

const NOT_CONNECTED: Array<{
  key: string;
  label: string;
  role: string;
  icon: React.ElementType;
  needs: string;
}> = [
  {
    key: "paid_ads",
    label: "Paid Ads",
    role: "AI Media Buyer",
    icon: Megaphone,
    needs:
      "Connect a Meta or Google Ads account to activate paid media planning and spend recommendations.",
  },
  {
    key: "seo",
    label: "SEO",
    role: "AI SEO Specialist",
    icon: Search,
    needs: "Connect your website to activate technical SEO audits and keyword opportunities.",
  },
];

function OrgCard({
  icon: Icon,
  label,
  role,
  active,
  accent,
  locked,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  role: string;
  active?: boolean;
  accent?: boolean;
  locked?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "16px 10px",
        borderRadius: 14,
        cursor: onClick ? "pointer" : "default",
        background: active ? C.raised : C.surface,
        border: `1px solid ${active ? C.aiBlueBorder : C.borderSubtle}`,
        opacity: locked ? 0.62 : 1,
        transition: "all 120ms ease",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: accent ? C.accentMuted : locked ? "oklch(1 0 0 / 5%)" : C.raised,
          border: `1px solid ${accent ? C.aiBlueBorder : C.borderSubtle}`,
        }}
      >
        {locked ? (
          <Lock size={15} style={{ color: C.textQuaternary }} />
        ) : (
          <Icon size={17} style={{ color: accent ? C.aiBlue : C.textSecondary }} />
        )}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.textPrimary, textAlign: "center" }}>
        {label}
      </div>
      <div
        style={{ fontSize: 10.5, color: C.textQuaternary, textAlign: "center", lineHeight: 1.3 }}
      >
        {role}
      </div>
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

  if (!briefing) return <BriefingUnavailable label="Marketing Team" />;

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
              <div
                style={{ height: 12, borderTop: `1px solid ${C.borderNormal}`, marginBottom: 0 }}
              />
              <div style={{ paddingTop: 0 }}>
                <OrgCard
                  icon={d.icon}
                  label={d.label}
                  role={d.role}
                  active={expanded === d.key}
                  onClick={() => setExpanded(expanded === d.key ? null : d.key)}
                />
              </div>
            </div>
          ))}
          {NOT_CONNECTED.map((d) => (
            <div key={d.key}>
              <div
                style={{ height: 12, borderTop: `1px dashed ${C.borderSubtle}`, marginBottom: 0 }}
              />
              <OrgCard
                icon={d.icon}
                label={d.label}
                role={d.role}
                locked
                active={expanded === d.key}
                onClick={() => setExpanded(expanded === d.key ? null : d.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Expanded department panel ─────────────────────────────────── */}
      {dept && (
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.aiBlueBorder}`,
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 20,
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-2">
              <dept.icon size={16} style={{ color: C.aiBlue }} />
              <div style={{ fontSize: 14.5, fontWeight: 700, color: C.textPrimary }}>
                AI {dept.label} {dept.label === "Analytics" ? "Lead" : "Manager"}
              </div>
            </div>
            <button
              onClick={() => setExpanded(null)}
              style={{
                color: C.textQuaternary,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <p
            style={{ fontSize: 13.5, color: C.textSecondary, lineHeight: 1.65, margin: "0 0 16px" }}
          >
            {briefing.departments[dept.key] ??
              "No report yet — refresh your briefing to generate one."}
          </p>
          {deptItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {deptItems.map((it) => {
                const { fg, bg, bdr } = priorityColors(it.priority);
                return (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 13px",
                      background: C.raised,
                      border: `1px solid ${C.borderSubtle}`,
                      borderRadius: 10,
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: C.textSecondary }}>{it.title}</span>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: fg,
                        background: bg,
                        border: `1px solid ${bdr}`,
                        borderRadius: 6,
                        padding: "2px 6px",
                        flexShrink: 0,
                      }}
                    >
                      {it.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
            {dept.link && (
              <Link
                to={dept.link.to as "/"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: C.aiBlue,
                  textDecoration: "none",
                }}
              >
                {dept.link.label} <ChevronRight size={13} />
              </Link>
            )}
            <button
              onClick={() =>
                askAI(
                  `Talk to me as my ${dept.role}. Here's the current report: "${briefing.departments[dept.key] ?? ""}" Give me more detail and next steps.`,
                )
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: C.textMuted,
                background: C.accentMuted,
                border: `1px solid ${C.aiBlueBorder}`,
                borderRadius: 8,
                padding: "5px 11px",
                cursor: "pointer",
              }}
            >
              <Sparkles size={12} /> Talk to {dept.label}
            </button>
          </div>
        </div>
      )}

      {notConnected && (
        <div
          style={{
            background: C.surface,
            border: `1px dashed ${C.borderNormal}`,
            borderRadius: 16,
            padding: "20px 22px",
            marginBottom: 20,
          }}
        >
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <Lock size={15} style={{ color: C.textQuaternary }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textSecondary }}>
              {notConnected.label} — Not connected yet
            </div>
          </div>
          <p style={{ fontSize: 13, color: C.textTertiary, lineHeight: 1.6, margin: 0 }}>
            {notConnected.needs}
          </p>
        </div>
      )}

      {!dept && !notConnected && (
        <div
          style={{
            textAlign: "center",
            padding: "8px 0 4px",
            fontSize: 12.5,
            color: C.textQuaternary,
          }}
        >
          Click a department to open their report.
        </div>
      )}

      <MissionsPanel />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Missions (Phase N) — additive to the existing org chart above, not a
// replacement for it. Tell the CMO an outcome; safe/reversible steps run
// automatically, anything money/external/third-party always waits here for
// an explicit approve/reject — enforced server-side (decide_mission_approval),
// this UI is a thin, honest view over that state, never a source of truth.
// ─────────────────────────────────────────────────────────────────────────────

function statusColors(status: TaskStatus) {
  if (status === "completed") return { fg: C.green, bg: C.greenMuted, bdr: C.greenBorder };
  if (status === "failed") return { fg: C.red, bg: C.redMuted, bdr: C.redBorder };
  if (status === "awaiting_approval") return { fg: C.amber, bg: C.amberMuted, bdr: C.amberBorder };
  if (status === "cancelled")
    return { fg: C.textQuaternary, bg: C.chromeMuted, bdr: C.borderSubtle };
  return { fg: C.aiBlue, bg: C.accentMuted, bdr: C.aiBlueBorder }; // ready | running | blocked
}

// A 'completed' task with output_data.prepared===true never actually
// executed anything real (see missionTools.ts's hasExecutor:false tools) —
// this must never look identical to a task that genuinely ran. Distinct
// label AND color (amber, not green) so "done" and "prepared for you to do
// yourself" are never confusable at a glance.
function taskStatusDisplay(t: { status: TaskStatus; output_data: Record<string, unknown> | null }) {
  const isPreparedOnly =
    t.status === "completed" &&
    t.output_data?.prepared === true &&
    t.output_data?.executed === false;
  if (isPreparedOnly) {
    return {
      label: "Prepared — action needed",
      ...{ fg: C.amber, bg: C.amberMuted, bdr: C.amberBorder },
    };
  }
  return { label: TASK_STATUS_LABEL[t.status], ...statusColors(t.status) };
}

function MissionRow({
  mission,
  selected,
  onToggle,
}: {
  mission: Mission;
  selected: boolean;
  onToggle: () => void;
}) {
  const { fg, bg, bdr } = priorityColors(mission.priority);
  return (
    <button
      onClick={onToggle}
      style={{
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "11px 14px",
        borderRadius: 12,
        cursor: "pointer",
        width: "100%",
        background: selected ? C.raised : C.surface,
        border: `1px solid ${selected ? C.aiBlueBorder : C.borderSubtle}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {mission.objective_summary ?? mission.objective}
        </div>
        <div style={{ fontSize: 11, color: C.textQuaternary, marginTop: 2 }}>
          {MISSION_STATUS_LABEL[mission.status]}
        </div>
      </div>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: fg,
          background: bg,
          border: `1px solid ${bdr}`,
          borderRadius: 6,
          padding: "2px 6px",
          flexShrink: 0,
        }}
      >
        {mission.priority}
      </span>
    </button>
  );
}

function MissionDetailPanel({ missionId }: { missionId: string }) {
  const { data, isPending } = useMissionDetailQuery(missionId);
  const { data: agents } = useAgentsQuery();
  const decide = useDecideApprovalMutation(missionId);
  const cancelMission = useCancelMissionMutation();

  if (isPending || !data) {
    return (
      <div style={{ fontSize: 12.5, color: C.textQuaternary, marginTop: 14 }}>Loading Mission…</div>
    );
  }

  const agentName = (key: string) => agents?.find((a) => a.key === key)?.name ?? key;

  const { mission, tasks, approvals } = data;
  const progress = missionProgress(tasks);
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const canCancel =
    mission.status === "planning" || mission.status === "active" || mission.status === "blocked";

  return (
    <div
      style={{
        marginTop: 16,
        background: C.surface,
        border: `1px solid ${C.aiBlueBorder}`,
        borderRadius: 16,
        padding: "18px 20px",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 10, gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary }}>
          {mission.objective_summary ?? mission.objective}
        </div>
        {canCancel && (
          <button
            onClick={() => cancelMission.mutate(mission.id)}
            disabled={cancelMission.isPending}
            style={{
              fontSize: 11.5,
              color: C.textQuaternary,
              background: "none",
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              padding: "4px 9px",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Cancel Mission
          </button>
        )}
      </div>

      {mission.strategy_summary && (
        <p style={{ fontSize: 12.5, color: C.textSecondary, lineHeight: 1.6, margin: "0 0 14px" }}>
          {mission.strategy_summary}
        </p>
      )}

      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: C.raised,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress.pct}%`,
            background: C.aiBlue,
            transition: "width 300ms ease",
          }}
        />
      </div>

      {pendingApprovals.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {pendingApprovals.map((a) => {
            const task = tasks.find((t) => t.id === a.task_id);
            return (
              <div
                key={a.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: C.amberMuted,
                  border: `1px solid ${C.amberBorder}`,
                }}
              >
                <div
                  style={{ fontSize: 12.5, fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}
                >
                  {task?.title ?? a.action_type}
                </div>
                <div style={{ fontSize: 11.5, color: C.textTertiary, marginBottom: 10 }}>
                  Needs your approval before MRKT continues.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decide.mutate({ approvalId: a.id, decision: "approved" })}
                    disabled={decide.isPending}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: "white",
                      background: C.green,
                      border: "none",
                      borderRadius: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide.mutate({ approvalId: a.id, decision: "rejected" })}
                    disabled={decide.isPending}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: C.textSecondary,
                      background: "none",
                      border: `1px solid ${C.borderNormal}`,
                      borderRadius: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
                {decide.isError && (
                  <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>
                    {(decide.error as Error).message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cancelMission.isError && (
        <div style={{ fontSize: 11.5, color: C.red, marginBottom: 10 }}>
          {(cancelMission.error as Error).message}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tasks.map((t) => {
          const { label, fg, bg, bdr } = taskStatusDisplay(t);
          const manualNote =
            typeof t.output_data?.manual_action_required === "string"
              ? t.output_data.manual_action_required
              : null;
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "8px 12px",
                borderRadius: 10,
                background: C.raised,
                border: `1px solid ${C.borderSubtle}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.textSecondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.title}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.textQuaternary, marginTop: 1 }}>
                    {agentName(t.agent_key)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: fg,
                    background: bg,
                    border: `1px solid ${bdr}`,
                    borderRadius: 6,
                    padding: "2px 6px",
                    flexShrink: 0,
                  }}
                >
                  {label}
                </span>
              </div>
              {manualNote && (
                <div style={{ fontSize: 11, color: C.textTertiary, lineHeight: 1.5 }}>
                  {manualNote}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MissionsPanel() {
  const { data: missions, isPending: missionsLoading } = useMissionsQuery();
  const [objective, setObjective] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const createMission = useCreateMissionMutation();

  function handleCreate() {
    const trimmed = objective.trim();
    if (trimmed.length < 8 || createMission.isPending) return;
    createMission.mutate(trimmed, {
      onSuccess: (data) => {
        setSelectedId(data.mission.id);
        setObjective("");
      },
    });
  }

  return (
    <div style={{ marginTop: 28, paddingTop: 24, borderTop: `1px solid ${C.borderSubtle}` }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
        Missions
      </div>
      <p style={{ fontSize: 12.5, color: C.textTertiary, margin: "0 0 14px", lineHeight: 1.55 }}>
        Tell the CMO an outcome — your team plans it, delegates it, and starts on the safe,
        reversible parts automatically. Anything involving money, publishing, or contacting a
        creator always waits for your approval below.
      </p>

      <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="e.g. Our bookings are down this month — fix it"
          style={{
            flex: 1,
            fontSize: 13,
            padding: "10px 13px",
            borderRadius: 10,
            border: `1px solid ${C.borderNormal}`,
            background: C.raised,
            color: C.textPrimary,
          }}
        />
        <button
          onClick={handleCreate}
          disabled={createMission.isPending || objective.trim().length < 8}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 700,
            color: "white",
            background: C.aiBlue,
            border: "none",
            borderRadius: 10,
            padding: "0 16px",
            height: 38,
            flexShrink: 0,
            cursor: createMission.isPending ? "default" : "pointer",
            opacity: createMission.isPending || objective.trim().length < 8 ? 0.6 : 1,
          }}
        >
          {createMission.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Rocket size={13} />
          )}
          {createMission.isPending ? "Planning…" : "Start Mission"}
        </button>
      </div>

      {createMission.isError && (
        <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>
          {(createMission.error as Error).message}
        </div>
      )}

      {missionsLoading && (
        <div style={{ fontSize: 12.5, color: C.textQuaternary }}>Loading Missions…</div>
      )}
      {!missionsLoading && (missions ?? []).length === 0 && (
        <div style={{ fontSize: 12.5, color: C.textQuaternary, padding: "12px 0" }}>
          No Missions yet — describe an outcome above to start your first one.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(missions ?? []).map((m) => (
          <MissionRow
            key={m.id}
            mission={m}
            selected={selectedId === m.id}
            onToggle={() => setSelectedId(selectedId === m.id ? null : m.id)}
          />
        ))}
      </div>

      {selectedId && <MissionDetailPanel missionId={selectedId} />}
    </div>
  );
}
