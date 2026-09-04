import { Injectable } from "@nestjs/common";
import { BillingRepository } from "./billing.repository";
import { DomainError } from "../../common/errors/domain.error";
import { AuditService } from "../audit/audit.service";
import { TenantContext } from "../../common/security/tenant-context";
import { EventOutboxService } from "../events/event-outbox.service";
import { BeyuIdentityBridge } from "../identity/beyu-bridge";

@Injectable()
export class BillingService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly audit: AuditService,
    private readonly tenantCtx: TenantContext,
    private readonly eventOutbox: EventOutboxService,
    private readonly identityBridge: BeyuIdentityBridge,
  ) {}

  /**
   * Canonical GlobalUserId for the acting sector user (root identity layer,
   * resolved through the federation bridge). Null when the actor has no
   * canonical link — the event then travels as a pure SERVICE-actor event;
   * a canonical identity is never fabricated.
   */
  private async canonicalActorId(): Promise<string | null> {
    const actor = this.tenantCtx.current();
    if (!actor?.globalUserId) return null;
    try {
      const link = await this.identityBridge.getLink(actor.globalUserId);
      return link?.beyuUserId ?? null;
    } catch {
      return null;
    }
  }

  listServices() {
    return this.repo.listServices();
  }
  async createService(input: Record<string, unknown>) {
    if (!input.code || !input.name)
      throw DomainError.validation("code and name required");
    return this.repo.withIsolation(async (tx) => {
      const s = await this.repo.createService(input, tx);
      await this.audit.record(tx, {
        operation: "billing.service.create",
        resourceType: "billable_service",
        resourceId: s.service_id as string,
        after: s,
      });
      return s;
    });
  }
  listForPatient(pid: string) {
    return this.repo.listInvoicesForPatient(pid);
  }
  async getInvoice(id: string) {
    return this.repo.withIsolation(async (tx) => {
      const inv = await this.repo.findInvoice(id, tx);
      if (!inv) throw DomainError.notFound("Invoice", id);
      const items = await this.repo.listInvoiceItems(id, tx);
      return { ...inv, items };
    });
  }
  async createInvoice(input: any) {
    if (!input.patient_id || !input.items?.length)
      throw DomainError.validation("patient_id and items required");
    if (input.idempotency_key) {
      const e = await this.repo.findInvoiceByIdempotency(input.idempotency_key);
      if (e) return e;
    }
    // Resolve the canonical actor OUTSIDE the transaction: the bridge reads
    // through the ambient connection, which must not be queried while the
    // business transaction is open (PGlite single-connection deadlock).
    const canonicalActor = await this.canonicalActorId();
    return this.repo.withIsolation(async (tx) => {
      const inv = await this.repo.createInvoice(input, tx);
      await this.audit.record(tx, {
        operation: "invoice.issue",
        resourceType: "invoice",
        resourceId: inv.invoice_id,
        after: inv,
      });
      await this.repo.stageFinanceEvent(
        "invoice.issued",
        inv,
        `inv:${inv.invoice_id}`,
        tx,
      );
      // Phase 8: the governed financial event joins the SAME transaction —
      // the invoice and its enterprise event commit atomically or not at
      // all. The dispatcher delivers it to BEYU OS (idempotent), where it
      // becomes an immutable enterprise_events record for Finance OS.
      // Payload is finance-scoped: no patient identifiers cross the boundary.
      await this.eventOutbox.publish({
        idempotencyKey: `beyu-evt:invoice:${inv.invoice_id}`,
        sectorEventId: `health-inv-${inv.invoice_id}`,
        eventType: "health.billing.invoice_created",
        domain: "finance",
        operation: "billing.event",
        destinationDomain: "finance",
        subjectType: "invoice",
        subjectId: String(inv.invoice_id),
        actorGlobalUserId: canonicalActor,
        classification: "CONFIDENTIAL",
        payload: {
          invoiceId: inv.invoice_id,
          total: inv.total,
          currency: inv.currency ?? "TZS",
          facilityId: inv.facility_id ?? null,
        },
      });
      return inv;
    });
  }
  async recordPayment(input: any) {
    if (Number(input.amount) <= 0)
      throw DomainError.validation("amount must be positive");
    if (input.idempotency_key) {
      const e = await this.repo.findPaymentByIdempotency(input.idempotency_key);
      if (e) return e;
    }
    const canonicalActor = await this.canonicalActorId();
    return this.repo.withIsolation(async (tx) => {
      const pay = await this.repo.recordPayment(input, tx);
      let remaining = Number(input.amount);
      const targets = input.allocations?.length
        ? input.allocations
        : (await this.repo.findOutstandingInvoices(input.patient_id, tx)).map(
            (i: any) => ({
              invoice_id: i.invoice_id,
              amount: Math.min(Number(i.balance), remaining),
            }),
          );
      for (const a of targets) {
        if (remaining <= 0) break;
        const inv = await this.repo.findInvoice(a.invoice_id, tx);
        if (!inv) throw DomainError.notFound("Invoice", a.invoice_id);
        const avail = Math.max(0, Number(inv.total) - Number(inv.paid));
        const requested = Number(a.amount);
        if (requested > avail + 0.01)
          throw DomainError.conflict(
            `Allocation ${requested} exceeds invoice balance ${avail}`,
          );
        const amt = Math.min(requested, remaining);
        await this.repo.allocate(pay.payment_id, a.invoice_id, amt, tx);
        await this.repo.updateInvoiceTotals(a.invoice_id, tx);
        remaining -= amt;
      }
      await this.audit.record(tx, {
        operation: "payment.receive",
        resourceType: "payment",
        resourceId: pay.payment_id,
        after: pay,
      });
      await this.repo.stageFinanceEvent(
        "payment.received",
        pay,
        `pay:${pay.payment_id}`,
        tx,
      );
      // Phase 8 governed payment event (same transaction; see above).
      await this.eventOutbox.publish({
        idempotencyKey: `beyu-evt:payment:${pay.payment_id}`,
        sectorEventId: `health-pay-${pay.payment_id}`,
        eventType: "health.billing.payment_received",
        domain: "finance",
        operation: "billing.event",
        destinationDomain: "finance",
        subjectType: "payment",
        subjectId: String(pay.payment_id),
        actorGlobalUserId: canonicalActor,
        classification: "CONFIDENTIAL",
        payload: {
          paymentId: pay.payment_id,
          amount: input.amount,
          currency: pay.currency ?? "TZS",
        },
      });
      return pay;
    });
  }
}
