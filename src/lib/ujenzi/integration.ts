import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";
import { recordNcr } from "./ops";

function id() {
  return newId(ID_PREFIX.ujenzi);
}

export async function workPackageProgress(tenantId: string, workPackageId: string) {
  const [wp] = await db
    .select()
    .from(s.ujenziWorkPackages)
    .where(and(eq(s.ujenziWorkPackages.id, workPackageId), eq(s.ujenziWorkPackages.tenantId, tenantId)));
  if (!wp) throw new UjenziDomainError("NOT_FOUND", "Work package not found");
  const planned = Number(wp.plannedQty ?? NaN);
  const actual = Number(wp.actualQty ?? NaN);
  if (!Number.isFinite(planned) || planned <= 0) {
    return {
      id: wp.id,
      percentComplete: null as number | null,
      variance: null as number | null,
      earnedValue: "PARTIAL" as const,
      reason: "DATA_REQUIRED:planned_qty",
      journalsPosted: false as const,
    };
  }
  if (!Number.isFinite(actual) || actual < 0) {
    return {
      id: wp.id,
      percentComplete: null as number | null,
      variance: null as number | null,
      earnedValue: "PARTIAL" as const,
      reason: "DATA_REQUIRED:actual_qty",
      journalsPosted: false as const,
    };
  }
  return {
    id: wp.id,
    unit: wp.unit,
    plannedQty: planned,
    actualQty: actual,
    percentComplete: actual / planned,
    variance: actual - planned,
    earnedValue: "PARTIAL" as const,
    journalsPosted: false as const,
  };
}

export async function assertCompatibleUnit(expected: string | null | undefined, actual: string) {
  if (expected && expected !== actual) {
    throw new UjenziDomainError("INVALID_STATE", `Unit mismatch: expected ${expected}, got ${actual}`);
  }
}

export async function detectWorkPackageCycles(tenantId: string, projectId: string) {
  const pkgs = await db
    .select()
    .from(s.ujenziWorkPackages)
    .where(and(eq(s.ujenziWorkPackages.tenantId, tenantId), eq(s.ujenziWorkPackages.projectId, projectId)));
  const deps = await db.select().from(s.ujenziWorkPackageDeps).where(eq(s.ujenziWorkPackageDeps.tenantId, tenantId));
  const ids = new Set(pkgs.map((p) => p.id));
  const adj = new Map<string, string[]>();
  for (const d of deps) {
    if (!ids.has(d.predecessorId) || !ids.has(d.successorId)) continue;
    adj.set(d.predecessorId, [...(adj.get(d.predecessorId) ?? []), d.successorId]);
  }
  const vis = new Map<string, number>();
  let cyclic = false;
  function dfs(n: string) {
    vis.set(n, 1);
    for (const m of adj.get(n) ?? []) {
      const st = vis.get(m) ?? 0;
      if (st === 1) cyclic = true;
      else if (st === 0) dfs(m);
    }
    vis.set(n, 2);
  }
  for (const p of pkgs) if ((vis.get(p.id) ?? 0) === 0) dfs(p.id);
  return { cyclic, packageCount: pkgs.length };
}

export async function recordItpResultWithNcr(input: {
  tenantId: string;
  itpId: string;
  outcome: "PASS" | "FAIL";
  measuredValue?: string;
}) {
  const [itp] = await db
    .select()
    .from(s.ujenziItps)
    .where(and(eq(s.ujenziItps.id, input.itpId), eq(s.ujenziItps.tenantId, input.tenantId)));
  if (!itp) throw new UjenziDomainError("NOT_FOUND", "ITP not found");
  const resultId = id();
  await db.insert(s.ujenziItpResults).values({
    id: resultId,
    tenantId: input.tenantId,
    itpId: input.itpId,
    outcome: input.outcome,
    measuredValue: input.measuredValue,
    professionalCertification: "NOT_CERTIFIED",
  });
  let ncrId: string | null = null;
  if (input.outcome === "FAIL") {
    const ncr = await recordNcr({
      tenantId: input.tenantId,
      projectId: itp.projectId,
      code: `NCR-${itp.code}-${Date.now()}`,
      title: `ITP fail ${itp.code}`,
    });
    ncrId = ncr.id;
  }
  return {
    id: resultId,
    ncrId,
    professionalCertification: "NOT_CERTIFIED" as const,
    certified: false as const,
  };
}

