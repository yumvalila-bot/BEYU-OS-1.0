import { apiError, apiOk, guarded } from "@/lib/api";
import { BeyuNoeliaComplianceService } from "@/lib/noelia";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ai/noelia/compliance — Phase 4 compliance dashboard.
 *
 * Returns honest governance counts. It never reports certification that is not
 * recorded in `noelia_certification_readiness` backed by external evidence.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "ai:compliance.metrics",
      action: "ai.noelia.compliance.dashboard",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AI_COMPLIANCE_DASHBOARD" },
      databaseContext: "handler",
    },
    async (ctx) => {
      try {
        const service = new BeyuNoeliaComplianceService();
        const dashboard = await withTenantDatabaseContext(ctx.principal, () =>
          service.complianceDashboard({ principal: ctx.principal, traceId: ctx.traceId }),
        );
        return apiOk(dashboard, ctx.traceId);
      } catch (err) {
        if (err instanceof Error && err.message.includes("requires canonical")) {
          return apiError("INTERNAL_ERROR", "The compliance dashboard is unavailable.", 500, ctx.traceId);
        }
        throw err;
      }
    },
  );
}
