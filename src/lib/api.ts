import { NextResponse } from "next/server";
import { hasDatabaseTransactionContext } from "@/db";
import type { ZodSchema } from "zod";
import { recordAudit } from "./audit";
import { can, type Principal } from "./authz";
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
} from "./idempotency";
import { resolvePrincipal, requestMeta } from "./session";
import { withTenantDatabaseContext } from "./tenant-scope";
import { SYSTEM_VERSION, type PermissionCode } from "./constants";

/**
 * Governed API surface.
 * Every handler enforces: authentication → authorization → validation →
 * rate limit → idempotency → structured error envelope → audit.
 * Errors never leak secrets, stack traces, personal data or DB internals.
 */

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    traceId: string;
    correlationId: string;
    causationId: string | null;
    details?: unknown;
  };
};

export type ApplicationBoundaryError = {
  code: "VALIDATION_FAILED";
  message: string;
  status: 422;
  details: Array<{ code: string; path: Array<string | number>; message: string }>;
};

/**
 * Convert transport-library errors into BEYU's canonical application envelope.
 *
 * Next's production bundler can load route code and this shared boundary from
 * different chunks. In that situation a genuine ZodError may fail an
 * `instanceof ZodError` check even though it carries Zod's stable public shape.
 * Normalize that shape explicitly, without changing the error, its prototype or
 * its message. Only safe validation fields cross the HTTP boundary; stack,
 * input values and arbitrary error properties are never returned.
 */
export function normalizeApplicationBoundaryError(error: unknown): ApplicationBoundaryError | null {
  if (!error || typeof error !== "object") return null;

  const candidate = error as { name?: unknown; issues?: unknown };
  // Deliberately avoid `instanceof`: constructor identity is exactly what is
  // unstable across the production chunks this boundary joins.
  if (candidate.name !== "ZodError" || !Array.isArray(candidate.issues)) return null;

  const details = candidate.issues.flatMap((issue) => {
    if (!issue || typeof issue !== "object") return [];
    const value = issue as { code?: unknown; path?: unknown; message?: unknown };
    if (typeof value.code !== "string" || typeof value.message !== "string" || !Array.isArray(value.path)) {
      return [];
    }
    const path = value.path.filter((part): part is string | number =>
      typeof part === "string" || (typeof part === "number" && Number.isFinite(part)),
    );
    return [{ code: value.code, path, message: value.message }];
  });

  if (details.length === 0 && candidate.issues.length > 0) return null;
  return {
    code: "VALIDATION_FAILED",
    message: "Request payload failed schema validation.",
    status: 422,
    details,
  };
}

export function apiError(
  code: string,
  message: string,
  status: number,
  traceId: string,
  details?: unknown,
  correlationId = traceId,
  causationId: string | null = null,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, traceId, correlationId, causationId, ...(details ? { details } : {}) } },
    {
      status,
      headers: {
        "x-beyu-system": SYSTEM_VERSION,
        "x-trace-id": traceId,
        "x-correlation-id": correlationId,
      },
    },
  );
}

export function apiOk<T>(
  data: T,
  traceId: string,
  status = 200,
  correlationId = traceId,
  causationId: string | null = null,
): NextResponse {
  return NextResponse.json(
    { data, meta: { traceId, correlationId, causationId, system: SYSTEM_VERSION, at: new Date().toISOString() } },
    {
      status,
      headers: {
        "x-beyu-system": SYSTEM_VERSION,
        "x-trace-id": traceId,
        "x-correlation-id": correlationId,
      },
    },
  );
}

/* --------------------------- rate limiting --------------------------- */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  bucket.count += 1;
  return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) };
}

/* --------------------------- idempotency ----------------------------- */

/**
 * Idempotency is implemented by `lib/idempotency.ts` against a durable, scoped
 * ledger. The previous in-process Map was removed (finding A-01): it was keyed
 * only on the raw header, so a different actor reusing a key received the first
 * actor's response, a different payload silently replayed the old result, and
 * concurrent duplicates both committed.
 *
 * Use `withIdempotency()` below rather than reading/writing a cache directly.
 */
export type IdempotentResult = { status: number; body: unknown };

/**
 * Run a governed mutation under an Idempotency-Key.
 *
 * - no key .................. executes normally (callers may still require one)
 * - key + same payload ...... replays the stored response, does NOT re-execute
 * - key + different payload . 409 IDEMPOTENCY_KEY_REUSED
 * - key held concurrently ... 409 REQUEST_IN_PROGRESS
 * - unexpected handler throw  claim remains IN_FLIGHT until domain state is reconciled
 *
 * The handler may return an `IdempotentResult` (success, which is recorded and
 * becomes replayable) or a `NextResponse` (a domain error, which releases the
 * claim so the caller can correct the request and retry with the same key).
 */
