/**
 * Adapter circuit breaker (DB-backed for multi-instance coordination).
 *
 * States: CLOSED -> (failures >= threshold) -> OPEN -> (reset_timeout) -> HALF_OPEN -> success -> CLOSED / failure -> OPEN.
 * All external adapter calls MUST be wrapped in `execute` to benefit from
 * fail-fast behavior when a downstream is unhealthy.
 */
import { Inject, Injectable } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitOptions {
  thresholdFailures?: number;
  resetTimeoutSec?: number;
}

@Injectable()
export class CircuitBreaker {
  constructor(
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
  ) {}

  async execute<T>(
    adapter: string,
    fn: () => Promise<T>,
    opts: CircuitOptions = {},
  ): Promise<T> {
    const actor = this.tenantCtx.current();
    const tenantId = actor?.tenantId;
    if (!tenantId) throw new Error("AUTH_REQUIRED");
    const threshold = opts.thresholdFailures ?? 5;
    const resetSec = opts.resetTimeoutSec ?? 30;

    // Ensure a circuit row exists.
    await this.db.query(
      `INSERT INTO health.adapter_circuits (tenant_id, adapter_name, threshold_failures, reset_timeout_sec)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, adapter_name) DO NOTHING`,
      [tenantId, adapter, threshold, resetSec],
    );
    const rows = await this.db.query<{
      state: CircuitState;
      failure_count: number;
      success_count: number;
      next_retry_at: Date | null;
    }>(
      `SELECT state, failure_count, success_count, next_retry_at FROM health.adapter_circuits
        WHERE tenant_id=$1 AND adapter_name=$2 FOR UPDATE`,
      [tenantId, adapter],
    );
    const cur = rows[0];
    if (
      cur?.state === "open" &&
      cur.next_retry_at &&
      new Date(cur.next_retry_at) > new Date()
    ) {
      const err: any = new Error(
        `CIRCUIT_OPEN: adapter ${adapter} is unavailable (circuit open)`,
      );
      err.code = "CIRCUIT_OPEN";
      throw err;
    }
    if (cur?.state === "open") {
      await this.db.query(
        `UPDATE health.adapter_circuits SET state='half_open' WHERE tenant_id=$1 AND adapter_name=$2`,
        [tenantId, adapter],
      );
    }
    try {
      const result = await fn();
      await this.db.query(
        `UPDATE health.adapter_circuits
            SET state='closed',
                failure_count=0,
                success_count=success_count+1,
                last_success_at=now(),
                last_error_code=NULL,
                next_retry_at=NULL
          WHERE tenant_id=$1 AND adapter_name=$2`,
        [tenantId, adapter],
      );
      return result;
    } catch (e: any) {
      const code = e?.code ?? "UNKNOWN";
      await this.db.query(
        `UPDATE health.adapter_circuits
            SET failure_count = failure_count + 1,
                success_count = 0,
                last_failure_at = now(),
                last_error_code = $3,
                state = CASE WHEN failure_count + 1 >= threshold_failures THEN 'open'::text ELSE state END,
                next_retry_at = CASE WHEN failure_count + 1 >= threshold_failures THEN now() + (reset_timeout_sec::text || ' seconds')::interval ELSE next_retry_at END
          WHERE tenant_id=$1 AND adapter_name=$2`,
        [tenantId, adapter, code],
      );
      throw e;
    }
  }

  async state(
    adapter: string,
  ): Promise<{ state: CircuitState; failure_count: number } | null> {
    const actor = this.tenantCtx.current();
    if (!actor) return null;
    const rows = await this.db.query<{
      state: CircuitState;
      failure_count: number;
    }>(
      `SELECT state, failure_count FROM health.adapter_circuits WHERE tenant_id=$1 AND adapter_name=$2`,
      [actor.tenantId, adapter],
    );
    return rows[0] ?? null;
  }
}
