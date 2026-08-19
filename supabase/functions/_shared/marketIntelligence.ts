// ─────────────────────────────────────────────────────────────────────────────
// Market Intelligence — shared module (Phase 5)
//
// The external-signal counterpart to _shared/analytics.ts: analytics.ts owns
// internal business metrics (deterministic, computed from MRKT's own data),
// this module owns external market signals (deterministic scoring/dedup over
// real, cited web search results). Both are "zero AI, zero cost, self-
// documenting" for the parts that don't genuinely need judgment — the only
// LLM calls in the Market Intelligence pipeline are retrieval, classification,
// and synthesis (see market-intelligence-refresh/index.ts); everything in
// THIS file is plain, deterministic TypeScript. Confidence and relevance are
// never LLM-guessed numbers — they're weighted sums of real, inspectable
// signals, computed here.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Search families ──────────────────────────────────────────────────────────

export type SearchFamily =
  | "competitor_updates" | "industry_developments" | "consumer_behavior"
  | "seasonal_moments" | "category_trends" | "content_trends"
  | "local_market_changes" | "platform_algorithm_changes"
  | "pricing_offer_changes" | "partnership_opportunities";

export const ALL_FAMILIES: SearchFamily[] = [
  "platform_algorithm_changes", "competitor_updates", "pricing_offer_changes",
  "content_trends", "consumer_behavior", "industry_developments",
  "category_trends", "local_market_changes", "partnership_opportunities",
  "seasonal_moments",
];

// Cadence = how often a *live search* for this family may run, AND the basis
// for stale_after (a finding is "fresh/aging" within one cadence window of
// its own family, "stale" within two, "historical" beyond that) — one number,
// one source of truth for both cost control and freshness display. Ordered
// fastest→slowest per the brief: platform news moves fastest, seasonal
// intelligence slowest.
export const FAMILY_CADENCE_HOURS: Record<SearchFamily, number> = {
  platform_algorithm_changes: 24,
  competitor_updates:         72,
  pricing_offer_changes:      72,
  content_trends:             96,
  consumer_behavior:          168,  // 7d
  industry_developments:      168,
  category_trends:            168,
  local_market_changes:       168,
  partnership_opportunities:  240,  // 10d
  seasonal_moments:           336,  // 14d
};

// Hard cap on searches-per-run for this family — the built-in guard against
// uncontrolled query explosion, passed straight through as the Anthropic web
// search tool's `max_uses`.
export const FAMILY_MAX_USES: Record<SearchFamily, number> = {
  platform_algorithm_changes: 2,
  competitor_updates:         3,
  pricing_offer_changes:      2,
  content_trends:             2,
  consumer_behavior:          2,
  industry_developments:      2,
  category_trends:            2,
  local_market_changes:       2,
  partnership_opportunities:  2,
  seasonal_moments:           2,
};

export function staleAfterFor(family: SearchFamily, fetchedAt: Date): Date {
  return new Date(fetchedAt.getTime() + FAMILY_CADENCE_HOURS[family] * 3_600_000);
}

// ─── Categories → coarse UI type ─────────────────────────────────────────────

export type IntelligenceCategory =
  | "competitor_activity" | "industry_trend" | "consumer_trend" | "content_trend"
  | "pricing_offer_change" | "product_launch" | "partnership" | "campaign_creative_trend"
  | "platform_change" | "opportunity" | "threat" | "seasonal_signal"
  | "reputation_sentiment" | "market_movement";

export type IntelligenceType = "competitor" | "opportunity" | "threat" | "trend" | "market_signal";

const TYPE_BY_CATEGORY: Record<IntelligenceCategory, IntelligenceType> = {
  competitor_activity:    "competitor",
  industry_trend:         "trend",
  consumer_trend:         "trend",
  content_trend:          "trend",
  campaign_creative_trend:"trend",
  seasonal_signal:        "trend",
  pricing_offer_change:   "market_signal",
  product_launch:         "market_signal",
  partnership:            "market_signal",
  platform_change:        "market_signal",
  market_movement:        "market_signal",
  reputation_sentiment:   "market_signal",
  opportunity:            "opportunity",
  threat:                 "threat",
};

export function typeForCategory(category: IntelligenceCategory): IntelligenceType {
  return TYPE_BY_CATEGORY[category] ?? "market_signal";
}

// ─── Deterministic scoring ────────────────────────────────────────────────────
// A small, explicit allowlist — not a guess. Official first-party domains
// (business's own / a named competitor's own) always score highest; these are
// recognized third-party publications/platform newsrooms.
const REPUTABLE_DOMAINS = new Set([
  "reuters.com", "bloomberg.com", "forbes.com", "techcrunch.com", "wsj.com",
  "ft.com", "adweek.com", "marketingweek.com", "campaignlive.com", "thedrum.com",
  "businessinsider.com", "cnbc.com", "gulfnews.com", "thenationalnews.com",
  "arabianbusiness.com", "zawya.com", "meed.com",
  "business.instagram.com", "about.fb.com", "blog.google", "newsroom.tiktok.com",
  "blog.x.com", "youtube-creators.googleblog.com", "newsroom.snap.com",
]);

