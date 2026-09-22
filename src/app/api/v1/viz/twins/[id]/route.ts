/**
 * Universal Dimensional Graphics Foundation — LIVE twin projection (§21).
 *
 * GET → the digital twin for a stored registration: identity from the
 *       registration (tenant-scoped load + re-authorization), EVERY other
 *       facet re-collected live through the sector adapter under the
 *       principal's current authority. Stored rows never serve sector truth;
 *       a twin cannot go stale into a leak. A cross-tenant or out-of-scope id
 *       resolves to NOT_FOUND. Permission: viz:scene.read.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { projectTwin } from "@/lib/viz/service";
import { vizErrorResponse } from "../../_shared";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "viz:scene.read",
      action: "viz.twin.project",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "VIZ_DIGITAL_TWIN", objectId: id },
    },
    async (ctx) => {
      try {
        const twin = await projectTwin(ctx.principal, id);
        return NextResponse.json({ twin });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
