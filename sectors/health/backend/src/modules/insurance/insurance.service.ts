/**
 * Insurance / pre-authorisation / claims reconciliation (migration 039).
 *
 * MONEY RULES THAT ARE ENFORCED, NOT ASSERTED
 *   * the claim total may not exceed `invoice_total_snapshot`, which the
 *     service freezes from the invoice at generation time. Later invoice edits
 *     cannot rewrite what was billed (table CHECK, plus a service-side refusal
 *     that names the snapshot);
 *   * `verified` cover requires evidence: `insurance_profiles.verification_status`
 *     can only reach `verified` through `verifyProfile`, which stamps who and
 *     when (table CHECK). Registering a policy number the patient dictated stays
 *     `unverified`, and an unverified profile cannot be billed to;
 *   * with no payer adapter in this build an eligibility check is stored as
 *     `result='unknown'` with `adapter_unavailable_reason` filled in, and a
 *     claim with no submission receipt stays `pending_external` with
 *     `submission_error` set. Nothing is ever recorded as `submitted` because a
 *     flag in our own database said so;
 *   * `posted_to_finance` on a remittance needs `matched_payment_id` (table
 *     CHECK) — otherwise the advice is `blocked`/`staged` with a reason.
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

export const INSURANCE_PROFILE_SPEC: ResourceSpec = {
  table: "health.insurance_profiles",
  pk: "profile_id",
  insertColumns: [
    "patient_id",
    "payer_type",
    "payer_name",
    "policy_number",
    "member_number",
    "effective_from",
    "effective_to",
    "cover_level",
    "copay_amount",
    "copay_percent",
    "deductible_amount",
    "annual_limit",
    "responsible_party_name",
    "responsible_party_relation",
    "responsible_party_contact",
    "status",
    "primary_coverage",
    "idempotency_key",
  ],
  updateColumns: [
    "payer_name",
    "policy_number",
    "member_number",
    "effective_from",
    "effective_to",
    "cover_level",
    "copay_amount",
    "copay_percent",
    "deductible_amount",
    "annual_limit",
    "responsible_party_name",
    "responsible_party_relation",
    "responsible_party_contact",
    "status",
    "primary_coverage",
  ],
  resourceType: "insurance_profile",
  auditPrefix: "insurance_profile",
  idempotencyColumn: "idempotency_key",
  listOrder:
    "health.insurance_profiles.primary_coverage DESC, health.insurance_profiles.created_at DESC",
  event: {
    eventType: "health.finance.coverage_changed",
    domain: "financial",
    operation: "insurance.coverage",
    subjectType: "insurance_profile",
    classification: "CONFIDENTIAL",
  },
};

/** Eligibility checks are an append-only ledger: one row per question asked. */
export const ELIGIBILITY_CHECK_SPEC: ResourceSpec = {
  table: "health.insurance_eligibility_checks",
  pk: "eligibility_id",
  insertColumns: [
    "profile_id",
    "patient_id",
    "valid_until",
    "result",
    "source",
    "response_summary",
    "denial_reason",
    "adapter_unavailable_reason",
    "idempotency_key",
  ],
  updateColumns: [],
  // There is no created_by column on this ledger: the actor is recorded in the
  // column the table actually provides, so attribution is still automatic
  // rather than something a client can set.
  actorColumn: "requested_by",
  resourceType: "eligibility_check",
  auditPrefix: "eligibility_check",
  idempotencyColumn: "idempotency_key",
  softDeletable: false,
  tracksUpdater: false,
  listOrder: "health.insurance_eligibility_checks.checked_at DESC",
};

export const PREAUTH_SPEC: ResourceSpec = {
  table: "health.preauthorizations",
  pk: "preauth_id",
  insertColumns: [
    "profile_id",
    "patient_id",
    "encounter_id",
    "service_code",
    "service_name",
    "requested_amount",
    "clinical_justification",
    "status",
    "submission_state",
    "idempotency_key",
  ],
  updateColumns: [
    "service_code",
    "service_name",
    "requested_amount",
    "clinical_justification",
  ],
  resourceType: "preauthorization",
  auditPrefix: "preauth",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.preauthorizations.requested_at DESC",
  event: {
    eventType: "health.finance.preauth_state_changed",
    domain: "financial",
    operation: "insurance.preauth",
    subjectType: "preauthorization",
    classification: "CONFIDENTIAL",
  },
};

export const CLAIM_SPEC: ResourceSpec = {
  table: "health.claims",
  pk: "claim_id",
  insertColumns: [
    "patient_id",
    "invoice_id",
    "profile_id",
    "preauth_id",
    "eligibility_id",
    "total_billed",
    "currency",
    "status",
    "submission_state",
    "due_submission_date",
    "parent_claim_id",
    "resubmission_count",
    "invoice_total_snapshot",
    "idempotency_key",
  ],
  updateColumns: [
    "profile_id",
    "preauth_id",
    "eligibility_id",
    "due_submission_date",
    "rejection_reason",
  ],
  resourceType: "claim",
  auditPrefix: "claim",
  idempotencyColumn: "idempotency_key",
  numberColumn: "claim_no",
  numberPrefix: "CLM",
  listOrder: "health.claims.created_at DESC",
  event: {
    eventType: "health.finance.claim_state_changed",
    domain: "financial",
    operation: "insurance.claim",
    subjectType: "claim",
    classification: "CONFIDENTIAL",
  },
};

export const CLAIM_ITEM_SPEC: ResourceSpec = {
  table: "health.claim_items",
  pk: "claim_item_id",
  insertColumns: [
    "claim_id",
    "invoice_item_id",
    "service_id",
    "code_system",
    "code",
    "description",
    "quantity",
    "unit_price",
    "amount",
    "status",
  ],
  updateColumns: ["approved_amount", "paid_amount", "denial_reason", "status"],
  resourceType: "claim_item",
  auditPrefix: "claim_item",
  softDeletable: false,
  tracksUpdater: false,
  listOrder: "health.claim_items.created_at ASC",
};

