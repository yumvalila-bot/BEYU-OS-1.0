import { describe, expect, it, vi } from "vitest";
import { NoeliaToolRegistry } from "../../src/lib/noelia/tool-registry";
import type { ToolInvocationContext } from "../../src/lib/noelia/types";
import { principal } from "./fixtures";

function context(overrides: Partial<ToolInvocationContext> = {}): ToolInvocationContext {
  return {
    principal: principal(),
    traceId: "TRACE_TOOL",
    target: { tenantId: "TEN_A", legalEntityId: "LEN_A", countryCode: "TZ" },
    scope: {
      tenantIds: ["TEN_A"],
      legalEntityIds: ["LEN_A"],
      countryCodes: ["TZ"],
      entities: [{ id: "LEN_A", tenantId: "TEN_A", countryCode: "TZ" }],
      tenantCountries: [{ tenantId: "TEN_A", countryCode: "TZ" }],
      enterprise: false,
    },
    approval: null,
    ...overrides,
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

function registry(risk: "LOW" | "HIGH" = "LOW", execute = vi.fn(async () => ({ metadata: { ok: true } }))) {
  return {
    execute,
    value: new NoeliaToolRegistry().register({
      name: "risk.register.query",
      permission: "risk:register.read",
      risk,
      approverRole: risk === "HIGH" ? "CHIEF_RISK_COMPLIANCE" : undefined,
      description: "test tool",
      metadata: testMetadata,
      execute,
    }),
  };
}

describe("Noelia tool registry fail-closed gate", () => {
  it("denies an unknown tool", async () => {
    const result = await registry().value.invoke("unknown.tool", context(), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("TOOL_UNKNOWN");
  });

  it("denies a declared but unregistered tool", async () => {
    const value = new NoeliaToolRegistry().declare({
      name: "risk.unregistered",
      permission: "risk:register.read",
      risk: "LOW",
      description: "declaration only",
      metadata: testMetadata,
    });
    const result = await value.invoke("risk.unregistered", context(), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("TOOL_UNREGISTERED");
  });

  it("denies a tool without canonical context", async () => {
    const result = await registry().value.invoke("risk.register.query", null, {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("CONTEXT_MISSING");
  });

  it("denies an unauthorized tool and never calls its service", async () => {
    const { value, execute } = registry();
    const result = await value.invoke("risk.register.query", context({
      principal: principal({ permissions: new Set(["ai:noelia.query"]) }),
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("PERMISSION_DENIED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("denies a classification above the principal ceiling", async () => {
    const execute = vi.fn(async () => ({}));
    const value = new NoeliaToolRegistry().register({
      name: "risk.restricted",
      permission: "risk:register.read",
      classification: "HIGHLY_RESTRICTED",
      risk: "LOW",
      description: "classified test tool",
      metadata: { ...testMetadata, stableId: "cap-risk-restricted" },
      execute,
    });
    const result = await value.invoke("risk.restricted", context(), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("CLASSIFICATION_DENIED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("denies the wrong tenant", async () => {
    const result = await registry().value.invoke("risk.register.query", context({
      target: { tenantId: "TEN_B", legalEntityId: null, countryCode: null },
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("TENANT_DENIED");
  });

  it("denies the wrong legal entity", async () => {
    const result = await registry().value.invoke("risk.register.query", context({
      target: { tenantId: "TEN_A", legalEntityId: "LEN_B", countryCode: null },
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("ENTITY_DENIED");
  });

  it("denies an allowed entity when paired with the wrong tenant", async () => {
    const result = await registry().value.invoke("risk.register.query", context({
      target: { tenantId: "TEN_A", legalEntityId: "LEN_B", countryCode: null },
      scope: {
        tenantIds: ["TEN_A", "TEN_B"],
        legalEntityIds: ["LEN_A", "LEN_B"],
        countryCodes: ["TZ", "KE"],
        entities: [
          { id: "LEN_A", tenantId: "TEN_A", countryCode: "TZ" },
          { id: "LEN_B", tenantId: "TEN_B", countryCode: "KE" },
        ],
        tenantCountries: [
          { tenantId: "TEN_A", countryCode: "TZ" },
          { tenantId: "TEN_B", countryCode: "KE" },
        ],
        enterprise: true,
      },
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("ENTITY_DENIED");
  });

  it("denies the wrong country", async () => {
    const result = await registry().value.invoke("risk.register.query", context({
      target: { tenantId: "TEN_A", legalEntityId: null, countryCode: "KE" },
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("COUNTRY_DENIED");
  });

  it("denies an allowed country when paired with the wrong tenant", async () => {
    const result = await registry().value.invoke("risk.register.query", context({
      target: { tenantId: "TEN_A", legalEntityId: null, countryCode: "KE" },
      scope: {
        tenantIds: ["TEN_A", "TEN_B"],
        legalEntityIds: ["LEN_A", "LEN_B"],
        countryCodes: ["TZ", "KE"],
        entities: [
          { id: "LEN_A", tenantId: "TEN_A", countryCode: "TZ" },
          { id: "LEN_B", tenantId: "TEN_B", countryCode: "KE" },
        ],
        tenantCountries: [
          { tenantId: "TEN_A", countryCode: "TZ" },
          { tenantId: "TEN_B", countryCode: "KE" },
        ],
        enterprise: true,
      },
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("COUNTRY_DENIED");
  });

  it("denies a high-risk action without approval", async () => {
    const { value, execute } = registry("HIGH");
    const result = await value.invoke("risk.register.query", context(), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("HUMAN_APPROVAL_REQUIRED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects AI-labelled approval evidence", async () => {
    const { value, execute } = registry("HIGH");
    const result = await value.invoke("risk.register.query", context({
      approval: {
        approvalId: "APR_1",
        approvingHumanId: "USR_APPROVER",
        actorType: "AI" as "HUMAN",
        decision: "APPROVED",
      },
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("HUMAN_APPROVAL_INVALID");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects self-approval by the requesting human", async () => {
    const { value } = registry("HIGH");
    const result = await value.invoke("risk.register.query", context({
      approval: {
        approvalId: "APR_1",
        approvingHumanId: "USR_REQUESTING_HUMAN",
        actorType: "HUMAN",
        decision: "APPROVED",
      },
    }), {});
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.decision.code).toBe("HUMAN_APPROVAL_INVALID");
  });

  it("allows a registered, scoped tool with separate HUMAN approval", async () => {
    const { value, execute } = registry("HIGH");
    const result = await value.invoke("risk.register.query", context({
      approval: {
        approvalId: "APR_1",
        approvingHumanId: "USR_APPROVING_HUMAN",
        actorType: "HUMAN",
        decision: "APPROVED",
      },
    }), {});
    expect(result.allowed).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });
});
