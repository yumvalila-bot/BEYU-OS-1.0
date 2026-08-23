import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { approvals, noeliaActionRequests } from "@/db/schema";
import { recordAuditTx } from "@/lib/audit";
import { can, type Principal } from "@/lib/authz";
import { NOELIA_IDENTITY } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "./scope-service";
import { NoeliaToolRegistry } from "./tool-registry";
import type { NoeliaTargetContext, ToolDenialCode, ToolInvocationContext } from "./types";

export type NoeliaActionResult = {
  actionRequestId: string | null;
  approvalId: string | null;
  status: "DENIED" | "PENDING_APPROVAL" | "APPROVED" | "COMPLETED" | "FAILED";
  code: string;
  reason: string;
  output?: Record<string, unknown> | null;
};

/**
 * BEYU action boundary for HIVE.
 *
 * Denial is returned as data, never thrown after evidence is appended. This is
 * deliberate: throwing out of the transaction would roll back the evidence row
 * and leave an unaudited denied attempt. Domain handlers are not called while a
 * request is denied or pending approval.
 */
export async function requestNoeliaAction(input: {
  registry: NoeliaToolRegistry;
  principal: Principal;
  toolName: string;
  toolInput: Record<string, unknown>;
  target?: Partial<NoeliaTargetContext> | null;
  traceId: string;
}): Promise<NoeliaActionResult> {
  return withTenantDatabaseContext(input.principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(input.principal);
    const target = requestedNoeliaTarget(input.principal, input.target);
    const context: ToolInvocationContext = {
      principal: input.principal,
      traceId: input.traceId,
      target,
      scope,
      approval: null,
    };
    const decision = input.registry.authorize(input.toolName, context);
    const definition = input.registry.definition(input.toolName);
    const eligibleForApproval = !decision.allowed && decision.code === "HUMAN_APPROVAL_REQUIRED";
    const denialCode = decision.allowed ? "ACTION_NOT_GOVERNED" : decision.code;
    const denialReason = decision.allowed
      ? "Low-risk read tools are invoked directly and cannot be disguised as governed action requests."
      : decision.reason;
    const actionRequestId = newId(ID_PREFIX.noeliaAction);

    if (!eligibleForApproval || !definition) {
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.insert(noeliaActionRequests).values({
          id: actionRequestId,
          tenantId: input.principal.tenantId,
          requestingHumanId: input.principal.userId,
          executingAi: NOELIA_IDENTITY,
          toolName: input.toolName,
          input: input.toolInput,
          targetTenantId: target.tenantId,
          legalEntityId: target.legalEntityId,
          countryCode: target.countryCode,
          risk: definition?.risk ?? "HIGH",
          status: "DENIED",
          denialCode,
          reason: denialReason,
        });
        await recordAuditTx(tx, {
          tenantId: input.principal.tenantId,
          actorUserId: input.principal.userId,
          actorType: "AI",
          action: "ai.noelia.action.request",
          objectType: "NOELIA_ACTION",
          objectId: actionRequestId,
          outcome: "DENIED",
          reason: denialReason,
          aiVersion: NOELIA_IDENTITY,
          traceId: input.traceId,
          newValue: {
            requestingHuman: input.principal.userId,
            executingAi: NOELIA_IDENTITY,
            approvingHuman: null,
            toolName: input.toolName,
            denialCode,
          },
        });
      });
      return {
        actionRequestId,
        approvalId: null,
        status: "DENIED",
        code: denialCode,
        reason: denialReason,
      };
    }

    const approvalId = newId(ID_PREFIX.approval);
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      await tx.insert(approvals).values({
        id: approvalId,
        tenantId: input.principal.tenantId,
        objectType: "NOELIA_ACTION",
        objectId: actionRequestId,
        step: 1,
        approverRole: definition.approverRole ?? "CHIEF_GOVERNANCE_OFFICER",
        decision: "PENDING",
        requestedBy: input.principal.userId,
        comment: `Noelia prepared ${input.toolName}; no domain mutation has occurred.`,
      });
      await tx.insert(noeliaActionRequests).values({
        id: actionRequestId,
        tenantId: input.principal.tenantId,
        requestingHumanId: input.principal.userId,
        executingAi: NOELIA_IDENTITY,
        approvalId,
        toolName: input.toolName,
        input: input.toolInput,
        targetTenantId: target.tenantId,
        legalEntityId: target.legalEntityId,
        countryCode: target.countryCode,
        risk: definition.risk,
        status: "PENDING_APPROVAL",
        reason: "Prepared by Noelia; accountable-human approval is required before execution.",
      });
      await recordAuditTx(tx, {
        tenantId: input.principal.tenantId,
        actorUserId: input.principal.userId,
        actorType: "AI",
        action: "ai.noelia.action.request",
        objectType: "NOELIA_ACTION",
        objectId: actionRequestId,
        reason: "Action prepared; human approval pending; domain unchanged.",
        approvalRef: approvalId,
        aiVersion: NOELIA_IDENTITY,
        traceId: input.traceId,
        newValue: {
          requestingHuman: input.principal.userId,
          executingAi: NOELIA_IDENTITY,
          approvingHuman: null,
          status: "PENDING_APPROVAL",
          toolName: input.toolName,
        },
      });
    });

    return {
      actionRequestId,
      approvalId,
      status: "PENDING_APPROVAL",
      code: "HUMAN_APPROVAL_REQUIRED",
      reason: "Action is prepared but not executable until a separate accountable human approves it.",
    };
  });
}

