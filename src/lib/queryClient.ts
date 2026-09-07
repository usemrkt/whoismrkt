// ─────────────────────────────────────────────────────────────────────────────
// Phase K — the one QueryClient for the app + the canonical Marketing Hub
// query-key strategy. Not a rewrite of the whole app's data fetching —
// Marketing Hub reads are the first (and, this phase, only) consumer.
//
// SSR safety: getQueryClient() returns a FRESH client on the server every
// call (RootComponent is re-instantiated per request, so this runs once per
// request there — never reused across requests/users in the same Worker
// isolate) and a stable singleton in the browser (one tab = one client,
// which is what makes cross-navigation caching actually work). This is the
// standard React Query SSR pattern, not a new one.
//
// Query keys are always [...namespace, businessId] — every Marketing Hub
// query is scoped by the viewer's own business id. Combined with auth.tsx's
// queryClient.clear() on sign-out/account-switch (§26/27), this is the two
// layers that keep one account from ever seeing another's cached data.
// ─────────────────────────────────────────────────────────────────────────────

import { QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // A conservative app-wide default — every Marketing Hub hook below
        // sets its own staleTime based on real data semantics (§5). This
        // default only matters for anything that doesn't override it.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false, // AI-backed reads must not silently refire on tab refocus
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

// Phase L: extracted as a standalone, directly-testable pure function (was
// inline in auth.tsx's useEffect) — the exact decision of whether a sign-out
// or account switch should wipe the cache. `undefined` means "no identity
// observed yet" (app just started) — nothing to clear. A same-user token
// refresh (old === new, both non-null) must NOT clear the cache, or caching
// would defeat itself on every silent token refresh.
export function shouldClearQueryCache(
  previousUserId: string | null | undefined,
  currentUserId: string | null,
): boolean {
  if (previousUserId === undefined) return false;
  return previousUserId !== currentUserId;
}

// ─── Canonical Marketing Hub query keys — one scheme, every hook uses it ──────
export const qk = {
  briefing: (businessId: string) => ["marketing-hub", "briefing", businessId] as const,
  intelligenceBrief: (businessId: string) => ["marketing-hub", "intelligence", businessId] as const,
  health: (businessId: string) => ["marketing-hub", "health", businessId] as const,
  reportHistory: (businessId: string, reportType: string) =>
    ["marketing-hub", "reports", "history", businessId, reportType] as const,
  reportCurrentStatus: (businessId: string, reportType: string) =>
    ["marketing-hub", "reports", "current-status", businessId, reportType] as const,
  agencyWorkspace: (businessId: string) => ["marketing-hub", "workspace", businessId] as const,
  // Phase N — Missions. Detail is keyed by missionId alone (not businessId)
  // since RLS already scopes every row to its owner; the list key stays
  // businessId-scoped like every other Hub key for consistency.
  missions: (businessId: string) => ["marketing-hub", "missions", businessId] as const,
  missionDetail: (missionId: string) => ["marketing-hub", "mission-detail", missionId] as const,
  // Everything under the "marketing-hub" namespace root — used only by
  // auth.tsx's belt-and-suspenders clear on sign-out (§26), never for a
  // normal invalidation (mutations invalidate their own key, never this).
  namespaceRoot: ["marketing-hub"] as const,
};
