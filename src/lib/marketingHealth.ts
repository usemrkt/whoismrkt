// ─────────────────────────────────────────────────────────────────────────────
// Marketing Health — shared frontend types + data hook.
//
// Independent of MarketingHubCtx for the same reason src/lib/marketIntelligence.ts
// is: Marketing Health has its own refresh cadence (daily-cached narrative,
// always-fresh deterministic scores), not the shared daily-briefing one.
// Kept as a plain module (not a route file) for the same code-splitting
// reason marketingHub.ts documents.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HealthCategory =
  | "campaign" | "conversion" | "retention" | "revenue" | "growth"
  | "content" | "brand" | "market_position" | "audience";

export interface ContributingMetric { name: string; value: number; weight: number; evidence: string; sampleSize: number }

export interface CategoryScore {
  category: HealthCategory;
  label: string;
  status: "supported" | "more_data_required";
  score: number | null;
  confidence: number;
  contributingMetrics: ContributingMetric[];
  missingDataHint?: string;
  trend?: { deltaPct: number | null; direction: "up" | "down" | "flat" };
}

export interface EvidenceRef { title: string; evidence: string; source: "market_intelligence" | "analytics" }

export interface MarketingHealthResult {
  categories: CategoryScore[];
  overall: { score: number | null; confidence: number };
  topStrength: CategoryScore | null;
  biggestWeakness: CategoryScore | null;
  largestOpportunity: EvidenceRef | null;
  largestRisk: EvidenceRef | null;
  asOf: string;
}

export interface Narrative {
  overall_narrative: string;
  category_why: Record<string, string>;
  top_strength_explanation: string | null;
  biggest_weakness_explanation: string | null;
  largest_opportunity_explanation: string | null;
  largest_risk_explanation: string | null;
  highest_priority_action: string;
}

export function useMarketingHealth() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [health, setHealth]         = useState<MarketingHealthResult | null>(null);
  const [narrative, setNarrative]   = useState<Narrative | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cached, setCached]         = useState(false);

  const load = useCallback(async (force: boolean) => {
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("marketing-health", { body: { force_refresh: force } });
      if (fnErr) throw fnErr;
      setHealth(data.health);
      setNarrative(data.narrative);
      setGeneratedAt(data.generated_at);
      setCached(!!data.cached);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load Marketing Health.");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(false).finally(() => setLoading(false));
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return { loading, refreshing, error, health, narrative, generatedAt, cached, refresh };
}

export function scoreColorKind(score: number | null): "good" | "ok" | "poor" | "unknown" {
  if (score === null) return "unknown";
  if (score >= 70) return "good";
  if (score >= 45) return "ok";
  return "poor";
}
