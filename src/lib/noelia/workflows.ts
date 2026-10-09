import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { approvals, noeliaWorkflowSteps, noeliaWorkflows } from "@/db/schema";
import { recordAuditTx } from "@/lib/audit";
import { can, type Principal } from "@/lib/authz";
import { NOELIA_IDENTITY } from "@/lib/constants";
import { checksumOf } from "@/lib/crypto";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "./scope-service";
import { NoeliaToolRegistry } from "./tool-registry";
import { verifyHumanApproval, verifyHumanControlCommand, verifyRecordedHumanApproval } from "./human-approval";
import type { NoeliaTargetContext, ToolInvocationContext } from "./types";

export const WORKFLOW_STATUS = [
  "PLANNED", "VALIDATED", "WAITING_FOR_HUMAN_AUTHORITY", "AUTHORIZED", "RUNNING", "COMPLETED",
  "ESCALATED", "STOPPED", "FAILED", "CANCELLED", "TIMED_OUT",
] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUS)[number];

export const WORKFLOW_STEP_STATUS = [
  "PENDING", "ALLOWED", "DENIED", "COMPLETED", "FAILED", "SKIPPED",
] as const;
export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUS)[number];

export const WORKFLOW_PLAN_SCHEMA = z.object({
  goal: z.string().min(10).max(500),
  maxSteps: z.number().int().min(1).max(12).default(8),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  target: z.object({
    tenantId: z.string().min(1),
    legalEntityId: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
  }).strict(),
  steps: z.array(z.object({
    toolName: z.string().min(3).max(80),
    input: z.record(z.unknown()).default({}),
    requiresApproval: z.boolean().default(false),
    approverRole: z.string().nullable().optional(),
  }).strict()).min(1).max(12),
}).strict();

export type NoeliaWorkflowPlan = z.input<typeof WORKFLOW_PLAN_SCHEMA>;

export type NoeliaWorkflowResult = {
  workflowId: string | null;
  status: WorkflowStatus;
  code: string;
  reason: string;
  approvalId: string | null;
  stepResults?: Array<{ step: number; toolName: string; status: WorkflowStepStatus; code: string }>;
};

type StoredWorkflowPlan = Array<{
  step: number;
  toolName: string;
  capabilityId: string | null;
  toolVersion: string | null;
  input: Record<string, unknown>;
  requiresApproval: boolean;
  approverRole: string | null;
}>;

export function computeWorkflowPlanDigest(input: {
  version: number;
  target: NoeliaTargetContext;
  steps: StoredWorkflowPlan;
}): string {
  return checksumOf({ version: input.version, target: input.target, steps: input.steps });
}

function verifiedWorkflowBinding(workflow: typeof noeliaWorkflows.$inferSelect): {
  target: NoeliaTargetContext;
  planDigest: string;
} | null {
  // Rolling compatibility leaves these columns nullable for rows written by a
  // concurrently running pre-0074 release. Missing bindings are never inferred
  // from presentation data or the legacy plan; they fail closed and must be
  // re-planned through the canonical workflow service.
  if (!workflow.targetTenantId || !workflow.planDigest) return null;
  const target: NoeliaTargetContext = {
    tenantId: workflow.targetTenantId,
    legalEntityId: workflow.targetLegalEntityId,
    countryCode: workflow.targetCountryCode,
  };
  const expected = computeWorkflowPlanDigest({
    version: workflow.planVersion,
    target,
    steps: workflow.plan,
  });
  return workflow.planDigest === expected ? { target, planDigest: workflow.planDigest } : null;
}

async function workflowAudit(
  tx: typeof db,
  input: { tenantId: string; actorUserId: string; action: string; workflowId: string; traceId: string; outcome?: "SUCCESS" | "DENIED" | "FAILURE"; reason: string; approvalRef?: string | null; newValue?: Record<string, unknown> },
): Promise<void> {
  await recordAuditTx(tx, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actorType: "AI",
    action: input.action,
    objectType: "NOELIA_WORKFLOW",
    objectId: input.workflowId,
    outcome: input.outcome,
    reason: input.reason,
    approvalRef: input.approvalRef ?? undefined,
    aiVersion: NOELIA_IDENTITY,
    traceId: input.traceId,
    newValue: input.newValue,
  });
}

/**
 * Governed agentic workflow runtime (section 15).
 *
 * PLAN → VALIDATE → AUTHORIZE → EXECUTE → OBSERVE → REASSESS →
 * CONTINUE/ESCALATE/STOP → AUDIT. Every transition is audited; every step is a
 * registered capability invoked through the tool registry (authorization is
 * re-checked at execution, so an approval record is never authority by
 * existence). Noelia cannot approve its own workflow; the requesting human
 * cannot self-approve where separation is required; loops are bounded by
 * maxSteps/timeout/budget; retries and cancellation are governed.
 */
export class BeyuNoeliaWorkflowService {
  private async scopeFor(principal: Principal) {
    const scope = await resolveNoeliaAuthorizedScope(principal);
    return { scope, target: requestedNoeliaTarget(principal) };
  }

