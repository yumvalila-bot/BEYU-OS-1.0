/**
 * GET /api/v1/federation/jurisdictions — jurisdiction profiles.
 * Profiles are REQUIREMENTS and references, never compliance claims:
 * integration regimes (e.g. GovESB) are returned as recorded requirements.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { federationJurisdictions } from "@/db/schema";
import { guarded } from "@/lib/api";

export async function GET(_request: NextRequest) {
  return guarded(
    _request,
    {
      permission: "federation:read",
      action: "federation.jurisdictions.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_JURISDICTION" },
    },
    async () => {
      const rows = await db
        .select()
        .from(federationJurisdictions)
        .orderBy(federationJurisdictions.code);
      return NextResponse.json({
        note: "Jurisdiction profiles record structure, legal references and integration REQUIREMENTS TO VERIFY. A profile stating requirements is not a compliance claim.",
        jurisdictions: rows,
      });
    },
  );
}
