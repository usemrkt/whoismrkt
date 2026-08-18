// ─────────────────────────────────────────────────────────────────────────────
// /brand-knowledge — Brand Knowledge Base
// Business only. Stores brand identity, voice, audience, goals, and guidelines.
// Everything entered here is injected into the AI system prompt automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Brain, Building2, Mic2, Package, Users, TrendingUp,
  Layers, Target, BookOpen, Link2, Plus, Trash2,
  CheckCircle2, Loader2, Sparkles, ExternalLink,
  DollarSign, Wallet, AlertCircle, Rocket, Share2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/brand-knowledge")({
  head: () => ({ meta: [{ title: "Brand Knowledge — MRKT" }] }),
  component: BrandKnowledgePage,
});

// ── Design tokens (matches platform-wide dark theme) ──────────────────────────

import { C } from "@/lib/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandLink {
  label: string;
  url: string;
}

interface KnowledgeData {
  brand_description: string;
  brand_voice: string;
  products: string;
  services: string;
  target_audience: string;
  competitors: string;
  content_pillars: string;
  marketing_goals: string;
  brand_guidelines: string;
  // Marketing Hub fields — feed the Marketing Hub's business-health/opportunity
  // briefing and, like every other field on this page, are injected straight
  // into the AI Strategist's system prompt automatically.
  revenue_range: string;
  marketing_budget_range: string;
  current_marketing_challenges: string;
  preferred_growth_channels: string;
  current_social_channels: string;
  links: BrandLink[];
}

const EMPTY: KnowledgeData = {
  brand_description: "",
  brand_voice:       "",
  products:          "",
  services:          "",
  target_audience:   "",
  competitors:       "",
  content_pillars:   "",
  marketing_goals:   "",
  brand_guidelines:  "",
  revenue_range:                 "",
  marketing_budget_range:        "",
  current_marketing_challenges:  "",
  preferred_growth_channels:     "",
  current_social_channels:       "",
  links:             [],
};

// ── Section config ────────────────────────────────────────────────────────────

type TextSection = {
  type: "text";
  field: keyof Omit<KnowledgeData, "links">;
  label: string;
  icon: React.ElementType;
  hint: string;
  placeholder: string;
  rows: number;
};

