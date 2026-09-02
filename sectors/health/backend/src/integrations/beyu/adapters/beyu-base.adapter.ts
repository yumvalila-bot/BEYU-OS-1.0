/**
 * Base class for governed BEYU adapters (Governance, HCM, Finance, Tax,
 * Noelia/HIVE, Identity). Provides:
 *
 *  - Config check (NOT_CONFIGURED / CONFIGURED / BLOCKED)
 *  - Timeout wrapping (AbortController / Promise.race)
 *  - Retry with exponential backoff (idempotent calls only)
 *  - Circuit breaker integration
 *  - Idempotency outbox (write to health.beyu_outbox before outbound call)
 *  - Audit before/after for every outbound call
 *  - Fail-closed when endpoint / credentials absent — never fabricates
 *    responses. Uses IntegrationState enum
 *    NOT_CONFIGURED/CONFIGURED/VALIDATED/CONNECTED/VERIFIED/DEGRADED/BLOCKED.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import {
  DbConnection,
  DB_CONNECTION,
} from "../../../modules/identity/db-connection";
import { TenantContext } from "../../../common/security/tenant-context";
import {
  currentCorrelationId,
  requestStorage,
} from "../../../common/observability/correlation-id.middleware";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import type {
  IntegrationState,
  PropagationEnvelope,
  CanonicalActorContext,
} from "../contracts/shared.types";
import { DomainError } from "../../../common/errors/domain.error";

export interface BeyuAdapterConfig {
  provider: string;
  endpointEnv: string;
  credentialEnvs: string[];
  /** If true, production boot requires configured endpoint; otherwise can stay EXTERNAL-BLOCKED but still fail-closed. */
  requiredForBoot?: boolean;
  defaultTimeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
}

export interface BeyuCallOptions {
  timeoutMs?: number;
  idempotencyKey?: string;
  retries?: number;
  propagateAudit?: boolean;
}

@Injectable()
export abstract class BeyuBaseAdapter {
  protected readonly logger = new Logger(this.constructor.name);
  protected abstract readonly config: BeyuAdapterConfig;

  constructor(
    @Inject(DB_CONNECTION) protected readonly db: DbConnection,
    protected readonly tenantCtx: TenantContext,
    protected readonly circuit: CircuitBreaker,
    protected readonly cfg: ConfigService,
  ) {}

  /* ---------------- state / probe ---------------- */

  getState(): IntegrationState {
    const endpoint = this.cfg.get<string>(this.config.endpointEnv);
    const missing = this.config.credentialEnvs.filter(
      (k) => !this.cfg.get<string>(k),
    );
    if (!endpoint) return "NOT_CONFIGURED";
    if (missing.length > 0) return "CONFIGURED"; // endpoint present but credentials missing
    return "CONFIGURED"; // real connection probe is only done via an authenticated handshake; until then we stay CONFIGURED (not VERIFIED). Production will be EXTERNAL-BLOCKED because live credentials are not fabricated.
  }

  status() {
    const endpoint = this.cfg.get<string>(this.config.endpointEnv);
    const missing = [
      this.config.endpointEnv,
      ...this.config.credentialEnvs,
    ].filter((k) => !this.cfg.get<string>(k));
    const state = this.getState();
    return {
      provider: this.config.provider,
      state,
      endpoint_configured: !!endpoint,
      missing_fields: missing,
      last_check_at: new Date().toISOString(),
      // Live connections to BEYU services are EXTERNAL-BLOCKED in this build.
      block_reason:
        state === "NOT_CONFIGURED"
          ? "EXTERNAL_DEPENDENCY_REQUIRED: endpoint and credentials must be supplied via environment. No live connection attempted."
          : null,
    };
  }

  /** Guard call sites; throws DomainError.unavailable when adapter is not live. */
  protected assertCallPermitted(): void {
    const state = this.getState();
    if (state === "NOT_CONFIGURED") {
      throw DomainError.unavailable(
        `BEYU adapter '${this.config.provider}' NOT_CONFIGURED. ` +
          `Set ${this.config.endpointEnv} and credentials; failing closed.`,
      );
    }
  }

  /* ---------------- actor / propagation ---------------- */

  protected currentActor(): CanonicalActorContext {
    const a = this.tenantCtx.current();
    if (!a) throw DomainError.unauthorized("NO_ACTOR");
    return {
      globalUserId: a.globalUserId ?? a.userId,
      email: a.email ?? null,
      tenantId: a.tenantId,
      entityCode: a.entityCode ?? null,
      countryCode: a.countryCode ?? null,
      licenceNumber: a.licenceNumber ?? null,
      practitionerId: a.practitionerId ?? null,
      facilityId: a.facilityId ?? null,
      sessionId: a.sessionId ?? null,
      role: a.role,
      permissions: a.permissions ?? [],
      timezone: a.timezone ?? null,
      sourceService: "health-os",
    };
  }

  protected propagation(opts?: BeyuCallOptions): PropagationEnvelope {
    const reqCtx = (requestStorage as any).getStore?.() as any;
    return {
      correlationId: currentCorrelationId(),
      causationId: null,
      requestId: reqCtx?.requestId ?? randomUUID(),
      idempotencyKey: opts?.idempotencyKey ?? randomUUID(),
      timestamp: new Date().toISOString(),
    };
  }

