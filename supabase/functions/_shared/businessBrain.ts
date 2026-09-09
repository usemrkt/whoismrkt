// ─────────────────────────────────────────────────────────────────────────────
// Business Brain — Phase O's centralized, purpose-aware context retrieval.
//
// The ONE place every agent/edge function gets business context from — never
// let a caller independently query brand_knowledge/business_facts/analytics
// piecemeal (the exact anti-pattern this module exists to close, matching
// Phase N's own "don't let every edge function assemble arbitrary context"
// discipline in agencyWorkspace.ts).
//
// Layers, in retrieval-priority order (spec §11 — never violate this order):
//   1. Constraints — ALWAYS included in full, never budget-trimmed. A
//      business's stated limits (budget caps, prohibited claims, brand
//      restrictions) must never be crowded out by low-value learnings.
//   2. Canonical facts — read directly from brand_knowledge (still the
//      stable, untouched, user-authored source — Phase O does not migrate
//      or duplicate it) and cheap deterministic aggregates already computed
//      elsewhere (marketing health, recent market intelligence).
//   3. business_facts, filtered by purpose and budget-trimmed in priority
//      order: verified > measured > business_data/connected_source/
//      market_observed > ai_inferred (ai_inferred is cut first under budget
//      pressure — spec §11's explicit ordering).
//
// Freshness is a pure function, never a stored column (same precedent as
// Market Intelligence's own stale_after design) — an expired fact is
// filtered out at read time here, not flipped to 'stale' by a cron.
//
// Failure behavior (spec §36): brand_knowledge (canonical, task-critical)
// failing to load is a hard failure — the caller should not silently plan
// without it. business_facts/health/intelligence failing is non-fatal —
// recorded in `unavailableSources` and retrieval continues with reduced
// context, never silently pretending full context was available.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type BusinessFactCategory =
  | "brand" | "audience" | "products" | "competitors"
  | "marketing" | "constraints" | "performance" | "preference";

export type FactSourceType =
  | "user_stated" | "business_data" | "connected_source"
  | "measured" | "ai_inferred" | "market_observed" | "agent_learned";

export type Confidence = "verified" | "high" | "medium" | "low";

export interface BusinessFact {
  id: string;
  category: BusinessFactCategory;
  fact_key: string;
  statement: string;
  source_type: FactSourceType;
  confidence: Confidence;
  observed_at: string;
  expires_at: string | null;
  agent_key: string | null;
  mission_id: string | null;
}

// Every agent role this system knows about (mirrors agentRegistry.ts's
// AGENT_KEYS — kept as a separate literal union here rather than importing,
// since "which categories a purpose needs" is a Business Brain concern, not
// an agent-identity concern).
export type AgentPurpose =
  | "cmo" | "growth" | "content" | "social" | "creative"
  | "copy" | "performance" | "intelligence" | "lifecycle" | "analyst"
  // Phase P — the Meta Ads Specialist's own dedicated retrieval purpose
  // (spec §18's "meta_ads_strategy" example). Deliberately its own entry,
  // not an alias for 'performance' — a platform specialist needs
  // brand/product context (for creative/copy requirements) that the
  // cross-channel Performance Marketing Lead's own purpose doesn't pull.
  | "meta_ads";

// Which business_facts categories matter for each purpose. 'constraints' is
// deliberately omitted from every list below — it's unconditionally
// included for every purpose regardless (see getBusinessBrainContext).
const PURPOSE_CATEGORIES: Record<AgentPurpose, BusinessFactCategory[]> = {
  cmo:          ["brand", "audience", "products", "competitors", "marketing", "performance", "preference"],
  growth:       ["audience", "marketing", "performance", "competitors"],
  content:      ["brand", "audience", "products", "performance"],
  social:       ["brand", "audience", "performance"],
  creative:     ["brand", "audience", "products"],
  copy:         ["brand", "audience", "products", "performance"],
  performance:  ["audience", "marketing", "performance", "competitors"],
  intelligence: ["competitors", "marketing"],
  lifecycle:    ["audience", "marketing", "performance"],
  analyst:      ["performance", "marketing"],
  // brand/products — needed for creative + copy requirements the specialist
  // hands to Creative Director/Copywriter (spec §24); audience/competitors —
  // targeting + positioning; marketing/performance/preference — budget
  // constraints, prior campaign learnings, founder preferences (spec §18/19).
  meta_ads:     ["brand", "audience", "products", "competitors", "marketing", "performance", "preference"],
};

