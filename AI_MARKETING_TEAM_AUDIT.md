# AI Marketing Team — Technical Audit (v2)

**Date:** 2026-08-18 · **Supersedes:** v1 (same file, same day — v1's findings are preserved and deepened below, not contradicted).
**Status:** Phase 4A (Content Studio move) is shipped, deployed, committed (`18e973f`) — untouched by this document. This document is **Phase 4B**: audit only. No production code changed as part of writing this. That's a deliberate choice, not an oversight — see §9 for why.
**Method:** Direct read of production source (`marketing-hub-briefing/index.ts`, `chat/index.ts`, `_shared/router.ts`) plus a live query of the actual Supabase schema (`information_schema.tables`/`.columns` against the linked production project — 68 tables enumerated, not estimated) and a `grep` sweep of every edge function and route for each table's real writers. Where I say a table is "dormant," I mean I searched every `.ts`/`.tsx` file in the repo for a reference to it and found none beyond its own migration — not that I assume it's unused.

---

## 1. The full data flow, traced end to end

```
Database (11 real tables, one Postgres view)
  ↓  Promise.all — 8 parallel queries, marketing-hub-briefing/index.ts:106-137
Fetch
  ↓  application counts grouped by campaign+status, contract status derived, index.ts:139-195
Transformation (deterministic, zero AI)
  ↓  facts[] — 15 plain-English strings, one per real number, index.ts:259-275
Prompt construction
  ↓  single string template, index.ts:277-298 (quoted in full, §3)
AI provider call
  ↓  callAI({ feature: "marketing_hub_briefing", ... }), _shared/router.ts:253-365
Model
  ↓  Anthropic claude-sonnet-4-6, temperature 0.50, max 3000 tokens (fallback: OpenAI gpt-4o)
Response parsing
  ↓  strip markdown fences, JSON.parse, index.ts:313-320 — on parse failure, 502 to the client, nothing cached
Caching
  ↓  upsert into marketing_hub_briefings (user_id, period_start unique) + fan-out into ai_recommendations, index.ts:322-359
Marketing Hub UI
  ↓  src/lib/marketingHub.ts context → Dashboard / Marketing Team / Campaign Center / Growth sections
```

This is the **entire** AI Marketing Team pipeline. There is one AI call (`marketing_hub_briefing`) that produces every department's text. There is no second call, no per-department agent, no inter-department "conversation" — the org-chart framing in the UI (`marketing-hub.team.tsx`) is a presentation layer over five fields of one JSON response.

---

## 2. Fact vs. inference — applied to what's actually shown today

| Category | Definition | Where it appears today |
|---|---|---|
| **Observed fact** | Retrieved directly, zero computation | `action_center` items ("3 new applicants awaiting review"), Campaign Center's per-campaign application counts, `performance_highlights` when populated |
| **Computed fact** | Deterministic math over real rows | `nextActionFor()` (Campaign Center's next-best-action), win/rehire rate *if* `match_outcomes` had rows (§5 — it doesn't), `business_trust_scores` (real Postgres function + triggers) |
| **AI interpretation** | Model reasons over real evidence | `departments.*` report text, `health.summary` |
| **AI recommendation** | Model proposes an action from evidence | `weekly_priorities`, `opportunities`, `campaign_suggestions` |
| **Unsupported speculation** | Stated without evidence | **None found in the current prompt or UI.** The prompt explicitly forbids it (`"Use ONLY the facts below — never invent numbers"`), and where evidence is absent the instructed behavior is to say so (`"if there's nothing real to report... say that plainly"`). This was verified, not assumed — see the two live-tested fixes in §9. |

**The honest caveat**: "AI interpretation" and "AI recommendation" here are grounded in *aggregate counts*, not granular evidence. The model knows "0 campaigns," not "campaign X underperformed campaign Y by Z% because of these specific posts." That finer evidence doesn't exist in the data (§6). So today's outputs are never speculation, but they're also not yet the fully evidence-cited format your example describes (`Evidence: 8 reels... 19 static posts...`) — because the underlying per-item metrics needed to write that evidence don't exist yet. §8 designs how to get there for the categories where it's possible now.

---

## 3. The `marketing_hub_briefing` AI call, audited in full

| | |
|---|---|
| **Data payload (context)** | 15 fact strings max (`index.ts:259-275`), each capped at 200 chars where user-authored (brand fields) — business identity/industry, trust score+tier, campaign count, application breakdown, contract count+awaiting-signature, deliverables pending, match rate (currently always "no history yet," §5), unread messages, upcoming content count, and whichever of target audience/goals/budget/challenges/growth channels/competitors the business filled into Brand Knowledge. |
| **Approx. context size** | ~400–900 tokens depending on how much Brand Knowledge is filled in — small. This is intentionally lean; it's a briefing, not a document analysis. |
| **System prompt** | None passed explicitly — `callAI` defaults to `MRKT_STRATEGIST` (`_shared/router.ts:118-123`), a fixed persona ("senior strategist... GCC/MENA context... never reveal the underlying model"). |
| **User prompt** | The full template is in `index.ts:277-298` — opens with `"You are the AI Marketing Team... Use ONLY the facts below — never invent numbers... writing AS the team"`, lists the facts, then specifies the exact JSON shape required (health, departments×5, weekly_priorities, opportunities, campaign_suggestions, performance_highlights, competitor_notes), closing with `"Every 'why' must cite a specific fact above... if there's nothing real to report for a department... say that plainly rather than filling space."` |
| **Model / provider** | Anthropic `claude-sonnet-4-6` (balanced tier), fallback OpenAI `gpt-4o` on failure — `_shared/router.ts:99,107`. |
| **Temperature** | 0.50 (`router.ts:107`) — mid-range; low enough to stay grounded, not so low the five department voices read identically. |
| **Response schema** | Strict JSON, enforced by prompt instruction only (no JSON-mode/schema parameter in the Anthropic call — `_callAnthropic`, `router.ts:171-208`, sends a plain `messages` array, no `tools`/`response_format`). Parse failures are caught and return a 502, nothing is cached or shown to the user on a malformed response. |
| **Token usage — real, measured** | From actual `ai_requests` rows generated during this project's own live testing (not an estimate): **546 input / 1019 output tokens** on a first (uncached) generation for a near-empty test account; a richer account with more Brand Knowledge filled in would run somewhat higher on input, capped by `maxTokens: 3000` on output. |
| **Cost — real, measured** | **$0.0169–$0.0341** per generation (two real observed calls), against a $0.05 credit-equivalent (10 credits × $0.005) — healthy margin, consistent with the codebase's own documented cost model in `src/lib/aiCredits.ts`. |
| **Cache behavior** | One row per `(user_id, period_start)` in `marketing_hub_briefings`, `period_start` = today's date server-side. A plain load hits cache; `force_refresh: true` bypasses it and re-upserts. Verified live: repeat loads cost zero additional credits, confirmed by comparing `ai_requests` row counts before/after. |
| **Refresh conditions** | Daily boundary (midnight UTC, via date string) or explicit user-triggered refresh. No automatic mid-day refresh — a business's counts can go stale by up to 24h between visits (e.g., a new applicant won't appear in `weekly_priorities` until the next generation, though `action_center`, built fresh every call regardless of cache, *would* show it immediately). |
| **Credit behavior** | `consume_ai_credits(user_id, 10)` RPC, atomic/row-locked, fails closed (502 → user sees "unable to verify credits" rather than a free generation) — called *only* on cache miss, never on a cache hit, confirmed live. |
| **Failure behavior** | AI call failure → 503 to client, no partial/fabricated briefing ever shown. JSON parse failure → 502, same. Both leave the previous day's cached briefing (if any) as the last-known-good state in the UI rather than replacing it with an error state — actually worth double-checking: on the client, an error sets `error` state and shows a retry banner rather than silently keeping stale data, which is correct (no partially-failed strategist output ever appears as complete). |

