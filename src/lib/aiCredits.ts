// ─────────────────────────────────────────────────────────────────────────────
// MRKT AI Credits System
//
// 1 credit = $0.005 internal cost (CREDIT_VALUE_USD).
// Beta allowance: 200 credits/month = ~$1.00 actual AI cost — sustainable free tier.
//
// Cost basis per action (Claude Sonnet 4.6 at $3/M input + $15/M output):
//   Quick idea      (~200in/300out)  ≈ $0.001  → 1 credit
//   Strategist msg  (~500in/400out)  ≈ $0.008  → 2 credits
//   Application     (~800in/600out)  ≈ $0.011  → 3 credits
//   Match analysis  (~400in/300out)  ≈ $0.006  → 3 credits
//   Calendar plan   (~1.5k/1.2k)    ≈ $0.022  → 5 credits
//   Profile audit   (~3k/2.5k)      ≈ $0.047  → 10 credits
//   Image gen       (Flux ~$0.04)              → 15 credits
//   Video gen       (Higgsfield ~$1.00)        → 100 credits (effectively Pro-only on free plan)
//
// Future paid tiers (planned):
//   Creator Pro  — 2,000 credits/mo  ($19/mo)
//   Business     — 5,000 credits/mo  ($49/mo)
//   Agency       — 20,000 credits/mo ($149/mo)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

// ─── Cost basis ───────────────────────────────────────────────────────────────

export const CREDIT_VALUE_USD = 0.005; // 1 credit = $0.005 internal AI cost

// ─── Credit costs per action type ────────────────────────────────────────────

export const CREDIT_COST = {
  // Quick generation — GPT-4o-mini, <$0.002 each
  content_idea:         1,
  caption_copy:         1,
  hook_generation:      1,
  // Conversational AI — Claude Sonnet, ~$0.005-0.012 each
  strategist_message:   2,
  profile_feedback:     2,
  application_draft:    3,  // longer structured output than a plain message
  // Deeper intelligence — Claude Sonnet, ~$0.006-0.025 each
  calendar_plan:        5,
  campaign_brief:       5,
  match_analysis:       3,  // smaller payload than a full plan
  // Full audits — Claude Sonnet, ~$0.040-0.060 each
  profile_audit:        10,
  visibility_report:    10,
  growth_strategy:      10,
  marketing_hub_briefing: 10, // Marketing Hub daily briefing — same depth as growth_strategy
  // Market Intelligence (Phase 5) — real cost includes Anthropic web search
  // ($10/1000 searches) on top of normal tokens, priced closer to real spend
  // than the conversational tiers above.
  market_intelligence_refresh: 15, // up to 3 due search families — ~$0.08 real cost
  market_intelligence_brief:    3, // Executive Brief synthesis, only charged on cache miss — ~$0.017 real cost
  // Asset generation
  asset_generation:     15, // AI asset composition — ~$0.05
  image_creation:       15, // image gen (Flux/DALL-E) — ~$0.04
  video_generation:     100, // Higgsfield video — ~$1.00; effectively Pro-only on free plan
} as const;

export type CreditAction = keyof typeof CREDIT_COST;

// ─── Monthly credit allowances ────────────────────────────────────────────────

export const BETA_MONTHLY_CREDITS = 200; // = ~$1.00 actual AI cost/month

export const CREDIT_TIERS = {
  beta:     { monthly: 200,   label: "Beta",        cost_usd_per_month: 0   },
  creator:  { monthly: 2000,  label: "Creator Pro", cost_usd_per_month: 19  },
  business: { monthly: 5000,  label: "Business",    cost_usd_per_month: 49  },
  agency:   { monthly: 20000, label: "Agency",      cost_usd_per_month: 149 },
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreditBalance {
  total:     number;
  used:      number;
  remaining: number;
  resetAt:   string | null;
  isPro:     boolean;
}

// ─── Fetch current credit balance ────────────────────────────────────────────

export async function getCreditBalance(userId: string): Promise<CreditBalance> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase
      .from("ai_credits")
      .select("total_credits, used_credits, reset_at, is_pro")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      // Row doesn't exist yet — user hasn't used AI, initialize with defaults
      return {
        total:     BETA_MONTHLY_CREDITS,
        used:      0,
        remaining: BETA_MONTHLY_CREDITS,
        resetAt:   null,
        isPro:     false,
      };
    }

    const remaining = Math.max(0, data.total_credits - data.used_credits);
    return {
      total:     data.total_credits,
      used:      data.used_credits,
      remaining,
      resetAt:   data.reset_at,
      isPro:     data.is_pro ?? false,
    };
  } catch {
    return {
      total:     BETA_MONTHLY_CREDITS,
      used:      0,
      remaining: BETA_MONTHLY_CREDITS,
      resetAt:   null,
      isPro:     false,
    };
  }
}

// ─── Deduct credits for an action ────────────────────────────────────────────

export async function deductCredits(
  userId: string,
  action: CreditAction,
): Promise<{ success: boolean; remaining: number; insufficientCredits: boolean }> {
  const cost = CREDIT_COST[action];

  try {
    // Get or create the credits row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await supabase
      .from("ai_credits")
      .select("id, total_credits, used_credits, reset_at")
      .eq("user_id", userId)
      .single();

    if (!existing) {
      // First AI usage — create the row
      const resetAt = new Date();
      resetAt.setMonth(resetAt.getMonth() + 1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from("ai_credits")
        .insert({
          user_id:       userId,
          total_credits: BETA_MONTHLY_CREDITS,
          used_credits:  cost,
          reset_at:      resetAt.toISOString(),
          is_pro:        false,
        });

      if (error) throw error;
      return { success: true, remaining: BETA_MONTHLY_CREDITS - cost, insufficientCredits: false };
    }

    // Check if monthly reset is due
    const now = new Date();
    const resetAt = existing.reset_at ? new Date(existing.reset_at) : null;
    let usedCredits = existing.used_credits as number;

    if (resetAt && now > resetAt) {
      // Reset the cycle
      usedCredits = 0;
      const nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase
        .from("ai_credits")
        .update({ used_credits: 0, reset_at: nextReset.toISOString() })
        .eq("id", existing.id);
    }

    const totalCredits = existing.total_credits as number;
    const remaining = totalCredits - usedCredits;

    if (remaining < cost) {
      return { success: false, remaining, insufficientCredits: true };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase
      .from("ai_credits")
      .update({ used_credits: usedCredits + cost })
      .eq("id", existing.id);

    if (error) throw error;

    return { success: true, remaining: remaining - cost, insufficientCredits: false };
  } catch {
    // On error, allow the action (don't block AI due to credits DB failure)
    return { success: true, remaining: BETA_MONTHLY_CREDITS, insufficientCredits: false };
  }
}

// ─── Format for display ───────────────────────────────────────────────────────

export function formatCreditsDisplay(balance: CreditBalance): string {
  if (balance.isPro) return "Unlimited";
  return `${balance.remaining} AI credits remaining`;
}

export function creditsPercent(balance: CreditBalance): number {
  if (balance.total === 0) return 0;
  return Math.round((balance.remaining / balance.total) * 100);
}
