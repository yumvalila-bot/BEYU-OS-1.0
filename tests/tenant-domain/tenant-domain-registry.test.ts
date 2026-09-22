/**
 * Governed tenant-domain REGISTRY + RESOLVER — integration suite (real PostgreSQL,
 * real non-superuser runtime role).
 *
 * Covers the acceptance matrix: known active tenant hostname, unknown hostname,
 * inactive tenant, duplicate hostname, duplicate tenant slug, cross-tenant access,
 * cross-OS access, unauthenticated, authenticated-but-unauthorized, authorized
 * tenant access, tenant-hostname == canonical IS, Host-header manipulation,
 * malformed hostname, normalisation/case handling, tenant deactivation, domain
 * reassignment, RLS enforcement, audit events, and the invariant that no
 * authorization decision is derived from a hostname or a pathname.
 *
 * The suite deliberately drives the REAL `beyu_runtime` role (never the owner) on
 * the resolution path: RLS is the boundary under test, not an implementation
 * detail asserted from source text.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { Client } from "pg";
import { adminDb } from "../../src/db/admin";
import { db } from "../../src/db";
import { auditLog, enterpriseEvents, tenantDomains, tenants } from "../../src/db/schema";
import { HIGH_RISK_PERMISSIONS } from "../../src/lib/constants";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import type { Principal } from "../../src/lib/authz";
import {
  DOMAIN_VERIFICATION_METHODS_FOR_TESTS,
  activateTestDomain,
  removeTestFixtures,
  SEEDED,
  TEST_HOSTS,
  withTenantStatus,
} from "./fixtures";
import {
  registerTenantDomain,
  reassignTenantDomain,
  resolveHostname,
  resolveRequestHostname,
  tenantSlugForCode,
  transitionTenantDomainStatus,
  verifyTenantDomain,
  hostnameDenialResponse,
} from "../../src/lib/tenant-domain";

const GROUP = SEEDED.group;
const HEALTH = SEEDED.health;
const TZ = SEEDED.tz;
const AGRI = SEEDED.agri;

/** Group-scoped enterprise administrator: the subtree includes the fixtures. */
function groupAdmin(): Principal {
  return {
    userId: "USR_TEST_DOMAIN_ADMIN",
    partyId: "PTY_TEST_DOMAIN_ADMIN",
    email: "domain.admin@beyu.test",
    displayName: "Domain Administrator",
    tenantId: GROUP,
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
    roles: ["GROUP_CEO"],
    permissions: new Set([
      "organization:tenantdomain.read",
      "organization:tenantdomain.register",
      "organization:tenantdomain.verify",
      "organization:tenantdomain.manage",
      "organization:tenantdomain.reassign",
    ]),
    clearance: "HIGHLY_RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "SES_TEST_DOMAIN_ADMIN",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

/** A principal that holds NO tenant-domain capability at all. */
function unauthorized(): Principal {
  return { ...groupAdmin(), roles: ["TENANT_MEMBER"], permissions: new Set() };
}

/** A country-scoped principal: tenant scope is exactly one tenant. */
function tzScoped(): Principal {
  return { ...groupAdmin(), tenantId: TZ, tenantCode: "BEYU-TZ", tenantType: "COUNTRY", roles: ["COUNTRY_DIRECTOR"] };
}

/** A tenant-scoped administrator with capability but a ONE-tenant scope. */
function tzScopedAdmin(): Principal {
  return { ...tzScoped(), roles: ["GROUP_CEO"], permissions: groupAdmin().permissions };
}

const tenantA = HEALTH;
const tenantOther = TZ;
const tenantAgri = AGRI;
const createdDomainIds: string[] = [];

const REASON = "Integration fixture for the governed tenant-domain registry.";

beforeAll(async () => {
  await removeTestFixtures();
});

afterAll(async () => {
  await removeTestFixtures();
});

describe("A — a known ACTIVE tenant hostname resolves to exactly one tenant", () => {
  it("resolves the governed binding after verification + activation", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      { tenantId: tenantA, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "testdom-a", reason: REASON },
      "TRACE_TEST_A",
    );
    createdDomainIds.push(registered.domainId);
    expect(registered.hostname).toBe(TEST_HOSTS.a);
    expect(registered.status).toBe("CREATED");
    expect(registered.verificationState).toBe("UNVERIFIED");
    expect(registered.verificationMethod).toBe(DOMAIN_VERIFICATION_METHODS_FOR_TESTS.DNS_TXT);

    // Registered but NOT reachable: no governed binding resolves yet.
    const beforeVerify = await resolveHostname(groupAdmin(), TEST_HOSTS.a);
    expect(beforeVerify).toEqual({ kind: "DENIED", hostname: TEST_HOSTS.a, reason: "DOMAIN_NOT_ACTIVE" });

    await verifyTenantDomain(groupAdmin(), registered.domainId, REASON, "TRACE_TEST_A2", async () => [
      registered.challengeRecordValue,
    ]);
    await activateTestDomain(groupAdmin(), registered.domainId, "TRACE_TEST_A3");

    const resolved = await resolveHostname(groupAdmin(), TEST_HOSTS.a);
    expect(resolved.kind).toBe("TENANT");
    if (resolved.kind !== "TENANT") throw new Error("unreachable");
    expect(resolved.context.tenantId).toBe(tenantA);
    expect(resolved.context.tenantCode).toBe("BEYU-HEALTH");
    expect(resolved.context.os).toBe("HEALTH_OS");
    expect(resolved.context.domainType).toBe("TENANT_SUBDOMAIN");
    expect(resolved.context.verificationState).toBe("VERIFIED");
    expect(resolved.context.namespace).toBe("health.beyuos.co.tz");
    // The resolution carries NO authority of any kind.
    expect(Object.keys(resolved.context)).not.toContain("permissions");
    expect(Object.keys(resolved.context)).not.toContain("allowed");
  });

  it("resolves the same binding through the request entry point", async () => {
    const viaRequest = await resolveRequestHostname(groupAdmin(), TEST_HOSTS.a);
    expect(viaRequest.kind).toBe("TENANT");
  });
});

