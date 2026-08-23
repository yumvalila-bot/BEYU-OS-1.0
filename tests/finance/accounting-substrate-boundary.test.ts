import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";

/**
 * ACCOUNTING SUBSTRATE BOUNDARY — the ledger stays empty until policy is ratified.
 *
 * POLICY-INDEPENDENT. These tests select no accounting treatment, create no
 * account, period or entry, and grant no authority. They assert only that the
 * substrate remains UNBUILT, which is the state Phases 5B-5L established as
 * correct while accounting authority is unratified:
 *
 *   docs/finance/PHASE_5_AUTHORITY_GATE.md
 *   → ENGINEERING BLOCKED — ACCOUNTING AUTHORITY NOT YET RATIFIED
 *
 * Why assert an absence?
 * ----------------------
 * Migration 0005 guarantees that any journal entry which DOES exist is
 * balanced, multi-line, non-zero, single-sided and immutable. It cannot
 * guarantee that an entry should exist at all — that is a policy question.
 * Because entries are immutable, a posting made under unratified policy can
 * never be edited away; it becomes permanent history correctable only by
 * reversal.
 *
 * These tests therefore fail loudly the moment financial substrate appears
 * without a ratified decision, while the mistake is still cheap to undo.
 *
 * WHEN POLICY IS RATIFIED: these tests are expected to be updated or removed as
 * part of the authorized implementation tranche, with the ratification artifact
 * cited in the commit. They must NOT be deleted merely to make a build green.
 */

const count = async (table: string): Promise<number> => {
  const res = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.raw(table)}`,
  );
  const rows = (res as unknown as { rows?: { n: number }[] }).rows ?? (res as unknown as { n: number }[]);
  return Number(rows[0].n);
};

describe("accounting substrate boundary", () => {
  it("no chart of accounts exists", async () => {
    expect(await count("ledger_accounts")).toBe(0);
  });

  it("no financial periods exist", async () => {
    expect(await count("financial_periods")).toBe(0);
  });

  it("no journal entries exist", async () => {
    expect(await count("journal_entries")).toBe(0);
  });

  it("no journal lines exist", async () => {
    expect(await count("journal_lines")).toBe(0);
  });

  it("the seeded treasury snapshot is unchanged", async () => {
    // Treasury is a dated snapshot with no journal provenance. It must never be
    // silently adjusted to make an accounting story balance.
    const res = await db.execute<{ total: string; n: number }>(
      sql`select coalesce(sum(base_currency_balance), 0)::text as total, count(*)::int as n from treasury_positions`,
    );
    const rows = (res as unknown as { rows?: { total: string; n: number }[] }).rows
      ?? (res as unknown as { total: string; n: number }[]);
    expect(Number(rows[0].n)).toBe(5);
    expect(rows[0].total).toBe("11783000.00");
  });

  it("no capital request has reached a funded state", async () => {
    // FUNDED implies money moved. Capital execution is unimplemented and
    // unratified, so no request may carry that status.
    const res = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from capital_requests where status = 'FUNDED'`,
    );
    const rows = (res as unknown as { rows?: { n: number }[] }).rows ?? (res as unknown as { n: number }[]);
    expect(Number(rows[0].n)).toBe(0);
  });

  it("ledger integrity controls from migration 0005 remain installed", async () => {
    // The absence of a substrate must not be confused with the absence of
    // controls: if accounts ever appear, these must already be enforcing.
    const triggers = await db.execute<{ tgname: string }>(
      sql`select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
          where not t.tgisinternal and t.tgname in
            ('beyu_journal_balanced', 'beyu_journal_entry_immutable', 'beyu_journal_line_immutable')`,
    );
    const trows = (triggers as unknown as { rows?: { tgname: string }[] }).rows
      ?? (triggers as unknown as { tgname: string }[]);
    expect(trows.map((r) => r.tgname).sort()).toEqual([
      "beyu_journal_balanced",
      "beyu_journal_entry_immutable",
      "beyu_journal_line_immutable",
    ]);

    const constraints = await db.execute<{ conname: string }>(
      sql`select conname from pg_constraint where conname in (
        'journal_line_single_sided', 'journal_line_non_negative',
        'financial_period_no_overlap', 'financial_period_dates_ordered')`,
    );
    const crows = (constraints as unknown as { rows?: { conname: string }[] }).rows
      ?? (constraints as unknown as { conname: string }[]);
    expect(crows).toHaveLength(4);
  });
});
