/**
 * BEYU OS — Agriculture OS: Crop Cycles API
 *
 * GET  /api/v1/agriculture/crop-cycles — List crop cycles for current tenant
 * POST /api/v1/agriculture/crop-cycles — Create a new crop cycle
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/guard";
import { createCropCycle, listCropCycles } from "@/lib/agriculture";

const CreateCropCycleSchema = z.object({
  fieldId: z.string().min(1),
  cropTypeId: z.string().min(1),
  code: z.string().min(1).max(50),
  season: z.enum(["LONG_RAINS", "SHORT_RAINS", "DRY", "IRRIGATED"]),
  plantingDate: z.string().min(1),
  expectedHarvestDate: z.string().optional(),
  seedQuantityKg: z.string().optional(),
  expectedYieldKg: z.string().optional(),
});

export const GET = guarded(async (req: NextRequest, ctx) => {
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const cycles = await listCropCycles(ctx.tenantId, status);
  return NextResponse.json({ cropCycles: cycles });
});

export const POST = guarded(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const parsed = CreateCropCycleSchema.parse(body);

  const result = await createCropCycle({
    tenantId: ctx.tenantId,
    ...parsed,
  });

  return NextResponse.json(result, { status: 201 });
});