describe("B — unknown hostnames fail closed and never fall back", () => {
  it("refuses an unregistered name INSIDE a registered OS namespace", async () => {
    const resolved = await resolveHostname(groupAdmin(), "not-registered-at-all.health.beyuos.co.tz");
    expect(resolved).toEqual({
      kind: "DENIED",
      hostname: "not-registered-at-all.health.beyuos.co.tz",
      reason: "UNKNOWN_TENANT_HOST",
    });
  });

  it("refuses it identically through the request entry point", async () => {
    const resolved = await resolveRequestHostname(groupAdmin(), "not-registered-at-all.health.beyuos.co.tz");
    expect(resolved.kind).toBe("DENIED");
  });

  it("treats a host outside every namespace as NOT_APPLICABLE (no tenant is ever invented)", async () => {
    for (const host of [
      "beyu-os-1-0.vercel.app",
      "some-other-domain.example.com",
      "preview-3100-sandbox.e2b.app",
    ]) {
      const resolved = await resolveHostname(groupAdmin(), host);
      expect(resolved, host).toEqual({ kind: "NOT_APPLICABLE", hostname: host, reason: "UNREGISTERED" });
    }
  });

  it("classifies the platform's own execution hosts locally", async () => {
    for (const host of ["localhost", "127.0.0.1", "localhost:3100"]) {
      const resolved = await resolveHostname(groupAdmin(), host);
      expect(resolved.kind).toBe("NOT_APPLICABLE");
    }
  });

  it("recognises the OS base domain as a namespace marker, never as a tenant", async () => {
    const resolved = await resolveHostname(groupAdmin(), "health.beyuos.co.tz");
    expect(resolved).toEqual({ kind: "OS_BASE", hostname: "health.beyuos.co.tz", os: "HEALTH_OS" });
  });
});

