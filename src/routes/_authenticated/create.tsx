import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/theme";
import {
  Wand2, Image, Video, Sparkles, Download, Copy,
  Loader2, RefreshCw, CheckCircle2, AlertCircle,
  Instagram, Play, Film, Globe, Palette, X,
  ChevronDown, Zap, Star, Layout,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({ meta: [{ title: "Studio — MRKT" }] }),
  component: StudioPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeneratedAsset {
  id:          string;
  prompt:      string;
  asset_type:  "image" | "video";
  aspect_ratio: string;
  status:      "generating" | "completed" | "failed";
  output_url:  string | null;
  created_at:  string;
  provider:    string;
}

interface ConceptSuggestion {
  hook:    string;
  angle:   string;
  format:  string;
  caption: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "instagram_reel",  label: "Instagram Reel",  ratio: "9:16", icon: Instagram,  format: "video" },
  { id: "instagram_post",  label: "Instagram Post",  ratio: "1:1",  icon: Image,      format: "image" },
  { id: "instagram_story", label: "Instagram Story", ratio: "9:16", icon: Instagram,  format: "image" },
  { id: "tiktok",          label: "TikTok",          ratio: "9:16", icon: Play,        format: "video" },
  { id: "youtube_short",   label: "YouTube Short",   ratio: "9:16", icon: Film,        format: "video" },
  { id: "website_banner",  label: "Website Banner",  ratio: "16:9", icon: Globe,       format: "image" },
] as const;

const CREDIT_COST: Record<string, number> = {
  video: 3,
  image: 1,
};

// Must match MONTHLY_CREDIT_LIMIT in supabase/functions/higgsfield-generate/index.ts —
// Studio has its own small monthly quota, separate from the AI Strategist's credit pool.
const MONTHLY_CREDIT_LIMIT = 10;

