import { Injectable } from "@nestjs/common";
import { BillingRepository } from "./billing.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { TenantContext } from "../../common/security/tenant-context";

@Injectable()
export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly audit: AuditService,
    private readonly tenantCtx: TenantContext,
  ) {}

  listServices() { return this.repo.listServices(); }
  async createService(input: Record<string, unknown>) {
    if (!input.code || !input.name) throw DomainError.validation("code and name required");
    return this.repo.withIsolation(async (tx) => {
      const s = await this.repo.createService(input, tx);
      await this.audit.record(tx, { operation: "billing.service.create", resourceType: "billable_service", resourceId: s.service_id as string, after: s });
      return s;
    });
  }
  listForPatient(pid: string) { return this.repo.listInvoicesForPatient(pid); }
  async getInvoice(id: string) {
    return this.repo.withIsolation(async (tx) => {
      const inv = await this.repo.findInvoice(id, tx);
      if (!inv) throw DomainError.notFound("Invoice", id);
      const items = await this.repo.listInvoiceItems(id, tx);
      return { ...inv, items };
    });
  }
  async createInvoice(input: any) {
    if (!input.patient_id || !input.items?.length) throw DomainError.validation("patient_id and items required");
    if (input.idempotency_key) {
      const e = await this.repo.findInvoiceByIdempotency(input.idempotency_key);
      if (e) return e;
    }
    return this.repo.withIsolation(async (tx) => {
      const inv = await this.repo.createInvoice(input, tx);
      await this.audit.record(tx, { operation: "invoice.issue", resourceType: "invoice", resourceId: inv.invoice_id, after: inv });
      await this.repo.stageFinanceEvent("invoice.issued", inv, `inv:${inv.invoice_id}`, tx);
      return inv;
    });
  }
  async recordPayment(input: any) {
    if (Number(input.amount) <= 0) throw DomainError.validation("amount must be positive");
    if (input.idempotency_key) {
      const e = await this.repo.findPaymentByIdempotency(input.idempotency_key);
      if (e) return e;
    }
    return this.repo.withIsolation(async (tx) => {
      const pay = await this.repo.recordPayment(input, tx);
      let remaining = Number(input.amount);
      const targets = input.allocations?.length
        ? input.allocations
        : (await this.repo.findOutstandingInvoices(input.patient_id, tx)).map((i: any) => ({
            invoice_id: i.invoice_id,
            amount: Math.min(Number(i.balance), remaining),
          }));
      for (const a of targets) {
        if (remaining <= 0) break;
        const inv = await this.repo.findInvoice(a.invoice_id, tx);
        if (!inv) throw DomainError.notFound("Invoice", a.invoice_id);
        const avail = Math.max(0, Number(inv.total) - Number(inv.paid));
        const requested = Number(a.amount);
        if (requested > avail + 0.01) throw DomainError.conflict(`Allocation ${requested} exceeds invoice balance ${avail}`);
        const amt = Math.min(requested, remaining);
        await this.repo.allocate(pay.payment_id, a.invoice_id, amt, tx);
        await this.repo.updateInvoiceTotals(a.invoice_id, tx);
        remaining -= amt;
      }
      await this.audit.record(tx, { operation: "payment.receive", resourceType: "payment", resourceId: pay.payment_id, after: pay });
      await this.repo.stageFinanceEvent("payment.received", pay, `pay:${pay.payment_id}`, tx);
      return pay;
    });
  }
}
