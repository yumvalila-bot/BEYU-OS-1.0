/**
 * Holograph — governed spatial asset registry.
 *
 * GET  → list assets visible to the principal (tenant-scoped,
 *        classification-filtered, RLS-bounded). Permission: viz:asset.read.
 * POST → register an asset (metadata + provenance + integrity reference only —
 *        never binary geometry, never sector data). Permission:
 *        viz:asset.manage. The format-support claim is validated against the
 *        honest support matrix server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { VIZ_ASSET_TYPES } from "@/db/schema/visualization";
import { listAssets, registerAsset } from "@/lib/viz/assets";
import { vizActor, vizErrorResponse } from "../_shared";

const CreateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    assetType: z.enum(VIZ_ASSET_TYPES as unknown as [string, ...string[]]),
    sourceSystem: z.string().trim().min(1).max(120),
    sourceObjectId: z.string().trim().min(1).max(200),
    integrityHash: z.string().trim().length(64),
    storageRef: z.string().trim().min(1).max(500),
    rationale: z.string().trim().min(4).max(2000),
    sourceVersion: z.string().trim().min(1).max(120).nullish(),
    legalEntityId: z.string().trim().min(1).max(200).nullish(),
    classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:asset.read",
      action: "viz.asset.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_ASSET" },
    },
    async (ctx) => {
      try {
        const params = new URL(request.url).searchParams;
        const assets = await listAssets(ctx.principal, {
          ...(params.get("assetType") ? { assetType: params.get("assetType")! } : {}),
          ...(params.get("status") === "ARCHIVED" ? { status: "ARCHIVED" as const } : {}),
          ...(params.get("limit") ? { limit: Number(params.get("limit")) } : {}),
        });
        return NextResponse.json({ assets });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:asset.manage",
      action: "viz.asset.register",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VIZ_ASSET" },
    },
    async (ctx) => {
      const body = await parseBody(request, CreateSchema);
      try {
        const asset = await registerAsset(
          {
            ...body,
            sourceVersion: body.sourceVersion ?? null,
            legalEntityId: body.legalEntityId ?? null,
          },
          vizActor(ctx),
          ctx.principal,
        );
        return NextResponse.json({ asset }, { status: 201 });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
