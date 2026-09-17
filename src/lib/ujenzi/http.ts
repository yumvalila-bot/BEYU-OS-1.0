import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { guarded, apiError, type HandlerContext } from "@/lib/api";
import { UjenziDomainError, type UjenziActor } from "./index";
import { classificationsAtOrBelow, isKnownClassification } from "@/lib/constants";

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

type UjenziListPayload = { items: unknown[] };

export function ujenziRowVisible(item: unknown, clearance: string): boolean {
  if (!item || typeof item !== "object") return false;
  const classification = (item as { classification?: unknown }).classification;
  // Every Ujenzi table carries a classification column. A malformed or missing
  // value is not silently treated as low sensitivity.
  return (
    typeof classification === "string" &&
    isKnownClassification(classification) &&
    classificationsAtOrBelow(clearance).includes(classification)
  );
}

export function visibleUjenziItems(items: unknown[], clearance: string): unknown[] {
  return items.filter((item) => ujenziRowVisible(item, clearance));
}

export function ujenziListRoute(opts: {
  action: string;
  objectType: string;
  load: (ctx: HandlerContext, request: NextRequest) => Promise<UjenziListPayload>;
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
      async (ctx) => {
        const payload = await opts.load(ctx, request);
        return NextResponse.json({
          ...payload,
          items: visibleUjenziItems(payload.items, ctx.principal.clearance),
        });
      },
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
