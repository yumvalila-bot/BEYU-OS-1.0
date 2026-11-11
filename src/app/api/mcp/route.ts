import { randomUUID } from "node:crypto";
import { resolvePrincipal } from "@/lib/session";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import type { ToolInvocationContext } from "@/lib/noelia/types";
import {
  handleNoeliaMcpMessage,
  noeliaMcpJsonResponse,
  NOELIA_MCP_MAX_BODY_BYTES,
} from "@/lib/noelia/mcp-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(status: number, message: string): Response {
  return noeliaMcpJsonResponse({
    jsonrpc: "2.0",
    id: null,
    error: { code: status === 401 ? -32001 : -32000, message },
  }, status);
}

/**
 * Phase 1 transport is deliberately disabled by default and authenticates
 * through the existing BEYU browser session. OAuth 2.1 for external clients is
 * a separate Phase 2; do not add a static bearer-token bypass here.
 */
export async function POST(request: Request): Promise<Response> {
  if (process.env.NOELIA_MCP_ENABLED !== "1") return new Response(null, { status: 404 });

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return errorResponse(415, "MCP requests must use application/json.");

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > NOELIA_MCP_MAX_BODY_BYTES) {
    return errorResponse(413, "MCP request body exceeds the configured limit.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return errorResponse(400, "MCP request body could not be read.");
  }
  if (Buffer.byteLength(raw, "utf8") > NOELIA_MCP_MAX_BODY_BYTES) {
    return errorResponse(413, "MCP request body exceeds the configured limit.");
  }

  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return noeliaMcpJsonResponse({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error." },
    }, 400);
  }

  const principal = await resolvePrincipal();
  if (!principal) return errorResponse(401, "A valid BEYU human session is required.");

  try {
    const response = await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const context: ToolInvocationContext = {
        principal,
        traceId: `MCP_${randomUUID()}`,
        // The initial MCP surface is restricted to the authenticated user's
        // own canonical tenant. Client-provided target dimensions are ignored.
        target: { tenantId: principal.tenantId, legalEntityId: null, countryCode: null },
        scope,
        approval: null,
      };
      return handleNoeliaMcpMessage(
        message,
        request.headers.get("mcp-protocol-version"),
        createDefaultNoeliaToolRegistry(),
        context,
      );
    });
    if (response === null) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
    return noeliaMcpJsonResponse(response);
  } catch {
    // Authentication, scope resolution, database and policy errors are not
    // reflected to the remote client.
    return errorResponse(503, "NOELIA MCP is temporarily unavailable.");
  }
}

export async function GET(): Promise<Response> {
  if (process.env.NOELIA_MCP_ENABLED !== "1") return new Response(null, { status: 404 });
  return new Response(null, {
    status: 405,
    headers: { allow: "POST", "cache-control": "no-store" },
  });
}
