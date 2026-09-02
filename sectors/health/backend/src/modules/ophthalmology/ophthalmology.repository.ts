import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";
type Tx = DbConnection;
@Injectable()
export class OphthalmologyRepository extends BaseRepository {
  addExam(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `INSERT INTO health.eye_exams
        (tenant_id,patient_id,encounter_id,exam_date,provider_id,va_od,va_os,va_ou,va_pinhole_od,va_pinhole_os,
         refraction_od,refraction_os,iop_od,iop_os,slit_lamp_od,slit_lamp_os,fundus_od,fundus_os,
         diagnosis_od,diagnosis_os,diagnosis_ou,plan,follow_up_date,laterality_focus,notes,
         created_by,updated_by,correlation_id)
       VALUES ($1,$2,$3,COALESCE($4,current_date),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$26,$27) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.patient_id,
          input.encounter_id ?? null,
          input.exam_date ?? null,
          input.provider_id ?? null,
          input.va_od ?? null,
          input.va_os ?? null,
          input.va_ou ?? null,
          input.va_pinhole_od ?? null,
          input.va_pinhole_os ?? null,
          input.refraction_od ?? null,
          input.refraction_os ?? null,
          input.iop_od ?? null,
          input.iop_os ?? null,
          input.slit_lamp_od ?? null,
          input.slit_lamp_os ?? null,
          input.fundus_od ?? null,
          input.fundus_os ?? null,
          input.diagnosis_od ?? null,
          input.diagnosis_os ?? null,
          input.diagnosis_ou ?? null,
          input.plan ?? null,
          input.follow_up_date ?? null,
          input.laterality_focus ?? null,
          input.notes ?? null,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  listForPatient(pid: string) {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.eye_exams WHERE patient_id=$1 AND ${this.notVoided("health.eye_exams")} ORDER BY exam_date DESC`,
        [pid],
      ),
    );
  }
  sign(id: string, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `UPDATE health.eye_exams SET signed_by=$2,signed_at=now(),updated_by=$2,correlation_id=$3
        WHERE exam_id=$1 AND signed_at IS NULL AND ${this.notVoided("health.eye_exams")} RETURNING *`,
        [id, actor, cid],
      )
      .then((r: any[]) => r[0] ?? null);
  }
  find(id: string, tx?: Tx) {
    const q = (c: Tx) =>
      c
        .query(
          `SELECT * FROM health.eye_exams WHERE exam_id=$1 AND ${this.notVoided("health.eye_exams")}`,
          [id],
        )
        .then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
}
