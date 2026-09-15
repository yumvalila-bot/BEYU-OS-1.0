import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { UjenziDomainError } from "./errors";

function id() {
  return newId(ID_PREFIX.ujenzi);
}

async function requireProject(projectId: string, tenantId: string) {
  const [p] = await db
    .select({ id: s.ujenziProjects.id })
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, projectId), eq(s.ujenziProjects.tenantId, tenantId)));
  if (!p) throw new UjenziDomainError("NOT_FOUND", "Project not found");
}

const EDGE_KINDS = new Set([
  "SITE",
  "BUILDING",
  "LEVEL",
  "SPACE",
  "ELEMENT",
  "SYSTEM",
  "ASSET",
  "BIM_ARTIFACT",
  "GIS_DATASET",
  "CALCULATION",
  "BOQ_ITEM",
  "SCHEDULE",
  "DEFECT",
  "NCR",
]);

export async function linkTwinEdge(input: {
  tenantId: string;
  projectId: string;
  fromKind: string;
  fromId: string;
  toKind: string;
  toId: string;
  relation: string;
  provenance: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  if (!EDGE_KINDS.has(input.fromKind) || !EDGE_KINDS.has(input.toKind)) {
    throw new UjenziDomainError("INVALID_STATE", "Unknown twin kind");
  }
  if (!input.provenance.trim()) {
    throw new UjenziDomainError("DATA_REQUIRED", "Twin edges require explicit provenance; name similarity is refused");
  }
  if (input.fromKind === input.toKind && input.fromId === input.toId) {
    throw new UjenziDomainError("INVALID_STATE", "Self-edge refused");
  }
  const rowId = id();
  await db.insert(s.ujenziTwinEdges).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    fromKind: input.fromKind,
    fromId: input.fromId,
    toKind: input.toKind,
    toId: input.toId,
    relation: input.relation,
  });
  return { id: rowId, provenance: input.provenance };
}

export async function recordNcr(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  twinObjectKind?: string;
  twinObjectId?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziQualityNcrs).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    twinObjectKind: input.twinObjectKind,
    twinObjectId: input.twinObjectId,
    status: "OPEN",
  });
  return { id: rowId, status: "OPEN" as const };
}

export async function recordWorkOrder(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  assetId?: string;
  workKind?: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziWorkOrders).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    assetId: input.assetId,
    code: input.code,
    title: input.title,
    workKind: input.workKind ?? "CORRECTIVE",
    journalsPosted: false,
  });
  return { id: rowId, journalsPosted: false as const, capPosting: "LOCKED" as const };
}

export async function registerRealityCapture(input: {
  tenantId: string;
  projectId: string;
  code: string;
  captureKind: string;
  bytes: Buffer;
}) {
  await requireProject(input.projectId, input.tenantId);
  if (!input.bytes.length) throw new UjenziDomainError("INVALID_STATE", "Empty capture");
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const rowId = id();
  await db.insert(s.ujenziRealityCaptures).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    captureKind: input.captureKind,
    checksum,
    byteSize: input.bytes.length,
    computerVision: "NOT_IMPLEMENTED",
  });
  return {
    id: rowId,
    checksum,
    computerVision: "NOT_IMPLEMENTED" as const,
    bimVsReality: "BLOCKED" as const,
  };
}

export async function linkKnowledge(input: {
  tenantId: string;
  knowledgeId: string;
  relatedKind: string;
  relatedId: string;
  relation: string;
}) {
  const [k] = await db
    .select()
    .from(s.ujenziKnowledge)
    .where(and(eq(s.ujenziKnowledge.id, input.knowledgeId), eq(s.ujenziKnowledge.tenantId, input.tenantId)));
  if (!k) throw new UjenziDomainError("NOT_FOUND", "Knowledge not found");
  const rowId = id();
  await db.insert(s.ujenziKnowledgeEdges).values({
    id: rowId,
    tenantId: input.tenantId,
    knowledgeId: input.knowledgeId,
    relatedKind: input.relatedKind,
    relatedId: input.relatedId,
    relation: input.relation,
  });
  return { id: rowId, authorityGranted: false as const };
}

export async function createRfq(input: { tenantId: string; projectId: string; code: string; title: string }) {
  await requireProject(input.projectId, input.tenantId);
  const rowId = id();
  await db.insert(s.ujenziRfqs).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    awardStatus: "NOT_AWARDED",
    journalsPosted: false,
  });
  return { id: rowId, awardStatus: "NOT_AWARDED" as const, journalsPosted: false as const };
}

