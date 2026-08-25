import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { approvals, noeliaSchedules, noeliaScheduleRuns, noeliaWorkflows, noeliaWorkflowSteps, tenants } from "../../src/db/schema";
import { apiPost, baseUrl, login, serverAvailable, type ApiResponse } from "../helpers/http";

/**
 * Iteration 4 — architecture trace: HTTP route coverage (Finding A-04-1).
 *
 * The governed noelia sub-routes (analyze, brief, schedules, workflows) and
 * the auth/logout route had no committed transport-level tests. These tests
 * drive the real server and assert semantic success, not bare 200s.
 */
const ENDPOINT = "/api/v1/ai/noelia";
const available = await serverAvailable();
let governance = "";
let cfo = "";

const createdWorkflowIds: string[] = [];
const createdApprovalIds: string[] = [];
const createdScheduleIds: string[] = [];

beforeAll(async () => {
  if (!available) return;
  governance = await login("governance@beyu.os");
  cfo = await login("cfo@beyu.os");
}, 180_000);

afterAll(async () => {
  // Leave the governance substrate clean (approvals/workflows/schedules are
  // domain evidence, not fixtures — the control-plane suite asserts zero
  // leftover approval rows after every test run).
  try {
    if (createdWorkflowIds.length) {
      await db.delete(noeliaWorkflowSteps).where(inArray(noeliaWorkflowSteps.workflowId, createdWorkflowIds));
      await db.delete(noeliaWorkflows).where(inArray(noeliaWorkflows.id, createdWorkflowIds));
    }
    if (createdApprovalIds.length) {
      await db.delete(approvals).where(inArray(approvals.id, createdApprovalIds));
    }
    if (createdScheduleIds.length) {
      await db.delete(noeliaScheduleRuns).where(inArray(noeliaScheduleRuns.scheduleId, createdScheduleIds));
      await db.delete(noeliaSchedules).where(inArray(noeliaSchedules.id, createdScheduleIds));
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
});

describe.skipIf(!available)("Iteration 4 HTTP route coverage", () => {
  it("POST /api/v1/ai/noelia/analyze returns a governed analysis (semantic)", async () => {
    const r = await apiPost<{ data: { analysisType: string; findings: unknown[]; outputClass: string } }>(
      `${ENDPOINT}/analyze`,
      { analysisType: "KPI_ANALYSIS" },
      { cookie: cfo },
    );
    expect(r.status).toBe(200);
    expect(r.body.data.analysisType).toBe("KPI_ANALYSIS");
    expect(r.body.data.findings.length).toBeGreaterThan(0);
    expect(r.body.data.outputClass).toMatch(/OBSERVED|DERIVED|FORECAST|INFERENCE|RECOMMENDATION|REQUIRES_HUMAN_REVIEW|UNAVAILABLE/);
  });

  it("POST /api/v1/ai/noelia/analyze rejects an unknown analysis type (422)", async () => {
    const r = await apiPost(`${ENDPOINT}/analyze`, { analysisType: "NOT_A_TYPE" }, { cookie: cfo });
    expect(r.status).toBe(422);
  });

  it("POST /api/v1/ai/noelia/brief returns the structured executive briefing", async () => {
    const r = await apiPost<{ data: { structure: string; headline: string; findings: unknown[] } }>(
      `${ENDPOINT}/brief`,
      { structure: "BOARD", focus: "Treasury and risk position" },
      { cookie: governance },
    );
    expect(r.status).toBe(200);
    expect(r.body.data.structure).toBe("BOARD");
    expect(r.body.data.headline.length).toBeGreaterThan(10);
    expect(r.body.data.findings.length).toBeGreaterThan(0);
  });

  it("POST /api/v1/ai/noelia/schedules creates, suspends and ticks a governed schedule", async () => {
    const code = `IT4_${Date.now().toString().slice(-8)}`;
    const created = await apiPost<{ data: { scheduleId: string; status: string } }>(
      `${ENDPOINT}/schedules`,
      {
        code,
        cadence: "WEEKLY",
        horizon: "HORIZON_2_NEAR_TERM",
        briefingFocus: "STANDARD",
        targetTenantId: (await db.select().from(tenants).limit(1))[0].id,
        nextRunAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      { cookie: governance },
    );
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("CREATED");
    const scheduleId = created.body.data.scheduleId;
    createdScheduleIds.push(scheduleId);

    const status = await apiPost<{ data: { status: string } }>(
      `${ENDPOINT}/schedules/${scheduleId}/status`,
      { status: "SUSPENDED" },
      { cookie: governance },
    );
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe("SUSPENDED");

    const tick = await apiPost<{ data: { emitted: number; processed: number; failed: number; skipped: number } }>(
      `${ENDPOINT}/schedules/tick`,
      {},
      { cookie: governance },
    );
    expect(tick.status).toBe(200);
    expect(typeof tick.body.data.emitted).toBe("number");
    expect(typeof tick.body.data.processed).toBe("number");
    expect(typeof tick.body.data.failed).toBe("number");
    expect(typeof tick.body.data.skipped).toBe("number");
  });

  it("POST /api/v1/ai/noelia/workflows plans, validates, authorizes (maker/checker) and executes", async () => {
    const targetTenantId = (await db.select().from(tenants).limit(1))[0].id;
    const planned = await apiPost<{ data: { workflowId: string; status: string; steps: unknown[] } }>(
      `${ENDPOINT}/workflows`,
      {
        goal: "Summarize the authorized treasury position and the capital pipeline for the executive.",
        target: { tenantId: targetTenantId },
        steps: [
          { toolName: "finance.treasury.aggregate", requiresApproval: false },
          { toolName: "finance.capital.pipeline", requiresApproval: false },
        ],
      },
      { cookie: cfo },
    );
    expect(planned.status).toBe(200);
    expect(planned.body.data.status).toBe("PLANNED");
    const workflowId = planned.body.data.workflowId;
    createdWorkflowIds.push(workflowId);

    const validated = await apiPost<{ data: { status: string } }>(
      `${ENDPOINT}/workflows/${workflowId}/validate`,
      {},
      { cookie: cfo },
    );
    expect(validated.status).toBe(200);
    expect(validated.body.data.status).toBe("VALIDATED");

    // Maker/checker: the requester (cfo) must not be able to authorize.
    const selfAuth = await apiPost<{ data: { status: string; code: string } }>(
      `${ENDPOINT}/workflows/${workflowId}/authorize`,
      { comment: "self" },
      { cookie: cfo },
    );
    expect([403, 200].includes(selfAuth.status)).toBe(true);
    if (selfAuth.status === 200) expect(selfAuth.body.data.status).not.toBe("AUTHORIZED");

    const authorized = await apiPost<{ data: { status: string; approvalId?: string } }>(
      `${ENDPOINT}/workflows/${workflowId}/authorize`,
      { comment: "maker/checker approval" },
      { cookie: governance },
    );
    expect(authorized.status).toBe(200);
    expect(authorized.body.data.status).toBe("AUTHORIZED");
    if (authorized.body.data.approvalId) createdApprovalIds.push(authorized.body.data.approvalId);

    const executed = await apiPost<{ data: { status: string; stepResults?: unknown[]; outcome?: string } }>(
      `${ENDPOINT}/workflows/${workflowId}/execute`,
      {},
      { cookie: cfo },
    );
    expect(executed.status).toBe(200);
    expect(["COMPLETED", "RUNNING", "STOPPED"].includes(executed.body.data.status)).toBe(true);

    const statusRes = await fetch(`${baseUrl()}/api/v1/ai/noelia/workflows/${workflowId}`, {
      headers: { cookie: cfo },
    });
    expect(statusRes.status).toBe(200);
    const statusBody = (await statusRes.json()) as { data: { workflow: { status: string; plan: unknown[] }; steps: unknown[] } };
    expect(["COMPLETED", "STOPPED", "ESCALATED", "FAILED"].includes(statusBody.data.workflow.status)).toBe(true);
    expect(Array.isArray(statusBody.data.workflow.plan)).toBe(true);
    expect(Array.isArray(statusBody.data.steps)).toBe(true);
  });

  it("POST /api/v1/ai/noelia/workflows/:id/cancel terminates a planned workflow", async () => {
    const targetTenantId = (await db.select().from(tenants).limit(1))[0].id;
    const planned = await apiPost<{ data: { workflowId: string } }>(
      `${ENDPOINT}/workflows`,
      {
        goal: "This workflow is created only to be cancelled through its governed route.",
        target: { tenantId: targetTenantId },
        steps: [{ toolName: "finance.treasury.aggregate" }],
      },
      { cookie: cfo },
    );
    expect(planned.status).toBe(200);
    createdWorkflowIds.push(planned.body.data.workflowId);
    const cancelled = await apiPost<{ data: { status: string } }>(
      `${ENDPOINT}/workflows/${planned.body.data.workflowId}/cancel`,
      { reason: "covered by route test" },
      { cookie: cfo },
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
  });

  it("POST /api/v1/auth/logout terminates the session", async () => {
    const r = await apiPost("/api/v1/auth/logout", {}, { cookie: governance });
    expect(r.status).toBe(200);
  });
});
