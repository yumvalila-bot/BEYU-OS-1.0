import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { noeliaScheduleRuns, noeliaSchedulerOffsets, noeliaSchedules, enterpriseEvents } from "../../src/db/schema";
import { BeyuNoeliaSchedulerService } from "../../src/lib/noelia/scheduler-service";
import { runScheduledBriefing } from "../../src/lib/noelia";
import { seededPrincipal } from "./db-fixtures";

const scheduleIds: string[] = [];
const runIds: string[] = [];

async function rememberSchedule<T extends { scheduleId: string | null }>(result: T): Promise<T> {
  if (result.scheduleId) scheduleIds.push(result.scheduleId);
  return result;
}

const trace = () => `TRACE_SCH_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

beforeAll(async () => {
  // Targeted cleanup of interrupted prior runs (events are append-only and
  // remain in the canonical chain — never deleted).
  const stale = await db.select({ id: noeliaSchedules.id })
    .from(noeliaSchedules)
    .where(eq(noeliaSchedules.createdBy, "scheduler-test"));
  if (stale.length) {
    await db.delete(noeliaScheduleRuns).where(inArray(noeliaScheduleRuns.scheduleId, stale.map((r) => r.id)));
    await db.delete(noeliaSchedules).where(inArray(noeliaSchedules.id, stale.map((r) => r.id)));
  }
  // The consumer watermark starts ABOVE any pre-existing OUTBOX events so this
  // suite only ever observes its own emissions (the chain itself is untouched).
  const cfo = await seededPrincipal("cfo@beyu.os");
  const [maxRow] = await db
    .select({ m: sql<number>`coalesce(max(${enterpriseEvents.sequence}), 0)::int` })
    .from(enterpriseEvents);
  const [existing] = await db.select().from(noeliaSchedulerOffsets).where(and(
    eq(noeliaSchedulerOffsets.tenantId, cfo.tenantId),
    eq(noeliaSchedulerOffsets.consumer, "noelia-schedule-runner"),
  )).limit(1);
  if (existing) {
    await db.update(noeliaSchedulerOffsets).set({ lastSequence: maxRow.m })
      .where(eq(noeliaSchedulerOffsets.id, existing.id));
  } else {
    await db.insert(noeliaSchedulerOffsets).values({
      id: `NSO_TEST_${Date.now()}`,
      tenantId: cfo.tenantId,
      consumer: "noelia-schedule-runner",
      lastSequence: maxRow.m,
    });
  }
});

afterAll(async () => {
  if (scheduleIds.length) {
    await db.delete(noeliaScheduleRuns).where(inArray(noeliaScheduleRuns.scheduleId, scheduleIds));
    await db.delete(noeliaSchedules).where(inArray(noeliaSchedules.id, scheduleIds));
  }
  await pool.end();
});

describe("Noelia governed scheduler (OUTBOX → consumer → idempotency → audit)", () => {
  it("emits due runs through enterprise events and consumes them idempotently", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const service = new BeyuNoeliaSchedulerService();
    const past = new Date(Date.now() - 60_000).toISOString();

    const created = await rememberSchedule(await service.create({
      principal: cfo,
      traceId: trace(),
      schedule: {
        code: `TEST_SCHED_${Date.now()}`,
        cadence: "DAILY",
        horizon: "HORIZON_2_NEAR_TERM",
        briefingFocus: "STANDARD",
        classification: "RESTRICTED",
        targetTenantId: cfo.tenantId,
        nextRunAt: past,
        enabled: true,
      },
    }));
    expect(created.status).toBe("CREATED");
    expect(created.scheduleId).toBeTruthy();

    // TICK: one OUTBOX event per due (schedule, period).
    const { emitted } = await service.emitDueRuns({ principal: cfo, traceId: trace() });
    expect(emitted).toBeGreaterThanOrEqual(1);
    const events = await db.select().from(enterpriseEvents).where(and(
      eq(enterpriseEvents.type, "NOELIA_SCHEDULE_DUE"),
      eq(enterpriseEvents.subjectId, created.scheduleId!),
    ));
    expect(events.length).toBeGreaterThanOrEqual(1);
    const periodKey = (events[0].payload as { periodKey?: string }).periodKey!;
    expect(periodKey).toBeTruthy();

    // CONSUME: the run executes the owner's governed briefing.
    const first = await service.consumeDueRuns({
      principal: cfo,
      traceId: trace(),
      runBriefing: async (owner, schedule, _periodKey, runTraceId) =>
        runScheduledBriefing({
          owner,
          schedule: {
            id: schedule.id,
            code: schedule.code,
            tenantId: schedule.tenantId,
            legalEntityId: schedule.legalEntityId,
            countryCode: schedule.countryCode,
            horizon: schedule.horizon,
            briefingFocus: schedule.briefingFocus,
          },
          traceId: runTraceId,
        }),
    });
    expect(first.processed).toBeGreaterThanOrEqual(1);

    const [run] = await db.select().from(noeliaScheduleRuns).where(and(
      eq(noeliaScheduleRuns.scheduleId, created.scheduleId!),
      eq(noeliaScheduleRuns.scheduledFor, new Date(periodKey)),
    )).limit(1);
    expect(run).toBeTruthy();
    expect(run.status).toBe("SUCCESS");
    expect(run.decisionId).toMatch(/^AID_/);
    expect(run.executedBy).toBe("NOELIA_SCHEDULER");

    // Run-once idempotency: exactly one run row exists for (schedule, period).
    const runCount = await db.select({ n: sql<number>`count(*)::int` }).from(noeliaScheduleRuns)
      .where(and(
        eq(noeliaScheduleRuns.scheduleId, created.scheduleId!),
        eq(noeliaScheduleRuns.scheduledFor, new Date(periodKey)),
      ));
    expect(runCount[0].n).toBe(1);

    // A second consume must not duplicate or re-execute.
    const second = await service.consumeDueRuns({
      principal: cfo,
      traceId: trace(),
      runBriefing: async () => null,
    });
    expect(second.processed).toBe(0);
    const runCountAfter = await db.select({ n: sql<number>`count(*)::int` }).from(noeliaScheduleRuns)
      .where(eq(noeliaScheduleRuns.scheduleId, created.scheduleId!));
    expect(runCountAfter[0].n).toBe(1);
  });

  it("marks a schedule SUSPENDED and stops emitting runs", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const service = new BeyuNoeliaSchedulerService();
    const past = new Date(Date.now() - 60_000).toISOString();

    const created = await rememberSchedule(await service.create({
      principal: cfo,
      traceId: trace(),
      schedule: {
        code: `TEST_SUSP_${Date.now()}`,
        cadence: "WEEKLY",
        horizon: "HORIZON_3_MEDIUM_TERM",
        briefingFocus: "STANDARD",
        classification: "RESTRICTED",
        targetTenantId: cfo.tenantId,
        nextRunAt: past,
        enabled: true,
      },
    }));
    expect(created.status).toBe("CREATED");

    const suspended = await service.setStatus({
      principal: cfo,
      scheduleId: created.scheduleId!,
      status: "SUSPENDED",
      traceId: trace(),
    });
    expect(suspended.status).toBe("SUSPENDED");

    const { emitted } = await service.emitDueRuns({ principal: cfo, traceId: trace() });
    // No run may be emitted for the suspended schedule.
    const events = await db.select().from(enterpriseEvents).where(and(
      eq(enterpriseEvents.type, "NOELIA_SCHEDULE_DUE"),
      eq(enterpriseEvents.subjectId, created.scheduleId!),
    ));
    expect(events).toHaveLength(0);
  });

  it("fails closed when the schedule owner is no longer an active identity", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const service = new BeyuNoeliaSchedulerService();
    const past = new Date(Date.now() - 60_000).toISOString();

    const created = await rememberSchedule(await service.create({
      principal: cfo,
      traceId: trace(),
      schedule: {
        code: `TEST_OWNER_${Date.now()}`,
        cadence: "MONTHLY",
        horizon: "HORIZON_1_IMMEDIATE",
        briefingFocus: "STANDARD",
        classification: "RESTRICTED",
        targetTenantId: cfo.tenantId,
        nextRunAt: past,
        enabled: true,
      },
    }));
    // Simulate a revoked/inactive owner by pointing the schedule at a
    // non-existent user id — the consumer must record a FAILED run, not invent
    // an identity or fabricate a briefing.
    await db.update(noeliaSchedules).set({ createdBy: "USR_DOES_NOT_EXIST" })
      .where(eq(noeliaSchedules.id, created.scheduleId!));

    await service.emitDueRuns({ principal: cfo, traceId: trace() });
    const consumed = await service.consumeDueRuns({
      principal: cfo,
      traceId: trace(),
      runBriefing: async () => ({ decisionId: "AID_SHOULD_NOT_RUN" }),
    });
    expect(consumed.failed).toBeGreaterThanOrEqual(1);
    const [run] = await db.select().from(noeliaScheduleRuns)
      .where(eq(noeliaScheduleRuns.scheduleId, created.scheduleId!))
      .orderBy(sql`started_at desc`)
      .limit(1);
    expect(run.status).toBe("FAILED");
    expect(run.errorCode).toBe("OWNER_INACTIVE");
    expect(run.decisionId).toBeNull();
  });
});
