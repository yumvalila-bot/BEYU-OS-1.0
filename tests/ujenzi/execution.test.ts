import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities } from "@/db/schema";
import {
  acceptSyncEnvelope,
  addWorkPackageDependency,
  closeNcr,
  createProject,
  createWorkPackage,
  recordItp,
  recordItpResult,
  recordMaterialMovement,
  recordNcr,
  recordScheduleActivity,
  recordSiteReport,
  recordSubmittal,
  recordSustainabilityMetric,
  recordWorkPackageProgress,
  runHvacAirChange,
  UjenziDomainError,
} from "@/lib/ujenzi";
import { seededPrincipal } from "../noelia/db-fixtures";

describe("construction execution", () => {
  it("work packages, ITP, materials, site diary, NCR close, sync conflict, HVAC helper", async () => {
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const code = `EX${Date.now()}`;
    const project = await createProject({
      tenantId: ops.tenantId,
      legalEntityId: entity.id,
      code,
      name: "Exec",
      countryCode: "TZ",
    });
    const act = await recordScheduleActivity({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}A`,
      name: "foundations",
      durationDays: 10,
    });
    const wp = await createWorkPackage({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}W`,
      title: "excavate",
      scheduleActivityId: act.id,
      plannedQty: "100",
      unit: "m3",
    });
    const wp2 = await createWorkPackage({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}W2`,
      title: "pour",
    });
    await addWorkPackageDependency({ tenantId: ops.tenantId, predecessorId: wp.id, successorId: wp2.id });
    await expect(
      addWorkPackageDependency({ tenantId: ops.tenantId, predecessorId: wp.id, successorId: wp.id }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    const prog = await recordWorkPackageProgress({ tenantId: ops.tenantId, workPackageId: wp.id, actualQty: "40" });
    expect(prog.journalsPosted).toBe(false);
    await recordSiteReport({
      tenantId: ops.tenantId,
      projectId: project.id,
      reportDate: "2026-09-15",
      body: "excavation started",
    });
    await recordSubmittal({ tenantId: ops.tenantId, projectId: project.id, code: `${code}S`, title: "mix design" });
    const itp = await recordItp({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}I`,
      title: "cube",
      acceptanceCriteria: "25 MPa",
    });
    const res = await recordItpResult({ tenantId: ops.tenantId, itpId: itp.id, outcome: "PASS", measuredValue: "28" });
    expect(res.professionalCertification).toBe("NOT_CERTIFIED");
    await recordMaterialMovement({
      tenantId: ops.tenantId,
      projectId: project.id,
      movementKind: "DELIVERY",
      materialCode: "CEM",
      quantity: "5",
      unit: "t",
      workPackageId: wp.id,
    });
    const ncr = await recordNcr({ tenantId: ops.tenantId, projectId: project.id, code: `${code}N`, title: "void" });
    const closed = await closeNcr({ tenantId: ops.tenantId, ncrId: ncr.id });
    expect(closed.status).toBe("CLOSED");
    expect(closed.certified).toBe(false);
    await expect(
      recordSustainabilityMetric({
        tenantId: ops.tenantId,
        projectId: project.id,
        metricKind: "EMBODIED_CARBON",
        value: "1",
        unit: "tCO2e",
        methodology: "",
        source: "x",
      }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    const sus = await recordSustainabilityMetric({
      tenantId: ops.tenantId,
      projectId: project.id,
      metricKind: "EMBODIED_CARBON",
      value: "12.5",
      unit: "tCO2e",
      methodology: "user-factor-v1",
      source: "supplier-EPD",
    });
    expect(sus.fabricated).toBe(false);
    const env = `${code}E`;
    const first = await acceptSyncEnvelope({
      tenantId: ops.tenantId,
      envelopeId: env,
      operation: "SITE_DIARY",
      payload: { n: 1 },
      clientOccurredAt: new Date().toISOString(),
      clientSequence: 1,
    });
    expect(first.replay).toBe(false);
    await expect(
      acceptSyncEnvelope({
        tenantId: ops.tenantId,
        envelopeId: env,
        operation: "SITE_DIARY",
        payload: { n: 2 },
        clientOccurredAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "SYNC_CONFLICT" });
    const h = runHvacAirChange({ ACH: 6, V: 3600 });
    expect(h.result.Q_m3s).toBe(6);
    expect(h.professionalCertification).toBe("NOT_CERTIFIED");
  });
});
