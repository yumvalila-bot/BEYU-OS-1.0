/**
 * Phase 8 outbox operations — operator-authorized replay + reconciliation.
 *
 *   AUTHORIZATION
 *   - the inline fail-closed permission check refuses operators without
 *     outbox:replay / outbox:reconcile (the route guard is the canonical
 *     enforcement; this asserts the defense-in-depth layer)
 *   - source-level: @RequirePermission is present on both endpoints, and the
 *     permissions are granted ONLY to the admin and trustee roles
 *
 *   REPLAY
 *   - dead_letter → requeued (pending, attempt budget reset, replay entry in
 *     the append-only attempt log with operator + reason) → delivered by the
 *     immediate dispatch pass
 *   - delivered rows are REFUSED (never replayable)
 *   - reason is mandatory
 *
 *   RECONCILIATION (against a fake BEYU with real receipt semantics)
 *   - delivered + accepted receipt → consistent
 *   - undelivered + accepted receipt → accepted-not-recorded; repair=true
 *     marks it delivered with the receipt's event id
 *   - delivered + NO receipt → delivered-without-acceptance (CRITICAL, never
 *     auto-repaired)
 *   - dead_letter + NO receipt → undelivered backlog
 *   - BEYU unreachable → unknown (no repair, no guessing)
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import { AddressInfo } from "net";
import {
  buildTestBed,
  TEST_ACTOR,
  type TestBed,
} from "../../common/testing/test-bed";
import { EventOutboxService } from "./event-outbox.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { OutboxOpsService } from "./outbox-ops.service";
import { OutboxMetricsService } from "./outbox-metrics.service";
import { OutboxOpsController } from "./outbox-ops.controller";
import { AuditService } from "../audit/audit.service";
import { ROLE_DEFINITIONS } from "../../common/security/permissions";

/** Fake BEYU with REAL receipt semantics: accept-once, duplicates return the
 *  original event id, status resolves the receipt. */
class FakeBeyu {
  server: http.Server;
  url = "";
  receipts = new Map<
    string,
    { eventId: string; acceptedAt: string; duplicateCount: number }
  >();
  deliveries: { idempotencyKey: string }[] = [];
  down = false;
  seq = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (this.down) {
          res.writeHead(503);
          res.end("down");
          return;
        }
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        res.setHeader("content-type", "application/json");
        if (req.url?.endsWith("/api/v1/internal/events/status")) {
          const r = this.receipts.get(String(body.idempotencyKey));
          if (!r) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: { code: "RECEIPT_NOT_FOUND" } }));
            return;
          }
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              data: {
                accepted: true,
                eventId: r.eventId,
                duplicateCount: r.duplicateCount,
                firstSeenAt: r.acceptedAt,
              },
            }),
          );
          return;
        }
        // events endpoint
        const key = String(body.idempotencyKey);
        this.deliveries.push({ idempotencyKey: key });
        const existing = this.receipts.get(key);
        if (existing) {
          existing.duplicateCount++;
          res.statusCode = 200;
          res.end(
            JSON.stringify({
              data: {
                accepted: false,
                duplicate: true,
                eventId: existing.eventId,
                firstSeenAt: existing.acceptedAt,
                duplicateCount: existing.duplicateCount,
              },
            }),
          );
          return;
        }
        const eventId = `EVT_FAKE_${++this.seq}`;
        this.receipts.set(key, {
          eventId,
          acceptedAt: new Date().toISOString(),
          duplicateCount: 0,
        });
        res.statusCode = 201;
        res.end(
          JSON.stringify({
            data: { accepted: true, duplicate: false, eventId },
          }),
        );
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.server.listen(0, "127.0.0.1", resolve),
    );
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

const SECRET = "test-ops-secret-0123456789abcdef";

