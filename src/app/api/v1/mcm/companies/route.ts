import { apiOk, guarded, parseBody } from "@/lib/api";
import { upsertCompanyProfile, verifyCompanyProfile } from "@/lib/mcm/services";
import { companyProfileSchema, mcmRefusal, verifyProfileSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/companies — create or amend an MCM company profile.
 *
 * The profile is a satellite of the canonical corporate registry: legal name,
 * entity type, registration number and parent are read from `legal_entities` and
 * are never restated here, so the two can never disagree.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.manage",
      action: "mcm.company.profile.upsert",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "LEGAL_ENTITY_PROFILE" },
    },
    async (ctx) => {
      const body = await parseBody(request, companyProfileSchema);
      try {
        const result = await upsertCompanyProfile(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, result.created ? 201 : 200);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * PUT /api/v1/mcm/companies — verify a company profile against its registry.
 *
 * Kept as a distinct verb and action because verification is an assertion of fact
 * requiring evidence and a named human, not a field on a form.
 */
export async function PUT(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.manage",
      action: "mcm.company.profile.verify",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "LEGAL_ENTITY_PROFILE" },
    },
    async (ctx) => {
      const body = await parseBody(request, verifyProfileSchema);
      try {
        return apiOk(await verifyCompanyProfile(ctx.principal, body, ctx.traceId), ctx.traceId);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
