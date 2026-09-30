import { apiOk, guarded, parseBody } from "@/lib/api";
import { enrollSubordinate } from "@/lib/admin/registry-service";
import { enrollSubordinateSchema, governedRefusal } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/admin/registry/enrollment — the governed superior → subordinate
 * enrollment workflow over the EXISTING canonical primitives:
 *
 *   Party   — reuse an existing canonical Party or register a new one
 *             (never a duplicate, never a silent merge);
 *   User    — optional canonical User (identity:user.register), never
 *             automatic for family members or employees;
 *   Employee— governed employment through THE employees writer (lib/hcm),
 *             reporting line to the enrolling superior where one exists;
 *   Role    — optional, ceiling-checked role grant (identity:role.grant,
 *             MFA step-up, privileged roles PLATFORM_ADMIN-only).
 *
 * Every constituent step re-authorizes itself server-side; this route is one
 * coherent orchestration, never a second authorization path. UI visibility is
 * never authorization.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "hcm:employee.manage",
      action: "registry.enrollment.subordinate",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "ENROLLMENT" },
    },
    async (ctx) => {
      const body = await parseBody(request, enrollSubordinateSchema);
      try {
        const result = await enrollSubordinate(
          ctx.principal,
          {
            tenantId: body.tenantId,
            legalEntityId: body.legalEntityId,
            countryCode: body.countryCode,
            hireDate: body.hireDate,
            employeeNo: body.employeeNo,
            employmentType: body.employmentType ?? null,
            positionId: body.positionId ?? null,
            workEmail: body.workEmail ?? null,
            existingPartyId: body.existingPartyId ?? undefined,
            newPerson: body.newPerson ?? undefined,
            createUser: body.createUser ?? false,
            roleCode: body.roleCode ?? undefined,
            reason: body.reason,
          },
          ctx.traceId,
        );
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
