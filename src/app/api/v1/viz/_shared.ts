/**
 * Universal Dimensional Graphics Foundation — shared API route helpers.
 *
 * Routes use the canonical `guarded()` boundary (authentication → RBAC/ABAC →
 * classification ceiling → entity-scope fail-closed → rate limit → audit),
 * exactly like every other BEYU capability surface. This module only adds the
 * actor projection and the mapping of expected governed refusals
 * (VizDomainError) onto the canonical error envelope, so domain failures
 * never surface as 500s and never leak internals.
 *
 * SECURITY NOTE: a route id, scene id, twin id or query parameter is a
 * REFERENCE, never a grant — every handler re-authorizes through
 * src/lib/viz/authorization.ts and the sector adapters, with PostgreSQL RLS
 * as the final boundary. Nothing here authorizes anything on its own.
 */
import { NextResponse } from "next/server";
import { apiError, type HandlerContext } from "@/lib/api";
import { VizDomainError } from "@/lib/viz/errors";
import type { VizActor } from "@/lib/viz/service";

export function vizActor(ctx: HandlerContext): VizActor {
  return {
    tenantId: ctx.principal.tenantId,
    userId: ctx.principal.userId,
    traceId: ctx.traceId,
    ipAddress: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  };
}

export function vizErrorResponse(err: unknown, traceId: string): NextResponse {
  if (err instanceof VizDomainError) {
    switch (err.code) {
      case "NOT_FOUND":
        return apiError("NOT_FOUND", err.message, 404, traceId);
      case "CONFLICT":
        return apiError("CONFLICT", err.message, 409, traceId);
      case "SCOPE":
      case "EXPORT_FORBIDDEN":
      case "FINANCE_BOUNDARY":
        return apiError("FORBIDDEN", err.message, 403, traceId);
      case "INVALID_STATE":
      case "DIMENSION_UNKNOWN":
      case "SECTOR_UNSUPPORTED":
      default:
        return apiError("VALIDATION_FAILED", err.message, 422, traceId);
    }
  }
  throw err;
}

/** Presentation hints are resolved server-side (§27/§28) — the client asks,
 * the server decides the object ceiling. */
export function presentationFrom(request: Request): { reducedMotion: boolean; lowBandwidth: boolean } {
  const params = new URL(request.url).searchParams;
  return {
    reducedMotion: params.get("reducedMotion") === "1",
    lowBandwidth: params.get("lowBandwidth") === "1",
  };
}