export function normalizeDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

export function sourceQualityScore(sourceDomain: string, businessOwnDomain: string | null, competitorDomain: string | null): number {
  const d = sourceDomain.toLowerCase();
  if (businessOwnDomain && d === businessOwnDomain.toLowerCase()) return 1.0;
  if (competitorDomain && d === competitorDomain.toLowerCase()) return 1.0;
  if (REPUTABLE_DOMAINS.has(d)) return 0.8;
  if (d.endsWith(".gov") || d.endsWith(".edu")) return 0.75;
  return 0.5;
}

export function recencyScore(publishedAt: Date | null, now: Date = new Date()): number {
  if (!publishedAt || isNaN(publishedAt.getTime())) return 0.4;
  const ageDays = (now.getTime() - publishedAt.getTime()) / 86_400_000;
  if (ageDays <= 7)   return 1.0;
  if (ageDays <= 30)  return 0.8;
  if (ageDays <= 90)  return 0.5;
  if (ageDays <= 365) return 0.3;
  return 0.15;
}

export function directnessScore(citedText: string | null | undefined): number {
  if (citedText && citedText.trim().length >= 20) return 1.0;
  if (citedText && citedText.trim().length > 0)   return 0.6;
  return 0.3;
}

export function corroborationScore(additionalSourceCount: number): number {
  return Math.min(Math.max(additionalSourceCount, 0), 3) / 3;
}

export function entityMatchScore(
  mentionedName: string | null,
  knownCompetitors: { name: string; aliases: string[] }[],
): number {
  if (!mentionedName) return 1.0; // not competitor-tagged — don't penalize a non-applicable dimension
  const norm = mentionedName.trim().toLowerCase();
  if (!norm) return 1.0;
  for (const c of knownCompetitors) {
    const names = [c.name, ...c.aliases].map((n) => n.toLowerCase()).filter(Boolean);
    if (names.includes(norm)) return 1.0;
    if (names.some((n) => n.length > 2 && (norm.includes(n) || n.includes(norm)))) return 0.6;
  }
  return 0.3;
}

export function computeConfidence(inputs: {
  sourceDomain: string;
  businessOwnDomain: string | null;
  competitorDomain: string | null;
  publishedAt: Date | null;
  citedText: string | null;
  additionalSourceCount: number;
  competitorMentionedName: string | null;
  knownCompetitors: { name: string; aliases: string[] }[];
}): number {
  const q = sourceQualityScore(inputs.sourceDomain, inputs.businessOwnDomain, inputs.competitorDomain);
  const r = recencyScore(inputs.publishedAt);
  const d = directnessScore(inputs.citedText);
  const c = corroborationScore(inputs.additionalSourceCount);
  const e = entityMatchScore(inputs.competitorMentionedName, inputs.knownCompetitors);

  const raw = 0.30 * q + 0.25 * r + 0.20 * d + 0.15 * c + 0.10 * e;
  return Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100;
}

export function confidenceLabel(c: number): "high" | "medium" | "low" {
  return c >= 0.75 ? "high" : c >= 0.5 ? "medium" : "low";
}

export function computeRelevance(inputs: {
  fromBusinessScopedQuery: boolean;
  competitorMatched: boolean;
  locationMentioned: boolean;
  keywordOverlapCount: number;
}): number {
  let score = inputs.fromBusinessScopedQuery ? 0.55 : 0.2;
  if (inputs.competitorMatched) score += 0.20;
  if (inputs.locationMentioned) score += 0.10;
  score += Math.min(Math.max(inputs.keywordOverlapCount, 0), 3) * 0.05;
  return Math.round(Math.min(1, score) * 100) / 100;
}

export type FreshnessState = "fresh" | "aging" | "stale" | "historical";

export function freshnessState(fetchedAt: Date, staleAfter: Date, now: Date = new Date()): FreshnessState {
  const windowMs  = Math.max(staleAfter.getTime() - fetchedAt.getTime(), 1);
  const elapsedMs = now.getTime() - fetchedAt.getTime();
  if (now.getTime() < staleAfter.getTime()) {
    return elapsedMs > windowMs * 0.7 ? "aging" : "fresh";
  }
  return elapsedMs < windowMs * 2 ? "stale" : "historical";
}

// ─── Deduplication ────────────────────────────────────────────────────────────

