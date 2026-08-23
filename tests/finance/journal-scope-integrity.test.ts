import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";

/**
 * JOURNAL SCOPE INTEGRITY — migration 0006.
 *
 * POLICY-INDEPENDENT. Encodes no accounting treatment: nothing here decides
 * recognition, debit/credit, measurement, periods-as-policy, FX or tax.
 *
 * Hostile red-teaming at HEAD 8ef7e8a found two attacks that were BLOCKED AT NO
 * LAYER. Raw SQL could commit a journal whose scope was internally inconsistent:
 *
 *   [I] entry.tenant_id differing from the tenant of the accounts its lines
 *       referenced — a cross-tenant journal;
 *   [J] entry.legal_entity_id differing from the legal entity of the financial
 *       period it was posted into — a cross-entity journal.
 *
 * Migration 0005 governs balance, sign and immutability; the foreign keys prove
 * only that each id exists in isolation. Nothing tied the scopes together.
 *
 * The authority for enforcing this is already ratified and is NOT an accounting
 * decision — Constitution Art. 9 (Tenant Isolation) requires every request to
 * resolve tenant, entity and data scope, and Art. 5 makes financial history
 * immutable, so a mis-scoped entry could never be corrected by edit.
 *
 * KNOWN GAP LEFT OPEN DELIBERATELY: `journal_entries.period_id` is NULLABLE, so
 * an entry may still be posted with no period at all. Whether a period is
 * mandatory is policy decision P7 and belongs to the Group CFO. It is asserted
 * below as a *documented current behaviour*, not endorsed — when P7 is ratified
 * that test must be revisited as part of the authorized tranche.
 */

const rows = <T>(res: unknown): T[] => ((res as { rows?: T[] }).rows ?? (res as T[]));

const RUN = `SCOPE-${Date.now()}`;
const failureText = async (op: () => Promise<unknown>): Promise<string> => {
  try {
    await op();
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    return `${e.cause?.message ?? ""} ${e.message ?? ""}`;
  }
  throw new Error("expected the operation to fail, but it succeeded");
};

async function ids() {
  const [entityA] = rows<{ id: string }>(await db.execute(sql`select id from legal_entities where code = 'BEYU-AGR'`));
  const [entityB] = rows<{ id: string }>(await db.execute(sql`select id from legal_entities where code = 'BEYU-HEA'`));
  const [actor] = rows<{ id: string }>(await db.execute(sql`select id from users limit 1`));
  const [tenantA] = rows<{ id: string }>(await db.execute(sql`select id from tenants where code = 'BEYU-GROUP'`));
  const [tenantB] = rows<{ id: string }>(await db.execute(sql`select id from tenants where code = 'BEYU-AGRI'`));
  return { entityA: entityA.id, entityB: entityB.id, actor: actor.id, tenantA: tenantA.id, tenantB: tenantB.id };
}

afterEach(async () => {
  await db.execute(sql`delete from financial_periods where code like ${`${RUN}%`}`);
  await db.execute(sql`delete from ledger_accounts where code like ${`${RUN}%`}`);
});