export async function approveNoeliaAction(input: {
  principal: Principal;
  actionRequestId: string;
  traceId: string;
  comment?: string;
}): Promise<NoeliaActionResult> {
  return withTenantDatabaseContext(input.principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(input.principal);
    const [request] = await db
      .select()
      .from(noeliaActionRequests)
      .where(and(
        eq(noeliaActionRequests.id, input.actionRequestId),
        inArray(noeliaActionRequests.tenantId, scope.tenantIds),
      ))
      .limit(1);
    if (!request) {
      return { actionRequestId: null, approvalId: null, status: "DENIED", code: "NOT_FOUND", reason: "Action request not found in scope." };
    }

    const access = can(input.principal, "ai:decision.review");
    const makerChecker = request.requestingHumanId !== input.principal.userId;
    if (!access.allowed || !makerChecker || request.status !== "PENDING_APPROVAL" || !request.approvalId) {
      const reason = !access.allowed
        ? access.reason
        : !makerChecker
          ? "The requesting human cannot approve their own Noelia action."
          : "Action is not pending an approval.";
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await recordAuditTx(tx, {
          tenantId: request.tenantId,
          actorUserId: input.principal.userId,
          actorType: "HUMAN",
          action: "ai.noelia.action.approve",
          objectType: "NOELIA_ACTION",
          objectId: request.id,
          outcome: "DENIED",
          reason,
          approvalRef: request.approvalId ?? undefined,
          traceId: input.traceId,
        });
      });
      return { actionRequestId: request.id, approvalId: request.approvalId, status: "DENIED", code: "APPROVAL_DENIED", reason };
    }

    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      await tx.update(approvals).set({
        approverUserId: input.principal.userId,
        decision: "APPROVED",
        decidedAt: new Date(),
        comment: input.comment ?? "Approved by accountable human.",
      }).where(eq(approvals.id, request.approvalId!));
      await tx.update(noeliaActionRequests).set({
        approvingHumanId: input.principal.userId,
        status: "APPROVED",
        approvedAt: new Date(),
        reason: "Approved by accountable human; execution remains a separate governed step.",
      }).where(eq(noeliaActionRequests.id, request.id));
      await recordAuditTx(tx, {
        tenantId: request.tenantId,
        actorUserId: input.principal.userId,
        actorType: "HUMAN",
        action: "ai.noelia.action.approve",
        objectType: "NOELIA_ACTION",
        objectId: request.id,
        reason: input.comment ?? "Approved by accountable human.",
        approvalRef: request.approvalId!,
        traceId: input.traceId,
        newValue: {
          requestingHuman: request.requestingHumanId,
          executingAi: request.executingAi,
          approvingHuman: input.principal.userId,
          status: "APPROVED",
        },
      });
    });

    return {
      actionRequestId: request.id,
      approvalId: request.approvalId,
      status: "APPROVED",
      code: "APPROVED_BY_HUMAN",
      reason: "Human approval recorded; no domain action was executed by the approval step.",
    };
  });
}

