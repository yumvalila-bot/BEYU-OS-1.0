import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { approvals, noeliaWorkflowSteps, noeliaWorkflows } from "../../src/db/schema";
import { BeyuNoeliaWorkflowService } from "../../src/lib/noelia/workflows";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import { seededPrincipal } from "./db-fixtures";

const workflowIds: string[] = [];
const approvalIds: string[] = [];

async function remember<T extends { workflowId: string | null; approvalId?: string | null }>(result: T): Promise<T> {
  if (result.workflowId) workflowIds.push(result.workflowId);
  if (result.approvalId) approvalIds.push(result.approvalId);
  return result;
}

async function row(workflowId: string) {
  const [workflow] = await db.select().from(noeliaWorkflows).where(eq(noeliaWorkflows.id, workflowId)).limit(1);
  const steps = await db.select().from(noeliaWorkflowSteps)
    .where(eq(noeliaWorkflowSteps.workflowId, workflowId))
    .orderBy(noeliaWorkflowSteps.stepIndex);
  return { workflow, steps };
}

beforeAll(async () => {
  const stale = await db.select({ id: noeliaWorkflows.id })
    .from(noeliaWorkflows)
    .where(eq(noeliaWorkflows.requestedBy, "wf-test"));
  if (stale.length) {
    await db.delete(noeliaWorkflowSteps).where(inArray(noeliaWorkflowSteps.workflowId, stale.map((r) => r.id)));
    await db.delete(noeliaWorkflows).where(inArray(noeliaWorkflows.id, stale.map((r) => r.id)));
  }
});

afterAll(async () => {
  if (workflowIds.length) {
    await db.delete(noeliaWorkflowSteps).where(inArray(noeliaWorkflowSteps.workflowId, workflowIds));
    await db.delete(noeliaWorkflows).where(inArray(noeliaWorkflows.id, workflowIds));
  }
  if (approvalIds.length) {
    await db.delete(approvals).where(inArray(approvals.id, approvalIds));
  }
  await pool.end();
});

