import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { noeliaAiSpans, noeliaAiTelemetry } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { ID_PREFIX, newId } from "@/lib/ids";
import { recordAuditTx, type Tx } from "@/lib/audit";

/**
 * Phase 5 AI observability.
 *
 * This records non-sensitive request/spans metadata only. It NEVER records
 * prompts, model outputs, retrieved document content, API keys, passwords or
 * tokens. Rows are tenant-scoped through RLS where a tenant is present.
 */

export type TelemetryRecordStatus =
  | "SUCCESS"
  | "DENIED"
  | "FAIL_CLOSED"
  | "BLOCKED"
  | "ERROR"
  | "NOT_SUPPORTED";

export type TelemetryInput = {
  principal: Principal;
  traceId: string;
  requestId: string;
  spanId?: string | null;
  tenantId?: string | null;
  legalEntityId?: string | null;
  countryCode?: string | null;
  osId?: string | null;
  task: string;
  capability: string;
  status: TelemetryRecordStatus;
  latencyMs?: number | null;
  timeToFirstTokenMs?: number | null;
  modelId?: string | null;
  modelVersion?: string | null;
  providerId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostMicroUsd?: string | null;
  safetyBlocked?: boolean;
  safetyReasons?: string[];
  policyDecision?: string | null;
  humanApproval?: string | null;
  payload?: Record<string, unknown>;
};

export type SpanInput = {
  principal: Principal;
  traceId: string;
  requestId: string;
  spanId: string;
  parentSpanId?: string | null;
  operation: string;
  service: string;
  tenantId?: string | null;
  status?: "OK" | "ERROR" | "BLOCKED" | "FAIL_CLOSED" | "DENIED";
  metadata?: Record<string, unknown>;
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia observability requires canonical transaction-scoped tenant context");
  }
}

function requireMetrics(principal: Principal): void {
  const decision = can(principal, "ai:compliance.metrics");
  if (!decision.allowed) throw new Error(`Observability permission denied: ${decision.reason}`);
}

async function audit(action: string, objectType: string, objectId: string, principal: Principal, traceId: string, newValue: Record<string, unknown>) {
  await recordAuditTx(db as unknown as Tx, {
    actorUserId: principal.userId,
    actorType: "HUMAN",
    action,
    objectType,
    objectId,
    reason: "Phase 5 AI observability record.",
    authority: "AI_OBSERVABILITY",
    policyVersion: "ai.observability.phase5.2026.09",
    aiVersion: "noelia.phase5",
    oldValue: null,
    newValue: { ...newValue, scope: principal.tenantId },
    traceId,
  });
}

export class BeyuNoeliaObservabilityService {
  async recordTelemetry(input: TelemetryInput): Promise<{ id: string; telemetryId: string }> {
    requireContext();
    const id = newId(ID_PREFIX.telemetry);
    await db.insert(noeliaAiTelemetry).values({
      id,
      requestId: input.requestId,
      traceId: input.traceId,
      spanId: input.spanId ?? null,
      tenantId: input.tenantId ?? null,
      legalEntityId: input.legalEntityId ?? null,
      countryCode: input.countryCode ?? null,
      osId: input.osId ?? null,
      userId: input.principal.userId,
      task: input.task,
      capability: input.capability,
      modelId: input.modelId ?? null,
      modelVersion: input.modelVersion ?? null,
      providerId: input.providerId ?? null,
      status: input.status,
      latencyMs: input.latencyMs ?? null,
      timeToFirstTokenMs: input.timeToFirstTokenMs ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      estimatedCostMicroUsd: input.estimatedCostMicroUsd ?? null,
      safetyBlocked: input.safetyBlocked ? 1 : 0,
      safetyReasons: input.safetyReasons ?? [],
      policyDecision: input.policyDecision ?? null,
      humanApproval: input.humanApproval ?? null,
      payload: input.payload ?? {},
    });
    await audit("NOELIA_TELEMETRY_RECORDED", "AI_TELEMETRY", id, input.principal, input.traceId, {
      requestId: input.requestId,
      status: input.status,
      modelId: input.modelId ?? null,
      latencyMs: input.latencyMs ?? null,
    });
    return { id, telemetryId: id };
  }

  async startSpan(input: SpanInput): Promise<{ id: string; spanId: string }> {
    requireContext();
    const id = newId(ID_PREFIX.span);
    await db.insert(noeliaAiSpans).values({
      id,
      requestId: input.requestId,
      traceId: input.traceId,
      parentSpanId: input.parentSpanId ?? null,
      spanId: input.spanId,
      operation: input.operation,
      service: input.service,
      tenantId: input.tenantId ?? null,
      status: input.status ?? "OK",
      startedAt: new Date(),
      metadata: input.metadata ?? {},
    });
    return { id, spanId: input.spanId };
  }

  async endSpan(input: {
    principal: Principal;
    traceId: string;
    requestId: string;
    spanId: string;
    durationMs: number;
    status?: "OK" | "ERROR" | "BLOCKED" | "FAIL_CLOSED" | "DENIED";
  }): Promise<void> {
    requireContext();
    await db
      .update(noeliaAiSpans)
      .set({ endedAt: new Date(), durationMs: input.durationMs, status: input.status ?? "OK" })
      .where(and(eq(noeliaAiSpans.traceId, input.traceId), eq(noeliaAiSpans.spanId, input.spanId)));
  }

  async queryTelemetry(input: {
    principal: Principal;
    tenantId?: string | null;
    since?: string | null;
    limit?: number;
  }): Promise<typeof noeliaAiTelemetry.$inferSelect[]> {
    requireContext();
    requireMetrics(input.principal);
    const conditions = [
      input.tenantId ? eq(noeliaAiTelemetry.tenantId, input.tenantId) : sql`true`,
      input.since ? gt(noeliaAiTelemetry.createdAt, new Date(input.since)) : sql`true`,
    ];
    return db
      .select()
      .from(noeliaAiTelemetry)
      .where(and(...conditions))
      .orderBy(desc(noeliaAiTelemetry.createdAt))
      .limit(Math.min(input.limit ?? 100, 500));
  }

  async summary(input: { principal: Principal; since?: string | null }): Promise<{
    total: number;
    success: number;
    denied: number;
    blocked: number;
    failClosed: number;
    error: number;
    avgLatencyMs: number;
    safetyBlocked: number;
    totalTokens: number;
  }> {
    requireContext();
    requireMetrics(input.principal);
    const rows = await this.queryTelemetry({
      principal: input.principal,
      since: input.since ?? null,
      limit: 1000,
    });
    const total = rows.length;
    const avgLatencyMs = total === 0 ? 0 : Math.round(rows.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / total);
    return {
      total,
      success: rows.filter((r) => r.status === "SUCCESS").length,
      denied: rows.filter((r) => r.status === "DENIED").length,
      blocked: rows.filter((r) => r.status === "BLOCKED").length,
      failClosed: rows.filter((r) => r.status === "FAIL_CLOSED").length,
      error: rows.filter((r) => r.status === "ERROR").length,
      avgLatencyMs,
      safetyBlocked: rows.reduce((a, r) => a + r.safetyBlocked, 0),
      totalTokens: rows.reduce((a, r) => a + (r.totalTokens ?? 0), 0),
    };
  }
}