describe("journal scope integrity (migration 0006)", () => {
  it("rejects a journal line whose account belongs to another tenant", async () => {
    const { entityA, actor, tenantA, tenantB } = await ids();
    const text = await failureText(() =>
      db.transaction(async (tx) => {
        await tx.execute(sql`insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
          values (${`${RUN}-p1`}, ${entityA}, ${`${RUN}1`}, '2095-01-01', '2095-01-31', 'OPEN')`);
        // Account lives in tenant B ...
        await tx.execute(sql`insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-x1`}, ${tenantB}, ${`${RUN}X1`}, 'foreign tenant account', 'ASSET', true)`);
        await tx.execute(sql`insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-y1`}, ${tenantA}, ${`${RUN}Y1`}, 'own tenant account', 'EXPENSE', true)`);
        // ... while the entry lives in tenant A.
        await tx.execute(sql`insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference,
            description, currency, fx_rate, posted_by, source)
          values (${`${RUN}-e1`}, ${tenantA}, ${entityA}, ${`${RUN}-p1`}, ${`${RUN}1`},
            'cross-tenant attempt', 'TZS', 1, ${actor}, 'PROBE')`);
        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l1`}, ${`${RUN}-e1`}, ${`${RUN}-x1`}, '100', '0')`);
        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l2`}, ${`${RUN}-e1`}, ${`${RUN}-y1`}, '0', '100')`);
        await tx.execute(sql`set constraints all immediate`);
      }),
    );
    expect(text).toMatch(/crosses a tenant boundary/i);
  });

  it("rejects a journal entry posted into another legal entity's period", async () => {
    const { entityA, entityB, actor, tenantA } = await ids();
    const text = await failureText(() =>
      db.transaction(async (tx) => {
        // Period belongs to entity A ...
        await tx.execute(sql`insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
          values (${`${RUN}-p2`}, ${entityA}, ${`${RUN}2`}, '2095-02-01', '2095-02-28', 'OPEN')`);
        // ... while the entry claims entity B.
        await tx.execute(sql`insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference,
            description, currency, fx_rate, posted_by, source)
          values (${`${RUN}-e2`}, ${tenantA}, ${entityB}, ${`${RUN}-p2`}, ${`${RUN}2`},
            'cross-entity attempt', 'TZS', 1, ${actor}, 'PROBE')`);
        await tx.execute(sql`set constraints all immediate`);
      }),
    );
    expect(text).toMatch(/crosses a legal-entity boundary/i);
  });

  it("cross-tenant lines cannot be smuggled past COMMIT by deferring constraints", async () => {
    const { entityA, actor, tenantA, tenantB } = await ids();
    let committed = false;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
          values (${`${RUN}-p3`}, ${entityA}, ${`${RUN}3`}, '2095-03-01', '2095-03-31', 'OPEN')`);
        await tx.execute(sql`insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-x3`}, ${tenantB}, ${`${RUN}X3`}, 'foreign', 'ASSET', true)`);
        await tx.execute(sql`insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-y3`}, ${tenantA}, ${`${RUN}Y3`}, 'own', 'EXPENSE', true)`);
        await tx.execute(sql`insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference,
            description, currency, fx_rate, posted_by, source)
          values (${`${RUN}-e3`}, ${tenantA}, ${entityA}, ${`${RUN}-p3`}, ${`${RUN}3`},
            'deferred cross-tenant attempt', 'TZS', 1, ${actor}, 'PROBE')`);
        await tx.execute(sql`set constraints all deferred`);
        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l5`}, ${`${RUN}-e3`}, ${`${RUN}-x3`}, '100', '0')`);
        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l6`}, ${`${RUN}-e3`}, ${`${RUN}-y3`}, '0', '100')`);
      });
      committed = true;
    } catch (err) {
      const e = err as { message?: string; cause?: { message?: string } };
      expect(`${e.cause?.message ?? ""} ${e.message ?? ""}`).toMatch(/crosses a tenant boundary/i);
    }
    expect(committed).toBe(false);

    const [after] = rows<{ e: number }>(
      await db.execute(sql`select count(*)::int as e from journal_entries where reference like ${`${RUN}%`}`),
    );
    expect(after.e).toBe(0);
  });

  it("accepts a correctly scoped journal", async () => {
    // The guard must not block legitimate posting: same tenant, same entity.
    const { entityA, actor, tenantA } = await ids();
    let ok = false;
    await db
      .transaction(async (tx) => {
        await tx.execute(sql`insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
          values (${`${RUN}-p4`}, ${entityA}, ${`${RUN}4`}, '2095-04-01', '2095-04-30', 'OPEN')`);
        await tx.execute(sql`insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-x4`}, ${tenantA}, ${`${RUN}X4`}, 'a', 'ASSET', true)`);
        await tx.execute(sql`insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-y4`}, ${tenantA}, ${`${RUN}Y4`}, 'b', 'EXPENSE', true)`);
        await tx.execute(sql`insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference,
            description, currency, fx_rate, posted_by, source)
          values (${`${RUN}-e4`}, ${tenantA}, ${entityA}, ${`${RUN}-p4`}, ${`${RUN}4`},
            'correctly scoped', 'TZS', 1, ${actor}, 'PROBE')`);
        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l7`}, ${`${RUN}-e4`}, ${`${RUN}-x4`}, '100', '0')`);
        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l8`}, ${`${RUN}-e4`}, ${`${RUN}-y4`}, '0', '100')`);
        await tx.execute(sql`set constraints all immediate`);
        ok = true;
        throw new Error("__ROLLBACK__"); // never persist financial data in a test
      })
      .catch((e: unknown) => {
        if (!String((e as Error)?.message).includes("__ROLLBACK__")) throw e;
      });
    expect(ok).toBe(true);
  });

  it("both scope triggers are installed, enabled and deferred", async () => {
    const found = rows<{ tgname: string; tgenabled: string; tginitdeferred: boolean }>(
      await db.execute(sql`select tgname, tgenabled::text as tgenabled, tginitdeferred
        from pg_trigger where not tgisinternal and tgname in
        ('beyu_journal_line_scope', 'beyu_journal_entry_scope') order by tgname`),
    );
    expect(found.map((r) => r.tgname)).toEqual(["beyu_journal_entry_scope", "beyu_journal_line_scope"]);
    for (const t of found) {
      expect(t.tgenabled).toBe("O");
      expect(t.tginitdeferred).toBe(true);
    }
  });

  it("documents that period_id remains nullable pending policy decision P7", async () => {
    // NOT an endorsement. Whether a journal must belong to a financial period is
    // an unratified CFO decision (P7). Enforcing it here would pre-empt that
    // ratification, so the current behaviour is pinned instead — this test is
    // expected to change when P7 is ratified.
    const [col] = rows<{ is_nullable: string }>(
      await db.execute(sql`select is_nullable from information_schema.columns
        where table_name = 'journal_entries' and column_name = 'period_id'`),
    );
    expect(col.is_nullable).toBe("YES");
  });
});
