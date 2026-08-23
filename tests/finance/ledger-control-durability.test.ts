import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";

/**
 * LEDGER CONTROL DURABILITY — the controls themselves must survive.
 *
 * POLICY-INDEPENDENT. Selects no accounting treatment, creates no persistent
 * financial data, grants no authority.
 *
 * `ledger-integrity.test.ts` proves the migration-0005 invariants REJECT bad
 * data. This suite covers two different risks that behavioural rejection tests
 * cannot see:
 *
 *  1. EVASION — `beyu_journal_balanced` is a CONSTRAINT TRIGGER declared
 *     DEFERRABLE INITIALLY DEFERRED. Deferral is what makes it correct against
 *     multi-statement raw SQL, but it also means an attacker controls WHEN it
 *     fires. `SET CONSTRAINTS ALL DEFERRED` must not let an unbalanced entry
 *     reach COMMIT. Verified here by driving the attack to an actual commit.
 *
 *  2. EROSION — a future migration could drop a trigger, replace a function
 *     body, or leave a trigger installed but DISABLED (`tgenabled = 'D'`). The
 *     table would still look protected while silently accepting anything. These
 *     tests assert the controls are present AND enabled AND still owned by the
 *     expected functions.
 *
 * Long-horizon rationale (H6): journal entries are immutable, so a control gap
 * is not a bug that can be patched away — every row written during the gap is
 * permanent history. The controls must therefore be verified as infrastructure,
 * not merely exercised as behaviour.
 */

const rows = <T>(res: unknown): T[] =>
  ((res as { rows?: T[] }).rows ?? (res as T[]));

const RUN = `CTLDUR-${Date.now()}`;

afterEach(async () => {
  // Nothing should persist; clean defensively without disabling any trigger.
  await db.execute(sql`delete from financial_periods where code like ${`${RUN}%`}`);
  await db.execute(sql`delete from ledger_accounts where code like ${`${RUN}%`}`);
});

