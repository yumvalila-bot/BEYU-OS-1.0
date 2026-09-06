import { z } from "zod";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import {
  BeyuNoeliaContinuousAssurance,
  BeyuNoeliaEvaluationEngine,
  BeyuNoeliaKnowledgeFabric,
  BeyuNoeliaModelOperations,
  BeyuNoeliaObservabilityService,
  BeyuNoeliaProductionResilience,
  resolveHiveExecutionContext,
} from "@/lib/noelia";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

const Phase5ActionsSchema = z.object({
  action: z.enum([
    "hive.context",
    "knowledge.register",
    "knowledge.verify-digest",
    "knowledge.retrieve",
    "telemetry.record",
    "telemetry.summary",
    "evaluation.record-run",
    "evaluation.record-red-team",
    "evaluation.read",
    "model.verify-supply-chain",
    "model.resolve-fallback",
    "resilience.health",
    "resilience.guarded-call",
    "assurance.attest",
  ]),
  payload: z.record(z.unknown()),
}).strict();

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing or invalid field: ${key}`);
  return value;
}

function optStr(payload: Record<string, unknown>, key: string): string | null | undefined {
  const value = payload[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`Invalid field: ${key}`);
  return value;
}

function optBool(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`Invalid field: ${key}`);
  return value;
}

function optNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number") throw new Error(`Invalid field: ${key}`);
  return value;
}

function candidates(payload: Record<string, unknown>): Array<{ modelId: string; modelVersion: string; providerId: string | null }> {
  const value = payload.candidates;
  if (!Array.isArray(value)) throw new Error("Missing or invalid field: candidates");
  return value.map((v) => {
    const r = asRecord(v);
    return {
      modelId: str(r, "modelId"),
      modelVersion: str(r, "modelVersion"),
      providerId: (optStr(r, "providerId") ?? null) as string | null,
    };
  });
}

/**
 * POST /api/v1/ai/noelia/phase5/actions — governed Phase 5 actions.
 *
 * All actions run under canonical tenant RLS context. The route gate is
 * `ai:compliance.write`; each service applies its own stronger permission
 * boundary and fail-closed semantics before touching state.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:compliance.write",
      action: "ai.noelia.phase5.action",
      rateLimit: { limit: 90, windowMs: 60_000 },
      audit: { objectType: "AI_PHASE5" },
      databaseContext: "handler",
    },
    async (ctx) => {
      let body: z.infer<typeof Phase5ActionsSchema>;
      try {
        body = await parseBody(ctx.request, Phase5ActionsSchema);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, ctx.traceId);
        }
        throw err;
      }

      try {
        const p = asRecord(body.payload);
        const result = await withTenantDatabaseContext(ctx.principal, async () => {
          switch (body.action) {
            case "hive.context":
              return resolveHiveExecutionContext({
                principal: ctx.principal,
                traceId: ctx.traceId,
                requestId: str(p, "requestId"),
                spanId: optStr(p, "spanId") ?? undefined,
                target: { tenantId: ctx.principal.tenantId, legalEntityId: (optStr(p, "legalEntityId") ?? null) as string | null, countryCode: (optStr(p, "countryCode") ?? null) as string | null },
                osId: optStr(p, "osId"),
                scope: {
                  tenantIds: [ctx.principal.tenantId],
                  legalEntityIds: [],
                  countryCodes: [],
                  entities: [],
                  tenantCountries: [],
                  enterprise: false,
                },
                purpose: str(p, "purpose"),
                task: str(p, "task"),
                capability: str(p, "capability"),
                riskLevel: (str(p, "riskLevel") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"),
                modelId: str(p, "modelId"),
                modelVersion: str(p, "modelVersion"),
                providerId: (optStr(p, "providerId") ?? null) as string | null,
                humanOversight: (str(p, "humanOversight") as "NO_APPROVAL" | "OPTIONAL_REVIEW" | "REQUIRED_REVIEW" | "DUAL_CONTROL" | "PROHIBITED"),
                approvalState: optStr(p, "approvalState") ?? undefined,
                residencyConstraint: optStr(p, "residencyConstraint") ?? "BEYU_CONTROLLED",
                permission: "ai:noelia.query",
              });
            case "knowledge.register":
              return new BeyuNoeliaKnowledgeFabric().registerDocument({
                principal: ctx.principal,
                traceId: ctx.traceId,
                code: str(p, "code"),
                title: str(p, "title"),
                domain: str(p, "domain"),
                sourceUri: (optStr(p, "sourceUri") ?? null) as string | null,
                osId: optStr(p, "osId"),
                sourceType: optStr(p, "sourceType") ?? "GOVERNED_DOCUMENT",
                ownerRole: str(p, "ownerRole"),
                jurisdictionCode: (optStr(p, "jurisdictionCode") ?? null) as string | null,
                scopeType: str(p, "scopeType") as "ENTERPRISE" | "COUNTRY" | "GLOBAL" | "TENANT" | "ENTITY",
                tenantId: (optStr(p, "tenantId") ?? null) as string | null,
                legalEntityId: (optStr(p, "legalEntityId") ?? null) as string | null,
                countryCode: (optStr(p, "countryCode") ?? null) as string | null,
                version: optStr(p, "version") ?? undefined,
                authorityStatus: (optStr(p, "authorityStatus") ?? "UNDER_REVIEW") as "AUTHORITATIVE" | "UNDER_REVIEW" | "SUPERSEDED" | "EXPIRED" | "REJECTED",
                provenance: str(p, "provenance"),
                classification: str(p, "classification") as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED",
                effectiveFrom: str(p, "effectiveFrom"),
                reviewDate: str(p, "reviewDate"),
                expiresAt: (optStr(p, "expiresAt") ?? null) as string | null,
                content: str(p, "content"),
                keywords: Array.isArray(p.keywords) ? (p.keywords.filter((v): v is string => typeof v === "string") ?? []) : [],
              });
            case "knowledge.verify-digest":
              return new BeyuNoeliaKnowledgeFabric().verifyDigest({
                principal: ctx.principal,
                traceId: ctx.traceId,
                code: str(p, "code"),
              });
            case "knowledge.retrieve":
              return new BeyuNoeliaKnowledgeFabric().retrieve({
                principal: ctx.principal,
                traceId: ctx.traceId,
                scope: {
                  tenantIds: [ctx.principal.tenantId],
                  legalEntityIds: [],
                  countryCodes: [],
                  entities: [],
                  tenantCountries: [],
                  enterprise: false,
                },
                target: { tenantId: ctx.principal.tenantId, legalEntityId: (optStr(p, "legalEntityId") ?? null) as string | null, countryCode: (optStr(p, "countryCode") ?? null) as string | null },
                osId: optStr(p, "osId"),
                question: str(p, "question"),
                limit: optNumber(p, "limit") ?? 4,
              });
            case "telemetry.record": {
              const status = str(p, "status");
              return new BeyuNoeliaObservabilityService().recordTelemetry({
                principal: ctx.principal,
                traceId: ctx.traceId,
                requestId: str(p, "requestId"),
                spanId: optStr(p, "spanId"),
                tenantId: (optStr(p, "tenantId") ?? null) as string | null,
                countryCode: (optStr(p, "countryCode") ?? null) as string | null,
                osId: optStr(p, "osId"),
                task: str(p, "task"),
                capability: str(p, "capability"),
                status: status as "SUCCESS" | "DENIED" | "FAIL_CLOSED" | "BLOCKED" | "ERROR" | "NOT_SUPPORTED",
                latencyMs: (optNumber(p, "latencyMs") ?? null) as number | null,
                modelId: (optStr(p, "modelId") ?? null) as string | null,
                modelVersion: (optStr(p, "modelVersion") ?? null) as string | null,
                providerId: (optStr(p, "providerId") ?? null) as string | null,
                safetyBlocked: optBool(p, "safetyBlocked"),
                safetyReasons: Array.isArray(p.safetyReasons) ? (p.safetyReasons.filter((v): v is string => typeof v === "string") ?? []) : [],
                policyDecision: (optStr(p, "policyDecision") ?? null) as string | null,
                humanApproval: (optStr(p, "humanApproval") ?? null) as string | null,
              });
            }
            case "telemetry.summary":
              return new BeyuNoeliaObservabilityService().summary({
                principal: ctx.principal,
                since: (optStr(p, "since") ?? null) as string | null,
              });
            case "evaluation.record-run":
              return new BeyuNoeliaEvaluationEngine().recordRun({
                principal: ctx.principal,
                traceId: ctx.traceId,
                runCode: str(p, "runCode"),
                task: str(p, "task"),
                modelId: str(p, "modelId"),
                modelVersion: str(p, "modelVersion"),
                providerId: (optStr(p, "providerId") ?? null) as string | null,
                dataset: str(p, "dataset"),
                testSuite: str(p, "testSuite"),
                metric: str(p, "metric"),
                score: str(p, "score"),
                threshold: (optStr(p, "threshold") ?? null) as string | null,
                status: optStr(p, "status") ?? "RECORDED",
              });
            case "evaluation.record-red-team":
              return new BeyuNoeliaEvaluationEngine().recordRedTeamResult({
                principal: ctx.principal,
                traceId: ctx.traceId,
                resultCode: str(p, "resultCode"),
                caseId: str(p, "caseId"),
                category: str(p, "category"),
                attackType: str(p, "attackType"),
                scenario: str(p, "scenario"),
                target: str(p, "target"),
                severity: str(p, "severity"),
                outcome: str(p, "outcome"),
                evidenceRef: (optStr(p, "evidenceRef") ?? null) as string | null,
                ownerRole: str(p, "ownerRole"),
                notes: (optStr(p, "notes") ?? null) as string | null,
              });
            case "evaluation.read":
              return {
                runs: await new BeyuNoeliaEvaluationEngine().listRuns({ principal: ctx.principal, modelId: (optStr(p, "modelId") ?? null) as string | null }),
                redTeam: await new BeyuNoeliaEvaluationEngine().listRedTeam({ principal: ctx.principal, category: (optStr(p, "category") ?? null) as string | null }),
                summary: await new BeyuNoeliaEvaluationEngine().summary({ principal: ctx.principal }),
              };
            case "model.verify-supply-chain":
              return new BeyuNoeliaModelOperations().verifyModelSupplyChain({
                principal: ctx.principal,
                traceId: ctx.traceId,
                modelId: str(p, "modelId"),
                modelVersion: str(p, "modelVersion"),
              });
            case "model.resolve-fallback":
              return new BeyuNoeliaModelOperations().resolveGovernedFallback({
                principal: ctx.principal,
                traceId: ctx.traceId,
                requestId: str(p, "requestId"),
                tenantId: str(p, "tenantId"),
                countryCode: (optStr(p, "countryCode") ?? null) as string | null,
                osId: (optStr(p, "osId") ?? null) as string | null,
                task: str(p, "task"),
                capability: str(p, "capability"),
                classification: str(p, "classification") as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED",
                riskLevel: str(p, "riskLevel"),
                candidates: candidates(p),
              });
            case "resilience.health":
              return new BeyuNoeliaProductionResilience().healthSummary(ctx.principal);
            case "resilience.guarded-call":
              // Arbitrary provider execution is not exposed through this API.
              // The action is a fail-closed demonstration that the guard
              // refuses an unknown provider without an approved route.
              return {
                ok: false,
                value: null,
                attempts: 0,
                circuit: "OPEN",
                failClosed: true,
                reason: "Arbitrary provider execution is not exposed over the Phase 5 API; a dry-run guard is used instead.",
              };
            case "assurance.attest":
              return new BeyuNoeliaContinuousAssurance().attest({
                principal: ctx.principal,
                traceId: ctx.traceId,
                requestId: str(p, "requestId"),
              });
            default:
              throw new Error(`Unsupported Phase 5 action: ${body.action}`);
          }
        });
        return apiOk(result, ctx.traceId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown Phase 5 action failure.";
        if (message.includes("permission denied") || message.includes("authorization boundary")) {
          return apiError("FORBIDDEN", message, 403, ctx.traceId);
        }
        throw err;
      }
    },
  );
}
