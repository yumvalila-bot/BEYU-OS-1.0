/**
 * Test-only reset of the append-only audit and event ledgers.
 *
 * Migration 0008 installs statement-level BEFORE TRUNCATE triggers on `audit_log` and
 * `enterprise_events`, closing a bypass that allowed the entire audit history to be erased in
 * one statement (Constitution Art. 8: "No component may alter or delete audit history").
 *
 * Test suites legitimately need a clean ledger between cases. Rather than weaken the deployed
 * control to accommodate them, this helper makes the escape hatch explicit, narrow and
 * self-restoring: it disables the two TRUNCATE guards, truncates, and re-enables them in a
 * `finally` block so a failing test can never leave the control switched off.
 *
 * This is the ONLY sanctioned way for tests to clear these tables. Application code has no
 * equivalent path, and `tests/security/audit-truncate-and-policy-window.test.ts` continues to
 * assert that an ordinary TRUNCATE is rejected.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Truncates the audit and event ledgers and resets their hash chains to genesis. */
export async function resetAuditLedgers(): Promise<void> {
  try {
    await db.execute(sql`alter table audit_log disable trigger audit_log_immutable_truncate`);
    await db.execute(sql`alter table enterprise_events disable trigger enterprise_events_immutable_truncate`);

    await db.execute(sql`truncate table audit_log`);
    await db.execute(sql`truncate table enterprise_events`);
  } finally {
    await db.execute(sql`alter table audit_log enable trigger audit_log_immutable_truncate`);
    await db.execute(sql`alter table enterprise_events enable trigger enterprise_events_immutable_truncate`);
  }

  await db.execute(
    sql`insert into audit_chain_heads(chain_name,current_hash) values ('AUDIT_LOG', null),('ENTERPRISE_EVENTS', null)
        on conflict(chain_name) do update set current_hash = null, updated_at = now()`,
  );
}