export async function withIdempotency(
  ctx: HandlerContext,
  endpoint: string,
  payload: unknown,
  handler: () => Promise<IdempotentResult | NextResponse>,
): Promise<NextResponse> {
  if (hasDatabaseTransactionContext()) {
    throw new Error("withIdempotency must run outside an active request transaction");
  }

  const rawKey = ctx.request.headers.get("idempotency-key");
  const claim = await claimIdempotencyKey(ctx.principal, endpoint, rawKey, payload);

  if (claim.kind === "MISMATCH") {
    return apiError(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used with a different request payload.",
      409,
      ctx.traceId,
    );
  }
  if (claim.kind === "IN_FLIGHT") {
    return apiError(
      "REQUEST_IN_PROGRESS",
      "An identical request is currently being processed. Retry shortly.",
      409,
      ctx.traceId,
    );
  }
  if (claim.kind === "REPLAY") {
    return NextResponse.json(claim.body, {
      status: claim.statusCode,
      headers: {
        "x-beyu-system": SYSTEM_VERSION,
        "x-trace-id": ctx.traceId,
        "x-correlation-id": ctx.traceId,
        "idempotent-replay": "true",
      },
    });
  }

  if (claim.kind === "NO_KEY") {
    const result = await withTenantDatabaseContext(ctx.principal, handler);
    return result instanceof NextResponse ? result : apiOk(result.body, ctx.traceId, result.status);
  }

  try {
    // The claim was committed before this transaction began. Completion is
    // written through the current transaction, so domain state and completion
    // commit together; rollback leaves the durable claim IN_FLIGHT.
    const result = await withTenantDatabaseContext(ctx.principal, handler);

    // A domain error is not a completed mutation: release the claim so the same
    // key may be retried once the caller fixes the request.
    if (result instanceof NextResponse) {
      await releaseIdempotencyKey(claim);
      return result;
    }

    const envelope = {
      data: result.body,
      meta: { traceId: ctx.traceId, correlationId: ctx.traceId, causationId: null, system: SYSTEM_VERSION, at: new Date().toISOString() },
    };
    await completeIdempotencyKey(claim, result.status, envelope, ctx.traceId);
    return NextResponse.json(envelope, {
      status: result.status,
      headers: { "x-beyu-system": SYSTEM_VERSION, "x-trace-id": ctx.traceId },
    });
  } catch (err) {
    // Do not release on an unknown failure. The domain transaction may have
    // committed immediately before the response/completion step failed; an
    // automatic retry could otherwise execute a non-idempotent action twice.
    // Operators must reconcile and explicitly release an IN_FLIGHT claim.
    throw err;
  }
}

/* --------------------------- route wrapper --------------------------- */

export type HandlerContext = {
  principal: Principal;
  traceId: string;
  correlationId: string;
  causationId: string | null;
  ip: string | null;
  userAgent: string | null;
  request: Request;
};

export type GuardOptions = {
  permission: PermissionCode;
  action: string;
  rateLimit?: { limit: number; windowMs: number };
  audit?: { objectType: string; objectId?: string };
  /**
   * `handler` leaves the authorization transaction before the handler starts.
   * Idempotent handlers then establish their own context after their durable
   * claim commits, avoiding a second pool checkout and preserving crash safety.
   */
  databaseContext?: "guard" | "handler";
};

export async function guarded(
  request: Request,
  options: GuardOptions,
  handler: (ctx: HandlerContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const meta = await requestMeta();
  const traceId = meta.traceId;
  try {
    const principal = await resolvePrincipal();
    if (!principal) {
      return apiError("UNAUTHENTICATED", "A valid BEYU OS session is required.", 401, traceId);
    }

    const context: HandlerContext = {
      principal,
      traceId,
      correlationId: meta.correlationId,
      causationId: meta.causationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      request,
    };

    const authorize = async (): Promise<NextResponse | null> => {
      const rl = options.rateLimit ?? { limit: 120, windowMs: 60_000 };
      // Bucket per (principal, action): a route's declared rate limit is its
      // enforced limit. Keying by permission would let sibling actions under
      // the same permission (e.g. workflow create/validate/execute/cancel)
      // share one bucket and starve each other (Finding A-04-2).
      const limited = rateLimit(`${principal.userId}:${options.action}`, rl.limit, rl.windowMs);
      if (!limited.ok) {
        return apiError("RATE_LIMITED", "Request rate exceeded for this capability.", 429, traceId);
      }

      const decision = can(principal, options.permission);
      if (!decision.allowed) {
        await recordAudit({
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          action: options.action,
          objectType: options.audit?.objectType ?? "API",
          objectId: options.audit?.objectId ?? options.permission,
          outcome: "DENIED",
          reason: decision.reason,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          traceId,
        });
        return apiError(
          decision.requiresMfa ? "MFA_REQUIRED" : "FORBIDDEN",
          decision.reason,
          decision.requiresMfa ? 428 : 403,
          traceId,
        );
      }
      return null;
    };

    if (options.databaseContext === "handler") {
      // Keep authorization/audit scoped, then release the connection before an
      // idempotency claim. The handler owns the transaction that follows.
      const denied = await withTenantDatabaseContext(principal, authorize);
      if (denied) return denied;
      // Await inside this try so asynchronous handler failures reach the
      // canonical application-error boundary below.
      return await handler(context);
    }

    // `return promise` would bypass this function's catch on rejection. Await
    // the request transaction so validation and other handler failures are
    // normalized before they reach the framework.
    return await withTenantDatabaseContext(principal, async () => {
      const denied = await authorize();
      return denied ?? handler(context);
    });
  } catch (err) {
    const applicationError = normalizeApplicationBoundaryError(err);
    if (applicationError) {
      return apiError(
        applicationError.code,
        applicationError.message,
        applicationError.status,
        traceId,
        applicationError.details,
      );
    }
    console.error(JSON.stringify({ level: "error", traceId, action: options.action, message: String(err) }));
    return apiError("INTERNAL_ERROR", "The request could not be completed.", 500, traceId);
  }
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const json = await request.json().catch(() => ({}));
  return schema.parse(json);
}
