import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { listReviews, recordReview } from "@/lib/family-office-protection-service";
import { protectionError } from "../../../_common";

export const dynamic = "force-dynamic";

/**
 * Policy review records (§14). The FINDINGS are computed deterministically by
 * the read path (GET detail returns `reviewFlags`); this POST records a human
 * review over them. Recording a review never modifies the policy itself except
 * the reviewer's own cadence fields, and any governance-stage move it carries
 * is validated by the stage machine in the same transaction.
 */
const CreateReviewSchema = z
  .object({
    reviewKind: z.enum([
      "POLICY_REVIEW",
      "BENEFICIARY_REVIEW",
      "CLAIM_REVIEW",
      "SUCCESSION_ALIGNMENT",
      "MAJOR_FAMILY_CHANGE",
      "MAJOR_OWNERSHIP_CHANGE",
    ]),
    reviewDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    reviewerRef: z.string().trim().min(1).max(200),
    outcome: z.enum(["COMPLETED", "EXCEPTIONS_RAISED", "DEFERRED"]),
    exceptions: z.array(z.object({ code: z.string().trim().min(1).max(64), severity: z.enum(["INFO", "NOTICE", "WARNING", "ESCALATE"]), detail: z.string().trim().max(2000) }).strict()).max(200).default([]),
    nextReviewDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    evidenceDocumentRefs: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    governanceStageAfter: z
      .enum(["ASSESSED", "REVIEW_REQUIRED", "LEGAL_REVIEW", "TAX_REVIEW", "FINANCE_REVIEW", "GOVERNANCE_APPROVAL", "ACTIVE", "REVIEW_DUE", "RENEWED", "AMENDED", "TERMINATED"])
      .nullish(),
    authorityRef: z.string().trim().max(200).nullish(),
    notes: z.string().trim().max(4000).nullish(),
  })
  .strict();

export async function GET(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.review.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_REVIEW", objectId: policyId },
    },
    async (ctx) => {
      try {
        return apiOk(await listReviews(ctx.principal, policyId), ctx.traceId);
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.manage",
      action: "family.protection.review.record",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_REVIEW", objectId: policyId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      if ("tenantId" in raw || "id" in raw || "policyId" in raw) {
        return apiError("SERVER_CONTROLLED_FIELD", "tenantId, id and policyId are server-derived.", 422, ctx.traceId);
      }
      const body = CreateReviewSchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.review.record", { policyId, body }, async () => {
          const result = await recordReview(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            policyId,
            {
              reviewKind: body.reviewKind,
              reviewDate: body.reviewDate,
              reviewerRef: body.reviewerRef,
              outcome: body.outcome,
              exceptions: body.exceptions,
              nextReviewDate: body.nextReviewDate ?? null,
              evidenceDocumentRefs: body.evidenceDocumentRefs,
              governanceStageAfter: (body.governanceStageAfter ?? null) as never,
              authorityRef: body.authorityRef ?? null,
              notes: body.notes ?? null,
            },
          );
          return { status: 201, body: result };
        });
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}
