import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";

export interface Patient extends Record<string, unknown> {
  patient_id: string;
  tenant_id: string;
  entity_code: string | null;
  country_code: string | null;
  medical_record: string;
  title: string | null;
  given_name: string;
  middle_name: string | null;
  family_name: string;
  dob: string | null;
  sex: string;
  gender_identity: string | null;
  marital_status: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relation: string | null;
  blood_type: string | null;
  allergies_known: boolean;
  notes: string | null;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  correlation_id: string | null;
  created_at: Date;
  updated_at: Date;
  voided_at: Date | null;
  voided_by: string | null;
}

export interface CreatePatientInput {
  medical_record: string;
  title?: string;
  given_name: string;
  middle_name?: string;
  family_name: string;
  dob?: string;
  sex?: "male" | "female" | "other" | "unknown";
  phone?: string;
  email?: string;
  address_line?: string;
  city?: string;
  region?: string;
  nationality?: string;
  id_type?: string;
  id_number?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  next_of_kin_relation?: string;
  blood_type?: string;
  allergies_known?: boolean;
  notes?: string;
}

@Injectable()
export class PatientRepository extends BaseRepository {
  async list(
    opts: { limit?: number; offset?: number; q?: string } = {},
  ): Promise<Patient[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const q = opts.q?.trim();
    return this.withIsolation(async (tx) => {
      if (q) {
        const like = `%${q}%`;
        return tx.query<Patient>(
          `SELECT * FROM health.patients
            WHERE ${this.notVoided("health.patients")}
              AND (family_name ILIKE $1 OR given_name ILIKE $1 OR medical_record ILIKE $1 OR phone ILIKE $1)
            ORDER BY family_name, given_name
            LIMIT ${limit} OFFSET ${offset}`,
          [like],
        );
      }
      return tx.query<Patient>(
        `SELECT * FROM health.patients
          WHERE ${this.notVoided("health.patients")}
          ORDER BY family_name, given_name
          LIMIT ${limit} OFFSET ${offset}`,
      );
    });
  }

  async findById(patientId: string): Promise<Patient | null> {
    const rows = await this.withIsolation((tx) =>
      tx.query<Patient>(
        `SELECT * FROM health.patients WHERE patient_id = $1 AND ${this.notVoided("health.patients")}`,
        [patientId],
      ),
    );
    return rows[0] ?? null;
  }

  async findByMrn(mrn: string): Promise<Patient | null> {
    const rows = await this.withIsolation((tx) =>
      tx.query<Patient>(
        `SELECT * FROM health.patients WHERE medical_record = $1 AND ${this.notVoided("health.patients")}`,
        [mrn],
      ),
    );
    return rows[0] ?? null;
  }

  async create(
    input: CreatePatientInput,
    txOverride?: { exec: DbConnection["exec"]; query: DbConnection["query"] },
  ): Promise<Patient> {
    const actor = this.actorId();
    const cid = this.correlationId();
    const tenantId = this.tenantContext.tenantId();
    const params = [
      tenantId,
      input.medical_record,
      input.title ?? null,
      input.given_name,
      input.middle_name ?? null,
      input.family_name,
      input.dob ?? null,
      input.sex ?? "unknown",
      input.phone ?? null,
      input.email ?? null,
      input.address_line ?? null,
      input.city ?? null,
      input.region ?? null,
      input.nationality ?? null,
      input.id_type ?? null,
      input.id_number ?? null,
      input.next_of_kin_name ?? null,
      input.next_of_kin_phone ?? null,
      input.next_of_kin_relation ?? null,
      input.blood_type ?? null,
      input.allergies_known ?? false,
      input.notes ?? null,
      actor,
      cid,
    ] as const;
    const sql = `INSERT INTO health.patients (
            tenant_id, medical_record, title, given_name, middle_name, family_name, dob, sex,
            phone, email, address_line, city, region, nationality, id_type, id_number,
            next_of_kin_name, next_of_kin_phone, next_of_kin_relation, blood_type,
            allergies_known, notes, created_by, updated_by, correlation_id
         ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23,$24
         ) RETURNING *`;
    const rows = txOverride
      ? await txOverride.query<Patient>(sql, [...params])
      : await this.withIsolation((tx) => tx.query<Patient>(sql, [...params]));
    return rows[0];
  }

  async findByMrnIn(mrn: string, tx: DbConnection): Promise<Patient | null> {
    const rows = await tx.query<Patient>(
      `SELECT * FROM health.patients WHERE medical_record = $1 AND ${this.notVoided("health.patients")}`,
      [mrn],
    );
    return rows[0] ?? null;
  }
}
