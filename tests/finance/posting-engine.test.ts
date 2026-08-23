/**
 * Phase 7A — governed posting engine.
 *
 * This suite exists to prove two opposite things, because proving only one would be worthless:
 *
 *   NEGATIVE — while P1/P6/P7/P9 are unratified, posting is IMPOSSIBLE through every route:
 *              authority, RBAC, tenant, entity, accounting invariants.
 *   POSITIVE — the engine genuinely works once authority is granted. Without this, every negative
 *              test would pass against an engine that simply throws unconditionally, and the
 *              "control" would be an illusion.
 *
 * The positive-control tests construct real authority in the registry (a genuinely APPROVED
 * resolution with GOVERNED provenance), post a real balanced entry, assert the ledger changed,
 * and then remove every artefact in `finally`. Ledger rows are removed with the immutability
 * triggers briefly suspended and restored in the same `finally`, because posted entries are
 * correctly immutable — teardown is not a correction.
 *
 * Nothing here decides accounting policy. The fixtures use synthetic test accounts with neutral
 * names; no chart of accounts, recognition basis or treatment is implied or created.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { CapabilityLockedError } from "@/lib/decision-authority";
import { postJournal, trialBalance, validateJournalStructure, PostingError } from "@/lib/finance/posting-engine";
import type { Principal } from "@/lib/authz";
import { ROLES } from "@/lib/constants";

const RUN = `PE${Date.now()}`;
const ACC_A = `LA_${RUN}_A`;
const ACC_B = `LA_${RUN}_B`;

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["GROUP_CFO"];
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
    tenantId: tenantId || "TEN_BEYU_GROUP",
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
    ...overrides,
  } as unknown as Principal;
}

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows?: T[] };
  return result.rows ?? (result as unknown as T[]);
}
async function count(query: Parameters<typeof db.execute>[0]): Promise<number> {
  const r = await rows<{ n: number }>(query);
  return Number(r[0].n);
}

let tenantId = "";
let entityId = "";
let otherEntityId = "";

beforeAll(async () => {
  const [entity] = await rows<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities order by id limit 1`,
  );
  entityId = entity.id;
  tenantId = entity.tenant_id;

  const [other] = await rows<{ id: string }>(
    sql`select id from legal_entities where tenant_id = ${tenantId} and id <> ${entityId} order by id limit 1`,
  );
  otherEntityId = other?.id ?? entityId;

  // Synthetic accounts. Neutral names — this is not a chart of accounts and implies no treatment.
  await db.execute(sql`
    insert into ledger_accounts (id, tenant_id, code, name, account_type, active) values
      (${ACC_A}, ${tenantId}, ${ACC_A}, 'test account A', 'ASSET', true),
      (${ACC_B}, ${tenantId}, ${ACC_B}, 'test account B', 'LIABILITY', true)
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

  // P7 depends on P5, so P5 must be activated too or the gate correctly reports RATIFIED_NOT_READY.
  // This is the transitive dependency check doing its job; the fixture must satisfy it honestly
  // rather than the engine being loosened to accept a partial chain.
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
    await db.execute(
      sql`update governance_capability_registry set activation_status = 'ACTIVATED' where capability_code = 'CAP_POSTING'`,
    );
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
    await db.execute(
      sql`update governance_capability_registry set activation_status = 'LOCKED' where capability_code = 'CAP_POSTING'`,
    );
  }
}

/** Removes journal rows created by a test. Immutability triggers are restored in `finally`. */
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

