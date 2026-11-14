import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { taxReturnDrafts } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ApprovalSchema = z.object({
  approvalReference: z.string().trim().min(6).max(256),
  notes: z.string().trim().min(10).max(3000),
});

/**
 * Second-person approval gate. Current provisional rule sets are intentionally
 * rejected; this route becomes usable only after source/rule authority is real.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guarded(request, {
    permission: "finance:tax.approve",
    action: "finance.tax.return.approve",
    rateLimit: { limit: 10, windowMs: 60_000 },
    audit: { objectType: "TAX_RETURN_DRAFT" },
  }, async (ctx) => {
    const { id } = await context.params;
    const body = await parseBody(ctx.request, ApprovalSchema);
    if (!ctx.principal.roles.includes("GROUP_CFO")) {
      return apiError("FINANCE_APPROVER_REQUIRED", "Only the authorized Group CFO role may approve a tax return for submission.", 403, ctx.traceId);
    }
    const tenantIds = await tenantScopeIds(ctx.principal);
    const [draft] = await db.select().from(taxReturnDrafts).where(and(
      eq(taxReturnDrafts.id, id),
      inArray(taxReturnDrafts.tenantId, tenantIds),
      inArray(taxReturnDrafts.classification, classificationsAtOrBelow(ctx.principal.clearance)),
      ...(ctx.principal.entityScope.length > 0 ? [inArray(taxReturnDrafts.legalEntityId, ctx.principal.entityScope)] : []),
    )).limit(1);
    if (!draft) return apiError("NOT_FOUND", "Tax return draft not found.", 404, ctx.traceId);
    if (draft.createdBy === ctx.principal.userId || draft.specialistReviewerId === ctx.principal.userId) {
      return apiError("SEPARATION_OF_DUTIES", "The preparer or specialist reviewer cannot approve the same tax return.", 403, ctx.traceId);
    }
    if (draft.status !== "SPECIALIST_REVIEWED_PROVISIONAL") {
      return apiError("INVALID_STATE", "A specialist-reviewed provisional draft is required before finance approval.", 409, ctx.traceId);
    }
    const calculation = draft.calculationPayload as {
      authorityStatus?: string;
      ruleApprovalReference?: string;
      sourceRefs?: Array<{ evidenceStatus?: string }>;
    };
    const sourcesAuthoritative = Array.isArray(calculation.sourceRefs) &&
      calculation.sourceRefs.length > 0 &&
      calculation.sourceRefs.every((source) => source.evidenceStatus === "AUTHORITATIVE");
    if (calculation.authorityStatus !== "AUTHORITATIVE" || !calculation.ruleApprovalReference || !sourcesAuthoritative) {
      return apiError(
        "SOURCE_AUTHORITY_INCOMPLETE",
        "Approval blocked: the saved computation is provisional and one or more legal sources/rules have not passed original-file authentication and specialist ratification. The draft may be reviewed, but cannot be approved for TRA submission.",
        409,
        ctx.traceId,
      );
    }
    const approvedAt = new Date();
    const filingPack = {
      ...(draft.filingPack as Record<string, unknown>),
      financeApproval: {
        approverId: ctx.principal.userId,
        approvedAt: approvedAt.toISOString(),
        approvalReference: body.approvalReference,
        notes: body.notes,
      },
    };
    const [updated] = await db.update(taxReturnDrafts).set({
      status: "APPROVED_FOR_SUBMISSION",
      approvedBy: ctx.principal.userId,
      approvedAt,
      filingPack,
      updatedAt: approvedAt,
    }).where(and(
      eq(taxReturnDrafts.id, draft.id),
      eq(taxReturnDrafts.status, "SPECIALIST_REVIEWED_PROVISIONAL"),
      inArray(taxReturnDrafts.tenantId, tenantIds),
    )).returning({
      id: taxReturnDrafts.id,
      status: taxReturnDrafts.status,
      approvedBy: taxReturnDrafts.approvedBy,
      approvedAt: taxReturnDrafts.approvedAt,
    });
    if (!updated) return apiError("CONCURRENT_MODIFICATION", "The draft changed during approval. Reload and try again.", 409, ctx.traceId);
    return apiOk({
      approval: updated,
      submission: "NOT_SUBMITTED",
      nextStep: "Submit through the authorized TRA taxpayer portal and record the external TRA reference; BEYU does not submit or pay automatically.",
    }, ctx.traceId);
  });
}
