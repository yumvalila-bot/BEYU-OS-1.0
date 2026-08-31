import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
@Injectable()
export class SearchRepository extends BaseRepository {
  globalSearch(q: string, limit = 20) {
    const like = `%${q}%`;
    return this.withIsolation(async (tx) => {
      const patients = await tx.query(
        `SELECT 'patient' AS type, patient_id AS id, given_name || ' ' || family_name AS label, medical_record AS sub
           FROM health.patients
          WHERE ${this.notVoided("health.patients")}
            AND (family_name ILIKE $1 OR given_name ILIKE $1 OR medical_record ILIKE $1 OR phone ILIKE $1)
          LIMIT $2`,
        [like, limit],
      );
      return patients;
    });
  }
}
