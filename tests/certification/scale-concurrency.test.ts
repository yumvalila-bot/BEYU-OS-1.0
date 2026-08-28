/**
 * BEYU OS — production certification: scale & concurrency evidence.
 *
 * Encodes Level III-A/B of the certification program as a reproducible suite:
 *   - concurrent request load on the health (readiness) endpoint,
 *   - concurrent authentication load (unique non-existent accounts so per-account
 *     rate limiting does not confound throughput measurement),
 *   - concurrent audit appends,
 * and asserts, in every case, that the system returns no 5xx / no deadlock /
 * no connection-exhaustion and that the audit + event hash chains remain
 * verifiable (no fork, head matches).
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { verifyAuditChain, verifyEventChain } from "../../src/lib/audit";
import { baseUrl, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
const base = baseUrl();

async function concurrent(fn: (i: number) => Promise<void>, n: number, c: number) {
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const i = idx++;
      if (i >= n) return;
      await fn(i);
    }
  };
  await Promise.all(Array.from({ length: c }, worker));
}

function rnd() { return Math.random().toString(36).slice(2, 12); }

describe("Level III-A — concurrent request load", () => {
  it.skipIf(!available)("1000 health requests at c=200 return all 200 and chains stay verifiable", async () => {
    const beforeA = await verifyAuditChain();
    const beforeE = await verifyEventChain();
    let ok = 0, err = 0;
    const statuses: Record<number, number> = {};
    await concurrent(async () => {
      try {
        const s = await fetch(`${base}/api/health`).then((r) => r.status);
        statuses[s] = (statuses[s] ?? 0) + 1;
        if (s === 200) ok++; else err++;
      } catch { err++; }
    }, 1000, 200);
    expect(ok).toBe(1000);
    expect(err).toBe(0);
    expect(Object.keys(statuses)).toEqual(["200"]);
    // Concurrent load must not corrupt the audit/event chains.
    const afterA = await verifyAuditChain();
    const afterE = await verifyEventChain();
    expect(afterA.verified).toBe(true);
    expect(afterA.duplicateParents).toBe(0);
    expect(afterA.headMatches).toBe(true);
    expect(afterA.records).toBeGreaterThanOrEqual(beforeA.records);
    expect(afterE.verified).toBe(true);
    expect(afterE.records).toBeGreaterThanOrEqual(beforeE.records);
  }, 120_000);
});

describe("Level III-A/B — concurrent authentication load", () => {
  it.skipIf(!available)("120 login requests (unique accounts, c=30) → all 401, no 5xx, no deadlock, no connection exhaustion", async () => {
    const beforeA = await verifyAuditChain();
    let ok401 = 0, other = 0;
    const statuses: Record<number, number> = {};
    const saw429 = { v: false };
    await concurrent(async () => {
      const email = `load_${Date.now()}_${rnd()}@nonexist.test`;
      try {
        const s = await fetch(`${base}/api/v1/auth/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password: "wrongpass123456" }),
        }).then((r) => r.status);
        statuses[s] = (statuses[s] ?? 0) + 1;
        if (s === 401) ok401++; else if (s === 429) saw429.v = true; else other++;
      } catch { other++; }
    }, 120, 30);
    // Every request is a clean 401 (unique accounts never share a rate bucket).
    expect(saw429.v).toBe(false);
    expect(other).toBe(0);
    expect(ok401).toBe(120);
    // The audit chain absorbed the concurrent tenant-less DENIED appends intact.
    const afterA = await verifyAuditChain();
    expect(afterA.verified).toBe(true);
    expect(afterA.duplicateParents).toBe(0);
    expect(afterA.headMatches).toBe(true);
    expect(afterA.records).toBeGreaterThanOrEqual(beforeA.records);
  }, 120_000);
});

describe("Level III-B — concurrent audit writes (load-derived)", () => {
  it("250 concurrent recordAudit calls produce a fork-free chain", async () => {
    const beforeA = await verifyAuditChain();
    const { recordAudit } = await import("../../src/lib/audit");
    await concurrent(
      async (i) => {
        await recordAudit({
          action: "cert.audit.concurrent",
          objectType: "CERT",
          objectId: `load-${i}`,
        });
      },
      250,
      50,
    );
    const afterA = await verifyAuditChain();
    expect(afterA.verified).toBe(true);
    expect(afterA.duplicateParents).toBe(0);
    expect(afterA.headMatches).toBe(true);
    expect(afterA.records).toBe(beforeA.records + 250);
  }, 120_000);
});
