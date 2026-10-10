import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/noelia/execution-control", () => ({
  assertNoeliaExecutionAllowed: vi.fn(async () => undefined),
  ExecutionStoppedError: class ExecutionStoppedError extends Error {},
}));

import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { approvals, auditLog, knowledgeSources, noeliaActionRequests, notifications } from "../../src/db/schema";
import { newId, ID_PREFIX } from "../../src/lib/ids";
import {
  approveNoeliaAction,
  executeApprovedNoeliaAction,
  requestNoeliaAction,
} from "../../src/lib/noelia/actions";
import { NoeliaToolRegistry } from "../../src/lib/noelia/tool-registry";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import type { ToolInvocationContext } from "../../src/lib/noelia/types";
import { seededPrincipal } from "./db-fixtures";

const actionIds: string[] = [];
const approvalIds: string[] = [];
const notificationIds: string[] = [];

class CanonicalNotificationService {
  constructor(
    private readonly failAfterMutation = false,
    private readonly delayMs = 0,
  ) {}

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
    if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
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

  it("serializes simultaneous execution so one non-idempotent handler effect occurs", async () => {
    const requester = await seededPrincipal("cfo@beyu.os");
    const approver = await seededPrincipal("governance@beyu.os");
    const service = new CanonicalNotificationService(false, 75);
    const tools = registry(service);
    const traceId = `TRACE_CONCURRENT_${Date.now()}`;
    const requested = await remember(await requestNoeliaAction({
      registry: tools.value,
      principal: requester,
      toolName: "notification.governed.create",
      toolInput: { operation: "single-effect" },
      traceId,
    }));
    await approveNoeliaAction({ principal: approver, actionRequestId: requested.actionRequestId!, traceId });

    const results = await Promise.all([
      executeApprovedNoeliaAction({
        registry: tools.value,
        requestingPrincipal: requester,
        actionRequestId: requested.actionRequestId!,
        traceId: `${traceId}_A`,
      }),
      executeApprovedNoeliaAction({
        registry: tools.value,
        requestingPrincipal: requester,
        actionRequestId: requested.actionRequestId!,
        traceId: `${traceId}_B`,
      }),
    ]);

    expect(results.filter((result) => result.status === "COMPLETED")).toHaveLength(1);
    expect(results.filter((result) => result.code === "ACTION_NOT_APPROVED")).toHaveLength(1);
    expect(tools.spy).toHaveBeenCalledOnce();
  });

  it("keeps knowledge UNDER_REVIEW until a separately approved exact-digest publication", async () => {
    const requester = await seededPrincipal("ceo@beyu.os");
    const approver = await seededPrincipal("governance@beyu.os");
    const tools = createDefaultNoeliaToolRegistry();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const code = `ACTION-KNOWLEDGE-${suffix}`.slice(0, 64);
    const baseInput = {
      code,
      title: "Governed action knowledge fixture",
      domain: "AI_GOVERNANCE",
      content: "Knowledge can become authoritative only through a separate exact-digest publication.",
      scopeType: "GLOBAL",
      classification: "CONFIDENTIAL",
      version: "1.0.0",
      effectiveFrom: "2026-10-04",
      reviewDate: "2027-10-04",
      provenance: "Disposable action integration evidence",
      keywords: ["governance", "approval"],
    };

    // A client cannot smuggle an authority status through the strict tool
    // contract. Even after approval, execution fails and creates no source.
    const spoofed = await remember(await requestNoeliaAction({
      registry: tools,
      principal: requester,
      toolName: "knowledge.ingest",
      toolInput: { ...baseInput, code: `${code}-S`.slice(0, 64), authorityStatus: "AUTHORITATIVE" },
      traceId: `TRACE_KNOWLEDGE_SPOOF_${suffix}`,
    }));
    await approveNoeliaAction({ principal: approver, actionRequestId: spoofed.actionRequestId!, traceId: `TRACE_KNOWLEDGE_SPOOF_${suffix}` });
    const spoofResult = await executeApprovedNoeliaAction({
      registry: tools,
      requestingPrincipal: requester,
      actionRequestId: spoofed.actionRequestId!,
      traceId: `TRACE_KNOWLEDGE_SPOOF_${suffix}`,
    });
    expect(spoofResult.status).toBe("FAILED");
    expect(await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, `${code}-S`.slice(0, 64)))).toHaveLength(0);

