/**
 * BEYU OS — Full-spectrum chaos, failure-injection, crash/restart, concurrency
 * and error-continuity verification (Stages 10–13, 15, 17 of the audit).
 *
 * These tests target the invariant "an operation either commits atomically with
 * its audit + event evidence and its idempotency claim, or leaves nothing
 * behind", under injected failures and concurrency. They also verify the error
 * boundary does not leak secrets and that transport-level controls are enforced
 * by execution against the real server (not by source-grep).
 *
 * DB-level tests run on the privileged TEST role (tests/setup-env.ts), matching
 * the unit suite contract; HTTP-level tests require the running server and skip
 * when it is absent.
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { ledgerAccounts, journalEntries } from "../../src/db/schema";
import { type Principal } from "../../src/lib/authz";
import { ROLES } from "../../src/lib/constants";
import { postJournal, trialBalance } from "../../src/lib/finance/posting-engine";
import { verifyAuditChain, verifyEventChain } from "../../src/lib/audit";
import { serverAvailable, apiPost, baseUrl } from "../helpers/http";

const RUN = `CHAOS${Date.now()}`;
const ACC_A = `LA_${RUN}_A`;
const ACC_B = `LA_${RUN}_B`;

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows?: T[] };
  return result.rows ?? (result as unknown as T[]);
}
async function count(query: Parameters<typeof db.execute>[0]): Promise<number> {
  const r = await rows<{ n: number }>(query);
  return Number(r[0].n);
}

function principal(): Principal {
  const roles = ["GROUP_CFO"];
  const permissions = new Set<never>();
  for (const role of roles) {
    const def = (ROLES as Record<string, { permissions?: readonly string[] }>)[role];
    for (const p of def?.permissions ?? []) permissions.add(p as never);
  }
  return {
    userId: "USR_TEST_POSTER",
    partyId: "p",
    email: "t@example.test",
    displayName: "Test",
    tenantId: tenantId ?? "TEN_BEYU_GROUP",
    tenantCode: "BEYU",
    tenantType: "GROUP",
    roles,
    permissions,
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "s",
    riskScore: 0,
    emergencyPermissions: [],
  } as unknown as Principal;
}

let tenantId = "";
let entityId = "";

beforeAll(async () => {
  const [entity] = await rows<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities order by id limit 1`,
  );
  entityId = entity.id;
  tenantId = entity.tenant_id;
  await db.execute(sql`
    insert into ledger_accounts (id, tenant_id, code, name, account_type, active) values
      (${ACC_A}, ${tenantId}, ${ACC_A}, 'chaos test account A', 'ASSET', true),
      (${ACC_B}, ${tenantId}, ${ACC_B}, 'chaos test account B', 'LIABILITY', true)
  `);
});

afterAll(async () => {
  await db.execute(sql`delete from ledger_accounts where id like ${`LA_${RUN}%`}`);
});

/** Grants genuine authority for CAP_POSTING, runs `fn`, then restores the registry. */
async function withActivatedPosting<T>(fn: () => Promise<T>): Promise<T> {
  const [approved] = await rows<{ id: string }>(
    sql`select id from resolutions where status = 'APPROVED' limit 1`,
  );
  expect(approved?.id, "no APPROVED resolution to build authority from").toBeTruthy();
  const decisions = ["P1", "P5", "P6", "P7", "P9"];
  try {
    for (const d of decisions) {
      await db.execute(sql`
        update governance_decision_registry
        set status = 'ACTIVATED', activation_status = 'ACTIVATED', resolution_id = ${approved.id},
            provenance = 'GOVERNED', approval_date = '2020-01-01', effective_from = '2020-01-01',
            approving_body = 'TEST', decision_maker = 'TEST', scope = '{}'::jsonb,
            conditions = 'test', evidence = 'test'
        where decision_id = ${d}
      `);
    }
    await db.execute(sql`
      update governance_capability_registry set activation_status = 'ACTIVATED' where capability_code = 'CAP_POSTING'
    `);
    return await fn();
  } finally {
    for (const d of decisions) {
      await db.execute(sql`
        update governance_decision_registry
        set status = 'PENDING', activation_status = 'LOCKED', resolution_id = null, provenance = null,
            approval_date = null, effective_from = null, effective_to = null, approving_body = null,
            decision_maker = null, scope = null, conditions = null, evidence = null
        where decision_id = ${d}
      `);
    }
    await db.execute(sql`
      update governance_capability_registry set activation_status = 'LOCKED' where capability_code = 'CAP_POSTING'
    `);
  }
}

async function purgeEntries() {
  try {
    await db.execute(sql`alter table journal_lines disable trigger user`);
    await db.execute(sql`alter table journal_entries disable trigger user`);
    await db.execute(sql`delete from journal_lines where id like ${`JL_JE_%`}`);
    await db.execute(sql`delete from journal_entries where source = 'GOVERNED_POSTING'`);
  } finally {
    await db.execute(sql`alter table journal_lines enable trigger user`);
    await db.execute(sql`alter table journal_entries enable trigger user`);
  }
}

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    tenantId,
    legalEntityId: entityId,
    reference: `${RUN}-E`,
    description: "chaos entry",
    currency: "USD",
    lines: [
      { accountId: ACC_A, debit: "100.00", credit: "0" },
      { accountId: ACC_B, debit: "0", credit: "100.00" },
    ],
    ...overrides,
  } as Parameters<typeof postJournal>[1];
}