**What this means for "how much does the AI Marketing Team actually know"**: about 15 real numbers and whatever the business chose to type into Brand Knowledge. That's a small, honest context — not a large document analysis. The five department "voices" are the same model reasoning over the same 15 facts from five different angles, not five specialists with different information access.

---

## 4. Data coverage audit — the whole schema, not just what's already wired

I queried the live production schema directly: **68 tables**. Below is every one that's plausibly relevant to a business's marketing, sorted by whether it's actually feeding the AI Marketing Team today.

### Currently used by `marketing-hub-briefing`
`campaigns`, `campaign_applications`, `contracts`, `campaign_deliverable_submissions`, `match_outcomes` (schema only — see below), `conversation_participants`, `content_planner_items`, `brand_knowledge`, `business_profiles`/`business_trust_scores` (via the `business_intelligence` view), `profiles`.

### Real, actively populated, and currently NOT fed to the AI — the highest-leverage gap
| Table | What's really in it | Populated by |
|---|---|---|
| `reviews` | Real 9-axis ratings (communication, professionalism, reliability, content quality, timeliness, brief quality, responsiveness, payment reliability) + written review, tied to a campaign | `profile.index.tsx`, `pipeline.tsx`, `applications.tsx` — genuine post-collaboration feedback |
| `campaign_payments` | Real Stripe-backed financial records — gross amount, platform fee, creator net, status, `paid_at` | `stripe-webhook`, `stripe-checkout` — actual money movement, not estimates |
| `generated_assets` | Every Content Studio generation — prompt, asset type, status, credits used, timestamp | `higgsfield-generate`, `higgsfield-status`, used by `create.tsx`/`content-planner.tsx` |
| `ai_chat_messages` / `chats` | The business's own history of questions asked to the AI Strategist | `chat.tsx` |
| `projects` / `project_saved_creators` / `project_campaign_briefs` / `project_outreach_drafts` | The Projects/CRM pipeline — saved creators, draft briefs, outreach history | `pipeline.tsx` and related routes |
| `marketplace_events` | An append-only event log (application submitted, deliverable events, etc.) with `event_type` + FKs to application/campaign/contract/deliverable | Referenced across the marketplace flow |