describe("migration 0005 control durability", () => {
  it("all three journal triggers are installed and ENABLED", async () => {
    // Scoped to the three 0005 triggers by name. A prefix match would also
    // capture later additions (e.g. the 0006 scope triggers, which have their
    // own suite), making this assertion drift every time a control is added.
    const res = await db.execute<{ tgname: string; tgenabled: string }>(
      sql`select tgname, tgenabled::text as tgenabled
          from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where not t.tgisinternal and t.tgname in
            ('beyu_journal_balanced', 'beyu_journal_entry_immutable', 'beyu_journal_line_immutable')
          order by tgname`,
    );
    const found = rows<{ tgname: string; tgenabled: string }>(res);
    expect(found.map((r) => r.tgname)).toEqual([
      "beyu_journal_balanced",
      "beyu_journal_entry_immutable",
      "beyu_journal_line_immutable",
    ]);
    // 'O' = enabled for origin. 'D' would mean installed but silently inert.
    for (const t of found) expect(t.tgenabled).toBe("O");
  });

  it("the enforcement functions backing those triggers still exist", async () => {
    const res = await db.execute<{ proname: string }>(
      sql`select proname from pg_proc
          where proname in ('beyu_assert_journal_balanced',
                            'beyu_reject_journal_mutation',
                            'beyu_reject_journal_line_mutation')
          order by proname`,
    );
    expect(rows<{ proname: string }>(res).map((r) => r.proname)).toEqual([
      "beyu_assert_journal_balanced",
      "beyu_reject_journal_line_mutation",
      "beyu_reject_journal_mutation",
    ]);
  });

  it("the balance check is deferred, so it validates whole transactions", async () => {
    // Deferral is deliberate: a balanced entry is only knowable once every line
    // is inserted. This pins the property so a future migration cannot quietly
    // make it a per-row check that would reject legitimate multi-line posting.
    const res = await db.execute<{ tgdeferrable: boolean; tginitdeferred: boolean }>(
      sql`select tgdeferrable, tginitdeferred from pg_trigger
          where not tgisinternal and tgname = 'beyu_journal_balanced'`,
    );
    const [t] = rows<{ tgdeferrable: boolean; tginitdeferred: boolean }>(res);
    expect(t.tgdeferrable).toBe(true);
    expect(t.tginitdeferred).toBe(true);
  });

  it("SET CONSTRAINTS ALL DEFERRED cannot smuggle an unbalanced entry past COMMIT", async () => {
    // The attack: explicitly defer every constraint, write an unbalanced entry,
    // then let the transaction commit and hope the check is skipped.
    const [{ id: entity }] = rows<{ id: string }>(
      await db.execute(sql`select id from legal_entities where code = 'BEYU-AGR'`),
    );
    const [{ id: actor }] = rows<{ id: string }>(
      await db.execute(sql`select id from users limit 1`),
    );
    const [{ id: tenant }] = rows<{ id: string }>(
      await db.execute(sql`select id from tenants where code = 'BEYU-GROUP'`),
    );

    let committed = false;
    try {
      await db.transaction(async (tx) => {
        const period = `${RUN}-p`;
        await tx.execute(sql`
          insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on, status)
          values (${period}, ${entity}, ${RUN}, '2098-01-01', '2098-01-31', 'OPEN')`);
        await tx.execute(sql`
          insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-a`}, ${tenant}, ${`${RUN}A`}, 'probe a', 'ASSET', true)`);
        await tx.execute(sql`
          insert into ledger_accounts (id, tenant_id, code, name, account_type, active)
          values (${`${RUN}-b`}, ${tenant}, ${`${RUN}B`}, 'probe b', 'EXPENSE', true)`);
        await tx.execute(sql`
          insert into journal_entries (id, tenant_id, legal_entity_id, period_id, reference,
                                       description, currency, fx_rate, posted_by, source)
          values (${`${RUN}-e`}, ${tenant}, ${entity}, ${period}, ${RUN},
                  'deferral evasion attempt', 'TZS', 1, ${actor}, 'PROBE')`);

        await tx.execute(sql`set constraints all deferred`);

        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l1`}, ${`${RUN}-e`}, ${`${RUN}-a`}, '100', '0')`);
        await tx.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
          values (${`${RUN}-l2`}, ${`${RUN}-e`}, ${`${RUN}-b`}, '0', '1')`);
      });
      committed = true;
    } catch (err) {
      const e = err as { message?: string; cause?: { message?: string } };
      expect(`${e.cause?.message ?? ""} ${e.message ?? ""}`).toMatch(/unbalanced/i);
    }

    expect(committed).toBe(false);

    // And the rollback must be total — no orphan entry, account or period.
    const [after] = rows<{ e: number; a: number; p: number }>(
      await db.execute(sql`select
        (select count(*)::int from journal_entries where reference like ${`${RUN}%`}) as e,
        (select count(*)::int from ledger_accounts where code like ${`${RUN}%`}) as a,
        (select count(*)::int from financial_periods where code like ${`${RUN}%`}) as p`),
    );
    expect(after).toEqual({ e: 0, a: 0, p: 0 });
  });

  it("the period integrity constraints remain installed", async () => {
    const res = await db.execute<{ conname: string; contype: string }>(
      sql`select conname, contype::text as contype from pg_constraint
          where conname in ('financial_period_no_overlap', 'financial_period_dates_ordered')
          order by conname`,
    );
    const found = rows<{ conname: string; contype: string }>(res);
    expect(found.map((r) => r.conname)).toEqual([
      "financial_period_dates_ordered",
      "financial_period_no_overlap",
    ]);
    // 'x' = exclusion constraint; the overlap guard must not degrade to a CHECK.
    expect(found.find((r) => r.conname === "financial_period_no_overlap")?.contype).toBe("x");
  });

  it("the journal line amount constraints remain installed as CHECKs", async () => {
    const res = await db.execute<{ conname: string; contype: string }>(
      sql`select conname, contype::text as contype from pg_constraint
          where conname in ('journal_line_single_sided', 'journal_line_non_negative')
          order by conname`,
    );
    const found = rows<{ conname: string; contype: string }>(res);
    expect(found.map((r) => r.conname)).toEqual([
      "journal_line_non_negative",
      "journal_line_single_sided",
    ]);
    for (const c of found) expect(c.contype).toBe("c");
  });
});
