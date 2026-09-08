/**
 * BEYU Foundation OS — Grant disbursement scheduling.
 * Disbursement requires an approved grant; Finance posts the money movement.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { scheduleDisbursement } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).optional(),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  milestoneId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:grant.manage",
      action: "foundation.grant.scheduleDisbursement",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "GRANT_DISBURSEMENT" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const body = CreateSchema.parse(await request.json());
        const result = await scheduleDisbursement(foundationServiceContext(ctx), { ...body, grantId: id });
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
