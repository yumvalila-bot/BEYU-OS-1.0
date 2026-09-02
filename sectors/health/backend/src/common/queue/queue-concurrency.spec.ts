/**
 * Queue concurrency / race tests:
 *  - concurrent enqueues with same idempotency key deduplicate (single id)
 *  - poison messages route to DLQ after max attempts under retry storm
 *  - graceful drain waits for in-flight jobs to settle
 *  - backend BLOCKED when QUEUE_BACKEND=redis and no URL
 */
import "reflect-metadata";
import { QueueService, JobEnvelope } from "./queue.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mkCfg(overrides: Record<string, string> = {}): any {
  return { get: (k: string, d?: any) => overrides[k] ?? d };
}

function job(
  action: string,
  idem: string,
  payload: Record<string, unknown> = {},
): JobEnvelope {
  return {
    idempotencyKey: idem,
    correlationId: "c",
    causationId: null,
    requestId: "r",
    globalUserId: "00000000-0000-0000-0000-000000000001",
    tenantId: "11111111-1111-1111-1111-111111111111",
    entityCode: null,
    countryCode: "TZ",
    provider: "health-os",
    action,
    payload,
    maxAttempts: 3,
    backoffMs: 1,
  };
}

describe("Queue concurrency hardening", () => {
  let q: QueueService;
  beforeEach(() => {
    q = new QueueService(mkCfg({ NODE_ENV: "test", QUEUE_BACKEND: "memory" }));
  });
  afterEach(async () => {
    await q.onModuleDestroy();
  });

  it("concurrent enqueues with same idempotency key return a single job id", async () => {
    q.registerHandler("dedup", async () => {
      /* no-op */
    });
    q.startWorkers(2);
    const idem = "idem-" + Date.now();
    const jobs = await Promise.all(
      Array.from({ length: 20 }).map(() => q.enqueue(job("dedup", idem))),
    );
    expect(new Set(jobs).size).toBe(1);
    await sleep(150);
    expect(q.health().dead).toBe(0);
  });

  it("poison messages route to DLQ after max attempts under retry storm", async () => {
    let attempts = 0;
    q.registerHandler("poison", async () => {
      attempts += 1;
      throw new Error("POISON");
    });
    q.startWorkers(2);
    await q.enqueue(job("poison", "j1"));
    await sleep(500);
    expect(attempts).toBe(3);
    expect(q.health().dead).toBe(1);
  });

  it("onModuleDestroy drains in-flight jobs (graceful shutdown)", async () => {
    let finished = 0;
    q.registerHandler("slow", async () => {
      await sleep(20);
      finished += 1;
    });
    q.startWorkers(1);
    for (let i = 0; i < 2; i++) await q.enqueue(job("slow", "s" + i));
    await sleep(30); // let first job start
    await q.onModuleDestroy();
    // At least the in-flight job must complete.
    expect(finished).toBeGreaterThanOrEqual(1);
  });

  it("QUEUE_BACKEND=redis without REDIS_URL → backend=blocked; enqueue throws", () => {
    const q2 = new QueueService(
      mkCfg({ NODE_ENV: "production", QUEUE_BACKEND: "redis" }),
    );
    expect(q2.backend).toBe("blocked");
    expect(() => q2.enqueue(job("x", "y"))).rejects.toThrow(/BLOCKED/);
  });
});
