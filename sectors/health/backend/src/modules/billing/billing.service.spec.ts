import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { DomainError } from "../../common/errors/domain.error";

describe("BillingService", () => {
  let bed: TestBed;
  let svc: BillingService;

  beforeAll(async () => {
    bed = await buildTestBed();
    const repo = new BillingRepository(bed.conn, bed.tenantCtx);
    svc = new BillingService(repo, bed.audit, bed.tenantCtx);
  });

  it("creates a billable service catalog entry and an invoice with line items", () =>
    bed.run(async () => {
      const cons = (await svc.createService({
        code: "CONSULT",
        name: "Consultation",
        unit_price: 10000,
      })) as any;
      expect(cons.service_id).toBeTruthy();
      const p = await bed.seedPatient();
      const inv = (await svc.createInvoice({
        patient_id: p.patient_id,
        items: [
          {
            service_id: cons.service_id,
            description: "OPD Consult",
            qty: 1,
            unit_price: 10000,
          },
        ],
      })) as any;
      expect(inv.invoice_id).toBeTruthy();
      expect(Number(inv.total)).toBe(10000);
      expect(Number(inv.balance)).toBe(10000);
      expect(inv.status).toBe("issued");
    }));

  it("payment auto-allocates FIFO across outstanding invoices", () =>
    bed.run(async () => {
      await svc.createService({
        code: "LAB",
        name: "Lab",
        unit_price: 5000,
      });
      const p = await bed.seedPatient();
      const inv1 = (await svc.createInvoice({
        patient_id: p.patient_id,
        items: [{ description: "Test 1", qty: 1, unit_price: 5000 }],
      })) as any;
      const inv2 = (await svc.createInvoice({
        patient_id: p.patient_id,
        items: [{ description: "Test 2", qty: 1, unit_price: 5000 }],
      })) as any;
      // Pay 7000 — should allocate 5000 to inv1, 2000 to inv2 (FIFO).
      await svc.recordPayment({
        patient_id: p.patient_id,
        method: "cash",
        amount: 7000,
        reference_no: "RCP-1",
      });
      const f1 = (await svc.getInvoice(inv1.invoice_id)) as any;
      const f2 = (await svc.getInvoice(inv2.invoice_id)) as any;
      expect(Number(f1.paid)).toBe(5000);
      expect(Number(f1.balance)).toBe(0);
      expect(f1.status).toBe("paid");
      expect(Number(f2.paid)).toBe(2000);
      expect(Number(f2.balance)).toBe(3000);
      expect(f2.status).toBe("partially_paid");
    }));

  it("rejects over-allocation (allocation amount cannot exceed invoice balance)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const inv = (await svc.createInvoice({
        patient_id: p.patient_id,
        items: [{ description: "T", qty: 1, unit_price: 1000 }],
      })) as any;
      await expect(
        svc.recordPayment({
          patient_id: p.patient_id,
          method: "cash",
          amount: 9999,
          allocations: [{ invoice_id: inv.invoice_id, amount: 9999 }],
        }),
      ).rejects.toBeInstanceOf(DomainError);
    }));

  it("idempotency keys prevent duplicate invoice and payment records", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      const i1 = (await svc.createInvoice({
        patient_id: p.patient_id,
        items: [{ description: "X", qty: 1, unit_price: 500 }],
        idempotency_key: "inv-1",
      })) as any;
      const i2 = (await svc.createInvoice({
        patient_id: p.patient_id,
        items: [{ description: "X", qty: 1, unit_price: 500 }],
        idempotency_key: "inv-1",
      })) as any;
      expect(i2.invoice_id).toBe(i1.invoice_id);
      const p1 = (await svc.recordPayment({
        patient_id: p.patient_id,
        method: "cash",
        amount: 500,
        idempotency_key: "pay-1",
      })) as any;
      const p2 = (await svc.recordPayment({
        patient_id: p.patient_id,
        method: "cash",
        amount: 500,
        idempotency_key: "pay-1",
      })) as any;
      expect(p2.payment_id).toBe(p1.payment_id);
    }));

  it("stages finance_events for downstream Finance OS (does not post to a separate ledger)", () =>
    bed.run(async () => {
      const p = await bed.seedPatient();
      await svc.createInvoice({
        patient_id: p.patient_id,
        items: [{ description: "T", qty: 1, unit_price: 500 }],
      });
      await svc.recordPayment({
        patient_id: p.patient_id,
        method: "cash",
        amount: 500,
      });
      const events = await bed.conn.query(
        `SELECT event_type FROM health.finance_events WHERE tenant_id=$1 ORDER BY created_at`,
        [bed.tenantCtx.tenantId()],
      );
      const types = events.map((r: any) => r.event_type);
      expect(types).toContain("invoice.issued");
      expect(types).toContain("payment.received");
    }));
});