const SOURCE_PRIORITY: Record<FactSourceType, number> = {
  user_stated: 0, business_data: 1, connected_source: 1, measured: 2,
  market_observed: 3, agent_learned: 3, ai_inferred: 4,
};
const CONFIDENCE_PRIORITY: Record<Confidence, number> = { verified: 0, high: 1, medium: 2, low: 3 };

const DEFAULT_MAX_FACTS = 20;

// Pure, exported, directly-testable: excludes 'constraints' (retrieved
// separately, always in full — see getBusinessBrainContext), keeps only
// categories the given purpose cares about, then sorts by the spec §11
// priority order (source authority, then confidence, then recency).
// Budget-trimming (maxFacts) is applied by the caller, not here — this
// function's job is correct ORDER, not truncation.
export function selectAndRankFacts(allFacts: BusinessFact[], purpose: AgentPurpose): BusinessFact[] {
  const purposeCategories = new Set(PURPOSE_CATEGORIES[purpose] ?? []);
  const candidates = allFacts.filter((f) => f.category !== "constraints" && purposeCategories.has(f.category));

  return [...candidates].sort((a, b) => {
    const sp = SOURCE_PRIORITY[a.source_type] - SOURCE_PRIORITY[b.source_type];
    if (sp !== 0) return sp;
    const cp = CONFIDENCE_PRIORITY[a.confidence] - CONFIDENCE_PRIORITY[b.confidence];
    if (cp !== 0) return cp;
    return new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime();
  });
}

export interface BrandKnowledgeSummary {
  brand_description: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  competitors: string | null;
  marketing_goals: string | null;
  brand_guidelines: string | null;
  products: string | null;
  services: string | null;
}

export interface BusinessBrainContext {
  brand: BrandKnowledgeSummary | null;
  constraints: BusinessFact[]; // always full, never trimmed
  facts: BusinessFact[]; // purpose-filtered, budget-trimmed, excludes constraints (listed separately)
  recentHealthScore: number | null;
  recentFindings: { title: string; summary: string; category: string }[];
  unavailableSources: string[];
}

function isExpired(f: { expires_at: string | null }): boolean {
  return !!f.expires_at && new Date(f.expires_at).getTime() < Date.now();
}

function rowToFact(r: Record<string, unknown>): BusinessFact {
  return {
    id: r.id as string, category: r.category as BusinessFactCategory, fact_key: r.fact_key as string,
    statement: r.statement as string, source_type: r.source_type as FactSourceType,
    confidence: r.confidence as Confidence, observed_at: r.observed_at as string,
    expires_at: (r.expires_at as string) ?? null, agent_key: (r.agent_key as string) ?? null,
    mission_id: (r.mission_id as string) ?? null,
  };
}

export interface GetBusinessBrainContextOptions {
  maxFacts?: number;
}

