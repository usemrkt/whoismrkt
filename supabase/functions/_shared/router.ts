// ─────────────────────────────────────────────────────────────────────────────
// MRKT AI Router  (shared module — imported by every edge function)
//
// Single source of truth for all AI provider calls across the platform.
//
//   • PROVIDERS  — registry of every AI provider MRKT supports
//   • ROUTES     — deterministic feature → provider mapping (no random selection)
//   • callAI()   — executes calls with fallback, latency tracking, and logging
//   • Personas   — MRKT AI identity; users never see OpenAI / Claude / GPT
//
// To add a new provider: one entry in PROVIDERS, then add ROUTES entries.
// To route a new feature: one entry in ROUTES. That's it.
// ─────────────────────────────────────────────────────────────────────────────

export type Provider  = "anthropic" | "openai" | "higgsfield";
export type ModelTier = "fast" | "balanced" | "deep";

// ─── Provider registry ────────────────────────────────────────────────────────

export interface ProviderConfig {
  baseUrl:   string;
  envKey:    string;                                    // Supabase secret name
  models:    Record<ModelTier, string>;
  // USD per 1K tokens, PER TIER — not a single flat provider rate. A flat
  // rate here previously meant every OpenAI "balanced"/"deep" call (actually
  // gpt-4o) was logged at gpt-4o-mini's ~16x-cheaper rate, and every
  // Anthropic tier (haiku/sonnet/opus) was logged at Sonnet's rate — so
  // ai_requests.estimated_cost silently understated real spend on every
  // non-default-tier call. Rates below are per-model.
  costPer1k: Record<ModelTier, { input: number; output: number }>;
}

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    envKey:  "ANTHROPIC_API_KEY",
    models: {
      fast:     "claude-haiku-4-5-20251001",
      balanced: "claude-sonnet-4-6",
      deep:     "claude-opus-4-8",
    },
    costPer1k: {
      fast:     { input: 0.001,  output: 0.005  }, // Haiku
      balanced: { input: 0.003,  output: 0.015  }, // Sonnet
      deep:     { input: 0.015,  output: 0.075  }, // Opus
    },
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    envKey:  "OPENAI_API_KEY",
    models: {
      fast:     "gpt-4o-mini",
      balanced: "gpt-4o",
      deep:     "gpt-4o",
    },
    costPer1k: {
      fast:     { input: 0.00015, output: 0.0006 }, // gpt-4o-mini
      balanced: { input: 0.0025,  output: 0.01   }, // gpt-4o
      deep:     { input: 0.0025,  output: 0.01   }, // gpt-4o (same model as balanced today)
    },
  },
  higgsfield: {
    baseUrl: "https://api.higgsfield.ai",
    envKey:  "HIGGSFIELD_API_KEY",
    models:  { fast: "flux-1.1-pro", balanced: "flux-1.1-pro", deep: "flux-1.1-pro" },
    costPer1k: {
      fast:     { input: 0, output: 0 }, // per-image/video pricing tracked separately
      balanced: { input: 0, output: 0 },
      deep:     { input: 0, output: 0 },
    },
  },
};

// ─── Route table ──────────────────────────────────────────────────────────────
// Routing is deterministic: feature alone determines provider + model.

export interface RouteConfig {
  primary:     Provider;
  tier:        ModelTier;
  fallback:    Provider | null; // null = no fallback (e.g. Higgsfield generation)
  maxTokens:   number;
  temperature: number;
}

