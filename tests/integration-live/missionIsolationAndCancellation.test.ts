// ─────────────────────────────────────────────────────────────────────────────
// Phase N — final hardening: real two-tenant adversarial proof + explicit
// cancellation proof, through the SAME authenticated client/API boundary a
// real business user or attacker would actually use (businessB.client below
// is a real signed-in session with a real JWT — not a schema inspection,
// matching this suite's own established discipline, see authorization.test.ts).
//
// Setup constructs one realistic Mission for a synthetic "Business A" via
// direct table writes (not a real cmo-create-mission call) — zero AI cost,
// fully controlled, and lets every task-state combination the founder asked
// to be verified exist simultaneously: one 'running' (simulates an agent
// actively working), one 'ready', one 'blocked' (depends on the ready one),
// and one 'awaiting_approval' with a real pending mission_approvals row.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAccount, serviceClient, type SyntheticAccount } from "./harness/accounts";
import { cleanupAll } from "./harness/cleanup";

let businessA: SyntheticAccount, businessB: SyntheticAccount;
let missionId: string;
let taskRunningId: string, taskReadyId: string, taskBlockedId: string, taskAwaitingApprovalId: string;
let approvalId: string;
// A second, isolated task+lease pair used ONLY for the "cancel while an
// agent is actively working" race — captured before cancellation so we can
// attempt a late completion with the ORIGINAL worker id afterward.
let raceTaskId: string;
const RACE_WORKER_ID = "aaaaaaaa-9999-9999-9999-999999999999";

beforeAll(async () => {
  [businessA, businessB] = await Promise.all([createAccount("business"), createAccount("business")]);

  await serviceClient.from("business_autonomy_policy").upsert({ business_id: businessA.id }, { onConflict: "business_id" });

  const { data: mission, error: mErr } = await serviceClient
    .from("missions")
    .insert({
      business_id: businessA.id,
      objective: "Phase N final-hardening test mission — isolation + cancellation",
      objective_summary: "Synthetic test mission",
      status: "active",
      priority: "low",
    })
    .select("id")
    .single();
  if (mErr || !mission) throw new Error(`mission insert failed: ${mErr?.message}`);
  missionId = mission.id;

  const { data: t1, error: t1Err } = await serviceClient
    .from("mission_tasks")
    .insert({
      mission_id: missionId, business_id: businessA.id, agent_key: "analyst", tool_name: "gather_context",
      title: "Running task (agent actively working)", risk_level: "safe", status: "running",
      leased_by: "bbbbbbbb-8888-8888-8888-888888888888", leased_until: new Date(Date.now() + 120_000).toISOString(),
    })
    .select("id").single();
  if (t1Err || !t1) throw new Error(`t1 insert failed: ${t1Err?.message}`);
  taskRunningId = t1.id;

  const { data: t2, error: t2Err } = await serviceClient
    .from("mission_tasks")
    .insert({ mission_id: missionId, business_id: businessA.id, agent_key: "cmo", tool_name: "build_strategy", title: "Ready task", risk_level: "safe", status: "ready" })
    .select("id").single();
  if (t2Err || !t2) throw new Error(`t2 insert failed: ${t2Err?.message}`);
  taskReadyId = t2.id;

  const { data: t3, error: t3Err } = await serviceClient
    .from("mission_tasks")
    .insert({ mission_id: missionId, business_id: businessA.id, agent_key: "performance", tool_name: "draft_campaign", title: "Blocked task", risk_level: "safe", status: "blocked", depends_on: [taskReadyId] })
    .select("id").single();
  if (t3Err || !t3) throw new Error(`t3 insert failed: ${t3Err?.message}`);
  taskBlockedId = t3.id;

  const { data: t4, error: t4Err } = await serviceClient
    .from("mission_tasks")
    .insert({ mission_id: missionId, business_id: businessA.id, agent_key: "growth", tool_name: "invite_creator_to_campaign", title: "Awaiting-approval task", risk_level: "sensitive", requires_approval: true, status: "awaiting_approval" })
    .select("id").single();
  if (t4Err || !t4) throw new Error(`t4 insert failed: ${t4Err?.message}`);
  taskAwaitingApprovalId = t4.id;

  const { data: appr, error: apprErr } = await serviceClient
    .from("mission_approvals")
    .insert({ mission_id: missionId, task_id: taskAwaitingApprovalId, business_id: businessA.id, action_type: "invite_creator_to_campaign", preview: {}, risk_level: "sensitive", status: "pending" })
    .select("id").single();
  if (apprErr || !appr) throw new Error(`approval insert failed: ${apprErr?.message}`);
  approvalId = appr.id;

  await serviceClient.from("mission_events").insert({ mission_id: missionId, business_id: businessA.id, event_type: "mission_created", actor: "agent:cmo", message: "Test mission created" });

  await serviceClient.from("ai_recommendations").insert({
    user_id: businessA.id, recommendation_type: "action", title: "A's generated Mission artifact",
    explanation: "test artifact", priority: "low", status: "active", source: "mission", meta: { mission_id: missionId },
  });

  // Race-test task: claimed with a known worker id, left running (lease in
  // the future) so we can attempt a "late" completion after cancellation.
  const { data: rt, error: rtErr } = await serviceClient
    .from("mission_tasks")
    .insert({
      mission_id: missionId, business_id: businessA.id, agent_key: "analyst", tool_name: "gather_context",
      title: "Race-test task", risk_level: "safe", status: "running",
      leased_by: RACE_WORKER_ID, leased_until: new Date(Date.now() + 120_000).toISOString(),
    })
    .select("id").single();
  if (rtErr || !rt) throw new Error(`race task insert failed: ${rtErr?.message}`);
  raceTaskId = rt.id;
});

