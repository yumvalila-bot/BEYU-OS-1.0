import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";

export interface Encounter extends Record<string, unknown> {
  encounter_id: string;
  tenant_id: string;
  entity_code: string | null;
  country_code: string | null;
  encounter_no: string;
  patient_id: string;
  appointment_id: string | null;
  provider_id: string | null;
  department_id: string | null;
  kind: string;
  status: string;
  chief_complaint: string | null;
  present_illness: string | null;
  triage_level: string | null;
  started_at: Date;
  ended_at: Date | null;
  disposition: string | null;
  created_by: string | null;
  updated_by: string | null;
  correlation_id: string | null;
  created_at: Date;
  updated_at: Date;
  voided_at: Date | null;
  voided_by: string | null;
}

export interface CreateEncounterInput {
  patient_id: string;
  appointment_id?: string;
  provider_id?: string;
  department_id?: string;
  kind?: "ambulatory" | "inpatient" | "emergency" | "teleconsult" | "domiciliary";
  chief_complaint?: string;
  triage_level?: "red" | "orange" | "yellow" | "green" | "blue";
}

function nextEncounterNo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 36 ** 3).toString(36).toUpperCase().padStart(3, "0");
  return `ENC-${ts}-${rand}`;
}

@Injectable()
export class EncounterRepository extends BaseRepository {
  async findById(id: string): Promise<Encounter | null> {
    const rows = await this.withIsolation((tx) =>
      tx.query<Encounter>(
        `SELECT * FROM health.encounters WHERE encounter_id = $1 AND ${this.notVoided("health.encounters")}`,
        [id],
      ),
    );
    return rows[0] ?? null;
  }

  async listForPatient(patientId: string): Promise<Encounter[]> {
    return this.withIsolation((tx) =>
      tx.query<Encounter>(
        `SELECT * FROM health.encounters
          WHERE patient_id = $1 AND ${this.notVoided("health.encounters")}
          ORDER BY started_at DESC`,
        [patientId],
      ),
    );
  }

  async findActiveByAppointment(appointmentId: string): Promise<Encounter | null> {
    const rows = await this.withIsolation((tx) =>
      tx.query<Encounter>(
        `SELECT * FROM health.encounters
          WHERE appointment_id = $1
            AND status IN ('checked_in','in_progress')
            AND ${this.notVoided("health.encounters")}
          ORDER BY started_at DESC LIMIT 1`,
        [appointmentId],
      ),
    );
    return rows[0] ?? null;
  }

  async create(input: CreateEncounterInput): Promise<Encounter> {
    const actor = this.actorId();
    const cid = this.correlationId();
    const tenantId = this.tenantContext.tenantId();
    const rows = await this.withIsolation((tx) =>
      tx.query<Encounter>(
        `INSERT INTO health.encounters (
            tenant_id, encounter_no, patient_id, appointment_id, provider_id, department_id,
            kind, chief_complaint, triage_level, status,
            created_by, updated_by, correlation_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'in_progress',$10,$10,$11)
         RETURNING *`,
        [
          tenantId,
          nextEncounterNo(),
          input.patient_id,
          input.appointment_id ?? null,
          input.provider_id ?? null,
          input.department_id ?? null,
          input.kind ?? "ambulatory",
          input.chief_complaint ?? null,
          input.triage_level ?? null,
          actor,
          cid,
        ],
      ),
    );
    return rows[0];
  }

  async complete(id: string, disposition: string, presentIllness?: string): Promise<Encounter> {
    const actor = this.actorId();
    const cid = this.correlationId();
    const rows = await this.withIsolation((tx) =>
      tx.query<Encounter>(
        `UPDATE health.encounters
            SET status='completed',
                ended_at=now(),
                disposition=$2,
                present_illness=COALESCE($3, present_illness),
                updated_by=$4,
                correlation_id=$5
          WHERE encounter_id=$1 AND ${this.notVoided("health.encounters")}
          RETURNING *`,
        [id, disposition, presentIllness ?? null, actor, cid],
      ),
    );
    if (!rows[0]) throw new Error("ENCOUNTER_NOT_FOUND");
    return rows[0];
  }

  async cancel(id: string): Promise<Encounter> {
    const actor = this.actorId();
    const cid = this.correlationId();
    const rows = await this.withIsolation((tx) =>
      tx.query<Encounter>(
        `UPDATE health.encounters
            SET status='cancelled',
                ended_at=now(),
                updated_by=$2,
                correlation_id=$3
          WHERE encounter_id=$1 AND ${this.notVoided("health.encounters")}
          RETURNING *`,
        [id, actor, cid],
      ),
    );
    if (!rows[0]) throw new Error("ENCOUNTER_NOT_FOUND");
    return rows[0];
  }
}
