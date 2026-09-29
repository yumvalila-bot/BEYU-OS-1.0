/**
 * GET /api/v1/federation/monitoring — Noelia/HIVE read-only monitoring
 * report (program §60).
 *
 * Noelia OBSERVES and SUMMARIZES: connector degradation, expired
 * evidence/agreements/credentials, overdue reviews, status drift, open
 * incidents. This endpoint is strictly read-only and can never authorize,
 * approve, revoke, repair or promote anything — the report's aiBoundary
 * field states that on every response.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  federationAgreements,
  federationAuthorities,
  federationConnectors,
  federationCredentials,
  federationEvidence,
  federationIncidents,
} from "@/db/schema";
import { guarded } from "@/lib/api";
import { buildFederationMonitoringReport } from "@/lib/federation";

export async function GET(_request: NextRequest) {
  return guarded(
    _request,
    {
      permission: "federation:audit.read",
      action: "federation.monitoring.report",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_MONITORING" },
    },
    async () => {
      const [authorities, connectors, agreements, credentials, evidence, incidents] = await Promise.all([
        db
          .select({
            code: federationAuthorities.code,
            officialName: federationAuthorities.officialName,
            lifecycleStatus: federationAuthorities.lifecycleStatus,
            verificationStatus: federationAuthorities.verificationStatus,
            accessCostStatus: federationAuthorities.accessCostStatus,
            govesbStatus: federationAuthorities.govesbStatus,
            nextReviewAt: federationAuthorities.nextReviewAt,
            recordStatus: federationAuthorities.recordStatus,
          })
          .from(federationAuthorities),
        db
          .select({
            code: federationConnectors.code,
            status: federationConnectors.status,
            health: federationConnectors.health,
            lastFailureAt: federationConnectors.lastFailureAt,
            lastErrorCode: federationConnectors.lastErrorCode,
            authFailures: federationConnectors.authFailures,
          })
          .from(federationConnectors),
        db
          .select({
            code: federationAgreements.code,
            status: federationAgreements.status,
            expiryDate: federationAgreements.expiryDate,
          })
          .from(federationAgreements),
        db
          .select({
            code: federationCredentials.code,
            status: federationCredentials.status,
            expiresAt: federationCredentials.expiresAt,
          })
          .from(federationCredentials),
        db
          .select({
            id: federationEvidence.id,
            status: federationEvidence.status,
            expiresAt: federationEvidence.expiresAt,
            subjectType: federationEvidence.subjectType,
            subjectId: federationEvidence.subjectId,
          })
          .from(federationEvidence),
        db
          .select({
            id: federationIncidents.id,
            status: federationIncidents.status,
            category: federationIncidents.category,
            title: federationIncidents.title,
          })
          .from(federationIncidents),
      ]);

      const report = buildFederationMonitoringReport({
        authorities: authorities.map((a) => ({ ...a, nextReviewAt: a.nextReviewAt ? a.nextReviewAt.toISOString() : null })),
        connectors: connectors.map((c) => ({
          ...c,
          lastFailureAt: c.lastFailureAt ? c.lastFailureAt.toISOString() : null,
        })),
        agreements: agreements.map((g) => ({ ...g, expiryDate: g.expiryDate ? g.expiryDate.toISOString() : null })),
        credentials: credentials.map((c) => ({ ...c, expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null })),
        evidence: evidence.map((e) => ({ ...e, expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null })),
        incidents,
      });

      return NextResponse.json({
        report,
        note: "Observations only. Noelia cannot authorize, approve, repair or activate; every recommended action requires a human through the governed path.",
      });
    },
  );
}
