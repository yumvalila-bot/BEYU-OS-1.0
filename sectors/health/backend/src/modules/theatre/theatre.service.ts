/**
 * Theatre & surgical domain (migration 038): theatres, cases, team, WHO
 * pre-op checklist and anaesthesia records.
 *
 * REUSE INSTEAD OF A SECOND PARALLEL STATE
 *   Recovery is NOT a bed state tracked here. A case moving to recovery
 *   allocates a real bed through the capacity domain (`CapacityService`), so
 *   the ward board, the turnaround queue and the recovery bed cannot disagree.
 *   Theatre cleaning likewise reuses `health.service_turnarounds`.
 *
 * THE GATE THAT MATTERS
 *   `startCase` refuses unless the readiness checklist is genuinely satisfied:
 *   a signed pre-op checklist, a confirmed surgeon and anaesthetist whose
 *   credentials are not `expired`/`external_verification_required`, and consent
 *   — with consent waivable only for `crash` urgency and only with a written
 *   justification in `notes`. Every one of those is a fact in a table, not a
 *   boolean a client can post.
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
import { CapacityService } from "../capacity/capacity.service";

export const THEATRE_SPEC: ResourceSpec = {
  table: "health.operating_theatres",
  pk: "theatre_id",
  insertColumns: [
    "facility_id",
    "theatre_code",
    "name",
    "theatre_type",
    "status",
    "available_from",
    "available_to",
    "features",
  ],
  updateColumns: [
    "facility_id",
    "name",
    "theatre_type",
    "status",
    "available_from",
    "available_to",
    "features",
  ],
  resourceType: "operating_theatre",
  auditPrefix: "theatre",
  listOrder: "health.operating_theatres.theatre_code",
};

export const SURGICAL_CASE_SPEC: ResourceSpec = {
  table: "health.surgical_cases",
  pk: "case_id",
  insertColumns: [
    "patient_id",
    "encounter_id",
    "theatre_id",
    "department_id",
    "primary_procedure_title",
    "procedure_code",
    "procedure_code_system",
    "indication",
    "urgency",
    "consent_id",
    "site_laterality",
    "scheduled_start_at",
    "scheduled_end_at",
    "notes",
    "idempotency_key",
  ],
  updateColumns: [
    "encounter_id",
    "theatre_id",
    "department_id",
    "primary_procedure_title",
    "procedure_code",
    "procedure_code_system",
    "indication",
    "urgency",
    "consent_id",
    "site_laterality",
    "scheduled_start_at",
    "scheduled_end_at",
    "notes",
    "recovery_bed_id",
  ],
  resourceType: "surgical_case",
  auditPrefix: "surgical_case",
  numberColumn: "case_no",
  numberPrefix: "SURG",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.surgical_cases.scheduled_start_at ASC NULLS LAST",
  event: {
    eventType: "health.theatre.case_state_changed",
    domain: "clinical",
    operation: "theatre.case",
    subjectType: "surgical_case",
    classification: "CONFIDENTIAL",
  },
};

export const SURGICAL_TEAM_SPEC: ResourceSpec = {
  table: "health.surgical_team_members",
  pk: "team_member_id",
  insertColumns: ["case_id", "global_user_id", "provider_id", "role", "note"],
  updateColumns: ["note", "provider_id", "role"],
  resourceType: "surgical_team_member",
  auditPrefix: "surgical_team",
  // Not soft-deletable semantics here: removing a named member from a case is
  // recorded by the audit ledger, and the row must remain for the record.
};

export const PREOP_CHECKLIST_SPEC: ResourceSpec = {
  table: "health.preop_checklists",
  pk: "checklist_id",
  insertColumns: ["case_id", "template", "status"],
  updateColumns: ["template"],
  resourceType: "preop_checklist",
  auditPrefix: "preop_checklist",
};

export const PREOP_ITEM_SPEC: ResourceSpec = {
  table: "health.preop_checklist_items",
  pk: "item_id",
  insertColumns: [
    "checklist_id",
    "item_key",
    "label",
    "required",
    "note",
    "position",
    "checked",
    "checked_by",
    "checked_at",
  ],
  updateColumns: ["label", "required", "note", "position"],
  resourceType: "preop_checklist_item",
  auditPrefix: "preop_checklist_item",
  tracksUpdater: false,
  listOrder: "health.preop_checklist_items.position ASC",
};

export const ANAESTHESIA_SPEC: ResourceSpec = {
  table: "health.anaesthesia_records",
  pk: "anaesthesia_id",
  insertColumns: [
    "case_id",
    "patient_id",
    "asa_class",
    "pre_assessment",
    "airway_assessment",
    "technique",
    "induction_at",
    "intubated",
    "agents_summary",
    "intraop_events",
    "fluids_blood_given",
    "anaesthetist_provider_id",
    "idempotency_key",
    // Service-owned, never client-owned: `amendAnaesthesia` sets the parent link
    // and `recordAnaesthesia` forces the status. insert() filters on this list,
    // so a column that is not here is silently dropped — which would have made
    // the supersedence chain invisible in the record itself.
    "parent_record_id",
    "status",
  ],
  updateColumns: [
    "asa_class",
    "pre_assessment",
    "airway_assessment",
    "technique",
    "induction_at",
    "intubated",
    "agents_summary",
    "intraop_events",
    "fluids_blood_given",
    "extubation_at",
    "aldrete_score",
    "recovery_grade",
    "anaesthetist_provider_id",
  ],
  resourceType: "anaesthesia_record",
  auditPrefix: "anaesthesia",
  idempotencyColumn: "idempotency_key",
  event: {
    eventType: "health.theatre.anaesthesia_record_changed",
    domain: "clinical",
    operation: "theatre.anaesthesia",
    subjectType: "anaesthesia_record",
    classification: "CONFIDENTIAL",
  },
};

const CASE_TRANSITIONS: Record<string, Set<string>> = {
  requested: new Set(["scheduled", "postponed", "cancelled"]),
  scheduled: new Set(["in_preop", "postponed", "cancelled"]),
  in_preop: new Set(["in_theatre", "postponed", "cancelled"]),
  in_theatre: new Set(["in_recovery", "completed", "cancelled"]),
  in_recovery: new Set(["completed"]),
  postponed: new Set(["scheduled", "cancelled"]),
};
const TEAM_ROLES = [
  "surgeon",
  "assistant",
  "anaesthetist",
  "anaesthesia_assistant",
  "scrub_nurse",
  "circulating_nurse",
  "recovery_nurse",
  "observer",
  "engineer",
  "interpreter",
] as const;

/** The WHO surgical safety checklist, split at the three mandated pauses. */
const WHO_ITEMS: Array<[string, string, number]> = [
  [
    "sign_in_confirmation",
    "Patient identity, site, procedure and consent confirmed",
    1,
  ],
  ["sign_in_site_marking", "Surgical site marked", 2],
  ["sign_in_anaesthesia", "Anaesthesia safety check complete", 3],
  ["sign_in_availability", "Emergency airway and equipment available", 4],
  ["time_out_intro", "Whole team has introduced themselves and their roles", 5],
  ["time_out_critical", "Critical/sudden blood loss steps understood", 6],
  [
    "time_out_procedure",
    "Surgeon, anaesthetist and nurse review what is anticipated",
    7,
  ],
  ["time_out_sterility", "Sterility confirmed, implant correct", 8],
  ["time_out_injury", "Positioning and precautions to prevent injury", 9],
  [
    "time_out_prophylaxis",
    "Antibiotic prophylaxis given within the last 60 minutes",
    10,
  ],
  ["sign_out_counts", "Instrument, sponge and needle counts correct", 11],
  ["sign_out_specimen", "Specimen labelling complete and read back", 12],
  [
    "sign_out_recovery",
    "Key concerns for recovery and management surfaced",
    13,
  ],
];

