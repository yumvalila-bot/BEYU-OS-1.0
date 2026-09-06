import { asc, desc, eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { modelRegistry, noeliaModelArtifacts, noeliaModelLifecycleEvents, noeliaModelProvenance, noeliaProviderLifecycleEvents, noeliaProviders } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAuditTx, type Tx } from "@/lib/audit";

/**
 * Phase 3 model/provider lifecycle, provenance and supply-chain governance.
 *
 * Lifecycle is append-only governance evidence. A model or provider is only
 * considered executable when the canonical transition chain has reached the
 * allowed state AND the registry row is active/approved/evaluated. This module
 * never grants authority by itself.
 */

export const MODEL_LIFECYCLE = {
  REGISTERED: "REGISTERED",
  PROVENANCE_VERIFY: "PROVENANCE_VERIFY",
  SECURITY_REVIEW: "SECURITY_REVIEW",
  EVALUATE: "EVALUATE",
  RISK_ASSESS: "RISK_ASSESS",
  APPROVE: "APPROVE",
  CANARY: "CANARY",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DEPRECATED: "DEPRECATED",
  RETIRED: "RETIRED",
  REJECTED: "REJECTED",
} as const;

export type ModelLifecycleState = (typeof MODEL_LIFECYCLE)[keyof typeof MODEL_LIFECYCLE];

const MODEL_LIFECYCLE_TRANSITIONS: Record<ModelLifecycleState, ModelLifecycleState[]> = {
  REGISTERED: ["PROVENANCE_VERIFY", "REJECTED"],
  PROVENANCE_VERIFY: ["SECURITY_REVIEW", "RETIRED", "REJECTED"],
  SECURITY_REVIEW: ["EVALUATE", "RETIRED", "REJECTED"],
  EVALUATE: ["RISK_ASSESS", "RETIRED", "REJECTED"],
  RISK_ASSESS: ["APPROVE", "RETIRED", "REJECTED"],
  APPROVE: ["CANARY", "RETIRED", "REJECTED"],
  CANARY: ["ACTIVE", "SUSPENDED", "RETIRED"],
  ACTIVE: ["SUSPENDED", "DEPRECATED", "RETIRED"],
  SUSPENDED: ["ACTIVE", "RETIRED"],
  DEPRECATED: ["RETIRED"],
  RETIRED: [],
  REJECTED: [],
};

export const PROVIDER_LIFECYCLE = {
  REGISTER: "REGISTERED",
  IDENTIFY: "IDENTIFIED",
  SECURITY_REVIEW: "SECURITY_REVIEW",
  PRIVACY_REVIEW: "PRIVACY_REVIEW",
  DATA_REVIEW: "DATA_REVIEW",
  RESIDENCY_REVIEW: "RESIDENCY_REVIEW",
  CONTRACT_REVIEW: "CONTRACT_REVIEW",
  RISK_ASSESS: "RISK_ASSESSED",
  EVALUATE: "EVALUATED",
  APPROVE: "APPROVED",
  ACTIVATE: "ACTIVATED",
  SUSPEND: "SUSPENDED",
  RETIRE: "RETIRED",
  REJECT: "REJECTED",
} as const;

export type ProviderLifecycleState = (typeof PROVIDER_LIFECYCLE)[keyof typeof PROVIDER_LIFECYCLE];

const PROVIDER_LIFECYCLE_TRANSITIONS: Record<ProviderLifecycleState, ProviderLifecycleState[]> = {
  REGISTERED: ["IDENTIFIED", "REJECTED"],
  IDENTIFIED: ["SECURITY_REVIEW", "REJECTED"],
  SECURITY_REVIEW: ["PRIVACY_REVIEW", "REJECTED"],
  PRIVACY_REVIEW: ["DATA_REVIEW", "REJECTED"],
  DATA_REVIEW: ["RESIDENCY_REVIEW", "REJECTED"],
  RESIDENCY_REVIEW: ["CONTRACT_REVIEW", "REJECTED"],
  CONTRACT_REVIEW: ["RISK_ASSESSED", "REJECTED"],
  RISK_ASSESSED: ["EVALUATED", "REJECTED"],
  EVALUATED: ["APPROVED", "REJECTED"],
  APPROVED: ["ACTIVATED", "SUSPENDED", "REJECTED"],
  ACTIVATED: ["SUSPENDED", "RETIRED"],
  SUSPENDED: ["ACTIVATED", "RETIRED"],
  RETIRED: [],
  REJECTED: [],
};

export type LifecycleTransitionInput = {
  principal: Principal;
  traceId: string;
  requestId?: string | null;
  modelId: string;
  modelVersion: string;
  to: ModelLifecycleState;
  reason: string;
  payload?: Record<string, unknown>;
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia model lifecycle requires canonical transaction-scoped tenant context");
  }
}

