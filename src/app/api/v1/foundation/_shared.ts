/**
 * Foundation OS API — shared route helpers.
 *
 * Maps FoundationError to the canonical API error envelope so domain
 * failures (403/404/409/422) never surface as 500s and never leak
 * internals. Zod errors are normalised by the guarded() boundary.
 */
import { NextResponse } from "next/server";
import { apiError, type HandlerContext } from "@/lib/api";
import { FoundationError, type ServiceContext } from "@/lib/foundation/service";

export function foundationServiceContext(ctx: HandlerContext): ServiceContext {
  return {
    principal: ctx.principal,
    traceId: ctx.traceId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  };
}

export function foundationErrorResponse(err: unknown, traceId: string): NextResponse {
  if (err instanceof FoundationError) {
    const code =
      err.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : err.code === "FORBIDDEN" || err.code === "APPROVAL_REQUIRED"
          ? "FORBIDDEN"
          : err.code === "CONFLICT"
            ? "CONFLICT"
            : "VALIDATION_FAILED";
    return apiError(code, err.message, err.status, traceId);
  }
  throw err;
}
