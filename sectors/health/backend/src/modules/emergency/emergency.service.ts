/**
 * Emergency operations domain (migration 036): triage assessments, clinical
 * escalations, SBAR handovers and resuscitation records.
 *
 * WHY THESE FOUR TABLES AND NOT A QUEUE OF COUNTERS
 *   An emergency department's state is a set of *dated clinical acts*, not a
 *   set of statuses on a patient row. A triage category that can be edited in
 *   place is not a triage category: the whole value of the record is that it
 *   says what was observed, when, by whom, and what was done next. So:
 *     * `assess()` never updates a triage row — a re-triage is a NEW row linked
 *       by `parent_assessment_id`, and the first assessment stays as filed;
 *     * an escalation must be acknowledged by a named human before it can be
 *       resolved, and the database refuses "open with an acknowledgement time";
 *     * a handover is only "accepted" by the person it was handed to;
 *     * a resuscitation record can only be signed once it is closed, and drug
 *       and shock counts are incremented by the service rather than assigned by
 *       a caller.
 *
 * The ED "waiting" list is a query over these rows, not a table — see
 * `waitingList()`. Nothing here stores a derived status that could drift.
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

export const TRIAGE_SPEC: ResourceSpec = {
  table: "health.triage_assessments",
  pk: "assessment_id",
  insertColumns: [
    "encounter_id",
    "patient_id",
    "triage_scale",
    "acuity_level",
    "acuity_score",
    "presenting_complaint",
    "mechanism",
    "consciousness",
    "airway_patent",
    "breathing_adequate",
    "circulation_adequate",
    "exposure_done",
    "time_critical",
    "reassess_at",
    "outcome_action",
    "location",
    "notes",
    "triage_at",
    "parent_assessment_id",
    "idempotency_key",
  ],
  updateColumns: ["notes", "location", "reassess_at", "outcome_action"],
  resourceType: "triage_assessment",
  auditPrefix: "triage",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.triage_assessments.triage_at DESC",
  event: {
    eventType: "health.emergency.triage_assessed",
    domain: "clinical",
    operation: "emergency.triage",
    subjectType: "triage_assessment",
    classification: "CONFIDENTIAL",
  },
};

export const ESCALATION_SPEC: ResourceSpec = {
  table: "health.clinical_escalations",
  pk: "escalation_id",
  insertColumns: [
    "patient_id",
    "encounter_id",
    "ward_id",
    "bed_id",
    "reason",
    "trigger_type",
    "severity",
    "escalation_target",
    "breach_minutes",
    // Server-owned attribution, whitelisted so the service can set it. It is
    // NOT client-influenced: `raiseEscalation` overwrites `raised_by` with the
    // authenticated actor after spreading the body, so a supplied value never
    // survives to the row.
    "raised_by",
    "idempotency_key",
  ],
  updateColumns: [
    "reason",
    "escalation_target",
    "breach_minutes",
    "response_note",
  ],
  resourceType: "clinical_escalation",
  auditPrefix: "escalation",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.clinical_escalations.raised_at DESC",
  event: {
    eventType: "health.emergency.escalation_state_changed",
    domain: "clinical",
    operation: "emergency.escalation",
    subjectType: "clinical_escalation",
    classification: "RESTRICTED",
  },
};

export const HANDOVER_SPEC: ResourceSpec = {
  table: "health.clinical_handovers",
  pk: "handover_id",
  insertColumns: [
    "patient_id",
    "encounter_id",
    "context",
    "situation",
    "background",
    "assessment",
    "recommendation",
    "risks",
    "pending_actions",
    "to_actor",
    "to_role",
    "bed_id",
    "ward_id",
    // Set from the credential by `createHandover`, which overwrites any body
    // value for `from_actor`; `to_actor` is legitimately a choice.
    "from_actor",
    "idempotency_key",
  ],
  updateColumns: [
    "situation",
    "background",
    "assessment",
    "recommendation",
    "risks",
    "pending_actions",
    "to_actor",
    "to_role",
    "bed_id",
    "ward_id",
  ],
  resourceType: "clinical_handover",
  auditPrefix: "handover",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.clinical_handovers.handed_over_at DESC",
  event: {
    eventType: "health.emergency.handover_state_changed",
    domain: "clinical",
    operation: "emergency.handover",
    subjectType: "clinical_handover",
    classification: "CONFIDENTIAL",
  },
};

export const RESUS_SPEC: ResourceSpec = {
  table: "health.resuscitation_records",
  pk: "record_id",
  insertColumns: [
    "encounter_id",
    "patient_id",
    "arrest_rhythm",
    "advanced_airway",
    "reversible_causes",
    "timeline_note",
    "started_at",
    // `team_lead` is the actor's identity claim, overwritten by `startResus`.
    "team_lead",
    "idempotency_key",
  ],
  // Deliberately narrow: `shocks_delivered`, `epinephrine_doses`, `outcome`,
  // `ended_at`, `status` and the signature columns are set only by the
  // operations that own them, so a count can never be overwritten wholesale.
  updateColumns: ["arrest_rhythm", "advanced_airway", "reversible_causes"],
  resourceType: "resuscitation_record",
  auditPrefix: "resus",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.resuscitation_records.started_at DESC",
  event: {
    eventType: "health.emergency.resuscitation_record_changed",
    domain: "clinical",
    operation: "emergency.resuscitation",
    subjectType: "resuscitation_record",
    classification: "RESTRICTED",
  },
};

const ACUITY_ORDINAL: Record<string, number> = {
  red: 0,
  orange: 1,
  yellow: 2,
  green: 3,
  blue: 4,
};
const SCALES = [
  "mtuha_etat",
  "manchester",
  "canadian_ctas",
  "starts",
  "handysa",
] as const;
/**
 * Response-time targets for an escalation, in minutes, by severity. These are
 * the numbers the shift coordinator is measured against; they live here rather
 * than in the client so the breach cannot be negotiated by the caller.
 */