afterAll(async () => {
  const residue = await cleanupAll();
  expect(residue.authUsers).toBe(0);
});

describe("Phase N — real two-tenant adversarial proof (Business B against Business A's real Mission)", () => {
  it("PASS/FAIL: B cannot fetch A's mission", async () => {
    const { data, error } = await businessB.client.from("missions").select("*").eq("id", missionId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("PASS/FAIL: B cannot fetch A's tasks", async () => {
    const { data } = await businessB.client.from("mission_tasks").select("*").eq("mission_id", missionId);
    expect(data).toEqual([]);
  });

  it("PASS/FAIL: B cannot fetch A's approvals", async () => {
    const { data } = await businessB.client.from("mission_approvals").select("*").eq("mission_id", missionId);
    expect(data).toEqual([]);
  });

  it("PASS/FAIL: B cannot fetch A's events", async () => {
    const { data } = await businessB.client.from("mission_events").select("*").eq("mission_id", missionId);
    expect(data).toEqual([]);
  });

  it("PASS/FAIL: B cannot approve A's approval via decide_mission_approval", async () => {
    const { error } = await businessB.client.rpc("decide_mission_approval", { p_approval_id: approvalId, p_decision: "approved" });
    expect(error).toBeTruthy();
    const { data: row } = await serviceClient.from("mission_approvals").select("status").eq("id", approvalId).single();
    expect(row?.status).toBe("pending");
  });

  it("PASS/FAIL: B cannot reject A's approval via decide_mission_approval", async () => {
    const { error } = await businessB.client.rpc("decide_mission_approval", { p_approval_id: approvalId, p_decision: "rejected" });
    expect(error).toBeTruthy();
    const { data: row } = await serviceClient.from("mission_approvals").select("status").eq("id", approvalId).single();
    expect(row?.status).toBe("pending");
  });

  it("PASS/FAIL: B cannot cancel A's mission via cancel_mission", async () => {
    const { error } = await businessB.client.rpc("cancel_mission", { p_mission_id: missionId });
    expect(error).toBeTruthy();
    const { data: row } = await serviceClient.from("missions").select("status").eq("id", missionId).single();
    expect(row?.status).not.toBe("cancelled");
  });

  it("PASS/FAIL: B cannot mutate A's mission status via direct PostgREST update", async () => {
    const { data } = await businessB.client.from("missions").update({ status: "cancelled" }).eq("id", missionId).select();
    expect(data ?? []).toEqual([]);
    const { data: row } = await serviceClient.from("missions").select("status").eq("id", missionId).single();
    expect(row?.status).not.toBe("cancelled");
  });

  it("PASS/FAIL: B cannot mutate A's task state via direct PostgREST update", async () => {
    const { data } = await businessB.client.from("mission_tasks").update({ status: "completed" }).eq("id", taskReadyId).select();
    expect(data ?? []).toEqual([]);
    const { data: row } = await serviceClient.from("mission_tasks").select("status").eq("id", taskReadyId).single();
    expect(row?.status).toBe("ready");
  });

  it("PASS/FAIL: B cannot read A's generated Mission artifacts (ai_recommendations)", async () => {
    const { data } = await businessB.client.from("ai_recommendations").select("*").eq("user_id", businessA.id);
    expect(data).toEqual([]);
  });

  it("control: A (the real owner) CAN see their own mission — proves the isolation above is RLS, not a broken query", async () => {
    const { data } = await businessA.client.from("missions").select("*").eq("id", missionId);
    expect(data?.length).toBe(1);
  });
});

describe("Phase N — explicit cancellation proof (legitimate owner path, mixed task states)", () => {
  it("PASS: A (the real owner) can cancel via the legitimate cancel_mission RPC", async () => {
    const { data, error } = await businessA.client.rpc("cancel_mission", { p_mission_id: missionId });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("PASS: mission becomes cancelled", async () => {
    const { data } = await serviceClient.from("missions").select("status").eq("id", missionId).single();
    expect(data?.status).toBe("cancelled");
  });

  it("PASS: the task that was 'running' (agent actively working) is cancelled and its lease is cleared", async () => {
    const { data } = await serviceClient.from("mission_tasks").select("status, leased_by, leased_until").eq("id", taskRunningId).single();
    expect(data?.status).toBe("cancelled");
    expect(data?.leased_by).toBeNull();
    expect(data?.leased_until).toBeNull();
  });

  it("PASS: the 'ready' task cannot execute — cancelled, not left claimable", async () => {
    const { data } = await serviceClient.from("mission_tasks").select("status").eq("id", taskReadyId).single();
    expect(data?.status).toBe("cancelled");
  });

  it("PASS: the 'blocked' task cannot later become ready — cancelled directly, not left dangling", async () => {
    const { data } = await serviceClient.from("mission_tasks").select("status").eq("id", taskBlockedId).single();
    expect(data?.status).toBe("cancelled");
  });

  it("PASS: the 'awaiting_approval' task resolves to cancelled and its pending approval is rejected", async () => {
    const { data: task } = await serviceClient.from("mission_tasks").select("status").eq("id", taskAwaitingApprovalId).single();
    expect(task?.status).toBe("cancelled");
    const { data: appr } = await serviceClient.from("mission_approvals").select("status").eq("id", approvalId).single();
    expect(appr?.status).toBe("rejected");
  });

  it("PASS: event history records the cancellation honestly", async () => {
    const { data } = await serviceClient.from("mission_events").select("event_type, actor, message").eq("mission_id", missionId).eq("event_type", "mission_cancelled");
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.[0].actor).toBe("user");
  });

  it("PASS: subsequent runner invocations ignore it — claim_ready_mission_tasks never returns any of this mission's tasks", async () => {
    const { data } = await serviceClient.rpc("claim_ready_mission_tasks", { p_worker_id: crypto.randomUUID(), p_limit: 50 });
    const claimedIds = (data ?? []).map((t: { id: string }) => t.id);
    expect(claimedIds).not.toContain(taskReadyId);
    expect(claimedIds).not.toContain(taskBlockedId);
    expect(claimedIds).not.toContain(taskRunningId);
    expect(claimedIds).not.toContain(taskAwaitingApprovalId);
  });

  it("PASS: dependency advancement does not resurrect work — advance_mission_task_graph is a safe no-op on an already-cancelled mission", async () => {
    const { error } = await serviceClient.rpc("advance_mission_task_graph", { p_mission_id: missionId });
    expect(error).toBeNull();
    const { data } = await serviceClient.from("mission_tasks").select("status").eq("mission_id", missionId);
    for (const row of data ?? []) expect(row.status).toBe("cancelled");
  });

  it("PASS: 'cancel while an agent is actively working' race — a late completion attempt with the ORIGINAL worker id is a safe no-op, never resurrects or overwrites the cancellation", async () => {
    // raceTaskId was left 'running' with RACE_WORKER_ID's lease before the
    // mission-wide cancel above already cancelled it too (cancel_mission
    // sweeps every non-terminal task). Simulate the in-flight worker
    // finishing its (real) work AFTER the cancellation already landed.
    const { data: before } = await serviceClient.from("mission_tasks").select("status, leased_by").eq("id", raceTaskId).single();
    expect(before?.status).toBe("cancelled"); // already swept by cancel_mission
    expect(before?.leased_by).toBeNull(); // lease already cleared

    const { data: lateResult, error } = await serviceClient.rpc("complete_mission_task", {
      p_task_id: raceTaskId, p_worker_id: RACE_WORKER_ID, p_status: "completed", p_output: { note: "late completion after cancel" },
    });
    expect(error).toBeNull();
    expect(lateResult).toBe(false); // no-op: leased_by no longer matches (cleared), status no longer 'running'

    const { data: after } = await serviceClient.from("mission_tasks").select("status, output_data").eq("id", raceTaskId).single();
    expect(after?.status).toBe("cancelled"); // NOT reverted to 'completed' by the late call
    expect(after?.output_data).toBeNull(); // the late output was never applied
  });
});
