/**
 * GET /api/v1/federation — federation trust plane overview.
 *
 * Returns registry posture counts only. The response deliberately surfaces
 * that NOTHING is live: lifecycle, verification, api and GovESB breakdowns
 * are returned as-is so consumers can never infer connectivity from this
 * plane (program §7: authority status ≠ connection status).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  federationAuthorities,
  federationConnectors,
  federationJurisdictions,
  federationServices,
} from "@/db/schema";
import { guarded } from "@/lib/api";
import { COST_UI_LABELS } from "@/lib/federation";

export async function GET(_request: NextRequest) {
  return guarded(
    _request,
    {
      permission: "federation:read",
      action: "federation.overview",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION" },
    },
    async () => {
      const [jurisdictions, authorityRows, serviceRows, connectorRows] = await Promise.all([
        db
          .select({
            code: federationJurisdictions.code,
            name: federationJurisdictions.name,
            kind: federationJurisdictions.kind,
            status: federationJurisdictions.status,
            profileVersion: federationJurisdictions.profileVersion,
          })
          .from(federationJurisdictions)
          .orderBy(federationJurisdictions.code),
        db
          .select({
            jurisdiction: federationAuthorities.jurisdictionCode,
            lifecycle: federationAuthorities.lifecycleStatus,
            verification: federationAuthorities.verificationStatus,
            api: federationAuthorities.apiStatus,
            govesb: federationAuthorities.govesbStatus,
            cost: federationAuthorities.accessCostStatus,
            reconciliation: federationAuthorities.reconciliationState,
            n: sql<number>`count(*)`,
          })
          .from(federationAuthorities)
          .groupBy(
            federationAuthorities.jurisdictionCode,
            federationAuthorities.lifecycleStatus,
            federationAuthorities.verificationStatus,
            federationAuthorities.apiStatus,
            federationAuthorities.govesbStatus,
            federationAuthorities.accessCostStatus,
            federationAuthorities.reconciliationState,
          ),
        db
          .select({ classification: federationServices.dataClassification, n: sql<number>`count(*)` })
          .from(federationServices)
          .groupBy(federationServices.dataClassification),
        db
          .select({ status: federationConnectors.status, n: sql<number>`count(*)` })
          .from(federationConnectors)
          .groupBy(federationConnectors.status),
      ]);

      const total = (rows: { n: number }[]) => rows.reduce((a, r) => a + Number(r.n), 0);

      return NextResponse.json({
        posture: {
          statement:
            "Federation trust plane: discovery and governance registry. Authority status is NOT connection status; no LIVE, LIVE_VERIFIED or FREE_CONFIRMED state may be inferred from any field in this plane.",
          costLabels: Object.fromEntries(Object.entries(COST_UI_LABELS)),
        },
        jurisdictions,
        authorities: {
          total: total(authorityRows),
          byLifecycle: summarize(authorityRows, "lifecycle"),
          byVerification: summarize(authorityRows, "verification"),
          byApiStatus: summarize(authorityRows, "api"),
          byGovESBStatus: summarize(authorityRows, "govesb"),
          byCostStatus: summarize(authorityRows, "cost"),
          byReconciliationState: summarize(authorityRows, "reconciliation"),
        },
        services: { total: total(serviceRows), byDataClassification: summarize(serviceRows, "classification") },
        connectors: { total: total(connectorRows), byStatus: summarize(connectorRows, "status") },
      });
    },
  );
}

type Row = { [k: string]: number | string };
function summarize(rows: Row[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key]);
    out[k] = (out[k] ?? 0) + Number(r.n);
  }
  return out;
}
