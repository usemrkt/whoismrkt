// ─────────────────────────────────────────────────────────────────────────────
// Proactive Operations (Phase P) — frontend types + data hooks for the
// signal → finding → recommendation → Proposed Mission chain. Same Phase K
// shape as missions.ts/businessBrain.ts: plain module, RLS-scoped table
// reads, RPC calls for the two client-writable actions
// (dismiss_recommendation; converting to a Mission goes through the
// existing cmo-create-mission edge function — see missions.ts's
// useCreateMissionMutation, which now accepts a sourceRecommendationId).
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type SignalCategory = "performance" | "campaign" | "creative" | "market" | "business" | "mission" | "seasonal";
export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high" | "verified";

export interface MarketingSignal {
  id: string;
  detector_key: string;
  category: SignalCategory;
  severity: Severity;
  confidence: Confidence;
  status: "active" | "resolved" | "dismissed";
  metric_label: string | null;
  metric_current: number | null;
  metric_baseline: number | null;
  change_pct: number | null;
  data_source: string;
  first_detected_at: string;
  last_detected_at: string;
}

export interface ProposedMissionPackage {
  title: string;
  why_now: string;
  found: string;
  proposed_response: string;
  team: string[];
  estimated_internal_cost_usd: number;
  external_spend_usd: number;
}

export interface ProactiveRecommendation {
  id: string;
  title: string;
  explanation: string | null;
  action: string | null;
  priority: "critical" | "high" | "medium" | "low";
  status: string;
  confidence: Confidence | null;
  effort: "low" | "medium" | "high" | null;
  risk: "low" | "medium" | "high" | null;
  estimated_cost_usd: number | null;
  affected_objective: string | null;
  proposed_mission: ProposedMissionPackage | null;
  signal_id: string | null;
  finding_id: string | null;
  converted_to_mission_id: string | null;
  dismissed_count: number;
  created_at: string;
}

// ── Active, proactively-sourced recommendations (i.e. this business's
// "your marketing team found N things" feed) — deliberately scoped to
// signal_id IS NOT NULL so this never duplicates the pre-existing
// AI-strategist-generated weekly_priorities/opportunities cards from
// marketing-hub-briefing, which are a different, already-shipped mechanism.
async function fetchProactiveRecommendations(businessId: string): Promise<ProactiveRecommendation[]> {
  const { data, error } = await supabase
    .from("ai_recommendations")
    .select(
      "id, title, explanation, action, priority, status, confidence, effort, risk, estimated_cost_usd, affected_objective, proposed_mission, signal_id, finding_id, converted_to_mission_id, dismissed_count, created_at",
    )
    .eq("user_id", businessId)
    .eq("status", "active")
    .not("signal_id", "is", null)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load your marketing team's findings.");
  return (data ?? []) as unknown as ProactiveRecommendation[];
}

export function useProactiveRecommendationsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing-hub", "proactive-recommendations", user?.id ?? "anonymous"] as const,
    queryFn: () => fetchProactiveRecommendations(user!.id),
    enabled: !!user,
    staleTime: 15_000,
  });
}

async function fetchActiveSignals(businessId: string): Promise<MarketingSignal[]> {
  const { data, error } = await supabase
    .from("marketing_signals")
    .select(
      "id, detector_key, category, severity, confidence, status, metric_label, metric_current, metric_baseline, change_pct, data_source, first_detected_at, last_detected_at",
    )
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("last_detected_at", { ascending: false });
  if (error) throw new Error("Couldn't load current signals.");
  return (data ?? []) as unknown as MarketingSignal[];
}

export function useActiveSignalsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing-hub", "marketing-signals", user?.id ?? "anonymous"] as const,
    queryFn: () => fetchActiveSignals(user!.id),
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useDismissRecommendationMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recommendationId: string) => {
      const { error } = await supabase.rpc("dismiss_recommendation", { p_recommendation_id: recommendationId });
      if (error) throw new Error(error.message || "Couldn't dismiss that. Please try again.");
    },
    onSuccess: () => {
      if (user)
        queryClient.invalidateQueries({ queryKey: ["marketing-hub", "proactive-recommendations", user.id] });
    },
  });
}

// ── Display helpers ──────────────────────────────────────────────────────

export const SIGNAL_CATEGORY_LABEL: Record<SignalCategory, string> = {
  performance: "Performance", campaign: "Campaign", creative: "Creative",
  market: "Market", business: "Business", mission: "Mission team", seasonal: "Seasonal",
};

export const PRIORITY_LABEL: Record<ProactiveRecommendation["priority"], string> = {
  critical: "Critical", high: "High priority", medium: "Medium priority", low: "Low priority",
};
