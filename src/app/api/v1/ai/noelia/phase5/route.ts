import { apiError, apiOk, guarded } from "@/lib/api";
import { phase5StatusBlock } from "@/lib/noelia";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ai/noelia/phase5 — honest Phase 5 status block.
 *
 * Returns observable implementation/reporting state. It never reports real
 * generative inference, external assessment or certification that is not
 * supported by real configuration or external evidence.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:compliance.metrics",
      action: "ai.noelia.phase5.status",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AI_PHASE5_STATUS", objectId: "phase5" },
      databaseContext: "handler",
    },
    async (ctx) => {
      try {
        const status = await withTenantDatabaseContext(ctx.principal, () =>
          phase5StatusBlock(ctx.principal),
        );
        return apiOk(status, ctx.traceId);
      } catch (err) {
        if (err instanceof Error && err.message.includes("requires canonical")) {
          return apiError("INTERNAL_ERROR", "The Phase 5 status block is unavailable.", 500, ctx.traceId);
        }
        throw err;
      }
    },
  );
}