const ESCALATION_TARGET_MINUTES: Record<string, number> = {
  emergency: 5,
  urgent: 30,
  advisory: 240,
};
const HANDOVER_CONTEXTS = [
  "emergency_to_ward",
  "ward_shift",
  "theatre_to_recovery",
  "recovery_to_ward",
  "ward_to_referral",
  "telehealth_to_inperson",
  "ambulance_to_ed",
] as const;

@Injectable()
export class TriageRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, TRIAGE_SPEC);
  }
}
@Injectable()
export class EscalationRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, ESCALATION_SPEC);
  }
}
@Injectable()
export class HandoverRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, HANDOVER_SPEC);
  }
}
@Injectable()
export class ResusRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, RESUS_SPEC);
  }
}

@Injectable()
export class EmergencyService extends ResourceDomainService {
  constructor(
    // @Inject is load-bearing, not decoration: DbConnection is an
    // interface, so without the token Nest cannot resolve the provider and the
    // whole application fails to boot (the real-PostgreSQL CI gate catches this;
    // a PGlite unit spec that constructs the service by hand does not).
    @Inject(DB_CONNECTION) db: DbConnection,
    private readonly ctx: TenantContext,
    audit: AuditService,
    private readonly events: EventOutboxService,
    private readonly triage: TriageRepository,
    private readonly escalations: EscalationRepository,
    private readonly handovers: HandoverRepository,
    private readonly resus: ResusRepository,
  ) {
    super(
      { repo: triage, audit, db, tenantCtx: ctx, outbox: events },
      TRIAGE_SPEC,
      {
        validateCreate: (input) => {
          const errors: Record<string, string[]> = {};
          if (!input.encounter_id) errors.encounter_id = ["required"];
          if (!input.patient_id) errors.patient_id = ["required"];
          if (!input.presenting_complaint)
            errors.presenting_complaint = ["required"];
          const level =
            input.acuity_level === undefined
              ? null
              : String(input.acuity_level);
          if (!level || !(level in ACUITY_ORDINAL))
            errors.acuity_level = [
              `must be one of ${Object.keys(ACUITY_ORDINAL).join(", ")}`,
            ];
          if (
            input.triage_scale !== undefined &&
            !SCALES.includes(input.triage_scale as any)
          )
            errors.triage_scale = [`must be one of ${SCALES.join(", ")}`];
          // The colour/score pairing is checked here as well as in the table so
          // a mismatched pair is reported as "yellow with score 5?" rather than
          // as a database error leaking a constraint name.
          if (
            typeof input.acuity_score === "number" &&
            level &&
            level in ACUITY_ORDINAL
          ) {
            const expected = ACUITY_ORDINAL[level] + 1;
            if (input.acuity_score !== expected)
              errors.acuity_score = [
                `must be ${expected} for ${level} on this scale`,
              ];
          }
          if (Object.keys(errors).length) throw DomainError.validation(errors);
        },
        eventPayload: (_kind, row) => ({
          acuityLevel: row.acuity_level ?? null,
          scale: row.triage_scale ?? null,
          outcomeAction: row.outcome_action ?? null,
          timeCritical: !!row.time_critical,
        }),
      },
    );
  }