  /** PLAN: persist the workflow and its steps, all PENDING, all audited. */
  async create(input: {
    principal: Principal;
    registry: NoeliaToolRegistry;
    plan: NoeliaWorkflowPlan;
    traceId: string;
    correlationId?: string | null;
    causationId?: string | null;
  }): Promise<NoeliaWorkflowResult> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { scope } = await this.scopeFor(input.principal);
      const parsed = WORKFLOW_PLAN_SCHEMA.parse(input.plan);
      if (!scope.tenantIds.includes(parsed.target.tenantId)) {
        return { workflowId: null, status: "PLANNED", code: "TENANT_DENIED", reason: "Target tenant is outside the resolved BEYU scope.", approvalId: null };
      }
      const workflowId = newId(ID_PREFIX.noeliaWorkflow);
      const target: NoeliaTargetContext = {
        tenantId: parsed.target.tenantId,
        legalEntityId: parsed.target.legalEntityId ?? null,
        countryCode: parsed.target.countryCode ?? null,
      };
      const planVersion = 1;
      const storedPlan: StoredWorkflowPlan = parsed.steps.map((step, index) => {
        const definition = input.registry.definition(step.toolName);
        return {
          step: index + 1,
          toolName: step.toolName,
          capabilityId: definition?.metadata.stableId ?? null,
          toolVersion: definition?.metadata.version ?? null,
          input: step.input,
          requiresApproval: step.requiresApproval,
          approverRole: step.approverRole ?? null,
        };
      });
      const planDigest = computeWorkflowPlanDigest({ version: planVersion, target, steps: storedPlan });
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.insert(noeliaWorkflows).values({
          id: workflowId,
          tenantId: target.tenantId,
          goal: parsed.goal,
          status: "PLANNED",
          plan: storedPlan,
          planDigest,
          planVersion,
          targetTenantId: target.tenantId,
          targetLegalEntityId: target.legalEntityId,
          targetCountryCode: target.countryCode,
          approvalRequired: true,
          requiredApproverRoles: [],
          maxSteps: parsed.maxSteps,
          currentStep: 0,
          timeoutMs: parsed.timeoutMs,
          budget: { stepBudget: parsed.steps.length },
          retryPolicy: null,
          cancellationRequested: false,
          requestedBy: input.principal.userId,
          executingAi: NOELIA_IDENTITY,
          traceId: input.traceId,
          correlationId: input.correlationId ?? null,
          causationId: input.causationId ?? null,
        });
        for (const [index, step] of parsed.steps.entries()) {
          const definition = null; // capability column is resolved at validation time
          void definition;
          await tx.insert(noeliaWorkflowSteps).values({
            id: newId(ID_PREFIX.noeliaWorkflowStep),
            workflowId,
            stepIndex: index + 1,
            toolName: step.toolName,
            capability: "",
            policyDecision: "PENDING",
            scope: { tenantId: parsed.target.tenantId, legalEntityId: parsed.target.legalEntityId ?? null, countryCode: parsed.target.countryCode ?? null },
            inputClassification: "INTERNAL",
            outputClassification: "INTERNAL",
            status: "PENDING",
            traceId: input.traceId,
          });
        }
        await workflowAudit(tx, {
          tenantId: target.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.plan",
          workflowId,
          traceId: input.traceId,
          reason: `Workflow planned with ${parsed.steps.length} step(s); nothing executed.`,
          newValue: { goal: parsed.goal, steps: parsed.steps.length, maxSteps: parsed.maxSteps, target, planVersion, planDigest },
        });
      });
      return { workflowId, status: "PLANNED", code: "PLANNED", reason: "Workflow planned; steps are PENDING and nothing has executed.", approvalId: null };
    });
  }

  /** VALIDATE: every step must resolve to a registered, authorized capability. */
  async validate(input: {
    principal: Principal;
    registry: NoeliaToolRegistry;
    workflowId: string;
    traceId: string;
  }): Promise<NoeliaWorkflowResult> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { scope } = await this.scopeFor(input.principal);
      const [workflow] = await db.select().from(noeliaWorkflows).where(and(
        eq(noeliaWorkflows.id, input.workflowId),
        inArray(noeliaWorkflows.tenantId, scope.tenantIds),
      )).limit(1);
      if (!workflow) return { workflowId: input.workflowId, status: "PLANNED", code: "NOT_FOUND", reason: "Workflow not found in scope.", approvalId: null };
      if (workflow.status !== "PLANNED") {
        return { workflowId: input.workflowId, status: workflow.status as WorkflowStatus, code: "INVALID_TRANSITION", reason: `Workflow is ${workflow.status}; only PLANNED workflows can be validated.`, approvalId: workflow.approvalId };
      }
      const binding = verifiedWorkflowBinding(workflow);
      if (!binding) {
        return { workflowId: workflow.id, status: "STOPPED", code: "PLAN_DIGEST_MISMATCH", reason: "Stored workflow target or ordered plan no longer matches its immutable digest.", approvalId: null };
      }
      const steps = await db.select().from(noeliaWorkflowSteps)
        .where(eq(noeliaWorkflowSteps.workflowId, input.workflowId))
        .orderBy(noeliaWorkflowSteps.stepIndex);
      const { target } = binding;
      const context: ToolInvocationContext = {
        principal: input.principal,
        traceId: input.traceId,
        target,
        scope,
        approval: null,
      };
      const denials: string[] = [];
      const requiredApproverRoles = new Set<string>();
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        for (const step of steps) {
          const definition = input.registry.definition(step.toolName);
          const decision = input.registry.authorize(step.toolName, context);
          const planStep = workflow.plan.find((candidate) => candidate.step === step.stepIndex);
          const capabilityBindingMatches = Boolean(
            definition &&
            planStep?.capabilityId &&
            planStep.toolVersion &&
            planStep.capabilityId === definition.metadata.stableId &&
            planStep.toolVersion === definition.metadata.version,
          );
          const approvalPending = decision.code === "HUMAN_APPROVAL_REQUIRED";
          const approvalRequired = Boolean(
            planStep?.requiresApproval ||
            definition?.risk === "HIGH" ||
            definition?.metadata.approvalRequirements,
          );
          if (approvalRequired) {
            requiredApproverRoles.add(planStep?.approverRole ?? definition?.metadata.ownerRole ?? "CHIEF_GOVERNANCE_OFFICER");
          }
          const structurallyAllowed = capabilityBindingMatches && (decision.allowed || approvalPending);
          const denialCode = capabilityBindingMatches ? decision.code : "CAPABILITY_BINDING_MISMATCH";
          await tx.update(noeliaWorkflowSteps).set({
            capability: structurallyAllowed ? planStep!.capabilityId! : "",
            policyDecision: structurallyAllowed && decision.allowed ? "ALLOWED" : structurallyAllowed && approvalPending ? "VALID_PENDING_APPROVAL" : "DENIED",
            denialCode: structurallyAllowed ? null : denialCode,
            status: structurallyAllowed ? "PENDING" : "DENIED",
          }).where(eq(noeliaWorkflowSteps.id, step.id));
          if (!structurallyAllowed) denials.push(`${step.toolName}:${denialCode}`);
        }
        const approvalRequired = requiredApproverRoles.size > 0;
        const status = denials.length > 0 ? "STOPPED" : approvalRequired ? "WAITING_FOR_HUMAN_AUTHORITY" : "AUTHORIZED";
        await tx.update(noeliaWorkflows).set({
          status,
          approvalRequired,
          requiredApproverRoles: [...requiredApproverRoles].sort(),
        }).where(eq(noeliaWorkflows.id, workflow.id));
        await workflowAudit(tx, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.validate",
          workflowId: workflow.id,
          traceId: input.traceId,
          outcome: denials.length === 0 ? "SUCCESS" : "DENIED",
          reason: denials.length > 0
            ? `Capabilities denied: ${denials.join(", ")}.`
            : requiredApproverRoles.size > 0
              ? "All steps are structurally valid; consequential steps remain pending exact-role human approval."
              : "All steps are registered and pre-authorized; ordinary workflow may execute autonomously.",
          newValue: { denials, requiredApproverRoles: [...requiredApproverRoles].sort(), planDigest: binding.planDigest },
        });
      });
      const approvalRequired = requiredApproverRoles.size > 0;
      return {
        workflowId: workflow.id,
        status: denials.length > 0 ? "STOPPED" : approvalRequired ? "WAITING_FOR_HUMAN_AUTHORITY" : "AUTHORIZED",
        code: denials.length > 0 ? "STOPPED" : approvalRequired ? "WAITING_FOR_HUMAN_AUTHORITY" : "AUTHORIZED",
        reason: denials.length > 0
          ? `Workflow stopped: ${denials.join(", ")}.`
          : approvalRequired
            ? "Workflow is structurally valid and awaits exact-role accountable-human approval."
            : "Ordinary pre-authorized workflow validated and may execute autonomously.",
        approvalId: null,
      };
    });
  }

  /** AUTHORIZE: exact-role accountable human (separate from the requester) approves. */
  async authorize(input: {
    principal: Principal;
    workflowId: string;
    traceId: string;
    comment?: string;
    validUntil?: Date | null;
    quorum?: number | null;
    delegatedFrom?: string | null;
  }): Promise<NoeliaWorkflowResult> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { scope } = await this.scopeFor(input.principal);
      const [workflow] = await db.select().from(noeliaWorkflows).where(and(
        eq(noeliaWorkflows.id, input.workflowId),
        inArray(noeliaWorkflows.tenantId, scope.tenantIds),
      )).limit(1);
      if (!workflow) return { workflowId: input.workflowId, status: "PLANNED", code: "NOT_FOUND", reason: "Workflow not found in scope.", approvalId: null };
      const binding = verifiedWorkflowBinding(workflow);
      if (!binding) {
        return { workflowId: workflow.id, status: "STOPPED", code: "PLAN_DIGEST_MISMATCH", reason: "Workflow target or plan digest changed after validation.", approvalId: workflow.approvalId };
      }
      const { target, planDigest } = binding;
      if (!workflow.approvalRequired || workflow.requiredApproverRoles.length === 0) {
        return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "APPROVAL_NOT_REQUIRED", reason: "This ordinary pre-authorized workflow does not accept unnecessary approval.", approvalId: workflow.approvalId };
      }
      if (workflow.status !== "WAITING_FOR_HUMAN_AUTHORITY" && workflow.status !== "VALIDATED") {
        return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "INVALID_TRANSITION", reason: `Workflow is ${workflow.status}; only work waiting for human authority can be approved.`, approvalId: workflow.approvalId };
      }

      const existingApprovals = await db.select().from(approvals).where(and(
        eq(approvals.objectType, "NOELIA_WORKFLOW"),
        eq(approvals.objectId, workflow.id),
        eq(approvals.decision, "APPROVED"),
        eq(approvals.payloadDigest, planDigest),
        eq(approvals.payloadVersion, workflow.planVersion),
      ));
      if (existingApprovals.some((row) => row.approverUserId === input.principal.userId && !row.revokedAt)) {
        return { workflowId: workflow.id, status: "WAITING_FOR_HUMAN_AUTHORITY", code: "DUPLICATE_APPROVER", reason: "Quorum requires distinct canonical human approvers.", approvalId: workflow.approvalId };
      }
      const activeExistingApprovals = existingApprovals.filter((row) => !row.revokedAt);
      const approvedRoles = new Set(activeExistingApprovals.map((row) => row.approverRole));
      const expiresAt = input.validUntil ?? new Date(Date.now() + 15 * 60_000);
      const minimumQuorum = workflow.requiredApproverRoles.length;
      const declaredQuorum = input.quorum ?? existingApprovals[0]?.quorum ?? minimumQuorum;
      const quorumTarget = Math.max(minimumQuorum, declaredQuorum ?? minimumQuorum);
      const existingDistinctHumans = new Set(activeExistingApprovals.map((row) => row.approverUserId).filter(Boolean));
      const needsAdditionalHumanForQuorum = existingDistinctHumans.size < quorumTarget;
      let approverRole: string | null = null;
      let lastError: Error | null = null;
      const approvalRoleCandidates = [
        ...workflow.requiredApproverRoles.filter((role) => !approvedRoles.has(role)),
        ...(needsAdditionalHumanForQuorum
          ? workflow.requiredApproverRoles.filter((role) => approvedRoles.has(role))
          : []),
      ];
      for (const requiredRole of approvalRoleCandidates) {
        // Missing exact roles are always filled first. Once all roles are
        // represented, a declared higher quorum may reuse one of those roles,
        // but only through another distinct canonical human.

        try {
          await verifyHumanApproval(input.principal, {
            makerUserId: workflow.requestedBy,
            requiredRole,
            permission: "ai:workflow.approve",
            target,
            payloadDigest: planDigest,
            expectedPayloadDigest: computeWorkflowPlanDigest({ version: workflow.planVersion, target, steps: workflow.plan }),
            version: workflow.planVersion,
            expectedVersion: workflow.planVersion,
            expiresAt,
          });
          approverRole = requiredRole;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }
      if (!approverRole) {
        const reason = lastError?.message ?? "No unfulfilled exact approver role is live on the workflow target.";
        await db.transaction(async (rawTx) => workflowAudit(rawTx as unknown as typeof db, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.authorize",
          workflowId: workflow.id,
          traceId: input.traceId,
          outcome: "DENIED",
          reason,
        }));
        return { workflowId: workflow.id, status: "WAITING_FOR_HUMAN_AUTHORITY", code: "AUTHORIZATION_DENIED", reason, approvalId: workflow.approvalId };
      }

      const approvalId = newId(ID_PREFIX.approval);
      const distinctHumans = new Set(existingDistinctHumans);
      distinctHumans.add(input.principal.userId);
      const rolesAfter = new Set(approvedRoles).add(approverRole);
      const allRolesMet = workflow.requiredApproverRoles.every((role) => rolesAfter.has(role));
      const quorumMet = distinctHumans.size >= quorumTarget;
      const fullyAuthorized = allRolesMet && quorumMet;

      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.insert(approvals).values({
          id: approvalId,
          tenantId: workflow.tenantId,
          objectType: "NOELIA_WORKFLOW",
          objectId: workflow.id,
          step: existingApprovals.length + 1,
          approverRole,
          decision: "APPROVED",
          approverUserId: input.principal.userId,
          decidedAt: new Date(),
          requestedBy: workflow.requestedBy,
          comment: input.comment ?? "Workflow authorized by accountable human.",
          validUntil: expiresAt,
          quorum: quorumTarget,
          delegatedFrom: input.delegatedFrom ?? null,
          payloadDigest: planDigest,
          payloadVersion: workflow.planVersion,
          targetTenantId: target.tenantId,
          targetLegalEntityId: target.legalEntityId,
          targetCountryCode: target.countryCode,
          mfaVerified: true,
        });
        await tx.update(noeliaWorkflows).set({
          status: fullyAuthorized ? "AUTHORIZED" : "WAITING_FOR_HUMAN_AUTHORITY",
          approvingHumanId: fullyAuthorized ? input.principal.userId : null,
          approvalId,
        }).where(and(
          eq(noeliaWorkflows.id, workflow.id),
          eq(noeliaWorkflows.status, workflow.status),
          eq(noeliaWorkflows.planDigest, planDigest),
        ));
        await workflowAudit(tx, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.authorize",
          workflowId: workflow.id,
          traceId: input.traceId,
          reason: fullyAuthorized
            ? "Exact-role workflow approvals and quorum are complete; execution remains a separate governed step."
            : `Partial approval recorded (${distinctHumans.size}/${quorumTarget}); all required roles and quorum must approve.`,
          approvalRef: approvalId,
          newValue: {
            requestingHuman: workflow.requestedBy,
            approvingHuman: input.principal.userId,
            approverRole,
            requiredApproverRoles: workflow.requiredApproverRoles,
            quorum: quorumTarget,
            validUntil: expiresAt.toISOString(),
            planDigest,
            planVersion: workflow.planVersion,
            target,
          },
        });
      });
      return {
        workflowId: workflow.id,
        status: fullyAuthorized ? "AUTHORIZED" : "WAITING_FOR_HUMAN_AUTHORITY",
        code: fullyAuthorized ? "AUTHORIZED" : "QUORUM_PARTIAL",
        reason: fullyAuthorized
          ? "Workflow authorized; no step has executed yet."
          : `Approval recorded; ${distinctHumans.size}/${quorumTarget} distinct approvers and all exact roles are required.`,
        approvalId,
      };
    });
  }

  /** EXECUTE → durable step checkpoints with one atomic execution claim. */
  async execute(input: {
    principal: Principal;
    registry: NoeliaToolRegistry;
    workflowId: string;
    traceId: string;
  }): Promise<NoeliaWorkflowResult> {
    const claimed = await withTenantDatabaseContext(input.principal, async () => {
      const { scope } = await this.scopeFor(input.principal);
      await db.execute(sql`select id from noelia_workflows where id = ${input.workflowId} for update`);
      const [workflow] = await db.select().from(noeliaWorkflows).where(and(
        eq(noeliaWorkflows.id, input.workflowId),
        inArray(noeliaWorkflows.tenantId, scope.tenantIds),
      )).limit(1);
      if (!workflow) {
        return { result: { workflowId: input.workflowId, status: "PLANNED", code: "NOT_FOUND", reason: "Workflow not found in scope.", approvalId: null } as NoeliaWorkflowResult };
      }
      const binding = verifiedWorkflowBinding(workflow);
      if (!binding) {
        return { result: { workflowId: workflow.id, status: "STOPPED", code: "PLAN_DIGEST_MISMATCH", reason: "Workflow target or ordered plan changed after approval.", approvalId: workflow.approvalId } as NoeliaWorkflowResult };
      }
      const { target, planDigest } = binding;
      const runAccess = can(input.principal, "ai:workflow.run", {
        tenantId: target.tenantId,
        entityId: target.legalEntityId,
        countryCode: target.countryCode,
      });
      if (!runAccess.allowed || workflow.requestedBy !== input.principal.userId) {
        return { result: { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "EXECUTION_DENIED", reason: !runAccess.allowed ? runAccess.reason : "Only the canonical requesting human may execute this workflow.", approvalId: workflow.approvalId } as NoeliaWorkflowResult };
      }
      const approvalRows = workflow.approvalRequired
        ? await db.select().from(approvals).where(and(
            eq(approvals.objectType, "NOELIA_WORKFLOW"),
            eq(approvals.objectId, workflow.id),
            eq(approvals.decision, "APPROVED"),
            eq(approvals.payloadDigest, planDigest),
            eq(approvals.payloadVersion, workflow.planVersion),
          ))
        : [];
      const staleRunningClaim = workflow.status === "RUNNING" && (
        !workflow.executionClaimId ||
        !workflow.executionLeaseExpiresAt ||
        workflow.executionLeaseExpiresAt.getTime() <= Date.now()
      );
      if (workflow.status === "RUNNING" && !staleRunningClaim) {
        return { result: { workflowId: workflow.id, status: "RUNNING", code: "EXECUTION_ALREADY_CLAIMED", reason: "Another executor holds the live workflow lease; duplicate effects were prevented.", approvalId: workflow.approvalId } as NoeliaWorkflowResult };
      }
      if (workflow.status === "WAITING_FOR_HUMAN_AUTHORITY" && workflow.approvalRequired) {
        const liveRows = approvalRows.filter((row) => !row.revokedAt && row.validUntil && row.validUntil.getTime() > Date.now());
        const distinctHumans = new Set(liveRows.map((row) => row.approverUserId).filter(Boolean));
        const quorum = Math.max(workflow.requiredApproverRoles.length, ...approvalRows.map((row) => row.quorum ?? 1));
        return {
          result: {
            workflowId: workflow.id,
            status: "WAITING_FOR_HUMAN_AUTHORITY",
            code: "QUORUM_NOT_MET",
            reason: `Workflow remains human-governed: ${distinctHumans.size}/${quorum} distinct live approvals are present.`,
            approvalId: workflow.approvalId,
          } as NoeliaWorkflowResult,
        };
      }
      if (workflow.status !== "AUTHORIZED" && !staleRunningClaim) {
        return { result: { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "EXECUTION_DENIED", reason: `Workflow is ${workflow.status}; only AUTHORIZED work or a provably stale RUNNING lease can be claimed.`, approvalId: workflow.approvalId } as NoeliaWorkflowResult };
      }

      if (workflow.approvalRequired) {
        const liveRows = approvalRows.filter((row) => !row.revokedAt && row.validUntil && row.validUntil.getTime() > Date.now());
        const roles = new Set(liveRows.map((row) => row.approverRole));
        const distinctHumans = new Set(liveRows.map((row) => row.approverUserId).filter(Boolean));
        const quorum = Math.max(workflow.requiredApproverRoles.length, ...liveRows.map((row) => row.quorum ?? 1));
        const approvalsValid = workflow.requiredApproverRoles.every((role) => roles.has(role)) && distinctHumans.size >= quorum;
        if (!approvalsValid) {
          const hasExpiredApproval = approvalRows.some((row) =>
            !row.revokedAt && row.validUntil && row.validUntil.getTime() <= Date.now()
          );
          return {
            result: {
              workflowId: workflow.id,
              status: workflow.status as WorkflowStatus,
              code: hasExpiredApproval ? "EXPIRED_APPROVAL" : "APPROVAL_INVALID",
              reason: hasExpiredApproval
                ? "A previously approved exact-role decision expired before execution; expired authority has no effect."
                : "Exact-role approvals are missing, revoked, target-mismatched, or below quorum.",
              approvalId: workflow.approvalId,
            } as NoeliaWorkflowResult,
          };
        }
        for (const approval of liveRows) {
          if (!approval.approverUserId || !workflow.requiredApproverRoles.includes(approval.approverRole)) continue;
          await verifyRecordedHumanApproval({
            approverUserId: approval.approverUserId,
            mfaVerified: approval.mfaVerified,
            binding: {
              makerUserId: workflow.requestedBy,
              requiredRole: approval.approverRole,
              permission: "ai:workflow.approve",
              target,
              payloadDigest: approval.payloadDigest ?? "",
              expectedPayloadDigest: planDigest,
              version: approval.payloadVersion ?? 0,
              expectedVersion: workflow.planVersion,
              expiresAt: approval.validUntil!,
            },
          });
          if (
            approval.targetTenantId !== target.tenantId ||
            approval.targetLegalEntityId !== target.legalEntityId ||
            approval.targetCountryCode !== target.countryCode
          ) {
            return { result: { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "APPROVAL_TARGET_MISMATCH", reason: "Approval target does not match the immutable workflow target.", approvalId: workflow.approvalId } as NoeliaWorkflowResult };
          }
        }
      }

      const claimId = newId(ID_PREFIX.event);
      const leaseExpiresAt = new Date(Date.now() + workflow.timeoutMs + 30_000);
      const [claim] = await db.update(noeliaWorkflows).set({
        status: "RUNNING",
        executionClaimId: claimId,
        executionLeaseExpiresAt: leaseExpiresAt,
        startedAt: new Date(),
      }).where(and(
        eq(noeliaWorkflows.id, workflow.id),
        staleRunningClaim
          ? and(
              eq(noeliaWorkflows.status, "RUNNING"),
              sql`(${noeliaWorkflows.executionClaimId} is null or ${noeliaWorkflows.executionLeaseExpiresAt} is null or ${noeliaWorkflows.executionLeaseExpiresAt} <= now())`,
            )
          : eq(noeliaWorkflows.status, "AUTHORIZED"),
        eq(noeliaWorkflows.planDigest, planDigest),
      )).returning({ id: noeliaWorkflows.id });
      if (!claim) {
        return { result: { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "EXECUTION_ALREADY_CLAIMED", reason: "Another executor claimed this workflow; duplicate effects were prevented.", approvalId: workflow.approvalId } as NoeliaWorkflowResult };
      }
      const steps = await db.select().from(noeliaWorkflowSteps)
        .where(eq(noeliaWorkflowSteps.workflowId, workflow.id))
        .orderBy(noeliaWorkflowSteps.stepIndex);
      await workflowAudit(db, {
        tenantId: workflow.tenantId,
        actorUserId: input.principal.userId,
        action: "ai.noelia.workflow.execute",
        workflowId: workflow.id,
        traceId: input.traceId,
        reason: "Workflow execution atomically claimed; every durable step re-checks live stop and authorization state.",
        approvalRef: workflow.approvalId,
        newValue: { claimId, planDigest, target },
      });
      return { workflow, steps, scope, target, approval: approvalRows[0] ?? null, claimId };
    });
    if ("result" in claimed && claimed.result !== undefined) return claimed.result;

    const { workflow, steps, scope, target, approval, claimId } = claimed;
    const planSteps = new Map(workflow.plan.map((step) => [step.step, step]));
    const stepResults: Array<{ step: number; toolName: string; status: WorkflowStepStatus; code: string }> = [];
    let finalStatus: WorkflowStatus = "COMPLETED";
    let stopReason = "";
    const startedAt = Date.now();

    for (const step of steps) {
      if (step.status === "COMPLETED") {
        stepResults.push({ step: step.stepIndex, toolName: step.toolName, status: "COMPLETED", code: "CHECKPOINT_PRESENT" });
        continue;
      }
      const checkpoint = await withTenantDatabaseContext(input.principal, async () => {
        const [live] = await db.select().from(noeliaWorkflows).where(eq(noeliaWorkflows.id, workflow.id)).limit(1);
        if (!live || live.status !== "RUNNING" || live.executionClaimId !== claimId || live.cancellationRequested) {
          return { stopped: true as const, code: "HUMAN_STOP", reason: "A live human stop, cancellation, or claim revocation outranks queued execution." };
        }
        if (Date.now() - startedAt > workflow.timeoutMs || (live.executionLeaseExpiresAt && live.executionLeaseExpiresAt.getTime() <= Date.now())) {
          return { stopped: true as const, code: "TIMED_OUT", reason: `Workflow exceeded its ${workflow.timeoutMs}ms governed timeout or lease.` };
        }
        const boundStep = planSteps.get(step.stepIndex);
        const liveDefinition = input.registry.definition(step.toolName);
        if (
          !boundStep ||
          !liveDefinition ||
          boundStep.toolName !== step.toolName ||
          boundStep.capabilityId !== liveDefinition.metadata.stableId ||
          boundStep.toolVersion !== liveDefinition.metadata.version
        ) {
          await db.update(noeliaWorkflowSteps).set({
            status: "DENIED",
            policyDecision: "DENIED",
            denialCode: "CAPABILITY_BINDING_MISMATCH",
          }).where(eq(noeliaWorkflowSteps.id, step.id));
          return {
            stopped: true as const,
            code: "CAPABILITY_BINDING_MISMATCH",
            reason: `Step ${step.stepIndex} capability identity or version differs from the immutable approved plan.`,
          };
        }
        const context: ToolInvocationContext = {
          principal: input.principal,
          traceId: input.traceId,
          target,
          scope,
          approval: approval && approval.approverUserId
            ? { approvalId: approval.id, approvingHumanId: approval.approverUserId, actorType: "HUMAN", decision: "APPROVED" }
            : null,
        };
        const invocation = await input.registry.invoke(step.toolName, context, boundStep.input);
        const stepStatus: WorkflowStepStatus = invocation.allowed ? "COMPLETED" : "DENIED";
        await this.recordStep(workflow, step, invocation, input.traceId, stepStatus);
        await db.update(noeliaWorkflows).set({
          currentStep: step.stepIndex,
          executionLeaseExpiresAt: new Date(Date.now() + Math.max(30_000, workflow.timeoutMs - (Date.now() - startedAt))),
        }).where(and(
          eq(noeliaWorkflows.id, workflow.id),
          eq(noeliaWorkflows.status, "RUNNING"),
          eq(noeliaWorkflows.executionClaimId, claimId),
        ));
        return { stopped: false as const, invocation, stepStatus };
      });
      if (checkpoint.stopped) {
        finalStatus = checkpoint.code === "TIMED_OUT" ? "TIMED_OUT" : "STOPPED";
        stopReason = checkpoint.reason;
        if (checkpoint.code === "CAPABILITY_BINDING_MISMATCH") {
          stepResults.push({ step: step.stepIndex, toolName: step.toolName, status: "DENIED", code: checkpoint.code });
        }
        break;
      }
      stepResults.push({
        step: step.stepIndex,
        toolName: step.toolName,
        status: checkpoint.stepStatus,
        code: checkpoint.invocation.allowed ? "COMPLETED" : checkpoint.invocation.decision.code,
      });
      if (!checkpoint.invocation.allowed) {
        finalStatus = "STOPPED";
        stopReason = `Step ${step.stepIndex} (${step.toolName}) was denied: ${checkpoint.invocation.decision.code}.`;
        break;
      }
      if (checkpoint.invocation.output.humanReviewRequired) {
        finalStatus = "ESCALATED";
        stopReason = `Step ${step.stepIndex} (${step.toolName}) requires accountable-human review.`;
        break;
      }
    }

    await withTenantDatabaseContext(input.principal, async () => {
      if (finalStatus !== "COMPLETED") {
        await this.markSteps(workflow.id, steps, stepResults, input.traceId, "SKIPPED");
      }
      await db.update(noeliaWorkflows).set({
        status: finalStatus,
        completedAt: new Date(),
        executionLeaseExpiresAt: null,
        failureState: stopReason ? { reason: stopReason } : null,
      }).where(and(
        eq(noeliaWorkflows.id, workflow.id),
        eq(noeliaWorkflows.status, "RUNNING"),
        eq(noeliaWorkflows.executionClaimId, claimId),
      ));
      await workflowAudit(db, {
        tenantId: workflow.tenantId,
        actorUserId: input.principal.userId,
        action: "ai.noelia.workflow.execute",
        workflowId: workflow.id,
        traceId: input.traceId,
        outcome: finalStatus === "COMPLETED" ? "SUCCESS" : "FAILURE",
        reason: stopReason || "Workflow completed through durable, authorized step checkpoints.",
        approvalRef: workflow.approvalId,
        newValue: { finalStatus, stepsExecuted: stepResults.length, claimId },
      });
    });

    return {
      workflowId: workflow.id,
      status: finalStatus,
      code: finalStatus,
      reason: stopReason || "Workflow completed within its governed bounds.",
      approvalId: workflow.approvalId,
      stepResults,
    };
  }

  private async markSteps(
    workflowId: string,
    steps: Array<{ id: string; stepIndex: number; toolName: string; status: string }>,
    results: Array<{ step: number; toolName: string; status: WorkflowStepStatus; code: string }>,
    traceId: string,
    status: WorkflowStepStatus,
  ): Promise<void> {
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      const alreadyRecorded = new Set(results.map((result) => result.step));
      for (const step of steps) {
        if (step.status === "COMPLETED" || step.status === "ALLOWED" || alreadyRecorded.has(step.stepIndex)) continue;
        await tx.update(noeliaWorkflowSteps).set({ status }).where(eq(noeliaWorkflowSteps.id, step.id));
        results.push({ step: step.stepIndex, toolName: step.toolName, status, code: status });
      }
    });
  }

  private async recordStep(
    workflow: { id: string; tenantId: string; requestedBy: string },
    step: { id: string; stepIndex: number; toolName: string; status: string },
    invocation: Awaited<ReturnType<NoeliaToolRegistry["invoke"]>>,
    traceId: string,
    stepStatus: WorkflowStepStatus,
  ): Promise<void> {
    await db.transaction(async (rawTx) => {
      const tx2 = rawTx as unknown as typeof db;
      const executedAt = new Date();
      await tx2.update(noeliaWorkflowSteps).set({
        status: stepStatus,
        denialCode: invocation.allowed ? null : invocation.decision.code,
        output: invocation.allowed ? (invocation.output.metadata ?? {}) : null,
        observations: invocation.allowed ? { findings: invocation.output.findings ?? [] } : null,
        policyDecision: invocation.allowed ? "ALLOWED" : "DENIED",
        executedAt,
        durationMs: 1,
      }).where(eq(noeliaWorkflowSteps.id, step.id));
      await workflowAudit(tx2, {
        tenantId: workflow.tenantId,
        actorUserId: workflow.requestedBy,
        action: "ai.noelia.workflow.step",
        workflowId: workflow.id,
        traceId,
        outcome: stepStatus === "COMPLETED" ? "SUCCESS" : "DENIED",
        reason: invocation.allowed
          ? `Step ${step.stepIndex} (${step.toolName}) completed through its registered BEYU service.`
          : `Step ${step.stepIndex} (${step.toolName}) denied: ${invocation.decision.code}.`,
        newValue: { step: step.stepIndex, toolName: step.toolName, stepStatus },
      });
    });
  }

  /** CANCELLED: request cancellation; in-flight execution stops at the next step boundary. */
  async cancel(input: {
    principal: Principal;
    workflowId: string;
    traceId: string;
  }): Promise<NoeliaWorkflowResult> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { scope } = await this.scopeFor(input.principal);
      const [workflow] = await db.select().from(noeliaWorkflows).where(and(
        eq(noeliaWorkflows.id, input.workflowId),
        inArray(noeliaWorkflows.tenantId, scope.tenantIds),
      )).limit(1);
      if (!workflow) return { workflowId: input.workflowId, status: "PLANNED", code: "NOT_FOUND", reason: "Workflow not found in scope.", approvalId: null };
      const binding = verifiedWorkflowBinding(workflow);
      if (!binding) {
        return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "PLAN_DIGEST_MISMATCH", reason: "Workflow stop target lacks an immutable canonical binding.", approvalId: workflow.approvalId };
      }
      const { target } = binding;
      try {
        await verifyHumanControlCommand(input.principal, "ai:workflow.run", target);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "PERMISSION_DENIED", reason, approvalId: workflow.approvalId };
      }
      const terminal = ["COMPLETED", "STOPPED", "ESCALATED", "TIMED_OUT", "CANCELLED", "FAILED"].includes(workflow.status);
      if (terminal) {
        return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "ALREADY_TERMINAL", reason: `Workflow is terminal (${workflow.status}) and terminal state is immutable.`, approvalId: workflow.approvalId };
      }
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.update(noeliaWorkflows).set({
          cancellationRequested: true,
          status: "STOPPED",
          completedAt: new Date(),
          executionLeaseExpiresAt: null,
          failureState: { reason: "Stopped by an authorized human control command." },
        }).where(eq(noeliaWorkflows.id, workflow.id));
        await workflowAudit(tx, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.cancel",
          workflowId: workflow.id,
          traceId: input.traceId,
          reason: "Authorized human stop recorded; queued steps, retries and recovery are denied.",
        });
      });
      return { workflowId: workflow.id, status: "STOPPED", code: "HUMAN_STOPPED", reason: "Human stop recorded; no further workflow step may begin. Completed external effects are not claimed to be rolled back.", approvalId: workflow.approvalId };
    });
  }

  /** Read a workflow with its steps (scoped). */
  async get(input: { principal: Principal; workflowId: string }): Promise<{
    workflow: typeof noeliaWorkflows.$inferSelect;
    steps: Array<typeof noeliaWorkflowSteps.$inferSelect>;
  } | null> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { scope } = await this.scopeFor(input.principal);
      const [workflow] = await db.select().from(noeliaWorkflows).where(and(
        eq(noeliaWorkflows.id, input.workflowId),
        inArray(noeliaWorkflows.tenantId, scope.tenantIds),
      )).limit(1);
      if (!workflow) return null;
      const steps = await db.select().from(noeliaWorkflowSteps)
        .where(eq(noeliaWorkflowSteps.workflowId, workflow.id))
        .orderBy(noeliaWorkflowSteps.stepIndex);
      return { workflow, steps };
    });
  }
}
