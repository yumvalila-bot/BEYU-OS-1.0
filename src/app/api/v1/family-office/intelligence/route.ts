import { apiOk, guarded } from "@/lib/api";
import { db } from "@/db";
import * as s from "@/db/schema";
import { inArray } from "drizzle-orm";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { listIntelligence } from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/intelligence
 *
 * Regulatory / market intelligence (§24) and tax intelligence (§25).
 *
 * Every item carries a source, a date, a jurisdiction and a confidence rating.
 * Tax positions in particular are classified into ASSUMPTION / ESTIMATE /
 * CURRENT_RULE / PROFESSIONAL_REVIEW / FINAL_ACCOUNTING_TREATMENT — the
 * distinction §25 demands — and a position outside its `ruleAsOf` window is
 * returned flagged rather than silently honoured, because an expired rule read as
 * current is the failure mode this endpoint exists to prevent.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:intelligence.read", action: "family.intelligence.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_INTELLIGENCE" } },
    async (ctx) => {
      const asOf = new URL(request.url).searchParams.get("asOf") ?? todayIso();
      const { events, summary, total } = await listIntelligence(ctx.principal, asOf);
      const scope = await tenantScopeIds(ctx.principal);
      const taxRows = await db.select().from(s.familyTaxPositions).where(inArray(s.familyTaxPositions.tenantId, scope));

      return apiOk(
        {
          regulatory: { events, summary, total },
          tax: { positions: taxRows, total: taxRows.length },
          /** Regulatory items whose review is due but not yet assigned. */
          unassignedReviews: events
            .filter((e) => e.status === "REVIEW_REQUIRED" && !e.reviewAssignedTo)
            .map((e) => ({ id: e.id, title: e.title, reviewDueDate: e.reviewDueDate })),
          /**
           * Tax positions resting on an ASSUMPTION or ESTIMATE with no professional
           * review reference. These cannot support a filing, and they are named as
           * such rather than being presented alongside reviewed positions.
           */
          unreviewedTaxPositions: taxRows
            .filter((t) => (t.level === "ASSUMPTION" || t.level === "ESTIMATE") && !t.professionalReviewRef)
            .map((t) => ({ id: t.id, subjectRef: t.subjectRef, taxType: t.taxType, level: t.level })),
          disclaimer:
            "Tax positions recorded here are internal classifications. Nothing here is a substitute for professional advice, and no position becomes a final accounting treatment until it is marked as one by the responsible authority.",
        },
        ctx.traceId,
      );
    },
  );
}
