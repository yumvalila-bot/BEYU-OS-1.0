/**
 * Referral domain (migration 035): outbound and inbound referrals between
 * departments, facilities and external organisations, with an append-only
 * tracking trail.
 *
 * Repository column whitelists live in this file because every table here is
 * read and written by exactly one service.
 *
 * THE ONE RULE THAT MATTERS MOST
 *   `transmission_state` is NEVER allowed to claim a send that did not happen.
 *   An internal referral moves to `sent` because this database is the transport.
 *   An external one (letter, email, fax, FHIR peer, portal) moves to
 *   `pending_external` and stays there until a caller with an adapter receipt
 *   confirms delivery — at which point it becomes `sent`, or `failed` with the
 *   reason. A referral table that says "sent" when a fax machine was busy is a
 *   patient lost between facilities.
 *
 *   Consent gates disclosure: an external referral carries PHI out of the
 *   facility, so it cannot be sent until the consent link is verified here
 *   (`consent_verified`), independently of the consent record's own state.
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

export const REFERRAL_SPEC: ResourceSpec = {
  table: "health.referrals",
  pk: "referral_id",
  insertColumns: [
    "patient_id",
    "from_encounter_id",
    "from_provider_id",
    "from_department_id",
    "from_facility_id",
    "is_external",
    "to_facility_id",
    "to_organization_name",
    "to_practitioner_name",
    "to_practitioner_id",
    "to_department",
    "to_specialty",
    "reason",
    "clinical_question",
    "urgency",
    "consent_id",
    "valid_until",
    "counter_referral_of",
    "transmission_channel",
    "idempotency_key",
  ],
  updateColumns: [
    "to_facility_id",
    "to_organization_name",
    "to_practitioner_name",
    "to_practitioner_id",
    "to_department",
    "to_specialty",
    "reason",
    "clinical_question",
    "urgency",
    "consent_id",
    "valid_until",
    "transmission_channel",
    "outcome_summary",
  ],
  resourceType: "referral",
  auditPrefix: "referral",
  idempotencyColumn: "idempotency_key",
  numberColumn: "referral_no",
  numberPrefix: "REF",
  listOrder: "health.referrals.created_at DESC",
  event: {
    eventType: "health.referrals.state_changed",
    domain: "clinical",
    operation: "referrals.referral",
    subjectType: "referral",
    classification: "CONFIDENTIAL",
  },
};

/** Append-only trail: a tracking step is never edited or deleted. */
export const REFERRAL_EVENT_SPEC: ResourceSpec = {
  table: "health.referral_events",
  pk: "referral_event_id",
  insertColumns: ["referral_id", "step", "note", "occurred_at"],
  updateColumns: [],
  resourceType: "referral_event",
  auditPrefix: "referral_event",
  softDeletable: false,
  tracksUpdater: false,
  actorColumn: "actor_global_user_id",
  listOrder: "health.referral_events.occurred_at ASC",
};

const URGENCIES = ["routine", "urgent", "emergent"] as const;
const CHANNELS = [
  "internal",
  "letter",
  "email",
  "fax",
  "fhir",
  "portal",
] as const;
const EXTERNAL_CHANNELS = ["letter", "email", "fax", "fhir", "portal"] as const;
/** Waiting list clock: how long a referral may sit before it is chased. */
const CHASE_AFTER_DAYS: Record<string, number> = {
  emergent: 0,
  urgent: 3,
  routine: 14,
};

@Injectable()
export class ReferralRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, REFERRAL_SPEC);
  }
}

@Injectable()
export class ReferralEventRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, REFERRAL_EVENT_SPEC);
  }
}

const REFERRAL_TRANSITIONS: Record<string, Set<string>> = {
  draft: new Set(["sent", "cancelled"]),
  sent: new Set([
    "acknowledged",
    "accepted",
    "declined",
    "cancelled",
    "expired",
  ]),
  acknowledged: new Set([
    "accepted",
    "declined",
    "booked",
    "cancelled",
    "expired",
  ]),
  accepted: new Set(["booked", "seen", "completed", "cancelled", "expired"]),
  booked: new Set(["seen", "completed", "cancelled"]),
  seen: new Set(["completed", "cancelled"]),
  declined: new Set([]),
  completed: new Set([]),
  cancelled: new Set([]),
  expired: new Set([]),
};