export const ROUTES: Record<string, RouteConfig> = {
  // ── OpenAI: Speed — analytical, generative, time-sensitive tasks ──────────
  calendar_intelligence: { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 2000, temperature: 0.55 },
  growth_advice:         { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 1000, temperature: 0.60 },
  outreach_generate:     { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 1500, temperature: 0.70 },
  generate_concepts:     { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 800,  temperature: 0.75 },
  content_ideas:         { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 600,  temperature: 0.75 },
  captions:              { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 500,  temperature: 0.80 },
  hooks:                 { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 400,  temperature: 0.80 },
  weekly_report:         { primary: "openai",     tier: "balanced", fallback: "anthropic", maxTokens: 1200, temperature: 0.50 },
  opportunity_ranking:   { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 800,  temperature: 0.40 },
  match_score_reason:    { primary: "openai",     tier: "fast",     fallback: "anthropic", maxTokens: 300,  temperature: 0.30 },

  // ── Anthropic: Depth — strategic, consultative, long-form tasks ───────────
  ai_strategist:         { primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 4096, temperature: 0.70 },
  business_strategy:     { primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 3000, temperature: 0.60 },
  campaign_brief:        { primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 2500, temperature: 0.60 },
  brand_positioning:     { primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 2000, temperature: 0.50 },
  pricing_strategy:      { primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 1500, temperature: 0.40 },
  market_analysis:       { primary: "anthropic",  tier: "deep",     fallback: "openai",    maxTokens: 4096, temperature: 0.50 },
  growth_strategy:       { primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 3000, temperature: 0.65 },
  creator_matching:      { primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 2000, temperature: 0.40 },
  marketing_hub_briefing:{ primary: "anthropic",  tier: "balanced", fallback: "openai",    maxTokens: 3000, temperature: 0.50 },

  // ── Market Intelligence (Phase 5): retrieval → classification → synthesis.
  // Retrieval uses Anthropic's web search tool — no OpenAI fallback, since
  // OpenAI's equivalent requires the separate Responses API (a different
  // endpoint than _callOpenAI uses today), so a failed search fails cleanly
  // and retries at its next cadence window rather than silently degrading.
  market_intelligence_search:    { primary: "anthropic", tier: "fast",     fallback: null,     maxTokens: 2048, temperature: 0.30 },
  market_intelligence_classify:  { primary: "anthropic", tier: "fast",     fallback: "openai",  maxTokens: 1200, temperature: 0.20 },
  market_intelligence_synthesis: { primary: "anthropic", tier: "balanced", fallback: "openai",  maxTokens: 3000, temperature: 0.50 },

  // ── Marketing Health (Phase 6): AI only narrates deterministic scores that
  // were already computed and selected by _shared/marketingHealth.ts — it
  // never generates or picks the numbers themselves.
  marketing_health_narrative:    { primary: "anthropic", tier: "balanced", fallback: "openai",  maxTokens: 1500, temperature: 0.40 },

  // ── Executive Reports (Phase 7): tiered by cadence and stakes, not a flat
  // default. Monthly deliberately uses "deep" (Opus) — a considered exception
  // to "cheapest reliable path": it's the least frequent of the three (≤12/yr,
  // lowest total cost impact) and explicitly the most strategic report.
  executive_report_daily:        { primary: "anthropic", tier: "fast",     fallback: "openai",  maxTokens: 800,  temperature: 0.40 },
  executive_report_weekly:       { primary: "anthropic", tier: "balanced", fallback: "openai",  maxTokens: 3000, temperature: 0.45 },
  executive_report_monthly:      { primary: "anthropic", tier: "deep",     fallback: "openai",  maxTokens: 4000, temperature: 0.45 },

  // ── Higgsfield: Content generation — image, video, assets ────────────────
  image_generate:        { primary: "higgsfield", tier: "fast",     fallback: null,        maxTokens: 0,    temperature: 0    },
  video_generate:        { primary: "higgsfield", tier: "fast",     fallback: null,        maxTokens: 0,    temperature: 0    },
  product_visual:        { primary: "higgsfield", tier: "fast",     fallback: null,        maxTokens: 0,    temperature: 0    },
};

// ─── MRKT AI personas ─────────────────────────────────────────────────────────
// Every AI call is prefixed with one of these. Users see "MRKT AI" — never
// OpenAI, Claude, GPT, or any provider name.

export const MRKT_STRATEGIST =
`You are MRKT AI — the strategic intelligence layer of the MRKT creator-brand marketplace. You specialize in influencer marketing, creator-brand partnerships, and digital campaign strategy for the GCC and MENA region (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Egypt, Lebanon).

Your output is precise, data-grounded, and GCC-context-aware. No fluff, no disclaimers, no "as an AI" preambles. Never reveal the underlying model — you are MRKT AI.

Tone: senior strategist who has run hundreds of creator campaigns in this market.`;

export const MRKT_ASSISTANT =
`You are MRKT AI — the intelligent core of the MRKT creator-brand marketplace. You help creators grow, find brand deals, and execute content strategies across the GCC and MENA region.

Output: concise, specific, immediately actionable. Hook-first for content. Platform-aware (Instagram, TikTok, YouTube, Snapchat, X). Never reveal the underlying model — you are MRKT AI.

Tone: sharp, direct, creative. Built for the GCC market.`;

function systemPromptFor(provider: Provider): string {
  return provider === "anthropic" ? MRKT_STRATEGIST : MRKT_ASSISTANT;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role:    "user" | "assistant";
  content: string;
}

