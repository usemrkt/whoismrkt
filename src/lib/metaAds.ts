// ─────────────────────────────────────────────────────────────────────────────
// Meta Ads Specialist (Phase P) — read-only frontend hook for the
// specialist's genuine PREPARE-ONLY output (meta_campaign_plans). No
// mutation exists here on purpose: a plan is produced only by a Mission
// task (mission-task-runner's execMetaPrepareCampaignPlan), never created
// or edited directly by the client — same "no direct client write" posture
// as missions/mission_tasks.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface MetaCampaignPlan {
  id: string;
  mission_id: string | null;
  objective: string;
  funnel_stage: "acquisition" | "retargeting" | "retention";
  campaign_structure: {
    campaign_name: string;
    objective_type: string;
    ad_sets: { name: string; optimization_event: string; budget_note: string }[];
  };
  audience_strategy: {
    approach: string;
    description: string;
    geography: string;
    exclusions: string[];
  };
  budget_proposal: { daily_budget_usd_low: number; daily_budget_usd_high: number; rationale: string };
  placements: { approach: string; surfaces: string[]; rationale: string };
  creative_requirements: string[];
  copy_requirements: { hooks: string[]; primary_text_direction: string; cta_options: string[] };
  test_matrix: { variable: string; variants: string[] }[];
  kpi_targets: { metric: string; target: string }[];
  status: "prepared";
  created_at: string;
}

async function fetchMetaCampaignPlans(businessId: string): Promise<MetaCampaignPlan[]> {
  const { data, error } = await supabase
    .from("meta_campaign_plans")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error("Couldn't load Meta Ads plans.");
  return (data ?? []) as unknown as MetaCampaignPlan[];
}

export function useMetaCampaignPlansQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing-hub", "meta-campaign-plans", user?.id ?? "anonymous"] as const,
    queryFn: () => fetchMetaCampaignPlans(user!.id),
    enabled: !!user,
    staleTime: 15_000,
  });
}
