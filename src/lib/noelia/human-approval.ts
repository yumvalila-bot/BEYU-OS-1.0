import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { parties, users } from "@/db/schema";
import type { PermissionCode } from "@/lib/constants";
import {
  loadGrants,
  matchingAuthorityGrants,
  roleAuthorityGrants,
  type Principal,
} from "@/lib/authz";
import type { NoeliaTargetContext } from "./types";

export class HumanApprovalError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "HumanApprovalError";
  }
}

export type HumanApprovalBinding = {
  makerUserId: string;
  requiredRole: string;
  permission: PermissionCode;
  target: NoeliaTargetContext;
  payloadDigest: string;
  expectedPayloadDigest: string;
  version: number;
  expectedVersion: number;
  expiresAt: Date;
};

function assertBinding(binding: HumanApprovalBinding): void {
  if (!binding.payloadDigest || binding.payloadDigest !== binding.expectedPayloadDigest) {
    throw new HumanApprovalError("APPROVAL_DIGEST_MISMATCH", "Approval does not bind the current immutable payload digest.");
  }
  if (binding.version !== binding.expectedVersion) {
    throw new HumanApprovalError("APPROVAL_VERSION_MISMATCH", "Approval does not bind the current payload version.");
  }
  if (binding.expiresAt.getTime() <= Date.now()) {
    throw new HumanApprovalError("APPROVAL_EXPIRED", "Approval has expired.");
  }
}

async function assertCanonicalPerson(userId: string): Promise<{ primaryTenantId: string }> {
  const [identity] = await db
    .select({
      userStatus: users.status,
      isServiceAccount: users.isServiceAccount,
      mfaEnrolled: users.mfaEnrolled,
      primaryTenantId: users.primaryTenantId,
      partyStatus: parties.status,
      partyType: parties.type,
    })
    .from(users)
    .innerJoin(parties, eq(parties.id, users.partyId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!identity || identity.userStatus !== "ACTIVE" || identity.partyStatus !== "ACTIVE") {
    throw new HumanApprovalError("APPROVER_INACTIVE", "Approval requires an active canonical GlobalUserID and party.");
  }
  if (identity.isServiceAccount || identity.partyType !== "PERSON") {
    throw new HumanApprovalError("APPROVER_NOT_HUMAN", "Service, AI, organization and non-person identities cannot approve.");
  }
  if (!identity.mfaEnrolled) {
    throw new HumanApprovalError("APPROVER_MFA_NOT_ENROLLED", "The approving human must have canonical MFA enrollment.");
  }
  return { primaryTenantId: identity.primaryTenantId };
}

function grantMatchesRoleAndTarget(
  grants: ReturnType<typeof roleAuthorityGrants>,
  requiredRole: string,
  target: NoeliaTargetContext,
): boolean {
  return grants.some((grant) =>
    grant.role === requiredRole &&
    (grant.tenantId === null || grant.tenantId === target.tenantId) &&
    (grant.legalEntityId === null || grant.legalEntityId === target.legalEntityId) &&
    (grant.countryCode === null || grant.countryCode === target.countryCode),
  );
}

/** Verify that a stop/revoke/control command is from a live MFA human. */
export async function verifyHumanControlCommand(
  principal: Principal,
  permission: PermissionCode,
  target: { tenantId: string | null; legalEntityId: string | null; countryCode: string | null },
): Promise<void> {
  await assertCanonicalPerson(principal.userId);
  if (!principal.mfaSatisfied) {
    throw new HumanApprovalError("HUMAN_MFA_REQUIRED", "Fresh human MFA is required for this control command.");
  }
  if (matchingAuthorityGrants(principal, permission, {
    tenantId: target.tenantId,
    entityId: target.legalEntityId,
    countryCode: target.countryCode,
  }).length === 0) {
    throw new HumanApprovalError("HUMAN_CONTROL_DENIED", "No single live authority grant covers this control target.");
  }
}

/** Verify a live human approval before recording it. */
export async function verifyHumanApproval(
  principal: Principal,
  binding: HumanApprovalBinding,
): Promise<void> {
  assertBinding(binding);
  await assertCanonicalPerson(principal.userId);
  if (principal.userId === binding.makerUserId) {
    throw new HumanApprovalError("MAKER_CHECKER_REQUIRED", "The request maker cannot approve the same action.");
  }
  if (!principal.mfaSatisfied) {
    throw new HumanApprovalError("APPROVER_MFA_REQUIRED", "Fresh MFA step-up is required for approval.");
  }
  const permissionGrants = matchingAuthorityGrants(principal, binding.permission, {
    tenantId: binding.target.tenantId,
    entityId: binding.target.legalEntityId,
    countryCode: binding.target.countryCode,
  });
  if (!permissionGrants.some((grant) => grant.role === binding.requiredRole)) {
    throw new HumanApprovalError(
      "APPROVER_ROLE_REQUIRED",
      `Approval requires the exact live scoped role ${binding.requiredRole}; role labels from another grant do not qualify.`,
    );
  }
}

/**
 * Recheck a previously recorded approval immediately before execution. MFA was
 * proven at decision time; identity status and the exact scoped role are live
 * again here so suspension, role expiry and revocation outrank queued work.
 */
export async function verifyRecordedHumanApproval(input: {
  approverUserId: string;
  mfaVerified: boolean;
  binding: HumanApprovalBinding;
}): Promise<void> {
  assertBinding(input.binding);
  const identity = await assertCanonicalPerson(input.approverUserId);
  if (!input.mfaVerified) {
    throw new HumanApprovalError("APPROVER_MFA_NOT_VERIFIED", "Recorded approval lacks canonical MFA evidence.");
  }
  if (input.approverUserId === input.binding.makerUserId) {
    throw new HumanApprovalError("MAKER_CHECKER_REQUIRED", "The request maker cannot execute their own approval.");
  }
  const liveRows = await loadGrants(input.approverUserId, input.binding.target.tenantId || identity.primaryTenantId);
  const liveGrants = roleAuthorityGrants(liveRows);
  if (!grantMatchesRoleAndTarget(liveGrants, input.binding.requiredRole, input.binding.target)) {
    throw new HumanApprovalError(
      "APPROVER_ROLE_REVOKED",
      `The exact scoped role ${input.binding.requiredRole} is no longer active for this target.`,
    );
  }
  // The role must still grant the action permission on the same tuple.
  if (!liveGrants.some((grant) =>
    grant.role === input.binding.requiredRole &&
    grant.permission === input.binding.permission &&
    (grant.tenantId === null || grant.tenantId === input.binding.target.tenantId) &&
    (grant.legalEntityId === null || grant.legalEntityId === input.binding.target.legalEntityId) &&
    (grant.countryCode === null || grant.countryCode === input.binding.target.countryCode),
  )) {
    throw new HumanApprovalError("APPROVER_PERMISSION_REVOKED", "Approver permission is no longer live on the approved target tuple.");
  }
}
