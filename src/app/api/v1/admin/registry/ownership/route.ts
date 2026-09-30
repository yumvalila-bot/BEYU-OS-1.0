import { apiOk, guarded, parseBody } from "@/lib/api";
import { listRegistryOwnership, registerOwnership } from "@/lib/admin/registry-service";
import { governedRefusal, registerOwnershipSchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/ownership — ownership records (ownership_records
 * is the authority) within the principal's resolved tenant scope, optionally
 * narrowed to one owned entity. OWNERSHIP ≠ MEMBERSHIP ≠ ROLE. Read-only.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:ownership.read",
      action: "registry.ownership.read",
      audit: { objectType: "OWNERSHIP" },
    },
    async (ctx) => {
      const ownedEntityId =
        new URL(request.url).searchParams.get("ownedEntityId") ?? undefined;
      return apiOk({ items: await listRegistryOwnership(ctx.principal, ownedEntityId) }, ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/admin/registry/ownership — record an ownership right over an
 * existing in-scope legal entity (party or entity owner, exactly one).
 * organization:ownership.manage is HIGH-RISK: guarded() enforces the MFA
 * step-up before the handler; overlapping effective periods are controlled
 * refusals — ownership is never silently overwritten.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "organization:ownership.manage",
      action: "registry.ownership.record",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "OWNERSHIP" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerOwnershipSchema);
      try {
        const result = await registerOwnership(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