None of these are in the 15-fact list in §3. A business's actual review history, real payment records, and content-production history currently have **zero influence** on what the AI Marketing Team says.

### Real schema, real (correct) writer code — but never actually invoked in production
This is the pattern worth the most attention, because it's not "missing," it's **built and dormant**:

| Table | Purpose (from schema) | Writer exists? | Actually triggered? |
|---|---|---|---|
| `match_outcomes` | Per-creator-match funnel outcomes (shortlisted→accepted→contract→paid→rehired) | **No** — no INSERT anywhere in the codebase | Never |
| `campaign_health_scores` | Literally a pre-built per-campaign health score (`score`, `applications_score`, `creator_quality_score`, `response_speed_score`, `completion_score`, `engagement_score`, `avg_creator_trust`, `verified_applicants`) | **No** — created in one migration, referenced nowhere else | Never |
| `business_daily_metrics` | Daily snapshots (applications received, active campaigns, creators shortlisted, messages sent, pipeline updates) — exactly the historical-trend data needed for "compared to last week" | **Yes** — `compute-daily-metrics` edge function has complete, correct logic | **No** — not on any `cron.schedule` (checked both cron jobs in the repo: `weekly-digest` and `cleanup-ai-requests`, neither calls it) and not invoked from the frontend anywhere |

