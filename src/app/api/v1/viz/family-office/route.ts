/**
 * Holograph × Family Office — governed spatial family-enterprise view.
 *
 * GET → the LIVE projection of the family-enterprise structure (trust →
 *       holding → country holdings → sector operating companies → assets)
 *       from the canonical Organization & Ownership, Family Trust and entity
 *       registries. Permission: viz:scene.read AND organization:entity.read
 *       (each facet — ownership edges, trust instruments — additionally
 *       requires its own read grant and degrades to a count-free UNAVAILABLE
 *       reason without it).
 *
 * The view is visibility only: it confers no ownership, custody,
 * administration, governance or decision authority over any node.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { familyOfficeStructureView } from "@/lib/viz/family-office-view";
import { vizErrorResponse } from "../_shared";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:scene.read",
      action: "viz.familyOffice.view",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FAMILY_OFFICE_VIEW" },
    },
    async (ctx) => {
      try {
        const view = await familyOfficeStructureView(ctx.principal);
        return NextResponse.json({ view });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
