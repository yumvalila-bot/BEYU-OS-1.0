/**
 * BEYU Foundation OS — Asset register (acquire → dispose).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { getAsset, listAssets, registerAsset, transitionAsset } from "@/lib/foundation/service-operations";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/foundation/types";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(300),
  foundationId: z.string().min(1),
  assetType: z.enum(["LAND", "BUILDING", "VEHICLE", "EQUIPMENT", "TECHNOLOGY", "INVENTORY", "DONATED", "IP"]),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  acquisitionValue: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().length(3).optional(),
  donatedByDonorId: z.string().min(1).optional(),
  location: z.string().max(300).optional(),
  custodianRole: z.string().max(120).optional(),
});

const TransitionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(ASSET_STATUSES as unknown as [string, ...string[]]),
  approvalRef: z.string().min(1).max(200).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:asset.read",
      action: "foundation.asset.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_ASSET" },
    },
    async (ctx) => {
      const id = new URL(request.url).searchParams.get("id");
      try {
        if (id) return NextResponse.json({ asset: await getAsset(ctx.principal, id) });
        return NextResponse.json({ assets: await listAssets(ctx.principal) });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:asset.manage",
      action: "foundation.asset.register",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_ASSET" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await registerAsset(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PATCH(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:asset.manage",
      action: "foundation.asset.transition",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_ASSET" },
    },
    async (ctx) => {
      try {
        const body = TransitionSchema.parse(await request.json());
        const row = await transitionAsset(
          foundationServiceContext(ctx),
          body.id,
          body.status as AssetStatus,
          body.approvalRef,
        );
        return NextResponse.json({ asset: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
