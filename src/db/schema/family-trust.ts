/**
 * BEYU OS — FAMILY TRUST GOVERNANCE tables (X10THINK Phase 3).
 *
 * ============================== RELATIONSHIP TO EXISTING TRUTH =================
 *
 * This module PERSISTS the trust rails that `src/lib/family/office/trust.ts`
 * already engineered as pure mechanism (trust references, instruments, versions,
 * trustee appointment chains, clause structures with the configurable clause
 * vocabulary: Spendthrift, No-Contest, Discretionary Distribution, Trustee
 * Removal/Replacement). It joins — never replaces — the existing registers:
 *
 *   - `legal_entities` — the trust itself is a legal entity (seeded:
 *     LEN_BEYU_FAMILY_TRUST). No parallel trust-identity store is created.
 *   - `entity_appointments` (core.ts) — trustees remain recorded there
 *     (role = TRUSTEE | PROTECTOR | SECRETARY). A trustee decision below links
 *     to the appointment it executes; it never duplicates it.
 *   - `beneficiaries` (people.ts) — the TRUST beneficiary register. Distributions
 *     reference a beneficiary row; they never restate entitlement.
 *   - `documents` (platform.ts) — instruments and provisions are document-linked
 *     (checksum-bound canonical registry). No parallel document store.
 *   - `resolutions` / `approvals` (governance.ts) — authority for trustee acts
 *     remains the governance engine; decisions here cite it by reference.
 *   - Finance OS — a distribution is a governed DECISION RECORD. Payment and
 *     accounting remain Finance/treasury authority (`finance_record_ref` stays
 *     null until Finance records it). Nothing here posts a journal entry;
 *     CAP_POSTING is untouched.
 *
 * ============================== LEGAL BOUNDARY (§8, §48) =======================
 *
 * Provisions are jurisdiction-aware and versioned. A provision whose legal
 * effect is not determined by a ratified reference (`legal_effect_reference`
 * null) is INERT — it structures the instrument, it does not enact it (exactly
 * the trust.ts rail doctrine). Spendthrift / no-contest / discretionary
 * distribution / trustee-removal enforceability is NEVER assumed: every
 * provision carries `legal_review_status` and `enforceability_assumed = false`
 * by default, and foreign legal effect requires REQUIRES_LEGAL_REVIEW closure
 * by a human lawyer — an external dependency the software cannot fabricate.
 *
 * Lifecycle (§8): DRAFT → LEGAL_REVIEW → APPROVED → EXECUTED → SUPERSEDED |
 * EXPIRED | DISPUTED. Statuses are controlled strings validated by the service;
 * no transition skips legal review for material provisions.
 *
 * ============================== ISOLATION ======================================
 *
 * Every table carries `tenant_id`. Migration 0041 enables RLS with the canonical
 * `tenant_id = ANY (beyu_tenant_ids())` policy (USING + WITH CHECK), grants the
 * runtime role DML only, and FAILS if any table lacks its policy (0035–0040
 * pattern). Default classification HIGHLY_RESTRICTED: family/trust data is under
 * the constitutional privacy article.
 */