This is a striking finding: **`campaign_health_scores` is, by name and by column list, exactly the "Campaign Health" category the Marketing Health phase needs — and it already exists, unpopulated.** Wiring its computation (and `business_daily_metrics`'s cron trigger) is materially cheaper than designing a new scoring system from scratch.

### Schema-only, no real integration behind it
| Table | Reality |
|---|---|
| `connected_accounts` | Columns literally named `access_token_placeholder`/`refresh_token_placeholder` — this is a planned-but-never-built OAuth table, referenced nowhere outside generated types. Confirms Paid Ads/SEO/social integrations are correctly shown as "not connected" today — there's no partial wiring to surface instead. |
| `content_calendar` | A second, older content-calendar table, referenced nowhere outside generated types — superseded by `content_planner_items`. Dead, not a data source. |

---

## 5. Missing integrations — what each would unlock, and what it costs

| Integration | Unlocks | Department | Business value | Difficulty | Access constraints | Recurring cost |
|---|---|---|---|---|---|---|
| **Instagram/Meta Graph API (Insights)** | Real post-level engagement, follower growth, reach | Content, Analytics | Closes the single biggest gap in this audit — real content performance | Medium — official API, but requires the business to complete Meta's Business/App Review for `instagram_manage_insights` | Business must connect their own IG Business account; Meta review can take days–weeks | Free (API), engineering time only |
| **Meta Ads API** | Real spend, CPM/CPC/ROAS, audience data | Growth (Paid Ads dept) | Turns "Paid Ads: not connected" into a real department | Medium-high — ad account access + Meta review | Business must grant ad-account read access | Free (API); Meta may require min. ad spend history to unlock some insights |
| **Google Ads API** | Same, for Google/YouTube spend | Growth | Same | Medium-high | OAuth + a Google Ads "developer token" (Google approval process, can be slow for small apps) | Free (API) |
| **GA4** | Website traffic, conversion events, funnel drop-off | Analytics, Content | Real "how do I acquire more customers" data, not proxy signals | Medium — GA4 Data API is well-documented, OAuth per-business | Business must have GA4 already set up on their site | Free |
| **Search Console** | Real search queries, impressions, ranking positions | Growth (SEO dept) | Turns "SEO: not connected" into a real department | Low-medium — simpler API than GA4 | Business must own/verify the property | Free |
| **TikTok for Business API** | Video performance, audience | Content, Analytics | Same value as Instagram, for TikTok-first brands | Medium — TikTok's business API access is more restrictive/slower to approve than Meta's | App review, business account required | Free (API) |
| **Shopify / e-commerce** | Real revenue, order volume, repeat-purchase rate | Analytics (Conversion/Retention) | Directly answers "how do I make more money" with real revenue, not a proxy | Medium — Shopify Admin API is straightforward; other platforms vary | Business must connect their store | Free (API); Shopify plan tier may gate some endpoints |
| **Email marketing (Klaviyo/Mailchimp)** | Open/click rates, list growth, retention signals | Growth (Retention) | Real retention-channel data | Low-medium — most have clean REST APIs | OAuth or API key per business | Usually free API access at read tier |
| **CRM (HubSpot, or MRKT's own `projects` table used harder)** | Customer/lead lifecycle data | Analytics | "Retain customers" becomes answerable with real data | Low if leaning on existing `projects`/`leads` tables further; medium for a real third-party CRM integration | Depends on provider | Varies |
| **Live web search (competitor/market intel)** | Real current competitor activity, trends | Strategy, Growth | Already decided in principle — see §7 for the validated architecture | Low (already in the same provider) | None beyond Anthropic's own tool availability | ~$10/1,000 searches, metered per use |

**Recommended order, by leverage vs. effort**: (1) wire the dormant infrastructure that already exists — `match_outcomes`, `campaign_health_scores`, `business_daily_metrics` cron — before any new integration, since it's strictly cheaper and closes the exact gap the audit found; (2) Instagram Insights, since content performance is the single most-requested, most-referenced-in-the-brief missing category; (3) GA4 + Search Console, since together they answer "acquire customers" and "SEO" with real data at relatively low integration cost; (4) Meta/Google Ads once the business base has enough ad spend history for it to be worth the heavier OAuth lift.

---

## 6. Provider strategy — re-verified, not assumed

Checked the actual `ROUTES` table (`_shared/router.ts:85-113`) against real model IDs, not assumed defaults:

| Provider | Models actually configured | Used for |
|---|---|---|
| Anthropic | `claude-haiku-4-5-20251001` (fast), `claude-sonnet-4-6` (balanced), `claude-opus-4-8` (deep) | Long-form strategic synthesis: `marketing_hub_briefing`, `ai_strategist`, `business_strategy`, `growth_strategy`, `market_analysis` (deep/Opus — the only deep-tier route in the table), `brand_positioning`, `campaign_brief`, `pricing_strategy`, `creator_matching` |
| OpenAI | `gpt-4o-mini` (fast), `gpt-4o` (balanced/deep — deep is currently the same model as balanced) | Fast structured generation: `captions`, `hooks`, `content_ideas`, `generate_concepts`, `outreach_generate`, `calendar_intelligence`, `weekly_report`, `opportunity_ranking`, `match_score_reason` |
| Higgsfield | `flux-1.1-pro` | Image/video only |

**This already matches the brief's own stated principle** — deterministic stays deterministic (trust scores, action center, next-best-action are plain SQL/JS, zero LLM calls, confirmed in §1 and §3), long-form reasoning is Anthropic, fast/structured/high-volume is OpenAI. I looked for a task currently on the wrong provider and didn't find one. The one real gap isn't provider choice, it's that **`market_analysis` (the one route already set up for deep, expensive reasoning) has no real external-market data to reason over yet** — it's Opus-tier reasoning with today's same 15-fact context, i.e., the most expensive model applied to the same thin input as everything else. That's a data problem, not a provider problem — fixing §5/§7 makes that route's existing provider choice actually pay for itself.

**One recommendation worth flagging**: once `campaign_health_scores`/`business_daily_metrics` are wired (§4) and feed richer, more numerous facts into the briefing, it may be worth moving `marketing_hub_briefing` itself from `balanced` to `deep` tier (Opus) — a genuinely CMO-quality synthesis over 30+ real data points justifies the added cost more than the current 15-fact version does. Not recommended yet, since the input isn't there.

---

## 7. Analytics must be real analytics — the engine design

Current state, stated plainly: **Analytics today is not an engine, it's two numbers** (win rate, rehire rate) that are always null because `match_outcomes` is never written to (§4). Everything else it "reports" is actually Strategy's facts restated. This is exactly the anti-pattern named in your brief (`Small Data Payload → LLM → Made-Up Analytics`) — except, credit where due, the current code doesn't paper over the gap with a made-up number; it correctly says "no history yet." The fix isn't to stop the LLM from inventing (it already doesn't) — it's to give it something real to interpret.

**Deterministic metrics computable *today*, from data that already exists and is already populated** (no new integration required — just new queries, all zero-AI-cost):

| Metric | Formula | Source (all real, already populated) |
|---|---|---|
| Campaign fill rate | applications received ÷ campaigns published | `campaigns`, `campaign_applications` |
| Creator acceptance rate | `accepted` ÷ total applications | `campaign_applications` |
| Deadline adherence | submissions where `submitted_at` ≤ deliverable due date ÷ total submissions | `campaign_deliverable_submissions`, `campaign_deliverables` |
| Contract conversion | signed contracts ÷ contracts sent | `contracts` |
| Budget utilization | `campaign_payments` paid amount ÷ campaign's stated budget | `campaign_payments`, `campaigns` |
| Repeat creator rate | creators appearing on >1 contract for the same business | `contracts`, grouped by creator |
| Review-based quality | average `rating` (and sub-ratings) across a business's completed campaigns | `reviews` |
| Content production volume/consistency | count + cadence of `generated_assets` and `content_planner_items` over trailing 30 days | `generated_assets`, `content_planner_items` |
| Average campaign duration | `completed_at`-equivalent minus `created_at` per closed campaign | `campaigns` |
| Campaign velocity | campaigns launched per month, trailing 3 months | `campaigns.created_at` |

**Architecture (matches your stated principle exactly)**:
```
Real Data → Analytics Engine (deterministic SQL/TS, zero AI, computed server-side) → AI Interpretation (existing single call, now given richer real facts)
```
Concretely: add these as a new deterministic aggregation step in `marketing-hub-briefing` (same pattern as today's `facts[]` array, just more of it, all zero-cost), which both (a) directly powers a real Analytics department report instead of "no history yet," and (b) becomes the evidence base for weekly priorities/opportunities to cite specific numbers instead of just campaign/application counts. This requires no new integration, no new AI call, and no schema changes beyond wiring `match_outcomes`/`campaign_health_scores` writers (§4) — it's the highest-leverage, lowest-risk change identified in this whole audit.

---

## 8. Evidence-backed recommendations — proposed structure

Today `ai_recommendations.meta` is a small jsonb (`{link, department, period_start}`). Extending it with an `evidence: string[]` array is additive and backward-compatible:

```json
{
  "title": "Increase short-form content frequency",
  "explanation": "Short-form content is outperforming static content while production frequency has declined.",
  "action": "Produce three reels this week.",
  "meta": {
    "link": "/content-planner",
    "department": "content",
    "evidence": [
      "8 reels generated in the last 30 days",
      "19 static posts generated in the same period",
      "posting activity fell 27% vs. the prior 30 days"
    ]
  }
}
```
The model would populate `evidence` the same way it's already instructed to cite a fact in `why` — this is a schema addition to the existing prompt contract, not a new system. The UI doesn't have to show it immediately (per your note) — storing it now means a future "why am I seeing this" affordance is a UI-only change, not a data-model change later. This directly closes the §1/§3 traceability gap using data that will exist once §7's Analytics Engine ships (evidence needs the underlying computed metrics to cite — sequencing matters: §7 before this is meaningfully useful).

---

## 9. Why no production behavior changed this pass

Per your instruction — only fix immediately if there's an active fake-data or unsupported-claim issue. There isn't one: every dormant table found (§4) fails safe today (shows "no data" / "not connected"), and the two real fabrication bugs found in this project (zero-campaign context gap, hallucinated pipeline-panel example values) were already fixed and verified live in the prior session, before this audit was requested. This audit found **absence of data, not presence of fake data** — which is exactly the distinction your brief asked me to draw, and it's why this pass is audit-only.

---

## 10. Phase 5 (Market Intelligence) — validated, not assumed

Building on the architecture proposed in the previous round, validated against your specific checklist:

- **Current Anthropic API capabilities**: Anthropic's Messages API supports a server-side web-search tool (billed separately from tokens, same API key). `_shared/router.ts`'s `_callAnthropic` (`router.ts:171-208`) does not currently pass a `tools` parameter at all — confirmed by re-reading the function; this needs adding generically, not as a one-off.
- **Existing router architecture**: the fix belongs in `_callAnthropic`/`callAI`, not in a bespoke fetch inside a new edge function — keeps logging, fallback, and rate-limiting behavior consistent with every other feature.
- **Expected searches per business**: proposed at 1 generation/day (matches the existing daily-cache rhythm), each generation performing a small, bounded number of searches (e.g., 2-4: named competitors + industry) rather than an open-ended search loop — bounding this explicitly in the prompt/tool-use loop is a real design requirement, not a detail to leave implicit.
- **Token cost**: additive to the existing per-call token cost model (`costOf` in `router.ts:283-286`), which doesn't currently have a "search units" dimension — needs a new field.
- **Search cost**: ~$10/1,000 searches at published rates — at 1-4 searches/business/day this is a small but real, metered cost that should be visible in `ai_requests` (a `search_count` column) the same way tokens are today, not folded silently into `estimated_cost`.
- **Caching**: same `(user_id, period_start)` daily pattern as `marketing_hub_briefings` — a new `market_intelligence` table, same shape.
- **Refresh frequency**: daily default, manual force-refresh available, matching the rest of the Hub.
- **Citation/source storage — the important one you flagged**: proposed structured schema, a new table rather than free text in a briefing blob:

```sql
create table market_intelligence_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  period_start date not null,
  source text not null,          -- URL or publication searched
  finding_date date,             -- when the finding is dated, if determinable
  competitor text,                -- null if not competitor-specific
  category text not null,         -- 'competitor' | 'trend' | 'opportunity' | 'risk' | 'seasonal'
  finding text not null,          -- the actual claim, in the model's words
  confidence text not null,       -- 'high' | 'medium' | 'low' — model's own assessment
  relevance text,                 -- why this matters to this specific business
  evidence text,                  -- quoted/paraphrased excerpt backing the finding
  created_at timestamptz not null default now()
);
```
The AI Marketing Team then reasons **over these stored rows** (read as facts, same pattern as `campaigns`/`contracts` today) rather than re-summarizing raw search results into prose each time — this is what makes it "sourced intelligence" instead of "web-search-generated marketing prose," per your explicit distinction. A finding with no real source/date/evidence should not be insertable — the schema itself enforces `source`/`finding`/`category`/`confidence` as `not null`.
- **Stale-data policy**: findings older than N days (proposed: 14) should be visually de-emphasized or excluded from the active briefing context, not deleted — keeps a historical record while preventing month-old "trends" from being presented as current.

**This is still a design, not code** — matches your instruction to design Phase 5 correctly rather than assume it, and to sequence it after this audit.

---

## Sequence, confirmed

- **Phase 4A** — Content Studio move. Shipped, deployed, committed.
- **Phase 4B** — this audit. Delivered. No production behavior changed (§9).
- **Phase 5** — Market & Competitor Intelligence, per the validated architecture in §10.
- **Phase 6** — Marketing Health — now unblocked cheaply once §4's dormant `campaign_health_scores`/`business_daily_metrics` are wired and §7's Analytics Engine exists, rather than needing new data from scratch.
- **Phase 7** — Executive Reports.
- **Phase 8** — Agency Workspace / deeper orchestration.

**Recommended insertion before Phase 5, given what this audit found**: wire §4's three dormant tables + §7's deterministic Analytics Engine first. It's cheaper than Phase 5, uses zero new AI cost, and is the single highest-leverage change in this entire audit — Phase 5 (Market Intelligence) is genuinely new infrastructure and new recurring cost; this is turning on infrastructure that's already built and paid for. Your call on whether to slot it in as **Phase 4C** before Market Intelligence, or take Phase 5 first as originally sequenced.
