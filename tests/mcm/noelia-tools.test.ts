/**
 * Noelia MCM read-only tools.
 *
 * These tools exist so NOELIA can answer a governed question about the group —
 * "how many companies do I see?", "what is unreconciled between ENT-A and
 * ENT-B?" — without being handed a DB client or a mutation path. Two properties
 * matter, and both are asserted here rather than argued in a comment:
 *
 *   1. SURFACE. Every mcm.* tool is sideEffects NONE, idempotent, audited, and
 *      carries a permission that already exists in the MCM read catalog. No mcm.*
 *      tool name may imply a mutation, and no consequential MCM operation
 *      (lifecycle, ownership validation, filing submission, reconciliation,
 *      consolidation run, capital approval) has a tool path at all.
 *   2. BOUNDARY. A tool answer can never be wider than the same principal's view
 *      of the read services. The tools delegate to `visibleEntities()`, so the
 *      check is: whatever the tool reports must be a subset of what that principal
 *      can already see. A principal without the governing permission is DENIED by
 *      the registry, before any handler runs.
 */
import { describe, expect, it, vi } from "vitest";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { NoeliaRuntime, ENGINE_TOOLS, routeEngine } from "@/lib/noelia/runtime";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { visibleEntities } from "@/lib/mcm/read-services";
import { PERMISSIONS } from "@/lib/constants";
import { seededPrincipal } from "../noelia/db-fixtures";
import type { Principal } from "@/lib/authz";

const registry = createDefaultNoeliaToolRegistry();

const MCM_TOOLS = [
  "mcm.portfolio.hierarchy",
  "mcm.company.financial_snapshot",
  "mcm.intercompany.position",
  "mcm.consolidation.status",
  "mcm.risk_and_compliance.overview",
  "mcm.ownership.structure",
  "mcm.jurisdiction.coverage",
  "mcm.module_rollup",
  "mcm.governance.overview",
  "mcm.integration.health",
] as const;

async function invoke(principal: Principal, tool: string, input: unknown) {
  return withTenantDatabaseContext(principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(principal);
    const target = requestedNoeliaTarget(principal, null);
    return registry.invoke(tool, { principal, traceId: `TRACEMCM${Date.now()}`, target, scope }, input);
  });
}

describe("MCM tool contracts (read-only surface)", () => {
  it("every mcm tool is declared, registered, sideEffects NONE, idempotent and audited", () => {
    for (const name of MCM_TOOLS) {
      const definition = registry.definition(name);
      expect(definition, `${name} must be declared`).not.toBeNull();
      expect(registry.list().map((tool) => tool.name), `${name} must be registered`).toContain(name);
      expect(definition!.metadata.sideEffects).toBe("NONE");
      expect(definition!.metadata.idempotent).toBe(true);
      expect(definition!.metadata.domain).toBe("MULTI_COMPANY");
      expect(definition!.metadata.approvalRequirements).toBeNull();
      expect(definition!.metadata.auditRequirements?.event).toBe("NOELIA_TOOL_INVOKED");
      expect(definition!.risk).toBe("LOW");
      expect(definition!.metadata.timeoutMs).toBeGreaterThan(0);
    }
  });

  it("every mcm tool permission is a permission that actually exists in the catalog", () => {
    for (const name of MCM_TOOLS) {
      const permission = registry.definition(name)!.permission;
      expect(PERMISSIONS, `${name} requires ${permission}`).toHaveProperty(permission);
      // Read capability only — a tool must never be the front door for a write.
      // If a tool ever genuinely needs a `.manage` permission to READ a section,
      // it must be stated here and reviewed, not slipped in.
      expect(permission, `${name} must not carry a write permission`).toMatch(/\.read$/);
    }
  });

  it("no mcm tool name or description implies a mutation", () => {
    const offenders = registry
      .list()
      .filter((tool) => tool.name.startsWith("mcm."))
      .filter((tool) =>
        /(^|\.)[^.]*(create|register|approve|post|submit|validate|reconcile|run|transition|dissolve|amend)[^a-z]*($|\.)/i.test(
          tool.name,
        ) ||
        /can (create|approve|post|submit|validate|reconcile|dissolve)/i.test(tool.description ?? ""),
      )
      .map((tool) => tool.name);
    expect(offenders).toEqual([]);
  });

  it("no consequential MCM operation has a tool path", () => {
    const names = registry
      .list()
      .filter((tool) => tool.name.startsWith("mcm."))
      .map((tool) => tool.name)
      .join("\n");
    for (const forbidden of [
      "mcm.company.create",
      "mcm.company.lifecycle",
      "mcm.ownership.validate",
      "mcm.filing.submit",
      "mcm.intercompany.reconcile",
      "mcm.intercompany.authorize",
      "mcm.consolidation.prepare",
      "mcm.consolidation.review",
      "mcm.capital.approve",
    ]) {
      expect(names, `${forbidden} must not exist`).not.toContain(forbidden);
    }
  });
});