    const ingest = await remember(await requestNoeliaAction({
      registry: tools,
      principal: requester,
      toolName: "knowledge.ingest",
      toolInput: baseInput,
      traceId: `TRACE_KNOWLEDGE_INGEST_${suffix}`,
    }));
    expect(ingest.status).toBe("PENDING_APPROVAL");
    await approveNoeliaAction({ principal: approver, actionRequestId: ingest.actionRequestId!, traceId: `TRACE_KNOWLEDGE_INGEST_${suffix}` });
    const ingested = await executeApprovedNoeliaAction({
      registry: tools,
      requestingPrincipal: requester,
      actionRequestId: ingest.actionRequestId!,
      traceId: `TRACE_KNOWLEDGE_INGEST_${suffix}`,
    });
    expect(ingested.status).toBe("COMPLETED");
    const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, code)).limit(1);
    expect(source.authorityStatus).toBe("UNDER_REVIEW");
    expect(source.contentDigest).toMatch(/^[a-f0-9]{64}$/);

    const replay = await executeApprovedNoeliaAction({
      registry: tools,
      requestingPrincipal: requester,
      actionRequestId: ingest.actionRequestId!,
      traceId: `TRACE_KNOWLEDGE_REPLAY_${suffix}`,
    });
    expect(replay.code).toBe("ACTION_NOT_APPROVED");

    // A separately approved publication with a stale/mismatched digest rolls
    // back and remains non-authoritative rather than being reported complete.
    const mismatchedPublish = await remember(await requestNoeliaAction({
      registry: tools,
      principal: requester,
      toolName: "knowledge.publish",
      toolInput: { code, expectedDigest: "0".repeat(64), expectedVersion: source.version },
      traceId: `TRACE_KNOWLEDGE_BAD_PUBLISH_${suffix}`,
    }));
    await approveNoeliaAction({ principal: approver, actionRequestId: mismatchedPublish.actionRequestId!, traceId: `TRACE_KNOWLEDGE_BAD_PUBLISH_${suffix}` });
    const mismatch = await executeApprovedNoeliaAction({
      registry: tools,
      requestingPrincipal: requester,
      actionRequestId: mismatchedPublish.actionRequestId!,
      traceId: `TRACE_KNOWLEDGE_BAD_PUBLISH_${suffix}`,
    });
    expect(mismatch.status).toBe("FAILED");
    expect((await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id)).limit(1))[0].authorityStatus).toBe("UNDER_REVIEW");

    const publish = await remember(await requestNoeliaAction({
      registry: tools,
      principal: requester,
      toolName: "knowledge.publish",
      toolInput: { code, expectedDigest: source.contentDigest!, expectedVersion: source.version },
      traceId: `TRACE_KNOWLEDGE_PUBLISH_${suffix}`,
    }));
    await approveNoeliaAction({ principal: approver, actionRequestId: publish.actionRequestId!, traceId: `TRACE_KNOWLEDGE_PUBLISH_${suffix}` });
    const published = await executeApprovedNoeliaAction({
      registry: tools,
      requestingPrincipal: requester,
      actionRequestId: publish.actionRequestId!,
      traceId: `TRACE_KNOWLEDGE_PUBLISH_${suffix}`,
    });
    expect(published.status).toBe("COMPLETED");
    expect((await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, source.id)).limit(1))[0].authorityStatus).toBe("AUTHORITATIVE");
  });

  it("serializes duplicate ingestion, replacement, and publication races", async () => {
    const requester = await seededPrincipal("ceo@beyu.os");
    const approver = await seededPrincipal("governance@beyu.os");
    const tools = createDefaultNoeliaToolRegistry();
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const predecessorCode = `RACE-KNOWLEDGE-${suffix}`.slice(0, 64);
    const baseInput = {
      code: predecessorCode,
      title: "Governed knowledge race fixture",
      domain: "AI_GOVERNANCE",
      content: "Concurrent requests must produce one canonical governed knowledge transition.",
      scopeType: "GLOBAL",
      classification: "CONFIDENTIAL",
      version: "1.0.0",
      effectiveFrom: "2026-10-04",
      reviewDate: "2027-10-04",
      provenance: "Disposable action concurrency evidence",
      keywords: ["governance", "concurrency"],
    };
    const prepare = async (toolName: string, toolInput: Record<string, unknown>, label: string) => {
      const requested = await remember(await requestNoeliaAction({
        registry: tools,
        principal: requester,
        toolName,
        toolInput,
        traceId: `TRACE_${label}_${suffix}`,
      }));
      expect(requested.status).toBe("PENDING_APPROVAL");
      const approval = await approveNoeliaAction({
        principal: approver,
        actionRequestId: requested.actionRequestId!,
        traceId: `TRACE_${label}_APPROVE_${suffix}`,
      });
      expect(approval.status).toBe("APPROVED");
      return requested;
    };
    const execute = (request: Awaited<ReturnType<typeof requestNoeliaAction>>, label: string) => executeApprovedNoeliaAction({
      registry: tools,
      requestingPrincipal: requester,
      actionRequestId: request.actionRequestId!,
      traceId: `TRACE_${label}_EXECUTE_${suffix}`,
    });

    const duplicateA = await prepare("knowledge.ingest", baseInput, "DUPLICATE_A");
    const duplicateB = await prepare("knowledge.ingest", baseInput, "DUPLICATE_B");
    const duplicateResults = await Promise.all([
      execute(duplicateA, "DUPLICATE_A"),
      execute(duplicateB, "DUPLICATE_B"),
    ]);
    expect(duplicateResults.filter((result) => result.status === "COMPLETED")).toHaveLength(1);
    expect(duplicateResults.filter((result) => result.status === "FAILED")).toHaveLength(1);
    const predecessorRows = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, predecessorCode));
    expect(predecessorRows).toHaveLength(1);
    const predecessor = predecessorRows[0];
    expect(predecessor.authorityStatus).toBe("UNDER_REVIEW");

    const publishInput = {
      code: predecessor.code,
      expectedDigest: predecessor.contentDigest!,
      expectedVersion: predecessor.version,
    };
    const publishA = await prepare("knowledge.publish", publishInput, "PUBLISH_A");
    const publishB = await prepare("knowledge.publish", publishInput, "PUBLISH_B");
    const publishResults = await Promise.all([
      execute(publishA, "PUBLISH_A"),
      execute(publishB, "PUBLISH_B"),
    ]);
    expect(publishResults.filter((result) => result.status === "COMPLETED")).toHaveLength(1);
    expect(publishResults.filter((result) => result.status === "FAILED")).toHaveLength(1);
    expect((await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, predecessor.id)).limit(1))[0].authorityStatus).toBe("AUTHORITATIVE");

    const replacementCodeA = `RACE-REPLACEMENT-A-${suffix}`.slice(0, 64);
    const replacementCodeB = `RACE-REPLACEMENT-B-${suffix}`.slice(0, 64);
    const replacementBase = {
      title: "Governed replacement race fixture",
      domain: "AI_GOVERNANCE",
      content: "Only one active replacement branch may bind an authoritative predecessor.",
      scopeType: "GLOBAL",
      classification: "CONFIDENTIAL",
      version: "2.0.0",
      effectiveFrom: "2026-10-04",
      reviewDate: "2027-10-04",
      provenance: "Disposable replacement concurrency evidence",
      keywords: ["replacement", "concurrency"],
    };
    const replacementInput = (code: string) => ({
      supersedesCode: predecessor.code,
      expectedDigest: predecessor.contentDigest!,
      expectedVersion: predecessor.version,
      replacement: { ...replacementBase, code },
    });
    const replacementA = await prepare("knowledge.replace", replacementInput(replacementCodeA), "REPLACEMENT_A");
    const replacementB = await prepare("knowledge.replace", replacementInput(replacementCodeB), "REPLACEMENT_B");
    const replacementResults = await Promise.all([
      execute(replacementA, "REPLACEMENT_A"),
      execute(replacementB, "REPLACEMENT_B"),
    ]);
    expect(replacementResults.filter((result) => result.status === "COMPLETED")).toHaveLength(1);
    expect(replacementResults.filter((result) => result.status === "FAILED")).toHaveLength(1);
    const replacements = await db.select().from(knowledgeSources)
      .where(eq(knowledgeSources.supersedesCode, predecessor.code));
    expect(replacements).toHaveLength(1);
    expect(replacements[0].authorityStatus).toBe("UNDER_REVIEW");

    const replacementPublishInput = {
      code: replacements[0].code,
      expectedDigest: replacements[0].contentDigest!,
      expectedVersion: replacements[0].version,
      expectedSupersededDigest: predecessor.contentDigest!,
      expectedSupersededVersion: predecessor.version,
    };
    const replacementPublishA = await prepare("knowledge.publish", replacementPublishInput, "REPLACEMENT_PUBLISH_A");
    const replacementPublishB = await prepare("knowledge.publish", replacementPublishInput, "REPLACEMENT_PUBLISH_B");
    const replacementPublishResults = await Promise.all([
      execute(replacementPublishA, "REPLACEMENT_PUBLISH_A"),
      execute(replacementPublishB, "REPLACEMENT_PUBLISH_B"),
    ]);
    expect(replacementPublishResults.filter((result) => result.status === "COMPLETED")).toHaveLength(1);
    expect(replacementPublishResults.filter((result) => result.status === "FAILED")).toHaveLength(1);
    expect((await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, predecessor.id)).limit(1))[0].authorityStatus).toBe("SUPERSEDED");
    expect((await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, replacements[0].id)).limit(1))[0].authorityStatus).toBe("AUTHORITATIVE");
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
