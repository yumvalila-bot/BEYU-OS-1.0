import { db, hasDatabaseTransactionContext } from "@/db";
import { aiDecisions } from "@/db/schema";
import { recordAuditTx, publishEventTx } from "@/lib/audit";
import { HIVE_RUNTIME, NOELIA_IDENTITY, NOELIA_PROMPT_VERSION } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { evaluatePolicy } from "@/lib/policy";
import type { NoeliaEvidenceInput, NoeliaEvidencePort, NoeliaPolicyPort } from "./types";

export const NOELIA_MODEL = "beyu-hive-deterministic-analyst";
export const NOELIA_MODEL_VERSION = "2026.02";

/** Policy remains a BEYU OS authority service, not HIVE-owned logic. */
export class BeyuNoeliaPolicyService implements NoeliaPolicyPort {
  async evaluate(input: Parameters<NoeliaPolicyPort["evaluate"]>[0]) {
    return evaluatePolicy({
      action: "ai:noelia.query",
      tenantId: input.target.tenantId,
      jurisdictionCode: input.target.countryCode,
      roles: input.principal.roles,
      // The data a Noelia query can touch is bounded by the principal's
      // clearance. The classification must be evaluated against that bound:
      // CONST-AI-001 r4 ("AI output over highly restricted data requires
      // human review") is conditional on the data classification, and an
      // undefined classification would make it fire unconditionally —
      // fail-safe, but it destroys the output-class semantics the rule
      // exists to refine. A caller-provided classification always wins.
      classification: input.classification ?? input.principal.clearance,
      riskScore: input.principal.riskScore,
      aiInitiated: true,
    });
  }
}

/** Persist AI decision + AI audit + enterprise event atomically. */
export class BeyuNoeliaEvidenceService implements NoeliaEvidencePort {
  async recordDecision(input: NoeliaEvidenceInput): Promise<string> {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia evidence requires canonical transaction-scoped tenant context");
    }
    const decisionId = newId(ID_PREFIX.aiDecision);
    const policyVersion = input.policy.appliedPolicies
      .map((policy) => `${policy.code}@${policy.version}`)
      .join(",") || null;

    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as typeof db;
      await tx.insert(aiDecisions).values({
        id: decisionId,
        tenantId: input.principal.tenantId,
        userId: input.principal.userId,
        agent: NOELIA_IDENTITY,
        runtime: HIVE_RUNTIME,
        engine: input.engine,
        model: NOELIA_MODEL,
        modelVersion: NOELIA_MODEL_VERSION,
        promptVersion: NOELIA_PROMPT_VERSION,
        requestType: "ANALYSIS",
        question: input.question,
        inputs: {
          requestingHuman: input.principal.userId,
          executingAi: NOELIA_IDENTITY,
          roles: input.principal.roles,
          clearance: input.principal.clearance,
          target: input.target,
        },
        retrievedSources: input.answer.sources,
        toolsUsed: input.answer.toolsUsed,
        output: {
          headline: input.answer.headline,
          narrative: input.answer.narrative,
          findings: input.answer.findings,
          uncertainty: input.answer.uncertainty,
          assumptions: input.answer.assumptions,
          limitations: input.answer.limitations,
        },
        outputClass: input.answer.outputClass,
        confidence: input.answer.confidence.toFixed(4),
        policyDecision: input.answer.policyDecision,
        deniedScopes: input.answer.deniedScopes,
        humanReviewRequired: input.answer.humanReviewRequired,
        latencyMs: input.latencyMs,
      });
      await recordAuditTx(tx, {
        tenantId: input.principal.tenantId,
        actorUserId: input.principal.userId,
        actorType: "AI",
        action: "ai.noelia.query",
        objectType: "AI_DECISION",
        objectId: decisionId,
        reason: input.question.slice(0, 240),
        policyVersion: policyVersion ?? undefined,
        aiVersion: `${NOELIA_MODEL}@${NOELIA_MODEL_VERSION}/${NOELIA_PROMPT_VERSION}`,
        traceId: input.traceId,
        newValue: {
          requestingHuman: input.principal.userId,
          executingAi: NOELIA_IDENTITY,
          approvingHuman: null,
        },
      });
      await publishEventTx(tx, {
        type: "AI_DECISION_RECORDED",
        source: "beyu-os/ai",
        domain: "AI",
        operation: "NOELIA_QUERY",
        destinationDomain: null,
        tenantId: input.principal.tenantId,
        legalEntityId: input.target.legalEntityId,
        subjectType: "AI_DECISION",
        subjectId: decisionId,
        actorUserId: input.principal.userId,
        actorType: "AI",
        classification: "RESTRICTED",
        payload: {
          engine: input.engine,
          outputClass: input.answer.outputClass,
          humanReviewRequired: input.answer.humanReviewRequired,
          confidence: input.answer.confidence,
        },
        traceId: input.traceId,
        correlationId: input.traceId,
        causationId: null,
        authorityContext: {
          authorityId: null,
          decisionId: null,
          capabilityCode: null,
          permissionCode: "ai:noelia.query",
          policyVersion,
        },
        policyVersion,
      });
    });

    return decisionId;
  }
}
