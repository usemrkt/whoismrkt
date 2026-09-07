// ─────────────────────────────────────────────────────────────────────────────
// Missions (Phase N) — frontend types + data hooks for the Marketing Team's
// Mission Foundation. Follows the same Phase K React Query shape as
// marketingHealth.ts / marketIntelligence.ts: plain module (not a route
// file, for the same code-splitting reason marketingHub.tsx documents),
// qk-scoped keys, extractFunctionErrorMessage for the one edge-function call
// (creation) and plain RLS-scoped table reads for everything else.
//
// Mutating an approval or cancelling a Mission goes through a SECURITY
// DEFINER RPC (decide_mission_approval / cancel_mission), never a direct
// table UPDATE — the Phase N migration grants no client UPDATE on
// missions/mission_tasks/mission_approvals at all, so this is the only
// path that works, not just the intended one.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { extractFunctionErrorMessage } from "@/lib/functionError";
import { qk } from "@/lib/queryClient";

export type MissionStatus =
  | "planning"
  | "active"
  | "blocked"
  | "completed"
  | "cancelled"
  | "failed";
export type MissionPriority = "critical" | "high" | "medium" | "low";
export type TaskStatus =
  | "blocked"
  | "ready"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";
export type RiskLevel = "safe" | "sensitive";

export interface Mission {
  id: string;
  objective: string;
  objective_summary: string | null;
  status: MissionStatus;
  priority: MissionPriority;
  target_metrics: { name: string; target: string }[];
  strategy_summary: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface MissionTask {
  id: string;
  mission_id: string;
  agent_key: string;
  tool_name: string;
  title: string;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown> | null;
  status: TaskStatus;
  risk_level: RiskLevel;
  requires_approval: boolean;
  depends_on: string[];
  order_index: number;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MissionApproval {
  id: string;
  mission_id: string;
  task_id: string;
  action_type: string;
  preview: Record<string, unknown>;
  risk_level: RiskLevel;
  financial_impact_usd: number | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  decided_at: string | null;
}

export interface MissionEvent {
  id: string;
  mission_id: string;
  task_id: string | null;
  event_type: string;
  actor: string;
  message: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface Agent {
  key: string;
  name: string;
  department: string;
  role_summary: string;
  icon: string;
}

// ── List ─────────────────────────────────────────────────────────────────

async function fetchMissions(businessId: string): Promise<Mission[]> {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your Missions. Please try again.");
  // The generated Database type widens priority/status/target_metrics to
  // plain string/Json (Postgres doesn't express our CHECK-constrained enums
  // or jsonb shape at the type level) — narrowing to this module's own
  // literal-union types is intentional, not a masked type error.
  return (data ?? []) as unknown as Mission[];
}

export function useMissionsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.missions(user?.id ?? "anonymous"),
    queryFn: () => fetchMissions(user!.id),
    enabled: !!user,
    staleTime: 15_000,
  });
}

// ── Detail (mission + tasks + approvals + events) ───────────────────────

export interface MissionDetail {
  mission: Mission;
  tasks: MissionTask[];
  approvals: MissionApproval[];
  events: MissionEvent[];
}

async function fetchMissionDetail(missionId: string): Promise<MissionDetail> {
  const [{ data: mission, error: mErr }, { data: tasks }, { data: approvals }, { data: events }] =
    await Promise.all([
      supabase.from("missions").select("*").eq("id", missionId).single(),
      supabase.from("mission_tasks").select("*").eq("mission_id", missionId).order("order_index"),
      supabase
        .from("mission_approvals")
        .select("*")
        .eq("mission_id", missionId)
        .order("requested_at", { ascending: false }),
      supabase
        .from("mission_events")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
  if (mErr || !mission) throw new Error("Couldn't load this Mission.");
  return {
    mission: mission as unknown as Mission,
    tasks: (tasks ?? []) as unknown as MissionTask[],
    approvals: (approvals ?? []) as unknown as MissionApproval[],
    events: (events ?? []) as unknown as MissionEvent[],
  };
}

const ACTIVE_STATUSES: MissionStatus[] = ["planning", "active", "blocked"];

export function useMissionDetailQuery(missionId: string | undefined) {
  return useQuery({
    queryKey: qk.missionDetail(missionId ?? "none"),
    queryFn: () => fetchMissionDetail(missionId!),
    enabled: !!missionId,
    staleTime: 3_000,
    // Poll while the Mission is still doing something — the task runner
    // advances state in the background (cron), not via any client push, so
    // this is what makes progress visible without a manual refresh. Stops
    // automatically once the Mission reaches a terminal status.
    refetchInterval: (query) =>
      query.state.data && ACTIVE_STATUSES.includes(query.state.data.mission.status) ? 5_000 : false,
  });
}

// ── Agent roster (static reference data) ────────────────────────────────

export function useAgentsQuery() {
  return useQuery({
    queryKey: ["marketing-hub", "agents"] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").eq("is_active", true);
      if (error) throw new Error("Couldn't load the agent roster.");
      return (data ?? []) as Agent[];
    },
    staleTime: 60 * 60_000, // reference data — changes only via migration
    gcTime: 24 * 60 * 60_000,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────

export function useCreateMissionMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (objective: string) => {
      const { data, error } = await supabase.functions.invoke("cmo-create-mission", {
        body: { objective },
      });
      if (error)
        throw new Error(
          await extractFunctionErrorMessage(
            error,
            "Couldn't create that Mission. Please try again.",
          ),
        );
      return data as { mission: Mission; tasks: MissionTask[] };
    },
    onSuccess: () => {
      if (user) queryClient.invalidateQueries({ queryKey: qk.missions(user.id) });
    },
  });
}

export function useDecideApprovalMutation(missionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      approvalId,
      decision,
    }: {
      approvalId: string;
      decision: "approved" | "rejected";
    }) => {
      const { error } = await supabase.rpc("decide_mission_approval", {
        p_approval_id: approvalId,
        p_decision: decision,
      });
      if (error)
        throw new Error(error.message || "Couldn't record your decision. Please try again.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.missionDetail(missionId) }),
  });
}

export function useCancelMissionMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (missionId: string) => {
      const { error } = await supabase.rpc("cancel_mission", { p_mission_id: missionId });
      if (error)
        throw new Error(error.message || "Couldn't cancel this Mission. Please try again.");
      return missionId;
    },
    onSuccess: (missionId) => {
      queryClient.invalidateQueries({ queryKey: qk.missionDetail(missionId) });
      if (user) queryClient.invalidateQueries({ queryKey: qk.missions(user.id) });
    },
  });
}

// ── Small display helpers ───────────────────────────────────────────────

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  blocked: "Waiting on a dependency",
  ready: "Queued",
  running: "In progress",
  awaiting_approval: "Needs your approval",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  planning: "Planning",
  active: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function missionProgress(tasks: MissionTask[]): {
  done: number;
  total: number;
  pct: number;
} {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "completed" || t.status === "cancelled").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
