/**
 * FAMILY OFFICE — capability domain classification on the governed tenant-domain
 * registry (Phase 1.1).
 *
 * THE ARCHITECTURAL FACT THIS SUITE PROTECTS
 *   BEYU OS has ONE control plane, FIVE Sector OSs (Finance, Health, Agriculture,
 *   Foundation, Ujenzi) and a set of SHARED CAPABILITIES implemented once inside
 *   BEYU OS — Family Office, HCM, Governance, Risk/Compliance, Audit/Events,
 *   Workflow, Security and Noelia/HIVE.
 *
 *   `familyoffice.beyuos.co.tz` is the Family Office SHARED CAPABILITY base: a
 *   governed NAMESPACE, never an operating system and never a tenant. Family
 *   Office must not become a sixth Sector OS, and it must not gain a route of its
 *   own (`/os/family` stays a control-plane capability page).
 *
 * Coverage here: base-domain resolution and classification, the "not an OS"
 * invariants at source and database level, fail-closed behaviour for unknown /
 * unverified / inactive names under the capability namespace, cross-capability and
 * cross-OS refusal, Host-header manipulation, audit coverage, and the capability's
 * existing authorization surface being untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, like } from "drizzle-orm";
import { adminDb } from "../../src/db/admin";
import { db } from "../../src/db";
import { auditLog, osRegistry, tenantDomains } from "../../src/db/schema";
import { SECTOR_OPERATING_SYSTEMS } from "../../src/lib/operating-system-catalog";
import { PERMISSIONS, HIGH_RISK_PERMISSIONS } from "../../src/lib/constants";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import type { Principal } from "../../src/lib/authz";
import {
  REGISTRY_KIND_FOR_BASE_DOMAIN,
  baseTypeForRegistryKind,
  resolutionBelongsToNamespace,
  resolutionIsPlatformNeutral,
  resolveHostname,
  resolveRequestHostname,
  transitionTenantDomainStatus,
  verifyTenantDomain,
  hostnameDenialResponse,
  registerTenantDomain,
} from "../../src/lib/tenant-domain";
import { activateTestDomain, SEEDED, TEST_HOSTS } from "./fixtures";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const FAMILY_OFFICE_BASE = "familyoffice.beyuos.co.tz";
const GROUP = SEEDED.group;
/** Hostname of this suite's own tenant binding under the capability namespace. */
let scopedCapabilityHost: string | null = null;

