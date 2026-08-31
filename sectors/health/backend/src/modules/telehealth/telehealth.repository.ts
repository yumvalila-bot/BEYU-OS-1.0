import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";
type Tx = DbConnection;
@Injectable()
export class TelehealthRepository extends BaseRepository {
  createSession(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx.query(
      `INSERT INTO health.telehealth_sessions
        (tenant_id, patient_id, encounter_id, provider_id, appointment_id, kind, consent_obtained, idempotency_key,
         created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10) RETURNING *`,
      [this.tenantContext.tenantId(), input.patient_id, input.encounter_id ?? null,
        input.provider_id ?? null, input.appointment_id ?? null,
        input.kind ?? "video", input.consent_obtained ?? false,
        input.idempotency_key ?? null, actor, cid],
    ).then((r: any[]) => r[0]);
  }
  findByIdempotency(key: string) {
    if (!key) return Promise.resolve(null);
    return this.withIsolation((tx) => tx.query(
      `SELECT * FROM health.telehealth_sessions WHERE idempotency_key=$1 AND tenant_id=$2 AND ${this.notVoided("health.telehealth_sessions")}`,
      [key, this.tenantContext.tenantId()],
    )).then((r: any[]) => r[0] ?? null);
  }
  findSession(id: string, tx?: Tx) {
    const q = (c: Tx) => c.query(`SELECT * FROM health.telehealth_sessions WHERE session_id=$1 AND ${this.notVoided("health.telehealth_sessions")}`, [id]).then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  updateSession(id: string, patch: Record<string, unknown>, tx: Tx) {
    const allowed = ["status","provider_token","patient_token","provider_url","patient_url","started_at","ended_at","duration_sec","notes"];
    const sets: string[] = [];
    const params: any[] = [id];
    let i = 2;
    for (const k of allowed) if (patch[k] !== undefined) { sets.push(`${k}=$${i++}`); params.push(patch[k] === null ? null : patch[k]); }
    sets.push("updated_by=$" + i++); params.push(this.actorId());
    sets.push("correlation_id=$" + i++); params.push(this.correlationId());
    return tx.query(`UPDATE health.telehealth_sessions SET ${sets.join(",")} WHERE session_id=$1 AND ${this.notVoided("health.telehealth_sessions")} RETURNING *`, params).then((r: any[]) => r[0] ?? null);
  }
}
