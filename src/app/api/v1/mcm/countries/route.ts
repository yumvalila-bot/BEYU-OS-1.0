import { apiOk, guarded, parseBody } from "@/lib/api";
import { recordCountryProfile } from "@/lib/mcm/services";
import { countryProfileSchema, mcmRefusal } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/countries — record a new version of a country's MCM
 * configuration.
 *
 * Country law is versioned and effective-dated: a change produces a new version
 * and supersedes the prior one, so historical reports remain explainable. One
 * country's rules are never generalised to another.
 *
 * NOTE ON PRIVILEGE: `mcm_country_profiles` is UNWRITABLE by the runtime database
 * role (restrictive RLS: `mcm_country_profiles_no_write`). This route exists for
 * the governed operator procedure and its tests; against the runtime role it will
 * be refused by the database, which is the intended fail-closed behaviour.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:country.manage",
      action: "mcm.country.profile.record",
      rateLimit: { limit: 6, windowMs: 60_000 },
      audit: { objectType: "MCM_COUNTRY_PROFILE" },
    },
    async (ctx) => {
      const body = await parseBody(request, countryProfileSchema);
      try {
        return apiOk(await recordCountryProfile(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
