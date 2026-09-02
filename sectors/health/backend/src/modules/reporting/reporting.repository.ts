import { Injectable } from "@nestjs/common";
import { BaseRepository } from "../../common/db/base.repository";
import { DbConnection } from "../identity/db-connection";

type Tx = DbConnection;

/**
 * MTUHA reporting repository — deterministic aggregation queries that read
 * ONLY Health OS tables. All MTUHA book codes (e.g., MTUHA 30/50/etc.) are
 * resolved via an explicit mapping config (`reporting.mtuha_mappings`) so we
 * never invent official codes or silently substitute them.
 */
@Injectable()
export class ReportingRepository extends BaseRepository {
  /**
   * Core out-patient (OPD) headcounts for a period, broken down by age/sex.
   * Returns a structured record rather than a flat CSV so controllers/adapters
   * can render MTUHA book entries via the mapping config.
   */
  opdHeadcount(periodStart: string, periodEnd: string, tx?: Tx) {
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE e.started_at BETWEEN $2 AND $3) AS total_visits,
        COUNT(*) FILTER (WHERE p.sex='male'   AND COALESCE(EXTRACT(YEAR FROM AGE(e.started_at, p.dob)), 0) < 5)   AS male_u5,
        COUNT(*) FILTER (WHERE p.sex='female' AND COALESCE(EXTRACT(YEAR FROM AGE(e.started_at, p.dob)), 0) < 5)   AS female_u5,
        COUNT(*) FILTER (WHERE p.sex='male'   AND COALESCE(EXTRACT(YEAR FROM AGE(e.started_at, p.dob)), 0) >= 5)  AS male_5plus,
        COUNT(*) FILTER (WHERE p.sex='female' AND COALESCE(EXTRACT(YEAR FROM AGE(e.started_at, p.dob)), 0) >= 5)  AS female_5plus,
        COUNT(*) FILTER (WHERE e.disposition='referred')  AS referrals_out,
        COUNT(*) FILTER (WHERE e.disposition='admitted')  AS admissions,
        COUNT(*) FILTER (WHERE e.disposition='died')      AS deaths
      FROM health.encounters e
      JOIN health.patients p ON p.patient_id = e.patient_id
      WHERE e.tenant_id = $1
        AND e.kind IN ('ambulatory','emergency')
        AND e.status = 'completed'
        AND e.started_at BETWEEN $2 AND $3
        AND ${this.notVoided("e")}
    `;
    const q = (c: Tx) =>
      c
        .query(sql, [this.tenantContext.tenantId(), periodStart, periodEnd])
        .then((r: any[]) => r[0] ?? null);
    return tx ? q(tx) : this.withIsolation(q);
  }

  /** Lab tests performed & results in period. */
  labVolume(periodStart: string, periodEnd: string, tx?: Tx) {
    const sql = `
      SELECT lt.code, lt.name, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE loi.abnormal_flag IN ('low','high','critical_low','critical_high')) AS abnormal
      FROM health.lab_order_items loi
      JOIN health.lab_tests lt ON lt.test_id = loi.test_id
      JOIN health.lab_orders lo ON lo.order_id = loi.order_id
      WHERE lo.tenant_id = $1
        AND loi.status = 'completed'
        AND loi.result_entered_at BETWEEN $2 AND $3
        AND ${this.notVoided("loi")}
      GROUP BY lt.code, lt.name
      ORDER BY total DESC
    `;
    const q = (c: Tx) =>
      c.query(sql, [this.tenantContext.tenantId(), periodStart, periodEnd]);
    return tx ? q(tx) : this.withIsolation(q);
  }

  /** Imaging volume by modality. */
  imagingVolume(periodStart: string, periodEnd: string, tx?: Tx) {
    const sql = `
      SELECT modality, COUNT(*) AS total
      FROM health.imaging_orders
      WHERE tenant_id = $1
        AND status IN ('preliminary','final')
        AND completed_at BETWEEN $2 AND $3
        AND ${this.notVoided("health.imaging_orders")}
      GROUP BY modality ORDER BY total DESC
    `;
    const q = (c: Tx) =>
      c.query(sql, [this.tenantContext.tenantId(), periodStart, periodEnd]);
    return tx ? q(tx) : this.withIsolation(q);
  }

  /** Pharmacy dispensing events. */
  pharmacyDispenses(periodStart: string, periodEnd: string, tx?: Tx) {
    const sql = `
      SELECT i.sku, i.name, SUM(d.qty) AS total_qty, COUNT(*) AS dispense_events
      FROM health.dispenses d
      JOIN health.pharmacy_items i ON i.item_id = d.item_id
      WHERE d.tenant_id = $1
        AND d.status = 'dispensed'
        AND d.dispensed_at BETWEEN $2 AND $3
        AND ${this.notVoided("d")}
      GROUP BY i.sku, i.name
      ORDER BY total_qty DESC
    `;
    const q = (c: Tx) =>
      c.query(sql, [this.tenantContext.tenantId(), periodStart, periodEnd]);
    return tx ? q(tx) : this.withIsolation(q);
  }

  /** Ambulance dispatches + deliveries. */
  ambulanceVolume(periodStart: string, periodEnd: string, tx?: Tx) {
    const sql = `
      SELECT priority,
             COUNT(*) FILTER (WHERE status='delivered')    AS delivered,
             COUNT(*) FILTER (WHERE status='cancelled')    AS cancelled,
             COUNT(*) FILTER (WHERE status='no_transport') AS no_transport
      FROM health.ambulance_requests
      WHERE tenant_id = $1
        AND created_at BETWEEN $2 AND $3
        AND ${this.notVoided("health.ambulance_requests")}
      GROUP BY priority
    `;
    const q = (c: Tx) =>
      c.query(sql, [this.tenantContext.tenantId(), periodStart, periodEnd]);
    return tx ? q(tx) : this.withIsolation(q);
  }

  /** List submitted MTUHA reports (audit trail of prior exports). */
  listReports(periodStart: string, periodEnd: string, tx?: Tx) {
    const sql = `
      SELECT report_id, period_start, period_end, book_code, submitted_at, submitted_by, file_ref, status, created_at
      FROM health.mtuha_reports
      WHERE tenant_id = $1
        AND period_start >= $2 AND period_end <= $3
      ORDER BY period_start DESC
    `;
    const q = (c: Tx) =>
      c.query(sql, [this.tenantContext.tenantId(), periodStart, periodEnd]);
    return tx ? q(tx) : this.withIsolation(q);
  }

  recordReport(input: Record<string, unknown>, tx?: Tx) {
    const actor = this.actorId();
    const cid = this.correlationId();
    const sql = `INSERT INTO health.mtuha_reports
        (tenant_id, period_start, period_end, book_code, status, file_ref, submitted_by, created_by, updated_by, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING *`;
    const params = [
      this.tenantContext.tenantId(),
      input.period_start,
      input.period_end,
      input.book_code ?? null,
      input.status ?? "generated",
      input.file_ref ?? null,
      actor,
      actor,
      cid,
    ];
    const q = (c: Tx) => c.query(sql, params).then((r: any[]) => r[0]);
    return tx ? q(tx) : this.withIsolation(q);
  }
}