function groupAdmin(): Principal {
  return {
    userId: "USR_TEST_CAPABILITY_ADMIN",
    partyId: "PTY_TEST_CAPABILITY_ADMIN",
    email: "capability.admin@beyu.test",
    displayName: "Capability Administrator",
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
    sessionId: "SES_TEST_CAPABILITY_ADMIN",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

// ------------------------------------------------------------------ //
// 1–4. The capability base resolves, is classified as a capability, and  //
//      Family Office is NOT an OS (source-level + catalogue-level).      //
// ------------------------------------------------------------------ //

describe("Family Office base domain — resolution and classification", () => {
  it("resolves as CAPABILITY_BASE, bound to the canonical shared capability", async () => {
    const resolved = await resolveHostname(groupAdmin(), FAMILY_OFFICE_BASE);
    expect(resolved).toEqual({
      kind: "CAPABILITY_BASE",
      hostname: FAMILY_OFFICE_BASE,
      capability: "SHARED_FAMILY_OFFICE",
    });
  });

  it("carries NO tenant context and NO authority (a namespace is not a grant)", async () => {
    const resolved = await resolveHostname(groupAdmin(), FAMILY_OFFICE_BASE);
    expect(resolved.kind).toBe("CAPABILITY_BASE");
    expect(JSON.stringify(resolved)).not.toMatch(/tenantId|allowed|permission|role/i);
    // The two canonical predicates agree: it is inside its OWN namespace and in
    // no other, and it is not a platform-neutral host.
    expect(resolutionBelongsToNamespace(resolved, "SHARED_FAMILY_OFFICE")).toBe(true);
    expect(resolutionBelongsToNamespace(resolved, "HEALTH_OS")).toBe(false);
    expect(resolutionBelongsToNamespace(resolved, "FINANCE_OS")).toBe(false);
    expect(resolutionIsPlatformNeutral(resolved)).toBe(false);
  });

  it("normalises the host the same way as every other governed domain", async () => {
    for (const host of [
      "FamilyOffice.BEYUOS.co.tz",
      "familyoffice.beyuos.co.tz:443",
      "familyoffice.beyuos.co.tz.",
      "  familyoffice.beyuos.co.tz ",
    ]) {
      const resolved = await resolveRequestHostname(groupAdmin(), host);
      expect(resolved.kind, host).toBe("CAPABILITY_BASE");
    }
  });

  it("is registered in the canonical OS/capability registry as a SHARED_CAPABILITY", async () => {
    const [row] = await db
      .select({ code: osRegistry.code, kind: osRegistry.kind, lifecycle: osRegistry.lifecycle, purpose: osRegistry.purpose })
      .from(osRegistry)
      .where(eq(osRegistry.code, "SHARED_FAMILY_OFFICE"))
      .limit(1);
    expect(row).toBeTruthy();
    expect(row.kind).toBe("SHARED_CAPABILITY");
    expect(row.lifecycle).toBe("ACTIVE");
    // The canonical entry itself states the invariant, in the constitutional seed.
    expect(row.purpose).toContain("never a separate OS");
  });

  it("keeps the Sector OS set at exactly five ACTIVE entries, without Family Office", async () => {
    const sectors = await db
      .select({ code: osRegistry.code })
      .from(osRegistry)
      .where(and(eq(osRegistry.kind, "SECTOR_OS"), eq(osRegistry.lifecycle, "ACTIVE")));
    expect(sectors.map((s) => s.code).sort()).toEqual(
      ["AGRICULTURE_OS", "FINANCE_OS", "FOUNDATION_OS", "HEALTH_OS", "UJENZI_OS"],
    );
    expect(sectors.map((s) => s.code)).not.toContain("FAMILY_OFFICE_OS");
  });

  it("has no FAMILY_OFFICE_OS (or FAMILY*OS) registry row in the database", async () => {
    const rows = await db
      .select({ code: osRegistry.code })
      .from(osRegistry)
      .where(like(osRegistry.code, "%FAMILY%"));
    // Every Family Office identity in the canonical registry is the SHARED
    // CAPABILITY — there is no FAMILY_OFFICE_OS (and no FAMILY*_OS at all).
    expect(rows.map((r) => r.code)).toEqual(["SHARED_FAMILY_OFFICE"]);
    expect(rows.map((r) => r.code).some((code) => /FAMILY.*_OS$/.test(code))).toBe(false);
  });

  it("is absent from the canonical Sector OS catalogue and the launcher", () => {
    const codes = SECTOR_OPERATING_SYSTEMS.map((os) => os.code);
    expect(codes).toEqual(["FINANCE", "HEALTH", "AGRICULTURE", "FOUNDATION", "UJENZI"]);
    expect(codes).not.toContain("FAMILY_OFFICE");
    expect(JSON.stringify(SECTOR_OPERATING_SYSTEMS)).not.toMatch(/family-?office/i);
    // No route was added for the capability: the surface stays /os/family, which
    // the control plane owns.
    expect(existsSync(join(ROOT, "src/app/os/family-office"))).toBe(false);
    const osRoutes = readdirSync(join(ROOT, "src/app/os"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(osRoutes).not.toContain("family-office");
  });

  it("is never spelled as an OS anywhere in the source tree", () => {
    const files = [
      "src/db/seed.ts",
      "src/lib/operating-system-catalog.ts",
      "src/lib/tenant-domain/resolver.ts",
      "src/lib/tenant-domain/lifecycle-service.ts",
      "src/db/schema/tenant-domains.ts",
    ];
    for (const file of files) {
      const text = read(file);
      expect(text, `${file} must not contain FAMILY_OFFICE_OS`).not.toContain("FAMILY_OFFICE_OS");
      expect(text, `${file} must not contain /os/family-office`).not.toContain("/os/family-office");
    }
  });

  it("maps base-domain types to registry kinds in both directions", () => {
    expect(REGISTRY_KIND_FOR_BASE_DOMAIN).toEqual({
      OS_BASE: "SECTOR_OS",
      CAPABILITY_BASE: "SHARED_CAPABILITY",
    });
    expect(baseTypeForRegistryKind("SECTOR_OS")).toBe("OS_BASE");
    expect(baseTypeForRegistryKind("SHARED_CAPABILITY")).toBe("CAPABILITY_BASE");
    expect(baseTypeForRegistryKind("AI_RUNTIME")).toBeNull();
    expect(baseTypeForRegistryKind("CONTROL_PLANE")).toBeNull();
  });
});

// ------------------------------------------------------------------ //
// 5–7. Fail-closed under the capability namespace                        //
// ------------------------------------------------------------------ //

describe("capability namespace — unknown, unverified and inactive names fail closed", () => {
  it("refuses an unknown name inside the capability namespace (never a default)", async () => {
    expect(await resolveHostname(groupAdmin(), "not-registered.familyoffice.beyuos.co.tz")).toEqual({
      kind: "DENIED",
      hostname: "not-registered.familyoffice.beyuos.co.tz",
      reason: "UNKNOWN_TENANT_HOST",
    });
  });

  it("refuses a REGISTERED but UNVERIFIED capability tenant host", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      {
        tenantId: GROUP,
        os: "SHARED_FAMILY_OFFICE",
        domainType: "TENANT_SUBDOMAIN",
        label: "testdom-fo-unverified",
        reason: "Phase 1.1 fixture: unverified capability tenant domain.",
      },
      "TRACE_FO_1",
    );
    expect(registered.status).toBe("CREATED");
    expect(registered.verificationState).toBe("UNVERIFIED");
    expect(await resolveHostname(groupAdmin(), registered.hostname)).toEqual({
      kind: "DENIED",
      hostname: registered.hostname,
      reason: "DOMAIN_NOT_ACTIVE",
    });
    // Still refused after verification while the lifecycle has not activated it.
    await verifyTenantDomain(groupAdmin(), registered.domainId, "Phase 1.1 fixture verification.", "TRACE_FO_2", async () => [
      registered.challengeRecordValue,
    ]);
    expect(await resolveHostname(groupAdmin(), registered.hostname)).toEqual({
      kind: "DENIED",
      hostname: registered.hostname,
      reason: "DOMAIN_NOT_ACTIVE",
    });
  });

  it("refuses an INACTIVE (suspended) capability tenant domain and the base once deactivated", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      {
        tenantId: GROUP,
        os: "SHARED_FAMILY_OFFICE",
        domainType: "TENANT_SUBDOMAIN",
        label: "testdom-fo-suspend",
        reason: "Phase 1.1 fixture: capability tenant domain lifecycle.",
      },
      "TRACE_FO_3",
    );
    await verifyTenantDomain(groupAdmin(), registered.domainId, "Phase 1.1 fixture verification.", "TRACE_FO_4", async () => [
      registered.challengeRecordValue,
    ]);
    await activateTestDomain(groupAdmin(), registered.domainId, "TRACE_FO_5");
    expect((await resolveHostname(groupAdmin(), registered.hostname)).kind).toBe("TENANT");

    await transitionTenantDomainStatus(
      groupAdmin(),
      registered.domainId,
      "suspend",
      "Phase 1.1 fixture: suspend the capability tenant domain.",
      "TRACE_FO_6",
    );
    expect(await resolveHostname(groupAdmin(), registered.hostname)).toEqual({
      kind: "DENIED",
      hostname: registered.hostname,
      reason: "DOMAIN_NOT_ACTIVE",
    });

    // The capability BASE itself, if its lifecycle were ever suspended, stops
    // resolving its namespace too (fail closed on inactive domains).
    await adminDb.update(tenantDomains).set({ status: "SUSPENDED" }).where(eq(tenantDomains.id, "TDM_FAMILY_OFFICE_CAPABILITY_BASE"));
    try {
      expect(await resolveHostname(groupAdmin(), FAMILY_OFFICE_BASE)).toEqual({
        kind: "DENIED",
        hostname: FAMILY_OFFICE_BASE,
        reason: "DOMAIN_NOT_ACTIVE",
      });
    } finally {
      await adminDb
        .update(tenantDomains)
        .set({ status: "ACTIVE" })
        .where(eq(tenantDomains.id, "TDM_FAMILY_OFFICE_CAPABILITY_BASE"));
    }
    expect((await resolveHostname(groupAdmin(), FAMILY_OFFICE_BASE)).kind).toBe("CAPABILITY_BASE");
  });

  it("refuses a capability base bound to a NON-capability registry code", async () => {
    // Defence in depth: even if a row were written directly, a CAPABILITY_BASE
    // pointing at an OS code must not resolve — and neither may an OS_BASE point
    // at a capability code.
    await adminDb.insert(tenantDomains).values({
      id: "TDM_TEST_FO_KIND_MISMATCH",
      tenantId: GROUP,
      os: "HEALTH_OS",
      hostname: "testdom-fo-kind-mismatch.familyoffice.beyuos.co.tz",
      domainType: "CAPABILITY_BASE",
      status: "ACTIVE",
      verificationState: "VERIFIED",
      verificationMethod: "DNS_TXT",
      verifiedBy: "TEST",
      verifiedAt: new Date(),
      registeredBy: "TEST",
      classification: "CONFIDENTIAL",
    });
    await adminDb.insert(tenantDomains).values({
      id: "TDM_TEST_OS_KIND_MISMATCH",
      tenantId: GROUP,
      os: "SHARED_FAMILY_OFFICE",
      hostname: "testdom-os-kind-mismatch.health.beyuos.co.tz",
      domainType: "OS_BASE",
      status: "ACTIVE",
      verificationState: "VERIFIED",
      verificationMethod: "DNS_TXT",
      verifiedBy: "TEST",
      verifiedAt: new Date(),
      registeredBy: "TEST",
      classification: "CONFIDENTIAL",
    });
    expect(await resolveHostname(groupAdmin(), "testdom-fo-kind-mismatch.familyoffice.beyuos.co.tz")).toEqual({
      kind: "DENIED",
      hostname: "testdom-fo-kind-mismatch.familyoffice.beyuos.co.tz",
      reason: "CAPABILITY_NOT_RECOGNISED",
    });
    expect(await resolveHostname(groupAdmin(), "testdom-os-kind-mismatch.health.beyuos.co.tz")).toEqual({
      kind: "DENIED",
      hostname: "testdom-os-kind-mismatch.health.beyuos.co.tz",
      reason: "OS_NOT_RECOGNISED",
    });
  });

  it("refuses to register a tenant host for a code the registry does not govern", async () => {
    await expect(
      registerTenantDomain(
        groupAdmin(),
        {
          tenantId: GROUP,
          os: "HIVE_RUNTIME",
          domainType: "TENANT_SUBDOMAIN",
          label: "hive",
          reason: "Phase 1.1 fixture: an AI runtime is not a namespace owner.",
        },
        "TRACE_FO_7",
      ),
    ).rejects.toMatchObject({ code: "OS_NOT_RECOGNISED", status: 422 });
  });
});