const DEDUPE_STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "for", "to", "and", "on", "at", "with",
  "new", "2025", "2026", "how", "why", "is", "are", "its",
]);

export function buildDedupeKey(category: string, sourceUrl: string, title: string): string {
  const domain = normalizeDomain(sourceUrl);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !DEDUPE_STOPWORDS.has(w))
    .sort();
  const fingerprint = words.slice(0, 8).join("-") || "untitled";
  return `${category}:${domain}:${fingerprint}`;
}

// ─── Business facts + search planning ────────────────────────────────────────

export interface BusinessFacts {
  businessId:     string;
  businessName:   string | null;
  industry:       string | null;
  category:       string | null; // industry, used as the "category" term in query templates
  location:       string | null;
  website:        string | null; // normalized domain
  targetAudience: string | null;
  platforms:      string[];
  competitors:    { name: string; aliases: string[]; domain: string | null }[];
}

// deno-lint-ignore no-explicit-any
export async function assembleBusinessFacts(supabase: any, businessId: string): Promise<BusinessFacts> {
  const [{ data: brand }, { data: campaign }, { data: competitorRows }] = await Promise.all([
    supabase.from("brand_knowledge")
      .select("products, services, target_audience, current_social_channels")
      .eq("business_user_id", businessId).maybeSingle(),
    supabase.from("campaigns")
      .select("business_name, business_industry, business_location, business_website")
      .eq("user_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("market_competitors")
      .select("name, aliases, domain")
      .eq("business_id", businessId).eq("status", "confirmed"),
  ]);

  const platforms = (brand?.current_social_channels ?? "")
    .split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean);

  return {
    businessId,
    businessName:   campaign?.business_name ?? null,
    industry:       campaign?.business_industry ?? null,
    category:       campaign?.business_industry ?? null,
    location:       campaign?.business_location ?? null,
    website:        campaign?.business_website ? normalizeDomain(`https://${campaign.business_website.replace(/^https?:\/\//, "")}`) : null,
    targetAudience: brand?.target_audience ?? null,
    platforms,
    competitors: (competitorRows ?? []).map((c: { name: string; aliases: string[] | null; domain: string | null }) => ({
      name: c.name, aliases: c.aliases ?? [], domain: c.domain,
    })),
  };
}