describe("MCM tool boundary (an answer is never wider than the caller)", () => {
  it("reports exactly the caller's visible entity count, and no more", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const visible = await withTenantDatabaseContext(cfo, () => visibleEntities(cfo));

    const result = await invoke(cfo, "mcm.portfolio.hierarchy", {});
    expect(result.allowed, JSON.stringify(result)).toBe(true);
    if (!result.allowed) return;

    const total = (result.output.metrics ?? []).find((m) => m.code === "MCM_ENTITIES_VISIBLE");
    expect(total, "the visible-entity metric must be reported").toBeDefined();
    expect(Number(total!.value)).toBe(visible.length);

    // Every entity named in the answer must be one this principal can see.
    const codes = new Set(visible.map((entity) => entity.code));
    for (const finding of result.output.findings ?? []) {
      const code = finding.label.replace(/^[—\s]*/, "").split(" ")[0];
      if (code.startsWith("ENT") || /^[A-Z0-9-]+$/.test(code)) expect(codes.has(code), `leaked ${code}`).toBe(true);
    }
  });

  it("a principal without mcm:company.read is denied before any handler runs", async () => {
    const family = await seededPrincipal("family@beyu.os");
    const result = await invoke(family, "mcm.portfolio.hierarchy", {});
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(JSON.stringify(result)).not.toMatch(/ENT-|legalName|tenantId/);
  });

  it("an unknown entity code yields an explicit scope answer, never a fabricated company", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const result = await invoke(cfo, "mcm.portfolio.hierarchy", { entityCode: "DOES-NOT-EXIST" });
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.output.headline).toMatch(/No company is in your scope/i);
    expect(result.output.findings?.[0]?.value).toMatch(/not in your visible scope/i);
  });

  it("restricted sections are reported as boundaries, not as zeros", async () => {
    const ceo = await seededPrincipal("ceo@beyu.os");
    // The CEO sees the portfolio but holds neither treasury nor risk capability
    // in every deployment; whichever sections are closed must say WHY.
    const snapshot = await invoke(ceo, "mcm.company.financial_snapshot", {});
    expect(snapshot.allowed, JSON.stringify(snapshot)).toBe(true);
    if (!snapshot.allowed) return;
    for (const finding of snapshot.output.findings ?? []) {
      if (finding.status === "UNAVAILABLE") {
        expect(finding.value, `unavailable ${finding.label} must state a reason`).toMatch(/requires|no |not /i);
        expect(finding.value).not.toBe("0");
      }
    }

    const risk = await invoke(ceo, "mcm.risk_and_compliance.overview", {});
    if (!risk.allowed) return;
    expect(risk.output.confidence).toBe(1);
  });

  it("a permitted gate over a restricted section reports the boundary, not an empty board", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    // GROUP_CFO may read the MCM command centre but not the governance register,
    // so the tool must be reachable AND say which half it could not answer.
    const gov = registry.definition("mcm.governance.overview");
    expect(cfo.permissions.has("governance:body.read")).toBe(false);
    expect(cfo.permissions.has("mcm:company.read")).toBe(true);
    const result = await invoke(cfo, "mcm.governance.overview", {});
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.output.headline).toMatch(/restricted/i);
    expect(result.output.findings?.[0]?.value).toMatch(/Requires governance:body\.read/);
    expect(result.output.humanReviewRequired).toBe(true);
    void gov;
  });

  it("consolidation status says an unperformed consolidation is not a consolidated group", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const result = await invoke(cfo, "mcm.consolidation.status", {});
    expect(result.allowed, JSON.stringify(result)).toBe(true);
    if (!result.allowed) return;
    const { runs } = await withTenantDatabaseContext(cfo, async () => {
      const { consolidationOverview } = await import("@/lib/mcm/read-services");
      return { runs: (await consolidationOverview(cfo)).runs };
    });
    if (runs.length === 0) {
      expect(result.output.headline).toMatch(/No consolidation run is recorded/i);
      expect(result.output.findings?.[0]?.value).toMatch(/never that the group is consolidated/i);
      expect(result.output.humanReviewRequired).toBe(true);
    } else {
      expect(result.output.narrative).toMatch(/prepared/i);
    }
  });

  it("a one-entity scope cannot see a second company through any tool", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const visible = await withTenantDatabaseContext(cfo, () => visibleEntities(cfo));
    expect(visible.length, "fixture needs at least two companies to be a meaningful test").toBeGreaterThan(1);

    const [kept, hidden] = [visible[0], visible.find((entity) => entity.id !== visible[0].id)!];
    const narrowed: Principal = { ...cfo, entityScope: [kept.id] };

    // The narrowed principal must see exactly one company in the hierarchy…
    const hierarchy = await invoke(narrowed, "mcm.portfolio.hierarchy", {});
    expect(hierarchy.allowed, JSON.stringify(hierarchy)).toBe(true);
    if (!hierarchy.allowed) return;
    const total = (hierarchy.output.metrics ?? []).find((m) => m.code === "MCM_ENTITIES_VISIBLE");
    expect(Number(total?.value), "an entity-scoped caller must see exactly one company").toBe(1);

    // …and NO tool may mention the other company anywhere in its payload.
    for (const name of MCM_TOOLS) {
      const result = await invoke(narrowed, name, {});
      if (!result.allowed) continue;
      const wire = JSON.stringify(result.output);
      expect(wire, `${name} leaked the hidden entity code`).not.toContain(hidden.code);
      expect(wire, `${name} leaked the hidden entity id`).not.toContain(hidden.id);
      expect(wire, `${name} leaked the hidden legal name`).not.toContain(hidden.legalName);
    }
  });

  it("the portfolio engine routes a real question to the MCM tools and answers it", async () => {
    // Routing is deterministic and inspectable: an entity-structure question
    // reaches the MULTI_COMPANY engine, and that engine dispatches MCM reads.
    for (const question of [
      "How do the subsidiaries sit under the parent entity in the corporate hierarchy?",
      "How many companies are visible to me and in which countries?",
      "What is our group portfolio across jurisdictions?",
      "Which companies are in scope for the CFO view?",
    ]) {
      expect(routeEngine(question), question).toBe("MULTI_COMPANY");
    }
    for (const question of ["What is our cash position?", "Which companies have overdue payroll?", "List the treasury balances."]) {
      expect(routeEngine(question), question).not.toBe("MULTI_COMPANY");
    }
    expect(routeEngine("Which risks exceed appetite?")).not.toBe("MULTI_COMPANY");

    // "consolidated" is MCM vocabulary, but a question about the group's *cash*
    // is a treasury question. This exact phrasing was caught in CI: the bare
    // `/consolidat/` trigger routed it away from FINANCIAL, so a governance test
    // that suspends the `finance-intelligence` capability no longer saw the
    // suspension — the kill switch fired on a capability the question never used.
    // The guard is narrow (cash/treasury/liquidity only), so a question about
    // consolidated *statements* or a consolidated *trial balance* still belongs
    // to MCM.
    for (const question of [
      "What is the consolidated cash position?",
      "Are the consolidated treasury balances reconciled?",
      "Show the consolidated liquidity runway.",
    ]) {
      expect(routeEngine(question), question).toBe("FINANCIAL");
    }
    for (const question of [
      "Are the consolidated financial statements ready?",
      "Is the consolidated trial balance complete for 2026-06?",
      "What is the consolidated group position for FY2026?",
    ]) {
      expect(routeEngine(question), question).toBe("MULTI_COMPANY");
    }

    for (const name of ENGINE_TOOLS.MULTI_COMPANY) expect(registry.definition(name)).not.toBeNull();

    const cfo = await seededPrincipal("cfo@beyu.os");
    const runtime = new NoeliaRuntime(
      registry,
      { evaluate: vi.fn(async () => ({ effect: "ALLOW" as const, obligations: [], denials: [], appliedPolicies: [] })) },
      { recordDecision: vi.fn(async () => "AID_MCM_TEST") },
    );
    const answer = await withTenantDatabaseContext(cfo, async () => {
      const scope = await resolveNoeliaAuthorizedScope(cfo);
      return runtime.ask({
        principal: cfo,
        question: "How many companies are visible to me and in which countries?",
        traceId: "TRACE_MCM_ENGINE",
        target: requestedNoeliaTarget(cfo, null),
        scope,
      });
    });

    expect(answer.engine).toBe("MULTI_COMPANY");
    expect(answer.toolsUsed, JSON.stringify(answer.deniedScopes)).toContain("mcm.portfolio.hierarchy");
    expect(answer.headline.length).toBeGreaterThan(0);
    // The CFO cannot see the governance register, so that tool is reported as
    // unavailable-with-reason rather than silently dropped or answered with zeros.
    for (const finding of answer.findings) {
      if (finding.status === "UNAVAILABLE") expect(finding.value.length).toBeGreaterThan(0);
    }
  });

  it("every mcm tool returns a shaped, sourced envelope for an authorized principal", async () => {
    // GROUP_CEO holds every read gate these tools stand behind.
    const admin = await seededPrincipal("ceo@beyu.os");
    for (const name of MCM_TOOLS) {
      const result = await invoke(admin, name, {});
      expect(result.allowed, `${name}: ${JSON.stringify(result)}`).toBe(true);
      if (!result.allowed) continue;
      expect(typeof result.output.headline).toBe("string");
      expect((result.output.headline ?? "").length).toBeGreaterThan(0);
      expect((result.output.findings ?? []).length + (result.output.metrics ?? []).length).toBeGreaterThan(0);
      for (const finding of result.output.findings ?? []) {
        expect(["FACT", "INFERENCE", "RECOMMENDATION"]).toContain(finding.kind);
      }
      // No tool may claim certainty it has not earned.
      expect(result.output.confidence ?? 1).toBeLessThanOrEqual(1);
    }
  });
});
