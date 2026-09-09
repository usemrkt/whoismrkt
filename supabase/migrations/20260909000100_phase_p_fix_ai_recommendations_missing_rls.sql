-- ─────────────────────────────────────────────────────────────────────────────
-- Phase P hotfix — found during live audit, not introduced by Phase P:
-- ai_recommendations has row-level security ENABLED but carries ZERO
-- policies (`select policyname from pg_policies where tablename=
-- 'ai_recommendations'` returns no rows on production). RLS-enabled + no
-- permissive policy = deny-all for every non-service-role caller — so no
-- authenticated business account can currently SELECT its own
-- recommendations at all, despite marketing-hub-briefing/index.ts's own
-- header comment ("the client reads/updates ai_recommendations directly via
-- its existing owner RLS policy") and marketingHub.tsx's existing direct
-- `.update(patch).eq("id", id)` call both assuming one exists.
--
-- This directly blocks Phase P's own new read path
-- (useProactiveRecommendationsQuery) — genuinely blocking, not a drive-by
-- fix (spec §41's carve-out: "do not mix unrelated fixes... unless they
-- genuinely block this work").
--
-- Scope, deliberately minimal:
--   • SELECT only, owner-scoped — unblocks Phase P's read path AND the
--     pre-existing (currently-broken) UI cards that also read this table.
--   • Deliberately NOT adding a client UPDATE/INSERT policy — the
--     pre-existing direct `.update()` call in marketingHub.tsx is a
--     separate, out-of-scope gap (flagged in the Phase P report, not fixed
--     here); Phase P's own mutation (dismiss_recommendation) is already a
--     SECURITY DEFINER RPC, matching Phase N/O's "no direct client
--     mutation" discipline, and needs no table-level grant to work.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "Users read own recommendations" ON public.ai_recommendations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