// ------------------------------------------------------------------ //
// 8–11. Authorization: capability scope, cross-tenant, cross-capability  //
// ------------------------------------------------------------------ //

describe("capability authorization boundaries", () => {
  it("keeps the existing family:* authorization surface untouched by hostnames", () => {
    // The capability's permissions are exactly what they were: the domain
    // classification changed NOTHING about authority.
    const familyPerms = Object.keys(PERMISSIONS).filter((code) => code.startsWith("family:"));
    expect(familyPerms.length).toBeGreaterThan(0);
    expect(familyPerms).toContain("family:member.read");
    // No new OS-flavoured permission was invented for Family Office.
    expect(Object.keys(PERMISSIONS)).not.toContain("familyoffice:os.read");
    expect(Object.keys(PERMISSIONS).some((code) => code.includes("family-office"))).toBe(false);
    // The capability's high-risk grants are unchanged and still step-up gated.
    expect(HIGH_RISK_PERMISSIONS).toContain("family:beneficiary.manage");
  });

  it("does not let the capability base widen a one-tenant principal's scope", async () => {
    const countryScoped: Principal = {
      ...groupAdmin(),
      tenantId: SEEDED.tz,
      tenantCode: "BEYU-TZ",
      tenantType: "COUNTRY",
      roles: ["COUNTRY_DIRECTOR"],
    };
    // The base still resolves (it is a platform namespace, not tenant data) but it
    // yields NO tenant context, so it cannot move the principal's scope anywhere.
    const resolved = await resolveHostname(countryScoped, FAMILY_OFFICE_BASE);
    expect(resolved.kind).toBe("CAPABILITY_BASE");
    expect(JSON.stringify(resolved)).not.toMatch(/tenantId/);
  });

  it("hides capability tenant bindings from a principal outside their tenant scope", async () => {
    const registered = await registerTenantDomain(
      groupAdmin(),
      {
        tenantId: GROUP,
        os: "SHARED_FAMILY_OFFICE",
        domainType: "TENANT_SUBDOMAIN",
        label: "testdom-fo-scoped",
        reason: "Phase 1.1 fixture: capability tenant scope boundary.",
      },
      "TRACE_FO_8",
    );
    scopedCapabilityHost = registered.hostname;
    await verifyTenantDomain(groupAdmin(), registered.domainId, "Phase 1.1 fixture verification.", "TRACE_FO_9", async () => [
      registered.challengeRecordValue,
    ]);
    await activateTestDomain(groupAdmin(), registered.domainId, "TRACE_FO_10");

    const countryScoped: Principal = {
      ...groupAdmin(),
      tenantId: SEEDED.tz,
      tenantCode: "BEYU-TZ",
      tenantType: "COUNTRY",
      roles: ["COUNTRY_DIRECTOR"],
      permissions: new Set(),
    };
    const resolved = await withTenantDatabaseContext(countryScoped, () =>
      resolveHostname(countryScoped, registered.hostname),
    );
    expect(resolved.kind).toBe("DENIED");
    if (resolved.kind !== "DENIED") throw new Error("unreachable");
    expect(["UNKNOWN_TENANT_HOST", "TENANT_OUT_OF_SCOPE"]).toContain(resolved.reason);
  });

  it("never lets a capability host stand in for an OS/capability it does not own", async () => {
    const base = await resolveHostname(groupAdmin(), FAMILY_OFFICE_BASE);
    const healthBase = await resolveHostname(groupAdmin(), "health.beyuos.co.tz");
    const tenantHost = await resolveHostname(groupAdmin(), TEST_HOSTS.a).catch(() => null);
    for (const other of ["HEALTH_OS", "FINANCE_OS", "AGRICULTURE_OS", "FOUNDATION_OS", "UJENZI_OS"]) {
      expect(resolutionBelongsToNamespace(base, other), other).toBe(false);
      expect(resolutionBelongsToNamespace(healthBase, "SHARED_FAMILY_OFFICE")).toBe(false);
      if (tenantHost) expect(resolutionBelongsToNamespace(tenantHost, "SHARED_FAMILY_OFFICE")).toBe(false);
    }
    expect(resolutionBelongsToNamespace(healthBase, "HEALTH_OS")).toBe(true);
  });
});

