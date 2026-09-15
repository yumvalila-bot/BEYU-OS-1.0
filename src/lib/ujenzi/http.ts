import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { guarded, apiError, type HandlerContext } from "@/lib/api";
import { UjenziDomainError } from "./errors";
import type { UjenziActor } from "./index";

export function ujenziActor(ctx: HandlerContext): UjenziActor {
  return {
    tenantId: ctx.principal.tenantId,
    userId: ctx.principal.userId,
    traceId: ctx.traceId,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  };
}

export function ujenziErrorResponse(err: unknown, traceId: string) {
  if (err instanceof UjenziDomainError) {
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "FINANCE_BOUNDARY" || err.code === "SCOPE" ? 403 : 409;
    return apiError(err.code, err.message, status, traceId, err.details);
  }
  throw err;
}

export function ujenziListRoute(opts: {
  action: string;
  objectType: string;
  load: (ctx: HandlerContext, request: NextRequest) => Promise<unknown>;
}) {
  return async function GET(request: NextRequest) {
    return guarded(
      request,
      {
        permission: "ujenzi:data.read",
        action: opts.action,
        rateLimit: { limit: 120, windowMs: 60_000 },
        audit: { objectType: opts.objectType },
      },
      async (ctx) => NextResponse.json(await opts.load(ctx, request)),
    );
  };
}

export function ujenziCreateRoute<T>(opts: {
  action: string;
  objectType: string;
  schema: ZodType<T>;
  create: (ctx: HandlerContext, body: T) => Promise<unknown>;
}) {
  return async function POST(request: NextRequest) {
    return guarded(
      request,
      {
        permission: "ujenzi:data.manage",
        action: opts.action,
        rateLimit: { limit: 60, windowMs: 60_000 },
        audit: { objectType: opts.objectType },
      },
      async (ctx) => {
        try {
          const body = opts.schema.parse(await request.json());
          const result = await opts.create(ctx, body);
          return NextResponse.json(result, { status: 201 });
        } catch (err) {
          return ujenziErrorResponse(err, ctx.traceId);
        }
      },
    );
  };
}
