/**
 * BEYU OS — Agriculture OS: Crop Cycles API (DRAFT domain)
 *
 * GET  /api/v1/agriculture/crop-cycles — List crop cycles for current tenant
 * POST /api/v1/agriculture/crop-cycles — Create a crop cycle on a field
 *
 * Authorized by RBAC (`agriculture:data.read` / `agriculture:data.manage`).
 * Handler runs inside the guarded() tenant RLS context; cross-tenant writes
 * are additionally denied by Row Level Security.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createCropCycle, listCropCycles } from "@/lib/agriculture";

const CreateCropCycleSchema = z.object({
  fieldId: z.string().min(1),
  cropTypeId: z.string().min(1),
  code: z.string().min(1).max(50),
  season: z.string().min(1).max(100),
  plantingDate: z.string().min(1),
  expectedHarvestDate: z.string().optional(),
  seedQuantityKg: z.string().optional(),
  expectedYieldKg: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.cropCycles.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_CROP_CYCLE" },
    },
    async (ctx) => {
      const status = request.nextUrl.searchParams.get("status") ?? undefined;
      const cycles = await listCropCycles(ctx.principal.tenantId, status);
      return NextResponse.json({ cropCycles: cycles });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.cropCycles.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_CROP_CYCLE" },
    },
    async (ctx) => {
      const body = await request.json();
      const parsed = CreateCropCycleSchema.parse(body);

      const result = await createCropCycle({
        tenantId: ctx.principal.tenantId,
        ...parsed,
      });

      return NextResponse.json(result, { status: 201 });
    },
  );
}