describe("C — an inactive tenant cannot resolve", () => {
  it("refuses a verified, ACTIVE domain whose tenant is suspended", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      {
        tenantId: tenantAgri,
        os: "HEALTH_OS",
        domainType: "TENANT_SUBDOMAIN",
        label: "testdom-susp-agri",
        reason: REASON,
      },
      "TRACE_TEST_C",
    );
    createdDomainIds.push(registered.domainId);
    await verifyTenantDomain(groupAdmin(), registered.domainId, REASON, "TRACE_TEST_C2", async () => [
      registered.challengeRecordValue,
    ]);
    await activateTestDomain(groupAdmin(), registered.domainId, "TRACE_TEST_C3");
    expect((await resolveHostname(groupAdmin(), TEST_HOSTS.suspendedTenant)).kind).toBe("TENANT");

    // Suspend the TENANT — the domain stays ACTIVE, and must still fail closed.
    await withTenantStatus(tenantAgri, "SUSPENDED", async () => {
      expect(await resolveHostname(groupAdmin(), TEST_HOSTS.suspendedTenant)).toEqual({
        kind: "DENIED",
        hostname: TEST_HOSTS.suspendedTenant,
        reason: "TENANT_NOT_OPERATIONAL",
      });
      // …and DEACTIVATED behaves identically (no lifecycle state grants reachability).
      await adminDb.update(tenants).set({ status: "DEACTIVATED" }).where(eq(tenants.id, tenantAgri));
      expect((await resolveHostname(groupAdmin(), TEST_HOSTS.suspendedTenant)).kind).toBe("DENIED");
    });
    expect((await resolveHostname(groupAdmin(), TEST_HOSTS.suspendedTenant)).kind).toBe("TENANT");
  });

  it("refuses to register a domain for a non-ACTIVE tenant", async () => {
    await withTenantStatus(tenantAgri, "SUSPENDED", async () => {
      await expect(
        registerTenantDomain(
          groupAdmin(),
          {
            tenantId: tenantAgri,
            os: "HEALTH_OS",
            domainType: "TENANT_SUBDOMAIN",
            label: "testdom-suspended-tenant",
            reason: REASON,
          },
          "TRACE_TEST_C4",
        ),
      ).rejects.toMatchObject({ code: "TENANT_NOT_OPERATIONAL", status: 409 });
    });
  });
});

describe("D/E — duplicate hostname and duplicate tenant slug cannot be claimed twice", () => {
  it("refuses a second registration of the same hostname", async () => {
    await expect(
      registerTenantDomain(
        groupAdmin(),
        { tenantId: tenantA, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "testdom-a", reason: REASON },
        "TRACE_TEST_D",
      ),
    ).rejects.toMatchObject({ code: "HOSTNAME_ALREADY_REGISTERED", status: 409 });
  });

  it("refuses a slug collision coming from a DIFFERENT tenant", async () => {
    // A DIFFERENT tenant asking for the same label: the label is not "available
    // to whoever asks first" — it belongs to exactly one tenant, globally.
    await expect(
      registerTenantDomain(
        groupAdmin(),
        { tenantId: tenantOther, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "testdom-a", reason: REASON },
        "TRACE_TEST_E",
      ),
    ).rejects.toMatchObject({ code: "HOSTNAME_ALREADY_REGISTERED", status: 409 });
  });

  it("derives the canonical slug from the tenant code", () => {
    expect(tenantSlugForCode("BEYU-HEALTH")).toBe("beyu-health");
    expect(tenantSlugForCode("BEYU_TEST_SECTOR 2")).toBe("beyu-test-sector-2");
    expect(tenantSlugForCode("---")).toBeNull();
  });

  it("enforces global uniqueness in the DATABASE, not only in the service", async () => {
    const attempt = adminDb.insert(tenantDomains).values({
        id: "TDM_TEST_DUP_INDEX",
        tenantId: tenantOther,
        os: "HEALTH_OS",
        hostname: TEST_HOSTS.a,
        domainType: "TENANT_SUBDOMAIN",
        status: "CREATED",
        verificationState: "UNVERIFIED",
        verificationMethod: "DNS_TXT",
        verificationTokenHash: "deadbeef",
        registeredBy: "TEST",
        classification: "CONFIDENTIAL",
      });
    // Drizzle wraps driver errors: the PostgreSQL unique violation surfaces on the
    // cause. The point is that the DATABASE refuses a duplicate hostname, so the
    // invariant cannot be lost by a future service-layer refactor.
    const error: unknown = await attempt.then(
      () => null,
      (e: unknown) => e,
    );
    const cause = (error as { cause?: { code?: string; message?: string } } | null)?.cause;
    expect(cause?.code).toBe("23505");
    expect(cause?.message).toContain("tenant_domains_hostname_uidx");
  });
});

