import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DbConnection,
  DB_CONNECTION,
} from "../../modules/identity/db-connection";
import { Inject } from "@nestjs/common";

/**
 * Provider-neutral rate limiter.
 *
 * Production mode (RATE_LIMIT_BACKEND=redis) requires REDIS_URL; if Redis is
 * requested but not configured the process fails closed at boot (throws on
 * construction). In dev/test we use an in-memory SlidingWindowCounter. The
 * limiter never claims distributed enforcement when only the in-memory backend
 * is active.
 *
 * Each hit returns {allowed, remaining, resetAt} and, when blocked, throws
 * TooManyRequestsException after recording an audit event in
 * health.rate_limit_events.
 */

export interface RateLimitConfig {
  keyType: "ip" | "actor" | "tenant" | "global";
  keyValue: string;
  endpoint?: string;
  windowMs: number;
  limit: number;
  tenantId?: string | null;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  current: number;
}

interface Bucket {
  hits: Array<number>; // timestamps ms
}

@Injectable()
export class RateLimiter {
  private readonly backend: "memory" | "redis";
  private readonly memory = new Map<string, Bucket>();
  // Interval timer for cleanup; runs at most once per minute.
  private readonly cleanupTimer?: NodeJS.Timeout;
  private readonly logger = new Logger(RateLimiter.name);

  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly config: ConfigService,
  ) {
    const want = this.config.get<string>("RATE_LIMIT_BACKEND", "memory");
    if (want === "redis") {
      const redisUrl = this.config.get<string>("REDIS_URL");
      if (!redisUrl) {
        throw new Error(
          "MISCONFIGURATION: RATE_LIMIT_BACKEND=redis but REDIS_URL is not set. Refusing to start.",
        );
      }
      // NOTE: distributed Redis enforcement is PARTIALLY_IMPLEMENTED. We do not
      // instantiate an ioredis client here because credentials are not available
      // in this environment. Adapter contract + fail-closed boot validation are
      // in place; when a real REDIS_URL is supplied, wiring ioredis is a tracked
      // TODO and we EXTERNAL-BLOCK rather than fake.
      throw new Error(
        "MISCONFIGURATION: Redis-backed rate limiting is not implemented yet. " +
          "Tracked as PARTIALLY_IMPLEMENTED. Set RATE_LIMIT_BACKEND=memory for non-distributed dev/test.",
      );
    }
    this.backend = "memory";
    // Periodic cleanup of expired memory buckets.
    this.cleanupTimer = setInterval(() => this.gc(), 60_000);
    // Do not prevent Node exit during tests.
    if (typeof (this.cleanupTimer as any).unref === "function") {
      (this.cleanupTimer as any).unref();
    }
  }

  backendKind(): "memory" | "redis" {
    return this.backend;
  }

  async hit(cfg: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = cfg.windowMs;
    const key = `${cfg.keyType}:${cfg.keyValue}:${cfg.endpoint ?? "*"}:${windowMs}`;
    let bucket = this.memory.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      this.memory.set(key, bucket);
    }
    // Drop expired entries.
    const cutoff = now - windowMs;
    bucket.hits = bucket.hits.filter((t) => t > cutoff);
    bucket.hits.push(now);
    const current = bucket.hits.length;
    const oldest = bucket.hits[0];
    const resetAt = new Date(oldest + windowMs);
    const allowed = current <= cfg.limit;
    const remaining = Math.max(0, cfg.limit - current);

    if (!allowed) {
      // Log audit event (fire-and-forget; do not block rejection on logging).
      this.db
        .query(
          `INSERT INTO health.rate_limit_events
             (tenant_id, key_type, key_value, endpoint, window_label, limit_count, current_count, action)
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,'blocked')`,
          [
            cfg.tenantId ?? null,
            cfg.keyType,
            cfg.keyValue,
            cfg.endpoint ?? null,
            `${Math.round(windowMs / 1000)}s`,
            cfg.limit,
            current,
          ],
        )
        .catch((e) =>
          this.logger.warn({ msg: "rate_limit_log_failed", err: String(e) }),
        );
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          resetAt: resetAt.toISOString(),
          limit: cfg.limit,
          windowMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return { allowed, remaining, resetAt, current };
  }

  /** Reset a key (testing / lockout-clearing). */
  reset(
    keyType: RateLimitConfig["keyType"],
    keyValue: string,
    endpoint?: string,
    windowMs = 60_000,
  ): void {
    const key = `${keyType}:${keyValue}:${endpoint ?? "*"}:${windowMs}`;
    this.memory.delete(key);
  }

  resetAll(): void {
    this.memory.clear();
  }

  private gc(): void {
    const now = Date.now();
    for (const [k, b] of this.memory.entries()) {
      const windowMs = Number(k.split(":").pop()) || 60_000;
      b.hits = b.hits.filter((t) => t > now - windowMs);
      if (b.hits.length === 0) this.memory.delete(k);
    }
  }
}
