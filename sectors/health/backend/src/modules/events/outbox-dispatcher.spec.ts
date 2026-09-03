/**
 * Phase 8 governed outbox dispatcher — end-to-end state machine tests.
 *
 * Real PGlite database (all migrations applied, real RLS policies), real
 * stub BEYU endpoint (local HTTP server), real service token header.
 *
 *   - transactional atomicity: an event published inside a ROLLED BACK
 *     business transaction leaves NO outbox row (outbox write and business
 *     change commit together or not at all);
 *   - happy path: pending → delivered, envelope forwarded verbatim with
 *     idempotencyKey + tenantCode + service authorization header;
 *   - duplicate acceptance (BEYU 200 duplicate:true) → delivered;
 *   - retryable failure (500) → failed + future backoff, NOT re-claimed
 *     before next_attempt_at, delivered on the next due attempt;
 *   - permanent rejection (422) → dead_letter immediately (no retries);
 *   - max attempts exhausted → dead_letter;
 *   - lease semantics: a claimed row cannot be re-claimed concurrently;
 *   - tenant enumeration delivers per-tenant rows AND service (NULL) rows.
 */
import "reflect-metadata";
import * as http from "http";
import { AddressInfo } from "net";
import { buildTestBed, TEST_ACTOR, type TestBed } from "../../common/testing/test-bed";
import { EventOutboxService } from "./event-outbox.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { inTx } from "../../common/db/crud-factory";

type StubMode = "accept" | "duplicate" | "server_error" | "permanent_reject" | "rate_limited";

/** Minimal stand-in for the BEYU OS events endpoint. */
class BeyuStub {
  server: http.Server;
  url = "";
  received: { body: Record<string, unknown>; auth: string | undefined }[] = [];
  mode: StubMode = "accept";
  eventSeq = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        this.received.push({ body, auth: req.headers.authorization });
        res.setHeader("content-type", "application/json");
        if (this.mode === "accept" || this.mode === "duplicate" || this.mode === "rate_limited") {
          const eventId = `EVT_STUB_${++this.eventSeq}`;
          if (this.mode === "rate_limited") {
            res.statusCode = 429;
            res.end(JSON.stringify({ error: { code: "RATE_LIMITED" } }));
            return;
          }
          res.statusCode = this.mode === "accept" ? 201 : 200;
          res.end(
            JSON.stringify({
              data: { accepted: this.mode === "accept", duplicate: this.mode === "duplicate", eventId },
            }),
          );
          return;
        }
        if (this.mode === "server_error") {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: { code: "INTERNAL" } }));
          return;
        }
        res.statusCode = 422;
        res.end(JSON.stringify({ error: { code: "VALIDATION_FAILED" } }));
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

const SECRET = "test-events-secret-0123456789abcdef";

function makeDispatcher(
  bed: TestBed,
  stub: BeyuStub,
  env: Record<string, string> = {},
): OutboxDispatcherService {
  const config = new Map<string, string>(
    Object.entries({
      BEYU_EVENTS_ENDPOINT: stub.url,
      BEYU_EVENTS_TOKEN: SECRET,
      BEYU_EVENTS_MAX_ATTEMPTS: "8",
      BEYU_EVENTS_BACKOFF_BASE_MS: "1000",
      BEYU_EVENTS_LEASE_MS: "60000",
      BEYU_EVENTS_TIMEOUT_MS: "2000",
      BEYU_EVENTS_DISPATCH_INTERVAL_MS: "0",
      ...env,
    }),
  );
  const cfg = { get: (k: string) => config.get(k) } as never;
  return new OutboxDispatcherService(bed.conn, bed.tenantCtx, cfg);
}

let bed: TestBed;
let stub: BeyuStub;
let outbox: EventOutboxService;

beforeAll(async () => {
  bed = await buildTestBed();
  stub = new BeyuStub();
  await stub.start();
  outbox = new EventOutboxService(bed.conn, bed.tenantCtx);
});