export async function executeApprovedNoeliaAction(input: {
  registry: NoeliaToolRegistry;
  requestingPrincipal: Principal;
  actionRequestId: string;
  traceId: string;
}): Promise<NoeliaActionResult> {
  return withTenantDatabaseContext(input.requestingPrincipal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(input.requestingPrincipal);

    try {
      return await db.transaction(async (rawTx): Promise<NoeliaActionResult> => {
        const tx = rawTx as unknown as typeof db;
        await tx.execute(sql`select id from noelia_action_requests where id = ${input.actionRequestId} for update`);
        const [request] = await tx
          .select()
          .from(noeliaActionRequests)
          .where(and(
            eq(noeliaActionRequests.id, input.actionRequestId),
            inArray(noeliaActionRequests.tenantId, scope.tenantIds),
          ))
          .limit(1);
        if (
          !request ||
          request.status !== "APPROVED" ||
          request.requestingHumanId !== input.requestingPrincipal.userId ||
          !request.approvalId ||
          !request.approvingHumanId
        ) {
          return {
            actionRequestId: request?.id ?? null,
            approvalId: request?.approvalId ?? null,
            status: "DENIED",
            code: "ACTION_NOT_APPROVED",
            reason: "An approved, in-scope action bound to the requesting human is required.",
          };
        }
        const [approval] = await tx.select().from(approvals).where(eq(approvals.id, request.approvalId)).limit(1);
        const context: ToolInvocationContext = {
          principal: input.requestingPrincipal,
          traceId: input.traceId,
          target: {
            tenantId: request.targetTenantId,
            legalEntityId: request.legalEntityId,
            countryCode: request.countryCode,
          },
          scope,
          approval: approval && approval.decision === "APPROVED" && approval.approverUserId
            ? {
                approvalId: approval.id,
                approvingHumanId: approval.approverUserId,
                actorType: "HUMAN",
                decision: "APPROVED",
              }
            : null,
        };

        // AUTHORIZATION → ACTION/DOMAIN CHANGE. The handler sees only the
        // canonical context and remains inside this transaction through the db
        // AsyncLocalStorage proxy.
        const invocation = await input.registry.invoke(request.toolName, context, request.input);
        if (!invocation.allowed) {
          await tx.update(noeliaActionRequests).set({
            status: "FAILED",
            denialCode: invocation.decision.code,
            reason: invocation.decision.reason,
            completedAt: new Date(),
          }).where(eq(noeliaActionRequests.id, request.id));
          await recordAuditTx(tx, {
            tenantId: request.tenantId,
            actorUserId: request.requestingHumanId,
            actorType: "AI",
            action: "ai.noelia.action.execute",
            objectType: "NOELIA_ACTION",
            objectId: request.id,
            outcome: "DENIED",
            reason: invocation.decision.reason,
            approvalRef: request.approvalId,
            aiVersion: NOELIA_IDENTITY,
            traceId: input.traceId,
          });
          return {
            actionRequestId: request.id,
            approvalId: request.approvalId,
            status: "FAILED",
            code: invocation.decision.code,
            reason: invocation.decision.reason,
          };
        }

        // COMPLETION → AUDIT remains atomic with the handler's domain mutation.
        const output = invocation.output as Record<string, unknown>;
        await tx.update(noeliaActionRequests).set({
          status: "COMPLETED",
          reason: "Authorized action completed through its registered BEYU service.",
          output,
          completedAt: new Date(),
        }).where(eq(noeliaActionRequests.id, request.id));
        await recordAuditTx(tx, {
          tenantId: request.tenantId,
          actorUserId: request.requestingHumanId,
          actorType: "AI",
          action: "ai.noelia.action.execute",
          objectType: "NOELIA_ACTION",
          objectId: request.id,
          reason: "Registered BEYU service completed after accountable-human approval.",
          approvalRef: request.approvalId,
          aiVersion: NOELIA_IDENTITY,
          traceId: input.traceId,
          newValue: {
            requestingHuman: request.requestingHumanId,
            executingAi: request.executingAi,
            approvingHuman: request.approvingHumanId,
            status: "COMPLETED",
          },
        });
        return {
          actionRequestId: request.id,
          approvalId: request.approvalId,
          status: "COMPLETED",
          code: "COMPLETED",
          reason: "Action completed through the registered BEYU service.",
          output,
        };
      });
    } catch {
      // The action/domain/completion/audit transaction rolled back. Persist only
      // safe failure evidence in a fresh transaction; no DB detail is exposed.
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        const [request] = await tx
          .select()
          .from(noeliaActionRequests)
          .where(eq(noeliaActionRequests.id, input.actionRequestId))
          .limit(1);
        if (!request || request.status !== "APPROVED") return;
        await tx.update(noeliaActionRequests).set({
          status: "FAILED",
          reason: "The registered BEYU service failed; its domain transaction was rolled back.",
          completedAt: new Date(),
        }).where(eq(noeliaActionRequests.id, request.id));
        await recordAuditTx(tx, {
          tenantId: request.tenantId,
          actorUserId: request.requestingHumanId,
          actorType: "AI",
          action: "ai.noelia.action.execute",
          objectType: "NOELIA_ACTION",
          objectId: request.id,
          outcome: "FAILURE",
          reason: "Registered BEYU service failed; domain transaction rolled back.",
          approvalRef: request.approvalId ?? undefined,
          aiVersion: NOELIA_IDENTITY,
          traceId: input.traceId,
        });
      });
      return {
        actionRequestId: input.actionRequestId,
        approvalId: null,
        status: "FAILED",
        code: "EXECUTION_FAILED",
        reason: "The action could not be completed; no domain mutation was committed.",
      };
    }
  });
}

export type NoeliaActionDenialCode = ToolDenialCode | "ACTION_NOT_GOVERNED";
