import { apiError, apiOk, guarded } from "@/lib/api";
import { protectionSummary } from "@/lib/family-office-protection-service";
import { todayIso } from "../../_common";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/protection/dashboard
 *
 * §24 — the protection overview cards, as DATA with the §4 separation baked
 * into the payload shape: protection is per-currency and CONTINGENT; cash/
 * surrender values are recorded separately; premium obligations are annualized
 * deterministically; expected proceeds never merge with received proceeds; and
 * there is no cross-currency total, because no FX authority exists here
 * (§15 parity with the capital dashboard). Nothing on this response inflates
 * net worth — net worth is the capital domain's balance sheet and Finance's,
 * untouched by this module.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.dashboard.read",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_PROTECTION_DASHBOARD" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const asOf = url.searchParams.get("asOf") ?? todayIso();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
        return apiError("VALIDATION", "asOf must be an ISO calendar date.", 422, ctx.traceId);
      }
      const result = await protectionSummary(ctx.principal, asOf);
      return apiOk(result, ctx.traceId);
    },
  );
}
