import { apiOk, guarded } from "@/lib/api";
import { db } from "@/db";
import * as s from "@/db/schema";
import { inArray } from "drizzle-orm";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { assertThesisIsComplete } from "@/lib/family/office/capital-wealth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/investment-theses
 *
 * Investment theses inside scope (§11). Each carries the case against it
 * (`counterThesis`), what would prove it wrong (`falsificationTest`), the
 * assumptions it rests on and the exit condition.
 *
 * Approved theses are re-validated on read as well as on write. A thesis that was
 * approved and then hollowed out by an edit should be surfaced, not silently
 * honoured — the approval was of a different document.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:investment.read", action: "family.thesis.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_THESIS" } },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const rows = await db.select().from(s.familyInvestmentTheses).where(inArray(s.familyInvestmentTheses.tenantId, scope));

      return apiOk(
        {
          theses: rows.map((row) => {
            const findings = assertThesisIsComplete({
              id: row.id,
              investmentId: row.investmentId,
              thesis: row.thesis,
              counterThesis: row.counterThesis,
              falsificationTest: row.falsificationTest,
              majorAssumptions: (row.majorAssumptions as string[] | null) ?? [],
              risks: (row.risks as string[] | null) ?? [],
              maximumAcceptableLossMinor: Number(row.maximumAcceptableLoss ?? 0),
              exitCondition: row.exitCondition,
              targetReturnBps: row.targetReturnBps,
              targetHoldingMonths: row.targetHoldingMonths,
              status: row.status as "CURRENT" | "UNDER_REVIEW" | "INVALIDATED" | "SUPERSEDED",
              authorRef: row.authorRef,
              authorType: row.authorType as "HUMAN" | "AI",
              asOf: row.asOf,
            });
            return { ...row, validation: { ok: findings.length === 0, findings } };
          }),
          total: rows.length,
          /**
           * APPROVED but degraded. These are the dangerous ones: they carry the
           * authority of an approval over a document that no longer meets the
           * standard the approval was granted against.
           */
          approvedButIncomplete: rows
            .filter((r) => r.status === "APPROVED")
            .map((r) => ({
              id: r.id,
              investmentId: r.investmentId,
              findings: assertThesisIsComplete({
                id: r.id,
                investmentId: r.investmentId,
                thesis: r.thesis,
                counterThesis: r.counterThesis,
                falsificationTest: r.falsificationTest,
                majorAssumptions: (r.majorAssumptions as string[] | null) ?? [],
                risks: (r.risks as string[] | null) ?? [],
                maximumAcceptableLossMinor: Number(r.maximumAcceptableLoss ?? 0),
                exitCondition: r.exitCondition,
                targetReturnBps: r.targetReturnBps,
                targetHoldingMonths: r.targetHoldingMonths,
                status: r.status as "CURRENT" | "UNDER_REVIEW" | "INVALIDATED" | "SUPERSEDED",
                authorRef: r.authorRef,
                authorType: r.authorType as "HUMAN" | "AI",
                asOf: r.asOf,
              }),
            }))
            .filter((x) => x.findings.length > 0),
        },
        ctx.traceId,
      );
    },
  );
}
