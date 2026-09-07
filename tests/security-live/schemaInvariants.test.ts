// ─────────────────────────────────────────────────────────────────────────────
// Phase L — Category M: Database Migration / Live-Drift Checks.
//
// The Founder Audit's repeated finding: "migration says fixed, production
// still broken." These checks assert the FINAL REQUIRED STATE directly
// against the live linked project — not by parsing migration files (which
// only prove intent), by querying information_schema/pg_policies/pg_proc/
// pg_indexes/cron.job themselves. Every query is a plain SELECT — this file
// can never mutate a row. Opt-in only: `npm run test:security:live-readonly`
// (requires the `supabase` CLI logged in + linked). Not part of default
// `npm test` — see tests/security-live/liveSql.ts's header for why.
//
// This does not attempt to parse every migration or prove exhaustive RLS
// correctness — see the Phase L report for the explicit list of what this
// suite does and does not cover (§21 of the brief: "do not claim total
// coverage if tooling cannot guarantee it").
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { liveSql } from "./liveSql";

describe("unsafe admin_verify_creator overload is absent", () => {
  it("exactly one admin_verify_creator function exists, taking (p_creator_id, p_admin_id, p_note)", () => {
    const rows = liveSql<{ proname: string; args: string }>(
      "select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_verify_creator';",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].args).toContain("p_admin_id");
  });
});

