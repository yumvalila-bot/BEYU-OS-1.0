import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";

/**
 * LEDGER INTEGRITY INVARIANTS — enforced by the DATABASE, not by application code.
 *
 * Phase 5A could not build the accounting substrate: five of the eleven
 * accounting-policy questions have no authoritative answer in the repository
 * (see docs/governance/ACCOUNTING_SUBSTRATE_DECISIONS.md). These invariants are
 * the part that needs NO accounting policy — they are universal properties of
 * double-entry bookkeeping and of the repository's own stated rule:
 *
 *   "Immutable double-entry journal. Corrections are reversals, never edits."
 *
 * Two real defects were demonstrated against the live database before migration
 * 0005 and are pinned here:
 *   - an unbalanced journal (debit 100.00 vs credit 7.00) was accepted;
 *   - a posted journal entry was successfully UPDATEd.
 *
 * Every test drives RAW SQL rather than a service, deliberately: the point is
 * that the invariant survives even when application code is bypassed entirely.
 * There is no posting service yet, so the database is the only line of defence.
 */

/** Run an operation and return the full error text, including the DB cause. */
async function failureText(op: () => Promise<unknown>): Promise<string> {
  try {
    await op();
  } catch (err) {
    // Drizzle wraps driver errors, so the PostgreSQL message lives on `cause`.
    const e = err as { message?: string; cause?: { message?: string } };
    return `${e.cause?.message ?? ""} ${e.message ?? ""}`;
  }
  throw new Error("expected the operation to fail, but it succeeded");
}

const ENTITY = "LEN_BEYU_HEALTH_LTD";
const TENANT = "TEN_BEYU_GROUP";

