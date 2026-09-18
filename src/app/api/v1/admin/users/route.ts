import { apiOk, guarded, parseBody } from "@/lib/api";
import { listUsersInScope, registerUser } from "@/lib/admin/governance-service";
import { governedRefusal, registerUserSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/users — governed listing of user identities in the
 * principal's resolved tenant scope. Presentation only; the identity plane
 * remains canonical (parties + users, ONE GlobalUserID per party).
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:user.read",
      action: "admin.users.read",
      audit: { objectType: "USER" },
    },
    async (ctx) => apiOk(await listUsersInScope(ctx.principal), ctx.traceId),
  );
}

/**
 * POST /api/v1/admin/users — governed user registration.
 *
 * The identity is created with a random, never-disclosed credential (the exact
 * precedent of the internal identity register route): the registering
 * administrator can NEVER impersonate the new user. Status starts CREATED;
 * activation and role/membership grants are separate governed acts. Audit
 * USER_REGISTERED + enterprise event are appended atomically with the rows.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:user.register",
      action: "admin.user.register",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "USER" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerUserSchema);
      try {
        const result = await registerUser(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
