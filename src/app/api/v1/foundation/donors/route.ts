/**
 * BEYU Foundation OS — Donor management.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listDonors, registerDonor } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  displayName: z.string().min(1).max(300),
  donorType: z.enum(["INDIVIDUAL", "CORPORATE", "TRUST", "FOUNDATION", "GOVERNMENT", "MULTILATERAL"]),
  partyId: z.string().min(1).optional(),
  countryCode: z.string().length(2).optional(),
  contactRef: z.string().max(300).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:donor.read",
      action: "foundation.donor.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "DONOR" },
    },
    async (ctx) => {
      const rows = await listDonors(ctx.principal);
      return NextResponse.json({ donors: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:donor.manage",
      action: "foundation.donor.register",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "DONOR" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await registerDonor(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