// ------------------------------------------------------------------ //
// 12–13. Host-header and URL manipulation                                //
// ------------------------------------------------------------------ //

describe("Host-header and URL manipulation", () => {
  it("refuses hosts that merely CONTAIN or extend the capability base", async () => {
    for (const host of [
      "familyoffice.beyuos.co.tz.evil.example.com",
      "evil.example.com.familyoffice.beyuos.co.tz",
      "familyoffice.beyuos.co.tz@evil.example.com",
      "familyofficeXbeyuos.co.tz",
      "http://familyoffice.beyuos.co.tz/",
      "familyoffice",
      "10.0.0.5",
    ]) {
      const resolved = await resolveRequestHostname(groupAdmin(), host);
      expect(resolved.kind, host).not.toBe("CAPABILITY_BASE");
      expect(["DENIED", "NOT_APPLICABLE"], host).toContain(resolved.kind);
    }
  });

  it("returns the same information-free refusal for capability denials", async () => {
    const response = hostnameDenialResponse();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps a capability host from changing what a path means", async () => {
    // Path is not authorization and a capability host is not a grant: the resolved
    // namespace is identical for every path (the resolver never sees the path at
    // all — asserted structurally here, behaviourally in the HTTP suite).
    const resolverSource = read("src/lib/tenant-domain/resolver.ts");
    expect(resolverSource).not.toMatch(/pathname|searchParams|request\.url/i);
  });
});