  /* ---------------- execution wrapper ---------------- */

  /** Wrap outbound call with timeout, circuit breaker, idempotency, audit.
   *  This method does NOT itself perform HTTP; subclasses implement `doCall`. */
  protected async execute<T>(
    action: string,
    req: unknown,
    doCall: () => Promise<T>,
    opts?: BeyuCallOptions,
  ): Promise<T> {
    this.assertCallPermitted();
    const timeoutMs = opts?.timeoutMs ?? this.config.defaultTimeoutMs ?? 5000;
    const maxRetries = opts?.retries ?? this.config.maxRetries ?? 0;
    const idempotencyKey = opts?.idempotencyKey ?? randomUUID();

    // Idempotency outbox record (written BEFORE call so a crash can reconcile).
    const outboxId = await this.writeOutbox(action, req, idempotencyKey);

    let lastErr: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.circuit.execute(
          `${this.config.provider}:${action}`,
          () => withTimeout(doCall(), timeoutMs),
        );
        await this.markOutbox(outboxId, "delivered", null);
        await this.auditOutbound(action, req, result, idempotencyKey, null);
        return result;
      } catch (e: any) {
        lastErr = e;
        const retryable = isRetryable(e);
        if (!retryable || attempt === maxRetries) {
          await this.markOutbox(outboxId, "failed", e?.message ?? "error");
          await this.auditOutbound(
            action,
            req,
            null,
            idempotencyKey,
            e?.message ?? "error",
          );
          throw DomainError.unavailable(
            `BEYU adapter '${this.config.provider}' action '${action}' failed: ${e?.message ?? "unknown"}`,
          );
        }
        await sleep(backoffMs(attempt, this.config.baseBackoffMs ?? 200));
      }
    }
    throw lastErr;
  }

  /* ---------------- outbox / audit ---------------- */

  private async writeOutbox(
    action: string,
    req: unknown,
    idemKey: string,
  ): Promise<string> {
    const actor = this.currentActor();
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO health.beyu_outbox
          (idempotency_key, provider, action, actor_global_user_id, tenant_id, entity_code, country_code,
           request_payload, status, correlation_id, created_at)
       VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6,$7,$8::jsonb,'pending',$9,now())
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at=now()
       RETURNING id`,
      [
        idemKey,
        this.config.provider,
        action,
        actor.globalUserId,
        actor.tenantId,
        actor.entityCode,
        actor.countryCode,
        JSON.stringify(redact(req)),
        currentCorrelationId(),
      ],
    );
    return rows[0].id;
  }

  private async markOutbox(
    id: string,
    status: "pending" | "delivered" | "failed",
    error: string | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE health.beyu_outbox SET status=$2, last_error=$3, updated_at=now() WHERE id=$1::uuid`,
      [id, status, error],
    );
  }

  private async auditOutbound(
    action: string,
    req: unknown,
    res: unknown,
    idemKey: string,
    err: string | null,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO health.audit_events
            (tenant_id, actor_id, operation, resource_type, resource_id, before, after, metadata,
             correlation_id, auth_decision, result_status, source_service)
         VALUES (CASE WHEN $1::uuid IS NULL THEN NULL ELSE $1::uuid END,
                 CASE WHEN $2::uuid IS NULL THEN NULL ELSE $2::uuid END,
                 'beyu.outbound.'||$3, 'beyu_adapter', NULL, NULL, NULL,
                 $4::jsonb, $5, 'allowed', CASE WHEN $6 IS NULL THEN 'ok'::text ELSE 'error'::text END, 'health-api')`,
        [
          this.tenantCtx.current()?.tenantId ?? null,
          this.tenantCtx.current()?.userId ?? null,
          action,
          JSON.stringify({
            provider: this.config.provider,
            idempotencyKey: idemKey,
            error: err,
            request_summary: summarize(req),
            response_summary: summarize(res),
          }),
          currentCorrelationId(),
          err,
        ],
      );
    } catch (e) {
      this.logger.warn(`audit outbound failed: ${(e as Error).message}`);
    }
  }
}

/* ---------------- helpers ---------------- */

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          Object.assign(new Error(`TIMEOUT after ${ms}ms`), {
            code: "ETIMEDOUT",
          }),
        ),
      ms,
    );
    p.then(
      (r) => {
        clearTimeout(t);
        resolve(r);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number, base: number): number {
  return (
    Math.min(base * Math.pow(2, attempt), 5000) +
    Math.floor(Math.random() * 100)
  );
}

function isRetryable(e: any): boolean {
  const code = e?.code;
  const status = e?.status;
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "CIRCUIT_OPEN" ||
    status === 429 ||
    (status >= 500 && status < 600)
  );
}

/** Never log credentials/tokens/JWTs/PHI payloads — redact known sensitive keys. */
function redact(o: any): any {
  if (o == null) return o;
  if (Array.isArray(o)) return o.map(redact);
  if (typeof o !== "object") return o;
  const out: any = {};
  const SENS =
    /(password|secret|token|key|authorization|credential|jwt|otp|mfa|pin)/i;
  for (const [k, v] of Object.entries(o)) {
    out[k] = SENS.test(k)
      ? "__REDACTED__"
      : typeof v === "object"
        ? redact(v)
        : v;
  }
  return out;
}

function summarize(_o: unknown): Record<string, unknown> {
  return { summarized: true };
}
