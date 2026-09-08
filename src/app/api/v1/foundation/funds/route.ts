/**
 * BEYU Foundation OS — Fund management.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createFund, listFunds } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(300),
  foundationId: z.string().min(1),
  fundType: z.enum(["RESTRICTED", "UNRESTRICTED", "DESIGNATED", "ENDOWMENT", "RESERVE"]),
  purpose: z.string().max(2000).optional(),
  source: z.string().max(500).optional(),
  currency: z.string().length(3).optional(),
  reportingObligations: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:fund.read",
      action: "foundation.fund.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FUND" },
    },
    async (ctx) => {
      const rows = await listFunds(ctx.principal);
      return NextResponse.json({ funds: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:fund.manage",
      action: "foundation.fund.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FUND" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createFund(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
