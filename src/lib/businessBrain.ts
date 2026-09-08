// ─────────────────────────────────────────────────────────────────────────────
// Business Brain (Phase O) — frontend types + data hooks. Same Phase K React
// Query shape as missions.ts: plain module, qk-scoped keys, RLS-scoped table
// reads, and RPC calls for the only two client-writable actions
// (submit_user_stated_fact, decide_memory_candidate) — no direct table
// UPDATE exists for business_facts/memory_candidates, matching Phase N's
// "every mutation is a SECURITY DEFINER RPC" discipline.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type FactCategory =
  | "brand"
  | "audience"
  | "products"
  | "competitors"
  | "marketing"
  | "constraints"
  | "performance"
  | "preference";

export type FactSourceType =
  | "user_stated"
  | "business_data"
  | "connected_source"
  | "measured"
  | "ai_inferred"
  | "market_observed"
  | "agent_learned";

export type Confidence = "verified" | "high" | "medium" | "low";

export interface BusinessFact {
  id: string;
  category: FactCategory;
  fact_key: string;
  statement: string;
  source_type: FactSourceType;
  confidence: Confidence;
  observed_at: string;
  expires_at: string | null;
  mission_id: string | null;
}

export interface MemoryCandidate {
  id: string;
  category: FactCategory;
  fact_key: string;
  statement: string;
  proposed_source_type: FactSourceType;
  proposed_confidence: Confidence;
  status: "pending" | "accepted" | "rejected" | "superseded";
  created_at: string;
}

// Trust-UI labels — spec §22: understandable without exposing DB jargon.
export const SOURCE_LABEL: Record<FactSourceType, string> = {
  user_stated: "Provided by you",
  business_data: "From your business data",
  connected_source: "Connected source",
  measured: "Measured by MRKT",
  market_observed: "Market Intelligence",
  agent_learned: "Learned from your Missions",
  ai_inferred: "AI hypothesis",
};

export const CATEGORY_LABEL: Record<FactCategory, string> = {
  brand: "Brand",
  audience: "Audience",
  products: "Products",
  competitors: "Competitors",
  marketing: "Marketing",
  constraints: "Constraints",
  performance: "Learnings",
  preference: "Preferences",
};

async function fetchFacts(businessId: string): Promise<BusinessFact[]> {
  const { data, error } = await supabase
    .from("business_facts")
    .select(
      "id, category, fact_key, statement, source_type, confidence, observed_at, expires_at, mission_id",
    )
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("observed_at", { ascending: false });
  if (error) throw new Error("Couldn't load your Business Brain.");
  return (data ?? []) as unknown as BusinessFact[];
}

export function useBusinessFactsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing-hub", "business-facts", user?.id ?? "anonymous"] as const,
    queryFn: () => fetchFacts(user!.id),
    enabled: !!user,
    staleTime: 15_000,
  });
}

async function fetchPendingCandidates(businessId: string): Promise<MemoryCandidate[]> {
  const { data, error } = await supabase
    .from("memory_candidates")
    .select(
      "id, category, fact_key, statement, proposed_source_type, proposed_confidence, status, created_at",
    )
    .eq("business_id", businessId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load pending learnings.");
  return (data ?? []) as unknown as MemoryCandidate[];
}

export function usePendingCandidatesQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketing-hub", "memory-candidates", user?.id ?? "anonymous"] as const,
    queryFn: () => fetchPendingCandidates(user!.id),
    enabled: !!user,
    staleTime: 15_000,
  });
}

export function useSubmitFactMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { category: FactCategory; factKey: string; statement: string }) => {
      const { error } = await supabase.rpc("submit_user_stated_fact", {
        p_business_id: user!.id,
        p_category: input.category,
        p_fact_key: input.factKey,
        p_statement: input.statement,
      });
      if (error) throw new Error(error.message || "Couldn't save that. Please try again.");
    },
    onSuccess: () => {
      if (user)
        queryClient.invalidateQueries({ queryKey: ["marketing-hub", "business-facts", user.id] });
    },
  });
}

export function useDecideCandidateMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      candidateId,
      decision,
    }: {
      candidateId: string;
      decision: "accepted" | "rejected";
    }) => {
      const { error } = await supabase.rpc("decide_memory_candidate", {
        p_candidate_id: candidateId,
        p_decision: decision,
      });
      if (error)
        throw new Error(error.message || "Couldn't record your decision. Please try again.");
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries({
          queryKey: ["marketing-hub", "memory-candidates", user.id],
        });
        queryClient.invalidateQueries({ queryKey: ["marketing-hub", "business-facts", user.id] });
      }
    },
  });
}