// Reconciles market_competitors.status='confirmed' rows against the live
// brand_knowledge.competitors free-text field. Live read-and-reconcile, not a
// one-time seed, because that field can be edited any time in Brand
// Knowledge. Never touches status='potential' rows.
// deno-lint-ignore no-explicit-any
export async function reconcileConfirmedCompetitors(supabase: any, businessId: string): Promise<void> {
  const { data: brand } = await supabase
    .from("brand_knowledge").select("competitors").eq("business_user_id", businessId).maybeSingle();

  const raw = (brand?.competitors ?? "").trim();
  if (!raw) return;

  const names = Array.from(new Set(
    raw.split(/[,;\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0 && s.length < 200),
  ));
  if (!names.length) return;

  for (const name of names) {
    await supabase.from("market_competitors").upsert(
      { business_id: businessId, name, status: "confirmed", source: "brand_knowledge", updated_at: new Date().toISOString() },
      { onConflict: "business_id,name", ignoreDuplicates: false },
    );
  }
}

type FamilyTemplate = (b: BusinessFacts) => string[] | null;

const FAMILY_TEMPLATES: Record<SearchFamily, FamilyTemplate> = {
  competitor_updates: (b) => b.competitors.length
    ? b.competitors.slice(0, 3).map((c) => `${c.name} new product OR campaign OR announcement 2026`)
    : null,
  pricing_offer_changes: (b) => b.competitors.length
    ? b.competitors.slice(0, 2).map((c) => `${c.name} pricing OR discount OR offer ${b.category ?? ""}`.trim())
    : null,
  industry_developments: (b) => b.category
    ? [`${b.category} industry news ${b.location ?? ""}`.trim()] : null,
  category_trends: (b) => b.category
    ? [`${b.category} trends 2026 ${b.location ?? ""}`.trim()] : null,
  consumer_behavior: (b) => (b.targetAudience || b.category)
    ? [`${b.targetAudience ?? b.category} consumer behavior trends`] : null,
  content_trends: (b) => b.category
    ? [`${b.category} content marketing trends ${b.platforms.join(" ")}`.trim()] : null,
  local_market_changes: (b) => b.location
    ? [`${b.category ?? b.industry ?? "business"} market news ${b.location}`.trim()] : null,
  platform_algorithm_changes: (b) => b.platforms.length
    ? [`${b.platforms.join(" ")} algorithm update 2026`] : null,
  partnership_opportunities: (b) => b.category
    ? [`${b.category} brand partnership OR collaboration ${b.location ?? ""}`.trim()] : null,
  seasonal_moments: (b) => (b.location || b.category)
    ? [`upcoming seasonal marketing moments ${b.location ?? b.category ?? ""}`.trim()] : null,
};

export interface SearchPlan {
  family:  SearchFamily;
  queries: string[];
}

export interface SkippedFamily {
  family: SearchFamily;
  reason: string;
}

// Never fills a skipped family with a generic query — a family with no valid
// business-derived input is simply not run.
export function planSearches(business: BusinessFacts, families: SearchFamily[]): { plans: SearchPlan[]; skipped: SkippedFamily[] } {
  const plans: SearchPlan[] = [];
  const skipped: SkippedFamily[] = [];
  for (const family of families) {
    const queries = FAMILY_TEMPLATES[family](business);
    if (queries && queries.length) plans.push({ family, queries });
    else skipped.push({ family, reason: "insufficient business data" });
  }
  return { plans, skipped };
}

// deno-lint-ignore no-explicit-any
export async function dueFamilies(supabase: any, businessId: string): Promise<SearchFamily[]> {
  const { data: cursors } = await supabase
    .from("market_intelligence_search_cursor")
    .select("search_family, next_eligible_at")
    .eq("business_id", businessId);

  const cursorMap = new Map<string, string>((cursors ?? []).map((c: { search_family: string; next_eligible_at: string }) => [c.search_family, c.next_eligible_at]));
  const now = Date.now();

  return ALL_FAMILIES.filter((family) => {
    const next = cursorMap.get(family);
    return !next || new Date(next).getTime() <= now;
  });
}

// ─── AI Marketing Team integration — the controlled intelligence summary ────

export interface IntelligenceSummaryItem {
  title:      string;
  summary:    string;
  evidence:   string;
  competitor: string | null;
  confidence: number;
  freshness:  FreshnessState;
}

export interface IntelligenceSummary {
  competitorMoves:     IntelligenceSummaryItem[]; // max 5
  topOpportunities:    IntelligenceSummaryItem[]; // max 3
  topThreats:          IntelligenceSummaryItem[]; // max 3
  relevantTrends:      IntelligenceSummaryItem[]; // max 3
  asOf:                string;
  totalActiveFindings: number;
}

interface RawFindingRow {
  type: IntelligenceType; category: string; title: string; summary: string; evidence: string;
  competitor_id: string | null; confidence: number; relevance: number;
  fetched_at: string; stale_after: string;
}

// One shared summary-builder, reused identically by any future consumer
// (marketing-hub-briefing today; Marketing Health / Reports later) — never
// hundreds of findings dumped into a prompt, always this same capped shape.
// deno-lint-ignore no-explicit-any
export async function buildIntelligenceSummary(supabase: any, businessId: string): Promise<IntelligenceSummary | null> {
  const { data: findings } = await supabase
    .from("market_intelligence_findings")
    .select("type, category, title, summary, evidence, competitor_id, confidence, relevance, fetched_at, stale_after")
    .eq("business_id", businessId).eq("status", "active")
    .order("relevance", { ascending: false })
    .limit(200);

  const rows = (findings ?? []) as RawFindingRow[];
  if (!rows.length) return null; // honest — caller must say "not enough verified market data yet"

  const now = new Date();
  const competitorNameById = new Map<string, string>();
  const competitorIds = Array.from(new Set(rows.map((r) => r.competitor_id).filter(Boolean))) as string[];
  if (competitorIds.length) {
    const { data: comps } = await supabase.from("market_competitors").select("id, name").in("id", competitorIds);
    for (const c of comps ?? []) competitorNameById.set(c.id, c.name);
  }

  const ranked = rows
    .map((f) => ({
      ...f,
      score: f.relevance * f.confidence,
      freshness: freshnessState(new Date(f.fetched_at), new Date(f.stale_after), now),
    }))
    .filter((f) => f.freshness !== "historical")
    .sort((a, b) => b.score - a.score);

  const toItem = (f: (typeof ranked)[number]): IntelligenceSummaryItem => ({
    title: f.title, summary: f.summary, evidence: f.evidence,
    competitor: f.competitor_id ? (competitorNameById.get(f.competitor_id) ?? null) : null,
    confidence: f.confidence, freshness: f.freshness,
  });

  return {
    competitorMoves:  ranked.filter((f) => f.type === "competitor").slice(0, 5).map(toItem),
    topOpportunities: ranked.filter((f) => f.type === "opportunity").slice(0, 3).map(toItem),
    topThreats:       ranked.filter((f) => f.type === "threat").slice(0, 3).map(toItem),
    relevantTrends:   ranked.filter((f) => f.type === "trend").slice(0, 3).map(toItem),
    asOf: now.toISOString(),
    totalActiveFindings: rows.length,
  };
}
