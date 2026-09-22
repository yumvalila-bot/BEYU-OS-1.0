/**
 * Governed tenant-domain API contracts and error mapping.
 *
 * Same boundary discipline as `../_shared.ts`: the canonical `guarded()` wrapper
 * does authentication, authorization, rate limiting and denial auditing; this
 * module only declares the request contracts and maps expected governed refusals
 * onto the canonical error envelope. Nothing here authorizes anything.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { AdminGovernanceError } from "@/lib/admin/governance-service";
import { DelegationScopeError } from "@/lib/admin/delegation";

export const reasonSchema = z
  .string()
  .trim()
  .min(10, "A governed reason of at least 10 characters is required.")
  .max(2000);

/**
 * A tenant subdomain is addressed by LABEL, never by a full hostname: the label
 * is composed with the ACTIVE OS base domain server-side, so a caller cannot
 * declare which namespace their name lives under.
 */
export const registerDomainSchema = z
  .object({
    tenantId: z.string().min(4).max(60),
    os: z.string().trim().min(3).max(60).regex(/^[A-Z][A-Z0-9_]*$/, "Use the canonical OS registry code."),
    domainType: z.enum(["TENANT_SUBDOMAIN", "CUSTOM_DOMAIN"]),
    label: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "A hostname label may contain letters, digits and inner dashes.")
      .nullish(),
    hostname: z.string().trim().toLowerCase().min(4).max(253).nullish(),
    entityId: z.string().min(4).max(60).nullish(),
    countryCode: z.string().length(2).nullish(),
    reason: reasonSchema,
  })
  .strict()
  .refine((v) => v.domainType !== "TENANT_SUBDOMAIN" || !v.hostname, {
    message: "A tenant subdomain is specified by label under the OS base domain; do not send a full hostname.",
    path: ["hostname"],
  })
  .refine((v) => v.domainType !== "CUSTOM_DOMAIN" || !!v.hostname, {
    message: "A custom domain requires the full hostname.",
    path: ["hostname"],
  });

export const verifyDomainSchema = z.object({ reason: reasonSchema }).strict();

export const domainStatusSchema = z
  .object({
    action: z.enum(["activate", "suspend", "retire"]),
    reason: reasonSchema,
  })
  .strict();

export const reassignDomainSchema = z
  .object({
    tenantId: z.string().min(4).max(60),
    reason: reasonSchema,
  })
  .strict();

/** Map an expected governed refusal onto the canonical error envelope. */
export function domainRefusal(err: unknown, traceId: string): NextResponse | null {
  if (err instanceof AdminGovernanceError) {
    return apiError(err.code, err.message, err.status, traceId, err.details);
  }
  if (err instanceof DelegationScopeError) {
    return apiError("DELEGATION_SCOPE_EXCEEDED", err.message, 403, traceId);
  }
  return null;
}
