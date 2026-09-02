/**
 * Queue engine tests — in-memory backend, retry/backoff, poison DLQ, idempotency,
 * and blocked behavior when QUEUE_BACKEND=redis without Redis.
 */
import "reflect-metadata";
import { QueueService } from "./queue.service";

describe("QueueService", () => {
  it("defaults to memory backend and processes jobs", async () => {
    const q = new QueueService({ get: () => undefined } as any);
    expect(q.backend).toBe("memory");
    let processed = 0;
    q.registerHandler("test.action", async () => {
      processed++;
    });
    q.startWorkers(1);
    const id = await q.enqueue({
      idempotencyKey: "k-1",
      correlationId: "cid",
      requestId: "rid",
      globalUserId: "u",
      tenantId: "t",
      provider: "test",
      action: "test.action",
      payload: {},
    });
    expect(id).toMatch(/^mem_/);
    await waitUntil(() => processed === 1, 1000);
    expect(processed).toBe(1);
    expect(q.health().pending).toBe(0);
    await q.onModuleDestroy();
  });

  it("enforces idempotency — duplicate idempotencyKey returns same id and runs once", async () => {
    const q = new QueueService({ get: () => undefined } as any);
    let count = 0;
    q.registerHandler("idem.action", async () => {
      count++;
    });
    q.startWorkers(1);
    const a = await q.enqueue({
      idempotencyKey: "idem-1",
      correlationId: "c",
      requestId: "r",
      globalUserId: "u",
      tenantId: "t",
      provider: "test",
      action: "idem.action",
      payload: {},
    });
    const b = await q.enqueue({
      idempotencyKey: "idem-1",
      correlationId: "c",
      requestId: "r",
      globalUserId: "u",
      tenantId: "t",
      provider: "test",
      action: "idem.action",
      payload: {},
    });
    expect(a).toBe(b);
    await waitUntil(() => count >= 1, 1000);
    expect(count).toBe(1);
    await q.onModuleDestroy();
  });

  it("poison jobs route to dead-letter after maxAttempts", async () => {
    const q = new QueueService({ get: () => undefined } as any);
    q.registerHandler("poison.action", async () => {
      throw new Error("POISON");
    });
    q.startWorkers(1);
    await q.enqueue({
      idempotencyKey: "p-1",
      correlationId: "c",
      requestId: "r",
      globalUserId: "u",
      tenantId: "t",
      provider: "test",
      action: "poison.action",
      payload: {},
      maxAttempts: 2,
      backoffMs: 5,
    });
    await waitUntil(() => q.health().dead === 1, 2000);
    expect(q.health().dead).toBe(1);
    await q.onModuleDestroy();
  });

  it("production without Redis BLOCKS enqueue", () => {
    const q = new QueueService({
      get: (k: string) => (k === "NODE_ENV" ? "production" : undefined),
    } as any);
    expect(q.backend).toBe("blocked");
    expect(
      q.enqueue({
        idempotencyKey: "x",
        correlationId: "c",
        requestId: "r",
        globalUserId: "u",
        tenantId: "t",
        provider: "test",
        action: "x",
        payload: {},
      }),
    ).rejects.toThrow(/BLOCKED/);
  });
});

async function waitUntil(cond: () => boolean, timeout: number): Promise<void> {
  const start = Date.now();
  while (!cond() && Date.now() - start < timeout)
    await new Promise((r) => setTimeout(r, 10));
  if (!cond()) throw new Error("condition not met within timeout");
}