const trace = () => `TRACE_WF_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe("Noelia governed agentic workflow loop", () => {
  it("runs the full PLAN → VALIDATE → AUTHORIZE → EXECUTE loop with audit evidence", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const governance = await seededPrincipal("governance@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();

    const planned = await remember(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Assemble a governed executive evidence pack for liquidity and risk.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [
          { toolName: "finance.treasury.aggregate", input: {} },
          { toolName: "finance.capital.pipeline", input: {} },
        ],
      },
    }));
    expect(planned.status).toBe("PLANNED");

    const beforeValidation = await row(planned.workflowId!);
    expect(beforeValidation.workflow.status).toBe("PLANNED");
    expect(beforeValidation.steps.every((step) => step.status === "PENDING")).toBe(true);

    const validated = await service.validate({
      principal: cfo,
      registry,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(validated.status).toBe("VALIDATED");

    // Maker/checker: the requester cannot authorize their own workflow. The
    // CFO lacks ai:workflow.approve entirely, so the denial is RBAC; the
    // maker/checker branch is exercised below with the CEO.
    const selfAuthorized = await service.authorize({
      principal: cfo,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(selfAuthorized.code).toBe("AUTHORIZATION_DENIED");

    const authorized = await remember(await service.authorize({
      principal: governance,
      workflowId: planned.workflowId!,
      traceId: trace(),
      comment: "Approved for the evidence pack.",
    }));
    expect(authorized.status).toBe("AUTHORIZED");
    expect(authorized.approvalId).toBeTruthy();

    // Approval is not execution: nothing has run yet.
    const afterAuthorization = await row(planned.workflowId!);
    expect(afterAuthorization.steps.filter((step) => step.status === "COMPLETED")).toHaveLength(0);

    const executed = await service.execute({
      principal: cfo,
      registry,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(executed.status).toBe("COMPLETED");
    expect(executed.stepResults).toHaveLength(2);
    expect(executed.stepResults!.every((step) => step.status === "COMPLETED")).toBe(true);

    const afterExecution = await row(planned.workflowId!);
    expect(afterExecution.workflow.status).toBe("COMPLETED");
    const completed = afterExecution.steps.filter((step) => step.status === "COMPLETED");
    expect(completed).toHaveLength(2);
    expect(completed.every((step) => step.policyDecision === "ALLOWED")).toBe(true);
    expect(completed.every((step) => step.capability.startsWith("cap-"))).toBe(true);
    expect(completed.every((step) => step.observations !== null)).toBe(true);
  });

  it("resumes idempotently after a crash: committed steps never run twice", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const governance = await seededPrincipal("governance@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();

    const planned = await remember(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Idempotency probe: resumption must not re-run completed steps.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [
          { toolName: "finance.cash.position", input: {} },
          { toolName: "finance.maturity.profile", input: {} },
        ],
      },
    }));
    await service.validate({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    await remember(await service.authorize({ principal: governance, workflowId: planned.workflowId!, traceId: trace() }));
    const first = await service.execute({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    expect(first.status).toBe("COMPLETED");

    // A COMPLETED workflow cannot re-execute without fresh authorization:
    // approval is evidence, never authority by existence.
    const denied = await service.execute({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    expect(denied.code).toBe("EXECUTION_DENIED");

    // Simulate a crash mid-run: the workflow is RUNNING with step 1 already
    // committed. Resumption must skip the committed step and complete step 2
    // exactly once.
    const secondWorkflow = await remember(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Crash-resume probe: committed steps resume, nothing runs twice.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [
          { toolName: "finance.cash.position", input: {} },
          { toolName: "finance.maturity.profile", input: {} },
        ],
      },
    }));
    await service.validate({ principal: cfo, registry, workflowId: secondWorkflow.workflowId!, traceId: trace() });
    await remember(await service.authorize({ principal: governance, workflowId: secondWorkflow.workflowId!, traceId: trace() }));
    // Crash: status RUNNING, first step COMPLETED, second step still PENDING.
    await db.update(noeliaWorkflows).set({ status: "RUNNING" }).where(eq(noeliaWorkflows.id, secondWorkflow.workflowId!));
    const [step1] = await db.select().from(noeliaWorkflowSteps)
      .where(eq(noeliaWorkflowSteps.workflowId, secondWorkflow.workflowId!))
      .orderBy(noeliaWorkflowSteps.stepIndex)
      .limit(1);
    await db.update(noeliaWorkflowSteps).set({ status: "COMPLETED" }).where(eq(noeliaWorkflowSteps.id, step1.id));

    const resumed = await service.execute({ principal: cfo, registry, workflowId: secondWorkflow.workflowId!, traceId: trace() });
    expect(resumed.status).toBe("COMPLETED");
    expect(resumed.stepResults).toHaveLength(2);
    expect(resumed.stepResults![0].code).toBe("RESUMED");
    expect(resumed.stepResults![1].code).toBe("COMPLETED");

    const steps = await db.select().from(noeliaWorkflowSteps)
      .where(eq(noeliaWorkflowSteps.workflowId, secondWorkflow.workflowId!));
    expect(steps.filter((step) => step.status === "COMPLETED")).toHaveLength(2);
  });

  it("stops at validation when a step capability is denied", async () => {
    const hcm = await seededPrincipal("hcm@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();
    const planned = await remember(await service.create({
      principal: hcm,
      traceId: trace(),
      plan: {
        goal: "Negative probe: a capability the principal lacks must stop validation.",
        target: { tenantId: hcm.tenantId, legalEntityId: null, countryCode: null },
        steps: [
          { toolName: "hcm.workforce.observe", input: {} },
          { toolName: "finance.treasury.aggregate", input: {} }, // HCM_DIRECTOR lacks finance:treasury.read
        ],
      },
    }));
    const validated = await service.validate({
      principal: hcm,
      registry,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(validated.status).toBe("STOPPED");
    const steps = await db.select().from(noeliaWorkflowSteps)
      .where(eq(noeliaWorkflowSteps.workflowId, planned.workflowId!))
      .orderBy(noeliaWorkflowSteps.stepIndex);
    expect(steps[0].status).toBe("PENDING");
    expect(steps[1].status).toBe("DENIED");
    expect(steps[1].denialCode).toBe("PERMISSION_DENIED");
  });

  it("refuses execution without a valid separate human authorization", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();
    const planned = await remember(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Negative probe: no authorization means no execution.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [{ toolName: "risk.analysis", input: {} }],
      },
    }));
    await service.validate({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    const executed = await service.execute({
      principal: cfo,
      registry,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(executed.code).toBe("EXECUTION_DENIED");
    const steps = await db.select().from(noeliaWorkflowSteps)
      .where(eq(noeliaWorkflowSteps.workflowId, planned.workflowId!));
    expect(steps.every((step) => step.status === "PENDING")).toBe(true);
  });

  it("cancels a workflow before execution and skips remaining steps", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const governance = await seededPrincipal("governance@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();
    const planned = await remember(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Cancellation probe: cancellation must stop execution.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [{ toolName: "compliance.analysis", input: {} }],
      },
    }));
    await service.validate({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    await remember(await service.authorize({ principal: governance, workflowId: planned.workflowId!, traceId: trace() }));
    const cancelled = await service.cancel({ principal: cfo, workflowId: planned.workflowId!, traceId: trace() });
    expect(cancelled.status).toBe("CANCELLED");
    const executed = await service.execute({
      principal: cfo,
      registry,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(executed.status).toBe("STOPPED");
    expect(executed.reason).toContain("Cancellation");
  });

  it("escalates when a step output requires human review", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const governance = await seededPrincipal("governance@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();
    const planned = await remember(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Escalation probe: a human-review obligation must escalate the loop.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [
          { toolName: "finance.waterfall.latest", input: {} },
          { toolName: "tax.knowledge.query", input: {} },
        ],
      },
    }));
    await service.validate({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    await remember(await service.authorize({ principal: governance, workflowId: planned.workflowId!, traceId: trace() }));
    const executed = await service.execute({
      principal: cfo,
      registry,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(executed.status).toBe("ESCALATED");
    expect(executed.reason).toContain("human review");
  });

  it("denies access to a workflow outside the resolved scope", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const healthOps = await seededPrincipal("health.ops@beyu.os"); // separate tenant
    const service = new BeyuNoeliaWorkflowService();
    const planned = await remember(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Scope probe: another tenant principal must not see this workflow.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [{ toolName: "finance.cash.position", input: {} }],
      },
    }));
    const foreign = await service.get({ principal: healthOps, workflowId: planned.workflowId! });
    expect(foreign).toBeNull();
  });

  it("enforces maker/checker even for a principal with approve authority", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();
    // GROUP_CEO holds both ai:workflow.run and ai:workflow.approve — yet the
    // requesting human can never authorize their own workflow.
    const planned = await remember(await service.create({
      principal: ceo,
      traceId: trace(),
      plan: {
        goal: "Maker/checker probe: the requester cannot self-authorize even with approval authority.",
        target: { tenantId: ceo.tenantId, legalEntityId: null, countryCode: null },
        steps: [{ toolName: "finance.cash.position", input: {} }],
      },
    }));
    await service.validate({ principal: ceo, registry, workflowId: planned.workflowId!, traceId: trace() });
    const selfAuthorized = await service.authorize({
      principal: ceo,
      workflowId: planned.workflowId!,
      traceId: trace(),
    });
    expect(selfAuthorized.code).toBe("AUTHORIZATION_DENIED");
    expect(selfAuthorized.reason).toContain("requesting human");
  });
});
