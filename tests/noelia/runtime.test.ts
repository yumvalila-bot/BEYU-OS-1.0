import { describe, expect, it, vi } from "vitest";
import { NoeliaRuntime, routeEngine } from "../../src/lib/noelia/runtime";
import { NoeliaToolRegistry } from "../../src/lib/noelia/tool-registry";
import type { NoeliaEvidencePort, NoeliaPolicyPort } from "../../src/lib/noelia/types";
import { principal } from "./fixtures";

const allowPolicy: NoeliaPolicyPort = {
  evaluate: vi.fn(async () => ({ effect: "ALLOW" as const, obligations: [], denials: [], appliedPolicies: [] })),
};

function evidence(): NoeliaEvidencePort & { recordDecision: ReturnType<typeof vi.fn> } {
  return { recordDecision: vi.fn(async () => "AID_TEST") };
}

function input() {
  return {
    principal: principal(),
    question: "Which risks exceed appetite?",
    traceId: "TRACE_RUNTIME",
    target: { tenantId: "TEN_A", legalEntityId: null, countryCode: null },
    scope: {
      tenantIds: ["TEN_A"],
      legalEntityIds: ["LEN_A"],
      countryCodes: ["TZ"],
      entities: [{ id: "LEN_A", tenantId: "TEN_A", countryCode: "TZ" }],
      tenantCountries: [{ tenantId: "TEN_A", countryCode: "TZ" }],
      enterprise: false,
    },
  };
}

const testMetadata = {
  stableId: "cap-risk-register-query",
  version: "1.0.0",
  ownerRole: "CHIEF_RISK_COMPLIANCE",
  domain: "RISK",
  sideEffects: "NONE" as const,
  idempotent: true,
  timeoutMs: 8000,
  retryPolicy: null,
  jurisdictionRestrictions: null,
  entityRestrictions: "SCOPED" as const,
  approvalRequirements: null,
  auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
};

function registry(spy = vi.fn(async () => ({
  headline: "One risk exceeds appetite.",
  findings: [{ label: "RISK-1", value: "16", kind: "FACT" as const }],
  sources: [{ kind: "RISK", ref: "RISK-1", label: "Risk one", authority: "RISK_ENGINE" }],
  confidence: 0.9,
}))) {
  const value = new NoeliaToolRegistry();
  value.register({
    name: "risk.register.query",
    permission: "risk:register.read",
    risk: "LOW",
    description: "risk",
    metadata: testMetadata,
    execute: spy,
  });
  value.register({
    name: "knowledge.rag.search",
    permission: "ai:noelia.query",
    risk: "LOW",
    description: "knowledge",
    metadata: { ...testMetadata, stableId: "cap-knowledge-rag-search", ownerRole: "CHIEF_GOVERNANCE_OFFICER", domain: "KNOWLEDGE" },
    execute: async () => ({ sources: [] }),
  });
  return { value, spy };
}

describe("Noelia deterministic runtime", () => {
  it.each([
    ["tax allowance", "TAX"],
    ["risk exposure", "RISK"],
    ["GDPR compliance", "COMPLIANCE"],
    ["board resolution", "GOVERNANCE"],
    ["employee headcount", "WORKFORCE"],
    ["cash liquidity", "FINANCIAL"],
    ["tell me about our standards", "KNOWLEDGE"],
  ] as const)("routes '%s' to %s", (question, engine) => {
    expect(routeEngine(question)).toBe(engine);
  });

  it("invokes only deterministic registered tools and records decision evidence", async () => {
    const tools = registry();
    const ledger = evidence();
    const answer = await new NoeliaRuntime(tools.value, allowPolicy, ledger).ask(input());

    expect(answer.decisionId).toBe("AID_TEST");
    expect(answer.engine).toBe("RISK");
    expect(answer.toolsUsed).toEqual(["risk.register.query", "knowledge.rag.search"]);
    expect(answer.findings).toHaveLength(1);
    expect(tools.spy).toHaveBeenCalledOnce();
    expect(ledger.recordDecision).toHaveBeenCalledOnce();
  });

  it("executes no tool after a policy denial but still records denial evidence", async () => {
    const tools = registry();
    const ledger = evidence();
    const denyPolicy: NoeliaPolicyPort = {
      evaluate: async () => ({
        effect: "DENY",
        obligations: [],
        denials: [{ policyCode: "CONST-AI-001", message: "AI action denied." }],
        appliedPolicies: [{ code: "CONST-AI-001", version: "1", level: "CONSTITUTION" }],
      }),
    };
    const answer = await new NoeliaRuntime(tools.value, denyPolicy, ledger).ask(input());

    expect(answer.policyDecision).toBe("DENY");
    expect(answer.outputClass).toBe("REQUIRES_HUMAN_REVIEW");
    expect(answer.humanReviewRequired).toBe(true);
    expect(answer.toolsUsed).toEqual([]);
    expect(tools.spy).not.toHaveBeenCalled();
    expect(ledger.recordDecision).toHaveBeenCalledOnce();
  });

  it("returns a governed denial rather than bypassing missing capability authority", async () => {
    const tools = registry();
    const ledger = evidence();
    const denied = input();
    denied.principal = principal({ permissions: new Set(["ai:noelia.query"]) });
    const answer = await new NoeliaRuntime(tools.value, allowPolicy, ledger).ask(denied);

    expect(answer.outputClass).toBe("REQUIRES_HUMAN_REVIEW");
    expect(answer.deniedScopes).toContain("risk.register.query:PERMISSION_DENIED");
    expect(tools.spy).not.toHaveBeenCalled();
    expect(ledger.recordDecision).toHaveBeenCalledOnce();
  });

  it("labels knowledge without an authoritative source as uncertainty", async () => {
    const tools = new NoeliaToolRegistry().register({
      name: "knowledge.rag.search",
      permission: "ai:noelia.query",
      risk: "LOW",
      description: "knowledge",
      metadata: { ...testMetadata, stableId: "cap-knowledge-rag-search", ownerRole: "CHIEF_GOVERNANCE_OFFICER", domain: "KNOWLEDGE" },
      execute: async () => ({ sources: [], confidence: 0.8 }),
    });
    const ledger = evidence();
    const request = input();
    request.question = "Tell me about our standards";
    const answer = await new NoeliaRuntime(tools, allowPolicy, ledger).ask(request);

    expect(answer.engine).toBe("KNOWLEDGE");
    expect(answer.outputClass).toBe("UNCERTAINTY");
    expect(answer.confidence).toBeLessThanOrEqual(0.55);
  });
});
