/**
 * GET /api/v1/federation/services — federation service records.
 *
 * Each service has INDEPENDENT status: data classification, consent,
 * agreement, cost, api, GovESB, verification and access level are separate
 * facts. `accessLevel=GRANTED` is never seeded and is unreachable without a
 * recorded approval + evidence chain.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { federationAuthorities, federationServices } from "@/db/schema";
import { guarded } from "@/lib/api";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:service.read",
      action: "federation.services.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_SERVICE" },
    },
    async () => {
      const url = new URL(request.url);
      const authorityCode = url.searchParams.get("authorityCode")?.toUpperCase() || null;
      const jurisdiction = url.searchParams.get("jurisdiction")?.toUpperCase() || null;
      const classification = url.searchParams.get("classification")?.toUpperCase() || null;
      const accessLevel = url.searchParams.get("accessLevel")?.toUpperCase() || null;
      const q = url.searchParams.get("q") || null;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      const where = and(
        ...(authorityCode ? [eq(federationAuthorities.code, authorityCode)] : []),
        ...(jurisdiction ? [eq(federationAuthorities.jurisdictionCode, jurisdiction)] : []),
        ...(classification ? [eq(federationServices.dataClassification, classification)] : []),
        ...(accessLevel ? [eq(federationServices.accessLevel, accessLevel)] : []),
        ...(q ? [ilike(federationServices.name, `%${q}%`)] : []),
      );

      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: federationServices.id,
            code: federationServices.code,
            name: federationServices.name,
            authorityCode: federationAuthorities.code,
            jurisdictionCode: federationAuthorities.jurisdictionCode,
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
          .innerJoin(federationAuthorities, eq(federationServices.authorityId, federationAuthorities.id))
          .where(where)
          .orderBy(federationServices.code)
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationServices)
          .innerJoin(federationAuthorities, eq(federationServices.authorityId, federationAuthorities.id))
          .where(where)
          .limit(1),
      ]);

      return NextResponse.json({
        total: Number(countRows[0]?.n ?? 0),
        limit,
        offset,
        services: rows,
      });
    },
  );
}