@Injectable()
export class ReferralService extends ResourceDomainService {
  constructor(
    // @Inject is load-bearing, not decoration: DbConnection is an
    // interface, so without the token Nest cannot resolve the provider and the
    // whole application fails to boot (the real-PostgreSQL CI gate catches this;
    // a PGlite unit spec that constructs the service by hand does not).
    @Inject(DB_CONNECTION) db: DbConnection,
    private readonly ctx: TenantContext,
    audit: AuditService,
    private readonly events: EventOutboxService,
    private readonly referralEvents: ReferralEventRepository,
    private readonly referrals: ReferralRepository,
  ) {
    super(
      { repo: referrals, audit, db, tenantCtx: ctx, outbox: events },
      REFERRAL_SPEC,
      {
        transitions: REFERRAL_TRANSITIONS,
        validateCreate: (input) => {
          const errors: Record<string, string[]> = {};
          if (!input.patient_id) errors.patient_id = ["required"];
          if (!input.to_specialty) errors.to_specialty = ["required"];
          if (!input.reason) errors.reason = ["required"];
          if (
            input.urgency !== undefined &&
            !URGENCIES.includes(input.urgency as any)
          )
            errors.urgency = [`must be one of ${URGENCIES.join(", ")}`];
          if (
            input.transmission_channel !== undefined &&
            !CHANNELS.includes(input.transmission_channel as any)
          )
            errors.transmission_channel = [
              `must be one of ${CHANNELS.join(", ")}`,
            ];
          if (
            input.is_external &&
            !input.to_facility_id &&
            !input.to_organization_name
          )
            errors.to_organization_name = [
              "an external referral must name the receiving organisation or facility",
            ];
          if (
            input.counter_referral_of !== undefined &&
            input.counter_referral_of === null
          )
            errors.counter_referral_of = [
              "must reference an existing referral",
            ];
          if (Object.keys(errors).length) throw DomainError.validation(errors);
        },
        afterCreate: async (tx, row) => {
          await this.trackCreated(tx, row);
        },
        eventPayload: (kind, row) => ({
          referralId: String(row.referral_id),
          referralNo: row.referral_no ?? null,
          status: row.status ?? null,
          transmissionState: row.transmission_state ?? null,
          urgency: row.urgency ?? null,
          kind,
        }),
      },
    );
  }

  private get tenantId(): string {
    return this.ctx.tenantId();
  }

  // ── creation ────────────────────────────────────────────────────────────────
  createReferral(input: Record<string, unknown>) {
    return super.create({
      ...input,
      status: "draft",
      transmission_state: "not_sent",
    });
  }

  getReferral(referralId: string) {
    return super.get(referralId);
  }

  updateReferral(referralId: string, patch: Record<string, unknown>) {
    return this.atomic(
      "referral.update",
      "referral",
      async (tx) => {
        const row = await this.referrals.findById(referralId, tx);
        if (!row) throw DomainError.notFound("referral", referralId);
        if (row.status !== "draft")
          throw DomainError.conflict(
            "A referral that has left draft is corrected by a new referral or a counter-referral, not by editing the sent document",
          );
        return this.referrals.patch(tx, referralId, patch);
      },
      () => referralId,
    );
  }

  /**
   * Counter-referral back to the originator. Modelled as a NEW referral linked
   * by `counter_referral_of` rather than a status on the original, because the
   * response is its own clinical act with its own consent gate and transport.
   */
  createCounterReferral(originId: string, input: Record<string, unknown>) {
    return this.inTx(async (tx) => {
      const origin = await this.referrals.findById(originId, tx);
      if (!origin) throw DomainError.notFound("referral", originId);
      const referral = await this.createReferral({
        ...input,
        counter_referral_of: originId,
      });
      await this.track(tx, originId, "counter_referral_raised", {
        note: `counter-referral ${(referral as any)?.referral_no ?? ""}`.trim(),
      });
      return { origin: originId, referral };
    });
  }

