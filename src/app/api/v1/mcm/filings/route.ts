import { apiOk, guarded, parseBody } from "@/lib/api";
import { recordStatutoryFiling } from "@/lib/mcm/services";
import { mcmRefusal, statutoryFilingSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/filings — record or update a statutory filing.
 *
 * NO REGULATOR API IS INVENTED. A filing is MANUAL or DOCUMENT_BASED unless a
 * verified integration exists, and a VERIFIED_API filing must carry the
 * authority's own acknowledgement reference.
 *
 * The submitter recorded on the row is always the authenticated principal; a
 * client-supplied submitter is never trusted (and never accepted by the schema).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:filing.manage",
      action: "mcm.filing.record",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "MCM_STATUTORY_FILING" },
    },
    async (ctx) => {
      const body = await parseBody(request, statutoryFilingSchema);
      try {
        const result = await recordStatutoryFiling(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, result.created ? 201 : 200);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
