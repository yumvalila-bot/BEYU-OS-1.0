/**
 * Agriculture OS — domain, finance boundary, grants, Noelia observe, interop.
 *
 * Harvest recording emits HARVEST_RECORDED and never posts a journal.
 * Capital cases do not insert capital_requests. CAP_POSTING stays LOCKED.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  capitalCases,
  capitalRequests,
  cropCycles,
  enterpriseEvents,
  farms,
  fields,
  governanceCapabilityRegistry,
  harvests,
  journalEntries,
  legalEntities,
  syncEnvelopes,
  whatIfRuns,
  yieldRecords,
} from "@/db/schema";
import {
  acceptSyncEnvelope,
  AgriDomainError,
  agricultureDashboard,
  createCapitalCase,
  createCropCycle,
  createFarm,
  createField,
  listFarms,
  recordHarvest,
  runWhatIf,
  type AgriActor,
} from "@/lib/agriculture";
import { can } from "@/lib/authz";
import { AGRICULTURE_OS_TENANT_CODE, ROLES } from "@/lib/constants";
import { connectivityGraph } from "@/lib/interoperability/connectivity";
import { DOMAIN_REGISTRY, domainByCode } from "@/lib/interoperability/domains";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `AGR${Date.now()}`;

async function tableCount(table: typeof journalEntries | typeof capitalRequests | typeof enterpriseEvents): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return Number(row?.n ?? 0);
}

async function harvestEventCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enterpriseEvents)
    .where(eq(enterpriseEvents.type, "HARVEST_RECORDED"));
  return Number(row?.n ?? 0);
}

describe("Agriculture OS — named grants", () => {
  it("CEO/CFO/CRC/AUDITOR have read; SECTOR_OPERATOR has manage; HCM/CGO/FAMILY have none", () => {
    expect(ROLES.GROUP_CEO.permissions).toContain("agriculture:data.read");
    expect(ROLES.GROUP_CEO.permissions).not.toContain("agriculture:data.manage");
    expect(ROLES.GROUP_CFO.permissions).toContain("agriculture:data.read");
    expect(ROLES.CHIEF_RISK_COMPLIANCE.permissions).toContain("agriculture:data.read");
    expect(ROLES.AUDITOR.permissions).toContain("agriculture:data.read");
    expect(ROLES.SECTOR_OPERATOR.permissions).toContain("agriculture:data.read");
    expect(ROLES.SECTOR_OPERATOR.permissions).toContain("agriculture:data.manage");
    expect(ROLES.HCM_DIRECTOR.permissions).not.toContain("agriculture:data.read");
    expect(ROLES.CHIEF_GOVERNANCE_OFFICER.permissions).not.toContain("agriculture:data.read");
    expect(ROLES.FAMILY_OFFICE_PRINCIPAL.permissions).not.toContain("agriculture:data.read");
  });

  it("can() matches the named grants on seeded principals", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const hcm = await seededPrincipal("hcm@beyu.os");
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const healthOps = await seededPrincipal("health.ops@beyu.os");
    const family = await seededPrincipal("family@beyu.os");
    expect(can(ceo, "agriculture:data.read").allowed).toBe(true);
    expect(can(ceo, "agriculture:data.manage").allowed).toBe(false);
    expect(can(hcm, "agriculture:data.read").allowed).toBe(false);
    expect(agriOps.tenantCode).toBe(AGRICULTURE_OS_TENANT_CODE);
    expect(can(agriOps, "agriculture:data.manage").allowed).toBe(true);
    expect(can(healthOps, "agriculture:data.manage").allowed).toBe(false);
    expect(can(family, "agriculture:data.read").allowed).toBe(false);
    expect(can(ceo, "agriculture:data.read", { tenantId: "TEN_DOES_NOT_EXIST" }).allowed).toBe(false);
    expect(can(agriOps, "agriculture:data.manage", { tenantId: healthOps.tenantId }).allowed).toBe(false);
  });
});

describe("Agriculture OS — harvest never journals", () => {
  let actor: AgriActor;
  let tenantId: string;
  let farmId: string;
  let cycleId: string;

  beforeAll(async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    tenantId = agriOps.tenantId;
    actor = {
      tenantId,
      userId: agriOps.userId,
      traceId: `TRACEAGR${Date.now()}`,
    };
    const [entity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.code, "BEYU-AGR"))
      .limit(1);

    const farm = await createFarm(
      {
        tenantId,
        legalEntityId: entity.id,
        code: `${RUN}F`,
        name: "Morogoro test farm",
        countryCode: "TZ",
        region: "Morogoro",
        totalAreaHa: "12.00",
      },
      actor,
    );
    farmId = farm.id;
    const field = await createField(
      { tenantId, farmId, code: `${RUN}FL`, name: "North block", areaHa: "4.00" },
      actor,
    );
    const cycle = await createCropCycle(
      {
        tenantId,
        fieldId: field.id,
        cropType: "MAIZE",
        code: `${RUN}CY`,
        season: "2026-MASIKA",
        plantingDate: "2026-03-01",
      },
      actor,
    );
    cycleId = cycle.id;
  });

  afterAll(async () => {
    if (!cycleId) return;
    const harvestRows = await db
      .select({ id: harvests.id })
      .from(harvests)
      .where(eq(harvests.cropCycleId, cycleId));
    for (const row of harvestRows) {
      await db.delete(yieldRecords).where(eq(yieldRecords.harvestId, row.id));
      await db.delete(harvests).where(eq(harvests.id, row.id));
    }
    await db.delete(cropCycles).where(eq(cropCycles.code, `${RUN}CY`));
    await db.delete(fields).where(eq(fields.code, `${RUN}FL`));
    await db.delete(farms).where(eq(farms.code, `${RUN}F`));
  });

  it("recordHarvest with a HUMAN actor emits HARVEST_RECORDED and posts zero journals", async () => {
    const journalsBefore = await tableCount(journalEntries);
    const capitalBefore = await tableCount(capitalRequests);

    const result = await recordHarvest(
      {
        tenantId,
        cropCycleId: cycleId,
        code: `${RUN}HV`,
        harvestDate: "2026-07-15",
        quantityKg: "1800",
        qualityGrade: "A",
        unit: "KG",
      },
      actor,
    );

    expect(result.journalsPosted).toBe(false);
    expect(result.financeHandoff).toBe("NONE");

    const [event] = await db
      .select()
      .from(enterpriseEvents)
      .where(and(eq(enterpriseEvents.type, "HARVEST_RECORDED"), eq(enterpriseEvents.subjectId, result.id)))
      .limit(1);
    expect(event).toBeDefined();
    expect(event.domain).toBe("AGRICULTURE");
    expect(event.operation).toBe("RECORD_HARVEST");
    expect(event.actorType).toBe("HUMAN");
    expect(event.actorUserId).toBe(actor.userId);
    expect((event.payload as { journalsPosted?: boolean }).journalsPosted).toBe(false);

    expect(await tableCount(journalEntries)).toBe(journalsBefore);
    expect(await tableCount(capitalRequests)).toBe(capitalBefore);
  });

  it("recordHarvest without an actor writes the row and skips the event", async () => {
    const eventsBefore = await harvestEventCount();
    const result = await recordHarvest({
      tenantId,
      cropCycleId: cycleId,
      code: `${RUN}HV2`,
      harvestDate: "2026-07-16",
      quantityKg: "200",
    });
    expect(result.journalsPosted).toBe(false);
    expect(await harvestEventCount()).toBe(eventsBefore);
    await db.delete(yieldRecords).where(eq(yieldRecords.harvestId, result.id));
    await db.delete(harvests).where(eq(harvests.id, result.id));
  });

  it("listFarms is tenant-scoped", async () => {
    const mine = await listFarms(tenantId);
    expect(mine.some((f) => f.id === farmId)).toBe(true);
    const other = await listFarms("TEN_DOES_NOT_EXIST");
    expect(other).toEqual([]);
  });
});

describe("Agriculture OS — identity, tenant, entity, country isolation", () => {
  it("Health identity cannot create an Agriculture farm on a Health entity", async () => {
    const health = await seededPrincipal("health.ops@beyu.os");
    const [entity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.code, "BEYU-HEA"))
      .limit(1);
    await expect(
      createFarm(
        {
          tenantId: health.tenantId,
          legalEntityId: entity.id,
          code: `${RUN}HX`,
          name: "Health impersonation farm",
          countryCode: "TZ",
        },
        { tenantId: health.tenantId, userId: health.userId, traceId: `TRACEAGR${Date.now()}` },
      ),
    ).rejects.toBeInstanceOf(AgriDomainError);
  });

  it("Agriculture identity cannot bind a Health legal entity", async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const [healthEntity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.code, "BEYU-HEA"))
      .limit(1);
    await expect(
      createFarm(
        {
          tenantId: agriOps.tenantId,
          legalEntityId: healthEntity.id,
          code: `${RUN}XE`,
          name: "Cross-entity farm",
          countryCode: "TZ",
        },
        { tenantId: agriOps.tenantId, userId: agriOps.userId, traceId: `TRACEAGR${Date.now()}` },
      ),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });

  it("Agriculture identity cannot post a foreign country on the TZ agri entity", async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const [entity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.code, "BEYU-AGR"))
      .limit(1);
    await expect(
      createFarm(
        {
          tenantId: agriOps.tenantId,
          legalEntityId: entity.id,
          code: `${RUN}XC`,
          name: "Cross-country farm",
          countryCode: "KE",
        },
        { tenantId: agriOps.tenantId, userId: agriOps.userId, traceId: `TRACEAGR${Date.now()}` },
      ),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });

  it("Agriculture actor cannot write into another tenant", async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const health = await seededPrincipal("health.ops@beyu.os");
    const [entity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.code, "BEYU-AGR"))
      .limit(1);
    await expect(
      createFarm(
        {
          tenantId: health.tenantId,
          legalEntityId: entity.id,
          code: `${RUN}XT`,
          name: "Cross-tenant farm",
          countryCode: "TZ",
        },
        { tenantId: agriOps.tenantId, userId: agriOps.userId, traceId: `TRACEAGR${Date.now()}` },
      ),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });
});

describe("Agriculture OS — capital cases, what-if, sync, CAP_POSTING", () => {
  it("createCapitalCase does not insert capital_requests and reports CAP_POSTING LOCKED", async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const actor: AgriActor = { tenantId: agriOps.tenantId, userId: agriOps.userId, traceId: `TRACEAGR${Date.now()}` };
    const capitalBefore = await tableCount(capitalRequests);
    const journalsBefore = await tableCount(journalEntries);

    const result = await createCapitalCase(
      { tenantId: agriOps.tenantId, code: `${RUN}CAP`, title: "Irrigation pump", amount: "15000", currency: "USD" },
      actor,
    );
    expect(result.journalsPosted).toBe(false);
    expect(result.financeHandoff).toBe("SUBMITTED_PENDING_FINANCE");
    expect(result.capPosting).toBe("LOCKED");
    expect(await tableCount(capitalRequests)).toBe(capitalBefore);
    expect(await tableCount(journalEntries)).toBe(journalsBefore);

    const [row] = await db.select().from(capitalCases).where(eq(capitalCases.id, result.id));
    expect(row.financeHandoff).toBe("SUBMITTED_PENDING_FINANCE");
  });

  it("what-if is SIMULATION / SCENARIO and never financial truth", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const result = await runWhatIf(
      { tenantId: ceo.tenantId, title: `${RUN} rainfall`, areaHa: 10, yieldKgPerHa: 2000, rainfallMm: 400 },
      { tenantId: ceo.tenantId, userId: ceo.userId, traceId: `TRACEAGR${Date.now()}` },
    );
    expect(result.epistemicStatus).toBe("SCENARIO");
    expect(result.outputs.basis).toBe("SIMULATION");
    expect(result.outputs.journalsPosted).toBe(false);
    expect(result.explanation).toMatch(/SIMULATION/i);
    const [row] = await db.select().from(whatIfRuns).where(eq(whatIfRuns.id, result.id));
    expect(row.basis).toBe("SIMULATION");
  });

  it("sync envelope is idempotent: first accept, replay returns the same id", async () => {
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const actor: AgriActor = { tenantId: agriOps.tenantId, userId: agriOps.userId, traceId: `TRACEAGR${Date.now()}` };
    const envelopeId = `${RUN}ENV0001`;
    const first = await acceptSyncEnvelope(
      {
        tenantId: agriOps.tenantId,
        envelopeId,
        operation: "RECORD_HARVEST",
        payload: { code: `${RUN}OFF` },
        clientOccurredAt: new Date().toISOString(),
      },
      actor,
    );
    expect(first.replay).toBe(false);
    expect(first.status).toBe("ACCEPTED");
    const second = await acceptSyncEnvelope(
      {
        tenantId: agriOps.tenantId,
        envelopeId,
        operation: "RECORD_HARVEST",
        payload: { code: `${RUN}OFF` },
        clientOccurredAt: new Date().toISOString(),
      },
      actor,
    );
    expect(second.replay).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it("CAP_POSTING remains LOCKED after agriculture mutations", async () => {
    const [cap] = await db
      .select()
      .from(governanceCapabilityRegistry)
      .where(eq(governanceCapabilityRegistry.capabilityCode, "CAP_POSTING"));
    expect(cap.activationStatus).toBe("LOCKED");
  });

  it("dashboard declares FINANCE_OS_ONLY / LOCKED / HARVEST_RECORDED", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const dash = await agricultureDashboard(ceo.tenantId);
    expect(dash.financeBoundary.journals).toBe("FINANCE_OS_ONLY");
    expect(dash.financeBoundary.capPosting).toBe("LOCKED");
    expect(dash.financeBoundary.harvestEvent).toBe("HARVEST_RECORDED");
    expect(dash.timezoneDefault).toBe("Africa/Dar_es_Salaam");
    expect(dash.countryDefault).toBe("TZ");
  });
});

describe("Agriculture OS — Noelia observe", () => {
  it("agriculture.operations.observe is allowed for CEO and denied for HCM", async () => {
    const registry = createDefaultNoeliaToolRegistry();
    const ceo = await seededPrincipal("ceo@beyu.os");
    const allowed = await withTenantDatabaseContext(ceo, async () => {
      const scope = await resolveNoeliaAuthorizedScope(ceo);
      const target = requestedNoeliaTarget(ceo, null);
      return registry.invoke(
        "agriculture.operations.observe",
        {
          principal: ceo,
          traceId: `TRACEAGR${Date.now()}`,
          target,
          scope,
        },
        {},
      );
    });
    expect(allowed.allowed).toBe(true);
    if (!allowed.allowed) throw new Error("observe must be allowed");
    expect(allowed.output.headline).toMatch(/Agriculture OS observation/i);
    expect(allowed.output.findings?.some((f) => f.label === "Finance boundary")).toBe(true);
    expect((allowed.output.metadata as { financeBoundary?: { journals?: string } }).financeBoundary?.journals).toBe(
      "FINANCE_OS_ONLY",
    );

    const hcm = await seededPrincipal("hcm@beyu.os");
    const denied = await withTenantDatabaseContext(hcm, async () => {
      const scope = await resolveNoeliaAuthorizedScope(hcm);
      const target = requestedNoeliaTarget(hcm, null);
      return registry.invoke(
        "agriculture.operations.observe",
        {
          principal: hcm,
          traceId: `TRACEAGR${Date.now()}`,
          target,
          scope,
        },
        {},
      );
    });
    expect(denied.allowed).toBe(false);
  });
});

describe("Agriculture OS — interoperability", () => {
  it("DOM-AGRICULTURE is PARTIAL with HARVEST_RECORDED", () => {
    const agri = domainByCode("AGRICULTURE");
    expect(agri?.domainId).toBe("DOM-AGRICULTURE");
    expect(agri?.status).toBe("PARTIAL");
    expect(agri?.eventContract).toContain("HARVEST_RECORDED");
    expect(agri?.systemOfRecord).toMatch(/agriculture_harvests/);
    expect(DOMAIN_REGISTRY.some((d) => d.domainId === "DOM-AGRICULTURE")).toBe(true);
  });

  it("AGRICULTURE → FINANCE is EVENT; no sector-side journal", () => {
    const edge = connectivityGraph().find((e) => e.source === "AGRICULTURE" && e.destination === "FINANCE");
    expect(edge).toBeDefined();
    expect(edge?.interaction).toBe("EVENT");
    expect(edge?.contract).toMatch(/HARVEST_RECORDED/);
    expect(edge?.authority).toMatch(/CAP_POSTING remains LOCKED/);
  });

  it("seed source registers AGRICULTURE_OS as ACTIVE", () => {
    const seed = readFileSync("src/db/seed.ts", "utf8");
    expect(seed).toMatch(/code: "AGRICULTURE_OS"[\s\S]{0,500}lifecycle: "ACTIVE"/);
  });
});