// ------------------------------------------------------------------ //
// 14–15. RLS and audit                                                   //
// ------------------------------------------------------------------ //

describe("RLS and audit for the capability base", () => {
  it("keeps the runtime read-only on the registry and the capability base visible as a namespace fact", async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.BEYU_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("begin");
      await client.query("set local role beyu_runtime");
      const privileges = await client.query(
        `select has_table_privilege(current_user, 'public.tenant_domains', 'SELECT') as s,
                has_table_privilege(current_user, 'public.tenant_domains', 'INSERT') as i,
                has_table_privilege(current_user, 'public.tenant_domains', 'UPDATE') as u,
                has_table_privilege(current_user, 'public.tenant_domains', 'DELETE') as d`,
      );
      expect(privileges.rows[0]).toEqual({ s: true, i: false, u: false, d: false });

      // The capability base is visible to ANY session (a public DNS fact, no
      // tenant data) while tenant bindings are not.
      await client.query("select set_config('beyu.current_tenant_ids', $1, true)", [SEEDED.tz]);
      // Base-type rows are a public DNS fact: they are visible to every session
      // regardless of tenant. (The suite's own injected base-type fixtures are
      // excluded here so the seeded platform set is asserted; they are
      // `testdom-*` names and are visible for the same by-design reason.)
      const bases = await client.query(
        `select hostname, domain_type from tenant_domains
          where domain_type in ('OS_BASE','CAPABILITY_BASE')
            and hostname not like 'testdom-%'
          order by hostname`,
      );
      expect(bases.rows).toEqual([
        { hostname: "familyoffice.beyuos.co.tz", domain_type: "CAPABILITY_BASE" },
        { hostname: "health.beyuos.co.tz", domain_type: "OS_BASE" },
      ]);
      // A TENANT BINDING is tenant data: a session scoped to another tenant does
      // not see it at all. This is the RLS half of the cross-tenant refusal — the
      // resolver's scope gate is the other half.
      const tenantBindings = await client.query(
        `select hostname from tenant_domains
          where domain_type not in ('OS_BASE','CAPABILITY_BASE')
            and hostname not like 'testdom-%'`,
      );
      expect(tenantBindings.rowCount).toBe(0);
      expect(scopedCapabilityHost, "capability tenant fixture must have been registered").not.toBeNull();
      const fixtureBinding = await client.query(
        "select id from tenant_domains where hostname = $1 and tenant_id = $2",
        [scopedCapabilityHost, GROUP],
      );
      expect(fixtureBinding.rowCount).toBe(0);
      await client.query("rollback");
    } finally {
      await client.end();
    }
  });

  it("records the capability base lifecycle in the canonical ledger at bootstrap", async () => {
    // The base is created by migration/seed (constitutional), so the ledger entry
    // that matters is the seed's attribution; assert the row's provenance and the
    // existence of audit coverage for capability-scoped domain acts created in
    // this suite.
    const [row] = await db
      .select({ registeredBy: tenantDomains.registeredBy, evidence: tenantDomains.verificationEvidence })
      .from(tenantDomains)
      .where(eq(tenantDomains.id, "TDM_FAMILY_OFFICE_CAPABILITY_BASE"));
    expect(row.registeredBy).toBe("SEED/CONSTITUTIONAL_BOOTSTRAP");
    expect(row.evidence).toContain("human-controlled");

    const acts = await db
      .select({ action: auditLog.action, outcome: auditLog.outcome })
      .from(auditLog)
      .where(and(eq(auditLog.objectType, "TENANT_DOMAIN"), eq(auditLog.outcome, "SUCCESS")));
    const actions = new Set(acts.map((a) => a.action));
    expect(actions).toContain("DOMAIN_REGISTERED");
    expect(actions).toContain("DOMAIN_VERIFIED");
    expect(actions).toContain("DOMAIN_ACTIVATED");
  });
});

