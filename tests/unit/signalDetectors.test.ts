// ─────────────────────────────────────────────────────────────────────────────
// Phase P — Signal Detector Registry. Tests the pure/deterministic parts of
// _shared/signalDetectors.ts directly (same aliasing as every other _shared
// module tested here), using a minimal fluent mock of the Supabase
// query-builder chain (each detector's real shape, not a generic stub).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  SIGNAL_DETECTORS,
  nthWeekdayOfMonth,
  type SignalDetectionResult,
} from "../../supabase/functions/_shared/signalDetectors.ts";

// deno-lint-ignore no-explicit-any
type Filters = Record<string, any>;

function makeSupabase(resolver: (table: string, filters: Filters) => unknown) {
  function builder(table: string) {
    const filters: Filters = {};
    // deno-lint-ignore no-explicit-any
    const chain: any = {
      select: (cols: string, opts?: unknown) => { filters.select = cols; if (opts) filters.selectOpts = opts; return chain; },
      eq: (k: string, v: unknown) => { filters[`eq_${k}`] = v; return chain; },
      gte: (k: string, v: unknown) => { filters[`gte_${k}`] = v; return chain; },
      lt: (k: string, v: unknown) => { filters[`lt_${k}`] = v; return chain; },
      ilike: (k: string, v: unknown) => { filters[`ilike_${k}`] = v; return chain; },
      order: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(resolver(table, filters)).then(resolve, reject),
    };
    return chain;
  }
  return { from: builder };
}

function detector(key: string) {
  const d = SIGNAL_DETECTORS.find((x) => x.key === key);
  if (!d) throw new Error(`detector "${key}" not found in registry`);
  return d;
}

