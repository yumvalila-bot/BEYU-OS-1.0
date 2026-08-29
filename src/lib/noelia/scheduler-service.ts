import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { noeliaScheduleRuns, noeliaSchedulerOffsets, noeliaSchedules, users, parties, tenants } from "@/db/schema";
import { recordAuditTx, publishEventTx } from "@/lib/audit";
import { type Principal } from "@/lib/authz";
import { NOELIA_SCHEDULER_IDENTITY } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import type { NoeliaHorizon } from "@/lib/constants";

export const SCHEDULE_CADENCE = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL", "HORIZON"] as const;

export const SCHEDULE_SCHEMA = z.object({
  code: z.string().min(3).max(64).regex(/^[A-Z0-9._-]+$/),
  cadence: z.enum(SCHEDULE_CADENCE),
  horizon: z.string().min(1).max(40),
  briefingFocus: z.string().min(1).max(120).default("STANDARD"),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).default("RESTRICTED"),
  targetTenantId: z.string().min(1),
  legalEntityId: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  nextRunAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  enabled: z.boolean().default(true),
}).strict();

export type NoeliaScheduleInput = z.infer<typeof SCHEDULE_SCHEMA>;

export type NoeliaScheduleResult = {
  scheduleId: string | null;
  code: string;
  status: "CREATED" | "SUSPENDED" | "CANCELLED" | "ACTIVE" | "DENIED" | "NOT_FOUND" | "FAILED";
  reason: string;
};

/**
 * Governed Noelia scheduler (section 17).
 *
 * Schedules are data. Nothing executes from an in-process timer: the canonical
 * OUTBOX is `enterprise_events`; a governed consumer (this service) processes
 * due schedules once per schedule/for (unique index), with idempotency, audit,
 * retry accounting and dead-letter evidence. Every scheduled run executes as
 * the schedule's recorded owner principal, reconstructed from the canonical
 * identity tables; tool authorization is re-checked per invocation, so a
 * revoked grant fails closed at run time.
 */
export class BeyuNoeliaSchedulerService {
  /** Reconstruct the schedule owner's principal through the canonical identity path. */
  private async principalForOwner(ownerUserId: string, tenantId: string): Promise<Principal | null> {
    const [row] = await db
      .select({
        userId: users.id,
        email: users.email,
        status: users.status,
        partyId: parties.id,
        displayName: parties.displayName,
        tenantCode: tenants.code,
        tenantType: tenants.type,
      })
      .from(users)
      .innerJoin(parties, eq(parties.id, users.partyId))
      .innerJoin(tenants, eq(tenants.id, users.primaryTenantId))
      .where(eq(users.id, ownerUserId))
      .limit(1);
    if (!row || row.status !== "ACTIVE") return null;
    const { loadGrants, permissionsForRoles, clearanceForRoles } = await import("@/lib/authz");
    const grants = await loadGrants(row.userId, tenantId);
    const roleCodes = [...new Set(grants.map((g) => g.code))];
    const entityScope = [...new Set(grants.map((g) => g.entityId).filter((v): v is string => Boolean(v)))];
    return {
      userId: row.userId,
      partyId: row.partyId,
      email: row.email,
      displayName: row.displayName,
      tenantId,
      tenantCode: row.tenantCode,
      tenantType: row.tenantType,
      roles: roleCodes,
      permissions: permissionsForRoles(roleCodes),
      clearance: clearanceForRoles(roleCodes),
      entityScope,
      mfaSatisfied: false,
      sessionId: "SYSTEM/NOELIA_SCHEDULER",
      riskScore: 0,
      emergencyPermissions: [],
    };
  }

