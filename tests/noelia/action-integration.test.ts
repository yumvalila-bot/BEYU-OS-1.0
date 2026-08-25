import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { approvals, auditLog, noeliaActionRequests, notifications } from "../../src/db/schema";
import { newId, ID_PREFIX } from "../../src/lib/ids";
import {
  approveNoeliaAction,
  executeApprovedNoeliaAction,
  requestNoeliaAction,
} from "../../src/lib/noelia/actions";
import { NoeliaToolRegistry } from "../../src/lib/noelia/tool-registry";
import type { ToolInvocationContext } from "../../src/lib/noelia/types";
import { seededPrincipal } from "./db-fixtures";

const actionIds: string[] = [];
const approvalIds: string[] = [];
const notificationIds: string[] = [];

class CanonicalNotificationService {
  constructor(private readonly failAfterMutation = false) {}

  async execute(context: ToolInvocationContext) {
    const id = newId(ID_PREFIX.notification);
    notificationIds.push(id);
    await db.insert(notifications).values({
      id,
      tenantId: context.target.tenantId,
      userId: context.principal.userId,
      subject: "Noelia governed action integration probe",
      body: "Created only after separate human approval.",
      classification: "INTERNAL",
      status: "QUEUED",
    });
    if (this.failAfterMutation) throw new Error("test service failure after tentative mutation");
    return { metadata: { notificationId: id } };
  }
}

function registry(service: CanonicalNotificationService, spy = vi.spyOn(service, "execute")) {
  return {
    spy,
    value: new NoeliaToolRegistry().register({
      name: "notification.governed.create",
      permission: "ai:noelia.query",
      risk: "HIGH",
      approverRole: "CHIEF_GOVERNANCE_OFFICER",
      description: "Integration-only governed mutation through a named BEYU service.",
      metadata: {
        stableId: "cap-notification-governed-create",
        version: "1.0.0",
        ownerRole: "CHIEF_GOVERNANCE_OFFICER",
        domain: "GOVERNANCE",
        sideEffects: "DOMAIN_WRITE",
        idempotent: false,
        timeoutMs: 8000,
        retryPolicy: null,
        jurisdictionRestrictions: null,
        entityRestrictions: "SCOPED",
        approvalRequirements: { approverRole: "CHIEF_GOVERNANCE_OFFICER", reason: "Integration-only governed mutation." },
        auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      },
      execute: (context) => service.execute(context),
    }),
  };
}

async function remember(result: Awaited<ReturnType<typeof requestNoeliaAction>>) {
  if (result.actionRequestId) actionIds.push(result.actionRequestId);
  if (result.approvalId) approvalIds.push(result.approvalId);
  return result;
}

beforeAll(async () => {
  // Targeted cleanup handles an interrupted prior local run without touching the
  // append-only audit ledger.
  const stale = await db.select({ id: noeliaActionRequests.id, approvalId: noeliaActionRequests.approvalId })
    .from(noeliaActionRequests)
    .where(eq(noeliaActionRequests.toolName, "notification.governed.create"));
  if (stale.length) {
    await db.delete(noeliaActionRequests).where(inArray(noeliaActionRequests.id, stale.map((row) => row.id)));
    const ids = stale.map((row) => row.approvalId).filter((id): id is string => Boolean(id));
    if (ids.length) await db.delete(approvals).where(inArray(approvals.id, ids));
  }
});

afterAll(async () => {
  if (notificationIds.length) await db.delete(notifications).where(inArray(notifications.id, notificationIds));
  if (actionIds.length) await db.delete(noeliaActionRequests).where(inArray(noeliaActionRequests.id, actionIds));
  if (approvalIds.length) await db.delete(approvals).where(inArray(approvals.id, approvalIds));
  await pool.end();
});

