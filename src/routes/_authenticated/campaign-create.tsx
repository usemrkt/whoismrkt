import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowUpRight, ArrowLeft, Check, Plus, X,
  DollarSign, Gift, TrendingUp, Percent, Minus,
  Instagram, Youtube, Globe, Sparkles, Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Logo";
import { toast } from "sonner";
import type {
  CompensationType, AssetType, PaidStructure,
  CampaignFormData, CampaignDeliverableInput, CampaignAssetInput,
} from "@/types/campaign";
import {
  DELIVERABLE_PLATFORMS, DELIVERABLE_TYPES_BY_PLATFORM,
  INDUSTRY_OPTIONS, ASSET_TYPE_LABELS,
} from "@/types/campaign";
import type { CreatorCategory } from "@/types/creator";
import { CATEGORY_LABELS } from "@/types/creator";
import { C } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/campaign-create")({
  head: () => ({ meta: [{ title: "Post a Campaign — MRKT Connect" }] }),
  component: CampaignCreatePage,
});

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const STEP_LABELS = ["Business", "Campaign", "Compensation", "Deliverables", "Requirements", "Review"];

const COMPENSATION_CARDS: { type: CompensationType; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    type: "paid",
    label: "Paid",
    sub: "Fixed fee, budget range, or per deliverable",
    icon: <DollarSign className="h-5 w-5" />,
  },
  {
    type: "gifted",
    label: "Gifted",
    sub: "Free product or service for content",
    icon: <Gift className="h-5 w-5" />,
  },
  {
    type: "affiliate",
    label: "Affiliate",
    sub: "Commission on sales driven by creator",
    icon: <Percent className="h-5 w-5" />,
  },
  {
    type: "revenue_share",
    label: "Revenue Share",
    sub: "Percentage of attributed revenue",
    icon: <TrendingUp className="h-5 w-5" />,
  },
  {
    type: "unpaid",
    label: "Unpaid",
    sub: "Exposure only — no monetary compensation",
    icon: <Minus className="h-5 w-5" />,
  },
];

const CATEGORIES: { value: CreatorCategory; label: string }[] = Object.entries(CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as CreatorCategory, label })
);

const PLATFORMS_LIST = ["Instagram", "TikTok", "YouTube"];

const EMPTY: CampaignFormData = {
  business_name: "", business_industry: "", business_website: "",
  business_instagram: "", business_tiktok: "", business_location: "",
  title: "", description: "", product_service: "", campaign_goal: "",
  compensation_type: null,
  paid_structure: "fixed",
  compensation_amount_fixed: "", compensation_budget_min: "",
  compensation_budget_max: "", compensation_per_deliverable: "",
  deliverables: [],
  required_niches: [], min_followers: "", required_country: "",
  required_language: "", required_platforms: [], deadline: "",
  assets: [],
};

