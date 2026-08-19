import { z } from "zod";
import { apiError, apiOk, guarded, readIdempotent, writeIdempotent } from "@/lib/api";
import {
  GovernanceError,
  NON_PROPOSABLE_STATUSES,
  RESOLUTION_CATEGORIES,
  proposeResolution,
  type GovernanceErrorCode,
} from "@/lib/governance";
import { CLASSIFICATION_ORDER } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Proposal payload contract.
 *
 * `.strict()` is essential: it rejects any attempt to smuggle server-controlled
 * fields (tenantId, proposedBy, status, votes, reference, decisionDate) rather
 * than silently ignoring them, so actor/tenant/status forgery attempts fail
 * loudly with 422 instead of succeeding as a no-op.
 */
const ProposeSchema = z
  .object({
    bodyId: z.string().min(3).max(64),
    title: z.string().trim().min(8).max(200),
    category: z.enum(RESOLUTION_CATEGORIES),
    summary: z.string().trim().min(20).max(2000),
    rationale: z.string().trim().min(20).max(2000),
    dataBasis: z.string().trim().min(10).max(2000),
    consequences: z.string().trim().min(10).max(2000),
    classification: z.enum(CLASSIFICATION_ORDER),
    authorityPolicyId: z.string().min(3).max(64).nullish(),
    linkedObjectType: z.string().min(2).max(64).nullish(),
    linkedObjectId: z.string().min(2).max(64).nullish(),
  })
  .strict();

/**
 * Fields the server derives from trusted state. A client that supplies any of
 * these is attempting actor impersonation, tenant escalation, lifecycle forgery
 * or vote injection, and is rejected.
 */
const SERVER_CONTROLLED_FIELDS = [
  "id",
  "tenantId",
  "reference",
  "status",
  "proposedBy",
  "proposedByUserId",
  "actorId",
  "userId",
  "requiredMajority",
  "quorumMet",
  "votesFor",
  "votesAgainst",
  "votesAbstain",
  "decisionDate",
  "createdAt",
] as const;

const STATUS_BY_CODE: Record<GovernanceErrorCode, number> = {
  NOT_FOUND: 404,
  TENANT_SCOPE_DENIED: 403,
  FORBIDDEN: 403,
  CLASSIFICATION_DENIED: 403,
  POLICY_DENIED: 403,
  RULE_VIOLATION: 422,
  CONFLICT: 409,
};

/**
 * POST /api/v1/governance/resolutions
 *
 * The canonical BEYU OS governed mutation. Creates a REAL resolution record in
 * the initial lifecycle state, with its audit entry and domain event written in
 * the same database transaction.
 *
 * A resolution can never be created in a decided state through this endpoint;
 * voting and approval are separate governed mutations.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "governance:resolution.propose",
      action: "governance.resolution.propose",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "RESOLUTION" },
    },
    async (ctx) => {
      const idempotencyKey = ctx.request.headers.get("idempotency-key");
      const cached = readIdempotent(idempotencyKey);
      if (cached) return apiOk(cached, ctx.traceId);

      // Read the payload once so server-controlled fields can be rejected
      // explicitly before schema validation. `.strict()` would already reject
      // them, but an explicit, named error makes the lifecycle and actor/tenant
      // invariants self-documenting and regression-proof.
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;

      if (
        typeof raw.status === "string" &&
        (NON_PROPOSABLE_STATUSES as readonly string[]).includes(raw.status)
      ) {
        return apiError(
          "STATUS_NOT_PROPOSABLE",
          "A proposal enters the lifecycle in its initial state; a decided status cannot be requested.",
          422,
          ctx.traceId,
        );
      }
      for (const field of SERVER_CONTROLLED_FIELDS) {
        if (field in raw) {
          return apiError(
            "SERVER_CONTROLLED_FIELD",
            `'${field}' is derived from the authenticated context and cannot be supplied by the client.`,
            422,
            ctx.traceId,
          );
        }
      }

      const body = ProposeSchema.parse(raw);

      try {
        const result = await proposeResolution(ctx.principal, body, {
          traceId: ctx.traceId,
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
        });
        writeIdempotent(idempotencyKey, result);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        if (err instanceof GovernanceError) {
          // Domain-safe messages only; no SQL, driver or schema detail is exposed.
          return apiError(err.code, err.message, STATUS_BY_CODE[err.code], ctx.traceId, err.detail);
        }
        throw err; // handled by guarded(): logged server-side, generic 500 to caller
      }
    },
  );
}
