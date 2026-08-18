// ─────────────────────────────────────────────────────────────────────────────
// Shared Marketing Hub context/types/helpers.
//
// IMPORTANT: this lives outside src/routes/ deliberately. TanStack Router's
// Vite plugin code-splits each route file's `component` export into its own
// chunk — a route file (e.g. marketing-hub.tsx) that ALSO exports a
// createContext() result and is imported by sibling route files can end up
// with two separate module instances across chunk boundaries, silently
// breaking the Provider/Consumer relationship ("must be used within the
// provider" even though it visibly is). Keep anything shared across the
// Marketing Hub's route files here instead of in the layout route file.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext } from "react";
import { C } from "@/lib/theme";

export type Priority   = "high" | "medium" | "low";
export type Department = "strategy" | "content" | "brand" | "growth" | "analytics";

export type BriefingItem = {
  title: string; why: string; action: string; link: string;
  priority: Priority; department?: Department;
};

export type Briefing = {
  health:               { score: number; summary: string };
  departments:          Partial<Record<Department, string>>;
  weekly_priorities:    BriefingItem[];
  opportunities:        BriefingItem[];
  campaign_suggestions: BriefingItem[];
  performance_highlights: string[];
  competitor_notes:    BriefingItem[] | null;
};

export type Recommendation = {
  id: string;
  recommendation_type: "action" | "opportunity" | "campaign";
  title: string;
  explanation: string | null;
  action: string | null;
  priority: Priority;
  status: string;
  meta: { link?: string; department?: Department | null; period_start?: string } | null;
};

export type ActionCenterItem = { label: string; link: string };

export interface MarketingHubCtxValue {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  briefing: Briefing | null;
  actionCenter: ActionCenterItem[];
  recommendations: Recommendation[];
  generatedAt: string | null;
  cached: boolean;
  refresh: (force: boolean) => void;
  dismiss: (id: string) => void;
  complete: (id: string) => void;
}

export const MarketingHubCtx = createContext<MarketingHubCtxValue | null>(null);

export function useMarketingHub(): MarketingHubCtxValue {
  const ctx = useContext(MarketingHubCtx);
  if (!ctx) throw new Error("useMarketingHub must be used within the Marketing Hub layout");
  return ctx;
}

export function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function priorityColors(p: Priority) {
  if (p === "high")   return { fg: C.red,    bg: C.redMuted,    bdr: C.redBorder };
  if (p === "medium") return { fg: C.amber,  bg: C.amberMuted,  bdr: C.amberBorder };
  return { fg: C.aiBlue, bg: C.accentMuted, bdr: C.aiBlueBorder };
}
