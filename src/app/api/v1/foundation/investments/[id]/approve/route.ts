/**
 * BEYU Foundation OS — Material investment approval (human, HIGH_RISK).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { approveInvestment } from "@/lib/foundation/service-operations";
import { foundationErrorResponse, foundationServiceContext } from "../../../_shared";

const ApproveSchema = z.object({ approvalRef: z.string().min(1).max(200) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:investment.approve",
      action: "foundation.investment.approve",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_INVESTMENT" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const body = ApproveSchema.parse(await request.json());
        const row = await approveInvestment(foundationServiceContext(ctx), id, body.approvalRef);
        return NextResponse.json({ investment: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
