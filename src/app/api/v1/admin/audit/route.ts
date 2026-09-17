import { apiOk, guarded } from "@/lib/api";
import { ADMINISTRATIVE_AUDIT_ACTIONS, listAdministrativeAudit } from "@/lib/admin/governance-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/audit — the administrative audit trail: every canonical
 * administrative action of this capability, within the RLS tenant scope the
 * guard established for this request (append-only ledger; denials are recorded
 * alongside successes). The audit model itself is untouched — this is a
 * governed READ of the existing hash-chained ledger under the existing
 * `audit:log.read` capability.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "audit:log.read",
      action: "admin.audit.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AUDIT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const records = await listAdministrativeAudit(ctx.principal, Number.isFinite(limit) ? limit : 100);
      return apiOk({ actions: ADMINISTRATIVE_AUDIT_ACTIONS, records }, ctx.traceId);
    },
  );
}
