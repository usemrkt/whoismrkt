-- ─────────────────────────────────────────────────────────────────────────────
-- Phase N — schedule mission-task-runner every minute. Tasks are cheap and
-- individually bounded (claim_ready_mission_tasks caps the batch, and each
-- task's own risk/budget checks cap spend), so a tight cadence is safe and
-- keeps a Mission feeling responsive without depending on the best-effort
-- HTTP nudge in cmo-create-mission (which is a UX latency improvement only,
-- never the actual guarantee — this cron is the guarantee).
--
-- Same vault.decrypted_secrets / net.http_post pattern as every other cron
-- job since 20260820100000_fix_vault_cron_column_bug.sql — no hardcoded
-- token, matching the Phase A remediation this schema inherits.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.schedule(
  'mission-task-runner',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/mission-task-runner',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
      ),
      body    := '{"trigger":"cron"}'::jsonb
    );
  $$
);