describe("Stage 10/12 — failure injection atomicity", () => {
  it("a crash mid-transaction rolls back the domain row and leaves no orphan", async () => {
    const orphanId = `JE_${RUN}_ORPHAN`;
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(journalEntries).values({
          id: orphanId,
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-ORPHAN`,
          description: "must roll back",
          currency: "USD",
          postedBy: "USR_TEST",
        });
        await tx.insert(sql`unused` as never);
        throw new Error("simulated crash before commit");
      }),
    ).rejects.toThrow("simulated crash");
    // Nothing survived the aborted transaction.
    expect(await count(sql`select count(*)::int n from journal_entries where id = ${orphanId}`)).toBe(0);
    expect(
      await count(sql`select count(*)::int n from journal_lines where entry_id = ${orphanId}`),
    ).toBe(0);
  });

  it("the audit and event hash chains remain verifiable after a failed mutation", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(journalEntries).values({
          id: `JE_${RUN}_FAIL`,
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-FAIL`,
          description: "must roll back",
          currency: "USD",
          postedBy: "USR_TEST",
        });
        throw new Error("injected audit-write failure");
      }),
    ).rejects.toThrow();
    const audit = await verifyAuditChain();
    const events = await verifyEventChain();
    expect(audit.verified).toBe(true);
    expect(events.verified).toBe(true);
    expect(audit.duplicateParents).toBe(0);
    expect(events.duplicateParents).toBe(0);
  });
});

describe("Stage 11 — concurrency: idempotent posting under a race", () => {
  it("concurrent posts with one idempotency key produce exactly one entry and one audit", async () => {
    await withActivatedPosting(async () => {
      try {
        const before = await count(sql`select count(*)::int n from journal_entries`);
        const key = `${RUN}-CONCURRENT`;
        // DISTINCT references but the SAME idempotency key, so the reference
        // unique index cannot mask the idempotency guard. A race-safe engine
        // must allow exactly one posting for this key.
        const attempts = await Promise.allSettled(
          Array.from({ length: 8 }, (_, i) =>
            postJournal(
              principal(),
              validEntry({ idempotencyKey: key, reference: `${RUN}-CONCURRENT-${i}` }),
            ),
          ),
        );
        const fulfilled = attempts.filter((a) => a.status === "fulfilled");
        const rejected = attempts.filter((a) => a.status === "rejected");
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(7);
        expect(await count(sql`select count(*)::int n from journal_entries where idempotency_key = ${key}`)).toBe(1);
        expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(before + 1);
        // Atomic audit + event evidence for the single winning posting.
        expect(
          await count(sql`select count(*)::int n from audit_log where action='finance.ledger.post' and object_id in (select id from journal_entries where idempotency_key = ${key})`),
        ).toBe(1);
        const tb = await trialBalance(principal(), tenantId, entityId);
        const a = tb.find((r) => r.accountId === ACC_A);
        const b = tb.find((r) => r.accountId === ACC_B);
        expect(a?.balance).toBe("100.00");
        expect(b?.balance).toBe("-100.00");
      } finally {
        await purgeEntries();
      }
    });
  });
});

const available = await serverAvailable();
const probeEmail = `sqli${Date.now()}@beyu.os`;

describe("Stage 15 — red-team: no SQL injection / no secret leakage at the transport boundary", () => {

  it.skipIf(!available)("login rejects SQL-injection-shaped identifiers without a 500 or SQL detail", async () => {
    const res = await apiPost<{ error?: { code?: string } }>("/api/v1/auth/login", {
      email: `' OR '1'='1' --`,
      password: "wrong-password",
    });
    expect(res.status).not.toBe(500);
    // zod email validation rejects it before any DB access; never a raw SQL error.
    expect([422, 401, 429]).toContain(res.status);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/\bpostgres\b|syntax error|\bpg_[a-z_]+|DATABASE_URL|at Client|at Pool|unterminated/i);
  });

  it.skipIf(!available)("malformed payload returns a controlled code and no stack trace", async () => {
    const res = await apiPost<{ error?: { code?: string } }>("/api/v1/auth/login", {});
    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe("VALIDATION_FAILED");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/Error:| at \w+|stack/gi);
    expect(text).not.toMatch(/\bpostgres\b|syntax error/i);
  });

  it.skipIf(!available)("a wrong credential returns 401 with a correlation id and no internal detail", async () => {
    const res = await apiPost<{ error?: { code?: string; traceId?: string } }>("/api/v1/auth/login", {
      email: probeEmail,
      password: "definitely-wrong-password",
    });
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe("INVALID_CREDENTIALS");
    // Correlation is preserved on the error envelope (traceId lives in the error object).
    expect(typeof res.body?.error?.traceId).toBe("string");
    expect(res.body?.error?.traceId?.length).toBeGreaterThan(0);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|mfaSecret|secret|DATABASE_URL|\bpostgres\b|stack/i);
  });

  it.skipIf(!available)("spoofed X-Forwarded-For cannot mint fresh rate-limit buckets", async () => {
    // With BEYU_TRUST_PROXY unset, forwarding headers are ignored; rotating the
    // header must not evade the per-account budget. We probe a throwaway account
    // that has not been locked, and assert the account budget is enforced even
    // when the source header keeps changing.
    // Direct probe: rotating X-Forwarded-For must NOT bypass the account bucket.
    // The per-account budget is 30/min; send 35 failing attempts against a
    // NON-EXISTENT account (which never locks) and require a 429 to appear.
    // Rotating the spoofed source header must not mint fresh per-account buckets.
    let got429 = false;
    for (let i = 0; i < 35; i++) {
      const res = await fetch(`${baseUrl()}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `203.0.113.${i % 4}`,
        },
        body: JSON.stringify({ email: probeEmail, password: "wrong-password-" + i }),
      });
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    // The per-account budget (30/min) must eventually throttle a flood regardless
    // of spoofed source headers — the spoofed header cannot create fresh buckets.
    expect(got429).toBe(true);
  }, 60_000);
});
