/**
 * Continuity-of-care domain service (migration 034).
 *
 * RULES THAT LIVE HERE
 *   * A task's patient/encounter are inherited from its plan, never taken from
 *     the request body — otherwise a caller could attach "their" task to
 *     somebody else's record.
 *   * Completing a `done` task must name the completer and the time, because
 *     the table CHECK makes `done` impossible without them; a task carrying a
 *     recurrence spawns exactly one successor instance so a qds observation
 *     does not depend on a client remembering to re-create it.
 *   * `skipped` requires a reason (also a CHECK) — silent non-performance is the
 *     failure mode this domain exists to prevent.
 *   * A discharge summary is amended by supersession, never in place: the prior
 *     row is voided and a new draft is created with `parent_summary_id`, so the
 *     signed text that a clinician is legally accountable for stays retrievable.
 *   * A clinical document row is metadata only. Claiming `available = true`
 *     without a storage reference and a content hash is refused: an honest
 *     "we do not have this object" beats a registry entry that 404s later.
 */
import { Injectable } from "@nestjs/common";
import {
  ResourceDomainService,
  ResourceRepository,
  ResourceSpec,
} from "../../common/db/resource-kit";
import { DbConnection } from "../identity/db-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { AuditService } from "../audit/audit.service";
import { EventOutboxService } from "../events/event-outbox.service";
import { DomainError } from "../../common/errors/domain.error";
import {
  CARE_PLAN_SPEC,
  CARE_TASK_SPEC,
  CLINICAL_DOCUMENT_SPEC,
  DISCHARGE_SUMMARY_SPEC,
  FOLLOWUP_SPEC,
  CarePlanRepository,
  CareTaskRepository,
  ClinicalDocumentRepository,
  DischargeSummaryRepository,
  FollowupRepository,
} from "./continuity.repository";

const PLAN_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(["active", "cancelled"]),
  active: new Set(["paused", "completed", "cancelled"]),
  paused: new Set(["active", "completed", "cancelled"]),
};

const TASK_TRANSITIONS: Record<string, Set<string>> = {
  open: new Set(["in_progress", "done", "skipped", "cancelled"]),
  in_progress: new Set(["done", "skipped", "cancelled"]),
  overdue: new Set(["in_progress", "done", "skipped", "cancelled"]),
};

const FOLLOWUP_TRANSITIONS: Record<string, Set<string>> = {
  scheduled: new Set(["contacted", "completed", "cancelled", "no_shown"]),
  contacted: new Set(["completed", "cancelled", "no_shown", "lost_to_follow_up"]),
  no_shown: new Set(["scheduled", "lost_to_follow_up", "completed"]),
};

const TASK_TYPES = [
  "clinical",
  "nursing",
  "medication",
  "monitoring",
  "education",
  "wound_care",
  "observation",
  "transport",
  "referral",
  "followup",
  "equipment",
];
const RECURRENCE_DEFAULT_MINUTES: Record<string, number> = {
  hourly: 60,
  qds: 360,
  tid: 480,
  bd: 720,
  od: 1440,
  weekly: 10080,
};

const oneOf = (
  errors: Record<string, string[]>,
  field: string,
  value: unknown,
  allowed: readonly string[],
) => {
  if (value !== undefined && value !== null && !allowed.includes(String(value))) {
    errors[field] = [`must be one of ${allowed.join(", ")}`];
  }
};

@Injectable()
export class ContinuityService extends ResourceDomainService {
  constructor(
    db: DbConnection,
    private readonly ctx: TenantContext,
    audit: AuditService,
    private readonly events: EventOutboxService,
    private readonly tasks: CareTaskRepository,
    private readonly summaries: DischargeSummaryRepository,
    private readonly followups: FollowupRepository,
    private readonly documents: ClinicalDocumentRepository,
    plans: CarePlanRepository,
  ) {
    super(
      { repo: plans, audit, db, tenantCtx: ctx, outbox: events },
      CARE_PLAN_SPEC,
      {
        transitions: PLAN_TRANSITIONS,
        closedAtColumn: "completed_at",
        closingStatuses: ["completed", "cancelled"],
        validateCreate: (input) => {
          const errors: Record<string, string[]> = {};
          if (!input.patient_id) errors.patient_id = ["required"];
          if (!input.title) errors.title = ["required"];
          oneOf(errors, "category", input.category, [
            "general",
            "wound_care",
            "pain",
            "infection",
            "chronic_disease",
            "maternal",
            "neonatal",
            "nutrition",
            "mobility",
            "discharge_planning",
            "palliative",
          ]);
          if (Object.keys(errors).length) throw DomainError.validation(errors);
        },
        eventPayload: (kind, row) => ({
          planId: String(row.plan_id),
          status: row.status ?? null,
          category: row.category ?? null,
          reviewDueAt: row.review_due_at ?? null,
          kind,
        }),
      },
    );
  }

