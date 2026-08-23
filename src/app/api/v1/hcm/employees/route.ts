import { apiError, apiOk, guarded } from "@/lib/api";
import { HcmError, listWorkforce } from "@/lib/hcm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/hcm/employees
 *
 * The declared HCM consumption API (os_registry.SHARED_HCM). Read-only.
 * Sector OSs consume this; they must not hold an independent employee master.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "hcm:employee.read",
      action: "hcm.employee.read",
      audit: { objectType: "EMPLOYEE" },
    },
    async (ctx) => {
      try {
        const result = await listWorkforce(ctx.principal);
        return apiOk(result, ctx.traceId);
      } catch (err) {
        if (err instanceof HcmError) {
          return apiError(err.code, err.message, err.code === "DENIED" ? 403 : 404, ctx.traceId);
        }
        throw err;
      }
    },
  );
}
