/**
 * BEYU Foundation OS — Foundation Registry API.
 *
 * GET  /api/v1/foundation/foundations — list foundations in scope
 * POST /api/v1/foundation/foundations — register a foundation (PROPOSED)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createFoundation, listFoundations } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  legalName: z.string().min(1).max(300),
  operatingName: z.string().max(300).optional(),
  legalEntityId: z.string().min(1).optional(),
  foundationTypeId: z.string().min(1).optional(),
  legalVehicle: z.string().min(1).max(120),
  registrationNumber: z.string().max(120).optional(),
  jurisdictionId: z.string().min(1).optional(),
  countryCode: z.string().length(2),
  regulator: z.string().max(200).optional(),
  taxAuthority: z.string().max(200).optional(),
  baseCurrency: z.string().length(3).optional(),
  mission: z.string().max(4000).optional(),
  purpose: z.string().max(4000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:registry.read",
      action: "foundation.registry.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION" },
    },
    async (ctx) => {
      const rows = await listFoundations(ctx.principal);
      return NextResponse.json({ foundations: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:registry.manage",
      action: "foundation.registry.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createFoundation(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
