import type { NoeliaToolRegistry } from "./tool-registry";
import type { ToolInvocationContext } from "./types";

export const NOELIA_MCP_PROTOCOL_VERSION = "2025-06-18";
export const NOELIA_MCP_MAX_BODY_BYTES = 256 * 1024;

const SUPPORTED_PROTOCOL_VERSIONS = new Set([NOELIA_MCP_PROTOCOL_VERSION, "2025-03-26"]);

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

type McpRegistry = Pick<NoeliaToolRegistry, "list" | "authorizedToolNames" | "invoke">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "{\"error\":\"Tool result could not be serialized.\"}";
  }
}

function toolInputSchema(): Record<string, unknown> {
  // Registry-owned Zod schemas remain the authoritative validator at invoke
  // time. This deliberately broad transport schema avoids reflecting Zod's
  // private implementation details into a public protocol contract.
  return {
    type: "object",
    additionalProperties: true,
    description: "Arguments are validated against the registered NOELIA Zod input contract before execution.",
  };
}

function isMcpRequest(value: unknown): value is JsonRpcRequest {
  if (!isRecord(value) || value.jsonrpc !== "2.0" || typeof value.method !== "string") return false;
  if (value.id !== undefined && value.id !== null && typeof value.id !== "string" && typeof value.id !== "number") return false;
  if (value.params !== undefined && !isRecord(value.params)) return false;
  return true;
}

function exposedToolNames(registry: McpRegistry, context: ToolInvocationContext): Set<string> {
  const authorized = new Set(registry.authorizedToolNames(context));
  return new Set(
    registry.list()
      .filter((tool) => tool.registered)
      .filter((tool) => tool.risk === "LOW")
      .filter((tool) => tool.metadata.sideEffects === "NONE")
      .filter((tool) => Boolean(tool.metadata.inputSchema && tool.metadata.outputSchema))
      .filter((tool) => authorized.has(tool.name))
      .map((tool) => tool.name),
  );
}

/**
 * Stateless MCP JSON-RPC dispatcher. Authentication and canonical BEYU
 * transaction/scope resolution are intentionally injected by the HTTP route;
 * this module never accepts caller-supplied principals, tenant scope or target.
 */
export async function handleNoeliaMcpMessage(
  message: unknown,
  protocolVersion: string | null,
  registry: McpRegistry,
  context: ToolInvocationContext,
): Promise<Record<string, unknown> | null> {
  if (!isMcpRequest(message)) return rpcError(null, -32600, "Invalid JSON-RPC request.");
  const id = message.id === undefined ? null : message.id;
  const isNotification = message.id === undefined;

  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    return null;
  }
  // JSON-RPC notifications never receive a response and must never trigger a
  // capability invocation (including a malformed tools/call notification).
  if (isNotification) return null;

  if (message.method === "initialize") {
    const requestedVersion = message.params?.protocolVersion;
    if (typeof requestedVersion !== "string" || !SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)) {
      return rpcError(id, -32602, "Unsupported MCP protocol version.");
    }
    return rpcResult(id, {
      protocolVersion: requestedVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "noelia-beyu-mcp", version: "0.1.0" },
      instructions: "NOELIA is BEYU's governed intelligence gateway. Tool availability is principal-specific and every invocation is re-authorized by BEYU OS.",
    });
  }

  if (!protocolVersion || !SUPPORTED_PROTOCOL_VERSIONS.has(protocolVersion)) {
    return isNotification ? null : rpcError(id, -32602, "A supported MCP-Protocol-Version header is required after initialization.");
  }

  if (message.method === "ping") return rpcResult(id, {});

  if (message.method === "tools/list") {
    const visible = exposedToolNames(registry, context);
    const tools = registry.list()
      .filter((tool) => visible.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: toolInputSchema(),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: tool.metadata.idempotent,
          openWorldHint: false,
        },
      }));
    return rpcResult(id, { tools });
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};
    if (typeof name !== "string" || !isRecord(args)) {
      return rpcError(id, -32602, "tools/call requires a tool name and object arguments.");
    }
    if (!exposedToolNames(registry, context).has(name)) {
      return rpcResult(id, {
        content: [{ type: "text", text: "The requested NOELIA capability is not available to this principal." }],
        isError: true,
      });
    }

    try {
      // The registry repeats permission, scope, classification, kill-switch,
      // Zod input/output, confirmation and execution checks for every call.
      const result = await registry.invoke(name, context, args);
      if (!result.allowed) {
        return rpcResult(id, {
          content: [{ type: "text", text: `BEYU authorization denied (${result.decision.code}).` }],
          isError: true,
        });
      }
      const payload = result.output;
      return rpcResult(id, {
        content: [{ type: "text", text: jsonText(payload) }],
        structuredContent: payload,
        isError: false,
      });
    } catch {
      // Never return stack traces, service internals or sensitive exception text.
      return rpcResult(id, {
        content: [{ type: "text", text: "NOELIA capability execution failed closed." }],
        isError: true,
      });
    }
  }

  return isNotification ? null : rpcError(id, -32601, "Method not found.");
}

export function noeliaMcpJsonResponse(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