export async function recordQuotation(input: {
  tenantId: string;
  rfqId: string;
  supplierName: string;
  amount: string;
}) {
  const [rfq] = await db
    .select()
    .from(s.ujenziRfqs)
    .where(and(eq(s.ujenziRfqs.id, input.rfqId), eq(s.ujenziRfqs.tenantId, input.tenantId)));
  if (!rfq) throw new UjenziDomainError("NOT_FOUND", "RFQ not found");
  const rowId = id();
  await db.insert(s.ujenziQuotations).values({
    id: rowId,
    tenantId: input.tenantId,
    rfqId: input.rfqId,
    supplierName: input.supplierName,
    amount: input.amount,
  });
  return { id: rowId, awardStatus: rfq.awardStatus, journalsPosted: false as const };
}

export async function refuseAutonomousAward(rfqId: string, tenantId: string) {
  const [rfq] = await db
    .select()
    .from(s.ujenziRfqs)
    .where(and(eq(s.ujenziRfqs.id, rfqId), eq(s.ujenziRfqs.tenantId, tenantId)));
  if (!rfq) throw new UjenziDomainError("NOT_FOUND", "RFQ not found");
  throw new UjenziDomainError("FINANCE_BOUNDARY", "Autonomous award and journal posting are refused; CAP_POSTING LOCKED");
}

export async function recordDesignAlternative(input: {
  tenantId: string;
  projectId: string;
  code: string;
  title: string;
  scores: Record<string, number>;
  weights?: Record<string, number>;
}) {
  await requireProject(input.projectId, input.tenantId);
  const keys = Object.keys(input.scores);
  if (!keys.length) throw new UjenziDomainError("DATA_REQUIRED", "Design ranking requires user-supplied scores");
  for (const k of keys) {
    if (!Number.isFinite(input.scores[k])) throw new UjenziDomainError("INVALID_STATE", `Invalid score ${k}`);
  }
  const weights = input.weights ?? Object.fromEntries(keys.map((k) => [k, 1 / keys.length]));
  let sum = 0;
  for (const k of keys) {
    const w = weights[k];
    if (w == null || !Number.isFinite(w)) throw new UjenziDomainError("DATA_REQUIRED", `Missing weight for ${k}`);
    sum += input.scores[k] * w;
  }
  const rowId = id();
  await db.insert(s.ujenziDesignAlternatives).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    title: input.title,
    scores: input.scores,
    weightedScore: String(sum),
    approvalState: "UNAPPROVED",
  });
  return { id: rowId, weightedScore: sum, approvalState: "UNAPPROVED" as const, humanApprovalRequired: true as const };
}

export async function recordComplianceRequirement(input: {
  tenantId: string;
  code: string;
  jurisdiction: string;
  authority: string;
  source: string;
  regulation: string;
}) {
  if (!input.source.trim() || !input.authority.trim()) {
    throw new UjenziDomainError("DATA_REQUIRED", "Compliance rules require cited authority and source; laws are not fabricated");
  }
  const rowId = id();
  await db.insert(s.ujenziComplianceRequirements).values({
    id: rowId,
    tenantId: input.tenantId,
    code: input.code,
    jurisdiction: input.jurisdiction,
    authority: input.authority,
    source: input.source,
    regulation: input.regulation,
  });
  return { id: rowId, fabricatedLaw: false as const };
}

export async function evaluateCompliance(input: {
  tenantId: string;
  projectId: string;
  requirementId: string;
  result: string;
}) {
  await requireProject(input.projectId, input.tenantId);
  const [req] = await db
    .select()
    .from(s.ujenziComplianceRequirements)
    .where(and(eq(s.ujenziComplianceRequirements.id, input.requirementId), eq(s.ujenziComplianceRequirements.tenantId, input.tenantId)));
  if (!req) throw new UjenziDomainError("NOT_FOUND", "Requirement not found");
  const rowId = id();
  await db.insert(s.ujenziComplianceEvaluations).values({
    id: rowId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    requirementId: input.requirementId,
    result: input.result,
    officialStatus: "NOT_CONNECTED",
  });
  return { id: rowId, officialStatus: "NOT_CONNECTED" as const, government: "NOT_CONNECTED" as const };
}

export function refuseGisProtocol(protocol: string) {
  const p = protocol.toUpperCase();
  if (p === "WMS" || p === "WFS" || p === "GEOTIFF" || p === "GEOPACKAGE") {
    throw new UjenziDomainError("INVALID_STATE", `${p} adapter is NOT_IMPLEMENTED`);
  }
}
