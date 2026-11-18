/**
 * CANONICAL NAMESPACE ALIGNMENT — migration 0082.
 *
 * The governed tenant-domain registry and the canonical host contract must name
 * the SAME namespace. They did not: the registry held the two PLATFORM NAMESPACE
 * BASES on `beyuos.co.tz` while `src/lib/canonical-hosts.ts` — and therefore the
 * router, the Health mount and every generated entry href — used `beyu.co.tz`.
 *
 * The consequence was a fail-closed contradiction, worth stating plainly because
 * it is the reason the migration exists:
 *
 *   `health.beyu.co.tz` resolved canonically to HEALTH_OS, but the Health mount's
 *   NAMESPACE SCOPE gate requires the request host to be either platform-neutral
 *   or PROVEN to belong to the HEALTH_OS namespace by a registry row. No registry
 *   row named the canonical host, so the gate REFUSED it. The only host the gate
 *   accepted was `health.beyuos.co.tz` — a host the product does not use.
 *
 * These tests are deliberately split so a regression is attributed correctly:
 *
 *   • SOURCE assertions (no database): the seed, the forward migration and the
 *     canonical host contract all agree on the canonical apex. If someone edits
 *     the seed alone and forgets the migration, this fails.
 *   • DATABASE assertions: the live registry rows are on the canonical apex and
 *     the RETIRED namespace no longer resolves as a namespace base. Skipped when
 *     no database is configured.
 *
 * WHAT THIS DOES NOT CLAIM
 *   A hostname is not authorization. Nothing here proves access, capability or
 *   permission; resolution still only ever RESTRICTS tenant context, and every
 *   gate downstream of it still runs unchanged.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { adminDb } from "../../src/db/admin";
import { tenantDomains } from "../../src/db/schema";
import { canonicalHostOptionsFromEnvironment, resolveCanonicalHost } from "../../src/lib/canonical-hosts";
import { resolveHostname } from "../../src/lib/tenant-domain/resolver";
import type { Principal } from "../../src/lib/authz";
import { SEEDED, removeTestFixtures } from "./fixtures";

const ROOT = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");

/** The canonical apex — ONE source of truth: the destination table itself. */
const CANONICAL_APEX = "beyu.co.tz";
/** The retired namespace. It must never come back as a governed base. */
const RETIRED_APEX = "beyuos.co.tz";

const HEALTH_BASE = `health.${CANONICAL_APEX}`;
const FAMILY_OFFICE_BASE = `familyoffice.${CANONICAL_APEX}`;
const HEALTH_RETIRED = `health.${RETIRED_APEX}`;
const FAMILY_OFFICE_RETIRED = `familyoffice.${RETIRED_APEX}`;

const enabled = Boolean(
  process.env.BEYU_TEST_DATABASE_URL || process.env.DATABASE_URL || process.env.BEYU_RUNTIME_DATABASE_URL,
);

/**
 * The seeded Group administrator. Reading the registry through the runtime role
 * with a real tenant principal is what keeps the RLS path part of the assertion
 * rather than a superuser shortcut.
 */
function groupAdmin(): Principal {
  return {
    userId: "USR_TEST_NAMESPACE_ALIGNMENT",
    partyId: "PTY_TEST_NAMESPACE_ALIGNMENT",
    email: "namespace.alignment@beyu.test",
    displayName: "Namespace Alignment Administrator",
    tenantId: SEEDED.group,
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
    roles: ["GROUP_CEO"],
    permissions: new Set(["organization:tenantdomain.read"]),
    authorityGrants: [],
    clearance: "HIGHLY_RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "SES_TEST_NAMESPACE_ALIGNMENT",
    riskScore: 0,
    emergencyPermissions: [],
  } as unknown as Principal;
}

