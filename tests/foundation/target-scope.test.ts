/**
 * Foundation OS — canonical target-scope boundary (real PostgreSQL).
 *
 * Closes the API-boundary gap identified after PR #63: the Foundation
 * deep-link layer already proved the canonical Foundation target-tenant and
 * classification boundary, while protected API execution had to prove the SAME
 * facts independently. These specs pin the resolution itself and the domain
 * layer that consumes it:
 *
 *   A. correct Foundation target        → resolves, authorised reads succeed
 *   B. wrong Foundation target tenant   → denied
 *   C. missing target tenant            → denied
 *   D. forged client target tenant      → denied (the scope is never inferred
 *                                          from anything the caller supplies)
 *   E. unknown/malformed classification → denied
 *   F. insufficient clearance           → denied
 *   G. unauthorised role                → RBAC denies at the boundary while the
 *                                          scope check stays a *scope* check
 *   H. cross-tenant access attempt      → denied, even for a row that exists
 *   I. direct service call (no UI)      → denied
 *   J. authorised request               → succeeds
 *
 * Mutation paths are covered by asserting the tenant a governed write is
 * stamped with (the resolved Foundation target tenant, never the caller's own
 * tenant and never a forged one).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { foundationMeetings, foundations, legalEntities, tenants, users } from "@/db/schema";
import { can, clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "@/lib/authz";
import {
  classificationRank,
  PERMISSIONS,
  type Classification,
  type PermissionCode,
} from "@/lib/constants";
import { permissionClassificationFloor } from "@/lib/api";
import { fixedId, ID_PREFIX, newId } from "@/lib/ids";
import {
  resolveFoundationTargetScope,
  FOUNDATION_TARGET_SCOPE_REASONS,
  FOUNDATION_TARGET_TENANT_CODE,
} from "@/lib/foundation/target-scope";
import {
  FoundationError,
  createFoundation,
  foundationScopeIds,
  foundationTargetTenantId,
  getFoundation,
  listFoundations,
  scheduleMeeting,
  type ServiceContext,
} from "@/lib/foundation/service";
import { advanceComplianceTask, listEscalations } from "@/lib/foundation/compliance";
import { listPrograms } from "@/lib/foundation/service-operations";
import { BeyuNoeliaFoundationService } from "@/lib/foundation/noelia-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import type { ToolInvocationContext } from "@/lib/noelia/types";

async function principalFor(userKey: string, overrides: Partial<Principal> = {}): Promise<Principal> {
  const userId = fixedId(ID_PREFIX.user, userKey);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error(`seed user ${userKey} missing`);
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
    ...overrides,
  };
}

const ctxFor = (principal: Principal): ServiceContext => ({
  principal,
  traceId: `TARGET-SCOPE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

let foundationTenantId = "";
let healthTenantId = "";
/** A real foundation row that lives OUTSIDE the canonical Foundation tenant. */
let foreignFoundationId = "";

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const createdFoundationIds: string[] = [];
const createdMeetingIds: string[] = [];

beforeAll(async () => {
  const rows = await db
    .select({ id: tenants.id, code: tenants.code })
    .from(tenants)
    .where(sql`${tenants.code} in ('BEYU-FOUNDATION', 'BEYU-HEALTH')`);
  foundationTenantId = rows.find((r) => r.code === FOUNDATION_TARGET_TENANT_CODE)?.id ?? "";
  healthTenantId = rows.find((r) => r.code === "BEYU-HEALTH")?.id ?? "";
  if (!foundationTenantId || !healthTenantId) throw new Error("seed tenants missing — run npm run seed");

  // Attack fixture: a foundation-shaped row inside another tenant. Inserted with
  // the privileged test role; RLS still governs the runtime path under test.
  foreignFoundationId = newId(ID_PREFIX.foundation);
  await db.insert(foundations).values({
    id: foreignFoundationId,
    tenantId: healthTenantId,
    code: `FDN-FOREIGN-${RUN}`,
    legalName: `Foreign tenant foundation ${RUN}`,
    legalVehicle: "FOUNDATION",
    countryCode: "TZ",
    status: "PROPOSED",
  });
});

