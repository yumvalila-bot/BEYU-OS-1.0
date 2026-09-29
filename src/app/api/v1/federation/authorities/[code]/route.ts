/**
 * GET /api/v1/federation/authorities/[code]?jurisdiction=TZ
 * — one authority record plus its services, evidence and cost facts.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  federationAuthorities,
  federationEvidence,
  federationServices,
} from "@/db/schema";
import { apiError, guarded } from "@/lib/api";

export async function GET(request: NextRequest, params: { params: Promise<{ code: string }> }) {
  return guarded(
    request,
    {
      permission: "federation:authority.read",
      action: "federation.authorities.get",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_AUTHORITY" },
    },
    async (ctx) => {
      const { code } = await params.params;
      const url = new URL(request.url);
      const jurisdiction = (url.searchParams.get("jurisdiction") ?? "TZ").toUpperCase();

      const rows = await db
        .select()
        .from(federationAuthorities)
        .where(
          and(
            eq(federationAuthorities.jurisdictionCode, jurisdiction),
            eq(federationAuthorities.code, code.toUpperCase()),
          ),
        )
        .limit(1);
      if (rows.length === 0) {
        return apiError("NOT_FOUND", `Authority ${code} is not registered in jurisdiction ${jurisdiction}.`, 404, ctx.traceId);
      }
      const authority = rows[0];

      const [services, evidence] = await Promise.all([
        db
          .select({
            id: federationServices.id,
            code: federationServices.code,
            name: federationServices.name,
            dataClassification: federationServices.dataClassification,
            consentRequired: federationServices.consentRequired,
            agreementRequired: federationServices.agreementRequired,
            accessCostStatus: federationServices.accessCostStatus,
            apiStatus: federationServices.apiStatus,
            govesbStatus: federationServices.govesbStatus,
            verificationStatus: federationServices.verificationStatus,
            accessLevel: federationServices.accessLevel,
          })
          .from(federationServices)
          .where(eq(federationServices.authorityId, authority.id))
          .orderBy(federationServices.code),
        db
          .select({
            id: federationEvidence.id,
            type: federationEvidence.type,
            subjectType: federationEvidence.subjectType,
            subjectId: federationEvidence.subjectId,
            title: federationEvidence.title,
            status: federationEvidence.status,
            expiresAt: federationEvidence.expiresAt,
            capturedAt: federationEvidence.capturedAt,
          })
          .from(federationEvidence)
          .where(
            and(eq(federationEvidence.subjectType, "AUTHORITY"), eq(federationEvidence.subjectId, authority.id)),
          )
          .orderBy(federationEvidence.capturedAt),
      ]);

      return NextResponse.json({
        authority,
        services,
        evidence,
        note: "verificationStatus, apiStatus, govesbStatus and accessCostStatus are independently verified facts. None of them implies the authority is connected.",
      });
    },
  );
}
