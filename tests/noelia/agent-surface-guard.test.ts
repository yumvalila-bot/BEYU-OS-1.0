import { describe, expect, it } from "vitest";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { BeyuNoeliaHermesAgentRuntime } from "@/lib/noelia/hermes-runtime";
import { resolveHermesRuntimeConfig } from "@/lib/noelia/hermes-config";

/**
 * AGENT SURFACE GUARD.
 *
 * The Hermes increment must not widen what an AI runtime can DO. This suite
 * freezes the governed tool surface and asserts that the agent runtime adds no
 * authority to it:
 *
 *   · Every governed tool name is on a frozen list — adding a tool is a
 *     deliberate, reviewable change to `src/lib/noelia/default-tools.ts`, never
 *     a side effect of an agent integration.
 *   · No shell / process / filesystem / arbitrary-SQL / agent-run capability
 *     exists anywhere on the tool surface.
 *   · CAP_POSTING (and the other consequential operations) still have no tool
 *     path, so an agent cannot reach them through the registry.
 *   · The Hermes runtime is not registered as a tool, exposes no tool-execution
 *     authority, and cannot be turned into a model provider.
 */

/** Frozen inventory. Sorted; add entries only with a reviewed code change. */
const FROZEN_TOOL_NAMES = [
  "agriculture.export.analytics",
  "agriculture.export.compliance.readiness",
  "agriculture.export.documents.missing",
  "agriculture.export.orders.summary",
  "agriculture.export.shipment.exceptions",
  "agriculture.export.traceability.query",
  "agriculture.operations.observe",
  "ai.evaluations.list",
  "ai.identity.read",
  "ai.incidents.list",
  "ai.killswitch.list",
  "ai.model.route",
  "ai.providers.list",
  "ai.risk.register.list",
  "ai.routing.decisions.list",
  "analytics.run",
  "compliance.analysis",
  "compliance.obligation.query",
  "cross.os.intelligence",
  "family.capital.committee",
  "family.capital.intelligence",
  "family.capital.investments",
  "family.capital.liquidity",
  "family.capital.obligations",
  "family.capital.simulate",
  "family.protection.policies",
  "family.protection.review-package",
  "finance.capital.pipeline",
  "finance.capital_formation.positions_by_origin",
  "finance.cash.position",
  "finance.fx.view",
  "finance.intelligence.market_capitalization",
  "finance.intelligence.price_earnings",
  "finance.maturity.profile",
  "finance.private_capital.fund_positions",
  "finance.reconciliation.status",
  "finance.treasury.aggregate",
  "finance.valuation.assumption_fingerprint",
  "finance.waterfall.latest",
  "foundation.compliance.posture",
  "foundation.formation.draft",
  "foundation.funds.position",
  "foundation.grants.pipeline",
  "foundation.registry.summary",
  "foundation.structure.draft",
  "governance.resolution.query",
  "governance.strategic.objectives",
  "government.integration.status",
  "hcm.compensation.entitlement_summary",
  "hcm.employee.aggregate",
  "hcm.organization.structure",
  "hcm.succession.signals",
  "hcm.turnover.analyze",
  "hcm.workforce.observe",
  "hcm.workforce.quality",
  "health.runtime.status",
  "knowledge.ingest",
  "knowledge.publish",
  "knowledge.rag.search",
  "knowledge.replace",
  "legal.authority.status",
  "legal.knowledge.query",
  "memory.read",
  "memory.write",
  "model.registry.read",
  "pricing.markup_margin.analyse",
  "risk.analysis",
  "risk.register.query",
  "tax.knowledge.query",
  "ujenzi.operations.observe",
  "viz.dimensions.explain",
  "viz.holograph.status",
  "viz.scene.summarize",
];

describe("Governed tool surface is frozen (an agent integration cannot widen it)", () => {
  it("registers exactly the reviewed tool inventory", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const declared = registry.list();

    // Every declared tool must be REGISTERED (declaration alone is not a path).
    for (const tool of declared) expect(tool.registered).toBe(true);

    const names = declared.map((tool) => tool.name).sort();
    const unexpected = names.filter((name) => !FROZEN_TOOL_NAMES.includes(name));
    expect(unexpected, `unexpected new governed tool(s): ${unexpected.join(", ")}`).toEqual([]);
    const removed = FROZEN_TOOL_NAMES.filter((name) => !names.includes(name));
    expect(removed, `governed tool(s) disappeared: ${removed.join(", ")}`).toEqual([]);
  });

  it("exposes no shell, process, filesystem or arbitrary-SQL capability", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const forbidden = /(shell|bash|powershell|exec|spawn|process|filesystem|readfile|writefile|db[._-]?query|sql|raw[._-]?query|agent[._-]?run|hermes|tool[._-]?call)/i;
    const offenders = registry
      .list()
      .map((tool) => tool.name)
      .filter((name) => forbidden.test(name));
    expect(offenders).toEqual([]);
  });

  it("keeps consequential operations off the tool surface entirely", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const names = registry.list().map((tool) => `${tool.name} ${tool.description ?? ""}`).join("\n").toLowerCase();
    // No tool path may exist for these, no matter which runtime asks.
    for (const forbidden of ["cap_posting", "post_journal", "approve_capital", "release_payment", "commit_waterfall"]) {
      expect(names).not.toContain(forbidden);
    }
    // The frozen inventory above is the real guard: a tool that performs a
    // consequential operation would have to be ADDED to it (and to
    // default-tools.ts) in a reviewed change. This change adds none.
  });
});

describe("The Hermes runtime adds no authority to the registry", () => {
  it("registers no agent runtime as a governed tool", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const offenders = registry
      .list()
      .map((tool) => tool.name)
      .filter((name) => /hermes|agent/i.test(name));
    expect(offenders).toEqual([]);
  });

  it("cannot be mounted as a model provider and executes no tools", () => {
    const runtime = new BeyuNoeliaHermesAgentRuntime(resolveHermesRuntimeConfig({} as unknown as NodeJS.ProcessEnv));
    const surface = runtime as unknown as Record<string, unknown>;
    // No AIModelProvider-shaped surface (`run`, `generate`, `execute(...)`
    // returning model output is the AGENT surface, not the provider contract).
    expect(typeof surface.run).toBe("undefined");
    expect(typeof surface.generate).toBe("undefined");
    expect(typeof surface.stream).toBe("undefined");
    expect(typeof surface.health).toBe("undefined");
    expect(runtime.executesTools).toBe(false);
    expect(runtime.agentAuthority).toBe("NONE");
  });
});