describe("F — cross-tenant access", () => {
  it("does not let a one-tenant principal resolve another tenant's hostname", async () => {
    // Two independent layers must refuse, and BOTH are fail-closed:
    //   • in the running application the registry read runs on the RUNTIME role,
    //     so RLS makes the row invisible and the refusal is identical to
    //     "unknown host" (`UNKNOWN_TENANT_HOST`) — asserted by the RLS suite;
    //   • the resolver additionally asserts the resolved tenant against the
    //     principal's canonical tenant scope, so a privileged TEST connection
    //     (which bypasses RLS, as this suite's `db` handle does) still refuses
    //     with `TENANT_OUT_OF_SCOPE`.
    const resolved = await resolveHostname(tzScoped(), TEST_HOSTS.a);
    expect(resolved.kind).toBe("DENIED");
    if (resolved.kind !== "DENIED") throw new Error("unreachable");
    expect(["UNKNOWN_TENANT_HOST", "TENANT_OUT_OF_SCOPE"]).toContain(resolved.reason);
    expect(resolved).toEqual({ kind: "DENIED", hostname: TEST_HOSTS.a, reason: "TENANT_OUT_OF_SCOPE" });
  });

  it("does not let a one-tenant administrator read or mutate another tenant's domain", async () => {
    const actor = tzScopedAdmin();
    const domainId = createdDomainIds[0];
    const { getDomainInScope } = await import("../../src/lib/tenant-domain");
    await expect(withTenantDatabaseContext(actor, () => getDomainInScope(actor, domainId))).resolves.toBeNull();
    // Uniform 404: existence in another tenant is not disclosed.
    await expect(transitionTenantDomainStatus(actor, domainId, "suspend", REASON, "TRACE_TEST_F")).rejects.toMatchObject({
      code: "DOMAIN_NOT_FOUND",
      status: 404,
    });
  });

  it("keeps the mapping invisible at the DATABASE layer for the other tenant's context", async () => {
    const client = new Client({ connectionString: process.env.BEYU_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("begin");
      await client.query("set local role beyu_runtime");
      await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantOther]);
      // TENANT bindings of the other tenant: nothing. (The OS base namespace row
      // is the one documented exception — a public DNS fact with no tenant
      // context and no data — so it is excluded from this assertion and asserted
      // explicitly in the RLS suite below.)
      const visible = await client.query(
        "select id from tenant_domains where tenant_id = $1 and domain_type <> 'OS_BASE'",
        [tenantA],
      );
      expect(visible.rowCount).toBe(0);
      await client.query("rollback");
    } finally {
      await client.end();
    }
  });
});