describe("SIGNAL_DETECTORS — registry shape", () => {
  it("includes the Meta Ads future detector, registered but requiring a connector", () => {
    const meta = detector("meta_cpa_deterioration");
    expect(meta.requiresConnector).toBe("meta_ads");
  });

  it("meta_cpa_deterioration never fabricates a signal — always returns []", async () => {
    const results = await detector("meta_cpa_deterioration").evaluate(makeSupabase(() => ({ data: [] })), "biz-1");
    expect(results).toEqual([]);
  });

  it("every live detector key is unique", () => {
    const keys = SIGNAL_DETECTORS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("mission_repeated_tool_failure — data → deterministic rule, not an LLM vibe-check", () => {
  it("fires when the SAME tool fails 2+ times with the SAME known signature", async () => {
    const supabase = makeSupabase((table, filters) => {
      if (table === "mission_tasks" && filters.selectOpts) {
        // the count-only re-query
        return { count: 2 };
      }
      return { data: [{ tool_name: "draft_campaign", error_message: "Your credit balance is too low" }] };
    });
    const results = await detector("mission_repeated_tool_failure").evaluate(supabase, "biz-1");
    expect(results).toHaveLength(1);
    expect(results[0].dedupeKey).toBe("mission_repeated_tool_failure:draft_campaign:provider_billing_exhausted");
    expect(results[0].severity).toBe("medium");
    expect(results[0].confidence).toBe("high"); // deterministic, real counted data — never anything less
    expect(results[0].proposedMission).not.toBeNull();
    expect(results[0].proposedMission!.team).toContain("cmo");
  });

  it("escalates severity at 4+ failures", async () => {
    const supabase = makeSupabase((table, filters) => {
      if (table === "mission_tasks" && filters.selectOpts) return { count: 4 };
      return { data: [{ tool_name: "draft_campaign", error_message: "credit balance is too low" }] };
    });
    const results = await detector("mission_repeated_tool_failure").evaluate(supabase, "biz-1");
    expect(results[0].severity).toBe("high");
  });

  it("does NOT fire on a single incident — one failure is noise, not a pattern", async () => {
    const supabase = makeSupabase((table, filters) => {
      if (table === "mission_tasks" && filters.selectOpts) return { count: 1 };
      return { data: [{ tool_name: "draft_campaign", error_message: "credit balance is too low" }] };
    });
    const results = await detector("mission_repeated_tool_failure").evaluate(supabase, "biz-1");
    expect(results).toEqual([]);
  });

  it("does NOT fire on an unrecognized error message — never a fabricated generic pattern", async () => {
    const supabase = makeSupabase(() => ({ data: [{ tool_name: "draft_campaign", error_message: "some totally novel error" }] }));
    const results = await detector("mission_repeated_tool_failure").evaluate(supabase, "biz-1");
    expect(results).toEqual([]);
  });
});

describe("marketing_health_decline — honest silence on insufficient data (spec §38)", () => {
  it("returns [] with fewer than 2 real snapshots — never fabricates a comparison", async () => {
    const supabase = makeSupabase(() => ({ data: [{ period_start: "2026-08-19", snapshot: { health: { overall: { score: 30 } } } }] }));
    const results = await detector("marketing_health_decline").evaluate(supabase, "biz-1");
    expect(results).toEqual([]);
  });

  it("fires on a real material decline (>=15%) between the two most recent snapshots", async () => {
    const supabase = makeSupabase(() => ({
      data: [
        { period_start: "2026-09-01", snapshot: { health: { overall: { score: 40 } } } },
        { period_start: "2026-08-01", snapshot: { health: { overall: { score: 60 } } } },
      ],
    }));
    const results = await detector("marketing_health_decline").evaluate(supabase, "biz-1");
    expect(results).toHaveLength(1);
    expect(results[0].changePct).toBeCloseTo(-33.3, 1);
    expect(results[0].severity).toBe("high"); // <= -30%
  });

  it("does NOT fire on a small, immaterial change", async () => {
    const supabase = makeSupabase(() => ({
      data: [
        { period_start: "2026-09-01", snapshot: { health: { overall: { score: 58 } } } },
        { period_start: "2026-08-01", snapshot: { health: { overall: { score: 60 } } } },
      ],
    }));
    const results = await detector("marketing_health_decline").evaluate(supabase, "biz-1");
    expect(results).toEqual([]);
  });

  it("does NOT fire on an IMPROVEMENT", async () => {
    const supabase = makeSupabase(() => ({
      data: [
        { period_start: "2026-09-01", snapshot: { health: { overall: { score: 80 } } } },
        { period_start: "2026-08-01", snapshot: { health: { overall: { score: 60 } } } },
      ],
    }));
    const results = await detector("marketing_health_decline").evaluate(supabase, "biz-1");
    expect(results).toEqual([]);
  });
});

describe("competitor_activity_increase — real counts, requires a genuine doubling", () => {
  it("does NOT fire with sparse data (spec §38 honest silence)", async () => {
    const supabase = makeSupabase(() => ({ count: 1 }));
    const results = await detector("competitor_activity_increase").evaluate(supabase, "biz-1");
    expect(results).toEqual([]);
  });

  it("fires when recent findings at least double the prior window", async () => {
    const supabase = makeSupabase((_table, filters) => ({ count: filters.lt_created_at ? 3 : 8 }));
    const results = await detector("competitor_activity_increase").evaluate(supabase, "biz-1");
    expect(results).toHaveLength(1);
    expect(results[0].proposedMission).toBeNull(); // informational — not every recommendation is Mission-shaped
  });

  it("does NOT fire on a modest increase below the doubling bar", async () => {
    const supabase = makeSupabase((_table, filters) => ({ count: filters.lt_created_at ? 4 : 5 }));
    const results = await detector("competitor_activity_increase").evaluate(supabase, "biz-1");
    expect(results).toEqual([]);
  });
});

describe("seasonal_moment_approaching — pure calendar math, zero data dependency", () => {
  it("nthWeekdayOfMonth finds a real, correct Friday for Black Friday's month", () => {
    const d = nthWeekdayOfMonth(2026, 10, 5, 4); // November (0-indexed), Friday=5, 4th occurrence
    expect(d.getUTCMonth()).toBe(10);
    expect(d.getUTCDay()).toBe(5);
  });

  it("every emitted moment is within the documented 30-day window", async () => {
    const results: SignalDetectionResult[] = await detector("seasonal_moment_approaching").evaluate(makeSupabase(() => ({ data: [] })), "biz-1");
    for (const r of results) {
      expect(r.metricCurrent).not.toBeNull();
      expect(r.metricCurrent as number).toBeGreaterThanOrEqual(0);
      expect(r.metricCurrent as number).toBeLessThanOrEqual(30);
      expect(r.confidence).toBe("verified"); // real calendar fact, not an estimate
    }
  });

  it("never depends on the database — evaluate() ignores its supabase argument entirely", async () => {
    const throwingSupabase = { from: () => { throw new Error("should never be called"); } };
    // deno-lint-ignore no-explicit-any
    await expect(detector("seasonal_moment_approaching").evaluate(throwingSupabase as any, "biz-1")).resolves.toBeDefined();
  });
});
