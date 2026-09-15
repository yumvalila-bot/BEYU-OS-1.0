/**
 * BEYU Ujenzi OS — ONE construction-sector operating system.
 *
 * Owns project lifecycle, design, engineering calculations (not certification),
 * land/soil records (never fabricated), BIM, BOQ, cost tracking (not GL),
 * contracts, procurement, labour pool (not HCM master), materials, HSE, QAQC,
 * interior/FF&E, configurable compliance, government application tracking,
 * Vision 2050 scorecards, handover and governed project learning.
 *
 * Finance OS remains the only journal writer. CAP_POSTING stays LOCKED.
 * Noelia remains the only AI identity.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import type { Classification } from "@/lib/constants";
import { UjenziDomainError } from "./errors";

export { UjenziDomainError } from "./errors";

export type UjenziActor = {
  tenantId: string;
  userId: string;
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function ujzId(): string {
  return newId(ID_PREFIX.ujenzi);
}

const UJENZI_SECTOR_CODE = "CONSTRUCTION";

function assertActorTenant(actor: UjenziActor | undefined, tenantId: string) {
  if (actor && actor.tenantId !== tenantId) {
    throw new UjenziDomainError("SCOPE", "Ujenzi actor tenant does not match the record tenant");
  }
}

async function assertUjenziLegalEntity(tenantId: string, legalEntityId: string, countryCode?: string) {
  const [entity] = await db
    .select({
      id: s.legalEntities.id,
      tenantId: s.legalEntities.tenantId,
      sectorCode: s.legalEntities.sectorCode,
      countryCode: s.legalEntities.countryCode,
    })
    .from(s.legalEntities)
    .where(eq(s.legalEntities.id, legalEntityId))
    .limit(1);
  if (!entity) throw new UjenziDomainError("NOT_FOUND", "Legal entity not found");
  if (entity.tenantId !== tenantId) {
    throw new UjenziDomainError("SCOPE", "Legal entity is outside the principal tenant");
  }
  if (entity.sectorCode !== UJENZI_SECTOR_CODE) {
    throw new UjenziDomainError("SCOPE", "Ujenzi OS writes require a construction legal entity");
  }
  if (countryCode && entity.countryCode && countryCode !== entity.countryCode) {
    throw new UjenziDomainError("SCOPE", "Country is outside the legal entity jurisdiction");
  }
}

function auditBase(actor: UjenziActor, action: string, objectType: string, objectId: string, newValue: Record<string, unknown>) {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "HUMAN" as const,
    action,
    objectType,
    objectId,
    outcome: "SUCCESS" as const,
    authority: "ujenzi:data.manage",
    newValue,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    traceId: actor.traceId,
  };
}

export async function createProject(
  input: {
    tenantId: string;
    legalEntityId: string;
    code: string;
    name: string;
    countryCode: string;
    projectType?: string;
    region?: string;
    notes?: string;
  },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  await assertUjenziLegalEntity(input.tenantId, input.legalEntityId, input.countryCode);
  const id = ujzId();
  const write = async () => {
    await db.insert(s.ujenziProjects).values({
      id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      code: input.code,
      name: input.name,
      countryCode: input.countryCode,
      projectType: input.projectType ?? "BUILDING",
      region: input.region,
      notes: input.notes,
      status: "REGISTERED",
      lifecycleStage: "BRIEF",
    });
    await db.insert(s.ujenziCostTrackers).values({
      id: ujzId(),
      tenantId: input.tenantId,
      projectId: id,
      commitments: "0",
      actuals: "0",
      financeHandoff: "TRACKER_ONLY",
      journalsPosted: false,
    });
    return { id, journalsPosted: false as const, capPosting: "LOCKED" as const };
  };
  const event = (result: { id: string }): EventInput => ({
    type: "PROJECT_CREATED",
    source: "beyu-os/ujenzi",
    domain: "UJENZI",
    operation: "CREATE_PROJECT",
    destinationDomain: null,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    subjectType: "UJENZI_PROJECT",
    subjectId: result.id,
    actorUserId: actor?.userId ?? null,
    actorType: actor ? "HUMAN" : "SERVICE",
    classification: "INTERNAL" as Classification,
    payload: { code: input.code, name: input.name, journalsPosted: false },
    traceId: actor?.traceId ?? `TRACEUJZ${Date.now()}`,
    correlationId: actor?.traceId ?? `TRACEUJZ${Date.now()}`,
    causationId: null,
    authorityContext: {
      authorityId: null,
      decisionId: null,
      capabilityCode: null,
      permissionCode: "ujenzi:data.manage",
      policyVersion: null,
    },
    policyVersion: null,
  });
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "ujenzi.projects.create", "UJENZI_PROJECT", id, { code: input.code }), event);
}

export async function getProject(projectId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(s.ujenziProjects)
    .where(and(eq(s.ujenziProjects.id, projectId), eq(s.ujenziProjects.tenantId, tenantId)));
  return row ?? null;
}

export async function listProjects(tenantId: string) {
  return db.select().from(s.ujenziProjects).where(eq(s.ujenziProjects.tenantId, tenantId));
}

export async function createBrief(
  input: { tenantId: string; projectId: string; code: string; title: string; objectives?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  const id = ujzId();
  const write = async () => {
    await db.insert(s.ujenziBriefs).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      title: input.title,
      objectives: input.objectives,
    });
    return { id };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () => auditBase(actor, "ujenzi.briefs.create", "UJENZI_BRIEF", id, { code: input.code }));
}

export async function recordEngineeringCalculation(
  input: {
    tenantId: string;
    projectId: string;
    code: string;
    discipline: string;
    method: string;
    formulaOrModel: string;
    inputs: Record<string, unknown>;
    result: Record<string, unknown>;
    standardCode?: string;
    assumptions?: unknown[];
  },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  const id = ujzId();
  const write = async () => {
    await db.insert(s.ujenziEngineeringCalculations).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      discipline: input.discipline,
      method: input.method,
      formulaOrModel: input.formulaOrModel,
      standardCode: input.standardCode,
      inputs: input.inputs,
      result: input.result,
      assumptions: input.assumptions ?? [],
      passFail: "NEEDS_REVIEW",
      epistemicStatus: "CALCULATED",
      professionalCertification: "NOT_CERTIFIED",
      approvalState: "PENDING_REVIEW",
    });
    return {
      id,
      professionalCertification: "NOT_CERTIFIED" as const,
      epistemicStatus: "CALCULATED" as const,
    };
  };
  if (!actor) return write();
  return withAuditTransaction(write, () =>
    auditBase(actor, "ujenzi.calculations.record", "UJENZI_CALCULATION", id, { code: input.code, professionalCertification: "NOT_CERTIFIED" }),
  );
}

export async function recordSoilTest(
  input: {
    tenantId: string;
    siteId: string;
    testKind: string;
    parameters?: Record<string, unknown>;
    labName?: string;
    sampledOn?: string;
    assumedParameters?: unknown[];
  },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const [site] = await db
    .select()
    .from(s.ujenziLandSites)
    .where(and(eq(s.ujenziLandSites.id, input.siteId), eq(s.ujenziLandSites.tenantId, input.tenantId)));
  if (!site) throw new UjenziDomainError("NOT_FOUND", "Land site not found");
  const hasParams = input.parameters && Object.keys(input.parameters).length > 0;
  if (!hasParams && !(input.assumedParameters && input.assumedParameters.length > 0)) {
    const id = ujzId();
    await db.insert(s.ujenziSoilTests).values({
      id,
      tenantId: input.tenantId,
      siteId: input.siteId,
      testKind: input.testKind,
      labName: input.labName,
      sampledOn: input.sampledOn,
      dataStatus: "DATA_REQUIRED",
      epistemicStatus: "NOT_AVAILABLE",
      parameters: {},
      assumedParameters: [],
    });
    return { id, dataStatus: "DATA_REQUIRED" as const, epistemicStatus: "NOT_AVAILABLE" as const };
  }
  const assumed = input.assumedParameters ?? [];
  const id = ujzId();
  await db.insert(s.ujenziSoilTests).values({
    id,
    tenantId: input.tenantId,
    siteId: input.siteId,
    testKind: input.testKind,
    labName: input.labName,
    sampledOn: input.sampledOn,
    parameters: input.parameters ?? {},
    assumedParameters: assumed,
    dataStatus: hasParams ? "RECORDED" : "ASSUMED",
    epistemicStatus: assumed.length ? "ASSUMED" : "OBSERVED",
  });
  return { id, dataStatus: hasParams ? "RECORDED" : "ASSUMED", epistemicStatus: assumed.length ? "ASSUMED" : "OBSERVED" };
}

export async function createLandSite(
  input: {
    tenantId: string;
    projectId?: string;
    code: string;
    name: string;
    countryCode?: string;
    crs?: string;
    gpsLatitude?: string;
    gpsLongitude?: string;
  },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  if (input.projectId) {
    const project = await getProject(input.projectId, input.tenantId);
    if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  }
  if (input.gpsLatitude && !input.crs) {
    throw new UjenziDomainError("DATA_REQUIRED", "Coordinates require an explicit CRS; mixing CRS is refused");
  }
  const id = ujzId();
  await db.insert(s.ujenziLandSites).values({
    id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    code: input.code,
    name: input.name,
    countryCode: input.countryCode ?? "TZ",
    ownershipClaimStatus: "USER_SUBMITTED",
    crs: input.crs ?? "EPSG:4326",
    gpsLatitude: input.gpsLatitude,
    gpsLongitude: input.gpsLongitude,
    geometrySource: input.gpsLatitude ? "USER_ENTERED" : "USER_ENTERED",
  });
  return { id, ownershipClaimStatus: "USER_SUBMITTED" as const, crs: input.crs ?? "EPSG:4326" };
}

export async function listLandSites(tenantId: string) {
  return db.select().from(s.ujenziLandSites).where(eq(s.ujenziLandSites.tenantId, tenantId));
}

export { registerBuilding, registerLevel, queryDigitalTwin, recordProfessional } from "./twin";
export { UJENZI_CAPABILITY_REGISTRY } from "./capability-registry";
export { traverseTwin, detectOrphans, detectTwinCycles } from "./graph";
export {
  runSimpleUdlBeamMoment,
  runManningFlow,
  runTerzaghiBearing,
  runElectricalPower,
  runDarcyHeadloss,
  runHvacAirChange,
} from "./calculations";
export { isKnownCrs } from "./crs";
export {
  recordSurveyObservation,
  ingestGeoJsonDataset,
  recordDefect,
  recordRfi,
  recordScheduleActivity,
} from "./field";
export { registerBimArtifact, verifyBimChecksum, detectBimFormat } from "./bim";
export { recordBoqItem } from "./boq";
export { recordHseIncident, recordHazard, recordNearMiss, recordPermitToWork } from "./hse";
export { recordCommissioningTest, advanceCommissioning } from "./commissioning";
export { certifyCalculation, attachProfessionalEvidence } from "./authority";
export {
  linkTwinEdge,
  recordNcr,
  recordWorkOrder,
  registerRealityCapture,
  linkKnowledge,
  createRfq,
  recordQuotation,
  refuseAutonomousAward,
  recordDesignAlternative,
  recordComplianceRequirement,
  evaluateCompliance,
  refuseGisProtocol,
} from "./ops";
export {
  createWorkPackage,
  addWorkPackageDependency,
  recordWorkPackageProgress,
  recordSiteReport,
  recordSubmittal,
  recordItp,
  recordItpResult,
  closeNcr,
  recordMaterialMovement,
  recordSustainabilityMetric,
} from "./execution";
export {
  workPackageProgress,
  detectWorkPackageCycles,
  recordItpResultWithNcr,
  evaluateHandoverReadiness,
  createAssetFromApprovedCommissioning,
  attachBoqToWorkPackage,
} from "./integration";

export async function acceptSyncEnvelope(
  input: {
    tenantId: string;
    envelopeId: string;
    deviceId?: string;
    operation: string;
    payload: Record<string, unknown>;
    clientOccurredAt: string;
    clientSequence?: number;
    schemaVersion?: string;
  },
  actor?: UjenziActor,
) {
  const [existing] = await db
    .select()
    .from(s.ujenziSyncEnvelopes)
    .where(and(eq(s.ujenziSyncEnvelopes.tenantId, input.tenantId), eq(s.ujenziSyncEnvelopes.envelopeId, input.envelopeId)))
    .limit(1);
  if (existing) {
    const same = JSON.stringify(existing.payload) === JSON.stringify(input.payload);
    if (!same) {
      await db
        .update(s.ujenziSyncEnvelopes)
        .set({ conflictState: "PAYLOAD_MISMATCH", status: "CONFLICT" })
        .where(eq(s.ujenziSyncEnvelopes.id, existing.id));
      throw new UjenziDomainError("SYNC_CONFLICT", "Offline envelope payload does not match stored idempotent copy");
    }
    return { id: existing.id, status: existing.status, replay: true as const, conflictState: existing.conflictState };
  }
  const id = ujzId();
  await db.insert(s.ujenziSyncEnvelopes).values({
    id,
    tenantId: input.tenantId,
    envelopeId: input.envelopeId,
    deviceId: input.deviceId,
    operation: input.operation,
    payload: input.payload,
    clientOccurredAt: new Date(input.clientOccurredAt),
    status: "ACCEPTED",
    actorUserId: actor?.userId,
    clientSequence: input.clientSequence,
    schemaVersion: input.schemaVersion ?? "1",
    conflictState: "NONE",
  });
  return { id, status: "ACCEPTED" as const, replay: false as const, conflictState: "NONE" as const };
}

export async function certifyProgress(
  input: { tenantId: string; projectId: string; code: string; period: string; certifiedAmount?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const project = await getProject(input.projectId, input.tenantId);
  if (!project) throw new UjenziDomainError("NOT_FOUND", "Project not found");
  const id = ujzId();
  const write = async () => {
    await db.insert(s.ujenziProgressCertificates).values({
      id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      code: input.code,
      period: input.period,
      certifiedAmount: input.certifiedAmount,
      status: "DRAFT",
      financeHandoff: "SUBMITTED_PENDING_FINANCE",
      journalsPosted: false,
    });
    return {
      id,
      journalsPosted: false as const,
      financeHandoff: "SUBMITTED_PENDING_FINANCE" as const,
      capPosting: "LOCKED" as const,
    };
  };
  if (!actor) return write();
  return withAuditTransaction(write, (result) =>
    auditBase(actor, "ujenzi.progress.certify", "UJENZI_PROGRESS_CERTIFICATE", result.id, {
      journalsPosted: false,
      financeHandoff: result.financeHandoff,
    }),
  );
}

export async function recordKnowledge(
  input: { tenantId: string; projectId?: string; title: string; evidence?: string; knowledgeLevel?: string },
  actor?: UjenziActor,
) {
  assertActorTenant(actor, input.tenantId);
  const id = ujzId();
  await db.insert(s.ujenziKnowledge).values({
    id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    title: input.title,
    evidence: input.evidence,
    knowledgeLevel: input.knowledgeLevel ?? "PROJECT",
    validation: "UNVALIDATED",
    authorityGranted: false,
  });
  return { id, authorityGranted: false as const, validation: "UNVALIDATED" as const };
}

export async function ujenziDashboard(tenantId: string) {
  const [[projects], [calcs], [soil], [hse], [certs], [gov]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziProjects).where(eq(s.ujenziProjects.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziEngineeringCalculations).where(eq(s.ujenziEngineeringCalculations.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziSoilTests).where(eq(s.ujenziSoilTests.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziHseIncidents).where(eq(s.ujenziHseIncidents.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziProgressCertificates).where(eq(s.ujenziProgressCertificates.tenantId, tenantId)),
    db.select({ n: sql<number>`count(*)::int` }).from(s.ujenziGovernmentApplications).where(eq(s.ujenziGovernmentApplications.tenantId, tenantId)),
  ]);
  return {
    projects: projects?.n ?? 0,
    calculations: calcs?.n ?? 0,
    soilTests: soil?.n ?? 0,
    hseIncidents: hse?.n ?? 0,
    progressCertificates: certs?.n ?? 0,
    governmentApplications: gov?.n ?? 0,
    financeBoundary: {
      journals: "FINANCE_OS_ONLY",
      capPosting: "LOCKED",
      costTracker: "NOT_A_GENERAL_LEDGER",
    },
    engineeringBoundary: "CALCULATION_IS_NOT_CERTIFICATION",
    soilBoundary: "NO_FABRICATED_FIELD_RESULTS",
    governmentBoundary: "GOVERNMENT_REMAINS_AUTHORITATIVE",
    vision2050Boundary: "ALIGNMENT_IS_NOT_ENDORSEMENT",
    noeliaBoundary: "LEARNING_NEVER_GRANTS_AUTHORITY",
    architecture: "ONE_UJENZI_SECTOR_OS",
    countryDefault: "TZ",
    timezoneDefault: "Africa/Dar_es_Salaam",
  };
}

export async function observeUjenzi(tenantId: string) {
  return ujenziDashboard(tenantId);
}