afterAll(async () => {
  for (const id of createdMeetingIds) {
    await db.execute(sql`delete from foundation_meetings where id = ${id}`);
  }
  for (const id of createdFoundationIds) {
    await db.execute(sql`delete from foundations where id = ${id}`);
  }
  await db.execute(sql`delete from foundations where id = ${foreignFoundationId}`);
});

describe("A. correct Foundation target", () => {
  it("resolves the canonical Foundation tenant for a foundation seat", async () => {
    const director = await principalFor("FATMA_JUMA");
    const resolution = await resolveFoundationTargetScope(director);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.scope.tenantId).toBe(foundationTenantId);
    expect(await foundationTargetTenantId(director)).toBe(foundationTenantId);
    expect(await foundationScopeIds(director)).toEqual([foundationTenantId]);
    // A foundation seat reads its own tenant's registry.
    expect((await listFoundations(director)).length).toBeGreaterThanOrEqual(1);
  });

  it("resolves the same canonical tenant for enterprise oversight in the ancestor tenant", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    expect(ceo.tenantId).not.toBe(foundationTenantId);
    const resolution = await resolveFoundationTargetScope(ceo);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.scope.tenantId).toBe(foundationTenantId);
    expect(
      (await listFoundations(ceo)).every((row) => row.tenantId === foundationTenantId),
    ).toBe(true);
  });
});

