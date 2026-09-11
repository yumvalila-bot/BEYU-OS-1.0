import { apiError, apiOk, guarded } from "@/lib/api";
import { familyView } from "@/lib/family-office-protection-service";
import { todayIso } from "../../_common";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/protection/family-view
 *
 * §26 — per-family-member protection board. Only rows the caller's
 * authorization can already read are assembled; members whose registry rows
 * are outside scope simply do not appear. Modeled exposure shows NOT_QUANTIFIED
 * where no FINAL assessment exists — the view never invents the number the
 * screen invites.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.family-view.read",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_PROTECTION_VIEW" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const asOf = url.searchParams.get("asOf") ?? todayIso();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
        return apiError("VALIDATION", "asOf must be an ISO calendar date.", 422, ctx.traceId);
      }
      const result = await familyView(ctx.principal, asOf);
      return apiOk(result, ctx.traceId);
    },
  );
}
