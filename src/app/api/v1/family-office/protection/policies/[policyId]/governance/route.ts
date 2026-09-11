import { z } from "zod";
import { apiOk, guarded, withIdempotency } from "@/lib/api";
import { advanceGovernanceStage } from "@/lib/family-office-protection-service";
import { protectionError } from "../../../_common";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/family-office/protection/policies/:policyId/governance
 *
 * Advances the §15 review lifecycle: DRAFT → ASSESSED → REVIEW_REQUIRED →
 * LEGAL_REVIEW → TAX_REVIEW → FINANCE_REVIEW → GOVERNANCE_APPROVAL → ACTIVE,
 * with REVIEW_DUE / RENEWED / AMENDED / TERMINATED after it.
 *
 * Low-risk records are not force-fed the heavy chain: the middle review steps
 * may be advanced through in ONE audited step only when the caller supplies
 * both a recorded `isHighValue: false` AND the `thresholdSourceRef` proving
 * which ratified policy decided that. No threshold lives in the engine — an
 * unproven "this one is small" is refused, so the fast path is a governed
 * decision rather than a default (§15, §23).
 */
const AdvanceSchema = z
  .object({
    to: z.enum([
      "ASSESSED",
      "REVIEW_REQUIRED",
      "LEGAL_REVIEW",
      "TAX_REVIEW",
      "FINANCE_REVIEW",
      "GOVERNANCE_APPROVAL",
      "ACTIVE",
      "REVIEW_DUE",
      "RENEWED",
      "AMENDED",
      "TERMINATED",
    ]),
    authorityRef: z.string().trim().min(1).max(200).nullish(),
    reviewFindingCount: z.number().int().min(0).max(10000).nullish(),
    isHighValue: z.boolean().nullish(),
    thresholdSourceRef: z.string().trim().min(1).max(200).nullish(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.manage",
      action: "family.protection.policy.governance",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_POLICY", objectId: policyId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = AdvanceSchema.parse(await ctx.request.json().catch(() => ({})));
      try {
        return await withIdempotency(ctx, "family.protection.policy.governance", { policyId, body }, async () => {
          const result = await advanceGovernanceStage(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            policyId,
            body.to,
            {
              authorityRef: body.authorityRef ?? null,
              reviewFindingCount: body.reviewFindingCount ?? null,
              isHighValue: body.isHighValue ?? null,
              thresholdSourceRef: body.thresholdSourceRef ?? null,
            },
          );
          return { status: 200, body: { ...result, reason: body.reason } };
        });
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}