describe("B. wrong Foundation target tenant", () => {
  it("denies a health-tenant principal that holds Foundation capabilities", async () => {
    const sector = await principalFor("SARA_LEMA");
    expect(sector.tenantCode).toBe("BEYU-HEALTH");
    expect(sector.permissions.has("foundation:program.read")).toBe(true);

    const resolution = await resolveFoundationTargetScope(sector);
    expect(resolution).toEqual({ ok: false, reason: FOUNDATION_TARGET_SCOPE_REASONS.UNRESOLVED });

    await expect(listPrograms(sector)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listEscalations(sector)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(foundationScopeIds(sector)).rejects.toBeInstanceOf(FoundationError);
  });

  it("denies an agriculture-tenant principal", async () => {
    const agri = await principalFor("JOSEPH_MWALIMU");
    expect(agri.tenantCode).toBe("BEYU-AGRI");
    expect((await resolveFoundationTargetScope(agri)).ok).toBe(false);
  });
});

describe("C. missing target tenant", () => {
  it("denies when no canonical Foundation tenant is inside the resolved scope", async () => {
    const director = await principalFor("FATMA_JUMA");
    const orphan = await principalFor("FATMA_JUMA", { tenantId: "TEN_DOES_NOT_EXIST" });
    const resolution = await resolveFoundationTargetScope(orphan);
    expect(resolution).toEqual({ ok: false, reason: FOUNDATION_TARGET_SCOPE_REASONS.UNRESOLVED });
    // No fallback to the principal's own tenant, another tenant, or public data.
    await expect(listFoundations(orphan)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(director.tenantId).toBe(foundationTenantId);
  });

  it("denies when the canonical Foundation tenant is not ACTIVE", async () => {
    const director = await principalFor("FATMA_JUMA");
    await db.update(tenants).set({ status: "SUSPENDED" }).where(eq(tenants.id, foundationTenantId));
    try {
      expect(await resolveFoundationTargetScope(director)).toEqual({
        ok: false,
        reason: FOUNDATION_TARGET_SCOPE_REASONS.UNRESOLVED,
      });
    } finally {
      await db.update(tenants).set({ status: "ACTIVE" }).where(eq(tenants.id, foundationTenantId));
    }
  });
});

describe("D. forged client target tenant", () => {
  it("never derives the target from a caller-supplied tenant", async () => {
    const director = await principalFor("FATMA_JUMA");
    // A principal object that claims a foreign tenant resolves nothing: the
    // tenant is taken from the authenticated principal's resolved scope only.
    const forged = await principalFor("FATMA_JUMA", { tenantId: healthTenantId, tenantCode: "BEYU-HEALTH" });
    expect((await resolveFoundationTargetScope(forged)).ok).toBe(false);
    // And a principal in the right scope still resolves the canonical tenant —
    // there is no field a caller can pass to steer it elsewhere.
    expect(await foundationTargetTenantId(director)).toBe(foundationTenantId);
  });

  it("stamps governed creations with the resolved target tenant, not the caller's tenant", async () => {
    const governance = await principalFor("GRACE_KILELE");
    expect(governance.tenantId).not.toBe(foundationTenantId);
    expect(governance.permissions.has("foundation:governance.manage")).toBe(true);

    const director = await principalFor("FATMA_JUMA");
    const demo = (await listFoundations(director)).find((f) => f.code === "BEYU-FDN-01");
    expect(demo).toBeDefined();

    const meeting = await scheduleMeeting(ctxFor(governance), {
      foundationId: demo!.id,
      governanceBodyId: "GOV_FOUNDATION_BOARD",
      code: `MTG-TARGET-${RUN}`,
      title: "Target-scope regression meeting",
      scheduledAt: new Date("2026-10-01T09:00:00Z"),
    });
    createdMeetingIds.push(meeting.id);

    const [row] = await db
      .select({ tenantId: foundationMeetings.tenantId })
      .from(foundationMeetings)
      .where(eq(foundationMeetings.id, meeting.id));
    expect(row?.tenantId).toBe(foundationTenantId);
  });
});

describe("E/F. classification boundary", () => {
  it("denies an unknown or malformed principal clearance", async () => {
    const malformed = await principalFor("FATMA_JUMA", { clearance: "SECRET" as Classification });
    expect(await resolveFoundationTargetScope(malformed)).toEqual({
      ok: false,
      reason: FOUNDATION_TARGET_SCOPE_REASONS.UNRESOLVED,
    });
    const malformedLower = await principalFor("FATMA_JUMA", { clearance: "secret-ish" as Classification });
    expect((await resolveFoundationTargetScope(malformedLower)).ok).toBe(false);
  });

  it("denies clearance below the Foundation tenant classification", async () => {
    const tooLow = await principalFor("FATMA_JUMA", { clearance: "INTERNAL" });
    expect(await resolveFoundationTargetScope(tooLow)).toEqual({
      ok: false,
      reason: FOUNDATION_TARGET_SCOPE_REASONS.UNRESOLVED,
    });
    await expect(listFoundations(tooLow)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The Foundation tenant is CONFIDENTIAL: a grant whose clearance stops at
    // PUBLIC is refused rather than served a filtered subset.
    const publicOnly = await principalFor("FATMA_JUMA", { clearance: "PUBLIC" });
    expect((await resolveFoundationTargetScope(publicOnly)).ok).toBe(false);
  });

  it("refuses entity-scoped grants for tenant-wide Foundation access", async () => {
    const scoped = await principalFor("FATMA_JUMA", { entityScope: ["ENT_BEYU_FOUNDATION"] });
    expect(await resolveFoundationTargetScope(scoped)).toEqual({
      ok: false,
      reason: FOUNDATION_TARGET_SCOPE_REASONS.ENTITY_SCOPED,
    });
    await expect(getFoundation(scoped, foreignFoundationId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("G. unauthorised role", () => {
  it("keeps RBAC and scope as separate, both-required controls", async () => {
    const cfo = await principalFor("DAUDI_MOSHI");
    // The CFO has enterprise tenant scope (so oversight resolves) but holds no
    // Foundation capability: RBAC denies the endpoint. Scope does not grant it.
    expect(can(cfo, "foundation:registry.read").allowed).toBe(false);
    expect((await resolveFoundationTargetScope(cfo)).ok).toBe(true);

    // The health operator is the inverse: capability without scope is denied by
    // the scope boundary.
    const sector = await principalFor("SARA_LEMA");
    expect(can(sector, "foundation:program.read").allowed).toBe(true);
    expect((await resolveFoundationTargetScope(sector)).ok).toBe(false);
  });
});

describe("H/I. cross-tenant and direct-call denial", () => {
  it("cannot read an out-of-tenant foundation by id, even though the row exists", async () => {
    const director = await principalFor("FATMA_JUMA");
    await expect(getFoundation(director, foreignFoundationId)).rejects.toMatchObject({
      name: "FoundationError",
      code: "NOT_FOUND",
    });
    const rows = await listFoundations(director);
    expect(rows.map((r) => r.id)).not.toContain(foreignFoundationId);
  });

  it("denies a direct service call that bypasses the UI entirely", async () => {
    const sector = await principalFor("SARA_LEMA");
    await expect(listFoundations(sector)).rejects.toBeInstanceOf(FoundationError);
    await expect(advanceComplianceTask(ctxFor(sector), "TSK_ANY", "BLOCKED")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("classification ceiling for Foundation datasets", () => {
  it("declares a floor for every Foundation capability, never below CONFIDENTIAL", () => {
    const foundationPermissions = Object.keys(PERMISSIONS).filter((code) =>
      code.startsWith("foundation:"),
    ) as PermissionCode[];
    expect(foundationPermissions.length).toBeGreaterThan(20);
    for (const permission of foundationPermissions) {
      const floor = permissionClassificationFloor(permission);
      expect(floor, `${permission} must declare a classification floor`).toBeDefined();
      expect(classificationRank(floor!), `${permission} floor`).toBeGreaterThanOrEqual(
        classificationRank("CONFIDENTIAL"),
      );
    }
    // The most protected Foundation dataset keeps its explicit ceiling.
    expect(permissionClassificationFloor("foundation:safeguarding.read")).toBe("HIGHLY_RESTRICTED");
    expect(permissionClassificationFloor("foundation:safeguarding.manage")).toBe("HIGHLY_RESTRICTED");
    expect(permissionClassificationFloor("foundation:beneficiary.read")).toBe("RESTRICTED");
  });

  it("refuses a capability whose dataset classification exceeds the principal clearance", () => {
    const base = {
      userId: "USR_CLEARANCE_PROBE",
      partyId: "PTY_CLEARANCE_PROBE",
      email: "clearance.probe@beyu.os",
      displayName: "Clearance probe",
      tenantId: "TEN_BEYU_FOUNDATION",
      tenantCode: "BEYU-FOUNDATION",
      tenantType: "SECTOR",
      roles: ["FOUNDATION_OFFICER"],
      permissions: new Set<PermissionCode>(["foundation:safeguarding.read"]),
      clearance: "CONFIDENTIAL" as Classification,
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "TEST",
      riskScore: 0,
      emergencyPermissions: [],
    } satisfies Principal;

    const safeguardingFloor = permissionClassificationFloor("foundation:safeguarding.read");
    expect(safeguardingFloor).toBe("HIGHLY_RESTRICTED");
    expect(can(base, "foundation:safeguarding.read", { classification: safeguardingFloor }).allowed).toBe(false);

    // Holding the capability is not enough: the ceiling is enforced per dataset.
    const cleared = { ...base, clearance: "HIGHLY_RESTRICTED" as Classification };
    expect(can(cleared, "foundation:safeguarding.read", { classification: safeguardingFloor }).allowed).toBe(true);

    // An unknown clearance can never rank above a dataset floor.
    const unknown = { ...base, clearance: "SECRET" as Classification };
    expect(can(unknown, "foundation:safeguarding.read", { classification: safeguardingFloor }).allowed).toBe(false);
  });
});

describe("J. authorised request persistence", () => {
  it("persists the creation in the canonical Foundation tenant", async () => {
    const director = await principalFor("FATMA_JUMA");
    const created = await createFoundation(ctxFor(director), {
      code: `FDN-TARGET-${RUN}`,
      legalName: `Target scope probe ${RUN}`,
      legalVehicle: "FOUNDATION",
      countryCode: "TZ",
    });
    createdFoundationIds.push(created.id);

    const [row] = await db
      .select()
      .from(foundations)
      .where(and(eq(foundations.id, created.id), eq(foundations.tenantId, foundationTenantId)));
    expect(row?.status).toBe("PROPOSED");
    expect((await getFoundation(director, created.id)).id).toBe(created.id);
  });
});

/**
 * The AI surface is a Foundation data surface too: `/api/v1/ai/noelia/*` exposes
 * Foundation aggregates through registered `foundation:*` tools. It must be held
 * to the same canonical target boundary as the Foundation API and the deep-link
 * layer — a tenant-wide AI view of Foundation data is exactly what the boundary
 * exists to refuse.
 */
describe("K. Foundation AI surface (Noelia tools)", () => {
  /** Invoke a Foundation tool exactly as the Noelia runtime does: inside the canonical tenant context. */
  async function runTool<T>(
    principal: Principal,
    run: (context: ToolInvocationContext) => Promise<T>,
  ): Promise<T> {
    return withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      return run({
        principal,
        traceId: `TARGET-SCOPE-AI-${RUN}`,
        target: requestedNoeliaTarget(principal),
        scope,
      });
    });
  }

  async function canonicalFoundationCount(): Promise<number> {
    const [counted] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(foundations)
      .where(eq(foundations.tenantId, foundationTenantId));
    return counted.count;
  }

  it("reads the canonical Foundation tenant only, for a principal the boundary places (A/J)", async () => {
    const director = await principalFor("FATMA_JUMA");
    const out = await runTool(director, (context) => new BeyuNoeliaFoundationService().registry(context));
    const expected = await canonicalFoundationCount();
    expect(expected).toBeGreaterThan(0);
    expect(out.findings?.[0]?.label).toBe("Foundations in scope");
    expect(out.findings?.[0]?.value).toBe(String(expected));
  });

  it("refuses a tenant-wide AI view for an entity-scoped grant (D/H)", async () => {
    const [entity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.tenantId, foundationTenantId))
      .limit(1);
    expect(entity?.id).toBeTruthy();

    const scoped = await principalFor("FATMA_JUMA", { entityScope: [entity.id] });
    const resolution = await resolveFoundationTargetScope(scoped);
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason).toBe(FOUNDATION_TARGET_SCOPE_REASONS.ENTITY_SCOPED);

    const service = new BeyuNoeliaFoundationService();
    const registry = await runTool(scoped, (context) => service.registry(context));
    const pipeline = await runTool(scoped, (context) => service.grantPipeline(context));
    expect(registry.findings ?? []).toEqual([]);
    expect(pipeline.findings ?? []).toEqual([]);
  });

  it("refuses Foundation AI reads for a principal outside the canonical target (B/H/I)", async () => {
    const operator = await principalFor("SARA_LEMA");
    const resolution = await resolveFoundationTargetScope(operator);
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.reason).toBe(FOUNDATION_TARGET_SCOPE_REASONS.UNRESOLVED);

    const service = new BeyuNoeliaFoundationService();
    const posture = await runTool(operator, (context) => service.compliancePosture(context));
    const registry = await runTool(operator, (context) => service.registry(context));
    expect(posture.findings ?? []).toEqual([]);
    expect(registry.findings ?? []).toEqual([]);
  });

  it("still serves an enterprise principal whose canonical target resolves (J)", async () => {
    const cfo = await principalFor("DAUDI_MOSHI");
    expect((await resolveFoundationTargetScope(cfo)).ok).toBe(true);

    const out = await runTool(cfo, (context) => new BeyuNoeliaFoundationService().registry(context));
    const expected = await canonicalFoundationCount();
    expect(out.findings?.[0]?.value).toBe(String(expected));
  });
});
