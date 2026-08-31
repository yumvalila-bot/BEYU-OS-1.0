import { Injectable } from "@nestjs/common";
import { RadiologyRepository } from "./radiology.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { TenantContext } from "../../common/security/tenant-context";

const TRANSITIONS: Record<string, Set<string>> = {
  ordered: new Set(["scheduled", "cancelled"]),
  scheduled: new Set(["in_progress", "cancelled"]),
  in_progress: new Set(["preliminary", "final", "cancelled"]),
  preliminary: new Set(["final", "amended"]),
  final: new Set<string>(),
  cancelled: new Set<string>(),
};

@Injectable()
export class RadiologyService {
  constructor(
    private readonly repo: RadiologyRepository,
    private readonly audit: AuditService,
    private readonly tenantCtx: TenantContext,
  ) {}

  listForPatient(pid: string) { return this.repo.listForPatient(pid); }
  async createOrder(input: Record<string, unknown>) {
    if (!input.patient_id || !input.modality || !input.body_part) throw DomainError.validation("patient_id, modality, body_part required");
    if (input.idempotency_key) { const e = await this.repo.findByIdempotency(input.idempotency_key as string); if (e) return e; }
    return this.repo.withIsolation(async (tx) => {
      const o = await this.repo.createOrder(input, tx);
      await this.audit.record(tx, { operation: "imaging.order.create", resourceType: "imaging_order", resourceId: o.imaging_order_id, after: o });
      return o;
    });
  }
  async transition(id: string, to: string) {
    return this.repo.withIsolation(async (tx) => {
      const cur = await this.repo.findOrder(id, tx);
      if (!cur) throw DomainError.notFound("ImagingOrder", id);
      if (!TRANSITIONS[cur.status]?.has(to)) throw DomainError.invalidState(`Cannot transition imaging from ${cur.status} to ${to}`);
      const o = await this.repo.transitionOrder(id, to, tx);
      await this.audit.record(tx, { operation: "imaging.order.transition", resourceType: "imaging_order", resourceId: id, metadata: { to } });
      return o;
    });
  }
  async addReport(input: { imaging_order_id: string; findings: string; impression?: string }) {
    if (!input.findings) throw DomainError.validation("findings required");
    return this.repo.withIsolation(async (tx) => {
      const r = await this.repo.addReport(input, tx);
      await this.audit.record(tx, { operation: "imaging.report.create", resourceType: "imaging_report", resourceId: r.report_id, after: r });
      return r;
    });
  }
  async verifyReport(reportId: string, _meta?: Record<string, unknown>) {
    const actor = this.tenantCtx.current();
    if (!actor?.permissions?.includes("note:sign")) throw DomainError.forbidden("note:sign required to verify");
    return this.repo.withIsolation(async (tx) => {
      const r = await this.repo.verifyReport(reportId, tx);
      if (!r) throw DomainError.invalidState("Report cannot be verified (already verified or missing)");
      await this.audit.record(tx, { operation: "imaging.report.verify", resourceType: "imaging_report", resourceId: reportId, after: r });
      return r;
    });
  }
}
