/**
 * Phase 5R — the test harness must never silently weaken a production control.
 *
 * Several suites legitimately suspend database triggers to clean up probe rows (immutability
 * triggers correctly refuse ordinary deletes, so teardown cannot proceed without them). That
 * escape hatch is only acceptable if it is guaranteed to be restored.
 *
 * Phase 5R found `purge()` in tests/finance/ledger-integrity.test.ts disabling the ledger
 * immutability triggers WITHOUT a finally block: any failure between the disable and the
 * re-enable left the controls off for the rest of the run, which could turn later assertions
 * into false passes. It now restores in `finally`, as does tests/helpers/ledger-reset.ts.
 *
 * This suite is the backstop. It asserts that every trigger the system relies on is present and
 * ENABLED. Because vitest runs suites in the same database, a suite that leaks a disabled
 * trigger will be caught here rather than silently degrading the security guarantees of the
 * whole run.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";

type TriggerRow = { tgname: string; relname: string; tgenabled: string };

async function triggers(): Promise<TriggerRow[]> {
  const result = (await db.execute(sql`
    select t.tgname, c.relname, t.tgenabled
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal
    order by t.tgname
  `)) as unknown as { rows?: TriggerRow[] };
  return result.rows ?? (result as unknown as TriggerRow[]);
}

/** Controls that must exist and be armed for the security guarantees of this system to hold. */
const REQUIRED_TRIGGERS = [
  "audit_log_immutable_update",
  "audit_log_immutable_truncate",
  "enterprise_events_immutable_update",
  "enterprise_events_immutable_truncate",
  "beyu_journal_entry_immutable",
  "beyu_journal_line_immutable",
  "beyu_journal_balanced",
  "beyu_journal_entry_scope",
  "beyu_journal_line_scope",
] as const;

describe("production controls are installed and armed", () => {
  it("has every required trigger installed", async () => {
    const installed = new Set((await triggers()).map((t) => t.tgname));
    for (const name of REQUIRED_TRIGGERS) {
      expect(installed.has(name), `trigger ${name} is missing`).toBe(true);
    }
  });

  it("has no disabled trigger anywhere in the database", async () => {
    const disabled = (await triggers()).filter((t) => t.tgenabled !== "O");
    expect(
      disabled.map((t) => `${t.tgname}@${t.relname}=${t.tgenabled}`),
      "a test suite left a production control disabled",
    ).toEqual([]);
  });

  it("keeps the audit and event ledgers protected against TRUNCATE specifically", async () => {
    const rows = (await triggers()).filter((t) => t.tgname.endsWith("_immutable_truncate"));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.tgenabled).toBe("O");
  });
});
