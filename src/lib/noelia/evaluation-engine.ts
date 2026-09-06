import { and, asc, eq, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { noeliaAiEvaluationRuns, noeliaAiRedTeamResults } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { ID_PREFIX, newId } from "@/lib/ids";
import { recordAuditTx, type Tx } from "@/lib/audit";

/**
 * Phase 5 evaluation and red-team result registry.
 *
 * Evaluation runs are records; they never self-promote a model to APPROVED or
 * ACTIVE. Red-team outcomes are honest statuses — `MISSED`, `BLOCKED`,
 * `ENVIRONMENT_LIMITED` and `PARTIALLY_DETECTED` are all first-class.
 */

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("Noelia evaluation engine requires canonical transaction-scoped tenant context");
}

function requireEvaluationWrite(principal: Principal): void {
  const decision = can(principal, "ai:evaluation.manage");
  if (!decision.allowed) throw new Error(`Evaluation engine permission denied: ${decision.reason}`);
}

function requireEvaluationRead(principal: Principal): void {
  const decision = can(principal, "ai:evaluation.read");
  if (!decision.allowed) throw new Error(`Evaluation engine read denied: ${decision.reason}`);
}

async function auditRecord(action: string, objectType: string, objectId: string, principal: Principal, traceId: string, newValue: Record<string, unknown>) {
  await recordAuditTx(db as unknown as Tx, {
    actorUserId: principal.userId,
    actorType: "HUMAN",
    action,
    objectType,
    objectId,
    reason: "Phase 5 evaluation/red-team record.",
    authority: "AI_EVALUATION",
    policyVersion: "ai.evaluation.phase5.2026.09",
    aiVersion: "noelia.phase5",
    oldValue: null,
    newValue: { ...newValue, scope: principal.tenantId },
    traceId,
  });
}

export class BeyuNoeliaEvaluationEngine {
  async recordRun(input: {
    principal: Principal;
    traceId: string;
    runCode: string;
    task: string;
    modelId: string;
    modelVersion: string;
    providerId: string | null;
    dataset: string;
    testSuite: string;
    metric: string;
    score: string;
    threshold?: string | null;
    status?: string;
    tenantId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<{ id: string; runId: string; status: string }> {
    requireContext();
    requireEvaluationWrite(input.principal);
    const id = newId(ID_PREFIX.evalRun);
    const status = input.status ?? "RECORDED";
    await db.insert(noeliaAiEvaluationRuns).values({
      id,
      runCode: input.runCode,
      task: input.task,
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      providerId: input.providerId,
      dataset: input.dataset,
      testSuite: input.testSuite,
      metric: input.metric,
      score: input.score,
      threshold: input.threshold ?? null,
      status,
      completedAt: new Date(),
      evaluator: input.principal.userId,
      tenantId: input.tenantId ?? null,
      payload: input.payload ?? {},
    });
    await auditRecord("NOELIA_EVALUATION_RUN_RECORDED", "AI_EVALUATION_RUN", id, input.principal, input.traceId, {
      runCode: input.runCode,
      modelId: input.modelId,
      metric: input.metric,
      status,
    });
    return { id, runId: id, status };
  }

  async recordRedTeamResult(input: {
    principal: Principal;
    traceId: string;
    resultCode: string;
    caseId: string;
    category: string;
    attackType: string;
    scenario: string;
    target: string;
    severity: string;
    outcome: string;
    evidenceRef?: string | null;
    ownerRole: string;
    notes?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<{ id: string; resultId: string; outcome: string }> {
    requireContext();
    requireEvaluationWrite(input.principal);
    const id = newId(ID_PREFIX.redTeam);
    await db.insert(noeliaAiRedTeamResults).values({
      id,
      resultCode: input.resultCode,
      caseId: input.caseId,
      category: input.category,
      attackType: input.attackType,
      scenario: input.scenario,
      target: input.target,
      severity: input.severity,
      outcome: input.outcome,
      evidenceRef: input.evidenceRef ?? null,
      testedBy: input.principal.userId,
      ownerRole: input.ownerRole,
      tenantId: input.principal.tenantId,
      notes: input.notes ?? null,
      payload: input.payload ?? {},
    });
    await auditRecord("NOELIA_RED_TEAM_RESULT_RECORDED", "AI_RED_TEAM_RESULT", id, input.principal, input.traceId, {
      resultCode: input.resultCode,
      caseId: input.caseId,
      category: input.category,
      outcome: input.outcome,
    });
    return { id, resultId: id, outcome: input.outcome };
  }

  async listRuns(input: { principal: Principal; modelId?: string | null }): Promise<typeof noeliaAiEvaluationRuns.$inferSelect[]> {
    requireContext();
    requireEvaluationRead(input.principal);
    return db
      .select()
      .from(noeliaAiEvaluationRuns)
      .where(input.modelId ? eq(noeliaAiEvaluationRuns.modelId, input.modelId) : sql`true`)
      .orderBy(asc(noeliaAiEvaluationRuns.createdAt));
  }

  async listRedTeam(input: { principal: Principal; category?: string | null }): Promise<typeof noeliaAiRedTeamResults.$inferSelect[]> {
    requireContext();
    requireEvaluationRead(input.principal);
    return db
      .select()
      .from(noeliaAiRedTeamResults)
      .where(input.category ? eq(noeliaAiRedTeamResults.category, input.category) : sql`true`)
      .orderBy(asc(noeliaAiRedTeamResults.createdAt));
  }

  async summary(input: { principal: Principal }): Promise<{
    runs: number;
    blocked: number;
    missed: number;
    environmentLimited: number;
  }> {
    requireContext();
    requireEvaluationRead(input.principal);
    const runs = await db.select().from(noeliaAiEvaluationRuns);
    const red = await db.select().from(noeliaAiRedTeamResults);
    return {
      runs: runs.length,
      blocked: red.filter((r) => r.outcome === "BLOCKED" || r.outcome === "DETECTED" || r.outcome === "PARTIALLY_DETECTED").length,
      missed: red.filter((r) => r.outcome === "MISSED").length,
      environmentLimited: red.filter((r) => r.outcome === "ENVIRONMENT_LIMITED" || r.outcome === "BLOCKED_BY_ENVIRONMENT").length,
    };
  }
}