describe("RLS enabled on every required sensitive table", () => {
  const REQUIRED_TABLES = [
    "ai_credits",
    "admin_actions",
    "contracts",
    "campaign_payments",
    "notifications",
    "profiles",
    "campaign_deliverable_submissions",
    "system_incidents",
    "stripe_webhook_events",
    "ai_requests",
    "provider_health",
  ];

  it("every required table has row-level security enabled", () => {
    const rows = liveSql<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in (${REQUIRED_TABLES.map((t) => `'${t}'`).join(",")}) and relnamespace='public'::regnamespace;`,
    );
    const byName = new Map(rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of REQUIRED_TABLES) {
      expect(byName.get(t), `${t} should exist and have RLS enabled`).toBe(true);
    }
  });
});

describe("no permissive (USING true / WITH CHECK true) policy for an untrusted role on sensitive tables", () => {
  it("ai_credits, admin_actions, contracts, campaign_payments have no true-qualified policy outside service_role/postgres", () => {
    const rows = liveSql(
      `select tablename, policyname, roles from pg_policies where schemaname='public' and tablename in ('ai_credits','admin_actions','contracts','campaign_payments') and (qual='true' or with_check='true') and not (roles::text[] <@ array['service_role','postgres']);`,
    );
    expect(rows).toEqual([]);
  });
});

describe("ai_credits — no permissive direct UPDATE for authenticated users", () => {
  it("no policy lets an ordinary authenticated user UPDATE ai_credits directly", () => {
    const rows = liveSql<{ policyname: string; roles: string }>(
      "select policyname, roles from pg_policies where schemaname='public' and tablename='ai_credits' and cmd in ('UPDATE','ALL') and roles::text[] && array['authenticated','public'];",
    );
    expect(rows).toEqual([]);
  });
});

describe("contracts — the Phase H fix holds: no broad creator UPDATE policy", () => {
  it("the creator's only policy on contracts is SELECT — no direct UPDATE/ALL grant exists for creators", () => {
    const rows = liveSql<{ cmd: string; qual: string }>(
      "select cmd, qual from pg_policies where schemaname='public' and tablename='contracts';",
    );
    const creatorFacing = rows.filter((r) => /creator_id/.test(r.qual ?? ""));
    for (const r of creatorFacing) {
      expect(r.cmd, "a creator-scoped contracts policy must never be UPDATE/ALL").not.toMatch(
        /UPDATE|ALL/,
      );
    }
  });
});

describe("SECURITY DEFINER functions have a pinned search_path", () => {
  it("every SECURITY DEFINER function in public sets search_path explicitly", () => {
    const rows = liveSql<{ proname: string }>(
      "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef=true and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) cfg where cfg like 'search_path=%');",
    );
    expect(
      rows,
      `unpinned SECURITY DEFINER functions: ${rows.map((r) => r.proname).join(", ")}`,
    ).toEqual([]);
  });
});

describe("critical cron.job commands contain no raw JWT", () => {
  it("no scheduled job command embeds a literal JWT (eyJ... base64 header) — all use vault.decrypted_secrets", () => {
    const rows = liveSql<{ jobname: string }>(
      "select jobname from cron.job where command ilike '%eyJ%';",
    );
    expect(rows).toEqual([]);
  });
});

describe("required FK indexes exist (Phase H)", () => {
  it("a sample of the 34 FK indexes added in Phase H are present", () => {
    const SAMPLE_INDEXES = [
      "contracts_business_idx",
      "contracts_creator_idx",
      "campaign_deliverable_submissions_business_id_idx",
      "campaign_payments_business_idx",
    ];
    const rows = liveSql<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname='public' and indexname in (${SAMPLE_INDEXES.map((i) => `'${i}'`).join(",")});`,
    );
    const found = new Set(rows.map((r) => r.indexname));
    const missing = SAMPLE_INDEXES.filter((i) => !found.has(i));
    expect(missing, `missing expected indexes: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("stripe_webhook_events replay protection", () => {
  it("event_id is uniquely constrained (primary key or unique constraint — either enforces no-duplicate-processing)", () => {
    const rows = liveSql<{ conname: string; contype: string }>(
      "select conname, contype from pg_constraint c join pg_class t on t.oid=c.conrelid where t.relname='stripe_webhook_events' and c.contype in ('u','p');",
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("campaign_deliverable_submissions — creator SELECT policy exists (Phase L.1 regression guard)", () => {
  it("a real SELECT policy scoped to auth.uid()=creator_id exists — this exact gap once made the live Deliverables page unusable for every creator (found via Phase L.1 behavioral testing, fixed in 20260830000400_phase_l1_fix_deliverable_creator_select.sql)", () => {
    const rows = liveSql<{ policyname: string; qual: string }>(
      "select policyname, qual from pg_policies where schemaname='public' and tablename='campaign_deliverable_submissions' and cmd='SELECT' and qual ilike '%creator_id%';",
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("campaign_applications — no duplicate notification triggers (Phase M regression guard)", () => {
  it("the 4 redundant DB-level notification triggers found live during Phase M stay removed", () => {
    const rows = liveSql<{ tgname: string }>(
      "select tgname from pg_trigger where tgrelid='campaign_applications'::regclass and not tgisinternal and tgname in ('notify_on_new_application','on_new_application_notify','notify_on_app_status','on_application_status_notify');",
    );
    expect(rows).toEqual([]);
  });
});

describe("is_admin() is SECURITY DEFINER with a pinned search_path (the admin gate every admin surface relies on)", () => {
  it("is_admin exists, is SECURITY DEFINER, and pins search_path", () => {
    const rows = liveSql<{ prosecdef: boolean; proconfig: string[] | null }>(
      "select prosecdef, proconfig from pg_proc where proname='is_admin' and pronamespace='public'::regnamespace;",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prosecdef).toBe(true);
    expect((rows[0].proconfig ?? []).some((c) => c.startsWith("search_path="))).toBe(true);
  });
});

describe("Phase N — internal-only mission RPCs are never directly callable by anon/authenticated (regression guard)", () => {
  it("none of the 6 worker-only functions grant EXECUTE to anon or authenticated — found live during Phase N validation: this project's default privileges grant EXECUTE on every new function to anon/authenticated/service_role, so a plain GRANT ... TO service_role adds a grant without ever removing that default one", () => {
    const INTERNAL_ONLY = [
      "advance_mission_task_graph",
      "claim_ready_mission_tasks",
      "complete_mission_task",
      "request_task_approval",
      "reclaim_expired_mission_task_leases",
      "open_pending_sensitive_approvals",
    ];
    const rows = liveSql<{ proname: string; grantee: string }>(
      `select p.proname, r.rolname as grantee from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       join aclexplode(p.proacl) a on true join pg_roles r on r.oid=a.grantee
       where n.nspname='public' and p.proname in (${INTERNAL_ONLY.map((f) => `'${f}'`).join(",")})
         and r.rolname in ('anon','authenticated');`,
    );
    expect(rows).toEqual([]);
  });

  it("decide_mission_approval and cancel_mission (the 2 client-callable RPCs) grant authenticated but never anon", () => {
    const rows = liveSql<{ proname: string; grantee: string }>(
      `select p.proname, r.rolname as grantee from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       join aclexplode(p.proacl) a on true join pg_roles r on r.oid=a.grantee
       where n.nspname='public' and p.proname in ('decide_mission_approval','cancel_mission');`,
    );
    const byFn = new Map<string, string[]>();
    for (const r of rows) byFn.set(r.proname, [...(byFn.get(r.proname) ?? []), r.grantee]);
    expect(byFn.get("decide_mission_approval")).toContain("authenticated");
    expect(byFn.get("decide_mission_approval")).not.toContain("anon");
    expect(byFn.get("cancel_mission")).toContain("authenticated");
    expect(byFn.get("cancel_mission")).not.toContain("anon");
  });
});

describe("Phase N — mission execution tables have no client-mutation policy (regression guard)", () => {
  it("missions/mission_tasks/mission_approvals/mission_events have SELECT-only policies for authenticated — every state transition must go through a SECURITY DEFINER RPC, never a direct PostgREST write", () => {
    const rows = liveSql<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies where schemaname='public'
       and tablename in ('missions','mission_tasks','mission_approvals','mission_events');`,
    );
    for (const r of rows) {
      expect(r.cmd, `${r.tablename} should have no non-SELECT policy for a client role`).toBe("SELECT");
    }
  });

  it("advance_mission_task_graph has no internal auth.role() check left over that would break its legitimate nested caller (decide_mission_approval) — the exact live bug found and fixed during Phase N validation", () => {
    const rows = liveSql<{ prosrc: string }>(
      "select prosrc from pg_proc where proname='advance_mission_task_graph' and pronamespace='public'::regnamespace;",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].prosrc).not.toContain("service-role only");
  });
});

describe("Phase N — RLS enabled on every new table (regression guard)", () => {
  it("agents, business_autonomy_policy, missions, mission_tasks, mission_approvals, mission_events all have row-level security enabled", () => {
    const TABLES = ["agents", "business_autonomy_policy", "missions", "mission_tasks", "mission_approvals", "mission_events"];
    const rows = liveSql<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in (${TABLES.map((t) => `'${t}'`).join(",")}) and relnamespace='public'::regnamespace;`,
    );
    const byName = new Map(rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of TABLES) {
      expect(byName.get(t), `${t} should exist and have RLS enabled`).toBe(true);
    }
  });
});

describe("Phase N — mission-task-runner cron is scheduled with vault-based auth, no hardcoded secret", () => {
  it("the mission-task-runner cron job's command has no literal JWT (eyJ... base64 header)", () => {
    const rows = liveSql<{ command: string }>(
      "select command from cron.job where jobname='mission-task-runner';",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].command).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(rows[0].command).toContain("vault.decrypted_secrets");
  });
});
