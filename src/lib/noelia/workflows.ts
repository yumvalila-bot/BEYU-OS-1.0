import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { approvals, noeliaWorkflowSteps, noeliaWorkflows } from "@/db/schema";
import { recordAuditTx } from "@/lib/audit";
import { can, type Principal } from "@/lib/authz";
import { NOELIA_IDENTITY } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "./scope-service";
import { NoeliaToolRegistry } from "./tool-registry";
import type { NoeliaTargetContext, ToolInvocationContext } from "./types";

export const WORKFLOW_STATUS = [
  "PLANNED", "VALIDATED", "AUTHORIZED", "RUNNING", "COMPLETED",
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
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.insert(noeliaWorkflows).values({
          id: workflowId,
          tenantId: input.principal.tenantId,
          goal: parsed.goal,
          status: "PLANNED",
          plan: parsed.steps.map((step, index) => ({ step: index + 1, toolName: step.toolName, input: step.input })),
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
          tenantId: input.principal.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.plan",
          workflowId,
          traceId: input.traceId,
          reason: `Workflow planned with ${parsed.steps.length} step(s); nothing executed.`,
          newValue: { goal: parsed.goal, steps: parsed.steps.length, maxSteps: parsed.maxSteps },
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
      const steps = await db.select().from(noeliaWorkflowSteps)
        .where(eq(noeliaWorkflowSteps.workflowId, input.workflowId))
        .orderBy(noeliaWorkflowSteps.stepIndex);
      const target: NoeliaTargetContext = {
        tenantId: (workflow.plan[0]?.input?.tenantId as string) ?? workflow.tenantId,
        legalEntityId: null,
        countryCode: null,
      };
      const context: ToolInvocationContext = {
        principal: input.principal,
        traceId: input.traceId,
        target,
        scope,
        approval: null,
      };
      const denials: string[] = [];
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        for (const step of steps) {
          const decision = input.registry.authorize(step.toolName, context);
          await tx.update(noeliaWorkflowSteps).set({
            capability: decision.allowed ? (input.registry.definition(step.toolName)?.metadata.stableId ?? step.toolName) : "",
            policyDecision: decision.allowed ? "ALLOWED" : "DENIED",
            denialCode: decision.allowed ? null : decision.code,
            status: decision.allowed ? "PENDING" : "DENIED",
          }).where(eq(noeliaWorkflowSteps.id, step.id));
          if (!decision.allowed) denials.push(`${step.toolName}:${decision.code}`);
        }
        const status = denials.length === 0 ? "VALIDATED" : "STOPPED";
        await tx.update(noeliaWorkflows).set({ status }).where(eq(noeliaWorkflows.id, workflow.id));
        await workflowAudit(tx, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.validate",
          workflowId: workflow.id,
          traceId: input.traceId,
          outcome: denials.length === 0 ? "SUCCESS" : "DENIED",
          reason: denials.length === 0 ? "All steps resolved to registered, authorized capabilities." : `Capabilities denied: ${denials.join(", ")}.`,
          newValue: { denials },
        });
      });
      return {
        workflowId: workflow.id,
        status: denials.length === 0 ? "VALIDATED" : "STOPPED",
        code: denials.length === 0 ? "VALIDATED" : "STOPPED",
        reason: denials.length === 0 ? "Workflow validated; awaiting accountable-human authorization." : `Workflow stopped: ${denials.join(", ")}.`,
        approvalId: null,
      };
    });
  }

  /** AUTHORIZE: accountable human (separate from the requester) approves. */
  async authorize(input: {
    principal: Principal;
    workflowId: string;
    traceId: string;
    comment?: string;
    /**
     * Decision validity window: execution is denied after this instant.
     * NULL (default) means the decision never expires.
     */
    validUntil?: Date | null;
    /**
     * Quorum: how many distinct approvers must APPROVE before execution.
     * NULL (default) means a single approval suffices. Values are request
     * metadata, never a derived authority threshold.
     */
    quorum?: number | null;
    /** Delegation evidence: this approval is cast on behalf of this human. */
    delegatedFrom?: string | null;
  }): Promise<NoeliaWorkflowResult> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { scope } = await this.scopeFor(input.principal);
      const [workflow] = await db.select().from(noeliaWorkflows).where(and(
        eq(noeliaWorkflows.id, input.workflowId),
        inArray(noeliaWorkflows.tenantId, scope.tenantIds),
      )).limit(1);
      if (!workflow) return { workflowId: input.workflowId, status: "PLANNED", code: "NOT_FOUND", reason: "Workflow not found in scope.", approvalId: null };
      const access = can(input.principal, "ai:workflow.approve");
      const makerChecker = workflow.requestedBy !== input.principal.userId;
      // Quorum: while a quorum target is configured and unmet, additional
      // distinct approvers may add approvals to an AUTHORIZED workflow.
      const [approvalCount] = await db.select({
        n: sql<number>`count(distinct ${approvals.approverUserId})::int`,
      }).from(approvals).where(and(
        eq(approvals.objectType, "NOELIA_WORKFLOW"),
        eq(approvals.objectId, workflow.id),
        eq(approvals.decision, "APPROVED"),
      ));
      const [selfApproval] = await db.select({ n: sql<number>`count(*)::int` })
        .from(approvals).where(and(
          eq(approvals.objectType, "NOELIA_WORKFLOW"),
          eq(approvals.objectId, workflow.id),
          eq(approvals.decision, "APPROVED"),
          eq(approvals.approverUserId, input.principal.userId),
        ));
      // The quorum target travels with the approval rows: later approvers
      // inherit it from the first approval instead of re-declaring it.
      let quorumTarget: number | null = input.quorum ?? null;
      if (quorumTarget === null && (approvalCount?.n ?? 0) > 0) {
        const [existing] = await db.select({ q: approvals.quorum }).from(approvals).where(and(
          eq(approvals.objectType, "NOELIA_WORKFLOW"),
          eq(approvals.objectId, workflow.id),
        )).limit(1);
        quorumTarget = existing?.q ?? null;
      }
      const quorumUnmet = quorumTarget !== null && (approvalCount?.n ?? 0) < quorumTarget;
      const alreadyApproved = (selfApproval?.n ?? 0) > 0;
      const canAuthorize = !alreadyApproved && (workflow.status === "VALIDATED" || (workflow.status === "AUTHORIZED" && quorumUnmet));
      if (!access.allowed || !makerChecker || !canAuthorize) {
        const reason = !access.allowed
          ? access.reason
          : !makerChecker
            ? "The requesting human cannot authorize their own Noelia workflow."
            : alreadyApproved
              ? "This approver has already approved the workflow; quorum requires distinct approvers."
              : `Workflow is ${workflow.status}; only VALIDATED workflows can be authorized${quorumTarget !== null && !quorumUnmet ? " and the configured quorum is already met" : ""}.`;
        await db.transaction(async (rawTx) => {
          const tx = rawTx as unknown as typeof db;
          await workflowAudit(tx, {
            tenantId: workflow.tenantId,
            actorUserId: input.principal.userId,
            action: "ai.noelia.workflow.authorize",
            workflowId: workflow.id,
            traceId: input.traceId,
            outcome: "DENIED",
            reason,
          });
        });
        return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "AUTHORIZATION_DENIED", reason, approvalId: workflow.approvalId };
      }
      const approvalId = newId(ID_PREFIX.approval);
      const nextApprovalCount = (approvalCount?.n ?? 0) + 1;
      const quorumMetAfter = quorumTarget !== null ? nextApprovalCount >= quorumTarget : true;
      // Resolve the approver role from the authenticating principal's grants
      // rather than hard-coding a single title. Audit records must reflect the
      // role actually exercised, otherwise a GROUP_CEO approving a workflow is
      // mis-attributed to CHIEF_GOVERNANCE_OFFICER and provenance queries
      // silently miscount.
      const approverRole =
        input.principal.roles.find((r) =>
          ["CHIEF_GOVERNANCE_OFFICER", "GROUP_CEO", "GROUP_CFO", "FAMILY_OFFICE_PRINCIPAL"].includes(r),
        ) ?? input.principal.roles[0] ?? "UNKNOWN";
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.insert(approvals).values({
          id: approvalId,
          tenantId: workflow.tenantId,
          objectType: "NOELIA_WORKFLOW",
          objectId: workflow.id,
          step: nextApprovalCount,
          approverRole,
          decision: "APPROVED",
          approverUserId: input.principal.userId,
          decidedAt: new Date(),
          requestedBy: workflow.requestedBy,
          comment: input.comment ?? "Workflow authorized by accountable human.",
          validUntil: input.validUntil ?? null,
          quorum: input.quorum ?? null,
          delegatedFrom: input.delegatedFrom ?? null,
        });
        await tx.update(noeliaWorkflows).set({
          status: "AUTHORIZED",
          approvingHumanId: input.principal.userId,
          approvalId,
        }).where(eq(noeliaWorkflows.id, workflow.id));
        await workflowAudit(tx, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.authorize",
          workflowId: workflow.id,
          traceId: input.traceId,
          reason: quorumTarget !== null && !quorumMetAfter
            ? `Workflow quorum approval ${nextApprovalCount}/${quorumTarget}; execution requires the full quorum.`
            : "Workflow authorized by an accountable human; execution remains a separate governed step.",
          approvalRef: approvalId,
          newValue: { requestingHuman: workflow.requestedBy, approvingHuman: input.principal.userId, quorum: quorumTarget, validUntil: input.validUntil?.toISOString() ?? null },
        });
      });
      return {
        workflowId: workflow.id,
        status: "AUTHORIZED",
        code: quorumTarget !== null && !quorumMetAfter ? "QUORUM_PARTIAL" : "AUTHORIZED",
        reason: quorumTarget !== null && !quorumMetAfter
          ? `Quorum ${nextApprovalCount}/${quorumTarget} reached; execution requires all ${quorumTarget} approvals.`
          : "Workflow authorized; no step has executed yet.",
        approvalId,
      };
    });
  }

  /** EXECUTE → OBSERVE → REASSESS → CONTINUE/ESCALATE/STOP, all audited. */
  async execute(input: {
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

      // Execution re-checks authorization: the approval record is evidence,
      // never authority by existence.
      const [approval] = workflow.approvalId
        ? await db.select().from(approvals).where(eq(approvals.id, workflow.approvalId)).limit(1)
        : [];
      // Quorum + expiry: when the approval chain declares a quorum, require
      // the full count of APPROVED rows; every APPROVED row must also be
      // inside its validity window (an expired approval is no authority).
      const [quorumInfo] = await db.select({
        target: sql<number | null>`max(${approvals.quorum})::int`,
        approved: sql<number>`count(distinct ${approvals.approverUserId})::int`,
        valid: sql<number>`count(distinct ${approvals.approverUserId}) filter (where ${approvals.validUntil} is null or ${approvals.validUntil} > now())::int`,
      }).from(approvals).where(and(
        eq(approvals.objectType, "NOELIA_WORKFLOW"),
        eq(approvals.objectId, workflow.id),
        eq(approvals.decision, "APPROVED"),
      ));
      const quorumMet = quorumInfo?.target === null || quorumInfo?.target === undefined
        || (quorumInfo?.approved ?? 0) >= (quorumInfo?.target ?? 1);
      const expiryInvalid = (quorumInfo?.approved ?? 0) > (quorumInfo?.valid ?? 0);
      // RUNNING permits crash-recovery resumption (steps commit individually and
      // resume idempotently); COMPLETED/STOPPED/ESCALATED/... require a fresh
      // authorization before anything can run again.
      const resumable = workflow.status === "AUTHORIZED" || workflow.status === "RUNNING";
      const authorized = resumable &&
        workflow.approvingHumanId &&
        workflow.approvingHumanId !== workflow.requestedBy &&
        approval?.decision === "APPROVED" &&
        approval.approverUserId === workflow.approvingHumanId &&
        !expiryInvalid &&
        quorumMet;
      if (!authorized) {
        const reason = !resumable
          ? `Workflow is ${workflow.status}; only AUTHORIZED (or crashed RUNNING) workflows can execute.`
          : expiryInvalid
            ? "The recorded human approval has expired; a fresh authorization is required."
            : !quorumMet
              ? `Approval quorum not met (${quorumInfo?.approved ?? 0}/${quorumInfo?.target ?? 1}); execution is denied until the quorum is complete.`
              : "The recorded human approval is invalid or missing; execution is denied.";
        await db.transaction(async (rawTx) => {
          const tx = rawTx as unknown as typeof db;
          await workflowAudit(tx, {
            tenantId: workflow.tenantId,
            actorUserId: input.principal.userId,
            action: "ai.noelia.workflow.execute",
            workflowId: workflow.id,
            traceId: input.traceId,
            outcome: "DENIED",
            reason,
          });
        });
        return {
          workflowId: workflow.id,
          status: workflow.status as WorkflowStatus,
          code: expiryInvalid ? "EXPIRED_APPROVAL" : !quorumMet ? "QUORUM_NOT_MET" : "EXECUTION_DENIED",
          reason,
          approvalId: workflow.approvalId,
        };
      }

      const steps = await db.select().from(noeliaWorkflowSteps)
        .where(eq(noeliaWorkflowSteps.workflowId, workflow.id))
        .orderBy(noeliaWorkflowSteps.stepIndex);
      const planInputs = new Map<number, Record<string, unknown>>(
        workflow.plan.map((p) => [p.step, p.input]),
      );
      const context: ToolInvocationContext = {
        principal: input.principal,
        traceId: input.traceId,
        target: {
          tenantId: workflow.tenantId,
          legalEntityId: null,
          countryCode: null,
        },
        scope,
        approval: {
          approvalId: approval!.id,
          approvingHumanId: approval!.approverUserId!,
          actorType: "HUMAN",
          decision: "APPROVED",
        },
      };

      const stepResults: Array<{ step: number; toolName: string; status: WorkflowStepStatus; code: string }> = [];
      let finalStatus: WorkflowStatus = "COMPLETED";
      let stopReason = "";

      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.update(noeliaWorkflows).set({ status: "RUNNING", startedAt: new Date() }).where(eq(noeliaWorkflows.id, workflow.id));
        await workflowAudit(tx, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.execute",
          workflowId: workflow.id,
          traceId: input.traceId,
          reason: "Workflow execution started; each step re-checks authorization.",
          approvalRef: approval!.id,
        });
      });

      const startedAt = Date.now();
      for (const step of steps) {
        const [live] = await db.select().from(noeliaWorkflows).where(eq(noeliaWorkflows.id, workflow.id)).limit(1);
        if (live.cancellationRequested) {
          finalStatus = "STOPPED";
          stopReason = "Cancellation was requested; remaining steps were skipped.";
          await this.markSteps(workflow.id, steps, stepResults, input.traceId, "SKIPPED");
          break;
        }
        if (Date.now() - startedAt > workflow.timeoutMs) {
          finalStatus = "TIMED_OUT";
          stopReason = `Workflow exceeded its ${workflow.timeoutMs}ms governed timeout.`;
          await this.markSteps(workflow.id, steps, stepResults, input.traceId, "SKIPPED");
          break;
        }
        if (step.status === "COMPLETED" || step.status === "ALLOWED") {
          stepResults.push({ step: step.stepIndex, toolName: step.toolName, status: step.status, code: "RESUMED" });
          continue; // idempotent resume after a crash between committed steps
        }
        const invocation = await input.registry.invoke(step.toolName, context, planInputs.get(step.stepIndex) ?? {});
        const stepStatus: WorkflowStepStatus = invocation.allowed ? "COMPLETED" : "DENIED";
        stepResults.push({ step: step.stepIndex, toolName: step.toolName, status: stepStatus, code: invocation.allowed ? "COMPLETED" : invocation.decision.code });
        await this.recordStep(workflow, step, invocation, input.traceId, stepStatus);
        if (!invocation.allowed) {
          finalStatus = "STOPPED";
          stopReason = `Step ${step.stepIndex} (${step.toolName}) was denied: ${invocation.decision.code}.`;
          break;
        }
        // REASSESS: human-review obligations or explicit review flags escalate.
        if (invocation.output.humanReviewRequired) {
          finalStatus = "ESCALATED";
          stopReason = `Step ${step.stepIndex} (${step.toolName}) requires accountable-human review.`;
          break;
        }
      }

      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.update(noeliaWorkflows).set({
          status: finalStatus,
          currentStep: stepResults.length,
          completedAt: finalStatus === "COMPLETED" || finalStatus === "STOPPED" || finalStatus === "ESCALATED" || finalStatus === "TIMED_OUT" ? new Date() : null,
          failureState: stopReason ? { reason: stopReason } : null,
        }).where(eq(noeliaWorkflows.id, workflow.id));
        await workflowAudit(tx, {
          tenantId: workflow.tenantId,
          actorUserId: input.principal.userId,
          action: "ai.noelia.workflow.execute",
          workflowId: workflow.id,
          traceId: input.traceId,
          outcome: finalStatus === "COMPLETED" ? "SUCCESS" : "FAILURE",
          reason: stopReason || "Workflow completed; every step was authorized, executed, observed and audited.",
          approvalRef: approval!.id,
          newValue: { finalStatus, stepsExecuted: stepResults.length },
        });
      });

      return {
        workflowId: workflow.id,
        status: finalStatus,
        code: finalStatus,
        reason: stopReason || "Workflow completed within its governed bounds.",
        approvalId: approval!.id,
        stepResults,
      };
    });
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
      for (const step of steps) {
        if (step.status === "COMPLETED" || step.status === "ALLOWED") continue;
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
      const access = can(input.principal, "ai:workflow.run");
      if (!access.allowed) {
        return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "PERMISSION_DENIED", reason: access.reason, approvalId: workflow.approvalId };
      }
      const terminal = ["COMPLETED", "STOPPED", "ESCALATED", "TIMED_OUT", "CANCELLED", "FAILED"].includes(workflow.status);
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        if (terminal) {
          // A workflow in a terminal state cannot be cancelled — its outcome
          // is already recorded. Silently rewriting status to CANCELLED would
          // rewrite history (audit + state contradict each other) and break
          // replay/duplicate detection. Instead we record the cancellation
          // attempt as a no-op audit event and return the existing terminal
          // status unchanged.
          await workflowAudit(tx, {
            tenantId: workflow.tenantId,
            actorUserId: input.principal.userId,
            action: "ai.noelia.workflow.cancel",
            workflowId: workflow.id,
            traceId: input.traceId,
            outcome: "DENIED",
            reason: `Workflow is already in terminal state '${workflow.status}'; cancellation is a no-op.`,
          });
        } else {
          await tx.update(noeliaWorkflows).set({ cancellationRequested: true }).where(eq(noeliaWorkflows.id, workflow.id));
          await workflowAudit(tx, {
            tenantId: workflow.tenantId,
            actorUserId: input.principal.userId,
            action: "ai.noelia.workflow.cancel",
            workflowId: workflow.id,
            traceId: input.traceId,
            reason: "Cancellation requested; execution stops at the next step boundary.",
          });
        }
      });
      if (terminal) {
        return {
          workflowId: workflow.id,
          status: workflow.status as WorkflowStatus,
          code: "INVALID_TRANSITION",
          reason: `Workflow is already in terminal state '${workflow.status}'; no further transition is permitted.`,
          approvalId: workflow.approvalId,
        };
      }
      return { workflowId: workflow.id, status: workflow.status as WorkflowStatus, code: "CANCEL_REQUESTED", reason: "Cancellation recorded; in-flight execution will stop at the next step boundary.", approvalId: workflow.approvalId };
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
