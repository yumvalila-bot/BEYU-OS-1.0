/**
 * GET  /api/v1/government/submissions — tenant-scoped submission records.
 * POST /api/v1/government/submissions — submit a governed operation to a
 *      government system through the canonical gateway.
 *
 * POST is HIGH_RISK (government:submission.manage → MFA step-up in can()).
 * The gateway enforces the rest of the pipeline: policy, registry state,
 * idempotency, fail-closed transitions, audit. This route adds nothing to
 * that pipeline — it only translates HTTP.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { governmentSubmissions, legalEntities } from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import { classificationsAtOrBelow } from "@/lib/constants";
import { createDefaultGovernmentGateway, GovernmentGatewayError } from "@/lib/government";
import { tenantScopeIds } from "@/lib/tenant-scope";

const SubmitSchema = z.object({
  agencyCode: z.string().min(2).max(32),
  legalEntityId: z.string().min(1),
  submissionType: z.string().min(2).max(64),
  idempotencyKey: z.string().min(8).max(128),
  payload: z.unknown(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "government:integration.read",
      action: "government.submissions.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "GOVERNMENT_SUBMISSION" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const agency = url.searchParams.get("agencyCode");
      const tenantIds = await tenantScopeIds(ctx.principal);
      const where = and(
        inArray(governmentSubmissions.tenantId, tenantIds),
        inArray(
          legalEntities.classification,
          classificationsAtOrBelow(ctx.principal.clearance),
        ),
        ...(ctx.principal.entityScope.length > 0
          ? [inArray(governmentSubmissions.legalEntityId, ctx.principal.entityScope)]
          : []),
        ...(agency ? [eq(governmentSubmissions.agencyCode, agency)] : []),
      );
      const rows = await db
        .select({
          id: governmentSubmissions.id,
          agencyCode: governmentSubmissions.agencyCode,
          submissionType: governmentSubmissions.submissionType,
          status: governmentSubmissions.status,
          externalReference: governmentSubmissions.externalReference,
          attemptCount: governmentSubmissions.attemptCount,
          lastErrorCode: governmentSubmissions.lastErrorCode,
          createdAt: governmentSubmissions.createdAt,
          updatedAt: governmentSubmissions.updatedAt,
        })
        .from(governmentSubmissions)
        .innerJoin(
          legalEntities,
          and(
            eq(legalEntities.id, governmentSubmissions.legalEntityId),
            eq(legalEntities.tenantId, governmentSubmissions.tenantId),
          ),
        )
        .where(where)
        .orderBy(desc(governmentSubmissions.createdAt))
        .limit(200);
      return NextResponse.json({ submissions: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "government:submission.manage",
      action: "government.submissions.create",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "GOVERNMENT_SUBMISSION" },
    },
    async (ctx) => {
      const body = await parseBody(request, SubmitSchema);
      const gateway = createDefaultGovernmentGateway();
      try {
        const result = await gateway.submit({
          actor: {
            principal: ctx.principal,
            traceId: ctx.traceId,
            correlationId: ctx.correlationId,
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
          },
          agencyCode: body.agencyCode,
          permission: "government:submission.manage",
          legalEntityId: body.legalEntityId,
          submissionType: body.submissionType,
          payload: body.payload,
          idempotencyKey: body.idempotencyKey,
        });
        return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
      } catch (err) {
        if (err instanceof GovernmentGatewayError) {
          return apiError(err.code, err.message, err.status, ctx.traceId);
        }
        throw err;
      }
    },
  );
}
