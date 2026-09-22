/**
 * GOVERNED TENANT-DOMAIN REGISTRY — canonical reads.
 *
 * The registry is the ONE source of truth for the hostname → tenant mapping.
 * These reads never authorize anything: they return governed facts (which tenant
 * a hostname belongs to, whether the name and its tenant are operational, which
 * OS it belongs to) that the EXISTING authorization chain then evaluates. A row
 * can only ever RESTRICT the tenant context a request is evaluated in.
 *
 * RLS IS THE FINAL BOUNDARY AND IS NOT BYPASSED HERE
 *   Every read runs inside the caller's canonical tenant context
 *   (`withTenantDatabaseContext`) and is therefore filtered by the table's
 *   `beyu_tenant_ids()` policy. There is deliberately no SECURITY DEFINER escape
 *   hatch: a hostname owned by a tenant outside the caller's scope is simply
 *   INVISIBLE, and the resolver must treat "not visible" exactly like "not
 *   registered" — which is also what makes the denial uniform and non-oracular.
 *
 *   The one documented exception is structural: OS_BASE rows (the OS's own base
 *   domain, e.g. `health.beyuos.co.tz`) are readable by any session because their
 *   hostnames are public DNS facts of the platform. They carry no tenant context
 *   and no data — they exist so an unknown name inside a registered OS namespace
 *   can be classified as "unknown tenant host, fail closed" instead of being
 *   silently treated as an unrelated host.
 *
 *   Writes are NOT available through this module or through the runtime role at
 *   all (see migration 0063 and `scripts/setup-db-role.ts`: `beyu_runtime` holds
 *   SELECT only). The hostname binding governs the runtime, so the runtime
 *   credential must not be able to change it; lifecycle mutations live in
 *   `./lifecycle-service.ts` behind the existing administrative boundary.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tenantDomains } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";

/**
 * The governed domain types. `OS_BASE` and `CAPABILITY_BASE` are the PLATFORM
 * NAMESPACE BASES (a Sector OS origin and a shared-capability origin); neither
 * ever yields a tenant context.
 */
export type TenantDomainType = "OS_BASE" | "CAPABILITY_BASE" | "TENANT_SUBDOMAIN" | "CUSTOM_DOMAIN";
export type TenantDomainStatus =
  | "CREATED"
  | "VERIFIED"
  | "ACTIVE"
  | "MODIFIED"
  | "SUSPENDED"
  | "REVOKED"
  | "DEACTIVATED"
  | "ARCHIVED";
export type TenantDomainVerificationState = "UNVERIFIED" | "DOCUMENTED" | "VERIFIED" | "DISPUTED";

export type TenantDomainRecord = {
  id: string;
  tenantId: string;
  os: string;
  entityId: string | null;
  countryCode: string | null;
  hostname: string;
  domainType: TenantDomainType;
  status: TenantDomainStatus;
  verificationState: TenantDomainVerificationState;
  verificationMethod: string;
  verificationEvidence: string | null;
  registeredBy: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  classification: string;
  createdAt: Date;
  updatedAt: Date;
};

export const domainRecordColumns = {
  id: tenantDomains.id,
  tenantId: tenantDomains.tenantId,
  os: tenantDomains.os,
  entityId: tenantDomains.entityId,
  countryCode: tenantDomains.countryCode,
  hostname: tenantDomains.hostname,
  domainType: tenantDomains.domainType,
  status: tenantDomains.status,
  verificationState: tenantDomains.verificationState,
  verificationMethod: tenantDomains.verificationMethod,
  verificationEvidence: tenantDomains.verificationEvidence,
  registeredBy: tenantDomains.registeredBy,
  verifiedBy: tenantDomains.verifiedBy,
  verifiedAt: tenantDomains.verifiedAt,
  classification: tenantDomains.classification,
  createdAt: tenantDomains.createdAt,
  updatedAt: tenantDomains.updatedAt,
} as const;

/** The platform namespace base types (Sector OS bases and capability bases). */
export const PLATFORM_NAMESPACE_BASE_TYPES = ["OS_BASE", "CAPABILITY_BASE"] as const;