function configFor(beyu: FakeBeyu) {
  const map = new Map<string, string>(
    Object.entries({
      BEYU_EVENTS_ENDPOINT: beyu.url,
      BEYU_EVENTS_TOKEN: SECRET,
      BEYU_EVENTS_MAX_ATTEMPTS: "8",
      BEYU_EVENTS_BACKOFF_BASE_MS: "1000",
      BEYU_EVENTS_LEASE_MS: "60000",
      BEYU_EVENTS_TIMEOUT_MS: "2000",
      BEYU_EVENTS_DISPATCH_INTERVAL_MS: "0",
    }),
  );
  return { get: (k: string) => map.get(k) } as never;
}

let bed: TestBed;
let beyu: FakeBeyu;
let outbox: EventOutboxService;
let dispatcher: OutboxDispatcherService;
let ops: OutboxOpsService;
let controller: OutboxOpsController;

const OPERATOR = {
  userId: "00000000-0000-0000-0000-0000000000aa",
  tenantId: TEST_ACTOR.tenantId,
  email: "ops@beyu.health",
  permissions: ["outbox:replay", "outbox:reconcile"],
};

beforeAll(async () => {
  bed = await buildTestBed();
  beyu = new FakeBeyu();
  await beyu.start();
  outbox = new EventOutboxService(bed.conn, bed.tenantCtx);
  const cfg = configFor(beyu);
  dispatcher = new OutboxDispatcherService(bed.conn, bed.tenantCtx, cfg);
  ops = new OutboxOpsService(
    bed.conn,
    bed.tenantCtx,
    cfg,
    new AuditService(bed.conn, bed.tenantCtx),
    dispatcher,
  );
  controller = new OutboxOpsController(
    ops,
    new OutboxMetricsService(bed.conn, cfg),
  );
});

afterAll(async () => {
  await beyu.stop();
});

function event(idem: string) {
  return {
    idempotencyKey: idem,
    sectorEventId: `SEC-${idem}`,
    eventType: "health.billing.invoice_created",
    domain: "finance",
    operation: "billing.event",
    subjectType: "invoice",
    subjectId: `INV-${idem}`,
    classification: "CONFIDENTIAL" as const,
    correlationId: `corr-${idem}`,
    payload: { amount: "12500.00", currency: "TZS" },
  };
}

describe("authorization — operator-only surface", () => {
  it("controller refuses replay without outbox:replay (fail-closed secondary check)", async () => {
    await expect(
      controller.replay(
        { idempotencyKeys: ["x"], reason: "ops request" },
        {
          user: {
            userId: "u1",
            tenantId: TEST_ACTOR.tenantId,
            email: "x@y.z",
            permissions: ["billing:read"],
          },
        },
      ),
    ).rejects.toThrow("OUTBOX_REPLAY_FORBIDDEN");
  });

  it("controller refuses reconcile without outbox:reconcile, and repair without outbox:replay", async () => {
    await expect(
      controller.reconcile(
        {},
        {
          user: {
            userId: "u1",
            tenantId: TEST_ACTOR.tenantId,
            permissions: ["billing:read"],
          },
        },
      ),
    ).rejects.toThrow("OUTBOX_RECONCILE_FORBIDDEN");
    await expect(
      controller.reconcile(
        { repair: true },
        {
          user: {
            userId: "u1",
            tenantId: TEST_ACTOR.tenantId,
            permissions: ["outbox:reconcile"],
          },
        },
      ),
    ).rejects.toThrow("OUTBOX_REPAIR_FORBIDDEN");
  });

  it("source: both endpoints declare @RequirePermission; permissions granted only to admin + trustee", () => {
    const ctl = fs.readFileSync(
      path.resolve(__dirname, "outbox-ops.controller.ts"),
      "utf8",
    );
    expect(ctl).toMatch(/@RequirePermission\("outbox:replay"\)/);
    expect(ctl).toMatch(/@RequirePermission\("outbox:reconcile"\)/);
    const holders = ROLE_DEFINITIONS.filter((r) =>
      r.permissions.includes("outbox:replay"),
    ).map((r) => r.id);
    expect(holders.sort()).toEqual(["admin", "trustee"]);
    const reconcileHolders = ROLE_DEFINITIONS.filter((r) =>
      r.permissions.includes("outbox:reconcile"),
    ).map((r) => r.id);
    expect(reconcileHolders.sort()).toEqual(["admin", "trustee"]);
  });
});

