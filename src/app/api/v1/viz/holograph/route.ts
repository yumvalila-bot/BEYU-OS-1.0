/**
 * Holograph — capability overview (canon + honest status).
 *
 * GET → the canonical Holograph definition, its constitutional boundaries
 *       (what it is / is not), the authorization order, the honest subsystem
 *       status matrix, and the closed vocabularies (asset types + format
 *       support, device classes, interaction types, renderer matrix).
 *       Permission: viz:registry.read.
 *
 * This endpoint is the single server-side source of truth for "what is
 * Holograph and what does it actually support" — docs, UI and Noelia all
 * consume the same canon, so a claim can never appear in one surface and be
 * contradicted in another.
 */
import { NextRequest, NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import {
  HOLOGRAPH_AUTHORIZATION_ORDER,
  HOLOGRAPH_CAPABILITY_DESCRIPTION,
  HOLOGRAPH_CAPABILITY_NAME,
  HOLOGRAPH_CANONICAL_DEFINITION,
  HOLOGRAPH_IS,
  HOLOGRAPH_IS_NOT,
  HOLOGRAPH_SECTOR_CONSUMERS,
  holographSubsystemStatus,
} from "@/lib/viz/holograph";
import { assetFormatSupportMatrix } from "@/lib/viz/assets";
import { VIZ_ASSET_TYPES, VIZ_DEVICE_CLASSES, VIZ_INTERACTION_TARGET_DOMAINS, VIZ_INTERACTION_TYPES } from "@/db/schema/visualization";
import { rendererCapabilityMatrix } from "@/lib/viz/renderers";
import { VIZ_SUBSYSTEM_STATUS } from "@/lib/viz/service";
import { vizErrorResponse } from "../_shared";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:registry.read",
      action: "viz.holograph.overview",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "HOLOGRAPH_CAPABILITY" },
    },
    async (ctx) => {
      try {
        return NextResponse.json({
          capability: HOLOGRAPH_CAPABILITY_NAME,
          kind: "SHARED_BEYU_OS_CAPABILITY",
          notAnOS: true,
          definition: HOLOGRAPH_CANONICAL_DEFINITION,
          description: HOLOGRAPH_CAPABILITY_DESCRIPTION,
          is: HOLOGRAPH_IS,
          isNot: HOLOGRAPH_IS_NOT,
          authorizationOrder: HOLOGRAPH_AUTHORIZATION_ORDER,
          sectorConsumers: HOLOGRAPH_SECTOR_CONSUMERS,
          subsystems: holographSubsystemStatus(),
          graphicsFoundationSubsystems: VIZ_SUBSYSTEM_STATUS,
          assetRegistry: {
            types: VIZ_ASSET_TYPES,
            formatSupport: assetFormatSupportMatrix(),
            note: "Metadata registry: provenance + integrity references only; the registry never stores binary geometry.",
          },
          deviceRegistry: {
            classes: VIZ_DEVICE_CLASSES,
            note: "Hardware-independent abstraction. No physical holographic hardware support exists or is claimed; FUTURE_HOLOGRAPHIC_DEVICE devices can only ever be REGISTERED/NOT_IMPLEMENTED.",
          },
          interactionVocabulary: {
            types: VIZ_INTERACTION_TYPES,
            targetDomains: VIZ_INTERACTION_TARGET_DOMAINS,
            note: "Every request is ledgered (ALLOWED/DENIED/DELEGATED) with audit + event. Delegation never executes; CAP_POSTING remains LOCKED.",
          },
          renderers: rendererCapabilityMatrix(),
          traceId: ctx.traceId,
        });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