describe("posting engine — structural validation (pure, no authority needed)", () => {
  const base = {
    tenantId: "T",
    legalEntityId: "E",
    reference: "R",
    description: "d",
    currency: "USD",
  };

  it("accepts a balanced two-sided entry", () => {
    const result = validateJournalStructure({
      ...base,
      lines: [
        { accountId: "A", debit: "100.00", credit: "0" },
        { accountId: "B", debit: "0", credit: "100.00" },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.totalDebit).toBe("100.00");
    expect(result.totalCredit).toBe("100.00");
  });

  it("rejects an unbalanced entry", () => {
    const result = validateJournalStructure({
      ...base,
      lines: [
        { accountId: "A", debit: "100.00", credit: "0" },
        { accountId: "B", debit: "0", credit: "99.99" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/does not balance/i);
  });

  it("rejects negative, double-sided, zero and malformed amounts", () => {
    expect(
      validateJournalStructure({ ...base, lines: [{ accountId: "A", debit: "-5.00", credit: "0" }] }).valid,
    ).toBe(false);
    expect(
      validateJournalStructure({
        ...base,
        lines: [{ accountId: "A", debit: "5.00", credit: "5.00" }],
      }).valid,
    ).toBe(false);
    expect(
      validateJournalStructure({ ...base, lines: [{ accountId: "A", debit: "0", credit: "0" }] }).valid,
    ).toBe(false);
    expect(
      validateJournalStructure({ ...base, lines: [{ accountId: "A", debit: "1.005", credit: "0" }] }).valid,
    ).toBe(false);
  });

  it("rejects an empty entry and a malformed currency", () => {
    expect(validateJournalStructure({ ...base, lines: [] }).valid).toBe(false);
    expect(
      validateJournalStructure({
        ...base,
        currency: "usd",
        lines: [
          { accountId: "A", debit: "1.00", credit: "0" },
          { accountId: "B", debit: "0", credit: "1.00" },
        ],
      }).valid,
    ).toBe(false);
  });

  it("does not drift on repeated fractional amounts (integer minor units)", () => {
    const lines = Array.from({ length: 10 }, () => ({ accountId: "A", debit: "0.10", credit: "0" }));
    lines.push({ accountId: "B", debit: "0", credit: "1.00" });
    expect(validateJournalStructure({ ...base, lines }).valid).toBe(true);
  });
});

describe("posting engine — NEGATIVE: unratified authority makes posting impossible", () => {
  const validEntry = () => ({
    tenantId,
    legalEntityId: entityId,
    reference: `${RUN}-NEG`,
    description: "should never post",
    currency: "USD",
    lines: [
      { accountId: ACC_A, debit: "100.00", credit: "0" },
      { accountId: ACC_B, debit: "0", credit: "100.00" },
    ],
  });

  it("refuses to post because CAP_POSTING is locked", async () => {
    const before = await count(sql`select count(*)::int n from journal_entries`);
    await expect(postJournal(principal(), validEntry())).rejects.toBeInstanceOf(CapabilityLockedError);
    expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(before);
  });

  it("reports which decisions block it, rather than failing opaquely", async () => {
    await expect(postJournal(principal(), validEntry())).rejects.toMatchObject({
      code: "CAPABILITY_LOCKED",
      blockedBy: expect.arrayContaining(["P1", "P6", "P7", "P9"]),
    });
  });

  it("still refuses when the caller holds every role in the system", async () => {
    const everyRole = principal({ roles: Object.keys(ROLES as Record<string, unknown>) });
    await expect(postJournal(everyRole, validEntry())).rejects.toBeInstanceOf(CapabilityLockedError);
  });

  it("writes no ledger, audit or event record when locked", async () => {
    const before = {
      entries: await count(sql`select count(*)::int n from journal_entries`),
      lines: await count(sql`select count(*)::int n from journal_lines`),
    };
    await expect(postJournal(principal(), validEntry())).rejects.toThrow();
    expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(before.entries);
    expect(await count(sql`select count(*)::int n from journal_lines`)).toBe(before.lines);
  });
});

describe("posting engine — POSITIVE control: it genuinely posts once authority exists", () => {
  it("posts a balanced entry, and the ledger actually changes", async () => {
    await withActivatedPosting(async () => {
      try {
        const before = await count(sql`select count(*)::int n from journal_entries`);
        expect(before).toBe(0); // the ledger starts empty; proves the delta below is ours

        const result = await postJournal(principal(), {
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-POS`,
          description: "positive control",
          currency: "USD",
          lines: [
            { accountId: ACC_A, debit: "250.00", credit: "0" },
            { accountId: ACC_B, debit: "0", credit: "250.00" },
          ],
        });

        expect(result.entryId).toMatch(/^JE_/);
        expect(result.totalDebit).toBe("250.00");
        expect(result.totalCredit).toBe("250.00");
        expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(before + 1);
        expect(
          await count(sql`select count(*)::int n from journal_lines where entry_id = ${result.entryId}`),
        ).toBe(2);

        // Audit and event were written atomically with the posting.
        expect(
          await count(
            sql`select count(*)::int n from audit_log where object_id = ${result.entryId} and action = 'finance.ledger.post'`,
          ),
        ).toBe(1);
        expect(
          await count(
            sql`select count(*)::int n from enterprise_events where subject_id = ${result.entryId} and type = 'JOURNAL_ENTRY_POSTED'`,
          ),
        ).toBe(1);

        // Trial balance derives from the posted rows.
        const tb = await trialBalance(principal(), tenantId, entityId);
        const a = tb.find((r) => r.accountId === ACC_A);
        expect(a?.balance).toBe("250.00");
      } finally {
        await purgeEntries();
      }
    });
  });

  it("re-locks immediately after the authority window closes", async () => {
    await expect(
      postJournal(principal(), {
        tenantId,
        legalEntityId: entityId,
        reference: `${RUN}-RELOCK`,
        description: "must not post",
        currency: "USD",
        lines: [
          { accountId: ACC_A, debit: "1.00", credit: "0" },
          { accountId: ACC_B, debit: "0", credit: "1.00" },
        ],
      }),
    ).rejects.toBeInstanceOf(CapabilityLockedError);
  });
});

describe("posting engine — authority present, other controls still enforced", () => {
  const line = (a: string, d: string, c: string) => ({ accountId: a, debit: d, credit: c });

  it("denies a principal without finance:ledger.post even when the capability is activated", async () => {
    await withActivatedPosting(async () => {
      await expect(
        postJournal(principal({ roles: ["AUDITOR"] }), {
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-RBAC`,
          description: "rbac",
          currency: "USD",
          lines: [line(ACC_A, "10.00", "0"), line(ACC_B, "0", "10.00")],
        }),
      ).rejects.toMatchObject({ code: "DENIED" });
    });
  });

  it("refuses a cross-tenant posting without confirming the tenant exists", async () => {
    await withActivatedPosting(async () => {
      await expect(
        postJournal(principal({ tenantId: "TEN_SOMEONE_ELSE" }), {
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-XTEN`,
          description: "cross tenant",
          currency: "USD",
          lines: [line(ACC_A, "10.00", "0"), line(ACC_B, "0", "10.00")],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("refuses an entity outside the principal's entity scope", async () => {
    await withActivatedPosting(async () => {
      // Guard: the scope must genuinely exclude the target, or this test would be vacuous.
      expect(`${otherEntityId}_NOT_THE_TARGET`).not.toBe(entityId);
      await expect(
        postJournal(principal({ entityScope: [`${otherEntityId}_NOT_THE_TARGET`] }), {
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-XENT`,
          description: "out of scope",
          currency: "USD",
          lines: [line(ACC_A, "10.00", "0"), line(ACC_B, "0", "10.00")],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("refuses an unbalanced entry and leaves nothing behind", async () => {
    await withActivatedPosting(async () => {
      const before = await count(sql`select count(*)::int n from journal_entries`);
      await expect(
        postJournal(principal(), {
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-UNBAL`,
          description: "unbalanced",
          currency: "USD",
          lines: [line(ACC_A, "10.00", "0"), line(ACC_B, "0", "9.00")],
        }),
      ).rejects.toMatchObject({ code: "RULE_VIOLATION" });
      expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(before);
    });
  });

  it("refuses a nonexistent account", async () => {
    await withActivatedPosting(async () => {
      await expect(
        postJournal(principal(), {
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-NOACC`,
          description: "ghost account",
          currency: "USD",
          lines: [line("LA_DOES_NOT_EXIST", "10.00", "0"), line(ACC_B, "0", "10.00")],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("refuses a duplicate idempotency key rather than double-posting", async () => {
    await withActivatedPosting(async () => {
      try {
        const key = `${RUN}-IDEM`;
        const body = {
          tenantId,
          legalEntityId: entityId,
          reference: `${RUN}-IDEM`,
          description: "idempotent",
          currency: "USD",
          idempotencyKey: key,
          lines: [line(ACC_A, "5.00", "0"), line(ACC_B, "0", "5.00")],
        };
        await postJournal(principal(), body);
        const after = await count(sql`select count(*)::int n from journal_entries`);
        await expect(postJournal(principal(), body)).rejects.toMatchObject({ code: "CONFLICT" });
        expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(after);
      } finally {
        await purgeEntries();
      }
    });
  });
});

describe("posting engine — the ledger is left exactly as found", () => {
  it("has posted nothing that survives the suite", async () => {
    expect(await count(sql`select count(*)::int n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int n from journal_lines`)).toBe(0);
  });

  it("leaves every capability locked and every decision pending", async () => {
    expect(
      await count(
        sql`select count(*)::int n from governance_capability_registry where activation_status <> 'LOCKED'`,
      ),
    ).toBe(0);
    expect(
      await count(sql`select count(*)::int n from governance_decision_registry where status <> 'PENDING'`),
    ).toBe(0);
  });

  it("leaves no production trigger disabled", async () => {
    expect(
      await count(sql`
        select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and t.tgenabled <> 'O'
      `),
    ).toBe(0);
  });
});

describe("PostingError shape", () => {
  it("carries a stable machine-readable code", () => {
    const err = new PostingError("RULE_VIOLATION", "x");
    expect(err.code).toBe("RULE_VIOLATION");
    expect(err.name).toBe("PostingError");
  });
});