  async create(input: {
    principal: Principal;
    schedule: NoeliaScheduleInput;
    traceId: string;
  }): Promise<NoeliaScheduleResult> {
    return withTenantDatabaseContext(input.principal, async () => {
      const parsed = SCHEDULE_SCHEMA.parse(input.schedule);
      const id = newId(ID_PREFIX.noeliaSchedule);
      const nextRunAt = new Date(parsed.nextRunAt);
      const ownerRole = input.principal.roles[0] ?? "UNKNOWN";
      try {
        await db.transaction(async (rawTx) => {
          const tx = rawTx as unknown as typeof db;
          await tx.insert(noeliaSchedules).values({
            id,
            code: parsed.code,
            cadence: parsed.cadence,
            tenantId: parsed.targetTenantId,
            legalEntityId: parsed.legalEntityId ?? null,
            countryCode: parsed.countryCode ?? null,
            horizon: parsed.horizon as NoeliaHorizon,
            briefingFocus: parsed.briefingFocus,
            classification: parsed.classification,
            enabled: parsed.enabled,
            ownerRole,
            nextRunAt,
            status: "ACTIVE",
            createdBy: input.principal.userId,
          });
          await recordAuditTx(tx, {
            tenantId: parsed.targetTenantId,
            actorUserId: input.principal.userId,
            actorType: "HUMAN",
            action: "ai.noelia.schedule.create",
            objectType: "NOELIA_SCHEDULE",
            objectId: id,
            reason: `Schedule ${parsed.code} registered (${parsed.cadence}).`,
            aiVersion: NOELIA_SCHEDULER_IDENTITY,
            traceId: input.traceId,
            newValue: { code: parsed.code, cadence: parsed.cadence, horizon: parsed.horizon, nextRunAt: nextRunAt.toISOString() },
          });
        });
        return { scheduleId: id, code: parsed.code, status: "CREATED", reason: "Schedule registered; nothing has run yet." };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail.includes("noelia_schedules_code_uidx")) {
          return { scheduleId: null, code: parsed.code, status: "DENIED", reason: "A schedule with this code already exists." };
        }
        return { scheduleId: null, code: parsed.code, status: "FAILED", reason: "The schedule could not be registered." };
      }
    });
  }

  /**
   * TICK — the ONLY scheduler entry point. Picks due, ACTIVE schedules and
   * writes one governed OUTBOX event per due (schedule, period) pair. No
   * in-process timer executes anything.
   */
  async emitDueRuns(input: { principal: Principal; traceId: string; limit?: number }): Promise<{ emitted: number }> {
    return withTenantDatabaseContext(input.principal, async () => {
      // Defense-in-depth tenant scoping. PostgreSQL RLS enforces the tenant
      // boundary at the row level for the runtime role, but the scheduler is
      // also reachable via the guarded HTTP route on any principal that holds
      // ai:schedule.manage; we must not rely on RLS alone — an admin/test role
      // bypassing RLS must not silently emit another tenant's schedules.
      const { tenantScopeIds } = await import("@/lib/tenant-scope");
      const tenantIds = await tenantScopeIds(input.principal);
      const now = new Date();
      const due = await db
        .select()
        .from(noeliaSchedules)
        .where(and(
          eq(noeliaSchedules.enabled, true),
          eq(noeliaSchedules.status, "ACTIVE"),
          lte(noeliaSchedules.nextRunAt, now),
          inArray(noeliaSchedules.tenantId, tenantIds),
        ))
        .orderBy(asc(noeliaSchedules.nextRunAt))
        .limit(Math.min(input.limit ?? 10, 50));
      let emitted = 0;
      for (const schedule of due) {
        const periodKey = schedule.nextRunAt.toISOString();
        await db.transaction(async (rawTx) => {
          const tx = rawTx as unknown as typeof db;
          await publishEventTx(tx, {
            type: "NOELIA_SCHEDULE_DUE",
            source: "beyu-os/ai",
            domain: "AI",
            operation: "SCHEDULE_TICK",
            destinationDomain: null,
            tenantId: schedule.tenantId,
            legalEntityId: schedule.legalEntityId,
            subjectType: "NOELIA_SCHEDULE",
            subjectId: schedule.id,
            actorUserId: input.principal.userId,
            actorType: "AI",
            classification: schedule.classification,
            payload: { scheduleId: schedule.id, code: schedule.code, periodKey, horizon: schedule.horizon, briefingFocus: schedule.briefingFocus },
            traceId: input.traceId,
            correlationId: input.traceId,
            causationId: null,
            authorityContext: { authorityId: null, decisionId: null, capabilityCode: "cap-scheduler-tick", permissionCode: "ai:schedule.manage", policyVersion: null },
            policyVersion: null,
          });
        });
        emitted += 1;
      }
      return { emitted };
    });
  }

  /**
   * CONSUMER — idempotent per (schedule, period): a run row is inserted ONCE
   * (unique index); the run executes the schedule owner's governed briefing
   * through the Noelia runtime; status/audit/retry evidence is recorded.
   */
  /**
   * CONSUMER — watermark-based, idempotent per (schedule, period).
   *
   * Events are consumed only above the tenant's durable consumer watermark
   * (noelia_scheduler_offsets), so old OUTBOX events can never crowd out new
   * ones and replay is bounded. A run row is inserted ONCE per (schedule,
   * period) under the unique index; duplicate processing (concurrent
   * consumers, crash replay) is skipped, never re-executed.
   */
  async consumeDueRuns(input: {
    principal: Principal;
    traceId: string;
    runBriefing: (owner: Principal, schedule: typeof noeliaSchedules.$inferSelect, periodKey: string, runTraceId: string) => Promise<{ decisionId: string } | null>;
  }): Promise<{ processed: number; skipped: number; failed: number }> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { enterpriseEvents } = await import("@/db/schema");
      const { tenantScopeIds } = await import("@/lib/tenant-scope");
      const tenantIds = await tenantScopeIds(input.principal);
      const consumer = "noelia-schedule-runner";
      const [offsetRow] = await db
        .select()
        .from(noeliaSchedulerOffsets)
        .where(and(
          eq(noeliaSchedulerOffsets.tenantId, input.principal.tenantId),
          eq(noeliaSchedulerOffsets.consumer, consumer),
        ))
        .limit(1);
      const watermark = offsetRow?.lastSequence ?? 0;

      // Defense-in-depth tenant scoping: enterprise_events carries tenant_id and
      // is subject to RLS for the runtime role, but we filter here too so a
      // principal who can reach the scheduler cannot consume another tenant's
      // outbox events. Schedules are then re-verified to belong to the same
      // tenant set before being run.
      const events = await db
        .select()
        .from(enterpriseEvents)
        .where(and(
          eq(enterpriseEvents.type, "NOELIA_SCHEDULE_DUE"),
          eq(enterpriseEvents.source, "beyu-os/ai"),
          inArray(enterpriseEvents.tenantId, tenantIds),
          sql`${enterpriseEvents.sequence} > ${watermark}`,
        ))
        .orderBy(asc(enterpriseEvents.sequence))
        .limit(50);

      let processed = 0;
      let skipped = 0;
      let failed = 0;
      let maxSequence = watermark;
      for (const event of events) {
        maxSequence = Math.max(maxSequence, event.sequence);
        const payload = event.payload as { scheduleId?: string; code?: string; periodKey?: string } | null;
        if (!payload?.scheduleId || !payload.periodKey) {
          skipped += 1;
          continue;
        }
        const schedule = await db.select().from(noeliaSchedules).where(and(
          eq(noeliaSchedules.id, payload.scheduleId),
          inArray(noeliaSchedules.tenantId, tenantIds),
        )).limit(1).then((r) => r[0]);
        if (!schedule || schedule.status !== "ACTIVE" || !schedule.enabled) {
          skipped += 1;
          continue;
        }
        // Idempotent run-once: a row for (schedule, period) means this OUTBOX
        // event was already consumed (committed or dead-lettered).
        const existingRuns = await db.select({ id: noeliaScheduleRuns.id }).from(noeliaScheduleRuns)
          .where(and(eq(noeliaScheduleRuns.scheduleId, schedule.id), eq(noeliaScheduleRuns.scheduledFor, new Date(payload.periodKey!))));
        if (existingRuns.length > 0) {
          skipped += 1;
          continue;
        }
        const owner = await this.principalForOwner(schedule.createdBy, schedule.tenantId);
        if (!owner) {
          // Revoked/inactive owner: record a FAILED run with honest evidence.
          await this.recordRun(schedule.id, payload.periodKey, "FAILED", null, "OWNER_INACTIVE", "The schedule owner is no longer an active identity; the run was not executed.", input.traceId);
          failed += 1;
          continue;
        }
        const runId = newId(ID_PREFIX.noeliaScheduleRun);
        const runTraceId = `${input.traceId}-run-${runId}`;
        try {
          await db.transaction(async (rawTx) => {
            const tx = rawTx as unknown as typeof db;
            await tx.insert(noeliaScheduleRuns).values({
              id: runId,
              scheduleId: schedule.id,
              scheduledFor: new Date(payload.periodKey!),
              status: "FAILED", // placeholder; flipped on success in the same tx
              traceId: runTraceId,
              executedBy: NOELIA_SCHEDULER_IDENTITY,
            });
            const result = await input.runBriefing(owner, schedule, payload.periodKey!, runTraceId);
            await tx.update(noeliaScheduleRuns).set({
              status: result ? "SUCCESS" : "FAILED",
              decisionId: result?.decisionId ?? null,
              errorCode: result ? null : "BRIEFING_FAILED",
              errorDetail: result ? null : "The scheduled briefing did not produce a decision.",
              completedAt: new Date(),
            }).where(eq(noeliaScheduleRuns.id, runId));
            await tx.update(noeliaSchedules).set({
              lastRunAt: new Date(),
              runCount: schedule.runCount + 1,
              nextRunAt: this.nextRunAfter(schedule.cadence, schedule.nextRunAt),
            }).where(eq(noeliaSchedules.id, schedule.id));
            await recordAuditTx(tx, {
              tenantId: schedule.tenantId,
              actorUserId: schedule.createdBy,
              actorType: "AI",
              action: "ai.noelia.schedule.run",
              objectType: "NOELIA_SCHEDULE_RUN",
              objectId: runId,
              outcome: result ? "SUCCESS" : "FAILURE",
              reason: result ? `Scheduled ${schedule.code} briefing completed.` : `Scheduled ${schedule.code} briefing failed.`,
              aiVersion: NOELIA_SCHEDULER_IDENTITY,
              traceId: runTraceId,
              newValue: { scheduleId: schedule.id, code: schedule.code, periodKey: payload.periodKey, decisionId: result?.decisionId ?? null },
            });
          });
          processed += 1;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          if (detail.includes("noelia_schedule_runs_once_uidx")) {
            skipped += 1;
            continue; // already run for this period — idempotent by construction
          }
          // Dead-letter evidence; a concurrent duplicate cannot be double-written.
          await this.recordRun(schedule.id, payload.periodKey, "FAILED", null, "CONSUMER_ERROR", "The scheduled run failed; no domain mutation was committed.", runTraceId);
          failed += 1;
        }
      }

      // Advance the durable watermark only past what was actually observed.
      if (maxSequence > watermark) {
        await db.transaction(async (rawTx) => {
          const tx = rawTx as unknown as typeof db;
          if (offsetRow) {
            await tx.update(noeliaSchedulerOffsets).set({
              lastSequence: maxSequence,
              updatedAt: new Date(),
            }).where(eq(noeliaSchedulerOffsets.id, offsetRow.id));
          } else {
            await tx.insert(noeliaSchedulerOffsets).values({
              id: newId(ID_PREFIX.noeliaScheduleRun).replace("NSR_", "NSO_"),
              tenantId: input.principal.tenantId,
              consumer,
              lastSequence: maxSequence,
            });
          }
        });
      }
      return { processed, skipped, failed };
    });
  }

  private nextRunAfter(cadence: string, from: Date): Date {
    const next = new Date(from);
    switch (cadence) {
      case "DAILY": next.setUTCDate(next.getUTCDate() + 1); break;
      case "WEEKLY": next.setUTCDate(next.getUTCDate() + 7); break;
      case "MONTHLY": next.setUTCMonth(next.getUTCMonth() + 1); break;
      case "QUARTERLY": next.setUTCMonth(next.getUTCMonth() + 3); break;
      case "ANNUAL": next.setUTCFullYear(next.getUTCFullYear() + 1); break;
      case "HORIZON": next.setUTCDate(next.getUTCDate() + 14); break;
      default: next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  private async recordRun(
    scheduleId: string,
    periodKey: string,
    status: "SUCCESS" | "FAILED" | "SKIPPED" | "CANCELLED",
    decisionId: string | null,
    errorCode: string | null,
    errorDetail: string | null,
    traceId: string,
  ): Promise<void> {
    try {
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.insert(noeliaScheduleRuns).values({
          id: newId(ID_PREFIX.noeliaScheduleRun),
          scheduleId,
          scheduledFor: new Date(periodKey),
          status,
          decisionId,
          errorCode,
          errorDetail,
          traceId,
          executedBy: NOELIA_SCHEDULER_IDENTITY,
          completedAt: new Date(),
        });
      });
    } catch (error) {
      // Run-once: a concurrent consumer already recorded this (schedule, period).
      // The evidence row exists; nothing is re-executed.
      const detail = error instanceof Error ? error.message : String(error);
      if (!detail.includes("noelia_schedule_runs_once_uidx")) throw error;
    }
  }

  /** SUSPEND/CANCEL a schedule (governed). */
  async setStatus(input: {
    principal: Principal;
    scheduleId: string;
    status: "SUSPENDED" | "CANCELLED" | "ACTIVE";
    traceId: string;
  }): Promise<NoeliaScheduleResult> {
    return withTenantDatabaseContext(input.principal, async () => {
      const [schedule] = await db.select().from(noeliaSchedules).where(and(
        eq(noeliaSchedules.id, input.scheduleId),
        inArray(noeliaSchedules.tenantId, [input.principal.tenantId]),
      )).limit(1);
      if (!schedule) return { scheduleId: input.scheduleId, code: "", status: "NOT_FOUND", reason: "Schedule not found in scope." };
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as typeof db;
        await tx.update(noeliaSchedules).set({ status: input.status }).where(eq(noeliaSchedules.id, schedule.id));
        await recordAuditTx(tx, {
          tenantId: schedule.tenantId,
          actorUserId: input.principal.userId,
          actorType: "HUMAN",
          action: "ai.noelia.schedule.status",
          objectType: "NOELIA_SCHEDULE",
          objectId: schedule.id,
          reason: `Schedule ${schedule.code} set to ${input.status}.`,
          aiVersion: NOELIA_SCHEDULER_IDENTITY,
          traceId: input.traceId,
        });
      });
      return { scheduleId: schedule.id, code: schedule.code, status: input.status, reason: `Schedule is now ${input.status}.` };
    });
  }

  /** Scoped read of schedules + their runs. */
  async list(input: { principal: Principal; scheduleId?: string }): Promise<{
    schedules: Array<typeof noeliaSchedules.$inferSelect>;
    runs: Array<typeof noeliaScheduleRuns.$inferSelect>;
  }> {
    return withTenantDatabaseContext(input.principal, async () => {
      const { tenantScopeIds } = await import("@/lib/tenant-scope");
      const tenantIds = await tenantScopeIds(input.principal);
      const schedules = input.scheduleId
        ? await db.select().from(noeliaSchedules).where(and(eq(noeliaSchedules.id, input.scheduleId), inArray(noeliaSchedules.tenantId, tenantIds)))
        : await db.select().from(noeliaSchedules).where(inArray(noeliaSchedules.tenantId, tenantIds)).orderBy(asc(noeliaSchedules.code));
      const runs = schedules.length
        ? await db.select().from(noeliaScheduleRuns)
            .where(inArray(noeliaScheduleRuns.scheduleId, schedules.map((s) => s.id)))
            .orderBy(desc(noeliaScheduleRuns.startedAt))
            .limit(100)
        : [];
      return { schedules, runs };
    });
  }
}

