/**
 * BEYU OS — Agriculture OS: Harvests API
 *
 * POST /api/v1/agriculture/harvests — Record a harvest
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/guard";
import { recordHarvest } from "@/lib/agriculture";

const RecordHarvestSchema = z.object({
  cropCycleId: z.string().min(1),
  code: z.string().min(1).max(50),
  harvestDate: z.string().min(1),
  quantityKg: z.string().min(1),
  qualityGrade: z.enum(["A", "B", "C", "REJECTED"]).optional(),
  moistureContent: z.string().optional(),
  harvestedBy: z.string().optional(),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
});

export const POST = guarded(async (req: NextRequest, ctx) => {
  const body = await req.json();
  const parsed = RecordHarvestSchema.parse(body);

  const result = await recordHarvest({
    tenantId: ctx.tenantId,
    ...parsed,
  });

  return NextResponse.json(result, { status: 201 });
});
