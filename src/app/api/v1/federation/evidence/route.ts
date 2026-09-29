/**
 * GET /api/v1/federation/evidence — evidence / provenance records.
 *
 * Every claim in the federation plane is evidence-backed or explicitly
 * marked unverified. This endpoint exposes the evidence trail so a
 * VERIFIED+ / LIVE state can always be traced to the artifact that
 * justified it (program §53).
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { federationEvidence } from "@/db/schema";
import { guarded } from "@/lib/api";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:read",
      action: "federation.evidence.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_EVIDENCE" },
    },
    async () => {
      const url = new URL(request.url);
      const subjectType = url.searchParams.get("subjectType")?.toUpperCase() || null;
      const subjectId = url.searchParams.get("subjectId") || null;
      const status = url.searchParams.get("status")?.toUpperCase() || null;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      const where = and(
        ...(subjectType ? [eq(federationEvidence.subjectType, subjectType)] : []),
        ...(subjectId ? [eq(federationEvidence.subjectId, subjectId)] : []),
        ...(status ? [eq(federationEvidence.status, status)] : []),
      );

      const [rows, countRows] = await Promise.all([
        db
          .select()
          .from(federationEvidence)
          .where(where)
          .orderBy(desc(federationEvidence.capturedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationEvidence)
          .where(where)
          .limit(1),
      ]);

      return NextResponse.json({
        total: Number(countRows[0]?.n ?? 0),
        limit,
        offset,
        evidence: rows,
      });
    },
  );
}
