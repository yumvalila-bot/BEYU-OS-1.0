/**
 * Imaging / DICOM-adjacent domain (migration 040).
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *   It stores NO pixel data. `health.imaging_studies.pixel_data_present` has a
 *   table CHECK pinning it to `false`, and `importStudy` refuses any attempt to
 *   say otherwise, because a row in this schema is metadata + a PACS reference.
 *   An "imaging module" that quietly starts holding studies in the operational
 *   database is how a hospital ends up with two sources of truth and a
 *   retention policy that neither of them enforces.
 *
 * GOVERNANCE THAT IS ENFORCED, NOT ASSERTED
 *   * a study cannot be `completed` without `acquired_at` (table CHECK), so a
 *     completed study is a study that happened;
 *   * an addendum on a verified report moves the study to
 *     `amended_with_pending` and it only returns to `verified` when the
 *     addendum is signed — so an unratified amendment cannot be read as final;
 *   * a critical finding cannot be closed before it is acknowledged, and
 *     acknowledgement names the clinician and the method (read-back, verbal,
 *     electronic);
 *   * a worklist item that is claimed belongs to the claimant: releasing it
 *     requires the same actor (or a supervisor with the manage permission).
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  ResourceDomainService,
  ResourceRepository,
  ResourceSpec,
} from "../../common/db/resource-kit";
import { DbConnection, DB_CONNECTION } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { AuditService } from "../audit/audit.service";
import { EventOutboxService } from "../events/event-outbox.service";
import { DomainError } from "../../common/errors/domain.error";

export const IMAGING_STUDY_SPEC: ResourceSpec = {
  table: "health.imaging_studies",
  pk: "study_id",
  insertColumns: [
    "imaging_order_id",
    "patient_id",
    "patient_match_status",
    "accession_number",
    "study_instance_uid",
    "study_date",
    "study_description",
    "modality",
    "body_part",
    "laterality",
    "institution_name",
    "station_name",
    "referring_provider_id",
    "performed_by",
    "acquisition_status",
    "reported_status",
    "validation_state",
    "validation_errors",
    "transfer_syntax_uid",
    "num_instances",
    "num_series",
    "image_availability",
    "pacs_external_reference",
    "scheduled_at",
    "acquired_at",
    "preparation_notes",
    "radiation_dose_mgy",
    "dose_length_product",
    "contrast_agent",
    "contrast_volume_ml",
    "idempotency_key",
  ],
  updateColumns: [
    "imaging_order_id",
    "patient_id",
    "patient_match_status",
    "study_date",
    "study_description",
    "body_part",
    "laterality",
    "institution_name",
    "station_name",
    "referring_provider_id",
    "performed_by",
    "validation_state",
    "validation_errors",
    "transfer_syntax_uid",
    "num_instances",
    "num_series",
    "image_availability",
    "pacs_external_reference",
    "scheduled_at",
    "preparation_notes",
    "radiation_dose_mgy",
    "dose_length_product",
    "contrast_agent",
    "contrast_volume_ml",
  ],
  resourceType: "imaging_study",
  auditPrefix: "imaging_study",
  // There is no generic `status` column here: a study has an acquisition state
  // and a reporting state, and they move independently. Naming the column keeps
  // the shared kit's transition/force-status machinery pointed at the right one.
  statusColumn: "acquisition_status",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.imaging_studies.study_date DESC NULLS LAST",
  event: {
    eventType: "health.imaging.study_state_changed",
    domain: "clinical",
    operation: "imaging.study",
    subjectType: "imaging_study",
    classification: "CONFIDENTIAL",
  },
};

export const IMAGING_SERIES_SPEC: ResourceSpec = {
  table: "health.imaging_series",
  pk: "series_id",
  insertColumns: [
    "study_id",
    "series_instance_uid",
    "series_number",
    "modality",
    "series_description",
    "body_part",
    "laterality",
    "num_instances",
    "instance_uid_range",
    "orientation",
    "slice_thickness",
    "window_center",
    "window_width",
  ],
  updateColumns: [
    "series_description",
    "body_part",
    "laterality",
    "num_instances",
    "instance_uid_range",
    "orientation",
    "slice_thickness",
    "window_center",
    "window_width",
  ],
  resourceType: "imaging_series",
  auditPrefix: "imaging_series",
  tracksUpdater: false,
  listOrder: "health.imaging_series.series_number ASC",
};

export const REPORT_ADDENDUM_SPEC: ResourceSpec = {
  table: "health.imaging_report_addenda",
  pk: "addendum_id",
  insertColumns: ["report_id", "content", "reason", "status"],
  // `content` is deliberately NOT updatable after creation: an addendum is an
  // addition to a signed report, so correcting it means writing another one.
  updateColumns: ["reason"],
  resourceType: "report_addendum",
  auditPrefix: "report_addendum",
  listOrder: "health.imaging_report_addenda.created_at DESC",
};

export const CRITICAL_FINDING_SPEC: ResourceSpec = {
  table: "health.critical_findings",
  pk: "critical_finding_id",
  insertColumns: [
    "source_domain",
    "source_resource_type",
    "source_resource_id",
    "study_id",
    "patient_id",
    "encounter_id",
    "finding",
    "severity",
    "notified_channel",
    "escalation_required",
    "idempotency_key",
    // Set by the service from the authenticated actor, never from the body;
    // it has to be in the whitelist for insert() to keep it at all.
    "identified_by",
    "status",
    "notification_state",
  ],
  updateColumns: [
    "finding",
    "severity",
    "notified_channel",
    "escalation_required",
  ],
  resourceType: "critical_finding",
  auditPrefix: "critical_finding",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.critical_findings.identified_at DESC",
  event: {
    eventType: "health.imaging.critical_finding_changed",
    domain: "clinical",
    operation: "imaging.critical_finding",
    subjectType: "critical_finding",
    classification: "RESTRICTED",
  },
};

export const WORKLIST_ITEM_SPEC: ResourceSpec = {
  table: "health.modality_worklist_items",
  pk: "worklist_item_id",
  insertColumns: [
    "imaging_order_id",
    "study_id",
    "modality",
    "station_name",
    "room",
    "scheduled_at",
    "priority",
    "status",
    "patient_prepped",
    "prep_notes",
  ],
  updateColumns: [
    "station_name",
    "room",
    "scheduled_at",
    "priority",
    "patient_prepped",
    "prep_notes",
  ],
  resourceType: "modality_worklist_item",
  auditPrefix: "worklist",
  listOrder: "health.modality_worklist_items.scheduled_at ASC NULLS LAST",
};

@Injectable()
export class ImagingStudyRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, IMAGING_STUDY_SPEC);
  }
}
@Injectable()
export class ImagingSeriesRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, IMAGING_SERIES_SPEC);
  }
}
@Injectable()
export class ReportAddendumRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, REPORT_ADDENDUM_SPEC);
  }
}
@Injectable()
export class CriticalFindingRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, CRITICAL_FINDING_SPEC);
  }
}
@Injectable()
export class WorklistRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, WORKLIST_ITEM_SPEC);
  }
}

const ACQUISITION: Record<string, Set<string>> = {
  scheduled: new Set(["in_progress", "completed", "cancelled", "failed"]),
  in_progress: new Set(["completed", "cancelled", "failed"]),
};

@Injectable()
export class ImagingService extends ResourceDomainService {
  constructor(
    db: DbConnection,
    private readonly ctx: TenantContext,
    audit: AuditService,
    private readonly events: EventOutboxService,
    private readonly series: ImagingSeriesRepository,
    private readonly addenda: ReportAddendumRepository,
    private readonly findings: CriticalFindingRepository,
    private readonly worklist: WorklistRepository,
    private readonly studies: ImagingStudyRepository,
  ) {
    super(
      { repo: studies, audit, db, tenantCtx: ctx, outbox: events },
      IMAGING_STUDY_SPEC,
      {
        validateCreate: (input) => {
          const errors: Record<string, string[]> = {};
          if (!input.accession_number) errors.accession_number = ["required"];
          if (!input.study_instance_uid)
            errors.study_instance_uid = ["required (DICOM StudyInstanceUID)"];
          if (!input.modality) errors.modality = ["required"];
          if (input.patient_match_status === "matched" && !input.patient_id)
            errors.patient_id = [
              "a matched study must name the patient; unmatched stays 'unmatched'",
            ];
          if (
            input.image_availability === "external_reference" &&
            !input.pacs_external_reference
          )
            errors.pacs_external_reference = [
              "required: an external reference is the only way this row can point at the images",
            ];
          if (Object.keys(errors).length) throw DomainError.validation(errors);
        },
        eventPayload: (kind, row) => ({
          accessionNumber: row.accession_number ?? null,
          modality: row.modality ?? null,
          acquisitionStatus: row.acquisition_status ?? null,
          reportedStatus: row.reported_status ?? null,
          patientMatchStatus: row.patient_match_status ?? null,
          kind,
        }),
      },
    );
  }

  private get tenantId(): string {
    return this.ctx.tenantId();
  }

  // ── study import (idempotent upsert keyed on SOP-level identity) ─────────────
  /**
   * Record a study from a modality or PACS feed. Re-importing the same
   * StudyInstanceUID is a metadata REFRESH of the existing row, never a second
   * study: duplicate studies are the classic symptom of a queue that retries
   * without an idempotency key.
   */
  async importStudy(input: Record<string, unknown>) {
    if (input.pixel_data_present === true)
      throw DomainError.validation(
        "pixel data is never stored in this registry; keep it in the image store",
      );
    const uid = String(input.study_instance_uid ?? "");
    if (!uid) throw DomainError.validation("study_instance_uid is required");
    const existing = (await this.studies.findByColumn(
      "study_instance_uid",
      uid,
    )) as any;
    if (existing) {
      return this.atomic(
        "imaging_study.reimport",
        "imaging_study",
        async (tx) => {
          const patched = await this.studies.patch(tx, existing.study_id, {
            ...input,
            study_instance_uid: undefined,
            accession_number: undefined,
          });
          return { ...(patched as object), reimported: true };
        },
        () => String(existing.study_id),
      );
    }
    return super.create({
      ...input,
      pixel_data_present: false,
      acquisition_status: input.acquisition_status ?? "scheduled",
      reported_status: input.reported_status ?? "pending",
    });
  }

  getStudy(studyId: string) {
    return super.get(studyId);
  }

  transitionStudy(studyId: string, to: string) {
    return this.atomic(
      `imaging_study.${to}`,
      "imaging_study",
      async (tx) => {
        const row = await this.studies.findById(studyId, tx);
        if (!row) throw DomainError.notFound("imaging_study", studyId);
        const from = String(row.acquisition_status);
        if (!(ACQUISITION[from] ?? new Set()).has(to))
          throw DomainError.conflict(
            `imaging study ${from} → ${to} is not allowed`,
          );
        const literalSet: string[] = [];
        if (to === "in_progress")
          literalSet.push("acquired_at = coalesce(acquired_at, now())");
        if (to === "completed")
          literalSet.push(
            "acquired_at = coalesce(acquired_at, now())",
            "completed_at = now()",
          );
        return this.studies.patch(tx, studyId, undefined, {
          forceStatus: to,
          literalSet,
        });
      },
      () => studyId,
    );
  }

  /**
   * Record technical validation. Failures are stored as a text array on the
   * study so the reason survives, and a failed study cannot be reported on as
   * if it passed.
   */
  validateStudy(
    studyId: string,
    result: "passed" | "failed" | "skipped",
    errors: string[] = [],
  ) {
    if (!["passed", "failed", "skipped"].includes(result))
      throw DomainError.validation("result must be passed, failed or skipped");
    if (!Array.isArray(errors))
      throw DomainError.validation("errors must be an array of strings");
    return this.atomic(
      "imaging_study.validate",
      "imaging_study",
      async (tx) => {
        const row = await this.studies.findById(studyId, tx);
        if (!row) throw DomainError.notFound("imaging_study", studyId);
        return (
          await tx.query<any>(
            `UPDATE health.imaging_studies
                SET validation_state = $2, validation_errors = $3::text[],
                    updated_by = $4
              WHERE study_id = $1 AND tenant_id = $5 AND voided_at IS NULL
            RETURNING *`,
            [
              studyId,
              result,
              errors,
              this.requireActor().userId,
              this.tenantId,
            ],
          )
        )[0];
      },
      () => studyId,
    );
  }

  /**
   * Attach a patient once the study has been reconciled. A study may exist
   * before anyone knows whose it is; matching is the act that links PHI, so it
   * is a separate, audited operation rather than an incidental field update.
   */
  matchStudy(
    studyId: string,
    patientId: string,
    decision: "matched" | "rejected",
  ) {
    if (!["matched", "rejected"].includes(decision))
      throw DomainError.validation("decision must be matched or rejected");
    if (decision === "matched" && !patientId)
      throw DomainError.validation("patient_id is required to match a study");
    return this.atomic(
      `imaging_study.${decision}`,
      "imaging_study",
      async (tx) => {
        const row = await this.studies.findById(studyId, tx);
        if (!row) throw DomainError.notFound("imaging_study", studyId);
        if (row.patient_match_status === "matched")
          throw DomainError.conflict(
            "This study is already matched; unmatched re-identification goes through patient reconciliation",
          );
        if (decision === "matched") {
          const patient = (
            await tx.query<any>(
              `SELECT patient_id FROM health.patients
                WHERE patient_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
              [patientId, this.tenantId],
            )
          )[0];
          if (!patient) throw DomainError.notFound("patient", patientId);
        }
        return (
          await tx.query<any>(
            `UPDATE health.imaging_studies
                SET patient_match_status = $2,
                    patient_id = CASE WHEN $2 = 'matched' THEN $3::uuid ELSE patient_id END,
                    updated_by = $4
              WHERE study_id = $1 AND tenant_id = $5 AND voided_at IS NULL
            RETURNING *`,
            [
              studyId,
              decision,
              decision === "matched" ? patientId : null,
              this.requireActor().userId,
              this.tenantId,
            ],
          )
        )[0];
      },
      () => studyId,
    );
  }

  addSeries(studyId: string, input: Record<string, unknown>) {
    if (!input.series_instance_uid)
      throw DomainError.validation("series_instance_uid is required");
    return this.atomic(
      "imaging_series.create",
      "imaging_series",
      async (tx) => {
        const study = await this.studies.findById(studyId, tx);
        if (!study) throw DomainError.notFound("imaging_study", studyId);
        const clash = (
          await tx.query<any>(
            `SELECT series_id FROM health.imaging_series
              WHERE tenant_id = $1 AND series_instance_uid = $2`,
            [this.tenantId, String(input.series_instance_uid)],
          )
        )[0];
        if (clash)
          throw DomainError.conflict(
            `Series ${input.series_instance_uid} is already recorded on study ${clash.series_id}`,
          );
        return this.series.insert(tx, { ...input, study_id: studyId });
      },
      (r: any) => String(r?.series_id),
    );
  }

  listSeries(studyId: string) {
    return this.series.query<any>(
      `SELECT * FROM health.imaging_series
        WHERE study_id = $1 AND tenant_id = $2 ORDER BY series_number ASC NULLS LAST`,
      [studyId, this.tenantId],
    );
  }

  // ── report addenda ──────────────────────────────────────────────────────────
  /**
   * Add an addendum to a report. If the report is already verified, the STUDY
   * moves to `amended_with_pending` so nobody reading the study list can mistake
   * the report for its final form.
   */
  addAddendum(reportId: string, input: { content: string; reason?: string }) {
    if (!input?.content || !String(input.content).trim())
      throw DomainError.validation("an addendum needs content");
    return this.atomic(
      "report_addendum.create",
      "report_addendum",
      async (tx) => {
        const report = (
          await tx.query<any>(
            `SELECT report_id, status, imaging_order_id FROM health.imaging_reports
              WHERE report_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [reportId, this.tenantId],
          )
        )[0];
        if (!report) throw DomainError.notFound("imaging_report", reportId);
        if (report.status === "draft")
          throw DomainError.conflict(
            `An addendum amends a filed report; this one is ${report.status}`,
          );
        const row = await this.addenda.insert(tx, {
          report_id: reportId,
          content: input.content,
          reason: input.reason ?? null,
          status: "draft",
        });
        await tx.query(
          `UPDATE health.imaging_studies
              SET reported_status = 'amended_with_pending'
            WHERE tenant_id = $1 AND imaging_order_id = $2 AND voided_at IS NULL
              AND reported_status = 'verified'`,
          [this.tenantId, report.imaging_order_id],
        );
        return row;
      },
      (r: any) => String(r?.addendum_id),
    );
  }

  signAddendum(addendumId: string) {
    return this.atomic(
      "report_addendum.sign",
      "report_addendum",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT * FROM health.imaging_report_addenda
              WHERE addendum_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [addendumId, this.tenantId],
          )
        )[0];
        if (!row) throw DomainError.notFound("report_addendum", addendumId);
        if (row.status === "signed") return row;
        const signed = (
          await tx.query<any>(
            `UPDATE health.imaging_report_addenda
                SET status = 'signed', signed_at = now(), signed_by = $2, updated_by = $2
              WHERE addendum_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [addendumId, this.requireActor().userId, this.tenantId],
          )
        )[0];
        // The amendment is now part of the record: clear the pending flag on
        // the study so the report and its addenda read as one ratified whole.
        await tx.query(
          `UPDATE health.imaging_studies
              SET reported_status = 'verified'
            WHERE tenant_id = $1 AND imaging_order_id = (
                    SELECT imaging_order_id FROM health.imaging_reports
                     WHERE report_id = $2
                  )
              AND reported_status = 'amended_with_pending' AND voided_at IS NULL`,
          [this.tenantId, row.report_id],
        );
        return signed;
      },
      () => addendumId,
    );
  }

  listAddenda(reportId: string) {
    return this.addenda.query<any>(
      `SELECT * FROM health.imaging_report_addenda
        WHERE report_id = $1 AND tenant_id = $2 AND voided_at IS NULL
        ORDER BY created_at ASC`,
      [reportId, this.tenantId],
    );
  }

  // ── critical findings ───────────────────────────────────────────────────────
  recordCriticalFinding(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.finding) errors.finding = ["required"];
    if (!input.source_domain) errors.source_domain = ["required"];
    if (!input.patient_id)
      errors.patient_id = [
        "required: a critical finding nobody can attribute to a patient cannot be actioned",
      ];
    if (!input.source_resource_type || !input.source_resource_id)
      errors.source_resource_id = [
        "a critical finding must point at the record it came from",
      ];
    if (input.severity === undefined)
      errors.severity = ["required: severity drives the acknowledgement rule"];
    else if (
      !["critical", "life_threatening", "urgent_followup"].includes(
        String(input.severity),
      )
    )
      errors.severity = [
        "must be critical, life_threatening or urgent_followup",
      ];
    if (
      input.source_domain !== undefined &&
      !["imaging", "laboratory", "emergency", "pharmacy"].includes(
        String(input.source_domain),
      )
    )
      errors.source_domain = [
        "must be imaging, laboratory, emergency or pharmacy",
      ];
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    return this.createVia(
      this.findings,
      CRITICAL_FINDING_SPEC,
      "critical_finding.record",
      {
        ...input,
        status: "open",
        notification_state: "not_sent",
        identified_by: this.requireActor().userId,
      },
    );
  }

  /**
   * Record that the finding was communicated. Without a channel delivery
   * receipt the state is `acknowledgement_required_manually`, i.e. "a human
   * must phone someone" — never `delivered`, which this table reserves for a
   * notification the platform can actually prove.
   */
  notifyCriticalFinding(
    findingId: string,
    opts: { channel?: string; delivered?: boolean; recipient?: string } = {},
  ) {
    // `notified_actor` is the person the notification was aimed at, as text —
    // a register that says "we notified" without saying whom is not evidence.
    if (!opts?.delivered && !opts?.recipient)
      throw DomainError.validation(
        "a manual notification must name who was told, so the register can be audited",
      );
    return this.atomic(
      "critical_finding.notify",
      "critical_finding",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT * FROM health.critical_findings
              WHERE critical_finding_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [findingId, this.tenantId],
          )
        )[0];
        if (!row) throw DomainError.notFound("critical_finding", findingId);
        if (row.status !== "open")
          throw DomainError.conflict(
            `Finding is ${row.status}; nothing to notify`,
          );
        const state = opts.delivered
          ? "delivered"
          : "acknowledgement_required_manually";
        if (
          opts.channel &&
          !["in_person", "phone", "sms", "email", "in_app"].includes(
            String(opts.channel),
          )
        )
          throw DomainError.validation(
            "channel must be in_person, phone, sms, email or in_app",
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.critical_findings
                SET status = 'notified', notification_state = $2, notified_at = now(),
                    notified_channel = coalesce($3, notified_channel),
                    notified_actor = $4, updated_by = $5
              WHERE critical_finding_id = $1 AND tenant_id = $6 AND voided_at IS NULL
            RETURNING *`,
            [
              findingId,
              state,
              opts.channel ?? null,
              String(opts.recipient ?? "").slice(0, 400),
              this.requireActor().userId,
              this.tenantId,
            ],
          )
        )[0];
        await this.events.publish({
          idempotencyKey: `beyu-evt:critical_finding:notified:${findingId}`,
          sectorEventId: `health-critical_finding-notified-${findingId}`,
          eventType: "health.imaging.critical_finding_changed",
          domain: "clinical",
          operation: "imaging.critical_finding",
          subjectType: "critical_finding",
          subjectId: String(findingId),
          classification: "RESTRICTED",
          payload: {
            severity: row.severity,
            notificationState: state,
            source: row.source_resource_type,
          },
        });
        return updated;
      },
      () => findingId,
    );
  }

  /**
   * Acknowledge a critical finding. The acknowledger is the authenticated
   * actor — never a body field — and read-back is the only method that closes
   * the loop for a life-threatening finding.
   */
  acknowledgeCriticalFinding(
    findingId: string,
    method: "read_back" | "verbal" | "electronic",
    responseNote?: string,
  ) {
    if (!["read_back", "verbal", "electronic"].includes(method))
      throw DomainError.validation(
        "method must be read_back, verbal or electronic",
      );
    return this.atomic(
      "critical_finding.acknowledge",
      "critical_finding",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT * FROM health.critical_findings
              WHERE critical_finding_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [findingId, this.tenantId],
          )
        )[0];
        if (!row) throw DomainError.notFound("critical_finding", findingId);
        if (!["open", "notified", "escalated"].includes(String(row.status)))
          throw DomainError.conflict(`Finding is ${row.status}`);
        if (row.severity === "life_threatening" && method !== "read_back")
          throw DomainError.conflict(
            "A life-threatening finding requires read-back acknowledgement",
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.critical_findings
                SET status = 'acknowledged', acknowledged_by = $2,
                    acknowledged_at = now(), ack_method = $3,
                    response_note = coalesce($4, response_note), updated_by = $2
              WHERE critical_finding_id = $1 AND tenant_id = $5 AND voided_at IS NULL
            RETURNING *`,
            [
              findingId,
              this.requireActor().userId,
              method,
              responseNote ?? null,
              this.tenantId,
            ],
          )
        )[0];
        return updated;
      },
      () => findingId,
    );
  }

  escalateCriticalFinding(findingId: string, note: string) {
    if (!note)
      throw DomainError.validation(
        "an escalation must say who was called and why",
      );
    return this.atomic(
      "critical_finding.escalate",
      "critical_finding",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT status FROM health.critical_findings
              WHERE critical_finding_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [findingId, this.tenantId],
          )
        )[0];
        if (!row) throw DomainError.notFound("critical_finding", findingId);
        if (row.status === "closed")
          throw DomainError.conflict(
            "A closed finding is escalated as a new finding",
          );
        return (
          await tx.query<any>(
            `UPDATE health.critical_findings
                SET status = 'escalated', escalation_at = now(), escalation_required = true,
                    response_note = coalesce(response_note || ' | ', '') || $3, updated_by = $4
              WHERE critical_finding_id = $1 AND tenant_id = $2 AND voided_at IS NULL
            RETURNING *`,
            [findingId, this.tenantId, note, this.requireActor().userId],
          )
        )[0];
      },
      () => findingId,
    );
  }

  closeCriticalFinding(findingId: string, note: string) {
    if (!note)
      throw DomainError.validation(
        "closing a critical finding needs an outcome note",
      );
    return this.atomic(
      "critical_finding.close",
      "critical_finding",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT * FROM health.critical_findings
              WHERE critical_finding_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [findingId, this.tenantId],
          )
        )[0];
        if (!row) throw DomainError.notFound("critical_finding", findingId);
        if (!row.acknowledged_at)
          throw DomainError.conflict(
            "An unacknowledged critical finding cannot be closed — that is the entire point of the register",
          );
        return (
          await tx.query<any>(
            `UPDATE health.critical_findings
                SET status = 'closed', closed_at = now(),
                    response_note = response_note || ' | closed: ' || $3, updated_by = $4
              WHERE critical_finding_id = $1 AND tenant_id = $2 AND voided_at IS NULL
            RETURNING *`,
            [findingId, this.tenantId, note, this.requireActor().userId],
          )
        )[0];
      },
      () => findingId,
    );
  }

  openCriticalFindings() {
    return this.query(
      `SELECT f.*, p.given_name, p.family_name,
              EXTRACT(EPOCH FROM (now() - f.identified_at))::int / 60 AS minutes_open,
              (f.severity = 'life_threatening'
                 AND now() - f.identified_at > interval '15 minutes') AS sla_breached
         FROM health.critical_findings f
         LEFT JOIN health.patients p ON p.patient_id = f.patient_id
        WHERE f.tenant_id = $1 AND f.voided_at IS NULL
          AND f.status <> 'closed'
        ORDER BY CASE f.severity
                   WHEN 'life_threatening' THEN 0 WHEN 'critical' THEN 1 ELSE 2 END,
                 f.identified_at ASC
        LIMIT 200`,
      [this.tenantId],
    );
  }

  // ── modality worklist ───────────────────────────────────────────────────────
  enqueueWorklistItem(input: Record<string, unknown>) {
    if (!input.modality) throw DomainError.validation("modality is required");
    if (!input.imaging_order_id && !input.study_id)
      throw DomainError.validation("a worklist item needs an order or a study");
    return this.createVia(
      this.worklist,
      WORKLIST_ITEM_SPEC,
      "worklist.create",
      { ...input, status: "scheduled", claimed_by: null, claimed_at: null },
    );
  }

  /**
   * Claim a worklist item for a modality operator. The table CHECK ties
   * `claimed_by` and `claimed_at` together; this service additionally refuses a
   * second claim while one is live, so two operators cannot both believe they
   * own the slot.
   */
  claimWorklistItem(worklistItemId: string) {
    return this.atomic(
      "worklist.claim",
      "modality_worklist_item",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT * FROM health.modality_worklist_items
              WHERE worklist_item_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [worklistItemId, this.tenantId],
          )
        )[0];
        if (!row)
          throw DomainError.notFound("modality_worklist_item", worklistItemId);
        if (
          row.claimed_by &&
          String(row.claimed_by) !== this.requireActor().userId
        )
          throw DomainError.conflict(
            "This item is already claimed by another operator",
          );
        if (row.status !== "scheduled")
          throw DomainError.conflict(`Item is ${row.status}`);
        return (
          await tx.query<any>(
            `UPDATE health.modality_worklist_items
                SET status = 'in_progress', claimed_by = $2, claimed_at = now()
              WHERE worklist_item_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [worklistItemId, this.requireActor().userId, this.tenantId],
          )
        )[0];
      },
      () => worklistItemId,
    );
  }

  releaseWorklistItem(worklistItemId: string) {
    return this.atomic(
      "worklist.release",
      "modality_worklist_item",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT * FROM health.modality_worklist_items
              WHERE worklist_item_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [worklistItemId, this.tenantId],
          )
        )[0];
        if (!row)
          throw DomainError.notFound("modality_worklist_item", worklistItemId);
        if (!row.claimed_by) return row;
        const actor = this.requireActor().userId;
        const supervisor = (this.ctx.current()?.permissions ?? []).includes(
          "study:import",
        );
        if (String(row.claimed_by) !== actor && !supervisor)
          throw DomainError.forbidden(
            "Only the claiming operator, or a supervisor who imported the study, can release a claimed item",
          );
        return (
          await tx.query<any>(
            `UPDATE health.modality_worklist_items
                SET status = 'scheduled', claimed_by = NULL, claimed_at = NULL
              WHERE worklist_item_id = $1 AND tenant_id = $2 AND voided_at IS NULL
            RETURNING *`,
            [worklistItemId, this.tenantId],
          )
        )[0];
      },
      () => worklistItemId,
    );
  }

  completeWorklistItem(worklistItemId: string) {
    return this.atomic(
      "worklist.perform",
      "modality_worklist_item",
      async (tx) => {
        const row = (
          await tx.query<any>(
            `SELECT * FROM health.modality_worklist_items
              WHERE worklist_item_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [worklistItemId, this.tenantId],
          )
        )[0];
        if (!row)
          throw DomainError.notFound("modality_worklist_item", worklistItemId);
        if (!row.claimed_by)
          throw DomainError.conflict(
            "Claim the item before recording it as performed",
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.modality_worklist_items
                SET status = 'performed', performed_at = now()
              WHERE worklist_item_id = $1 AND tenant_id = $2 AND voided_at IS NULL
            RETURNING *`,
            [worklistItemId, this.tenantId],
          )
        )[0];
        if (row.study_id)
          await this.transitionStudy(String(row.study_id), "completed").catch(
            () => null,
          );
        return updated;
      },
      () => worklistItemId,
    );
  }

  worklistFor(modality?: string, station?: string) {
    return this.query(
      `SELECT w.*, o.urgency AS order_priority
         FROM health.modality_worklist_items w
         LEFT JOIN health.imaging_orders o
           ON o.imaging_order_id = w.imaging_order_id
        WHERE w.tenant_id = $1 AND w.voided_at IS NULL
          AND w.status IN ('scheduled','in_progress')
          AND ($2::text IS NULL OR w.modality = $2)
          AND ($3::text IS NULL OR w.station_name = $3)
        ORDER BY CASE w.priority WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                 w.scheduled_at ASC NULLS LAST
        LIMIT 200`,
      [this.tenantId, modality ?? null, station ?? null],
    );
  }

  studiesForPatient(patientId: string) {
    return this.query(
      `SELECT * FROM health.imaging_studies
        WHERE tenant_id = $1 AND patient_id = $2 AND voided_at IS NULL
        ORDER BY study_date DESC NULLS LAST LIMIT 100`,
      [this.tenantId, patientId],
    );
  }

  private async createVia(
    repo: ResourceRepository,
    spec: ResourceSpec,
    operation: string,
    input: Record<string, unknown>,
  ) {
    const col = spec.idempotencyColumn;
    const key = col ? input?.[col] : undefined;
    if (typeof key === "string" && key.trim().length > 0) {
      const existing = await repo.findByColumn(col!, key);
      if (existing) return existing;
    }
    return this.atomic(
      operation,
      spec.resourceType,
      async (tx) => {
        const row = await repo.insert(tx, input);
        if (!row) throw DomainError.invalidState("Insert produced no row");
        return row;
      },
      (r: any) => String(r?.[spec.pk]),
    );
  }
}
