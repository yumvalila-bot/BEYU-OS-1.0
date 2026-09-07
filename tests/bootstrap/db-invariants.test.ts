import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { resetBootstrap } from "./helpers";

const ADMIN_USER_ID = "USR_PLATFORM_ADMIN";

/**
 * Database-level invariants of the bootstrap tables. These hold regardless of
 * the application layer, so a logic regression or a compromised runtime role
 * cannot violate the "one-and-only-one, sealed-is-terminal" guarantee.
 */
describe("bootstrap database invariants", () => {
  afterAll(async () => {
    await resetBootstrap(ADMIN_USER_ID);
    await pool.end();
  });

  it("enforces a single bootstrap-state row (singleton CHECK)", async () => {
    await resetBootstrap(ADMIN_USER_ID);
    await expect(
      db.execute(sql`insert into admin_bootstrap_state (id, status) values ('OTHER', 'AVAILABLE')`),
    ).rejects.toThrow();
  });

  it("rejects an unknown status value", async () => {
    await resetBootstrap(ADMIN_USER_ID);
    await expect(
      db.execute(sql`update admin_bootstrap_state set status='HACKED' where id='SINGLETON'`),
    ).rejects.toThrow();
  });

  it("requires seal evidence to mark SEALED", async () => {
    await resetBootstrap(ADMIN_USER_ID);
    await expect(
      db.execute(sql`update admin_bootstrap_state set status='SEALED' where id='SINGLETON'`),
    ).rejects.toThrow();
  });

  it("makes SEALED terminal — cannot be reopened or deleted", async () => {
    await resetBootstrap(ADMIN_USER_ID);
    await db.execute(
      sql`update admin_bootstrap_state set status='SEALED', sealed_at=now(), sealed_by_user_id=${ADMIN_USER_ID}, admin_user_id=${ADMIN_USER_ID} where id='SINGLETON'`,
    );
    await expect(
      db.execute(sql`update admin_bootstrap_state set status='AVAILABLE' where id='SINGLETON'`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`delete from admin_bootstrap_state where id='SINGLETON'`),
    ).rejects.toThrow();
    // The trigger's messages are asserted directly against PostgreSQL below.
  });

  it("the seal-terminal trigger raises the expected messages", async () => {
    await resetBootstrap(ADMIN_USER_ID);
    await db.execute(
      sql`update admin_bootstrap_state set status='SEALED', sealed_at=now(), sealed_by_user_id=${ADMIN_USER_ID}, admin_user_id=${ADMIN_USER_ID} where id='SINGLETON'`,
    );
    const client = await pool.connect();
    try {
      let reopenMsg = "";
      try {
        await client.query("update admin_bootstrap_state set status='AVAILABLE' where id='SINGLETON'");
      } catch (e) {
        reopenMsg = e instanceof Error ? e.message : String(e);
      }
      expect(reopenMsg).toMatch(/sealed/i);

      let deleteMsg = "";
      try {
        await client.query("delete from admin_bootstrap_state where id='SINGLETON'");
      } catch (e) {
        deleteMsg = e instanceof Error ? e.message : String(e);
      }
      expect(deleteMsg).toMatch(/permanent/i);
    } finally {
      client.release();
    }
  });

  it("enforces a unique enrollment token hash", async () => {
    await resetBootstrap(ADMIN_USER_ID);
    const insert = (id: string) =>
      db.execute(sql`
        insert into admin_enrollment_sessions
          (id, token_hash, admin_user_id, email, password_hash, mfa_secret_encrypted, expires_at)
        values (${id}, 'DUPLICATE_HASH', ${ADMIN_USER_ID}, 'a@b.c', 'scrypt$x$y', 'v1:x:y:z', now() + interval '5 minutes')
      `);
    await insert("SES_A");
    await expect(insert("SES_B")).rejects.toThrow();
    await db.execute(sql`delete from admin_enrollment_sessions where token_hash='DUPLICATE_HASH'`);
  });
});
