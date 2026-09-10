import { apiOk, guarded } from "@/lib/api";
import { listProperties } from "@/lib/family-office-capital-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/real-estate
 *
 * Real-estate assets inside scope, each with its measure set: NOI, cap rate,
 * cash-on-cash, LTV, DSCR, equity, unrealised gain and IRR (§12). A property
 * with no valuation reports those measures as undefined rather than as zero —
 * "not marked" and "not moved" are different statements.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:realestate.read", action: "family.realestate.read", rateLimit: { limit: 100, windowMs: 60_000 }, audit: { objectType: "FAMILY_REAL_ESTATE" } },
    async (ctx) => apiOk(await listProperties(ctx.principal), ctx.traceId),
  );
}
