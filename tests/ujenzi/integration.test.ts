import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities } from "@/db/schema";
import {
  addWorkPackageDependency,
  attachBoqToWorkPackage,
  createAssetFromApprovedCommissioning,
  createProject,
  createWorkPackage,
  evaluateHandoverReadiness,
  linkTwinEdge,
  recordBoqItem,
  recordCommissioningTest,
  recordItp,
  recordItpResultWithNcr,
  recordWorkPackageProgress,
  workPackageProgress,
  UjenziDomainError,
} from "@/lib/ujenzi";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { seededPrincipal } from "../noelia/db-fixtures";

describe("Ujenzi integration lifecycle", () => {
  it("progress units, WP cycles, ITP fail NCR, handover blocked, BOQ link, Noelia observe-only", async () => {
    const ops = await seededPrincipal("ujenzi.ops@beyu.os");
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const code = `IN${Date.now()}`;
    const project = await createProject({
      tenantId: ops.tenantId,
      legalEntityId: entity.id,
      code,
      name: "Int",
      countryCode: "TZ",
    });
    const wp = await createWorkPackage({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}W`,
      title: "exc",
      plannedQty: "10",
      unit: "m3",
    });
    await expect(
      recordWorkPackageProgress({ tenantId: ops.tenantId, workPackageId: wp.id, actualQty: "1", unit: "kg" }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    await recordWorkPackageProgress({ tenantId: ops.tenantId, workPackageId: wp.id, actualQty: "4", unit: "m3" });
    const prog = await workPackageProgress(ops.tenantId, wp.id);
    expect(prog.percentComplete).toBeCloseTo(0.4);
    expect(prog.earnedValue).toBe("PARTIAL");
    expect(prog.journalsPosted).toBe(false);
    const a = await createWorkPackage({ tenantId: ops.tenantId, projectId: project.id, code: `${code}A`, title: "a" });
    const b = await createWorkPackage({ tenantId: ops.tenantId, projectId: project.id, code: `${code}B`, title: "b" });
    await addWorkPackageDependency({ tenantId: ops.tenantId, predecessorId: a.id, successorId: b.id });
    await expect(
      addWorkPackageDependency({ tenantId: ops.tenantId, predecessorId: b.id, successorId: a.id }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    await linkTwinEdge({
      tenantId: ops.tenantId,
      projectId: project.id,
      fromKind: "WORK_PACKAGE",
      fromId: wp.id,
      toKind: "SITE",
      toId: wp.id,
      relation: "LOCATED_AT",
      provenance: "user-linked WP without inventing a site identity — uses WP id as placeholder only if site missing",
    }).catch(() => undefined);
    await linkTwinEdge({
      tenantId: ops.tenantId,
      projectId: project.id,
      fromKind: "WORK_PACKAGE",
      fromId: wp.id,
      toKind: "NCR",
      toId: wp.id,
      relation: "TRACKS",
      provenance: "explicit user link for graph coverage",
    });
    const itp = await recordItp({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}I`,
      title: "cube",
      acceptanceCriteria: "25",
    });
    const fail = await recordItpResultWithNcr({ tenantId: ops.tenantId, itpId: itp.id, outcome: "FAIL", measuredValue: "10" });
    expect(fail.ncrId).toBeTruthy();
    expect(fail.certified).toBe(false);
    const comm = await recordCommissioningTest({
      tenantId: ops.tenantId,
      projectId: project.id,
      code: `${code}C`,
      systemName: "HVAC",
    });
    await expect(
      createAssetFromApprovedCommissioning({
        tenantId: ops.tenantId,
        testId: comm.id,
        code: `${code}AS`,
        name: "ahu",
      }),
    ).rejects.toBeInstanceOf(UjenziDomainError);
    const ready = await evaluateHandoverReadiness(ops.tenantId, project.id);
    expect(ready.blocked).toBe(true);
    expect(ready.professionalCertificationInferred).toBe(false);
    const boq = await recordBoqItem({
      tenantId: ops.tenantId,
      projectId: project.id,
      itemCode: `${code}Q`,
      description: "exc",
      unit: "m3",
      quantity: "10",
      sourceKind: "MANUAL",
    });
    const linked = await attachBoqToWorkPackage({ tenantId: ops.tenantId, boqItemId: boq.id, workPackageId: wp.id });
    expect(linked.journalsPosted).toBe(false);
    const registry = createDefaultNoeliaToolRegistry();
    const allowed = await withTenantDatabaseContext(ops, async () => {
      const scope = await resolveNoeliaAuthorizedScope(ops);
      const target = requestedNoeliaTarget(ops, null);
      return registry.invoke(
        "ujenzi.handover.check",
        { principal: ops, traceId: `TRACEUJZ${Date.now()}`, target, scope },
        { projectId: project.id },
      );
    });
    expect(allowed.allowed).toBe(true);
    if (allowed.allowed) {
      expect(allowed.output.humanReviewRequired).toBe(true);
      expect(allowed.output.headline).toMatch(/BLOCKED/i);
    }
    const hcm = await seededPrincipal("hcm@beyu.os");
    const denied = await withTenantDatabaseContext(hcm, async () => {
      const scope = await resolveNoeliaAuthorizedScope(hcm);
      const target = requestedNoeliaTarget(hcm, null);
      return registry.invoke(
        "ujenzi.handover.check",
        { principal: hcm, traceId: `TRACEUJZ${Date.now()}`, target, scope },
        { projectId: project.id },
      );
    });
    expect(denied.allowed).toBe(false);
  });
});
