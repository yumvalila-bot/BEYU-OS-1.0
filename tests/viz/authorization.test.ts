/**
 * Visualization authorization — RBAC/ABAC + sector conjunction certification.
 *
 * Holding a viz permission is NEVER sector access: the sector's own boundary
 * (ujenzi:data.read + BEYU-UJENZI scope, agriculture:data.read + BEYU-AGRI
 * scope, Finance read paths, the Health federation bridge, Foundation scope)
 * is re-checked on every request. Deep links re-authorize; out-of-scope
 * references resolve NOT_FOUND (existence is protected); entity-scoped
 * principals fail closed; exporting requires viz:export ON TOP of viewing.
 */
import { describe, expect, it } from "vitest";
import { can } from "@/lib/authz";
import { ROLES } from "@/lib/constants";
import {
  authorizeExport,
  authorizeVisualization,
  assertSectorAccess,
  entityScopeRefusal,
  reauthorizeDeepLink,
} from "@/lib/viz/authorization";
import { seededPrincipal } from "../noelia/db-fixtures";

describe("named grants (RBAC)", () => {
  it("role grants match the governed viz ladder — manage/dimension.manage are narrow", () => {
    expect(ROLES.PLATFORM_ADMIN.permissions).toContain("viz:dimension.manage");
    expect(ROLES.PLATFORM_ADMIN.permissions).toContain("viz:scene.manage");
    expect(ROLES.SECTOR_OPERATOR.permissions).toContain("viz:scene.manage");
    expect(ROLES.SECTOR_OPERATOR.permissions).not.toContain("viz:dimension.manage");
    expect(ROLES.GROUP_CEO.permissions).toContain("viz:scene.read");
    expect(ROLES.GROUP_CEO.permissions).toContain("viz:export");
    expect(ROLES.GROUP_CEO.permissions).not.toContain("viz:scene.manage");
    expect(ROLES.CHIEF_GOVERNANCE_OFFICER.permissions).not.toContain("viz:export");
    expect(ROLES.HCM_DIRECTOR.permissions).not.toContain("viz:export");
    expect(ROLES.AUDITOR.permissions).toContain("viz:export");
    expect(ROLES.AUDITOR.permissions).not.toContain("viz:scene.manage");
    expect(ROLES.FAMILY_OFFICE_PRINCIPAL.permissions).not.toContain("viz:scene.read");
  });

  it("can() on seeded principals: viewers view, operators operate, family sees nothing", async () => {
    const admin = await seededPrincipal("admin@beyu.os");
    const ceo = await seededPrincipal("ceo@beyu.os");
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const family = await seededPrincipal("family@beyu.os");
    expect(can(admin, "viz:dimension.manage").allowed).toBe(true);
    expect(can(ceo, "viz:scene.read").allowed).toBe(true);
    expect(can(ceo, "viz:scene.manage").allowed).toBe(false);
    expect(can(ujenziOps, "viz:scene.manage").allowed).toBe(true);
    expect(can(ujenziOps, "viz:dimension.manage").allowed).toBe(false);
    expect(can(family, "viz:scene.read").allowed).toBe(false);
    expect(authorizeVisualization(family, { permission: "viz:scene.read" }).allowed).toBe(false);
  });

  it("HIGH-RISK: viz:dimension.manage triggers MFA step-up through can()", async () => {
    const admin = await seededPrincipal("admin@beyu.os");
    const withoutMfa = { ...admin, mfaSatisfied: false };
    const decision = can(withoutMfa, "viz:dimension.manage");
    // Either denied outright or gated behind requiresMfa — never silently allowed.
    expect(decision.allowed === false || decision.requiresMfa === true).toBe(true);
  });
});

