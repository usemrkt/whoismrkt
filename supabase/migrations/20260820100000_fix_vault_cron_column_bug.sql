-- ─────────────────────────────────────────────────────────────────────────────
-- Fix critical, live cron bug: every net.http_post-based cron job
-- (weekly-digest, compute-daily-metrics, market-intelligence-refresh) reads
-- `SELECT value FROM vault.decrypted_secrets`, but the real column on that
-- view is `decrypted_secret` — verified directly against the live schema
-- (information_schema.columns), not assumed from the migration files that
-- originated this pattern.
--
-- Impact, confirmed via cron.job_run_details:
--   - weekly-digest has failed with "column value does not exist" on every
--     run visible in history (at least back to 2026-06-22, weekly cadence) —
--     this predates this session entirely, inherited when
--     20260616050000_weekly_digest_cron.sql first introduced the pattern.
--   - compute-daily-metrics (this session's Phase 4C fix) failed on its
--     first scheduled run (2026-08-19 02:00 UTC) with the identical error —
--     the vault-seeding fix from Phase 4C corrected the empty-vault problem
--     but this column-name bug was not caught at the time; a real gap in
--     that phase's verification (the job was confirmed SCHEDULED, not
--     confirmed to have successfully EXECUTED).
--   - market-intelligence-refresh (Phase 5, just scheduled) would have had
--     the exact same bug on its very first run had this not been caught
--     during live E2E testing before ever going live.
--
-- Fix: re-issue cron.schedule() for all three job names with the corrected
-- column. cron.schedule() with an existing jobname replaces that job's
-- command in place — this is not a new job, it corrects the three already
-- scheduled ones.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'weekly-digest',
  '0 8 * * 0',
  $$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/weekly-report',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{"trigger":"cron"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'compute-daily-metrics',
  '0 2 * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/compute-daily-metrics',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{"trigger":"cron"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'market-intelligence-refresh',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/market-intelligence-refresh',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{"trigger":"cron"}'::jsonb
    );
  $$
);
