import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  corsHeaders, isRateLimited, STRICT_AI_RATE, sanitizeForPrompt, sanitizeString,
} from "../_shared/security.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OnboardingPath = "creator" | "business_creator" | "business_marketing";
type AccountType = "creator" | "business" | "agency" | "brand";
type CreatorType =
  | "influencer"
  | "ugc_creator"
  | "model"
  | "photographer"
  | "videographer"
  | "content_creator";

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  account_type: AccountType | null;
  onboarding_path: OnboardingPath | null;
  niche: string | null;
  platforms: string[] | null;
  goal: string | null;
  biggest_problem: string | null;
  business_stage: string | null;
  post_frequency: string | null;
}

interface CreatorProfile {
  display_name: string | null;
  bio: string | null;
  creator_type: CreatorType;
  creator_stage: "beginner" | "growing" | "established" | null;
  categories: string[];
  instagram_username: string | null;
  tiktok_username: string | null;
  youtube_username: string | null;
  instagram_followers: number | null;
  tiktok_followers: number | null;
  youtube_subscribers: number | null;
  city: string | null;
  country: string | null;
}

interface BrandLink {
  label: string;
  url: string;
}

interface BrandKnowledge {
  brand_description: string | null;
  brand_voice: string | null;
  products: string | null;
  services: string | null;
  target_audience: string | null;
  competitors: string | null;
  content_pillars: string | null;
  marketing_goals: string | null;
  brand_guidelines: string | null;
  // Marketing Hub fields (20260818000000_marketing_hub.sql)
  revenue_range: string | null;
  marketing_budget_range: string | null;
  current_marketing_challenges: string | null;
  preferred_growth_channels: string | null;
  current_social_channels: string | null;
  links: BrandLink[] | null;
}

// ── Marketing Hub briefing summary (fed into business system prompts) ────────

interface MarketingHubSummary {
  briefing: {
    health?: { score: number; summary: string };
    weekly_priorities?: Array<{ title: string }>;
    opportunities?: Array<{ title: string }>;
  } | null;
  generated_at: string;
}

// ── Per-campaign applicant detail ─────────────────────────────────────────────

interface DetailedApplicant {
  display_name: string;
  status: string;
  categories: string[];
  instagram_followers: number | null;
  tiktok_followers: number | null;
  city: string | null;
}

interface DetailedCampaignInfo {
  title: string;
  total: number;
  pending: number;
  reviewing: number;
  contacted: number;
  shortlisted: number;
  accepted: number;
  rejected: number;
  topApplicants: DetailedApplicant[];
}

// ── Business aggregate context ────────────────────────────────────────────────

interface BusinessContext {
  totalCampaigns: number;
  activeCampaigns: number;
  completedCampaigns: number;
  campaigns: DetailedCampaignInfo[];
  totalApplications: number;
  pendingApplications: number;
  reviewingApplications: number;
  contactedApplications: number;
  shortlistedApplications: number;
  acceptedApplications: number;
  rejectedApplications: number;
  pipelineTotal: number;
  pipelineContacted: number;
  pipelineNegotiating: number;
  pipelineBooked: number;
}

// ── Creator application context ───────────────────────────────────────────────

interface CreatorRecentApp {
  campaignTitle: string;
  status: string;
  daysAgo: number;
}

interface CreatorAppCtx {
  pending: number;
  reviewing: number;
  contacted: number;
  shortlisted: number;
  accepted: number;
  rejected: number;
  savedCount: number;
  recentApplications: CreatorRecentApp[];
}

// ── Content planner context ───────────────────────────────────────────────────

interface ScheduledPost {
  date: string;        // YYYY-MM-DD
  dayLabel: string;    // "Mon Jun 9"
  time: string | null;
  platform: string;
  contentType: string;
  title: string;
}

interface WeekBand {
  label: string;       // "Jun 9–15"
  start: string;       // YYYY-MM-DD
  posts: ScheduledPost[];
  isEmpty: boolean;
}