const SECTIONS: TextSection[] = [
  {
    type:        "text",
    field:       "brand_description",
    label:       "Brand Description",
    icon:        Building2,
    hint:        "Who you are, what you do, and what makes you different. The AI uses this as your brand's core identity.",
    placeholder: "e.g. We make premium skincare for women aged 25–40 who want clean, science-backed ingredients without the luxury markup. Founded in 2021, DTC-first, growing fast.",
    rows:        4,
  },
  {
    type:        "text",
    field:       "brand_voice",
    label:       "Brand Voice",
    icon:        Mic2,
    hint:        "How your brand sounds. Tone, personality, words you use and avoid. The AI will match this in every output.",
    placeholder: "e.g. Bold but approachable. Direct, never corporate. Short sentences. We say 'real' not 'authentic'. We avoid clinical language. Think: honest friend who knows skincare.",
    rows:        3,
  },
  {
    type:        "text",
    field:       "products",
    label:       "Products",
    icon:        Package,
    hint:        "Your product lineup. The AI uses this to write targeted briefs, captions, and campaign concepts.",
    placeholder: "e.g. Clarity Serum (hero product, $48), Barrier Moisturiser ($38), SPF30 Tinted ($42). All free from parabens, sulphates, and synthetic fragrance.",
    rows:        3,
  },
  {
    type:        "text",
    field:       "services",
    label:       "Services",
    icon:        Sparkles,
    hint:        "If you offer services alongside or instead of products — describe them here.",
    placeholder: "e.g. Custom skincare consultation (virtual, $75). Subscription box (monthly, $55). Wholesale for spas and clinics.",
    rows:        3,
  },
  {
    type:        "text",
    field:       "target_audience",
    label:       "Target Audience",
    icon:        Users,
    hint:        "Who you're trying to reach. Demographics, psychographics, behaviours. The AI uses this to find the right creators and write the right messages.",
    placeholder: "e.g. Women 25–40, urban professionals, health-conscious, disposable income. Interested in wellness, clean beauty, sustainability. Follow skincare creators on TikTok and Instagram.",
    rows:        3,
  },
  {
    type:        "text",
    field:       "competitors",
    label:       "Competitors",
    icon:        TrendingUp,
    hint:        "Your key competitors. The AI uses this to help you differentiate and identify white space.",
    placeholder: "e.g. Drunk Elephant, The Ordinary, Paula's Choice, Krave Beauty. We position above The Ordinary (more premium) and below Drunk Elephant (more accessible).",
    rows:        2,
  },
  {
    type:        "text",
    field:       "content_pillars",
    label:       "Content Pillars",
    icon:        Layers,
    hint:        "The recurring themes your content lives in. The AI uses these to generate on-brand ideas and calendars.",
    placeholder: "e.g. 1. Ingredient education (what's in it, why it matters) 2. Before/after results 3. Routine building 4. Behind-the-brand 5. Sustainability & sourcing",
    rows:        3,
  },
  {
    type:        "text",
    field:       "marketing_goals",
    label:       "Marketing Goals",
    icon:        Target,
    hint:        "What you're trying to achieve this quarter or year. The AI uses this to prioritise advice and strategy.",
    placeholder: "e.g. Q3: grow Instagram from 18K to 30K, launch TikTok presence, run 3 creator campaigns, drive 20% revenue growth. Primary KPIs: ROAS, email subscribers, repeat purchase rate.",
    rows:        3,
  },
  {
    type:        "text",
    field:       "brand_guidelines",
    label:       "Brand Guidelines",
    icon:        BookOpen,
    hint:        "Visual and verbal rules. What to do, what to never do. The AI will respect these in every brief and output.",
    placeholder: "e.g. Colours: sage green (#8FAF8F) and off-white (#F7F4EF). Never use red or loud graphics. Fonts: Neue Haas Grotesk only. No filter presets — real skin always. UGC must show product in use, not just on shelf.",
    rows:        3,
  },
  // ── Marketing Hub additions ──────────────────────────────────────────────
  {
    type:        "text",
    field:       "revenue_range",
    label:       "Revenue Range",
    icon:        DollarSign,
    hint:        "Roughly what the business does in revenue. Helps the AI size recommendations appropriately — a $10K/mo shop and a $10M/yr brand need different advice.",
    placeholder: "e.g. $50K–$100K/month, growing ~15% quarter over quarter.",
    rows:        1,
  },
  {
    type:        "text",
    field:       "marketing_budget_range",
    label:       "Marketing Budget",
    icon:        Wallet,
    hint:        "Total marketing spend across all channels — not just creator budget (that's set separately in onboarding). The AI uses this for realistic budget-allocation advice.",
    placeholder: "e.g. ~$8K/month total: $3K paid social, $2K influencer/creator, $2K content production, $1K tools.",
    rows:        2,
  },
  {
    type:        "text",
    field:       "current_marketing_challenges",
    label:       "Current Challenges",
    icon:        AlertCircle,
    hint:        "What's actually not working right now. The AI prioritises the Marketing Hub's weekly priorities around these.",
    placeholder: "e.g. Instagram growth has plateaued at 22K for 3 months. Paid ads CAC is up 40% this quarter. Struggling to find creators who match our aesthetic.",
    rows:        2,
  },
  {
    type:        "text",
    field:       "preferred_growth_channels",
    label:       "Growth Channels",
    icon:        Rocket,
    hint:        "Which channels you want to invest in or grow. The AI weighs opportunities toward these.",
    placeholder: "e.g. Prioritising: Instagram Reels, creator partnerships, email. Not interested in: TikTok ads, print, events.",
    rows:        2,
  },
  {
    type:        "text",
    field:       "current_social_channels",
    label:       "Social Channels",
    icon:        Share2,
    hint:        "Your live handles, so the AI can reference your actual presence instead of asking for it.",
    placeholder: "e.g. Instagram @brand (24K), TikTok @brand (8K), YouTube /brand (2K subs).",
    rows:        2,
  },
];

// ── Save status badge ─────────────────────────────────────────────────────────

