/**
 * BEYU Foundation OS — fund allocation (restricted-fund fenced).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { addFundRestriction, allocateFund } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const AllocateSchema = z.object({
  fundId: z.string().min(1),
  programId: z.string().min(1).optional(),
  grantId: z.string().min(1).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).optional(),
  purpose: z.string().max(2000).optional(),
  approvalRef: z.string().max(200).optional(),
});

const RestrictionSchema = z.object({
  fundId: z.string().min(1),
  restrictionType: z.enum(["PURPOSE", "GEOGRAPHY", "TIME", "MATCHING", "PROHIBITION"]),
  rule: z.string().min(1).max(4000),
  donorId: z.string().min(1).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:fund.manage",
      action: "foundation.fund.allocate",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FUND_ALLOCATION" },
    },
    async (ctx) => {
      try {
        const body = AllocateSchema.parse(await request.json());
        const result = await allocateFund(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PUT(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:fund.manage",
      action: "foundation.fund.restrict",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FUND_RESTRICTION" },
    },
    async (ctx) => {
      try {
        const body = RestrictionSchema.parse(await request.json());
        const result = await addFundRestriction(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