describe("replay — operator-authorized, idempotent-safe", () => {
  it("requeues a dead_letter row and delivers it; attempt log preserves history", async () => {
    // Drive a row to dead_letter via a permanent rejection.
    beyu.deliveries.length = 0;
    await bed.run(async () => outbox.publish(event("replay-1")));
    // Simulate an existing dead_letter (as the dispatcher would have marked it).
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET status='dead_letter', attempt_count=3, next_attempt_at=NULL,
                last_error='BEYU 500: simulated'
          WHERE idempotency_key='replay-1'`,
      );
    });

    const result = await controller.replay(
      {
        idempotencyKeys: ["replay-1"],
        reason: "operator investigated BEYU outage",
      },
      { user: OPERATOR },
    );
    expect(result.requeued).toEqual([
      { idempotencyKey: "replay-1", previousStatus: "dead_letter" },
    ]);
    expect(
      result.dispatch.delivered + result.dispatch.duplicates,
    ).toBeGreaterThanOrEqual(1);

    const row = (await bed.run(async () => outbox.row("replay-1"))) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe("delivered");
    expect(row.attempt_count).toBe(1); // budget was reset by the replay
    const log = row.attempt_log as {
      phase: string;
      reason?: string;
      operator?: string;
      previousStatus?: string;
    }[];
    const replayEntry = log.find((e) => e.phase === "replay");
    expect(replayEntry?.reason).toBe("operator investigated BEYU outage");
    expect(replayEntry?.operator).toBe(OPERATOR.userId);
    expect(replayEntry?.previousStatus).toBe("dead_letter");
    expect(beyu.receipts.get("replay-1")?.eventId).toMatch(/^EVT_FAKE_/);
  });

  it("refuses to replay a delivered row", async () => {
    await bed.run(async () => outbox.publish(event("replay-2")));
    await dispatcher.dispatchDueBatch();
    const before = (await bed.run(async () =>
      outbox.row("replay-2"),
    )) as Record<string, unknown>;
    expect(before.status).toBe("delivered");

    const result = await controller.replay(
      { idempotencyKeys: ["replay-2"], reason: "should refuse" },
      { user: OPERATOR },
    );
    expect(result.requeued).toHaveLength(0);
    expect(result.refused).toEqual([
      { idempotencyKey: "replay-2", reason: "ALREADY_DELIVERED" },
    ]);
  });

  it("replaying an ALREADY-ACCEPTED event stays exactly-one BEYU event (duplicate receipt)", async () => {
    // replay-1 was accepted; force it to dead_letter again and replay: BEYU
    // must return the ORIGINAL event id as a duplicate, not a new event.
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET status='dead_letter', attempt_count=9, next_attempt_at=NULL WHERE idempotency_key='replay-1'`,
      );
    });
    const eventIdBefore = beyu.receipts.get("replay-1")?.eventId;
    const result = await controller.replay(
      {
        idempotencyKeys: ["replay-1"],
        reason: "second replay after false alarm",
      },
      { user: OPERATOR },
    );
    expect(result.requeued).toHaveLength(1);
    expect(result.dispatch.duplicates).toBeGreaterThanOrEqual(1); // duplicate, not new acceptance
    expect(beyu.receipts.get("replay-1")?.eventId).toBe(eventIdBefore);
    expect(
      beyu.receipts.get("replay-1")?.duplicateCount,
    ).toBeGreaterThanOrEqual(1);
    const row = (await bed.run(async () => outbox.row("replay-1"))) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe("delivered");
    const resp = row.response_payload as {
      duplicate: boolean;
      eventId: string;
    };
    expect(resp.duplicate).toBe(true);
    expect(resp.eventId).toBe(eventIdBefore);
  });

  it("reason is mandatory", async () => {
    await expect(
      ops.replay({
        idempotencyKeys: ["replay-1"],
        reason: "",
        operator: OPERATOR,
      }),
    ).rejects.toThrow("REPLAY_REASON_REQUIRED");
  });
});

