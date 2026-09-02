import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";
type Tx = DbConnection;

export interface Appointment extends Record<string, unknown> {
  appointment_id: string;
  tenant_id: string;
  entity_code: string | null;
  country_code: string | null;
  patient_id: string;
  department_id: string | null;
  provider_id: string | null;
  appointment_no: string;
  kind: string;
  status: string;
  scheduled_for: Date;
  duration_min: number;
  reason: string | null;
  notes: string | null;
  checked_in_at: Date | null;
  started_at: Date | null;
  ended_at: Date | null;
  cancelled_at: Date | null;
  no_show_at: Date | null;
  idempotency_key: string | null;
  created_by: string | null;
  updated_by: string | null;
  correlation_id: string | null;
  created_at: Date;
  updated_at: Date;
  voided_at: Date | null;
  voided_by: string | null;
}

export interface CreateAppointmentInput {
  patient_id: string;
  provider_id?: string;
  department_id?: string;
  kind?: "outpatient" | "inpatient" | "followup" | "emergency" | "teleconsult";
  scheduled_for: string;
  duration_min?: number;
  reason?: string;
  notes?: string;
  idempotency_key?: string;
}

/** Generate a short human-readable appointment number (tenant-local). */
function nextAppointmentNo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 36 ** 3)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `APT-${ts}-${rand}`;
}

@Injectable()
export class AppointmentRepository extends BaseRepository {
  /** Expose helpers needed by the service for tx-scoped operations. */
  readonly notVoided = (t: string) => `${t}.voided_at IS NULL`;
  readonly getActorId = () => this.actorId();
  readonly getCorrelationId = () => this.correlationId();

  async findById(id: string): Promise<Appointment | null> {
    const rows = await this.withIsolation((tx) =>
      tx.query<Appointment>(
        `SELECT * FROM health.appointments WHERE appointment_id = $1 AND ${this.notVoided("health.appointments")}`,
        [id],
      ),
    );
    return rows[0] ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<Appointment | null> {
    if (!key) return null;
    const rows = await this.withIsolation((tx) =>
      tx.query<Appointment>(
        `SELECT * FROM health.appointments WHERE idempotency_key = $1 AND ${this.notVoided("health.appointments")}`,
        [key],
      ),
    );
    return rows[0] ?? null;
  }

  async listForDate(date: string, providerId?: string): Promise<Appointment[]> {
    return this.withIsolation((tx) => {
      if (providerId) {
        return tx.query<Appointment>(
          `SELECT * FROM health.appointments
            WHERE ${this.notVoided("health.appointments")}
              AND scheduled_for::date = $1::date
              AND provider_id = $2
            ORDER BY scheduled_for`,
          [date, providerId],
        );
      }
      return tx.query<Appointment>(
        `SELECT * FROM health.appointments
          WHERE ${this.notVoided("health.appointments")}
            AND scheduled_for::date = $1::date
          ORDER BY scheduled_for`,
        [date],
      );
    });
  }

  async overlappingCount(
    providerId: string,
    when: string,
    durationMin: number,
    tx?: Tx,
  ): Promise<number> {
    const sql = `SELECT count(*)::int AS n FROM health.appointments
          WHERE ${this.notVoided("health.appointments")}
            AND provider_id = $1
            AND status IN ('scheduled','checked_in','in_progress')
            AND tstzrange(scheduled_for, scheduled_for + make_interval(mins => duration_min), '[)')
                && tstzrange($2::timestamptz, $2::timestamptz + make_interval(mins => $3::int), '[)')`;
    const q = (c: Tx) =>
      c
        .query<{ n: number }>(sql, [providerId, when, durationMin])
        .then((r: any[]) => Number(r[0]?.n ?? 0));
    return tx ? q(tx) : this.withIsolation(q);
  }

  async create(input: CreateAppointmentInput, tx?: Tx): Promise<Appointment> {
    const actor = this.actorId();
    const cid = this.correlationId();
    const tenantId = this.tenantContext.tenantId();
    const sql = `INSERT INTO health.appointments (
            tenant_id, patient_id, provider_id, department_id, appointment_no, kind,
            scheduled_for, duration_min, reason, notes, idempotency_key,
            created_by, updated_by, correlation_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13) RETURNING *`;
    const params = [
      tenantId,
      input.patient_id,
      input.provider_id ?? null,
      input.department_id ?? null,
      nextAppointmentNo(),
      input.kind ?? "followup",
      input.scheduled_for,
      input.duration_min ?? 15,
      input.reason ?? null,
      input.notes ?? null,
      input.idempotency_key ?? null,
      actor,
      cid,
    ];
    const q = (c: Tx) =>
      c.query<Appointment>(sql, params).then((r: any[]) => r[0]);
    return tx ? q(tx) : this.withIsolation(q);
  }

  async transition(
    id: string,
    to: string,
    stampColumn?: string,
  ): Promise<Appointment> {
    const actor = this.actorId();
    const cid = this.correlationId();
    const setClause = stampColumn
      ? `status=$2, ${stampColumn}=now(), updated_by=$3, correlation_id=$4`
      : `status=$2, updated_by=$3, correlation_id=$4`;
    const rows = await this.withIsolation((tx) =>
      tx.query<Appointment>(
        `UPDATE health.appointments
            SET ${setClause}
          WHERE appointment_id=$1
            AND ${this.notVoided("health.appointments")}
          RETURNING *`,
        stampColumn ? [id, to, actor, cid] : [id, to, actor, cid],
      ),
    );
    if (!rows[0]) {
      throw new Error("APPOINTMENT_NOT_FOUND");
    }
    return rows[0];
  }
}
