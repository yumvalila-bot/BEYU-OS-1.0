/**
 * BEYU OS — FOUNDER EQUITY, CAPITALIZATION & ESOP tables (X10THINK Phase 2).
 *
 * ============================== WHAT THIS DOMAIN IS ============================
 *
 * The financing-grade capitalization layer of BEYU OS: share classes, equity
 * positions (founders, investors, ESOP pool, treasury), vesting schedules and
 * their append-only event log, good/bad leaver cases, change-of-control
 * declarations, ESOP plans/grants, reconstructable cap-table snapshots and
 * never-executed dilution scenarios.
 *
 * ============================== WHAT THIS DOMAIN IS NOT ========================
 *
 * NOT a Capital OS. NOT a second ownership registry:
 *   - `ownership_records` (core.ts) remains the canonical entity-level
 *     ownership registry (economic/voting/control/beneficial percentages,
 *     effective-dated, never destructively updated). An equity position links
 *     to it via `ownership_record_id`; instrument-level share counts live here,
 *     entity-level ownership truth lives there. No column below re-derives or
 *     overrides an ownership record.
 *   - Finance OS remains the sole accounting authority. Repurchase amounts,
 *     exercise proceeds and distribution payments are recorded as governed
 *     REFERENCES (`finance_record_ref`, default authoritative owner
 *     'FINANCE_OS'); nothing here posts a journal entry, and no code path in
 *     this domain calls the Finance posting engine. CAP_POSTING remains locked
 *     and fail-closed exactly as before.
 *   - HCM remains the canonical employee master: ESOP grants carry
 *     `hcm_employee_ref`, never a copy of employment data.
 *   - Documents remain canonical: every `*_document_ref` points at the existing
 *     documents registry (platform.ts). Vesting terms, leaver conditions, ESOP
 *     plan rules and change-of-control declarations are document-linked and
 *     approval-governed; the software records state, it never fabricates legal
 *     enforceability (`legal_review_status`).
 *   - Governance remains canonical: approvals cite existing resolutions /
 *     approvals rows by reference (`approval_ref`, `resolution_ref`).
 *
 * ============================== VESTING DEFAULTS (§9) ==========================
 *
 * The DEFAULT configurable candidate is 48-month vesting, 12-month cliff,
 * monthly thereafter. It is a default INPUT to the deterministic engine in
 * `src/lib/equity/model.ts`, never a hard-coded universal legal truth: every
 * schedule stores its own terms and its legal-review state.
 *
 * ============================== ISOLATION ======================================
 *
 * Every table carries `tenant_id` (references `tenants`). Migration 0040
 * enables RLS with the canonical `tenant_id = ANY (beyu_tenant_ids())` policy
 * (USING + WITH CHECK) on every table below, grants the runtime role DML only,
 * and FAILS the migration if any table lacks its policy — mirroring 0035–0039.
 */

import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { classificationEnum } from "./enums";
import { legalEntities, ownershipRecords, tenants } from "./core";
import { parties } from "./identity";

/* ------------------------------------------------------------------ */
/* §9 — Founder profiles                                                */
/* ------------------------------------------------------------------ */

/**
 * Founder governance profile. Identity remains canonical in `parties`/`users`;
 * this records founder STATUS, rights and restrictions — governance metadata,
 * never a second identity store. Shares live in `equity_positions` (linked by
 * `holder_party_id`), not here.
 */