describe("reconciliation — outbox ledger vs BEYU receipts", () => {
  it("classifies consistent / accepted-not-recorded (repair) / delivered-without-acceptance / undelivered / unknown", async () => {
    // consistent: replay-1 delivered + accepted
    // accepted-not-recorded: publish, deliver via raw HTTP-like acceptance…
    //   simplest: publish, mark the FAKE receipt by hand-delivering through
    //   the dispatcher but then corrupting the outbox row back to pending.
    await bed.run(async () => outbox.publish(event("rec-anr-1")));
    await dispatcher.dispatchDueBatch(); // accepted + recorded delivered
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET status='pending', delivered_at=NULL, response_payload=NULL WHERE idempotency_key='rec-anr-1'`,
      );
    });
    // delivered-without-acceptance: forge a delivered row BEYU never accepted
    await bed.run(async () => outbox.publish(event("rec-dwa-1")));
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET status='delivered', delivered_at=now(),
                response_payload='{"accepted":true,"eventId":"EVT_GHOST"}'::jsonb
          WHERE idempotency_key='rec-dwa-1'`,
      );
    });
    // undelivered backlog: a dead_letter BEYU never accepted
    await bed.run(async () => outbox.publish(event("rec-backlog-1")));
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET status='dead_letter', attempt_count=8, next_attempt_at=NULL WHERE idempotency_key='rec-backlog-1'`,
      );
    });

    // Pass 1: report only (no repair)
    const report = await controller.reconcile(
      { repair: false },
      { user: OPERATOR },
    );
    expect(report.checked).toBeGreaterThanOrEqual(5);
    expect(report.consistent).toContain("replay-1");
    expect(report.acceptedNotRecorded.map((x) => x.idempotencyKey)).toContain(
      "rec-anr-1",
    );
    expect(
      report.deliveredWithoutAcceptance.map((x) => x.idempotencyKey),
    ).toContain("rec-dwa-1");
    expect(report.undelivered.map((x) => x.idempotencyKey)).toContain(
      "rec-backlog-1",
    );
    // The ghost row is NEVER auto-repaired by a report-only pass.
    expect((await bed.run(async () => outbox.row("rec-anr-1")))!.status).toBe(
      "pending",
    );

    // Pass 2: repair — accepted-not-recorded is repaired; ghost is not.
    const repaired = await controller.reconcile(
      { repair: true },
      { user: OPERATOR },
    );
    expect(repaired.repaired).toContain("rec-anr-1");
    const anr = (await bed.run(async () => outbox.row("rec-anr-1"))) as Record<
      string,
      unknown
    >;
    expect(anr.status).toBe("delivered");
    expect((anr.response_payload as { eventId: string }).eventId).toBe(
      beyu.receipts.get("rec-anr-1")?.eventId,
    );
    const ghost = (await bed.run(async () =>
      outbox.row("rec-dwa-1"),
    )) as Record<string, unknown>;
    expect(ghost.status).toBe("delivered"); // untouched: still flagged, awaiting operator
    expect(
      repaired.deliveredWithoutAcceptance.map((x) => x.idempotencyKey),
    ).toContain("rec-dwa-1");
  });

  it("BEYU unreachable → unknown entries, no repair, no guessing", async () => {
    beyu.down = true;
    try {
      const report = await controller.reconcile(
        { repair: true },
        { user: OPERATOR },
      );
      expect(report.unknown.length).toBeGreaterThanOrEqual(1);
      expect(report.repaired).toHaveLength(0);
    } finally {
      beyu.down = false;
    }
  });
});
