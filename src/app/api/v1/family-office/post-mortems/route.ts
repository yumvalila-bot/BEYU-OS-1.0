import { apiOk, guarded } from "@/lib/api";
import { db } from "@/db";
import * as s from "@/db/schema";
import { inArray } from "drizzle-orm";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { validatePostInvestmentReview } from "@/lib/family/office/capital-wealth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/post-mortems
 *
 * Post-investment reviews (§22), each joined to the pre-investment entry it is
 * measured against.
 *
 * The join is the point. A review written after the fact can describe what
 * happened; only the pre-investment entry says what was expected, and the
 * difference between the two is the only mechanism in the system that can say
 * whether a thesis was right. A review with no linked entry is returned flagged
 * rather than presented as though the comparison had been made.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:decisionjournal.read", action: "family.postInvestmentReview.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_POST_INVESTMENT_REVIEW" } },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const rows = await db.select().from(s.familyPostInvestmentReviews).where(inArray(s.familyPostInvestmentReviews.tenantId, scope));
      const entries = await db.select().from(s.familyDecisionJournalEntries).where(inArray(s.familyDecisionJournalEntries.tenantId, scope));
      const entryById = new Map(entries.map((e) => [e.id, e]));

      return apiOk(
        {
          reviews: rows.map((row) => {
            const prior = entryById.get(row.preInvestmentEntryId);
            const findings = validatePostInvestmentReview({
              id: row.id,
              investmentId: row.investmentId,
              preInvestmentEntryId: row.preInvestmentEntryId,
              tenantId: row.tenantId,
              answers: (row.answers as never) ?? {},
              outcome: row.outcome as never,
              lessonsApplied: (row.lessonsApplied as string[] | null) ?? [],
              realisedGainMinor: Number(row.realisedGain ?? 0),
              maximumAcceptableLossMinor: Number(row.maximumAcceptableLoss ?? 0),
              maximumLossBreached: row.maximumLossBreached,
              reviewerRef: row.reviewerRef,
              reviewerType: row.reviewerType as "HUMAN" | "AI",
              asOf: row.asOf,
            });
            return {
              ...row,
              /** The prior expectation, if the entry exists. */
              priorExpectation: prior
                ? {
                    preInvestmentEntryId: prior.id,
                    asOf: prior.asOf,
                    thesis: ((prior.answers as Record<string, string> | null) ?? {}).thesis ?? null,
                    falsificationTest: ((prior.answers as Record<string, string> | null) ?? {}).falsification ?? null,
                    exitCondition: ((prior.answers as Record<string, string> | null) ?? {}).exitCondition ?? null,
                    statedMaximumLoss: ((prior.answers as Record<string, string> | null) ?? {}).maximumLoss ?? null,
                  }
                : null,
              /** No prior entry means no expectation to compare against. */
              hasPriorEntry: Boolean(prior),
              validation: { ok: findings.length === 0, findings },
            };
          }),
          total: rows.length,
          /** A review with a stated lesson that was never applied is a review that taught nothing. */
          reviewsWithoutLessons: rows.filter((r) => ((r.lessonsApplied as string[] | null) ?? []).length === 0).map((r) => ({ id: r.id, investmentId: r.investmentId })),
        },
        ctx.traceId,
      );
    },
  );
}
