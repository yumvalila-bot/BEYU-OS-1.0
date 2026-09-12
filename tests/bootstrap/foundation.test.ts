import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { adminDb, adminPool } from "../../src/db/admin";
import * as s from "../../src/db/schema";
import {
  assertCanonicalConstitutionalFoundation,
  CANONICAL_BOOTSTRAP_TENANT,
  CANONICAL_PLATFORM_ADMIN_ROLE,
  ensureConstitutionalFoundation,
} from "../../src/lib/bootstrap/foundation";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";

/**
 * These tests intentionally require an explicitly named, disposable foundation
 * test database. They never fall back to production-like DATABASE_URL values.
 * The transaction rollback leaves the dedicated database unchanged.
 */
const FOUNDATION_TEST_URL = process.env.BEYU_FOUNDATION_TEST_DATABASE_URL;
if (FOUNDATION_TEST_URL) process.env.BEYU_ADMIN_DATABASE_URL = FOUNDATION_TEST_URL;

const describeFoundation = FOUNDATION_TEST_URL ? describe : describe.skip;
const ROLLBACK = Symbol("rollback foundation test transaction");

async function rollback<T>(operation: (tx: typeof adminDb) => Promise<T>): Promise<T | undefined> {
  try {
    return await adminDb.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof adminDb;
      const result = await operation(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error === ROLLBACK) return undefined;
    throw error;
  }
}

describeFoundation("minimal constitutional foundation", () => {
  afterAll(async () => {
    await adminPool.end().catch(() => undefined);
  });

  it("creates only the canonical tenant and role, then recognizes both idempotently", async () => {
    await rollback(async (tx) => {
      const first = await ensureConstitutionalFoundation(tx);
      expect(first).toEqual({ tenantCreated: true, roleCreated: true });

      await assertCanonicalConstitutionalFoundation(tx);
      const second = await ensureConstitutionalFoundation(tx);
      expect(second).toEqual({ tenantCreated: false, roleCreated: false });

      const [tenant] = await tx
        .select()
        .from(s.tenants)
        .where(eq(s.tenants.id, CANONICAL_BOOTSTRAP_TENANT.id))
        .limit(1);
      const [role] = await tx
        .select()
        .from(s.roles)
        .where(eq(s.roles.id, CANONICAL_PLATFORM_ADMIN_ROLE.id))
        .limit(1);
      expect(tenant?.code).toBe(CANONICAL_BOOTSTRAP_TENANT.code);
      expect(role?.code).toBe(CANONICAL_PLATFORM_ADMIN_ROLE.code);

      const [party] = await tx
        .select({ id: s.parties.id })
        .from(s.parties)
        .where(eq(s.parties.id, fixedId(ID_PREFIX.party, "PLATFORM_ADMIN")))
        .limit(1);
      const [user] = await tx
        .select({ id: s.users.id })
        .from(s.users)
        .where(eq(s.users.id, fixedId(ID_PREFIX.user, "PLATFORM_ADMIN")))
        .limit(1);
      const [state] = await tx
        .select({ id: s.adminBootstrapState.id })
        .from(s.adminBootstrapState)
        .where(eq(s.adminBootstrapState.id, "SINGLETON"))
        .limit(1);
      expect(party).toBeUndefined();
      expect(user).toBeUndefined();
      expect(state).toBeUndefined();
    });
  });

  it("fails closed when the canonical tenant id conflicts", async () => {
    await rollback(async (tx) => {
      await tx.insert(s.tenants).values({
        ...CANONICAL_BOOTSTRAP_TENANT,
        name: "Conflicting tenant",
      });
      await expect(ensureConstitutionalFoundation(tx)).rejects.toThrow(/conflicts/i);
    });
  });

  it("fails closed when the PLATFORM_ADMIN role code conflicts", async () => {
    await rollback(async (tx) => {
      await tx.insert(s.roles).values({
        ...CANONICAL_PLATFORM_ADMIN_ROLE,
        id: "ROL_DIFFERENT_PLATFORM_ADMIN",
      });
      await expect(ensureConstitutionalFoundation(tx)).rejects.toThrow(/already assigned/i);
    });
  });

  it("establishes the exact foreign-key prerequisites used by preparation", async () => {
    await rollback(async (tx) => {
      await ensureConstitutionalFoundation(tx);
      await assertCanonicalConstitutionalFoundation(tx);

      const [tenant] = await tx
        .select({ id: s.tenants.id, type: s.tenants.type })
        .from(s.tenants)
        .where(eq(s.tenants.id, CANONICAL_BOOTSTRAP_TENANT.id))
        .limit(1);
      const [role] = await tx
        .select({ id: s.roles.id, code: s.roles.code })
        .from(s.roles)
        .where(and(eq(s.roles.id, CANONICAL_PLATFORM_ADMIN_ROLE.id), eq(s.roles.code, "PLATFORM_ADMIN")))
        .limit(1);

      expect(tenant).toEqual({ id: CANONICAL_BOOTSTRAP_TENANT.id, type: "ENTERPRISE" });
      expect(role).toEqual({ id: CANONICAL_PLATFORM_ADMIN_ROLE.id, code: "PLATFORM_ADMIN" });
    });
  });
});