import {
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
import { legalEntities, entityAppointments, tenants } from "./core";
import { parties } from "./identity";
import { beneficiaries } from "./people";

/**
 * A versioned trust instrument (deed, amendment, restatement). Version N+1
 * supersedes N via `supersedes_instrument_id`; superseded instruments are never
 * deleted — the instrument history is reconstructable (§8, §61).
 */
export const trustInstruments = pgTable(
  "trust_instruments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** The trust's legal entity — attribution, canonical identity stays in core. */
    trustEntityId: text("trust_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    instrumentName: text("instrument_name").notNull(),
    /** DEED | AMENDMENT | RESTATEMENT | SUPPLEMENTAL | TRUSTEE_APPOINTMENT | OTHER. */
    instrumentType: text("instrument_type").notNull().default("DEED"),
    version: integer("version").notNull().default(1),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    settlorPartyId: text("settlor_party_id").references(() => parties.id),
    /** Canonical documents-registry reference (checksum-bound). */
    documentRef: text("document_ref").notNull(),
    /** DRAFT | LEGAL_REVIEW | APPROVED | EXECUTED | SUPERSEDED | EXPIRED | DISPUTED. */
    status: text("status").notNull().default("DRAFT"),
    legalReviewStatus: text("legal_review_status").notNull().default("REQUIRES_LEGAL_REVIEW"),
    supersedesInstrumentId: text("supersedes_instrument_id"),
    effectiveDate: date("effective_date"),
    expirationDate: date("expiration_date"),
    approvedByResolutionId: text("approved_by_resolution_id"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trust_instruments_entity_version_uidx").on(t.tenantId, t.trustEntityId, t.instrumentType, t.version),
    index("trust_instruments_tenant_idx").on(t.tenantId),
    index("trust_instruments_status_idx").on(t.tenantId, t.status),
  ],
);

/**
 * One governed clause of an instrument: SPENDTHRIFT | NO_CONTEST |
 * DISCRETIONARY_DISTRIBUTION | TRUSTEE_REMOVAL | TRUSTEE_REPLACEMENT |
 * TRUSTEE_SUCCESSION | BENEFICIARY_ELIGIBILITY | DISTRIBUTION_STANDARD | OTHER.
 *
 * INERT without a ratified legal-effect reference — the clause structures the
 * instrument; it does not enact it (trust.ts doctrine, persisted).
 */
export const trustProvisions = pgTable(
  "trust_provisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => trustInstruments.id),
    provisionType: text("provision_type").notNull(),
    version: integer("version").notNull().default(1),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    summary: text("summary").notNull(),
    /** Clause text lives in the documents registry, referenced — never copied. */
    clauseDocumentRef: text("clause_document_ref"),
    /** INERT | UNDER_LEGAL_REVIEW | LEGAL_REVIEWED | APPROVED | EXECUTED | DISPUTED | UNENFORCEABLE_IN_JURISDICTION. */
    legalEffectStatus: text("legal_effect_status").notNull().default("INERT"),
    /** Ratified reference determining legal effect (null ⇒ INERT, structurally). */
    legalEffectReference: text("legal_effect_reference"),
    /** Structural default: enforceability is NEVER assumed by software. */
    enforceabilityAssumed: boolean("enforceability_assumed").notNull().default(false),
    /** DRAFT | LEGAL_REVIEW | APPROVED | EXECUTED | SUPERSEDED | EXPIRED | DISPUTED. */
    status: text("status").notNull().default("DRAFT"),
    supersedesProvisionId: text("supersedes_provision_id"),
    approvedByResolutionId: text("approved_by_resolution_id"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trust_provisions_instrument_idx").on(t.instrumentId),
    index("trust_provisions_type_idx").on(t.tenantId, t.provisionType),
  ],
);

/**
 * Trustee governance decisions: appointment, removal, replacement, succession,
 * conflict declaration, recusal, distribution approval. WHO / AUTHORITY /
 * RATIONALE / DATA BASIS / DECISION / CONSEQUENCES / EFFECTIVE DATE / EVIDENCE
 * are all recorded (§16). Execution links to the canonical `entity_appointments`
 * row it produced — the appointment registry is never duplicated.
 */
export const trustDecisions = pgTable(
  "trust_decisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => trustInstruments.id),
    /** TRUSTEE_APPOINTMENT | TRUSTEE_REMOVAL | TRUSTEE_REPLACEMENT | TRUSTEE_SUCCESSION
     *  | CONFLICT_DECLARED | RECUSAL | DISTRIBUTION_APPROVAL | OTHER. */
    decisionType: text("decision_type").notNull(),
    subjectPartyId: text("subject_party_id").references(() => parties.id),
    rationale: text("rationale").notNull(),
    dataBasis: text("data_basis"),
    consequences: text("consequences"),
    /** Authority remains the governance engine: RESOLUTION / DELEGATION reference. */
    authorityKind: text("authority_kind").notNull().default("RESOLUTION"),
    authorityRef: text("authority_ref"),
    /** PROPOSED | LEGAL_REVIEW | APPROVED | EXECUTED | REJECTED | DISPUTED | WITHDRAWN. */
    status: text("status").notNull().default("PROPOSED"),
    /** The appointment row produced on execution (canonical registry link). */
    resultingAppointmentId: text("resulting_appointment_id").references(() => entityAppointments.id),
    effectiveDate: date("effective_date"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    evidenceDocumentRefs: jsonb("evidence_document_refs").$type<string[]>().notNull().default([]),
    conflictOfInterest: boolean("conflict_of_interest").notNull().default(false),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trust_decisions_instrument_idx").on(t.instrumentId),
    index("trust_decisions_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/**
 * A governed trust distribution DECISION RECORD. Discretionary distributions
 * require an approved discretion basis; the beneficiary register
 * (`beneficiaries`) remains entitlement truth; Finance OS remains accounting
 * truth (`authoritative_owner` default FINANCE_OS, `finance_record_ref` null
 * until Finance records the movement). No payment is executed here.
 */
export const trustDistributions = pgTable(
  "trust_distributions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    instrumentId: text("instrument_id")
      .notNull()
      .references(() => trustInstruments.id),
    beneficiaryId: text("beneficiary_id")
      .notNull()
      .references(() => beneficiaries.id),
    /** DISCRETIONARY | MANDATORY | HARDSHIP | EDUCATION | MEDICAL | OTHER. */
    distributionType: text("distribution_type").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    currency: text("currency"),
    assetDescription: text("asset_description"),
    /** Required for DISCRETIONARY: the recorded basis for exercising discretion. */
    discretionBasis: text("discretion_basis"),
    conditionsMet: jsonb("conditions_met").$type<Record<string, unknown>>().notNull().default({}),
    /** PROPOSED | LEGAL_REVIEW | APPROVED | EXECUTED | REJECTED | REVERSED | DISPUTED. */
    status: text("status").notNull().default("PROPOSED"),
    approvalRef: text("approval_ref"),
    resolutionRef: text("resolution_ref"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    paymentStatus: text("payment_status").notNull().default("NOT_DUE"), // NOT_DUE | PENDING | SETTLED | DISPUTED
    effectiveDate: date("effective_date"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trust_distributions_instrument_idx").on(t.instrumentId),
    index("trust_distributions_beneficiary_idx").on(t.beneficiaryId),
    index("trust_distributions_tenant_status_idx").on(t.tenantId, t.status),
  ],
);
