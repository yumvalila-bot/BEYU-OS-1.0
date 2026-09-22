/**
 * Tenant-domain test fixtures.
 *
 * The suite deliberately uses the SEEDED constitutional tenants as its fixtures
 * (Health = the namespace owner, Tanzania = a country tenant that must not see
 * Health's bindings, Agriculture = the tenant whose operational state the
 * inactive-tenant cases flip temporarily). No fixture tenant is ever created:
 * the audit ledger and enterprise-event stream reference tenant rows and are
 * append-only by architectural design, so inventing disposable tenants would
 * either pollute them or require mutating an immutable ledger.
 *
 * Hostname fixtures are created and removed through the ADMIN boundary
 * (`adminDb`) — the only role allowed to write the registry, exactly as in
 * production (the runtime role holds SELECT only). Resolution under test always
 * runs through the runtime role via `resolveHostname`, so RLS is exercised for
 * real.
 */
import { eq, like } from "drizzle-orm";
import { adminDb } from "../../src/db/admin";
import { tenants, tenantDomains } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import type { Principal } from "../../src/lib/authz";
import { DOMAIN_VERIFICATION_METHODS } from "../../src/db/schema/tenant-domains";
import { transitionTenantDomainStatus } from "../../src/lib/tenant-domain/lifecycle-service";

export const DOMAIN_VERIFICATION_METHODS_FOR_TESTS = DOMAIN_VERIFICATION_METHODS;

export const SEEDED = {
  group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP"),
  tz: fixedId(ID_PREFIX.tenant, "BEYU_TZ"),
  health: fixedId(ID_PREFIX.tenant, "BEYU_HEALTH"),
  agri: fixedId(ID_PREFIX.tenant, "BEYU_AGRI"),
} as const;

/** Every fixture hostname lives under the governed Health OS namespace. */
export const TEST_HOSTS = {
  a: "testdom-a.health.beyuos.co.tz",
  suspendedTenant: "testdom-susp-agri.health.beyuos.co.tz",
  unverified: "testdom-unverified.health.beyuos.co.tz",
  retired: "testdom-retired.health.beyuos.co.tz",
  badDns: "testdom-bad-dns.health.beyuos.co.tz",
  otherTenant: "testdom-z-tz.health.beyuos.co.tz",
  crossOs: "testdom-cross-os.health.beyuos.co.tz",
  draftOs: "testdom-draft-os.health.beyuos.co.tz",
} as const;

export async function activateTestDomain(actor: Principal, domainId: string, traceId: string): Promise<void> {
  await transitionTenantDomainStatus(
    actor,
    domainId,
    "activate",
    "Activating a verified fixture domain for the governed tenant-domain test.",
    traceId,
  );
}

/** Temporarily change a seeded tenant's status, always restoring it. */
export async function withTenantStatus<T>(
  tenantId: string,
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
  run: () => Promise<T>,
): Promise<T> {
  const [before] = await adminDb.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId));
  await adminDb.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
  try {
    return await run();
  } finally {
    await adminDb.update(tenants).set({ status: before.status }).where(eq(tenants.id, tenantId));
  }
}

/** Remove every fixture binding. Audit/event rows are ledger data and stay. */
export async function removeTestFixtures(): Promise<void> {
  await adminDb.delete(tenantDomains).where(like(tenantDomains.hostname, "testdom-%"));
}