@Injectable()
export class TheatreRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, THEATRE_SPEC);
  }
}
@Injectable()
export class SurgicalCaseRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, SURGICAL_CASE_SPEC);
  }
}
@Injectable()
export class SurgicalTeamRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, SURGICAL_TEAM_SPEC);
  }
}
@Injectable()
export class PreopChecklistRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, PREOP_CHECKLIST_SPEC);
  }
}
@Injectable()
export class PreopItemRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, PREOP_ITEM_SPEC);
  }
}
@Injectable()
export class AnaesthesiaRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, ANAESTHESIA_SPEC);
  }
}

@Injectable()
export class TheatreService extends ResourceDomainService {
  constructor(
    db: DbConnection,
    private readonly ctx: TenantContext,
    audit: AuditService,
    private readonly events: EventOutboxService,
    private readonly theatres: TheatreRepository,
    private readonly cases: SurgicalCaseRepository,
    private readonly team: SurgicalTeamRepository,
    private readonly checklists: PreopChecklistRepository,
    private readonly items: PreopItemRepository,
    private readonly anaesthesia: AnaesthesiaRepository,
    private readonly capacity: CapacityService,
  ) {
    super(
      { repo: cases, audit, db, tenantCtx: ctx, outbox: events },
      SURGICAL_CASE_SPEC,
      {
        transitions: CASE_TRANSITIONS,
        validateCreate: (input) => {
          const errors: Record<string, string[]> = {};
          if (!input.patient_id) errors.patient_id = ["required"];
          if (!input.primary_procedure_title)
            errors.primary_procedure_title = ["required"];
          if (
            input.urgency !== undefined &&
            !["elective", "urgent", "emergent", "crash"].includes(
              String(input.urgency),
            )
          )
            errors.urgency = ["must be elective, urgent, emergent or crash"];
          if (
            input.site_laterality !== undefined &&
            ![
              "right",
              "left",
              "bilateral",
              "not_applicable",
              "unknown",
            ].includes(String(input.site_laterality))
          )
            errors.site_laterality = ["unrecognised laterality"];
          if (Object.keys(errors).length) throw DomainError.validation(errors);
        },
        eventPayload: (kind, row) => ({
          caseNo: row.case_no ?? null,
          status: row.status ?? null,
          urgency: row.urgency ?? null,
          theatreId: row.theatre_id ?? null,
          kind,
        }),
      },
    );
  }

  private get tenantId(): string {
    return this.ctx.tenantId();
  }

  // ── theatre registry ────────────────────────────────────────────────────────
  createTheatre(input: Record<string, unknown>) {
    if (!input.theatre_code || !input.name)
      throw DomainError.validation("theatre_code and name are required");
    return this.atomic(
      "theatre.create",
      "operating_theatre",
      (tx) => this.theatres.insert(tx, input),
      (r: any) => String(r.theatre_id),
    );
  }

  /**
   * Theatre board: registry row + the case currently in it + the next one.
   * Occupancy is derived from `surgical_cases.status`, never stored twice.
   */
  theatreBoard() {
    return this.query(
      `SELECT t.theatre_id, t.theatre_code, t.name, t.theatre_type, t.status,
              active.case_id AS active_case_id, active.case_no AS active_case_no,
              active.status AS active_case_status,
              active.urgency AS active_case_urgency,
              (SELECT count(*)::int FROM health.surgical_cases n
                WHERE n.theatre_id = t.theatre_id AND n.voided_at IS NULL
                  AND n.status IN ('requested','scheduled','in_preop')) AS upcoming_cases
         FROM health.operating_theatres t
         -- LATERAL with LIMIT 1, not a plain LEFT JOIN: a theatre that has more
         -- than one live row must still appear ONCE on the board, showing the
         -- case that is physically in the room. A case list disguised as a room
         -- list is how a scheduler double-books.
         LEFT JOIN LATERAL (
           SELECT c.case_id, c.case_no, c.status, c.urgency
             FROM health.surgical_cases c
            WHERE c.theatre_id = t.theatre_id AND c.voided_at IS NULL
              AND c.status IN ('in_preop','in_theatre','in_recovery')
            ORDER BY CASE c.status
                       WHEN 'in_theatre' THEN 0 WHEN 'in_recovery' THEN 1 ELSE 2 END,
                     c.actual_start_at DESC NULLS LAST,
                     c.scheduled_start_at ASC
            LIMIT 1
         ) active ON true
        WHERE t.tenant_id = $1 AND t.voided_at IS NULL
        ORDER BY t.theatre_code`,
      [this.tenantId],
    );
  }