  private get tenantId(): string {
    return this.ctx.tenantId();
  }

  // ── care plans ──────────────────────────────────────────────────────────────
  createPlan(input: Record<string, unknown>) {
    return super.create(input);
  }

  getPlan(planId: string) {
    return super.get(planId);
  }

  updatePlan(planId: string, patch: Record<string, unknown>) {
    return super.update(planId, patch);
  }

  /** draft → active → paused/completed/cancelled, never a direct status write. */
  transitionPlan(planId: string, to: string) {
    return super.transition(planId, to);
  }

  /** Sign-off stamps the clinician's acceptance time; it is not a content edit. */
  signPlan(planId: string) {
    return this.atomic(
      "care_plan.sign",
      "care_plan",
      async (tx) => {
        const row = await this.repo.findById(planId, tx);
        if (!row) throw DomainError.notFound("care_plan", planId);
        if (row.status !== "active")
          throw DomainError.conflict(
            `Only an active plan can be signed (currently ${row.status})`,
          );
        const updated = await this.repo.patch(tx, planId, undefined, {
          literalSet: ["signed_at = now()"],
        });
        if (!updated) throw DomainError.notFound("care_plan", planId);
        // The returned object is what `atomicWrite` records as the audit
        // `after` payload, so the signer and prior status are captured without
        // emitting a second audit row for the same mutation.
        return { ...updated, signed_by: this.requireActor().userId, previous_status: row.status };
      },
      () => planId,
    );
  }

  listPlansForPatient(patientId: string, includeClosed = false) {
    return this.query(
      `SELECT * FROM health.care_plans
        WHERE tenant_id = $1 AND patient_id = $2 AND voided_at IS NULL
          ${includeClosed ? "" : "AND status IN ('draft','active','paused')"}
        ORDER BY created_at DESC LIMIT 100`,
      [this.tenantId, patientId],
    );
  }

  // ── plan tasks ──────────────────────────────────────────────────────────────
  async addTask(planId: string, input: Record<string, unknown>) {
    const plan = await this.repo.findById(planId);
    if (!plan) throw DomainError.notFound("care_plan", planId);
    const errors: Record<string, string[]> = {};
    if (!input.title) errors.title = ["required"];
    oneOf(errors, "task_type", input.task_type, TASK_TYPES);
    oneOf(errors, "priority", input.priority, ["routine", "urgent", "stat"]);
    oneOf(errors, "recurrence", input.recurrence, [
      "none",
      "hourly",
      "qds",
      "tid",
      "bd",
      "od",
      "weekly",
    ]);
    if (input.recurrence && input.recurrence !== "none" && !input.interval_minutes) {
      // Without an interval the successor's due time would be a guess, so the
      // standard clinical frequency is used instead of silently skipping.
      input.recurrence = String(input.recurrence);
    }
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    return this.createVia(this.tasks, CARE_TASK_SPEC, "care_plan_task.create", {
      ...input,
      plan_id: planId,
      // Ownership comes from the plan, not from the caller.
      patient_id: plan.patient_id,
      encounter_id: plan.encounter_id ?? null,
    });
  }

  listTasksForPlan(planId: string) {
    return this.query(
      `SELECT * FROM health.care_plan_tasks
        WHERE tenant_id = $1 AND plan_id = $2 AND voided_at IS NULL
        ORDER BY due_at ASC NULLS LAST, priority DESC`,
      [this.tenantId, planId],
    );
  }

