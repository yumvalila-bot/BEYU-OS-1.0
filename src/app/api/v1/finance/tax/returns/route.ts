import { and, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { taxReturnDrafts } from "@/db/schema";
import { apiOk, guarded } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** GET /api/v1/finance/tax/returns — list tenant/entity-scoped saved tax drafts. */
export async function GET(request: Request) {
  return guarded(request, {
    permission: "finance:tax.read",
    action: "finance.tax.returns.list",
    rateLimit: { limit: 60, windowMs: 60_000 },
    audit: { objectType: "TAX_RETURN_DRAFT" },
  }, async (ctx) => {
    const tenantIds = await tenantScopeIds(ctx.principal);
    if (tenantIds.length === 0) return apiOk({ drafts: [] }, ctx.traceId);
    const rows = await db.select({
      id: taxReturnDrafts.id,
      legalEntityId: taxReturnDrafts.legalEntityId,
      taxType: taxReturnDrafts.taxType,
      jurisdictionCode: taxReturnDrafts.jurisdictionCode,
      periodStart: taxReturnDrafts.periodStart,
      periodEnd: taxReturnDrafts.periodEnd,
      dueDate: taxReturnDrafts.dueDate,
      amountPayable: taxReturnDrafts.amountPayable,
      currency: taxReturnDrafts.currency,
      status: taxReturnDrafts.status,
      createdAt: taxReturnDrafts.createdAt,
    }).from(taxReturnDrafts).where(and(
      inArray(taxReturnDrafts.tenantId, tenantIds),
      inArray(taxReturnDrafts.classification, classificationsAtOrBelow(ctx.principal.clearance)),
      ...(ctx.principal.entityScope.length > 0 ? [inArray(taxReturnDrafts.legalEntityId, ctx.principal.entityScope)] : []),
    )).orderBy(desc(taxReturnDrafts.createdAt)).limit(50);
    return apiOk({ drafts: rows }, ctx.traceId);
  });
}