  /**
   * Return a theatre to the board. The theatre becomes available only once the
   * turnaround it requested on `moveToRecovery` is finished — the same discipline
   * the capacity domain applies to beds, so a room housekeeping has not released
   * cannot be offered to the next case. The pending-turnaround read belongs to
   * CapacityService, so it is asked rather than queried here.
   */
  markTheatreClean(theatreId: string) {
    return this.atomic(
      "theatre.clean_complete",
      "operating_theatre",
      async (tx) => {
        const theatre = await this.theatres.findById(theatreId, tx);
        if (!theatre)
          throw DomainError.notFound("operating_theatre", theatreId);
        if (theatre.status === "available") return theatre;
        if (theatre.status === "occupied")
          throw DomainError.conflict(
            "This theatre has a case in it; it is released by completing that case",
          );
        const pending = (
          (await this.capacity.pendingTurnarounds()) as any[]
        ).some(
          (t) =>
            String(t.resource_type) === "theatre" &&
            String(t.resource_id) === String(theatreId),
        );
        if (pending)
          throw DomainError.conflict(
            "Cleaning is still outstanding for this theatre; complete its turnaround first",
          );
        const active = await tx.query<any>(
          `SELECT case_id, case_no FROM health.surgical_cases
            WHERE theatre_id = $1 AND tenant_id = $2 AND voided_at IS NULL
              AND status IN ('in_preop','in_theatre','in_recovery')
            LIMIT 1`,
          [theatreId, this.tenantId],
        );
        if (active.length)
          throw DomainError.conflict(
            `Case ${active[0].case_no ?? active[0].case_id} is still in this theatre`,
          );
        const row = await this.theatres.patch(tx, theatreId, {
          status: "available",
        });
        if (!row)
          throw DomainError.invalidState(
            "Theatre status update produced no row",
          );
        return row;
      },
      () => theatreId,
    );
  }

  setTheatreStatus(theatreId: string, status: string) {
    if (
      !["available", "occupied", "cleaning", "maintenance", "closed"].includes(
        status,
      )
    )
      throw DomainError.validation("unrecognised theatre status");
    return this.atomic(
      "theatre.status",
      "operating_theatre",
      async (tx) => {
        const active = await tx.query<any>(
          `SELECT case_id FROM health.surgical_cases
            WHERE theatre_id = $1 AND tenant_id = $2 AND voided_at IS NULL
              AND status IN ('in_preop','in_theatre','in_recovery')`,
          [theatreId, this.tenantId],
        );
        if (active.length && status !== "occupied")
          throw DomainError.conflict(
            `Theatre has ${active.length} case(s) in progress; it cannot be marked ${status}`,
          );
        const row = await this.theatres.patch(tx, theatreId, { status });
        if (!row) throw DomainError.notFound("operating_theatre", theatreId);
        return row;
      },
      () => theatreId,
    );
  }

  // ── cases ───────────────────────────────────────────────────────────────────
  createCase(input: Record<string, unknown>) {
    return super.create({ ...input, status: "requested" });
  }

  getCase(caseId: string) {
    return super.get(caseId);
  }

  /**
   * Book a theatre. Overlap is detected in the database against the theatre's
   * other LIVE cases, so two lists in two browsers cannot both think they won
   * the slot.
   */
  scheduleCase(
    caseId: string,
    booking: {
      theatre_id: string;
      scheduled_start_at: string;
      scheduled_end_at: string;
    },
  ) {
    if (
      !booking?.theatre_id ||
      !booking?.scheduled_start_at ||
      !booking?.scheduled_end_at
    )
      throw DomainError.validation(
        "theatre_id, scheduled_start_at and scheduled_end_at are all required",
      );
    const start = new Date(booking.scheduled_start_at);
    const end = new Date(booking.scheduled_end_at);
    if (!(end > start))
      throw DomainError.validation(
        "scheduled_end_at must be after scheduled_start_at",
      );
    return this.atomic(
      "surgical_case.schedule",
      "surgical_case",
      async (tx) => {
        const row = await this.cases.findById(caseId, tx);
        if (!row) throw DomainError.notFound("surgical_case", caseId);
        if (
          !["requested", "scheduled", "postponed"].includes(String(row.status))
        )
          throw DomainError.conflict(
            `Case is ${row.status}; it cannot be re-booked, cancel or postpone it instead`,
          );
        const theatre = await this.theatres.findById(
          String(booking.theatre_id),
          tx,
        );
        if (!theatre)
          throw DomainError.notFound("operating_theatre", booking.theatre_id);
        if (theatre.status === "closed" || theatre.status === "maintenance")
          throw DomainError.conflict(`Theatre is ${theatre.status}`);
        const clash = (
          await tx.query<any>(
            `SELECT case_id, case_no, scheduled_start_at, scheduled_end_at
               FROM health.surgical_cases
              WHERE tenant_id = $1 AND theatre_id = $2 AND case_id <> $3
                AND voided_at IS NULL
                AND status IN ('scheduled','in_preop','in_theatre','in_recovery')
                AND NOT (scheduled_end_at <= $4::timestamptz
                      OR scheduled_start_at >= $5::timestamptz)
              ORDER BY scheduled_start_at LIMIT 5`,
            [
              this.tenantId,
              booking.theatre_id,
              caseId,
              start.toISOString(),
              end.toISOString(),
            ],
          )
        )[0];
        if (clash)
          throw DomainError.conflict(
            `Theatre is already booked by ${clash.case_no ?? "another case"} from ${clash.scheduled_start_at} — the requested slot overlaps`,
          );
        const updated = await this.cases.patch(
          tx,
          caseId,
          {
            theatre_id: booking.theatre_id,
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
          },
          { forceStatus: "scheduled" },
        );
        return updated;
      },
      () => caseId,
    );
  }

