import { Injectable } from "@nestjs/common";
import { OphthalmologyRepository } from "./ophthalmology.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { Inject } from "@nestjs/common";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { atomicWrite } from "../../common/db/crud-factory";

@Injectable()
export class OphthalmologyService {
  constructor(private readonly repo: OphthalmologyRepository, private readonly audit: AuditService,
    @Inject(DB_CONNECTION) private readonly db: DbConnection, private readonly tenantCtx: TenantContext) {}
  listForPatient(pid: string) { return this.repo.listForPatient(pid); }
  async addExam(input: Record<string, unknown>) {
    if (!input.patient_id) throw DomainError.validation("patient_id required");
    return atomicWrite(this.db, this.tenantCtx, this.audit, "eye_exam.create", "eye_exam",
      (tx) => this.repo.addExam(input, tx), (r) => r.exam_id);
  }
  async sign(id: string) {
    const actor = this.tenantCtx.current();
    if (!actor?.permissions?.includes("note:sign")) throw DomainError.forbidden("note:sign required");
    return atomicWrite(this.db, this.tenantCtx, this.audit, "eye_exam.sign", "eye_exam",
      async (tx) => {
        const cur = await this.repo.find(id, tx);
        if (!cur) throw DomainError.notFound("EyeExam", id);
        if (cur.signed_at) throw DomainError.invalidState("Exam already signed");
        return this.repo.sign(id, tx);
      },
      (r) => r.exam_id);
  }
}
