/**
 * Governed outbox dispatcher (Phase 8) — at-least-once transport, with
 * exactly-once business effect enforced by BEYU OS's idempotency receipts.
 *
 * DELIVERY STATE MACHINE (health.beyu_outbox):
 *
 *   pending ──claim──► (lease) ──POST /internal/events──► delivered
 *      ▲                                            │
 *      │                                     retryable failure
 *      │  backoff = full jitter,                 (401/403/429/5xx/
 *      │  base·2^attempt capped                    timeout/network)
 *      └────────── failed ◄─────────────────────────┘
 *                         │
 *            attempt_count ≥ max  OR  permanent 4xx
 *            (400/404/409/413/422 — the event can never be accepted)
 *                         ▼
 *                    dead_letter ──(authorized operator replay)──► pending
 *
 * CLAIMING: rows are claimed with UPDATE … WHERE id IN (SELECT … FOR UPDATE
 * SKIP LOCKED) inside the owning tenant's RLS context, setting a lease
 * (next_attempt_at = now + lease) so two dispatcher instances never deliver
 * the same row concurrently. A crashed delivery lets the lease expire; the
 * row is re-delivered and BEYU's receipt makes the duplicate harmless
 * (duplicate: true, no second enterprise event).
 *
 * SECURITY: the HTTP call carries the cross-OS service token (HS256,
 * issuer HEALTH_OS, audience BEYU_OS, short expiry) — the same governed
 * transport contract as the Phase 7 identity federation. Tenant enumeration
 * uses the narrow SECURITY DEFINER function health.beyu_outbox_due_tenants()
 * (tenant ids only — no cross-tenant data reads).
 */
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DB_CONNECTION, type DbConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { signServiceToken } from "../../integrations/beyu/shared/service-token";
import { SERVICE_PRINCIPAL_ID } from "../../integrations/beyu/adapters/beyu-base.adapter";

/** One row as claimed from the outbox. */
interface OutboxRow {
  [key: string]: unknown;
  id: string;
  idempotency_key: string;
  provider: string;
  action: string;
  actor_global_user_id: string | null;
  tenant_id: string | null;
  entity_code: string | null;
  country_code: string | null;
  request_payload: Record<string, unknown>;
  correlation_id: string | null;
  attempt_count: number;
}

export interface DispatchSummary {
  claimed: number;
  delivered: number;
  duplicates: number;
  retried: number;
  deadLettered: number;
  errors: number;
}