// ─────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-[0.28em] font-medium" style={{ color: "oklch(1 0 0 / 38%)" }}>
          {label}
        </label>
        {hint && <span className="text-[10px]" style={{ color: "oklch(1 0 0 / 24%)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", prefix }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
  prefix?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center rounded-xl overflow-hidden"
      style={{ background: "oklch(1 0 0 / 3.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
    >
      {prefix && (
        <span className="px-3.5 shrink-0 text-sm select-none" style={{
          color: "oklch(1 0 0 / 28%)",
          borderRight: "1px solid oklch(1 0 0 / 8%)",
          paddingTop: "0.6875rem", paddingBottom: "0.6875rem",
        }}>
          {prefix}
        </span>
      )}
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent px-3.5 py-[0.6875rem] text-sm outline-none placeholder:text-foreground/20"
        style={{ color: "oklch(1 0 0 / 85%)" }}
      />
    </div>
  );
}

function Textarea({ value, onChange, placeholder, rows = 4 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "oklch(1 0 0 / 3.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className="w-full bg-transparent px-3.5 py-3.5 text-sm outline-none resize-none placeholder:text-foreground/20"
        style={{ color: "oklch(1 0 0 / 85%)" }}
      />
    </div>
  );
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: readonly string[]; placeholder?: string;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "oklch(1 0 0 / 3.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-3.5 py-[0.6875rem] text-sm outline-none appearance-none"
        style={{ color: value ? "oklch(1 0 0 / 85%)" : "oklch(1 0 0 / 25%)" }}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o} style={{ background: "oklch(0.065 0 0)", color: "oklch(1 0 0 / 85%)" }}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 1 — Business
// ─────────────────────────────────────────────────────────────

function StepBusiness({ d, s }: { d: CampaignFormData; s: SetFn }) {
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Business Name">
          <Input value={d.business_name} onChange={(v) => s("business_name", v)} placeholder="Lumière Studio" />
        </Field>
        <Field label="Industry">
          <Select
            value={d.business_industry}
            onChange={(v) => s("business_industry", v)}
            options={INDUSTRY_OPTIONS}
            placeholder="Select industry"
          />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Website" hint="Optional">
          <Input value={d.business_website} onChange={(v) => s("business_website", v)} prefix={<Globe className="h-3.5 w-3.5" />} placeholder="https://yourbrand.com" type="url" />
        </Field>
        <Field label="Location">
          <Input value={d.business_location} onChange={(v) => s("business_location", v)} placeholder="Paris, France" />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Instagram" hint="Optional">
          <Input value={d.business_instagram} onChange={(v) => s("business_instagram", v)} prefix={<Instagram className="h-3.5 w-3.5" />} placeholder="yourbrand" />
        </Field>
        <Field label="TikTok" hint="Optional">
          <Input value={d.business_tiktok} onChange={(v) => s("business_tiktok", v)} prefix="@" placeholder="yourbrand" />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2 — Campaign Details
// ─────────────────────────────────────────────────────────────

function StepCampaign({ d, s }: { d: CampaignFormData; s: SetFn }) {
  const [improving, setImproving] = useState(false);
  const [preview,   setPreview]   = useState<{ title: string; description: string } | null>(null);

  const canImprove = !!(d.title.trim() || d.product_service.trim() || d.description.trim());

  async function improveWithAI() {
    if (!canImprove) return;
    setImproving(true);
    setPreview(null);
    try {
      const prompt = `Improve this campaign brief for a GCC influencer marketing campaign.

Current details:
Title: ${d.title || "(none)"}
Product/Service: ${d.product_service || "(none)"}
Goal: ${d.campaign_goal || "(none)"}
Description: ${d.description || "(none)"}

Return ONLY a JSON object with these exact fields (no markdown, no explanation):
{
  "title": "improved campaign title (concise, compelling, max 60 chars)",
  "description": "improved campaign description (3-4 sentences, clear brief, GCC market context, creator tone guidance, deliverable expectations)"
}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.functions.invoke("ai-router", {
        body: { task_type: "campaign_brief", prompt },
      });

      if (error) throw new Error(error.message ?? "AI error");

      const raw     = (data?.response as string ?? "").replace(/```(?:json)?\n?/g, "").replace(/```/g, "").trim();
      const parsed  = JSON.parse(raw) as { title?: string; description?: string };

      if (!parsed.title && !parsed.description) throw new Error("Empty response");
      setPreview({ title: parsed.title ?? d.title, description: parsed.description ?? d.description });
    } catch (err) {
      console.error("AI brief improvement failed:", err);
      toast.error("AI improvement failed. Try again.");
    } finally {
      setImproving(false);
    }
  }

  function acceptPreview() {
    if (!preview) return;
    s("title",       preview.title);
    s("description", preview.description);
    setPreview(null);
    toast.success("Brief updated with AI suggestions.");
  }

  return (
    <div className="space-y-5">
      <Field label="Campaign Title">
        <Input value={d.title} onChange={(v) => s("title", v)} placeholder="SS26 Fashion Launch" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Product / Service">
          <Input value={d.product_service} onChange={(v) => s("product_service", v)} placeholder="New skincare line" />
        </Field>
        <Field label="Campaign Goal">
          <Input value={d.campaign_goal} onChange={(v) => s("campaign_goal", v)} placeholder="Brand awareness, product launch…" />
        </Field>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "oklch(1 0 0 / 35%)" }}>
            Campaign Description
          </label>
          <button
            type="button"
            onClick={improveWithAI}
            disabled={improving || !canImprove}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all duration-150 disabled:opacity-40"
            style={{
              background: "oklch(0.72 0.10 224 / 12%)",
              border:     "1px solid oklch(0.72 0.10 224 / 25%)",
              color:      "oklch(0.72 0.10 224)",
            }}
          >
            {improving
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Improving…</>
              : <><Sparkles className="h-3 w-3" /> Improve with AI</>
            }
          </button>
        </div>
        <Textarea
          value={d.description}
          onChange={(v) => s("description", v)}
          placeholder="Describe what you're launching, the tone you're looking for, and what makes this campaign unique…"
          rows={5}
        />
      </div>

      {/* AI preview panel */}
      {preview && (
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{
            background: "oklch(0.72 0.10 224 / 6%)",
            border:     "1px solid oklch(0.72 0.10 224 / 20%)",
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" style={{ color: "oklch(0.72 0.10 224)" }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "oklch(0.72 0.10 224)" }}>
              AI Suggestion
            </span>
          </div>
          <div className="space-y-2">
            <p className="text-[12px] font-semibold" style={{ color: "oklch(1 0 0 / 85%)" }}>{preview.title}</p>
            <p className="text-[12px] leading-relaxed" style={{ color: "oklch(1 0 0 / 55%)" }}>{preview.description}</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={acceptPreview}
              className="rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-all duration-150"
              style={{ background: "oklch(0.72 0.10 224 / 20%)", color: "oklch(0.84 0 0)", border: "1px solid oklch(0.55 0.18 260 / 35%)" }}
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-all duration-150"
              style={{ background: "oklch(1 0 0 / 5%)", color: "oklch(1 0 0 / 40%)", border: "1px solid oklch(1 0 0 / 12%)" }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 3 — Compensation
// ─────────────────────────────────────────────────────────────

function StepCompensation({ d, s }: { d: CampaignFormData; s: SetFn }) {
  const PAID_TABS: { value: PaidStructure; label: string }[] = [
    { value: "fixed",           label: "Fixed Amount" },
    { value: "range",           label: "Budget Range" },
    { value: "per_deliverable", label: "Per Deliverable" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {COMPENSATION_CARDS.map((card) => {
          const selected = d.compensation_type === card.type;
          const isUnpaid = card.type === "unpaid";
          return (
            <button
              key={card.type}
              onClick={() => s("compensation_type", card.type)}
              className="text-left rounded-2xl p-5 transition-all duration-150"
              style={{
                background: selected
                  ? isUnpaid ? "oklch(1 0 0 / 4%)" : "oklch(1 0 0 / 8%)"
                  : "oklch(1 0 0 / 2.5%)",
                border: selected
                  ? isUnpaid ? "1px solid oklch(1 0 0 / 22%)" : "1px solid oklch(1 0 0 / 45%)"
                  : "1px solid oklch(1 0 0 / 8%)",
                boxShadow: selected && !isUnpaid ? "0 0 0 1px oklch(1 0 0 / 12%)" : "none",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: selected && !isUnpaid ? "oklch(1 0 0 / 15%)" : "oklch(1 0 0 / 6%)",
                    color:      selected && !isUnpaid ? "oklch(0.84 0 0)"        : "oklch(1 0 0 / 40%)",
                  }}
                >
                  {card.icon}
                </div>
                {selected && (
                  <span
                    className="h-5 w-5 rounded-full flex items-center justify-center"
                    style={{ background: isUnpaid ? "oklch(1 0 0 / 55%)" : "oklch(0.84 0 0)" }}
                  >
                    <Check className="h-3 w-3 text-black" strokeWidth={3} />
                  </span>
                )}
              </div>
              <div
                className="font-semibold text-[14px] mb-1"
                style={{ color: selected ? "oklch(1 0 0 / 90%)" : "oklch(1 0 0 / 65%)" }}
              >
                {card.label}
              </div>
              <div className="text-[11.5px] leading-relaxed" style={{ color: "oklch(1 0 0 / 36%)" }}>
                {card.sub}
              </div>
            </button>
          );
        })}
      </div>

      {d.compensation_type === "paid" && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ background: "oklch(1 0 0 / 2.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
        >
          <div className="text-[10px] uppercase tracking-[0.28em] font-medium" style={{ color: "oklch(1 0 0 / 38%)" }}>
            Payment Structure
          </div>
          <div className="flex gap-1 p-[3px] rounded-xl w-fit" style={{ background: "oklch(1 0 0 / 5%)" }}>
            {PAID_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => s("paid_structure", tab.value)}
                className="px-4 py-2 rounded-lg text-[12px] font-medium transition-all duration-150"
                style={{
                  background: d.paid_structure === tab.value ? "oklch(1 0 0 / 10%)" : "transparent",
                  color:      d.paid_structure === tab.value ? "oklch(1 0 0 / 82%)" : "oklch(1 0 0 / 36%)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {d.paid_structure === "fixed" && (
            <Field label="Fixed Amount (USD)">
              <Input value={d.compensation_amount_fixed} onChange={(v) => s("compensation_amount_fixed", v)} prefix="$" placeholder="2,000" />
            </Field>
          )}
          {d.paid_structure === "range" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Minimum (USD)">
                <Input value={d.compensation_budget_min} onChange={(v) => s("compensation_budget_min", v)} prefix="$" placeholder="1,000" />
              </Field>
              <Field label="Maximum (USD)">
                <Input value={d.compensation_budget_max} onChange={(v) => s("compensation_budget_max", v)} prefix="$" placeholder="5,000" />
              </Field>
            </div>
          )}
          {d.paid_structure === "per_deliverable" && (
            <Field label="Per Deliverable Rate (USD)">
              <Input value={d.compensation_per_deliverable} onChange={(v) => s("compensation_per_deliverable", v)} prefix="$" placeholder="500" />
            </Field>
          )}
        </div>
      )}

      {d.compensation_type === "unpaid" && (
        <div
          className="rounded-xl px-4 py-3.5 text-[12px] leading-relaxed"
          style={{ background: "oklch(1 0 0 / 2.5%)", border: "1px solid oklch(1 0 0 / 8%)", color: "oklch(1 0 0 / 45%)" }}
        >
          This campaign will be clearly labelled <strong style={{ color: "oklch(1 0 0 / 70%)" }}>UNPAID</strong> to creators before they open it.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 4 — Deliverables
// ─────────────────────────────────────────────────────────────

function StepDeliverables({ d, addDeliverable, updateDeliverable, removeDeliverable }: {
  d: CampaignFormData;
  addDeliverable: () => void;
  updateDeliverable: (i: number, key: keyof CampaignDeliverableInput, v: string | number) => void;
  removeDeliverable: (i: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-[11.5px] leading-relaxed" style={{ color: "oklch(1 0 0 / 40%)" }}>
        Define exactly what you need creators to produce. Be specific — clear deliverables attract better applicants.
      </div>

      {d.deliverables.length === 0 ? (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-12 text-center"
          style={{ background: "oklch(1 0 0 / 1.5%)", border: "1px dashed oklch(1 0 0 / 10%)" }}
        >
          <p className="text-[12px] mb-4" style={{ color: "oklch(1 0 0 / 36%)" }}>No deliverables yet</p>
          <button
            onClick={addDeliverable}
            className="inline-flex items-center gap-2 rounded-full px-5 h-9 text-sm transition-colors duration-150"
            style={{ background: "oklch(1 0 0 / 6%)", border: "1px solid oklch(1 0 0 / 12%)", color: "oklch(1 0 0 / 65%)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Add First Deliverable
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {d.deliverables.map((item, i) => (
            <DeliverableRow
              key={i}
              item={item}
              index={i}
              onUpdate={(key, v) => updateDeliverable(i, key, v)}
              onRemove={() => removeDeliverable(i)}
            />
          ))}
          {d.deliverables.length < 10 && (
            <button
              onClick={addDeliverable}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm transition-colors duration-150"
              style={{ border: "1px dashed oklch(1 0 0 / 10%)", color: "oklch(1 0 0 / 35%)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 60%)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 35%)"; }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Deliverable
            </button>
          )}
        </div>
      )}

      {d.deliverables.length === 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] font-medium mb-3" style={{ color: "oklch(1 0 0 / 28%)" }}>
            Common presets
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { platform: "Instagram", content_type: "Reel",         quantity: 1 },
              { platform: "Instagram", content_type: "Story",        quantity: 3 },
              { platform: "TikTok",    content_type: "TikTok Video", quantity: 1 },
              { platform: "General",   content_type: "UGC Video",    quantity: 1 },
              { platform: "General",   content_type: "Photos",       quantity: 5 },
            ].map((preset, i) => (
              <button
                key={i}
                onClick={() => {
                  addDeliverable();
                  setTimeout(() => {
                    updateDeliverable(0, "platform",      preset.platform);
                    updateDeliverable(0, "content_type",  preset.content_type);
                    updateDeliverable(0, "quantity",       preset.quantity);
                  }, 0);
                }}
                className="px-3 py-1.5 rounded-full text-[11.5px] transition-colors duration-150"
                style={{ background: "oklch(1 0 0 / 4%)", border: "1px solid oklch(1 0 0 / 8%)", color: "oklch(1 0 0 / 48%)" }}
              >
                {preset.quantity} × {preset.platform} {preset.content_type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverableRow({ item, onUpdate, onRemove }: {
  item: CampaignDeliverableInput;
  index: number;
  onUpdate: (key: keyof CampaignDeliverableInput, v: string | number) => void;
  onRemove: () => void;
}) {
  const typeOptions = item.platform ? DELIVERABLE_TYPES_BY_PLATFORM[item.platform] ?? [] : [];

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "oklch(1 0 0 / 2.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.24em] mb-1.5" style={{ color: "oklch(1 0 0 / 30%)" }}>Platform</div>
            <Select
              value={item.platform}
              onChange={(v) => { onUpdate("platform", v); onUpdate("content_type", ""); }}
              options={DELIVERABLE_PLATFORMS as unknown as string[]}
              placeholder="Select"
            />
          </div>
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.24em] mb-1.5" style={{ color: "oklch(1 0 0 / 30%)" }}>Type</div>
            <Select value={item.content_type} onChange={(v) => onUpdate("content_type", v)} options={typeOptions} placeholder="Select" />
          </div>
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.24em] mb-1.5" style={{ color: "oklch(1 0 0 / 30%)" }}>Qty</div>
            <div className="flex items-center rounded-xl overflow-hidden" style={{ background: "oklch(1 0 0 / 3.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}>
              <input
                type="number" min={1} max={99}
                value={item.quantity}
                onChange={(e) => onUpdate("quantity", parseInt(e.target.value, 10) || 1)}
                className="flex-1 bg-transparent px-3 py-[0.6875rem] text-sm outline-none w-full"
                style={{ color: "oklch(1 0 0 / 85%)" }}
              />
            </div>
          </div>
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.24em] mb-1.5" style={{ color: "oklch(1 0 0 / 30%)" }}>Notes</div>
            <Input value={item.notes} onChange={(v) => onUpdate("notes", v)} placeholder="e.g. 30 sec" />
          </div>
        </div>
        <button
          onClick={onRemove}
          className="mt-7 h-8 w-8 rounded-full shrink-0 flex items-center justify-center transition-colors duration-150"
          style={{ background: "oklch(1 0 0 / 4%)", color: "oklch(1 0 0 / 35%)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 65%)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 35%)"; }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 5 — Requirements + Assets
// ─────────────────────────────────────────────────────────────

function StepRequirements({ d, s, toggleNiche, togglePlatform, addAsset, updateAsset, removeAsset }: {
  d: CampaignFormData; s: SetFn;
  toggleNiche: (n: string) => void;
  togglePlatform: (p: string) => void;
  addAsset: () => void;
  updateAsset: (i: number, key: keyof CampaignAssetInput, v: string) => void;
  removeAsset: (i: number) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div className="text-[10px] uppercase tracking-[0.28em] font-medium" style={{ color: "oklch(1 0 0 / 38%)" }}>
          Creator Requirements
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-medium mb-3" style={{ color: "oklch(1 0 0 / 30%)" }}>
            Creator Niches
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const sel = d.required_niches.includes(cat.value);
              return (
                <button
                  key={cat.value}
                  onClick={() => toggleNiche(cat.value)}
                  className="px-3.5 py-2 rounded-full text-[12px] font-medium transition-all duration-150"
                  style={{
                    background: sel ? "oklch(1 0 0 / 10%)"         : "oklch(1 0 0 / 3%)",
                    border:     `1px solid ${sel ? "oklch(0.84 0 0 / 45%)" : "oklch(1 0 0 / 8%)"}`,
                    color:      sel ? "oklch(1 0 0 / 88%)"          : "oklch(1 0 0 / 40%)",
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Minimum Followers" hint="Optional">
            <Input value={d.min_followers} onChange={(v) => s("min_followers", v)} placeholder="10,000" />
          </Field>
          <Field label="Deadline" hint="Optional">
            <Input value={d.deadline} onChange={(v) => s("deadline", v)} type="date" />
          </Field>
          <Field label="Country" hint="Optional">
            <Input value={d.required_country} onChange={(v) => s("required_country", v)} placeholder="France" />
          </Field>
          <Field label="Language" hint="Optional">
            <Input value={d.required_language} onChange={(v) => s("required_language", v)} placeholder="French, English…" />
          </Field>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-medium mb-3" style={{ color: "oklch(1 0 0 / 30%)" }}>
            Required Platforms
          </div>
          <div className="flex gap-2">
            {PLATFORMS_LIST.map((p) => {
              const sel = d.required_platforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className="px-4 py-2 rounded-full text-[12.5px] font-medium transition-all duration-150"
                  style={{
                    background: sel ? "oklch(1 0 0 / 10%)"         : "oklch(1 0 0 / 3%)",
                    border:     `1px solid ${sel ? "oklch(0.84 0 0 / 45%)" : "oklch(1 0 0 / 8%)"}`,
                    color:      sel ? "oklch(1 0 0 / 88%)"          : "oklch(1 0 0 / 40%)",
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-[10px] uppercase tracking-[0.28em] font-medium" style={{ color: "oklch(1 0 0 / 38%)" }}>
          Brand Assets
          <span className="ml-2 normal-case tracking-normal text-[10px]" style={{ color: "oklch(1 0 0 / 24%)", textTransform: "none", letterSpacing: "normal" }}>
            — optional
          </span>
        </div>
        <div className="text-[11.5px]" style={{ color: "oklch(1 0 0 / 36%)" }}>
          Share product photos, brand guidelines, and reference materials. Creators will see these before applying.
        </div>

        {d.assets.map((asset, i) => (
          <div key={i} className="rounded-xl p-4 space-y-3" style={{ background: "oklch(1 0 0 / 2.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}>
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium" style={{ color: "oklch(1 0 0 / 65%)" }}>Asset {i + 1}</div>
              <button
                onClick={() => removeAsset(i)}
                className="h-6 w-6 rounded-full flex items-center justify-center"
                style={{ background: "oklch(1 0 0 / 5%)", color: "oklch(1 0 0 / 38%)" }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.22em] mb-1.5" style={{ color: "oklch(1 0 0 / 28%)" }}>Type</div>
                <Select value={asset.asset_type} onChange={(v) => updateAsset(i, "asset_type", v as AssetType)} options={Object.keys(ASSET_TYPE_LABELS)} placeholder="Select type" />
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.22em] mb-1.5" style={{ color: "oklch(1 0 0 / 28%)" }}>Label</div>
                <Input value={asset.name} onChange={(v) => updateAsset(i, "name", v)} placeholder="Product shot 1" />
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.22em] mb-1.5" style={{ color: "oklch(1 0 0 / 28%)" }}>URL</div>
                <Input value={asset.url} onChange={(v) => updateAsset(i, "url", v)} placeholder="https://…" />
              </div>
            </div>
          </div>
        ))}

        {d.assets.length < 8 && (
          <button
            onClick={addAsset}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm transition-colors duration-150"
            style={{ border: "1px dashed oklch(1 0 0 / 10%)", color: "oklch(1 0 0 / 35%)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 60%)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "oklch(1 0 0 / 35%)"; }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Asset
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 6 — Review
// ─────────────────────────────────────────────────────────────

function StepReview({ d, saving, onPublish, onDraft }: {
  d: CampaignFormData; saving: boolean;
  onPublish: () => void; onDraft: () => void;
}) {
  const COMP_LABELS: Record<CompensationType, string> = {
    paid: "Paid", gifted: "Gifted", affiliate: "Affiliate", revenue_share: "Revenue Share", unpaid: "Unpaid",
  };
  const compType = d.compensation_type!;
  const isPaid = compType === "paid";

  function getCompSummary(): string {
    if (!isPaid) return COMP_LABELS[compType] ?? "";
    if (d.paid_structure === "fixed" && d.compensation_amount_fixed) return `$${d.compensation_amount_fixed} fixed`;
    if (d.paid_structure === "range" && d.compensation_budget_min)   return `$${d.compensation_budget_min} – $${d.compensation_budget_max}`;
    if (d.paid_structure === "per_deliverable" && d.compensation_per_deliverable) return `$${d.compensation_per_deliverable} / deliverable`;
    return "Paid";
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden" style={{ background: "oklch(1 0 0 / 2.5%)", border: "1px solid oklch(1 0 0 / 8%)" }}>
        <div
          className="px-6 py-5 flex items-center gap-3"
          style={{ borderBottom: "1px solid oklch(1 0 0 / 7%)", background: isPaid ? "oklch(1 0 0 / 6%)" : "oklch(1 0 0 / 2%)" }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-[0.22em] rounded-full px-3 py-1"
            style={{
              color:      isPaid ? "oklch(0.84 0 0)"           : "oklch(1 0 0 / 50%)",
              background: isPaid ? "oklch(1 0 0 / 14%)"     : "oklch(1 0 0 / 6%)",
              border:     `1px solid ${isPaid ? "oklch(1 0 0 / 30%)" : "oklch(1 0 0 / 12%)"}`,
            }}
          >
            {COMP_LABELS[compType]}
          </span>
          <span className="font-display text-xl font-semibold" style={{ color: "oklch(1 0 0 / 85%)" }}>
            {getCompSummary()}
          </span>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.24em] mb-1" style={{ color: "oklch(1 0 0 / 28%)" }}>
              {d.business_name}
            </div>
            <h3 className="font-display text-2xl font-bold tracking-tight" style={{ color: "oklch(1 0 0 / 88%)" }}>
              {d.title || "Untitled Campaign"}
            </h3>
            {d.product_service && (
              <div className="text-[12.5px] mt-1" style={{ color: "oklch(1 0 0 / 45%)" }}>{d.product_service}</div>
            )}
          </div>
          {d.description && (
            <p className="text-[13px] leading-relaxed" style={{ color: "oklch(1 0 0 / 55%)" }}>
              {d.description.length > 200 ? d.description.slice(0, 200) + "…" : d.description}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Deliverables", value: d.deliverables.length.toString() },
              { label: "Niches",       value: d.required_niches.length > 0 ? d.required_niches.length.toString() : "Any" },
              { label: "Assets",       value: d.assets.length.toString() },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl p-3 text-center" style={{ background: "oklch(1 0 0 / 3%)", border: "1px solid oklch(1 0 0 / 7%)" }}>
                <div className="font-semibold" style={{ color: "oklch(1 0 0 / 82%)" }}>{stat.value}</div>
                <div className="text-[9.5px] mt-0.5" style={{ color: "oklch(1 0 0 / 30%)" }}>{stat.label}</div>
              </div>
            ))}
          </div>
          {d.deliverables.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[9.5px] uppercase tracking-[0.24em] font-medium" style={{ color: "oklch(1 0 0 / 28%)" }}>
                Deliverables
              </div>
              {d.deliverables.map((del, i) => (
                <div key={i} className="flex items-center gap-2 text-[12.5px]" style={{ color: "oklch(1 0 0 / 62%)" }}>
                  <span style={{ color: "oklch(1 0 0 / 28%)" }}>·</span>
                  {del.quantity} × {del.platform} {del.content_type}
                  {del.notes && <span style={{ color: "oklch(1 0 0 / 32%)" }}>({del.notes})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={onPublish}
          disabled={saving}
          className="btn-primary w-full h-12 rounded-full text-sm font-medium flex items-center justify-center gap-2"
        >
          {saving ? "Publishing…" : "Publish Campaign"}
          {!saving && <ArrowUpRight className="h-4 w-4" />}
        </button>
        <button
          onClick={onDraft}
          disabled={saving}
          className="w-full h-11 rounded-full text-sm transition-colors duration-150"
          style={{ background: "oklch(1 0 0 / 3%)", border: "1px solid oklch(1 0 0 / 8%)", color: "oklch(1 0 0 / 45%)" }}
        >
          Save as Draft
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

type SetFn = <K extends keyof CampaignFormData>(k: K, v: CampaignFormData[K]) => void;

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

function parseIntStr(s: string): number | null {
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? null : n;
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

interface StoredBizProfile {
  company_name: string | null;
  industry:     string | null;
  website:      string | null;
  location:     string | null;
  is_complete:  boolean;
}

function CampaignCreatePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<CampaignFormData>(EMPTY);
  const [saving, setSaving] = useState(false);

  const [roleChecked, setRoleChecked] = useState(false);
  const [isCreator,   setIsCreator]   = useState(false);
  const [bizProfile,  setBizProfile]  = useState<StoredBizProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("profiles")
        .select("onboarding_path,account_type")
        .eq("id", user.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase
        .from("business_profiles")
        .select("company_name,industry,website,location,is_complete")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]).then(([{ data: p }, { data: biz }]) => {
      const creator =
        p?.onboarding_path === "creator" || p?.account_type === "creator";
      setIsCreator(creator);
      setBizProfile(biz ?? null);
      setRoleChecked(true);
    });
  }, [user]);

  // Campaign Center hand-off: an AI-recommended campaign idea pre-fills the
  // title/description/goal here instead of opening on a blank form — same
  // localStorage-draft pattern already used for the AI Strategist prefill
  // (see mrkt_prefill_prompt in chat.tsx / growth.tsx).
  useEffect(() => {
    const raw = localStorage.getItem("mrkt_campaign_draft");
    if (!raw) return;
    localStorage.removeItem("mrkt_campaign_draft");
    try {
      const draft = JSON.parse(raw) as Partial<Pick<CampaignFormData, "title" | "description" | "campaign_goal">>;
      setData((d) => ({
        ...d,
        title:         draft.title ?? d.title,
        description:   draft.description ?? d.description,
        campaign_goal: draft.campaign_goal ?? d.campaign_goal,
      }));
    } catch {
      // Malformed draft — ignore, user just gets the normal blank form.
    }
  }, []);

  function set<K extends keyof CampaignFormData>(k: K, v: CampaignFormData[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  function toggleNiche(n: string) {
    setData((d) => ({
      ...d,
      required_niches: d.required_niches.includes(n)
        ? d.required_niches.filter((x) => x !== n)
        : [...d.required_niches, n],
    }));
  }

  function togglePlatform(p: string) {
    setData((d) => ({
      ...d,
      required_platforms: d.required_platforms.includes(p)
        ? d.required_platforms.filter((x) => x !== p)
        : [...d.required_platforms, p],
    }));
  }

  function addDeliverable() {
    setData((d) => ({
      ...d,
      deliverables: [...d.deliverables, { platform: "", content_type: "", quantity: 1, notes: "" }],
    }));
  }

  function updateDeliverable(i: number, key: keyof CampaignDeliverableInput, v: string | number) {
    setData((d) => {
      const updated = [...d.deliverables];
      updated[i] = { ...updated[i], [key]: v };
      return { ...d, deliverables: updated };
    });
  }

  function removeDeliverable(i: number) {
    setData((d) => ({ ...d, deliverables: d.deliverables.filter((_, idx) => idx !== i) }));
  }

  function addAsset() {
    setData((d) => ({
      ...d,
      assets: [...d.assets, { asset_type: "product_photo", url: "", name: "" }],
    }));
  }

  function updateAsset(i: number, key: keyof CampaignAssetInput, v: string) {
    setData((d) => {
      const updated = [...d.assets];
      updated[i] = { ...updated[i], [key]: v };
      return { ...d, assets: updated };
    });
  }

  function removeAsset(i: number) {
    setData((d) => ({ ...d, assets: d.assets.filter((_, idx) => idx !== i) }));
  }

  function canProceed(): boolean {
    if (step === 1) return !!(data.title.trim() && data.description.trim());
    if (step === 2) return !!data.compensation_type;
    return true;
  }

  async function submitCampaign(publish: boolean) {
    if (!user) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campaign, error } = await supabase
        .from("campaigns")
        .insert({
          user_id:                      user.id,
          // Business identity is pulled from the stored profile — never re-entered
          business_name:                bizProfile?.company_name?.trim() || "",
          business_industry:            bizProfile?.industry            || null,
          business_website:             bizProfile?.website?.trim()     || null,
          business_instagram:           null,
          business_tiktok:              null,
          business_location:            bizProfile?.location?.trim()    || null,
          title:                        data.title.trim(),
          description:                  data.description.trim(),
          product_service:              data.product_service.trim() || null,
          campaign_goal:                data.campaign_goal.trim() || null,
          compensation_type:            data.compensation_type!,
          compensation_amount_fixed:    data.paid_structure === "fixed"           ? parseNum(data.compensation_amount_fixed)    : null,
          compensation_budget_min:      data.paid_structure === "range"           ? parseNum(data.compensation_budget_min)      : null,
          compensation_budget_max:      data.paid_structure === "range"           ? parseNum(data.compensation_budget_max)      : null,
          compensation_per_deliverable: data.paid_structure === "per_deliverable" ? parseNum(data.compensation_per_deliverable) : null,
          required_niches:              data.required_niches,
          min_followers:                parseIntStr(data.min_followers),
          required_country:             data.required_country.trim() || null,
          required_language:            data.required_language.trim() || null,
          required_platforms:           data.required_platforms,
          deadline:                     data.deadline || null,
          status:                       publish ? "active" : "draft",
          is_published:                 publish,
        })
        .select()
        .single();

      if (error) throw error;

      const delivs = data.deliverables
        .filter((d) => d.platform && d.content_type)
        .map((d, i) => ({
          campaign_id: campaign.id, platform: d.platform, content_type: d.content_type,
          quantity: d.quantity, notes: d.notes || null, display_order: i,
        }));

      if (delivs.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("campaign_deliverables").insert(delivs);
      }

      const assets = data.assets
        .filter((a) => a.url.trim())
        .map((a, i) => ({
          campaign_id: campaign.id, asset_type: a.asset_type,
          url: a.url.trim(), name: a.name.trim() || null, display_order: i,
        }));

      if (assets.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("campaign_assets").insert(assets);
      }

      toast.success(publish ? "Campaign published! It's live on MRKT Connect." : "Draft saved.");
      nav({ to: "/pipeline" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Loading role check ───────────────────────────────────────
  if (!roleChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-6 w-6 rounded-full animate-pulse" style={{ background: "oklch(1 0 0 / 12%)" }} />
      </div>
    );
  }

  // ── Creator blocked ──────────────────────────────────────────
  if (isCreator) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="px-6 h-16 flex items-center shrink-0" style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)" }}>
          <Link to="/"><Logo /></Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="max-w-md text-center">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 mb-8"
              style={{ background: "oklch(1 0 0 / 3.5%)", border: "1px solid oklch(1 0 0 / 10%)" }}
            >
              <span className="h-[5px] w-[5px] rounded-full" style={{ background: "oklch(0.84 0 0)" }} />
              <span className="text-[9px] font-medium uppercase tracking-[0.32em]" style={{ color: "oklch(1 0 0 / 42%)" }}>
                MRKT Connect
              </span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-[-0.04em] mb-4">
              Campaigns are for businesses
            </h1>
            <p className="text-[1rem] font-light leading-relaxed mb-10" style={{ color: "oklch(1 0 0 / 44%)" }}>
              Your creator account lets you browse campaigns, apply to collaborations, and manage your profile — not post campaigns.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/connect"
                className="btn-primary inline-flex items-center gap-2 rounded-full px-7 h-11 text-sm"
              >
                Browse Opportunities <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                to="/chat"
                className="inline-flex items-center gap-2 rounded-full px-7 h-11 text-sm transition-colors duration-150"
                style={{ background: "oklch(1 0 0 / 4%)", border: "1px solid oklch(1 0 0 / 10%)", color: "oklch(1 0 0 / 55%)" }}
              >
                Back to MRKT
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Incomplete business profile gate ────────────────────────
  if (roleChecked && !isCreator && bizProfile && !bizProfile.is_complete) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="px-6 h-16 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)" }}>
          <Link to="/chat"><Logo /></Link>
          <Link to="/chat" className="text-sm transition-colors duration-200" style={{ color: "oklch(1 0 0 / 32%)" }}>← Exit</Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="max-w-md text-center">
            <h1 className="font-display text-3xl font-bold tracking-[-0.04em] mb-4">
              Complete your Business Profile first.
            </h1>
            <p className="text-[1rem] font-light leading-relaxed mb-10" style={{ color: "oklch(1 0 0 / 44%)" }}>
              Your business information is attached to every campaign you post. Finish setting it up once — then creating campaigns takes under 60 seconds.
            </p>
            <Link
              to="/business/onboarding"
              className="btn-primary inline-flex items-center gap-2 rounded-full px-7 h-11 text-sm"
            >
              Complete Profile <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Form (5 steps — no business step) ───────────────────────

  const TOTAL     = 5;
  const progress  = (step / TOTAL) * 100;
  const stepTitles = [
    { eyebrow: `Step 01 of 0${TOTAL}`, headline: "The campaign.",           sub: "What are you launching and what do you need?" },
    { eyebrow: `Step 02 of 0${TOTAL}`, headline: "Compensation.",           sub: "Be direct. Creators see this before they open your campaign." },
    { eyebrow: `Step 03 of 0${TOTAL}`, headline: "Deliverables.",           sub: "Define exactly what you need creators to produce." },
    { eyebrow: `Step 04 of 0${TOTAL}`, headline: "Requirements & assets.",  sub: "Who should apply, and what do they need to know?" },
    { eyebrow: `Step 05 of 0${TOTAL}`, headline: "Review and publish.",     sub: "Everything looks right? Go live." },
  ];
  const current = stepTitles[step - 1];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="px-6 h-16 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid oklch(1 0 0 / 6%)" }}>
        <Link to="/chat"><Logo /></Link>
        <div className="flex items-center gap-4">
          {/* Show business name from profile so they know which account is posting */}
          {bizProfile?.company_name && (
            <span className="hidden sm:block text-[11px] uppercase tracking-[0.24em]" style={{ color: "oklch(1 0 0 / 28%)" }}>
              {bizProfile.company_name}
            </span>
          )}
          <Link to="/chat" className="text-sm transition-colors duration-200" style={{ color: "oklch(1 0 0 / 32%)" }}>
            ← Exit
          </Link>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-[2px] shrink-0" style={{ background: "oklch(1 0 0 / 5%)" }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%`, background: "oklch(1 0 0 / 55%)" }}
        />
      </div>

      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-6 py-14">
          <div className="mb-10">
            <div className="text-[10px] uppercase tracking-[0.32em] font-medium mb-4" style={{ color: "oklch(1 0 0 / 28%)" }}>
              {current.eyebrow}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-[-0.04em] leading-[1.06] mb-3">
              {current.headline}
            </h1>
            <p className="text-[1rem] font-light leading-relaxed" style={{ color: "oklch(1 0 0 / 44%)" }}>
              {current.sub}
            </p>
          </div>

          {step === 1 && <StepCampaign d={data} s={set} />}
          {step === 2 && <StepCompensation d={data} s={set} />}
          {step === 3 && (
            <StepDeliverables
              d={data}
              addDeliverable={addDeliverable}
              updateDeliverable={updateDeliverable}
              removeDeliverable={removeDeliverable}
            />
          )}
          {step === 4 && (
            <StepRequirements
              d={data} s={set}
              toggleNiche={toggleNiche}
              togglePlatform={togglePlatform}
              addAsset={addAsset}
              updateAsset={updateAsset}
              removeAsset={removeAsset}
            />
          )}
          {step === 5 && (
            <StepReview
              d={data} saving={saving}
              onPublish={() => submitCampaign(true)}
              onDraft={() => submitCampaign(false)}
            />
          )}

          {step < TOTAL && (
            <div className="mt-10 flex items-center justify-between">
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="inline-flex items-center gap-2 text-sm transition-colors duration-150"
                style={{ color: step === 1 ? "oklch(1 0 0 / 18%)" : "oklch(1 0 0 / 40%)" }}
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={() => setStep((s) => Math.min(TOTAL, s + 1))}
                disabled={!canProceed()}
                className="btn-primary inline-flex items-center gap-2 rounded-full px-7 h-11 text-sm"
                style={{ opacity: canProceed() ? 1 : 0.4 }}
              >
                Continue <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
