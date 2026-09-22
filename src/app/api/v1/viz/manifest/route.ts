/**
 * Universal Dimensional Graphics Foundation — ad-hoc governed manifest.
 *
 * GET → build a scene manifest directly from query parameters (sector,
 *       dimensions, optional subjectId) WITHOUT a stored scene: the same
 *       governed path the workspace UI uses for exploration. The adapter
 *       re-checks the sector boundary; unknown dimensions are REJECTED
 *       (never assumed); the projection is the exact client allowlist.
 *       Permission: viz:scene.read.
 *
 * This endpoint exists so the shared workspace can visualize any authorized
 * sector immediately; saved scenes (viz/scenes) add persistence + deep links
 * on top of the identical projection.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { buildGovernedManifest } from "@/lib/viz/service";
import { VIZ_SECTOR_CODES } from "@/lib/viz/dimensions";
import { vizErrorResponse, presentationFrom } from "../_shared";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:scene.read",
      action: "viz.manifest.build",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_SCENE" },
    },
    async (ctx) => {
      try {
        const params = new URL(request.url).searchParams;
        const sector = params.get("sector") ?? "";
        if (!(VIZ_SECTOR_CODES as readonly string[]).includes(sector)) {
          return NextResponse.json(
            {
              error: {
                code: "VALIDATION_FAILED",
                message: `sector must be one of ${VIZ_SECTOR_CODES.join(", ")}. The canonical consumers are BEYU, HEALTH, FINANCE, AGRICULTURE, UJENZI and FOUNDATION.`,
                traceId: ctx.traceId,
              },
            },
            { status: 422 },
          );
        }
        const dimensions = (params.get("dimensions") ?? "1D,2D,4D,5D,7D,8D")
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean);
        const manifest = await buildGovernedManifest(ctx.principal, {
          sector: sector as (typeof VIZ_SECTOR_CODES)[number],
          dimensions,
          subjectId: params.get("subjectId"),
          presentation: presentationFrom(request),
        });
        return NextResponse.json({ manifest });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