  // ── sending ─────────────────────────────────────────────────────────────────
  /**
   * Send a referral. `receipt` is an optional adapter-supplied delivery
   * reference (e.g. a fax confirmation id); without it an external channel
   * stays `pending_external`, which is the honest state of "we handed this to
   * something we cannot observe".
   */
  send(referralId: string, receipt?: { channel?: string; reference?: string }) {
    return this.atomic(
      "referral.send",
      "referral",
      async (tx) => {
        const row = await this.referrals.findById(referralId, tx);
        if (!row) throw DomainError.notFound("referral", referralId);
        if (row.status !== "draft")
          throw DomainError.conflict(
            `Referral is ${row.status}; only a draft can be sent`,
          );
        const channel = String(
          receipt?.channel ?? row.transmission_channel ?? "internal",
        );
        if (!CHANNELS.includes(channel as any))
          throw DomainError.validation(
            `channel must be one of ${CHANNELS.join(", ")}`,
          );
        if (row.is_external && !row.consent_verified)
          throw DomainError.conflict(
            "An external referral cannot leave the facility until its consent is verified",
          );
        const isExternalTransport = (
          EXTERNAL_CHANNELS as readonly string[]
        ).includes(channel);
        const confirmed = isExternalTransport && !!receipt?.reference;
        const transmission = isExternalTransport
          ? confirmed
            ? "sent"
            : "pending_external"
          : "sent";
        const updated = await this.referrals.patch(
          tx,
          referralId,
          { transmission_channel: channel },
          {
            forceStatus: "sent",
            literalSet: ["sent_at = now()"],
          },
        );
        if (!updated) throw DomainError.notFound("referral", referralId);
        await tx.query(
          `UPDATE health.referrals SET transmission_state = $2
            WHERE referral_id = $1 AND tenant_id = $3`,
          [referralId, transmission, this.tenantId],
        );
        await this.track(tx, referralId, "sent", {
          channel,
          transmission_state: transmission,
          adapter_reference: receipt?.reference ?? null,
        });
        await this.events.publish({
          idempotencyKey: `beyu-evt:referral:sent:${referralId}`,
          sectorEventId: `health-referral-sent-${referralId}`,
          eventType: "health.referrals.state_changed",
          domain: "clinical",
          operation: "referrals.send",
          subjectType: "referral",
          subjectId: String(referralId),
          classification: "CONFIDENTIAL",
          payload: {
            referralNo: row.referral_no,
            toSpecialty: row.to_specialty,
            urgency: row.urgency,
            transmissionState: transmission,
            external: isExternalTransport,
          },
        });
        return { ...updated, transmission_state: transmission };
      },
      () => referralId,
    );
  }

  /**
   * Record an adapter outcome for an external send. Success flips
   * `pending_external` → `sent`; failure records `failed` and returns the
   * referral to draft so a human can re-send by another channel.
   */
  recordTransmissionOutcome(
    referralId: string,
    outcome: "sent" | "failed",
    detail?: string,
  ) {
    if (!["sent", "failed"].includes(outcome))
      throw DomainError.validation("outcome must be sent or failed");
    return this.atomic(
      `referral.transmission_${outcome}`,
      "referral",
      async (tx) => {
        const row = await this.referrals.findById(referralId, tx);
        if (!row) throw DomainError.notFound("referral", referralId);
        if (row.transmission_state !== "pending_external")
          throw DomainError.conflict(
            `Transmission is ${row.transmission_state}; there is no external submission awaiting an outcome`,
          );
        const nextStatus = outcome === "failed" ? "draft" : String(row.status);
        const updated =
          (
            await tx.query<any>(
              `UPDATE health.referrals
                SET transmission_state = $2, status = $3,
                    sent_at = CASE WHEN $2 = 'sent' THEN coalesce(sent_at, now()) ELSE sent_at END
              WHERE referral_id = $1 AND tenant_id = $4 AND voided_at IS NULL
            RETURNING *`,
              [referralId, outcome, nextStatus, this.tenantId],
            )
          )[0] ?? null;
        await this.track(
          tx,
          referralId,
          outcome === "failed" ? "cancelled" : "sent",
          {
            outcome,
            detail: detail ?? null,
          },
        );
        return updated;
      },
      () => referralId,
    );
  }