  cancelCase(caseId: string, reason: string) {
    if (!reason || !String(reason).trim())
      throw DomainError.validation(
        "a cancellation reason is required — the table forbids a silent cancellation",
      );
    return this.atomic(
      "surgical_case.cancel",
      "surgical_case",
      async (tx) => {
        const row = await this.cases.findById(caseId, tx);
        if (!row) throw DomainError.notFound("surgical_case", caseId);
        if (
          ["in_theatre", "in_recovery", "completed"].includes(
            String(row.status),
          )
        )
          throw DomainError.conflict(
            `Case is ${row.status}; it has started and cannot be cancelled — close it and document`,
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.surgical_cases
                SET status = 'cancelled', cancellation_reason = $2, updated_by = $3
              WHERE case_id = $1 AND tenant_id = $4 AND voided_at IS NULL
            RETURNING *`,
            [caseId, reason, this.requireActor().userId, this.tenantId],
          )
        )[0];
        if (row.theatre_id)
          await this.requestTurnaroundForTheatre(tx, String(row.theatre_id));
        return updated;
      },
      () => caseId,
    );
  }

  postponeCase(caseId: string, until: string, note?: string) {
    if (!until)
      throw DomainError.validation(
        "postponed_until is required to postpone a case",
      );
    return this.atomic(
      "surgical_case.postpone",
      "surgical_case",
      async (tx) => {
        const row = await this.cases.findById(caseId, tx);
        if (!row) throw DomainError.notFound("surgical_case", caseId);
        if (
          !["requested", "scheduled", "in_preop"].includes(String(row.status))
        )
          throw DomainError.conflict(
            `Case is ${row.status}; it cannot be postponed`,
          );
        return (
          await tx.query<any>(
            `UPDATE health.surgical_cases
                SET status = 'postponed', postponed_until = $2::timestamptz,
                    notes = coalesce(notes || ' ', '') || coalesce($3, 'postponed'),
                    scheduled_start_at = NULL, scheduled_end_at = NULL, updated_by = $4
              WHERE case_id = $1 AND tenant_id = $5 AND voided_at IS NULL
            RETURNING *`,
            [
              caseId,
              until,
              note ?? null,
              this.requireActor().userId,
              this.tenantId,
            ],
          )
        )[0];
      },
      () => caseId,
    );
  }

  /** Readiness: the blockers that stop a case starting, as data. */
  /**
   * Blockers for a case, as data. When `tx` is supplied the reads run inside
   * that transaction — `startCase` passes its own write transaction so the
   * checklist and team it gates on are the same rows the commit will be judged
   * against, not a snapshot read on a second pooled connection.
   */
  async readiness(caseId: string, tx?: DbConnection) {
    const row = tx
      ? ((
          await this.cases.queryInTx<any[]>(
            tx,
            `SELECT * FROM health.surgical_cases WHERE case_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [caseId, this.tenantId],
          )
        )[0] as any)
      : await this.cases.findById(caseId);
    if (!row) throw DomainError.notFound("surgical_case", caseId);
    const blockers: string[] = [];
    const checklist = (
      tx
        ? (
            await this.checklists.queryInTx<any[]>(
              tx,
              `SELECT checklist_id, status FROM health.preop_checklists
              WHERE case_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
              [caseId, this.tenantId],
            )
          )[0]
        : await this.checklists.queryOne<any>(
            `SELECT checklist_id, status FROM health.preop_checklists
              WHERE case_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [caseId, this.tenantId],
          )
    ) as any;
    if (!checklist) blockers.push("no pre-op checklist started");
    else if (checklist.status !== "signed")
      blockers.push(`checklist is ${checklist.status}`);
    const team = tx
      ? await this.team.queryInTx<any[]>(
          tx,
          `SELECT role, confirmed, credential_status FROM health.surgical_team_members
            WHERE case_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
          [caseId, this.tenantId],
        )
      : await this.team.query<any[]>(
          `SELECT role, confirmed, credential_status FROM health.surgical_team_members
            WHERE case_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
          [caseId, this.tenantId],
        );
    for (const required of ["surgeon", "anaesthetist"]) {
      const member = (team as any[]).find((m) => m.role === required);
      if (!member) blockers.push(`no ${required} named`);
      else if (!member.confirmed)
        blockers.push(`${required} has not confirmed attendance`);
      else if (
        ["expired", "external_verification_required"].includes(
          member.credential_status,
        )
      )
        blockers.push(`${required} credentials ${member.credential_status}`);
    }
    // A crash case proceeds without consent by definition; every other case is
    // gated on a consent that is still live RIGHT NOW, not on the flag we set
    // when it was verified — a consent withdrawn overnight must not reach the
    // operating table because a boolean said so last week.
    if (row.urgency !== "crash") {
      if (!row.consent_verified)
        blockers.push("consent not verified for this procedure");
      else if (!row.consent_id)
        blockers.push("consent_verified is set but no consent record is bound");
      else {
        const consent = await this.consentState(tx, String(row.consent_id));
        if (!consent)
          blockers.push(
            "the consent bound to this case can no longer be found",
          );
        else if (consent.status !== "active")
          blockers.push(`consent is ${consent.status}`);
        else if (
          consent.effective_until &&
          new Date(String(consent.effective_until)) <= new Date()
        )
          blockers.push("consent has lapsed");
      }
    }
    if (!row.theatre_id) blockers.push("no theatre booked");
    return {
      case_id: caseId,
      status: row.status,
      urgency: row.urgency,
      consent_waiver_allowed: row.urgency === "crash",
      ready: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Start the case. Re-reads readiness INSIDE the transaction so a checklist
   * signed by someone else a moment ago is honoured and a revoked one is not.
   */
  startCase(caseId: string, opts: { consent_waiver_reason?: string } = {}) {
    return this.atomic(
      "surgical_case.start",
      "surgical_case",
      async (tx) => {
        const row = await this.cases.findById(caseId, tx);
        if (!row) throw DomainError.notFound("surgical_case", caseId);
        if (row.status !== "in_preop")
          throw DomainError.conflict(
            `Case is ${row.status}; move it to in_preop before starting`,
          );
        const readiness = await this.readiness(caseId, tx);
        const blockers =
          opts.consent_waiver_reason && readiness.consent_waiver_allowed
            ? readiness.blockers.filter((b) => !b.startsWith("consent"))
            : readiness.blockers;
        if (opts.consent_waiver_reason && !readiness.consent_waiver_allowed)
          throw DomainError.conflict(
            "Consent may only be waived for a crash case; this case is " +
              row.urgency,
          );
        if (blockers.length)
          throw DomainError.invalidState(
            `Case is not ready: ${blockers.join("; ")}`,
          );
        if (opts.consent_waiver_reason)
          await tx.query(
            `UPDATE health.surgical_cases
                SET notes = coalesce(notes || ' ', '') || $2, updated_by = $3
              WHERE case_id = $1 AND tenant_id = $4`,
            [
              caseId,
              `CONSENT WAIVED (crash): ${opts.consent_waiver_reason}`,
              this.requireActor().userId,
              this.tenantId,
            ],
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.surgical_cases
                SET status = 'in_theatre', actual_start_at = now(), updated_by = $2
              WHERE case_id = $1 AND tenant_id = $3 AND voided_at IS NULL
                AND status = 'in_preop'
            RETURNING *`,
            [caseId, this.requireActor().userId, this.tenantId],
          )
        )[0];
        if (!updated)
          throw DomainError.invalidState(
            "Case state changed under you; nothing was started",
          );
        if (row.theatre_id)
          await this.theatres.patch(tx, String(row.theatre_id), {
            status: "occupied",
          });
        return { ...updated, consent_waived: !!opts.consent_waiver_reason };
      },
      () => caseId,
    );
  }

  /**
   * Move to recovery. The bed is allocated THROUGH the capacity domain, so the
   * ward board shows the patient, the bed is not double-bookable, and freeing it
   * later runs the same turnaround discipline as any other discharge.
   */
  moveToRecovery(caseId: string, recoveryBedId: string) {
    if (!recoveryBedId)
      throw DomainError.validation(
        "recovery_bed_id is required — recovery needs a real bed",
      );
    return (async () => {
      const row = await this.cases.findById(caseId);
      if (!row) throw DomainError.notFound("surgical_case", caseId);
      if (row.status !== "in_theatre")
        throw DomainError.conflict(`Case is ${row.status}`);
      // The allocation is a capacity-domain write and therefore runs on the
      // capacity service's own transaction, not inside this one. Doing it
      // before the case update, with a compensating discharge, means a failed
      // update can never leave a bed occupied for a patient who never arrived.
      const allocated: any = await this.capacity
        .allocate({
          bed_id: recoveryBedId,
          patient_id: String(row.patient_id),
          encounter_id: row.encounter_id ? String(row.encounter_id) : null,
          // 'post_anaesthesia_care' is the capacity domain's own reason code for
          // a recovery bed; inventing a theatre-specific one would be rejected
          // by the allocation CHECK (and would fragment the ward board).
          reason: "post_anaesthesia_care",
        })
        .catch((e: unknown) => {
          throw DomainError.conflict(
            `Recovery bed unavailable: ${(e as Error).message}`,
          );
        });
      await this.capacity.markOccupied(String(allocated.allocation_id));
      try {
        const updated = await this.atomic(
          "surgical_case.recovery",
          "surgical_case",
          async (tx) => {
            const fresh = (
              await tx.query<any>(
                `UPDATE health.surgical_cases
                    SET status = 'in_recovery', actual_end_at = now(),
                        recovery_bed_id = $2, updated_by = $3
                  WHERE case_id = $1 AND tenant_id = $4 AND voided_at IS NULL
                    AND status = 'in_theatre'
                RETURNING *`,
                [
                  caseId,
                  recoveryBedId,
                  this.requireActor().userId,
                  this.tenantId,
                ],
              )
            )[0];
            if (!fresh)
              throw DomainError.invalidState(
                "Case state changed under you; the recovery bed was released again",
              );
            await this.recordTurnaround(
              tx,
              "theatre",
              row.theatre_id,
              "clean",
              "Theatre freed after case",
            );
            if (row.theatre_id)
              await this.theatres.patch(tx, String(row.theatre_id), {
                status: "cleaning",
              });
            return fresh;
          },
          () => caseId,
        );
        return {
          ...updated,
          recovery_allocation_id: allocated?.allocation_id ?? null,
        };
      } catch (e) {
        await this.capacity
          .discharge(
            String(allocated.allocation_id),
            "theatre_recovery_abandoned",
          )
          .catch(() => null);
        throw e;
      }
    })();
  }

  /**
   * Complete the case: release the recovery bed through the capacity domain so
   * the bed returns to the cleaning queue rather than to a hopeful "available".
   */
  async completeCase(caseId: string) {
    const row = await this.cases.findById(caseId);
    if (!row) throw DomainError.notFound("surgical_case", caseId);
    if (row.status !== "in_recovery")
      throw DomainError.conflict(
        `Case is ${row.status}; complete requires in_recovery`,
      );
    const updated = await this.atomic(
      "surgical_case.complete",
      "surgical_case",
      async (tx) =>
        (
          await tx.query<any>(
            `UPDATE health.surgical_cases
                SET status = 'completed', updated_by = $2
              WHERE case_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [caseId, this.requireActor().userId, this.tenantId],
          )
        )[0],
      () => caseId,
    );
    // Release the recovery bed through the capacity domain, using its public
    // open-allocation read rather than re-implementing the allocation query here.
    const open = ((await this.capacity.openAllocations()) as any[]).find(
      (a) =>
        String(a.patient_id) === String(row.patient_id) &&
        String(a.reason) === "post_anaesthesia_care",
    );
    if (open)
      await this.capacity.discharge(
        String(open.allocation_id),
        "theatre_recovery_complete",
      );
    return updated;
  }

  private async consentState(
    tx: DbConnection | undefined,
    consentId: string,
  ): Promise<any> {
    const sql = `SELECT consent_id, patient_id, purpose, status, effective_until,
                        captured_by, evidence
                   FROM health.consents
                  WHERE consent_id = $1 AND tenant_id = $2 AND voided_at IS NULL`;
    const rows = tx
      ? await this.cases.queryInTx<any[]>(tx, sql, [consentId, this.tenantId])
      : await this.cases.query<any[]>(sql, [consentId, this.tenantId]);
    return rows[0] ?? null;
  }

  /**
   * Bind a consent record to the case and mark it verified. `consent_verified`
   * is never accepted from a client body: it is set here, and only for an ACTIVE
   * treatment consent that belongs to this patient and has not lapsed.
   */
  verifyConsent(caseId: string, consentId: string) {
    if (!consentId) throw DomainError.validation("consent_id is required");
    return this.atomic(
      "surgical_case.consent",
      "surgical_case",
      async (tx) => {
        const caseRow = await this.cases.findById(caseId, tx);
        if (!caseRow) throw DomainError.notFound("surgical_case", caseId);
        if (
          !["requested", "scheduled", "in_preop", "postponed"].includes(
            String(caseRow.status),
          )
        )
          throw DomainError.conflict(
            `Case is ${caseRow.status}: consent cannot be re-bound once the patient is in theatre`,
          );
        const consent = await this.consentState(tx, String(consentId));
        if (!consent) throw DomainError.notFound("consent", consentId);
        if (String(consent.patient_id) !== String(caseRow.patient_id))
          throw DomainError.conflict(
            "That consent belongs to a different patient; it cannot stand in for this one",
          );
        if (consent.status !== "active")
          throw DomainError.conflict(`Consent is ${consent.status}`);
        if (
          consent.effective_until &&
          new Date(String(consent.effective_until)) <= new Date()
        )
          throw DomainError.conflict(
            "That consent has lapsed; capture a current one before the case proceeds",
          );
        if (consent.purpose !== "treatment")
          throw DomainError.conflict(
            `A surgical case needs a treatment consent, not '${consent.purpose}'`,
          );
        const row = (
          await tx.query<any>(
            `UPDATE health.surgical_cases
                SET consent_id = $2, consent_verified = true, updated_by = $3
              WHERE case_id = $1 AND tenant_id = $4 AND voided_at IS NULL
            RETURNING *`,
            [caseId, consentId, this.requireActor().userId, this.tenantId],
          )
        )[0];
        if (!row)
          throw DomainError.invalidState("Consent binding produced no row");
        return { ...row, consent_source: consent.evidence ?? null };
      },
      () => caseId,
    );
  }

  // ── team ────────────────────────────────────────────────────────────────────
  /**
   * Name a team member. `credential_status` is read from the practitioner
   * registry rather than accepted from the caller, and an unlinked or
   * unverified practitioner is recorded as `external_verification_required` —
   * which blocks the case until a human resolves it.
   */
  addTeamMember(caseId: string, input: Record<string, unknown>) {
    const role = String(input.role ?? "");
    if (!TEAM_ROLES.includes(role as any))
      throw DomainError.validation(
        `role must be one of ${TEAM_ROLES.join(", ")}`,
      );
    if (!input.global_user_id && !input.provider_id)
      throw DomainError.validation(
        "a team member must be a user, a provider, or both",
      );
    return this.atomic(
      "surgical_team.add",
      "surgical_team_member",
      async (tx) => {
        const caseRow = await this.cases.findById(caseId, tx);
        if (!caseRow) throw DomainError.notFound("surgical_case", caseId);
        if (
          !["requested", "scheduled", "in_preop"].includes(
            String(caseRow.status),
          )
        )
          throw DomainError.conflict(
            `Case is ${caseRow.status}; the team is fixed once the case has started`,
          );
        const cred = await this.credentialState(
          tx,
          input.global_user_id ?? null,
        );
        const row = (
          await tx.query<any>(
            `INSERT INTO health.surgical_team_members
               (tenant_id, entity_code, country_code, case_id, global_user_id,
                provider_id, role, confirmed, credential_checked, credential_status,
                note, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $11)
             ON CONFLICT (case_id, role, global_user_id) DO NOTHING
             RETURNING *`,
            [
              this.tenantId,
              this.ctx.current()?.entityCode ?? null,
              this.ctx.current()?.countryCode ?? null,
              caseId,
              input.global_user_id ?? null,
              input.provider_id ?? null,
              role,
              cred.checked,
              cred.status,
              input.note ?? null,
              this.requireActor().userId,
            ],
          )
        )[0];
        if (!row)
          throw DomainError.conflict(`${role} is already named on this case`);
        return row;
      },
      (r: any) => String(r.team_member_id),
    );
  }

  confirmTeamMember(teamMemberId: string) {
    return this.atomic(
      "surgical_team.confirm",
      "surgical_team_member",
      async (tx) => {
        const rows = await tx.query<any>(
          `SELECT * FROM health.surgical_team_members
            WHERE team_member_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
          [teamMemberId, this.tenantId],
        );
        const member = rows[0];
        if (!member)
          throw DomainError.notFound("surgical_team_member", teamMemberId);
        // A member can only confirm THEMSELVES — otherwise "confirmed" would
        // mean "someone typed my name in", which is not attendance.
        if (
          member.global_user_id &&
          String(member.global_user_id) !== this.requireActor().userId
        )
          throw DomainError.forbidden(
            "Only the named clinician can confirm attendance on this case",
          );
        if (member.credential_status === "external_verification_required")
          throw DomainError.conflict(
            "Attendance cannot be confirmed while the credential is awaiting external verification",
          );
        return (
          await tx.query<any>(
            `UPDATE health.surgical_team_members
                SET confirmed = true, confirmed_at = now(),
                    credential_checked = true,
                    credential_status = CASE WHEN credential_status = 'not_checked'
                                             THEN 'valid' ELSE credential_status END
              WHERE team_member_id = $1 AND tenant_id = $2
            RETURNING *`,
            [teamMemberId, this.tenantId],
          )
        )[0];
      },
      () => teamMemberId,
    );
  }

  listTeam(caseId: string) {
    return this.team.query<any[]>(
      `SELECT * FROM health.surgical_team_members
        WHERE case_id = $1 AND tenant_id = $2 AND voided_at IS NULL
        ORDER BY role, created_at`,
      [caseId, this.tenantId],
    );
  }

  // ── pre-op checklist ────────────────────────────────────────────────────────
  /**
   * Start the WHO checklist for a case. The items are created here from a
   * fixed template rather than accepted from the client: a checklist whose
   * items can be edited by whoever starts it is not a checklist.
   */
  startChecklist(caseId: string, template = "who_safety_surgical") {
    return this.atomic(
      "preop_checklist.start",
      "preop_checklist",
      async (tx) => {
        const caseRow = await this.cases.findById(caseId, tx);
        if (!caseRow) throw DomainError.notFound("surgical_case", caseId);
        const existing = (
          await tx.query<any>(
            `SELECT checklist_id FROM health.preop_checklists
              WHERE case_id = $1 AND tenant_id = $2 AND template = $3 AND voided_at IS NULL`,
            [caseId, this.tenantId, template],
          )
        )[0];
        if (existing)
          throw DomainError.conflict(
            `A ${template} checklist already exists for this case (${existing.checklist_id})`,
          );
        const checklist = (
          await tx.query<any>(
            `INSERT INTO health.preop_checklists (tenant_id, entity_code, country_code, case_id, template, status, created_by)
             VALUES ($1, $2, $3, $4, $5, 'incomplete', $6)
             RETURNING *`,
            [
              this.tenantId,
              this.ctx.current()?.entityCode ?? null,
              this.ctx.current()?.countryCode ?? null,
              caseId,
              template,
              this.requireActor().userId,
            ],
          )
        )[0];
        for (const [key, label, position] of WHO_ITEMS) {
          await tx.query(
            `INSERT INTO health.preop_checklist_items
               (checklist_id, tenant_id, item_key, label, required, position, created_by)
             VALUES ($1, $2, $3, $4, true, $5, $6)`,
            [
              checklist.checklist_id,
              this.tenantId,
              key,
              label,
              position,
              this.requireActor().userId,
            ],
          );
        }
        // Link the checklist onto the case through the deferred FK column.
        await tx.query(
          `UPDATE health.surgical_cases SET preop_checklist_id = $2
            WHERE case_id = $1 AND tenant_id = $3`,
          [caseId, checklist.checklist_id, this.tenantId],
        );
        return checklist;
      },
      (r: any) => String(r.checklist_id),
    );
  }

  checkItem(itemId: string, checked: boolean, note?: string) {
    return this.atomic(
      "preop_checklist_item.check",
      "preop_checklist_item",
      async (tx) => {
        const item = (
          await tx.query<any>(
            `SELECT i.*, c.status AS checklist_status
               FROM health.preop_checklist_items i
               JOIN health.preop_checklists c ON c.checklist_id = i.checklist_id
              WHERE i.item_id = $1 AND i.tenant_id = $2`,
            [itemId, this.tenantId],
          )
        )[0];
        if (!item) throw DomainError.notFound("preop_checklist_item", itemId);
        if (item.checklist_status === "signed")
          throw DomainError.conflict("A signed checklist cannot be re-opened");
        if (!checked)
          throw DomainError.validation(
            "an unchecked item stays unchecked: a sign-in step is asserted, never withdrawn after the fact",
          );
        const row = (
          await tx.query<any>(
            `UPDATE health.preop_checklist_items
                SET checked = true, checked_by = $2, checked_at = now(),
                    note = coalesce($3, note)
              WHERE item_id = $1 AND tenant_id = $4
            RETURNING *`,
            [itemId, this.requireActor().userId, note ?? null, this.tenantId],
          )
        )[0];
        await this.refreshChecklistStatus(tx, String(item.checklist_id));
        return row;
      },
      () => itemId,
    );
  }

  checklist(checklistId: string) {
    return this.query(
      `SELECT c.*, i.item_id, i.item_key, i.label, i.required, i.checked,
              i.checked_at, i.checked_by, i.note, i.position
         FROM health.preop_checklists c
         LEFT JOIN health.preop_checklist_items i
                ON i.checklist_id = c.checklist_id AND i.tenant_id = c.tenant_id
        WHERE c.checklist_id = $1 AND c.tenant_id = $2
        ORDER BY i.position ASC`,
      [checklistId, this.tenantId],
    );
  }

  signChecklist(checklistId: string) {
    return this.atomic(
      "preop_checklist.sign",
      "preop_checklist",
      async (tx) => {
        const rows = await tx.query<any>(
          `SELECT c.*, count(i.item_id) FILTER (WHERE i.required AND NOT i.checked)::int AS outstanding
             FROM health.preop_checklists c
             LEFT JOIN health.preop_checklist_items i ON i.checklist_id = c.checklist_id
            WHERE c.checklist_id = $1 AND c.tenant_id = $2
            GROUP BY c.checklist_id`,
          [checklistId, this.tenantId],
        );
        const cl = rows[0];
        if (!cl) throw DomainError.notFound("preop_checklist", checklistId);
        if (cl.status === "signed") return cl;
        if (cl.outstanding > 0)
          throw DomainError.invalidState(
            `${cl.outstanding} required item(s) are unchecked; the checklist cannot be signed`,
          );
        return (
          await tx.query<any>(
            `UPDATE health.preop_checklists
                SET status = 'signed', signed_at = now(), signed_by = $2,
                    completed_at = coalesce(completed_at, now())
              WHERE checklist_id = $1 AND tenant_id = $3
            RETURNING *`,
            [checklistId, this.requireActor().userId, this.tenantId],
          )
        )[0];
      },
      () => checklistId,
    );
  }

  // ── anaesthesia ─────────────────────────────────────────────────────────────
  recordAnaesthesia(input: Record<string, unknown>) {
    return this.createVia(
      this.anaesthesia,
      ANAESTHESIA_SPEC,
      "anaesthesia.record",
      { ...input, status: "drafted" },
    );
  }

  updateAnaesthesia(anaesthesiaId: string, patch: Record<string, unknown>) {
    return this.atomic(
      "anaesthesia.update",
      "anaesthesia_record",
      async (tx) => {
        const row = await this.anaesthesia.findById(anaesthesiaId, tx);
        if (!row)
          throw DomainError.notFound("anaesthesia_record", anaesthesiaId);
        if (row.status === "signed")
          throw DomainError.conflict(
            "A signed anaesthesia record is amended, not edited",
          );
        const next: Record<string, unknown> = { ...patch };
        // Recovery grade is derived from the Aldrete score, so the two cannot
        // contradict each other in the record.
        if (next.aldrete_score !== undefined) {
          const s = Number(next.aldrete_score);
          if (!Number.isFinite(s) || s < 0 || s > 10)
            throw DomainError.validation("aldrete_score must be 0-10");
          next.recovery_grade = s >= 9 ? "A" : s >= 7 ? "B" : "C";
        }
        return this.anaesthesia.patch(tx, anaesthesiaId, next);
      },
      () => anaesthesiaId,
    );
  }

  signAnaesthesia(anaesthesiaId: string) {
    return this.atomic(
      "anaesthesia.sign",
      "anaesthesia_record",
      async (tx) => {
        const row = await this.anaesthesia.findById(anaesthesiaId, tx);
        if (!row)
          throw DomainError.notFound("anaesthesia_record", anaesthesiaId);
        if (row.status !== "drafted")
          throw DomainError.conflict(`Record is ${row.status}`);
        return (
          await tx.query<any>(
            `UPDATE health.anaesthesia_records
                SET status = 'signed', signed_at = now(), signed_by = $2
              WHERE anaesthesia_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [anaesthesiaId, this.requireActor().userId, this.tenantId],
          )
        )[0];
      },
      () => anaesthesiaId,
    );
  }

  /** Supersede a signed anaesthesia record, keeping the original in the chain. */
  amendAnaesthesia(anaesthesiaId: string, changes: Record<string, unknown>) {
    return this.atomic(
      "anaesthesia.amend",
      "anaesthesia_record",
      async (tx) => {
        const row = await this.anaesthesia.findById(anaesthesiaId, tx);
        if (!row)
          throw DomainError.notFound("anaesthesia_record", anaesthesiaId);
        if (row.status !== "signed")
          throw DomainError.conflict(
            "Only a signed record is amended by supersession",
          );
        const voided = await this.anaesthesia.softDelete(tx, anaesthesiaId);
        if (!voided)
          throw DomainError.invalidState("Record vanished during amendment");
        const next = await this.anaesthesia.insert(tx, {
          ...changes,
          case_id: row.case_id,
          patient_id: row.patient_id,
          parent_record_id: anaesthesiaId,
          status: "drafted",
        });
        await tx.query(
          `UPDATE health.anaesthesia_records SET status = 'amended'
            WHERE anaesthesia_id = $1 AND tenant_id = $2`,
          [anaesthesiaId, this.tenantId],
        );
        await tx.query(
          `UPDATE health.surgical_cases SET anaesthesia_record_id = $2
            WHERE case_id = $1 AND tenant_id = $3`,
          [row.case_id, next?.anaesthesia_id ?? null, this.tenantId],
        );
        return { superseded: anaesthesiaId, record: next };
      },
      () => anaesthesiaId,
    );
  }

  /** The live anaesthesia record(s) for a case — voided history is not here. */
  anaesthesiaForCase(caseId: string) {
    return this.query(
      `SELECT * FROM health.anaesthesia_records
        WHERE case_id = $1 AND tenant_id = $2 AND voided_at IS NULL
        ORDER BY created_at DESC`,
      [caseId, this.tenantId],
    );
  }

  /** The whole chain, including the voided records a supersedence left behind. */
  anaesthesiaHistory(caseId: string) {
    return this.query(
      `SELECT anaesthesia_id, status, parent_record_id, created_at, voided_at,
              voided_by, technique, asa_class, signed_at, signed_by
         FROM health.anaesthesia_records
        WHERE case_id = $1 AND tenant_id = $2
        ORDER BY created_at DESC`,
      [caseId, this.tenantId],
    );
  }

  // ── read models ─────────────────────────────────────────────────────────────
  /** The list a theatre coordinator works from. */
  caseList(status?: string) {
    return this.cases.query<any[]>(
      `SELECT c.*, t.name AS theatre_name, t.theatre_code,
              (SELECT count(*)::int FROM health.surgical_team_members m
                WHERE m.case_id = c.case_id AND m.confirmed) AS confirmed_members,
              (SELECT count(*)::int FROM health.preop_checklist_items i
                 JOIN health.preop_checklists pc ON pc.checklist_id = i.checklist_id
                WHERE pc.case_id = c.case_id AND i.required AND NOT i.checked) AS outstanding_checks
         FROM health.surgical_cases c
         LEFT JOIN health.operating_theatres t ON t.theatre_id = c.theatre_id
        WHERE c.tenant_id = $1 AND c.voided_at IS NULL
          AND ($2::text IS NULL OR c.status = $2)
        ORDER BY c.scheduled_start_at ASC NULLS LAST, c.created_at DESC
        LIMIT 200`,
      [this.tenantId, status ?? null],
    );
  }

  // ── internals ───────────────────────────────────────────────────────────────
  /** Credential truth comes from the practitioner registry, never the caller. */
  private async credentialState(
    tx: DbConnection,
    globalUserId: unknown,
  ): Promise<{ status: string; checked: boolean }> {
    if (!globalUserId)
      return { status: "external_verification_required", checked: false };
    const row = (
      await tx.query<any>(
        `SELECT p.license_status, p.license_number, p.verification_status
           FROM health.practitioners p
          WHERE p.global_user_id = $1 AND p.tenant_id = $2
            AND p.voided_at IS NULL
          LIMIT 1`,
        [String(globalUserId), this.tenantId],
      )
    )[0];
    if (!row)
      return { status: "external_verification_required", checked: false };
    if (!row.license_number) return { status: "not_checked", checked: false };
    const s = String(row.license_status ?? "");
    if (["active", "valid", "verified"].includes(s))
      return { status: "valid", checked: true };
    if (s === "expiring" || s === "expiring_soon")
      return { status: "expiring_soon", checked: true };
    if (s === "expired" || s === "suspended" || s === "revoked")
      return { status: "expired", checked: true };
    return { status: "not_checked", checked: false };
  }

  private async refreshChecklistStatus(tx: DbConnection, checklistId: string) {
    await tx.query(
      `UPDATE health.preop_checklists c
          SET status = CASE
                        WHEN NOT EXISTS (
                          SELECT 1 FROM health.preop_checklist_items i
                           WHERE i.checklist_id = c.checklist_id AND i.required AND NOT i.checked
                        ) THEN 'complete' ELSE 'incomplete' END,
              completed_at = CASE
                        WHEN NOT EXISTS (
                          SELECT 1 FROM health.preop_checklist_items i
                           WHERE i.checklist_id = c.checklist_id AND i.required AND NOT i.checked
                        ) THEN coalesce(c.completed_at, now()) ELSE c.completed_at END
        WHERE c.checklist_id = $1 AND c.tenant_id = $2 AND c.status <> 'signed'`,
      [checklistId, this.tenantId],
    );
  }

  private async requestTurnaroundForTheatre(
    tx: DbConnection,
    theatreId: string,
  ) {
    await this.recordTurnaround(
      tx,
      "theatre",
      theatreId,
      "clean",
      "Theatre released",
    );
  }

  /** Turnaround rows belong to the capacity domain; theatre only requests one. */
  private async recordTurnaround(
    tx: DbConnection,
    resourceType: string,
    resourceId: unknown,
    kind: string,
    reason: string,
  ) {
    if (!resourceId) return;
    await this.capacity.requestTurnaround({
      resource_type: resourceType,
      resource_id: String(resourceId),
      kind,
      reason,
      target_status: "available",
    });
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