// ------------------------------------------------------------------ //
// 16–20. Nothing else moved                                              //
// ------------------------------------------------------------------ //

describe("existing behaviour is unchanged", () => {
  it("keeps the Health OS base an OS base and its namespace intact", async () => {
    const resolved = await resolveHostname(groupAdmin(), "health.beyuos.co.tz");
    expect(resolved).toEqual({ kind: "OS_BASE", hostname: "health.beyuos.co.tz", os: "HEALTH_OS" });
    expect(await resolveHostname(groupAdmin(), "unknown.health.beyuos.co.tz")).toEqual({
      kind: "DENIED",
      hostname: "unknown.health.beyuos.co.tz",
      reason: "UNKNOWN_TENANT_HOST",
    });
  });

  it("keeps comparison hosts outside every governed namespace NOT_APPLICABLE", async () => {
    for (const host of ["beyu-os-1-0.vercel.app", "some-other-domain.example.com", "localhost"]) {
      const resolved = await resolveHostname(groupAdmin(), host);
      expect(resolved.kind, host).toBe("NOT_APPLICABLE");
    }
  });

  it("keeps Finance, Agriculture, Foundation and Ujenzi as SECTOR_OS entries", async () => {
    const rows = await db
      .select({ code: osRegistry.code, kind: osRegistry.kind, lifecycle: osRegistry.lifecycle })
      .from(osRegistry)
      .where(eq(osRegistry.kind, "SECTOR_OS"));
    const active = rows.filter((r) => r.lifecycle === "ACTIVE").map((r) => r.code).sort();
    expect(active).toEqual(["AGRICULTURE_OS", "FINANCE_OS", "FOUNDATION_OS", "HEALTH_OS", "UJENZI_OS"]);
    expect(active).toHaveLength(5);
    // The remaining SECTOR_OS row (MINING_OS, a pre-existing DRAFT) stays the
    // only non-ACTIVE one: Family Office never appears in the Sector OS set, in
    // any lifecycle state.
    expect(rows.map((r) => r.code).some((code) => /FAMILY/i.test(code))).toBe(false);
  });

  it("keeps the Family Office capability surface where it was (/os/family)", () => {
    expect(existsSync(join(ROOT, "src/app/os/family/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/os/family/capital/page.tsx"))).toBe(true);
    expect(existsSync(join(ROOT, "src/app/os/family/protection/page.tsx"))).toBe(true);
    const capabilities = read("src/app/os/capabilities.ts");
    expect(capabilities).toContain('href: "/os/family"');
    expect(capabilities).toContain("SHARED CAPABILITIES");
  });
});

afterAll(async () => {
  await adminDb.delete(tenantDomains).where(like(tenantDomains.hostname, "testdom-fo-%"));
  await adminDb.delete(tenantDomains).where(like(tenantDomains.hostname, "testdom-%kind-mismatch%"));
});