export async function latestModelLifecycleState(modelId: string, modelVersion: string): Promise<ModelLifecycleState | null> {
  const [row] = await db
    .select({ state: noeliaModelLifecycleEvents.lifecycleState })
    .from(noeliaModelLifecycleEvents)
    .where(eq(noeliaModelLifecycleEvents.modelId, modelId))
    .orderBy(desc(noeliaModelLifecycleEvents.createdAt), desc(noeliaModelLifecycleEvents.id))
    .limit(1);
  return (row?.state as ModelLifecycleState | undefined) ?? null;
}

/**
 * Transition a model lifecycle state. Fail-closed on illegal transitions and
 * records both the lifecycle event and a canonical audit row.
 */
export async function transitionModelLifecycle(input: LifecycleTransitionInput): Promise<string> {
  requireContext();
  const current = (await latestModelLifecycleState(input.modelId, input.modelVersion)) ?? MODEL_LIFECYCLE.REGISTERED;
  if (!MODEL_LIFECYCLE_TRANSITIONS[current].includes(input.to)) {
    throw new Error(`Illegal model lifecycle transition ${current} → ${input.to} for ${input.modelId}@${input.modelVersion}.`);
  }

  const id = newId(ID_PREFIX.modelLifecycle);
  await db.insert(noeliaModelLifecycleEvents).values({
    id,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    lifecycleState: input.to,
    previousState: current,
    reason: input.reason,
    actor: input.principal.userId,
    requestId: input.requestId ?? null,
    traceId: input.traceId,
    createdBy: input.principal.userId,
    payload: input.payload ?? {},
  });
  await db
    .update(modelRegistry)
    .set({ lifecycleStatus: input.to, updatedAt: new Date() })
    .where(eq(modelRegistry.id, input.modelId));

  await recordAuditTx(db as unknown as Tx, {
    actorUserId: input.principal.userId,
    actorType: "HUMAN",
    action: "NOELIA_MODEL_LIFECYCLE_TRANSITION",
    objectType: "AI_MODEL_LIFECYCLE_EVENT",
    objectId: id,
    reason: input.reason,
    authority: "MODEL_GOVERNANCE",
    policyVersion: "ai.model.lifecycle.2026.09",
    aiVersion: "noelia.phase3",
    oldValue: { lifecycleStatus: current },
    newValue: { lifecycleStatus: input.to, modelId: input.modelId, modelVersion: input.modelVersion },
    traceId: input.traceId,
  });
  return id;
}

export async function latestProviderLifecycleState(providerId: string): Promise<ProviderLifecycleState | null> {
  const [row] = await db
    .select({ state: noeliaProviderLifecycleEvents.lifecycleState })
    .from(noeliaProviderLifecycleEvents)
    .where(eq(noeliaProviderLifecycleEvents.providerId, providerId))
    .orderBy(desc(noeliaProviderLifecycleEvents.createdAt), desc(noeliaProviderLifecycleEvents.id))
    .limit(1);
  return (row?.state as ProviderLifecycleState | undefined) ?? null;
}

export async function transitionProviderLifecycle(input: {
  principal: Principal;
  traceId: string;
  requestId?: string | null;
  providerId: string;
  to: ProviderLifecycleState;
  reason: string;
  payload?: Record<string, unknown>;
}): Promise<string> {
  requireContext();
  const current = (await latestProviderLifecycleState(input.providerId)) ?? PROVIDER_LIFECYCLE.REGISTER;
  if (!PROVIDER_LIFECYCLE_TRANSITIONS[current].includes(input.to)) {
    throw new Error(`Illegal provider lifecycle transition ${current} → ${input.to} for ${input.providerId}.`);
  }
  const id = newId(ID_PREFIX.providerLifecycle);
  await db.insert(noeliaProviderLifecycleEvents).values({
    id,
    providerId: input.providerId,
    lifecycleState: input.to,
    previousState: current,
    reason: input.reason,
    actor: input.principal.userId,
    requestId: input.requestId ?? null,
    traceId: input.traceId,
    createdBy: input.principal.userId,
    payload: input.payload ?? {},
  });
  await db.update(noeliaProviders).set({ lifecycleStatus: input.to, updatedAt: new Date() }).where(eq(noeliaProviders.id, input.providerId));
  await recordAuditTx(db as unknown as Tx, {
    actorUserId: input.principal.userId,
    actorType: "HUMAN",
    action: "NOELIA_PROVIDER_LIFECYCLE_TRANSITION",
    objectType: "AI_PROVIDER_LIFECYCLE_EVENT",
    objectId: id,
    reason: input.reason,
    authority: "PROVIDER_GOVERNANCE",
    policyVersion: "ai.provider.lifecycle.2026.09",
    aiVersion: "noelia.phase3",
    oldValue: { lifecycleStatus: current },
    newValue: { lifecycleStatus: input.to, providerId: input.providerId },
    traceId: input.traceId,
  });
  return id;
}

/**
 * Record provenance. This never fabricates BEYU ownership: `origin` and
 * `publisher` are explicit, required inputs.
 */
