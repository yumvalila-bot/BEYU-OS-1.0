/**
 * Deterministic concurrency adversarial tests using PGlite.
 *
 * Exercises atomic update and in-process queue idempotency. Distributed
 * locks (Redis/PG advisory) remain ARCHITECTURE_BLOCKED — tests here
 * validate in-process and single-connection PG correctness only.
 */
import "reflect-metadata";
import { buildE2EHarness, E2EHarness } from "../../common/testing/e2e-harness";
import { QueueService } from "../../common/queue/queue.service";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Concurrency (PGlite, deterministic)", () => {
  jest.setTimeout(60000);
  let h: E2EHarness;
  beforeAll(async () => {
    h = await buildE2EHarness();
  });
  afterAll(async () => {
    if (h) await h.close();
  });

  it("parallel UPSERTs into a keyed table converge without lost updates", async () => {
    await h.conn.exec(
      `CREATE TABLE IF NOT EXISTS __cc_counter (k text PRIMARY KEY, v int NOT NULL DEFAULT 0)`,
    );
    await h.conn.exec(
      `INSERT INTO __cc_counter (k, v) VALUES ('x', 0) ON CONFLICT DO NOTHING`,
    );
    await Promise.all(
      Array.from({ length: 30 }, () =>
        h.conn.exec(`UPDATE __cc_counter SET v = v + 1 WHERE k='x'`),
      ),
    );
    const rows = await h.conn.query<{ v: string }>(
      `SELECT v FROM __cc_counter WHERE k='x'`,
    );
    expect(Number((rows as any[])[0].v)).toBe(30);
  });

  it("queue service dedupes by idempotencyKey (concurrent enqueue → 1 run)", async () => {
    const q = h.app.get(QueueService);
    const key = `idem-${Date.now()}`;
    let counter = 0;
    q.registerHandler("test.concurrent", async () => {
      counter++;
    });
    q.startWorkers(2);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        q.enqueue({
          idempotencyKey: key,
          correlationId: "c",
          requestId: "r",
          globalUserId: "00000000-0000-0000-0000-000000000001",
          tenantId: "11111111-1111-1111-1111-111111111111",
          provider: "test",
          action: "test.concurrent",
          payload: {},
          maxAttempts: 1,
        }),
      ),
    );
    // Wait for in-memory workers to drain.
    for (let i = 0; i < 50; i++) {
      const h_ = q.health();
      if (h_.pending === 0 && h_.processing === 0) break;
      await sleep(50);
    }
    expect(counter).toBe(1);
  });

  it("poison messages land in DLQ (dead) and don't crash workers", async () => {
    const q = h.app.get(QueueService);
    const key = `poison-${Date.now()}`;
    let tries = 0;
    q.registerHandler("test.poison", async () => {
      tries++;
      throw new Error("transient");
    });
    q.startWorkers(1);
    await q.enqueue({
      idempotencyKey: key,
      correlationId: "c",
      requestId: "r",
      globalUserId: "00000000-0000-0000-0000-000000000001",
      tenantId: "11111111-1111-1111-1111-111111111111",
      provider: "test",
      action: "test.poison",
      payload: {},
      maxAttempts: 2,
      backoffMs: 10,
    });
    for (let i = 0; i < 100; i++) {
      const h_ = q.health();
      if (h_.dead >= 1) break;
      await sleep(50);
    }
    expect(tries).toBe(2);
    expect(q.health().dead).toBeGreaterThanOrEqual(1);
  });
});