  // ── downstream lifecycle ────────────────────────────────────────────────────
  acknowledge(referralId: string) {
    return this.advance(referralId, "acknowledged", {}, [
      "acknowledged_at = now()",
    ]);
  }

  accept(referralId: string) {
    return this.advance(referralId, "accepted", {}, ["accepted_at = now()"]);
  }

  decline(referralId: string, reason: string) {
    if (!reason || !String(reason).trim())
      throw DomainError.validation("decline_reason is required");
    return this.advance(referralId, "declined", { decline_reason: reason }, [
      "declined_at = now()",
    ]);
  }

  book(referralId: string, appointmentId: string) {
    if (!appointmentId)
      throw DomainError.validation(
        "appointment_id is required to book a referral",
      );
    return this.advance(referralId, "booked", {
      booked_appointment_id: appointmentId,
    });
  }

  markSeen(referralId: string) {
    return this.advance(referralId, "seen", {}, ["seen_at = now()"]);
  }

  complete(referralId: string, outcomeSummary: string) {
    if (!outcomeSummary || !String(outcomeSummary).trim())
      throw DomainError.validation(
        "outcome_summary is required to complete a referral",
      );
    return this.advance(
      referralId,
      "completed",
      { outcome_summary: outcomeSummary },
      ["completed_at = now()"],
    );
  }

  cancel(referralId: string, reason: string) {
    if (!reason || !String(reason).trim())
      throw DomainError.validation("cancel_reason is required");
    return this.advance(referralId, "cancelled", { cancel_reason: reason }, [
      "cancelled_at = now()",
    ]);
  }

  /** Chase a waiting referral — an action with a trail, not a phone call that vanishes. */
  chase(referralId: string, note: string) {
    if (!note) throw DomainError.validation("a chase note is required");
    return this.atomic(
      "referral.chase",
      "referral",
      async (tx) => {
        const row = await this.referrals.findById(referralId, tx);
        if (!row) throw DomainError.notFound("referral", referralId);
        if (
          ["completed", "cancelled", "declined", "expired"].includes(
            String(row.status),
          )
        )
          throw DomainError.conflict(
            `Referral is ${row.status}; there is nothing to chase`,
          );
        await this.track(tx, referralId, "chased", { note });
        return { referral_id: referralId, chased: true, note };
      },
      () => referralId,
    );
  }

