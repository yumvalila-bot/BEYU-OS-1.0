import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { db, pool } from "../../src/db";
import { adminDb, adminPool } from "../../src/db/admin";
import {
  approvals,
  enterpriseMemory,
  modelRegistry,
  noeliaWorkflowSteps,
  noeliaWorkflows,
} from "../../src/db/schema";
import { BeyuNoeliaWorkflowService } from "../../src/lib/noelia/workflows";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import { ENGINE_TOOLS } from "../../src/lib/noelia/runtime";
import { BeyuNoeliaAnalyticsService } from "../../src/lib/noelia/analytics-service";
import { BeyuNoeliaModelGateway } from "../../src/lib/noelia/model-gateway";
import { synthesizeExecutiveBriefing, type BriefingInputs } from "../../src/lib/noelia/executive";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "../../src/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import type { NoeliaRecommendation, NoeliaToolOutput, ToolInvocationContext } from "../../src/lib/noelia/types";
import { seededPrincipal } from "./db-fixtures";

const workflowIds: string[] = [];
const approvalIds: string[] = [];
const memoryIds: string[] = [];

async function rememberWorkflow<T extends { workflowId: string | null; approvalId?: string | null }>(result: T): Promise<T> {
  if (result.workflowId) workflowIds.push(result.workflowId);
  if (result.approvalId) approvalIds.push(result.approvalId);
  return result;
}

