/**
 * BEYU Foundation OS — Formation case detail + review transitions.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { getFormationCase, transitionFormationCase } from "@/lib/foundation/service";
import { FORMATION_STATUSES, type FormationStatus } from "@/lib/foundation/types";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const TransitionSchema = z.object({
  status: z.enum(FORMATION_STATUSES as unknown as [string, ...string[]]),
  approvalRef: z.string().min(1).max(200).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:formation.read",
      action: "foundation.formation.get",
      rateLimit: { limit: 180, windowMs: 60_000 },
      audit: { objectType: "FORMATION_CASE" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const row = await getFormationCase(ctx.principal, id);
        return NextResponse.json({ case: row });
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
      permission: "foundation:formation.manage",
      action: "foundation.formation.transition",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FORMATION_CASE" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const body = TransitionSchema.parse(await request.json());
        const row = await transitionFormationCase(
          foundationServiceContext(ctx),
          id,
          body.status as FormationStatus,
          body.approvalRef,
        );
        return NextResponse.json({ case: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
