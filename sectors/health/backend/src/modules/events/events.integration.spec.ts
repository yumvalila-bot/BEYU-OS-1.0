/**
 * CROSS-OS GOVERNED EVENT CHAIN — live integration certification (Phase 8).
 *
 * This is the ONLY test that exercises the COMPLETE chain end to end with
 * both operating systems real:
 *
 *   Health billing transaction
 *     └─(SAME transaction)─▶ beyu_outbox pending row        [PGlite PG16]
 *          └─(dispatcher, real HTTP + real service token)─▶
 *              BEYU OS POST /api/v1/internal/events         [real server]
 *                  ├─ idempotency receipt claimed           [real PG]
 *                  ├─ governed enterprise_events row        [real PG,
 *                  │    hash-chained v2, SERVICE actor,        postgres]
 *                  │    canonical human actor recorded
 *                  └─ SERVICE audit row                      [real PG]
 *          ◀─(201 accepted, eventId)─
 *     reconciliation: outbox ↔ BEYU receipts consistent
 *
 * EXACTLY-ONCE is proven structurally: a simulated crash-redelivery
 * (delivered row requeued + re-dispatched) must leave EXACTLY ONE
 * enterprise_events row for the business occurrence, with the receipt's
 * duplicate_count incremented and the original event id returned.
 *
 * The human actor on the event is a REAL canonical GlobalUserId obtained
 * from the root identity federation endpoint (register) — the same Phase 7
 * contract — so the event carries a canonical identity, not a sector-local
 * one.
 *
 * GATING: runs ONLY when the live environment is provided:
 *   BEYU_EVENTS_INTEGRATION=1
 *   BEYU_OS_TEST_BASE_URL       (root server, e.g. http://127.0.0.1:3100)
 *   BEYU_OS_TEST_SERVICE_TOKEN  (shared secret the root server runs with)
 *   BEYU_OS_TEST_DATABASE_URL   (root PostgreSQL admin URL for assertions)
 * Otherwise the suite is skipped — never fabricated, never mocked.
 */
import "reflect-metadata";
// The live chain spans a real HTTP server, a real PostgreSQL root and a
// full PGlite sector engine — allow generous per-test time.
jest.setTimeout(120_000);
import { Client } from "pg";
import { buildTestBed, TEST_ACTOR, type TestBed } from "../../common/testing/test-bed";
import { BillingService } from "../billing/billing.service";
import { BillingRepository } from "../billing/billing.repository";
import { EventOutboxService } from "./event-outbox.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { OutboxOpsService } from "./outbox-ops.service";
import { AuditService } from "../audit/audit.service";
import { BeyuIdentityBridge } from "../identity/beyu-bridge";
import { signServiceToken } from "../../integrations/beyu/shared/service-token";

const BASE = process.env.BEYU_OS_TEST_BASE_URL ?? "";
const SECRET = process.env.BEYU_OS_TEST_SERVICE_TOKEN ?? "";
const ROOT_DB = process.env.BEYU_OS_TEST_DATABASE_URL ?? "";
const RUN = process.env.BEYU_EVENTS_INTEGRATION === "1";

const d = RUN ? describe : describe.skip;

let bed: TestBed;
let billing: BillingService;
let outbox: EventOutboxService;
let dispatcher: OutboxDispatcherService;
let ops: OutboxOpsService;
let root: Client;
let canonicalActorId: string;
const RUN_ID = Date.now().toString(36);