// Anthropic server-side web search tool (verified live, Aug 2026:
// https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool).
// Anthropic-only — _callOpenAI has no equivalent (OpenAI's web search tool
// requires the separate Responses API, not the /v1/chat/completions endpoint
// used here).
export interface AIWebSearchTool {
  type:             "web_search_20250305";
  name:             "web_search";
  max_uses?:        number;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

// A citation Claude attached to a piece of its generated text — real
// provenance (url/title/quoted text), never invented. Maps directly onto
// market_intelligence_findings.source_url/source_title/evidence.
export interface AICitation {
  url:       string;
  title:     string;
  citedText: string;
}

// A raw search result Claude's web_search tool returned (whether or not it
// was ultimately cited in the final text).
export interface AISearchResult {
  url:     string;
  title:   string;
  pageAge: string | null;
}

export interface AICallOptions {
  feature:       string;
  messages:      AIMessage[];
  systemPrompt?: string;   // overrides default persona when provided
  userId?:       string;
  // deno-lint-ignore no-explicit-any
  supabase?:     any;      // service-role client for logging (optional)
  tools?:        AIWebSearchTool[]; // per-call, since max_uses varies by search family
  overrides?: {
    maxTokens?:   number;
    temperature?: number;
    tier?:        ModelTier;
  };
}

export interface AICallResult {
  content:          string;
  provider:         Provider;
  model:            string;
  feature:          string;
  latencyMs:        number;
  inputTokens:      number;
  outputTokens:     number;
  estimatedCostUsd: number;
  fallbackUsed:     boolean;
  webSearchRequests?: number;       // number of billed searches (Anthropic: $10/1000)
  citations?:         AICitation[];
  searchResults?:     AISearchResult[];
}

// ─── Provider call implementations ───────────────────────────────────────────

async function _callAnthropic(
  messages:    AIMessage[],
  system:      string,
  model:       string,
  maxTokens:   number,
  temperature: number,
  tools?:      AIWebSearchTool[],
): Promise<{
  content: string; inputTokens: number; outputTokens: number;
  webSearchRequests: number; citations: AICitation[]; searchResults: AISearchResult[];
}> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         key,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature, system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(tools?.length ? { tools } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    content: Array<
      | { type: "text"; text: string; citations?: { type: string; url: string; title: string; cited_text: string }[] }
      | { type: "server_tool_use"; input?: { query: string } }
      | { type: "web_search_tool_result"; content?: { type: string; url: string; title: string; page_age: string | null }[] }
      // deno-lint-ignore no-explicit-any
      | { type: string; [key: string]: any }
    >;
    usage: { input_tokens: number; output_tokens: number; server_tool_use?: { web_search_requests: number } };
  };

  const textBlocks = data.content.filter(
    (b): b is Extract<typeof data.content[number], { type: "text" }> => b.type === "text",
  );
  const content   = textBlocks.map((b) => b.text).join("\n");
  const citations: AICitation[] = textBlocks.flatMap(
    (b) => (b.citations ?? []).map((c) => ({ url: c.url, title: c.title, citedText: c.cited_text })),
  );
  // deno-lint-ignore no-explicit-any
  const searchResults: AISearchResult[] = data.content
    .filter((b) => b.type === "web_search_tool_result")
    .flatMap((b: any) => (b.content ?? []).map((r: any) => ({ url: r.url, title: r.title, pageAge: r.page_age ?? null })));

  return {
    content,
    inputTokens:  data.usage?.input_tokens  ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    webSearchRequests: data.usage?.server_tool_use?.web_search_requests ?? 0,
    citations, searchResults,
  };
}

