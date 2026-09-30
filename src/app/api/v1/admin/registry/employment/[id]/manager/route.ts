import { apiOk, guarded, parseBody } from "@/lib/api";
import { reassignReportingLine } from "@/lib/admin/registry-service";
import { governedRefusal, reassignReportingLineSchema } from "../../../../_shared";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/v1/admin/registry/employment/[id]/manager — the governed
 * superior/subordinate reporting-line mutation. The relationship expresses
 * supervision ONLY: it mints no User, role, permission or authorization
 * (MANAGER ≠ ADMINISTRATOR). The server re-authorizes (RBAC + ABAC +
 * tenant/entity/country scope + RESTRICTED classification), refuses cycles,
 * self-management, cross-tenant managers and terminated employment, then runs
 * the single sanctioned writer with hash-chained audit + EMPLOYMENT_CHANGED
 * event atomically.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "hcm:employee.manage",
      action: "registry.reporting.reassign",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "EMPLOYEE", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, reassignReportingLineSchema);
      try {
        const result = await reassignReportingLine(
          ctx.principal,
          {
            employeeId: id,
            managerEmployeeId: body.managerEmployeeId ?? null,
            effectiveFrom: body.effectiveFrom ?? undefined,
            reason: body.reason,
          },
          ctx.traceId,
        );
        return apiOk(result, ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