export async function recordModelProvenance(input: {
  principal: Principal;
  traceId: string;
  modelId: string;
  modelVersion: string;
  providerId: string | null;
  origin: string;
  publisher: string;
  family?: string | null;
  artifactIdentity?: string | null;
  checksum?: string | null;
  license?: string | null;
  sourceUri?: string | null;
  deployment?: string;
  transformation?: string;
  baseModelId?: string | null;
  baseModelVersion?: string | null;
  fineTune?: string | null;
  quantization?: string | null;
  adapterLineage?: Record<string, unknown>;
  verificationStatus?: string;
  verifier?: string | null;
  supplyChainNotes?: string | null;
}): Promise<string> {
  requireContext();
  const id = newId(ID_PREFIX.modelProvenance);
  await db.insert(noeliaModelProvenance).values({
    id,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    providerId: input.providerId,
    origin: input.origin,
    publisher: input.publisher,
    family: input.family ?? null,
    artifactIdentity: input.artifactIdentity ?? null,
    checksum: input.checksum ?? null,
    license: input.license ?? null,
    sourceUri: input.sourceUri ?? null,
    deployment: input.deployment ?? "SELF_HOSTED",
    transformation: input.transformation ?? "NONE",
    baseModelId: input.baseModelId ?? null,
    baseModelVersion: input.baseModelVersion ?? null,
    fineTune: input.fineTune ?? null,
    quantization: input.quantization ?? null,
    adapterLineage: input.adapterLineage ?? {},
    verificationStatus: input.verificationStatus ?? "NOT_VERIFIED",
    verifier: input.verifier ?? null,
    supplyChainNotes: input.supplyChainNotes ?? null,
    createdBy: input.principal.userId,
  });
  await db.update(modelRegistry).set({ provenanceStatus: input.verificationStatus ?? "NOT_VERIFIED", updatedAt: new Date() }).where(eq(modelRegistry.id, input.modelId));
  await recordAuditTx(db as unknown as Tx, {
    actorUserId: input.principal.userId,
    actorType: "HUMAN",
    action: "NOELIA_MODEL_PROVENANCE_RECORDED",
    objectType: "AI_MODEL_PROVENANCE",
    objectId: id,
    reason: `${input.origin}:${input.publisher}@${input.modelVersion}`,
    authority: "MODEL_GOVERNANCE",
    policyVersion: "ai.model.provenance.2026.09",
    aiVersion: "noelia.phase3",
    newValue: { modelId: input.modelId, modelVersion: input.modelVersion, origin: input.origin, publisher: input.publisher },
    traceId: input.traceId,
  });
  return id;
}

/** Verify an artifact digest against its recorded checksum (SHA-256). */
export function verifyArtifactDigest(recordedChecksum: string, actualDigest: string): { ok: boolean; normalized: boolean } {
  const expected = recordedChecksum.trim().toLowerCase();
  const actual = actualDigest.trim().toLowerCase();
  return { ok: expected.length > 0 && expected === actual, normalized: expected !== actual };
}

/**
 * A model is executable only when the lifecycle terminal state is ACTIVE and
 * the registry row is ACTIVE/APPROVED/APPROVED. Fail closed otherwise.
 */
export async function requireExecutableModel(modelId: string): Promise<{ ok: true; lifecycle: ModelLifecycleState }> {
  requireContext();
  const [row] = await db.select().from(modelRegistry).where(eq(modelRegistry.id, modelId)).limit(1);
  if (!row) throw new Error(`Model ${modelId} is not present in the governed registry.`);
  const lifecycle = (await latestModelLifecycleState(modelId, row.version)) ?? MODEL_LIFECYCLE.REGISTERED;
  const executable =
    lifecycle === MODEL_LIFECYCLE.ACTIVE &&
    row.status === "ACTIVE" &&
    row.approvalStatus === "APPROVED" &&
    row.evaluationStatus === "APPROVED";
  if (!executable) {
    throw new Error(`Model ${modelId}@${row.version} is not executable (lifecycle=${lifecycle}, status=${row.status}, approval=${row.approvalStatus}, evaluation=${row.evaluationStatus}).`);
  }
  return { ok: true, lifecycle };
}

/** Read the verified lifecycle chain for a model (ascending). */
export async function modelLifecycleChain(modelId: string, modelVersion: string) {
  requireContext();
  return db
    .select()
    .from(noeliaModelLifecycleEvents)
    .where(eq(noeliaModelLifecycleEvents.modelId, modelId))
    .orderBy(asc(noeliaModelLifecycleEvents.createdAt), asc(noeliaModelLifecycleEvents.id));
}

/** Read provenance records for a model. */
export async function modelProvenance(modelId: string) {
  return db.select().from(noeliaModelProvenance).where(eq(noeliaModelProvenance.modelId, modelId));
}

/** Read artifact records for a model. */
export async function modelArtifacts(modelId: string) {
  return db.select().from(noeliaModelArtifacts).where(eq(noeliaModelArtifacts.modelId, modelId));
}