async function rootFetch(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${signServiceToken(SECRET)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/**
 * Run fn as the ordinary sector test actor. Its CANONICAL identity (the
 * USR_… GlobalUserID registered with the root federation and bridged via
 * beyu_identity_links below) is what the governed event will carry — the
 * sector actor and the canonical actor are bridged, never conflated.
 */
async function asSectorActor<T>(fn: () => Promise<T>): Promise<T> {
  return bed.run(fn);
}

beforeAll(async () => {
  if (!RUN) return;
  bed = await buildTestBed();
  outbox = new EventOutboxService(bed.conn, bed.tenantCtx);
  const map = new Map<string, string>(
    Object.entries({
      BEYU_EVENTS_ENDPOINT: BASE,
      BEYU_EVENTS_TOKEN: SECRET,
      BEYU_EVENTS_MAX_ATTEMPTS: "8",
      BEYU_EVENTS_BACKOFF_BASE_MS: "1000",
      BEYU_EVENTS_LEASE_MS: "60000",
      BEYU_EVENTS_TIMEOUT_MS: "8000",
      BEYU_EVENTS_DISPATCH_INTERVAL_MS: "0",
    }),
  );
  const cfg = { get: (k: string) => map.get(k) } as never;
  dispatcher = new OutboxDispatcherService(bed.conn, bed.tenantCtx, cfg);
  const ledgerAudit = new AuditService(bed.conn, bed.tenantCtx);
  ops = new OutboxOpsService(bed.conn, bed.tenantCtx, cfg, ledgerAudit, dispatcher);
  const bridge = new BeyuIdentityBridge(bed.conn);
  billing = new BillingService(
    new BillingRepository(bed.conn, bed.tenantCtx),
    ledgerAudit,
    bed.tenantCtx,
    outbox,
    bridge,
  );

  // Canonical identity for the acting human (Phase 7 federation contract):
  // register with the REAL root, then bridge the sector test actor to it —
  // exactly how production links sector users to canonical GlobalUserIds.
  const reg = await rootFetch("/api/v1/internal/identity/register", {
    email: `phase8-chain-${RUN_ID}@beyu.test`,
    displayName: "Phase 8 Chain Test",
    tenantCode: "BEYU-HEALTH",
    sector: "HEALTH_OS",
    sectorUserId: `sec-${RUN_ID}`,
  });
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`canonical identity federation failed: ${reg.status} ${JSON.stringify(reg.json)}`);
  }
  canonicalActorId = reg.json?.data?.globalUserId ?? reg.json?.data?.id;
  if (!canonicalActorId) throw new Error("no globalUserId in federation response");
  await bridge.linkUser({
    globalUserId: TEST_ACTOR.userId,
    beyuUserId: canonicalActorId,
    linkedBy: "phase8-integration",
  });
  const link = await bridge.getLink(TEST_ACTOR.userId);
  if (link?.beyuUserId !== canonicalActorId) throw new Error("canonical link not established");

  root = new Client({ connectionString: ROOT_DB });
  await root.connect();
});

afterAll(async () => {
  if (root) await root.end().catch(() => undefined);
});

