import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, pool, withDatabaseTransactionContext } from "@/db";
import { modelRegistry, noeliaModelLifecycleEvents, noeliaModelProvenance, noeliaProviders } from "@/db/schema";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { newId, ID_PREFIX } from "@/lib/ids";
import {
  MODEL_LIFECYCLE,
  modelLifecycleChain,
  recordModelProvenance,
  requireExecutableModel,
  transitionModelLifecycle,
  transitionProviderLifecycle,
} from "@/lib/noelia/model-lifecycle";
import { seededPrincipal } from "./db-fixtures";

const ROLLBACK = "__ROLLBACK__";
const createdProviderIds: string[] = [];
const createdModelIds: string[] = [];

async function inRollbackedScope(fn: () => Promise<void>): Promise<void> {
  try {
    await withDatabaseTransactionContext(async () => {
      await withTenantDatabaseContext(await seededPrincipal("ceo@beyu.os"), async () => {
        await fn();
        throw new Error(ROLLBACK);
      });
    });
  } catch (err) {
    if (String((err as Error).message) !== ROLLBACK) throw err;
  }
}

async function setupModel(provided?: Awaited<ReturnType<typeof seededPrincipal>>) {
  const p = provided ?? (await seededPrincipal("ceo@beyu.os"));
  const providerId = newId(ID_PREFIX.provider);
  const modelId = newId(ID_PREFIX.model);
  createdProviderIds.push(providerId);
  createdModelIds.push(modelId);
  await db.insert(noeliaProviders).values({
    id: providerId,
    providerName: `lifecycle-test-${providerId}`,
    providerType: "SELF_HOSTED",
    ownership: "BEYU",
    dataResidency: "BEYU_CONTROLLED",
    authenticationMethod: "NONE",
    lifecycleStatus: "REGISTERED",
    active: false,
    createdBy: p.userId,
  }).onConflictDoNothing({ target: noeliaProviders.id });
  await db.insert(modelRegistry).values({
    id: modelId,
    provider: `lifecycle-test-${providerId}`,
    model: "lifecycle-test-model",
    version: "1.0.0",
    status: "ACTIVE",
    approvalStatus: "PENDING",
    evaluationStatus: "NOT_EVALUATED",
    lifecycleStatus: "REGISTERED",
    provenanceStatus: "EVIDENCE_REQUIRED",
    verificationStatus: "NOT_VERIFIED",
    riskStatus: "NOT_ASSESSED",
    modelType: "SELF_HOSTED",
    deploymentType: "SELF_HOSTED",
    dataResidency: "BEYU_CONTROLLED",
    maxClassification: "RESTRICTED",
    capabilities: ["governed-analysis"],
    inputModalities: ["TEXT"],
    outputModalities: ["TEXT"],
    approvedBy: p.userId,
    providerId,
    createdBy: p.userId,
  }).onConflictDoNothing({ target: [modelRegistry.provider, modelRegistry.model, modelRegistry.version] });
  await db.insert(noeliaModelLifecycleEvents).values({
    id: newId(ID_PREFIX.modelLifecycle),
    modelId,
    modelVersion: "1.0.0",
    providerId,
    lifecycleState: "REGISTERED",
    previousState: null,
    reason: "Test model registered.",
    actor: p.userId,
    createdBy: p.userId,
    payload: { test: true },
  });
  return { p, providerId, modelId, version: "1.0.0" };
}