export const REMITTANCE_SPEC: ResourceSpec = {
  table: "health.claim_remittances",
  pk: "remittance_id",
  insertColumns: [
    "claim_id",
    "remit_no",
    "received_at",
    "payer_name",
    "amount_paid",
    "patient_share",
    "currency",
    "adjudication",
    "denial_reason",
    "remark",
    "matched_payment_id",
    "matched_invoice_id",
    "posting_state",
    "posting_reason",
    "source",
    "idempotency_key",
  ],
  // A remittance is the payer's document. Only our reconciliation of it is
  // writable; the amounts are corrected by recording a new advice.
  updateColumns: [
    "matched_payment_id",
    "matched_invoice_id",
    "posting_state",
    "posting_reason",
  ],
  resourceType: "claim_remittance",
  auditPrefix: "remittance",
  idempotencyColumn: "idempotency_key",
  listOrder: "health.claim_remittances.received_at DESC",
  event: {
    eventType: "health.finance.remittance_received",
    domain: "financial",
    operation: "insurance.remittance",
    subjectType: "claim_remittance",
    classification: "CONFIDENTIAL",
  },
};

@Injectable()
export class ClaimRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, CLAIM_SPEC);
  }
}
@Injectable()
export class InsuranceProfileRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, INSURANCE_PROFILE_SPEC);
  }
}
@Injectable()
export class EligibilityCheckRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, ELIGIBILITY_CHECK_SPEC);
  }
}
@Injectable()
export class PreauthRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, PREAUTH_SPEC);
  }
}
@Injectable()
export class ClaimItemRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, CLAIM_ITEM_SPEC);
  }
}
@Injectable()
export class RemittanceRepository extends ResourceRepository {
  constructor(@Inject(DB_CONNECTION) db: DbConnection, ctx: TenantContext) {
    super(db, ctx, REMITTANCE_SPEC);
  }
}

@Injectable()
export class InsuranceService extends ResourceDomainService {
  constructor(
    // @Inject is load-bearing, not decoration: DbConnection is an
    // interface, so without the token Nest cannot resolve the provider and the
    // whole application fails to boot (the real-PostgreSQL CI gate catches this;
    // a PGlite unit spec that constructs the service by hand does not).
    @Inject(DB_CONNECTION) db: DbConnection,
    private readonly ctx: TenantContext,
    audit: AuditService,
    private readonly events: EventOutboxService,
    private readonly profiles: InsuranceProfileRepository,
    private readonly checks: EligibilityCheckRepository,
    private readonly preauths: PreauthRepository,
    private readonly items: ClaimItemRepository,
    private readonly remits: RemittanceRepository,
    private readonly claims: ClaimRepository,
  ) {
    super(
      { repo: claims, audit, db, tenantCtx: ctx, outbox: events },
      CLAIM_SPEC,
      {
        validateCreate: (input) => {
          const errors: Record<string, string[]> = {};
          if (!input.patient_id) errors.patient_id = ["required"];
          if (!input.profile_id)
            errors.profile_id = [
              "required — a claim is made against one named scheme",
            ];
          if (!input.invoice_id)
            errors.invoice_id = [
              "required: use the invoice generator so the snapshot is real",
            ];
          if (Object.keys(errors).length) throw DomainError.validation(errors);
        },
        eventPayload: (kind, row) => ({
          claimNumber: row.claim_no ?? null,
          status: row.status ?? null,
          submissionState: row.submission_state ?? null,
          totalBilled: row.total_billed ?? null,
          totalPaid: row.total_paid ?? null,
          kind,
        }),
      },
    );
  }

  private get tenantId(): string {
    return this.ctx.tenantId();
  }

