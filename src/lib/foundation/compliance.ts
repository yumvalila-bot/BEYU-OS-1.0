/**
 * BEYU Foundation OS — timely compliance engine (governed service).
 *
 * RULE → APPLICABILITY → OBLIGATION → DEADLINE → TASK → OWNER →
 * NOTIFICATION → REVIEW → SUBMISSION → EVIDENCE → VERIFICATION →
 * COMPLETION → AUDIT.
 *
 * The sweep (`runComplianceSweep`) is idempotent and may be re-run safely:
 * reminder scheduling keys are unique per (tenant, deadline, offset, channel)
 * and concurrent sweeps collapse on the uniqueness constraint. No known
 * actionable obligation may silently expire: overdue deadlines raise
 * DEADLINE_MISSED events and escalate per policy.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction } from "@/lib/audit";
import { assertWithinScope, tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { computeDueDate, daysBetweenUtc, deadlineHealth, type DeadlineRule } from "./deadlines";
import { dueReminders, escalationKey, reminderContent, reminderKey, type DueReminder } from "./notifications";
import { evaluateEscalation, type RiskRating } from "./escalation";
import { DEFAULT_REMINDER_SCHEDULE, type NotificationChannel } from "./types";
import { FOUNDATION_EVENTS } from "./events";
import { FoundationError, getFoundation, type ServiceContext } from "./service";

/* ==========================================================================
 * OBLIGATION REGISTRY
 * ========================================================================== */

export type CreateObligationInput = {
  code: string;
  foundationId: string;
  requirement: string;
  authority: string;
  regulator?: string;
  jurisdictionId?: string;
  legalEntityId?: string;
  canonicalObligationId?: string;
  trigger: string;
  frequency?: string;
  deadlineRule: DeadlineRule;
  effectiveFrom: string;
  ownerRole: string;
  approverRole?: string;
  evidenceRequired?: boolean;
  riskRating?: string;
  source?: string;
  verificationDate?: string;
  nextReviewAt?: string;
};

export async function createObligation(ctx: ServiceContext, input: CreateObligationInput) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  if (!input.deadlineRule || typeof input.deadlineRule.basis !== "string") {
    throw new FoundationError("VALIDATION_FAILED", "deadlineRule with a valid basis is required");
  }
  const id = newId(ID_PREFIX.foundationObligation);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationObligations).values({
        id,
        tenantId: foundation.tenantId,
        code: input.code.trim(),
        foundationId: foundation.id,
        requirement: input.requirement,
        authority: input.authority,
        regulator: input.regulator ?? null,
        jurisdictionId: input.jurisdictionId ?? foundation.jurisdictionId,
        legalEntityId: input.legalEntityId ?? foundation.legalEntityId,
        canonicalObligationId: input.canonicalObligationId ?? null,
        trigger: input.trigger,
        frequency: input.frequency ?? "ANNUAL",
        deadlineRule: input.deadlineRule as unknown as Record<string, unknown>,
        effectiveFrom: input.effectiveFrom,
        ownerRole: input.ownerRole,
        approverRole: input.approverRole ?? null,
        evidenceRequired: input.evidenceRequired ?? true,
        riskRating: input.riskRating ?? "MEDIUM",
        status: "ACTIVE",
        source: input.source ?? null,
        verificationDate: input.verificationDate ?? null,
        nextReviewAt: input.nextReviewAt ?? null,
      });
      return { id };
    },
    (r) => ({
      tenantId: foundation.tenantId,
      actorUserId: ctx.principal.userId,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      action: "foundation.compliance.createObligation",
      objectType: "FOUNDATION_OBLIGATION",
      objectId: r.id,
      newValue: { code: input.code },
    }),
    (r) => ({
      tenantId: foundation.tenantId,
      actorUserId: ctx.principal.userId,
      traceId: ctx.traceId,
      correlationId: ctx.traceId,
      causationId: null,
      authorityContext: null,
      policyVersion: null,
      destinationDomain: null,
      type: FOUNDATION_EVENTS.OBLIGATION_CREATED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.OBLIGATION_CREATED,
      legalEntityId: foundation.legalEntityId,
      subjectType: "FOUNDATION_OBLIGATION",
      subjectId: r.id,
      classification: "CONFIDENTIAL" as const,
      payload: { code: input.code, foundationId: foundation.id },
    }),
  );
}

