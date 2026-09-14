import { apiOk, guarded } from "@/lib/api";
import { computeInstitutionalPosture } from "@/lib/command/posture";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/system/posture
 *
 * The BEYU institutional posture score (§46) — one advisory roll-up of audit
 * integrity, control effectiveness & evidence, open risk vs appetite,
 * obligation deadlines, TLS-governance artifacts and the open legal-review
 * surface of the equity/trust registers.
 *
 * READ-ONLY and ADVISORY ONLY. The response itself carries the boundary:
 * `advisoryOnly: true`, `grantsAuthority: false`. The score is never an input
 * to `can()`, `evaluatePolicy()`, `requireCapability()` or RLS — it grants
 * nothing and replaces no authorization.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "platform:dashboard.read",
      action: "system.posture.read",
      audit: { objectType: "SYSTEM" },
    },
    async (ctx) => {
      const posture = await computeInstitutionalPosture(ctx.principal);
      return apiOk(posture, ctx.traceId);
    },
  );
}
