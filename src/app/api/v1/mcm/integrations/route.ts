import { apiOk, guarded } from "@/lib/api";
import { integrationHealth } from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/integrations — integration-contract health.
 *
 * Every contract records its owner, its direction and its failure policy. A
 * suspended or expired contract is reported as such; MCM does not silently
 * substitute a guess for a missing integration, and no regulator API appears here
 * that has not been verified and separately registered.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:integration.read",
      action: "mcm.integrations.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async (ctx) => apiOk(await integrationHealth(ctx.principal), ctx.traceId),
  );
}