/**
 * Raw exact-hostname lookup. MUST be called inside an established tenant context
 * (directly or through one of the wrappers below) so RLS applies.
 */
export async function selectDomainByHostname(hostname: string): Promise<TenantDomainRecord | null> {
  const [row] = await db
    .select(domainRecordColumns)
    .from(tenantDomains)
    .where(eq(tenantDomains.hostname, hostname))
    .limit(1);
  return (row as TenantDomainRecord | undefined) ?? null;
}

/**
 * The registry row for a hostname, as visible to this principal.
 *
 * Returns null when the hostname is unknown OR owned by a tenant outside the
 * principal's scope: RLS makes those indistinguishable on purpose.
 */
export async function findDomainByHostname(
  principal: Principal,
  hostname: string,
): Promise<TenantDomainRecord | null> {
  return withTenantDatabaseContext(principal, () => selectDomainByHostname(hostname));
}

/**
 * Every ACTIVE platform namespace base — the governed namespaces of the Sector
 * OSs and of the shared capabilities (Family Office, HCM, …). These are the
 * NAMESPACE facts a resolver or an administrative surface may read; none of them
 * carries a tenant context.
 */
export async function activePlatformBaseDomains(
  principal: Principal,
): Promise<Array<{ hostname: string; os: string; domainType: TenantDomainType; tenantId: string }>> {
  return withTenantDatabaseContext(principal, async () =>
    db
      .select({
        hostname: tenantDomains.hostname,
        os: tenantDomains.os,
        domainType: tenantDomains.domainType,
        tenantId: tenantDomains.tenantId,
      })
      .from(tenantDomains)
      .where(
        and(
          inArray(tenantDomains.domainType, [...PLATFORM_NAMESPACE_BASE_TYPES]),
          eq(tenantDomains.status, "ACTIVE"),
        ),
      ),
  );
}

/**
 * ACTIVE OS base domains only (the Sector OS namespaces), for callers that
 * specifically mean an operating system.
 */
export async function activeOSBaseDomains(
  principal: Principal,
): Promise<Array<{ hostname: string; os: string; tenantId: string }>> {
  return withTenantDatabaseContext(principal, async () =>
    db
      .select({ hostname: tenantDomains.hostname, os: tenantDomains.os, tenantId: tenantDomains.tenantId })
      .from(tenantDomains)
      .where(and(eq(tenantDomains.domainType, "OS_BASE"), eq(tenantDomains.status, "ACTIVE"))),
  );
}

/**
 * Governed listing for the administrative surface. Scoped by the caller's
 * canonical tenant scope, so it can only ever return rows inside it.
 */
export async function listDomainsInScope(
  principal: Principal,
  filter?: { tenantId?: string; os?: string },
): Promise<TenantDomainRecord[]> {
  const scope = await tenantScopeIds(principal);
  if (scope.length === 0) return [];
  const predicates = [inArray(tenantDomains.tenantId, scope)];
  if (filter?.tenantId) predicates.push(eq(tenantDomains.tenantId, filter.tenantId));
  if (filter?.os) predicates.push(eq(tenantDomains.os, filter.os));
  const rows = await withTenantDatabaseContext(principal, async () =>
    db
      .select(domainRecordColumns)
      .from(tenantDomains)
      .where(and(...predicates))
      .orderBy(tenantDomains.os, tenantDomains.hostname),
  );
  return rows as TenantDomainRecord[];
}

/** Governed single read inside the caller's scope (administrative surface). */
export async function getDomainInScope(
  principal: Principal,
  domainId: string,
): Promise<TenantDomainRecord | null> {
  const scope = await tenantScopeIds(principal);
  if (scope.length === 0) return null;
  const [row] = await withTenantDatabaseContext(principal, async () =>
    db
      .select(domainRecordColumns)
      .from(tenantDomains)
      .where(and(eq(tenantDomains.id, domainId), inArray(tenantDomains.tenantId, scope)))
      .limit(1),
  );
  return (row as TenantDomainRecord | undefined) ?? null;
}
