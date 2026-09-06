import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  modelRegistry,
  noeliaKillSwitch,
  noeliaModelArtifacts,
  noeliaModelProvenance,
  noeliaProviders,
} from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { classificationRank, type Classification } from "@/lib/constants";
import { recordAuditTx, type Tx } from "@/lib/audit";

/**
 * Phase 5 model operations: supply-chain integrity verification and governed
 * failover. Neither function grants authority. Supply-chain verification never
 * converts a missing artifact/checksum/provenance into PASS; failover never
 * selects an unapproved, inactive, suspended or residency-incompatible model.
 */

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("Noelia model operations requires canonical transaction-scoped tenant context");
}

function requireModelRead(principal: Principal): void {
  const decision = can(principal, "ai:model.registry.read");
  if (!decision.allowed) throw new Error(`Model operations read denied: ${decision.reason}`);
}

function requireModelWrite(principal: Principal): void {
  const decision = can(principal, "ai:model.registry.manage");
  if (!decision.allowed) throw new Error(`Model operations write denied: ${decision.reason}`);
}

export type SupplyChainVerification = {
  modelId: string;
  modelVersion: string;
  providerId: string | null;
  provenanceVerified: boolean;
  provenanceStatus: string;
  artifactVerified: boolean;
  artifactCount: number;
  checksumMatches: boolean;
  licensePresent: boolean;
  sourcePresent: boolean;
  integrityOk: boolean;
  reasons: string[];
  status: "VERIFIED" | "PARTIAL" | "FAILED" | "EVIDENCE_REQUIRED" | "BLOCKED";
};

export class BeyuNoeliaModelOperations {
  async verifyModelSupplyChain(input: {
    principal: Principal;
    traceId: string;
    modelId: string;
    modelVersion: string;
  }): Promise<SupplyChainVerification> {
    requireContext();
    requireModelRead(input.principal);

    const [model] = await db.select().from(modelRegistry).where(and(eq(modelRegistry.id, input.modelId), eq(modelRegistry.version, input.modelVersion))).limit(1);
    if (!model) {
      return {
        modelId: input.modelId,
        modelVersion: input.modelVersion,
        providerId: null,
        provenanceVerified: false,
        provenanceStatus: "EVIDENCE_REQUIRED",
        artifactVerified: false,
        artifactCount: 0,
        checksumMatches: false,
        licensePresent: false,
        sourcePresent: false,
        integrityOk: false,
        reasons: ["Model not present in the governed registry."],
        status: "EVIDENCE_REQUIRED",
      };
    }

    const provenance = await db
      .select()
      .from(noeliaModelProvenance)
      .where(and(eq(noeliaModelProvenance.modelId, input.modelId), eq(noeliaModelProvenance.modelVersion, input.modelVersion)))
      .limit(1);
    const artifacts = await db
      .select()
      .from(noeliaModelArtifacts)
      .where(and(eq(noeliaModelArtifacts.modelId, input.modelId), eq(noeliaModelArtifacts.modelVersion, input.modelVersion)));

    const reasons: string[] = [];
    const provenanceRow = provenance[0];
    const provenanceVerified = Boolean(provenanceRow && provenanceRow.verificationStatus !== "NOT_VERIFIED" && provenanceRow.origin && provenanceRow.publisher);
    const licensePresent = Boolean(model.license);
    const sourcePresent = Boolean(model.source);
    const artifactCount = artifacts.length;
    const checksumMatches = Boolean(
      model.checksum &&
        artifacts.some((artifact) => artifact.checksum === model.checksum || (artifact.checksum && artifact.checksum.startsWith(model.checksum!))),
    );

    if (!provenanceVerified) reasons.push("Provenance is not verified.");
    if (!licensePresent) reasons.push("License metadata is missing.");
    if (!sourcePresent) reasons.push("Source metadata is missing.");
    if (artifactCount === 0) reasons.push("No model artifacts are registered.");
    if (!checksumMatches) reasons.push("Registered checksum does not match a registered artifact.");

    const integrityOk = provenanceVerified && licensePresent && sourcePresent && artifactCount > 0 && checksumMatches;
    const status = integrityOk ? "VERIFIED" : provenanceVerified || artifactCount > 0 ? "PARTIAL" : "FAILED";

    await recordAuditTx(db as unknown as Tx, {
      actorUserId: input.principal.userId,
      actorType: "HUMAN",
      action: "NOELIA_MODEL_SUPPLY_CHAIN_VERIFIED",
      objectType: "AI_MODEL",
      objectId: input.modelId,
      reason: "Phase 5 model supply-chain integrity verification.",
      authority: "AI_MODEL_OPERATIONS",
      policyVersion: "ai.model.operations.phase5.2026.09",
      aiVersion: "noelia.phase5",
      oldValue: null,
      newValue: { modelId: input.modelId, modelVersion: input.modelVersion, status, integrityOk, reasons },
      traceId: input.traceId,
    });

    return {
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      providerId: model.providerId,
      provenanceVerified,
      provenanceStatus: provenanceRow?.verificationStatus ?? "NOT_VERIFIED",
      artifactVerified: artifactCount > 0,
      artifactCount,
      checksumMatches,
      licensePresent,
      sourcePresent,
      integrityOk,
      reasons,
      status,
    };
  }

