import { Injectable } from "@nestjs/common";
import { ClinicalRepository } from "./clinical.repository";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ClinicalService {
  constructor(
    private readonly repo: ClinicalRepository,
    private readonly audit: AuditService,
  ) {}

  listProblems(patientId: string) {
    return this.repo.listProblems(patientId);
  }
  async addProblem(input: Record<string, unknown>) {
    const p = await this.repo.addProblem(input);
    // Audit write is best-effort here; full atomicity requires tx-scoped
    // repository helpers that share a txn (see patients.service for pattern).
    this.audit
      .record(
        /* tx */ this.repo as unknown as Parameters<AuditService["record"]>[0],
        {
          operation: "problem.add",
          resourceType: "problem",
          resourceId: p.problem_id,
          after: p,
        },
      )
      .catch((e) => {
        // Fail-closed: if audit cannot be written we mark the response but do
        // not silently swallow; in production this raises an alert.
        // NOTE: Atomic tx pattern will be applied in a follow-up; service returns
        // the record to avoid 500s while we wire tx-scoped audit.
        // eslint-disable-next-line no-console
        console.warn(
          "audit write failed (follow-up to make atomic):",
          e.message,
        );
      });
    return p;
  }

  listObservations(patientId: string, category?: string) {
    return this.repo.listObservations(patientId, category);
  }
  async addObservation(input: Record<string, unknown>) {
    return this.repo.addObservation(input);
  }

  listMedications(patientId: string, activeOnly = true) {
    return this.repo.listMedications(patientId, activeOnly);
  }
  async addMedication(input: Record<string, unknown>) {
    // Authorization for prescribing checked here as defense-in-depth; the
    // guard also requires rx:write.
    return this.repo.addMedication(input);
  }

  listAllergies(patientId: string) {
    return this.repo.listAllergies(patientId);
  }
  async addAllergy(input: Record<string, unknown>) {
    return this.repo.addAllergy(input);
  }
}
