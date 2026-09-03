/**
 * BEYU OS — internal API request envelope for service-to-service endpoints.
 *
 * Wraps the internal routes under /api/v1/internal/* with:
 *   1. Internal service authentication (see src/lib/internal/service-auth.ts).
 *   2. Strict body validation (zod, `.strict()` semantics via passthrough
 *      rejection — unknown fields are errors, not noise).
 *   3. Per-service rate limiting.
 *   4. Best-effort access audit for denied calls (auth/validation failures).
 *
 * Authorization for the OPERATION itself is evaluated inside the route
 * handler against canonical BEYU data — the service token authenticates the
 * caller, it does not authorize the mutation.
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import {
  authenticateInternalService,
  type InternalServiceTokenPayload,
} from "@/lib/internal/service-auth";
import { checkServicePrincipal } from "@/lib/internal/service-principals";

const deniedAudit = async (
  payload: InternalServiceTokenPayload | null,
  action: string,
  reason: string,
  traceId: string,
): Promise<void> => {
  try {
    await recordAudit({
      tenantId: payload?.act?.tenantId ?? null,
      actorUserId: null,
      actorType: "SERVICE",
      action,
      objectType: "INTERNAL_API",
      objectId: payload?.jti ?? "unknown",
      outcome: "DENIED",
      reason,
      traceId,
    });
  } catch {
    // Audit is best-effort here — the caller is denied either way.
  }
};

export async function guardedInternal<S extends z.ZodTypeAny>(
  request: Request,
  opts: {
    action: string;
    schema: S;
    rateLimit?: { limit: number; windowMs: number };
  },
  handler: (ctx: {
    body: z.infer<S>;
    token: InternalServiceTokenPayload;
    traceId: string;
  }) => Promise<NextResponse>,
): Promise<NextResponse> {
  const traceId = randomUUID();

  const auth = authenticateInternalService(request);
  if (!auth.ok) {
    await deniedAudit(
      null,
      `internal.${opts.action}.auth`,
      auth.code,
      traceId,
    );
    // 503 distinguishes "cannot verify — endpoint disabled" from "bad token".
    // Both deny; neither leaks which.
    return apiError(
      auth.code,
      auth.code === "INTERNAL_AUTH_NOT_CONFIGURED"
        ? "Internal service authentication is not configured on BEYU OS. Fail closed."
        : "Invalid service credentials.",
      auth.code === "INTERNAL_AUTH_NOT_CONFIGURED" ? 503 : 401,
      traceId,
    );
  }

  // Phase 6: per-issuer service-principal status — an explicitly revoked or
  // suspended issuer is denied on EVERY internal endpoint immediately, without
  // waiting for shared-secret rotation. Absent registry row = governed by the
  // static allowlist (backward compatible). Registry unreachable = fail closed.
  const principal = await checkServicePrincipal(auth.payload.iss);
  if (!principal.ok) {
    await deniedAudit(
      auth.payload,
      `internal.${opts.action}.principal`,
      principal.code,
      traceId,
    );
    return apiError(
      principal.code,
      principal.code === "SERVICE_PRINCIPAL_REGISTRY_UNAVAILABLE"
        ? "The service-principal registry is unavailable. Fail closed."
        : "The calling service principal is not permitted to call BEYU OS internal endpoints.",
      principal.code === "SERVICE_PRINCIPAL_REGISTRY_UNAVAILABLE" ? 503 : 403,
      traceId,
    );
  }

  const rl = opts.rateLimit ?? { limit: 100, windowMs: 60_000 };
  const limited = rateLimit(`internal:${auth.payload.iss}:${opts.action}`, rl.limit, rl.windowMs);
  if (!limited.ok) {
    await deniedAudit(auth.payload, `internal.${opts.action}.rate_limit`, "RATE_LIMITED", traceId);
    return apiError("RATE_LIMITED", "Too many internal requests.", 429, traceId);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    await deniedAudit(auth.payload, `internal.${opts.action}.validate`, "INVALID_JSON", traceId);
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400, traceId);
  }

  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    await deniedAudit(auth.payload, `internal.${opts.action}.validate`, "VALIDATION_FAILED", traceId);
    return apiError(
      "VALIDATION_FAILED",
      "Request body failed validation.",
      422,
      traceId,
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }

  try {
    return await handler({
      body: parsed.data,
      token: auth.payload,
      traceId,
    });
  } catch (err) {
    // Server-side detail stays in logs; the caller gets a generic 500.
    console.error(`[internal:${opts.action}] ${traceId}`, err);
    await deniedAudit(auth.payload, `internal.${opts.action}.error`, "INTERNAL_ERROR", traceId);
    return apiError("INTERNAL_ERROR", "The internal request could not be completed.", 500, traceId);
  }
}

export { apiOk, apiError };
