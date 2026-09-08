/**
 * BEYU Foundation OS — canonical Finance bridge (capital requests).
 * Foundation OS requests; Finance OS governs and executes.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listFoundationCapitalRequests, requestFoundationCapital } from "@/lib/foundation/finance-bridge";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const CreateSchema = z.object({
  foundationId: z.string().min(1),
  code: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  requestType: z.string().min(1).max(60),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).optional(),
  horizonMonths: z.number().int().positive().max(120).optional(),
  programId: z.string().min(1).optional(),
  grantId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:fund.read",
      action: "foundation.finance.capital",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "CAPITAL_REQUEST" },
    },
    async (ctx) => {
      const rows = await listFoundationCapitalRequests(ctx.principal);
      return NextResponse.json({ capitalRequests: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:fund.manage",
      action: "foundation.finance.requestCapital",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "CAPITAL_REQUEST" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await requestFoundationCapital(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
