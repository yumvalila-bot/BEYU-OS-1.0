/**
 * BEYU Foundation OS — Foundation detail + lifecycle transitions.
 *
 * GET   /api/v1/foundation/foundations/:id
 * PATCH /api/v1/foundation/foundations/:id { status, approvalRef? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { getFoundation, transitionFoundation } from "@/lib/foundation/service";
import { FOUNDATION_STATUSES, type FoundationStatus } from "@/lib/foundation/types";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const TransitionSchema = z.object({
  status: z.enum(FOUNDATION_STATUSES as unknown as [string, ...string[]]),
  approvalRef: z.string().min(1).max(200).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:registry.read",
      action: "foundation.registry.get",
      rateLimit: { limit: 180, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const row = await getFoundation(ctx.principal, id);
        return NextResponse.json({ foundation: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:registry.manage",
      action: "foundation.registry.transition",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const body = TransitionSchema.parse(await request.json());
        const row = await transitionFoundation(
          foundationServiceContext(ctx),
          id,
          body.status as FoundationStatus,
          body.approvalRef,
        );
        return NextResponse.json({ foundation: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
