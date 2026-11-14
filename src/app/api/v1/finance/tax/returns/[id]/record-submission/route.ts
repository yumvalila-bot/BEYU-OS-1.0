import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { taxReturnDrafts } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";

export const dynamic = "force-dynamic";

const SubmissionSchema = z.object({
  traReference: z.string().trim().min(6).max(128),
  submittedAt: z.string().datetime(),
  notes: z.string().trim().min(10).max(2000),
});

/**
 * Records a manual TRA portal submission after the authorized officer has
 * submitted it externally. This endpoint never logs in to TRA or submits.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guarded(request, {
    permission: "finance:tax.submit",
    action: "finance.tax.return.record_submission",
    rateLimit: { limit: 10, windowMs: 60_000 },
    audit: { objectType: "TAX_RETURN_DRAFT" },
  }, async (ctx) => {
    const { id } = await context.params;
    const body = await parseBody(ctx.request, SubmissionSchema);
    if (!ctx.principal.roles.includes("TAX_FILING_OFFICER")) {
      return apiError("TAX_FILING_OFFICER_REQUIRED", "An appointed Tax Filing Officer must record the manual TRA submission.", 403, ctx.traceId);
    }
    const tenantIds = await tenantScopeIds(ctx.principal);
    const [draft] = await db.select().from(taxReturnDrafts).where(and(
      eq(taxReturnDrafts.id, id),
      inArray(taxReturnDrafts.tenantId, tenantIds),
      inArray(taxReturnDrafts.classification, classificationsAtOrBelow(ctx.principal.clearance)),
      ...(ctx.principal.entityScope.length > 0 ? [inArray(taxReturnDrafts.legalEntityId, ctx.principal.entityScope)] : []),
    )).limit(1);
    if (!draft) return apiError("NOT_FOUND", "Tax return draft not found.", 404, ctx.traceId);
    if (draft.status !== "APPROVED_FOR_SUBMISSION") return apiError("INVALID_STATE", "Only a Group-CFO-approved draft may be recorded as submitted.", 409, ctx.traceId);
    if ([draft.createdBy, draft.specialistReviewerId, draft.approvedBy].includes(ctx.principal.userId)) {
      return apiError("SEPARATION_OF_DUTIES", "The preparer, specialist reviewer or approver cannot record the same return as submitted.", 403, ctx.traceId);
    }
    const submittedAt = new Date(body.submittedAt);
    if (Number.isNaN(submittedAt.getTime()) || submittedAt.getTime() > Date.now() + 5 * 60_000 || !draft.approvedAt || submittedAt < draft.approvedAt) {
      return apiError("INVALID_SUBMISSION_TIME", "Submission timestamp must be valid and cannot be materially in the future.", 422, ctx.traceId);
    }
    const filingPack = {
      ...(draft.filingPack as Record<string, unknown>),
      manualTraSubmission: {
        traReference: body.traReference,
        submittedAt: submittedAt.toISOString(),
        recordedBy: ctx.principal.userId,
        notes: body.notes,
        channel: "TRA_TAXPAYER_PORTAL_IDRAS",
      },
    };
    const [updated] = await db.update(taxReturnDrafts).set({
      status: "SUBMITTED",
      externalReference: body.traReference,
      submittedAt,
      submittedBy: ctx.principal.userId,
      filingPack,
      updatedAt: new Date(),
    }).where(and(
      eq(taxReturnDrafts.id, draft.id),
      eq(taxReturnDrafts.status, "APPROVED_FOR_SUBMISSION"),
      inArray(taxReturnDrafts.tenantId, tenantIds),
    )).returning({
      id: taxReturnDrafts.id,
      status: taxReturnDrafts.status,
      externalReference: taxReturnDrafts.externalReference,
      submittedAt: taxReturnDrafts.submittedAt,
    });
    if (!updated) return apiError("CONCURRENT_MODIFICATION", "The draft changed during submission recording. Reload and try again.", 409, ctx.traceId);
    return apiOk({ submission: updated, note: "Submission was recorded; BEYU did not submit to TRA or make a payment." }, ctx.traceId);
  });
}
