import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/theme";
import { computeVisibilityScore } from "@/lib/visibilityScore";
import { computeCreatorCompletion } from "@/lib/profileCompletion";
import type { CreatorProfile } from "@/types/creator";
import {
  TrendingUp, Sparkles, CheckCircle2, Circle, ArrowRight,
  Loader2, Star, Zap, Users, MessageSquare, BarChart2,
  Globe, CalendarDays, RefreshCw, Target, Award, Flame,
  ChevronRight, ShieldCheck, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/growth")({
  head: () => ({ meta: [{ title: "Growth Hub — MRKT" }] }),
  component: GrowthPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileCompletion {
  score:   number;
  items:   Array<{ id: string; label: string; done: boolean; link: string; points: number; icon: React.ElementType }>;
}

interface GrowthAdvice {
  title:    string;
  why:      string;
  action:   string;
  link:     string;
  priority: "high" | "medium" | "low";
  emoji:    string;
}

interface GrowthStat {
  label:   string;
  value:   string;
  sub:     string;
  trend?:  string;
  color:   string;
  icon:    React.ElementType;
  link:    string;
}

// ── Profile completion calculator ────────────────────────────────────────────
// Delegates scoring to the shared lib so growth hub and analytics always
// show the same percentage. Icons are assigned here (presentation concern).

const COMPLETION_ICONS: Record<string, React.ElementType> = {
  display_name: Award,
  photo:        ImageIcon,
  bio:          Star,
  categories:   Target,
  platforms:    Globe,
  social:       Users,
  audience:     Users,
  portfolio:    Globe,
  rate:         Zap,
};

function buildCreatorCompletion(_profile: Record<string, unknown> | null, creatorProfile: Record<string, unknown> | null): ProfileCompletion {
  if (!creatorProfile) return { score: 0, items: [] };
  const result = computeCreatorCompletion(creatorProfile as unknown as CreatorProfile);
  const pts    = 11; // equal-weight: 9 items × 11 pts ≈ 99%, close enough for display
  return {
    score: result.score,
    items: result.items.map((item) => ({
      ...item,
      points: pts,
      icon:   COMPLETION_ICONS[item.id] ?? Star,
    })),
  };
}

function buildBusinessCompletion(bizProfile: Record<string, unknown> | null): ProfileCompletion {
  const items = [
    {
      id:     "logo",
      label:  "Upload your brand logo",
      done:   !!(bizProfile?.logo_url),
      link:   "/profile",
      points: 20,
      icon:   ImageIcon,
    },
    {
      id:     "description",
      label:  "Write company description",
      done:   !!(bizProfile?.description && (bizProfile.description as string).length > 20),
      link:   "/profile",
      points: 20,
      icon:   Star,
    },
    {
      id:     "industry",
      label:  "Set industry & category",
      done:   !!(bizProfile?.industry),
      link:   "/profile",
      points: 15,
      icon:   Target,
    },
    {
      id:     "website",
      label:  "Add website URL",
      done:   !!(bizProfile?.website_url),
      link:   "/profile",
      points: 15,
      icon:   Globe,
    },
    {
      id:     "campaign",
      label:  "Create your first campaign",
      done:   !!(bizProfile?.has_campaigns),
      link:   "/campaign-create",
      points: 20,
      icon:   Zap,
    },
    {
      id:     "social",
      label:  "Add social media links",
      done:   !!(bizProfile?.instagram_handle || bizProfile?.tiktok_handle),
      link:   "/profile",
      points: 10,
      icon:   Users,
    },
  ];

  const earned = items.filter((i) => i.done).reduce((sum, i) => sum + i.points, 0);
  const total  = items.reduce((sum, i) => sum + i.points, 0);
  const score  = Math.round((earned / total) * 100);

  return { score, items };
}

// ── Circular progress ─────────────────────────────────────────────────────────

function CircularProgress({ score, size = 120 }: { score: number; size?: number }) {
  const r    = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? C.green : score >= 60 ? C.aiBlue : score >= 40 ? C.amber : C.red;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="oklch(1 0 0 / 6%)" strokeWidth={8}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
      </svg>
      <div style={{
        position:       "absolute",
        inset:          0,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
      }}>
        <div style={{ fontSize: size * 0.22, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.03em", lineHeight: 1 }}>
          {score}
        </div>
        <div style={{ fontSize: size * 0.085, color: C.textMuted, marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  );
}

// ── Growth advice card ────────────────────────────────────────────────────────

function buildAIPromptForAdvice(advice: GrowthAdvice): string {
  return `I'm working on: "${advice.title}". ${advice.why} Please help me take action on this right now.`;
}

function AdviceCard({ advice }: { advice: GrowthAdvice }) {
  const navigate = useNavigate();
  const priorityColor = advice.priority === "high" ? C.red : advice.priority === "medium" ? C.amber : C.aiBlue;
  const priorityBg    = advice.priority === "high" ? C.redMuted : advice.priority === "medium" ? C.amberMuted : C.accentMuted;
  const priorityBdr   = advice.priority === "high" ? C.redBorder : advice.priority === "medium" ? C.amberBorder : C.aiBlueBorder;

  function openAIHelp() {
    const prompt = buildAIPromptForAdvice(advice);
    localStorage.setItem("mrkt_prefill_prompt", prompt);
    navigate({ to: "/chat" });
  }

  return (
    <div style={{
      padding:      "13px 16px",
      background:   C.surface,
      border:       `1px solid ${C.borderSubtle}`,
      borderRadius: 16,
      transition:   "all 130ms ease",
    }}
    onMouseEnter={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.background  = "oklch(0.12 0 0)";
      el.style.borderColor = C.borderNormal;
    }}
    onMouseLeave={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.background  = C.surface;
      el.style.borderColor = C.borderSubtle;
    }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{advice.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.015em" }}>
              {advice.title}
            </div>
            <span style={{
              fontSize:      9.5,
              fontWeight:    700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color:         priorityColor,
              background:    priorityBg,
              border:        `1px solid ${priorityBdr}`,
              borderRadius:  6,
              padding:       "2px 7px",
              flexShrink:    0,
            }}>
              {advice.priority}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: C.textTertiary, lineHeight: 1.55, marginBottom: 10 }}>
            {advice.why}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link
              to={advice.link as "/"}
              style={{
                display:     "inline-flex",
                alignItems:  "center",
                gap:         6,
                fontSize:    12.5,
                fontWeight:  600,
                color:       C.aiBlue,
                textDecoration: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(0.80 0.10 224)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.aiBlue; }}
            >
              {advice.action} <ChevronRight size={12} />
            </Link>
            <button
              onClick={openAIHelp}
              style={{
                display:     "inline-flex",
                alignItems:  "center",
                gap:         5,
                fontSize:    11.5,
                fontWeight:  600,
                color:       C.textMuted,
                background:  C.accentMuted,
                border:      `1px solid ${C.aiBlueBorder}`,
                borderRadius: 8,
                padding:     "3px 9px",
                cursor:      "pointer",
                transition:  "all 120ms ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.color   = C.aiBlue;
                el.style.background = "oklch(0.72 0.10 224 / 20%)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.color   = C.textMuted;
                el.style.background = C.accentMuted;
              }}
            >
              <Sparkles size={10} style={{ color: C.aiBlue }} />
              Ask AI to help
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ stat }: { stat: GrowthStat }) {
  return (
    <Link
      to={stat.link as "/"}
      style={{
        display:        "flex",
        flexDirection:  "column",
        padding:        "13px 15px",
        background:     C.surface,
        border:         `1px solid ${C.borderSubtle}`,
        borderRadius:   16,
        textDecoration: "none",
        transition:     "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = "oklch(0.12 0 0)";
        el.style.borderColor = C.borderNormal;
        el.style.transform   = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background  = C.surface;
        el.style.borderColor = C.borderSubtle;
        el.style.transform   = "";
      }}
    >
      <div style={{
        width:          28,
        height:         28,
        borderRadius:   8,
        background:     `${stat.color.replace(")", " / 12%)")}`,
        border:         `1px solid ${stat.color.replace(")", " / 20%)")}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        marginBottom:   9,
        flexShrink:     0,
      }}>
        <stat.icon size={13} style={{ color: stat.color }} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: C.textPrimary, letterSpacing: "-0.04em", lineHeight: 1 }}>
          {stat.value}
        </span>
        {stat.trend && (
          <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>{stat.trend}</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginTop: 3 }}>{stat.label}</div>
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>{stat.sub}</div>
    </Link>
  );
}

// ── Creator Growth ────────────────────────────────────────────────────────────

function CreatorGrowth() {
  const { user } = useAuth();
  const [profile,        setProfile]        = useState<Record<string, unknown> | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<Record<string, unknown> | null>(null);
  const [advice,         setAdvice]         = useState<GrowthAdvice[]>([]);
  const [loadingAdvice,  setLoadingAdvice]  = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [stats,          setStats]          = useState({
    visibilityScore: 0,
    applications: 0,
    profileViews: 0,
    savedByBrands: 0,
  });

  useEffect(() => {
    if (!user) return;
    // profile_views and savedByBrands both key off the creator_profiles row
    // id (not the auth user id) — resolve it first, matching the pattern
    // used on the home dashboard.
    Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("creator_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("campaign_applications").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]).then(async ([p, cp, apps]) => {
      setProfile(p.data as Record<string, unknown>);
      setCreatorProfile(cp.data as Record<string, unknown>);

      const creatorProfileId = (cp.data as { id: string } | null)?.id ?? null;
      const [viewsRes, savedRes] = await Promise.all([
        creatorProfileId
          ? supabase.from("creator_analytics_events")
              .select("id", { count: "exact", head: true })
              .eq("creator_profile_id", creatorProfileId)
              .eq("event_type", "profile_viewed")
          : Promise.resolve({ count: 0 }),
        creatorProfileId
          ? supabase.from("project_saved_creators")
              .select("id", { count: "exact", head: true })
              .eq("creator_profile_id", creatorProfileId)
          : Promise.resolve({ count: 0 }),
      ]);

      setStats({
        visibilityScore: cp.data ? computeVisibilityScore(cp.data as unknown as CreatorProfile).score : 0,
        applications: apps.count ?? 0,
        profileViews: viewsRes.count ?? 0,
        savedByBrands: savedRes.count ?? 0,
      });
      setLoading(false);
    });
  }, [user]);

  const generateAdvice = useCallback(async () => {
    setLoadingAdvice(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/growth-advice`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          role:     "creator",
          profile:  creatorProfile,
          stats,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAdvice(data.advice ?? []);
      } else {
        throw new Error("Failed");
      }
    } catch {
      // Fallback advice
      const completion = buildCreatorCompletion(profile, creatorProfile);
      const incomplete = completion.items.filter((i) => !i.done);
      const fallback: GrowthAdvice[] = [];

      if (incomplete.length > 0) {
        fallback.push({
          title:    `Complete your profile (${completion.score}% done)`,
          why:      "Brands are 4× more likely to shortlist creators with complete profiles. Every missing field is a missed opportunity.",
          action:   "Complete profile",
          link:     "/profile",
          priority: "high",
          emoji:    "📋",
        });
      }
      if (stats.applications < 3) {
        fallback.push({
          title:    "Apply to more campaigns",
          why:      "Creators who apply to 5+ campaigns per week see 3× more brand deals. The algorithm rewards active creators.",
          action:   "Browse opportunities",
          link:     "/opportunities",
          priority: "high",
          emoji:    "⚡",
        });
      }
      if (stats.visibilityScore < 60) {
        fallback.push({
          title:    "Boost your visibility score",
          why:      `Your score is ${stats.visibilityScore}/100. Scores above 70 put you in the top tier shown to businesses first.`,
          action:   "View analytics",
          link:     "/analytics",
          priority: "medium",
          emoji:    "📈",
        });
      }
      fallback.push({
        title:    "Schedule content this week",
        why:      "Consistent posting shows brands you're an active creator. The MRKT Calendar makes it easy.",
        action:   "Open Calendar",
        link:     "/content-planner",
        priority: "medium",
        emoji:    "📅",
      });
      fallback.push({
        title:    "Get AI coaching",
        why:      "The AI Strategist can generate hooks, captions, and a full growth plan tailored to your niche.",
        action:   "Ask AI Strategist",
        link:     "/chat",
        priority: "low",
        emoji:    "✨",
      });
      setAdvice(fallback);
    }
    setLoadingAdvice(false);
  }, [profile, creatorProfile, stats]);

  useEffect(() => {
    if (!loading) generateAdvice();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const completion = buildCreatorCompletion(profile, creatorProfile);
  const scoreColor = stats.visibilityScore >= 80 ? C.green : stats.visibilityScore >= 60 ? C.aiBlue : stats.visibilityScore >= 40 ? C.amber : C.red;

  const growthStats: GrowthStat[] = [
    { label: "Visibility Score",  value: String(stats.visibilityScore), sub: "Platform reach",     color: scoreColor,  icon: TrendingUp,   link: "/analytics" },
    { label: "Applications",      value: String(stats.applications),    sub: "Total submitted",   color: C.aiBlue,    icon: Zap,          link: "/applications" },
    { label: "Saved by brands",   value: String(stats.savedByBrands),   sub: "On their shortlist", color: C.amber,     icon: Star,         link: "/analytics" },
    { label: "Profile views",     value: String(stats.profileViews),    sub: "Last 30 days",      color: C.green,     icon: BarChart2,    link: "/analytics" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <Loader2 size={24} style={{ color: C.aiBlue, animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div>
      {/* ── Profile completion ─────────────────────────────────────────── */}
      <div className="growth-compl-card" style={{
        padding:      "16px 20px",
        background:   C.surface,
        border:       `1px solid ${C.borderSubtle}`,
        borderRadius: 22,
        marginBottom: 14,
      }}>
        <CircularProgress score={completion.score} size={84} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em", marginBottom: 4 }}>
            Profile completion
          </div>
          <div style={{ fontSize: 12.5, color: C.textTertiary, marginBottom: 10, lineHeight: 1.5 }}>
            {completion.score >= 90
              ? "Your profile is nearly perfect. Brands love what they see."
              : completion.score >= 70
              ? "Great progress! A few more details will make you stand out."
              : "Complete your profile to unlock more brand opportunities."}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {completion.items.filter((i) => !i.done).slice(0, 3).map((item) => (
              <Link
                key={item.id}
                to={item.link as "/"}
                style={{
                  display:        "flex",
                  alignItems:     "center",
                  gap:            10,
                  padding:        "8px 12px",
                  background:     C.raised,
                  border:         `1px solid ${C.borderFaint}`,
                  borderRadius:   10,
                  textDecoration: "none",
                  transition:     "all 130ms ease",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background  = C.high;
                  el.style.borderColor = C.borderSubtle;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background  = C.raised;
                  el.style.borderColor = C.borderFaint;
                }}
              >
                <Circle size={13} style={{ color: C.textMuted, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: C.textSecondary, flex: 1 }}>{item.label}</span>
                <span style={{
                  fontSize:    10.5,
                  fontWeight:  600,
                  color:       C.aiBlue,
                  background:  C.accentMuted,
                  borderRadius: 6,
                  padding:     "2px 7px",
                }}>
                  +{item.points}pts
                </span>
                <ChevronRight size={12} style={{ color: C.textMuted }} />
              </Link>
            ))}
            {completion.items.every((i) => i.done) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.green }}>
                <CheckCircle2 size={14} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Profile complete — you're fully discoverable</span>
              </div>
            )}
          </div>
        </div>

        {/* Completed items */}
        <div className="growth-compl-completed">
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>
            Completed
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {completion.items.filter((i) => i.done).map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <CheckCircle2 size={12} style={{ color: C.green, flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, color: C.textTertiary }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Growth stats ────────────────────────────────────────────────── */}
      <div className="growth-stats-grid">
        {growthStats.map((stat) => <StatChip key={stat.label} stat={stat} />)}
      </div>

      {/* ── AI Growth Plan ──────────────────────────────────────────────── */}
      <div style={{
        padding:      "16px 18px",
        background:   C.surface,
        border:       `1px solid ${C.borderSubtle}`,
        borderRadius: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Sparkles size={14} style={{ color: C.aiBlue }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em" }}>
                Your AI Growth Plan
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.textTertiary }}>
              Personalized to your profile and current momentum.
            </div>
          </div>
          <button
            onClick={generateAdvice}
            disabled={loadingAdvice}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        7,
              padding:    "8px 14px",
              background: C.raised,
              border:     `1px solid ${C.borderSubtle}`,
              borderRadius: 10,
              fontSize:   12,
              color:      C.textTertiary,
              cursor:     loadingAdvice ? "wait" : "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.high; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.raised; }}
          >
            <RefreshCw size={12} style={{ animation: loadingAdvice ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>

        {loadingAdvice ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{
                height:       60,
                borderRadius: 14,
                background:   C.raised,
                animation:    "pulse 1.6s ease-in-out infinite",
                opacity:      1 - i * 0.07,
              }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {advice.map((a, i) => <AdviceCard key={i} advice={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Business Growth ───────────────────────────────────────────────────────────

function BusinessGrowth() {
  const { user } = useAuth();
  const [bizProfile, setBizProfile] = useState<Record<string, unknown> | null>(null);
  const [advice,        setAdvice]       = useState<GrowthAdvice[]>([]);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [loading,       setLoading]      = useState(true);
  const [stats,         setStats]        = useState({
    activeCampaigns: 0,
    totalApplicants: 0,
    acceptedCreators: 0,
    pipelineTotal: 0,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: myCampaigns } = await supabase.from("campaigns").select("id").eq("user_id", user.id);
      const campaignIds = (myCampaigns ?? []).map((c) => c.id);

      const [bp, campaigns, apps] = await Promise.all([
        supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
        campaignIds.length > 0
          ? supabase.from("campaign_applications").select("id", { count: "exact", head: true }).in("campaign_id", campaignIds)
          : Promise.resolve({ count: 0 }),
      ]);
      setBizProfile({ ...((bp.data as Record<string, unknown>) ?? {}), has_campaigns: (campaigns.count ?? 0) > 0 });
      setStats({
        activeCampaigns:  campaigns.count ?? 0,
        totalApplicants:  apps.count ?? 0,
        acceptedCreators: 0,
        pipelineTotal:    apps.count ?? 0,
      });
      setLoading(false);
    })();
  }, [user]);

  const generateAdvice = useCallback(async () => {
    setLoadingAdvice(true);
    // Fallback advice always
    const completion = buildBusinessCompletion(bizProfile);
    const fallback: GrowthAdvice[] = [];

    if (completion.score < 80) {
      fallback.push({
        title:    `Complete your brand profile (${completion.score}% done)`,
        why:      "Creators evaluate brands before applying. A complete profile gets 5× more quality applications.",
        action:   "Complete profile",
        link:     "/profile",
        priority: "high",
        emoji:    "🏢",
      });
    }
    if (stats.activeCampaigns === 0) {
      fallback.push({
        title:    "Launch your first campaign",
        why:      "Campaigns are how creators find you on MRKT. The more specific your brief, the better the match quality.",
        action:   "Create campaign",
        link:     "/campaign-create",
        priority: "high",
        emoji:    "🚀",
      });
    } else {
      fallback.push({
        title:    "Review your pipeline",
        why:      `You have ${stats.totalApplicants} creator applications. The faster you respond, the better your brand reputation on MRKT.`,
        action:   "Open Pipeline",
        link:     "/pipeline",
        priority: stats.totalApplicants > 0 ? "high" : "medium",
        emoji:    "⚡",
      });
    }
    fallback.push({
      title:    "Discover creators with the AI Matcher",
      why:      "Find creators by niche, location, audience size, and engagement — scored for compatibility with your brand.",
      action:   "Find creators",
      link:     "/find-creators",
      priority: "medium",
      emoji:    "🔍",
    });
    fallback.push({
      title:    "Plan your campaign calendar",
      why:      "Align your campaigns to MENA events (Ramadan, Eid, national days) for maximum engagement and ROI.",
      action:   "Open Calendar",
      link:     "/content-planner",
      priority: "medium",
      emoji:    "📅",
    });
    fallback.push({
      title:    "Use the AI Strategist to craft briefs",
      why:      "Well-written campaign briefs attract better creators. The AI Strategist can generate your complete brief in seconds.",
      action:   "Ask AI Strategist",
      link:     "/chat",
      priority: "low",
      emoji:    "✨",
    });
    setAdvice(fallback);
    setLoadingAdvice(false);
  }, [bizProfile, stats]);

  useEffect(() => {
    if (!loading) generateAdvice();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const completion = buildBusinessCompletion(bizProfile);

  const growthStats: GrowthStat[] = [
    { label: "Active campaigns",    value: String(stats.activeCampaigns),  sub: "Currently live",        color: C.aiBlue, icon: Zap,          link: "/campaigns" },
    { label: "Total applicants",    value: String(stats.totalApplicants),  sub: "Creators who applied",  color: C.green,  icon: Users,        link: "/pipeline" },
    { label: "Profile completion",  value: `${completion.score}%`,        sub: "Brand discoverability",  color: completion.score >= 70 ? C.green : C.amber, icon: Award,    link: "/profile" },
    { label: "Pipeline health",     value: stats.pipelineTotal > 0 ? "Active" : "Empty",   sub: stats.pipelineTotal > 0 ? `${stats.pipelineTotal} creators tracked` : "Launch a campaign", color: stats.pipelineTotal > 0 ? C.green : C.red, icon: TrendingUp, link: "/pipeline" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <Loader2 size={24} style={{ color: C.aiBlue, animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div>
      {/* Profile completion */}
      <div className="growth-compl-card" style={{
        padding:      "16px 20px",
        background:   C.surface,
        border:       `1px solid ${C.borderSubtle}`,
        borderRadius: 22,
        marginBottom: 14,
      }}>
        <CircularProgress score={completion.score} size={80} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em", marginBottom: 4 }}>
            Brand profile completion
          </div>
          <div style={{ fontSize: 12.5, color: C.textTertiary, marginBottom: 10, lineHeight: 1.5 }}>
            {completion.score >= 80
              ? "Your brand profile is strong. Creators can find everything they need."
              : "Complete your profile to attract higher-quality creator applications."}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {completion.items.filter((i) => !i.done).slice(0, 3).map((item) => (
              <Link
                key={item.id}
                to={item.link as "/"}
                style={{
                  display:        "inline-flex",
                  alignItems:     "center",
                  gap:            6,
                  padding:        "7px 12px",
                  background:     C.raised,
                  border:         `1px solid ${C.borderFaint}`,
                  borderRadius:   9,
                  fontSize:       12,
                  color:          C.textSecondary,
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.high; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.raised; }}
              >
                <Circle size={11} style={{ color: C.textMuted }} />
                {item.label}
                <span style={{ color: C.aiBlue, fontSize: 11, fontWeight: 600 }}>+{item.points}pts</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="growth-stats-grid">
        {growthStats.map((stat) => <StatChip key={stat.label} stat={stat} />)}
      </div>

      {/* AI Growth Plan */}
      <div style={{
        padding:      "16px 18px",
        background:   C.surface,
        border:       `1px solid ${C.borderSubtle}`,
        borderRadius: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Sparkles size={14} style={{ color: C.aiBlue }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em" }}>
            Brand Growth Plan
          </span>
        </div>
        <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 12 }}>
          Prioritized actions to maximize your campaign ROI and creator quality.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {advice.map((a, i) => <AdviceCard key={i} advice={a} />)}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function GrowthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<"creator" | "business" | null>(null);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("name, account_type, onboarding_path")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setDisplayName(data.name ?? user.email?.split("@")[0] ?? "");
        const isBiz = data.account_type === "brand" || data.account_type === "business"
          || data.onboarding_path === "business_creator" || data.onboarding_path === "business_marketing";
        setAccountType(isBiz ? "business" : "creator");
      });
  }, [user]);

  // Business accounts landing on this legacy page get the real, richer
  // Growth section inside the Marketing Hub instead — same "redirect a
  // business-scoped page into the Hub" pattern already used for
  // create.tsx -> /marketing-hub/content. This page's business branch (below)
  // is unreachable from the business sidebar already; this just closes the
  // remaining direct-URL path. Creators are completely unaffected — no
  // redirect fires for them, /growth renders exactly as before.
  useEffect(() => {
    if (accountType === "business") navigate({ to: "/marketing-hub/growth" });
  }, [accountType, navigate]);

  return (
    <div style={{ background: C.canvas }}>
      <div className="growth-page-inner">

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{
              width:          34,
              height:         34,
              borderRadius:   10,
              background:     C.greenMuted,
              border:         `1px solid ${C.greenBorder}`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
            }}>
              <TrendingUp size={17} style={{ color: C.green }} />
            </div>
            <h1 style={{
              fontSize:      "clamp(1.8rem, 2.5vw, 2.25rem)",
              fontWeight:    700,
              color:         C.textPrimary,
              letterSpacing: "-0.04em",
              lineHeight:    1.05,
              margin:        0,
              fontFamily:    "'Inter Tight', 'Inter', sans-serif",
            }}>
              Growth Hub
            </h1>
          </div>
          <p style={{ fontSize: 14, color: C.textTertiary, margin: 0 }}>
            {accountType === "business"
              ? "Track campaign health, discover creator insights, and get AI-powered brand growth recommendations."
              : "Track your creator journey, complete your profile, and get AI-powered growth strategies."}
          </p>
        </div>

        {/* Role-aware content */}
        {accountType === "creator" && <CreatorGrowth />}
        {accountType === "business" && <BusinessGrowth />}
        {!accountType && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40vh" }}>
            <Loader2 size={24} style={{ color: C.aiBlue, animation: "spin 1s linear infinite" }} />
          </div>
        )}

      </div>
    </div>
  );
}
