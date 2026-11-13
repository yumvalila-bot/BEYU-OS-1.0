import { apiOk, guarded, parseBody } from "@/lib/api";
import { validateOwnershipRecord } from "@/lib/mcm/services";
import { mcmRefusal, ownershipValidationSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/ownership — validate one ownership record against its
 * instrument, the effective totals and the circularity rules.
 *
 * READS THE REGISTRY, NEVER WRITES IT. The response carries the per-rule findings
 * so a governance reader can see exactly which legal-instrument evidence is
 * missing, rather than a bare pass/fail.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:ownership.validate",
      action: "mcm.ownership.validate",
      rateLimit: { limit: 30, windowMs: 60_000 },
      classification: "RESTRICTED",
      audit: { objectType: "OWNERSHIP_RECORD" },
    },
    async (ctx) => {
      const body = await parseBody(request, ownershipValidationSchema);
      try {
        return apiOk(await validateOwnershipRecord(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
