/**
 * POST /api/v1/federation/production/activate/[id]
 * — HUMAN-GATED production activation for a federation authority record.
 *
 * [id] is the authority code (jurisdiction via ?jurisdiction=, default TZ).
 *
 * Gates (defense in depth — engine first, then 0071 CHECK constraints):
 *   1. federation:production.activate — HIGH_RISK, MFA step-up (can()).
 *   2. assertProductionActivation — HUMAN actor + permission + recorded
 *      approval reference + production evidence id.
 *   3. assertLifecycleMove — legal transition AND production-grade evidence
 *      (PRODUCTION_TEST / SIGNED_AUTHORITY_CONFIRMATION / OFFICIAL_CERTIFICATE)
 *      linked to THIS record, VALID and unexpired.
 *
 * Success moves the record to PRODUCTION_APPROVAL — the production gate.
 * LIVE / LIVE_VERIFIED still require their own live-operation evidence;
 * this endpoint never claims them.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { federationAuthorities, federationEvidence } from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import { publishEvent, recordAudit } from "@/lib/audit";
import {
  assertLifecycleMove,
  assertProductionActivation,
  FederationInvariantError,
  type EvidenceStatus,
  type FederationLifecycle,
} from "@/lib/federation";

const ActivateSchema = z.object({
  approvalReference: z.string().min(4).max(128),
  productionEvidenceId: z.string().min(1),
});

export async function POST(request: NextRequest, params: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "federation:production.activate",
      action: "federation.production.activate",
      rateLimit: { limit: 5, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_PRODUCTION" },
    },
    async (ctx) => {
      const { id: code } = await params.params;
      const url = new URL(request.url);
      const jurisdiction = (url.searchParams.get("jurisdiction") ?? "TZ").toUpperCase();
      const body = await parseBody(request, ActivateSchema);

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
        return apiError("NOT_FOUND", `Authority ${code} is not registered in ${jurisdiction}.`, 404, ctx.traceId);
      }
      const authority = rows[0];

      const evRows = await db
        .select()
        .from(federationEvidence)
        .where(eq(federationEvidence.id, body.productionEvidenceId))
        .limit(1);
      if (evRows.length === 0) {
        return apiError("NOT_FOUND", `Production evidence ${body.productionEvidenceId} does not exist.`, 404, ctx.traceId);
      }
      const ev = evRows[0];

      try {
        assertProductionActivation({
          actorUserId: ctx.principal.userId,
          actorType: "HUMAN",
          // Reaching this handler proves the HIGH_RISK permission (MFA step-up
          // enforced by can() in guarded()); the engine re-asserts the rest.
          permissionHeld: true,
          approvalReference: body.approvalReference,
          productionEvidenceId: ev.id,
        });
        assertLifecycleMove({
          recordId: authority.id,
          current: authority.lifecycleStatus as FederationLifecycle,
          to: "PRODUCTION_APPROVAL",
          productionEvidence: {
            id: ev.id,
            type: ev.type,
            subjectType: ev.subjectType,
            subjectId: ev.subjectId,
            status: ev.status as EvidenceStatus,
            expiresAt: ev.expiresAt ? ev.expiresAt.toISOString() : null,
          },
          approvedBy: ctx.principal.userId,
          approvalReference: body.approvalReference,
        });
      } catch (err) {
        if (err instanceof FederationInvariantError) {
          return apiError("FAIL_CLOSED", err.message, 409, ctx.traceId);
        }
        throw err;
      }

      await db
        .update(federationAuthorities)
        .set({
          lifecycleStatus: "PRODUCTION_APPROVAL",
          productionEvidenceId: ev.id,
          approvedBy: ctx.principal.userId,
          approvalReference: body.approvalReference,
        })
        .where(eq(federationAuthorities.id, authority.id));

      await recordAudit({
        tenantId: ctx.principal.tenantId,
        actorUserId: ctx.principal.userId,
        action: "federation.production.activate",
        objectType: "FEDERATION_AUTHORITY",
        objectId: authority.id,
        outcome: "SUCCESS",
        reason: `Authority ${authority.code} promoted to PRODUCTION_APPROVAL (approval ${body.approvalReference}, evidence ${ev.id})`,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        traceId: ctx.traceId,
      });
      await publishEvent({
        type: "federation.production.activated",
        source: "beyu-os",
        domain: "federation",
        operation: "federation.production.activate",
        destinationDomain: null,
        tenantId: ctx.principal.tenantId,
        legalEntityId: null,
        subjectType: "FEDERATION_AUTHORITY",
        subjectId: authority.id,
        actorUserId: ctx.principal.userId,
        actorType: "HUMAN",
        classification: "CONFIDENTIAL",
        payload: { authorityCode: authority.code, approvalReference: body.approvalReference, productionEvidenceId: ev.id },
        traceId: ctx.traceId,
        correlationId: ctx.correlationId,
        causationId: ctx.causationId ?? null,
        authorityContext: null,
        policyVersion: null,
      });

      return NextResponse.json({
        authorityCode: authority.code,
        lifecycleStatus: "PRODUCTION_APPROVAL",
        approvedBy: ctx.principal.userId,
        approvalReference: body.approvalReference,
        productionEvidenceId: ev.id,
        note: "PRODUCTION_APPROVAL is the production gate. LIVE/LIVE_VERIFIED still require their own live-operation evidence; nothing here claims them.",
      });
    },
  );
}