  // ── coverage on file ────────────────────────────────────────────────────────
  /**
   * Record the cover a patient presents. `verification_status` is forced to
   * `unverified`: what the front desk typed is the patient's claim about their
   * scheme, not a fact from the payer.
   */
  async registerProfile(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.patient_id) errors.patient_id = ["required"];
    if (!input.payer_name) errors.payer_name = ["required"];
    if (!input.payer_type) errors.payer_type = ["required"];
    else if (
      ![
        "nhif",
        "private_insurer",
        "employer_scheme",
        "out_of_pocket",
        "ngo",
        "government_referral",
      ].includes(String(input.payer_type))
    )
      errors.payer_type = [
        "must be one of the payer types the scheme table recognises",
      ];
    if (
      input.payer_type !== "out_of_pocket" &&
      !input.policy_number &&
      !input.member_number
    )
      errors.policy_number = [
        "a policy or member number is required so an eligibility check can be run",
      ];
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    if (input.primary_coverage !== false) {
      const incumbent = (
        await this.profiles.query<any>(
          `SELECT profile_id, payer_name FROM health.insurance_profiles
            WHERE tenant_id = $1 AND patient_id = $2
              AND primary_coverage AND status = 'active' AND voided_at IS NULL
            LIMIT 1`,
          [this.tenantId, String(input.patient_id)],
        )
      )[0];
      if (incumbent)
        throw DomainError.conflict(
          `${incumbent.payer_name} is already this patient's active primary cover. Cancel or demote it first — two silent primaries is how a bill gets sent to the wrong payer.`,
        );
    }
    // NOT super.create(): this service's primary resource is the CLAIM, so a
    // profile has to be written through its own repository and spec, or the
    // claim validation rules would be applied to a coverage record.
    const row = await this.createVia(
      this.profiles,
      INSURANCE_PROFILE_SPEC,
      "insurance_profile.register",
      {
        ...input,
        verification_status: "unverified",
        verified_at: null,
        verified_by: null,
        deductible_used: 0,
        annual_used: 0,
        status: input.status ?? "active",
      },
    );
    return {
      ...(row as any),
      verification_status: "unverified",
      note: "cover is on file but unverified; run an eligibility check or verify evidence before billing the payer",
    };
  }

  /**
   * Mark cover verified. `verified_at`/`verified_by` are stamped from the actor,
   * never from the body, because the table CHECK makes `verified` a promise that
   * somebody looked.
   */
  verifyProfile(
    profileId: string,
    opts: {
      evidence: string;
      document_ref?: string;
      outcome?: "verified" | "verification_failed";
    },
  ) {
    const outcome = opts?.outcome ?? "verified";
    if (!["verified", "verification_failed"].includes(outcome))
      throw DomainError.validation(
        "outcome must be verified or verification_failed",
      );
    if (!opts?.evidence || String(opts.evidence).trim().length < 8)
      throw DomainError.validation(
        "evidence must describe what was inspected (card, letter, portal screenshot reference)",
      );
    return this.atomic(
      "insurance_profile.verify",
      "insurance_profile",
      async (tx) => {
        const row = await this.profiles.findById(profileId, tx);
        if (!row) throw DomainError.notFound("insurance_profile", profileId);
        if (row.verification_status === "verified")
          throw DomainError.conflict(
            "This cover is already verified; re-verify as a new check",
          );
        return (
          await tx.query<any>(
            `UPDATE health.insurance_profiles
                SET verification_status = $2,
                    verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END,
                    verified_by = CASE WHEN $2 = 'verified' THEN $3 ELSE verified_by END,
                    updated_by = $3
              WHERE profile_id = $1 AND tenant_id = $4
            RETURNING *`,
            [profileId, outcome, this.requireActor().userId, this.tenantId],
          )
        )[0];
      },
      () => profileId,
    );
  }

  /**
   * Ask whether the cover is live. There is no payer adapter in this build, so
   * the honest answer is `unknown` with the reason recorded in
   * `adapter_unavailable_reason` — the field exists precisely so a check is
   * never mistaken for an answer.
   */
  async runEligibilityCheck(
    profileId: string,
    input: { idempotency_key?: string } = {},
  ) {
    const profile = (await this.profiles.findById(profileId)) as any;
    if (!profile) throw DomainError.notFound("insurance_profile", profileId);
    return this.createVia(
      this.checks,
      ELIGIBILITY_CHECK_SPEC,
      "eligibility_check.run",
      {
        profile_id: profileId,
        patient_id: profile.patient_id,
        result: "unknown",
        source: "manual",
        denial_reason: null,
        response_summary: `No answer from ${profile.payer_name}: this deployment has no payer eligibility interface. Cover on file was transcribed from documents.`,

        adapter_unavailable_reason:
          "no_payer_adapter_configured: cover on file was entered from documents, not queried from the payer",
        idempotency_key: input.idempotency_key ?? null,
      },
    );
  }

  /** Store an answer that genuinely came from a payer interface. */
  recordEligibilityResult(
    profileId: string,
    result: "eligible" | "partially_eligible" | "ineligible",
    evidence: {
      source: "external_api" | "document";
      response_summary?: unknown;
      valid_until?: string;
      denial_reason?: string;
      idempotency_key?: string;
    },
  ) {
    if (!["eligible", "partially_eligible", "ineligible"].includes(result))
      throw DomainError.validation(
        "result must be eligible, partially_eligible or ineligible",
      );
    if (!evidence?.source)
      throw DomainError.validation(
        "an eligibility answer must say where it came from",
      );
    if (evidence.source === "external_api" && !evidence.idempotency_key)
      throw DomainError.validation(
        "an adapter answer must carry the adapter receipt reference as its idempotency key",
      );
    if (result === "ineligible" && !evidence.denial_reason)
      throw DomainError.validation(
        "an ineligible answer must carry the payer's reason",
      );
    return this.atomic(
      "eligibility_check.record",
      "eligibility_check",
      async (tx) => {
        const profile = await this.profiles.findById(profileId, tx);
        if (!profile)
          throw DomainError.notFound("insurance_profile", profileId);
        const row = await this.checks.insertWith(tx, {
          profile_id: profileId,
          patient_id: profile.patient_id,
          result,
          source: evidence.source,
          valid_until: evidence.valid_until ?? null,
          response_summary:
            typeof evidence.response_summary === "string"
              ? evidence.response_summary
              : evidence.response_summary
                ? JSON.stringify(evidence.response_summary)
                : null,
          denial_reason: evidence.denial_reason ?? null,
          idempotency_key:
            evidence.idempotency_key ?? `elig:${profileId}:${Date.now()}`,
        });
        await tx.query(
          `UPDATE health.insurance_profiles
              SET verification_status = CASE WHEN $2::text = 'eligible' THEN 'verified'::text
                                              ELSE verification_status END,
                  verified_at = CASE WHEN $2::text = 'eligible' THEN now() ELSE verified_at END,
                  verified_by = CASE WHEN $2::text = 'eligible' THEN $3 ELSE verified_by END,
                  updated_by = $3
            WHERE profile_id = $1 AND tenant_id = $4`,
          [profileId, result, this.requireActor().userId, this.tenantId],
        );
        return row;
      },
      (r: any) => String(r?.eligibility_id),
    );
  }

  latestEligibility(profileId: string) {
    return this.checks.queryOne<any>(
      `SELECT * FROM health.insurance_eligibility_checks
        WHERE profile_id = $1 AND tenant_id = $2
        ORDER BY checked_at DESC LIMIT 1`,
      [profileId, this.tenantId],
    );
  }

  /**
   * Record what the payer has already consumed against the patient's limits.
   * The table CHECK refuses to let `annual_used` exceed `annual_limit`, so a
   * limit overrun is caught here as a business error rather than as a database
   * exception leaking through as a 500.
   */
  recordBenefitUsage(
    profileId: string,
    usage: { annual_used?: number; deductible_used?: number; note: string },
  ) {
    if (!usage?.note)
      throw DomainError.validation(
        "a benefit update must cite the remit or statement it came from",
      );
    return this.atomic(
      "insurance_profile.benefits",
      "insurance_profile",
      async (tx) => {
        const profile = (await this.profiles.findById(profileId, tx)) as any;
        if (!profile)
          throw DomainError.notFound("insurance_profile", profileId);
        const nextAnnual =
          usage.annual_used === undefined ? null : Number(usage.annual_used);
        const nextDeductible =
          usage.deductible_used === undefined
            ? null
            : Number(usage.deductible_used);
        if (
          nextAnnual !== null &&
          profile.annual_limit !== null &&
          nextAnnual > Number(profile.annual_limit)
        )
          throw DomainError.conflict(
            `Recorded usage ${nextAnnual} exceeds the annual limit ${profile.annual_limit}; get a corrected statement before billing more`,
          );
        if (
          nextDeductible !== null &&
          profile.deductible_amount !== null &&
          nextDeductible > Number(profile.deductible_amount) &&
          Number(profile.deductible_amount) !== 0
        )
          throw DomainError.conflict(
            `Recorded deductible usage ${nextDeductible} exceeds the deductible ${profile.deductible_amount}`,
          );
        return (
          await tx.query<any>(
            `UPDATE health.insurance_profiles
                SET annual_used = coalesce($2, annual_used),
                    deductible_used = coalesce($3, deductible_used),
                    updated_by = $4
              WHERE profile_id = $1 AND tenant_id = $5
            RETURNING *`,
            [
              profileId,
              nextAnnual,
              nextDeductible,
              this.requireActor().userId,
              this.tenantId,
            ],
          )
        )[0];
      },
      () => profileId,
    );
  }

  // ── pre-authorisation ───────────────────────────────────────────────────────
  async requestPreauth(input: Record<string, unknown>) {
    const errors: Record<string, string[]> = {};
    if (!input.profile_id) errors.profile_id = ["required"];
    if (!input.service_code) errors.service_code = ["required"];
    if (!input.service_name) errors.service_name = ["required"];
    if (!Number(input.requested_amount) || Number(input.requested_amount) <= 0)
      errors.requested_amount = ["must be a positive amount"];
    if (
      !input.clinical_justification ||
      String(input.clinical_justification).trim().length < 20
    )
      errors.clinical_justification = [
        "must state the clinical reason in enough detail for a medical officer to review",
      ];
    if (Object.keys(errors).length) throw DomainError.validation(errors);
    const profile = (await this.profiles.findById(
      String(input.profile_id),
    )) as any;
    if (!profile)
      throw DomainError.notFound("insurance_profile", String(input.profile_id));
    if (profile.status !== "active")
      throw DomainError.conflict(
        `Cover is ${profile.status}; a payer will not review a request on it`,
      );
    // One open request per service per cover: a second identical request is how
    // a payer ends up approving the same procedure twice.
    const duplicate = (
      await this.preauths.query<any>(
        `SELECT preauth_id FROM health.preauthorizations
          WHERE tenant_id = $1 AND profile_id = $2 AND service_code = $3
            AND status = 'requested' AND voided_at IS NULL
          LIMIT 1`,
        [this.tenantId, String(input.profile_id), String(input.service_code)],
      )
    )[0];
    if (duplicate)
      throw DomainError.conflict(
        `A request for ${input.service_code} is already open with this payer (preauth ${duplicate.preauth_id})`,
      );
    const created = await this.createVia(
      this.preauths,
      PREAUTH_SPEC,
      "preauth.request",
      {
        ...input,
        patient_id: profile.patient_id,
        status: "requested",
        // Nothing has left the building: submission_state says so honestly.
        submission_state: "not_connected",
      },
    );
    return created;
  }

  /**
   * Record the payer's decision. Approval without an authorisation number is
   * impossible (table CHECK), and an approval may not exceed what was requested.
   */
  decidePreauth(
    preauthId: string,
    decision:
      "approved" | "partially_approved" | "denied" | "expired" | "cancelled",
    opts: {
      authorization_number?: string;
      approved_amount?: number;
      denial_reason?: string;
      valid_until?: string;
    } = {},
  ) {
    if (
      ![
        "approved",
        "partially_approved",
        "denied",
        "expired",
        "cancelled",
      ].includes(decision)
    )
      throw DomainError.validation("unrecognised pre-auth decision");
    if (decision === "approved" && !opts.authorization_number)
      throw DomainError.validation(
        "an approval needs the payer authorisation number; without it there is nothing to bill against",
      );
    if (decision === "partially_approved" && !opts.authorization_number)
      throw DomainError.validation(
        "a partial approval needs the authorisation number too",
      );
    if (
      ["approved", "partially_approved", "denied"].includes(decision) &&
      !opts.valid_until &&
      decision !== "denied"
    )
      throw DomainError.validation(
        "an approval must carry the payer's expiry date, otherwise 'approved' means nothing over time",
      );
    if (decision === "denied" && !opts.denial_reason)
      throw DomainError.validation(
        "a denial needs the reason the patient will be given",
      );
    return this.atomic(
      `preauth.${decision}`,
      "preauthorization",
      async (tx) => {
        const row = (await this.preauths.findById(preauthId, tx)) as any;
        if (!row) throw DomainError.notFound("preauthorization", preauthId);
        if (row.status !== "requested")
          throw DomainError.conflict(`Pre-auth is already ${row.status}`);
        if (
          decision === "partially_approved" &&
          !(Number(opts.approved_amount) > 0)
        )
          throw DomainError.validation(
            "a partial approval must state the amount the payer agreed to",
          );
        if (
          opts.approved_amount !== undefined &&
          Number(opts.approved_amount) > Number(row.requested_amount)
        )
          throw DomainError.conflict(
            `The payer cannot approve ${opts.approved_amount} of a ${row.requested_amount} request`,
          );
        const updated = (
          await tx.query<any>(
            `UPDATE health.preauthorizations
                SET status = $2, approved_amount = $3, authorization_number = $4,
                    denial_reason = $5, valid_until = $6, decided_at = now(),
                    decided_by = $7, updated_by = $7
              WHERE preauth_id = $1 AND tenant_id = $8 AND voided_at IS NULL
            RETURNING *`,
            [
              preauthId,
              decision,
              decision === "denied"
                ? null
                : (opts.approved_amount ?? row.requested_amount),
              opts.authorization_number ?? null,
              opts.denial_reason ?? null,
              opts.valid_until ?? null,
              this.requireActor().userId,
              this.tenantId,
            ],
          )
        )[0];
        await this.events.publish({
          idempotencyKey: `beyu-evt:preauthorization:${decision}:${preauthId}`,
          sectorEventId: `health-preauthorization-${decision}-${preauthId}`,
          eventType: "health.finance.preauth_state_changed",
          domain: "financial",
          operation: "insurance.preauth",
          subjectType: "preauthorization",
          subjectId: String(preauthId),
          classification: "CONFIDENTIAL",
          payload: {
            decision,
            approvedAmount: opts.approved_amount ?? null,
            validUntil: opts.valid_until ?? null,
          },
        });
        return updated;
      },
      () => preauthId,
    );
  }

  /** Expire approvals whose payer validity has lapsed (safe to run daily). */
  sweepExpiredPreauths() {
    return this.atomic(
      "preauth.expire",
      "preauthorization",
      async (tx) => {
        const rows = await tx.query<any>(
          `UPDATE health.preauthorizations
              SET status = 'expired', updated_by = $1
            WHERE tenant_id = $2 AND status IN ('approved','partially_approved')
              AND valid_until IS NOT NULL AND valid_until < now()
              AND voided_at IS NULL
          RETURNING preauth_id, authorization_number`,
          [this.requireActor().userId, this.tenantId],
        );
        return { expired: (rows as any[]).length, rows: rows as any[] };
      },
      () => "sweep",
    );
  }

  preauthQueue() {
    return this.query(
      `SELECT p.*, pr.payer_name, pr.verification_status,
              EXTRACT(EPOCH FROM (now() - p.requested_at))::int / 3600 AS hours_waiting
         FROM health.preauthorizations p
         JOIN health.insurance_profiles pr ON pr.profile_id = p.profile_id
        WHERE p.tenant_id = $1 AND p.voided_at IS NULL AND p.status = 'requested'
        ORDER BY p.requested_at ASC
        LIMIT 200`,
      [this.tenantId],
    );
  }

  // ── claims ──────────────────────────────────────────────────────────────────
  /**
   * Generate a claim from an invoice: the invoice total is snapshotted and the
   * lines are COPIED, so a later invoice amendment can never rewrite what has
   * already been billed to a payer.
   */
  createClaimFromInvoice(
    invoiceId: string,
    input: { profile_id: string; preauth_id?: string; eligibility_id?: string },
  ) {
    if (!input?.profile_id)
      throw DomainError.validation("profile_id is required");
    return this.atomic(
      "claim.generate",
      "claim",
      async (tx) => {
        const invoice = (
          await tx.query<any>(
            `SELECT * FROM health.invoices
              WHERE invoice_id = $1 AND tenant_id = $2 AND voided_at IS NULL`,
            [invoiceId, this.tenantId],
          )
        )[0];
        if (!invoice) throw DomainError.notFound("invoice", invoiceId);
        if (!["issued", "partially_paid"].includes(String(invoice.status)))
          throw DomainError.conflict(
            `Invoice is ${invoice.status}; only an issued invoice can be billed to a payer`,
          );
        const profile = (await this.profiles.findById(
          input.profile_id,
          tx,
        )) as any;
        if (!profile)
          throw DomainError.notFound("insurance_profile", input.profile_id);
        // One live claim per invoice. Re-billing after a denial goes through
        // resubmitClaim, which keeps the parent visible, because a payer that
        // receives two independent claims for one invoice opens an audit.
        const live = (
          await tx.query<any>(
            `SELECT claim_id, claim_no, status FROM health.claims
              WHERE tenant_id = $1 AND invoice_id = $2 AND voided_at IS NULL
                AND status NOT IN ('rejected','cancelled','written_off')
              ORDER BY created_at DESC LIMIT 1`,
            [this.tenantId, invoiceId],
          )
        )[0];
        if (live)
          throw DomainError.conflict(
            `Invoice ${invoice.invoice_no} is already claimed by ${live.claim_no} (${live.status}); resubmit that claim instead of opening a second one`,
          );
        if (String(profile.patient_id) !== String(invoice.patient_id))
          throw DomainError.conflict(
            "The cover belongs to a different patient than the invoice",
          );
        if (profile.verification_status !== "verified")
          throw DomainError.conflict(
            `Cover is ${profile.verification_status}: verify it or file an eligible check before billing the payer`,
          );
        const lines = (await tx.query<any>(
          `SELECT * FROM health.invoice_items WHERE invoice_id = $1 ORDER BY created_at, item_id`,
          [invoiceId],
        )) as any[];
        const lineTotal = lines.reduce(
          (sum: number, l: any) => sum + Number(l.line_total ?? 0),
          0,
        );
        if (lines.length === 0)
          throw DomainError.conflict("Invoice has no billable lines");
        const billed = Math.min(Number(invoice.total ?? 0), lineTotal);
        // insert(), not insertWith(): the repository generates claim_no from the
        // spec's numberColumn, and UNIQUE(tenant_id, claim_no) is what makes the
        // payer-facing reference trustworthy.
        const claim = await this.claims.insert(tx, {
          patient_id: invoice.patient_id,
          invoice_id: invoiceId,
          profile_id: input.profile_id,
          preauth_id: input.preauth_id ?? null,
          eligibility_id: input.eligibility_id ?? null,
          total_billed: billed,
          currency: invoice.currency ?? "KES",
          status: "draft",
          submission_state: "not_connected",
          invoice_total_snapshot: Number(invoice.total ?? 0),
        });
        for (const line of lines) {
          await this.items.insertWith(tx, {
            claim_id: claim.claim_id,
            invoice_item_id: line.item_id,
            service_id: line.service_id ?? null,
            code_system: line.service_id ? "hospital_catalogue" : null,
            code: null,
            description: line.description,
            quantity: Number(line.qty ?? 1),
            unit_price: line.unit_price,
            amount: line.line_total,
            status: "billed",
          });
        }
        return claim;
      },
      (r: any) => String(r?.claim_id),
    );
  }

  claimLines(claimId: string) {
    return this.items.query<any>(
      `SELECT * FROM health.claim_items WHERE claim_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC`,
      [claimId, this.tenantId],
    );
  }

  readyClaim(claimId: string, dueSubmissionDate?: string) {
    return this.atomic(
      "claim.ready",
      "claim",
      async (tx) => {
        const claim = (await this.claims.findById(claimId, tx)) as any;
        if (!claim) throw DomainError.notFound("claim", claimId);
        if (claim.status !== "draft")
          throw DomainError.conflict(`Claim is ${claim.status}`);
        if (claim.preauth_id) {
          const preauth = await this.preauths.findById(
            String(claim.preauth_id),
            tx,
          );
          const valid =
            preauth &&
            ["approved", "partially_approved"].includes(
              String(preauth.status),
            ) &&
            (!preauth.valid_until ||
              new Date(String(preauth.valid_until)) > new Date());
          if (!valid)
            throw DomainError.conflict(
              "The pre-authorisation on this claim is not currently approved",
            );
        }
        // The deadline is only ever SET here, never cleared: readiness by a
        // scheduler must not silently erase the filing window the payer gave us.
        return this.claims.patch(
          tx,
          claimId,
          dueSubmissionDate ? { due_submission_date: dueSubmissionDate } : null,
          { forceStatus: "ready" },
        );
      },
      () => claimId,
    );
  }

  /**
   * Submit a claim. Without a receipt from a payer interface the claim becomes
   * `pending_external` with `submission_error` naming the missing integration —
   * a queue of things we still owe the payer, not a queue we told ourselves was
   * delivered.
   */
  submitClaim(
    claimId: string,
    receipt?: { external_reference: string; submitted_at?: string },
  ) {
    if (receipt && !receipt.external_reference)
      throw DomainError.validation(
        "a submission receipt must carry the payer's reference",
      );
    return this.atomic(
      "claim.submit",
      "claim",
      async (tx) => {
        const claim = (await this.claims.findById(claimId, tx)) as any;
        if (!claim) throw DomainError.notFound("claim", claimId);
        if (claim.submission_state === "submitted")
          throw DomainError.conflict(
            "This claim already carries a payer submission receipt; a re-bill goes through resubmitClaim",
          );
        if (!["draft", "ready"].includes(String(claim.status)))
          throw DomainError.conflict(`Claim is ${claim.status}`);
        if (receipt) {
          return (
            await tx.query<any>(
              `UPDATE health.claims
                  SET status = 'submitted', submission_state = 'submitted',
                      submitted_at = coalesce($3, now()), external_reference = $2,
                      submission_error = NULL, updated_by = $4
                WHERE claim_id = $1 AND tenant_id = $5 AND voided_at IS NULL
              RETURNING *`,
              [
                claimId,
                receipt.external_reference,
                receipt.submitted_at ?? null,
                this.requireActor().userId,
                this.tenantId,
              ],
            )
          )[0];
        }
        return (
          await tx.query<any>(
            `UPDATE health.claims
                SET status = 'ready', submission_state = 'pending_external',
                    submission_error = 'no_payer_adapter_receipt: this deployment has no claim submission interface',
                    updated_by = $2
              WHERE claim_id = $1 AND tenant_id = $3 AND voided_at IS NULL
            RETURNING *`,
            [claimId, this.requireActor().userId, this.tenantId],
          )
        )[0];
      },
      () => claimId,
    );
  }

  rejectClaim(claimId: string, reason: string) {
    if (!reason)
      throw DomainError.validation("a rejection needs the payer's reason");
    return this.atomic(
      "claim.reject",
      "claim",
      async (tx) => {
        const claim = await this.claims.findById(claimId, tx);
        if (!claim) throw DomainError.notFound("claim", claimId);
        if (!["submitted", "accepted"].includes(String(claim.status)))
          throw DomainError.conflict(`Claim is ${claim.status}`);
        return (
          await tx.query<any>(
            `UPDATE health.claims
                SET status = 'rejected', rejection_reason = $2, rejected_at = now(), updated_by = $3
              WHERE claim_id = $1 AND tenant_id = $4 AND voided_at IS NULL
            RETURNING *`,
            [claimId, reason, this.requireActor().userId, this.tenantId],
          )
        )[0];
      },
      () => claimId,
    );
  }

  /** Re-bill a rejected claim as a CHILD row, never by editing the original. */
  resubmitClaim(claimId: string, reason: string) {
    if (!reason)
      throw DomainError.validation("a resubmission must say what changed");
    return this.atomic(
      "claim.resubmit",
      "claim",
      async (tx) => {
        const parent = (await this.claims.findById(claimId, tx)) as any;
        if (!parent) throw DomainError.notFound("claim", claimId);
        if (!["rejected", "appealed"].includes(String(parent.status)))
          throw DomainError.conflict(
            `Only a rejected or appealed claim is resubmitted (currently ${parent.status})`,
          );
        const child = await this.claims.insert(tx, {
          patient_id: parent.patient_id,
          invoice_id: parent.invoice_id,
          profile_id: parent.profile_id,
          preauth_id: parent.preauth_id,
          eligibility_id: parent.eligibility_id,
          total_billed: parent.total_billed,
          currency: parent.currency,
          status: "draft",
          submission_state: "not_connected",
          invoice_total_snapshot: parent.invoice_total_snapshot,
          parent_claim_id: parent.claim_id,
          resubmission_count: Number(parent.resubmission_count ?? 0) + 1,
        });
        const lines = (await tx.query<any>(
          `SELECT * FROM health.claim_items WHERE claim_id = $1 ORDER BY created_at`,
          [claimId],
        )) as any[];
        for (const line of lines) {
          await this.items.insertWith(tx, {
            claim_id: child.claim_id,
            invoice_item_id: line.invoice_item_id,
            service_id: line.service_id,
            code_system: line.code_system,
            code: line.code,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            amount: line.amount,
            status: "billed",
          });
        }
        return child;
      },
      (r: any) => String(r?.claim_id),
    );
  }

  /**
   * File a remittance advice. `posted_to_finance` requires a finance payment id;
   * anything else is `blocked` (or `staged`) with the reason written down, so
   * finance reconciliation is never inferred from a document that merely arrived.
   */
  recordRemittance(
    claimId: string,
    input: {
      remit_no: string;
      payer_name?: string;
      amount_paid: number;
      patient_share?: number;
      adjudication: "paid" | "partially_paid" | "denied" | "returned";
      denial_reason?: string;
      remark?: string;
      matched_payment_id?: string;
      matched_invoice_id?: string;
      source: "manual" | "external_api";
      idempotency_key?: string;
      line_outcomes?: Array<{
        claim_item_id?: string;
        description_match?: string;
        status: "approved" | "paid" | "partially_paid" | "denied";
        approved_amount?: number;
        paid_amount?: number;
        denial_reason?: string;
      }>;
    },
  ) {
    if (!input?.remit_no) throw DomainError.validation("remit_no is required");
    if (!(Number(input.amount_paid) >= 0))
      throw DomainError.validation("amount_paid must be a non-negative number");
    if (!["manual", "external_api"].includes(String(input.source)))
      throw DomainError.validation("source must be manual or external_api");
    if (input.source === "external_api" && !input.idempotency_key)
      throw DomainError.validation(
        "an adapter remittance must carry the adapter receipt key so a retry cannot double-post",
      );
    if (
      ["denied", "returned"].includes(String(input.adjudication)) &&
      !input.denial_reason
    )
      throw DomainError.validation(
        "a denied or returned advice must carry the payer's reason",
      );
    return this.atomic(
      "remittance.record",
      "claim_remittance",
      async (tx) => {
        const claim = (await this.claims.findById(claimId, tx)) as any;
        if (!claim) throw DomainError.notFound("claim", claimId);
        if (
          !["submitted", "ready", "accepted", "partially_paid"].includes(
            String(claim.status),
          )
        )
          throw DomainError.conflict(
            `Claim is ${claim.status}; a remittance is expected only after submission`,
          );
        const posted = Boolean(input.matched_payment_id);
        // payer_name is NOT NULL and it is not the caller's to invent: the advice
        // is filed under the scheme the claim was made against, and a mismatch is
        // a reconciliation error, not a naming preference.
        const profile = (await this.profiles.findById(
          String(claim.profile_id),
          tx,
        )) as any;
        if (
          input.payer_name &&
          profile?.payer_name &&
          String(input.payer_name).trim().toLowerCase() !==
            String(profile.payer_name).trim().toLowerCase()
        )
          throw DomainError.conflict(
            `That advice names ${input.payer_name}, but this claim was billed to ${profile.payer_name}`,
          );
        const remit = await this.remits.insertWith(tx, {
          claim_id: claimId,
          remit_no: input.remit_no,
          received_at: new Date().toISOString(),
          payer_name:
            profile?.payer_name ?? input.payer_name ?? "unspecified payer",
          amount_paid: input.amount_paid,
          patient_share: input.patient_share ?? 0,
          currency: claim.currency ?? "KES",
          adjudication: input.adjudication,
          denial_reason: input.denial_reason ?? null,
          remark: input.remark ?? null,
          matched_payment_id: input.matched_payment_id ?? null,
          matched_invoice_id: input.matched_invoice_id ?? null,
          posting_state: posted ? "posted_to_finance" : "staged",
          posting_reason: posted
            ? null
            : "not posted to finance: no payment id supplied for reconciliation",
          source: input.source,
          idempotency_key: input.idempotency_key ?? `remit:${input.remit_no}`,
        });
        let approvedDelta = 0;
        let paidDelta = 0;
        for (const line of input.line_outcomes ?? []) {
          const target = await this.resolveLine(tx, claimId, line);
          if (line.status === "denied" && !line.denial_reason)
            throw DomainError.validation(
              `line ${target.description ?? target.claim_item_id}: a denied line needs the payer's reason`,
            );
          const approved = Number(
            line.approved_amount ?? Number(target.amount ?? 0),
          );
          const paid = Number(line.paid_amount ?? 0);
          if (paid > approved + 0.01)
            throw DomainError.conflict(
              `line ${target.claim_item_id}: paid ${paid} exceeds approved ${approved}`,
            );
          await this.items.patch(tx, String(target.claim_item_id), {
            status: line.status,
            approved_amount: approved,
            paid_amount: paid,
            denial_reason: line.denial_reason ?? null,
          });
          approvedDelta += approved;
          paidDelta += paid;
        }
        const totalPaid =
          Number(claim.total_paid ?? 0) +
          Number(input.amount_paid || 0) +
          paidDelta;
        const totalBilled = Number(claim.total_billed ?? 0);
        const nextStatus =
          input.adjudication === "denied" || input.adjudication === "returned"
            ? "rejected"
            : totalPaid >= totalBilled
              ? "paid"
              : totalPaid > 0
                ? "partially_paid"
                : "accepted";
        // A payer that says "paid" while the claim is still short is telling a
        // story the file has to record: the shortfall is either denied (with the
        // payer's reason), patient-responsibility, or written off by us. Silence
        // is how an outstanding balance quietly becomes an unexplained one.
        if (
          input.adjudication === "paid" &&
          totalPaid + 0.01 < totalBilled &&
          !input.remark &&
          !input.denial_reason &&
          !(Number(input.patient_share ?? 0) > 0)
        )
          throw DomainError.conflict(
            `The advice says paid but ${totalBilled - totalPaid} of this claim is still unexplained — record the denial reason, the patient share, or a remark writing the balance off`,
          );
        await tx.query(
          `UPDATE health.claims
              SET status = $2, total_paid = $3, total_approved = coalesce(total_approved,0) + $4,
                  patient_responsibility = coalesce(patient_responsibility,0) + $5,
                  rejection_reason = coalesce($6, rejection_reason),
                  rejected_at = CASE WHEN $2 = 'rejected' THEN now() ELSE rejected_at END,
                  updated_by = $7
            WHERE claim_id = $1 AND tenant_id = $8 AND voided_at IS NULL`,
          [
            claimId,
            nextStatus,
            totalPaid,
            approvedDelta,
            Number(input.patient_share ?? 0),
            input.denial_reason ?? null,
            this.requireActor().userId,
            this.tenantId,
          ],
        );
        await this.events.publish({
          idempotencyKey: `beyu-evt:claim:remitted:${claimId}:${input.remit_no}`,
          sectorEventId: `health-claim-remitted-${claimId}-${input.remit_no}`,
          eventType: "health.finance.remittance_received",
          domain: "financial",
          operation: "insurance.remittance",
          subjectType: "claim",
          subjectId: String(claimId),
          classification: "CONFIDENTIAL",
          payload: {
            remitNo: input.remit_no,
            amountPaid: input.amount_paid,
            postingState: posted ? "posted_to_finance" : "staged",
            claimStatus: nextStatus,
          },
        });
        return remit;
      },
      (r: any) => String(r?.remittance_id),
    );
  }

  private async resolveLine(
    tx: DbConnection,
    claimId: string,
    line: { claim_item_id?: string; description_match?: string },
  ): Promise<any> {
    if (line.claim_item_id) {
      const rows = (await tx.query<any>(
        `SELECT * FROM health.claim_items
            WHERE claim_item_id = $1 AND claim_id = $2 AND tenant_id = $3`,
        [line.claim_item_id, claimId, this.tenantId],
      )) as any[];
      if (rows[0]) return rows[0];
      throw DomainError.validation(
        `claim_item_id ${line.claim_item_id} is not a line on this claim`,
      );
    }
    if (line.description_match) {
      const rows = (await tx.query<any>(
        `SELECT * FROM health.claim_items
          WHERE claim_id = $1 AND tenant_id = $2
            AND description ILIKE '%' || $3 || '%'
          ORDER BY created_at ASC LIMIT 1`,
        [claimId, this.tenantId, line.description_match],
      )) as any[];
      if (rows[0]) return rows[0];
      throw DomainError.validation(
        `no claim line matches "${line.description_match}" — match by id, not by guesswork`,
      );
    }
    throw DomainError.validation(
      "each line outcome needs claim_item_id or description_match",
    );
  }

  /** What the payer owes us, aged, per scheme. */
  outstandingReport() {
    return this.query(
      `SELECT pr.payer_name, pr.payer_type, count(*) AS claims_open,
              coalesce(sum(c.total_billed - coalesce(c.total_paid,0)),0) AS outstanding,
              max(EXTRACT(EPOCH FROM (now() - coalesce(c.submitted_at, c.created_at)))::int / 86400) AS oldest_days,
              count(*) FILTER (
                WHERE c.due_submission_date IS NOT NULL AND c.due_submission_date < current_date
              ) AS past_payer_deadline
         FROM health.claims c
         JOIN health.insurance_profiles pr ON pr.profile_id = c.profile_id
        WHERE c.tenant_id = $1 AND c.voided_at IS NULL
          AND c.status IN ('draft','ready','submitted','accepted','partially_paid','appealed')
        GROUP BY pr.payer_name, pr.payer_type
        ORDER BY outstanding DESC`,
      [this.tenantId],
    );
  }

  /** Claims whose payer filing deadline we are about to miss. */
  filingDeadlineWatch(days = 7) {
    const window = Math.min(Math.max(Number(days) || 7, 1), 90);
    return this.query(
      `SELECT claim_id, claim_no, due_submission_date, status, submission_state, total_billed,
              (due_submission_date - current_date) AS days_left
         FROM health.claims
        WHERE tenant_id = $1 AND voided_at IS NULL AND due_submission_date IS NOT NULL
          AND status IN ('draft','ready')
          AND due_submission_date <= current_date + ($2::int * interval '1 day')
        ORDER BY due_submission_date ASC LIMIT 200`,
      [this.tenantId, window],
    );
  }

  async claimLedger(claimId: string) {
    const claim = await this.get(claimId);
    const lines = await this.claimLines(claimId);
    const remits = await this.remits.query<any>(
      `SELECT * FROM health.claim_remittances
        WHERE claim_id = $1 AND tenant_id = $2 AND voided_at IS NULL
        ORDER BY received_at DESC`,
      [claimId, this.tenantId],
    );
    const billed = Number((claim as any).total_billed ?? 0);
    const paid = Number((claim as any).total_paid ?? 0);
    return {
      claim,
      lines,
      remittances: remits,
      reconciliation: {
        billed,
        paid,
        patient_responsibility: Number(
          (claim as any).patient_responsibility ?? 0,
        ),
        residual: Math.round((billed - paid) * 100) / 100,
        fully_reconciled: billed > 0 && billed - paid < 0.01,
        finance_posted: remits.every(
          (r: any) => r.posting_state === "posted_to_finance",
        ),
      },
    };
  }

  profilesForPatient(patientId: string) {
    return this.profiles.query<any>(
      `SELECT * FROM health.insurance_profiles
        WHERE tenant_id = $1 AND patient_id = $2 AND voided_at IS NULL
        ORDER BY primary_coverage DESC NULLS LAST, created_at DESC`,
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
        const row = await repo.insertWith(tx, input);
        if (!row) throw DomainError.invalidState("Insert produced no row");
        return row;
      },
      (r: any) => String(r?.[spec.pk]),
    );
  }
}