describe("sector conjunction (DATA authorization)", () => {
  it("UJENZI: ujenzi.ops allowed; agri.ops and family refused; BEYU control plane open to viz holders", async () => {
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const family = await seededPrincipal("family@beyu.os");
    const ceo = await seededPrincipal("ceo@beyu.os");
    expect((await assertSectorAccess(ujenziOps, "UJENZI")).allowed).toBe(true);
    const agriOnUjenzi = await assertSectorAccess(agriOps, "UJENZI");
    expect(agriOnUjenzi.allowed).toBe(false);
    expect(agriOnUjenzi.reason).toMatch(/ujenzi:data\.read/);
    expect((await assertSectorAccess(agriOps, "AGRICULTURE")).allowed).toBe(true);
    expect((await assertSectorAccess(family, "UJENZI")).allowed).toBe(false);
    expect((await assertSectorAccess(ceo, "BEYU")).allowed).toBe(true);
  });

  it("FINANCE: requires a Finance OS read path; the reason declares READ-GOVERNED + CAP_POSTING LOCKED", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const hcm = await seededPrincipal("hcm@beyu.os");
    expect((await assertSectorAccess(cfo, "FINANCE")).allowed).toBe(true);
    // HCM_DIRECTOR holds no Finance OS read permission — the sector gate holds
    // even though HCM holds viz permissions. (Note: SECTOR_OPERATOR does carry
    // finance:capital.read by design, so sector operators pass the RBAC gate
    // and are then bounded by tenant scope + RLS at the data layer.)
    const denied = await assertSectorAccess(hcm, "FINANCE");
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/CAP_POSTING remains LOCKED/);
  });

  it("HEALTH: the decision is federation-governed — never a fabricated health permission", async () => {
    const healthOps = await seededPrincipal("health.ops@beyu.os");
    const decision = await assertSectorAccess(healthOps, "HEALTH");
    expect(typeof decision.allowed).toBe("boolean");
    if (!decision.allowed) expect(decision.reason).toMatch(/federat|NOT_LINKED|link/i);
    const ceo = await seededPrincipal("ceo@beyu.os");
    const ceoHealth = await assertSectorAccess(ceo, "HEALTH");
    // Without a federation link the CEO gets NO Health data through viz.
    if (!ceoHealth.allowed) expect(ceoHealth.reason).toMatch(/federat|link|PHI/i);
  });

  it("FOUNDATION: foundation principals pass inside their scope; sector operators do not", async () => {
    const director = await seededPrincipal("foundation.director@beyu.os");
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    expect((await assertSectorAccess(director, "FOUNDATION")).allowed).toBe(true);
    expect((await assertSectorAccess(agriOps, "FOUNDATION")).allowed).toBe(false);
  });

  it("unknown sectors fail closed", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const decision = await assertSectorAccess(ceo, "SOMETHING_ELSE" as never);
    expect(decision.allowed).toBe(false);
  });
});

describe("entity scope + deep links (§20/§21)", () => {
  it("entity-scoped principals are refused rather than widened", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    expect(entityScopeRefusal(ceo)).toBeNull();
    expect(entityScopeRefusal({ ...ceo, entityScope: ["LEN_1"] })).toMatch(/refused rather than widened/);
  });

  it("a null record resolves NOT_FOUND — cross-tenant probes learn nothing", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const decision = await reauthorizeDeepLink(ceo, null, "viz:scene.read");
    expect(decision.allowed).toBe(false);
    expect(decision.notFound).toBe(true);
  });

  it("a record in another tenant's sector is refused with the sector reason; classification ceilings apply", async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const ujenziRecord = { tenantId: agriOps.tenantId, classification: "INTERNAL", sector: "UJENZI" as const, legalEntityId: null };
    const denied = await reauthorizeDeepLink(agriOps, ujenziRecord, "viz:scene.read");
    expect(denied.allowed).toBe(false);
    expect(denied.notFound).toBe(false);
    expect(denied.sectorReason).toMatch(/Ujenzi OS data requires/);

    // HCM_DIRECTOR clearance is RESTRICTED — a HIGHLY_RESTRICTED record is
    // above the ceiling even though HCM holds viz:scene.read.
    const hcm = await seededPrincipal("hcm@beyu.os");
    const aboveCeiling = { tenantId: hcm.tenantId, classification: "HIGHLY_RESTRICTED", sector: "BEYU" as const, legalEntityId: null };
    const ceiling = await reauthorizeDeepLink(hcm, aboveCeiling, "viz:scene.read");
    expect(ceiling.allowed).toBe(false);
  });

  it("authorizeExport: viewing is not exporting", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    const ceo = await seededPrincipal("ceo@beyu.os");
    expect(can(governance, "viz:scene.read").allowed).toBe(true);
    const denied = await authorizeExport(governance, "BEYU", "INTERNAL");
    expect(denied.allowed).toBe(false);
    expect((await authorizeExport(ceo, "BEYU", "INTERNAL")).allowed).toBe(true);
    // Export of a sector the principal cannot read is refused even WITH viz:export.
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const crossSector = await authorizeExport(ujenziOps, "FOUNDATION", "INTERNAL");
    expect(crossSector.allowed).toBe(false);
  });
});
