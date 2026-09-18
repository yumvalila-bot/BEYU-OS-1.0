/**
 * UJENZI OS — domain, finance boundary, grants, BOQ governance, handover gate,
 * isolation, Noelia observe, interop.
 *
 * Payment certification emits PAYMENT_CERTIFIED and never posts a journal.
 * Purchase-order approval records a COMMITTED cost line and never posts.
 * CAP_POSTING stays LOCKED.
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  enterpriseEvents,
  journalEntries,
  legalEntities,
  ujenziBoqItems,
  ujenziBoqs,
  ujenziCostRecords,
  ujenziNcrs,
  ujenziPaymentCertificates,
  ujenziPunchItems,
  ujenziProjects,
} from "@/db/schema";
import {
  addBoqItem,
  approveBoq,
  certifyPaymentCertificate,
  createBoq,
  createNcr,
  createPunchItem,
  createProject,
  createPurchaseOrder,
  createRequisition,
  closeNcr,
  closePunchItem,
  createMaterial,
  decideVariation,
  handoverProject,
  recordHseIncident,
  recordMaterialMovement,
  recordCost,
  requestVariation,
  submitClaim,
  ujenziDashboard,
  UjenziDomainError,
  type UjenziActor,
} from "@/lib/ujenzi";
import { can } from "@/lib/authz";
import { UJENZI_OS_TENANT_CODE, ROLES } from "@/lib/constants";
import { connectivityGraph } from "@/lib/interoperability/connectivity";
import { DOMAIN_REGISTRY, domainByCode } from "@/lib/interoperability/domains";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `UJZ${Date.now()}`;

async function journalCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(journalEntries);
  return Number(row?.n ?? 0);
}

async function eventCount(type: string, since: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enterpriseEvents)
    .where(and(eq(enterpriseEvents.type, type), sql`${enterpriseEvents.occurredAt} >= ${new Date(since).toISOString()}`));
  return Number(row?.n ?? 0);
}

describe("Ujenzi OS — named grants", () => {
  it("CEO/CFO/CRC/AUDITOR have read; SECTOR_OPERATOR has read+manage; HCM/CGO/FAMILY have none", () => {
    expect(ROLES.GROUP_CEO.permissions).toContain("ujenzi:data.read");
    expect(ROLES.GROUP_CEO.permissions).not.toContain("ujenzi:data.manage");
    expect(ROLES.GROUP_CFO.permissions).toContain("ujenzi:data.read");
    expect(ROLES.CHIEF_RISK_COMPLIANCE.permissions).toContain("ujenzi:data.read");
    expect(ROLES.AUDITOR.permissions).toContain("ujenzi:data.read");
    expect(ROLES.SECTOR_OPERATOR.permissions).toContain("ujenzi:data.read");
    expect(ROLES.SECTOR_OPERATOR.permissions).toContain("ujenzi:data.manage");
    expect(ROLES.HCM_DIRECTOR.permissions).not.toContain("ujenzi:data.read");
    expect(ROLES.CHIEF_GOVERNANCE_OFFICER.permissions).not.toContain("ujenzi:data.read");
    expect(ROLES.FAMILY_OFFICE_PRINCIPAL.permissions).not.toContain("ujenzi:data.read");
  });

  it("can() matches the named grants on seeded principals", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    const hcm = await seededPrincipal("hcm@beyu.os");
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    const agriOps = await seededPrincipal("agri.ops@beyu.os");
    const family = await seededPrincipal("family@beyu.os");
    expect(can(ceo, "ujenzi:data.read").allowed).toBe(true);
    expect(can(ceo, "ujenzi:data.manage").allowed).toBe(false);
    expect(can(hcm, "ujenzi:data.read").allowed).toBe(false);
    expect(ujenziOps.tenantCode).toBe(UJENZI_OS_TENANT_CODE);
    expect(can(ujenziOps, "ujenzi:data.manage").allowed).toBe(true);
    expect(can(agriOps, "ujenzi:data.manage").allowed).toBe(false); // generic role is not cross-sector authority
    expect(can(agriOps, "ujenzi:data.manage", { tenantId: ujenziOps.tenantId }).allowed).toBe(false);
    expect(can(family, "ujenzi:data.read").allowed).toBe(false);
    expect(can(ceo, "ujenzi:data.read", { tenantId: "TEN_DOES_NOT_EXIST" }).allowed).toBe(false);
  });
});

describe("Ujenzi OS — project lifecycle, finance boundary, events", () => {
  let actor: UjenziActor;
  let tenantId: string;
  let entityId: string;
  let projectId: string;

  beforeAll(async () => {
    const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    tenantId = ujenziOps.tenantId;
    actor = { tenantId, userId: ujenziOps.userId, traceId: `TRACEUJZ${Date.now()}` };
    const [entity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.code, "BEYU-UJZ"))
      .limit(1);
    expect(entity).toBeDefined();
    entityId = entity.id;
  });

  afterAll(async () => {
    const projects = await db
      .select({ id: ujenziProjects.id })
      .from(ujenziProjects)
      .where(eq(ujenziProjects.code, `${RUN}P`));
    const ids = projects.map((p) => p.id);
    // Full FK-ordered cleanup of domain rows. Audit + enterprise events are an
    // append-only hash-chained ledger and are deliberately LEFT IN PLACE —
    // the same convention as the Agriculture suite.
    const { ujenziRequisitions, ujenziPurchaseOrders, ujenziMaterialCatalog, ujenziMaterialMovements, ujenziHseIncidents, ujenziVariations, ujenziClaims } = await import("@/db/schema");
    if (ids.length > 0) {
      const boqs = await db.select({ id: ujenziBoqs.id }).from(ujenziBoqs).where(inArray(ujenziBoqs.projectId, ids));
      for (const boq of boqs) {
        await db.delete(ujenziBoqItems).where(eq(ujenziBoqItems.boqId, boq.id));
      }
      await db.delete(ujenziBoqs).where(inArray(ujenziBoqs.projectId, ids));
      await db.delete(ujenziCostRecords).where(inArray(ujenziCostRecords.projectId, ids));
      await db.delete(ujenziPaymentCertificates).where(inArray(ujenziPaymentCertificates.projectId, ids));
      await db.delete(ujenziPunchItems).where(inArray(ujenziPunchItems.projectId, ids));
      await db.delete(ujenziNcrs).where(inArray(ujenziNcrs.projectId, ids));
      await db.delete(ujenziHseIncidents).where(inArray(ujenziHseIncidents.projectId, ids));
      await db.delete(ujenziVariations).where(inArray(ujenziVariations.projectId, ids));
      await db.delete(ujenziClaims).where(inArray(ujenziClaims.projectId, ids));
      await db.delete(ujenziMaterialMovements).where(inArray(ujenziMaterialMovements.projectId, ids));
      await db.delete(ujenziPurchaseOrders).where(inArray(ujenziPurchaseOrders.projectId, ids));
      await db.delete(ujenziRequisitions).where(inArray(ujenziRequisitions.projectId, ids));
    }
    await db.delete(ujenziMaterialCatalog).where(eq(ujenziMaterialCatalog.code, `${RUN}M`));
    if (ids.length > 0) {
      await db.delete(ujenziProjects).where(inArray(ujenziProjects.id, ids));
    }
  });

  it("createProject emits PROJECT_CREATED and posts zero journals", async () => {
    const journalsBefore = await journalCount();
    const since = Date.now() - 2000;
    const result = await createProject(
      {
        tenantId,
        legalEntityId: entityId,
        code: `${RUN}P`,
        name: "Test tower construction",
        countryCode: "TZ",
        contractValue: "1000000.00",
        currency: "TZS",
      },
      actor,
    );
    projectId = result.id;
    expect(result.status).toBe("PLANNED");
    expect(await journalCount()).toBe(journalsBefore);
    expect(await eventCount("PROJECT_CREATED", since)).toBeGreaterThanOrEqual(1);
  });

  it("createProject rejects a non-construction legal entity (entity isolation)", async () => {
    const [agriEntity] = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(eq(legalEntities.code, "BEYU-AGR"))
      .limit(1);
    expect(agriEntity).toBeDefined();
    await expect(
      createProject(
        {
          tenantId,
          legalEntityId: agriEntity.id,
          code: `${RUN}P_BAD`,
          name: "Wrong entity project",
          countryCode: "TZ",
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });

  it("createProject rejects a country outside the entity jurisdiction (country isolation)", async () => {
    await expect(
      createProject(
        {
          tenantId,
          legalEntityId: entityId,
          code: `${RUN}P_BAD2`,
          name: "Wrong country project",
          countryCode: "KE",
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });

  it("actor from another tenant cannot write into the Ujenzi tenant", async () => {
    const healthOps = await seededPrincipal("health.ops@beyu.os");
    const foreignActor: UjenziActor = {
      tenantId: healthOps.tenantId,
      userId: healthOps.userId,
      traceId: `TRACEUJZ${Date.now()}`,
    };
    await expect(
      createProject(
        {
          tenantId,
          legalEntityId: entityId,
          code: `${RUN}P_BAD3`,
          name: "Foreign tenant project",
          countryCode: "TZ",
        },
        foreignActor,
      ),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });

  it("a foreign project id is NOT_FOUND, never a leak", async () => {
    await expect(recordCost({ tenantId, projectId: "UJZ_DOES_NOT_EXIST", kind: "BUDGET", amount: "1" }, actor)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });

  it("BOQ versioning: sequential versions, approval supersedes without mutating history, immutability enforced", async () => {
    const since = Date.now() - 2000;
    const v1 = await createBoq({ tenantId, projectId }, actor);
    expect(v1.version).toBe(1);
    await addBoqItem(
      { tenantId, boqId: v1.id, code: "01-001", description: "Excavation", unit: "M3", quantity: "100", rate: "25000" },
      actor,
    );
    const approved1 = await approveBoq({ tenantId, boqId: v1.id }, actor);
    expect(approved1.status).toBe("APPROVED");
    expect(Number(approved1.totalValue)).toBe(2500000);

    const v2 = await createBoq({ tenantId, projectId }, actor);
    expect(v2.version).toBe(2);
    await addBoqItem(
      { tenantId, boqId: v2.id, code: "01-001", description: "Excavation (revised)", unit: "M3", quantity: "120", rate: "25000" },
      actor,
    );
    const approved2 = await approveBoq({ tenantId, boqId: v2.id }, actor);
    expect(approved2.status).toBe("APPROVED");

    const rows = await db.select().from(ujenziBoqs).where(eq(ujenziBoqs.projectId, projectId));
    const v1Row = rows.find((r) => r.version === 1);
    const v2Row = rows.find((r) => r.version === 2);
    expect(v1Row?.status).toBe("SUPERSEDED");
    expect(Number(v1Row?.totalValue)).toBe(2500000); // history preserved verbatim
    expect(v2Row?.status).toBe("APPROVED");

    await expect(
      addBoqItem({ tenantId, boqId: v2.id, code: "01-002", description: "Late item", unit: "M3", quantity: "1", rate: "1" }, actor),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    expect(await eventCount("BOQ_CREATED", since)).toBeGreaterThanOrEqual(2);
    expect(await eventCount("BOQ_APPROVED", since)).toBeGreaterThanOrEqual(2);
  });

  it("recordCost enforces the five-kind distinction", async () => {
    await expect(recordCost({ tenantId, projectId, kind: "INVALID" as never, amount: "1" }, actor)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    const budget = await recordCost({ tenantId, projectId, kind: "BUDGET", amount: "900000" }, actor);
    expect(budget.journalsPosted).toBe(false);
  });

  it("purchase-order approval records COMMITTED cost and never journals (finance boundary)", async () => {
    const journalsBefore = await journalCount();
    const since = Date.now() - 2000;
    const requisition = await createRequisition(
      { tenantId, projectId, code: `${RUN}R`, description: "Cement supply" },
      actor,
    );
    const po = await createPurchaseOrder(
      { tenantId, projectId, requisitionId: requisition.id, code: `${RUN}PO`, supplierName: "Twiga Cement", amount: "50000" },
      actor,
    );
    const approved = await (await import("@/lib/ujenzi")).approvePurchaseOrder({ tenantId, purchaseOrderId: po.id }, actor);
    expect(approved.status).toBe("APPROVED");
    expect(approved.journalsPosted).toBe(false);
    expect(await journalCount()).toBe(journalsBefore);
    expect(await eventCount("PROCUREMENT_REQUESTED", since)).toBeGreaterThanOrEqual(1);
    expect(await eventCount("PURCHASE_ORDER_APPROVED", since)).toBeGreaterThanOrEqual(1);
    const [committed] = await db
      .select()
      .from(ujenziCostRecords)
      .where(and(eq(ujenziCostRecords.sourceType, "PURCHASE_ORDER"), eq(ujenziCostRecords.sourceId, po.id)));
    expect(committed?.kind).toBe("COMMITTED");
    expect(Number(committed?.amount)).toBe(50000);
  });

  it("material RECEIPT emits MATERIAL_RECEIVED", async () => {
    const since = Date.now() - 2000;
    const material = await createMaterial({ tenantId, code: `${RUN}M`, name: "Cement CEM II", unit: "BAG" }, actor);
    await recordMaterialMovement(
      { tenantId, projectId, materialId: material.id, movementType: "RECEIPT", quantity: "200", unit: "BAG" },
      actor,
    );
    expect(await eventCount("MATERIAL_RECEIVED", since)).toBeGreaterThanOrEqual(1);
  });

  it("NCR create/close emit NCR_CREATED and NCR_CLOSED", async () => {
    const since = Date.now() - 2000;
    const ncr = await createNcr({ tenantId, projectId, code: `${RUN}NCR`, description: "Honeycomb in column", severity: "HIGH" }, actor);
    expect(ncr.status).toBe("OPEN");
    const closed = await closeNcr({ tenantId, ncrId: ncr.id, correctiveAction: "Repaired with grout" }, actor);
    expect(closed.status).toBe("CLOSED");
    expect(await eventCount("NCR_CREATED", since)).toBeGreaterThanOrEqual(1);
    expect(await eventCount("NCR_CLOSED", since)).toBeGreaterThanOrEqual(1);
  });

  it("HSE incident recording emits HSE_INCIDENT_RECORDED", async () => {
    const since = Date.now() - 2000;
    await recordHseIncident({ tenantId, projectId, incidentType: "NEAR_MISS", severity: "MEDIUM", description: "Dropped tool from scaffold" }, actor);
    expect(await eventCount("HSE_INCIDENT_RECORDED", since)).toBeGreaterThanOrEqual(1);
  });

  it("variation request/decision and claim submission emit their events", async () => {
    const since = Date.now() - 2000;
    const variation = await requestVariation(
      { tenantId, projectId, code: `${RUN}V`, title: "Additional floor", costImpact: "120000", scheduleImpactDays: 21 },
      actor,
    );
    const decided = await decideVariation({ tenantId, variationId: variation.id, decision: "APPROVED" }, actor);
    expect(decided.status).toBe("APPROVED");
    await submitClaim({ tenantId, projectId, code: `${RUN}C`, title: "Extension of time", amount: "80000" }, actor);
    expect(await eventCount("VARIATION_REQUESTED", since)).toBeGreaterThanOrEqual(1);
    expect(await eventCount("VARIATION_APPROVED", since)).toBeGreaterThanOrEqual(1);
    expect(await eventCount("CLAIM_SUBMITTED", since)).toBeGreaterThanOrEqual(1);
  });

  it("payment certification emits PAYMENT_CERTIFIED, never posts, CAP_POSTING stays LOCKED", async () => {
    const journalsBefore = await journalCount();
    const since = Date.now() - 2000;
    const certificate = await certifyPaymentCertificate(
      { tenantId, projectId, code: `${RUN}PC`, certificateNo: 1, grossValue: "300000", retention: "15000" },
      actor,
    );
    expect(certificate.status).toBe("CERTIFIED");
    expect(certificate.netValue).toBe("285000.00");
    expect(certificate.journalsPosted).toBe(false);
    expect(certificate.capPosting).toBe("LOCKED");
    expect(certificate.financeHandoff).toBe("CERTIFIED_PENDING_FINANCE_INTEGRATION");
    expect(await journalCount()).toBe(journalsBefore);
    expect(await eventCount("PAYMENT_CERTIFIED", since)).toBeGreaterThanOrEqual(1);
  });

  it("handover is blocked while punch items are open, then completes with PROJECT_HANDED_OVER", async () => {
    const since = Date.now() - 2000;
    const punch = await createPunchItem({ tenantId, projectId, code: `${RUN}PU`, description: "Repaint lobby wall" }, actor);
    await expect(handoverProject({ tenantId, projectId }, actor)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await closePunchItem({ tenantId, punchItemId: punch.id }, actor);
    const handedOver = await handoverProject({ tenantId, projectId }, actor);
    expect(handedOver.status).toBe("HANDED_OVER");
    expect(await eventCount("PROJECT_HANDED_OVER", since)).toBeGreaterThanOrEqual(1);
    await expect(handoverProject({ tenantId, projectId }, actor)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("dashboard declares the finance boundary and derives counts from real rows", async () => {
    const dash = await ujenziDashboard(tenantId);
    expect(dash.financeBoundary).toEqual({
      journals: "FINANCE_OS_ONLY",
      capPosting: "LOCKED",
      paymentCertificateEvent: "PAYMENT_CERTIFIED",
    });
    expect(dash.projects).toBeGreaterThanOrEqual(1);
    expect(Number(dash.cost.COMMITTED)).toBeGreaterThanOrEqual(50000);
    expect(Number(dash.cost.BUDGET)).toBeGreaterThanOrEqual(900000);
  });
});

describe("Ujenzi OS — Noelia observe", () => {
  it("ujenzi.operations.observe is allowed for CEO and denied for HCM", async () => {
    const registry = createDefaultNoeliaToolRegistry();
    const ceo = await seededPrincipal("ceo@beyu.os");
    const allowed = await withTenantDatabaseContext(ceo, async () => {
      const scope = await resolveNoeliaAuthorizedScope(ceo);
      const target = requestedNoeliaTarget(ceo, null);
      return registry.invoke(
        "ujenzi.operations.observe",
        { principal: ceo, traceId: `TRACEUJZ${Date.now()}`, target, scope },
        {},
      );
    });
    expect(allowed.allowed).toBe(true);
    if (!allowed.allowed) throw new Error("observe must be allowed");
    expect(allowed.output.headline).toMatch(/Ujenzi OS observation/i);
    expect(allowed.output.findings?.some((f) => f.label === "Finance boundary")).toBe(true);
    expect((allowed.output.metadata as { financeBoundary?: { journals?: string } }).financeBoundary?.journals).toBe(
      "FINANCE_OS_ONLY",
    );

    const hcm = await seededPrincipal("hcm@beyu.os");
    const denied = await withTenantDatabaseContext(hcm, async () => {
      const scope = await resolveNoeliaAuthorizedScope(hcm);
      const target = requestedNoeliaTarget(hcm, null);
      return registry.invoke(
        "ujenzi.operations.observe",
        { principal: hcm, traceId: `TRACEUJZ${Date.now()}`, target, scope },
        {},
      );
    });
    expect(denied.allowed).toBe(false);
  });
});

describe("Ujenzi OS — interoperability", () => {
  it("DOM-UJENZI is PARTIAL with PROJECT_CREATED and PAYMENT_CERTIFIED", () => {
    const ujenzi = domainByCode("UJENZI");
    expect(ujenzi?.domainId).toBe("DOM-UJENZI");
    expect(ujenzi?.status).toBe("PARTIAL");
    expect(ujenzi?.eventContract).toContain("PROJECT_CREATED");
    expect(ujenzi?.eventContract).toContain("PAYMENT_CERTIFIED");
    expect(ujenzi?.systemOfRecord).toMatch(/ujenzi_projects/);
    expect(DOMAIN_REGISTRY.some((d) => d.domainId === "DOM-UJENZI")).toBe(true);
  });

  it("UJENZI → FINANCE is EVENT; no sector-side journal", () => {
    const edge = connectivityGraph().find((e) => e.source === "UJENZI" && e.destination === "FINANCE");
    expect(edge).toBeDefined();
    expect(edge?.interaction).toBe("EVENT");
    expect(edge?.contract).toMatch(/PAYMENT_CERTIFIED/);
    expect(edge?.authority).toMatch(/CAP_POSTING remains LOCKED/);
  });

  it("seed source registers UJENZI_OS as ACTIVE with the construction authority scope", () => {
    const seed = readFileSync("src/db/seed.ts", "utf8");
    expect(seed).toMatch(/code: "UJENZI_OS"[\s\S]{0,2500}lifecycle: "ACTIVE"/);
    expect(seed).toMatch(/code: "BEYU-UJENZI"/);
    expect(seed).toMatch(/sectorCode: "CONSTRUCTION"/);
  });

  it("UjenziDomainError never carries authority semantics", () => {
    const err = new UjenziDomainError("NOT_FOUND", "x");
    expect(err.name).toBe("UjenziDomainError");
    expect(["NOT_FOUND", "CONFLICT", "INVALID_STATE", "FINANCE_BOUNDARY", "SCOPE"]).toContain(err.code);
  });
});