export const founderProfiles = pgTable(
  "founder_profiles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    /** Primary founding entity — attribution, not scope (scope stays RLS/ABAC). */
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    /** ACTIVE | DEPARTED | RETIRED | DISABLED | DECEASED | REMOVED (controlled). */
    founderStatus: text("founder_status").notNull().default("ACTIVE"),
    /** Reserved matters applying to this founder (references governance engine). */
    reservedMatters: jsonb("reserved_matters").$type<string[]>().notNull().default([]),
    /** Transfer restrictions — jurisdiction-aware, document-linked, never assumed. */
    transferRestrictions: jsonb("transfer_restrictions").$type<Record<string, unknown>>().notNull().default({}),
    votingRightsSummary: text("voting_rights_summary"),
    economicRightsSummary: text("economic_rights_summary"),
    /** Succession / death / incapacity plan document reference (documents registry). */
    successionDocumentRef: text("succession_document_ref"),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | ARCHIVED
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("founder_profiles_party_uidx").on(t.tenantId, t.partyId),
    index("founder_profiles_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §13 — Share classes and equity positions (cap table)                 */
/* ------------------------------------------------------------------ */

export const shareClasses = pgTable(
  "share_classes",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** ORDINARY | PREFERRED | FOUNDER | NON_VOTING | TRACKING (controlled). */
    classType: text("class_type").notNull().default("ORDINARY"),
    authorizedShares: bigint("authorized_shares", { mode: "number" }).notNull().default(0),
    issuedShares: bigint("issued_shares", { mode: "number" }).notNull().default(0),
    votesPerShare: numeric("votes_per_share", { precision: 9, scale: 4 }).notNull().default("1"),
    /** Rights summary is documentation; the instrument document is the truth. */
    rightsSummary: text("rights_summary"),
    instrumentDocumentRef: text("instrument_document_ref"),
    approvalRef: text("approval_ref"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | RETIRED
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("share_classes_entity_code_uidx").on(t.tenantId, t.legalEntityId, t.code),
    index("share_classes_tenant_idx").on(t.tenantId),
  ],
);

/**
 * One instrument-level equity holding: founder shares, investor shares, the
 * ESOP pool, treasury. Effective-dated like `ownership_records`; superseding a
 * position closes it (`effective_to`) — history is never destroyed (§7).
 */
export const equityPositions = pgTable(
  "equity_positions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    shareClassId: text("share_class_id")
      .notNull()
      .references(() => shareClasses.id),
    /** FOUNDER | INVESTOR | ESOP_POOL | TREASURY | EMPLOYEE | TRUST | OTHER. */
    holderType: text("holder_type").notNull(),
    holderPartyId: text("holder_party_id").references(() => parties.id),
    holderName: text("holder_name").notNull(),
    instrument: text("instrument").notNull().default("ORDINARY_SHARES"),
    totalShares: bigint("total_shares", { mode: "number" }).notNull(),
    vestedShares: bigint("vested_shares", { mode: "number" }).notNull().default(0),
    unvestedShares: bigint("unvested_shares", { mode: "number" }).notNull().default(0),
    /** ACTIVE | FULLY_VESTED | FORFEITED | REPURCHASED | CANCELLED | TRANSFERRED | CLOSED. */
    status: text("status").notNull().default("ACTIVE"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    /** Link to the canonical entity-level ownership registry (never a copy). */
    ownershipRecordId: text("ownership_record_id").references(() => ownershipRecords.id),
    provenance: text("provenance").notNull(),
    supportingDocumentId: text("supporting_document_id"),
    resolutionRef: text("resolution_ref"),
    approvalRef: text("approval_ref"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equity_positions_entity_idx").on(t.tenantId, t.legalEntityId),
    index("equity_positions_holder_idx").on(t.tenantId, t.holderPartyId),
    index("equity_positions_class_idx").on(t.shareClassId),
  ],
);

/* ------------------------------------------------------------------ */
/* §9/§12 — Vesting schedules and their append-only event log           */
/* ------------------------------------------------------------------ */

export const vestingSchedules = pgTable(
  "vesting_schedules",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    positionId: text("position_id")
      .notNull()
      .references(() => equityPositions.id),
    /** FOUNDER_STANDARD | ESOP_STANDARD | CUSTOM (controlled). */
    scheduleType: text("schedule_type").notNull().default("CUSTOM"),
    totalShares: bigint("total_shares", { mode: "number" }).notNull(),
    /** DEFAULT candidate 48/12 monthly — configurable per schedule, never law. */
    vestingMonths: integer("vesting_months").notNull(),
    cliffMonths: integer("cliff_months").notNull(),
    frequency: text("frequency").notNull().default("MONTHLY"), // MONTHLY | QUARTERLY | ANNUAL | MILESTONE
    startDate: date("start_date").notNull(),
    cliffDate: date("cliff_date").notNull(),
    endDate: date("end_date").notNull(),
    /** NONE | SINGLE_TRIGGER | DOUBLE_TRIGGER | PARTIAL_DOUBLE_TRIGGER (§12 default DOUBLE_TRIGGER). */
    accelerationPolicy: text("acceleration_policy").notNull().default("DOUBLE_TRIGGER"),
    /** Acceleration percentage in millionths (1_000_000 = full) for PARTIAL policies. */
    accelerationPctMillionths: integer("acceleration_pct_millionths"),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    documentRef: text("document_ref"),
    /** DRAFT | APPROVED | ACTIVE | COMPLETED | CANCELLED | SUPERSEDED. */
    status: text("status").notNull().default("DRAFT"),
    approvedByResolutionId: text("approved_by_resolution_id"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vesting_schedules_position_idx").on(t.positionId),
    index("vesting_schedules_tenant_idx").on(t.tenantId),
    index("vesting_schedules_status_idx").on(t.tenantId, t.status),
  ],
);

/**
 * APPEND-ONLY vesting ledger. Every milestone, acceleration, forfeiture and
 * completion is an immutable event with cumulative state — this is what makes
 * vested/unvested balances reconstructable and auditable (§13, §61).
 */
export const vestingEvents = pgTable(
  "vesting_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => vestingSchedules.id),
    positionId: text("position_id")
      .notNull()
      .references(() => equityPositions.id),
    /** SCHEDULE_ACTIVATED | MILESTONE_VESTED | ACCELERATION_APPLIED | FORFEITURE | CANCELLATION | COMPLETION. */
    eventType: text("event_type").notNull(),
    vestedSharesDelta: bigint("vested_shares_delta", { mode: "number" }).notNull().default(0),
    cumulativeVestedShares: bigint("cumulative_vested_shares", { mode: "number" }).notNull(),
    milestoneDate: date("milestone_date"),
    /** Change-of-control event that caused an acceleration, when applicable. */
    changeOfControlId: text("change_of_control_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    actorUserId: text("actor_user_id"),
    authorityRef: text("authority_ref"),
    documentRef: text("document_ref"),
    traceId: text("trace_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vesting_events_schedule_idx").on(t.scheduleId),
    index("vesting_events_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §12 — Change of control                                              */
/* ------------------------------------------------------------------ */

/**
 * Declared change-of-control and qualifying-termination events. DOUBLE TRIGGER
 * is the default policy candidate: acceleration requires a CHANGE_OF_CONTROL
 * declaration AND a linked QUALIFYING_TERMINATION — both governed, both
 * legal-review flagged, neither auto-executed.
 */
export const changeOfControlEvents = pgTable(
  "change_of_control_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    /** CHANGE_OF_CONTROL | QUALIFYING_TERMINATION (controlled). */
    eventType: text("event_type").notNull(),
    description: text("description").notNull(),
    occurredOn: date("occurred_on").notNull(),
    /** For QUALIFYING_TERMINATION: the change-of-control event it pairs with. */
    linkedEventId: text("linked_event_id"),
    affectedPartyId: text("affected_party_id").references(() => parties.id),
    /** DECLARED | LEGAL_REVIEW | CONFIRMED | REJECTED | SUPERSEDED. */
    status: text("status").notNull().default("DECLARED"),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    resolutionRef: text("resolution_ref"),
    documentRef: text("document_ref"),
    declaredBy: text("declared_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("change_of_control_entity_idx").on(t.tenantId, t.legalEntityId),
    index("change_of_control_link_idx").on(t.linkedEventId),
  ],
);

/* ------------------------------------------------------------------ */
/* §10 — Good / bad leaver cases                                        */
/* ------------------------------------------------------------------ */

/**
 * Leaver treatment. Conditions are a CONTROLLED VOCABULARY, never arbitrary:
 * good-leaver candidates (death, disability, retirement, mutual agreement,
 * termination without cause, other approved) and narrowly-defined bad-leaver
 * candidates (fraud, theft, intentional material breach, serious misconduct,
 * deliberate IP misappropriation, intentional confidentiality breach,
 * enforceable competitive misconduct). Classification of a case as GOOD or BAD
 * requires legal review and governance approval; the software never auto-decides
 * forfeiture, and payment execution remains a Finance OS / treasury authority
 * (`finance_record_ref` stays null until Finance records it — BLOCKED EXTERNAL
 * for real money movement by design).
 */
export const leaverCases = pgTable(
  "leaver_cases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    positionId: text("position_id")
      .notNull()
      .references(() => equityPositions.id),
    holderPartyId: text("holder_party_id").references(() => parties.id),
    /** GOOD_LEAVER | BAD_LEAVER | UNDETERMINED (UNDETERMINED until legal review). */
    caseType: text("case_type").notNull().default("UNDETERMINED"),
    /** Controlled condition code (see module comment; validated by the engine). */
    conditionCode: text("condition_code").notNull(),
    conditionEvidence: jsonb("condition_evidence").$type<Record<string, unknown>>().notNull().default({}),
    /** The recorded treatment {vested, unvested} the outcome was computed from. */
    treatment: jsonb("treatment").$type<{ vested: string; unvested: string } | null>(),
    /** INITIATED | CLASSIFIED | APPROVED | EXECUTED | DISPUTED | WITHDRAWN.
     *  (INITIATED: opened, UNDETERMINED. CLASSIFIED: legal review closed by a
     *  human lawyer, GOOD/BAD + treatment computed. APPROVED: governance
     *  resolution. EXECUTED: share disposition applied — payment settlement
     *  remains Finance OS authority.) */
    status: text("status").notNull().default("INITIATED"),
    vestedSharesAtEvent: bigint("vested_shares_at_event", { mode: "number" }).notNull().default(0),
    unvestedSharesAtEvent: bigint("unvested_shares_at_event", { mode: "number" }).notNull().default(0),
    retainedShares: bigint("retained_shares", { mode: "number" }),
    repurchaseShares: bigint("repurchase_shares", { mode: "number" }),
    forfeitedShares: bigint("forfeited_shares", { mode: "number" }),
    repurchasePricePerShare: numeric("repurchase_price_per_share", { precision: 18, scale: 6 }),
    repurchaseTotal: numeric("repurchase_total", { precision: 18, scale: 2 }),
    currency: text("currency"),
    /** How the price was determined — evidence, not an accounting posting. */
    valuationBasis: text("valuation_basis"),
    /** Finance OS remains the accounting authority for any payment. */
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    paymentStatus: text("payment_status").notNull().default("NOT_DUE"), // NOT_DUE | PENDING | SETTLED | DISPUTED
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    approvalRef: text("approval_ref"),
    resolutionRef: text("resolution_ref"),
    documentRefs: jsonb("document_refs").$type<string[]>().notNull().default([]),
    disputeNotes: text("dispute_notes"),
    initiatedBy: text("initiated_by").notNull(),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leaver_cases_position_idx").on(t.positionId),
    index("leaver_cases_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* §15 — ESOP plans, grants and grant events                            */
/* ------------------------------------------------------------------ */

export const esopPlans = pgTable(
  "esop_plans",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    planName: text("plan_name").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    poolSharesAuthorized: bigint("pool_shares_authorized", { mode: "number" }).notNull(),
    poolSharesIssued: bigint("pool_shares_issued", { mode: "number" }).notNull().default(0),
    /** Default grant vesting terms — a candidate default, never legal truth. */
    defaultVesting: jsonb("default_vesting").$type<{
      vestingMonths: number;
      cliffMonths: number;
      frequency: string;
    }>().notNull().default({ vestingMonths: 48, cliffMonths: 12, frequency: "MONTHLY" }),
    exerciseWindowDays: integer("exercise_window_days").notNull().default(90),
    /** DRAFT | LEGAL_REVIEW | APPROVED | ACTIVE | SUSPENDED | TERMINATED | EXPIRED. */
    status: text("status").notNull().default("DRAFT"),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    approvedByResolutionId: text("approved_by_resolution_id"),
    documentRef: text("document_ref"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("esop_plans_name_uidx").on(t.tenantId, t.planName),
    index("esop_plans_tenant_idx").on(t.tenantId),
  ],
);

export const esopGrants = pgTable(
  "esop_grants",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    planId: text("plan_id")
      .notNull()
      .references(() => esopPlans.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    granteePartyId: text("grantee_party_id")
      .notNull()
      .references(() => parties.id),
    /** HCM remains the employee source of truth — reference, never a copy. */
    hcmEmployeeRef: text("hcm_employee_ref"),
    shareClassId: text("share_class_id").references(() => shareClasses.id),
    optionShares: bigint("option_shares", { mode: "number" }).notNull(),
    exercisePricePerShare: numeric("exercise_price_per_share", { precision: 18, scale: 6 }).notNull(),
    currency: text("currency").notNull(),
    grantDate: date("grant_date").notNull(),
    vestingScheduleId: text("vesting_schedule_id"),
    /** PROPOSED | APPROVED | ACTIVE | PARTIALLY_EXERCISED | EXERCISED | CANCELLED | EXPIRED | FORFEITED | TERMINATED. */
    status: text("status").notNull().default("PROPOSED"),
    exercisedShares: bigint("exercised_shares", { mode: "number" }).notNull().default(0),
    /** Tax metadata is jurisdiction-aware evidence, never a tax determination. */
    taxMetadata: jsonb("tax_metadata").$type<Record<string, unknown>>().notNull().default({}),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    approvalRef: text("approval_ref"),
    documentRef: text("document_ref"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("esop_grants_plan_idx").on(t.planId),
    index("esop_grants_grantee_idx").on(t.tenantId, t.granteePartyId),
  ],
);

/** APPEND-ONLY ESOP grant ledger: approvals, vesting, exercises, cancellations. */
export const esopGrantEvents = pgTable(
  "esop_grant_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    grantId: text("grant_id")
      .notNull()
      .references(() => esopGrants.id),
    /** GRANT_APPROVED | VESTING_MILESTONE | EXERCISED | CANCELLED | EXPIRED | FORFEITED | TERMINATED. */
    eventType: text("event_type").notNull(),
    sharesDelta: bigint("shares_delta", { mode: "number" }).notNull().default(0),
    exercisePricePerShare: numeric("exercise_price_per_share", { precision: 18, scale: 6 }),
    proceedsRef: text("proceeds_ref"), // Finance OS reference; never an amount posted here
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    actorUserId: text("actor_user_id"),
    authorityRef: text("authority_ref"),
    documentRef: text("document_ref"),
    traceId: text("trace_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("esop_grant_events_grant_idx").on(t.grantId),
    index("esop_grant_events_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §13 — Reconstructable cap-table snapshots                            */
/* ------------------------------------------------------------------ */

/**
 * Point-in-time capitalization snapshot. Snapshots are COMPUTED from positions,
 * schedules and the append-only event ledgers and record their reconstruction
 * basis — they never become an independent truth (§13: reconstructable).
 */
export const capTableSnapshots = pgTable(
  "cap_table_snapshots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    asOfDate: date("as_of_date").notNull(),
    authorizedShares: bigint("authorized_shares", { mode: "number" }).notNull().default(0),
    issuedShares: bigint("issued_shares", { mode: "number" }).notNull().default(0),
    outstandingShares: bigint("outstanding_shares", { mode: "number" }).notNull().default(0),
    vestedShares: bigint("vested_shares", { mode: "number" }).notNull().default(0),
    unvestedShares: bigint("unvested_shares", { mode: "number" }).notNull().default(0),
    esopPoolShares: bigint("esop_pool_shares", { mode: "number" }).notNull().default(0),
    esopGrantedShares: bigint("esop_granted_shares", { mode: "number" }).notNull().default(0),
    optionsOutstanding: bigint("options_outstanding", { mode: "number" }).notNull().default(0),
    treasuryShares: bigint("treasury_shares", { mode: "number" }).notNull().default(0),
    cancelledShares: bigint("cancelled_shares", { mode: "number" }).notNull().default(0),
    fullyDilutedShares: bigint("fully_diluted_shares", { mode: "number" }).notNull().default(0),
    /** Per holder / class breakdown incl. voting & economic percentages. */
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull().default({}),
    /** Reconstruction basis: event-ledger head ids used for the computation. */
    reconstructionBasis: jsonb("reconstruction_basis").$type<Record<string, unknown>>().notNull().default({}),
    computedBy: text("computed_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cap_table_snapshots_entity_date_uidx").on(t.tenantId, t.legalEntityId, t.asOfDate),
    index("cap_table_snapshots_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §14 — Dilution scenarios (analysis only, never executed)             */
/* ------------------------------------------------------------------ */

/**
 * Dilution scenario. Pre/transaction/post capitalization is computed by the
 * deterministic engine and STORED AS ANALYSIS. A scenario never mutates a
 * position, a schedule or a snapshot; `execution_prohibited` is a structural
 * reminder that turning a scenario into reality is a separate governed
 * mutation with its own authority (§14: never alter historical actuals).
 */
export const dilutionScenarios = pgTable(
  "dilution_scenarios",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    name: text("name").notNull(),
    /** NEW_FINANCING | ESOP_EXPANSION | FOUNDER_ISSUANCE | INVESTOR_ISSUANCE | CONVERSION
     *  | OPTION_EXERCISE | ACQUISITION | SECONDARY_TRANSFER | RECAPITALIZATION. */
    scenarioType: text("scenario_type").notNull(),
    modelVersion: text("model_version").notNull().default("1.0.0"),
    assumptions: jsonb("assumptions").$type<Record<string, unknown>>().notNull().default({}),
    preTransaction: jsonb("pre_transaction").$type<Record<string, unknown>>().notNull().default({}),
    transaction: jsonb("transaction").$type<Record<string, unknown>>().notNull().default({}),
    postTransaction: jsonb("post_transaction").$type<Record<string, unknown>>().notNull().default({}),
    /** DRAFT | REVIEWED | APPROVED | REJECTED | ARCHIVED — never EXECUTED. */
    status: text("status").notNull().default("DRAFT"),
    executionProhibited: boolean("execution_prohibited").notNull().default(true),
    decisionOwnerUserId: text("decision_owner_user_id"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dilution_scenarios_entity_idx").on(t.tenantId, t.legalEntityId),
    index("dilution_scenarios_type_idx").on(t.scenarioType),
  ],
);
