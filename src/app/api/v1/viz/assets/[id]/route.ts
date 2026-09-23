/**
 * Holograph — governed spatial asset (deep link).
 *
 * GET   → load + re-authorize an asset by id (tenant, entity, classification,
 *         permission re-checked server-side; a URL is never a grant).
 *         Permission: viz:asset.read.
 * PATCH → version the asset's content reference (new integrity hash, version
 *         increment, provenance note). The asset id is stable. Permission:
 *         viz:asset.manage.
 *
 * The registry is metadata: these routes never serve binary geometry.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { getAsset, updateAssetVersion, archiveAsset } from "@/lib/viz/assets";
import { VizDomainError } from "@/lib/viz/errors";
import { vizActor, vizErrorResponse } from "../../_shared";

const UpdateSchema = z
  .object({
    integrityHash: z.string().trim().length(64),
    rationale: z.string().trim().min(4).max(2000),
    sourceVersion: z.string().trim().min(1).max(120).nullish(),
  })
  .strict();

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "viz:asset.read",
      action: "viz.asset.get",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_ASSET" },
    },
    async (ctx) => {
      const { id } = await params;
      try {
        const asset = await getAsset(ctx.principal, id);
        if (!asset) throw new VizDomainError("NOT_FOUND", "Asset not found within your authorized scope");
        return NextResponse.json({ asset });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "viz:asset.manage",
      action: "viz.asset.update",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VIZ_ASSET" },
    },
    async (ctx) => {
      const { id } = await params;
      const body = await parseBody(request, UpdateSchema);
      try {
        const asset = await updateAssetVersion(
          id,
          { integrityHash: body.integrityHash, rationale: body.rationale, sourceVersion: body.sourceVersion ?? null },
          vizActor(ctx),
          ctx.principal,
        );
        return NextResponse.json({ asset });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}

/** POST /api/v1/viz/assets/:id — archive (the registry has no DELETE:
 * archived assets remain auditable evidence). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "viz:asset.manage",
      action: "viz.asset.archive",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VIZ_ASSET" },
    },
    async (ctx) => {
      const { id } = await params;
      try {
        const result = await archiveAsset(id, vizActor(ctx), ctx.principal);
        return NextResponse.json(result);
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
