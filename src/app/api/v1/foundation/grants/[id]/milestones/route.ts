/**
 * BEYU Foundation OS — Grant milestones.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { addGrantMilestone, listGrantMilestones } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  deliverables: z.string().max(4000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:grant.read",
      action: "foundation.grant.milestones",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "GRANT_MILESTONE" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const rows = await listGrantMilestones(ctx.principal, id);
        return NextResponse.json({ milestones: rows });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:grant.manage",
      action: "foundation.grant.addMilestone",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "GRANT_MILESTONE" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const body = CreateSchema.parse(await request.json());
        const result = await addGrantMilestone(foundationServiceContext(ctx), { ...body, grantId: id });
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
