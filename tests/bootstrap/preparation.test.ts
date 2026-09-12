import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { adminDb, adminPool } from "../../src/db/admin";
import * as s from "../../src/db/schema";
import { ensureConstitutionalFoundation, CANONICAL_BOOTSTRAP_TENANT, CANONICAL_PLATFORM_ADMIN_ROLE } from "../../src/lib/bootstrap/foundation";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { prepareAdminBootstrap } from "../../scripts/prepare-admin-bootstrap";

/** Requires an explicitly named disposable database; never falls back to production-like URLs. */
const FOUNDATION_TEST_URL = process.env.BEYU_FOUNDATION_TEST_DATABASE_URL;
if (FOUNDATION_TEST_URL) process.env.BEYU_ADMIN_DATABASE_URL = FOUNDATION_TEST_URL;

const describePreparation = FOUNDATION_TEST_URL ? describe : describe.skip;
const ROLLBACK = Symbol("rollback preparation test transaction");

async function rollback(operation: (tx: typeof adminDb) => Promise<void>): Promise<void> {
  try {
    await adminDb.transaction(async (rawTx) => {
      await operation(rawTx as unknown as typeof adminDb);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

describePreparation("canonical administrator preparation", () => {
  afterAll(async () => {
    await adminPool.end().catch(() => undefined);
  });

  it("prepares an enrollable-only admin after the minimal foundation and remains idempotent", async () => {
    await rollback(async (tx) => {
      await ensureConstitutionalFoundation(tx);
      await prepareAdminBootstrap("owner@foundation.test", tx);
      await prepareAdminBootstrap("owner@foundation.test", tx);

      const adminUserId = fixedId(ID_PREFIX.user, "PLATFORM_ADMIN");
      const adminPartyId = fixedId(ID_PREFIX.party, "PLATFORM_ADMIN");
      const assignmentId = fixedId(ID_PREFIX.roleAssignment, "PLATFORM_ADMIN_PLATFORM_ADMIN");

      const [state] = await tx
        .select({ id: s.adminBootstrapState.id, status: s.adminBootstrapState.status, adminUserId: s.adminBootstrapState.adminUserId })
        .from(s.adminBootstrapState)
        .where(eq(s.adminBootstrapState.id, "SINGLETON"))
        .limit(1);
      const [user] = await tx
        .select({ id: s.users.id, partyId: s.users.partyId, passwordHash: s.users.passwordHash, passwordMustChange: s.users.passwordMustChange, mfaEnrolled: s.users.mfaEnrolled, mfaSecretEncrypted: s.users.mfaSecretEncrypted })
        .from(s.users)
        .where(eq(s.users.id, adminUserId))
        .limit(1);
      const [party] = await tx
        .select({ id: s.parties.id })
        .from(s.parties)
        .where(eq(s.parties.id, adminPartyId))
        .limit(1);
      const [assignment] = await tx
        .select({ id: s.roleAssignments.id, userId: s.roleAssignments.userId, roleId: s.roleAssignments.roleId, tenantId: s.roleAssignments.tenantId })
        .from(s.roleAssignments)
        .where(eq(s.roleAssignments.id, assignmentId))
        .limit(1);

      expect(state).toEqual({ id: "SINGLETON", status: "AVAILABLE", adminUserId });
      expect(party).toEqual({ id: adminPartyId });
      expect(user?.id).toBe(adminUserId);
      expect(user?.partyId).toBe(adminPartyId);
      expect(user?.passwordMustChange).toBe(true);
      expect(user?.mfaEnrolled).toBe(false);
      expect(user?.mfaSecretEncrypted).toBeNull();
      expect(user?.passwordHash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
      expect(user?.passwordHash).not.toContain("owner@foundation.test");
      expect(assignment).toEqual({
        id: assignmentId,
        userId: adminUserId,
        roleId: CANONICAL_PLATFORM_ADMIN_ROLE.id,
        tenantId: CANONICAL_BOOTSTRAP_TENANT.id,
      });
    });
  });

  it("does not reopen a sealed bootstrap", async () => {
    await rollback(async (tx) => {
      await ensureConstitutionalFoundation(tx);
      await prepareAdminBootstrap("owner@foundation.test", tx);
      const adminUserId = fixedId(ID_PREFIX.user, "PLATFORM_ADMIN");

      await tx
        .update(s.adminBootstrapState)
        .set({ status: "SEALED", adminUserId, sealedByUserId: adminUserId, sealedAt: new Date() })
        .where(and(eq(s.adminBootstrapState.id, "SINGLETON"), eq(s.adminBootstrapState.status, "AVAILABLE")));

      await expect(prepareAdminBootstrap("owner@foundation.test", tx)).rejects.toThrow(/SEALED|reopen/i);
    });
  });
});
