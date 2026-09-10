import { apiOk, guarded } from "@/lib/api";
import { listDecisionJournal } from "@/lib/family-office-capital-service";
import { validatePreInvestmentEntry, validatePostInvestmentReview, PRE_INVESTMENT_QUESTIONS } from "@/lib/family/office/capital-wealth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/decision-journal
 *
 * The decision journal (§22): what was believed BEFORE the decision and what was
 * found AFTER it.
 *
 * The point of recording a falsification test in advance is that it cannot be
 * reworded afterwards. Each entry is re-validated on read, so an entry whose
 * eight pre-investment questions were not all answered is surfaced rather than
 * silently honoured (§42: a decision without evidence is an opinion).
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:decisionjournal.read", action: "family.decisionJournal.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_DECISION_JOURNAL" } },
    async (ctx) => {
      const { entries, reviews, total } = await listDecisionJournal(ctx.principal);
      const reviewByPreEntry = new Map(reviews.map((r) => [r.preInvestmentEntryId, r]));

      return apiOk(
        {
          entries: entries.map((row) => {
            const answers = (row.answers as Record<string, string> | null) ?? {};
            const findings = validatePreInvestmentEntry({
              id: row.id,
              investmentId: row.investmentId ?? "",
              tenantId: row.tenantId,
              answers,
              authorRef: row.authorRef,
              authorType: row.authorType as "HUMAN" | "AI",
              emotionDisclosure: row.emotionDisclosure,
              asOf: row.asOf,
            });
            return {
              ...row,
              /** The eight questions, each with its answer or an explicit null. An unanswered question is visible as absent. */
              questions: PRE_INVESTMENT_QUESTIONS.map((q) => ({ key: q.key, question: q.question, answer: answers[q.key] ?? null })),
              unanswered: PRE_INVESTMENT_QUESTIONS.filter((q) => !answers[q.key]?.trim()).map((q) => q.key),
              hasReview: reviewByPreEntry.has(row.id),
              validation: { ok: findings.length === 0, findings },
            };
          }),
          reviews: reviews.map((row) => {
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
            return { ...row, validation: { ok: findings.length === 0, findings } };
          }),
          total,
          /**
           * Pre-decision entries with no review. The journal is open, not wrong —
           * but an entry that is never revisited produces no lesson, and the count
           * is the only thing that shows whether the loop is closing.
           */
          awaitingReview: entries.filter((e) => !reviewByPreEntry.has(e.id)).map((e) => ({ id: e.id, investmentId: e.investmentId, asOf: e.asOf })),
          /** Reviews that breached the loss limit the thesis itself set. */
          maximumLossBreaches: reviews.filter((r) => r.maximumLossBreached).map((r) => ({ id: r.id, investmentId: r.investmentId, outcome: r.outcome })),
          outcomeTotals: {
            thesisCorrectExecutionCorrect: reviews.filter((r) => r.outcome === "THESIS_CORRECT_EXECUTION_CORRECT").length,
            thesisCorrectExecutionWrong: reviews.filter((r) => r.outcome === "THESIS_CORRECT_EXECUTION_WRONG").length,
            thesisWrongExecutionCorrect: reviews.filter((r) => r.outcome === "THESIS_WRONG_EXECUTION_CORRECT").length,
            thesisWrongExecutionWrong: reviews.filter((r) => r.outcome === "THESIS_WRONG_EXECUTION_WRONG").length,
            indeterminate: reviews.filter((r) => r.outcome === "INDETERMINATE").length,
          },
        },
        ctx.traceId,
      );
    },
  );
}
