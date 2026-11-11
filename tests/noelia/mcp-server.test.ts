import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleNoeliaMcpMessage, NOELIA_MCP_PROTOCOL_VERSION } from "@/lib/noelia/mcp-server";
import type { ToolInvocationContext } from "@/lib/noelia/types";

const context = {
  principal: { userId: "USR_MCP", tenantId: "TEN_A" },
  traceId: "TRACE_MCP_TEST",
  target: { tenantId: "TEN_A", legalEntityId: null, countryCode: null },
  scope: {
    tenantIds: ["TEN_A"],
    legalEntityIds: [],
    countryCodes: [],
    entities: [],
    tenantCountries: [],
    enterprise: false,
  },
  approval: null,
} as unknown as ToolInvocationContext;

const safeTool = {
  name: "risk.register.query",
  permission: "risk:register.read",
  risk: "LOW" as const,
  description: "Read risk register information.",
  registered: true,
  metadata: {
    stableId: "cap-risk-register-query",
    version: "1.0.0",
    ownerRole: "CHIEF_RISK_COMPLIANCE",
    domain: "RISK",
    sideEffects: "NONE" as const,
    idempotent: true,
    timeoutMs: 1000,
    retryPolicy: null,
    jurisdictionRestrictions: null,
    entityRestrictions: "SCOPED" as const,
    approvalRequirements: null,
    auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
    inputSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
    outputSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
  },
};

function registry() {
  const invoke = vi.fn(async () => ({
    allowed: true as const,
    decision: { allowed: true as const, code: "ALLOWED" as const, reason: "authorized" },
    output: { headline: "Risk register summary", findings: [] },
  }));
  const raw = {
    list: vi.fn(() => [safeTool]),
    authorizedToolNames: vi.fn(() => ["risk.register.query"]),
    invoke,
  };
  return { value: raw as unknown as Parameters<typeof handleNoeliaMcpMessage>[2], raw, invoke };
}

describe("NOELIA MCP read-only transport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes only supported protocol versions", async () => {
    const { value } = registry();
    const response = await handleNoeliaMcpMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: NOELIA_MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }, null, value, context);
    expect(response?.result).toMatchObject({
      protocolVersion: NOELIA_MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "noelia-beyu-mcp" },
    });
  });

  it("rejects an unsupported protocol version", async () => {
    const { value } = registry();
    const response = await handleNoeliaMcpMessage({
      jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1900-01-01" },
    }, null, value, context);
    expect(response?.error).toMatchObject({ code: -32602 });
  });

  it("lists only registered, authorized, low-risk, read-only capabilities", async () => {
    const { value, raw } = registry();
    const response = await handleNoeliaMcpMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" }, NOELIA_MCP_PROTOCOL_VERSION, value, context);
    expect(response?.result).toMatchObject({ tools: [{ name: "risk.register.query", annotations: { readOnlyHint: true, destructiveHint: false } }] });
    expect(raw.authorizedToolNames).toHaveBeenCalledWith(context);
  });

  it("rechecks authorization in the registry on every invocation", async () => {
    const { value, invoke } = registry();
    const response = await handleNoeliaMcpMessage({
      jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "risk.register.query", arguments: {} },
    }, NOELIA_MCP_PROTOCOL_VERSION, value, context);
    expect(invoke).toHaveBeenCalledWith("risk.register.query", context, {});
    expect(response?.result).toMatchObject({ isError: false, structuredContent: { headline: "Risk register summary" } });
  });

  it("does not invoke a tool outside the principal's visible allowlist", async () => {
    const { value, raw, invoke } = registry();
    raw.authorizedToolNames.mockReturnValue([]);
    const response = await handleNoeliaMcpMessage({
      jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "risk.register.query", arguments: {} },
    }, NOELIA_MCP_PROTOCOL_VERSION, value, context);
    expect(invoke).not.toHaveBeenCalled();
    expect(response?.result).toMatchObject({ isError: true });
  });

  it("does not expose audit-only or domain-write tools", async () => {
    const { value, raw } = registry();
    raw.list.mockReturnValue([
      safeTool,
      { ...safeTool, name: "write.action", metadata: { ...safeTool.metadata, sideEffects: "DOMAIN_WRITE" } },
      { ...safeTool, name: "audit.action", metadata: { ...safeTool.metadata, sideEffects: "AUDIT_ONLY" } },
    ] as never);
    const response = await handleNoeliaMcpMessage({ jsonrpc: "2.0", id: 6, method: "tools/list" }, NOELIA_MCP_PROTOCOL_VERSION, value, context);
    expect((response?.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)).toEqual(["risk.register.query"]);
  });

  it("returns 202 semantics for notifications and never executes notification-shaped tool calls", async () => {
    const { value, invoke } = registry();
    expect(await handleNoeliaMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, null, value, context)).toBeNull();
    expect(await handleNoeliaMcpMessage({
      jsonrpc: "2.0", method: "tools/call", params: { name: "risk.register.query", arguments: {} },
    }, NOELIA_MCP_PROTOCOL_VERSION, value, context)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    const response = await handleNoeliaMcpMessage({ jsonrpc: "2.0", id: 7, method: "not-a-method" }, NOELIA_MCP_PROTOCOL_VERSION, value, context);
    expect(response?.error).toMatchObject({ code: -32601 });
  });

  it("fails closed when registry invocation denies", async () => {
    const { value, raw } = registry();
    raw.invoke.mockResolvedValue({
      allowed: false,
      decision: { allowed: false, code: "PERMISSION_DENIED", reason: "denied" },
    } as never);
    const response = await handleNoeliaMcpMessage({
      jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "risk.register.query", arguments: {} },
    }, NOELIA_MCP_PROTOCOL_VERSION, value, context);
    expect(response?.result).toMatchObject({ isError: true });
  });
});
