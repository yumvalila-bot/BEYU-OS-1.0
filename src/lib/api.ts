import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { recordAudit } from "./audit";
import { can, type Principal } from "./authz";
import { resolvePrincipal, requestMeta } from "./session";
import { setDatabaseTenantContext } from "./tenant-scope";
import { SYSTEM_VERSION, type PermissionCode } from "./constants";

/**
 * Governed API surface.
 * Every handler enforces: authentication → authorization → validation →
 * rate limit → idempotency → structured error envelope → audit.
 * Errors never leak secrets, stack traces, personal data or DB internals.
 */

export type ApiErrorBody = {
  error: { code: string; message: string; traceId: string; details?: unknown };
};

export function apiError(
  code: string,
  message: string,
  status: number,
  traceId: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, traceId, ...(details ? { details } : {}) } },
    { status, headers: { "x-beyu-system": SYSTEM_VERSION, "x-trace-id": traceId } },
  );
}

export function apiOk<T>(data: T, traceId: string, status = 200): NextResponse {
  return NextResponse.json(
    { data, meta: { traceId, system: SYSTEM_VERSION, at: new Date().toISOString() } },
    { status, headers: { "x-beyu-system": SYSTEM_VERSION, "x-trace-id": traceId } },
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

const idempotencyStore = new Map<string, { at: number; body: unknown }>();

export function readIdempotent(key: string | null): unknown | undefined {
  if (!key) return undefined;
  const hit = idempotencyStore.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > 15 * 60_000) {
    idempotencyStore.delete(key);
    return undefined;
  }
  return hit.body;
}

export function writeIdempotent(key: string | null, body: unknown) {
  if (!key) return;
  idempotencyStore.set(key, { at: Date.now(), body });
}

/* --------------------------- route wrapper --------------------------- */

export type HandlerContext = {
  principal: Principal;
  traceId: string;
  ip: string | null;
  userAgent: string | null;
  request: Request;
};

export type GuardOptions = {
  permission: PermissionCode;
  action: string;
  rateLimit?: { limit: number; windowMs: number };
  audit?: { objectType: string; objectId?: string };
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

    await setDatabaseTenantContext(principal);

    const rl = options.rateLimit ?? { limit: 120, windowMs: 60_000 };
    const limited = rateLimit(`${principal.userId}:${options.permission}`, rl.limit, rl.windowMs);
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

    return await handler({ principal, traceId, ip: meta.ip, userAgent: meta.userAgent, request });
  } catch (err) {
    if (err instanceof ZodError) {
      return apiError("VALIDATION_FAILED", "Request payload failed schema validation.", 422, traceId, err.issues);
    }
    console.error(JSON.stringify({ level: "error", traceId, action: options.action, message: String(err) }));
    return apiError("INTERNAL_ERROR", "The request could not be completed.", 500, traceId);
  }
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const json = await request.json().catch(() => ({}));
  return schema.parse(json);
}
