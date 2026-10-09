import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "../../src/db";
import { users } from "../../src/db/schema";
import type { Principal } from "../../src/lib/authz";
import {
  verifyHumanApproval,
  verifyRecordedHumanApproval,
  type HumanApprovalBinding,
} from "../../src/lib/noelia/human-approval";
import { seededPrincipal } from "./db-fixtures";

function binding(overrides: Partial<HumanApprovalBinding> = {}): HumanApprovalBinding {
  return {
    makerUserId: "USR_REQUEST_MAKER",
    requiredRole: "CHIEF_GOVERNANCE_OFFICER",
    permission: "ai:decision.review",
    target: { tenantId: "TEN_BEYU_GROUP", legalEntityId: null, countryCode: null },
    payloadDigest: "a".repeat(64),
    expectedPayloadDigest: "a".repeat(64),
    version: 1,
    expectedVersion: 1,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: "HumanApprovalError", code });
}

async function withRolledBackIdentityMutation(operation: () => Promise<void>): Promise<void> {
  const rollback = `ROLLBACK_${Date.now()}_${Math.random()}`;
  try {
    await withDatabaseTransactionContext(async () => {
      await operation();
      throw new Error(rollback);
    });
  } catch (error) {
    if ((error as Error).message !== rollback) throw error;
  }
}

describe("canonical accountable-human approval", () => {
  it("accepts only a separate live exact-role MFA human on the exact binding", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await expect(verifyHumanApproval(governance, binding())).resolves.toBeUndefined();
    await expectCode(verifyHumanApproval(governance, binding({ makerUserId: governance.userId })), "MAKER_CHECKER_REQUIRED");
    await expectCode(verifyHumanApproval({ ...governance, mfaSatisfied: false }, binding()), "APPROVER_MFA_REQUIRED");
    await expectCode(verifyHumanApproval(governance, binding({ expectedPayloadDigest: "b".repeat(64) })), "APPROVAL_DIGEST_MISMATCH");
    await expectCode(verifyHumanApproval(governance, binding({ expectedVersion: 2 })), "APPROVAL_VERSION_MISMATCH");
    await expectCode(verifyHumanApproval(governance, binding({ expiresAt: new Date(Date.now() - 1) })), "APPROVAL_EXPIRED");
  });

  it("rejects a live human whose role is not the required approver role", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    await expectCode(verifyHumanApproval(cfo, binding()), "APPROVER_ROLE_REQUIRED");
  });

  it("does not recombine a matching role label with another target grant", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    const scoped: Principal = {
      ...governance,
      authorityGrants: (governance.authorityGrants ?? []).map((grant) => ({
        ...grant,
        tenantId: "TEN_BEYU_GROUP",
        legalEntityId: "LEN_BEYU_HOLDINGS",
        countryCode: "AE",
      })),
      entityScope: ["LEN_BEYU_HOLDINGS"],
      countryScope: ["AE"],
    };
    await expectCode(verifyHumanApproval(scoped, binding({
      target: { tenantId: "TEN_BEYU_GROUP", legalEntityId: "LEN_BEYU_FAMILY_TRUST", countryCode: "MU" },
    })), "APPROVER_ROLE_REQUIRED");
  });

  it("rejects a canonical service account even when presentation fields claim a human role", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await withRolledBackIdentityMutation(async () => {
      await db.update(users).set({ isServiceAccount: true }).where(eq(users.id, governance.userId));
      await expectCode(verifyHumanApproval(governance, binding()), "APPROVER_NOT_HUMAN");
    });
  });

  it("rejects an inactive human and rechecks recorded approval authority at execution", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await withRolledBackIdentityMutation(async () => {
      await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, governance.userId));
      await expectCode(verifyHumanApproval(governance, binding()), "APPROVER_INACTIVE");
      await expectCode(verifyRecordedHumanApproval({
        approverUserId: governance.userId,
        mfaVerified: true,
        binding: binding(),
      }), "APPROVER_INACTIVE");
    });
  });

  it("rejects recorded approval without MFA evidence", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await expectCode(verifyRecordedHumanApproval({
      approverUserId: governance.userId,
      mfaVerified: false,
      binding: binding(),
    }), "APPROVER_MFA_NOT_VERIFIED");
  });
});