export async function evaluateHandoverReadiness(tenantId: string, projectId: string) {
  const ncrs = await db
    .select()
    .from(s.ujenziQualityNcrs)
    .where(and(eq(s.ujenziQualityNcrs.tenantId, tenantId), eq(s.ujenziQualityNcrs.projectId, projectId)));
  const tests = await db
    .select()
    .from(s.ujenziCommissioningTests)
    .where(and(eq(s.ujenziCommissioningTests.tenantId, tenantId), eq(s.ujenziCommissioningTests.projectId, projectId)));
  const openNcrs = ncrs.filter((n) => n.status !== "CLOSED").length;
  const uncertified = tests.filter((t) => t.professionalCertification !== "CERTIFIED").length;
  const incomplete = tests.filter((t) => t.workflowState !== "APPROVED" && t.workflowState !== "HANDED_OVER").length;
  const blocked = openNcrs > 0 || uncertified > 0 || incomplete > 0 || tests.length === 0;
  return {
    blocked,
    openNcrs,
    uncertifiedCommissioning: uncertified,
    incompleteCommissioning: incomplete,
    testCount: tests.length,
    reason: blocked ? "HANDOVER_BLOCKED" : "READY_FOR_HUMAN_HANDOVER",
    professionalCertificationInferred: false as const,
  };
}

export async function createAssetFromApprovedCommissioning(input: {
  tenantId: string;
  testId: string;
  code: string;
  name: string;
}) {
  const [test] = await db
    .select()
    .from(s.ujenziCommissioningTests)
    .where(and(eq(s.ujenziCommissioningTests.id, input.testId), eq(s.ujenziCommissioningTests.tenantId, input.tenantId)));
  if (!test) throw new UjenziDomainError("NOT_FOUND", "Commissioning test not found");
  if (test.workflowState !== "APPROVED") {
    throw new UjenziDomainError("INVALID_STATE", "Asset creation requires APPROVED commissioning, not status text alone");
  }
  const assetId = id();
  await db.insert(s.ujenziAssets).values({
    id: assetId,
    tenantId: input.tenantId,
    projectId: test.projectId,
    code: input.code,
    name: input.name,
    lifecycleState: "COMMISSIONED",
  });
  await db.insert(s.ujenziTwinEdges).values({
    id: id(),
    tenantId: input.tenantId,
    projectId: test.projectId,
    fromKind: "COMMISSIONING",
    fromId: test.id,
    toKind: "ASSET",
    toId: assetId,
    relation: "PRODUCES",
  });
  return {
    id: assetId,
    professionalCertification: test.professionalCertification,
    journalsPosted: false as const,
  };
}

export async function attachBoqToWorkPackage(input: {
  tenantId: string;
  boqItemId: string;
  workPackageId: string;
}) {
  const [boq] = await db
    .select()
    .from(s.ujenziBoqItems)
    .where(and(eq(s.ujenziBoqItems.id, input.boqItemId), eq(s.ujenziBoqItems.tenantId, input.tenantId)));
  const [wp] = await db
    .select()
    .from(s.ujenziWorkPackages)
    .where(and(eq(s.ujenziWorkPackages.id, input.workPackageId), eq(s.ujenziWorkPackages.tenantId, input.tenantId)));
  if (!boq || !wp) throw new UjenziDomainError("NOT_FOUND", "BOQ or work package not found");
  if (wp.unit && boq.unit !== wp.unit) {
    throw new UjenziDomainError("INVALID_STATE", "BOQ unit does not match work package unit");
  }
  await db.update(s.ujenziBoqItems).set({ workPackage: wp.code }).where(eq(s.ujenziBoqItems.id, boq.id));
  return { id: boq.id, workPackage: wp.code, journalsPosted: false as const };
}