describe("0082 — the registry namespace agrees with the canonical host contract", () => {
  // ── SOURCE: the artefacts that must agree, no database needed ──

  it("the canonical host contract resolves the bases on the canonical apex", () => {
    const options = canonicalHostOptionsFromEnvironment({
      NODE_ENV: "production",
      BEYU_CANONICAL_DOMAIN: CANONICAL_APEX,
    } as unknown as Record<string, string | undefined>);

    expect(resolveCanonicalHost(HEALTH_BASE, options)).toEqual({
      kind: "SECTOR_OS",
      hostname: HEALTH_BASE,
      // `code` is the canonical catalogue code (HEALTH); `registryCode` is the
      // os_registry code the tenant-domain registry uses (HEALTH_OS).
      os: expect.objectContaining({ code: "HEALTH", registryCode: "HEALTH_OS" }),
      base: CANONICAL_APEX,
    });
    expect(resolveCanonicalHost(FAMILY_OFFICE_BASE, options)).toEqual({
      kind: "SURFACE",
      hostname: FAMILY_OFFICE_BASE,
      surface: expect.objectContaining({
        code: "FAMILY_OFFICE",
        registryCode: "SHARED_FAMILY_OFFICE",
        kind: "SHARED_CAPABILITY",
      }),
      base: CANONICAL_APEX,
    });

    // The retired namespace is outside the configured canonical domain entirely,
    // so it resolves to no destination at all — it can never become an alias.
    expect(resolveCanonicalHost(HEALTH_RETIRED, options).kind).toBe("NEUTRAL");
    expect(resolveCanonicalHost(FAMILY_OFFICE_RETIRED, options).kind).toBe("NEUTRAL");
  });

  it("the constitutional seed creates the bases on the canonical apex", () => {
    const seed = read("src", "db", "seed.ts");
    // Ids are DERIVED (`fixedId(ID_PREFIX.tenantDomain, …)`), not literal, so the
    // assertion names the logical key the fixed id is built from.
    expect(seed).toContain('fixedId(ID_PREFIX.tenantDomain, "HEALTH_OS_BASE")');
    expect(seed).toContain('fixedId(ID_PREFIX.tenantDomain, "FAMILY_OFFICE_CAPABILITY_BASE")');
    // The values that actually land in the registry.
    expect(seed).toContain(`hostname: "${HEALTH_BASE}"`);
    expect(seed).toContain(`hostname: "${FAMILY_OFFICE_BASE}"`);
    // No live hostname literal may still name the retired namespace. A seed-only
    // edit that leaves the old value behind re-opens the contradiction on every
    // fresh install, so it fails here.
    expect(seed).not.toMatch(/hostname:\s*"[^"]*beyuos\.co\.tz"/);
  });

  it("migration 0082 moves both bases forward and never rewrites history", () => {
    const sql = read("drizzle", "0082_canonical_namespace_alignment.sql");
    expect(sql).toContain(`SET hostname = '${HEALTH_BASE}'`);
    expect(sql).toContain(`SET hostname = '${FAMILY_OFFICE_BASE}'`);
    expect(sql).toContain("'TDM_HEALTH_OS_BASE'");
    expect(sql).toContain("'TDM_FAMILY_OFFICE_CAPABILITY_BASE'");
    // Expand-only: no destructive statement on any table.
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);

    // The migrations that ORIGINALLY created these rows are immutable:
    // `scripts/migrate.ts` sha256-checks every applied file, so editing one breaks
    // every existing database with "Migration checksum drift". They must still
    // carry their original values — proof the correction went forward, not back.
    expect(read("drizzle", "0063_tenant_domain_registry.sql")).toContain(`'${HEALTH_RETIRED}'`);
    expect(read("drizzle", "0065_family_office_capability_domain.sql")).toContain(
      `'${FAMILY_OFFICE_RETIRED}'`,
    );
  });

  it("0082 is the journal head and is declared in the metadata debt register", () => {
    const journal = JSON.parse(read("drizzle", "meta", "_journal.json")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find((e) => e.tag === "0082_canonical_namespace_alignment");
    expect(entry).toBeDefined();
    expect(entry!.idx).toBe(82);
    // The journal is the apply ORDER; a duplicate or non-monotonic idx would make
    // migrate.ts apply or skip the wrong migration.
    expect(journal.entries.at(-1)?.tag).toBe("0082_canonical_namespace_alignment");

    // P2 policy: a data-only migration produces no table-level schema state, so no
    // snapshot is fabricated. The gap is declared, not hidden.
    expect(read("src", "lib", "migration", "integrity.ts")).toContain(`"0082"`);
  });

  it("keeps the alignment documented rather than implied", () => {
    // A future rename has to update the architecture document deliberately.
    const doc = read("docs", "architecture", "TENANT_DOMAIN_ARCHITECTURE.md");
    expect(doc).toContain(HEALTH_BASE);
  });

  // ── DATABASE: the live rows ──

  describe.skipIf(!enabled)("the live registry", () => {
    afterAll(async () => {
      await removeTestFixtures();
    });

    it("resolves the canonical Health base as OS_BASE, and the retired one as an unrelated host", async () => {
      const principal = groupAdmin();

      const canonical = await resolveHostname(principal, HEALTH_BASE);
      expect(canonical).toEqual({ kind: "OS_BASE", hostname: HEALTH_BASE, os: "HEALTH_OS" });

      // The retired base is now outside every governed namespace, so it is
      // NOT_APPLICABLE — never a second Health base, never a tenant, never an
      // alias. This proves the move happened in the DATA, not only in source.
      const retired = await resolveHostname(principal, HEALTH_RETIRED);
      expect(retired).toEqual({ kind: "NOT_APPLICABLE", hostname: HEALTH_RETIRED, reason: "UNREGISTERED" });
    });

    it("resolves the canonical Family Office base as a CAPABILITY_BASE, never as an OS", async () => {
      const principal = groupAdmin();

      const canonical = await resolveHostname(principal, FAMILY_OFFICE_BASE);
      expect(canonical).toEqual({
        kind: "CAPABILITY_BASE",
        hostname: FAMILY_OFFICE_BASE,
        capability: "SHARED_FAMILY_OFFICE",
      });

      const retired = await resolveHostname(principal, FAMILY_OFFICE_RETIRED);
      expect(retired).toEqual({ kind: "NOT_APPLICABLE", hostname: FAMILY_OFFICE_RETIRED, reason: "UNREGISTERED" });
    });

    it("keeps each base on its original owner, OS, type and lifecycle — a rename, not a re-provision", async () => {
      for (const expected of [
        {
          id: "TDM_HEALTH_OS_BASE",
          tenant: SEEDED.health,
          os: "HEALTH_OS",
          domainType: "OS_BASE",
          hostname: HEALTH_BASE,
        },
        {
          id: "TDM_FAMILY_OFFICE_CAPABILITY_BASE",
          tenant: SEEDED.group,
          os: "SHARED_FAMILY_OFFICE",
          domainType: "CAPABILITY_BASE",
          hostname: FAMILY_OFFICE_BASE,
        },
      ] as const) {
        const [row] = await adminDb.select().from(tenantDomains).where(eq(tenantDomains.id, expected.id));
        expect(row, expected.id).toBeDefined();
        expect(row!.hostname, expected.id).toBe(expected.hostname);
        expect(row!.tenantId, expected.id).toBe(expected.tenant);
        expect(row!.os, expected.id).toBe(expected.os);
        expect(row!.domainType as string, expected.id).toBe(expected.domainType);
        expect(row!.status, expected.id).toBe("ACTIVE");
        expect(row!.verificationState, expected.id).toBe("DOCUMENTED");
      }
    });

    it("leaves NO namespace base on the retired apex", async () => {
      const rows = await adminDb
        .select({ hostname: tenantDomains.hostname })
        .from(tenantDomains)
        .where(inArray(tenantDomains.hostname, [HEALTH_RETIRED, FAMILY_OFFICE_RETIRED]));
      expect(rows).toEqual([]);
    });

    it("still refuses an unproven name under the NEW namespace", async () => {
      // The alignment must not have widened anything: a name that merely sits
      // inside the namespace is still a refusal, not a tenant.
      const unproven = await resolveHostname(groupAdmin(), `not-registered.${HEALTH_BASE}`);
      expect(unproven.kind).toBe("DENIED");
    });
  });
});
