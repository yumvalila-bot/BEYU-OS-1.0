import { apiError, apiOk, guarded } from "@/lib/api";
import { HcmError } from "@/lib/hcm";
import { getEmployee, getEmployment } from "@/lib/hcm-observe";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/hcm/employees/:id
 *
 * Single-record consumption of the same employee master. Not a second API
 * surface: same permission, same isolation, same compensation gate.
 * Missing and out-of-scope ids are both NOT_FOUND.
 */
export async function GET(request: Request, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  return guarded(
    request,
    {
      permission: "hcm:employee.read",
      action: "hcm.employee.read",
      audit: { objectType: "EMPLOYEE", objectId: id },
    },
    async (ctx) => {
      try {
        const { employee, asOf, source } = await getEmployee(ctx.principal, id);
        const employment = await getEmployment(ctx.principal, id, { asOf });
        return apiOk({ employee, employment, source, asOf }, ctx.traceId);
      } catch (err) {
        if (err instanceof HcmError) {
          return apiError(err.code, err.message, err.code === "DENIED" ? 403 : 404, ctx.traceId);
        }
        throw err;
      }
    },
  );
}
