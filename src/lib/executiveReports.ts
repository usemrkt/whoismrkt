// ─────────────────────────────────────────────────────────────────────────────
// Executive Reports — shared frontend types + data hooks.
//
// Reading history needs no edge function — executive_reports has the same
// owner-scoped RLS every other table here does, so history is a direct
// supabase-js query, same pattern as ai_recommendations's direct client
// updates. Only generation (AI, credit-gated) goes through the edge function.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ReportType = "daily_brief" | "weekly_report" | "monthly_review";

export interface DailyNarrative {
  headline: string;
  changes_today: string[];
  priority_items: { title: string; why: string }[];
  confidence: number;
}

export interface RiskItem { title: string; evidence: string; severity: "high" | "medium" | "low" }
export interface OpportunityItem { title: string; evidence: string; expected_impact: "high" | "medium" | "low" }

export interface FullNarrative {
  executive_summary: {
    overall_health: string; major_change: string; top_win: string; biggest_risk: string;
    biggest_opportunity: string; priority_recommendation: string; confidence: number;
  };
  marketing_performance: { campaigns: string; growth: string; content: string; revenue: string; conversions: string; retention: string; brand: string };
  market_intelligence: { competitor_activity: string; industry_changes: string; consumer_trends: string; platform_updates: string; opportunities: string[]; threats: string[] };
  campaign_review: { launched: string; completed: string; performance: string; health: string; lessons_learned: string };
  content_review: { production: string; consistency: string; creative_performance: string; publishing: string; content_health: string };
  growth_review: { acquisition: string; creator_network: string; partnerships: string; expansion: string };
  risks: RiskItem[];
  opportunities: OpportunityItem[];
  ai_cmo_recommendation: { recommendation: string; why: string; evidence: string[]; confidence: number };
}

export interface ExecutiveReport {
  id: string;
  business_id: string;
  report_type: ReportType;
  period_start: string;
  period_end: string;
  narrative: DailyNarrative | FullNarrative;
  overall_health_score: number | null;
  priority_recommendation: string;
  top_risk: string | null;
  top_opportunity: string | null;
  confidence: number;
  generated_at: string;
}

export function useReportHistory(reportType: ReportType) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [reports, setReports] = useState<ExecutiveReport[]>([]);

  const reload = useCallback(async () => {
    setError(null);
    const { data, error: dbErr } = await supabase
      .from("executive_reports")
      .select("*")
      .eq("report_type", reportType)
      .order("period_start", { ascending: false })
      .limit(24);
    if (dbErr) setError(dbErr.message);
    else setReports((data ?? []) as ExecutiveReport[]);
  }, [reportType]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  return { loading, error, reports, reload };
}

export function useGenerateReport() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (reportType: ReportType, force = false): Promise<ExecutiveReport | null> => {
    setGenerating(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("executive-reports", { body: { report_type: reportType, force_refresh: force } });
      if (fnErr) throw fnErr;
      return data.report as ExecutiveReport;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the report.");
      return null;
    } finally {
      setGenerating(false);
    }
  }, []);

  return { generate, generating, error };
}

export function isDailyNarrative(n: DailyNarrative | FullNarrative): n is DailyNarrative {
  return "headline" in n;
}

export function periodLabel(r: ExecutiveReport): string {
  return r.period_start === r.period_end ? r.period_start : `${r.period_start} – ${r.period_end}`;
}
