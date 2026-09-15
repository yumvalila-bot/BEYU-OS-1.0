import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities } from "@/db/schema";
import {
  advanceCommissioning,
  certifyCalculation,
  createProject,
  detectBimFormat,
  recordBoqItem,
  recordCommissioningTest,
  recordEngineeringCalculation,
  recordHazard,
  recordHseIncident,
  recordProfessional,
  registerBimArtifact,
  runManningFlow,
  runTerzaghiBearing,
  UjenziDomainError,
  verifyBimChecksum,
} from "@/lib/ujenzi";
import { seededPrincipal } from "../noelia/db-fixtures";

describe("BIM artifact integrity", () => {
  it("detects IFC STEP header and does not parse geometry", () => {
    const bytes = Buffer.from("ISO-10303-21;\nHEADER;\nFILE_NAME('demo.ifc','2026-01-01T00:00:00');\nENDSEC;");
    const d = detectBimFormat(bytes);
    expect(d.format).toBe("IFC_STEP");
    expect(d.supported).toBe(true);
    expect(d.headerHint).toBe("demo.ifc");
  });

  it("registers checksum, detects duplicates, verifies bytes", async () => {
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const code = `BIM${Date.now()}`;
    const project = await createProject({
      tenantId: ops.tenantId,
      legalEntityId: entity.id,
      code,
      name: "BIM",
      countryCode: "TZ",
    });
    const bytes = Buffer.from(`ISO-10303-21;\nHEADER;\nFILE_NAME('a.ifc','${code}');\nENDSEC;`);
    const first = await registerBimArtifact({ tenantId: ops.tenantId, projectId: project.id, code: `${code}M`, bytes });
    expect(first.duplicate).toBe(false);
    expect(first.geometryParsed).toBe(false);
    expect(first.viewer).toBe("NOT_IMPLEMENTED");
    expect(first.checksum).toBe(createHash("sha256").update(bytes).digest("hex"));
    const second = await registerBimArtifact({ tenantId: ops.tenantId, projectId: project.id, code: `${code}M2`, bytes });
    expect(second.duplicate).toBe(true);
    const v = await verifyBimChecksum(ops.tenantId, first.id, bytes);
    expect(v.match).toBe(true);
    const junk = await registerBimArtifact({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}J`,
      bytes: Buffer.from(`not-a-model-${code}`),
    });
    expect(junk.format).toBe("UNSUPPORTED");
    expect(junk.supported).toBe(false);
  });
});

describe("BOQ provenance and HSE / commissioning", () => {
  it("refuses BOQ without source; never posts journals; HSE uncertified; handover blocked", async () => {
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const code = `BH${Date.now()}`;
    const project = await createProject({
      tenantId: ops.tenantId,
      legalEntityId: entity.id,
      code,
      name: "BOQ",
      countryCode: "TZ",
    });
    await expect(
      recordBoqItem({
        tenantId: ops.tenantId,
        projectId: project.id,
        itemCode: "A",
        description: "conc",
        unit: "m3",
        quantity: "10",
        sourceKind: "BIM_OBJECT",
      }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    const boq = await recordBoqItem({
      tenantId: ops.tenantId,
      projectId: project.id,
      itemCode: "A1",
      description: "conc",
      unit: "m3",
      quantity: "10",
      sourceKind: "MANUAL",
      rate: "100",
    });
    expect(boq.journalsPosted).toBe(false);
    expect(boq.capPosting).toBe("LOCKED");
    const hse = await recordHseIncident({ tenantId: ops.tenantId, projectId: project.id, code: `${code}H`, title: "slip" });
    expect(hse.certified).toBe(false);
    await recordHazard({ tenantId: ops.tenantId, projectId: project.id, code: `${code}Z`, title: "edge" });
    const comm = await recordCommissioningTest({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}C`,
      systemName: "HVAC",
    });
    expect(comm.professionalCertification).toBe("NOT_CERTIFIED");
    await expect(advanceCommissioning({ tenantId: ops.tenantId, testId: comm.id, to: "HANDED_OVER" })).rejects.toBeInstanceOf(
      UjenziDomainError,
    );
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
    const pro = await recordProfessional({ tenantId: ops.tenantId, displayName: "Eng", discipline: "STRUCTURAL" });
    await expect(
      certifyCalculation({ tenantId: ops.tenantId, calculationId: calc.id, professionalId: pro.id, actorUserId: ops.userId }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
  });
});

describe("additional calculation families", () => {
  it("Manning and Terzaghi stay NOT_CERTIFIED", () => {
    const m = runManningFlow({ n: 0.013, A: 1, R: 0.5, S: 0.001 });
    expect(m.result.Q_m3s).toBeGreaterThan(0);
    expect(m.professionalCertification).toBe("NOT_CERTIFIED");
    const t = runTerzaghiBearing({ c: 10, q: 20, gamma: 18, B: 2, Nc: 5.7, Nq: 1, Ngamma: 0 });
    expect(t.result.q_ult_kPa).toBeCloseTo(77, 5);
    expect(t.professionalCertification).toBe("NOT_CERTIFIED");
  });
});
