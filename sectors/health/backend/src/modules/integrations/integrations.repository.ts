import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";
type Tx = DbConnection;
@Injectable()
export class IntegrationsRepository extends BaseRepository {
  getStatus(provider: string) {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.integration_status WHERE tenant_id=$1 AND provider=$2`,
        [this.tenantContext.tenantId(), provider],
      ),
    ).then((r: any[]) => r[0] ?? null);
  }
  listStatuses() {
    return this.withIsolation((tx) =>
      tx.query(`SELECT * FROM health.integration_status WHERE tenant_id=$1`, [
        this.tenantContext.tenantId(),
      ]),
    );
  }
  setStatus(
    provider: string,
    state: string,
    lastError?: string | null,
    tx?: any,
  ) {
    const sql = `INSERT INTO health.integration_status (tenant_id, provider, state, last_error, last_checked_at)
                 VALUES ($1,$2,$3,$4,now())
                 ON CONFLICT (tenant_id, provider) DO UPDATE
                   SET state=EXCLUDED.state, last_error=EXCLUDED.last_error, last_checked_at=now(), updated_at=now()
                 RETURNING *`;
    const params = [
      this.tenantContext.tenantId(),
      provider,
      state,
      lastError ?? null,
    ];
    const q = (c: Tx) => c.query(sql, params).then((r: any[]) => r[0]);
    return tx ? q(tx) : this.withIsolation(q);
  }
  recordSuccess(provider: string) {
    return this.setStatus(provider, "available", null);
  }
  recordFailure(provider: string, err: string) {
    return this.setStatus(provider, "failed", err);
  }
  markConfigured(provider: string) {
    return this.setStatus(provider, "configured");
  }
}