type SaveStatus = "saved" | "saving" | "unsaved";

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return (
      <div className="flex items-center gap-1.5" style={{ color: C.textTertiary, fontSize: 13 }}>
        <Loader2 size={13} className="animate-spin" />
        <span>Saving…</span>
      </div>
    );
  }
  if (status === "saved") {
    return (
      <div className="flex items-center gap-1.5" style={{ color: C.accent, fontSize: 13 }}>
        <CheckCircle2 size={13} />
        <span>Saved</span>
      </div>
    );
  }
  return (
    <div style={{ color: C.textMuted, fontSize: 13 }}>Unsaved changes</div>
  );
}

// ── Knowledge section card ────────────────────────────────────────────────────

function SectionCard({
  section,
  value,
  onChange,
}: {
  section: TextSection;
  value: string;
  onChange: (field: keyof Omit<KnowledgeData, "links">, val: string) => void;
}) {
  const Icon = section.icon;
  const filled = value.trim().length > 0;

  return (
    <div
      style={{
        background:   C.surface,
        border:       `1px solid ${filled ? C.accentBorder : C.borderSubtle}`,
        borderRadius: 16,
        boxShadow:    C.shadowCard,
        overflow:     "hidden",
        transition:   "border-color 200ms ease",
      }}
    >
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${C.borderSubtle}` }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width:        32,
            height:       32,
            borderRadius: 8,
            background:   filled ? C.accentMuted : "oklch(1 0 0 / 6%)",
            color:        filled ? C.accent : C.textTertiary,
            transition:   "background 200ms ease, color 200ms ease",
          }}
        >
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.01em" }}>
            {section.label}
          </div>
          <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 1, lineHeight: 1.4 }}>
            {section.hint}
          </div>
        </div>
        {filled && (
          <div
            style={{
              fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
              color: C.accent, background: C.accentMuted,
              border: `1px solid ${C.accentBorder}`,
              borderRadius: 6, padding: "2px 8px",
              textTransform: "uppercase",
            }}
          >
            Saved
          </div>
        )}
      </div>

      {/* Textarea */}
      <div className="px-5 py-4">
        <textarea
          value={value}
          onChange={(e) => onChange(section.field, e.target.value)}
          placeholder={section.placeholder}
          rows={section.rows}
          style={{
            width:       "100%",
            background:  "transparent",
            border:      "none",
            outline:     "none",
            resize:      "vertical",
            fontSize:    14,
            lineHeight:  1.6,
            color:       C.textPrimary,
            fontFamily:  "inherit",
          }}
        />
      </div>
    </div>
  );
}

// ── Links card ────────────────────────────────────────────────────────────────

function LinksCard({
  links,
  onChange,
}: {
  links: BrandLink[];
  onChange: (links: BrandLink[]) => void;
}) {
  function add() {
    onChange([...links, { label: "", url: "" }]);
  }
  function remove(i: number) {
    onChange(links.filter((_, idx) => idx !== i));
  }
  function update(i: number, field: keyof BrandLink, val: string) {
    const next = links.map((l, idx) => idx === i ? { ...l, [field]: val } : l);
    onChange(next);
  }

  return (
    <div
      style={{
        background:   C.surface,
        border:       `1px solid ${links.length > 0 ? C.accentBorder : C.borderSubtle}`,
        borderRadius: 16,
        boxShadow:    C.shadowCard,
        overflow:     "hidden",
        transition:   "border-color 200ms ease",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: `1px solid ${C.borderSubtle}` }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: links.length > 0 ? C.accentMuted : "oklch(1 0 0 / 6%)",
            color: links.length > 0 ? C.accent : C.textTertiary,
            transition: "background 200ms ease, color 200ms ease",
          }}
        >
          <Link2 size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.01em" }}>
            Links
          </div>
          <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 1 }}>
            Website, social profiles, press mentions. The AI can reference these when relevant.
          </div>
        </div>
      </div>

      {/* Link rows */}
      <div className="px-5 py-4 space-y-3">
        {links.length === 0 && (
          <div style={{ fontSize: 13, color: C.textMuted, textAlign: "center", padding: "12px 0" }}>
            No links added yet
          </div>
        )}
        {links.map((link, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={link.label}
              onChange={(e) => update(i, "label", e.target.value)}
              placeholder="Label (e.g. Website)"
              style={{
                flex:        "0 0 140px",
                background:  C.raised,
                border:      `1px solid ${C.borderNormal}`,
                borderRadius: 8,
                padding:     "8px 12px",
                fontSize:    13,
                color:       C.textPrimary,
                outline:     "none",
                fontFamily:  "inherit",
              }}
            />
            <input
              value={link.url}
              onChange={(e) => update(i, "url", e.target.value)}
              placeholder="https://..."
              style={{
                flex:        "1 1 0",
                background:  C.raised,
                border:      `1px solid ${C.borderNormal}`,
                borderRadius: 8,
                padding:     "8px 12px",
                fontSize:    13,
                color:       C.textPrimary,
                outline:     "none",
                fontFamily:  "inherit",
              }}
            />
            {link.url && (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.textTertiary, display: "flex", alignItems: "center", flexShrink: 0 }}
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button
              onClick={() => remove(i)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: C.textMuted, display: "flex", alignItems: "center",
                padding: 4, borderRadius: 6, flexShrink: 0,
              }}
              className="btn-interactive"
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(0.52 0.15 24)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.textMuted; }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button
          onClick={add}
          className="flex items-center gap-2 btn-interactive"
          style={{
            background:   "none",
            border:       `1px dashed ${C.borderNormal}`,
            borderRadius: 8,
            padding:      "8px 14px",
            cursor:       "pointer",
            color:        C.textTertiary,
            fontSize:     13,
            width:        "100%",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = C.accentBorder;
            (e.currentTarget as HTMLElement).style.color = C.accent;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = C.borderNormal;
            (e.currentTarget as HTMLElement).style.color = C.textTertiary;
          }}
        >
          <Plus size={14} />
          Add link
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function BrandKnowledgePage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [data, setData]    = useState<KnowledgeData>(EMPTY);
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef<KnowledgeData>(EMPTY);

  // ── Gate: creators can't access this page ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("account_type, onboarding_path")
        .eq("id", user.id)
        .maybeSingle();
      if (!p) return;
      const isCreator =
        p.account_type === "creator" || p.onboarding_path === "creator";
      if (isCreator) navigate({ to: "/home" });
    })();
  }, [user, navigate]);

  // ── Load existing knowledge ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: row } = await supabase
        .from("brand_knowledge")
        .select("*")
        .eq("business_user_id", user.id)
        .maybeSingle();

      if (row) {
        const loaded: KnowledgeData = {
          brand_description: row.brand_description ?? "",
          brand_voice:       row.brand_voice       ?? "",
          products:          row.products           ?? "",
          services:          row.services           ?? "",
          target_audience:   row.target_audience    ?? "",
          competitors:       row.competitors        ?? "",
          content_pillars:   row.content_pillars    ?? "",
          marketing_goals:   row.marketing_goals    ?? "",
          brand_guidelines:  row.brand_guidelines   ?? "",
          revenue_range:                 row.revenue_range                 ?? "",
          marketing_budget_range:        row.marketing_budget_range        ?? "",
          current_marketing_challenges:  row.current_marketing_challenges  ?? "",
          preferred_growth_channels:     row.preferred_growth_channels     ?? "",
          current_social_channels:       row.current_social_channels       ?? "",
          links:             (row.links as unknown as BrandLink[] | null) ?? [],
        };
        setData(loaded);
        latestData.current = loaded;
      }
      setSaveStatus("saved");
      setLoading(false);
    })();
  }, [user]);

  // ── Auto-save with debounce ──
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("unsaved");
    saveTimer.current = setTimeout(async () => {
      if (!user) return;
      setSaveStatus("saving");
      const d = latestData.current;
      const payload = {
        business_user_id:  user.id,
        brand_description: d.brand_description || null,
        brand_voice:       d.brand_voice       || null,
        products:          d.products           || null,
        services:          d.services           || null,
        target_audience:   d.target_audience    || null,
        competitors:       d.competitors        || null,
        content_pillars:   d.content_pillars    || null,
        marketing_goals:   d.marketing_goals    || null,
        brand_guidelines:  d.brand_guidelines   || null,
        revenue_range:                 d.revenue_range                || null,
        marketing_budget_range:        d.marketing_budget_range       || null,
        current_marketing_challenges:  d.current_marketing_challenges || null,
        preferred_growth_channels:     d.preferred_growth_channels    || null,
        current_social_channels:       d.current_social_channels      || null,
        links:             d.links as unknown as Json,
        updated_at:        new Date().toISOString(),
      };
      const { error } = await supabase
        .from("brand_knowledge")
        .upsert(payload, { onConflict: "business_user_id" });
      if (error) {
        console.error("brand_knowledge save:", error);
        toast.error("Failed to save. Try again.");
        setSaveStatus("unsaved");
      } else {
        setSaveStatus("saved");
      }
    }, 1500);
  }, [user]);

  function handleFieldChange(field: keyof Omit<KnowledgeData, "links">, val: string) {
    const next = { ...latestData.current, [field]: val };
    latestData.current = next;
    setData(next);
    scheduleSave();
  }

  function handleLinksChange(links: BrandLink[]) {
    const next = { ...latestData.current, links };
    latestData.current = next;
    setData(next);
    scheduleSave();
  }

  // ── Completion meter ──
  const filledSections = SECTIONS.filter(s => data[s.field]?.trim()).length
    + (data.links.length > 0 ? 1 : 0);
  const totalSections  = SECTIONS.length + 1; // +1 for links
  const pct            = Math.round((filledSections / totalSections) * 100);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "60vh", color: C.textTertiary }}
      >
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ minHeight: "100vh", background: C.canvas, paddingBottom: 80 }}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20"
        style={{ background: "oklch(0.04 0 0 / 95%)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.borderSubtle}` }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px" }}>
          <div className="flex items-center justify-between" style={{ height: 64 }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center"
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "oklch(1 0 0 / 15%)",
                  color: C.accent,
                }}
              >
                <Brain size={16} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.02em" }}>
                  Brand Knowledge
                </div>
                <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 1 }}>
                  {filledSections} of {totalSections} sections complete · {pct}%
                </div>
              </div>
            </div>
            <SaveStatusBadge status={saveStatus} />
          </div>
        </div>
      </div>

      {/* ── Intro banner ─────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 0" }}>
        <div
          style={{
            background:   "oklch(1 0 0 / 8%)",
            border:       `1px solid oklch(1 0 0 / 20%)`,
            borderRadius: 16,
            padding:      "20px 24px",
            display:      "flex",
            gap:          16,
            alignItems:   "flex-start",
          }}
        >
          <Sparkles size={18} style={{ color: C.accent, flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>
              The more you add, the smarter MRKT gets
            </div>
            <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.6 }}>
              Everything you store here becomes permanent context for every AI interaction —
              campaign briefs, creator searches, content strategies, outreach. You'll never need to
              re-explain your brand. MRKT will already know.
            </div>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ marginTop: 24, marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 8 }}>
            Knowledge base completion
          </div>
          <div style={{ height: 4, borderRadius: 99, background: C.borderSubtle, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: pct === 100
                  ? C.accent
                  : `linear-gradient(90deg, ${C.accent}, oklch(0.72 0.10 224))`,
                borderRadius: 99,
                transition: "width 400ms ease",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Section cards ─────────────────────────────────────────────── */}
      <div
        style={{ maxWidth: 760, margin: "0 auto", padding: "24px 24px 0" }}
        className="space-y-4"
      >
        {SECTIONS.map((section) => (
          <SectionCard
            key={section.field}
            section={section}
            value={data[section.field]}
            onChange={handleFieldChange}
          />
        ))}

        <LinksCard
          links={data.links}
          onChange={handleLinksChange}
        />

        {/* Documents — Phase 3B placeholder */}
        <div
          style={{
            background:   C.surface,
            border:       `1px solid ${C.borderSubtle}`,
            borderRadius: 16,
            boxShadow:    C.shadowCard,
            overflow:     "hidden",
            opacity:      0.6,
          }}
        >
          <div className="flex items-center gap-3 px-5 py-4">
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 32, height: 32, borderRadius: 8, background: "oklch(1 0 0 / 6%)", color: C.textMuted }}
            >
              <BookOpen size={15} />
            </div>
            <div className="flex-1">
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, letterSpacing: "-0.01em" }}>
                Documents
              </div>
              <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 1 }}>
                PDF brand decks, creative briefs, product catalogs
              </div>
            </div>
            <div
              style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
                color: C.textMuted, background: "oklch(1 0 0 / 6%)",
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 6, padding: "2px 8px",
                textTransform: "uppercase",
              }}
            >
              Soon
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
