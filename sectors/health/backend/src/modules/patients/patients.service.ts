import { Injectable } from "@nestjs/common";
import { PatientRepository, Patient, CreatePatientInput } from "./patient.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { DbConnection } from "../identity/db-connection";
import { Inject } from "@nestjs/common";
import { DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { currentCorrelationId } from "../../common/observability/correlation-id.middleware";

@Injectable()
export class PatientsService {
  constructor(
    private readonly repo: PatientRepository,
    private readonly audit: AuditService,
    @Inject(DB_CONNECTION) private readonly db: DbConnection,
    private readonly tenantCtx: TenantContext,
  ) {}

  private async inTx<T>(fn: (tx: DbConnection) => Promise<T>): Promise<T> {
    const actor = this.tenantCtx.current();
    return this.db.transaction(async (tx) => {
      await tx.query(
        `SELECT set_config('app.tenant_id', $1, true),
                set_config('app.country_code', $2, true),
                set_config('app.entity_code',  $3, true)`,
        [actor?.tenantId ?? "", actor?.countryCode ?? "", actor?.entityCode ?? ""],
      );
      return fn(tx);
    });
  }

  async list(q?: string, limit = 50, offset = 0): Promise<Patient[]> {
    return this.repo.list({ q, limit, offset });
  }

  async get(id: string): Promise<Patient> {
    const p = await this.repo.findById(id);
    if (!p) throw DomainError.notFound("Patient", id);
    return p;
  }

  async create(input: CreatePatientInput): Promise<Patient> {
    return this.inTx(async (tx) => {
      const existing = await this.repo.findByMrnIn(input.medical_record, tx);
      if (existing) {
        throw DomainError.conflict(
          `Patient with MRN '${input.medical_record}' already exists in this tenant`,
        );
      }
      const created = await this.repo.create(input, { query: tx.query.bind(tx), exec: tx.exec.bind(tx) });
      await this.audit.record(tx, {
        operation: "patient.register",
        resourceType: "patient",
        resourceId: created.patient_id,
        after: created,
      });
      return created;
    });
  }
}
