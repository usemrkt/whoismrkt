// ─────────────────────────────────────────────────────────────────────────────
// Phase O — Business Brain retrieval logic. Tests the pure, deterministic
// parts of _shared/businessBrain.ts directly (no Deno-specific code in this
// file, same aliasing as every other _shared module tested here).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  formatBusinessBrainForPrompt, selectAndRankFacts,
  type BusinessBrainContext, type BusinessFact,
} from "../../supabase/functions/_shared/businessBrain.ts";

function fact(overrides: Partial<BusinessFact>): BusinessFact {
  return {
    id: "id", category: "audience", fact_key: "k", statement: "s",
    source_type: "user_stated", confidence: "high", observed_at: new Date().toISOString(),
    expires_at: null, agent_key: null, mission_id: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<BusinessBrainContext>): BusinessBrainContext {
  return {
    brand: null, constraints: [], facts: [], recentHealthScore: null,
    recentFindings: [], unavailableSources: [],
    ...overrides,
  };
}

describe("selectAndRankFacts — purpose-aware category filtering", () => {
  const facts = [
    fact({ id: "1", category: "audience", source_type: "user_stated", confidence: "high" }),
    fact({ id: "2", category: "competitors", source_type: "measured", confidence: "high" }),
    fact({ id: "3", category: "products", source_type: "ai_inferred", confidence: "low" }),
    fact({ id: "4", category: "constraints", source_type: "user_stated", confidence: "high" }),
  ];

  it("the Copywriter never receives competitor-only categories the Performance Marketer needs", () => {
    const copyFacts = selectAndRankFacts(facts, "copy").map((f) => f.id);
    expect(copyFacts).not.toContain("2"); // competitors — not in 'copy's list
    const perfFacts = selectAndRankFacts(facts, "performance").map((f) => f.id);
    expect(perfFacts).toContain("2");
  });

  it("constraints are never returned by this function — they're retrieved separately, always in full, never purpose-filtered", () => {
    for (const purpose of ["cmo", "copy", "content", "performance", "growth", "intelligence", "creative", "social", "lifecycle", "analyst"] as const) {
      expect(selectAndRankFacts(facts, purpose).some((f) => f.category === "constraints")).toBe(false);
    }
  });

  it("the CMO gets the broadest category set", () => {
    const cmoFacts = selectAndRankFacts(facts, "cmo").map((f) => f.id);
    expect(cmoFacts).toEqual(expect.arrayContaining(["1", "2", "3"]));
  });

  it("Phase P: the Meta Ads Specialist gets its own dedicated purpose — brand/audience/products/competitors, not a bare alias for 'performance'", () => {
    const metaFacts = selectAndRankFacts(facts, "meta_ads").map((f) => f.id);
    expect(metaFacts).toEqual(expect.arrayContaining(["1", "2", "3"])); // audience, competitors, products
    const perfFacts = selectAndRankFacts(facts, "performance").map((f) => f.id);
    expect(perfFacts).not.toContain("3"); // 'performance' purpose has no 'products' — proves it's a genuinely different list, not the same array reused
  });
});

describe("selectAndRankFacts — priority ordering (spec §11: constraints > canonical > verified > measured > historical > AI inference)", () => {
  it("orders by source authority first: user_stated/business_data before measured before ai_inferred, regardless of recency", () => {
    const old = new Date(Date.now() - 100_000).toISOString();
    const recent = new Date().toISOString();
    const facts = [
      fact({ id: "ai", category: "audience", source_type: "ai_inferred", confidence: "high", observed_at: recent }),
      fact({ id: "user", category: "audience", source_type: "user_stated", confidence: "high", observed_at: old }),
      fact({ id: "measured", category: "audience", source_type: "measured", confidence: "high", observed_at: old }),
    ];
    const ranked = selectAndRankFacts(facts, "cmo").map((f) => f.id);
    expect(ranked).toEqual(["user", "measured", "ai"]); // a NEWER ai_inferred fact never outranks an OLDER user_stated one
  });

  it("within the same source tier, higher confidence ranks first", () => {
    const facts = [
      fact({ id: "low", category: "audience", source_type: "measured", confidence: "low" }),
      fact({ id: "high", category: "audience", source_type: "measured", confidence: "verified" }),
    ];
    expect(selectAndRankFacts(facts, "cmo").map((f) => f.id)).toEqual(["high", "low"]);
  });

  it("within the same source+confidence tier, more recent wins", () => {
    const facts = [
      fact({ id: "old", category: "audience", source_type: "measured", confidence: "high", observed_at: new Date(Date.now() - 100_000).toISOString() }),
      fact({ id: "new", category: "audience", source_type: "measured", confidence: "high", observed_at: new Date().toISOString() }),
    ];
    expect(selectAndRankFacts(facts, "cmo").map((f) => f.id)).toEqual(["new", "old"]);
  });
});

describe("formatBusinessBrainForPrompt", () => {
  it("always includes constraints, labeled and never silently dropped", () => {
    const out = formatBusinessBrainForPrompt(ctx({
      constraints: [fact({ category: "constraints", statement: "Never use aggressive discount language", source_type: "user_stated", confidence: "high" })],
    }));
    expect(out).toContain("Constraints (always binding):");
    expect(out).toContain("Never use aggressive discount language");
    expect(out).toContain("[user_stated, high]");
  });

  it("includes every fact with its source_type and confidence visible for provenance", () => {
    const out = formatBusinessBrainForPrompt(ctx({
      facts: [fact({ statement: "Primary audience is women 25-40 in UAE", source_type: "measured", confidence: "medium", category: "audience" })],
    }));
    expect(out).toContain("Primary audience is women 25-40 in UAE");
    expect(out).toContain("[measured, medium, audience]");
  });

  it("surfaces degraded-context sources honestly rather than pretending full context loaded", () => {
    const out = formatBusinessBrainForPrompt(ctx({ unavailableSources: ["business_facts", "marketing_health"] }));
    expect(out).toContain("business_facts, marketing_health");
    expect(out).toContain("unavailable this call");
  });

  it("never fabricates a health score or findings when none exist", () => {
    const out = formatBusinessBrainForPrompt(ctx({}));
    expect(out).not.toContain("Marketing Health score");
    expect(out).not.toContain("Recent market findings");
  });
});
