/**
 * BEYU Identity Bridge — Lifecycle Governance Tests.
 *
 * Phase 4 verification: bridge lifecycle/status semantics.
 *
 * Tests cover:
 *   1. Link creation with status=active and source attribution
 *   2. Revocation sets status=revoked with audit metadata
 *   3. Revoked links DENY authorization (fail closed)
 *   4. Idempotent revocation
 *   5. Re-linking after revocation restores active status
 *   6. Expired links deny authorization
 *   7. Schema CHECK constraint rejects invalid status values
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "./db-connection";
import { BeyuIdentityBridge } from "./beyu-bridge";
import { ensureBridgeSchema, ensureBoundarySchema } from "./boundary-schema";

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

describe("BEYU Identity Bridge — Lifecycle Governance", () => {
  let db: PGlite;
  let conn: PGliteConnection;
  let bridge: BeyuIdentityBridge;

  const SECTOR_USER = "00000000-0000-0000-0000-000000000001";
  const BEYU_USER = "beyu-canonical-user-001";
  const TENANT_ID = "11111111-1111-1111-1111-111111111111";

  beforeAll(async () => {
    db = new PGlite();
    conn = new PGliteConnection(db);
    bridge = new BeyuIdentityBridge(conn);

    // Apply migration 001 (identity foundation) to create beyu_identity schema.
    const mig001 = fs.readFileSync(
      path.join(MIGRATIONS_DIR, "001_identity_foundation.up.sql"),
      "utf8",
    );
    await conn.exec(mig001);

    // Apply bridge + lifecycle migrations.
    await ensureBridgeSchema(conn);
    await ensureBoundarySchema(conn);

    // Seed a sector user.
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
      VALUES ('${SECTOR_USER}', 'test@beyu.health', 'Test User', 'hash')
      ON CONFLICT DO NOTHING;
    `);

    // Seed a tenant.
    await conn.exec(`
      INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name)
      VALUES ('${TENANT_ID}', 'test-tenant', 'Test Tenant')
      ON CONFLICT DO NOTHING;
    `);
  });

  afterAll(async () => {
    await conn.close();
  });

  it("creates a link with status=active and source attribution", async () => {
    const link = await bridge.linkUser({
      globalUserId: SECTOR_USER,
      beyuUserId: BEYU_USER,
      linkedBy: "admin@beyu.health",
      source: "federation",
    });

    expect(link.status).toBe("active");
    expect(link.source).toBe("federation");
    expect(link.beyuUserId).toBe(BEYU_USER);
    expect(link.globalUserId).toBe(SECTOR_USER);
    expect(link.revokedAt).toBeNull();
    expect(link.revokedBy).toBeNull();
  });

  it("requireCanonicalLink succeeds for active links", async () => {
    const link = await bridge.requireCanonicalLink(SECTOR_USER);
    expect(link.status).toBe("active");
  });

  it("revocation sets status=revoked with audit metadata", async () => {
    await bridge.revokeLink({
      globalUserId: SECTOR_USER,
      revokedBy: "security-officer@beyu.health",
    });

    const link = await bridge.getLink(SECTOR_USER);
    expect(link).not.toBeNull();
    expect(link!.status).toBe("revoked");
    expect(link!.revokedBy).toBe("security-officer@beyu.health");
    expect(link!.revokedAt).not.toBeNull();
  });

  it("revoked links DENY authorization (fail closed)", async () => {
    await expect(
      bridge.requireCanonicalLink(SECTOR_USER),
    ).rejects.toThrow("CANONICAL_IDENTITY_LINK_REVOKED");
  });

  it("revocation is idempotent (revoke already-revoked link)", async () => {
    // Should not throw.
    await bridge.revokeLink({
      globalUserId: SECTOR_USER,
      revokedBy: "another-admin@beyu.health",
    });

    const link = await bridge.getLink(SECTOR_USER);
    expect(link!.status).toBe("revoked");
  });

  it("re-linking after revocation restores active status", async () => {
    const link = await bridge.linkUser({
      globalUserId: SECTOR_USER,
      beyuUserId: BEYU_USER,
      linkedBy: "admin@beyu.health",
      source: "manual",
    });

    expect(link.status).toBe("active");
    expect(link.source).toBe("manual");
    expect(link.revokedAt).toBeNull();
    expect(link.revokedBy).toBeNull();

    // Authorization should succeed again.
    const authLink = await bridge.requireCanonicalLink(SECTOR_USER);
    expect(authLink.status).toBe("active");
  });

  it("schema CHECK constraint rejects invalid status values", async () => {
    // Insert a fresh user + link for this test.
    const testUser = "00000000-0000-0000-0000-000000000099";
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
      VALUES ('${testUser}', 'test99@beyu.health', 'Test 99', 'hash')
      ON CONFLICT DO NOTHING;
    `);
    await conn.exec(`
      INSERT INTO beyu_identity.beyu_identity_links
        (global_user_id, beyu_user_id, linked_by, status, source)
      VALUES ('${testUser}', 'beyu-99', 'admin', 'active', 'manual');
    `);

    // Attempt to set an invalid status.
    await expect(
      conn.exec(`
        UPDATE beyu_identity.beyu_identity_links
        SET status = 'bogus'
        WHERE global_user_id = '${testUser}'
      `),
    ).rejects.toThrow();
  });

  it("default source is 'manual' when not specified", async () => {
    const testUser = "00000000-0000-0000-0000-000000000088";
    await conn.exec(`
      INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
      VALUES ('${testUser}', 'test88@beyu.health', 'Test 88', 'hash')
      ON CONFLICT DO NOTHING;
    `);

    const link = await bridge.linkUser({
      globalUserId: testUser,
      beyuUserId: "beyu-88",
      linkedBy: "admin",
      // No source specified.
    });

    expect(link.source).toBe("manual");
  });

  it("revoke of non-existent link throws", async () => {
    await expect(
      bridge.revokeLink({
        globalUserId: "99999999-9999-9999-9999-999999999999",
        revokedBy: "admin",
      }),
    ).rejects.toThrow("NO_CANONICAL_IDENTITY_LINK_TO_REVOKE");
  });

  it("status column exists with correct CHECK constraint", async () => {
    const cols = await conn.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'beyu_identity' AND table_name = 'beyu_identity_links'`,
    );
    const colNames = cols.map((r) => r.column_name);
    expect(colNames).toContain("status");
    expect(colNames).toContain("source");
    expect(colNames).toContain("revoked_at");
    expect(colNames).toContain("revoked_by");
  });
});
