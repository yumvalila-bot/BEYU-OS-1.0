import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceEvaluations } from "@/db/schema";
import type { Principal } from "../authz";
import { ID_PREFIX, newId } from "../ids";
import { withAuditTransaction } from "../audit";
import { readGoverningBody } from "./body-authority";
import {
  ConductEvaluationSchema,
  type ConductEvaluationInput,
} from "./evaluation-contract";

function fail(msg: string): never {
  const err = new Error(msg) as Error & { code?: string };
  err.code = "GOVERNANCE_EVALUATION_DENIED";
  throw err;
}

export async function conductBoardEvaluation(
  principal: Principal,
  bodyId: string,
  rawInput: ConductEvaluationInput,
) {
  const input = ConductEvaluationSchema.parse(rawInput);
  const body = await readGoverningBody(principal, bodyId);
  if (body.status !== "ACTIVE") {
    throw fail("Evaluations can only be conducted for ACTIVE governing bodies.");
  }

  // Calculate overall score (average of dimension scores)
  const scores = Object.values(input.dimensionScores);
  const sum = scores.reduce((a, b) => a + b, 0);
  const overallScore = scores.length > 0 ? Math.round((sum / scores.length) * 20) : null; // scale to 100

  const evalId = newId(ID_PREFIX.governanceEvaluation);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const evaluation = {
    id: evalId,
    tenantId: body.tenantId,
    bodyId: body.id,
    evaluationType: input.evaluationType,
    evaluationPeriod: input.evaluationPeriod,
    status: "COMPLETED",
    overallScore,
    dimensionScores: input.dimensionScores,
    findings: input.findings,
    recommendations: input.recommendations,
    documentId: input.documentId ?? null,
    conductedByUserId: principal.userId,
    conductedOn: today,
    createdAt: now,
    updatedAt: now,
  };

  return withAuditTransaction(
    async (tx) => {
      await tx.insert(governanceEvaluations).values(evaluation);
      return evaluation;
    },
    (r) => ({
      action: "GOVERNANCE_EVALUATION_CONDUCTED",
      objectType: "GOVERNANCE_EVALUATION",
      objectId: evalId,
      actorUserId: principal.userId,
      tenantId: body.tenantId,
      details: { evaluationType: input.evaluationType, overallScore, evaluationPeriod: input.evaluationPeriod },
    }),
  );
}

export async function listBoardEvaluations(principal: Principal, bodyId: string) {
  const body = await readGoverningBody(principal, bodyId);
  return db
    .select()
    .from(governanceEvaluations)
    .where(eq(governanceEvaluations.bodyId, body.id));
}
