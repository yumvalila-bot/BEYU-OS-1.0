import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";

type Tx = DbConnection;

@Injectable()
export class PharmacyRepository extends BaseRepository {
  listItems() {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.pharmacy_items WHERE ${this.notVoided("health.pharmacy_items")} ORDER BY name`,
      ),
    );
  }
  createItem(input: Record<string, unknown>, tx?: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const sql = `INSERT INTO health.pharmacy_items
        (tenant_id, sku, name, generic_name, form, strength, unit, controlled, requires_rx, code, code_system, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13) RETURNING *`;
    const params = [
      this.tenantContext.tenantId(),
      input.sku,
      input.name,
      input.generic_name ?? null,
      input.form ?? null,
      input.strength ?? null,
      input.unit ?? "each",
      input.controlled ?? false,
      input.requires_rx ?? true,
      input.code ?? null,
      input.code_system ?? "RXNORM",
      actor,
      cid,
    ];
    const q = (c: Tx) => c.query(sql, params).then((r: any[]) => r[0]);
    return tx ? q(tx) : this.withIsolation(q);
  }
  findItemBySku(sku: string, tx?: Tx) {
    const sql = `SELECT * FROM health.pharmacy_items WHERE sku=$1 AND tenant_id=$2 AND ${this.notVoided("health.pharmacy_items")}`;
    const q = (c: Tx) =>
      c
        .query(sql, [sku, this.tenantContext.tenantId()])
        .then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  findItemById(id: string, tx?: Tx) {
    const sql = `SELECT * FROM health.pharmacy_items WHERE item_id=$1 AND ${this.notVoided("health.pharmacy_items")}`;
    const q = (c: Tx) => c.query(sql, [id]).then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  receiveStock(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `INSERT INTO health.pharmacy_batches
         (tenant_id, item_id, lot_number, expiry_date, initial_qty, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.item_id,
          input.lot_number,
          input.expiry_date,
          input.qty,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  recordMovement(mv: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `INSERT INTO health.stock_ledger
         (tenant_id, item_id, batch_id, movement_type, qty, running_total, reference_type, reference_id, note, idempotency_key, created_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          mv.item_id,
          mv.batch_id ?? null,
          mv.movement_type,
          mv.qty,
          mv.reference_type ?? null,
          mv.reference_id ?? null,
          mv.note ?? null,
          mv.idempotency_key ?? null,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  getStockLevel(item_id: string, tx: Tx) {
    return tx
      .query<{ on_hand: number }>(
        `SELECT on_hand FROM health.stock_levels WHERE item_id=$1 AND tenant_id=$2`,
        [item_id, this.tenantContext.tenantId()],
      )
      .then((r: any[]) => r[0]?.on_hand ?? 0);
  }
  createDispense(input: Record<string, unknown>, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `INSERT INTO health.dispenses
         (tenant_id, encounter_id, medication_id, patient_id, item_id, qty, dose_given, status, dispensed_by, idempotency_key, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'dispensed',$8,$9,$10,$10,$11) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          input.encounter_id ?? null,
          input.medication_id,
          input.patient_id,
          input.item_id,
          input.qty,
          input.dose_given ?? null,
          actor,
          input.idempotency_key ?? null,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0]);
  }
  findDispenseByIdempotency(key: string) {
    if (!key) return Promise.resolve(null);
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.dispenses WHERE idempotency_key=$1 AND tenant_id=$2 AND ${this.notVoided("health.dispenses")}`,
        [key, this.tenantContext.tenantId()],
      ),
    ).then((r: any[]) => r[0] ?? null);
  }
  listDispensesForPatient(patientId: string) {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT d.*, i.name AS item_name
           FROM health.dispenses d
           JOIN health.pharmacy_items i ON i.item_id = d.item_id
          WHERE d.patient_id=$1 AND ${this.notVoided("d")} ORDER BY d.dispensed_at DESC`,
        [patientId],
      ),
    );
  }
  findMedicationById(id: string, tx: Tx) {
    return tx
      .query(
        `SELECT * FROM health.medications WHERE medication_id=$1 AND ${this.notVoided("health.medications")}`,
        [id],
      )
      .then((r: any[]) => r[0] ?? null);
  }
}
