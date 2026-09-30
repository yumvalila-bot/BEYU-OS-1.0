import { apiOk, guarded, parseBody } from "@/lib/api";
import { listWorkforce } from "@/lib/hcm";
import { registerEmployment } from "@/lib/admin/registry-service";
import { governedRefusal, registerEmploymentSchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/employment — the EXISTING declared HCM read
 * surface (`/api/v1/hcm/employees` → listWorkforce): one employment read
 * path, no second employee master. Read-only.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "hcm:employee.read",
      action: "registry.employment.read",
      audit: { objectType: "EMPLOYEE" },
    },
    async (ctx) => {
      try {
        return apiOk(await listWorkforce(ctx.principal), ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * POST /api/v1/admin/registry/employment — register an employment
 * relationship: an employees row over an existing Party plus its canonical
 * HIRE employment event in ONE transaction. employment ≠ membership ≠ role:
 * this creates no authorization of any kind. Duplicate person / employee
 * number are controlled refusals.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "hcm:employee.manage",
      action: "registry.employment.register",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "EMPLOYEE" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerEmploymentSchema);
      try {
        const result = await registerEmployment(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
