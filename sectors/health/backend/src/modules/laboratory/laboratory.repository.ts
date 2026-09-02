import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";

type Tx = DbConnection;

@Injectable()
export class LaboratoryRepository extends BaseRepository {
  listTests() {
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.lab_tests WHERE ${this.notVoided("health.lab_tests")} ORDER BY name`,
      ),
    );
  }
  createTest(input: Record<string, unknown>, tx?: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const sql = `INSERT INTO health.lab_tests (tenant_id, code_system, code, name, specimen_type, unit, reference_text, created_by, updated_by, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING *`;
    const params = [
      this.tenantContext.tenantId(),
      input.code_system ?? "LOINC",
      input.code ?? null,
      input.name,
      input.specimen_type ?? null,
      input.unit ?? null,
      input.reference_text ?? null,
      actor,
      cid,
    ];
    const q = (c: Tx) => c.query(sql, params).then((r: any[]) => r[0]);
    return tx ? q(tx) : this.withIsolation(q);
  }
  listOrders(patientId?: string) {
    return this.withIsolation((tx) =>
      patientId
        ? tx.query(
            `SELECT * FROM health.lab_orders WHERE patient_id=$1 AND ${this.notVoided("health.lab_orders")} ORDER BY ordered_at DESC`,
            [patientId],
          )
        : tx.query(
            `SELECT * FROM health.lab_orders WHERE ${this.notVoided("health.lab_orders")} ORDER BY ordered_at DESC LIMIT 200`,
          ),
    );
  }
  createOrder(
    input: {
      patient_id: string;
      encounter_id?: string;
      provider_id?: string;
      test_ids: string[];
      clinical_info?: string;
      urgent?: boolean;
      idempotency_key?: string;
    },
    tx: Tx,
  ) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const no = "LAB-" + Date.now().toString(36).toUpperCase();
    return tx
      .query(
        `INSERT INTO health.lab_orders (tenant_id, order_no, patient_id, encounter_id, provider_id, clinical_info, urgent, idempotency_key, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10) RETURNING *`,
        [
          this.tenantContext.tenantId(),
          no,
          input.patient_id,
          input.encounter_id ?? null,
          input.provider_id ?? null,
          input.clinical_info ?? null,
          input.urgent ?? false,
          input.idempotency_key ?? null,
          actor,
          cid,
        ],
      )
      .then(async (r: any[]) => {
        const order = r[0];
        for (const tid of input.test_ids) {
          await tx.query(
            `INSERT INTO health.lab_order_items (tenant_id, order_id, test_id, status, created_by, updated_by, correlation_id)
           VALUES ($1,$2,$3,'ordered',$4,$4,$5)`,
            [this.tenantContext.tenantId(), order.order_id, tid, actor, cid],
          );
        }
        return order;
      });
  }
  findByIdempotency(key: string) {
    if (!key) return Promise.resolve(null);
    return this.withIsolation((tx) =>
      tx.query(
        `SELECT * FROM health.lab_orders WHERE idempotency_key=$1 AND tenant_id=$2 AND ${this.notVoided("health.lab_orders")}`,
        [key, this.tenantContext.tenantId()],
      ),
    ).then((r: any[]) => r[0] ?? null);
  }
  findOrder(id: string, tx?: Tx) {
    const q = (c: Tx) =>
      c
        .query(
          `SELECT * FROM health.lab_orders WHERE order_id=$1 AND ${this.notVoided("health.lab_orders")}`,
          [id],
        )
        .then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  transitionOrder(id: string, to: string, stampColumn?: string, tx?: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const sql = stampColumn
      ? `UPDATE health.lab_orders SET status=$2, ${stampColumn}=now(), updated_by=$3, correlation_id=$4 WHERE order_id=$1 AND ${this.notVoided("health.lab_orders")} RETURNING *`
      : `UPDATE health.lab_orders SET status=$2, updated_by=$3, correlation_id=$4 WHERE order_id=$1 AND ${this.notVoided("health.lab_orders")} RETURNING *`;
    const q = (c: Tx) =>
      c.query(sql, [id, to, actor, cid]).then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }
  listOrderItems(orderId: string, tx?: Tx) {
    const q = (c: Tx) =>
      c.query(
        `SELECT * FROM health.lab_order_items WHERE order_id=$1 AND ${this.notVoided("health.lab_order_items")}`,
        [orderId],
      );
    return tx ? q(tx) : this.withIsolation(q);
  }
  enterResult(
    itemId: string,
    result: {
      value_numeric?: number;
      value_text?: string;
      abnormal_flag?: string;
      comment?: string;
    },
    tx: Tx,
  ) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `UPDATE health.lab_order_items
         SET status='completed',
             result_value_numeric=$2, result_value_text=$3, abnormal_flag=$4, comment=$5,
             result_entered_at=now(), updated_by=$6, correlation_id=$7
       WHERE order_item_id=$1 AND ${this.notVoided("health.lab_order_items")} AND verified_at IS NULL
       RETURNING *`,
        [
          itemId,
          result.value_numeric ?? null,
          result.value_text ?? null,
          result.abnormal_flag ?? null,
          result.comment ?? null,
          actor,
          cid,
        ],
      )
      .then((r: any[]) => r[0] ?? null);
  }
  verifyResult(itemId: string, tx: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    return tx
      .query(
        `UPDATE health.lab_order_items SET verified_by=$2, verified_at=now(), updated_by=$2, correlation_id=$3
        WHERE order_item_id=$1 AND ${this.notVoided("health.lab_order_items")} AND result_entered_at IS NOT NULL AND verified_at IS NULL
        RETURNING *`,
        [itemId, actor, cid],
      )
      .then((r: any[]) => r[0] ?? null);
  }
}
