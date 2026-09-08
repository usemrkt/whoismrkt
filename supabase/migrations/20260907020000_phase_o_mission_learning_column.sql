-- ─────────────────────────────────────────────────────────────────────────────
-- Phase O — one additive column on the existing (Phase N) missions table:
-- a marker for "learning extraction has run for this terminal mission,
-- don't re-run it every subsequent cron tick." This is the only Phase O
-- touches the Mission engine's own schema — no existing column, RPC,
-- policy, or grant on missions/mission_tasks/mission_approvals/
-- mission_events is altered.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS learnings_processed_at timestamptz;
