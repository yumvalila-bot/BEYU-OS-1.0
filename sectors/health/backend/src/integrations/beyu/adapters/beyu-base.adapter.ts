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
import { AuditService } from "../../../modules/audit/audit.service";
import { inTx } from "../../../common/db/crud-factory";
import {
  signServiceToken,
  type ServiceTokenAct,
} from "../shared/service-token";
import type {
  IntegrationState,
  PropagationEnvelope,
  CanonicalActorContext,
} from "../contracts/shared.types";
import { DomainError } from "../../../common/errors/domain.error";

/**
 * Stable identity for the Health OS service principal. This is NOT a human
 * GlobalUserId and can never authenticate as one — it exists so
 * service-initiated outbound calls (registration-time canonical provisioning)
 * are attributable in the outbox/audit ledgers.
 */
export const SERVICE_PRINCIPAL_ID = "00000000-0000-0000-0000-0000000009ee";

/** Tenant bucket for service-initiated calls with no tenant context. */
export const SERVICE_PRINCIPAL_TENANT = "00000000-0000-0000-0000-0000000009ef";

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
  /**
   * Explicit actor for SERVICE-initiated calls that have no human request
   * context (e.g. canonical identity provisioning during registration).
   * When omitted, the current human actor is required (fail-closed).
   */
  actor?: CanonicalActorContext;
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
    /**
     * The canonical Health audit ledger writer (health.audit_log). Injected
     * rather than raw-SQL'd so outbound records participate in the same
     * per-tenant SHA-256 hash chain, tenant/entity/country columns and
     * append-only triggers as every other audited mutation. AuditModule is
     * @Global(), so this resolves without a module import.
     */
    protected readonly auditService: AuditService,
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

  /**
   * Explicit actor for SERVICE-initiated outbound calls with no human
   * request context (canonical identity provisioning during registration).
   * The service principal is auditable in the outbox; the prospective user
   * being provisioned travels in the (redacted) request payload.
   */
  protected serviceActor(tenantId: string | null): CanonicalActorContext {
    return {
      globalUserId: SERVICE_PRINCIPAL_ID,
      email: null,
      // A real tenant when known; the service principal bucket otherwise.
      // Outbox rows for service actors always persist tenant_id NULL (the
      // RLS policy's explicit service-level lane).
      tenantId: tenantId ?? SERVICE_PRINCIPAL_TENANT,
      entityCode: null,
      countryCode: null,
      licenceNumber: null,
      practitionerId: null,
      facilityId: null,
      sessionId: null,
      role: "service",
      permissions: [],
      timezone: null,
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
   *  This method does NOT itself perform HTTP; subclasses implement `doCall`
   *  (typically via postJson). */
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
    // Human actor by default; explicit service actor for service-initiated
    // calls (registration-time provisioning).
    const outboxActor = opts?.actor ?? this.currentActor();
    const isService = outboxActor.globalUserId === SERVICE_PRINCIPAL_ID;
    const outboxId = await this.writeOutbox(
      action,
      req,
      idempotencyKey,
      outboxActor,
    );

    let lastErr: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // The per-tenant circuit breaker is keyed by a REAL tenant (FK to
        // beyu_identity.tenants). Service-initiated calls have no human
        // tenant, so they run under timeout + retry + outbox accounting
        // directly — never a fabricated tenant row.
        const result = isService
          ? await withTimeout(doCall(), timeoutMs)
          : await this.circuit.execute(
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

  /* ---------------- HTTP transport ---------------- */

  /**
   * POST JSON to a BEYU OS internal endpoint (service-to-service).
   *
   * - Signs a fresh HS256 service token per call from this adapter's
   *   credential env (never logged, never written to the outbox payload).
   * - Adds correlation/request-id headers.
   * - Unwraps the BEYU envelope ({ data } on 2xx) and converts non-2xx to an
   *   error carrying .status/.code so execute()'s retry policy can classify
   *   it (4xx → fail fast; 5xx/429/network → retryable).
   * - Uses the platform fetch; no direct internet exposure — endpoints are
   *   operator-configured internal BEYU control-plane URLs.
   */
  protected async postJson<TRes>(
    path: string,
    body: unknown,
    opts?: { act?: ServiceTokenAct | null },
  ): Promise<TRes> {
    const endpoint = this.cfg.get<string>(this.config.endpointEnv);
    const secret = this.config.credentialEnvs
      .map((k) => this.cfg.get<string>(k))
      .find((v) => !!v);
    if (!endpoint) {
      throw Object.assign(new Error("ENDPOINT_NOT_CONFIGURED"), {
        status: 503,
        code: "ENDPOINT_NOT_CONFIGURED",
      });
    }
    if (!secret) {
      // Fail closed: an endpoint without its credential is unusable.
      throw Object.assign(new Error("CREDENTIAL_NOT_CONFIGURED"), {
        status: 503,
        code: "CREDENTIAL_NOT_CONFIGURED",
      });
    }

    // Acting human context (when the call is on behalf of a user).
    let act: ServiceTokenAct | undefined;
    if (opts?.act !== null) {
      try {
        const a = this.currentActor();
        act = {
          globalUserId: a.globalUserId,
          tenantId: a.tenantId,
          entityCode: a.entityCode,
          countryCode: a.countryCode,
          role: a.role,
        };
      } catch {
        act = opts?.act ?? undefined;
      }
    } else {
      act = opts?.act ?? undefined;
    }

    const token = signServiceToken(secret, act);
    const correlationId = currentCorrelationId();
    const requestId = (requestStorage as any).getStore?.()?.requestId ?? randomUUID();

    let res: Response;
    try {
      res = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-correlation-id": correlationId,
          "x-request-id": requestId,
        },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      // Network-level failure — mark retryable for execute()'s backoff loop.
      throw Object.assign(new Error(e?.message ?? "NETWORK_ERROR"), {
        code: e?.code ?? "ECONNREFUSED",
      });
    }

    let parsed: { data?: unknown; error?: { code?: string; message?: string } } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      // Non-JSON body (e.g. HTML error page from a misrouted gateway).
    }
    if (!res.ok) {
      throw Object.assign(
        new Error(
          `BEYU_${path} responded ${res.status}: ${parsed.error?.code ?? "UNKNOWN"}`,
        ),
        {
          status: res.status,
          code: parsed.error?.code ?? "HTTP_ERROR",
        },
      );
    }
    return parsed.data as TRes;
  }

  /* ---------------- outbox / audit ---------------- */

  private async writeOutbox(
    action: string,
    req: unknown,
    idemKey: string,
    actor: CanonicalActorContext,
  ): Promise<string> {
    // Service-initiated calls (no human tenant context) record a NULL
    // tenant_id — the RLS isolation policy explicitly allows service-level
    // rows (tenant_id IS NULL) while app.tenant_id is unset in inTx.
    const isService = actor.globalUserId === SERVICE_PRINCIPAL_ID;
    const rows = await inTx(this.db, this.tenantCtx, (tx) =>
      tx.query<{ id: string }>(
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
          isService ? null : actor.tenantId,
          actor.entityCode,
          actor.countryCode,
          JSON.stringify(redact(req)),
          currentCorrelationId(),
        ],
      ),
    );
    return rows[0].id;
  }

  private async markOutbox(
    id: string,
    status: "pending" | "delivered" | "failed",
    error: string | null,
  ): Promise<void> {
    await inTx(this.db, this.tenantCtx, (tx) =>
      tx.query(
        `UPDATE health.beyu_outbox SET status=$2, last_error=$3, updated_at=now() WHERE id=$1::uuid`,
        [id, status, error],
      ),
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
      await inTx(this.db, this.tenantCtx, (tx) =>
        this.auditService.record(tx, {
          operation: `beyu.outbound.${action}`,
          resourceType: "beyu_adapter",
          resourceId: null,
          metadata: {
            provider: this.config.provider,
            idempotencyKey: idemKey,
            error: err,
            request_summary: summarize(req),
            response_summary: summarize(res),
          },
          authDecision: "allowed",
          resultStatus: err === null ? "ok" : "error",
          sourceService: "health-api",
        }),
      );
    } catch (e) {
      // Post-call audit is best-effort BY DESIGN, and that is safe here: the
      // external side effect has already happened by this point, so throwing
      // could not undo it. The mandatory, unguarded auditability gate is the
      // health.beyu_outbox row that execute() writes BEFORE the call (it
      // requires an actor context and aborts the call if it cannot be
      // written), and it sits in the same database/failure domain as the audit
      // ledger. What must never happen is the failure being invisible, so this
      // is logged at error level with the outbox idempotency key for
      // reconciliation.
      this.logger.error(
        `outbound audit write failed for ${this.config.provider}:${action} ` +
          `(idempotencyKey=${idemKey}): ${(e as Error).message}`,
      );
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
