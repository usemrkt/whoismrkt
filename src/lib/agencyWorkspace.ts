// ─────────────────────────────────────────────────────────────────────────────
// Agency Workspace — shared frontend types + data hook.
//
// Everything here is a read of what the edge function already aggregated —
// no client-side classification logic, so "what counts as Strategy activity"
// etc. has exactly one definition (supabase/functions/_shared/agencyWorkspace.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Department = "strategy" | "content" | "brand" | "growth" | "analytics";
export type WorkPriority = "critical" | "high" | "medium" | "low";

export interface ActivityItem {
  department: Department;
  title: string;
  evidence: string;
  occurredAt: string;
  sourceTable: string;
  sourceId: string;
  link: string | null;
}

export interface WorkQueueItem {
  id: string;
  title: string;
  explanation: string | null;
  action: string | null;
  priority: WorkPriority;
  source: string;
  createdAt: string;
  link: string | null;
}

export interface TodaysBriefing {
  completed: ActivityItem[];
  inProgress: ActivityItem[];
  blocked: ActivityItem[];
  needsAttention: ActivityItem[];
  whatsNext: WorkQueueItem[];
}

export interface TimelineItem extends ActivityItem {
  status: "completed" | "current" | "upcoming" | "blocked";
}

export interface DecisionLogItem {
  title: string;
  why: string | null;
  evidence: string | null;
  decidedAt: string;
  source: string;
  link: string | null;
}

export interface AgencyWorkspaceData {
  briefing: TodaysBriefing;
  departmentActivity: Record<Department, ActivityItem[]>;
  workQueue: WorkQueueItem[];
  timeline: TimelineItem[];
  decisionLog: DecisionLogItem[];
  generatedAt: string;
}

const EMPTY: AgencyWorkspaceData = {
  briefing: { completed: [], inProgress: [], blocked: [], needsAttention: [], whatsNext: [] },
  departmentActivity: { strategy: [], content: [], brand: [], growth: [], analytics: [] },
  workQueue: [], timeline: [], decisionLog: [], generatedAt: "",
};

export function useAgencyWorkspace() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [data, setData]       = useState<AgencyWorkspaceData>(EMPTY);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("agency-workspace", { body: {} });
      if (fnErr) throw fnErr;
      setData({
        briefing: res.briefing, departmentActivity: res.departmentActivity,
        workQueue: res.workQueue ?? [], timeline: res.timeline ?? [], decisionLog: res.decisionLog ?? [],
        generatedAt: res.generated_at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load Agency Workspace.");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  return { loading, error, data, reload };
}

export const DEPARTMENT_LABELS: Record<Department, string> = {
  strategy: "Strategy", content: "Content", brand: "Brand", growth: "Growth", analytics: "Analytics",
};

export function priorityLabel(p: WorkPriority): string {
  return p.charAt(0).toUpperCase() + p.slice(1);
}
