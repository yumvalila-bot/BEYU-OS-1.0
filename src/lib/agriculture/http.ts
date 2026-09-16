import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { guarded, apiError, type HandlerContext } from "@/lib/api";
import { AgriDomainError } from "./errors";
import type { AgriActor } from "./index";
import { classificationsAtOrBelow, isKnownClassification } from "@/lib/constants";

export function agriActor(ctx: HandlerContext): AgriActor {
  return {
    tenantId: ctx.principal.tenantId,
    userId: ctx.principal.userId,
    traceId: ctx.traceId,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  };
}

export function agriErrorResponse(err: unknown, traceId: string) {
  if (err instanceof AgriDomainError) {
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "FINANCE_BOUNDARY" || err.code === "SCOPE" ? 403 : 409;
    return apiError(err.code, err.message, status, traceId, err.details);
  }
  throw err;
}

type AgricultureListPayload = { items: unknown[] };

export function agricultureRowVisible(item: unknown, clearance: string): boolean {
  if (!item || typeof item !== "object") return false;
  const classification = (item as { classification?: unknown }).classification;
  // Every Agriculture table carries a classification column. A malformed or
  // missing value is not silently treated as low sensitivity.
  return (
    typeof classification === "string" &&
    isKnownClassification(classification) &&
    classificationsAtOrBelow(clearance).includes(classification)
  );
}

export function visibleAgricultureItems(items: unknown[], clearance: string): unknown[] {
  return items.filter((item) => agricultureRowVisible(item, clearance));
}

export function agriListRoute(opts: {
  action: string;
  objectType: string;
  load: (ctx: HandlerContext, request: NextRequest) => Promise<AgricultureListPayload>;
}) {
  return async function GET(request: NextRequest) {
    return guarded(
      request,
      {
        permission: "agriculture:data.read",
        action: opts.action,
        rateLimit: { limit: 120, windowMs: 60_000 },
        audit: { objectType: opts.objectType },
      },
      async (ctx) => {
        const payload = await opts.load(ctx, request);
        return NextResponse.json({
          ...payload,
          items: visibleAgricultureItems(payload.items, ctx.principal.clearance),
        });
      },
    );
  };
}

export function agriCreateRoute<T>(opts: {
  action: string;
  objectType: string;
  schema: ZodType<T>;
  create: (ctx: HandlerContext, body: T) => Promise<unknown>;
}) {
  return async function POST(request: NextRequest) {
    return guarded(
      request,
      {
        permission: "agriculture:data.manage",
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
          return agriErrorResponse(err, ctx.traceId);
        }
      },
    );
  };
}