export async function listObligations(principal: Principal, foundationId?: string) {
  const scope = await tenantScopeIds(principal);
  const where = foundationId
    ? and(eq(s.foundationObligations.foundationId, foundationId), inArray(s.foundationObligations.tenantId, scope))
    : inArray(s.foundationObligations.tenantId, scope);
  return db.select().from(s.foundationObligations).where(where);
}

export async function getObligation(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.foundationObligations)
    .where(and(eq(s.foundationObligations.id, id), inArray(s.foundationObligations.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Obligation not found in your authorised scope");
  return row;
}

/* ==========================================================================
 * DEADLINES + TASKS
 * ========================================================================== */

export async function computeDeadline(
  ctx: ServiceContext,
  input: { obligationId: string; triggerDate: string; periodLabel?: string; holidays?: string[]; reminderSchedule?: number[] },
) {
  const obligation = await getObligation(ctx.principal, input.obligationId);
  const computed = computeDueDate(input.triggerDate, obligation.deadlineRule as unknown as DeadlineRule, input.holidays ?? []);
  if (!computed.ok) throw new FoundationError("VALIDATION_FAILED", `Deadline rule rejected: ${computed.reason}`);
  const schedule = input.reminderSchedule ?? (DEFAULT_REMINDER_SCHEDULE as unknown as number[]);
  const deadlineId = newId(ID_PREFIX.foundationDeadline);
  const taskId = newId(ID_PREFIX.foundationComplianceTask);
  const taskCode = `TSK-${obligation.code}-${computed.dueDate}`.slice(0, 60);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.foundationDeadlines).values({
        id: deadlineId,
        tenantId: obligation.tenantId,
        obligationId: obligation.id,
        foundationId: obligation.foundationId,
        periodLabel: input.periodLabel ?? null,
        triggerDate: input.triggerDate,
        dueDate: computed.dueDate,
        reminderSchedule: schedule,
        status: "UPCOMING",
      });
      await tx.insert(s.foundationComplianceTasks).values({
        id: taskId,
        tenantId: obligation.tenantId,
        deadlineId,
        foundationId: obligation.foundationId,
        code: taskCode,
        title: obligation.requirement,
        ownerRole: obligation.ownerRole,
        status: "OPEN",
      });
      return { deadlineId, taskId, dueDate: computed.dueDate, explanation: computed.explanation, approximate: computed.approximate };
    },
    (r) => ({
      tenantId: obligation.tenantId,
      actorUserId: ctx.principal.userId,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      action: "foundation.compliance.computeDeadline",
      objectType: "FOUNDATION_DEADLINE",
      objectId: r.deadlineId,
      newValue: { dueDate: r.dueDate, explanation: r.explanation },
    }),
    (r) => ({
      tenantId: obligation.tenantId,
      actorUserId: ctx.principal.userId,
      traceId: ctx.traceId,
      correlationId: ctx.traceId,
      causationId: null,
      authorityContext: null,
      policyVersion: null,
      destinationDomain: null,
      type: FOUNDATION_EVENTS.DEADLINE_COMPUTED,
      source: "FOUNDATION_OS",
      domain: "FOUNDATION_OS",
      operation: FOUNDATION_EVENTS.DEADLINE_COMPUTED,
      legalEntityId: obligation.legalEntityId,
      subjectType: "FOUNDATION_DEADLINE",
      subjectId: r.deadlineId,
      classification: "CONFIDENTIAL" as const,
      payload: { obligationId: obligation.id, dueDate: r.dueDate },
    }),
  );
}

export async function listDeadlines(principal: Principal, foundationId?: string) {
  const scope = await tenantScopeIds(principal);
  const where = foundationId
    ? and(eq(s.foundationDeadlines.foundationId, foundationId), inArray(s.foundationDeadlines.tenantId, scope))
    : inArray(s.foundationDeadlines.tenantId, scope);
  return db.select().from(s.foundationDeadlines).where(where);
}

