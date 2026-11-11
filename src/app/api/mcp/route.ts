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

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return errorResponse(415, "MCP requests must use application/json.");

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return errorResponse(403, "Cross-origin MCP requests are not accepted.");
      }
    } catch {
      return errorResponse(403, "Invalid MCP request origin.");
    }
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > NOELIA_MCP_MAX_BODY_BYTES) {
    return errorResponse(413, "MCP request body exceeds the configured limit.");
  }

  let raw: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) return errorResponse(400, "MCP request body is required.");
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > NOELIA_MCP_MAX_BODY_BYTES) {
        await reader.cancel();
        return errorResponse(413, "MCP request body exceeds the configured limit.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    raw = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return errorResponse(400, "MCP request body could not be read as valid UTF-8.");
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

  try {
    const principal = await resolvePrincipal();
    if (!principal) return errorResponse(401, "A valid BEYU human session is required.");

    const response = await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      // A target is selected only when BEYU's server-resolved authority leaves
      // exactly one unambiguous entity/country choice. Multiple choices remain
      // unset rather than allowing the MCP caller to pick a scope dimension.
      const soleEntity = principal.entityScope.length === 1
        ? scope.entities.find((entity) => entity.id === principal.entityScope[0] && entity.tenantId === principal.tenantId)
        : undefined;
      const tenantCountries = scope.tenantCountries.filter((item) => item.tenantId === principal.tenantId);
      const soleCountry = soleEntity?.countryCode
        ?? (tenantCountries.length === 1 ? tenantCountries[0]?.countryCode ?? null : null);
      const context: ToolInvocationContext = {
        principal,
        traceId: `MCP_${randomUUID()}`,
        target: {
          tenantId: principal.tenantId,
          legalEntityId: soleEntity?.id ?? null,
          countryCode: soleCountry,
        },
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
