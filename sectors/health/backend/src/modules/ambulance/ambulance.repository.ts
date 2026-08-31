import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";
type Tx = DbConnection;
@Injectable()
export class AmbulanceRepository extends BaseRepository {
  registerVehicle(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx.query(
      `INSERT INTO health.vehicles (tenant_id, plate, call_sign, type, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$5,$6) RETURNING *`,
      [this.tenantContext.tenantId(), input.plate, input.call_sign ?? null, input.type ?? "ambulance", actor, cid],
    ).then((r: any[]) => r[0]);
  }
  listVehicles() {
    return this.withIsolation((tx) => tx.query(`SELECT * FROM health.vehicles WHERE ${this.notVoided("health.vehicles")} ORDER BY plate`));
  }
  createRequest(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const no = "AMB-" + Date.now().toString(36).toUpperCase();
    return tx.query(
      `INSERT INTO health.ambulance_requests
        (tenant_id, request_no, patient_id, caller_name, caller_phone, pickup_location, pickup_lat, pickup_lng,
         destination, priority, chief_complaint, idempotency_key, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14) RETURNING *`,
      [this.tenantContext.tenantId(), no, input.patient_id ?? null, input.caller_name ?? null, input.caller_phone ?? null,
        input.pickup_location, input.pickup_lat ?? null, input.pickup_lng ?? null,
        input.destination ?? null, input.priority ?? "urgent", input.chief_complaint ?? null,
        input.idempotency_key ?? null, actor, cid],
    ).then((r: any[]) => r[0]);
  }
  findByIdempotency(key: string) {
    if (!key) return Promise.resolve(null);
    return this.withIsolation((tx) => tx.query(
      `SELECT * FROM health.ambulance_requests WHERE idempotency_key=$1 AND tenant_id=$2 AND ${this.notVoided("health.ambulance_requests")}`,
      [key, this.tenantContext.tenantId()],
    )).then((r: any[]) => r[0] ?? null);
  }
  findRequest(id: string, tx?: Tx) {
    const q = (c: Tx) => c.query(`SELECT * FROM health.ambulance_requests WHERE request_id=$1 AND ${this.notVoided("health.ambulance_requests")}`, [id]).then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  updateRequest(id: string, patch: Record<string, unknown>, tx: Tx) {
    // Build UPDATE dynamically from patch (whitelist).
    const allowed = ["vehicle_id", "crew_ids", "status", "dispatched_at", "arrived_at",
      "departed_scene_at", "delivered_at", "cancelled_at", "cancel_reason", "handoff_notes"];
    const sets: string[] = [];
    const params: any[] = [id];
    let i = 2;
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        sets.push(`${k}=$${i++}`);
        params.push(patch[k] === null ? null : patch[k]);
      }
    }
    sets.push("updated_by=$" + i++);
    params.push(this.actorId());
    sets.push("correlation_id=$" + i++);
    params.push(this.correlationId());
    return tx.query(`UPDATE health.ambulance_requests SET ${sets.join(",")} WHERE request_id=$1 AND ${this.notVoided("health.ambulance_requests")} RETURNING *`, params).then((r: any[]) => r[0] ?? null);
  }
}