  /**
   * Record that a consent authorises THIS disclosure. Verification is not a
   * boolean a user can tick: the consent row must exist in this tenant, be
   * active, not be expired, and — when it names a recipient — name the same
   * recipient this referral would go to. A consent given for treatment does not
   * silently become a consent to fax a chart to a named third party.
   */
  verifyConsent(referralId: string, consentId: string) {
    if (!consentId) throw DomainError.validation("consent_id is required");
    return this.atomic(
      "referral.verify_consent",
      "referral",
      async (tx) => {
        const row = await this.referrals.findById(referralId, tx);
        if (!row) throw DomainError.notFound("referral", referralId);
        const consent =
          (
            await tx.query<any>(
              `SELECT consent_id, status, purpose, recipient, effective_until, voided_at
              FROM health.consents
             WHERE consent_id = $2 AND tenant_id = $1 AND voided_at IS NULL`,
              [this.tenantId, consentId],
            )
          )[0] ?? null;
        if (!consent) throw DomainError.notFound("consent", consentId);
        if (consent.status !== "active")
          throw DomainError.conflict(
            `Consent is ${consent.status}; only an active consent authorises disclosure`,
          );
        if (
          consent.effective_until &&
          new Date(consent.effective_until) < new Date()
        )
          throw DomainError.conflict("Consent has expired");
        const recipient = consent.recipient
          ? String(consent.recipient).trim().toLowerCase()
          : null;
        const intended = row.to_organization_name
          ? String(row.to_organization_name).trim().toLowerCase()
          : null;
        if (recipient && intended && recipient !== intended)
          throw DomainError.conflict(
            `Consent names recipient "${consent.recipient}", not "${row.to_organization_name}"`,
          );
        const updated =
          (
            await tx.query<any>(
              `UPDATE health.referrals
                SET consent_id = $2, consent_verified = true
              WHERE referral_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
              [referralId, consentId, this.tenantId],
            )
          )[0] ?? null;
        await this.track(tx, referralId, "created", {
          note: `consent ${consentId} verified for disclosure`,
        });
        return updated;
      },
      () => referralId,
    );
  }

  /**
   * Attach a document row from the clinical-document registry. Only the link is
   * created here: which documents exist, and whether they are retrievable, is
   * owned by `health.clinical_documents` (034), not duplicated in this schema.
   */
  attachDocument(referralId: string, documentId: string) {
    return this.atomic(
      "referral.attach_document",
      "referral",
      async (tx) => {
        const referral = await this.referrals.findById(referralId, tx);
        if (!referral) throw DomainError.notFound("referral", referralId);
        const doc =
          (
            await tx.query<any>(
              `SELECT document_id, available FROM health.clinical_documents
              WHERE document_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
              [documentId, this.tenantId],
            )
          )[0] ?? null;
        if (!doc) throw DomainError.notFound("clinical_document", documentId);
        if (!doc.available)
          throw DomainError.conflict(
            "The document's object is not retrievable, so it cannot be disclosed with the referral",
          );
        await tx.query(
          `INSERT INTO health.referral_documents (referral_id, document_id, tenant_id, included_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (referral_id, document_id) DO NOTHING`,
          [referralId, documentId, this.tenantId, this.requireActor().userId],
        );
        await this.track(tx, referralId, "document_attached", {
          document_id: documentId,
        });
        return {
          referral_id: referralId,
          document_id: documentId,
          attached: true,
        };
      },
      () => referralId,
    );
  }

  // ── read models ─────────────────────────────────────────────────────────────
  /** Full tracking trail for one referral, oldest first. */
  trail(referralId: string) {
    return this.referralEvents.query<any>(
      `SELECT * FROM health.referral_events
        WHERE referral_id = $1 AND tenant_id = $2
        ORDER BY occurred_at ASC, referral_event_id ASC`,
      [referralId, this.tenantId],
    );
  }

  listForPatient(patientId: string) {
    return this.referrals.query<any>(
      `SELECT * FROM health.referrals
        WHERE patient_id = $1 AND tenant_id = $2 AND voided_at IS NULL
        ORDER BY created_at DESC LIMIT 100`,
      [patientId, this.tenantId],
    );
  }

  /**
   * Waiting list with the ageing clock computed in the database. `chase_due`
   * is what the front desk works from; `expired_due` is what the scheduler
   * sweeps.
   */
  waitingList() {
    return this.referrals.query<any>(
      `SELECT r.*, (current_date - r.created_at::date) AS waiting_days,
              (r.valid_until IS NOT NULL AND r.valid_until < current_date) AS expired_due,
              (current_date - r.created_at::date) >= CASE r.urgency
                 WHEN 'emergent' THEN 0 WHEN 'urgent' THEN 3 ELSE 14 END AS chase_due
         FROM health.referrals r
        WHERE r.tenant_id = $1 AND r.voided_at IS NULL
          AND r.status IN ('sent','acknowledged','accepted','booked')
        ORDER BY CASE r.urgency WHEN 'emergent' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
                 r.created_at ASC
        LIMIT 200`,
      [this.tenantId],
    );
  }

  /**
   * Expire referrals whose validity date has passed. A sweep rather than a
   * trigger so the action is auditable and the caller is a named human or the
   * scheduler, and `expired` is recorded with the reason it expired.
   */
  sweepExpired() {
    return this.atomic(
      "referral.expire_sweep",
      "referral",
      async (tx) => {
        const rows = await tx.query<any>(
          `UPDATE health.referrals
              SET status = 'expired', updated_by = $2
            WHERE tenant_id = $1 AND voided_at IS NULL
              AND status IN ('draft','sent','acknowledged','accepted','booked')
              AND valid_until IS NOT NULL AND valid_until < current_date
          RETURNING referral_id, referral_no, valid_until`,
          [this.tenantId, this.requireActor().userId],
        );
        for (const r of rows) {
          await this.track(tx, String(r.referral_id), "expired", {
            note: `validity ended ${r.valid_until}`,
          });
        }
        return { expired: rows.length, referrals: rows };
      },
      () => "expire-sweep",
    );
  }