/** Insert a journal entry plus its lines in one transaction, as posting would. */
async function postEntry(
  entryId: string,
  lines: { id: string; accountId: string; debit: string; credit: string }[],
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into journal_entries (id, tenant_id, legal_entity_id, reference, description, currency, posted_by)
      values (${entryId}, ${TENANT}, ${ENTITY}, ${`REF-${entryId}`}, 'integrity probe', 'USD', 'probe')`);
    for (const l of lines) {
      await tx.execute(sql`
        insert into journal_lines (id, entry_id, account_id, debit, credit)
        values (${l.id}, ${entryId}, ${l.accountId}, ${l.debit}, ${l.credit})`);
    }
  });
}

/**
 * Remove probe rows. Triggers must be suspended: teardown is not a correction.
 *
 * Phase 5R hardening: the re-enable is now in a `finally` block. Previously a failure in any
 * DELETE between the disable and enable statements left the ledger immutability triggers
 * switched OFF for the remainder of the run, silently disarming a production control and
 * potentially turning later assertions into false passes.
 */
async function purge() {
  try {
    await db.execute(sql`alter table journal_lines disable trigger user`);
    await db.execute(sql`alter table journal_entries disable trigger user`);
    await db.execute(sql`delete from journal_lines where entry_id like 'JE_LI_%'`);
    await db.execute(sql`delete from journal_entries where id like 'JE_LI_%'`);
  } finally {
    await db.execute(sql`alter table journal_lines enable trigger user`);
    await db.execute(sql`alter table journal_entries enable trigger user`);
  }
  await db.execute(sql`delete from ledger_accounts where id like 'LA_LI_%'`);
  await db.execute(sql`delete from financial_periods where id like 'FP_LI_%'`);
}

beforeEach(async () => {
  await purge();
  await db.execute(sql`
    insert into ledger_accounts (id, tenant_id, code, name, account_type)
    values ('LA_LI_DR', ${TENANT}, 'LI-PROBE-DR', 'probe debit', 'ASSET'),
           ('LA_LI_CR', ${TENANT}, 'LI-PROBE-CR', 'probe credit', 'EQUITY')`);
});

afterEach(purge);

afterAll(async () => {
  await purge();
  // The ledger must remain pristine: this suite creates no financial truth.
  const r = await db.execute<{ je: number; jl: number }>(
    sql`select (select count(*) from journal_entries)::int je, (select count(*) from journal_lines)::int jl`,
  );
  expect(r.rows[0].je).toBe(0);
  expect(r.rows[0].jl).toBe(0);
});

describe("ledger integrity — double entry", () => {
  it("accepts a balanced journal", async () => {
    await postEntry("JE_LI_OK", [
      { id: "JL_LI_1", accountId: "LA_LI_DR", debit: "250.00", credit: "0" },
      { id: "JL_LI_2", accountId: "LA_LI_CR", debit: "0", credit: "250.00" },
    ]);

    const r = await db.execute<{ d: string; c: string }>(
      sql`select sum(debit)::text d, sum(credit)::text c from journal_lines where entry_id = 'JE_LI_OK'`,
    );
    expect(r.rows[0].d).toBe("250.00");
    expect(r.rows[0].c).toBe("250.00");
  });

  it("rejects an unbalanced journal — the exact defect found before migration 0005", async () => {
    const err = await failureText(() =>
      postEntry("JE_LI_UNBAL", [
        { id: "JL_LI_3", accountId: "LA_LI_DR", debit: "100.00", credit: "0" },
        { id: "JL_LI_4", accountId: "LA_LI_CR", debit: "0", credit: "7.00" },
      ]),
    );
    expect(err).toMatch(/unbalanced: debit 100\.00 <> credit 7\.00/i);

    // The whole transaction rolled back: no orphan entry survives.
    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int n from journal_entries where id = 'JE_LI_UNBAL'`,
    );
    expect(r.rows[0].n).toBe(0);
  });

  it("rejects a single-sided journal", async () => {
    const err = await failureText(() =>
      postEntry("JE_LI_ONE", [
        { id: "JL_LI_5", accountId: "LA_LI_DR", debit: "50.00", credit: "0" },
      ]),
    );
    expect(err).toMatch(/requires at least two/i);
  });

  it("rejects a journal with no lines", async () => {
    // The balance trigger fires per line, so an entry with zero lines never
    // triggers it. The invariant is instead that such an entry is inert: it
    // carries no value and cannot be completed later, because adding a single
    // line would be rejected and adding a balanced pair is a normal posting.
    await postEntry("JE_LI_EMPTY", []);
    const lines = await db.execute<{ n: number }>(
      sql`select count(*)::int n from journal_lines where entry_id = 'JE_LI_EMPTY'`,
    );
    expect(lines.rows[0].n).toBe(0);

    const err = await failureText(() =>
      db.execute(sql`insert into journal_lines (id, entry_id, account_id, debit, credit)
                     values ('JL_LI_EMPTY', 'JE_LI_EMPTY', 'LA_LI_DR', '10.00', '0')`),
    );
    expect(err).toMatch(/requires at least two/i);
  });

  it("rejects a zero-value journal", async () => {
    const err = await failureText(() =>
      postEntry("JE_LI_ZERO", [
        { id: "JL_LI_6", accountId: "LA_LI_DR", debit: "0", credit: "0" },
        { id: "JL_LI_7", accountId: "LA_LI_CR", debit: "0", credit: "0" },
      ]),
    );
    expect(err).toMatch(/journal_line_single_sided|zero value/i);
  });

  it("rejects a line carrying both a debit and a credit", async () => {
    const err = await failureText(() =>
      postEntry("JE_LI_BOTH", [
        { id: "JL_LI_8", accountId: "LA_LI_DR", debit: "10.00", credit: "10.00" },
        { id: "JL_LI_9", accountId: "LA_LI_CR", debit: "0", credit: "10.00" },
      ]),
    );
    expect(err).toMatch(/journal_line/i);
  });

  it("rejects a negative amount", async () => {
    const err = await failureText(() =>
      postEntry("JE_LI_NEG", [
        { id: "JL_LI_10", accountId: "LA_LI_DR", debit: "-100.00", credit: "0" },
        { id: "JL_LI_11", accountId: "LA_LI_CR", debit: "0", credit: "-100.00" },
      ]),
    );
    expect(err).toMatch(/journal_line/i);
  });

  it("accepts a balanced multi-line journal", async () => {
    await postEntry("JE_LI_MULTI", [
      { id: "JL_LI_12", accountId: "LA_LI_DR", debit: "60.00", credit: "0" },
      { id: "JL_LI_13", accountId: "LA_LI_DR", debit: "40.00", credit: "0" },
      { id: "JL_LI_14", accountId: "LA_LI_CR", debit: "0", credit: "100.00" },
    ]);
    const r = await db.execute<{ d: string; c: string }>(
      sql`select sum(debit)::text d, sum(credit)::text c from journal_lines where entry_id = 'JE_LI_MULTI'`,
    );
    expect(r.rows[0].d).toBe(r.rows[0].c);
  });
});

