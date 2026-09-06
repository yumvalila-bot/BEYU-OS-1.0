/**
 * Phase 1 — Noelia AI platform schema (0023).
 *
 * These tests prove the provider-independent layer:
 *  - model routing is deterministic and governed,
 *  - routing fails closed when a kill switch or approval is missing,
 *  - routing decisions and incidents are tenant-scoped through RLS,
 *  - external/unknown providers never become default-active.
 */
import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { db, withDatabaseTransactionContext } from "@/db";
import {
  modelRegistry,
  noeliaIncidents,
  noeliaKillSwitch,
  noeliaRoutingDecisions,
  noeliaProviders,
} from "@/db/schema";
import { BeyuNoeliaAiPlatformService } from "@/lib/noelia/ai-platform";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { principal } from "./fixtures";

const ROLLBACK = "__ROLLBACK__";
const service = new BeyuNoeliaAiPlatformService();

function globalPrincipal(): Principal {
  return principal({
    tenantId: "TEN_BEYU",
    tenantCode: "BEYU",
    tenantType: "ENTERPRISE",
    roles: ["PLATFORM_ADMIN"],
    permissions: new Set(["ai:model.registry.read", "ai:model.router.read", "ai:identity.read"]),
    clearance: "RESTRICTED",
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

describe("Noelia AI platform routing (migration 0023)", () => {
  it("routes deterministically to the seeded governed model and records a non-sensitive decision", async () => {
    await inRollbackedScope(globalPrincipal(), async () => {
      const p = globalPrincipal();
      const tenant = "TEN_BEYU_TZ";
      const context = {
        principal: p,
        traceId: "TRACE_AI_PLATFORM_ROUTE",
        target: { tenantId: tenant, legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: [tenant],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      };
      const verdict = await service.route(context, {
        tenantId: tenant,
        legalEntityId: null,
        countryCode: null,
        task: "Summarize governed treasury evidence",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
      });

      expect(verdict.decision).toBe("SELECTED");
      expect(verdict.selectedModelId).toBe("MOD_NOELIA_DET");
      expect(verdict.selectedProviderId).toBe("PROV_NOELIA_DET");
      expect(verdict.routingId).toMatch(/^ART_/);

      const [row] = await db
        .select()
        .from(noeliaRoutingDecisions)
        .where(eq(noeliaRoutingDecisions.id, verdict.routingId));
      expect(row).toBeDefined();
      expect(row.decision).toBe("SELECTED");
      expect(row.tenantId).toBe(tenant);
      expect(row.task).toBe("Summarize governed treasury evidence");
    });
  });

  it("fails closed when an active kill switch targets the requested capability", async () => {
    await inRollbackedScope(globalPrincipal(), async () => {
      const p = globalPrincipal();
      const tenant = "TEN_BEYU_TZ";
      const context = {
        principal: p,
        traceId: "TRACE_AI_PLATFORM_KILLSWITCH",
        target: { tenantId: tenant, legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: [tenant],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      };

      await db.insert(noeliaKillSwitch).values({
        id: "AKS_TEST_CAPABILITY",
        targetType: "CAPABILITY",
        targetRef: "governed-analysis",
        enabled: true,
        reason: "Test containment: governed-analysis suspended.",
        activatedBy: "USR_TEST",
      }).onConflictDoNothing({ target: [noeliaKillSwitch.targetType, noeliaKillSwitch.targetRef] });

      const output = await service.routeOutput(context, {
        tenantId: tenant,
        legalEntityId: null,
        countryCode: null,
        task: "Summarize governed treasury evidence",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
      });

      const metadata = output.metadata as { verdict?: { decision: string; selectedModelId: string | null; reasons: string[] } };
      expect(metadata?.verdict?.decision).toBe("FAIL_CLOSED");
      expect(metadata?.verdict?.selectedModelId).toBeNull();
      expect(metadata?.verdict?.reasons.join(" ")).toMatch(/kill switch/i);

      const rows = await db
        .select()
        .from(noeliaRoutingDecisions)
        .where(inArray(noeliaRoutingDecisions.tenantId, [tenant]));
      const deniedRow = rows.find((r) => r.decision === "FAIL_CLOSED");
      expect(deniedRow).toBeDefined();
      expect(deniedRow?.selectedModelId).toBeNull();

      const existing = await db
        .select()
        .from(noeliaKillSwitch)
        .where(eq(noeliaKillSwitch.id, "AKS_TEST_CAPABILITY"));
      expect(existing[0]?.enabled).toBe(true);
    });
  });

  it("does not route through an inactive external provider", async () => {
    await inRollbackedScope(globalPrincipal(), async () => {
      const p = globalPrincipal();
      const tenant = "TEN_BEYU_TZ";
      const context = {
        principal: p,
        traceId: "TRACE_AI_PLATFORM_EXTERNAL",
        target: { tenantId: tenant, legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: [tenant],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      };
      const reg = await service.registerProvider(context, {
        id: "PROV_EXT_TEST",
        providerName: "external-unactivated-test",
        providerType: "EXTERNAL",
        endpoint: "https://unused.example.invalid",
        description: "Test provider that must remain inactive.",
      });
      expect(reg.headline).toMatch(/INACTIVE/);

      const verdict = await service.route(context, {
        tenantId: tenant,
        legalEntityId: null,
        countryCode: null,
        task: "Summarize governed treasury evidence",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
      });
      // The only governed model is BEYU-owned; an external provider cannot
      // displace it merely by being registered.
      expect(verdict.selectedProviderId).toBe("PROV_NOELIA_DET");
    });
  });

  it("isolates routing decisions and incidents by tenant scope", async () => {
    const p = globalPrincipal();
    // Deterministic seed tenants. The two are distinct so RLS isolation can
    // be proven without relying on unspecified table order.
    const tenantA = "TEN_BEYU_TZ";
    const tenantB = "TEN_BEYU_AGRI";
    expect(tenantA).not.toBe(tenantB);
    const suffix = `${Date.now()}`;
    const incidentId = `AIC_ISO_${suffix}`;
    const contextA = {
      principal: p,
      traceId: `TRACE_ISOLATION_A_${suffix}`,
      target: { tenantId: tenantA, legalEntityId: null, countryCode: null },
      scope: {
        tenantIds: [tenantA],
        legalEntityIds: [],
        countryCodes: [],
        entities: [],
        tenantCountries: [],
        enterprise: true,
      },
    };
    let routingId: string | null = null;
    try {
      // Setup writes inside a global governance scope (committed so a separate
      // tenant-scoped transaction can prove RLS against persisted rows).
      await withTenantDatabaseContext(p, async () => {
        const verdict = await service.route(contextA, {
          tenantId: tenantA,
          legalEntityId: null,
          countryCode: null,
          task: "Isolation A",
          capability: "governed-analysis",
          classification: "RESTRICTED",
          riskLevel: "LOW",
        });
        routingId = verdict.routingId;
        await db.insert(noeliaIncidents).values({
          id: incidentId,
          incidentCode: `INC_ISO_${suffix}`,
          classification: "TENANT_LEAK",
          severity: "HIGH",
          status: "OPEN",
          tenantId: tenantB,
          traceId: `TRACE_ISO_B_${suffix}`,
          description: "Tenant B incident must not be visible without scope.",
          createdBy: "USR_TEST",
        });
      });

      // RLS isolation is proven through the RUNTIME role (BY-PASS-RLS off),
      // explicitly, because the unit-test setup repoints DATABASE_URL at a
      // privileged TEST role that legitimately bypasses RLS. This mirrors the
      // dedicated adversarial RLS suite for tenant/entity isolation.
      const runtimeUrl = process.env.BEYU_RUNTIME_DATABASE_URL;
      expect(runtimeUrl).toBeTruthy();
      const runtime = new Client({ connectionString: runtimeUrl });
      await runtime.connect();
      try {
        await runtime.query("begin");
        await runtime.query("select set_config('beyu.current_tenant_ids', $1, true)", [tenantA]);
        await runtime.query("select set_config('beyu.global_scope', 'off', true)");
        const routing = await runtime.query(
          "select tenant_id from noelia_routing_decisions where tenant_id = any($1::text[])",
          [[tenantA, tenantB]],
        );
        const incidents = await runtime.query(
          "select tenant_id from noelia_incidents where tenant_id = any($1::text[])",
          [[tenantA, tenantB]],
        );
        expect((routing.rows as Array<{ tenant_id: string }>).map((r) => r.tenant_id)).not.toContain(tenantB);
        expect((incidents.rows as Array<{ tenant_id: string }>).map((r) => r.tenant_id)).not.toContain(tenantB);
      } finally {
        await runtime.query("rollback").catch(() => undefined);
        await runtime.end().catch(() => undefined);
      }
    } finally {
      await withTenantDatabaseContext(p, async () => {
        await db.delete(noeliaIncidents).where(eq(noeliaIncidents.id, incidentId));
        if (routingId) {
          await db.delete(noeliaRoutingDecisions).where(eq(noeliaRoutingDecisions.id, routingId));
        }
      });
    }
  });

  it("reports an empty AI risk register honestly as evidence-only", async () => {
    await inRollbackedScope(globalPrincipal(), async () => {
      const p = globalPrincipal();
      const context = {
        principal: p,
        traceId: "TRACE_AI_PLATFORM_RISK",
        target: { tenantId: p.tenantId, legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: [p.tenantId],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      };
      const output = await service.riskRegister(context);
      const count = (await db.execute(
        sql`select count(*)::int as n from noelia_risk_register`,
      )) as unknown as { rows?: Array<{ n: number }> };
      const n = Number(count.rows?.[0]?.n ?? 0);
      expect(output.findings?.length ?? 0).toBe(n);
      expect(output.narrative).toMatch(/governance record/);
    });
  });

  it("does not select an unapproved model even when it would otherwise match", async () => {
    await inRollbackedScope(globalPrincipal(), async () => {
      const p = globalPrincipal();
      const tenant = "TEN_BEYU_TZ";
      await db.insert(noeliaProviders).values({
        id: "PROV_UNREVIEWED_TEST",
        providerName: "unreviewed-model-test",
        providerType: "OPEN_WEIGHT",
        ownership: "BEYU",
        endpoint: null,
        region: null,
        dataResidency: "BEYU_CONTROLLED",
        authenticationMethod: "NONE",
        securityStatus: "NOT_ASSESSED",
        complianceStatus: "NOT_ASSESSED",
        active: true,
        assessment: {},
        createdBy: "USR_TEST",
      }).onConflictDoNothing({ target: noeliaProviders.id });
      await db.insert(modelRegistry).values({
        id: "MOD_UNREVIEWED_TEST",
        provider: "unreviewed-model-test",
        model: "unreviewed-model-test",
        version: "1.0.0",
        status: "ACTIVE",
        maxClassification: "RESTRICTED",
        jurisdictionRestrictions: [],
        capabilityMetadata: {},
        approvedBy: "USR_TEST",
        providerId: "PROV_UNREVIEWED_TEST",
        modelFamily: "TEST",
        modelType: "SELF_HOSTED",
        deploymentType: "SELF_HOSTED",
        dataResidency: "BEYU_CONTROLLED",
        riskLevel: "HIGH",
        approvalStatus: "PENDING",
        evaluationStatus: "NOT_EVALUATED",
        securityStatus: "NOT_ASSESSED",
        createdBy: "USR_TEST",
      }).onConflictDoNothing({ target: [modelRegistry.provider, modelRegistry.model, modelRegistry.version] });

      const context = {
        principal: p,
        traceId: "TRACE_AI_PLATFORM_UNAPPROVED",
        target: { tenantId: tenant, legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: [tenant],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      };
      const verdict = await service.route(context, {
        requestId: "REQ_UNAPPROVED_SELECTION",
        tenantId: tenant,
        legalEntityId: null,
        countryCode: null,
        task: "select a model",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
      });
      expect(verdict.decision).toBe("SELECTED");
      expect(verdict.selectedModelId).toBe("MOD_NOELIA_DET");
    });
  });

  it("does not route restricted data to an external/non-BEYU-controlled provider", async () => {
    await inRollbackedScope(globalPrincipal(), async () => {
      const p = globalPrincipal();
      const tenant = "TEN_BEYU_TZ";
      await db.insert(noeliaProviders).values({
        id: "PROV_EXT_ACTIVE_TEST",
        providerName: "external-active-test",
        providerType: "EXTERNAL",
        ownership: "EXTERNAL",
        endpoint: "https://unused.example.invalid",
        region: "us-east-1",
        dataResidency: "EXTERNAL_US",
        authenticationMethod: "API_KEY",
        securityStatus: "ASSESSED",
        complianceStatus: "NOT_ASSESSED",
        active: true,
        assessment: {},
        createdBy: "USR_TEST",
      }).onConflictDoNothing({ target: noeliaProviders.id });
      await db.insert(modelRegistry).values({
        id: "MOD_EXT_ACTIVE_TEST",
        provider: "external-active-test",
        model: "external-active-test",
        version: "1.0.0",
        status: "ACTIVE",
        maxClassification: "RESTRICTED",
        jurisdictionRestrictions: [],
        capabilityMetadata: {},
        approvedBy: "USR_TEST",
        providerId: "PROV_EXT_ACTIVE_TEST",
        modelFamily: "TEST",
        modelType: "FOUNDATION_MODEL",
        deploymentType: "EXTERNAL",
        hostingLocation: "us-east-1",
        dataResidency: "EXTERNAL_US",
        riskLevel: "HIGH",
        approvalStatus: "APPROVED",
        evaluationStatus: "APPROVED",
        securityStatus: "ASSESSED",
        createdBy: "USR_TEST",
      }).onConflictDoNothing({ target: [modelRegistry.provider, modelRegistry.model, modelRegistry.version] });

      const context = {
        principal: p,
        traceId: "TRACE_AI_PLATFORM_EXTERNAL_DATA",
        target: { tenantId: tenant, legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: [tenant],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      };
      const verdict = await service.route(context, {
        requestId: "REQ_EXTERNAL_RESTRICTED",
        tenantId: tenant,
        legalEntityId: null,
        countryCode: null,
        task: "restricted data must not leave BEYU control",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
      });
      expect(verdict.decision).toBe("SELECTED");
      expect(verdict.selectedProviderId).toBe("PROV_NOELIA_DET");
      expect(verdict.selectedModelId).toBe("MOD_NOELIA_DET");
      const rows = await db.select().from(noeliaRoutingDecisions).where(eq(noeliaRoutingDecisions.requestId, "REQ_EXTERNAL_RESTRICTED"));
      expect(rows.length).toBe(1);
      expect(rows[0].selectedModelId).toBe("MOD_NOELIA_DET");
    });
  });

  it("reuses an existing routing decision for a replayed requestId instead of duplicating it", async () => {
    await inRollbackedScope(globalPrincipal(), async () => {
      const p = globalPrincipal();
      const tenant = "TEN_BEYU_TZ";
      const context = {
        principal: p,
        traceId: "TRACE_AI_PLATFORM_REPLAY",
        target: { tenantId: tenant, legalEntityId: null, countryCode: null },
        scope: {
          tenantIds: [tenant],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: true,
        },
      };
      const request = {
        requestId: "REQ_REPLAY_TEST",
        tenantId: tenant,
        legalEntityId: null,
        countryCode: null,
        task: "replay test",
        capability: "governed-analysis",
        classification: "RESTRICTED",
        riskLevel: "LOW",
      } as const;
      const first = await service.route(context, request);
      const second = await service.route(context, request);
      expect(second.routingId).toBe(first.routingId);
      expect(second.requestId).toBe(first.requestId);
      const rows = await db.select().from(noeliaRoutingDecisions).where(eq(noeliaRoutingDecisions.requestId, "REQ_REPLAY_TEST"));
      expect(rows).toHaveLength(1);
    });
  });
});