interface ContentPlannerCtx {
  totalUpcoming: number;
  platformBreakdown: Record<string, number>;
  weeks: WeekBand[];   // next 4 weeks
  emptyWeekLabels: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function weekLabel(start: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(start + "T12:00:00");
  e.setDate(e.getDate() + 6);
  const sm = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const ed = e.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${sm}–${ed}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending:     "Submitted",
  reviewing:   "Under Review",
  contacted:   "Brand Reached Out",
  shortlisted: "Shortlisted",
  accepted:    "Selected",
  rejected:    "Declined",
};

const CREATOR_TYPE_LABELS: Record<CreatorType, string> = {
  influencer:      "Influencer",
  ugc_creator:     "UGC Creator",
  model:           "Model",
  photographer:    "Photographer",
  videographer:    "Videographer",
  content_creator: "Content Creator",
};

// ─────────────────────────────────────────────────────────────────────────────
// Context block serialisers
// ─────────────────────────────────────────────────────────────────────────────

function buildBrandKnowledgeBlock(bk: BrandKnowledge | null): string {
  if (!bk) return "";
  const parts: string[] = [];
  if (bk.brand_description?.trim()) parts.push(`Description: ${bk.brand_description.trim()}`);
  if (bk.brand_voice?.trim())        parts.push(`Voice & Tone: ${bk.brand_voice.trim()}`);
  if (bk.products?.trim())           parts.push(`Products: ${bk.products.trim()}`);
  if (bk.services?.trim())           parts.push(`Services: ${bk.services.trim()}`);
  if (bk.target_audience?.trim())    parts.push(`Target Audience: ${bk.target_audience.trim()}`);
  if (bk.competitors?.trim())        parts.push(`Competitors: ${bk.competitors.trim()}`);
  if (bk.content_pillars?.trim())    parts.push(`Content Pillars: ${bk.content_pillars.trim()}`);
  if (bk.marketing_goals?.trim())    parts.push(`Marketing Goals: ${bk.marketing_goals.trim()}`);
  if (bk.brand_guidelines?.trim())   parts.push(`Brand Guidelines: ${bk.brand_guidelines.trim()}`);
  if (bk.links?.length)              parts.push(`Links: ${bk.links.map(l => `${l.label} — ${l.url}`).join(" | ")}`);
  if (bk.revenue_range?.trim())      parts.push(`Revenue Range: ${bk.revenue_range.trim()}`);
  if (bk.marketing_budget_range?.trim()) parts.push(`Marketing Budget: ${bk.marketing_budget_range.trim()}`);
  if (bk.current_marketing_challenges?.trim()) parts.push(`Current Challenges: ${bk.current_marketing_challenges.trim()}`);
  if (bk.preferred_growth_channels?.trim())    parts.push(`Preferred Growth Channels: ${bk.preferred_growth_channels.trim()}`);
  if (bk.current_social_channels?.trim())      parts.push(`Social Channels: ${bk.current_social_channels.trim()}`);
  if (parts.length === 0) return "";
  return `\nBRAND KNOWLEDGE (pre-loaded — never ask them to repeat any of this):\n${parts.map(p => `- ${p}`).join("\n")}`;
}

function buildMarketingHubBlock(mh: MarketingHubSummary | null): string {
  if (!mh?.briefing?.health) return "";
  const lines: string[] = [`Business health score: ${mh.briefing.health.score}/100 — ${mh.briefing.health.summary}`];
  const topPriority    = mh.briefing.weekly_priorities?.[0]?.title;
  const topOpportunity = mh.briefing.opportunities?.[0]?.title;
  if (topPriority)    lines.push(`Top Marketing Hub priority: ${topPriority}`);
  if (topOpportunity) lines.push(`Top Marketing Hub opportunity: ${topOpportunity}`);
  return `\nMARKETING HUB BRIEFING (from ${mh.generated_at.slice(0, 10)} — reference this when relevant, e.g. "your Marketing Hub flagged..."):\n${lines.map(l => `- ${l}`).join("\n")}`;
}

function buildBusinessContextBlock(ctx: BusinessContext | null): string {
  // Explicit zero-state rather than silence — an empty string here left the
  // model with no real campaign/pipeline data to ground itself on, and it was
  // observed copying the illustrative example numbers from the mrkt-pipeline
  // panel template (buildPanelProtocol) verbatim as if they were real data.
  if (!ctx || ctx.totalCampaigns === 0) {
    return `\nCAMPAIGN INTELLIGENCE (live data): This business has 0 campaigns and 0 pipeline entries on MRKT so far. ` +
      `There is no real applicant, pipeline, or creator data to report. If asked about applicants or pipeline, say so plainly and suggest launching a first campaign — do NOT invent numbers or emit an mrkt-pipeline panel.`;
  }

  const lines: string[] = [];

  lines.push(
    `Campaigns: ${ctx.totalCampaigns} total (${ctx.activeCampaigns} active, ${ctx.completedCampaigns} completed)`
  );

  if (ctx.totalApplications > 0) {
    lines.push(
      `Applications across all campaigns: ${ctx.totalApplications} total — ` +
      `${ctx.pendingApplications} new, ${ctx.reviewingApplications} reviewing, ` +
      `${ctx.contactedApplications} contacted, ${ctx.shortlistedApplications} shortlisted, ` +
      `${ctx.acceptedApplications} selected, ${ctx.rejectedApplications} rejected`
    );
  } else {
    lines.push("No applications received yet across any campaigns.");
  }

  if (ctx.campaigns.length > 0) {
    lines.push("");
    for (const c of ctx.campaigns) {
      const breakdown: string[] = [];
      if (c.shortlisted > 0) breakdown.push(`${c.shortlisted} shortlisted`);
      if (c.contacted > 0)   breakdown.push(`${c.contacted} contacted`);
      if (c.reviewing > 0)   breakdown.push(`${c.reviewing} reviewing`);
      if (c.pending > 0)     breakdown.push(`${c.pending} new`);

      const breakdownStr = breakdown.length > 0
        ? ` (${breakdown.join(", ")})`
        : " — no applications yet";

      lines.push(`Campaign "${c.title}": ${c.total} applicants${breakdownStr}`);

      if (c.topApplicants.length > 0) {
        const nameList = c.topApplicants.map((a) => {
          const stat = a.instagram_followers
            ? `${fmtNum(a.instagram_followers)} IG`
            : a.tiktok_followers
            ? `${fmtNum(a.tiktok_followers)} TT`
            : "";
          const niche = a.categories[0] ?? "";
          const detail = [stat, niche, a.city].filter(Boolean).join(", ");
          return `${a.display_name}${detail ? ` [${detail}]` : ""} (${a.status})`;
        });
        lines.push(`  ↳ Key creators: ${nameList.join(" | ")}`);
      }
    }
  }

  if (ctx.pipelineTotal > 0) {
    lines.push(
      `Creator pipeline (saved to CRM): ${ctx.pipelineTotal} total — ` +
      `${ctx.pipelineContacted} contacted, ${ctx.pipelineNegotiating} negotiating, ${ctx.pipelineBooked} booked`
    );
  }

  const block = `\nCAMPAIGN INTELLIGENCE (live data — never ask them to re-explain any of this):\n${lines.map(l => `- ${l}`).join("\n")}`;

  const guidance = ctx.totalApplications > 0
    ? `\n\nWhen asked about applicants or who to hire → reference the creator names above and give specific, actionable recommendations.
When asked about their pipeline → use the stage counts above.
When asked which campaign needs attention → identify the one with the most unreviewed applicants.`
    : `\n\nThey have campaigns running but no applicants yet. Advise on how to attract more creators.`;

  return block + guidance;
}

function buildCreatorMarketplaceBlock(ctx: CreatorAppCtx): string {
  const total = ctx.pending + ctx.reviewing + ctx.contacted + ctx.shortlisted + ctx.accepted + ctx.rejected;
  if (total === 0 && ctx.savedCount === 0) return "";

  const lines: string[] = [];

  if (total > 0) {
    lines.push(
      `Applications submitted: ${total} total — ` +
      `${ctx.pending} submitted, ${ctx.reviewing} under review, ` +
      `${ctx.contacted} contacted by brand, ${ctx.shortlisted} shortlisted, ` +
      `${ctx.accepted} selected, ${ctx.rejected} declined`
    );
  }

  if (ctx.recentApplications.length > 0) {
    lines.push("Recent applications:");
    for (const a of ctx.recentApplications.slice(0, 5)) {
      const when = a.daysAgo === 0 ? "today" : a.daysAgo === 1 ? "yesterday" : `${a.daysAgo}d ago`;
      const statusLabel = STATUS_LABEL[a.status] ?? a.status;
      lines.push(`  - "${a.campaignTitle}" → ${statusLabel} (${when})`);
    }
  }

  if (ctx.savedCount > 0) {
    lines.push(`Saved opportunities (bookmarked for later): ${ctx.savedCount}`);
  }

  return `\nMARKETPLACE STATUS (live data):\n${lines.map(l => `- ${l}`).join("\n")}\n\nWhen they ask about their applications → reference the campaign names and statuses above.\nWhen they ask which campaign to prioritise → advise based on status and recency.`;
}

function buildContentPlannerBlock(ctx: ContentPlannerCtx | null): string {
  if (!ctx || ctx.totalUpcoming === 0) {
    return `\nCONTENT PLANNER: No content scheduled in the next 28 days. Calendar is empty.\n` +
      `When they ask what to post → suggest a full plan and offer to add it to their calendar.`;
  }

  const lines: string[] = [];

  // Platform breakdown
  const breakdown = Object.entries(ctx.platformBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${p} ×${n}`)
    .join(", ");
  lines.push(`Scheduled posts (next 28 days): ${ctx.totalUpcoming} total (${breakdown})`);

  // Week-by-week view (up to 8 posts shown)
  let shown = 0;
  for (const week of ctx.weeks) {
    if (week.isEmpty) continue;
    lines.push(`Week of ${week.label}:`);
    for (const post of week.posts.slice(0, 3)) {
      const time = post.time ? ` at ${post.time}` : "";
      lines.push(`  - ${post.dayLabel}${time} — ${post.platform} ${post.contentType}: "${post.title}"`);
      shown++;
      if (shown >= 8) break;
    }
    if (shown >= 8) { lines.push("  [... more posts scheduled]"); break; }
  }

  // Empty weeks
  if (ctx.emptyWeekLabels.length > 0) {
    lines.push(`Weeks with NO content scheduled: ${ctx.emptyWeekLabels.join(", ")}`);
  }

  const guidance = `\nWhen asked what to post → reference what's already scheduled and fill the gaps.
When asked to build a plan → check the empty weeks above and suggest content for those dates.
When you generate a content plan → use the mrkt-content-plan panel so the user can add it to their calendar with one click.`;

  return `\nCONTENT PLANNER (live calendar data):\n${lines.map(l => `- ${l}`).join("\n")}` + guidance;
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured panel protocol
// ─────────────────────────────────────────────────────────────────────────────

function buildPanelProtocol(today: string): string {
  return `
STRUCTURED OUTPUT PROTOCOL:
When relevant, embed ONE structured block at the very END of your response (after all text).

Creator/applicant list:
\`\`\`mrkt-creators
[{"name":"Full Name","stat":"28K IG","niche":"Fashion","location":"London","status":"shortlisted","reason":"One-line why"}]
\`\`\`

Opportunity list:
\`\`\`mrkt-opportunities
[{"title":"Campaign Name","budget":"£2,500","platform":"Instagram, TikTok","status":"open","match":"High match"}]
\`\`\`

Pipeline breakdown (shape example only — the counts below are illustrative placeholders, NEVER copy them; use the real stage counts from CAMPAIGN INTELLIGENCE above, and omit this panel entirely if that data isn't present or shows 0 campaigns):
\`\`\`mrkt-pipeline
{"stages":[{"label":"Shortlisted","count":"<real count>"},{"label":"Reviewing","count":"<real count>"},{"label":"New","count":"<real count>"}]}
\`\`\`

Content calendar plan (when asked to build a plan, suggest posts, fill calendar, plan content):
\`\`\`mrkt-content-plan
[{"date":"YYYY-MM-DD","platform":"Instagram","content_type":"Reel","title":"Short title for the post","hook":"The opening line that stops the scroll","scheduled_time":"11:00","caption":"Full caption with hashtags","creative_direction":"How to film/design this"}]
\`\`\`

CONTENT PLAN RULES (critical):
- Today is ${today}. Always use future dates (today or later) in format YYYY-MM-DD.
- Suggest realistic times: mornings 08:00–11:00, evenings 18:00–20:00.
- Each item must have: date, platform, content_type, title, hook, scheduled_time, caption, creative_direction.
- Only schedule on dates that don't already have content (check CONTENT PLANNER data above).
- Fill EMPTY weeks first. caption and creative_direction must be specific and ready-to-use.
- Minimum 3 items, maximum 14 items per plan response.

GENERAL RULES:
- Only include real data from context. Never fabricate names, numbers, or campaigns.
- The example values shown above (names, counts, budgets) are shape templates only — never reuse them as if they were this business's real data.
- If you don't have real data for a panel type, omit that panel rather than filling it with placeholder or estimated numbers.
- Only ONE panel block per response.
- Place the block after all your text.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic system prompt builder
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(
  profile: UserProfile,
  today: string,
  creator?: CreatorProfile,
  brandKnowledge?: BrandKnowledge | null,
  businessCtx?: BusinessContext | null,
  creatorAppCtx?: CreatorAppCtx | null,
  contentPlannerCtx?: ContentPlannerCtx | null,
  marketingHub?: MarketingHubSummary | null,
): string {
  const name =
    profile.name ||
    creator?.display_name ||
    profile.email?.split("@")[0] ||
    "there";

  const preamble = `You are MRKT — the AI marketing strategist inside usemrkt.app.
You are speaking directly with ${name}.
You already know exactly who they are, what campaigns they're running, and what's on their content calendar.
Never ask them to introduce themselves. Never ask them to explain their role or platform activity.
You are sharp, direct, and premium. No filler. No walls of text. No generic disclaimers.
If asked directly whether you are an AI, confirm that you are. If asked which AI model powers you, say you are powered by MRKT AI and are not able to share the underlying provider details.`;

  const format = `
RESPONSE RULES:
- Concise output only. No walls of text.
- Use markdown: short headings, tight bullets, numbered steps when sequential.
- When producing content (hooks, captions, briefs) — deliver it ready to use.
- When you need context, ask 1–2 sharp questions max.
- Always deliver actionable output over generic advice.
- Sign off as a premium strategist. Every response should feel worth paying for.`;

  const isCreator =
    profile.account_type === "creator" || profile.onboarding_path === "creator";

  const contentBlock = buildContentPlannerBlock(contentPlannerCtx ?? null);
  const panelProtocol = buildPanelProtocol(today);

  // ── Creator with full profile ────────────────────────────────────────────
  if (isCreator && creator) {
    const platforms: string[] = [];
    if (creator.instagram_username)
      platforms.push(`Instagram @${creator.instagram_username} (${fmtNum(creator.instagram_followers)} followers)`);
    if (creator.tiktok_username)
      platforms.push(`TikTok @${creator.tiktok_username} (${fmtNum(creator.tiktok_followers)} followers)`);
    if (creator.youtube_username)
      platforms.push(`YouTube @${creator.youtube_username} (${fmtNum(creator.youtube_subscribers)} subscribers)`);

    const nicheList = creator.categories.join(", ") || "general";
    const location = [creator.city, creator.country].filter(Boolean).join(", ");
    const typeLabel = CREATOR_TYPE_LABELS[creator.creator_type] ?? "Creator";
    const marketplaceBlock = creatorAppCtx ? buildCreatorMarketplaceBlock(creatorAppCtx) : "";
    const stage = creator.creator_stage ?? "growing";
    const stageLabel = stage === "beginner" ? "Beginner (just starting out)"
      : stage === "established" ? "Established creator"
      : "Growing creator";

    return `${preamble}

USER PROFILE:
- Role: ${typeLabel}
- Name: ${creator.display_name || name}
- Creator Stage: ${stageLabel}
- Niches: ${nicheList}
- Platforms: ${platforms.join(" | ") || "not specified"}
${location ? `- Location: ${location}` : ""}
${creator.bio ? `- Bio: "${creator.bio}"` : ""}
${profile.goal ? `- Goal: ${profile.goal}` : ""}
${profile.post_frequency ? `- Posting frequency: ${profile.post_frequency}` : ""}${marketplaceBlock}${contentBlock}

YOUR JOB:
Help ${name} grow as a creator, land brand deals, and execute a consistent content strategy.

STAGE-AWARE GUIDANCE:
${stage === "beginner" ? `- ${name} is just starting out. Focus on: building first portfolio pieces, getting first brand deal, choosing a niche, growing initial audience. Do NOT assume they have existing campaigns or a media kit.` : ""}
${stage === "growing" ? `- ${name} is growing. Focus on: increasing visibility, improving deal quality, content consistency, audience growth tactics.` : ""}
${stage === "established" ? `- ${name} is established. Focus on: scaling revenue, premium brand partnerships, content strategy optimization, team/delegation.` : ""}

When they ask for content ideas → give ${nicheList} content ideas for their platforms. Hook-first, ready to post.
When they ask for hooks → write 3–5 strong hooks tailored to ${nicheList} on their platforms.
When they ask for captions → write them complete: hook, body, CTA, relevant hashtags.
When they ask for a calendar → build a week-by-week plan using the CONTENT PLANNER data. Fill the empty weeks first.
When they ask "what should I post?" → check the calendar above and suggest content for the next empty dates.
When they ask about brand deals → help them position their profile, set rates, write pitch copy.
When they ask about growth → give platform-specific tactics for ${nicheList} creators.
When they ask about their applications → reference MARKETPLACE STATUS data above.
When they ask to plan content around an opportunity → connect the content themes to the campaign brief.
${format}${panelProtocol}`;
  }

  // ── Creator without full profile yet ────────────────────────────────────
  if (isCreator) {
    const niche = profile.niche || "content creation";
    const platform = profile.platforms?.[0] ?? "Instagram";
    const marketplaceBlock = creatorAppCtx ? buildCreatorMarketplaceBlock(creatorAppCtx) : "";

    return `${preamble}

USER PROFILE:
- Role: Creator
- Name: ${name}
- Focus: ${niche}
- Primary platform: ${platform}
${profile.goal ? `- Goal: ${profile.goal}` : ""}${marketplaceBlock}${contentBlock}

YOUR JOB:
Help ${name} grow as a creator. Content ideas, hooks, captions, calendars, growth strategy, and brand partnerships.
Tailor everything to ${niche} content on ${platform}.
When they ask about their calendar → use CONTENT PLANNER data and fill the empty weeks.
${format}${panelProtocol}`;
  }

  // ── Business — creator campaigns ─────────────────────────────────────────
  if (profile.onboarding_path === "business_creator" || profile.account_type === "brand") {
    const stage = profile.business_stage ?? "growing";
    const industry = profile.niche ?? "their industry";
    const bkBlock  = buildBrandKnowledgeBlock(brandKnowledge ?? null);
    const ctxBlock = buildBusinessContextBlock(businessCtx ?? null);
    const mhBlock  = buildMarketingHubBlock(marketingHub ?? null);

    return `${preamble}

USER PROFILE:
- Role: Business running influencer & creator campaigns
- Brand: ${name}
- Industry: ${industry}
- Stage: ${stage}
${profile.goal ? `- Goal: ${profile.goal}` : ""}
${profile.biggest_problem ? `- Current challenge: ${profile.biggest_problem}` : ""}${bkBlock}${ctxBlock}${mhBlock}${contentBlock}

YOUR JOB:
Help ${name} build, brief, and run creator campaigns through MRKT Connect.
${bkBlock ? `Use brand knowledge above — never give generic advice when you know their audience, products, and voice.` : ""}

When they ask for content ideas → campaign concepts and creator briefs, not personal posts.
When they ask about finding creators → recommend from applicant data above when available; otherwise define criteria.
When they ask about compensation → specific guidance on paid, gifted, affiliate, revenue share with real ranges.
When they ask for a brief → full creator brief: objective, deliverables, timeline, tone, content requirements.
When they ask about ROI → set campaign KPIs, attribution models, success benchmarks.
When they ask who their best applicants are → reference creator names from CAMPAIGN INTELLIGENCE above.
When they ask for a content calendar → connect it to their active campaigns and use the CONTENT PLANNER data.
${format}${panelProtocol}`;
  }

  // ── Business — owned marketing ───────────────────────────────────────────
  if (profile.onboarding_path === "business_marketing" || profile.account_type === "business") {
    const stage = profile.business_stage ?? "growing";
    const industry = profile.niche ?? "their industry";
    const bkBlock  = buildBrandKnowledgeBlock(brandKnowledge ?? null);
    const ctxBlock = buildBusinessContextBlock(businessCtx ?? null);
    const mhBlock  = buildMarketingHubBlock(marketingHub ?? null);

    return `${preamble}

USER PROFILE:
- Role: Business building owned marketing channels
- Brand: ${name}
- Industry: ${industry}
- Stage: ${stage}
${profile.goal ? `- Goal: ${profile.goal}` : ""}
${profile.biggest_problem ? `- Current challenge: ${profile.biggest_problem}` : ""}${bkBlock}${ctxBlock}${mhBlock}${contentBlock}

YOUR JOB:
Help ${name} build their marketing strategy and execute on owned channels.
${bkBlock ? `Use brand knowledge above — every response should be specific to their brand, not generic.` : ""}

When they ask for content ideas → brand social, blog, email — owned channels.
When they ask for a calendar → build specific, platform-appropriate content using the CONTENT PLANNER data.
When they ask about growth → owned marketing levers: content volume, SEO, email, social consistency.
When they ask for strategy → positioning, content pillars, offer clarity, funnel design.
When they ask for copy → ready-to-use brand marketing copy: captions, ad hooks, email subjects.
When asked to plan content around a campaign → connect posts to campaign timeline in the calendar.
${format}${panelProtocol}`;
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  const bkBlock  = buildBrandKnowledgeBlock(brandKnowledge ?? null);
  const ctxBlock = buildBusinessContextBlock(businessCtx ?? null);
  const mhBlock  = buildMarketingHubBlock(marketingHub ?? null);

  return `${preamble}

USER PROFILE:
- Role: Marketing professional
- Name: ${name}
${profile.niche ? `- Focus: ${profile.niche}` : ""}
${profile.goal ? `- Goal: ${profile.goal}` : ""}${bkBlock}${ctxBlock}${mhBlock}${contentBlock}

YOUR JOB:
Help ${name} with marketing strategy, content creation, and growth.
Adapt based on what they're working on — creator content, influencer campaigns, brand marketing, or growth strategy.
${format}${panelProtocol}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content planner context builder
// ─────────────────────────────────────────────────────────────────────────────

function buildContentPlannerCtx(
  items: Array<{ scheduled_date: string; scheduled_time: string | null; platform: string; content_type: string; title: string }>,
  today: string,
): ContentPlannerCtx {
  // Platform breakdown
  const platformBreakdown: Record<string, number> = {};
  for (const item of items) {
    platformBreakdown[item.platform] = (platformBreakdown[item.platform] ?? 0) + 1;
  }

  // Build week bands for next 4 weeks
  // Find Monday of current week
  const todayDate = new Date(today + "T12:00:00");
  const dayOfWeek = todayDate.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(todayDate);
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  const weeks: WeekBand[] = [];
  for (let w = 0; w < 4; w++) {
    const start = addDays(weekStartStr, w * 7);
    const end   = addDays(start, 6);
    const label = weekLabel(start);

    const weekPosts: ScheduledPost[] = items
      .filter((i) => i.scheduled_date >= start && i.scheduled_date <= end)
      .map((i) => ({
        date:        i.scheduled_date,
        dayLabel:    shortDate(i.scheduled_date),
        time:        i.scheduled_time,
        platform:    i.platform,
        contentType: i.content_type,
        title:       i.title.slice(0, 55) + (i.title.length > 55 ? "…" : ""),
      }));

    weeks.push({ label, start, posts: weekPosts, isEmpty: weekPosts.length === 0 });
  }

  const emptyWeekLabels = weeks.filter((w) => w.isEmpty).map((w) => w.label);

  return {
    totalUpcoming:    items.length,
    platformBreakdown,
    weeks,
    emptyWeekLabels,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Request handler
// ─────────────────────────────────────────────────────────────────────────────

const MAX_MESSAGES = 50;
const MAX_CONTENT_LEN = 8000;

const json = (body: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    // ── 1. Verify JWT ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401, req);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401, req);
    const userId = userData.user.id;

    // ── 1b. Rate-limit: 10 AI chat requests / minute per user ────────────────
    if (isRateLimited(`chat:${userId}`, STRICT_AI_RATE)) {
      return json({ error: "Too many requests. Please wait a moment before sending another message." }, 429, req);
    }

    // ── 2. Load user context ─────────────────────────────────────────────────
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = todayISO();
    const in28days = addDays(today, 28);

    // ── Base profile ─────────────────────────────────────────────────────────
    const { data: profileData } = await serviceClient
      .from("profiles")
      .select("id,name,email,account_type,onboarding_path,niche,platforms,goal,biggest_problem,business_stage,post_frequency")
      .eq("id", userId)
      .maybeSingle();

    const profile: UserProfile = profileData ?? {
      id: userId,
      name: null,
      email: userData.user.email ?? null,
      account_type: null,
      onboarding_path: null,
      niche: null,
      platforms: null,
      goal: null,
      biggest_problem: null,
      business_stage: null,
      post_frequency: null,
    };

    const isCreator =
      profile.account_type === "creator" || profile.onboarding_path === "creator";

    // ── Creator profile ───────────────────────────────────────────────────────
    let creatorProfile: CreatorProfile | undefined;
    if (isCreator) {
      const { data: cpData } = await serviceClient
        .from("creator_profiles")
        .select("display_name,bio,creator_type,creator_stage,categories,instagram_username,tiktok_username,youtube_username,instagram_followers,tiktok_followers,youtube_subscribers,city,country")
        .eq("user_id", userId)
        .maybeSingle();
      creatorProfile = cpData ?? undefined;
    }

    // ── Role-specific context + content planner — load in parallel ────────────
    let brandKnowledge: BrandKnowledge | null = null;
    let businessCtx: BusinessContext | null   = null;
    let creatorAppCtx: CreatorAppCtx | null   = null;
    let contentPlannerCtx: ContentPlannerCtx | null = null;
    let marketingHub: MarketingHubSummary | null = null;

    if (!isCreator) {
      // ── Business context ──────────────────────────────────────────────────

      const [bkRes, campaignRes, pipelineRes, plannerRes, mhRes] = await Promise.all([
        serviceClient
          .from("brand_knowledge")
          .select("brand_description,brand_voice,products,services,target_audience,competitors,content_pillars,marketing_goals,brand_guidelines,revenue_range,marketing_budget_range,current_marketing_challenges,preferred_growth_channels,current_social_channels,links")
          .eq("business_user_id", userId)
          .maybeSingle(),

        serviceClient
          .from("campaigns")
          .select("id,title,status")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),

        serviceClient
          .from("project_saved_creators")
          .select("status")
          .eq("saved_by", userId)
          .not("status", "eq", "rejected"),

        serviceClient
          .from("content_planner_items")
          .select("title,platform,content_type,scheduled_date,scheduled_time")
          .eq("user_id", userId)
          .gte("scheduled_date", today)
          .lte("scheduled_date", in28days)
          .order("scheduled_date", { ascending: true })
          .limit(30),

        // Latest Marketing Hub briefing — omitted from the prompt entirely if
        // the business has never opened /marketing-hub (see buildMarketingHubBlock).
        serviceClient
          .from("marketing_hub_briefings")
          .select("briefing,generated_at")
          .eq("user_id", userId)
          .order("period_start", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      brandKnowledge = bkRes.data ?? null;
      marketingHub   = mhRes.data as MarketingHubSummary | null;

      const campaignRows: Array<{ id: string; title: string; status: string }> =
        campaignRes.data ?? [];
      const pipelineRows: Array<{ status: string }> = pipelineRes.data ?? [];
      const plannerItems = plannerRes.data ?? [];

      // Content planner context
      contentPlannerCtx = buildContentPlannerCtx(plannerItems, today);

      if (campaignRows.length > 0) {
        const campIds = campaignRows.map((c) => c.id);

        const { data: appData } = await serviceClient
          .from("campaign_applications")
          .select("campaign_id,status,user_id,campaign_title,created_at")
          .in("campaign_id", campIds)
          .order("created_at", { ascending: false });

        const apps: Array<{ campaign_id: string; status: string; user_id: string; campaign_title: string; created_at: string }> =
          appData ?? [];

        const priorityUserIds = [
          ...new Set(
            apps
              .filter((a) => ["shortlisted", "contacted", "reviewing"].includes(a.status))
              .map((a) => a.user_id)
              .slice(0, 25),
          ),
        ];

        let creatorNameMap: Record<string, {
          display_name: string;
          categories: string[];
          instagram_followers: number | null;
          tiktok_followers: number | null;
          city: string | null;
        }> = {};

        if (priorityUserIds.length > 0) {
          const { data: cpRows } = await serviceClient
            .from("creator_profiles")
            .select("user_id,display_name,categories,instagram_followers,tiktok_followers,city")
            .in("user_id", priorityUserIds);

          for (const cp of cpRows ?? []) {
            creatorNameMap[cp.user_id] = cp;
          }
        }

        const activeCampaigns = campaignRows.filter((c) => c.status === "active");
        const detailedCampaigns: DetailedCampaignInfo[] = activeCampaigns.slice(0, 5).map((c) => {
          const campApps = apps.filter((a) => a.campaign_id === c.id);
          const shortlisted = campApps.filter((a) => a.status === "shortlisted");
          const contacted   = campApps.filter((a) => a.status === "contacted");
          const reviewing   = campApps.filter((a) => a.status === "reviewing");
          const topRaw      = [...shortlisted, ...contacted, ...reviewing].slice(0, 4);

          const topApplicants: DetailedApplicant[] = topRaw.map((a) => {
            const cp = creatorNameMap[a.user_id];
            return {
              display_name:        cp?.display_name ?? "Unknown Creator",
              status:              a.status,
              categories:          cp?.categories ?? [],
              instagram_followers: cp?.instagram_followers ?? null,
              tiktok_followers:    cp?.tiktok_followers ?? null,
              city:                cp?.city ?? null,
            };
          });

          return {
            title:       c.title,
            total:       campApps.length,
            pending:     campApps.filter((a) => a.status === "pending").length,
            reviewing:   campApps.filter((a) => a.status === "reviewing").length,
            contacted:   campApps.filter((a) => a.status === "contacted").length,
            shortlisted: campApps.filter((a) => a.status === "shortlisted").length,
            accepted:    campApps.filter((a) => a.status === "accepted").length,
            rejected:    campApps.filter((a) => a.status === "rejected").length,
            topApplicants,
          };
        });

        businessCtx = {
          totalCampaigns:          campaignRows.length,
          activeCampaigns:         activeCampaigns.length,
          completedCampaigns:      campaignRows.filter((c) => c.status === "completed").length,
          campaigns:               detailedCampaigns,
          totalApplications:       apps.length,
          pendingApplications:     apps.filter((a) => a.status === "pending").length,
          reviewingApplications:   apps.filter((a) => a.status === "reviewing").length,
          contactedApplications:   apps.filter((a) => a.status === "contacted").length,
          shortlistedApplications: apps.filter((a) => a.status === "shortlisted").length,
          acceptedApplications:    apps.filter((a) => a.status === "accepted").length,
          rejectedApplications:    apps.filter((a) => a.status === "rejected").length,
          pipelineTotal:       pipelineRows.length,
          pipelineContacted:   pipelineRows.filter((r) => r.status === "contacted").length,
          pipelineNegotiating: pipelineRows.filter((r) => r.status === "negotiating").length,
          pipelineBooked:      pipelineRows.filter((r) => r.status === "booked").length,
        };
      } else {
        businessCtx = {
          totalCampaigns: 0, activeCampaigns: 0, completedCampaigns: 0,
          campaigns: [],
          totalApplications: 0, pendingApplications: 0, reviewingApplications: 0,
          contactedApplications: 0, shortlistedApplications: 0, acceptedApplications: 0, rejectedApplications: 0,
          pipelineTotal: pipelineRows.length,
          pipelineContacted: pipelineRows.filter((r) => r.status === "contacted").length,
          pipelineNegotiating: pipelineRows.filter((r) => r.status === "negotiating").length,
          pipelineBooked: pipelineRows.filter((r) => r.status === "booked").length,
        };
      }
    } else {
      // ── Creator context ───────────────────────────────────────────────────

      const [appRes, saveRes, plannerRes] = await Promise.all([
        serviceClient
          .from("campaign_applications")
          .select("status,campaign_title,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),

        serviceClient
          .from("campaign_saves")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),

        serviceClient
          .from("content_planner_items")
          .select("title,platform,content_type,scheduled_date,scheduled_time")
          .eq("user_id", userId)
          .gte("scheduled_date", today)
          .lte("scheduled_date", in28days)
          .order("scheduled_date", { ascending: true })
          .limit(30),
      ]);

      const apps: Array<{ status: string; campaign_title: string; created_at: string }> =
        appRes.data ?? [];
      const plannerItems = plannerRes.data ?? [];

      contentPlannerCtx = buildContentPlannerCtx(plannerItems, today);

      const recentApplications: CreatorRecentApp[] = apps.slice(0, 8).map((a) => ({
        campaignTitle: a.campaign_title ?? "Unnamed Campaign",
        status:        a.status,
        daysAgo:       daysAgo(a.created_at),
      }));

      creatorAppCtx = {
        pending:     apps.filter((a) => a.status === "pending").length,
        reviewing:   apps.filter((a) => a.status === "reviewing").length,
        contacted:   apps.filter((a) => a.status === "contacted").length,
        shortlisted: apps.filter((a) => a.status === "shortlisted").length,
        accepted:    apps.filter((a) => a.status === "accepted").length,
        rejected:    apps.filter((a) => a.status === "rejected").length,
        savedCount:  (saveRes.count ?? 0),
        recentApplications,
      };
    }

    // ── 3. Build system prompt ───────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(
      profile, today, creatorProfile, brandKnowledge, businessCtx, creatorAppCtx, contentPlannerCtx, marketingHub
    );

    // ── 4. Validate message payload ──────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages))
      return json({ error: "Invalid payload" }, 400, req);

    // Optional real-time context from build-mrkt-context edge function
    const mrktContextSupplement: string | null =
      typeof body.mrkt_context === "string" && body.mrkt_context.trim()
        ? body.mrkt_context.trim()
        : null;

    const finalSystemPrompt = mrktContextSupplement
      ? `${systemPrompt}\n\nLIVE PLATFORM CONTEXT (from real-time data — use this when it's more current than what's above):\n${mrktContextSupplement}`
      : systemPrompt;

    const raw: unknown[] = body.messages;
    if (raw.length === 0) return json({ error: "messages required" }, 400, req);
    if (raw.length > MAX_MESSAGES)
      return json({ error: `Too many messages (max ${MAX_MESSAGES})` }, 400, req);

    const messages: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of raw) {
      if (!m || typeof m !== "object") return json({ error: "Invalid message" }, 400, req);
      const role    = (m as { role?: unknown }).role;
      const content = (m as { content?: unknown }).content;
      if (role !== "user" && role !== "assistant")
        return json({ error: "Invalid role" }, 400, req);
      if (typeof content !== "string") return json({ error: "Invalid content" }, 400, req);
      if (content.length === 0 || content.length > MAX_CONTENT_LEN)
        return json({ error: `Message length must be 1-${MAX_CONTENT_LEN}` }, 400, req);
      // Sanitize user messages to mitigate prompt injection attacks.
      const safeContent = role === "user" ? sanitizeForPrompt(sanitizeString(content)) : content;
      messages.push({ role, content: safeContent });
    }

    // ── 5. Route to Anthropic (strategy) or OpenAI (creative) ────────────────

    const lastUserMsg = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
    const isBusinessUser = profile.account_type === "business" ||
                           profile.account_type === "brand"     ||
                           profile.account_type === "agency";

    const STRATEGY_PATTERNS = [
      /strateg/i, /campaign brief/i, /brand position/i, /pricing/i, /market/i,
      /competitor/i, /budget/i, /roi/i, /kpi/i, /target audience/i,
      /creator selection/i, /influencer strateg/i, /brief/i, /roadmap/i,
      /go.to.market/i, /positioning/i, /analysis/i,
    ];
    const isStrategyQuery = isBusinessUser &&
      STRATEGY_PATTERNS.some((p) => p.test(lastUserMsg));

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (isStrategyQuery && ANTHROPIC_API_KEY) {
      // ── Anthropic path (non-streaming → wrapped as SSE) ─────────────────────
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key":         ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type":      "application/json",
        },
        body: JSON.stringify({
          model:       "claude-sonnet-4-6",
          max_tokens:  1500,
          temperature: 0.3,
          system:      finalSystemPrompt,
          messages:    messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text().catch(() => "");
        console.error("Anthropic error:", anthropicRes.status, errText);
        // Fall through to OpenAI on error
      } else {
        const anthropicData = await anthropicRes.json() as {
          content: { type: string; text: string }[];
          usage:   { input_tokens: number; output_tokens: number };
        };
        const text         = anthropicData.content.find((b) => b.type === "text")?.text ?? "";
        const inputTokens  = anthropicData.usage?.input_tokens  ?? 0;
        const outputTokens = anthropicData.usage?.output_tokens ?? 0;

        // Log to ai_requests (fire-and-forget)
        serviceClient.from("ai_requests").insert({
          user_id:        userId,
          provider:       "anthropic",
          task_type:      "chat_strategy",
          prompt:         lastUserMsg,
          response:       text,
          status:         "completed",
          model:          "claude-sonnet-4-6",
          input_tokens:   inputTokens,
          output_tokens:  outputTokens,
          estimated_cost: (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015,
          created_at:     new Date().toISOString(),
        }).then(() => {}).catch(console.error);

        // Wrap as OpenAI-compatible SSE so frontend doesn't need to change
        const sseChunk = JSON.stringify({
          id:      "mrkt-anthropic",
          object:  "chat.completion.chunk",
          choices: [{ delta: { content: text }, index: 0, finish_reason: null }],
        });
        const sseBody = `data: ${sseChunk}\n\ndata: [DONE]\n\n`;

        return new Response(sseBody, {
          headers: { ...corsHeaders(req), "Content-Type": "text/event-stream" },
        });
      }
    }

    // ── OpenAI path (streaming) ───────────────────────────────────────────────
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: finalSystemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);

      let errCode = "";
      try { errCode = JSON.parse(errText)?.error?.code ?? ""; } catch { /* ignore */ }

      if (response.status === 429) {
        if (errCode === "insufficient_quota")
          return json({ error: "AI credits exhausted. Add billing at platform.openai.com." }, 402, req);
        return json({ error: "Rate limit exceeded. Try again in a moment." }, 429, req);
      }
      if (response.status === 402) return json({ error: "AI credits exhausted." }, 402, req);
      return json({ error: `AI error: ${response.status}` }, 500, req);
    }

    // Log OpenAI chat usage (fire-and-forget, no token count available in stream)
    serviceClient.from("ai_requests").insert({
      user_id:    userId,
      provider:   "openai",
      task_type:  "chat_creative",
      prompt:     lastUserMsg,
      status:     "streaming",
      model:      "gpt-4o-mini",
      created_at: new Date().toISOString(),
    }).then(() => {}).catch(console.error);

    // ── 6. Stream SSE back ───────────────────────────────────────────────────
    return new Response(response.body, {
      headers: { ...corsHeaders(req), "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return json({ error: "Internal server error" }, 500, req);
  }
});