export async function getBusinessBrainContext(
  supabase: SupabaseClient, businessId: string, purpose: AgentPurpose,
  opts: GetBusinessBrainContextOptions = {},
): Promise<BusinessBrainContext> {
  const maxFacts = opts.maxFacts ?? DEFAULT_MAX_FACTS;
  const unavailableSources: string[] = [];

  // ── Canonical, task-critical: brand_knowledge. Failure here is loud, not
  // silently degraded — every existing prompt already treats this as
  // required context, and Phase O doesn't change that bar.
  const { data: brandRow, error: brandErr } = await supabase
    .from("brand_knowledge")
    .select("brand_description, brand_voice, target_audience, competitors, marketing_goals, brand_guidelines, products, services")
    .eq("business_user_id", businessId)
    .maybeSingle();
  if (brandErr) throw new Error(`Business Brain: failed to load canonical brand context: ${brandErr.message}`);

  // ── Optional, degrade gracefully: recent marketing health + market intel.
  let recentHealthScore: number | null = null;
  let recentFindings: { title: string; summary: string; category: string }[] = [];
  try {
    const { data: health } = await supabase
      .from("marketing_health_snapshots").select("snapshot")
      .eq("business_id", businessId).order("period_start", { ascending: false }).limit(1).maybeSingle();
    recentHealthScore = health?.snapshot?.health?.overall?.score ?? null;
  } catch {
    unavailableSources.push("marketing_health");
  }
  try {
    const { data: findings } = await supabase
      .from("market_intelligence_findings").select("title, summary, category")
      .eq("business_id", businessId).eq("status", "active").order("created_at", { ascending: false }).limit(5);
    recentFindings = findings ?? [];
  } catch {
    unavailableSources.push("market_intelligence_findings");
  }

  // ── business_facts: constraints always in full, then purpose-filtered
  // and budget-trimmed for everything else.
  let allFacts: BusinessFact[] = [];
  try {
    const { data, error } = await supabase
      .from("business_facts").select("*")
      .eq("business_id", businessId).eq("status", "active")
      .order("observed_at", { ascending: false });
    if (error) throw error;
    allFacts = (data ?? []).map(rowToFact).filter((f: BusinessFact) => !isExpired(f));
  } catch {
    unavailableSources.push("business_facts");
  }

  const constraints = allFacts.filter((f) => f.category === "constraints");
  const candidateFacts = selectAndRankFacts(allFacts, purpose);

  return {
    brand: brandRow ?? null,
    constraints,
    facts: candidateFacts.slice(0, maxFacts),
    recentHealthScore,
    recentFindings,
    unavailableSources,
  };
}

// ── Prompt formatting — every caller wraps this exact block with
// wrapUntrustedBlock/withTrustBoundaryGuard as they already do for
// brand_knowledge; Business Brain content carries the same trust-boundary
// treatment, not a new one (see promptSafety.ts). ──────────────────────────
export function formatBusinessBrainForPrompt(ctx: BusinessBrainContext): string {
  const lines: string[] = [];
  if (ctx.brand) {
    lines.push(`Brand: ${ctx.brand.brand_description ?? "(not provided)"}`);
    if (ctx.brand.brand_voice) lines.push(`Brand voice: ${ctx.brand.brand_voice}`);
    if (ctx.brand.target_audience) lines.push(`Target audience (from Brand Knowledge): ${ctx.brand.target_audience}`);
  }
  if (ctx.constraints.length) {
    lines.push("Constraints (always binding):");
    for (const c of ctx.constraints) lines.push(`- ${c.statement} [${c.source_type}, ${c.confidence}]`);
  }
  if (ctx.facts.length) {
    lines.push("Relevant business knowledge:");
    for (const f of ctx.facts) lines.push(`- ${f.statement} [${f.source_type}, ${f.confidence}, ${f.category}]`);
  }
  if (ctx.recentHealthScore !== null) lines.push(`Current Marketing Health score: ${ctx.recentHealthScore}/100`);
  if (ctx.recentFindings.length) {
    lines.push("Recent market findings:");
    for (const f of ctx.recentFindings) lines.push(`- [${f.category}] ${f.title}: ${f.summary}`);
  }
  if (ctx.unavailableSources.length) {
    lines.push(`(Note: ${ctx.unavailableSources.join(", ")} unavailable this call — proceeding with reduced context.)`);
  }
  return lines.join("\n");
}