const trace = () => `TRACE_EXP_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function tenantContext(principal: Awaited<ReturnType<typeof seededPrincipal>>): Promise<ToolInvocationContext> {
  const scope = await resolveNoeliaAuthorizedScope(principal);
  const target = requestedNoeliaTarget(principal, null);
  return { principal, traceId: trace(), target, scope };
}

beforeAll(async () => {
  const stale = await db.select({ id: noeliaWorkflows.id })
    .from(noeliaWorkflows)
    .where(eq(noeliaWorkflows.requestedBy, "completeness-expansion"));
  if (stale.length) {
    await db.delete(noeliaWorkflowSteps).where(inArray(noeliaWorkflowSteps.workflowId, stale.map((r) => r.id)));
    await db.delete(noeliaWorkflows).where(inArray(noeliaWorkflows.id, stale.map((r) => r.id)));
  }
});

afterAll(async () => {
  if (workflowIds.length) {
    await db.delete(noeliaWorkflowSteps).where(inArray(noeliaWorkflowSteps.workflowId, workflowIds));
    await db.delete(noeliaWorkflows).where(inArray(noeliaWorkflows.id, workflowIds));
  }
  if (approvalIds.length) {
    await db.delete(approvals).where(inArray(approvals.id, approvalIds));
  }
  if (memoryIds.length) {
    await db.delete(enterpriseMemory).where(inArray(enterpriseMemory.id, memoryIds));
  }
  await db.execute(sql`delete from approvals where id = 'APR_RLS_PROBE'`).catch(() => undefined);
  // Role lifecycle is an administrative operation: the runtime role is
  // intentionally NOT CREATEROLE, so the probe role is created/dropped through
  // the admin (migration) handle.
  await adminDb.execute(sql`drop owned by beyu_rls_probe`).catch(() => undefined);
  await adminDb.execute(sql`drop role if exists beyu_rls_probe`).catch(() => undefined);
  await pool.end();
  await adminPool.end();
});

describe("Noelia completeness expansion", () => {
  it("every engine-referenced tool is registered — no dead-end dispatchers", async () => {
    const registry = createDefaultNoeliaToolRegistry();
    const registered = new Set(registry.list().filter((t) => t.registered).map((t) => t.name));
    for (const tools of Object.values(ENGINE_TOOLS)) {
      for (const name of tools) {
        expect(registered.has(name), `engine tool '${name}' must be registered (no dead-end dispatcher)`).toBe(true);
      }
    }
  });

  it("analytics.run dispatcher executes governed analyses (regression: was TOOL_UNKNOWN)", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return registry.invoke("analytics.run", context, { analysisType: "KPI_ANALYSIS" });
    });
    expect(out.allowed).toBe(true);
    if (!out.allowed) throw new Error("analytics.run must be allowed");
    expect(out.output.findings?.length ?? 0).toBeGreaterThan(0);
  });

  it("STRATEGIC_VARIANCE derives objective progress from governed targets (DERIVED, never invented)", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const analytics = new BeyuNoeliaAnalyticsService();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return analytics.analyze("STRATEGIC_VARIANCE", context);
    });
    expect(out.findings?.length ?? 0).toBeGreaterThan(0);
    const so1 = (out.findings ?? []).find((f) => f.label.includes("SO-1"));
    expect(so1).toBeDefined();
    expect(so1?.status).toBe("DERIVED");
    // Seeded SO-1: 28,560,000 / 40,000,000 = 71.4%
    expect(so1?.value).toContain("71.4%");
  });

  it("STRATEGIC_VARIANCE is UNAVAILABLE outside the resolved scope (no cross-tenant inference)", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const analytics = new BeyuNoeliaAnalyticsService();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      context.scope = { ...context.scope, tenantIds: ["TEN_DOES_NOT_EXIST"], entities: [] };
      return analytics.analyze("STRATEGIC_VARIANCE", context);
    });
    expect(out.findings?.[0]?.status).toBe("UNAVAILABLE");
    expect(out.findings?.[0]?.value).toBe("DATA_NOT_AVAILABLE");
  });

  it("OPPORTUNITY_DETECTION emits only observed positive signals, labeled as candidates", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const analytics = new BeyuNoeliaAnalyticsService();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return analytics.analyze("OPPORTUNITY_DETECTION", context);
    });
    const findings = out.findings ?? [];
    if (findings.length === 0 || findings[0]?.status === "UNAVAILABLE") {
      // Honest NONE_OBSERVED path — acceptable, but it must not fabricate.
      expect((out.headline ?? "").toLowerCase()).toContain("unavailable");
    } else {
      expect((out.headline ?? "").toLowerCase()).toContain("candidate");
      for (const f of findings) {
        expect(["OBSERVED", "DERIVED"].includes(f.status ?? "")).toBe(true);
      }
    }
  });

  it("EARLY_WARNING reports only observed deterioration signals and flags human review", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const analytics = new BeyuNoeliaAnalyticsService();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return analytics.analyze("EARLY_WARNING", context);
    });
    const findings = out.findings ?? [];
    if (findings.some((f) => f.status === "OBSERVED" && f.label !== "Early-warning signals")) {
      expect(out.humanReviewRequired).toBe(true);
    }
    for (const f of findings) {
      expect(["FACT", "INFERENCE", "RECOMMENDATION"].includes(f.kind)).toBe(true);
      expect(["OBSERVED", "DERIVED", "UNAVAILABLE"].includes(f.status ?? "")).toBe(true);
    }
  });

  it("governance.strategic.objectives tool is registered and returns scoped objectives", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return registry.invoke("governance.strategic.objectives", context, {});
    });
    expect(out.allowed).toBe(true);
    if (!out.allowed) throw new Error("strategic objectives tool must be allowed");
    expect(out.output.findings?.some((f) => f.label.includes("SO-1"))).toBe(true);
  });

  it("GOVERNANCE_ANALYSIS reports scoped control-plane posture (OBSERVED/UNAVAILABLE, never fabricated)", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const analytics = new BeyuNoeliaAnalyticsService();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return analytics.analyze("GOVERNANCE_ANALYSIS", context);
    });
    expect(out.headline).toContain("Governance posture");
    const byLabel = new Map((out.findings ?? []).map((f) => [f.label, f]));
    expect(byLabel.get("Active policies in scope")?.status).toBe("OBSERVED");
    expect(byLabel.get("Strategic objectives")?.status).toBe("OBSERVED");
    expect(byLabel.get("Compliance obligations")?.status).toBe("OBSERVED");
  });

  it("GOVERNANCE_ANALYSIS fails closed for an out-of-scope tenant (no cross-tenant inference)", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const analytics = new BeyuNoeliaAnalyticsService();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      // Scope limited to a tenant that does not exist in the principal's scope.
      context.scope = { ...context.scope, tenantIds: ["TEN_DOES_NOT_EXIST"], entities: [] };
      return analytics.analyze("GOVERNANCE_ANALYSIS", context);
    });
    const byLabel = new Map((out.findings ?? []).map((f) => [f.label, f]));
    // Tenant-scoped rows must be invisible outside the scope; global policies
    // remain legitimately visible (they apply enterprise-wide).
    for (const label of ["Strategic objectives", "Compliance obligations", "Overdue compliance obligations"]) {
      expect(byLabel.get(label)?.status).toBe("UNAVAILABLE");
      expect(byLabel.get(label)?.value).toBe("0");
    }
  });

  it("executive brief exposes §III sections derived only from registered output", () => {
    const recommendation: NoeliaRecommendation = {
      id: "REC_1",
      headline: "Diversify treasury holdings",
      rationale: "Concentration signal from registered treasury output.",
      evidence: ["TREASURY:2026-08"],
      assumptions: ["Market conditions unchanged."],
      uncertainty: ["FX volatility"],
      limitations: ["Single-period view"],
      confidence: 0.62,
      sourceProvenance: ["TREASURY"],
      whatWouldChange: ["A material FX move would change the recommendation."],
      risks: ["Counterparty risk"],
      alternatives: ["Hold cash", "Extend maturities"],
      humanDecisionRequired: true,
      horizon: "HORIZON_2_NEAR_TERM",
      status: "RECOMMENDATION",
    };
    const inputs: BriefingInputs = {
      principal: { userId: "USR_T", tenantId: "TEN_T", roles: [], permissions: [], clearance: "INTERNAL" } as never,
      target: { tenantId: "TEN_T", legalEntityId: null, countryCode: null },
      scope: { tenantIds: ["TEN_T"], legalEntityIds: [], countryCodes: [], entities: [], tenantCountries: [], enterprise: false },
      horizon: "HORIZON_3_MEDIUM_TERM",
      structure: "BOARD",
      policy: { effect: "ALLOW", obligations: [], denials: [], appliedPolicies: [] },
      toolOutputs: [{
        findings: [{ label: "Liquidity ratio", value: "1.8", kind: "FACT", status: "OBSERVED" }],
        risks: ["FX concentration"],
        metrics: [{
          code: "LIQUIDITY", label: "Liquidity", value: "1.8", status: "OBSERVED",
          confidence: 0.9, source: "TREASURY", period: "2026-08", trend: "UP",
        }],
        recommendations: [recommendation],
      }],
      toolsUsed: ["finance.treasury.aggregate"],
      deniedScopes: ["HEALTH"],
      traceId: "TRACE_UNIT_1",
      correlationId: "TRACE_UNIT_1",
      latencyMs: 1,
    };
    const brief = synthesizeExecutiveBriefing(inputs);
    expect(brief.structure).toBe("BOARD");
    expect(brief.enterprisePosition[0]).toContain("Liquidity");
    expect(brief.strategicVariance[0]).toContain("trend UP");
    expect(brief.kpiInterpretation[0]).toContain("confidence 0.90");
    expect(brief.materialItems.some((m) => m.startsWith("Candidate material item"))).toBe(true);
    expect(brief.opportunities).toEqual([]);
    expect(brief.recommendationComparison).toHaveLength(1);
    expect(brief.recommendationComparison[0].condition).toContain("FX move");
  });

  it("executive brief never asserts position/variance when no metric is observed", () => {
    const inputs: BriefingInputs = {
      principal: { userId: "USR_T", tenantId: "TEN_T", roles: [], permissions: [], clearance: "INTERNAL" } as never,
      target: { tenantId: "TEN_T", legalEntityId: null, countryCode: null },
      scope: { tenantIds: ["TEN_T"], legalEntityIds: [], countryCodes: [], entities: [], tenantCountries: [], enterprise: false },
      horizon: "HORIZON_2_NEAR_TERM",
      policy: { effect: "ALLOW", obligations: [], denials: [], appliedPolicies: [] },
      toolOutputs: [],
      toolsUsed: [],
      deniedScopes: [],
      traceId: "TRACE_UNIT_2",
      correlationId: "TRACE_UNIT_2",
      latencyMs: 1,
    };
    const brief = synthesizeExecutiveBriefing(inputs);
    expect(brief.enterprisePosition[0]).toContain("UNAVAILABLE");
    expect(brief.strategicVariance[0]).toContain("UNAVAILABLE");
    expect(brief.kpiInterpretation[0]).toContain("UNAVAILABLE");
    expect(brief.materialItems[0]).toContain("no candidate");
  });

  it("cross-OS intelligence reports unregistered domains as UNAVAILABLE, never fabricated", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return registry.invoke("cross.os.intelligence", context, {
        domains: ["FINANCE", "AGRICULTURE", "FOUNDATION"],
      });
    });
    expect(out.allowed).toBe(true);
    if (!out.allowed) throw new Error("cross-OS invocation must be allowed");
    const metadata = out.output.metadata as { domains: string[]; denied: string[]; unavailable: string[] };
    expect(metadata.domains).toHaveLength(3);
    expect(metadata.unavailable).toEqual(expect.arrayContaining(["AGRICULTURE", "FOUNDATION"]));
    const unavailableFindings = (out.output.findings ?? []).filter((f) => f.status === "UNAVAILABLE");
    expect(unavailableFindings.length).toBeGreaterThanOrEqual(2);
    expect(out.output.headline).toContain("unavailable");
  });

  it("quorum: execution is denied until distinct approvers complete the quorum", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const governance = await seededPrincipal("governance@beyu.os");
    const ceo = await seededPrincipal("ceo@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();

    const planned = await rememberWorkflow(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Quorum probe: two distinct approvers must authorize before execution.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [
          { toolName: "finance.cash.position", input: {} },
          { toolName: "finance.maturity.profile", input: {} },
        ],
      },
    }));
    await service.validate({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });

    const first = await rememberWorkflow(await service.authorize({
      principal: governance, workflowId: planned.workflowId!, traceId: trace(), quorum: 2,
    }));
    expect(first.code).toBe("QUORUM_PARTIAL");

    const denied = await service.execute({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    expect(denied.code).toBe("QUORUM_NOT_MET");
    expect(denied.reason).toContain("1/2");

    // The same approver cannot satisfy the quorum twice.
    const repeat = await service.authorize({
      principal: governance, workflowId: planned.workflowId!, traceId: trace(),
    });
    expect(repeat.code).toBe("AUTHORIZATION_DENIED");
    expect(repeat.reason).toContain("distinct approvers");

    const second = await rememberWorkflow(await service.authorize({
      principal: ceo, workflowId: planned.workflowId!, traceId: trace(),
    }));
    expect(second.code).toBe("AUTHORIZED");

    const executed = await service.execute({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    expect(executed.status).toBe("COMPLETED");
    expect(executed.stepResults).toHaveLength(2);
  });

  it("approval expiry: an APPROVED decision past its validity window is no authority", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const governance = await seededPrincipal("governance@beyu.os");
    const service = new BeyuNoeliaWorkflowService();
    const registry = createDefaultNoeliaToolRegistry();

    const planned = await rememberWorkflow(await service.create({
      principal: cfo,
      traceId: trace(),
      plan: {
        goal: "Expiry probe: a lapsed approval must never authorize execution.",
        target: { tenantId: cfo.tenantId, legalEntityId: null, countryCode: null },
        steps: [{ toolName: "finance.cash.position", input: {} }],
      },
    }));
    await service.validate({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    await rememberWorkflow(await service.authorize({
      principal: governance,
      workflowId: planned.workflowId!,
      traceId: trace(),
      validUntil: new Date(Date.now() - 60_000),
    }));
    const denied = await service.execute({ principal: cfo, registry, workflowId: planned.workflowId!, traceId: trace() });
    expect(denied.code).toBe("EXPIRED_APPROVAL");
    expect(denied.reason).toContain("expired");
  });

  it("model registry read exposes the governed metadata contract (latency/fallback/effective/retired)", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    await db.insert(modelRegistry).values({
      id: "MOD_PROBE_001",
      provider: "probe-provider",
      model: "probe-model",
      version: "0.0.1",
      status: "ACTIVE",
      maxClassification: "RESTRICTED",
      jurisdictionRestrictions: ["TZ"],
      timeoutMs: 4000,
      costPerToken: {},
      approvedBy: "USR_PROBE",
      latencyMs: 120,
      fallbackModelId: "MOD_FALLBACK_001",
      effectiveFrom: "2026-01-01",
      retiredAt: null,
    });
    const gateway = new BeyuNoeliaModelGateway();
    const out = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      const result = await gateway.registry(context);
      return result;
    });
    const models = (out.metadata as { models: Record<string, unknown>[] }).models;
    expect(models.length).toBeGreaterThan(0);
    const probe = models.find((m) => m.id === "MOD_PROBE_001");
    expect(probe).toBeDefined();
    expect(probe).toMatchObject({
      provider: "probe-provider",
      model: "probe-model",
      status: "ACTIVE",
      maxClassification: "RESTRICTED",
      latencyMs: 120,
      fallbackModelId: "MOD_FALLBACK_001",
      effectiveFrom: "2026-01-01",
      retiredAt: null,
    });
    await db.delete(modelRegistry).where(eq(modelRegistry.id, "MOD_PROBE_001"));
  });

  it("ENTERPRISE memory class is accepted and governed by the same visibility rules", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const registry = createDefaultNoeliaToolRegistry();
    const written = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return registry.invoke("memory.write", context, {
        memoryClass: "ENTERPRISE",
        content: "Enterprise-level governed note for the completeness mandate.",
        classification: "INTERNAL",
        retentionCode: "STANDARD",
      });
    });
    expect(written.allowed).toBe(true);
    if (!written.allowed) throw new Error("memory write must be allowed");
    const writtenId = (written.output.metadata as { memoryId?: string } | undefined)?.memoryId;
    expect(writtenId).toBeTruthy();
    if (writtenId) memoryIds.push(writtenId);
    const read = await withTenantDatabaseContext(cfo, async () => {
      const context = await tenantContext(cfo);
      return registry.invoke("memory.read", context, { query: "Enterprise-level governed note", memoryClass: "ENTERPRISE" });
    });
    expect(read.allowed).toBe(true);
    if (!read.allowed) throw new Error("memory read must be allowed");
    const records = (read.output.metadata as { records?: { id: string; memoryClass: string }[] } | undefined)?.records ?? [];
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records.every((r) => r.memoryClass === "ENTERPRISE")).toBe(true);
  });

  it("approvals RLS enforces tenant isolation for a non-superuser role", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    // Role lifecycle is administrative; the runtime role is NOT CREATEROLE.
    await adminDb.execute(sql`drop owned by beyu_rls_probe`).catch(() => undefined);
    await adminDb.execute(sql`drop role if exists beyu_rls_probe`);
    await adminDb.execute(sql`create role beyu_rls_probe login`);
    await adminDb.execute(sql`grant usage on schema public to beyu_rls_probe`);
    await adminDb.execute(sql`grant select on tenants to beyu_rls_probe`);
    await adminDb.execute(sql`grant select, insert on approvals to beyu_rls_probe`);
    await adminDb.execute(sql`grant execute on function public.beyu_tenant_ids() to beyu_rls_probe`);
    const url = new URL(process.env.DATABASE_URL!);
    url.username = "beyu_rls_probe";
    url.password = "";
    const probe = new Client({ connectionString: url.toString() });
    await probe.connect();
    try {
      await probe.query("select set_config('beyu.current_tenant_ids', $1, false)", [cfo.tenantId]);
      await probe.query(
        `insert into approvals (id, tenant_id, object_type, object_id, approver_role, decision, requested_by)
         values ('APR_RLS_PROBE', $1, 'RLS_PROBE', 'OBJ', 'TEST', 'APPROVED', 'USR_PROBE')`,
        [cfo.tenantId],
      );
      await probe.query("select set_config('beyu.current_tenant_ids', 'TEN_OTHER', false)");
      const hidden = await probe.query(`select count(*)::int as n from approvals where id = 'APR_RLS_PROBE'`);
      expect(hidden.rows[0].n).toBe(0);
      await probe.query("select set_config('beyu.current_tenant_ids', $1, false)", [cfo.tenantId]);
      const visible = await probe.query(`select count(*)::int as n from approvals where id = 'APR_RLS_PROBE'`);
      expect(visible.rows[0].n).toBe(1);
    } finally {
      await probe.end();
    }
  });
});
