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
