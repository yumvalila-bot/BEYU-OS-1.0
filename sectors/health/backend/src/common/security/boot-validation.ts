/**
 * Production boot validation.
 *
 * Invoked from main.ts BEFORE the app starts listening. If any required
 * configuration is unsafe/missing the boot is aborted with a clear error.
 *
 * Development/test environments may use safe deterministic defaults;
 * production MUST fail closed. Never prints secrets.
 */
import { Logger } from "@nestjs/common";

export interface BootValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateBootEnvironment(
  env: NodeJS.ProcessEnv,
  log: Logger = new Logger("BootValidation"),
): BootValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === "production";

  // ── JWT / auth ────────────────────────────────────────────────────────────
  if (
    isProd &&
    (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || isDefault(env.JWT_SECRET))
  ) {
    errors.push(
      "JWT_SECRET must be set to a high-entropy value (>=32 chars) in production",
    );
  }
  if (isProd && (!env.JWT_ISSUER || isDefault(env.JWT_ISSUER))) {
    errors.push("JWT_ISSUER must be configured in production");
  }
  if (isProd && (!env.JWT_AUDIENCE || isDefault(env.JWT_AUDIENCE))) {
    errors.push("JWT_AUDIENCE must be configured in production");
  }
  if (
    isProd &&
    (!env.REFRESH_TOKEN_SECRET ||
      env.REFRESH_TOKEN_SECRET.length < 32 ||
      isDefault(env.REFRESH_TOKEN_SECRET))
  ) {
    errors.push("REFRESH_TOKEN_SECRET must be set in production");
  }
  if (
    isProd &&
    (!env.CSRF_SECRET ||
      env.CSRF_SECRET.length < 32 ||
      isDefault(env.CSRF_SECRET))
  ) {
    errors.push("CSRF_SECRET must be set in production");
  }

  // ── Cookies / CORS ────────────────────────────────────────────────────────
  if (isProd && env.COOKIE_SECURE !== "true") {
    errors.push("COOKIE_SECURE=true is required in production");
  }
  if (isProd && (env.CORS_ORIGIN === "*" || !env.CORS_ORIGIN)) {
    warnings.push(
      "CORS_ORIGIN should be an explicit allow-list in production (wildcard '*' is unsafe)",
    );
  }

  // ── Database / RLS ────────────────────────────────────────────────────────
  if (isProd && !env.DATABASE_URL) {
    errors.push("DATABASE_URL is required in production");
  }
  if (isProd && env.DB_SKIP_RLS_CHECK === "true") {
    errors.push("DB_SKIP_RLS_CHECK must NOT be true in production");
  }

  // ── Test-only bypass flags ───────────────────────────────────────────────
  // BEYU_HCM_BYPASS_FOR_TEST disables practitioner licence/employment/scope
  // verification in the HCM adapter when no live BEYU_HCM_ENDPOINT is
  // configured. It exists solely for the HTTP E2E harness under a provably
  // non-production NODE_ENV. Any effective (truthy) value in production is a
  // boot failure: it would silently strip clinical-safety enforcement.
  if (isProd && /^(1|true|yes|on)$/i.test(env.BEYU_HCM_BYPASS_FOR_TEST ?? "")) {
    errors.push(
      "BEYU_HCM_BYPASS_FOR_TEST must NOT be enabled in production — it disables HCM practitioner verification",
    );
  }

  // ── Canonical identity federation (BEYU OS control plane) ───────────────
  // Production Health OS cannot onboard or authenticate identities without
  // the canonical BEYU identity service: registration and new logins fail
  // closed without it. Refusing to boot makes that contract explicit instead
  // of failing per-request after startup.
  if (isProd && !env.BEYU_IDENTITY_ENDPOINT) {
    errors.push(
      "BEYU_IDENTITY_ENDPOINT is required in production — canonical identity federation cannot be disabled (registration/login fail closed without the control plane)",
    );
  }
  if (isProd && env.BEYU_IDENTITY_ENDPOINT && !env.BEYU_IDENTITY_TOKEN) {
    errors.push(
      "BEYU_IDENTITY_TOKEN is required in production when BEYU_IDENTITY_ENDPOINT is set (service credential; fail closed)",
    );
  }
  // The identity test harness mints synthetic canonical references. It is
  // structurally refused at runtime too (IdentityFederationService.mode()).
  if (isProd && /^(1|true|yes|on)$/i.test(env.BEYU_IDENTITY_TEST_HARNESS ?? "")) {
    errors.push(
      "BEYU_IDENTITY_TEST_HARNESS must NOT be enabled in production — canonical identities would be synthetic",
    );
  }

  // ── Queue / rate-limit backend ───────────────────────────────────────────
  if (isProd && env.QUEUE_BACKEND === "memory") {
    errors.push(
      "QUEUE_BACKEND=memory is not permitted in production (use redis)",
    );
  }
  if (
    isProd &&
    env.QUEUE_BACKEND === "redis" &&
    !env.REDIS_URL &&
    !env.REDIS_HOST
  ) {
    errors.push("QUEUE_BACKEND=redis requires REDIS_URL / REDIS_HOST");
  }
  if (isProd && env.RATE_LIMIT_BACKEND === "memory") {
    warnings.push(
      "RATE_LIMIT_BACKEND=memory does not share counters across instances; Redis recommended in production",
    );
  }

  // ── Encryption ───────────────────────────────────────────────────────────
  if (isProd && !env.ENCRYPTION_KEY) {
    errors.push(
      "ENCRYPTION_KEY is required for MFA secrets / PHI field encryption",
    );
  }

  // ── Log & fail ──────────────────────────────────────────────────────────
  if (errors.length > 0) {
    for (const e of errors) log.error(`BOOT VALIDATION FAILURE: ${e}`);
  }
  for (const w of warnings) log.warn(`BOOT VALIDATION WARNING: ${w}`);
  return { ok: errors.length === 0, errors, warnings };
}

function isDefault(v: string | undefined): boolean {
  if (!v) return true;
  return /^(e2e-|dev-|test-|default|change[-_]?me|secret|password)/i.test(v);
}
