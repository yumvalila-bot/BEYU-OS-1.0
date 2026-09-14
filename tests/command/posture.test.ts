/**
 * INSTITUTIONAL POSTURE — advisory-only boundary tests (X10THINK §45–§46).
 *
 * Real services, real PostgreSQL. The posture score is visibility, NEVER
 * authorization. These tests pin:
 *   - the §46 boundary is part of the PAYLOAD (advisoryOnly, grantsAuthority,
 *     boundary text), not just a comment;
 *   - every component reports its epistemic status; a component with no
 *     evidence is DATA_NOT_AVAILABLE with score null — never scored as good;
 *   - weights are declared and sum to 1;
 *   - a verifying audit chain leaves the score uncapped (and a broken chain
 *     would cap it at 40 — the cap flag is asserted false only when verified);
 *   - computing a posture NEVER changes what any principal may do: `can()`
 *     returns the identical decision before and after (the score is not an
 *     input to RBAC/ABAC/policy/RLS).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { tenants, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { can, clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { verifyAuditChain } from "../../src/lib/audit";
import { POSTURE_SERVICE_VERSION, computeInstitutionalPosture } from "../../src/lib/command/posture";

async function principalFor(userKey: string): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.id, fixedId(ID_PREFIX.user, userKey)));
  if (!u) throw new Error(`seed user ${userKey} missing — run npm run seed`);
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

let cfo: Principal;
let sector: Principal;

beforeAll(async () => {
  cfo = await principalFor("DAUDI_MOSHI");
  sector = await principalFor("SARA_LEMA");
});

describe("§46 — the posture payload carries its own boundary", () => {
  it("is ADVISORY ONLY: advisoryOnly=true, grantsAuthority=false, boundary text present", async () => {
    const posture = await computeInstitutionalPosture(cfo);
    expect(posture.serviceVersion).toBe(POSTURE_SERVICE_VERSION);
    expect(posture.advisoryOnly).toBe(true);
    expect(posture.grantsAuthority).toBe(false);
    expect(posture.boundary).toMatch(/ADVISORY ONLY/i);
    expect(posture.boundary).toMatch(/never authorization/i);
    expect(posture.tenantId).toBe(cfo.tenantId);
  });

  it("exposes the six weighted components and the weights sum to 1", async () => {
    const posture = await computeInstitutionalPosture(cfo);
    const keys = posture.components.map((c) => c.key).sort();
    expect(keys).toEqual(
      ["AUDIT_INTEGRITY", "COMPLIANCE_POSITION", "CONTROL_EFFECTIVENESS", "GOVERNANCE_EVIDENCE", "RISK_POSITION", "TLS_GOVERNANCE"].sort(),
    );
    const weightSum = posture.components.reduce((s, c) => s + c.weight, 0);
    expect(Math.abs(weightSum - 1)).toBeLessThan(1e-9);
  });

  it("reports epistemic status per component; unscored components are null, never implicitly good", async () => {
    const posture = await computeInstitutionalPosture(cfo);
    for (const c of posture.components) {
      expect(["OBSERVED", "FAILED", "DATA_NOT_AVAILABLE"]).toContain(c.status);
      if (c.status === "DATA_NOT_AVAILABLE") {
        expect(c.score).toBeNull();
      } else {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
      expect(Array.isArray(c.findings)).toBe(true);
    }
    // The score is the weighted mean over SCORED components only, in 0..100.
    if (posture.postureScore !== null) {
      expect(posture.postureScore).toBeGreaterThanOrEqual(0);
      expect(posture.postureScore).toBeLessThanOrEqual(100);
    }
  });

  it("scores audit integrity from the REAL chains and does not cap when they verify", async () => {
    const chain = await verifyAuditChain();
    const posture = await computeInstitutionalPosture(cfo);
    const audit = posture.components.find((c) => c.key === "AUDIT_INTEGRITY")!;
    if (chain.verified) {
      expect(audit.status).toBe("OBSERVED");
      expect(audit.score).toBe(100);
      expect(posture.cappedByAuditIntegrity).toBe(false);
    } else {
      expect(audit.status).toBe("FAILED");
      expect(audit.score).toBe(0);
      expect(posture.cappedByAuditIntegrity).toBe(true);
      if (posture.postureScore !== null) expect(posture.postureScore).toBeLessThanOrEqual(40);
    }
  });

  it("scores TLS governance from repository artifacts (fail-closed config presence)", async () => {
    const posture = await computeInstitutionalPosture(cfo);
    const tls = posture.components.find((c) => c.key === "TLS_GOVERNANCE")!;
    // This repository ships the TLS governance artifacts, so the component is
    // OBSERVED; the assertion is on the epistemic contract, not on a value
    // that would silently rot.
    expect(["OBSERVED", "FAILED", "DATA_NOT_AVAILABLE"]).toContain(tls.status);
    expect(Object.keys(tls.evidence).length).toBeGreaterThan(0);
  });
});

describe("§46 — the posture score grants NOTHING: can() is unchanged by it", () => {
  it("computing posture does not change RBAC/ABAC decisions for any principal", async () => {
    const probe = (p: Principal) =>
      [
        can(p, "equity:cap-table.manage", { classification: "RESTRICTED", tenantId: p.tenantId }),
        can(p, "familyoffice:trust.manage", { classification: "HIGHLY_RESTRICTED", tenantId: p.tenantId }),
        can(p, "finance:waterfall.commit", { classification: "RESTRICTED", tenantId: p.tenantId }),
      ].map((d) => d.allowed);

    const beforeCfo = probe(cfo);
    const beforeSector = probe(sector);

    await computeInstitutionalPosture(cfo);
    await computeInstitutionalPosture(sector);

    expect(probe(cfo)).toEqual(beforeCfo);
    expect(probe(sector)).toEqual(beforeSector);
  });

  it("a sector operator's posture stays tenant-scoped and still cannot manage capitalization", async () => {
    const posture = await computeInstitutionalPosture(sector);
    expect(posture.tenantId).toBe(sector.tenantId);
    expect(posture.grantsAuthority).toBe(false);
    const decision = can(sector, "equity:cap-table.manage", { classification: "RESTRICTED", tenantId: sector.tenantId });
    expect(decision.allowed).toBe(false);
  });
});
