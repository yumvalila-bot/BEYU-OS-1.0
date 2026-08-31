import { Injectable } from "@nestjs/common";
import { AppointmentRepository, Appointment, CreateAppointmentInput } from "./appointment.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";

const TRANSITIONS: Record<string, Set<string>> = {
  scheduled:   new Set(["checked_in", "cancelled", "no_show", "rescheduled"]),
  rescheduled: new Set(["checked_in", "cancelled", "no_show"]),
  checked_in:  new Set(["in_progress", "cancelled", "no_show"]),
  in_progress: new Set(["completed"]),
  completed:   new Set<string>(),
  cancelled:   new Set<string>(),
  no_show:     new Set<string>(),
};
const STAMP: Record<string, string> = {
  checked_in: "checked_in_at",
  in_progress: "started_at",
  completed: "ended_at",
  cancelled: "cancelled_at",
  no_show: "no_show_at",
};

@Injectable()
export class AppointmentsService {
  constructor(private readonly repo: AppointmentRepository, private readonly audit: AuditService) {}

  async get(id: string): Promise<Appointment> {
    const a = await this.repo.findById(id);
    if (!a) throw DomainError.notFound("Appointment", id);
    return a;
  }

  list(date: string, providerId?: string): Promise<Appointment[]> {
    return this.repo.listForDate(date, providerId);
  }

  async create(input: CreateAppointmentInput): Promise<Appointment> {
    if (input.idempotency_key) {
      const existing = await this.repo.findByIdempotencyKey(input.idempotency_key);
      if (existing) return existing;
    }
    const dur = input.duration_min ?? 15;
    if (dur <= 0 || dur > 24 * 60) throw DomainError.validation("duration_min must be between 1 and 1440 minutes");
    if (!input.scheduled_for) throw DomainError.validation("scheduled_for is required");
    return this.repo.withIsolation(async (tx) => {
      if (input.provider_id) {
        const overlap = await this.repo.overlappingCount(input.provider_id, input.scheduled_for, dur, tx);
        if (overlap > 0) throw DomainError.conflict("Provider is already booked for the requested time window");
      }
      const a = await this.repo.create(input, tx);
      await this.audit.record(tx, { operation: "appointment.book", resourceType: "appointment", resourceId: a.appointment_id, after: a });
      return a;
    });
  }

  async transition(id: string, to: string): Promise<Appointment> {
    return this.repo.withIsolation(async (tx) => {
      // Need a fresh read inside tx for transition legality.
      const rows = await tx.query<Appointment>(
        `SELECT * FROM health.appointments WHERE appointment_id=$1 AND ${this.repo.notVoided("health.appointments")}`,
        [id],
      );
      const current = rows[0];
      if (!current) throw DomainError.notFound("Appointment", id);
      if (!TRANSITIONS[current.status]?.has(to)) throw DomainError.invalidState(`Cannot transition appointment from ${current.status} to ${to}`);
      const stamp = STAMP[to];
      const actor = this.repo.getActorId();
      const cid = this.repo.getCorrelationId();
      const setClause = stamp
        ? `status=$2, ${stamp}=now(), updated_by=$3, correlation_id=$4`
        : `status=$2, updated_by=$3, correlation_id=$4`;
      const upd = await tx.query<Appointment>(
        `UPDATE health.appointments SET ${setClause} WHERE appointment_id=$1 RETURNING *`,
        stamp ? [id, to, actor, cid] : [id, to, actor, cid],
      );
      const a = upd[0];
      await this.audit.record(tx, { operation: `appointment.${to}`, resourceType: "appointment", resourceId: id, metadata: { to, from: current.status } });
      return a;
    });
  }
}