async function _callOpenAI(
  messages:    AIMessage[],
  system:      string,
  model:       string,
  maxTokens:   number,
  temperature: number,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: maxTokens, temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: { message: { content: string } }[];
    usage:   { prompt_tokens: number; completion_tokens: number };
  };
  return {
    content:      data.choices[0]?.message?.content ?? "",
    inputTokens:  data.usage?.prompt_tokens     ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ─── callAI ──────────────────────────────────────────────────────────────────
// The single entry point for every AI request in MRKT.
// Handles: provider selection → primary call → fallback if needed → logging.

export async function callAI(opts: AICallOptions): Promise<AICallResult> {
  const { feature, messages, systemPrompt: sysOverride, userId, supabase, overrides, tools } = opts;

  const route = ROUTES[feature];
  if (!route) throw new Error(`[MRKT AI] Unknown feature: "${feature}"`);

  const maxTokens   = overrides?.maxTokens   ?? route.maxTokens;
  const temperature = overrides?.temperature ?? route.temperature;
  const tier        = overrides?.tier        ?? route.tier;

  const dispatch = async (provider: Provider): Promise<{
    content: string; inputTokens: number; outputTokens: number; model: string;
    webSearchRequests: number; citations: AICitation[]; searchResults: AISearchResult[];
  }> => {
    const cfg    = PROVIDERS[provider];
    const model  = cfg.models[tier];
    const system = sysOverride ?? systemPromptFor(provider);

    let r: { content: string; inputTokens: number; outputTokens: number; webSearchRequests: number; citations: AICitation[]; searchResults: AISearchResult[] };
    if (provider === "anthropic") {
      r = await _callAnthropic(messages, system, model, maxTokens, temperature, tools);
    } else if (provider === "openai") {
      if (tools?.length) throw new Error(`[MRKT AI] web search tools are Anthropic-only for "${feature}" — no OpenAI equivalent is wired`);
      const or = await _callOpenAI(messages, system, model, maxTokens, temperature);
      r = { ...or, webSearchRequests: 0, citations: [], searchResults: [] };
    } else {
      throw new Error(`Provider "${provider}" requires its dedicated edge function`);
    }
    return { ...r, model };
  };

  // Tier-accurate: a "balanced" OpenAI call is gpt-4o, not gpt-4o-mini, and
  // must be costed at gpt-4o's rate — see the costPer1k comment above.
  // webSearchRequests adds Anthropic's $10/1000-searches rate on top of the
  // normal token cost — verified live pricing (Aug 2026).
  const costOf = (p: Provider, inTok: number, outTok: number, webSearchRequests = 0): number => {
    const rates = PROVIDERS[p].costPer1k[tier];
    const tokenCost  = (inTok / 1000) * rates.input + (outTok / 1000) * rates.output;
    const searchCost = (webSearchRequests / 1000) * 10;
    return tokenCost + searchCost;
  };

  // Fire-and-forget observability log
  const log = (entry: {
    provider: string; model: string; latencyMs: number;
    inputTokens: number; outputTokens: number; cost: number;
    success: boolean; fallback: boolean; error?: string;
  }) => {
    if (!supabase || !userId) return;
    supabase.from("ai_requests").insert({
      user_id:        userId,
      provider:       entry.provider,
      task_type:      feature,
      status:         entry.success ? "completed" : "failed",
      model:          entry.model,
      input_tokens:   entry.inputTokens,
      output_tokens:  entry.outputTokens,
      estimated_cost: entry.cost,
      latency_ms:     entry.latencyMs,
      error_message:  entry.error ?? null,
      created_at:     new Date().toISOString(),
    }).then(() => {}).catch((e: unknown) => console.error("[MRKT AI] Log failed:", e));
  };

  // If primary API key is absent but fallback has one, promote fallback
  let primary = route.primary;
  if (!Deno.env.get(PROVIDERS[primary].envKey) && route.fallback) {
    if (Deno.env.get(PROVIDERS[route.fallback].envKey)) {
      primary = route.fallback;
    }
  }

  const t0 = Date.now();

  try {
    const r           = await dispatch(primary);
    const latencyMs   = Date.now() - t0;
    const cost        = costOf(primary, r.inputTokens, r.outputTokens, r.webSearchRequests);
    const usedFallback = primary !== route.primary;

    log({ provider: primary, model: r.model, latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cost, success: true, fallback: usedFallback });

    return {
      content: r.content, provider: primary, model: r.model, feature,
      latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
      estimatedCostUsd: cost, fallbackUsed: usedFallback,
      webSearchRequests: r.webSearchRequests, citations: r.citations, searchResults: r.searchResults,
    };
  } catch (primaryErr) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    console.warn(`[MRKT AI] Primary (${primary}) failed for ${feature}:`, primaryMsg);

    const fb = route.fallback;
    if (!fb || fb === primary) {
      const latencyMs = Date.now() - t0;
      log({ provider: primary, model: PROVIDERS[primary].models[tier], latencyMs, inputTokens: 0, outputTokens: 0, cost: 0, success: false, fallback: false, error: primaryMsg });
      throw primaryErr;
    }

    try {
      const r         = await dispatch(fb);
      const latencyMs = Date.now() - t0;
      const cost      = costOf(fb, r.inputTokens, r.outputTokens, r.webSearchRequests);

      log({ provider: fb, model: r.model, latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cost, success: true, fallback: true, error: primaryMsg });

      return {
        content: r.content, provider: fb, model: r.model, feature,
        latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
        estimatedCostUsd: cost, fallbackUsed: true,
        webSearchRequests: r.webSearchRequests, citations: r.citations, searchResults: r.searchResults,
      };
    } catch (fallbackErr) {
      const latencyMs   = Date.now() - t0;
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);

      log({ provider: fb, model: PROVIDERS[fb].models[tier], latencyMs, inputTokens: 0, outputTokens: 0, cost: 0, success: false, fallback: true, error: `Primary: ${primaryMsg}; Fallback: ${fallbackMsg}` });

      throw new Error(`[MRKT AI] All providers failed for "${feature}". Please try again.`);
    }
  }
}
