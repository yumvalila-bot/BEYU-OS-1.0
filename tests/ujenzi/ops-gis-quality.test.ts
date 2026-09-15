import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities } from "@/db/schema";
import {
  attachProfessionalEvidence,
  certifyCalculation,
  createLandSite,
  createProject,
  createRfq,
  detectTwinCycles,
  evaluateCompliance,
  ingestGeoJsonDataset,
  linkTwinEdge,
  recordComplianceRequirement,
  recordDesignAlternative,
  recordEngineeringCalculation,
  recordKnowledge,
  recordNcr,
  recordProfessional,
  recordQuotation,
  recordWorkOrder,
  refuseAutonomousAward,
  refuseGisProtocol,
  registerBuilding,
  registerRealityCapture,
  runDarcyHeadloss,
  runElectricalPower,
  UjenziDomainError,
} from "@/lib/ujenzi";
import { seededPrincipal } from "../noelia/db-fixtures";

describe("ops / GIS / quality / procurement", () => {
  it("stores GeoJSON features, refuses WMS, links twin with provenance, blocks award and certification", async () => {
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const code = `OP${Date.now()}`;
    const project = await createProject({
      tenantId: ops.tenantId,
      legalEntityId: entity.id,
      code,
      name: "Ops",
      countryCode: "TZ",
    });
    expect(() => refuseGisProtocol("WMS")).toThrow(UjenziDomainError);
    const gis = await ingestGeoJsonDataset({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}G`,
      title: "parcel",
      source: "USER_ENTERED",
      crs: "EPSG:4326",
      geojson: {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: [32.9, -2.5] }, properties: { n: 1 } }],
      },
    });
    expect(gis.featureCount).toBe(1);
    expect(gis.renderer).toBe("NOT_IMPLEMENTED");
    const site = await createLandSite({ tenantId: ops.tenantId, projectId: project.id, code: `${code}S`, name: "s", crs: "EPSG:4326" });
    const b = await registerBuilding({ tenantId: ops.tenantId, projectId: project.id, siteId: site.id, code: `${code}B`, name: "b" });
    await expect(
      linkTwinEdge({
        tenantId: ops.tenantId,
        projectId: project.id,
        fromKind: "GIS_DATASET",
        fromId: gis.id,
        toKind: "SITE",
        toId: site.id,
        relation: "DESCRIBES",
        provenance: "",
      }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    await linkTwinEdge({
      tenantId: ops.tenantId,
      projectId: project.id,
      fromKind: "GIS_DATASET",
      fromId: gis.id,
      toKind: "SITE",
      toId: site.id,
      relation: "DESCRIBES",
      provenance: "user-linked dataset to site",
    });
    const cycles = await detectTwinCycles(ops.tenantId, project.id);
    expect(cycles.cyclic).toBe(false);
    const ncr = await recordNcr({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}N`,
      title: "crack",
      twinObjectKind: "BUILDING",
      twinObjectId: b.id,
    });
    expect(ncr.status).toBe("OPEN");
    const wo = await recordWorkOrder({ tenantId: ops.tenantId, projectId: project.id, code: `${code}W`, title: "fix" });
    expect(wo.journalsPosted).toBe(false);
    const rc = await registerRealityCapture({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}R`,
      captureKind: "PHOTO",
      bytes: Buffer.from(`photo-${code}`),
    });
    expect(rc.computerVision).toBe("NOT_IMPLEMENTED");
    expect(rc.bimVsReality).toBe("BLOCKED");
    const rfq = await createRfq({ tenantId: ops.tenantId, projectId: project.id, code: `${code}Q`, title: "cement" });
    expect(rfq.awardStatus).toBe("NOT_AWARDED");
    await recordQuotation({ tenantId: ops.tenantId, rfqId: rfq.id, supplierName: "A", amount: "100" });
    await expect(refuseAutonomousAward(rfq.id, ops.tenantId)).rejects.toMatchObject({ code: "FINANCE_BOUNDARY" });
    const alt = await recordDesignAlternative({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}D`,
      title: "opt",
      scores: { cost: 1, energy: 2 },
      weights: { cost: 0.5, energy: 0.5 },
    });
    expect(alt.weightedScore).toBeCloseTo(1.5);
    expect(alt.approvalState).toBe("UNAPPROVED");
    const req = await recordComplianceRequirement({
      tenantId: ops.tenantId,
      code: `${code}C`,
      jurisdiction: "TZ",
      authority: "USER_CITED",
      source: "internal-policy-v1",
      regulation: "site-setback-user-rule",
    });
    const ev = await evaluateCompliance({
      tenantId: ops.tenantId,
      projectId: project.id,
      requirementId: req.id,
      result: "PASS_USER",
    });
    expect(ev.officialStatus).toBe("NOT_CONNECTED");
    const k = await recordKnowledge({ tenantId: ops.tenantId, projectId: project.id, title: `${code}k` });
    expect(k.authorityGranted).toBe(false);
    const pro = await recordProfessional({ tenantId: ops.tenantId, displayName: "Eng", discipline: "STRUCTURAL" });
    const evid = await attachProfessionalEvidence({
      tenantId: ops.tenantId,
      professionalId: pro.id,
      evidenceUri: "file://board-scan",
      actorUserId: ops.userId,
    });
    expect(evid.verificationStatus).toBe("EVIDENCE_RECORDED");
    expect(evid.government).toBe("NOT_CONNECTED");
    const calc = await recordEngineeringCalculation({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}E`,
      discipline: "STRUCTURAL",
      method: "X",
      formulaOrModel: "x",
      inputs: {},
      result: {},
    });
    await expect(
      certifyCalculation({ tenantId: ops.tenantId, calculationId: calc.id, professionalId: pro.id, actorUserId: ops.userId }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
  });

  it("electrical and Darcy families stay NOT_CERTIFIED", () => {
    const p = runElectricalPower({ V: 230, I: 10 });
    expect(p.result.P_W).toBe(2300);
    expect(p.professionalCertification).toBe("NOT_CERTIFIED");
    const d = runDarcyHeadloss({ f: 0.02, L: 100, D: 0.2, v: 1 });
    expect(d.result.hf_m).toBeGreaterThan(0);
    expect(d.professionalCertification).toBe("NOT_CERTIFIED");
  });
});