/** Retryable HTTP statuses; everything else 4xx is a permanent rejection. */
const RETRYABLE_STATUS = new Set([401, 403, 408, 429]);

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
    private readonly cfg: ConfigService,
  ) {}

  /** Configuration (test-friendly via env). */
  endpoint(): string | undefined {
    return this.cfg.get<string>("BEYU_EVENTS_ENDPOINT") || undefined;
  }
  private token(): string | undefined {
    return this.cfg.get<string>("BEYU_EVENTS_TOKEN") || undefined;
  }
  private tenantCode(): string {
    return (
      this.cfg.get<string>("BEYU_EVENTS_TENANT_CODE") ??
      this.cfg.get<string>("BEYU_IDENTITY_TENANT_CODE") ??
      "BEYU-HEALTH"
    );
  }
  private maxAttempts(): number {
    return Number(this.cfg.get("BEYU_EVENTS_MAX_ATTEMPTS") ?? 8);
  }
  private backoffBaseMs(): number {
    return Number(this.cfg.get("BEYU_EVENTS_BACKOFF_BASE_MS") ?? 1000);
  }
  private backoffCapMs(): number {
    return Number(this.cfg.get("BEYU_EVENTS_BACKOFF_CAP_MS") ?? 300_000);
  }
  private leaseMs(): number {
    return Number(this.cfg.get("BEYU_EVENTS_LEASE_MS") ?? 60_000);
  }
  private timeoutMs(): number {
    return Number(this.cfg.get("BEYU_EVENTS_TIMEOUT_MS") ?? 8000);
  }
  private batchSize(): number {
    return Number(this.cfg.get("BEYU_EVENTS_BATCH") ?? 20);
  }

  onModuleInit(): void {
    const interval = Number(this.cfg.get("BEYU_EVENTS_DISPATCH_INTERVAL_MS") ?? 5000);
    if (!this.endpoint()) {
      this.logger.log("governed event dispatch disabled — BEYU_EVENTS_ENDPOINT not configured (outbox accumulates; reconciliation surfaces backlog)");
      return;
    }
    if (interval <= 0) {
      this.logger.log("governed event dispatch interval disabled (BEYU_EVENTS_DISPATCH_INTERVAL_MS<=0) — dispatchDueBatch() must be invoked explicitly");
      return;
    }
    this.timer = setInterval(() => {
      void this.dispatchDueBatch().catch((e) =>
        this.logger.error(`dispatch cycle failed: ${(e as Error).message}`),
      );
    }, interval);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One dispatch cycle: enumerate due tenants, claim + deliver their rows.
   * Overlapping cycles are refused (single-flight).
   */
  async dispatchDueBatch(): Promise<DispatchSummary> {
    const summary: DispatchSummary = { claimed: 0, delivered: 0, duplicates: 0, retried: 0, deadLettered: 0, errors: 0 };
    if (this.running) return summary;
    this.running = true;
    try {
      const tenants = await this.db.query<{ tenant_id: string | null }>(
        `SELECT * FROM health.beyu_outbox_due_tenants()`,
      );
      for (const { tenant_id } of tenants) {
        const rows = await this.claim(tenant_id);
        for (const row of rows) {
          summary.claimed++;
          const outcome = await this.deliver(row);
          summary[outcome] += 1;
        }
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  /**
   * Claim due rows for one tenant inside that tenant's RLS context.
   * The claim sets a lease so a concurrent dispatcher (or a crashed one)
   * cannot pick the row up until the lease expires.
   */
  private async claim(tenantId: string | null): Promise<OutboxRow[]> {
    const leaseSeconds = Math.max(1, Math.ceil(this.leaseMs() / 1000));
    const actor = {
      globalUserId: SERVICE_PRINCIPAL_ID,
      userId: SERVICE_PRINCIPAL_ID,
      email: "service@health-os.internal",
      tenantId: tenantId ?? undefined,
      entityCode: null,
      countryCode: null,
      role: "service",
    };
    return new Promise<OutboxRow[]>((resolve, reject) => {
      requestStorage.run(
        { correlationId: `dispatch-${Date.now()}`, requestId: `dispatch-${Date.now()}`, startedAt: Date.now(), method: "DISPATCH", path: "/internal/events", ip: "127.0.0.1" },
        () =>
          this.tenantCtx.run(actor as never, () =>
            this.db
              .query<OutboxRow>(
                `UPDATE health.beyu_outbox SET
                   attempt_count = attempt_count + 1,
                   last_attempt_at = now(),
                   next_attempt_at = now() + ($3 || ' seconds')::interval,
                   attempt_log = attempt_log || $4::jsonb
                 WHERE id IN (
                   SELECT id FROM health.beyu_outbox
                    WHERE provider = 'beyu.events'
                      AND status IN ('pending','failed','blocked')
                      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                      AND attempt_count < $1
                      AND tenant_id IS NOT DISTINCT FROM $2::uuid
                    ORDER BY created_at
                    LIMIT $5
                      FOR UPDATE SKIP LOCKED
                 )
                 RETURNING id, idempotency_key, provider, action, actor_global_user_id,
                           tenant_id, entity_code, country_code, request_payload,
                           correlation_id, attempt_count`,
                [
                  this.maxAttempts(),
                  tenantId,
                  String(leaseSeconds),
                  JSON.stringify([{ phase: "claim", at: new Date().toISOString(), leaseUntil: new Date(Date.now() + this.leaseMs()).toISOString() }]),
                  this.batchSize(),
                ],
              )
              .then(resolve, reject),
          ),
      );
    });
  }

  /** Deliver one claimed row. Returns the outcome bucket for the summary. */
  private async deliver(row: OutboxRow): Promise<"delivered" | "duplicates" | "retried" | "deadLettered" | "errors"> {
    const attempt = row.attempt_count;
    try {
      const result = await this.postEvent(row);
      // 201 accepted OR 200 duplicate → delivered (exactly-once is BEYU's).
      await this.markDelivered(row, result);
      return result.duplicate ? "duplicates" : "delivered";
    } catch (e) {
      const err = e as { permanent?: boolean; status?: number; message: string };
      const dead =
        err.permanent === true ||
        attempt >= this.maxAttempts();
      if (dead) {
        await this.markDeadLetter(row, attempt, err.message, err.status);
        return "deadLettered";
      }
      await this.markRetry(row, attempt, err.message, err.status);
      return "retried";
    }
  }

  /** Single-attempt authenticated POST (retry is the outbox's job). */
  private async postEvent(
    row: OutboxRow,
  ): Promise<{ accepted: boolean; duplicate: boolean; eventId: string | null }> {
    const endpoint = this.endpoint();
    const secret = this.token();
    if (!endpoint || !secret) {
      throw Object.assign(new Error("BEYU_EVENTS_ENDPOINT/BEYU_EVENTS_TOKEN not configured"), { permanent: false });
    }
    const envelope = row.request_payload as Record<string, unknown>;
    const body = {
      ...envelope,
      idempotencyKey: row.idempotency_key,
      tenantCode: this.tenantCode(),
      // The source OS is whoever runs this dispatcher — stamped here, not
      // trusted from the stored envelope.
      source: "HEALTH_OS" as const,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/v1/internal/events`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${signServiceToken(secret)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 201 || res.status === 200) {
        const json = (await res.json()) as { data?: { accepted?: boolean; duplicate?: boolean; eventId?: string | null } };
        return {
          accepted: json.data?.accepted ?? true,
          duplicate: json.data?.duplicate ?? false,
          eventId: json.data?.eventId ?? null,
        };
      }
      // Permanent rejections: the event as-shaped can never be accepted.
      const permanent = res.status >= 400 && res.status < 500 && !RETRYABLE_STATUS.has(res.status);
      const detail = (await res.text()).slice(0, 500);
      throw Object.assign(new Error(`BEYU ${res.status}: ${detail}`), {
        permanent,
        status: res.status,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        throw Object.assign(new Error(`BEYU timeout after ${this.timeoutMs()}ms`), { permanent: false });
      }
      // Network-layer failures are retryable.
      if ((e as { permanent?: boolean }).permanent === undefined) {
        (e as { permanent?: boolean }).permanent = false;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── state transitions (each runs under the row's tenant context) ────────

  private async markDelivered(
    row: OutboxRow,
    result: { accepted: boolean; duplicate: boolean; eventId: string | null },
  ): Promise<void> {
    await this.updateRow(row, {
      status: "delivered",
      nextAttemptAt: null,
      deliveredAt: new Date(),
      responsePayload: result,
      lastError: null,
      attemptLog: [
        { attempt: row.attempt_count, at: new Date().toISOString(), phase: result.duplicate ? "delivered-duplicate" : "delivered", eventId: result.eventId },
      ],
    });
  }

  private async markRetry(row: OutboxRow, attempt: number, error: string, status?: number): Promise<void> {
    const backoff = this.backoffMs(attempt);
    await this.updateRow(row, {
      status: "failed",
      nextAttemptAt: new Date(Date.now() + backoff),
      deliveredAt: null,
      lastError: `${error}`.slice(0, 1000),
      attemptLog: [
        { attempt, at: new Date().toISOString(), phase: "retry", status, backoffMs: backoff, error: `${error}`.slice(0, 300) },
      ],
    });
  }

  private async markDeadLetter(row: OutboxRow, attempt: number, error: string, status?: number): Promise<void> {
    await this.updateRow(row, {
      status: "dead_letter",
      nextAttemptAt: null,
      deliveredAt: null,
      lastError: `${error}`.slice(0, 1000),
      attemptLog: [
        { attempt, at: new Date().toISOString(), phase: "dead_letter", status, error: `${error}`.slice(0, 300) },
      ],
    });
    this.logger.error(`outbox row ${row.idempotency_key} DEAD-LETTERED after ${attempt} attempts: ${error}`);
  }

  /**
   * One state transition under the row's own tenant context (RLS enforced).
   * deliveredAt/responsePayload are only applied for 'delivered'.
   */
  private async updateRow(
    row: OutboxRow,
    s: {
      status: string;
      nextAttemptAt: Date | null;
      deliveredAt: Date | null;
      responsePayload?: Record<string, unknown>;
      lastError: string | null;
      attemptLog: Record<string, unknown>[];
    },
  ): Promise<void> {
    const actor = {
      globalUserId: SERVICE_PRINCIPAL_ID,
      userId: SERVICE_PRINCIPAL_ID,
      email: "service@health-os.internal",
      tenantId: row.tenant_id ?? undefined,
      entityCode: null,
      countryCode: null,
      role: "service",
    };
    await new Promise<void>((resolve, reject) => {
      requestStorage.run(
        {
          correlationId: row.correlation_id ?? `dispatch-${row.id}`,
          requestId: `dispatch-${row.id}`,
          startedAt: Date.now(),
          method: "DISPATCH",
          path: "/internal/events",
          ip: "127.0.0.1",
        },
        () =>
          this.tenantCtx.run(actor as never, () =>
            this.db
              .query(
                `UPDATE health.beyu_outbox SET
                   status = $2,
                   next_attempt_at = $3,
                   last_error = $4,
                   delivered_at = COALESCE($5, delivered_at),
                   response_payload = COALESCE($6::jsonb, response_payload),
                   attempt_log = attempt_log || $7::jsonb
                 WHERE id = $1::uuid`,
                [
                  row.id,
                  s.status,
                  s.nextAttemptAt,
                  s.lastError,
                  s.deliveredAt,
                  s.responsePayload ? JSON.stringify(s.responsePayload) : null,
                  JSON.stringify(s.attemptLog),
                ],
              )
              .then(() => resolve(), reject),
          ),
      );
    });
  }

  /** Full-jitter exponential backoff, capped. */
  private backoffMs(attempt: number): number {
    const cap = Math.min(this.backoffCapMs(), this.backoffBaseMs() * 2 ** attempt);
    return Math.floor(Math.random() * cap);
  }
}
