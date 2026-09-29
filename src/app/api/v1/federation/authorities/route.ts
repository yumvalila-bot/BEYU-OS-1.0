/**
 * GET /api/v1/federation/authorities — the comprehensive authority inventory.
 *
 * Filters: jurisdiction (default all), domain, type, scope, recordStatus,
 * apiStatus, govesbStatus, costStatus, reconciliationState, q (name/code).
 * Registry rows are global reference data (runtime SELECT-only RLS); the
 * response never presents a registry status as a connection status.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { federationAuthorities } from "@/db/schema";
import { guarded } from "@/lib/api";
import {
  ACCESS_COST_STATUS,
  API_STATUS,
  AUTHORITY_RECORD_STATUS,
  AUTHORITY_TYPES,
  GOVESB_STATUS,
  RECONCILIATION_STATES,
} from "@/lib/federation";

const PAGE_CAP = 200;

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:authority.read",
      action: "federation.authorities.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_AUTHORITY" },
    },
    async () => {
      const url = new URL(request.url);
      const param = (name: string) => url.searchParams.get(name);
      const jurisdiction = param("jurisdiction")?.toUpperCase() || null;
      const domain = param("domain")?.toUpperCase() || null;
      const type = param("type")?.toUpperCase() || null;
      const scope = param("scope")?.toUpperCase() || null;
      const recordStatus = param("recordStatus")?.toUpperCase() || null;
      const apiStatus = param("apiStatus")?.toUpperCase() || null;
      const govesbStatus = param("govesbStatus")?.toUpperCase() || null;
      const costStatus = param("costStatus")?.toUpperCase() || null;
      const reconciliationState = param("reconciliationState")?.toUpperCase() || null;
      const q = param("q") || null;

      const unknownEnum =
        (type && !(AUTHORITY_TYPES as readonly string[]).includes(type)) ||
        (recordStatus && !(AUTHORITY_RECORD_STATUS as readonly string[]).includes(recordStatus)) ||
        (apiStatus && !(API_STATUS as readonly string[]).includes(apiStatus)) ||
        (govesbStatus && !(GOVESB_STATUS as readonly string[]).includes(govesbStatus)) ||
        (costStatus && !(ACCESS_COST_STATUS as readonly string[]).includes(costStatus)) ||
        (reconciliationState && !(RECONCILIATION_STATES as readonly string[]).includes(reconciliationState));
      if (unknownEnum) {
        return NextResponse.json({ error: "VALIDATION", message: "An enum filter value is not in the federation catalogue." }, { status: 400 });
      }

      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), PAGE_CAP);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      const where = and(
        ...(jurisdiction ? [eq(federationAuthorities.jurisdictionCode, jurisdiction)] : []),
        ...(domain ? [eq(federationAuthorities.domainCode, domain)] : []),
        ...(type ? [eq(federationAuthorities.authorityType, type)] : []),
        ...(scope ? [eq(federationAuthorities.jurisdictionScope, scope)] : []),
        ...(recordStatus ? [eq(federationAuthorities.recordStatus, recordStatus)] : []),
        ...(apiStatus ? [eq(federationAuthorities.apiStatus, apiStatus)] : []),
        ...(govesbStatus ? [eq(federationAuthorities.govesbStatus, govesbStatus)] : []),
        ...(costStatus ? [eq(federationAuthorities.accessCostStatus, costStatus)] : []),
        ...(reconciliationState ? [eq(federationAuthorities.reconciliationState, reconciliationState)] : []),
        ...(q
          ? [
              or(
                ilike(federationAuthorities.officialName, `%${q}%`),
                ilike(federationAuthorities.shortName, `%${q}%`),
                ilike(federationAuthorities.code, `%${q}%`),
              ),
            ]
          : []),
      );

      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: federationAuthorities.id,
            jurisdictionCode: federationAuthorities.jurisdictionCode,
            code: federationAuthorities.code,
            domainCode: federationAuthorities.domainCode,
            officialName: federationAuthorities.officialName,
            shortName: federationAuthorities.shortName,
            authorityType: federationAuthorities.authorityType,
            jurisdictionScope: federationAuthorities.jurisdictionScope,
            officialWebsite: federationAuthorities.officialWebsite,
            consentRequired: federationAuthorities.consentRequired,
            agreementRequired: federationAuthorities.agreementRequired,
            apiStatus: federationAuthorities.apiStatus,
            govesbStatus: federationAuthorities.govesbStatus,
            verificationStatus: federationAuthorities.verificationStatus,
            accessCostStatus: federationAuthorities.accessCostStatus,
            recordStatus: federationAuthorities.recordStatus,
            lifecycleStatus: federationAuthorities.lifecycleStatus,
            reconciliationState: federationAuthorities.reconciliationState,
            legacyAgencyCode: federationAuthorities.legacyAgencyCode,
          })
          .from(federationAuthorities)
          .where(where)
          .orderBy(federationAuthorities.jurisdictionCode, federationAuthorities.code)
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationAuthorities)
          .where(where)
          .limit(1),
      ]);
      const total = Number(countRows[0]?.n ?? 0);

      return NextResponse.json({
        total,
        limit,
        offset,
        authorities: rows,
        note: "Registry status fields (verification, api, govesb, cost) are independent, separately-verified facts. PENDING_RECONCILIATION means the record has not yet been matched against the authoritative directory.",
      });
    },
  );
}
