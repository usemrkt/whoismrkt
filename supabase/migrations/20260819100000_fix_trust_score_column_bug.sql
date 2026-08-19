-- ─────────────────────────────────────────────────────────────────────────────
-- Fix critical production bug: compute_creator_trust_score() and
-- compute_business_trust_score() both write to a column named `updated_at`
-- that does not exist on creator_trust_scores / business_trust_scores. The
-- live column is `last_computed_at`. Verified directly against the live
-- schema (information_schema.columns), not a migration file.
--
-- Impact: both functions are called by existing, already-attached triggers
-- (sync_trust_on_review, sync_trust_on_contract, sync_trust_on_deliverable,
-- and the newly-attached sync_trust_on_payment from
-- 20260818100000_analytics_engine.sql). Every one of those raised
-- 42703 "column updated_at does not exist" and rolled back the ENTIRE
-- triggering transaction — meaning review submissions, contract status
-- changes, and deliverable status changes have been silently failing in
-- production for as long as this schema drift has existed.
--
-- This migration changes ONLY the column name in the INSERT / ON CONFLICT
-- DO UPDATE SET clauses of both functions. Every other line — every score
-- weight, every subquery, every tier threshold — is copied verbatim from
-- the live pg_get_functiondef() output, unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_creator_trust_score(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_completion_rate    numeric := 0;
  v_avg_rating         numeric := 0;
  v_approval_rate      numeric := 0;
  v_revision_rate      numeric := 0;
  v_repeat_rate        numeric := 0;
  v_total_campaigns    integer := 0;
  v_total_reviews      integer := 0;
  v_xp                 integer := 0;
  v_response_bonus     numeric := 0;
  v_avg_response_hours numeric;
  v_accepted_rate      numeric := 0;
  v_total_cancelled    integer := 0;

  v_total_deliverables int := 0;
  v_revised_count      int := 0;
  v_accepted_apps      int := 0;
  v_total_apps         int := 0;

  v_raw_score    numeric := 0;
  v_final_score  integer := 0;
  v_tier         text    := 'new';
BEGIN
  -- campaign completion (FIX: creator_id, not nonexistent user_id)
  SELECT COUNT(*), COALESCE(AVG(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0)
  INTO v_total_campaigns, v_completion_rate
  FROM public.campaign_deliverable_submissions
  WHERE creator_id = p_user_id;

  IF v_total_campaigns = 0 THEN v_completion_rate := 0; END IF;

  -- ratings (FIX: public.reviews, reviewed_user_id — not creator_reviews.creator_id)
  SELECT COUNT(*), COALESCE(AVG(rating), 0)
  INTO v_total_reviews, v_avg_rating
  FROM public.reviews
  WHERE reviewed_user_id = p_user_id;

  -- approval rate (shortlisted / total applications)
  SELECT COUNT(*) INTO v_total_apps
  FROM public.campaign_applications
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_accepted_apps
  FROM public.campaign_applications
  WHERE user_id = p_user_id AND status IN ('shortlisted', 'accepted');

  IF v_total_apps > 0 THEN
    v_approval_rate  := v_accepted_apps::numeric / v_total_apps;
    v_accepted_rate  := (SELECT COUNT(*)::numeric / v_total_apps
                         FROM public.campaign_applications
                         WHERE user_id = p_user_id AND status = 'accepted');
  END IF;

  -- revision rate (FIX: creator_id, not nonexistent user_id)
  SELECT COUNT(*) INTO v_total_deliverables
  FROM public.campaign_deliverable_submissions
  WHERE creator_id = p_user_id;

  SELECT COUNT(*) INTO v_revised_count
  FROM public.campaign_deliverable_submissions
  WHERE creator_id = p_user_id AND status = 'revision_requested';

  IF v_total_deliverables > 0 THEN
    v_revision_rate := v_revised_count::numeric / v_total_deliverables;
  END IF;

  -- cancelled campaigns (status = 'rejected' after acceptance implies cancellation)
  SELECT COUNT(*) INTO v_total_cancelled
  FROM public.campaign_applications
  WHERE user_id = p_user_id AND status = 'rejected';

  -- repeat rate: campaigns where the same business hired this creator again
  SELECT COALESCE(
    (SELECT COUNT(DISTINCT c.user_id)::numeric /
           NULLIF(COUNT(DISTINCT c2.user_id), 0)
     FROM public.campaign_applications ca
     JOIN public.campaigns c ON c.id = ca.campaign_id
     JOIN (SELECT DISTINCT c.user_id
           FROM public.campaign_applications ca
           JOIN public.campaigns c ON c.id = ca.campaign_id
           WHERE ca.user_id = p_user_id AND ca.status = 'accepted'
           GROUP BY c.user_id
           HAVING COUNT(*) > 1) c2 ON c2.user_id = c.user_id
     WHERE ca.user_id = p_user_id AND ca.status = 'accepted'),
    0
  ) INTO v_repeat_rate;

  -- XP proxy (capped at 100)
  v_xp := LEAST(v_total_campaigns * 10 + v_total_reviews * 5, 100);

  SELECT avg_response_time_hours INTO v_avg_response_hours
  FROM public.creator_trust_scores
  WHERE user_id = p_user_id;

  IF v_avg_response_hours IS NOT NULL THEN
    IF    v_avg_response_hours <= 2  THEN v_response_bonus := 5;
    ELSIF v_avg_response_hours <= 6  THEN v_response_bonus := 3;
    ELSIF v_avg_response_hours <= 24 THEN v_response_bonus := 1;
    ELSE                                  v_response_bonus := 0;
    END IF;
  END IF;

  v_raw_score :=
    (v_completion_rate * 35)
    + ((v_avg_rating / 5.0) * 25)
    + (v_approval_rate * 15)
    + ((1 - v_revision_rate) * 10)
    + (v_repeat_rate * 10)
    + (v_xp / 100.0 * 5)
    + v_response_bonus;

  v_final_score := LEAST(100, GREATEST(0, ROUND(v_raw_score)));

  IF    v_final_score >= 85 AND v_total_campaigns >= 3  THEN v_tier := 'elite';
  ELSIF v_final_score >= 75 AND v_total_campaigns >= 5  THEN v_tier := 'trusted';
  ELSIF v_final_score >= 65 AND v_total_campaigns >= 3  THEN v_tier := 'reliable';
  ELSIF v_final_score >= 50                             THEN v_tier := 'rising';
  ELSE                                                        v_tier := 'new';
  END IF;

  -- FIX: updated_at -> last_computed_at (the only real column on this table)
  INSERT INTO public.creator_trust_scores (
    user_id, score, tier, completion_rate, approval_rate,
    avg_rating, repeat_rate, total_campaigns, total_reviews,
    revision_rate, accepted_contract_rate, total_cancelled_campaigns, last_computed_at
  ) VALUES (
    p_user_id, v_final_score, v_tier, v_completion_rate, v_approval_rate,
    v_avg_rating, v_repeat_rate, v_total_campaigns, v_total_reviews,
    v_revision_rate, v_accepted_rate, v_total_cancelled, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    score                     = EXCLUDED.score,
    tier                      = EXCLUDED.tier,
    completion_rate           = EXCLUDED.completion_rate,
    approval_rate             = EXCLUDED.approval_rate,
    avg_rating                = EXCLUDED.avg_rating,
    repeat_rate               = EXCLUDED.repeat_rate,
    total_campaigns           = EXCLUDED.total_campaigns,
    total_reviews             = EXCLUDED.total_reviews,
    revision_rate             = EXCLUDED.revision_rate,
    accepted_contract_rate    = EXCLUDED.accepted_contract_rate,
    total_cancelled_campaigns = EXCLUDED.total_cancelled_campaigns,
    last_computed_at          = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_business_trust_score(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_rate               numeric := 0;
  v_contract_completion        numeric := 0;
  v_avg_rating_given           numeric := 0;
  v_repeat_creator_rate        numeric := 0;
  v_total_campaigns            integer := 0;
  v_total_reviews_given        integer := 0;
  v_xp                         integer := 0;

  v_review_speed_bonus         numeric := 0;
  v_app_review_speed_hours     numeric;
  v_deliv_review_speed_hours   numeric;

  v_raw_score   numeric := 0;
  v_final_score integer := 0;
  v_tier        text    := 'new';
BEGIN
  SELECT COUNT(*) INTO v_total_campaigns
  FROM public.campaigns
  WHERE user_id = p_user_id;

  SELECT COALESCE(AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)
  INTO v_contract_completion
  FROM public.contracts
  WHERE business_id = p_user_id;

  SELECT COALESCE(
    (SELECT COUNT(CASE WHEN status IN ('active','completed') THEN 1 END)::numeric /
            NULLIF(COUNT(*), 0)
     FROM public.contracts WHERE business_id = p_user_id),
    0
  ) INTO v_payment_rate;

  -- ratings given (FIX: public.reviews, reviewer_id — not creator_reviews)
  SELECT COUNT(*), COALESCE(AVG(rating), 0)
  INTO v_total_reviews_given, v_avg_rating_given
  FROM public.reviews
  WHERE reviewer_id = p_user_id;

  SELECT COALESCE(
    (SELECT COUNT(DISTINCT ca.user_id)::numeric /
            NULLIF(COUNT(DISTINCT ca.user_id), 0)
     FROM public.campaign_applications ca
     JOIN public.campaigns c ON c.id = ca.campaign_id
     WHERE c.user_id = p_user_id AND ca.status = 'accepted'
     GROUP BY ca.user_id HAVING COUNT(*) > 1),
    0
  ) INTO v_repeat_creator_rate;

  SELECT application_review_speed_hours, deliverable_review_speed_hours
  INTO v_app_review_speed_hours, v_deliv_review_speed_hours
  FROM public.business_trust_scores
  WHERE user_id = p_user_id;

  IF v_app_review_speed_hours IS NOT NULL THEN
    IF    v_app_review_speed_hours <= 4  THEN v_review_speed_bonus := v_review_speed_bonus + 3;
    ELSIF v_app_review_speed_hours <= 24 THEN v_review_speed_bonus := v_review_speed_bonus + 1;
    END IF;
  END IF;
  IF v_deliv_review_speed_hours IS NOT NULL THEN
    IF    v_deliv_review_speed_hours <= 12 THEN v_review_speed_bonus := v_review_speed_bonus + 2;
    ELSIF v_deliv_review_speed_hours <= 48 THEN v_review_speed_bonus := v_review_speed_bonus + 1;
    END IF;
  END IF;

  v_xp := LEAST(v_total_campaigns * 10 + v_total_reviews_given * 5, 100);

  v_raw_score :=
    (v_payment_rate * 30)
    + ((v_avg_rating_given / 5.0) * 25)
    + (v_contract_completion * 25)
    + (v_repeat_creator_rate * 15)
    + (v_xp / 100.0 * 5)
    + v_review_speed_bonus;

  v_final_score := LEAST(100, GREATEST(0, ROUND(v_raw_score)));

  IF    v_final_score >= 85 AND v_total_campaigns >= 3  THEN v_tier := 'elite';
  ELSIF v_final_score >= 75 AND v_total_campaigns >= 5  THEN v_tier := 'trusted';
  ELSIF v_final_score >= 65 AND v_total_campaigns >= 3  THEN v_tier := 'reliable';
  ELSIF v_final_score >= 50                             THEN v_tier := 'rising';
  ELSE                                                        v_tier := 'new';
  END IF;

  -- FIX: updated_at -> last_computed_at (the only real column on this table)
  INSERT INTO public.business_trust_scores (
    user_id, score, tier, payment_rate, contract_completion,
    avg_rating_given, repeat_creator_rate, total_campaigns, total_reviews_given, last_computed_at
  ) VALUES (
    p_user_id, v_final_score, v_tier, v_payment_rate, v_contract_completion,
    v_avg_rating_given, v_repeat_creator_rate, v_total_campaigns, v_total_reviews_given, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    score                = EXCLUDED.score,
    tier                 = EXCLUDED.tier,
    payment_rate         = EXCLUDED.payment_rate,
    contract_completion  = EXCLUDED.contract_completion,
    avg_rating_given     = EXCLUDED.avg_rating_given,
    repeat_creator_rate  = EXCLUDED.repeat_creator_rate,
    total_campaigns      = EXCLUDED.total_campaigns,
    total_reviews_given  = EXCLUDED.total_reviews_given,
    last_computed_at     = now();
END;
$function$;