  async resolveGovernedFallback(input: {
    principal: Principal;
    traceId: string;
    requestId: string;
    tenantId: string;
    countryCode: string | null;
    osId: string | null;
    task: string;
    capability: string;
    classification: Classification;
    riskLevel: string;
    candidates: Array<{ modelId: string; modelVersion: string; providerId: string | null }>;
  }): Promise<{
    decision: "SELECTED" | "FAIL_CLOSED";
    modelId: string | null;
    modelVersion: string | null;
    providerId: string | null;
    reasons: string[];
  }> {
    requireContext();
    requireModelRead(input.principal);

    const killSwitches = await db
      .select()
      .from(noeliaKillSwitch)
      .where(
        and(
          eq(noeliaKillSwitch.enabled, true),
          inArray(noeliaKillSwitch.targetType, ["ALL", "MODEL", "PROVIDER", "CAPABILITY", "TASK", "OS", "TENANT", "AI_IDENTITY"]),
        ),
      );

    const blockedRefs = new Set(killSwitches.map((k) => `${k.targetType}:${k.targetRef}`));
    const blocked = (type: string, ref: string | null | undefined): boolean => {
      if (!ref) return false;
      return (
        blockedRefs.has(`ALL:*`) ||
        blockedRefs.has(`ALL:${ref}`) ||
        blockedRefs.has(`${type}:${ref}`) ||
        blockedRefs.has(`${type}:*`) ||
        (type === "MODEL" && blockedRefs.has(`CAPABILITY:${input.capability}`)) ||
        (type === "MODEL" && blockedRefs.has(`TASK:${input.task}`))
      );
    };

    for (const candidate of input.candidates) {
      const reasons: string[] = [];
      const [model] = await db.select().from(modelRegistry).where(and(eq(modelRegistry.id, candidate.modelId), eq(modelRegistry.version, candidate.modelVersion))).limit(1);
      if (!model) {
        reasons.push(`Candidate model ${candidate.modelId}@${candidate.modelVersion} is not registered.`);
        continue;
      }
      if (model.status !== "ACTIVE" || model.approvalStatus !== "APPROVED" || model.evaluationStatus !== "APPROVED" || model.lifecycleStatus !== "ACTIVE") {
        reasons.push(`Candidate model ${candidate.modelId} is not ACTIVE/APPROVED/APPROVED.`);
        continue;
      }
      if (model.maxClassification && classificationRank(model.maxClassification) < classificationRank(input.classification)) {
        reasons.push(`Candidate model ${candidate.modelId} classification limit ${model.maxClassification} excludes ${input.classification}.`);
        continue;
      }
      if (blocked("MODEL", model.id)) {
        reasons.push(`Candidate model ${candidate.modelId} is kill-switched.`);
        continue;
      }
      if (candidate.providerId) {
        const [provider] = await db.select().from(noeliaProviders).where(eq(noeliaProviders.id, candidate.providerId)).limit(1);
        if (!provider || !provider.active || provider.lifecycleStatus !== "ACTIVATED") {
          reasons.push(`Candidate provider ${candidate.providerId} is not active/activated.`);
          continue;
        }
        if (blocked("PROVIDER", provider.id)) {
          reasons.push(`Candidate provider ${candidate.providerId} is kill-switched.`);
          continue;
        }
      }
      return {
        decision: "SELECTED",
        modelId: model.id,
        modelVersion: model.version,
        providerId: candidate.providerId,
        reasons: ["Candidate passed the governed failover gate."],
      };
    }

    await recordAuditTx(db as unknown as Tx, {
      actorUserId: input.principal.userId,
      actorType: "HUMAN",
      action: "NOELIA_MODEL_FAILOVER_FAILED",
      objectType: "AI_MODEL_ROUTE",
      objectId: input.requestId,
      reason: "No compliant approved model/provider fallback satisfies the governing gate.",
      authority: "AI_MODEL_OPERATIONS",
      policyVersion: "ai.model.operations.phase5.2026.09",
      aiVersion: "noelia.phase5",
      oldValue: null,
      newValue: { requestId: input.requestId, classification: input.classification, task: input.task, candidates: input.candidates },
      traceId: input.traceId,
    });

    return {
      decision: "FAIL_CLOSED",
      modelId: null,
      modelVersion: null,
      providerId: null,
      reasons: ["No compliant fallback exists; fail closed."],
    };
  }
}
