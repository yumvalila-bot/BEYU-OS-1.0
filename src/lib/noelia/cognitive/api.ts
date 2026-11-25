/**
 * NOELIA — shared plumbing for the cognitive Command Centre API routes.
 *
 * One place decides how a cognitive capability is exposed over HTTP so the four
 * routes cannot drift in their authorization, error handling or response shape.
 *
 * The helper does NOT authorize by itself: it delegates to `guarded()` (the
 * existing BEYU OS boundary) and then to the ONE registry, which re-checks
 * RBAC/ABAC/tenant/entity/country/classification. A route can therefore never be
 * more permissive than the registry.
 */

import type { z } from "zod";
import { apiError, apiOk, guarded } from "@/lib/api";
import { resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { runCognitiveCapability } from "./runtime";
import type { PermissionCode } from "@/lib/constants";

export type CognitiveRouteConfig<TInput> = {
  /** Stable action name used in audit and rate-limit keys. */
  action: string;
  /** Permission the caller must hold before the capability is even considered. */
  permission: PermissionCode;
  /** The governed capability this route exposes. */
  capability: string;
  /** Strict input schema. `.strict()` is mandatory. */
  schema: z.ZodType<TInput>;
  /** Requests per minute for this route. */
  rateLimit?: number;
};

/**
 * Build a POST handler for a cognitive capability.
 *
 * Response contract: `{ ok: true, data: NoeliaToolOutput }` or a governed error
 * envelope. Internal error text is never returned to the caller.
 */
export function cognitiveRoute<TInput>(config: CognitiveRouteConfig<TInput>) {
  return async function POST(request: Request) {
    return guarded(
      request,
      {
        permission: config.permission,
        action: config.action,
        rateLimit: { limit: config.rateLimit ?? 20, windowMs: 60_000 },
        audit: { objectType: "AI_DECISION" },
        // The cognitive services resolve authorized scope and read institutional
        // records, so the handler MUST run inside the canonical transaction-scoped
        // tenant context. Omitting this option would let the handler run outside
        // RLS scope — exactly the failure mode this suite proved.
      },
      async (ctx) => {
        let raw: unknown;
        try {
          raw = await ctx.request.json();
        } catch {
          return apiError("VALIDATION_FAILED", "Request payload must be valid JSON.", 422, ctx.traceId);
        }

        let input: TInput;
        try {
          input = config.schema.parse(raw);
        } catch {
          return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, ctx.traceId);
        }

        const registry = createDefaultNoeliaToolRegistry();
        const result = await runCognitiveCapability({
          registry,
          capability: config.capability,
          principal: ctx.principal,
          traceId: ctx.traceId,
          input,
          resolveScope: resolveNoeliaAuthorizedScope,
        });

        if (!result.allowed) {
          // A deny is a governed outcome, not a server error. 403 for authority,
          // 422 for a malformed capability contract.
          const status = result.decision.code === "INPUT_INVALID" || result.decision.code === "OUTPUT_INVALID" ? 422 : 403;
          return apiError(result.decision.code, result.decision.reason, status, ctx.traceId);
        }

        return apiOk(result.output, ctx.traceId);
      },
    );
  };
}
