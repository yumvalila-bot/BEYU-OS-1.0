/**
 * GET /api/v1/federation/jurisdictions/[code] — one jurisdiction profile
 * with its capability negotiation table and domain taxonomy.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  federationCapabilities,
  federationDomains,
  federationJurisdictions,
} from "@/db/schema";
import { apiError, guarded } from "@/lib/api";

export async function GET(request: NextRequest, params: { params: Promise<{ code: string }> }) {
  return guarded(
    request,
    {
      permission: "federation:read",
      action: "federation.jurisdictions.get",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_JURISDICTION" },
    },
    async (ctx) => {
      const { code } = await params.params;
      const norm = code.toUpperCase();
      const profile = await db
        .select()
        .from(federationJurisdictions)
        .where(eq(federationJurisdictions.code, norm))
        .limit(1);
      if (profile.length === 0) {
        return apiError("NOT_FOUND", `Jurisdiction profile ${norm} is not registered.`, 404, ctx.traceId);
      }
      const [capabilities, domains] = await Promise.all([
        db
          .select()
          .from(federationCapabilities)
          .where(eq(federationCapabilities.jurisdictionCode, norm))
          .orderBy(federationCapabilities.capabilityCode),
        db
          .select({ code: federationDomains.code, displayName: federationDomains.displayName, parentCode: federationDomains.parentCode })
          .from(federationDomains)
          .where(and(eq(federationDomains.jurisdictionCode, norm)))
          .orderBy(federationDomains.code),
      ]);
      return NextResponse.json({
        jurisdiction: profile[0],
        capabilities,
        domains,
      });
    },
  );
}