  /**
   * Complete a task. `completed_by` is the authenticated actor — never a body
   * field — so an attribution of work cannot be forged or delegated by a client.
   */
  completeTask(taskId: string, outcomeNote?: string) {
    return this.transitionTask(taskId, "done", (tx) =>
      this.applyTaskCompletion(tx, taskId, outcomeNote),
    );
  }

  skipTask(taskId: string, reason: string) {
    if (!reason || !String(reason).trim())
      throw DomainError.validation("skip_reason is required to skip a task");
    return this.transitionTask(taskId, "skipped", (tx) =>
      this.tasks.patch(tx, taskId, { skip_reason: reason }, {
        forceStatus: "skipped",
        literalSet: ["completed_at = now()"],
      }),
    );
  }

  cancelTask(taskId: string, reason?: string) {
    return this.transitionTask(taskId, "cancelled", (tx) =>
      this.tasks.patch(tx, taskId, { outcome_note: reason ?? null }, {
        forceStatus: "cancelled",
      }),
    );
  }

  startTask(taskId: string) {
    return this.transitionTask(taskId, "in_progress", (tx) =>
      this.tasks.patch(tx, taskId, undefined, { forceStatus: "in_progress" }),
    );
  }

  /** Overdue sweep. `due_at` is compared to database time, never to a client clock. */
  sweepOverdueTasks() {
    return this.atomic(
      "care_plan_task.overdue_sweep",
      "care_plan_task",
      async (tx) => {
        const rows = await tx.query(
          `UPDATE health.care_plan_tasks
              SET status = 'overdue', updated_by = $2
            WHERE tenant_id = $1 AND voided_at IS NULL
              AND status IN ('open','in_progress')
              AND due_at IS NOT NULL AND due_at < now()
          RETURNING task_id, plan_id, patient_id, due_at`,
          [this.tenantId, this.requireActor().globalUserId],
        );
        return { marked_overdue: (rows as any[]).length, tasks: rows };
      },
      () => "sweep",
    );
  }

  /** Worklist for an assignee or role, ordered by urgency then due time. */
  async taskWorklist(opts: { assignee?: string; role?: string; wardId?: string } = {}) {
    return this.query(
      `SELECT t.*, p.title AS plan_title, p.category AS plan_category,
              (t.due_at < now()) AS is_overdue
         FROM health.care_plan_tasks t
         JOIN health.care_plans p ON p.plan_id = t.plan_id
        WHERE t.tenant_id = $1 AND t.voided_at IS NULL
          AND t.status IN ('open','in_progress','overdue')
          AND ($2::uuid IS NULL OR t.assigned_to = $2)
          AND ($3::text IS NULL OR t.assigned_role = $3)
          AND ($4::uuid IS NULL OR t.ward_id = $4)
        ORDER BY CASE t.priority WHEN 'stat' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                 t.due_at ASC NULLS LAST
        LIMIT 200`,
      [this.tenantId, opts.assignee ?? null, opts.role ?? null, opts.wardId ?? null],
    );
  }

