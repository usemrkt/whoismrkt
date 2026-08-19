// ─────────────────────────────────────────────────────────────────────────────
// Market Intelligence — shared frontend types + data hook + action helpers.
//
// Deliberately independent of MarketingHubCtx (src/lib/marketingHub.ts):
// findings have their own refresh cadence (per search family, hours to days),
// not the daily-briefing cadence the rest of the Hub shares — so this section
// does its own fetch rather than being crammed into the shared context.
//
// Kept as a plain module (not a route file) for the same reason marketingHub.ts
// is: nothing shared should live inside a code-split route component.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FreshnessState = "fresh" | "aging" | "stale" | "historical";
export type IntelligenceType = "competitor" | "opportunity" | "threat" | "trend" | "market_signal";

export interface Finding {
  id: string;
  type: IntelligenceType;
  category: string;
  title: string;
  summary: string;
  evidence: string;
  source_url: string;
  source_domain: string;
  source_title: string | null;
  competitor_id: string | null;
  confidence: number;
  relevance: number;
  fetched_at: string;
  stale_after: string;
  created_at: string;
  freshness: FreshnessState;
}

export interface Competitor {
  id: string;
  name: string;
  domain: string | null;
  status: "confirmed" | "potential";
  source: "brand_knowledge" | "finding_discovered" | "manual";
  confidence: number | null;
  created_at: string;
}

export interface BriefItem {
  finding_id: string;
  title: string;
  category: string;
  why_it_matters: string;
  evidence: string;
  source_url: string;
  source_domain: string;
  freshness: FreshnessState;
  confidence: number;
  recommended_action: string | null;
}

export interface Brief {
  headline: string;
  top_items: BriefItem[];
}

export interface MarketIntelligenceData {
  brief: Brief;
  competitors: Competitor[];
  opportunities: Finding[];
  threats: Finding[];
  trends: Finding[];
  competitorMoves: Finding[];
  feedFindings: Finding[];
  generatedAt: string | null;
  cached: boolean;
}

const EMPTY: MarketIntelligenceData = {
  brief: { headline: "Not enough verified market data yet.", top_items: [] },
  competitors: [], opportunities: [], threats: [], trends: [], competitorMoves: [], feedFindings: [],
  generatedAt: null, cached: false,
};

export function useMarketIntelligence() {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [data, setData]             = useState<MarketIntelligenceData>(EMPTY);

  const loadBrief = useCallback(async (force: boolean) => {
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("market-intelligence-brief", { body: { force_refresh: force } });
      if (fnErr) throw fnErr;
      setData({
        brief: res.brief, competitors: res.competitors ?? [],
        opportunities: res.opportunities ?? [], threats: res.threats ?? [], trends: res.trends ?? [],
        competitorMoves: res.competitor_moves ?? [], feedFindings: res.feed_findings ?? [],
        generatedAt: res.generated_at, cached: !!res.cached,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load Market Intelligence.");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadBrief(false).finally(() => setLoading(false));
  }, [loadBrief]);

  // Runs due searches (server-gated by market_intelligence_search_cursor —
  // this button does NOT force a search if nothing is actually due) then
  // regenerates the Executive Brief over whatever's newly stored.
  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const { error: fnErr } = await supabase.functions.invoke("market-intelligence-refresh", { body: {} });
      if (fnErr) throw fnErr;
      await loadBrief(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't refresh Market Intelligence.");
    } finally {
      setRefreshing(false);
    }
  }, [loadBrief]);

  return { loading, refreshing, error, data, refresh: runRefresh, reload: () => loadBrief(false) };
}

// ─── Evidence-backed actions — reuse existing hand-off mechanisms, no new ones ─

type NavigateFn = (opts: { to: string }) => void;

export function askAICMO(finding: Pick<Finding, "title" | "summary" | "evidence" | "source_domain">, navigate: NavigateFn) {
  localStorage.setItem(
    "mrkt_prefill_prompt",
    `Market intelligence: "${finding.title}". ${finding.summary} Evidence: "${finding.evidence}" (source: ${finding.source_domain}). Help me respond to this.`,
  );
  navigate({ to: "/chat" });
}

export function createCampaignFromFinding(finding: Pick<Finding, "title" | "summary" | "evidence">, navigate: NavigateFn) {
  localStorage.setItem(
    "mrkt_campaign_draft",
    JSON.stringify({
      title: `Respond to: ${finding.title}`,
      description: finding.summary,
      campaign_goal: `Differentiate/respond based on market intelligence: ${finding.evidence}`,
    }),
  );
  navigate({ to: "/campaign-create" });
}

export function createContentFromFinding(finding: Pick<Finding, "title" | "summary">, navigate: NavigateFn) {
  localStorage.setItem("mrkt_content_prefill", `Create content responding to this market signal: "${finding.title}" — ${finding.summary}`);
  navigate({ to: "/marketing-hub/content" });
}

export async function addFindingToGrowth(finding: Finding, businessId: string): Promise<void> {
  await supabase.from("ai_recommendations").insert({
    user_id: businessId,
    recommendation_type: finding.type === "threat" ? "action" : "opportunity",
    title: finding.title,
    explanation: finding.summary,
    action: "Review and respond",
    priority: finding.confidence >= 0.75 ? "high" : "medium",
    status: "active",
    source: "market_intelligence",
    meta: { link: "/marketing-hub/intelligence", finding_id: finding.id },
  });
}

export function freshnessLabel(f: FreshnessState): string {
  return f === "fresh" ? "Fresh" : f === "aging" ? "Aging" : f === "stale" ? "Stale" : "Historical";
}
