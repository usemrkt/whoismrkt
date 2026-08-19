// ─────────────────────────────────────────────────────────────────────────────
// /marketing-hub — layout shell for the AI Marketing Team hub.
// Business only. Fetches the daily briefing ONCE here and shares it with every
// child section (Dashboard, Marketing Team, Campaign Center, Content Studio,
// Growth) via context, so switching sections never re-fetches. Children:
//   index     → /marketing-hub           (executive Dashboard)
//   team      → /marketing-hub/team      (AI Marketing Team org chart)
//   campaigns → /marketing-hub/campaigns (Campaign Center)
//   content   → /marketing-hub/content   (Content Studio, moved from /create)
//   growth    → /marketing-hub/growth    (Growth opportunities)
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Compass, LayoutGrid, Users2, TrendingUp, Megaphone, Wand2, Radar, Activity, FileText, Building2, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";
import {
  MarketingHubCtx, timeAgo,
  type Briefing, type ActionCenterItem, type CampaignSummary, type Recommendation, type MarketingHubCtxValue,
} from "@/lib/marketingHub";

export const Route = createFileRoute("/_authenticated/marketing-hub")({
  head: () => ({ meta: [{ title: "Marketing Hub — MRKT" }] }),
  component: MarketingHubLayout,
});

const NAV_ITEMS = [
  { to: "/marketing-hub",          label: "Dashboard",       icon: LayoutGrid, exact: true },
  { to: "/marketing-hub/team",     label: "Marketing Team",  icon: Users2,     exact: false },
  { to: "/marketing-hub/campaigns",label: "Campaign Center", icon: Megaphone,  exact: false },
  { to: "/marketing-hub/content",  label: "Content Studio",  icon: Wand2,      exact: false },
  { to: "/marketing-hub/growth",   label: "Growth",          icon: TrendingUp, exact: false },
  { to: "/marketing-hub/intelligence", label: "Market Intelligence", icon: Radar, exact: false },
  { to: "/marketing-hub/health", label: "Marketing Health", icon: Activity, exact: false },
  { to: "/marketing-hub/reports", label: "Executive Reports", icon: FileText, exact: false },
  { to: "/marketing-hub/workspace", label: "Agency Workspace", icon: Building2, exact: false },
] as const;

// ── Layout ────────────────────────────────────────────────────────────────────

function MarketingHubLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [accessChecked, setAccessChecked] = useState(false);
  const [isBusiness, setIsBusiness]       = useState(false);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [briefing, setBriefing]           = useState<Briefing | null>(null);
  const [actionCenter, setActionCenter]   = useState<ActionCenterItem[]>([]);
  const [campaigns, setCampaigns]         = useState<CampaignSummary[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [generatedAt, setGeneratedAt]     = useState<string | null>(null);
  const [cached, setCached]               = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle();
      const biz = !!p && (p.account_type === "brand" || p.account_type === "business" || p.account_type === "agency"
        || p.onboarding_path === "business_creator" || p.onboarding_path === "business_marketing");
      if (!biz) { navigate({ to: "/home" }); return; }
      setIsBusiness(true);
      setAccessChecked(true);
    })();
  }, [user, navigate]);

  const load = useCallback(async (force: boolean) => {
    if (!user) return;
    if (force) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("marketing-hub-briefing", { body: { force_refresh: force } });
      if (fnErr) throw fnErr;
      setBriefing(data.briefing);
      setActionCenter(data.action_center ?? []);
      setCampaigns(data.campaigns ?? []);
      setRecommendations(data.recommendations ?? []);
      setGeneratedAt(data.generated_at);
      setCached(!!data.cached);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your Marketing Hub briefing.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (accessChecked && isBusiness) load(false);
  }, [accessChecked, isBusiness, load]);

  const dismiss = useCallback(async (id: string) => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("ai_recommendations").update({ status: "dismissed" }).eq("id", id);
  }, []);

  const complete = useCallback(async (id: string) => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("ai_recommendations").update({ status: "completed", is_done: true }).eq("id", id);
  }, []);

  if (!accessChecked) {
    return <div className="flex items-center justify-center" style={{ height: "60vh" }}><Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} /></div>;
  }

  const ctxValue: MarketingHubCtxValue = {
    loading, refreshing, error, briefing, actionCenter, campaigns, recommendations, generatedAt, cached,
    refresh: load, dismiss, complete,
  };

  return (
    <div style={{ background: C.canvas, minHeight: "100vh" }}>
      <div className="marketing-hub-page-inner">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between" style={{ marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 34, height: 34, borderRadius: 10, background: C.accentMuted, border: `1px solid ${C.aiBlueBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Compass size={17} style={{ color: C.aiBlue }} />
            </div>
            <div>
              <h1 style={{ fontSize: "clamp(1.5rem, 2.2vw, 1.9rem)", fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.1 }}>
                Marketing Hub
              </h1>
              <p style={{ fontSize: 12.5, color: C.textTertiary, margin: "2px 0 0" }}>
                Your AI marketing team.
                {generatedAt && <> Updated {timeAgo(generatedAt)}{cached ? "" : " · fresh"}.</>}
              </p>
            </div>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing || loading}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: C.textSecondary, background: C.surface, border: `1px solid ${C.borderSubtle}`, borderRadius: 10, padding: "8px 14px", cursor: refreshing || loading ? "default" : "pointer", opacity: refreshing || loading ? 0.6 : 1 }}
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>

        {/* ── Internal section nav — real routes, glass surface ─────────────── */}
        <div
          className="flex items-center gap-1"
          style={{
            marginBottom: 20, padding: 5, borderRadius: 14,
            background: "oklch(0.05 0 0 / 75%)", backdropFilter: "blur(28px) saturate(160%) brightness(1.04)",
            WebkitBackdropFilter: "blur(28px) saturate(160%) brightness(1.04)",
            border: `1px solid ${C.borderSubtle}`, width: "fit-content",
          }}
        >
          {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "8px 14px", borderRadius: 10,
                  fontSize: 13, fontWeight: 600, textDecoration: "none",
                  color: active ? C.textPrimary : C.textTertiary,
                  background: active ? C.raised : "transparent",
                  transition: "all 120ms ease",
                }}
              >
                <Icon size={14} style={{ color: active ? C.aiBlue : "currentColor" }} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* ── Section content ────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center" style={{ height: "40vh" }}>
            <Loader2 size={22} className="animate-spin" style={{ color: C.aiBlue }} />
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: "16px 18px", background: C.redMuted, border: `1px solid ${C.redBorder}`, borderRadius: 14, color: C.textSecondary, fontSize: 13 }}>
            {error} <button onClick={() => load(false)} style={{ color: C.aiBlue, fontWeight: 600, marginLeft: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Try again</button>
          </div>
        )}

        {!loading && !error && briefing && (
          <MarketingHubCtx.Provider value={ctxValue}>
            <Outlet />
          </MarketingHubCtx.Provider>
        )}
      </div>
    </div>
  );
}