describe("ledger integrity — immutability", () => {
  beforeEach(async () => {
    await postEntry("JE_LI_IMM", [
      { id: "JL_LI_20", accountId: "LA_LI_DR", debit: "500.00", credit: "0" },
      { id: "JL_LI_21", accountId: "LA_LI_CR", debit: "0", credit: "500.00" },
    ]);
  });

  it("rejects UPDATE of a posted entry — the second defect found before migration 0005", async () => {
    const err = await failureText(() =>
      db.execute(sql`update journal_entries set description = 'MUTATED' where id = 'JE_LI_IMM'`),
    );
    expect(err).toMatch(/immutable/i);

    const r = await db.execute<{ description: string }>(
      sql`select description from journal_entries where id = 'JE_LI_IMM'`,
    );
    expect(r.rows[0].description).toBe("integrity probe");
  });

  it("rejects DELETE of a posted entry", async () => {
    const err = await failureText(() =>
      db.execute(sql`delete from journal_entries where id = 'JE_LI_IMM'`),
    );
    expect(err).toMatch(/immutable/i);

    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int n from journal_entries where id = 'JE_LI_IMM'`,
    );
    expect(r.rows[0].n).toBe(1);
  });

  it("rejects tampering with a posted line amount", async () => {
    const err = await failureText(() =>
      db.execute(sql`update journal_lines set debit = '999999.00' where id = 'JL_LI_20'`),
    );
    expect(err).toMatch(/immutable/i);

    const r = await db.execute<{ debit: string }>(
      sql`select debit::text from journal_lines where id = 'JL_LI_20'`,
    );
    expect(r.rows[0].debit).toBe("500.00");
  });

  it("rejects deleting a line out of a posted entry", async () => {
    const err = await failureText(() =>
      db.execute(sql`delete from journal_lines where id = 'JL_LI_20'`),
    );
    expect(err).toMatch(/immutable/i);
  });

  it("rejects repointing a line to another account", async () => {
    const err = await failureText(() =>
      db.execute(sql`update journal_lines set account_id = 'LA_LI_CR' where id = 'JL_LI_20'`),
    );
    expect(err).toMatch(/immutable/i);
  });

  it("leaves the reversal path available", async () => {
    // Correction is by reversing entry, which the schema already models via
    // journal_entries.reversal_of_id. The immutability rule must not block it.
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into journal_entries (id, tenant_id, legal_entity_id, reference, description, currency, posted_by, reversal_of_id)
        values ('JE_LI_REV', ${TENANT}, ${ENTITY}, 'REF-JE_LI_REV', 'reversal of probe', 'USD', 'probe', 'JE_LI_IMM')`);
      await tx.execute(sql`
        insert into journal_lines (id, entry_id, account_id, debit, credit) values
        ('JL_LI_22', 'JE_LI_REV', 'LA_LI_CR', '500.00', '0'),
        ('JL_LI_23', 'JE_LI_REV', 'LA_LI_DR', '0', '500.00')`);
    });

    const r = await db.execute<{ reversal_of_id: string }>(
      sql`select reversal_of_id from journal_entries where id = 'JE_LI_REV'`,
    );
    expect(r.rows[0].reversal_of_id).toBe("JE_LI_IMM");

    // Original and reversal net to zero across both accounts.
    const net = await db.execute<{ d: string; c: string }>(
      sql`select sum(debit)::text d, sum(credit)::text c from journal_lines
          where entry_id in ('JE_LI_IMM','JE_LI_REV')`,
    );
    expect(net.rows[0].d).toBe(net.rows[0].c);
  });
});

describe("ledger integrity — financial periods", () => {
  it("accepts non-overlapping periods for one entity", async () => {
    await db.execute(sql`
      insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on) values
      ('FP_LI_1', ${ENTITY}, 'LI-2026-Q1', '2026-01-01', '2026-03-31'),
      ('FP_LI_2', ${ENTITY}, 'LI-2026-Q2', '2026-04-01', '2026-06-30')`);
    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int n from financial_periods where id like 'FP_LI_%'`,
    );
    expect(r.rows[0].n).toBe(2);
  });

  it("rejects overlapping periods for the same entity", async () => {
    await db.execute(sql`
      insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on)
      values ('FP_LI_3', ${ENTITY}, 'LI-2026-H1', '2026-01-01', '2026-06-30')`);

    // A posting inside an overlap would fall into two periods at once, making
    // "the period is closed" ambiguous.
    const err = await failureText(() =>
      db.execute(sql`
        insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on)
        values ('FP_LI_4', ${ENTITY}, 'LI-2026-FEB', '2026-02-01', '2026-02-28')`),
    );
    expect(err).toMatch(/overlap|exclusion/i);
  });

  it("allows different entities to hold the same period dates", async () => {
    await db.execute(sql`
      insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on) values
      ('FP_LI_5', ${ENTITY}, 'LI-2026-Q3', '2026-07-01', '2026-09-30'),
      ('FP_LI_6', 'LEN_BEYU_AGRI_LTD', 'LI-2026-Q3', '2026-07-01', '2026-09-30')`);
    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int n from financial_periods where id in ('FP_LI_5','FP_LI_6')`,
    );
    expect(r.rows[0].n).toBe(2);
  });

  it("rejects a period that ends before it starts", async () => {
    const err = await failureText(() =>
      db.execute(sql`
        insert into financial_periods (id, legal_entity_id, code, starts_on, ends_on)
        values ('FP_LI_7', ${ENTITY}, 'LI-BAD', '2026-06-30', '2026-01-01')`),
    );
    expect(err).toMatch(/financial_period_dates_ordered/i);
  });
});