const CONCEPT_HOOKS = [
  "The one thing most people get wrong about…",
  "Day in the life of a creator in…",
  "Why I stopped doing… (and what I do instead)",
  "The truth about… that no one talks about",
  "Rating products every creator actually uses",
  "Things I wish I knew before starting…",
  "Behind the scenes: how I made…",
  "POV: you're a brand looking for the perfect creator",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlatformSelector({
  selected, onChange,
}: {
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {PLATFORMS.map((p) => {
        const isActive = selected === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            7,
              padding:        "8px 14px",
              borderRadius:   12,
              border:         `1px solid ${isActive ? C.aiBlueBorder : C.borderSubtle}`,
              background:     isActive ? C.accentMuted : "transparent",
              color:          isActive ? C.aiBlue : C.textTertiary,
              fontSize:       12.5,
              fontWeight:     isActive ? 600 : 500,
              cursor:         "pointer",
              transition:     "all 130ms ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background    = "oklch(1 0 0 / 5%)";
                el.style.borderColor   = C.borderNormal;
                el.style.color         = C.textSecondary;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                const el = e.currentTarget as HTMLElement;
                el.style.background  = "transparent";
                el.style.borderColor = C.borderSubtle;
                el.style.color       = C.textTertiary;
              }
            }}
          >
            <p.icon size={13} />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function AssetCard({ asset, onDownload }: { asset: GeneratedAsset; onDownload: (url: string) => void }) {
  const isVideo = asset.asset_type === "video";
  const isPending = asset.status === "generating";
  const isFailed  = asset.status === "failed";

  return (
    <div style={{
      borderRadius: 16,
      overflow:     "hidden",
      background:   C.surface,
      border:       `1px solid ${C.borderSubtle}`,
      position:     "relative",
    }}>
      {/* Media preview */}
      <div style={{
        aspectRatio: asset.aspect_ratio === "9:16" ? "9/16" : asset.aspect_ratio === "1:1" ? "1" : "16/9",
        background:  C.raised,
        display:     "flex",
        alignItems:  "center",
        justifyContent: "center",
        overflow:    "hidden",
        position:    "relative",
      }}>
        {isPending && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Loader2 size={24} style={{ color: C.aiBlue, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 11, color: C.textTertiary }}>Generating…</span>
          </div>
        )}
        {isFailed && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <AlertCircle size={22} style={{ color: C.red }} />
            <span style={{ fontSize: 11, color: C.textTertiary }}>Generation failed</span>
          </div>
        )}
        {asset.status === "completed" && asset.output_url && (
          isVideo ? (
            <video
              src={asset.output_url}
              controls
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <img
              src={asset.output_url}
              alt={asset.prompt}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )
        )}
        {/* Format badge */}
        <div style={{
          position:     "absolute",
          top:          8,
          left:         8,
          background:   "oklch(0 0 0 / 70%)",
          backdropFilter: "blur(8px)",
          borderRadius: 6,
          padding:      "3px 8px",
          fontSize:     10,
          fontWeight:   600,
          color:        "oklch(1 0 0 / 80%)",
          display:      "flex",
          alignItems:   "center",
          gap:          5,
        }}>
          {isVideo ? <Film size={10} /> : <Image size={10} />}
          {asset.aspect_ratio}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{
          fontSize:     11.5,
          color:        C.textTertiary,
          lineHeight:   1.4,
          marginBottom: 10,
          overflow:     "hidden",
          display:      "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {asset.prompt}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {asset.output_url && (
            <button
              onClick={() => onDownload(asset.output_url!)}
              style={{
                flex:           1,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            5,
                padding:        "7px 0",
                background:     C.raised,
                border:         `1px solid ${C.borderSubtle}`,
                borderRadius:   8,
                fontSize:       11.5,
                fontWeight:     500,
                color:          C.textSecondary,
                cursor:         "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.high; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.raised; }}
            >
              <Download size={12} /> Download
            </button>
          )}
          {asset.output_url && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(asset.output_url!);
                toast.success("URL copied");
              }}
              style={{
                width:          36,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                background:     C.raised,
                border:         `1px solid ${C.borderSubtle}`,
                borderRadius:   8,
                cursor:         "pointer",
                color:          C.textTertiary,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.high; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.raised; }}
            >
              <Copy size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConceptCard({ concept, onUse }: { concept: ConceptSuggestion; onUse: (text: string) => void }) {
  return (
    <div style={{
      padding:      "16px 18px",
      background:   C.surface,
      border:       `1px solid ${C.borderSubtle}`,
      borderRadius: 14,
      cursor:       "pointer",
      transition:   "all 130ms ease",
    }}
    onMouseEnter={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.background   = "oklch(0.12 0 0)";
      el.style.borderColor  = C.borderNormal;
    }}
    onMouseLeave={(e) => {
      const el = e.currentTarget as HTMLElement;
      el.style.background   = C.surface;
      el.style.borderColor  = C.borderSubtle;
    }}
    onClick={() => onUse(`${concept.hook}\n\n${concept.angle}`)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, lineHeight: 1.35 }}>
          {concept.hook}
        </div>
        <span style={{
          fontSize:    10,
          fontWeight:  700,
          color:       C.aiBlue,
          background:  C.accentMuted,
          border:      `1px solid ${C.aiBlueBorder}`,
          borderRadius: 6,
          padding:     "2px 7px",
          flexShrink:  0,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          {concept.format}
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.textTertiary, lineHeight: 1.5, marginBottom: 8 }}>
        {concept.angle}
      </div>
      <div style={{
        fontSize:  11.5,
        color:     C.textMuted,
        fontStyle: "italic",
        lineHeight: 1.4,
        paddingTop: 8,
        borderTop: `1px solid ${C.borderFaint}`,
      }}>
        "{concept.caption}"
      </div>
    </div>
  );
}

// ── Brand Kit tab ─────────────────────────────────────────────────────────────

function BrandKitTab() {
  const { user } = useAuth();
  const [colors, setColors] = useState(["#7DB7FF", "#000000", "#FFFFFF"]);
  const [newColor, setNewColor] = useState("#FF6B6B");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isCreator, setIsCreator] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase.from("profiles")
        .select("account_type,onboarding_path")
        .eq("id", user.id)
        .single();
      const creator = profile?.account_type === "creator" || profile?.onboarding_path === "creator";
      setIsCreator(creator);

      if (creator) {
        const { data } = await supabase.from("creator_profiles")
          .select("brand_colors,profile_image_url")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.brand_colors?.length) setColors(data.brand_colors);
        if (data?.profile_image_url) setLogoUrl(data.profile_image_url);
      } else {
        const { data } = await supabase.from("business_profiles")
          .select("brand_colors,logo_url")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.brand_colors?.length) setColors(data.brand_colors);
        if (data?.logo_url) setLogoUrl(data.logo_url);
      }
    })();
  }, [user]);

  async function saveColors() {
    if (!user || isCreator === null) return;
    setSaving(true);
    const { error } = isCreator
      ? await supabase.from("creator_profiles").update({ brand_colors: colors }).eq("user_id", user.id)
      : await supabase.from("business_profiles").update({ brand_colors: colors }).eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save brand colors. Please try again.");
      return;
    }
    toast.success("Brand colors saved");
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Logo */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 14 }}>Brand Logo</div>
        <div style={{
          width:          120,
          height:         120,
          borderRadius:   20,
          background:     C.surface,
          border:         `2px dashed ${C.borderNormal}`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          overflow:       "hidden",
        }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Brand logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div style={{ textAlign: "center" }}>
              <Palette size={24} style={{ color: C.textMuted, display: "block", margin: "0 auto 6px" }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>Upload logo</span>
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 10 }}>
          Upload your logo in profile settings — it will appear here automatically.
        </div>
      </div>

      {/* Brand colors */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 14 }}>Brand Colors</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          {colors.map((color, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width:        52,
                height:       52,
                borderRadius: 12,
                background:   color,
                border:       `1px solid oklch(1 0 0 / 14%)`,
                cursor:       "pointer",
              }} />
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "monospace" }}>{color}</span>
              <button
                onClick={() => setColors(colors.filter((_, j) => j !== i))}
                style={{
                  fontSize: 10, color: C.red, background: "none", border: "none",
                  cursor: "pointer", padding: "2px 6px",
                }}
              >
                Remove
              </button>
            </div>
          ))}

          {/* Add color */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              style={{
                width:        52,
                height:       52,
                borderRadius: 12,
                border:       `1px solid ${C.borderNormal}`,
                cursor:       "pointer",
                background:   "none",
                padding:      0,
              }}
            />
            <button
              onClick={() => {
                if (!colors.includes(newColor)) setColors([...colors, newColor]);
              }}
              style={{
                fontSize: 10, color: C.aiBlue, background: "none", border: "none",
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          </div>
        </div>

        <button
          onClick={saveColors}
          disabled={saving}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            7,
            padding:        "9px 18px",
            background:     C.accentMuted,
            border:         `1px solid ${C.aiBlueBorder}`,
            borderRadius:   10,
            fontSize:       12.5,
            fontWeight:     600,
            color:          C.aiBlue,
            cursor:         saving ? "wait" : "pointer",
            opacity:        saving ? 0.7 : 1,
          }}
        >
          {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={13} />}
          {saving ? "Saving…" : "Save brand colors"}
        </button>
      </div>
    </div>
  );
}

