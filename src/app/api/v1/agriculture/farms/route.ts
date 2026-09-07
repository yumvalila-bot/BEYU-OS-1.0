/**
 * BEYU OS — Agriculture OS: Farms API (DRAFT domain)
 *
 * GET  /api/v1/agriculture/farms — List farms for current tenant
 * POST /api/v1/agriculture/farms — Create a new farm
 *
 * Authorized by RBAC (`agriculture:data.read` / `agriculture:data.manage`).
 * Only SECTOR_OPERATOR carries these permissions today, so every other role
 * fails closed with 403. The handler runs inside the guarded() tenant RLS
 * context; cross-tenant writes are additionally denied by Row Level Security.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createFarm, listFarms } from "@/lib/agriculture";

const CreateFarmSchema = z.object({
  legalEntityId: z.string().min(1),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2),
  totalAreaHa: z.string().optional(),
  arableAreaHa: z.string().optional(),
  soilType: z.string().optional(),
  waterSource: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.farms.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_FARM" },
    },
    async (ctx) => {
      const farms = await listFarms(ctx.principal.tenantId);
      return NextResponse.json({ farms });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.farms.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_FARM" },
    },
    async (ctx) => {
      const body = await request.json();
      const parsed = CreateFarmSchema.parse(body);

      const result = await createFarm({
        tenantId: ctx.principal.tenantId,
        ...parsed,
      });

      return NextResponse.json(result, { status: 201 });
    },
  );
}
