/**
 * GET /api/v1/federation/connectors — connector and health records.
 *
 * Connectors are ABSTRACTIONS. A row here describes an intended or
 * provisioned integration path, not a live, authorized, working channel.
 * Health metrics are recorded facts; `isMock=TRUE` rows are pipeline
 * verification only and can never be presented as a real integration.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { federationConnectors } from "@/db/schema";
import { guarded } from "@/lib/api";
import { CONNECTOR_HEALTH, CONNECTOR_STATUS } from "@/lib/federation";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:connector.read",
      action: "federation.connectors.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_CONNECTOR" },
    },
    async () => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status")?.toUpperCase() || null;
      const health = url.searchParams.get("health")?.toUpperCase() || null;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      const badEnum =
        (status && !(CONNECTOR_STATUS as readonly string[]).includes(status)) ||
        (health && !(CONNECTOR_HEALTH as readonly string[]).includes(health));
      if (badEnum) {
        return NextResponse.json({ error: "VALIDATION", message: "A connector enum filter is not in the federation catalogue." }, { status: 400 });
      }

      const where = and(
        ...(status ? [eq(federationConnectors.status, status)] : []),
        ...(health ? [eq(federationConnectors.health, health)] : []),
      );

      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: federationConnectors.id,
            code: federationConnectors.code,
            authorityId: federationConnectors.authorityId,
            connectorType: federationConnectors.connectorType,
            authModel: federationConnectors.authModel,
            govesbStatus: federationConnectors.govesbStatus,
            status: federationConnectors.status,
            isMock: federationConnectors.isMock,
            health: federationConnectors.health,
            availabilityPct: federationConnectors.availabilityPct,
            latencyMs: federationConnectors.latencyMs,
          })
          .from(federationConnectors)
          .where(where)
          .orderBy(federationConnectors.code)
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationConnectors)
          .where(where)
          .limit(1),
      ]);

      return NextResponse.json({
        total: Number(countRows[0]?.n ?? 0),
        limit,
        offset,
        connectors: rows,
        note: "A connector row is an abstraction, not a live channel. isMock=TRUE rows are pipeline-verification only and must never be presented as a real government integration.",
      });
    },
  );
}
