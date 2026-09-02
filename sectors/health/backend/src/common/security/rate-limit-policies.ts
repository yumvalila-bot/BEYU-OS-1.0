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
  // ── Auth / credentials ──────────────────────────────────────────────────
  "POST:/auth/login": {
    windowMs: 60_000,
    limit: 10,
    lockoutThreshold: 5,
    lockoutWindowMs: 15 * 60_000,
    reason: "auth_login_burst",
  },
  "POST:/auth/register": {
    windowMs: 60_000,
    limit: 5,
    reason: "patient_registration_burst",
  },
  "POST:/auth/refresh": {
    windowMs: 60_000,
    limit: 30,
    reason: "auth_refresh_burst",
  },
  "POST:/auth/logout": {
    windowMs: 60_000,
    limit: 30,
    reason: "auth_logout_burst",
  },
  "GET:/auth/csrf-token": {
    windowMs: 60_000,
    limit: 120,
    reason: "csrf_token_burst",
  },

  // ── MFA ─────────────────────────────────────────────────────────────────
  "POST:/auth/mfa/challenge": {
    windowMs: 60_000,
    limit: 6,
    lockoutThreshold: 5,
    lockoutWindowMs: 30 * 60_000,
    reason: "mfa_challenge_burst",
  },
  "POST:/auth/mfa/verify": {
    windowMs: 60_000,
    limit: 6,
    lockoutThreshold: 5,
    lockoutWindowMs: 30 * 60_000,
    reason: "mfa_verify_burst",
  },
  "POST:/auth/mfa/enroll": {
    windowMs: 60_000,
    limit: 10,
    reason: "mfa_enroll_burst",
  },
  "POST:/auth/mfa/recovery": {
    windowMs: 60_000,
    limit: 5,
    lockoutThreshold: 3,
    lockoutWindowMs: 60 * 60_000,
    reason: "mfa_recovery_burst",
  },

  // ── Password / recovery (reserved for endpoint) ─────────────────────────
  "POST:/auth/password-reset": {
    windowMs: 60_000,
    limit: 5,
    lockoutThreshold: 3,
    lockoutWindowMs: 30 * 60_000,
    reason: "password_reset_burst",
  },
  "POST:/auth/password-reset/confirm": {
    windowMs: 60_000,
    limit: 5,
    lockoutThreshold: 3,
    lockoutWindowMs: 30 * 60_000,
    reason: "password_reset_confirm_burst",
  },

  // ── Clinical writes ─────────────────────────────────────────────────────
  clinical_write: {
    windowMs: 60_000,
    limit: 120,
    reason: "clinical_write_burst",
  },
  appointment_book: {
    windowMs: 60_000,
    limit: 30,
    reason: "appointment_booking_burst",
  },
  prescription_write: {
    windowMs: 60_000,
    limit: 60,
    lockoutThreshold: 20,
    lockoutWindowMs: 15 * 60_000,
    reason: "prescription_write_burst",
  },
  lab_operation: {
    windowMs: 60_000,
    limit: 120,
    reason: "lab_operation_burst",
  },

  // ── Financial / billing ─────────────────────────────────────────────────
  billing_write: {
    windowMs: 60_000,
    limit: 30,
    lockoutThreshold: 10,
    lockoutWindowMs: 30 * 60_000,
    reason: "billing_write_burst",
  },

  // ── External integrations / outbound ────────────────────────────────────
  external_submission: {
    windowMs: 60_000,
    limit: 20,
    lockoutThreshold: 10,
    lockoutWindowMs: 15 * 60_000,
    reason: "external_submission_burst",
  },
  public_health_submission: {
    windowMs: 60_000,
    limit: 10,
    reason: "public_health_submission_burst",
  },

  // ── AI / governed services ──────────────────────────────────────────────
  ai_invocation: {
    windowMs: 60_000,
    limit: 20,
    lockoutThreshold: 10,
    lockoutWindowMs: 15 * 60_000,
    reason: "ai_invocation_burst",
  },

  // ── Admin / governance ──────────────────────────────────────────────────
  admin_sensitive: {
    windowMs: 60_000,
    limit: 30,
    lockoutThreshold: 10,
    lockoutWindowMs: 15 * 60_000,
    reason: "admin_sensitive_burst",
  },

  // ── Generic ─────────────────────────────────────────────────────────────
  "write:*": { windowMs: 60_000, limit: 200, reason: "generic_write_burst" },
  "read:*": { windowMs: 60_000, limit: 600, reason: "generic_read_burst" },
  "GET:/health": { windowMs: 10_000, limit: 30, reason: "health_probe" },
  "GET:/health/live": { windowMs: 10_000, limit: 30, reason: "health_probe" },
  "GET:/health/ready": { windowMs: 10_000, limit: 30, reason: "health_probe" },
};

export function policyFor(method: string, path: string): RateLimitPolicy {
  const m = method.toUpperCase();
  // Normalise path: accept both /auth/... and /api/auth/... (global prefix may vary).
  const normalized = path.replace(/^\/api/, "");
  const key = `${m}:${normalized}`;
  if (POLICIES[key]) return POLICIES[key];
  const p = normalized.toLowerCase();
  // Path-prefix classification for clinical/financial/admin/ai/external endpoints.
  if (/(appointment|appointments)/.test(p) && method !== "GET")
    return POLICIES["appointment_book"];
  if (/(prescription|pharmacy|rx|dispens)/.test(p) && method !== "GET")
    return POLICIES["prescription_write"];
  if (/(lab|laboratory)/.test(p) && method !== "GET")
    return POLICIES["lab_operation"];
  if (/billing|payment|invoice|claim/.test(p) && method !== "GET")
    return POLICIES["billing_write"];
  if (/ai|noelia|hive/.test(p)) return POLICIES["ai_invocation"];
  if (
    /mtuha|public[-_]?health|notifiable|surveill|fhir/.test(p) &&
    method !== "GET"
  )
    return POLICIES["public_health_submission"];
  if (/integration|webhook/.test(p) && method !== "GET")
    return POLICIES["external_submission"];
  if (
    /admin|tenant|rbac|role|trustee|breakglass|board/.test(p) &&
    method !== "GET"
  )
    return POLICIES["admin_sensitive"];
  if (
    /patient|encounter|clinical|observ|problem|allergy|medication|radiolog|imaging|dialys|ophthal|optical|telehealth|ambulance|consent|incident|records|note/.test(
      p,
    ) &&
    method !== "GET"
  )
    return POLICIES["clinical_write"];
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
  opts: {
    tenantId?: string | null;
    lockoutHits?: number;
    endpointId?: string;
  } = {},
): {
  windowMs: number;
  limit: number;
  keyType: any;
  keyValue: string;
  endpoint: string;
  tenantId?: string | null;
  lockout: boolean;
  reason: string;
} {
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