// ── Main Studio page ───────────────────────────────────────────────────────────

// `embedded` is set when this component is rendered inside the Marketing Hub
// (src/routes/_authenticated/marketing-hub.content.tsx) — the Hub's own
// header already shows the section title, so this suppresses the standalone
// "MRKT Studio" H1 block to avoid a redundant double header. Everything else
// (tabs, generation, library, brand kit) is unchanged — this is the same
// component businesses used at /create, just reached through the Hub now.
export function StudioPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab,              setTab]              = useState<"generate" | "library" | "brand">("generate");
  const [selectedPlatform, setSelectedPlatform] = useState("instagram_post");
  const [prompt,           setPrompt]           = useState("");
  const [generating,       setGenerating]       = useState(false);
  const [assets,           setAssets]           = useState<GeneratedAsset[]>([]);
  const [loadingAssets,    setLoadingAssets]    = useState(false);
  const [concepts,         setConcepts]         = useState<ConceptSuggestion[]>([]);
  const [loadingConcepts,  setLoadingConcepts]  = useState(false);
  const [showConcepts,     setShowConcepts]     = useState(false);
  const [usage,            setUsage]            = useState<{ credits_used: number; credits_remaining: number; limit: number } | null>(null);

  // Business accounts now live in the Marketing Hub — /create redirects them
  // there (deep links still work, they just land inside the Hub) rather than
  // showing the standalone page. Creators are untouched: no Marketing Hub
  // exists for them, so no redirect fires. Skipped entirely when already
  // rendered inside the Hub (embedded=true) to avoid a redirect loop.
  useEffect(() => {
    if (embedded || !user) return;
    supabase.from("profiles").select("account_type, onboarding_path").eq("id", user.id).maybeSingle()
      .then(({ data: p }) => {
        const isBusiness = !!p && (p.account_type === "brand" || p.account_type === "business" || p.account_type === "agency"
          || p.onboarding_path === "business_creator" || p.onboarding_path === "business_marketing");
        if (isBusiness) navigate({ to: "/marketing-hub/content" });
      });
  }, [embedded, user, navigate]);

  const platform = PLATFORMS.find((p) => p.id === selectedPlatform)!;

  // Load assets from library
  const loadAssets = useCallback(async () => {
    if (!user) return;
    setLoadingAssets(true);
    const { data } = await supabase
      .from("generated_assets")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setAssets((data ?? []) as GeneratedAsset[]);
    setLoadingAssets(false);
  }, [user]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  // Load Studio credit usage proactively — mirrors the credit check in the
  // higgsfield-generate edge function so the count is visible before the
  // user ever tries to generate anything.
  const loadUsage = useCallback(async () => {
    if (!user) return;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("generated_assets")
      .select("credits_used")
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString());

    const creditsUsed = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_used ?? 1),
      0,
    );
    setUsage({
      credits_used:      creditsUsed,
      credits_remaining: Math.max(0, MONTHLY_CREDIT_LIMIT - creditsUsed),
      limit:              MONTHLY_CREDIT_LIMIT,
    });
  }, [user]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  // Market Intelligence hand-off: "Create Content" on a finding pre-fills the
  // generate prompt here instead of opening blank — same localStorage-draft
  // pattern already used for the AI Strategist / Campaign Center hand-offs
  // (see mrkt_prefill_prompt in chat.tsx, mrkt_campaign_draft in campaign-create.tsx).
  useEffect(() => {
    const raw = localStorage.getItem("mrkt_content_prefill");
    if (!raw) return;
    localStorage.removeItem("mrkt_content_prefill");
    setPrompt(raw);
    setTab("generate");
  }, []);

  // Poll for generating assets
  useEffect(() => {
    const pending = assets.filter((a) => a.status === "generating");
    if (pending.length === 0) return;
    const interval = setInterval(async () => {
      for (const asset of pending) {
        const { data: updated } = await supabase
          .from("generated_assets")
          .select("*")
          .eq("id", asset.id)
          .single();
        if (updated && updated.status !== "generating") {
          setAssets((prev) => prev.map((a) => a.id === asset.id ? (updated as GeneratedAsset) : a));
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [assets]);

  async function generateConcepts() {
    if (!user) return;
    setLoadingConcepts(true);
    setShowConcepts(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-concepts`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ platform: selectedPlatform, prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setConcepts(data.concepts ?? []);
      }
    } catch {
      // Use local fallback concepts
      setConcepts([
        { hook: CONCEPT_HOOKS[0], angle: "Share a common misconception and correct it with your experience.", format: platform.format, caption: "The one mistake everyone makes — here's the fix ✨" },
        { hook: CONCEPT_HOOKS[1], angle: "Document your workflow from morning to posting time.", format: platform.format, caption: "POV: morning routine of a creator who actually shows up 🎬" },
        { hook: CONCEPT_HOOKS[2], angle: "Contrast old approach vs new approach with real results.", format: platform.format, caption: "6 months ago vs now — here's what changed 📈" },
      ]);
    }
    setLoadingConcepts(false);
  }

  async function generate() {
    if (!user || !prompt.trim()) return;
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/higgsfield-generate`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          prompt:      prompt.trim(),
          asset_type:  platform.format,
          aspect_ratio: platform.ratio,
          platform:    selectedPlatform,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && typeof data.credits_remaining === "number") {
          setUsage({ credits_used: data.credits_used, credits_remaining: data.credits_remaining, limit: data.limit ?? MONTHLY_CREDIT_LIMIT });
        }
        toast.error(data.message ?? data.error ?? "Generation failed");
        return;
      }
      setUsage(data.usage);
      await loadAssets();
      const isVideo = platform.format === "video";
      toast.success(
        isVideo
          ? `Video generating… check Library in ~30s (${data.usage.credits_remaining} credits left)`
          : `Image created! (${data.usage.credits_remaining} credits left)`
      );
      setTab("library");
    } catch (err) {
      toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `mrkt-studio-${Date.now()}`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const TABS = [
    { id: "generate", label: "Generate", icon: Wand2 },
    { id: "library",  label: "Library",  icon: Layout },
    { id: "brand",    label: "Brand Kit", icon: Palette },
  ] as const;

  return (
    <div style={{ background: C.canvas }}>
      <div className="studio-page-inner">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        {/* embedded=true (Marketing Hub) skips this block entirely — the Hub's
            own header already covers the title. The credit widget moves into
            the tabs row below instead of sitting alone in an otherwise-empty
            header, which is what previously left a large dead gap when embedded. */}
        {!embedded && (
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{
                  width:          38,
                  height:         38,
                  borderRadius:   12,
                  background:     C.accentMuted,
                  border:         `1px solid ${C.aiBlueBorder}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                }}>
                  <Wand2 size={17} style={{ color: C.aiBlue }} />
                </div>
                <div>
                  <h1 style={{
                    fontSize:      "clamp(1.8rem, 2.5vw, 2.25rem)",
                    fontWeight:    700,
                    color:         C.textPrimary,
                    letterSpacing: "-0.04em",
                    lineHeight:    1.05,
                    margin:        0,
                    fontFamily:    "'Inter Tight', 'Inter', sans-serif",
                  }}>
                    MRKT Studio
                  </h1>
                </div>
              </div>
              <p style={{ fontSize: 14, color: C.textTertiary, margin: 0 }}>
                AI-powered content creation. Generate images and videos for any platform.
              </p>
            </div>
            <div style={{
              padding:      "10px 16px",
              background:   C.surface,
              border:       `1px solid ${usage && usage.credits_remaining <= 0 ? C.redBorder : C.borderSubtle}`,
              borderRadius: 12,
              textAlign:    "center",
              flexShrink:   0,
              minWidth:     84,
            }}>
              {usage ? (
                <>
                  <div style={{
                    fontSize:      20,
                    fontWeight:    800,
                    letterSpacing: "-0.03em",
                    color:         usage.credits_remaining <= 0 ? C.red : C.textPrimary,
                  }}>
                    {usage.credits_remaining}
                  </div>
                  <div style={{ fontSize: 11, color: C.textTertiary }}>credits left</div>
                  <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>of {usage.limit}/mo</div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: C.textTertiary, padding: "4px 0" }}>Loading…</div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 32 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display:     "flex",
                alignItems:  "center",
                gap:         7,
                padding:     "9px 16px",
                borderRadius: 10,
                border:      `1px solid ${tab === t.id ? C.borderNormal : "transparent"}`,
                background:  tab === t.id ? C.surface : "transparent",
                color:       tab === t.id ? C.textPrimary : C.textTertiary,
                fontSize:    13,
                fontWeight:  tab === t.id ? 600 : 500,
                cursor:      "pointer",
                transition:  "all 130ms ease",
              }}
              onMouseEnter={(e) => {
                if (tab !== t.id) {
                  (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 5%)";
                  (e.currentTarget as HTMLElement).style.color = C.textSecondary;
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.id) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = C.textTertiary;
                }
              }}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
        {embedded && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
            padding: "6px 12px", borderRadius: 10,
            background: C.surface, border: `1px solid ${usage && usage.credits_remaining <= 0 ? C.redBorder : C.borderSubtle}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: usage && usage.credits_remaining <= 0 ? C.red : C.textPrimary }}>
              {usage ? usage.credits_remaining : "…"}
            </span>
            <span style={{ fontSize: 11.5, color: C.textTertiary }}>credits left{usage ? ` of ${usage.limit}/mo` : ""}</span>
          </div>
        )}
        </div>

        {/* ── Generate tab ─────────────────────────────────────────────────── */}
        {tab === "generate" && (
          <div className="studio-gen-grid">
            {/* Left: main generation panel */}
            <div>
              {/* Platform selector */}
              <div style={{
                padding:      "24px 26px",
                background:   C.surface,
                border:       `1px solid ${C.borderSubtle}`,
                borderRadius: 20,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.textTertiary, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 14 }}>
                  Platform
                </div>
                <PlatformSelector selected={selectedPlatform} onChange={setSelectedPlatform} />

                {/* Format info */}
                <div style={{
                  marginTop:   14,
                  padding:     "10px 14px",
                  background:  C.raised,
                  border:      `1px solid ${C.borderFaint}`,
                  borderRadius: 10,
                  display:     "flex",
                  alignItems:  "center",
                  gap:         10,
                  fontSize:    12,
                  color:       C.textTertiary,
                }}>
                  {platform.format === "video" ? <Film size={13} style={{ color: C.aiBlue }} /> : <Image size={13} style={{ color: C.aiBlue }} />}
                  <span style={{ flex: 1 }}>
                    <b style={{ color: C.textSecondary }}>{platform.label}</b>
                    {" · "}
                    {platform.format === "video" ? "Video" : "Image"}
                    {" · "}
                    {platform.ratio} ratio
                  </span>
                  <span style={{
                    marginLeft:   "auto",
                    padding:      "2px 8px",
                    borderRadius: 6,
                    background:   C.accentMuted,
                    border:       `1px solid ${C.aiBlueBorder}`,
                    color:        C.aiBlue,
                    fontSize:     11,
                    fontWeight:   600,
                    whiteSpace:   "nowrap",
                  }}>
                    {CREDIT_COST[platform.format]} credit{CREDIT_COST[platform.format] > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Prompt */}
              <div style={{
                padding:      "24px 26px",
                background:   C.surface,
                border:       `1px solid ${C.borderSubtle}`,
                borderRadius: 20,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.textTertiary, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 14 }}>
                  Prompt
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={`Describe what you want to create for ${platform.label}…\n\nTip: be specific about mood, colors, subjects, and style.`}
                  rows={5}
                  style={{
                    width:        "100%",
                    background:   C.raised,
                    border:       `1px solid ${C.borderSubtle}`,
                    borderRadius: 12,
                    padding:      "14px 16px",
                    color:        C.textPrimary,
                    fontSize:     13.5,
                    lineHeight:   1.65,
                    resize:       "vertical",
                    outline:      "none",
                    fontFamily:   "inherit",
                    boxSizing:    "border-box",
                  }}
                  onFocus={(e) => { (e.target as HTMLElement).style.borderColor = C.aiBlueBorder; }}
                  onBlur={(e)  => { (e.target as HTMLElement).style.borderColor = C.borderSubtle; }}
                />

                {/* Quick hooks */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>Quick prompts:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[
                      "Minimalist product flat lay on black background",
                      "Creator filming content in golden hour light",
                      "Abstract geometric brand visual in brand colors",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setPrompt(q)}
                        style={{
                          padding:   "5px 10px",
                          borderRadius: 7,
                          border:    `1px solid ${C.borderSubtle}`,
                          background: "transparent",
                          color:     C.textTertiary,
                          fontSize:  11,
                          cursor:    "pointer",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.raised; (e.currentTarget as HTMLElement).style.color = C.textSecondary; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.textTertiary; }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Out of credits */}
              {usage && usage.credits_remaining < CREDIT_COST[platform.format] && (
                <div style={{
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "space-between",
                  gap:          12,
                  padding:      "14px 18px",
                  background:   C.redBg,
                  border:       `1px solid ${C.redBorder}`,
                  borderRadius: 14,
                  marginBottom: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <AlertCircle size={16} style={{ color: C.red, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: C.textSecondary }}>
                      You're out of Studio credits this month. More plans are coming soon.
                    </span>
                  </div>
                  <Link
                    to="/pricing"
                    style={{
                      flexShrink:   0,
                      padding:      "7px 14px",
                      borderRadius: 8,
                      background:   C.red,
                      color:        "#fff",
                      fontSize:     12,
                      fontWeight:   600,
                      whiteSpace:   "nowrap",
                      textDecoration: "none",
                    }}
                  >
                    See plans
                  </Link>
                </div>
              )}

              {/* Generate button */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={generate}
                  disabled={generating || !prompt.trim() || (usage != null && usage.credits_remaining < CREDIT_COST[platform.format])}
                  style={{
                    flex:           1,
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "center",
                    gap:            9,
                    padding:        "14px 28px",
                    background:     generating || !prompt.trim() || (usage != null && usage.credits_remaining < CREDIT_COST[platform.format]) ? C.raised : "oklch(1 0 0 / 92%)",
                    color:          generating || !prompt.trim() || (usage != null && usage.credits_remaining < CREDIT_COST[platform.format]) ? C.textMuted : "oklch(0.06 0 0)",
                    border:         `1px solid ${generating || !prompt.trim() || (usage != null && usage.credits_remaining < CREDIT_COST[platform.format]) ? C.borderSubtle : "transparent"}`,
                    borderRadius:   14,
                    fontSize:       14,
                    fontWeight:     700,
                    cursor:         generating || !prompt.trim() || (usage != null && usage.credits_remaining < CREDIT_COST[platform.format]) ? "not-allowed" : "pointer",
                    transition:     "all 150ms ease",
                    letterSpacing:  "-0.01em",
                  }}
                  onMouseEnter={(e) => {
                    if (!generating && prompt.trim() && !(usage != null && usage.credits_remaining < CREDIT_COST[platform.format])) {
                      (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!generating && prompt.trim() && !(usage != null && usage.credits_remaining < CREDIT_COST[platform.format])) {
                      (e.currentTarget as HTMLElement).style.background = "oklch(1 0 0 / 92%)";
                    }
                  }}
                >
                  {generating ? (
                    <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating…</>
                  ) : usage != null && usage.credits_remaining < CREDIT_COST[platform.format] ? (
                    <><AlertCircle size={16} /> Not enough credits</>
                  ) : (
                    <><Zap size={16} /> Generate {platform.label}</>
                  )}
                </button>
              </div>
            </div>

            {/* Right: AI Creative Director */}
            <div style={{
              padding:      "22px 22px",
              background:   C.surface,
              border:       `1px solid ${C.borderSubtle}`,
              borderRadius: 20,
              position:     "sticky",
              top:          20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Sparkles size={14} style={{ color: C.aiBlue }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, letterSpacing: "-0.015em" }}>
                  AI Creative Director
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 16, lineHeight: 1.5 }}>
                Get AI-generated content concepts, hooks, and caption ideas for {platform.label}.
              </div>

              <button
                onClick={generateConcepts}
                disabled={loadingConcepts}
                style={{
                  width:          "100%",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  gap:            8,
                  padding:        "10px 0",
                  background:     C.accentMuted,
                  border:         `1px solid ${C.aiBlueBorder}`,
                  borderRadius:   10,
                  fontSize:       12.5,
                  fontWeight:     600,
                  color:          C.aiBlue,
                  cursor:         loadingConcepts ? "wait" : "pointer",
                  marginBottom:   16,
                  transition:     "all 130ms ease",
                }}
                onMouseEnter={(e) => {
                  if (!loadingConcepts) {
                    (e.currentTarget as HTMLElement).style.background = "oklch(0.72 0.10 224 / 20%)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = C.accentMuted;
                }}
              >
                {loadingConcepts ? (
                  <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Thinking…</>
                ) : (
                  <><Wand2 size={13} /> Generate concepts</>
                )}
              </button>

              {showConcepts && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {loadingConcepts ? (
                    [1, 2, 3].map((i) => (
                      <div key={i} style={{
                        height:       90,
                        borderRadius: 12,
                        background:   C.raised,
                        animation:    "pulse 1.6s ease-in-out infinite",
                        opacity:      1 - i * 0.1,
                      }} />
                    ))
                  ) : concepts.length > 0 ? (
                    concepts.map((c, i) => (
                      <ConceptCard
                        key={i}
                        concept={c}
                        onUse={(text) => { setPrompt(text); toast.success("Concept applied to prompt"); }}
                      />
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "16px 0" }}>
                      No concepts generated. Try again.
                    </div>
                  )}
                </div>
              )}

              {/* Tip */}
              {!showConcepts && (
                <div style={{
                  padding:      "14px 16px",
                  background:   C.raised,
                  border:       `1px solid ${C.borderFaint}`,
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textTertiary, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                    Pro Tips
                  </div>
                  {[
                    "Be specific about mood and lighting",
                    "Mention brand colors to stay on-brand",
                    "Include 'MENA aesthetic' for regional feel",
                    "Add 'professional photography' for quality",
                  ].map((tip, i) => (
                    <div key={i} style={{ display: "flex", gap: 7, marginBottom: i < 3 ? 6 : 0 }}>
                      <Star size={10} style={{ color: C.amber, marginTop: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, color: C.textTertiary, lineHeight: 1.4 }}>{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Library tab ──────────────────────────────────────────────────── */}
        {tab === "library" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ fontSize: 14, color: C.textTertiary }}>
                {assets.length} asset{assets.length !== 1 ? "s" : ""} generated
              </div>
              <button
                onClick={loadAssets}
                disabled={loadingAssets}
                style={{
                  display:    "flex",
                  alignItems: "center",
                  gap:        7,
                  padding:    "8px 14px",
                  background: C.surface,
                  border:     `1px solid ${C.borderSubtle}`,
                  borderRadius: 10,
                  fontSize:   12.5,
                  color:      C.textTertiary,
                  cursor:     "pointer",
                }}
              >
                <RefreshCw size={13} style={{ animation: loadingAssets ? "spin 1s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>

            {assets.length === 0 && !loadingAssets ? (
              <div style={{
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "center",
                justifyContent: "center",
                padding:        "80px 0",
                textAlign:      "center",
              }}>
                <div style={{
                  width:          64,
                  height:         64,
                  borderRadius:   20,
                  background:     C.surface,
                  border:         `1px solid ${C.borderSubtle}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  marginBottom:   16,
                }}>
                  <Image size={26} style={{ color: C.textMuted }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary, marginBottom: 8 }}>
                  No assets yet
                </div>
                <div style={{ fontSize: 13, color: C.textTertiary, marginBottom: 20 }}>
                  Generate your first image or video in the Generate tab.
                </div>
                <button
                  onClick={() => setTab("generate")}
                  style={{
                    padding:      "10px 20px",
                    background:   C.accentMuted,
                    border:       `1px solid ${C.aiBlueBorder}`,
                    borderRadius: 10,
                    fontSize:     13,
                    fontWeight:   600,
                    color:        C.aiBlue,
                    cursor:       "pointer",
                  }}
                >
                  Start generating →
                </button>
              </div>
            ) : (
              <div style={{
                display:             "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap:                 16,
              }}>
                {assets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} onDownload={handleDownload} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Brand Kit tab ────────────────────────────────────────────────── */}
        {tab === "brand" && <BrandKitTab />}

      </div>
    </div>
  );
}
