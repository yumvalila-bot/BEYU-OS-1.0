import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { taxReturnDrafts } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ReviewSchema = z.object({
  decision: z.enum(["CONFIRM_PROVISIONAL", "RETURN_FOR_CORRECTION"]),
  notes: z.string().trim().min(10).max(3000),
});

/**
 * A qualified reviewer may record that a provisional calculation was reviewed.
 * This never elevates it to authoritative law or approves TRA submission.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guarded(request, {
    permission: "finance:tax.review",
    action: "finance.tax.return.review",
    rateLimit: { limit: 20, windowMs: 60_000 },
    audit: { objectType: "TAX_RETURN_DRAFT" },
  }, async (ctx) => {
    const { id } = await context.params;
    const body = await parseBody(ctx.request, ReviewSchema);
    const tenantIds = await tenantScopeIds(ctx.principal);
    const [draft] = await db.select().from(taxReturnDrafts).where(and(
      eq(taxReturnDrafts.id, id),
      inArray(taxReturnDrafts.tenantId, tenantIds),
      inArray(taxReturnDrafts.classification, classificationsAtOrBelow(ctx.principal.clearance)),
      ...(ctx.principal.entityScope.length > 0 ? [inArray(taxReturnDrafts.legalEntityId, ctx.principal.entityScope)] : []),
    )).limit(1);
    if (!draft) return apiError("NOT_FOUND", "Tax return draft not found.", 404, ctx.traceId);
    if (draft.createdBy === ctx.principal.userId) return apiError("SEPARATION_OF_DUTIES", "The preparer cannot review their own tax return draft.", 403, ctx.traceId);
    const roles = ctx.principal.roles;
    const qualified = draft.taxType === "CUSTOMS_PROCESSING_FEE"
      ? roles.includes("CUSTOMS_SPECIALIST") || roles.includes("TAX_MANAGER")
      : roles.includes("TAX_SPECIALIST") || roles.includes("TAX_MANAGER");
    if (!qualified) return apiError("SPECIALIST_ROLE_REQUIRED", "A Tax Specialist/Tax Manager is required; customs drafts require a Customs Specialist or Tax Manager.", 403, ctx.traceId);
    if (!["DRAFT", "PENDING_SPECIALIST_REVIEW"].includes(draft.status)) {
      return apiError("INVALID_STATE", "Only draft returns awaiting specialist review may be reviewed.", 409, ctx.traceId);
    }
    const reviewedAt = new Date();
    const nextStatus = body.decision === "CONFIRM_PROVISIONAL" ? "SPECIALIST_REVIEWED_PROVISIONAL" : "REJECTED";
    const filingPack = {
      ...(draft.filingPack as Record<string, unknown>),
      specialistReview: {
        reviewerId: ctx.principal.userId,
        reviewedAt: reviewedAt.toISOString(),
        disposition: body.decision,
        notes: body.notes,
        authorityEffect: "PROVISIONAL_REVIEW_ONLY_NOT_LEGAL_AUTHORITY_OR_SUBMISSION_APPROVAL",
      },
    };
    const [updated] = await db.update(taxReturnDrafts).set({
      status: nextStatus,
      specialistReviewerId: ctx.principal.userId,
      specialistReviewedAt: reviewedAt,
      filingPack,
      updatedAt: reviewedAt,
    }).where(and(
      eq(taxReturnDrafts.id, draft.id),
      eq(taxReturnDrafts.status, draft.status),
      inArray(taxReturnDrafts.tenantId, tenantIds),
    )).returning({
      id: taxReturnDrafts.id,
      status: taxReturnDrafts.status,
      specialistReviewerId: taxReturnDrafts.specialistReviewerId,
      specialistReviewedAt: taxReturnDrafts.specialistReviewedAt,
    });
    if (!updated) return apiError("CONCURRENT_MODIFICATION", "The draft changed during review. Reload and try again.", 409, ctx.traceId);
    return apiOk({
      review: updated,
      notes: body.notes,
      nextStep: body.decision === "CONFIRM_PROVISIONAL"
        ? "A second authorized Finance approver is required, but final approval remains blocked until legal sources and rule versions are authenticated."
        : "The draft was returned and cannot be submitted.",
    }, ctx.traceId);
  });
}
