import { Injectable } from "@nestjs/common";
import {
  EncounterRepository,
  Encounter,
  CreateEncounterInput,
} from "./encounter.repository";
import { DomainError } from "../../common/errors/domain.error";

@Injectable()
export class EncountersService {
  constructor(private readonly repo: EncounterRepository) {}

  async get(id: string): Promise<Encounter> {
    const e = await this.repo.findById(id);
    if (!e) throw DomainError.notFound("Encounter", id);
    return e;
  }

  async forPatient(patientId: string): Promise<Encounter[]> {
    return this.repo.listForPatient(patientId);
  }

  async start(input: CreateEncounterInput): Promise<Encounter> {
    // If started from an appointment, ensure no other active encounter exists
    // for that appointment.
    if (input.appointment_id) {
      const active = await this.repo.findActiveByAppointment(
        input.appointment_id,
      );
      if (active) {
        throw DomainError.conflict(
          "An active encounter already exists for this appointment",
        );
      }
    }
    return this.repo.create(input);
  }

  async complete(
    id: string,
    disposition: string,
    presentIllness?: string,
  ): Promise<Encounter> {
    const e = await this.get(id);
    if (e.status !== "in_progress") {
      throw DomainError.invalidState(
        `Cannot complete encounter in status ${e.status}`,
      );
    }
    const allowed = [
      "discharged",
      "admitted",
      "referred",
      "died",
      "absconded",
      "ama",
    ];
    if (!allowed.includes(disposition)) {
      throw DomainError.validation(
        `disposition must be one of: ${allowed.join(",")}`,
      );
    }
    return this.repo.complete(id, disposition, presentIllness);
  }

  async cancel(id: string): Promise<Encounter> {
    const e = await this.get(id);
    if (e.status !== "in_progress" && e.status !== "checked_in") {
      throw DomainError.invalidState(
        `Cannot cancel encounter in status ${e.status}`,
      );
    }
    return this.repo.cancel(id);
  }
}