  /** Board counts by specialty and urgency, aggregated server-side. */
  board() {
    return this.query(
      `SELECT r.to_specialty, r.urgency,
              count(*)::int AS open_referrals,
              count(*) FILTER (WHERE r.is_external)::int AS external,
              count(*) FILTER (WHERE r.transmission_state = 'pending_external')::int AS awaiting_transport,
              count(*) FILTER (WHERE r.transmission_state = 'failed')::int AS failed_transport,
              max(current_date - r.created_at::date)::int AS oldest_days
         FROM health.referrals r
        WHERE r.tenant_id = $1 AND r.voided_at IS NULL
          AND r.status NOT IN ('completed','cancelled','declined','expired')
        GROUP BY r.to_specialty, r.urgency
        ORDER BY r.to_specialty, r.urgency`,
      [this.tenantId],
    );
  }

  /** Default chase window for an urgency — exposed so the UI states the rule. */
  chasePolicy() {
    return { ...CHASE_AFTER_DAYS };
  }

  // ── internals ───────────────────────────────────────────────────────────────
  private advance(
    referralId: string,
    to: string,
    columns: Record<string, unknown> = {},
    literalSet: string[] = [],
  ) {
    return this.atomic(
      `referral.${to}`,
      "referral",
      async (tx) => {
        const row = await this.referrals.findById(referralId, tx);
        if (!row) throw DomainError.notFound("referral", referralId);
        const from = String(row.status);
        if (!(REFERRAL_TRANSITIONS[from] ?? new Set()).has(to))
          throw DomainError.conflict(`referral ${from} → ${to} is not allowed`);
        // `decline_reason`, `cancel_reason` and `booked_appointment_id` are
        // deliberately absent from the spec's update whitelist — a caller must
        // not be able to set them on an arbitrary patch. This operation owns
        // them, so it binds them itself as parameters.
        const names = Object.keys(columns);
        const params: unknown[] = [
          referralId,
          to,
          this.tenantId,
          this.requireActor().userId,
        ];
        const sets = names.map((n, i) => `${n} = $${params.length + i + 1}`);
        for (const n of names) params.push(columns[n]);
        const sql = `UPDATE health.referrals
                        SET status = $2, updated_by = $4${
                          sets.length ? ", " + sets.join(", ") : ""
                        }${literalSet.length ? ", " + literalSet.join(", ") : ""}
                      WHERE referral_id = $1 AND tenant_id = $3 AND voided_at IS NULL
                    RETURNING *`;
        const rows = await tx.query<any>(sql, params);
        const updated = rows[0] ?? null;
        if (!updated) throw DomainError.notFound("referral", referralId);
        await this.track(tx, referralId, to, { from });
        return { ...updated, previous_status: from };
      },
      () => referralId,
    );
  }

  /** Records the birth of a referral on the trail (called inside create's tx). */
  private async trackCreated(tx: DbConnection, row: Record<string, unknown>) {
    if (!row?.referral_id) return;
    await this.track(tx, String(row.referral_id), "created", {
      urgency: row.urgency ?? null,
      to_specialty: row.to_specialty ?? null,
      external: !!row.is_external,
    });
  }

  private async track(
    tx: DbConnection,
    referralId: string,
    step: string,
    note?: Record<string, unknown> | string,
  ) {
    await tx.query(
      `INSERT INTO health.referral_events
         (tenant_id, referral_id, step, note, actor_global_user_id, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        this.tenantId,
        referralId,
        step,
        typeof note === "string" ? note : note ? JSON.stringify(note) : null,
        this.ctx.current()?.userId ?? null,
        null,
      ],
    );
  }
}