  private get tenantId(): string {
    return this.ctx.tenantId();
  }

  // ── triage ──────────────────────────────────────────────────────────────────
  /** Record a triage assessment for an encounter. */
  assess(input: Record<string, unknown>) {
    return super.create(input);
  }

  /**
   * Re-triage: a NEW assessment linked to the one it follows. The original is
   * never rewritten — the deterioration (or improvement) is the clinical fact,
   * and both observations have to survive to show it.
   */
  reassess(parentAssessmentId: string, input: Record<string, unknown>) {
    return this.atomic(
      "triage.reassess",
      "triage_assessment",
      async (tx) => {
        const parent = await this.triage.findById(parentAssessmentId, tx);
        if (!parent)
          throw DomainError.notFound("triage_assessment", parentAssessmentId);
        const row = await this.triage.insert(tx, {
          ...input,
          encounter_id: parent.encounter_id,
          patient_id: parent.patient_id,
          parent_assessment_id: parentAssessmentId,
        });
        if (!row)
          throw DomainError.invalidState("Re-assessment produced no row");
        await this.events.publish({
          idempotencyKey: `beyu-evt:triage_assessment:reassess:${row.assessment_id}`,
          sectorEventId: `health-triage-reassess-${row.assessment_id}`,
          eventType: "health.emergency.triage_reassessed",
          domain: "clinical",
          operation: "emergency.triage",
          subjectType: "triage_assessment",
          subjectId: String(row.assessment_id),
          classification: "CONFIDENTIAL",
          payload: {
            parentAssessmentId,
            from: parent.acuity_level,
            to: row.acuity_level,
            deteriorated:
              ACUITY_ORDINAL[String(row.acuity_level)] <
              ACUITY_ORDINAL[String(parent.acuity_level)],
          },
        });
        return row;
      },
      (r: any) => String(r.assessment_id),
    );
  }

  assessmentTimeline(encounterId: string) {
    return this.query(
      `SELECT * FROM health.triage_assessments
        WHERE encounter_id = $1 AND tenant_id = $2 AND voided_at IS NULL
        ORDER BY triage_at ASC`,
      [encounterId, this.tenantId],
    );
  }

