/**
 * POST /api/v1/federation/production/revoke/[id]
 * — HUMAN-GATED revocation: move a federation authority record to SUSPENDED.
 *
 * federation:production.revoke is HIGH_RISK (MFA step-up). The lifecycle
 * engine validates the transition (e.g. REVOKED is terminal; FAILED_VERIFICATION
 * cannot be suspended directly). Suspension keeps dependent services
 * fail-closed until a governed resumption decision is recorded.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { federationAuthorities } from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import { publishEvent, recordAudit } from "@/lib/audit";
import { assertLifecycleMove, FederationInvariantError, type FederationLifecycle } from "@/lib/federation";

const RevokeSchema = z.object({
  reason: z.string().min(4).max(2000),
});

export async function POST(request: NextRequest, params: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "federation:production.revoke",
      action: "federation.production.revoke",
      rateLimit: { limit: 5, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_PRODUCTION" },
    },
    async (ctx) => {
      const { id: code } = await params.params;
      const url = new URL(request.url);
      const jurisdiction = (url.searchParams.get("jurisdiction") ?? "TZ").toUpperCase();
      const body = await parseBody(request, RevokeSchema);

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

      try {
        assertLifecycleMove({
          recordId: authority.id,
          current: authority.lifecycleStatus as FederationLifecycle,
          to: "SUSPENDED",
          productionEvidence: null,
          approvedBy: ctx.principal.userId,
          approvalReference: null,
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
          lifecycleStatus: "SUSPENDED",
          notes: [authority.notes, `REVOKED ${new Date().toISOString().slice(0, 10)} by ${ctx.principal.userId}: ${body.reason}`]
            .filter(Boolean)
            .join(" | "),
        })
        .where(eq(federationAuthorities.id, authority.id));

      await recordAudit({
        tenantId: ctx.principal.tenantId,
        actorUserId: ctx.principal.userId,
        action: "federation.production.revoke",
        objectType: "FEDERATION_AUTHORITY",
        objectId: authority.id,
        outcome: "SUCCESS",
        reason: `Authority ${authority.code} suspended: ${body.reason}`,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        traceId: ctx.traceId,
      });
      await publishEvent({
        type: "federation.production.revoked",
        source: "beyu-os",
        domain: "federation",
        operation: "federation.production.revoke",
        destinationDomain: null,
        tenantId: ctx.principal.tenantId,
        legalEntityId: null,
        subjectType: "FEDERATION_AUTHORITY",
        subjectId: authority.id,
        actorUserId: ctx.principal.userId,
        actorType: "HUMAN",
        classification: "CONFIDENTIAL",
        payload: { authorityCode: authority.code, reason: body.reason },
        traceId: ctx.traceId,
        correlationId: ctx.correlationId,
        causationId: ctx.causationId ?? null,
        authorityContext: null,
        policyVersion: null,
      });

      return NextResponse.json({
        authorityCode: authority.code,
        lifecycleStatus: "SUSPENDED",
        note: "Dependent services remain fail-closed until a governed resumption decision is recorded.",
      });
    },
  );
}
