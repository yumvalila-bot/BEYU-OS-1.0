/**
 * Ujenzi OS — one Sector OS, finance boundary, soil/engineering authority.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  capitalRequests,
  enterpriseEvents,
  governanceCapabilityRegistry,
  journalEntries,
  legalEntities,
  ujenziCostTrackers,
  ujenziEngineeringCalculations,
  ujenziKnowledge,
  ujenziLandSites,
  ujenziProjects,
  ujenziSoilTests,
} from "@/db/schema";
import {
  acceptSyncEnvelope,
  createLandSite,
  createProject,
  listProjects,
  recordEngineeringCalculation,
  recordKnowledge,
  recordSoilTest,
  UjenziDomainError,
  ujenziDashboard,
  type UjenziActor,
} from "@/lib/ujenzi";
import { can } from "@/lib/authz";
import { ROLES, UJENZI_OS_TENANT_CODE } from "@/lib/constants";
import { connectivityGraph } from "@/lib/interoperability/connectivity";
import { DOMAIN_REGISTRY, domainByCode } from "@/lib/interoperability/domains";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `UJZ${Date.now()}`;

async function tableCount(table: typeof journalEntries | typeof capitalRequests): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return Number(row?.n ?? 0);
}

describe("Ujenzi OS — named grants", () => {
  it("CEO/CFO/CRC/AUDITOR have read; SECTOR_OPERATOR has manage; HCM/FAMILY have none", () => {
    expect(ROLES.GROUP_CEO.permissions).toContain("ujenzi:data.read");
    expect(ROLES.GROUP_CEO.permissions).not.toContain("ujenzi:data.manage");
    expect(ROLES.GROUP_CFO.permissions).toContain("ujenzi:data.read");
    expect(ROLES.CHIEF_RISK_COMPLIANCE.permissions).toContain("ujenzi:data.read");
    expect(ROLES.AUDITOR.permissions).toContain("ujenzi:data.read");
    expect(ROLES.SECTOR_OPERATOR.permissions).toContain("ujenzi:data.manage");
    expect(ROLES.HCM_DIRECTOR.permissions).not.toContain("ujenzi:data.read");
    expect(ROLES.FAMILY_OFFICE_PRINCIPAL.permissions).not.toContain("ujenzi:data.read");
  });

  it("can() matches named grants and tenant-binds manage", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const hcm = await seededPrincipal("hcm@beyu.os");
    const ujzOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    expect(can(ceo, "ujenzi:data.read").allowed).toBe(true);
    expect(can(ceo, "ujenzi:data.manage").allowed).toBe(false);
    expect(can(hcm, "ujenzi:data.read").allowed).toBe(false);
    expect(ujzOps.tenantCode).toBe(UJENZI_OS_TENANT_CODE);
    expect(can(ujzOps, "ujenzi:data.manage").allowed).toBe(true);
    expect(can(agriOps, "ujenzi:data.manage").allowed).toBe(false);
  });
});

describe("Ujenzi OS — project never journals", () => {
  let actor: UjenziActor;
  let tenantId: string;
  let projectId: string;

  beforeAll(async () => {
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    tenantId = ops.tenantId;
    actor = { tenantId, userId: ops.userId, traceId: `TRACEUJZ${Date.now()}` };
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const project = await createProject(
      { tenantId, legalEntityId: entity.id, code: `${RUN}P`, name: "Dar test school", countryCode: "TZ", projectType: "INSTITUTIONAL" },
      actor,
    );
    projectId = project.id;
  });

  afterAll(async () => {
    if (!projectId) return;
    await db.delete(ujenziKnowledge).where(eq(ujenziKnowledge.projectId, projectId));
    await db.delete(ujenziCostTrackers).where(eq(ujenziCostTrackers.projectId, projectId));
    await db.delete(ujenziEngineeringCalculations).where(eq(ujenziEngineeringCalculations.projectId, projectId));
    const sites = await db.select({ id: ujenziLandSites.id }).from(ujenziLandSites).where(eq(ujenziLandSites.projectId, projectId));
    for (const site of sites) {
      await db.delete(ujenziSoilTests).where(eq(ujenziSoilTests.siteId, site.id));
    }
    await db.delete(ujenziLandSites).where(eq(ujenziLandSites.projectId, projectId));
    await db.delete(ujenziProjects).where(eq(ujenziProjects.id, projectId));
  });

  it("createProject emits PROJECT_CREATED and posts zero journals", async () => {
    const journalsBefore = await tableCount(journalEntries);
    const capitalBefore = await tableCount(capitalRequests);
    const [event] = await db
      .select()
      .from(enterpriseEvents)
      .where(and(eq(enterpriseEvents.type, "PROJECT_CREATED"), eq(enterpriseEvents.subjectId, projectId)))
      .limit(1);
    expect(event).toBeDefined();
    expect(event.domain).toBe("UJENZI");
    expect((event.payload as { journalsPosted?: boolean }).journalsPosted).toBe(false);
    expect(await tableCount(journalEntries)).toBe(journalsBefore);
    expect(await tableCount(capitalRequests)).toBe(capitalBefore);
  });

  it("listProjects is tenant-scoped", async () => {
    const mine = await listProjects(tenantId);
    expect(mine.some((p) => p.id === projectId)).toBe(true);
    expect(await listProjects("TEN_DOES_NOT_EXIST")).toEqual([]);
  });

  it("engineering calculation is NOT_CERTIFIED", async () => {
    const result = await recordEngineeringCalculation(
      {
        tenantId,
        projectId,
        code: `${RUN}C`,
        discipline: "STRUCTURAL",
        method: "SIMPLE_BEAM",
        formulaOrModel: "M = wL^2/8",
        inputs: { w: 10, L: 6 },
        result: { moment: 45 },
      },
      actor,
    );
    expect(result.professionalCertification).toBe("NOT_CERTIFIED");
  });

  it("soil test without parameters is DATA_REQUIRED / NOT_AVAILABLE", async () => {
    const site = await createLandSite({ tenantId, projectId, code: `${RUN}S`, name: "Plot A" }, actor);
    const missing = await recordSoilTest({ tenantId, siteId: site.id, testKind: "SPT" }, actor);
    expect(missing.dataStatus).toBe("DATA_REQUIRED");
    expect(missing.epistemicStatus).toBe("NOT_AVAILABLE");
  });

  it("knowledge never grants authority", async () => {
    const k = await recordKnowledge({ tenantId, projectId, title: `${RUN} learning` }, actor);
    expect(k.authorityGranted).toBe(false);
  });

  it("Health identity cannot bind a construction entity", async () => {
    const health = await seededPrincipal("health.ops@beyu.os");
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-HEA")).limit(1);
    await expect(
      createProject(
        { tenantId: health.tenantId, legalEntityId: entity.id, code: `${RUN}HX`, name: "impersonation", countryCode: "TZ" },
        { tenantId: health.tenantId, userId: health.userId, traceId: `TRACEUJZ${Date.now()}` },
      ),
    ).rejects.toBeInstanceOf(UjenziDomainError);
  });

  it("cannot bind Health legal entity from Ujenzi tenant", async () => {
    const [healthEntity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-HEA")).limit(1);
    await expect(
      createProject(
        { tenantId, legalEntityId: healthEntity.id, code: `${RUN}XE`, name: "cross entity", countryCode: "TZ" },
        actor,
      ),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });

  it("sync envelope is idempotent", async () => {
    const envelopeId = `${RUN}ENV1`;
    const first = await acceptSyncEnvelope(
      { tenantId, envelopeId, operation: "SITE_DIARY", payload: {}, clientOccurredAt: new Date().toISOString() },
      actor,
    );
    expect(first.replay).toBe(false);
    const second = await acceptSyncEnvelope(
      { tenantId, envelopeId, operation: "SITE_DIARY", payload: {}, clientOccurredAt: new Date().toISOString() },
      actor,
    );
    expect(second.replay).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it("CAP_POSTING remains LOCKED", async () => {
    const [cap] = await db.select().from(governanceCapabilityRegistry).where(eq(governanceCapabilityRegistry.capabilityCode, "CAP_POSTING"));
    expect(cap.activationStatus).toBe("LOCKED");
  });

  it("dashboard declares finance / engineering / soil / government boundaries", async () => {
    const dash = await ujenziDashboard(tenantId);
    expect(dash.financeBoundary.journals).toBe("FINANCE_OS_ONLY");
    expect(dash.financeBoundary.capPosting).toBe("LOCKED");
    expect(dash.engineeringBoundary).toBe("CALCULATION_IS_NOT_CERTIFICATION");
    expect(dash.soilBoundary).toBe("NO_FABRICATED_FIELD_RESULTS");
    expect(dash.architecture).toBe("ONE_UJENZI_SECTOR_OS");
  });
});

describe("Ujenzi OS — Noelia observe", () => {
  it("ujenzi.operations.observe is allowed for CEO and denied for HCM", async () => {
    const registry = createDefaultNoeliaToolRegistry();
    const ceo = await seededPrincipal("ceo@beyu.os");
    const allowed = await withTenantDatabaseContext(ceo, async () => {
      const scope = await resolveNoeliaAuthorizedScope(ceo);
      const target = requestedNoeliaTarget(ceo, null);
      return registry.invoke("ujenzi.operations.observe", { principal: ceo, traceId: `TRACEUJZ${Date.now()}`, target, scope }, {});
    });
    expect(allowed.allowed).toBe(true);
    if (!allowed.allowed) throw new Error("observe must be allowed");
    expect(allowed.output.headline).toMatch(/Ujenzi OS observation/i);

    const hcm = await seededPrincipal("hcm@beyu.os");
    const denied = await withTenantDatabaseContext(hcm, async () => {
      const scope = await resolveNoeliaAuthorizedScope(hcm);
      const target = requestedNoeliaTarget(hcm, null);
      return registry.invoke("ujenzi.operations.observe", { principal: hcm, traceId: `TRACEUJZ${Date.now()}`, target, scope }, {});
    });
    expect(denied.allowed).toBe(false);
  });
});

describe("Ujenzi OS — interoperability", () => {
  it("DOM-UJENZI is PARTIAL with PROJECT_CREATED", () => {
    const ujz = domainByCode("UJENZI");
    expect(ujz?.domainId).toBe("DOM-UJENZI");
    expect(ujz?.status).toBe("PARTIAL");
    expect(ujz?.eventContract).toContain("PROJECT_CREATED");
    expect(DOMAIN_REGISTRY.some((d) => d.domainId === "DOM-UJENZI")).toBe(true);
  });

  it("UJENZI → FINANCE is EVENT; CAP_POSTING remains LOCKED", () => {
    const edge = connectivityGraph().find((e) => e.source === "UJENZI" && e.destination === "FINANCE");
    expect(edge).toBeDefined();
    expect(edge?.interaction).toBe("EVENT");
    expect(edge?.authority).toMatch(/CAP_POSTING remains LOCKED/);
  });

  it("seed registers UJENZI_OS as ACTIVE", () => {
    const seed = readFileSync("src/db/seed.ts", "utf8");
    expect(seed).toMatch(/code: "UJENZI_OS"[\s\S]{0,800}lifecycle: "ACTIVE"/);
  });
});

describe("Ujenzi OS — Digital Twin graph (Phase 1)", () => {
  it("capability registry is honest about BIM viewer and government", async () => {
    const { UJENZI_CAPABILITY_REGISTRY } = await import("@/lib/ujenzi/capability-registry");
    expect(UJENZI_CAPABILITY_REGISTRY.find((c) => c.capability === "bim")?.status).toBe("PARTIAL");
    expect(UJENZI_CAPABILITY_REGISTRY.find((c) => c.capability === "government_integration")?.status).toBe("NOT_CONNECTED");
    expect(UJENZI_CAPABILITY_REGISTRY.find((c) => c.capability === "finance_handoff")?.status).toBe("BLOCKED");
    expect(UJENZI_CAPABILITY_REGISTRY.find((c) => c.capability === "engineering_calculations")?.status).toBe("NOT_CERTIFIED");
  });

  it("registers a building on a project and refuses geometry dumps", async () => {
    const { createProject, createLandSite } = await import("@/lib/ujenzi");
    const { registerBuilding, queryDigitalTwin, recordProfessional } = await import("@/lib/ujenzi/twin");
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    const actor = { tenantId: ops.tenantId, userId: ops.userId, traceId: `TRACEUJZ${Date.now()}` };
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const code = `TWIN${Date.now()}`;
    const project = await createProject(
      { tenantId: ops.tenantId, legalEntityId: entity.id, code, name: "Twin school", countryCode: "TZ" },
      actor,
    );
    const site = await createLandSite({ tenantId: ops.tenantId, projectId: project.id, code: `${code}S`, name: "Plot", crs: "EPSG:4326" }, actor);
    const building = await registerBuilding({ tenantId: ops.tenantId, projectId: project.id, siteId: site.id, code: `${code}B`, name: "Block A" }, actor);
    expect(building.twin).toBe("PARTIAL");
    const twin = await queryDigitalTwin(ops.tenantId, project.id);
    expect(twin.buildings).toBeGreaterThanOrEqual(1);
    expect(twin.viewer).toBe("NOT_IMPLEMENTED");
    expect(twin.geometryPayload).toBe("REFUSED");
    const pro = await recordProfessional({ tenantId: ops.tenantId, displayName: "Eng. Test", discipline: "STRUCTURAL" });
    expect(pro.verificationStatus).toBe("USER_ENTERED");
    expect(pro.fabricated).toBe(false);
  });

  it("refuses coordinates without CRS", async () => {
    const { createLandSite, UjenziDomainError } = await import("@/lib/ujenzi");
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    await expect(
      createLandSite({ tenantId: ops.tenantId, code: `NOCRS${Date.now()}`, name: "x", gpsLatitude: "-6.8" }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
  });
});
