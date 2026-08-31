/**
 * Finance OS adapter — canonical ledger/financial truth.
 *
 * Health OS emits financial EVENTS only; Finance OS owns all
 * invoice/payment/ledger/GL/treatment. Health OS must never:
 *   - mark a transaction "settled" without a canonical Finance OS ack
 *   - fabricate invoice numbers / payment refs / GL codes
 *   - pretend payments succeeded
 *
 * When Finance OS is unavailable (EXTERNAL-BLOCKED): events are persisted
 * to health.beyu_outbox in pending state and return status="blocked" —
 * callers MUST treat this as "not posted" and surface a blocked state to
 * the user. No fake success.
 */
import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DbConnection, DB_CONNECTION } from "../../../modules/identity/db-connection";
import { TenantContext } from "../../../common/security/tenant-context";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type { FinanceEventRequest, FinanceEventResponse } from "../contracts/shared.types";

@Injectable()
export class FinanceAdapter extends BeyuBaseAdapter {
  protected readonly config = {
    provider: "beyu.finance",
    endpointEnv: "BEYU_FINANCE_ENDPOINT",
    credentialEnvs: ["BEYU_FINANCE_TOKEN"],
    requiredForBoot: false,
    defaultTimeoutMs: 5000,
    maxRetries: 2,
    baseBackoffMs: 300,
  };

  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    tenantCtx: TenantContext,
    circuit: CircuitBreaker,
    cfg: ConfigService,
  ) { super(db, tenantCtx, circuit, cfg); }

  /** Emit a financial event. Always safe to call; returns a blocked/pending
   *  status when Finance OS is not configured. */
  async emitEvent(req: FinanceEventRequest): Promise<FinanceEventResponse> {
    if (this.getState() === "NOT_CONFIGURED") {
      // Persist as blocked in outbox so reconciliation can run later.
      const key = req.propagation.idempotencyKey!;
      await this.db.query(
        `INSERT INTO health.beyu_outbox
            (idempotency_key, provider, action, actor_global_user_id, tenant_id, entity_code, country_code,
             request_payload, status, correlation_id, last_error, created_at, updated_at)
         VALUES ($1,'beyu.finance',$2,$3::uuid,$4::uuid,$5,$6,$7::jsonb,'blocked',$8,
                 'FINANCE_OS_EXTERNAL_BLOCKED',now(),now())
         ON CONFLICT (idempotency_key) DO UPDATE SET updated_at=now()`,
        [
          key,
          req.eventType,
          req.actor.globalUserId,
          req.actor.tenantId,
          req.actor.entityCode,
          req.actor.countryCode,
          JSON.stringify({ eventType: req.eventType, healthResourceType: req.healthResourceType, amount: req.amount, facilityId: req.facilityId }),
          req.propagation.correlationId,
        ],
      );
      return { accepted: false, financeEventId: null, status: "blocked", reasonCode: "FINANCE_OS_EXTERNAL_BLOCKED" };
    }
    // Live transport not fabricated in this build; execute() will record failure and throw.
    return this.execute("emit", req, async (): Promise<FinanceEventResponse> => {
      throw new Error("Finance HTTP transport not implemented in this build.");
    });
  }
}
