/**
 * BEYU OS — shared boundary helpers for the administrative governance API.
 *
 * The routes themselves use the canonical `guarded()` wrapper (authentication →
 * authorization → validation → rate limit → audit), exactly like every other
 * BEYU OS capability surface. This module only adds: the zod contract shared by
 * the routes, and the mapping of expected governed refusals
 * (AdminGovernanceError) onto the canonical error envelope. Nothing here
 * authorizes anything on its own.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminGovernanceError } from "@/lib/admin/governance-service";
import { DelegationScopeError } from "@/lib/admin/delegation";
import { apiError } from "@/lib/api";

export const reasonSchema = z.string().trim().min(10, "A governed reason of at least 10 characters is required.").max(2000);

export const registerUserSchema = z
  .object({
    email: z.string().email().max(320),
    displayName: z.string().trim().min(2).max(200),
    givenName: z.string().trim().max(100).nullish(),
    familyName: z.string().trim().max(100).nullish(),
    phone: z.string().trim().max(40).nullish(),
    countryCode: z.string().length(2).nullish(),
    primaryTenantId: z.string().min(4).max(60),
    reason: reasonSchema,
  })
  .strict();

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(2).max(200).optional(),
    phone: z.string().trim().max(40).nullish(),
    countryCode: z.string().length(2).nullish(),
    reason: reasonSchema,
  })
  .strict();

export const userStatusSchema = z
  .object({
    action: z.enum(["activate", "suspend", "deactivate"]),
    reason: reasonSchema,
  })
  .strict();

export const removeSchema = z.object({ reason: reasonSchema }).strict();

export const registerTenantSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, "Tenant code may contain letters, digits and dashes only."),
    name: z.string().trim().min(3).max(200),
    type: z.enum(["ENTERPRISE", "COUNTRY", "SECTOR", "LEGAL_ENTITY", "BRANCH", "DEPARTMENT"]),
    parentTenantId: z.string().min(4).max(60),
    countryCode: z.string().length(2).nullish(),
    isolationTier: z.enum(["LOGICAL", "DEDICATED", "ISOLATED"]).optional(),
    reason: reasonSchema,
  })
  .strict();

export const tenantStatusSchema = z
  .object({
    action: z.enum(["activate", "suspend", "deactivate", "archive", "remove"]),
    reason: reasonSchema,
  })
  .strict();

export const membershipSchema = z
  .object({
    userId: z.string().min(4).max(60),
    tenantId: z.string().min(4).max(60),
    reason: reasonSchema,
  })
  .strict();

export const grantRoleSchema = z
  .object({
    userId: z.string().min(4).max(60),
    roleCode: z.string().min(3).max(60),
    tenantId: z.string().min(4).max(60),
    legalEntityId: z.string().min(4).max(60).nullish(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    justification: reasonSchema,
  })
  .strict();

export const revokeRoleSchema = z.object({ reason: reasonSchema }).strict();

export const createDelegationSchema = z
  .object({
    delegateeUserId: z.string().min(4).max(60),
    permissions: z.array(z.string().min(3).max(80)).min(1).max(20),
    scopeTenantIds: z.array(z.string().min(4).max(60)).min(1).max(50),
    scopeLegalEntityIds: z.array(z.string().min(4).max(60)).max(100).optional(),
    scopeCountryCodes: z.array(z.string().length(2)).max(50).optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime(),
    reason: reasonSchema,
  })
  .strict();

export const revokeDelegationSchema = z.object({ reason: reasonSchema }).strict();

/* ------------------------------------------------------------------ */
/* BEYU Registry — unified governed registration contracts             */
/* ------------------------------------------------------------------ */

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const registerPartySchema = z
  .object({
    displayName: z.string().trim().min(2).max(200),
    givenName: z.string().trim().max(100).nullish(),
    familyName: z.string().trim().max(100).nullish(),
    email: z.string().email().max(320).nullish(),
    phone: z.string().trim().max(40).nullish(),
    countryCode: z.string().length(2).nullish(),
    birthDate: z.string().regex(isoDate).nullish(),
    nationality: z.string().length(2).nullish(),
    primaryTenantId: z.string().min(4).max(60),
    reason: reasonSchema,
  })
  .strict();

export const registerFamilySchema = z
  .object({
    tenantId: z.string().min(4).max(60),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, "Family code may contain letters, digits, underscores and dashes only."),
    displayName: z.string().trim().min(2).max(200),
    legalName: z.string().trim().min(2).max(300).nullish(),
    countryCode: z.string().length(2).nullish(),
    jurisdictionId: z.string().min(3).max(60).nullish(),
    reason: reasonSchema,
  })
  .strict();

