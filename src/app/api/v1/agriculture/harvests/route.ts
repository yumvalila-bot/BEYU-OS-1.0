/**
 * BEYU OS — Agriculture OS: Harvests API (DRAFT domain)
 *
 * POST /api/v1/agriculture/harvests — Record a harvest for a crop cycle
 *
 * Authorized by RBAC (`agriculture:data.manage`). The handler runs inside the
 * guarded() tenant RLS context; cross-tenant writes are additionally denied by
 * Row Level Security.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
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

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.harvests.record",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_HARVEST" },
    },
    async (ctx) => {
      const body = await request.json();
      const parsed = RecordHarvestSchema.parse(body);

      const result = await recordHarvest({
        tenantId: ctx.principal.tenantId,
        ...parsed,
      });

      return NextResponse.json(result, { status: 201 });
    },
  );
}
