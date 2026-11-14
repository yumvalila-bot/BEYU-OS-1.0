import { apiOk, guarded, parseBody } from "@/lib/api";
import { linkModuleRecord } from "@/lib/mcm/services";
import { mcmRefusal, moduleLinkSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/links — link a shared-module record to a legal entity.
 *
 * The target row is verified to exist in its own table first, and the table name
 * is resolved through a closed allowlist, so MCM surfaces can be entity-aware
 * without copying module truth and without a dangling pointer or a SQL-injection
 * surface.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:company.manage",
      action: "mcm.module.link",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "MCM_MODULE_LINK" },
    },
    async (ctx) => {
      const body = await parseBody(request, moduleLinkSchema);
      try {
        return apiOk(await linkModuleRecord(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
