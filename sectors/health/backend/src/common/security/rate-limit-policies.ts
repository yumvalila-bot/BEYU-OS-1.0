/**
 * Typed endpoint rate-limit policy registry.
 *
 * Central table of (actor kind) × (endpoint) → window + limit + lockout rules.
 * The RateLimiter consumes this via `policyFor(endpoint, actorKind)`. Policies
 * are intentionally conservative: lockout applies for sensitive endpoints
 * (login, MFA verify, token refresh, governance-critical admin ops) after a
 * burst of failures.
 *
 * Production Redis backend remains EXTERNAL-BLOCKED — see rate-limiter.ts; the
 * in-memory backend enforces the same policies for dev/test deterministically.
 */

export type ActorKind = "anonymous" | "user" | "admin";

export interface RateLimitPolicy {
  windowMs: number;
  limit: number;
  /** After this many hard-blocks within lockoutWindow, elevate to exponential lockout. */
  lockoutThreshold?: number;
  lockoutWindowMs?: number;
  /** Human-readable reason surfaced in 429 responses. */
  reason: string;
}

const POLICIES: Record<string, RateLimitPolicy> = {
  // Authentication / credential endpoints — strict, with lockout.
  "POST:/api/auth/login": { windowMs: 60_000, limit: 10, lockoutThreshold: 5, lockoutWindowMs: 15 * 60_000, reason: "login_burst" },
  "POST:/api/auth/register": { windowMs: 60_000, limit: 5, reason: "registration_burst" },
  "POST:/api/auth/refresh": { windowMs: 60_000, limit: 30, reason: "refresh_burst" },
  "POST:/api/auth/mfa/verify": { windowMs: 60_000, limit: 6, lockoutThreshold: 5, lockoutWindowMs: 30 * 60_000, reason: "mfa_verify_burst" },
  "POST:/api/auth/mfa/enroll": { windowMs: 60_000, limit: 10, reason: "mfa_enroll_burst" },
  "POST:/api/auth/logout": { windowMs: 60_000, limit: 30, reason: "logout_burst" },
  // Password / credential reset (not yet implemented but policy reserved).
  "POST:/api/auth/password-reset": { windowMs: 60_000, limit: 5, lockoutThreshold: 3, lockoutWindowMs: 30 * 60_000, reason: "password_reset_burst" },
  // Generic write burst.
  "write:*": { windowMs: 60_000, limit: 200, reason: "generic_write_burst" },
  // Generic read burst.
  "read:*": { windowMs: 60_000, limit: 600, reason: "generic_read_burst" },
  // Administrative governance endpoints.
  "admin:*": { windowMs: 60_000, limit: 60, lockoutThreshold: 10, lockoutWindowMs: 15 * 60_000, reason: "admin_burst" },
  // Public health reports (read-only).
  "GET:/health": { windowMs: 10_000, limit: 30, reason: "health_probe" },
};

export function policyFor(method: string, path: string): RateLimitPolicy {
  const exact = POLICIES[`${method.toUpperCase()}:${path}`];
  if (exact) return exact;
  if (method === "GET" || method === "HEAD") return POLICIES["read:*"];
  return POLICIES["write:*"];
}

/**
 * Build a RateLimitConfig for a given actor + method + path + id.
 * Applies exponential lockout if the actor has hit the threshold.
 * The `lockoutHits` count is caller-supplied (tracked via audit event table
 * or Redis), default 0 for the deterministic in-memory path.
 */
export function buildPolicy(
  method: string,
  path: string,
  keyType: "ip" | "actor" | "tenant" | "global" | "email",
  keyValue: string,
  opts: { tenantId?: string | null; lockoutHits?: number; endpointId?: string } = {},
): { windowMs: number; limit: number; keyType: any; keyValue: string; endpoint: string; tenantId?: string | null; lockout: boolean; reason: string } {
  const p = policyFor(method, path);
  let windowMs = p.windowMs;
  let limit = p.limit;
  let lockout = false;
  if (p.lockoutThreshold && (opts.lockoutHits ?? 0) >= p.lockoutThreshold) {
    windowMs = p.lockoutWindowMs ?? windowMs * 4;
    limit = 0; // hard block for the lockout window
    lockout = true;
  }
  return {
    windowMs,
    limit,
    keyType,
    keyValue,
    endpoint: opts.endpointId ?? `${method.toUpperCase()}:${path}`,
    tenantId: opts.tenantId ?? null,
    lockout,
    reason: p.reason,
  };
}
