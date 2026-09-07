/**
 * BEYU OS — Agriculture OS: Farms API
 *
 * GET  /api/v1/agriculture/farms — List farms for current tenant
 * POST /api/v1/agriculture/farms — Create a new farm
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/guard";
import { createFarm, listFarms } from "@/lib/agriculture";

const CreateFarmSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2),
  legalEntityId: z.string().min(1),
  totalAreaHa: z.string().optional(),
  arableAreaHa: z.string().optional(),
  soilType: z.string().optional(),
  waterSource: z.string().optional(),
});

export const GET = guarded(async (req: NextRequest, ctx) => {
  const farms = await listFarms(ctx.tenantId);
  return NextResponse.json({ farms });
});

export const POST = guarded(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const parsed = CreateFarmSchema.parse(body);

  const result = await createFarm({
    tenantId: ctx.tenantId,
    ...parsed,
  });

  return NextResponse.json(result, { status: 201 });
});
