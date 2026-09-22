/**
 * Universal Dimensional Graphics Foundation — scene deep link (§21).
 *
 * GET  → the GOVERNED MANIFEST for a stored scene: the configuration is
 *        loaded tenant-scoped, RE-AUTHORIZED (classification ceiling + the
 *        sector's own boundary), then the data is rebuilt LIVE through the
 *        sector adapter. A valid URL is never sufficient; a cross-tenant or
 *        out-of-scope id resolves to NOT_FOUND (existence is itself
 *        protected). Permission: viz:scene.read.
 * POST → archive the scene configuration (viz:scene.manage). Archiving
 *        never deletes sector data — scenes hold references, not truth.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { sceneManifest, archiveScene } from "@/lib/viz/service";
import { vizActor, vizErrorResponse, presentationFrom } from "../../_shared";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "viz:scene.read",
      action: "viz.scene.manifest",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_SCENE", objectId: id },
    },
    async (ctx) => {
      try {
        const manifest = await sceneManifest(ctx.principal, id, presentationFrom(request));
        return NextResponse.json({ manifest });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "viz:scene.manage",
      action: "viz.scene.archive",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "VIZ_SCENE", objectId: id },
    },
    async (ctx) => {
      try {
        const result = await archiveScene(id, vizActor(ctx), ctx.principal);
        return NextResponse.json({ scene: result });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
