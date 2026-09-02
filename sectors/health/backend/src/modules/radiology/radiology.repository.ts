import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";

type Tx = DbConnection;

@Injectable()
export class RadiologyRepository extends BaseRepository {
  createOrder(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const no = "IMG-" + Date.now().toString(36).toUpperCase();
    return tx
      .query(
        `INSERT INTO health.imaging_orders
         (tenant_id, order_no, patient_id, encounter_id, provider_id, modality, body_part, laterality,
          clinical_indication, contrast, urgency, idempotency_key, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'routine',$11,$12,$12,$13) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          no,
          input.patient_id,
          input.encounter_id ?? null,
          input.provider_id ?? null,
          input.modality,
          input.body_part,
          input.laterality ?? null,
          input.clinical_indication ?? null,
          input.contrast ?? false,
          input.idempotency_key ?? null,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  findByIdempotency(key: string) {
    if (!key) return Promise.resolve(null);
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.imaging_orders WHERE idempotency_key=$1 AND tenant_id=$2 AND ${this.notVoided("health.imaging_orders")}`,
        [key, this.tenantContext.tenantId()],
      ),
    ).then((r: any[]) => r[0] ?? null);
  }
  findOrder(id: string, tx?: Tx) {
    const q = (c: Tx) =>
      c
        .query(
          `SELECT * FROM health.imaging_orders WHERE imaging_order_id=$1 AND ${this.notVoided("health.imaging_orders")}`,
          [id],
        )
        .then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  transitionOrder(id: string, to: string, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const stamp =
      to === "scheduled"
        ? "scheduled_at"
        : to === "final"
          ? "completed_at"
          : null;
    const set = stamp
      ? `status=$2, ${stamp}=now(), updated_by=$3, correlation_id=$4`
      : `status=$2, updated_by=$3, correlation_id=$4`;
    return tx
      .query(
        `UPDATE health.imaging_orders SET ${set} WHERE imaging_order_id=$1 AND ${this.notVoided("health.imaging_orders")} RETURNING *`,
        [id, to, actor, cid],
      )
      .then((r: any[]) => r[0] ?? null);
  }
  addReport(
    input: { imaging_order_id: string; findings: string; impression?: string },
    tx: Tx,
  ) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `INSERT INTO health.imaging_reports (tenant_id, imaging_order_id, findings, impression, status, reported_by, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,'preliminary',$5,$6,$6,$7) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.imaging_order_id,
          input.findings,
          input.impression ?? null,
          actor,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  verifyReport(reportId: string, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `UPDATE health.imaging_reports SET status='final', verified_by=$2, verified_at=now(), updated_by=$2, correlation_id=$3
        WHERE report_id=$1 AND ${this.notVoided("health.imaging_reports")} AND verified_at IS NULL
        RETURNING *`,
        [reportId, actor, cid],
      )
      .then((r: any[]) => r[0] ?? null);
  }
  listForPatient(patientId: string) {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT o.*, r.report_id, r.status AS report_status, r.findings
         FROM health.imaging_orders o
         LEFT JOIN health.imaging_reports r ON r.imaging_order_id=o.imaging_order_id AND r.status='final' AND r.voided_at IS NULL
        WHERE o.patient_id=$1 AND ${this.notVoided("o")} ORDER BY o.created_at DESC`,
        [patientId],
      ),
    );
  }
}
