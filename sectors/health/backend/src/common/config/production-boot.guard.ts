/**
 * Production boot validation. Invoked from main.ts BEFORE Nest starts
 * listening. If any mandatory production invariant fails, the process logs
 * the missing item and exits with code 78 (EX_CONFIG).
 *
 * This is a strict gate — never warn-and-continue for critical misconfig.
 */
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface BootCheckResult {
  ok: boolean;
  failures: string[];
}

export function validateProductionBoot(cfg: ConfigService): BootCheckResult {
  const logger = new Logger("ProductionBoot");
  const isProd = cfg.get<string>("NODE_ENV") === "production";
  if (!isProd) return { ok: true, failures: [] };
  const failures: string[] = [];

  function requireEnv(name: string, allowDevDefault?: string) {
    const v = cfg.get<string>(name);
    if (!v || (allowDevDefault && v === allowDevDefault)) {
      failures.push(`Missing or insecure ${name}`);
    }
  }

  requireEnv("JWT_SECRET", "dev-only-change-me");
  requireEnv("JWT_REFRESH_SECRET", "dev-only-change-me");
  requireEnv("JWT_ISSUER");
  requireEnv("JWT_AUDIENCE");
  requireEnv("DATABASE_URL");
  // Test-only bypass flags are never valid in production (agreement with
  // validateBootEnvironment in common/security/boot-validation.ts).
  if (
    /^(1|true|yes|on)$/i.test(cfg.get<string>("BEYU_HCM_BYPASS_FOR_TEST") ?? "")
  ) {
    failures.push(
      "BEYU_HCM_BYPASS_FOR_TEST must not be enabled in production — it disables HCM practitioner verification",
    );
  }
  if (
    /^(1|true|yes|on)$/i.test(
      cfg.get<string>("BEYU_IDENTITY_TEST_HARNESS") ?? "",
    )
  ) {
    failures.push(
      "BEYU_IDENTITY_TEST_HARNESS must not be enabled in production — canonical identities would be synthetic",
    );
  }
  // Canonical identity federation is mandatory in production (agreement with
  // validateBootEnvironment): registration/login fail closed without the
  // BEYU identity control plane, so a misconfigured boot must refuse to start.
  if (!cfg.get<string>("BEYU_IDENTITY_ENDPOINT")) {
    failures.push(
      "BEYU_IDENTITY_ENDPOINT is required in production — canonical identity federation cannot be disabled",
    );
  }
  if (
    cfg.get<string>("BEYU_IDENTITY_ENDPOINT") &&
    !cfg.get<string>("BEYU_IDENTITY_TOKEN")
  ) {
    failures.push(
      "BEYU_IDENTITY_TOKEN is required in production when BEYU_IDENTITY_ENDPOINT is set",
    );
  }
  // Production cookie security
  if (cfg.get<string>("COOKIE_SECURE") === "false")
    failures.push("COOKIE_SECURE must be true in production");
  // CORS wildcard is forbidden in production (wildcard with credentials doesn't work anyway, but enforce).
  const corsOrigin = cfg.get<string>("CORS_ORIGIN");
  if (!corsOrigin || corsOrigin === "*")
    failures.push(
      "CORS_ORIGIN must be set to explicit allow-list in production",
    );
  // Queues/rate limiting: if QUEUE_BACKEND=redis or RATE_LIMIT_BACKEND=redis, require REDIS_URL.
  if (
    cfg.get<string>("QUEUE_BACKEND") === "redis" &&
    !cfg.get<string>("REDIS_URL")
  ) {
    failures.push("QUEUE_BACKEND=redis requires REDIS_URL");
  }
  if (
    cfg.get<string>("RATE_LIMIT_BACKEND") === "redis" &&
    !cfg.get<string>("REDIS_URL")
  ) {
    failures.push("RATE_LIMIT_BACKEND=redis requires REDIS_URL");
  }
  if (
    cfg.get<string>("MFA_ENCRYPTION_KEY") &&
    cfg.get<string>("MFA_ENCRYPTION_KEY")!.length < 32
  ) {
    failures.push("MFA_ENCRYPTION_KEY must be at least 32 bytes");
  }
  if (failures.length) {
    logger.error("PRODUCTION BOOT BLOCKED due to configuration failures:");
    for (const f of failures) logger.error(` - ${f}`);
  }
  return { ok: failures.length === 0, failures };
}
