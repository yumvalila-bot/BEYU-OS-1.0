import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";
type Tx = DbConnection;
@Injectable()
export class BillingRepository extends BaseRepository {
  listServices() {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.billable_services WHERE ${this.notVoided("health.billable_services")} ORDER BY category, name`,
      ),
    );
  }
  createService(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `INSERT INTO health.billable_services (tenant_id, code, code_system, name, description, unit_price, currency, category, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.code,
          input.code_system ?? "LOCAL",
          input.name,
          input.description ?? null,
          input.unit_price ?? 0,
          input.currency ?? "TZS",
          input.category ?? "other",
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  createInvoice(
    input: {
      patient_id: string;
      encounter_id?: string;
      items: {
        service_id?: string;
        description: string;
        qty?: number;
        unit_price: number;
        reference_type?: string;
        reference_id?: string;
      }[];
      idempotency_key?: string;
    },
    tx: Tx,
  ) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const no = "INV-" + Date.now().toString(36).toUpperCase();
    let subtotal = 0;
    for (const it of input.items)
      subtotal += (it.qty ?? 1) * Number(it.unit_price);
    return tx
      .query(
        `INSERT INTO health.invoices
        (tenant_id, invoice_no, patient_id, encounter_id, status, subtotal, total, balance, issued_at, idempotency_key, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,'issued',$5,$5,$5,now(),$6,$7,$7,$8) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          no,
          input.patient_id,
          input.encounter_id ?? null,
          subtotal,
          input.idempotency_key ?? null,
          actor,
          cid,
        ],
      )
      .then(async (r: any[]) => {
        const inv = r[0];
        for (const it of input.items) {
          const qty = it.qty ?? 1;
          const line = qty * Number(it.unit_price);
          await tx.query(
            `INSERT INTO health.invoice_items (tenant_id, invoice_id, service_id, description, qty, unit_price, line_total, reference_type, reference_id, created_by, correlation_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              this.tenantContext.tenantId(),
              inv.invoice_id,
              it.service_id ?? null,
              it.description,
              qty,
              it.unit_price,
              line,
              it.reference_type ?? null,
              it.reference_id ?? null,
              actor,
              cid,
            ],
          );
        }
        return inv;
      });
  }
  findInvoiceByIdempotency(key: string) {
    if (!key) return Promise.resolve(null);
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.invoices WHERE idempotency_key=$1 AND tenant_id=$2 AND ${this.notVoided("health.invoices")}`,
        [key, this.tenantContext.tenantId()],
      ),
    ).then((r: any[]) => r[0] ?? null);
  }
  findInvoice(id: string, tx?: Tx) {
    const q = (c: Tx) =>
      c
        .query(
          `SELECT * FROM health.invoices WHERE invoice_id=$1 AND ${this.notVoided("health.invoices")}`,
          [id],
        )
        .then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  listInvoiceItems(id: string, tx: Tx) {
    return tx.query(`SELECT * FROM health.invoice_items WHERE invoice_id=$1`, [
      id,
    ]);
  }
  listInvoicesForPatient(pid: string) {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.invoices WHERE patient_id=$1 AND ${this.notVoided("health.invoices")} ORDER BY created_at DESC`,
        [pid],
      ),
    );
  }
  recordPayment(
    input: {
      patient_id: string;
      method: string;
      amount: number;
      reference_no?: string;
      idempotency_key?: string;
    },
    tx: Tx,
  ) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const no = "PAY-" + Date.now().toString(36).toUpperCase();
    return tx
      .query(
        `INSERT INTO health.payments (tenant_id, payment_no, patient_id, method, amount, reference_no, status, idempotency_key, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,'received',$7,$8,$8,$9) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          no,
          input.patient_id,
          input.method,
          input.amount,
          input.reference_no ?? null,
          input.idempotency_key ?? null,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  findPaymentByIdempotency(key: string) {
    if (!key) return Promise.resolve(null);
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.payments WHERE idempotency_key=$1 AND tenant_id=$2 AND ${this.notVoided("health.payments")}`,
        [key, this.tenantContext.tenantId()],
      ),
    ).then((r: any[]) => r[0] ?? null);
  }
  findOutstandingInvoices(pid: string, tx: Tx) {
    return tx.query(
      `SELECT * FROM health.invoices WHERE patient_id=$1 AND balance>0 AND status IN ('issued','partially_paid') AND ${this.notVoided("health.invoices")} ORDER BY created_at ASC`,
      [pid],
    );
  }
  allocate(payment_id: string, invoice_id: string, amount: number, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx.query(
      `INSERT INTO health.payment_allocations (tenant_id, payment_id, invoice_id, amount, created_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        this.tenantContext.tenantId(),
        payment_id,
        invoice_id,
        amount,
        actor,
        cid,
      ],
    );
  }
  updateInvoiceTotals(invoice_id: string, tx: Tx) {
    return tx
      .query(
        `UPDATE health.invoices i
          SET paid = COALESCE((SELECT sum(amount) FROM health.payment_allocations a WHERE a.invoice_id = i.invoice_id),0),
              balance = i.total - COALESCE((SELECT sum(amount) FROM health.payment_allocations a WHERE a.invoice_id = i.invoice_id),0),
              status = CASE
                WHEN COALESCE((SELECT sum(amount) FROM health.payment_allocations a WHERE a.invoice_id = i.invoice_id),0) >= i.total THEN 'paid'
                WHEN COALESCE((SELECT sum(amount) FROM health.payment_allocations a WHERE a.invoice_id = i.invoice_id),0) > 0 THEN 'partially_paid'
                ELSE i.status
              END,
              updated_at = now()
        WHERE i.invoice_id = $1
        RETURNING *`,
        [invoice_id],
      )
      .then((r: any[]) => r[0]);
  }
  stageFinanceEvent(
    event_type: string,
    payload: unknown,
    idempotency_key: string,
    tx: Tx,
  ) {
    return tx.query(
      `INSERT INTO health.finance_events (tenant_id, event_type, payload, idempotency_key)
       VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT DO NOTHING RETURNING *`,
      [
        this.tenantContext.tenantId(),
        event_type,
        JSON.stringify(payload),
        idempotency_key,
      ],
    );
  }
}
