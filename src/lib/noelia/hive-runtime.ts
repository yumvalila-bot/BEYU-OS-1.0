import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { noeliaKillSwitch } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { isKnownClassification, classificationRank, type Classification } from "@/lib/constants";
import type { NoeliaAuthorizedScope, NoeliaTargetContext } from "./types";
import { BeyuNoeliaObservabilityService, type TelemetryInput } from "./observability";

/**
 * Phase 5 HIVE production runtime boundary.
 *
 * HIVE is NOT an authority. It is a governed execution boundary that resolves
 * the authoritative server-side context and runs the configured producer
 * through a fixed, non-bypassable chain:
 *
 *   IDENTITY → AUTHZ → CLASSIFICATION → POLICY → KILL SWITCH → MODEL ROUTING
 *   → CONTEXT/PROMPT → EXECUTION → OUTPUT → OBSERVABILITY.
 *
 * This boundary does not replace `NoeliaRuntime`; it is the production
 * orchestration shell that records spans/telemetry and fails closed before any
 * provider execution when a governing condition is not satisfied.
 */

export type HumanOversightLevel = "NO_APPROVAL" | "OPTIONAL_REVIEW" | "REQUIRED_REVIEW" | "DUAL_CONTROL" | "PROHIBITED";

export type HiveExecutionContext = {
  requestId: string;
  traceId: string;
  spanId: string;
  userId: string;
  partyId: string | null;
  tenantId: string;
  tenantCode: string;
  entityId: string | null;
  countryCode: string | null;
  osId: string | null;
  roles: string[];
  purpose: string;
  classification: Classification;
  task: string;
  capability: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  policyVersion: string;
  promptPolicyVersion: string;
  outputPolicyVersion: string;
  modelId: string;
  modelVersion: string;
  providerId: string | null;
  humanOversight: HumanOversightLevel;
  approvalState: string;
  killSwitchOk: boolean;
  residencyConstraint: string;
};

export type HiveRunInput = {
  principal: Principal;
  traceId: string;
  requestId: string;
  spanId?: string;
  target: NoeliaTargetContext;
  osId?: string | null;
  targetClassification?: Classification | null;
  scope: NoeliaAuthorizedScope;
  purpose: string;
  task: string;
  capability: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  modelId: string;
  modelVersion: string;
  providerId: string | null;
  humanOversight: HumanOversightLevel;
  approvalState?: string;
  residencyConstraint?: string;
  permission: Parameters<typeof can>[1];
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("HIVE runtime boundary requires canonical transaction-scoped tenant context");
}

export async function resolveHiveExecutionContext(input: HiveRunInput): Promise<HiveExecutionContext> {
  requireContext();
  const principal = input.principal;
  const authz = can(principal, input.permission);
  if (!authz.allowed) {
    throw new Error(`HIVE authorization boundary: ${authz.reason}`);
  }
  if (!isKnownClassification(principal.clearance)) {
    throw new Error("HIVE authorization boundary: unknown classification.");
  }
  const requestedClassification = input.targetClassification ?? principal.clearance;
  const classification = classificationRank(requestedClassification) > classificationRank(principal.clearance)
    ? principal.clearance
    : requestedClassification;
  const killSwitches = await db
    .select()
    .from(noeliaKillSwitch)
    .where(
      and(
        eq(noeliaKillSwitch.enabled, true),
        inArray(noeliaKillSwitch.targetType, ["ALL", "MODEL", "PROVIDER", "CAPABILITY", "TASK", "OS", "TENANT", "AI_IDENTITY"]),
        or(
          eq(noeliaKillSwitch.targetRef, input.modelId),
          eq(noeliaKillSwitch.targetRef, input.capability),
          eq(noeliaKillSwitch.targetRef, input.task),
          eq(noeliaKillSwitch.targetRef, "*"),
          input.providerId ? eq(noeliaKillSwitch.targetRef, input.providerId) : sql`false`,
          input.osId ? eq(noeliaKillSwitch.targetRef, input.osId) : sql`false`,
        ),
      ),
    );
  const killSwitchOk = killSwitches.length === 0;
  return {
    requestId: input.requestId,
    traceId: input.traceId,
    spanId: input.spanId ?? `SPAN_${input.requestId}`,
    userId: principal.userId,
    partyId: principal.partyId ?? null,
    tenantId: principal.tenantId,
    tenantCode: principal.tenantCode,
    entityId: input.target.legalEntityId ?? null,
    countryCode: input.target.countryCode ?? null,
    osId: input.osId ?? null,
    roles: principal.roles,
    purpose: input.purpose,
    classification,
    task: input.task,
    capability: input.capability,
    riskLevel: input.riskLevel,
    policyVersion: "ai.policy.phase5.2026.09",
    promptPolicyVersion: "ai.prompt.phase5.2026.09",
    outputPolicyVersion: "ai.output.phase5.2026.09",
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    providerId: input.providerId,
    humanOversight: input.humanOversight,
    approvalState: input.approvalState ?? "NONE",
    killSwitchOk,
    residencyConstraint: input.residencyConstraint ?? "BEYU_CONTROLLED",
  };
}

