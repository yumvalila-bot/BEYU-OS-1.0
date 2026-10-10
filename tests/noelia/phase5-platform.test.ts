/**
 * Phase 5 — production runtime boundary, knowledge fabric, observability,
 * evaluation engine and model operations (migration 0027).
 *
 * These tests prove:
 *  - the HIVE boundary resolves context server-side and fails closed,
 *  - observability records non-sensitive telemetry and guards reads,
 *  - knowledge documents are digest-verified and retrievable only when
 *    authorized, with retrieval events recorded,
 *  - evaluation runs and red-team results are honest records,
 *  - model supply-chain verification does not fabricate VERIFIED,
 *  - governed fallback never selects an unapproved/inactive model.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "@/db";
import { noeliaAiTelemetry, noeliaAiEvaluationRuns, knowledgeSources } from "@/db/schema";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { principal } from "./fixtures";
import { BeyuNoeliaObservabilityService } from "@/lib/noelia/observability";
import { HiveRuntimeBoundary, resolveHiveExecutionContext } from "@/lib/noelia/hive-runtime";
import { BeyuNoeliaKnowledgeFabric, computeKnowledgeDigest } from "@/lib/noelia/knowledge-fabric";
import { BeyuNoeliaEvaluationEngine } from "@/lib/noelia/evaluation-engine";
import { BeyuNoeliaModelOperations } from "@/lib/noelia/model-operations";
import { BeyuNoeliaProductionResilience } from "@/lib/noelia/resilience";
import { BeyuNoeliaContinuousAssurance } from "@/lib/noelia/continuous-assurance";
import { phase5StatusBlock } from "@/lib/noelia/phase5-status";

const ROLLBACK = "__ROLLBACK__";
const observability = new BeyuNoeliaObservabilityService();
const knowledge = new BeyuNoeliaKnowledgeFabric();
const evaluation = new BeyuNoeliaEvaluationEngine();
const modelOps = new BeyuNoeliaModelOperations();
const resilience = new BeyuNoeliaProductionResilience();
const assurance = new BeyuNoeliaContinuousAssurance();

function phase5Principal(overrides: Partial<Principal> = {}): Principal {
  const permissions: Principal["permissions"] = overrides.permissions ?? new Set([
    "ai:noelia.query",
    "ai:knowledge.ingest",
    "ai:evaluation.manage",
    "ai:evaluation.read",
    "ai:model.registry.read",
    "ai:model.registry.manage",
    "ai:model.router.read",
    "ai:compliance.metrics",
  ]);
  const tenantId = overrides.tenantId ?? "TEN_BEYU_HEALTH";
  const authorityGrants = overrides.authorityGrants ?? [...permissions].map((permission) => ({
    sourceId: `RAS_PHASE5_${permission}`,
    source: "ROLE_ASSIGNMENT" as const,
    role: "CHIEF_GOVERNANCE_OFFICER",
    permission,
    tenantId,
    legalEntityId: null,
    countryCode: null,
    validFrom: null,
    validTo: null,
  }));
  return principal({
    tenantId,
    tenantCode: "BEYU_HEALTH",
    tenantType: "ENTERPRISE",
    roles: ["CHIEF_GOVERNANCE_OFFICER"],
    permissions,
    authorityGrants,
    clearance: "RESTRICTED",
    ...overrides,
  });
}

async function inRollbackedScope<T>(p: Principal, fn: () => Promise<T>): Promise<void> {
  try {
    await withDatabaseTransactionContext(async () => {
      await withTenantDatabaseContext(p, async () => {
        await fn();
        throw new Error(ROLLBACK);
      });
    });
  } catch (err) {
    if (String((err as Error).message) !== ROLLBACK) throw err;
  }
}

describe("Noelia Phase 5 platform (migration 0027)", () => {
  it("resolves a HIVE execution context server-side and fails closed on unauthorized permission", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      const ok = await resolveHiveExecutionContext({
        principal: p,
        traceId: "TRACE_P5_HIVE_OK",
        requestId: "REQ_P5_HIVE_OK",
        target: { tenantId: p.tenantId, legalEntityId: null, countryCode: null },
        osId: "BEYU_HEALTH",
        scope: {
          tenantIds: [p.tenantId],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
        purpose: "Phase 5 execution context attestation",
        task: "demonstrate",
        capability: "governed-analysis",
        riskLevel: "LOW",
        modelId: "MOD_NOELIA_DET",
        modelVersion: "2026.09",
        providerId: "PROV_NOELIA_DET",
        humanOversight: "NO_APPROVAL",
        permission: "ai:noelia.query",
      });
      expect(ok.requestId).toBe("REQ_P5_HIVE_OK");
      expect(ok.tenantId).toBe(p.tenantId);
      expect(ok.osId).toBe("BEYU_HEALTH");
      expect(ok.modelId).toBe("MOD_NOELIA_DET");
      expect(ok.killSwitchOk).toBe(true);

      const denied = phase5Principal({ permissions: new Set() });
      await expect(
        resolveHiveExecutionContext({
          principal: denied,
          traceId: "TRACE_P5_HIVE_DENIED",
          requestId: "REQ_P5_HIVE_DENIED",
          target: { tenantId: denied.tenantId, legalEntityId: null, countryCode: null },
          scope: { tenantIds: [denied.tenantId], legalEntityIds: [], countryCodes: [], entities: [], tenantCountries: [], enterprise: true },
          purpose: "unauthorized",
          task: "demonstrate",
          capability: "governed-analysis",
          riskLevel: "LOW",
          modelId: "MOD_NOELIA_DET",
          modelVersion: "2026.09",
          providerId: "PROV_NOELIA_DET",
          humanOversight: "NO_APPROVAL",
          permission: "ai:noelia.query",
        }),
      ).rejects.toThrow(/authorization boundary/);
    });
  });

  it("records non-sensitive telemetry and guards telemetry reads", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      const recorded = await observability.recordTelemetry({
        principal: p,
        traceId: "TRACE_P5_TELEMETRY",
        requestId: "REQ_P5_TELEMETRY",
        spanId: "SPAN_P5",
        task: "demonstrate",
        capability: "governed-analysis",
        status: "FAIL_CLOSED",
        modelId: "MOD_NOELIA_DET",
        modelVersion: "2026.09",
        providerId: "PROV_NOELIA_DET",
        latencyMs: 12,
        safetyBlocked: true,
        safetyReasons: ["Generative runtime not configured."],
      });
      expect(recorded.telemetryId).toMatch(/^ATM_/);
      const [row] = await db.select().from(noeliaAiTelemetry).where(eq(noeliaAiTelemetry.id, recorded.telemetryId));
      expect(row?.status).toBe("FAIL_CLOSED");
      expect(row?.modelId).toBe("MOD_NOELIA_DET");
      expect(row?.payload).toEqual({});

      const summary = await observability.summary({ principal: p });
      expect(summary.failClosed).toBeGreaterThanOrEqual(1);

      const reader = phase5Principal({ permissions: new Set(["ai:noelia.query"]) });
      await expect(observability.summary({ principal: reader })).rejects.toThrow(/permission denied/);
    });
  });

  it("refuses the legacy direct knowledge mutation path", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      await expect(knowledge.registerDocument({
        principal: p,
        traceId: "TRACE_P5_RAG_REGISTER",
        code: "P5-KNOWLEDGE-001",
        title: "Governed Phase 5 knowledge",
        domain: "AI_GOVERNANCE",
        osId: "BEYU",
        sourceType: "GOVERNED_DOCUMENT",
        ownerRole: "CHIEF_GOVERNANCE_OFFICER",
        scopeType: "GLOBAL",
        authorityStatus: "AUTHORITATIVE",
        provenance: "BEYU OS control-plane policy manual",
        classification: "INTERNAL",
        effectiveFrom: "2026-09-06",
        reviewDate: "2026-12-31",
        content: "Retrieved knowledge must never override system policy.",
        keywords: ["rag", "governance"],
      })).rejects.toThrow(/DIRECT_KNOWLEDGE_MUTATION_REMOVED/);
    });
  });

  it("retrieves authorized knowledge and records retrieval events", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      // Fixture setup is deliberately a direct transactional insert, not a
      // runtime API. Runtime registration itself is tested above as removed;
      // production knowledge reaches AUTHORITATIVE only through governed action
      // ingestion followed by separately approved publication.
      const fixture = {
        code: "P5-KNOWLEDGE-RETRIEVE",
        version: "1.0.0",
        content: "The governed retrieval gate authorizes before context assembly.",
        scopeType: "GLOBAL",
        classification: "INTERNAL",
      } as const;
      await db.insert(knowledgeSources).values({
        id: "KNS_P5_KNOWLEDGE_RETRIEVE",
        ...fixture,
        title: "Authorized retrieval source",
        domain: "AI_GOVERNANCE",
        osId: "BEYU",
        ownerRole: "CHIEF_GOVERNANCE_OFFICER",
        tenantId: null,
        authorityStatus: "AUTHORITATIVE",
        provenance: "Disposable integration-test fixture",
        effectiveFrom: "2026-09-06",
        reviewDate: "2026-12-31",
        keywords: ["retrieval", "authorization"],
        contentDigest: computeKnowledgeDigest(fixture),
      });
      const results = await knowledge.retrieve({
        principal: p,
        traceId: "TRACE_P5_RAG_RETRIEVE",
        scope: { tenantIds: [p.tenantId], legalEntityIds: [], countryCodes: [], entities: [], tenantCountries: [], enterprise: true },
        target: { tenantId: p.tenantId, legalEntityId: null, countryCode: null },
        osId: "BEYU",
        question: "Who authorizes retrieval before context assembly?",
      });
      expect(results.some((result) => result.ref === "P5-KNOWLEDGE-RETRIEVE")).toBe(true);
    });
  });

  it("records evaluation runs and red-team results honestly", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      const run = await evaluation.recordRun({
        principal: p,
        traceId: "TRACE_P5_EVAL",
        runCode: "EVAL-P5-001",
        task: "accuracy",
        modelId: "MOD_NOELIA_DET",
        modelVersion: "2026.09",
        providerId: "PROV_NOELIA_DET",
        dataset: "non-sensitive-attestation-set",
        testSuite: "phase5-continuous-eval",
        metric: "attestation-accuracy",
        score: "0.98",
        threshold: "0.90",
        status: "PASS",
      });
      expect(run.runId).toMatch(/^AER_/);
      const [row] = await db.select().from(noeliaAiEvaluationRuns).where(eq(noeliaAiEvaluationRuns.id, run.runId));
      expect(row?.score).toBe("0.98");
      expect(row?.status).toBe("PASS");

      const red = await evaluation.recordRedTeamResult({
        principal: p,
        traceId: "TRACE_P5_RED",
        resultCode: "RED-P5-001",
        caseId: "CASE-P5-001",
        category: "INJECTION",
        attackType: "DIRECT_PROMPT_INJECTION",
        scenario: "Attempt to override system policy.",
        target: "RUNTIME",
        severity: "HIGH",
        outcome: "BLOCKED",
        evidenceRef: "tests/noelia/governance.test.ts",
        ownerRole: "AI SECURITY",
      });
      expect(red.outcome).toBe("BLOCKED");
      expect((await evaluation.summary({ principal: p })).runs).toBeGreaterThanOrEqual(1);
    });
  });

  it("verifies the model supply chain without fabricating VERIFIED and governs fallback", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      // The seeded deterministic analyst has no registered artifact/checksum
      // yet, so an honest verification must NOT claim VERIFIED.
      const report = await modelOps.verifyModelSupplyChain({
        principal: p,
        traceId: "TRACE_P5_SUPPLY",
        modelId: "MOD_NOELIA_DET",
        modelVersion: "2026.09",
      });
      expect(report.status).not.toBe("VERIFIED");
      expect(report.integrityOk).toBe(false);

      // Governed fallback may select the active/approved deterministic model.
      const fallback = await modelOps.resolveGovernedFallback({
        principal: p,
        traceId: "TRACE_P5_FAILOVER",
        requestId: "REQ_P5_FAILOVER",
        tenantId: p.tenantId,
        countryCode: null,
        osId: "BEYU",
        task: "demonstrate",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
        candidates: [
          { modelId: "MOD_NOELIA_DET", modelVersion: "2026.09", providerId: "PROV_NOELIA_DET" },
        ],
      });
      expect(fallback.decision).toBe("SELECTED");

      // An unregistered candidate is never selected; no compliant fallback -> FAIL_CLOSED.
      const missing = await modelOps.resolveGovernedFallback({
        principal: p,
        traceId: "TRACE_P5_FAILOVER_MISSING",
        requestId: "REQ_P5_FAILOVER_MISSING",
        tenantId: p.tenantId,
        countryCode: null,
        osId: "BEYU",
        task: "demonstrate",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
        candidates: [{ modelId: "MOD_NOT_EXIST", modelVersion: "1.0", providerId: null }],
      });
      expect(missing.decision).toBe("FAIL_CLOSED");
    });
  });

  it("runs the production resilience guard and reports honest health", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      const ok = await resilience.guardedCall({
        principal: p,
        traceId: "TRACE_P5_RESILIENCE",
        requestId: "REQ_P5_RESILIENCE",
        task: "demonstrate",
        capability: "governed-analysis",
        modelId: "MOD_NOELIA_DET",
        modelVersion: "2026.09",
        providerId: "PROV_NOELIA_DET",
        operation: async () => "ok",
      });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.value).toBe("ok");
      expect(ok.circuit).toBe("CLOSED");

      const health = await resilience.healthSummary(p);
      expect(health.realGenerativeInference).toBe("BLOCKED");
      expect(health.databaseContextBound).toBe(true);
    });
  });

  it("produces an honest continuous assurance attestation without claiming real inference", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const p = phase5Principal();
      const attestation = await assurance.attest({
        principal: p,
        traceId: "TRACE_P5_ASSURANCE",
        requestId: "REQ_P5_ASSURANCE",
      });
      expect(attestation.framework).toBe("BEYU_REALITY_ASSURANCE");
      expect(attestation.realGenerativeInference).toBe("BLOCKED");
      expect(attestation.status).not.toBe("PASS");
      expect(attestation.checks.some((c) => c.id === "ASSURANCE-006")).toBe(true);
      expect(attestation.checks.find((c) => c.id === "ASSURANCE-006")?.status).toBe("ENVIRONMENT_LIMITED");
    });
  });

  it("returns the honest Phase 5 status block", async () => {
    await inRollbackedScope(phase5Principal(), async () => {
      const block = await phase5StatusBlock(phase5Principal());
      const keys = block.rows.map((r) => r.key);
      expect(keys).toContain("PHASE_5_IMPLEMENTATION");
      expect(keys).toContain("REAL_GENERATIVE_INFERENCE");
      expect(keys).toContain("ACTUAL_CERTIFICATION_STATUS");
      const real = block.rows.find((r) => r.key === "REAL_GENERATIVE_INFERENCE");
      expect(real?.status).toBe("ENVIRONMENT_LIMITED");
      const cert = block.rows.find((r) => r.key === "ACTUAL_CERTIFICATION_STATUS");
      expect(cert?.status).toBe("NOT_CERTIFIED");
    });
  });
});