describe("Phase 3 model lifecycle and provenance", () => {
  it("requires a legal serial transition chain from REGISTERED to ACTIVE", async () => {
    await inRollbackedScope(async () => {
      const { p, modelId, version } = await setupModel();
      const base = { principal: p, traceId: "TRACE_MLC_LEGAL", requestId: "REQ_MLC_LEGAL", modelId, modelVersion: version };

      await expect(transitionModelLifecycle({ ...base, to: MODEL_LIFECYCLE.ACTIVE, reason: "skip chain" })).rejects.toThrow(/Illegal model lifecycle transition/);

      for (const state of [
        MODEL_LIFECYCLE.PROVENANCE_VERIFY,
        MODEL_LIFECYCLE.SECURITY_REVIEW,
        MODEL_LIFECYCLE.EVALUATE,
        MODEL_LIFECYCLE.RISK_ASSESS,
        MODEL_LIFECYCLE.APPROVE,
        MODEL_LIFECYCLE.CANARY,
        MODEL_LIFECYCLE.ACTIVE,
      ]) {
        await transitionModelLifecycle({ ...base, to: state, reason: `advance to ${state}` });
      }

      await expect(requireExecutableModel(modelId)).rejects.toThrow(/approval=PENDING/);
      await db.update(modelRegistry).set({ approvalStatus: "APPROVED", evaluationStatus: "APPROVED" }).where(eq(modelRegistry.id, modelId));
      const executable = await requireExecutableModel(modelId);
      expect(executable.lifecycle).toBe(MODEL_LIFECYCLE.ACTIVE);

      const chain = await modelLifecycleChain(modelId, version);
      expect(chain.map((r) => r.lifecycleState)).toEqual([
        "REGISTERED",
        "PROVENANCE_VERIFY",
        "SECURITY_REVIEW",
        "EVALUATE",
        "RISK_ASSESS",
        "APPROVE",
        "CANARY",
        "ACTIVE",
      ]);
    });
  });

  it("records provenance with explicit origin and never fabricates BEYU ownership", async () => {
    await inRollbackedScope(async () => {
      const { p, modelId, version, providerId } = await setupModel();
      const id = await recordModelProvenance({
        principal: p,
        traceId: "TRACE_MLC_PROV",
        modelId,
        modelVersion: version,
        providerId,
        origin: "EXTERNAL_SUPPLIER",
        publisher: "Third Party",
        family: "open-weights-family",
        artifactIdentity: "sha256:abc",
        checksum: "abc".padEnd(64, "0"),
        license: "Apache-2.0",
        verificationStatus: "SECURITY_REVIEW_PENDING",
      });
      const [row] = await db.select().from(noeliaModelProvenance).where(eq(noeliaModelProvenance.id, id));
      expect(row.origin).toBe("EXTERNAL_SUPPLIER");
      expect(row.publisher).toBe("Third Party");
      expect(row.verificationStatus).toBe("SECURITY_REVIEW_PENDING");
    });
  });

  it("records provider onboarding chain and rejects an illegal activation", async () => {
    await inRollbackedScope(async () => {
      const { p, providerId } = await setupModel();
      await expect(
        transitionProviderLifecycle({ principal: p, traceId: "TRACE_PLC_ILLEGAL", providerId, to: "ACTIVATED", reason: "skip" }),
      ).rejects.toThrow(/Illegal provider lifecycle transition/);
      for (const state of ["IDENTIFIED", "SECURITY_REVIEW", "PRIVACY_REVIEW", "DATA_REVIEW", "RESIDENCY_REVIEW", "CONTRACT_REVIEW", "RISK_ASSESSED", "EVALUATED", "APPROVED", "ACTIVATED"] as const) {
        const id = await transitionProviderLifecycle({ principal: p, traceId: "TRACE_PLC_LEGAL", providerId, to: state, reason: `advance to ${state}` });
        expect(id).toMatch(/^PLC_/);
      }
    });
  });

  it("does not create a lifecycle event outside a transaction context", async () => {
    const { p, modelId, version } = await setupModel();
    await expect(
      transitionModelLifecycle({
        principal: p,
        traceId: "TRACE_MLC_NO_TX",
        modelId,
        modelVersion: version,
        to: MODEL_LIFECYCLE.REJECTED,
        reason: "no tx",
      }),
    ).rejects.toThrow(/requires canonical transaction-scoped tenant context/);
  });
});

afterAll(async () => {
  if (createdModelIds.length) {
    await db.delete(noeliaModelLifecycleEvents).where(inArray(noeliaModelLifecycleEvents.modelId, createdModelIds));
    await db.delete(noeliaModelProvenance).where(inArray(noeliaModelProvenance.modelId, createdModelIds));
    await db.delete(modelRegistry).where(inArray(modelRegistry.id, createdModelIds));
  }
  if (createdProviderIds.length) {
    await db.delete(noeliaProviders).where(inArray(noeliaProviders.id, createdProviderIds));
  }
  await pool.end();
});
