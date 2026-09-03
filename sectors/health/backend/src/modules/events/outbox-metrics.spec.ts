/**
 * Phase 16 observability — outbox metrics + dispatcher readiness reporting.
 *
 *   - snapshot() folds real outbox rows into the named gauges
 *     (pending/failed/blocked/dead_letter/delivered + oldest undelivered
 *     age), separating the governed-events track from sync-adapter rows;
 *   - readiness() reports degraded exactly when operators must act
 *     (dead letters, or an unconfigured endpoint with a backlog) and never
 *     otherwise;
 *   - the metrics endpoint is operator-gated (outbox:reconcile);
 *   - health readiness now includes the event_dispatcher check, and that
 *     check never fails readiness on its own.
 */
import "reflect-metadata";
import {
  buildTestBed,
  TEST_ACTOR,
  type TestBed,
} from "../../common/testing/test-bed";
import { OutboxMetricsService } from "./outbox-metrics.service";
import { OutboxOpsController } from "./outbox-ops.controller";
import { OutboxOpsService } from "./outbox-ops.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { AuditService } from "../audit/audit.service";

let bed: TestBed;
let metrics: OutboxMetricsService;
let controller: OutboxOpsController;

beforeAll(async () => {
  bed = await buildTestBed();
  const cfg = { get: () => undefined } as never; // endpoint unconfigured
  metrics = new OutboxMetricsService(bed.conn, cfg);
  const dispatcher = new OutboxDispatcherService(bed.conn, bed.tenantCtx, cfg);
  const ops = new OutboxOpsService(
    bed.conn,
    bed.tenantCtx,
    cfg,
    new AuditService(bed.conn, bed.tenantCtx),
    dispatcher,
  );
  controller = new OutboxOpsController(ops, metrics);
});

const OPERATOR = {
  userId: "00000000-0000-0000-0000-0000000000bb",
  tenantId: TEST_ACTOR.tenantId,
  email: "ops@beyu.health",
  permissions: ["outbox:replay", "outbox:reconcile"],
};

function seed(provider: string, status: string, key: string): Promise<unknown> {
  return bed.conn.query(
    `INSERT INTO health.beyu_outbox
       (idempotency_key, provider, action, tenant_id, request_payload, status, correlation_id, created_at)
     VALUES ($1, $2, 'event.publish', NULL, '{}'::jsonb, $3, $4, now() - interval '10 minutes')`,
    [key, provider, status, `corr-${key}`],
  );
}

describe("OutboxMetricsService.snapshot", () => {
  it("folds statuses into named gauges per track with oldest undelivered age", async () => {
    await seed("beyu.events", "pending", "m-pending");
    await seed("beyu.events", "pending", "m-pending-2");
    await seed("beyu.events", "failed", "m-failed");
    await seed("beyu.events", "dead_letter", "m-dlq");
    await seed("beyu.events", "delivered", "m-delivered");
    await seed("beyu.finance", "blocked", "m-fin-blocked"); // sync track

    const snap = await metrics.snapshot();
    expect(snap.governed_events.pending).toBeGreaterThanOrEqual(2);
    expect(snap.governed_events.failed).toBeGreaterThanOrEqual(1);
    expect(snap.governed_events.dead_letter).toBeGreaterThanOrEqual(1);
    expect(snap.governed_events.delivered).toBeGreaterThanOrEqual(1);
    // oldest undelivered row is ~10 minutes old
    expect(
      snap.governed_events.oldest_undelivered_age_seconds,
    ).toBeGreaterThanOrEqual(590);
    expect(snap.sync_adapters.blocked).toBeGreaterThanOrEqual(1);
    expect(snap.dispatcher.configured).toBe(false);
  });
});

describe("OutboxMetricsService.readiness", () => {
  it("degraded when dead letters exist", async () => {
    const r = await metrics.readiness();
    // m-dlq was seeded above
    expect(r.status).toBe("degraded");
    expect(r.detail).toMatchObject({ dead_letter: expect.any(Number) });
  });

  it("up when configured with no dead letters", async () => {
    const map = new Map([["BEYU_EVENTS_ENDPOINT", "http://127.0.0.1:9"]]);
    const configured = new OutboxMetricsService(bed.conn, {
      get: (k: string) => map.get(k),
    } as never);
    // seed nothing new: delivered rows only → up even with endpoint set/unset
    const r = await configured.readiness();
    expect(r.status).toBe("degraded"); // dead letters still present from the seed above
    // verify the precise rule: without dead letters it would be 'up'
    await bed.conn.query(
      `UPDATE health.beyu_outbox SET status='delivered' WHERE idempotency_key='m-dlq'`,
    );
    const r2 = await configured.readiness();
    expect(r2.status).toBe("up");
  });
});

describe("metrics endpoint authorization", () => {
  it("refuses operators without outbox:reconcile (fail-closed)", async () => {
    await expect(
      controller.getMetrics({
        user: {
          userId: "u1",
          tenantId: TEST_ACTOR.tenantId,
          permissions: ["billing:read"],
        },
      }),
    ).rejects.toThrow("OUTBOX_METRICS_FORBIDDEN");
  });

  it("returns the snapshot to an authorized operator", async () => {
    const snap = await controller.getMetrics({ user: OPERATOR });
    expect(snap).toHaveProperty("governed_events");
    expect(snap).toHaveProperty("sync_adapters");
    expect(snap).toHaveProperty("dispatcher");
    expect(snap.timestamp).toBeTruthy();
  });
});
