/**
 * Tax Engine adapter — canonical tax determination.
 *
 * Health OS must not hard-code production tax rates or fabricate TRA
 * submissions. When Tax Engine is EXTERNAL-BLOCKED, taxable events are
 * recorded as blocked/pending and return status="blocked" — caller MUST
 * NOT treat tax as determined. TRA credentials/endpoints are NOT
 * fabricated.
 */
import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DbConnection, DB_CONNECTION } from "../../../modules/identity/db-connection";
import { TenantContext } from "../../../common/security/tenant-context";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import { BeyuBaseAdapter } from "../adapters/beyu-base.adapter";
import type { TaxDeterminationRequest, TaxDeterminationResponse } from "../contracts/shared.types";

@Injectable()
export class TaxAdapter extends BeyuBaseAdapter {
  protected readonly config = {
    provider: "beyu.tax",
    endpointEnv: "BEYU_TAX_ENDPOINT",
    credentialEnvs: ["BEYU_TAX_TOKEN"],
    requiredForBoot: false,
    defaultTimeoutMs: 3000,
    maxRetries: 1,
    baseBackoffMs: 200,
  };

  constructor(
    @Inject(DB_CONNECTION) db: DbConnection,
    tenantCtx: TenantContext,
    circuit: CircuitBreaker,
    cfg: ConfigService,
  ) { super(db, tenantCtx, circuit, cfg); }

  async determine(req: TaxDeterminationRequest): Promise<TaxDeterminationResponse> {
    if (this.getState() === "NOT_CONFIGURED") {
      await this.db.query(
        `INSERT INTO health.beyu_outbox
            (idempotency_key, provider, action, actor_global_user_id, tenant_id, entity_code, country_code,
             request_payload, status, correlation_id, last_error, created_at, updated_at)
         VALUES ($1,'beyu.tax','determine',$2::uuid,$3::uuid,$4,$5,$6::jsonb,'blocked',$7,
                 'TAX_ENGINE_EXTERNAL_BLOCKED',now(),now())
         ON CONFLICT (idempotency_key) DO UPDATE SET updated_at=now()`,
        [
          req.propagation.idempotencyKey!,
          req.actor.globalUserId,
          req.actor.tenantId,
          req.actor.entityCode,
          req.actor.countryCode,
          JSON.stringify({ eventType: req.taxableEventType, amount: req.amount, jurisdiction: req.jurisdiction, taxCategory: req.taxCategory }),
          req.propagation.correlationId,
        ],
      );
      return {
        determined: false,
        status: "blocked",
        totalTax: null,
        lines: [],
        policyVersion: null,
        reasonCode: "TAX_ENGINE_EXTERNAL_BLOCKED",
        failureReason: "Tax Engine not configured; failing closed (no fabricated tax).",
      };
    }
    return this.execute("determine", req, async (): Promise<TaxDeterminationResponse> => {
      throw new Error("Tax HTTP transport not implemented in this build.");
    });
  }
}
