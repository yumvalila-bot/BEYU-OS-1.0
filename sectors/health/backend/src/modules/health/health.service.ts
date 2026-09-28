import {
  Injectable,
  ServiceUnavailableException,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as path from "node:path";
import { DB_CONNECTION, type DbConnection } from "../identity/db-connection";
import { AdapterRegistry } from "../integrations/adapter-registry";
import { OutboxMetricsService } from "../events/outbox-metrics.service";
import { readMigrationState } from "../../database/migration-ledger";

/**
 * Committed Health migration source, resolved identically from `src/` (ts-node,
 * jest) and from the compiled `dist/` tree (`dist/modules/health` →
 * `<pkg>/database/migrations`). The container image MUST ship this directory
 * (see Dockerfile) — without it readiness reports MIGRATION_SOURCE_UNAVAILABLE
 * and stays 503 (fail closed).
 */
export const HEALTH_MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

/**
 * Health endpoints implementing the LIVE / READY / DEPENDENCY distinction.
 *
 *  - /health/live  → liveness (process alive; NEVER fails due to downstreams)
 *  - /health/ready → readiness (DB reachable + migrations current + critical
 *                    config + queues/adapters consistent). Returns 503 when
 *                    not ready.
 *  - /health       → legacy / summary
 *
 *  No secrets, tokens, PHI, or credentials are ever returned.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly config: ConfigService,
    private readonly adapters: AdapterRegistry,
    private readonly outboxMetrics: OutboxMetricsService,
  ) {}

  async check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  async checkLiveness() {
    return { status: "alive", timestamp: new Date().toISOString() };
  }

  async checkReadiness() {
    const checks = await this.runChecks();
    const critical = ["database", "migrations", "critical_config"];
    const notReady = Object.entries(checks)
      .filter(([k, v]) => critical.includes(k) && v.status !== "up")
      .map(([k]) => k);
    const body = {
      status: notReady.length === 0 ? "ready" : "not_ready",
      checks,
      timestamp: new Date().toISOString(),
    };
    if (notReady.length > 0) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private async runChecks() {
    const database = await this.checkDatabase();
    const migrations = await this.checkMigrations();
    const criticalConfig = this.checkCriticalConfig();
    const adapters = await this.checkAdapters();
    // Event dispatcher (Phase 16/17): operational state is REPORTED but never
    // fails readiness on its own — a backlog or dead-letter is an operational
    // condition for operators, not an unreadiness of the service process.
    const eventDispatcher = await this.outboxMetrics
      .readiness()
      .catch((e: unknown) => ({
        status: "degraded" as const,
        detail: { error: `${(e as Error).message}`.slice(0, 200) },
      }));
    return {
      database,
      migrations,
      critical_config: criticalConfig,
      adapters,
      event_dispatcher: eventDispatcher,
    };
  }

  private async checkDatabase() {
    try {
      await this.db.query("SELECT 1");
      return { status: "up" as const };
    } catch (e: any) {
      this.logger.warn(`db readiness probe failed: ${e?.message}`);
      return { status: "down" as const, error: sanitizeErr(e) };
    }
  }

  /**
   * Migrations are "up" only when the governed ledger (`beyu_migrations`, the
   * table migration-runner.ts writes) contains every committed migration with
   * a matching checksum, nothing unknown, and therefore the expected
   * fingerprint. Previously this read `health.schema_migrations`, a table
   * nothing creates, so readiness could never pass (DEP-3).
   */
  private async checkMigrations() {
    try {
      const st = await readMigrationState(this.db, HEALTH_MIGRATIONS_DIR);
      return {
        status: st.status,
        reasons: st.reasons,
        ledger: st.ledger,
        committed: st.committed,
        applied: st.applied,
        latest: st.latest,
        expected_fingerprint: st.expectedFingerprint,
        ledger_fingerprint: st.ledgerFingerprint,
        ...(st.pending.length ? { pending_sample: st.pending } : {}),
        ...(st.drift.length ? { drift_sample: st.drift } : {}),
        ...(st.unknown.length ? { unknown_sample: st.unknown } : {}),
      };
    } catch (e: any) {
      return { status: "down" as const, error: sanitizeErr(e) };
    }
  }

  private checkCriticalConfig() {
    const isProd = this.config.get("NODE_ENV") === "production";
    const missing: string[] = [];
    const jwtSecret = this.config.get("JWT_SECRET");
    if (isProd) {
      if (!jwtSecret || jwtSecret === "dev-only-change-me")
        missing.push("JWT_SECRET");
      if (this.config.get("CORS_ORIGIN") === "*")
        missing.push("CORS_ORIGIN_WILDCARD");
    }
    return {
      status: missing.length === 0 ? ("up" as const) : ("down" as const),
      missing,
    };
  }

  private async checkAdapters() {
    const statuses = await this.adapters.probeAll();
    // Adapter failures do NOT take down readiness for non-required adapters.
    // Only adapters with state=failed are noted; unavailable stubs are normal
    // when no external integration is configured.
    return {
      status: "up" as const,
      adapters: statuses.map((s) => ({
        provider: s.provider,
        state: s.state,
        configured_fields: s.configured_fields,
        missing_fields_count: s.missing_fields.length,
        error: s.last_error,
      })),
    };
  }
}

function sanitizeErr(e: any): string {
  const msg = e?.message ?? "unknown";
  // Redact connection strings / tokens / passwords from error messages.
  return String(msg).replace(
    /(?:password|token|secret|key|sslcert|sslkey)=[^&"'\s]+/gi,
    "$1=__REDACTED__",
  );
}