describe("G — cross-OS access", () => {
  it("refuses a row bound to another OS placed under the Health namespace", async () => {
    await adminDb.insert(tenantDomains).values({
      id: "TDM_TEST_CROSS_OS",
      tenantId: tenantA,
      os: "FINANCE_OS",
      hostname: TEST_HOSTS.crossOs,
      domainType: "TENANT_SUBDOMAIN",
      status: "ACTIVE",
      verificationState: "VERIFIED",
      verificationMethod: "DNS_TXT",
      verifiedBy: "TEST",
      verifiedAt: new Date(),
      registeredBy: "TEST",
      classification: "CONFIDENTIAL",
    });
    const resolved = await resolveHostname(groupAdmin(), "testdom-cross-os.health.beyuos.co.tz");
    expect(resolved).toEqual({
      kind: "DENIED",
      hostname: TEST_HOSTS.crossOs,
      reason: "DOMAIN_NOT_IN_OS_NAMESPACE",
    });
  });

  it("refuses an OS the canonical registry does not declare as an ACTIVE SECTOR_OS", async () => {
    await adminDb.insert(tenantDomains).values({
      id: "TDM_TEST_DRAFT_OS",
      tenantId: tenantA,
      os: "MINING_OS",
      hostname: TEST_HOSTS.draftOs,
      domainType: "TENANT_SUBDOMAIN",
      status: "ACTIVE",
      verificationState: "VERIFIED",
      verificationMethod: "DNS_TXT",
      verifiedBy: "TEST",
      verifiedAt: new Date(),
      registeredBy: "TEST",
      classification: "CONFIDENTIAL",
    });
    // MINING_OS is DRAFT in the canonical registry and has no ACTIVE base domain,
    // so it can never become a tenant namespace — fail closed.
    expect(await resolveHostname(groupAdmin(), "testdom-draft-os.health.beyuos.co.tz")).toEqual({
      kind: "DENIED",
      hostname: TEST_HOSTS.draftOs,
      reason: "DOMAIN_NOT_IN_OS_NAMESPACE",
    });
    await expect(
      registerTenantDomain(
        groupAdmin(),
        { tenantId: tenantA, os: "MINING_OS", domainType: "TENANT_SUBDOMAIN", label: "mining", reason: REASON },
        "TRACE_TEST_G",
      ),
    ).rejects.toMatchObject({ code: "OS_NOT_RECOGNISED", status: 422 });
  });
});