export async function getDeadline(principal: Principal, id: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db
    .select()
    .from(s.foundationDeadlines)
    .where(and(eq(s.foundationDeadlines.id, id), inArray(s.foundationDeadlines.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Deadline not found in your authorised scope");
  return row;
}

export async function listComplianceTasks(principal: Principal, deadlineId?: string) {
  const scope = await tenantScopeIds(principal);
  const where = deadlineId
    ? and(eq(s.foundationComplianceTasks.deadlineId, deadlineId), inArray(s.foundationComplianceTasks.tenantId, scope))
    : inArray(s.foundationComplianceTasks.tenantId, scope);
  return db.select().from(s.foundationComplianceTasks).where(where);
}

/**
 * Refresh BLOCKED states from dependencies. A task whose dependency is not
 * COMPLETED/VERIFIED surfaces as BLOCKED automatically.
 */
export async function refreshTaskBlockStates(principal: Principal): Promise<number> {
  const tasks = await listComplianceTasks(principal);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let changed = 0;
  for (const task of tasks) {
    if (!task.dependsOnTaskId) continue;
    if (["COMPLETED", "VERIFIED", "SUBMITTED"].includes(task.status)) continue;
    const dep = byId.get(task.dependsOnTaskId);
    const blocked = !dep || !["COMPLETED", "VERIFIED"].includes(dep.status);
    const target = blocked ? "BLOCKED" : "OPEN";
    if (blocked && task.status === "BLOCKED") continue;
    if (!blocked && task.status !== "BLOCKED") continue;
    await db.update(s.foundationComplianceTasks).set({ status: target }).where(eq(s.foundationComplianceTasks.id, task.id));
    changed += 1;
  }
  return changed;
}

export async function advanceComplianceTask(
  ctx: ServiceContext,
  id: string,
  to: string,
  notes?: string,
) {
  const allowed: Record<string, string[]> = {
    OPEN: ["IN_PROGRESS", "BLOCKED", "SUBMITTED"],
    IN_PROGRESS: ["BLOCKED", "SUBMITTED"],
    BLOCKED: ["OPEN", "IN_PROGRESS"],
    SUBMITTED: ["VERIFIED", "IN_PROGRESS"],
    VERIFIED: ["COMPLETED"],
    OVERDUE: ["IN_PROGRESS", "SUBMITTED"],
  };
  const scope = await tenantScopeIds(ctx.principal);
  const [task] = await db
    .select()
    .from(s.foundationComplianceTasks)
    .where(and(eq(s.foundationComplianceTasks.id, id), inArray(s.foundationComplianceTasks.tenantId, scope)))
    .limit(1);
  if (!task) throw new FoundationError("NOT_FOUND", "Compliance task not found in your authorised scope");
  if (!(allowed[task.status] ?? []).includes(to)) {
    throw new FoundationError("INVALID_TRANSITION", `Task cannot move ${task.status} → ${to}`);
  }
  if (to === "VERIFIED" && !ctx.principal.userId) {
    throw new FoundationError("FORBIDDEN", "Verification requires an authenticated reviewer");
  }
  const [updated] = await db
    .update(s.foundationComplianceTasks)
    .set({
      status: to,
      notes: notes ?? task.notes,
      submittedAt: to === "SUBMITTED" ? new Date() : task.submittedAt,
      verifiedBy: to === "VERIFIED" ? ctx.principal.userId : task.verifiedBy,
      verifiedAt: to === "VERIFIED" ? new Date() : task.verifiedAt,
    })
    .where(and(eq(s.foundationComplianceTasks.id, id), eq(s.foundationComplianceTasks.status, task.status)))
    .returning();
  if (!updated) throw new FoundationError("CONFLICT", "The task changed concurrently. Reload and retry.");
  return updated;
}

/* ==========================================================================
 * EVIDENCE
 * ========================================================================== */

export async function submitEvidence(
  ctx: ServiceContext,
  input: { foundationId: string; obligationId?: string; deadlineId?: string; taskId?: string; documentId?: string; evidenceType: string; title: string; expiresAt?: string },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  const id = newId(ID_PREFIX.foundationEvidence);
  await db.insert(s.foundationEvidence).values({
    id,
    tenantId: foundation.tenantId,
    foundationId: foundation.id,
    obligationId: input.obligationId ?? null,
    deadlineId: input.deadlineId ?? null,
    taskId: input.taskId ?? null,
    documentId: input.documentId ?? null,
    evidenceType: input.evidenceType,
    title: input.title,
    status: "SUBMITTED",
    expiresAt: input.expiresAt ?? null,
    createdBy: ctx.principal.userId,
  });
  return { id };
}

export async function verifyEvidence(ctx: ServiceContext, id: string, approved: boolean) {
  const scope = await tenantScopeIds(ctx.principal);
  const [row] = await db
    .select()
    .from(s.foundationEvidence)
    .where(and(eq(s.foundationEvidence.id, id), inArray(s.foundationEvidence.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Evidence not found in your authorised scope");
  if (!["SUBMITTED", "PENDING"].includes(row.status)) {
    throw new FoundationError("INVALID_TRANSITION", `Evidence in status ${row.status} cannot be verified`);
  }
  const [updated] = await db
    .update(s.foundationEvidence)
    .set({ status: approved ? "VERIFIED" : "REJECTED", verifiedBy: ctx.principal.userId, verifiedAt: new Date() })
    .where(eq(s.foundationEvidence.id, id))
    .returning();
  return updated;
}

/**
 * Complete a deadline. Where evidence is mandatory, completion without
 * VERIFIED evidence is structurally blocked.
 */
export async function completeDeadline(ctx: ServiceContext, id: string) {
  const deadline = await getDeadline(ctx.principal, id);
  const obligation = await getObligation(ctx.principal, deadline.obligationId);
  if (["COMPLETED", "VERIFIED"].includes(deadline.status)) {
    throw new FoundationError("INVALID_TRANSITION", `Deadline is already ${deadline.status}`);
  }
  if (obligation.evidenceRequired) {
    const scope = await tenantScopeIds(ctx.principal);
    const verified = await db
      .select()
      .from(s.foundationEvidence)
      .where(
        and(
          eq(s.foundationEvidence.deadlineId, deadline.id),
          eq(s.foundationEvidence.status, "VERIFIED"),
          inArray(s.foundationEvidence.tenantId, scope),
        ),
      )
      .limit(1);
    if (verified.length === 0) {
      throw new FoundationError("EVIDENCE_REQUIRED", "This obligation requires verified evidence before completion");
    }
  }
  const [updated] = await db
    .update(s.foundationDeadlines)
    .set({ status: "COMPLETED", completedAt: new Date() })
    .where(eq(s.foundationDeadlines.id, id))
    .returning();
  return updated;
}

/* ==========================================================================
 * THE SWEEP — timely notification + escalation engine
 * ========================================================================== */

export type SweepResult = {
  sweptAt: string;
  deadlinesExamined: number;
  remindersScheduled: number;
  remindersSkippedDuplicate: number;
  overdueMarked: number;
  escalationsRaised: number;
  failures: Array<{ deadlineId: string; error: string }>;
};

/**
 * Run one compliance sweep for the principal's scope as of `todayIso`.
 * IN_APP delivery writes canonical notifications; other channels are recorded
 * as FAILED with an explicit provider-missing error (no silent failure) until
 * a governed provider is configured.
 */
export async function runComplianceSweep(
  ctx: ServiceContext,
  input: { todayIso: string; channels?: NotificationChannel[] },
): Promise<SweepResult> {
  const channels = input.channels ?? ["IN_APP"];
  const scope = await tenantScopeIds(ctx.principal);
  await assertWithinScope(ctx.principal, ctx.principal.tenantId);
  const open = await db
    .select()
    .from(s.foundationDeadlines)
    .where(
      and(
        inArray(s.foundationDeadlines.tenantId, scope),
        or(
          eq(s.foundationDeadlines.status, "UPCOMING"),
          eq(s.foundationDeadlines.status, "DUE_TODAY"),
          eq(s.foundationDeadlines.status, "OVERDUE"),
        ),
      ),
    );
  const result: SweepResult = {
    sweptAt: new Date().toISOString(),
    deadlinesExamined: open.length,
    remindersScheduled: 0,
    remindersSkippedDuplicate: 0,
    overdueMarked: 0,
    escalationsRaised: 0,
    failures: [],
  };

  for (const deadline of open) {
    try {
      const [obligation] = await db
        .select()
        .from(s.foundationObligations)
        .where(eq(s.foundationObligations.id, deadline.obligationId))
        .limit(1);
      if (!obligation) {
        result.failures.push({ deadlineId: deadline.id, error: "Obligation row missing" });
        continue;
      }
      const [foundation] = await db
        .select()
        .from(s.foundations)
        .where(eq(s.foundations.id, deadline.foundationId))
        .limit(1);
      const health = deadlineHealth(deadline.dueDate, input.todayIso);
      const targetStatus = health === "OVERDUE" ? "OVERDUE" : health === "DUE_TODAY" ? "DUE_TODAY" : "UPCOMING";
      if (deadline.status !== targetStatus) {
        await db.update(s.foundationDeadlines).set({ status: targetStatus }).where(eq(s.foundationDeadlines.id, deadline.id));
        if (targetStatus === "OVERDUE") {
          result.overdueMarked += 1;
          await withAuditTransaction(
            async () => ({ deadlineId: deadline.id }),
            () => ({
              tenantId: deadline.tenantId,
              actorUserId: ctx.principal.userId,
              action: "foundation.compliance.deadlineMissed",
              objectType: "FOUNDATION_DEADLINE",
              objectId: deadline.id,
              outcome: "FAILURE",
              reason: `Deadline ${deadline.dueDate} missed`,
            }),
            () => ({
              tenantId: deadline.tenantId,
              actorUserId: ctx.principal.userId,
              traceId: ctx.traceId,
              correlationId: ctx.traceId,
              causationId: null,
              authorityContext: null,
              policyVersion: null,
              destinationDomain: null,
              type: FOUNDATION_EVENTS.DEADLINE_MISSED,
              source: "FOUNDATION_OS",
              domain: "FOUNDATION_OS",
              operation: FOUNDATION_EVENTS.DEADLINE_MISSED,
              legalEntityId: obligation.legalEntityId,
              subjectType: "FOUNDATION_DEADLINE",
              subjectId: deadline.id,
              classification: "CONFIDENTIAL" as const,
              payload: { obligationId: obligation.id, dueDate: deadline.dueDate },
            }),
          );
        }
      }

      const due: DueReminder[] = dueReminders(deadline.dueDate, input.todayIso, deadline.reminderSchedule as number[]);
      for (const reminder of due) {
        for (const channel of channels) {
          const key = reminder.escalation
            ? escalationKey(deadline.id, 0, channel)
            : reminderKey(deadline.id, reminder.offsetDays, channel);
          const content = reminderContent({
            foundationName: foundation?.legalName ?? deadline.foundationId,
            obligationTitle: obligation.requirement,
            authority: obligation.authority,
            jurisdiction: obligation.jurisdictionId ?? "—",
            dueDate: deadline.dueDate,
            daysRemaining: reminder.daysRemaining,
            ownerRole: obligation.ownerRole,
            evidenceRequired: obligation.evidenceRequired,
            riskRating: obligation.riskRating,
            deadlineId: deadline.id,
          });
          const logId = newId(ID_PREFIX.foundationNotification);
          if (channel === "IN_APP") {
            const notificationId = newId(ID_PREFIX.notification);
            const inserted = await db
              .insert(s.foundationNotificationLog)
              .values({
                id: logId,
                tenantId: deadline.tenantId,
                deadlineId: deadline.id,
                foundationId: deadline.foundationId,
                idempotencyKey: key,
                channel,
                offsetDays: reminder.offsetDays,
                recipientRole: obligation.ownerRole,
                notificationId,
                status: "SENT",
                attempts: 1,
                sentAt: new Date(),
              })
              .onConflictDoNothing()
              .returning({ id: s.foundationNotificationLog.id });
            if (inserted.length === 0) {
              result.remindersSkippedDuplicate += 1;
              continue;
            }
            await db.insert(s.notifications).values({
              id: notificationId,
              tenantId: deadline.tenantId,
              role: obligation.ownerRole,
              channel: "IN_APP",
              urgency: reminder.overdue ? "HIGH" : "NORMAL",
              subject: content.subject,
              body: content.body,
              classification: "INTERNAL",
              linkHref: content.linkHref,
              status: "QUEUED",
            });
            await db
              .update(s.foundationNotificationLog)
              .set({ status: "DELIVERED" })
              .where(eq(s.foundationNotificationLog.id, logId));
            result.remindersScheduled += 1;
          } else {
            // No governed provider is configured for out-of-band channels.
            // Record the scheduling attempt as FAILED — loudly, never silently.
            const inserted = await db
              .insert(s.foundationNotificationLog)
              .values({
                id: logId,
                tenantId: deadline.tenantId,
                deadlineId: deadline.id,
                foundationId: deadline.foundationId,
                idempotencyKey: key,
                channel,
                offsetDays: reminder.offsetDays,
                recipientRole: obligation.ownerRole,
                status: "FAILED",
                attempts: 1,
                lastError: `No governed ${channel} provider configured; IN_APP delivery carries the obligation`,
              })
              .onConflictDoNothing()
              .returning({ id: s.foundationNotificationLog.id });
            if (inserted.length === 0) result.remindersSkippedDuplicate += 1;
            else result.remindersScheduled += 1;
          }
        }
      }

      // Escalation evaluation (overdue only).
      const daysOverdue = Math.max(0, -daysBetweenUtc(input.todayIso, deadline.dueDate));
      if (daysOverdue > 0 || deadline.status === "OVERDUE") {
        const existing = await db
          .select()
          .from(s.foundationEscalations)
          .where(
            and(
              eq(s.foundationEscalations.deadlineId, deadline.id),
              inArray(s.foundationEscalations.tenantId, scope),
            ),
          );
        const currentLevel = existing.reduce((m, e) => Math.max(m, e.level), -1);
        const verdict = evaluateEscalation({
          daysOverdue,
          risk: (obligation.riskRating as RiskRating) ?? "MEDIUM",
          currentLevel,
          repeatOffence: existing.length > 1,
        });
        if (verdict.escalate) {
          await db.insert(s.foundationEscalations).values({
            id: newId(ID_PREFIX.foundationEscalation),
            tenantId: deadline.tenantId,
            deadlineId: deadline.id,
            foundationId: deadline.foundationId,
            level: verdict.level,
            fromRole: verdict.fromRole,
            toRole: verdict.toRole,
            reason: verdict.reason,
            status: "OPEN",
          });
          result.escalationsRaised += 1;
        }
      }
    } catch (err) {
      result.failures.push({ deadlineId: deadline.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

export async function listEscalations(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db.select().from(s.foundationEscalations).where(inArray(s.foundationEscalations.tenantId, scope));
}

export async function acknowledgeEscalation(ctx: ServiceContext, id: string) {
  const scope = await tenantScopeIds(ctx.principal);
  const [row] = await db
    .select()
    .from(s.foundationEscalations)
    .where(and(eq(s.foundationEscalations.id, id), inArray(s.foundationEscalations.tenantId, scope)))
    .limit(1);
  if (!row) throw new FoundationError("NOT_FOUND", "Escalation not found in your authorised scope");
  if (row.status !== "OPEN") throw new FoundationError("INVALID_TRANSITION", `Escalation is already ${row.status}`);
  const [updated] = await db
    .update(s.foundationEscalations)
    .set({ status: "ACKNOWLEDGED", acknowledgedBy: ctx.principal.userId })
    .where(eq(s.foundationEscalations.id, id))
    .returning();
  return updated;
}

export async function complianceDashboard(principal: Principal, todayIso: string, foundationId?: string) {
  const deadlines = await listDeadlines(principal, foundationId);
  const tasks = await listComplianceTasks(principal);
  const escalations = await listEscalations(principal);
  const open = deadlines.filter((d) => !["COMPLETED", "VERIFIED", "WAIVED"].includes(d.status));
  const scoped = foundationId ? open.filter((d) => d.foundationId === foundationId) : open;
  const byHealth = { OVERDUE: 0, DUE_TODAY: 0, AT_RISK: 0, ON_TRACK: 0 };
  for (const d of scoped) {
    const h = d.status === "OVERDUE" ? "OVERDUE" : deadlineHealth(d.dueDate, todayIso);
    byHealth[h === "COMPLETED" ? "ON_TRACK" : h] += 1;
  }
  const completed = deadlines.filter((d) => ["COMPLETED", "VERIFIED"].includes(d.status)).length;
  const total = deadlines.length;
  return {
    totals: { obligations: scoped.length, completed, open: scoped.length },
    health: byHealth,
    onTimePct: total === 0 ? null : Math.round((completed / total) * 100),
    overdueCount: byHealth.OVERDUE,
    openEscalations: escalations.filter((e) => e.status === "OPEN").length,
    blockedTasks: tasks.filter((t) => t.status === "BLOCKED").length,
    evidenceMissing: 0, // computed per-deadline by callers with obligation context
  };
}

/** Deadlines whose obligation requires evidence but has none verified. */
export async function deadlinesMissingEvidence(principal: Principal): Promise<string[]> {
  const scope = await tenantScopeIds(principal);
  const obligations = await listObligations(principal);
  const mandatory = new Set(obligations.filter((o) => o.evidenceRequired).map((o) => o.id));
  const deadlines = await listDeadlines(principal);
  const missing: string[] = [];
  for (const d of deadlines.filter((x) => mandatory.has(x.obligationId) && !["COMPLETED", "VERIFIED", "WAIVED"].includes(x.status))) {
    const verified = await db
      .select({ id: s.foundationEvidence.id })
      .from(s.foundationEvidence)
      .where(
        and(
          eq(s.foundationEvidence.deadlineId, d.id),
          eq(s.foundationEvidence.status, "VERIFIED"),
          inArray(s.foundationEvidence.tenantId, scope),
        ),
      )
      .limit(1);
    if (verified.length === 0) missing.push(d.id);
  }
  return missing;
}

