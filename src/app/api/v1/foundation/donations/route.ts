/**
 * BEYU Foundation OS — Donations (DONOR → DONATION → FUND …).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listDonations, recordDonation } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  donorId: z.string().min(1),
  foundationId: z.string().min(1),
  fundId: z.string().min(1).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).optional(),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  channel: z.string().max(120).optional(),
  restrictionSummary: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:donor.read",
      action: "foundation.donor.donations",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "DONATION" },
    },
    async (ctx) => {
      const rows = await listDonations(ctx.principal);
      return NextResponse.json({ donations: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:donor.manage",
      action: "foundation.donor.recordDonation",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "DONATION" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await recordDonation(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