afterAll(async () => {
  await stub.stop();
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

describe("EventOutboxService — transactional outbox writer", () => {
  it("publish() persists a pending row with the full envelope under the actor's tenant", async () => {
    await bed.run(async () => {
      await outbox.publish(event("smoke-1"));
    });
    const row = (await bed.run(async () => outbox.row("smoke-1"))) as Record<string, unknown> | null;
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.provider).toBe("beyu.events");
    const envelope = row!.request_payload as Record<string, unknown>;
    expect(envelope.eventType).toBe("health.billing.invoice_created");
    expect(envelope.subjectId).toBe("INV-smoke-1");
    expect(envelope.correlationId).toBe("corr-smoke-1");
  });

  it("publish() inside a ROLLED BACK business transaction leaves NO row (atomicity)", async () => {
    await bed.run(async () => {
      await expect(
        inTx(bed.conn, bed.tenantCtx, async () => {
          await outbox.publish(event("rolled-back-1"));
          throw new Error("business transaction failed");
        }),
      ).rejects.toThrow("business transaction failed");
    });
    const row = await bed.run(async () => outbox.row("rolled-back-1"));
    expect(row).toBeNull();
  });
});

describe("OutboxDispatcherService — delivery state machine", () => {
  it("delivers pending rows: 201 → delivered, envelope + service auth forwarded", async () => {
    stub.mode = "accept";
    await bed.run(async () => {
      await outbox.publish(event("happy-1"));
    });
    const dispatcher = makeDispatcher(bed, stub);
    const summary = await dispatcher.dispatchDueBatch();
    expect(summary.claimed).toBeGreaterThanOrEqual(1);
    expect(summary.delivered).toBeGreaterThanOrEqual(1);
    expect(summary.deadLettered).toBe(0);

    const row = (await bed.run(async () => outbox.row("happy-1"))) as Record<string, unknown>;
    expect(row.status).toBe("delivered");
    expect(row.attempt_count).toBe(1);
    expect(row.delivered_at).not.toBeNull();
    const resp = row.response_payload as { eventId: string; accepted: boolean };
    expect(resp.accepted).toBe(true);
    expect(resp.eventId).toMatch(/^EVT_STUB_/);

    const sent = stub.received.find((r) => r.body.idempotencyKey === "happy-1");
    expect(sent).toBeDefined();
    if (!sent) throw new Error("happy-1 was never delivered to the stub");
    expect(sent.auth).toMatch(/^Bearer /);
    expect(sent.body.tenantCode).toBe("BEYU-HEALTH");
    expect((sent.body.payload as Record<string, unknown>).amount).toBe("12500.00");
  });

  it("BEYU 200 duplicate:true → delivered (re-delivery after crash is safe)", async () => {
    stub.mode = "duplicate";
    await bed.run(async () => {
      await outbox.publish(event("dup-1"));
    });
    const dispatcher = makeDispatcher(bed, stub);
    const summary = await dispatcher.dispatchDueBatch();
    expect(summary.duplicates).toBeGreaterThanOrEqual(1);
    const row = (await bed.run(async () => outbox.row("dup-1"))) as Record<string, unknown>;
    expect(row.status).toBe("delivered");
  });

  it("retryable 500 → failed with future backoff; not re-claimed until due; then delivered", async () => {
    stub.mode = "server_error";
    await bed.run(async () => {
      await outbox.publish(event("retry-1"));
    });
    const dispatcher = makeDispatcher(bed, stub);
    const first = await dispatcher.dispatchDueBatch();
    expect(first.retried).toBeGreaterThanOrEqual(1);
    let row = (await bed.run(async () => outbox.row("retry-1"))) as Record<string, unknown>;
    expect(row.status).toBe("failed");
    expect(row.attempt_count).toBe(1);
    expect(row.last_error).toMatch(/BEYU 500/);
    const nextAttempt = row.next_attempt_at as string;
    expect(new Date(nextAttempt).getTime()).toBeGreaterThan(Date.now() - 1000);

    // Not due yet → a second cycle must NOT touch the row.
    const idle = await dispatcher.dispatchDueBatch();
    expect(idle.claimed).toBe(0);
    row = (await bed.run(async () => outbox.row("retry-1"))) as Record<string, unknown>;
    expect(row.attempt_count).toBe(1);

    // Force due → delivered on attempt 2.
    stub.mode = "accept";
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET next_attempt_at = now() - interval '1 second' WHERE idempotency_key = $1`,
        ["retry-1"],
      );
    });
    const second = await dispatcher.dispatchDueBatch();
    expect(second.delivered).toBeGreaterThanOrEqual(1);
    row = (await bed.run(async () => outbox.row("retry-1"))) as Record<string, unknown>;
    expect(row.status).toBe("delivered");
    expect(row.attempt_count).toBe(2);
    const log = row.attempt_log as { phase: string }[];
    expect(log.map((e) => e.phase)).toEqual(["claim", "retry", "claim", "delivered"]);
  });

  it("permanent 422 → dead_letter immediately (the event can never be accepted)", async () => {
    stub.mode = "permanent_reject";
    await bed.run(async () => {
      await outbox.publish(event("perm-1"));
    });
    const dispatcher = makeDispatcher(bed, stub);
    const summary = await dispatcher.dispatchDueBatch();
    expect(summary.deadLettered).toBeGreaterThanOrEqual(1);
    const row = (await bed.run(async () => outbox.row("perm-1"))) as Record<string, unknown>;
    expect(row.status).toBe("dead_letter");
    expect(row.attempt_count).toBe(1);
    expect(row.next_attempt_at).toBeNull();
    expect(row.last_error).toMatch(/BEYU 422/);
  });

  it("max attempts exhausted → dead_letter", async () => {
    stub.mode = "server_error";
    await bed.run(async () => {
      await outbox.publish(event("max-1"));
    });
    const dispatcher = makeDispatcher(bed, stub, { BEYU_EVENTS_MAX_ATTEMPTS: "2" });
    await dispatcher.dispatchDueBatch(); // attempt 1 → failed
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET next_attempt_at = now() - interval '1 second' WHERE idempotency_key = $1`,
        ["max-1"],
      );
    });
    const second = await dispatcher.dispatchDueBatch(); // attempt 2 → dead_letter
    expect(second.deadLettered).toBeGreaterThanOrEqual(1);
    const row = (await bed.run(async () => outbox.row("max-1"))) as Record<string, unknown>;
    expect(row.status).toBe("dead_letter");
    expect(row.attempt_count).toBe(2);
  });

  it("a claimed (leased) row cannot be claimed again concurrently", async () => {
    await bed.run(async () => {
      await outbox.publish(event("lease-1"));
    });
    const dispatcher = makeDispatcher(bed, stub);
    const first = await (dispatcher as unknown as { claim(t: string | null): Promise<unknown[]> }).claim(
      TEST_ACTOR.tenantId,
    );
    expect(first).toHaveLength(1);
    const second = await (dispatcher as unknown as { claim(t: string | null): Promise<unknown[]> }).claim(
      TEST_ACTOR.tenantId,
    );
    expect(second).toHaveLength(0);
  });

  it("delivers both tenant rows and service (NULL-tenant) rows", async () => {
    stub.mode = "accept";
    await bed.run(async () => {
      await outbox.publish(event("tenant-row-1"));
      // A service-initiated row (tenant NULL) — visible to every context.
      await bed.conn.query(
        `INSERT INTO health.beyu_outbox
           (idempotency_key, provider, action, actor_global_user_id, tenant_id, request_payload, status, correlation_id)
         VALUES ('service-row-1', 'beyu.events', 'event.publish', NULL, NULL, $1::jsonb, 'pending', 'corr-service')`,
        [
          JSON.stringify({
            sectorEventId: "SEC-service-row-1",
            eventType: "health.system.maintenance",
            eventVersion: "1",
            schemaVersion: "1",
            domain: "system",
            operation: "maintenance.event",
            destinationDomain: null,
            subjectType: "system",
            subjectId: "platform",
            actorGlobalUserId: null,
            classification: "INTERNAL",
            correlationId: "corr-service",
            causationId: null,
            occurredAt: new Date().toISOString(),
            payload: {},
          }),
        ],
      );
    });
    const dispatcher = makeDispatcher(bed, stub);
    const summary = await dispatcher.dispatchDueBatch();
    expect(summary.delivered).toBeGreaterThanOrEqual(2);
    for (const key of ["tenant-row-1", "service-row-1"]) {
      const row = (await bed.run(async () => outbox.row(key))) as Record<string, unknown>;
      expect(row.status).toBe("delivered");
    }
  });
});