  /**
   * The department's waiting list: the LATEST un-re-triaged assessment per
   * encounter, ordered by acuity then by time waiting. Highest acuity first,
   * and within a category the longest-waiting patient first.
   */
  waitingList() {
    // The DISTINCT ON that reduces an encounter to its latest assessment has to
    // lead the inner ORDER BY — which is exactly why the acuity ordering lives
    // in the outer query. Ordering the inner query by acuity instead would make
    // Postgres return the list in encounter order and quietly scramble
    // who-is-seen-first.
    return this.triage.query<any>(
      `SELECT * FROM (
         SELECT DISTINCT ON (t.encounter_id)
                t.assessment_id, t.encounter_id, t.patient_id, t.acuity_level,
                t.acuity_score, t.presenting_complaint, t.triage_at, t.location,
                t.time_critical, t.reassess_at,
                EXTRACT(EPOCH FROM (now() - t.triage_at))::int AS waiting_seconds,
                (t.reassess_at IS NOT NULL AND t.reassess_at < now()) AS reassessment_due
           FROM health.triage_assessments t
          WHERE t.tenant_id = $1 AND t.voided_at IS NULL
            AND NOT EXISTS (
                  SELECT 1 FROM health.triage_assessments c
                   WHERE c.parent_assessment_id = t.assessment_id
                     AND c.voided_at IS NULL
                )
            AND t.outcome_action IS DISTINCT FROM 'discharged'
          ORDER BY t.encounter_id, t.triage_at DESC
       ) x
       ORDER BY CASE x.acuity_level
                  WHEN 'red' THEN 0 WHEN 'orange' THEN 1 WHEN 'yellow' THEN 2
                  WHEN 'green' THEN 3 ELSE 4 END,
                x.time_critical DESC,
                x.triage_at ASC`,
      [this.tenantId],
    );
  }

  /**
   * Assessments whose scheduled re-assessment time has passed with nothing
   * recorded since — the queue a charge nurse acts on.
   */
  overdueReassessments() {
    return this.query(
      `SELECT t.assessment_id, t.encounter_id, t.patient_id, t.acuity_level,
              t.reassess_at,
              EXTRACT(EPOCH FROM (now() - t.reassess_at))::int AS overdue_seconds
         FROM health.triage_assessments t
        WHERE t.tenant_id = $1 AND t.voided_at IS NULL
          AND t.reassess_at IS NOT NULL AND t.reassess_at < now()
          AND NOT EXISTS (
                SELECT 1 FROM health.triage_assessments c
                 WHERE c.parent_assessment_id = t.assessment_id
                   AND c.voided_at IS NULL
              )
        ORDER BY overdue_seconds DESC
        LIMIT 200`,
      [this.tenantId],
    );
  }

  /** Departure from the department is recorded on the assessment, not a counter. */
  dispose(assessmentId: string, outcomeAction: string) {
    const allowed = [
      "resus",
      "major_zone",
      "minor_zone",
      "observation",
      "discharged",
      "admitted",
      "transferred",
      "deceased",
    ];
    if (!allowed.includes(outcomeAction))
      throw DomainError.validation(
        `outcome_action must be one of ${allowed.join(", ")}`,
      );
    return this.atomic(
      "triage.disposition",
      "triage_assessment",
      async (tx) => {
        const row = await this.triage.findById(assessmentId, tx);
        if (!row) throw DomainError.notFound("triage_assessment", assessmentId);
        const updated = await this.triage.patch(tx, assessmentId, {
          outcome_action: outcomeAction,
        });
        if (!updated)
          throw DomainError.notFound("triage_assessment", assessmentId);
        // The returned object is the audit `after` payload, so the transition
        // is reconstructable without emitting a second audit entry.
        return {
          ...updated,
          previous_outcome_action: row.outcome_action ?? null,
        };
      },
      () => assessmentId,
    );
  }