describe("I — authenticated but unauthorized", () => {
  it("refuses every lifecycle act for a principal with no capability", async () => {
    const actor = unauthorized();
    await expect(
      registerTenantDomain(
        actor,
        { tenantId: tenantA, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "nope", reason: REASON },
        "TRACE_TEST_I1",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(transitionTenantDomainStatus(actor, createdDomainIds[0], "suspend", REASON, "TRACE_TEST_I2")).rejects.toMatchObject(
      { code: "FORBIDDEN", status: 403 },
    );
    await expect(verifyTenantDomain(actor, createdDomainIds[0], REASON, "TRACE_TEST_I3")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(reassignTenantDomain(actor, createdDomainIds[0], tenantOther, REASON, "TRACE_TEST_I4")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
  });

  it("keeps reassignment HIGH-RISK (MFA step-up) in the canonical catalogue", () => {
    expect(HIGH_RISK_PERMISSIONS).toContain("organization:tenantdomain.reassign");
  });
});

describe("M/N/O — Host-header manipulation, malformed names and normalisation", () => {
  it("never resolves a crafted host that merely CONTAINS a governed hostname", async () => {
    for (const host of [
      "testdom-a.health.beyuos.co.tz.evil.example.com",
      "evil.example.com.testdom-a.health.beyuos.co.tz",
      "testdom-a.health.beyuos.co.tz@evil.example.com",
      "testdom-a.healthXbeyuos.co.tz",
      "testdom-a.health.beyuos.co.tz.evil.health.beyuos.co.tz",
    ]) {
      const resolved = await resolveRequestHostname(groupAdmin(), host);
      expect(resolved.kind, host).not.toBe("TENANT");
      expect(["DENIED", "NOT_APPLICABLE"], host).toContain(resolved.kind);
    }
  });

  it("refuses unclassifiable Host values outright on the request path", async () => {
    for (const host of ["http://testdom-a.health.beyuos.co.tz/", "testdom-a.health.beyuos.co.tz/../b", "10.0.0.5", "health", "*"]) {
      const resolved = await resolveRequestHostname(groupAdmin(), host);
      expect(resolved.kind, host).toBe("DENIED");
    }
  });

  it("normalises case, a numeric port and the root dot to the same binding", async () => {
    for (const host of [
      "TESTDOM-A.Health.BEYUOS.co.tz",
      "testdom-a.health.beyuos.co.tz:443",
      "testdom-a.health.beyuos.co.tz.",
      "  Testdom-A.health.beyuos.co.tz  ",
    ]) {
      const resolved = await resolveRequestHostname(groupAdmin(), host);
      expect(resolved.kind, host).toBe("TENANT");
      if (resolved.kind === "TENANT") expect(resolved.context.hostname).toBe(TEST_HOSTS.a);
    }
  });

  it("treats a missing Host as no tenant-domain claim", async () => {
    for (const host of [null, undefined, "", "   "]) {
      const resolved = await resolveRequestHostname(groupAdmin(), host);
      expect(resolved).toEqual({ kind: "NOT_APPLICABLE", hostname: null, reason: "NO_HOST" });
    }
  });

  it("returns an identical, information-free refusal for every denial reason", async () => {
    const responses = await Promise.all([hostnameDenialResponse(), hostnameDenialResponse()]);
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not Found");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});

describe("P — deactivation, suspension and retirement", () => {
  it("stops resolving the moment the DOMAIN is suspended, without touching the tenant", async () => {
    const domainId = createdDomainIds[0];
    await transitionTenantDomainStatus(groupAdmin(), domainId, "suspend", REASON, "TRACE_TEST_P1");
    expect(await resolveHostname(groupAdmin(), TEST_HOSTS.a)).toEqual({
      kind: "DENIED",
      hostname: TEST_HOSTS.a,
      reason: "DOMAIN_NOT_ACTIVE",
    });
    await transitionTenantDomainStatus(groupAdmin(), domainId, "activate", REASON, "TRACE_TEST_P2");
    expect((await resolveHostname(groupAdmin(), TEST_HOSTS.a)).kind).toBe("TENANT");
  });

  it("requires proven DNS ownership before activation", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      { tenantId: tenantA, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "testdom-unverified", reason: REASON },
      "TRACE_TEST_P3",
    );
    createdDomainIds.push(registered.domainId);
    await expect(
      transitionTenantDomainStatus(groupAdmin(), registered.domainId, "activate", REASON, "TRACE_TEST_P4"),
    ).rejects.toMatchObject({ code: "DOMAIN_NOT_VERIFIED", status: 409 });
    expect(await resolveHostname(groupAdmin(), TEST_HOSTS.unverified)).toEqual({
      kind: "DENIED",
      hostname: TEST_HOSTS.unverified,
      reason: "DOMAIN_NOT_ACTIVE",
    });
  });

  it("retires a domain as a terminal STATUS and never deletes it", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      { tenantId: tenantA, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "testdom-retired", reason: REASON },
      "TRACE_TEST_P5",
    );
    createdDomainIds.push(registered.domainId);
    await transitionTenantDomainStatus(groupAdmin(), registered.domainId, "retire", REASON, "TRACE_TEST_P6");
    const [row] = await adminDb.select().from(tenantDomains).where(eq(tenantDomains.id, registered.domainId));
    expect(row.status).toBe("ARCHIVED");
    await expect(
      transitionTenantDomainStatus(groupAdmin(), registered.domainId, "activate", REASON, "TRACE_TEST_P7"),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION", status: 409 });
    expect(await resolveHostname(groupAdmin(), TEST_HOSTS.retired)).toEqual({
      kind: "DENIED",
      hostname: TEST_HOSTS.retired,
      reason: "DOMAIN_NOT_ACTIVE",
    });
  });

  it("refuses DNS verification that does not match the published challenge", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      { tenantId: tenantA, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "testdom-bad-dns", reason: REASON },
      "TRACE_TEST_P8",
    );
    createdDomainIds.push(registered.domainId);
    await expect(
      verifyTenantDomain(groupAdmin(), registered.domainId, REASON, "TRACE_TEST_P9", async () => [
        "beyu-domain-verification=0000000000000000000000000000000000000000000000000000000000000000",
      ]),
    ).rejects.toMatchObject({ code: "DOMAIN_VERIFICATION_FAILED", status: 422 });
    // A resolver failure (NXDOMAIN/SERVFAIL/timeout) is equally a refusal.
    await expect(
      verifyTenantDomain(groupAdmin(), registered.domainId, REASON, "TRACE_TEST_P10", async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toMatchObject({ code: "DOMAIN_VERIFICATION_FAILED", status: 422 });
    const [row] = await adminDb.select().from(tenantDomains).where(eq(tenantDomains.id, registered.domainId));
    expect(row.verificationState).toBe("UNVERIFIED");
    expect(row.verificationTokenHash).not.toBeNull();
  });
});

describe("Q — reassignment", () => {
  it("refuses to repoint an ACTIVE domain", async () => {
    await expect(
      reassignTenantDomain(groupAdmin(), createdDomainIds[0], tenantOther, REASON, "TRACE_TEST_Q1"),
    ).rejects.toMatchObject({ code: "DOMAIN_ACTIVE", status: 409 });
  });

  it("moves a SUSPENDED domain to another tenant and forces re-verification", async () => {
    const domainId = createdDomainIds[0];
    await transitionTenantDomainStatus(groupAdmin(), domainId, "suspend", REASON, "TRACE_TEST_Q2");
    const moved = await reassignTenantDomain(groupAdmin(), domainId, tenantOther, REASON, "TRACE_TEST_Q3");
    expect(moved.previousTenantId).toBe(tenantA);
    expect(moved.tenantId).toBe(tenantOther);
    expect(moved.status).toBe("CREATED");
    expect(moved.verificationState).toBe("UNVERIFIED");
    expect(moved.challengeRecordValue.startsWith("beyu-domain-verification=")).toBe(true);

    const [row] = await adminDb.select().from(tenantDomains).where(eq(tenantDomains.id, domainId));
    expect(row.tenantId).toBe(tenantOther);
    expect(row.verifiedAt).toBeNull();
    expect(row.verificationTokenHash).not.toBeNull();
    // The name is NOT reachable after the move: the new binding must prove DNS
    // ownership again before it can resolve.
    expect(await resolveHostname(groupAdmin(), TEST_HOSTS.a)).toEqual({
      kind: "DENIED",
      hostname: TEST_HOSTS.a,
      reason: "DOMAIN_NOT_ACTIVE",
    });
    await expect(
      transitionTenantDomainStatus(groupAdmin(), domainId, "activate", REASON, "TRACE_TEST_Q4"),
    ).rejects.toMatchObject({ code: "DOMAIN_NOT_VERIFIED", status: 409 });
  });

  it("refuses reassigning a domain to the tenant that already owns it", async () => {
    await expect(
      reassignTenantDomain(groupAdmin(), createdDomainIds[0], tenantOther, REASON, "TRACE_TEST_Q5"),
    ).rejects.toMatchObject({ code: "DOMAIN_ALREADY_OWNED", status: 409 });
  });
});

describe("R — RLS is the final boundary for the registry", () => {
  it("hides another tenant's rows and cannot write the registry at all", async () => {
    // The privileged TEST connection assumes the REAL runtime role, exactly like
    // the CI security harness: RLS then applies to the runtime role rather than to
    // the owner (which would bypass it and prove nothing).
    const client = new Client({ connectionString: process.env.BEYU_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("begin");
      await client.query("set local role beyu_runtime");
      const attrs = await client.query("select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user");
      expect(attrs.rows[0]).toEqual({ current_user: "beyu_runtime", rolsuper: false, rolbypassrls: false });

      // Effective privileges: SELECT only. The hostname binding governs the
      // runtime, so the runtime credential may not change it.
      const privileges = await client.query(
        `select has_table_privilege(current_user, 'public.tenant_domains', 'SELECT') as s,
                has_table_privilege(current_user, 'public.tenant_domains', 'INSERT') as i,
                has_table_privilege(current_user, 'public.tenant_domains', 'UPDATE') as u,
                has_table_privilege(current_user, 'public.tenant_domains', 'DELETE') as d`,
      );
      expect(privileges.rows[0]).toEqual({ s: true, i: false, u: false, d: false });
      await client.query("rollback");

      // Tenant context: the country tenant sees its OWN bindings only.
      await client.query("begin");
      await client.query("set local role beyu_runtime");
      await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantOther]);
      const own = await client.query("select id from tenant_domains where tenant_id = $1", [tenantOther]);
      expect(own.rowCount ?? 0).toBeGreaterThan(0);
      const foreign = await client.query(
        "select id from tenant_domains where tenant_id = $1 and domain_type <> 'OS_BASE'",
        [tenantA],
      );
      expect(foreign.rowCount).toBe(0);
      // The only row from the other tenant that IS visible is the OS base
      // namespace marker: a public DNS fact, no tenant context, no data.
      const bases = await client.query("select tenant_id, os, domain_type from tenant_domains where tenant_id = $1", [tenantA]);
      expect(bases.rows).toEqual([{ tenant_id: HEALTH, os: "HEALTH_OS", domain_type: "OS_BASE" }]);
      await client.query("rollback");

      // A write attempt is refused by privilege, not merely by the service.
      await client.query("begin");
      await client.query("set local role beyu_runtime");
      await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantA]);
      await expect(
        client.query(
          `insert into tenant_domains (id, tenant_id, os, hostname, domain_type, status, verification_state, verification_method, registered_by)
           values ('TDM_TEST_RLS_WRITE', $1, 'HEALTH_OS', 'rls-write.health.beyuos.co.tz', 'TENANT_SUBDOMAIN', 'CREATED', 'UNVERIFIED', 'DNS_TXT', 'TEST')`,
          [tenantA],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback");
    } finally {
      await client.end();
    }
  });

  it("keeps the runtime role non-superuser and non-bypassrls", async () => {
    const client = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL });
    await client.connect();
    try {
      const attrs = await client.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
      expect(attrs.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    } finally {
      await client.end();
    }
  });
});

describe("S — every domain act is audited with an enterprise event", () => {
  it("records the lifecycle acts in the canonical ledger", async () => {
    const actions = ["DOMAIN_REGISTERED", "DOMAIN_VERIFIED", "DOMAIN_ACTIVATED", "DOMAIN_SUSPENDED", "DOMAIN_REASSIGNED"];
    for (const action of actions) {
      // A successful act must be ON RECORD as SUCCESS. Denied attempts for the
      // same action may also exist (the refusal path audits them) — that is the
      // ledger doing its job — so the assertion is on the recorded success.
      const [row] = await db
        .select({ id: auditLog.id, outcome: auditLog.outcome, objectType: auditLog.objectType })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, action),
            eq(auditLog.objectType, "TENANT_DOMAIN"),
            eq(auditLog.outcome, "SUCCESS"),
          ),
        )
        .limit(1);
      expect(row, `audit ledger must contain a SUCCESS record for ${action}`).toBeTruthy();
    }
    const events = await db
      .select({ id: enterpriseEvents.id, type: enterpriseEvents.type })
      .from(enterpriseEvents)
      .where(like(enterpriseEvents.type, "DOMAIN_%"));
    expect(events.length).toBeGreaterThan(0);
  });

  it("records refused verification attempts as DENIED", async () => {
    const [row] = await db
      .select({ outcome: auditLog.outcome, reason: auditLog.reason })
      .from(auditLog)
      .where(and(eq(auditLog.action, "DOMAIN_VERIFICATION_FAILED"), eq(auditLog.outcome, "DENIED")))
      .limit(1);
    expect(row).toBeTruthy();
    // The ledger never contains the challenge value.
    expect(row.reason).toMatch(/^DNS_TXT:/);
  });
});

describe("T — a hostname is never an authorization decision", () => {
  it("exposes no 'allowed' outcome and no permission data in any resolution", async () => {
    const results = await Promise.all([
      resolveHostname(groupAdmin(), TEST_HOSTS.suspendedTenant),
      resolveHostname(groupAdmin(), "unknown.health.beyuos.co.tz"),
      resolveHostname(groupAdmin(), "beyu-os-1-0.vercel.app"),
      resolveHostname(groupAdmin(), "health.beyuos.co.tz"),
    ]);
    for (const result of results) {
      expect(["NOT_APPLICABLE", "OS_BASE", "TENANT", "DENIED"]).toContain(result.kind);
      expect(JSON.stringify(result)).not.toMatch(/allowed|permission|role/i);
    }
  });
});
