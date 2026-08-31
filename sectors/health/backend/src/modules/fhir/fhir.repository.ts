import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";

/**
 * FHIR persistence is NOT a separate table — we map FHIR resources directly
 * to/from the native health.* tables. This repository exposes thin lookups.
 */
@Injectable()
export class FhirRepository extends BaseRepository {
  getPatient(pid: string) {
    return this.withIsolation((tx) =>
      tx.query(`SELECT * FROM health.patients WHERE patient_id=$1 AND ${this.notVoided("health.patients")}`, [pid]).then((r) => r[0] ?? null),
    );
  }
  getEncounter(eid: string) {
    return this.withIsolation((tx) => tx.query(`SELECT * FROM health.encounters WHERE encounter_id=$1 AND ${this.notVoided("health.encounters")}`, [eid]).then((r) => r[0] ?? null));
  }
  listPatientConditions(pid: string) {
    return this.withIsolation((tx) => tx.query(`SELECT * FROM health.problems WHERE patient_id=$1 AND ${this.notVoided("health.problems")}`, [pid]));
  }
  listPatientObservations(pid: string) {
    return this.withIsolation((tx) => tx.query(`SELECT * FROM health.observations WHERE patient_id=$1 AND ${this.notVoided("health.observations")} ORDER BY observed_at DESC`, [pid]));
  }
  listPatientMedicationRequests(pid: string) {
    return this.withIsolation((tx) => tx.query(`SELECT * FROM health.medications WHERE patient_id=$1 AND ${this.notVoided("health.medications")}`, [pid]));
  }
  listPatientAllergies(pid: string) {
    return this.withIsolation((tx) => tx.query(`SELECT * FROM health.allergies WHERE patient_id=$1 AND ${this.notVoided("health.allergies")}`, [pid]));
  }
  listAppointments(date: string) {
    return this.withIsolation((tx) => tx.query(
      `SELECT * FROM health.appointments WHERE scheduled_for::date=$1::date AND ${this.notVoided("health.appointments")} ORDER BY scheduled_for`,
      [date],
    ));
  }
}