describe("Noelia governed action transaction boundaries", () => {
  it("persists policy/tool denial evidence while domain mutation does not occur", async () => {
    const requester = await seededPrincipal("cfo@beyu.os");
    const service = new CanonicalNotificationService();
    const tools = registry(service);
    const result = await remember(await requestNoeliaAction({
      registry: tools.value,
      principal: requester,
      toolName: "unknown.mutation",
      toolInput: {},
      traceId: `TRACE_DENIED_${Date.now()}`,
    }));

    expect(result.status).toBe("DENIED");
    expect(result.code).toBe("TOOL_UNKNOWN");
    expect(tools.spy).not.toHaveBeenCalled();

    const [request] = await db.select().from(noeliaActionRequests)
      .where(eq(noeliaActionRequests.id, result.actionRequestId!));
    const evidence = await db.select().from(auditLog).where(and(
      eq(auditLog.objectType, "NOELIA_ACTION"),
      eq(auditLog.objectId, result.actionRequestId!),
    ));
    expect(request.status).toBe("DENIED");
    expect(evidence.some((row) => row.outcome === "DENIED")).toBe(true);
  });

  it("persists scope denial evidence without resolving requested IDs", async () => {
    const requester = await seededPrincipal("cfo@beyu.os");
    const service = new CanonicalNotificationService();
    const tools = registry(service);
    const result = await remember(await requestNoeliaAction({
      registry: tools.value,
      principal: requester,
      toolName: "notification.governed.create",
      toolInput: {},
      target: {
        tenantId: "TEN_OPAQUE_OUT_OF_SCOPE",
        legalEntityId: "LEN_OPAQUE_OUT_OF_SCOPE",
        countryCode: "ZZ",
      },
      traceId: `TRACE_SCOPE_DENIED_${Date.now()}`,
    }));

    expect(result.status).toBe("DENIED");
    expect(result.code).toBe("TENANT_DENIED");
    expect(tools.spy).not.toHaveBeenCalled();
    const [request] = await db.select().from(noeliaActionRequests)
      .where(eq(noeliaActionRequests.id, result.actionRequestId!));
    expect(request.targetTenantId).toBe("TEN_OPAQUE_OUT_OF_SCOPE");
    expect(request.status).toBe("DENIED");
  });

  it("separates requesting human, executing AI and approving human", async () => {
    const requester = await seededPrincipal("cfo@beyu.os");
    const approver = await seededPrincipal("governance@beyu.os");
    const service = new CanonicalNotificationService();
    const tools = registry(service);
    const traceId = `TRACE_APPROVED_${Date.now()}`;

    const requested = await remember(await requestNoeliaAction({
      registry: tools.value,
      principal: requester,
      toolName: "notification.governed.create",
      toolInput: { subject: "prepared" },
      traceId,
    }));
    expect(requested.status).toBe("PENDING_APPROVAL");
    expect(tools.spy).not.toHaveBeenCalled();

    const selfApproval = await approveNoeliaAction({
      principal: requester,
      actionRequestId: requested.actionRequestId!,
      traceId,
    });
    expect(selfApproval.status).toBe("DENIED");
    expect(tools.spy).not.toHaveBeenCalled();

    const approved = await approveNoeliaAction({
      principal: approver,
      actionRequestId: requested.actionRequestId!,
      traceId,
      comment: "Accountable human approval for integration evidence.",
    });
    expect(approved.status).toBe("APPROVED");
    expect(tools.spy).not.toHaveBeenCalled();

    const completed = await executeApprovedNoeliaAction({
      registry: tools.value,
      requestingPrincipal: requester,
      actionRequestId: requested.actionRequestId!,
      traceId,
    });
    expect(completed.status).toBe("COMPLETED");
    expect(tools.spy).toHaveBeenCalledOnce();

    const [request] = await db.select().from(noeliaActionRequests)
      .where(eq(noeliaActionRequests.id, requested.actionRequestId!));
    const evidence = await db.select().from(auditLog).where(and(
      eq(auditLog.objectType, "NOELIA_ACTION"),
      eq(auditLog.objectId, requested.actionRequestId!),
    ));
    expect(request.requestingHumanId).toBe(requester.userId);
    expect(request.executingAi).toBe("NOELIA");
    expect(request.approvingHumanId).toBe(approver.userId);
    expect(request.status).toBe("COMPLETED");

    const approvalEvidence = evidence.find((row) =>
      row.action === "ai.noelia.action.approve" && row.outcome === "SUCCESS");
    const executionEvidence = evidence.find((row) =>
      row.action === "ai.noelia.action.execute" && row.outcome === "SUCCESS");
    expect(approvalEvidence?.actorType).toBe("HUMAN");
    expect(approvalEvidence?.actorUserId).toBe(approver.userId);
    expect(executionEvidence?.actorType).toBe("AI");
    expect(executionEvidence?.approvalRef).toBe(requested.approvalId);
  });

  it("rolls domain mutation back if completion/audit transaction fails", async () => {
    const requester = await seededPrincipal("cfo@beyu.os");
    const approver = await seededPrincipal("governance@beyu.os");
    const tools = registry(new CanonicalNotificationService(true));
    const traceId = `TRACE_ROLLBACK_${Date.now()}`;

    const requested = await remember(await requestNoeliaAction({
      registry: tools.value,
      principal: requester,
      toolName: "notification.governed.create",
      toolInput: {},
      traceId,
    }));
    await approveNoeliaAction({ principal: approver, actionRequestId: requested.actionRequestId!, traceId });
    const completed = await executeApprovedNoeliaAction({
      registry: tools.value,
      requestingPrincipal: requester,
      actionRequestId: requested.actionRequestId!,
      traceId,
    });

    expect(completed.status).toBe("FAILED");
    const tentativeId = notificationIds.at(-1)!;
    const [notification] = await db.select().from(notifications).where(eq(notifications.id, tentativeId));
    expect(notification).toBeUndefined();
    const [request] = await db.select().from(noeliaActionRequests)
      .where(eq(noeliaActionRequests.id, requested.actionRequestId!));
    expect(request.status).toBe("FAILED");
    const evidence = await db.select().from(auditLog).where(and(
      eq(auditLog.objectId, requested.actionRequestId!),
      eq(auditLog.outcome, "FAILURE"),
    ));
    expect(evidence.length).toBeGreaterThan(0);
  });
});
