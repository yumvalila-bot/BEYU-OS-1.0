import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { generateTotpCode } from "../../src/lib/mfa";

/**
 * Reset the bootstrap tables to a known state for a test.
 *
 * The seal-terminal trigger deliberately prevents deleting/updating a SEALED
 * row, so the reset disables the trigger for the truncate and re-enables it —
 * exactly the privileged one-time operator action the trigger is meant to
 * require in production. Tests run under the privileged test role, so this is
 * available here and NOT to the runtime role.
 */
export async function resetBootstrap(adminUserId: string): Promise<void> {
  await db.execute(sql`alter table admin_bootstrap_state disable trigger beyu_admin_bootstrap_seal_guard`);
  await db.execute(sql`delete from admin_enrollment_sessions`);
  await db.execute(sql`delete from admin_bootstrap_state`);
  await db.execute(sql`alter table admin_bootstrap_state enable trigger beyu_admin_bootstrap_seal_guard`);
  await db.execute(
    sql`insert into admin_bootstrap_state (id, status, admin_user_id) values ('SINGLETON', 'AVAILABLE', ${adminUserId})`,
  );
}

/** Force the singleton into SEALED (used to assert a sealed deployment refuses to reopen). */
export async function forceSealed(adminUserId: string): Promise<void> {
  await resetBootstrap(adminUserId);
  await db.execute(
    sql`update admin_bootstrap_state set status='SEALED', sealed_at=now(), sealed_by_user_id=${adminUserId}, admin_user_id=${adminUserId} where id='SINGLETON'`,
  );
}

/** Reset the target admin user to an enrollable-only (unusable credential) state. */
export async function makeEnrollableOnly(adminUserId: string): Promise<void> {
  await db.execute(sql`
    update users set
      password_hash = 'scrypt$deadbeefdeadbeefdeadbeefdeadbeef$${sql.raw("0".repeat(128))}',
      password_algo = 'scrypt',
      password_must_change = true,
      mfa_enrolled = false,
      mfa_secret_encrypted = null,
      mfa_recovery_codes_hash = '[]'::jsonb,
      mfa_last_accepted_step = null,
      mfa_failed_attempts = 0,
      mfa_locked_until = null,
      status = 'ACTIVE'
    where id = ${adminUserId}
  `);
}

export function currentTotp(secret: string, at = Date.now()): string {
  return generateTotpCode(secret, at);
}