d("cross-OS governed finance event chain (live root)", () => {
  let invoice: Record<string, unknown>;
  let invoiceEventId: string;

  it("billing transaction atomically stages the governed event in the outbox", async () => {
    const patient = await bed.seedPatient();
    invoice = (await asSectorActor(async () =>
      billing.createInvoice({
        patient_id: patient.patient_id,
        items: [{ description: "OPD Consultation", qty: 1, unit_price: 12500 }],
        currency: "TZS",
      }),
    )) as Record<string, unknown>;
    expect(invoice.invoice_id).toBeTruthy();

    const row = (await bed.run(async () => outbox.row(`beyu-evt:invoice:${invoice.invoice_id}`))) as Record<
      string,
      unknown
    > | null;
    expect(row).not.toBeNull();
    expect(row!.status).toBe("pending");
    expect(row!.provider).toBe("beyu.events");
    const envelope = row!.request_payload as Record<string, unknown>;
    expect(envelope.eventType).toBe("health.billing.invoice_created");
    expect(envelope.actorGlobalUserId).toBe(canonicalActorId);
    // Finance-scoped payload: no patient identifiers cross the boundary.
    expect(JSON.stringify(envelope.payload)).not.toContain(String(patient.patient_id));
  });

  it("dispatcher delivers to the live root and BEYU records the governed enterprise event", async () => {
    const summary = await dispatcher.dispatchDueBatch();
    expect(summary.delivered).toBeGreaterThanOrEqual(1);

    const row = (await bed.run(async () => outbox.row(`beyu-evt:invoice:${invoice.invoice_id}`))) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe("delivered");
    const resp = row.response_payload as { accepted: boolean; eventId: string };
    expect(resp.accepted).toBe(true);
    invoiceEventId = resp.eventId;
    expect(invoiceEventId).toMatch(/^EVT_/);

    // ── Root PostgreSQL: idempotency receipt ──
    const receipt = await root.query(
      `SELECT event_id, duplicate_count, source FROM internal_event_receipts
        WHERE idempotency_key = $1`,
      [`beyu-evt:invoice:${invoice.invoice_id}`],
    );
    expect(receipt.rows).toHaveLength(1);
    expect(receipt.rows[0].event_id).toBe(invoiceEventId);
    expect(receipt.rows[0].duplicate_count).toBe(0);
    expect(receipt.rows[0].source).toBe("HEALTH_OS");

    // ── Root PostgreSQL: the governed enterprise event ──
    const evt = await root.query(
      `SELECT id, type, source, domain, operation, subject_type, subject_id, actor_type,
              actor_user_id, hash_version, prev_hash, correlation_id, payload
         FROM enterprise_events WHERE id = $1`,
      [invoiceEventId],
    );
    expect(evt.rows).toHaveLength(1);
    const e = evt.rows[0];
    expect(e.type).toBe("health.billing.invoice_created");
    expect(e.source).toBe("HEALTH_OS");
    expect(e.domain).toBe("finance");
    expect(e.operation).toBe("billing.event");
    expect(e.subject_type).toBe("invoice");
    expect(e.subject_id).toBe(String(invoice.invoice_id));
    expect(e.actor_type).toBe("SERVICE");
    expect(e.actor_user_id).toBe(canonicalActorId);
    expect(e.hash_version).toBe("2");
    expect(e.prev_hash).not.toBeNull();
    expect((e.payload as Record<string, unknown>).sectorEventId).toBe(`health-inv-${invoice.invoice_id}`);

    // ── Root PostgreSQL: SERVICE-actor audit row ──
    const audit = await root.query(
      `SELECT action, outcome, actor_type FROM audit_log
        WHERE object_id = $1 AND action = 'internal.events.publish'`,
      [invoiceEventId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].outcome).toBe("SUCCESS");
    expect(audit.rows[0].actor_type).toBe("SERVICE");
  });

  it("simulated crash-redelivery stays EXACTLY-ONCE at the business level", async () => {
    // Requeue the delivered row (operator replay path) and deliver again:
    // BEYU must return the ORIGINAL event id as a duplicate.
    await bed.run(async () => {
      await bed.conn.query(
        `UPDATE health.beyu_outbox SET status='pending', attempt_count=0, next_attempt_at=NULL
          WHERE idempotency_key=$1`,
        [`beyu-evt:invoice:${invoice.invoice_id}`],
      );
    });
    const summary = await dispatcher.dispatchDueBatch();
    expect(summary.duplicates).toBeGreaterThanOrEqual(1);

    const row = (await bed.run(async () => outbox.row(`beyu-evt:invoice:${invoice.invoice_id}`))) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe("delivered");
    const resp = row.response_payload as { duplicate: boolean; eventId: string };
    expect(resp.duplicate).toBe(true);
    expect(resp.eventId).toBe(invoiceEventId);

    // EXACTLY ONE enterprise event for this business occurrence.
    const count = await root.query(
      `SELECT count(*)::int AS n FROM enterprise_events
        WHERE payload->>'sectorEventId' = $1`,
      [`health-inv-${invoice.invoice_id}`],
    );
    expect(count.rows[0].n).toBe(1);
    // The receipt counted exactly ONE duplicate delivery.
    const receipt = await root.query(
      `SELECT duplicate_count FROM internal_event_receipts WHERE idempotency_key = $1`,
      [`beyu-evt:invoice:${invoice.invoice_id}`],
    );
    expect(receipt.rows[0].duplicate_count).toBe(1);
  });

  it("payment events flow through the same governed chain", async () => {
    const patient = await bed.seedPatient();
    const inv = (await asSectorActor(async () =>
      billing.createInvoice({
        patient_id: patient.patient_id,
        items: [{ description: "Lab Panel", qty: 1, unit_price: 9000 }],
        currency: "TZS",
      }),
    )) as Record<string, unknown>;
    const pay = (await asSectorActor(async () =>
      billing.recordPayment({ patient_id: patient.patient_id, amount: 9000, method: "cash" }),
    )) as Record<string, unknown>;
    expect(pay.payment_id).toBeTruthy();

    await dispatcher.dispatchDueBatch();
    const row = (await bed.run(async () => outbox.row(`beyu-evt:payment:${pay.payment_id}`))) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe("delivered");

    const receipt = await root.query(
      `SELECT event_id FROM internal_event_receipts WHERE idempotency_key = $1`,
      [`beyu-evt:payment:${pay.payment_id}`],
    );
    expect(receipt.rows).toHaveLength(1);
    const evt = await root.query(
      `SELECT type, domain, subject_type, actor_user_id FROM enterprise_events WHERE id = $1`,
      [receipt.rows[0].event_id],
    );
    expect(evt.rows[0].type).toBe("health.billing.payment_received");
    expect(evt.rows[0].domain).toBe("finance");
    expect(evt.rows[0].actor_user_id).toBe(canonicalActorId);
  });

  it("reconciliation reports the live chain consistent (outbox ↔ BEYU receipts)", async () => {
    const report = await ops.reconcile({ repair: false, limit: 100 });
    expect(report.checked).toBeGreaterThanOrEqual(2);
    expect(report.consistent).toContain(`beyu-evt:invoice:${invoice.invoice_id}`);
    expect(report.unknown).toHaveLength(0);
    expect(report.deliveredWithoutAcceptance).toHaveLength(0);
  });
});
