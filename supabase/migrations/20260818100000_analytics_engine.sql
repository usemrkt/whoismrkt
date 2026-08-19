-- ─────────────────────────────────────────────────────────────────────────────
-- Analytics Engine — wiring three dormant tables (Marketing Hub Phase 4C)
--
-- match_outcomes, campaign_health_scores, and business_daily_metrics all had
-- complete schemas (and, for campaign_health_scores/business_daily_metrics,
-- complete compute logic already written as compute_campaign_health() and the
-- compute-daily-metrics edge function) but nothing ever invoked them. This
-- migration is purely additive: every new trigger function is separate from
-- the existing trust-score triggers (sync_trust_on_review, sync_trust_on_contract,
-- sync_trust_on_deliverable) — none of those are modified.
--
-- One exception, stated explicitly: trigger_trust_on_payment() was defined in
-- 20260613200000_intelligence_layer.sql but never attached to a trigger — its
-- status IN ('completed','released') check does not match the LIVE
-- campaign_payments status constraint (verified directly against the
-- production schema, not a migration file: pending, awaiting_payment, paid,
-- deliverable_submitted, approved, payout_pending, payout_completed, disputed,
-- refunded, failed — 'completed'/'released' don't exist). It is corrected to
-- the real terminal states ('paid', 'payout_completed') here, then attached
-- for the first time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Seed + sync match_outcomes from campaign_applications ─────────────────

CREATE OR REPLACE FUNCTION public.trigger_analytics_on_application_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business_id      uuid;
  v_match_score      integer;
  v_score_breakdown  jsonb;
  v_creator_trust    integer;
BEGIN
  SELECT user_id INTO v_business_id FROM public.campaigns WHERE id = NEW.campaign_id;
  IF v_business_id IS NULL THEN RETURN NEW; END IF;

  -- Real match score if one was ever computed for this (creator, campaign)
  -- pair (compute-match-score/index.ts) — nullable, most applications won't
  -- have one yet, and match_outcomes.match_score is nullable for exactly this
  -- reason. Never invented if absent.
  SELECT score, explanation_json INTO v_match_score, v_score_breakdown
  FROM public.match_score_cache
  WHERE creator_id = NEW.user_id AND campaign_id = NEW.campaign_id
  ORDER BY computed_at DESC LIMIT 1;

  SELECT score INTO v_creator_trust FROM public.creator_trust_scores WHERE user_id = NEW.user_id LIMIT 1;

  INSERT INTO public.match_outcomes (
    campaign_id, creator_profile_id, business_user_id,
    match_score, score_breakdown, creator_trust_at_time,
    was_shortlisted, was_accepted, shortlisted_at, accepted_at
  ) VALUES (
    NEW.campaign_id, NEW.creator_profile_id, v_business_id,
    v_match_score, v_score_breakdown, v_creator_trust,
    NEW.status = 'shortlisted', NEW.status = 'accepted',
    CASE WHEN NEW.status = 'shortlisted' THEN now() END,
    CASE WHEN NEW.status = 'accepted'    THEN now() END
  )
  ON CONFLICT (campaign_id, creator_profile_id) DO NOTHING;

  PERFORM public.compute_campaign_health(NEW.campaign_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_on_application_insert ON public.campaign_applications;
CREATE TRIGGER analytics_on_application_insert
  AFTER INSERT ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_analytics_on_application_insert();

CREATE OR REPLACE FUNCTION public.trigger_analytics_on_application_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.match_outcomes SET
      was_shortlisted = was_shortlisted OR (NEW.status = 'shortlisted'),
      was_accepted    = was_accepted    OR (NEW.status = 'accepted'),
      shortlisted_at  = COALESCE(shortlisted_at, CASE WHEN NEW.status = 'shortlisted' THEN now() END),
      accepted_at     = COALESCE(accepted_at,    CASE WHEN NEW.status = 'accepted'    THEN now() END),
      updated_at      = now()
    WHERE campaign_id = NEW.campaign_id AND creator_profile_id = NEW.creator_profile_id;

    PERFORM public.compute_campaign_health(NEW.campaign_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_on_application_update ON public.campaign_applications;
CREATE TRIGGER analytics_on_application_update
  AFTER UPDATE ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_analytics_on_application_update();

-- ── 2. Sync match_outcomes from contracts (incl. rehire detection) ───────────

CREATE OR REPLACE FUNCTION public.trigger_match_outcome_on_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator_profile_id   uuid;
  v_prior_accepted_count integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT id INTO v_creator_profile_id FROM public.creator_profiles WHERE user_id = NEW.creator_id LIMIT 1;
    IF v_creator_profile_id IS NULL THEN RETURN NEW; END IF;

    IF NEW.status IN ('sent', 'accepted') THEN
      UPDATE public.match_outcomes SET contract_sent = true, updated_at = now()
      WHERE campaign_id = NEW.campaign_id AND creator_profile_id = v_creator_profile_id;
    END IF;

    IF NEW.status = 'accepted' THEN
      -- Same repeat-relationship shape already used inside
      -- compute_business_trust_score's own repeat-rate subquery.
      SELECT COUNT(*) INTO v_prior_accepted_count
      FROM public.contracts
      WHERE creator_id = NEW.creator_id AND business_id = NEW.business_id AND status = 'accepted';

      UPDATE public.match_outcomes SET
        contract_accepted    = true,
        contract_accepted_at = COALESCE(contract_accepted_at, now()),
        was_rehired          = was_rehired OR (v_prior_accepted_count > 1),
        updated_at            = now()
      WHERE campaign_id = NEW.campaign_id AND creator_profile_id = v_creator_profile_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_outcome_on_contract ON public.contracts;
CREATE TRIGGER match_outcome_on_contract
  AFTER UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trigger_match_outcome_on_contract();

-- ── 3. Sync match_outcomes + campaign health from deliverable approval ───────

CREATE OR REPLACE FUNCTION public.trigger_analytics_on_deliverable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator_profile_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'approved' THEN
    SELECT id INTO v_creator_profile_id FROM public.creator_profiles WHERE user_id = NEW.creator_id LIMIT 1;
    IF v_creator_profile_id IS NOT NULL THEN
      UPDATE public.match_outcomes SET
        deliverables_approved = true,
        completed_at           = COALESCE(completed_at, now()),
        updated_at              = now()
      WHERE campaign_id = NEW.campaign_id AND creator_profile_id = v_creator_profile_id;
    END IF;

    PERFORM public.compute_campaign_health(NEW.campaign_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS analytics_on_deliverable ON public.campaign_deliverable_submissions;
CREATE TRIGGER analytics_on_deliverable
  AFTER UPDATE ON public.campaign_deliverable_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_analytics_on_deliverable();

-- ── 4. Payments: fix + finally attach the orphaned trust trigger, plus a new
--       match_outcomes payment-completion trigger ────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_trust_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Corrected to the LIVE campaign_payments status constraint. The original
  -- (never-attached) version checked 'completed'/'released', which are not
  -- valid values in production today — verified directly against the live
  -- schema, not assumed from a migration file.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('paid', 'payout_completed', 'failed', 'disputed') THEN
    PERFORM public.compute_business_trust_score(NEW.business_id);
    PERFORM public.compute_creator_trust_score(NEW.creator_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_trust_on_payment ON public.campaign_payments;
CREATE TRIGGER sync_trust_on_payment
  AFTER UPDATE ON public.campaign_payments
  FOR EACH ROW EXECUTE FUNCTION public.trigger_trust_on_payment();

CREATE OR REPLACE FUNCTION public.trigger_match_outcome_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_creator_profile_id uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('paid', 'payout_completed') THEN
    SELECT id INTO v_creator_profile_id FROM public.creator_profiles WHERE user_id = NEW.creator_id LIMIT 1;
    IF v_creator_profile_id IS NOT NULL THEN
      UPDATE public.match_outcomes SET payment_completed = true, updated_at = now()
      WHERE campaign_id = NEW.campaign_id AND creator_profile_id = v_creator_profile_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_outcome_on_payment ON public.campaign_payments;
CREATE TRIGGER match_outcome_on_payment
  AFTER UPDATE ON public.campaign_payments
  FOR EACH ROW EXECUTE FUNCTION public.trigger_match_outcome_on_payment();

-- ── 5. business_daily_metrics — the writer already exists and already loops
--       over every business internally (compute-daily-metrics/index.ts); it
--       has simply never been scheduled. Same net.http_post pattern as the
--       live weekly-digest cron (20260616050000_weekly_digest_cron.sql). ─────

SELECT cron.schedule(
  'compute-daily-metrics',
  '0 2 * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT value FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compute-daily-metrics',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{"trigger":"cron"}'::jsonb
    );
  $$
);