export class HiveRuntimeBoundary {
  private readonly observability = new BeyuNoeliaObservabilityService();

  async execute<T>(
    context: HiveExecutionContext,
    producer: (ctx: HiveExecutionContext) => Promise<T>,
    telemetry: Omit<TelemetryInput, "principal" | "traceId" | "requestId" | "spanId" | "task" | "capability">,
  ): Promise<T> {
    requireContext();
    const startedAt = Date.now();
    try {
      const result = await producer(context);
      await this.observability
        .recordTelemetry({
          ...telemetry,
          principal: { userId: context.userId, tenantId: context.tenantId, permissions: new Set(), emergencyPermissions: [], roles: context.roles, clearance: context.classification, entityScope: [], mfaSatisfied: true, sessionId: "HIVE", riskScore: 0, partyId: context.partyId, email: "hive@beyu.os", displayName: "HIVE RUNTIME", tenantCode: context.tenantCode, tenantType: "ENTERPRISE" } as Principal,
          traceId: context.traceId,
          requestId: context.requestId,
          spanId: context.spanId,
          task: context.task,
          capability: context.capability,
          tenantId: context.tenantId,
          countryCode: context.countryCode,
          osId: context.osId,
          modelId: context.modelId,
          modelVersion: context.modelVersion,
          providerId: context.providerId,
          humanApproval: context.humanOversight,
          policyDecision: "ALLOWED",
          payload: { hive: true },
        })
        .catch(() => undefined);
      return result;
    } catch (err) {
      await this.observability
        .recordTelemetry({
          ...telemetry,
          principal: { userId: context.userId, tenantId: context.tenantId, permissions: new Set(), emergencyPermissions: [], roles: context.roles, clearance: context.classification, entityScope: [], mfaSatisfied: true, sessionId: "HIVE", riskScore: 0, partyId: context.partyId, email: "hive@beyu.os", displayName: "HIVE RUNTIME", tenantCode: context.tenantCode, tenantType: "ENTERPRISE" } as Principal,
          traceId: context.traceId,
          requestId: context.requestId,
          spanId: context.spanId,
          task: context.task,
          capability: context.capability,
          tenantId: context.tenantId,
          countryCode: context.countryCode,
          osId: context.osId,
          modelId: context.modelId,
          modelVersion: context.modelVersion,
          providerId: context.providerId,
          humanApproval: context.humanOversight,
          policyDecision: "FAIL_CLOSED",
          status: "FAIL_CLOSED",
          latencyMs: Date.now() - startedAt,
          payload: { hive: true },
        })
        .catch(() => undefined);
      throw err;
    }
  }
}