  // ── escalations ─────────────────────────────────────────────────────────────
  raiseEscalation(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.patient_id) errors.patient_id = ["required"];
    if (!input.reason)
      errors.reason = ["required — say what you are worried about"];
    if (
      input.severity !== undefined &&
      !["advisory", "urgent", "emergency"].includes(String(input.severity))
    )
      errors.severity = ["must be advisory, urgent or emergency"];
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    return this.createVia(
      this.escalations,
      ESCALATION_SPEC,
      "escalation.raise",
      { ...input, status: "open", raised_by: this.requireActor().userId },
    );
  }

  /**
   * Acknowledge an escalation. The acknowledging user is the actor, and the
   * status/timestamp pair moves together because the table refuses an
   * acknowledgement time on an escalation that is still open.
   */
  acknowledgeEscalation(escalationId: string) {
    return this.escalationStep(escalationId, "acknowledged", {
      actorColumn: "acknowledged_by",
      atColumn: "acknowledged_at",
    });
  }

  actionEscalation(escalationId: string, note: string) {
    if (!note) throw DomainError.validation("response_note is required");
    return this.escalationStep(escalationId, "actioned", {
      note,
    });
  }

  resolveEscalation(escalationId: string, note: string) {
    if (!note)
      throw DomainError.validation(
        "a resolution note is required — an escalation closes with what was done",
      );
    return this.escalationStep(escalationId, "resolved", {
      note,
      actorColumn: "resolved_by",
      atColumn: "resolved_at",
    });
  }

  cancelEscalation(escalationId: string, note: string) {
    if (!note) throw DomainError.validation("a cancellation note is required");
    return this.escalationStep(escalationId, "cancelled", { note });
  }

  /**
   * Open escalations with the response clock. `breached` is computed against
   * ESCALATION_TARGET_MINUTES in the database, so the on-call list and the
   * audit report agree on what a breach is.
   */
  openEscalations() {
    return this.query(
      `SELECT e.*,
              EXTRACT(EPOCH FROM (now() - e.raised_at))::int / 60 AS minutes_waiting,
              (EXTRACT(EPOCH FROM (now() - e.raised_at))::int / 60) >
                CASE e.severity
                  WHEN 'emergency' THEN ${ESCALATION_TARGET_MINUTES.emergency}
                  WHEN 'urgent' THEN ${ESCALATION_TARGET_MINUTES.urgent}
                  ELSE ${ESCALATION_TARGET_MINUTES.advisory} END AS breached
         FROM health.clinical_escalations e
        WHERE e.tenant_id = $1 AND e.voided_at IS NULL
          AND e.status IN ('open','acknowledged','actioned')
        ORDER BY CASE e.severity
                   WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                 e.raised_at ASC
        LIMIT 200`,
      [this.tenantId],
    );
  }

  /** Response-time targets, published so the standard is visible to staff. */
  escalationTargets() {
    return { ...ESCALATION_TARGET_MINUTES };
  }

  // ── handovers (SBAR) ────────────────────────────────────────────────────────
  createHandover(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.patient_id) errors.patient_id = ["required"];
    if (!input.situation)
      errors.situation = ["required — SBAR starts with the situation"];
    if (
      input.context !== undefined &&
      !HANDOVER_CONTEXTS.includes(String(input.context) as any)
    )
      errors.context = [`must be one of ${HANDOVER_CONTEXTS.join(", ")}`];
    if (!input.to_actor && !input.to_role)
      errors.to_role = [
        "a handover must name a receiver or a receiving role; unassigned handovers are how patients are dropped",
      ];
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    return this.createVia(this.handovers, HANDOVER_SPEC, "handover.create", {
      ...input,
      status: "pending",
      from_actor: this.requireActor().userId,
    });
  }

  /**
   * Accept a handover. If it was addressed to a role rather than a person, the
   * accepting user becomes the named receiver — the record must show who the
   * patient was actually handed to, not just which role was expected.
   */
  acceptHandover(handoverId: string) {
    return this.atomic(
      "handover.accept",
      "clinical_handover",
      async (tx) => {
        const row = await this.handovers.findById(handoverId, tx);
        if (!row) throw DomainError.notFound("clinical_handover", handoverId);
        if (row.status !== "pending")
          throw DomainError.conflict(
            `Handover is ${row.status}; only pending can be accepted`,
          );
        const actor = this.requireActor().userId;
        if (row.to_actor && String(row.to_actor) !== actor)
          throw DomainError.forbidden(
            "This handover was addressed to another clinician; supersede it to pass it on",
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.clinical_handovers
                SET status = 'accepted', accepted_at = now(), to_actor = $2
              WHERE handover_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [handoverId, actor, this.tenantId],
          )
        )[0];
        if (!updated)
          throw DomainError.notFound("clinical_handover", handoverId);
        return { ...updated, previous_status: row.status };
      },
      () => handoverId,
    );
  }

  declineHandover(handoverId: string, reason: string) {
    if (!reason)
      throw DomainError.validation(
        "a decline reason is required — the refuser must say why",
      );
    return this.atomic(
      "handover.decline",
      "clinical_handover",
      async (tx) => {
        const row = await this.handovers.findById(handoverId, tx);
        if (!row) throw DomainError.notFound("clinical_handover", handoverId);
        if (row.status !== "pending")
          throw DomainError.conflict(`Handover is ${row.status}`);
        return (
          (
            await tx.query<any>(
              `UPDATE health.clinical_handovers
                SET status = 'declined', declined_at = now(), decline_reason = $2,
                    to_actor = coalesce(to_actor, $3)
              WHERE handover_id = $1 AND tenant_id = $4 AND voided_at IS NULL
            RETURNING *`,
              [handoverId, reason, this.requireActor().userId, this.tenantId],
            )
          )[0] ?? null
        );
      },
      () => handoverId,
    );
  }

  /**
   * Supersede a pending handover with a corrected one. The original is kept and
   * linked via `superseded_by` so the shift record shows what was handed over
   * first and what replaced it.
   */
  supersedeHandover(handoverId: string, input: Record<string, unknown>) {
    return this.atomic(
      "handover.supersede",
      "clinical_handover",
      async (tx) => {
        const old = await this.handovers.findById(handoverId, tx);
        if (!old) throw DomainError.notFound("clinical_handover", handoverId);
        if (old.status !== "pending")
          throw DomainError.conflict(
            "An accepted handover is not superseded; raise a new one for the receiving team",
          );
        const next = await this.handovers.insert(tx, {
          ...input,
          patient_id: old.patient_id,
          encounter_id: old.encounter_id,
          status: "pending",
          from_actor: this.requireActor().userId,
        });
        await tx.query<any>(
          `UPDATE health.clinical_handovers
              SET status = 'superseded', superseded_by = $2
            WHERE handover_id = $1 AND tenant_id = $3 AND voided_at IS NULL`,
          [handoverId, next?.handover_id ?? null, this.tenantId],
        );
        return { superseded: handoverId, handover: next };
      },
      () => handoverId,
    );
  }

  handoversForWard(wardId?: string) {
    return this.query(
      `SELECT h.*, p.given_name, p.family_name
         FROM health.clinical_handovers h
         JOIN health.patients p ON p.patient_id = h.patient_id
        WHERE h.tenant_id = $1 AND h.voided_at IS NULL
          AND ($2::uuid IS NULL OR h.ward_id = $2)
          AND h.status = 'pending'
        ORDER BY h.handed_over_at ASC LIMIT 200`,
      [this.tenantId, wardId ?? null],
    );
  }

  // ── resuscitation records ───────────────────────────────────────────────────
  startResus(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.encounter_id) errors.encounter_id = ["required"];
    if (!input.patient_id) errors.patient_id = ["required"];
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    return this.createVia(this.resus, RESUS_SPEC, "resus.start", {
      ...input,
      status: "in_progress",
      team_lead: this.requireActor().userId,
    });
  }

  /**
   * Append a timed entry. Entries are concatenated with a wall-clock prefix
   * computed by the database, and the column is never overwritten, so a drug
   * given at 03:12 stays in the record no matter how many updates follow.
   */
  noteResus(recordId: string, note: string) {
    if (!note) throw DomainError.validation("note text is required");
    return this.atomic(
      "resus.note",
      "resuscitation_record",
      async (tx) => {
        const row = await this.resus.findById(recordId, tx);
        if (!row) throw DomainError.notFound("resuscitation_record", recordId);
        if (row.status === "signed")
          throw DomainError.conflict(
            "A signed resuscitation record cannot be amended",
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.resuscitation_records
                SET timeline_note =
                      coalesce(timeline_note || E'\n', '') ||
                      '[' || to_char(now(), 'HH24:MI:SS') || '] ' || $2
              WHERE record_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [recordId, note, this.tenantId],
          )
        )[0];
        return updated;
      },
      () => recordId,
    );
  }

  /** Counters move by increments; a caller cannot set "shocks = 0". */
  recordShocks(recordId: string, count = 1) {
    return this.recordResusCount(recordId, "shocks_delivered", count);
  }

  recordEpinephrine(recordId: string, count = 1) {
    return this.recordResusCount(recordId, "epinephrine_doses", count);
  }

  closeResus(
    recordId: string,
    outcome: string,
    opts: { ended_at?: string; reversible_causes?: string } = {},
  ) {
    if (
      !["rosc", "death", "transferred", "ongoing", "unknown"].includes(outcome)
    )
      throw DomainError.validation(
        "outcome must be one of rosc, death, transferred, ongoing, unknown",
      );
    return this.atomic(
      "resus.close",
      "resuscitation_record",
      async (tx) => {
        const row = await this.resus.findById(recordId, tx);
        if (!row) throw DomainError.notFound("resuscitation_record", recordId);
        if (row.status !== "in_progress")
          throw DomainError.conflict(`Record is ${row.status}`);
        const updated = (
          await tx.query<any>(
            `UPDATE health.resuscitation_records
                SET status = 'closed', outcome = $2,
                    ended_at = coalesce($3::timestamptz, now()),
                    reversible_causes = coalesce($4, reversible_causes)
              WHERE record_id = $1 AND tenant_id = $5 AND voided_at IS NULL
                AND coalesce($3::timestamptz, now()) >= started_at
            RETURNING *`,
            [
              recordId,
              outcome,
              opts.ended_at ?? null,
              opts.reversible_causes ?? null,
              this.tenantId,
            ],
          )
        )[0];
        if (!updated)
          throw DomainError.validation(
            "ended_at must not precede started_at — the record was not closed",
          );
        return updated;
      },
      () => recordId,
    );
  }

  /**
   * Sign the record. Only a closed record can be signed, and the signer is the
   * authenticated actor: the table CHECK refuses a signature without both a
   * signer and a time, so a "signed" resus note always names a human.
   */
  signResus(recordId: string) {
    return this.atomic(
      "resus.sign",
      "resuscitation_record",
      async (tx) => {
        const row = await this.resus.findById(recordId, tx);
        if (!row) throw DomainError.notFound("resuscitation_record", recordId);
        if (row.status !== "closed")
          throw DomainError.conflict(
            `Record is ${row.status}; close it with an outcome before signing`,
          );
        const signed = (
          await tx.query<any>(
            `UPDATE health.resuscitation_records
                SET status = 'signed', signed_at = now(), signed_by = $2
              WHERE record_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [recordId, this.requireActor().userId, this.tenantId],
          )
        )[0];
        if (!signed)
          throw DomainError.notFound("resuscitation_record", recordId);
        return signed;
      },
      () => recordId,
    );
  }

  /**
   * Correct the descriptive fields of a resuscitation record (rhythm, airway,
   * reversible causes). Counts, outcome and the signature are NOT reachable
   * here — they belong to `recordShocks`, `closeResus` and `signResus` — and a
   * signed record is closed to every write.
   */
  updateResusClinical(recordId: string, input: Record<string, unknown>) {
    return this.atomic(
      "resus.update",
      "resuscitation_record",
      async (tx) => {
        const row = await this.resus.findById(recordId, tx);
        if (!row) throw DomainError.notFound("resuscitation_record", recordId);
        if (row.status === "signed")
          throw DomainError.conflict(
            "A signed resuscitation record cannot be amended",
          );
        const allowed = [
          "arrest_rhythm",
          "advanced_airway",
          "reversible_causes",
        ];
        const patch: Record<string, unknown> = {};
        for (const k of allowed) {
          if (input[k] !== undefined) patch[k] = input[k];
        }
        if (!Object.keys(patch).length)
          throw DomainError.validation(
            `only ${allowed.join(", ")} can be corrected; use the operations that own the rest`,
          );
        return this.resus.patch(tx, recordId, patch);
      },
      () => recordId,
    );
  }

  // ── internals ───────────────────────────────────────────────────────────────
  /**
   * Create on a sibling repository with the same discipline as the base
   * service's `create`: idempotent replay, one audit record, whitelist only.
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

  private async recordResusCount(
    recordId: string,
    column: "shocks_delivered" | "epinephrine_doses",
    count: number,
  ) {
    const n = Math.trunc(Number(count));
    if (!Number.isFinite(n) || n < 1 || n > 50)
      throw DomainError.validation(
        `${column} increment must be between 1 and 50`,
      );
    return this.atomic(
      `resus.${column}`,
      "resuscitation_record",
      async (tx) => {
        const row = await this.resus.findById(recordId, tx);
        if (!row) throw DomainError.notFound("resuscitation_record", recordId);
        if (row.status === "signed")
          throw DomainError.conflict(
            "A signed resuscitation record cannot be amended",
          );
        return (
          await tx.query<any>(
            `UPDATE health.resuscitation_records
                SET ${column} = ${column} + $2
              WHERE record_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [recordId, n, this.tenantId],
          )
        )[0];
      },
      () => recordId,
    );
  }

  /**
   * One shared path for escalation steps, so an acknowledgement can never be
   * recorded without a named human and a resolution can never be recorded
   * without a note.
   */
  private escalationStep(
    escalationId: string,
    to: "acknowledged" | "actioned" | "resolved" | "cancelled",
    opts: {
      note?: string;
      actorColumn?: "acknowledged_by" | "resolved_by";
      atColumn?: "acknowledged_at" | "resolved_at";
    } = {},
  ) {
    const ALLOWED: Record<string, Set<string>> = {
      open: new Set(["acknowledged", "cancelled"]),
      acknowledged: new Set(["actioned", "resolved", "cancelled"]),
      actioned: new Set(["resolved", "cancelled"]),
      resolved: new Set([]),
      cancelled: new Set([]),
    };
    return this.atomic(
      `escalation.${to}`,
      "clinical_escalation",
      async (tx) => {
        const row = await this.escalations.findById(escalationId, tx);
        if (!row)
          throw DomainError.notFound("clinical_escalation", escalationId);
        const from = String(row.status);
        if (!ALLOWED[from]?.has(to))
          throw DomainError.conflict(
            `escalation ${from} → ${to} is not allowed`,
          );
        const actor = this.requireActor().userId;
        // $1 id, $2 new status, $3 actor, $4 tenant, [$5 note]
        const sets = ["status = $2", "updated_by = $3"];
        const params: unknown[] = [escalationId, to, actor, this.tenantId];
        if (opts.atColumn && opts.actorColumn) {
          sets.push(`${opts.atColumn} = now()`, `${opts.actorColumn} = $3`);
        }
        if (opts.note !== undefined) {
          params.push(opts.note);
          sets.push(`response_note = $${params.length}`);
        }
        const updated = (
          await tx.query<any>(
            `UPDATE health.clinical_escalations
                SET ${sets.join(", ")}
              WHERE escalation_id = $1 AND tenant_id = $4 AND voided_at IS NULL
            RETURNING *`,
            params,
          )
        )[0];
        if (!updated)
          throw DomainError.notFound("clinical_escalation", escalationId);
        await this.events.publish({
          idempotencyKey: `beyu-evt:clinical_escalation:${to}:${escalationId}`,
          sectorEventId: `health-escalation-${to}-${escalationId}`,
          eventType: "health.emergency.escalation_state_changed",
          domain: "clinical",
          operation: "emergency.escalation",
          subjectType: "clinical_escalation",
          subjectId: String(escalationId),
          classification: "RESTRICTED",
          payload: {
            from,
            to,
            severity: row.severity,
            target: row.escalation_target ?? null,
          },
        });
        return { ...updated, previous_status: from };
      },
      () => escalationId,
    );
  }
}
