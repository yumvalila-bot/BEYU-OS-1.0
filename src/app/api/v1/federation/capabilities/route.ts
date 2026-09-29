/**
 * GET /api/v1/federation/capabilities?jurisdiction=TZ
 * — the recorded capability negotiation table for a jurisdiction.
 *
 * Availability states are the current honest posture: AVAILABLE is limited
 * to public-information capabilities; protected access is REQUIRES_* until
 * legally authorized and evidenced.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { federationCapabilities, federationJurisdictions } from "@/db/schema";
import { apiError, guarded } from "@/lib/api";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:read",
      action: "federation.capabilities.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_CAPABILITY" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const jurisdiction = (url.searchParams.get("jurisdiction") ?? "TZ").toUpperCase();
      const profile = await db
        .select({ code: federationJurisdictions.code })
        .from(federationJurisdictions)
        .where(eq(federationJurisdictions.code, jurisdiction))
        .limit(1);
      if (profile.length === 0) {
        return apiError("NOT_FOUND", `Jurisdiction profile ${jurisdiction} is not registered.`, 404, ctx.traceId);
      }
      const capabilities = await db
        .select()
        .from(federationCapabilities)
        .where(and(eq(federationCapabilities.jurisdictionCode, jurisdiction)))
        .orderBy(federationCapabilities.capabilityCode);
      return NextResponse.json({
        jurisdiction,
        capabilities,
        note: "Capability availability is a recorded, per-capability fact. AVAILABLE applies only to public-information capabilities; REQUIRES_* states remain until authorization/agreement/local-entity requirements are met and evidenced.",
      });
    },
  );
}