  // ── discharge summaries ─────────────────────────────────────────────────────
  async createSummary(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.encounter_id) errors.encounter_id = ["required"];
    if (!input.patient_id) errors.patient_id = ["required"];
    if (!input.diagnosis_summary) errors.diagnosis_summary = ["required"];
    oneOf(errors, "disposition", input.disposition, [
      "discharged",
      "transferred",
      "referred",
      "died",
      "ama",
    ]);
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    const live = await this.summaries.queryOne(
      `SELECT summary_id FROM health.discharge_summaries
        WHERE tenant_id = $1 AND encounter_id = $2 AND voided_at IS NULL`,
      [this.tenantId, String(input.encounter_id)],
    );
    if (live)
      throw DomainError.conflict(
        `Encounter ${input.encounter_id} already has summary ${live.summary_id}`,
      );
    return this.createVia(
      this.summaries,
      DISCHARGE_SUMMARY_SPEC,
      "discharge_summary.create",
      input,
    );
  }

  getSummary(summaryId: string) {
    return this.summaries.findById(summaryId);
  }

  updateSummary(summaryId: string, patch: Record<string, unknown>) {
    return this.atomic(
      "discharge_summary.update",
      "discharge_summary",
      async (tx) => {
        const row = await this.summaries.findById(summaryId, tx);
        if (!row) throw DomainError.notFound("discharge_summary", summaryId);
        if (row.status !== "draft")
          throw DomainError.conflict(
            "A signed summary cannot be edited; amend it to create a new version",
          );
        return this.summaries.patch(tx, summaryId, patch);
      },
      () => summaryId,
    );
  }

  signSummary(summaryId: string) {
    return this.atomic(
      "discharge_summary.sign",
      "discharge_summary",
      async (tx) => {
        const row = await this.summaries.findById(summaryId, tx);
        if (!row) throw DomainError.notFound("discharge_summary", summaryId);
        if (row.status !== "draft")
          throw DomainError.conflict(`Summary is ${row.status}; only a draft can be signed`);
        // Explicit SQL because `signed_by`/`signed_at` are attribution columns
        // that the spec whitelist keeps out of reach of a request body.
        const signed = await tx.query<any>(
          `UPDATE health.discharge_summaries
              SET status = 'signed', signed_at = now(), signed_by = $2, updated_by = $2
            WHERE summary_id = $1 AND tenant_id = $3 AND voided_at IS NULL
          RETURNING *`,
          [summaryId, this.requireActor().userId, this.tenantId],
        );
        const updated = signed[0] ?? null;
        if (!updated) throw DomainError.notFound("discharge_summary", summaryId);
        await this.events.publish({
          idempotencyKey: `beyu-evt:discharge_summary:signed:${summaryId}`,
          sectorEventId: `health-discharge_summary-signed-${summaryId}`,
          eventType: "health.continuity.discharge_summary_signed",
          domain: "clinical",
          operation: "continuity.discharge_summary",
          subjectType: "discharge_summary",
          subjectId: String(summaryId),
          classification: "CONFIDENTIAL",
          payload: {
            encounterId: String(row.encounter_id),
            disposition: row.disposition ?? null,
          },
        });
        return updated;
      },
      () => summaryId,
    );
  }

  /**
   * Supersede a signed summary. The prior row is voided (content preserved for
   * the record) and a fresh draft carrying `parent_summary_id` takes its place;
   * the partial unique index guarantees only one live version per encounter.
   */
  amendSummary(summaryId: string, changes: Record<string, unknown>) {
    return this.atomic(
      "discharge_summary.amend",
      "discharge_summary",
      async (tx) => {
        const row = await this.summaries.findById(summaryId, tx);
        if (!row) throw DomainError.notFound("discharge_summary", summaryId);
        if (row.status !== "signed")
          throw DomainError.conflict("Only a signed summary is amended by supersession");
        const voided = await this.summaries.softDelete(tx, summaryId);
        if (!voided) throw DomainError.invalidState("Summary vanished during amendment");
        const replacement = await this.summaries.insertWith(tx, {
          ...this.pickForAmend(row, changes),
          encounter_id: row.encounter_id,
          patient_id: row.patient_id,
          parent_summary_id: summaryId,
          status: "draft",
        });
        await tx.query(
          `UPDATE health.discharge_summaries SET status = 'amended'
            WHERE summary_id = $1 AND tenant_id = $2`,
          [summaryId, this.tenantId],
        );
        return { superseded: summaryId, replacement };
      },
      () => summaryId,
    );
  }

  /** Full version chain, including voided rows — the record must not lose history. */
  summaryVersions(encounterId: string) {
    return this.query(
      `SELECT summary_id, status, signed_at, signed_by, parent_summary_id,
              voided_at, created_at, diagnosis_summary
         FROM health.discharge_summaries
        WHERE tenant_id = $1 AND encounter_id = $2
        ORDER BY created_at DESC`,
      [this.tenantId, encounterId],
    );
  }

  // ── follow-ups ──────────────────────────────────────────────────────────────
  scheduleFollowup(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.patient_id) errors.patient_id = ["required"];
    if (!input.due_date) errors.due_date = ["required (YYYY-MM-DD)"];
    oneOf(errors, "source", input.source, [
      "clinic",
      "discharge",
      "referral",
      "telehealth",
      "screening",
      "campaign",
    ]);
    oneOf(errors, "channel", input.channel, [
      "in_person",
      "phone",
      "telehealth",
      "message",
    ]);
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    return this.createVia(this.followups, FOLLOWUP_SPEC, "followup.create", {
      ...input,
      status: "scheduled",
    });
  }

  transitionFollowup(followupId: string, to: string, note?: string) {
    if (!FOLLOWUP_TRANSITIONS[to] && !this.followupAllowed(followupId, to)) {
      // the async check below repeats inside the transaction; this fast path
      // exists only to give a 400 for an unknown status name.
      const known = ["scheduled", "contacted", "completed", "cancelled", "no_shown", "lost_to_follow_up"];
      if (!known.includes(to))
        throw DomainError.validation(`status must be one of ${known.join(", ")}`);
    }
    return this.atomic(
      `followup.${to}`,
      "followup",
      async (tx) => {
        const row = await this.followups.findById(followupId, tx);
        if (!row) throw DomainError.notFound("followup", followupId);
        const from = String(row.status);
        const allowed = FOLLOWUP_TRANSITIONS[from] ?? new Set<string>();
        if (!allowed.has(to))
          throw DomainError.conflict(`followup ${from} → ${to} is not allowed`);
        const literalSet: string[] = [];
        if (to === "contacted") literalSet.push("contacted_at = now()");
        if (to === "completed") literalSet.push("completed_at = now()");
        return this.followups.patch(tx, followupId, { note: note ?? null }, {
          forceStatus: to,
          literalSet,
        });
      },
      () => followupId,
    );
  }

  /**
   * Follow-ups due today or overdue. `current_date` is evaluated by the
   * database, so a client clock cannot make a due item look future-dated.
   * This is also the query the governed `clin.followup_due` Noelia tool reads,
   * which is why it is exposed here rather than re-implemented in the AI layer.
   */
  dueFollowups() {
    return this.query(
      `SELECT f.*, (f.due_date < current_date) AS is_overdue,
              (current_date - f.due_date) AS days_overdue
         FROM health.followups f
        WHERE f.tenant_id = $1 AND f.voided_at IS NULL
          AND f.status IN ('scheduled','contacted','no_shown')
          AND f.due_date <= current_date
        ORDER BY f.due_date ASC
        LIMIT 500`,
      [this.tenantId],
    );
  }

  listFollowupsForPatient(patientId: string) {
    return this.query(
      `SELECT * FROM health.followups
        WHERE tenant_id = $1 AND patient_id = $2 AND voided_at IS NULL
        ORDER BY due_date ASC`,
      [this.tenantId, patientId],
    );
  }

  // ── clinical documents (metadata registry) ─────────────────────────────────
  registerDocument(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.title) errors.title = ["required"];
    const available = input.available !== false;
    if (available) {
      if (!input.storage_ref)
        errors.storage_ref = [
          "required when available = true — file the object in governed storage first",
        ];
      if (!input.content_sha256)
        errors.content_sha256 = ["required so a later retrieval can be verified"];
    }
    if (typeof input.content_sha256 === "string" && input.content_sha256.length !== 64)
      errors.content_sha256 = ["must be a 64-character hex sha256"];
    oneOf(errors, "doc_type", input.doc_type, [
      "referral_letter",
      "discharge_summary",
      "radiology_report",
      "lab_report",
      "consent",
      "insurance",
      "government_id",
      "clinical_note",
      "imaging_study",
      "theatre_record",
      "death_certificate",
      "birth_notification",
      "other",
    ]);
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    return this.createVia(this.documents, CLINICAL_DOCUMENT_SPEC, "clinical_document.create", {
      ...input,
      // `storage_ref` is opaque by contract: a signed URL would expire in the
      // registry and silently break the record, so the caller must never put one
      // here and the service will not mint one either.
      status: "filed",
    });
  }

  /** New version of an existing document; the parent stays in the chain. */
  reviseDocument(documentId: string, input: Record<string, unknown>) {
    return this.atomic(
      "clinical_document.revise",
      "clinical_document",
      async (tx) => {
        const parent = await this.documents.findById(documentId, tx);
        if (!parent) throw DomainError.notFound("clinical_document", documentId);
        if (parent.status === "voided")
          throw DomainError.conflict("A voided document cannot be revised");
        const row = await this.documents.insertWith(tx, {
          ...this.pickForAmend(parent, input),
          patient_id: parent.patient_id,
          encounter_id: parent.encounter_id,
          parent_document_id: documentId,
          status: "filed",
        });
        await tx.query(
          `UPDATE health.clinical_documents SET available = false
            WHERE document_id = $1 AND tenant_id = $2`,
          [documentId, this.tenantId],
        );
        return {
          ...(row as object),
          supersedes: documentId,
          previous_status: parent.status,
        };
      },
      () => documentId,
    );
  }

  /**
   * Void a document row. This is a registry statement about availability, not a
   * delete: the metadata (hash, provenance) must survive so a previously
   * disclosed document can still be accounted for.
   */
  voidDocument(documentId: string, reason: string) {
    if (!reason) throw DomainError.validation("a void reason is required");
    return this.atomic(
      "clinical_document.void",
      "clinical_document",
      async (tx) => {
        const row = await this.documents.findById(documentId, tx);
        if (!row) throw DomainError.notFound("clinical_document", documentId);
        const updated = await this.documents.patch(tx, documentId, {
          available: false,
        }, { forceStatus: "voided" });
        return {
          ...(updated as object),
          previous_status: row.status,
          void_reason: reason,
        };
      },
      () => documentId,
    );
  }

  /** Version chain with `is_current`, so a UI cannot present a superseded row as live. */
  async documentsForPatient(patientId: string) {
    const rows = await this.query<any>(
      `SELECT * FROM health.clinical_documents
        WHERE tenant_id = $1 AND patient_id = $2 AND voided_at IS NULL
        ORDER BY created_at DESC LIMIT 200`,
      [this.tenantId, patientId],
    );
    const superseded = new Set(
      rows.map((r) => r.parent_document_id).filter(Boolean).map(String),
    );
    return rows.map((r) => ({
      ...r,
      is_current: !superseded.has(String(r.document_id)),
    }));
  }

  /**
   * The one place plan + task counts are computed, shared by the ward board and
   * the patient portal so staff and patient cannot see different answers.
   */
  planBoard(patientId: string) {
    return this.query(
      `SELECT p.plan_id, p.title, p.category, p.status, p.target_date, p.review_due_at,
              count(t.task_id) AS tasks,
              count(t.task_id) FILTER (WHERE t.status = 'done') AS tasks_done,
              count(t.task_id) FILTER (WHERE t.status = 'overdue') AS tasks_overdue,
              count(t.task_id) FILTER (WHERE t.status = 'skipped') AS tasks_skipped,
              min(t.due_at) FILTER (WHERE t.status IN ('open','in_progress','overdue')) AS next_due_at
         FROM health.care_plans p
         LEFT JOIN health.care_plan_tasks t
                ON t.plan_id = p.plan_id AND t.voided_at IS NULL
        WHERE p.tenant_id = $1 AND p.patient_id = $2 AND p.voided_at IS NULL
        GROUP BY p.plan_id
        ORDER BY p.created_at DESC`,
      [this.tenantId, patientId],
    );
  }

  // ── internals ───────────────────────────────────────────────────────────────
  /**
   * A transition whose state machine belongs to a sibling repository. The base
   * class transition is bound to the primary repo, so per-resource state
   * machines reuse this single path and keep the same audit discipline.
   */
  private transitionTask(
    taskId: string,
    to: string,
    work: (tx: DbConnection) => Promise<any>,
  ) {
    return this.atomic(
      `care_plan_task.${to}`,
      "care_plan_task",
      async (tx) => {
        const row = await this.tasks.findById(taskId, tx);
        if (!row) throw DomainError.notFound("care_plan_task", taskId);
        const from = String(row.status);
        const allowed = TASK_TRANSITIONS[from] ?? new Set<string>();
        if (!allowed.has(to))
          throw DomainError.conflict(`care_plan_task ${from} → ${to} is not allowed`);
        const updated = await work(tx);
        if (!updated) throw DomainError.notFound("care_plan_task", taskId);
        await this.events.publish({
          idempotencyKey: `beyu-evt:care_plan_task:${to}:${taskId}`,
          sectorEventId: `health-care_plan_task-${to}-${taskId}`,
          eventType: "health.continuity.care_plan_task_updated",
          domain: "clinical",
          operation: "continuity.care_plan_task",
          subjectType: "care_plan_task",
          subjectId: String(taskId),
          classification: "CONFIDENTIAL",
          payload: {
            planId: String(row.plan_id ?? ""),
            status: to,
            dueAt: row.due_at ?? null,
          },
        });
        return { ...(updated as object), previous_status: from };
      },
      () => taskId,
    );
  }

  /**
   * Recurring task → one successor instance. A single successor (rather than a
   * generated series) is deliberate: an unbounded expansion from one completion
   * is a denial-of-service on the ward worklist, and the next completion
   * generates the next occurrence.
   */
  private async maybeScheduleNextOccurrence(tx: DbConnection, done: any) {
    const recurrence = String(done.recurrence ?? "none");
    if (recurrence === "none" || !done.due_at) return null;
    const minutes = Number(
      done.interval_minutes ?? RECURRENCE_DEFAULT_MINUTES[recurrence] ?? 0,
    );
    if (!minutes) return null;
    return this.tasks.insertWith(tx, {
      plan_id: done.plan_id,
      patient_id: done.patient_id,
      encounter_id: done.encounter_id,
      ward_id: done.ward_id,
      task_type: done.task_type,
      title: done.title,
      instruction: done.instruction,
      priority: done.priority,
      recurrence,
      interval_minutes: minutes,
      due_at: new Date(new Date(done.due_at).getTime() + minutes * 60_000).toISOString(),
      assigned_to: done.assigned_to,
      assigned_role: done.assigned_role,
      status: "open",
    });
  }

  private followupAllowed(_id: string, to: string) {
    const known = ["scheduled", "contacted", "completed", "cancelled", "no_shown", "lost_to_follow_up"];
    return known.includes(to);
  }

  /**
   * Create a row on a sibling repository with the same discipline the base
   * service applies to the primary one: exactly-once replay on the caller's
   * idempotency key, one audit record, and the whitelisted column set only.
   */
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

  /** Copy forward the descriptive fields of a record when superseding it. */
  private pickForAmend(
    row: Record<string, unknown>,
    changes: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes ?? {})) out[k] = v;
    for (const k of [
      "diagnosis_summary",
      "procedures_done",
      "course_in_hospital",
      "condition_at_discharge",
      "dischargemeds_note",
      "follow_up_plan",
      "disposition",
      "admitted_at",
      "discharged_at",
      "ward_id",
    ]) {
      if (out[k] === undefined && row[k] !== undefined) out[k] = row[k];
    }
    for (const k of ["title", "doc_type", "mime_type", "size_bytes", "content_sha256", "storage_backend", "storage_ref", "source_system", "classification", "available"]) {
      if (out[k] === undefined && row[k] !== undefined) out[k] = row[k];
    }
    return out;
  }

  /**
   * Completion write for a task. Explicit SQL rather than `patch()` because
   * `completed_by`/`completed_at` are server-owned attribution columns: they are
   * absent from the spec's update whitelist precisely so a client can never set
   * them, so the service has to bind them itself — with the actor id and tenant
   * id passed as parameters, never interpolated.
   */
  private async applyTaskCompletion(
    tx: DbConnection,
    taskId: string,
    outcomeNote?: string,
  ) {
    const actor = this.requireActor();
    const rows = await tx.query<any>(
      `UPDATE health.care_plan_tasks
          SET status = 'done', completed_at = now(), completed_by = $2,
              outcome_note = $3, updated_by = $2
        WHERE task_id = $1 AND tenant_id = $4 AND voided_at IS NULL
      RETURNING *`,
      [taskId, actor.userId, outcomeNote ?? null, this.tenantId],
    );
    const updated = rows[0] ?? null;
    if (!updated) throw DomainError.notFound("care_plan_task", taskId);
    await this.maybeScheduleNextOccurrence(tx, updated);
    return updated;
  }
}