export const registerFamilyMemberSchema = z
  .object({
    partyId: z.string().min(4).max(60),
    relationshipType: z.enum([
      "BIRTH_DESCENDANT",
      "ADOPTED_CHILD",
      "STEPCHILD",
      "SPOUSE_OF_MEMBER",
      "FORMER_SPOUSE_OF_MEMBER",
      "OTHER_AFFINAL",
      "NON_FAMILY",
    ]),
    parentMemberId: z.string().min(4).max(60).nullish(),
    linkedToMemberId: z.string().min(4).max(60).nullish(),
    branch: z.string().trim().min(1).max(80).nullish(),
    directDescendant: z.boolean().optional(),
    provenance: z.string().trim().min(5).max(1000),
    effectiveFrom: z.string().regex(isoDate).nullish(),
    effectiveTo: z.string().regex(isoDate).nullish(),
    reason: reasonSchema,
  })
  .strict();

export const registerEntitySchema = z
  .object({
    tenantId: z.string().min(4).max(60),
    code: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, "Entity code may contain letters, digits and dashes only."),
    legalName: z.string().trim().min(3).max(300),
    entityType: z.enum([
      "TRUST",
      "FOUNDATION",
      "HOLDING",
      "COUNTRY_HOLDING",
      "OPERATING_COMPANY",
      "SUBSIDIARY",
      "ASSOCIATE",
      "JOINT_VENTURE",
      "PARTNERSHIP",
      "BRANCH",
      "NON_PROFIT",
    ]),
    tradingName: z.string().trim().min(2).max(300).nullish(),
    parentEntityId: z.string().min(4).max(60).nullish(),
    countryCode: z.string().length(2),
    jurisdictionId: z.string().min(3).max(60).nullish(),
    registrationNumber: z.string().trim().min(2).max(60).nullish(),
    taxIdentifier: z.string().trim().min(2).max(60).nullish(),
    incorporationDate: z.string().regex(isoDate).nullish(),
    functionalCurrency: z.string().length(3).nullish(),
    accountingStandard: z.string().trim().max(40).nullish(),
    sectorCode: z.string().trim().max(40).nullish(),
    effectiveFrom: z.string().regex(isoDate).nullish(),
    reason: reasonSchema,
  })
  .strict();

export const registerBusinessSchema = z
  .object({
    tenantId: z.string().min(4).max(60),
    legalEntityId: z.string().min(4).max(60),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/, "Business unit code may contain letters, digits and dashes only."),
    name: z.string().trim().min(2).max(200),
    unitType: z.enum(["DIVISION", "DEPARTMENT", "BRANCH", "TEAM"]),
    parentUnitId: z.string().min(4).max(60).nullish(),
    costCentre: z.string().trim().max(40).nullish(),
    reason: reasonSchema,
  })
  .strict();

export const registerOwnershipSchema = z
  .object({
    tenantId: z.string().min(4).max(60),
    ownedEntityId: z.string().min(4).max(60),
    ownerPartyId: z.string().min(4).max(60).nullish(),
    ownerEntityId: z.string().min(4).max(60).nullish(),
    ownershipType: z.enum(["DIRECT", "INDIRECT", "BENEFICIAL", "CONTROL_ONLY"]),
    instrument: z.string().trim().min(2).max(60).nullish(),
    economicPct: z.number().min(0).max(100),
    votingPct: z.number().min(0).max(100),
    controlRights: z.string().trim().max(1000).nullish(),
    effectiveFrom: z.string().regex(isoDate),
    effectiveTo: z.string().regex(isoDate).nullish(),
    provenance: z.string().trim().min(5).max(1000),
    supportingDocumentId: z.string().min(3).max(60).nullish(),
    reason: reasonSchema,
  })
  .strict()
  .refine((v) => Boolean(v.ownerPartyId) !== Boolean(v.ownerEntityId), {
    message: "Exactly one owner (ownerPartyId or ownerEntityId) is required.",
    path: ["ownerPartyId"],
  });

export const registerEmploymentSchema = z
  .object({
    tenantId: z.string().min(4).max(60),
    partyId: z.string().min(4).max(60),
    legalEntityId: z.string().min(4).max(60),
    employeeNo: z.string().trim().min(3).max(40),
    hireDate: z.string().regex(isoDate),
    countryCode: z.string().length(2),
    employmentType: z
      .enum(["PERMANENT", "FIXED_TERM", "PROBATION", "CONSULTANT", "INTERN"])
      .nullish(),
    positionId: z.string().min(4).max(60).nullish(),
    workEmail: z.string().email().max(320).nullish(),
    managerEmployeeId: z.string().min(4).max(60).nullish(),
    endDate: z.string().regex(isoDate).nullish(),
    reason: reasonSchema,
  })
  .strict();

/**
 * Map an expected governed refusal to the canonical error envelope. Unknown
 * errors are NOT mapped — they propagate to guarded()'s 500 boundary so no
 * internal detail can leak.
 */
export function governedRefusal(err: unknown, traceId: string): NextResponse | null {
  if (err instanceof AdminGovernanceError) {
    return apiError(err.code, err.message, err.status, traceId, err.details);
  }
  if (err instanceof DelegationScopeError) {
    return apiError("DELEGATION_SCOPE_EXCEEDED", err.message, 403, traceId);
  }
  return null;
}
