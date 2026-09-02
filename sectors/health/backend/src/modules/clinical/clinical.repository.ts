import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";

export interface Problem extends Record<string, unknown> {
  problem_id: string;
  patient_id: string;
  encounter_id: string | null;
  code_system: string;
  code: string | null;
  description: string;
  status: string;
  onset_date: string | null;
  resolved_date: string | null;
  severity: string | null;
  note: string | null;
  parent_id: string | null;
  signed_by: string | null;
  signed_at: Date | null;
}

export interface Observation extends Record<string, unknown> {
  observation_id: string;
  patient_id: string;
  encounter_id: string | null;
  code_system: string;
  code: string;
  display: string | null;
  value_numeric: string | null;
  value_text: string | null;
  value_units: string | null;
  abnormal_flag: string | null;
  observed_at: Date;
  category: string;
}

export interface Medication extends Record<string, unknown> {
  medication_id: string;
  patient_id: string;
  encounter_id: string | null;
  name: string;
  dose: string;
  route: string | null;
  frequency: string | null;
  status: string;
  prescribed_at: Date;
  signed_by: string | null;
}

export interface Allergy extends Record<string, unknown> {
  allergy_id: string;
  patient_id: string;
  substance_name: string;
  category: string;
  severity: string;
  reaction: string | null;
  status: string;
}

@Injectable()
export class ClinicalRepository extends BaseRepository {
  // ── Problems ──────────────────────────────────────────────────────────────
  listProblems(patientId: string) {
    return this.withIsolation((tx) =>
      tx.query<Problem>(
        `SELECT * FROM health.problems
          WHERE patient_id=$1 AND ${this.notVoided("health.problems")}
          ORDER BY COALESCE(onset_date, created_at::date) DESC`,
        [patientId],
      ),
    );
  }
  addProblem(input: Record<string, unknown>) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return this.withIsolation((tx) =>
      tx.query<Problem>(
        `INSERT INTO health.problems
           (tenant_id, patient_id, encounter_id, code_system, code, description,
            status, onset_date, severity, note, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$10,$11) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.patient_id,
          input.encounter_id ?? null,
          input.code_system ?? "ICD-10",
          input.code ?? null,
          input.description,
          input.onset_date ?? null,
          input.severity ?? null,
          input.note ?? null,
          actor,
          cid,
        ],
      ),
    ).then((r) => r[0]);
  }

  // ── Observations / Vitals ─────────────────────────────────────────────────
  listObservations(patientId: string, category?: string) {
    return this.withIsolation((tx) =>
      category
        ? tx.query<Observation>(
            `SELECT * FROM health.observations
              WHERE patient_id=$1 AND category=$2 AND ${this.notVoided("health.observations")}
              ORDER BY observed_at DESC LIMIT 200`,
            [patientId, category],
          )
        : tx.query<Observation>(
            `SELECT * FROM health.observations
              WHERE patient_id=$1 AND ${this.notVoided("health.observations")}
              ORDER BY observed_at DESC LIMIT 200`,
            [patientId],
          ),
    );
  }
  addObservation(input: Record<string, unknown>) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return this.withIsolation((tx) =>
      tx.query<Observation>(
        `INSERT INTO health.observations
           (tenant_id, patient_id, encounter_id, code_system, code, display,
            value_numeric, value_text, value_units, abnormal_flag,
            category, note, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.patient_id,
          input.encounter_id ?? null,
          input.code_system ?? "LOINC",
          input.code,
          input.display ?? null,
          input.value_numeric ?? null,
          input.value_text ?? null,
          input.value_units ?? null,
          input.abnormal_flag ?? null,
          input.category ?? "vital-signs",
          input.note ?? null,
          actor,
          cid,
        ],
      ),
    ).then((r) => r[0]);
  }

  // ── Medications ───────────────────────────────────────────────────────────
  listMedications(patientId: string, activeOnly = true) {
    return this.withIsolation((tx) =>
      tx.query<Medication>(
        `SELECT * FROM health.medications
          WHERE patient_id=$1
            AND ${this.notVoided("health.medications")}
            AND ($2::boolean = false OR status='active')
          ORDER BY prescribed_at DESC`,
        [patientId, activeOnly],
      ),
    );
  }
  addMedication(input: Record<string, unknown>) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return this.withIsolation((tx) =>
      tx.query<Medication>(
        `INSERT INTO health.medications
           (tenant_id, patient_id, encounter_id, code_system, code, name,
            dose, route, frequency, duration, quantity, refills, prn,
            instructions, status, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',$15,$15,$16)
         RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.patient_id,
          input.encounter_id ?? null,
          input.code_system ?? "RXNORM",
          input.code ?? null,
          input.name,
          input.dose,
          input.route ?? null,
          input.frequency ?? null,
          input.duration ?? null,
          input.quantity ?? null,
          input.refills ?? 0,
          input.prn ?? false,
          input.instructions ?? null,
          actor,
          cid,
        ],
      ),
    ).then((r) => r[0]);
  }

  // ── Allergies ─────────────────────────────────────────────────────────────
  listAllergies(patientId: string) {
    return this.withIsolation((tx) =>
      tx.query<Allergy>(
        `SELECT * FROM health.allergies
          WHERE patient_id=$1 AND ${this.notVoided("health.allergies")}
          ORDER BY severity, substance_name`,
        [patientId],
      ),
    );
  }
  addAllergy(input: Record<string, unknown>) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return this.withIsolation((tx) =>
      tx.query<Allergy>(
        `INSERT INTO health.allergies
           (tenant_id, patient_id, encounter_id, substance_code_system,
            substance_code, substance_name, category, severity, reaction,
            status, note, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$11,$12) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.patient_id,
          input.encounter_id ?? null,
          input.substance_code_system ?? "RXNORM",
          input.substance_code ?? null,
          input.substance_name,
          input.category ?? "medication",
          input.severity ?? "mild",
          input.reaction ?? null,
          input.note ?? null,
          actor,
          cid,
        ],
      ),
    ).then((r) => r[0]);
  }
}
