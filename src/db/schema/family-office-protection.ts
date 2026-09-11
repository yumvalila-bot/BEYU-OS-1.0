/**
 * BEYU OS — Family Office PROTECTION & INSURANCE tables.
 *
 * ============================ RELATIONSHIP TO THE OTHER FAMILY SCHEMAS ========
 *
 * This module joins — it does not replace — the three existing family schemas:
 *
 *   `people.ts` — the LIVE Family Office: `family_members`, `beneficiaries`
 *       (TRUST beneficiaries), `family_vault_items`. The insurance registers
 *       below are SEPARATE legal relationships: an insurance beneficiary
 *       designation is a contract designation, not a trust entitlement. The
 *       same person may stand in both; no record in either table implies,
 *       converts to, or is converted by a record in the other (§6).
 *   `family-office.ts` — the neutral policy/ratification mechanism. Still not
 *       materialized; untouched. Nothing below requires a ratified policy to
 *       EXIST as a row — recording a policy the family owns is operational
 *       fact, exactly as with the capital & wealth tables.
 *   `family-office-capital.ts` — capital & wealth. Succession links below
 *       point at `family_generational_plans` rows by REFERENCE only: insurance
 *       supplies LIQUIDITY, the plan/instrument supplies the LEGAL OUTCOME
 *       (§12). No trigger, job or service here mutates a plan, an obligation
 *       or a balance-sheet row.
 *
 * ============================== FINANCE BOUNDARY (FIR-018 / §22 / §32) =========
 *
 * Not a shadow ledger:
 *   - every monetary column is `numeric(18,2)`, never float;
 *   - every amount-carrying row is stamped `authoritative_owner` (default
 *     'FINANCE_OS') and carries a nullable `finance_record_ref`;
 *   - `epistemic_class` is mandatory on amount-carrying rows: a modeled or
 *     user-provided figure can never be mistaken for a posted one;
 *   - no column here is a balance, a journal line, a period or a
 *     reconciliation, and NO code path in this module calls the Finance posting
 *     engine — CAP_POSTING remains locked and fail-closed exactly as before,
 *     untouched by this domain;
 *   - a death benefit is CONTINGENT PROTECTION: it is recorded as the face
 *     amount of a contract and is never summed into any wealth total by these
 *     tables or by the service above them (§4).
 *
 * ============================== ISOLATION ======================================
 *
 * Every table carries `tenant_id` (references `tenants`); policies, claims and
 * assessments additionally carry `legal_entity_id` / `country_code` where the
 * domain has one, matching the capital & wealth architecture. Migration 0038
 * enables RLS and installs the `tenant_id = ANY (beyu_tenant_ids())` policy on
 * every table below, mirroring 0036/0037, and fails if it did not.
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
import { legalEntities, tenants } from "./core";
import { familyGenerationalPlans } from "./family-office-capital";

/* ------------------------------------------------------------------ */
/* §7/§8/§9 — The policy record                                          */
/* ------------------------------------------------------------------ */

export const familyInsurancePolicies = pgTable(
  "family_insurance_policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Corporate adjacency (§21): a VIEW link, never a transfer of ownership. */
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code"),
    policyNumber: text("policy_number").notNull(),
    /** PERSONAL_LIFE | FAMILY_PROTECTION | KEY_PERSON | SHAREHOLDER_BUY_SELL
     *  | SUCCESSION_LIQUIDITY | DEBT_PROTECTION | EXECUTIVE_CONTINUITY
     *  | GROUP_LIFE | OTHER (controlled; engine validates). */
    policyType: text("policy_type").notNull(),
    /** The five roles, recorded separately — never derived from one another. */
    ownerRef: text("owner_ref"),
    ownerKind: text("owner_kind"),
    insuredRef: text("insured_ref"),
    insuredKind: text("insured_kind"),
    premiumPayerRef: text("premium_payer_ref"),
    insurerRef: text("insurer_ref").notNull(),
    brokerRef: text("broker_ref"),
    currency: text("currency").notNull(),
    /** Face/coverage and death benefit — contingent protection, never liquid wealth. */
    coverageAmount: numeric("coverage_amount", { precision: 18, scale: 2 }).notNull(),
    deathBenefit: numeric("death_benefit", { precision: 18, scale: 2 }).notNull(),
    /** Null when the contract has none — not every policy has cash value. */
    cashValue: numeric("cash_value", { precision: 18, scale: 2 }),
    surrenderValue: numeric("surrender_value", { precision: 18, scale: 2 }),
    premiumAmount: numeric("premium_amount", { precision: 18, scale: 2 }).notNull(),
    premiumFrequency: text("premium_frequency").notNull(),
    nextPremiumDueDate: date("next_premium_due_date"),
    effectiveDate: date("effective_date"),
    /** Null for whole-life contracts — not every policy has a maturity date. */
    maturityDate: date("maturity_date"),
    reviewIntervalDays: integer("review_interval_days"),
    lastReviewDate: date("last_review_date"),
    nextReviewDate: date("next_review_date"),
    /** DRAFT | PENDING_UNDERWRITING | IN_FORCE | LAPSED | SURRENDERED | MATURED | TERMINATED. */
    status: text("status").notNull().default("DRAFT"),
    /** §15 review lifecycle, independent of contract status. */
    governanceStage: text("governance_stage").notNull().default("DRAFT"),
    assignmentStatus: text("assignment_status").notNull().default("NONE"),
    collateralBeneficiaryRef: text("collateral_beneficiary_ref"),
    purpose: text("purpose").notNull(),
    /** Succession LINK — reference only; insurance provides liquidity (§12).
     *  A real FK because the target is a family-office row in this database. */
    successionPlanId: text("succession_plan_id").references(() => familyGenerationalPlans.id),
    successionPlanRef: text("succession_plan_ref"),
    liquidityObjectiveRef: text("liquidity_objective_ref"),
    riskAssessmentRef: text("risk_assessment_ref"),
    /** GROUP_LIFE derives eligibility FROM HCM: a pointer, not a copy (§20). */
    hcmEmployeeRef: text("hcm_employee_ref"),
    /** References into the existing documents registry — no parallel store (§17). */
    documentRefs: jsonb("document_refs").$type<string[]>().notNull().default([]),
    /** Review POSTURE only. No legal/tax conclusion is ever stored as a fact (§23). */
    legalReviewStatus: text("legal_review_status").notNull().default("NOT_STARTED"),
    taxReviewStatus: text("tax_review_status").notNull().default("NOT_STARTED"),
    jurisdictionRef: text("jurisdiction_ref"),
    /** Provenance of the headline amounts (coverage/death benefit/cash value). */
    amountProvenance: text("amount_provenance").notNull().default("USER_PROVIDED"),
    amountSourceRef: text("amount_source_ref"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    epistemicClass: text("epistemic_class").notNull().default("USER_PROVIDED"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("family_insurance_policies_number_uidx").on(t.tenantId, t.policyNumber),
    index("family_insurance_policies_tenant_idx").on(t.tenantId),
    index("family_insurance_policies_status_idx").on(t.tenantId, t.status),
    index("family_insurance_policies_insured_idx").on(t.tenantId, t.insuredRef),
  ],
);

/* ------------------------------------------------------------------ */
/* §6 — Insurance beneficiary designations (NOT the trust register)     */
/* ------------------------------------------------------------------ */

export const familyInsuranceBeneficiaryDesignations = pgTable(
  "family_insurance_beneficiary_designations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    policyId: text("policy_id")
      .notNull()
      .references(() => familyInsurancePolicies.id),
    beneficiaryRef: text("beneficiary_ref").notNull(),
    /** FAMILY_MEMBER | LEGAL_ENTITY | TRUST | CHARITABLE | OTHER — recorded. */
    beneficiaryKind: text("beneficiary_kind").notNull(),
    designationType: text("designation_type").notNull(), // PRIMARY | CONTINGENT
    entitlementBasis: text("entitlement_basis").notNull(), // PERCENTAGE | FIXED_AMOUNT | RESIDUARY
    /** Exact integer millionths of a percent (100% = 100000000). No floats. */
    pctMillionths: integer("pct_millionths"),
    fixedAmount: numeric("fixed_amount", { precision: 18, scale: 2 }),
    currency: text("currency"),
    effectiveDate: date("effective_date").notNull(),
    endDate: date("end_date"),
    /** PROPOSED | ACTIVE | SUPERSEDED | REVOKED. */
    status: text("status").notNull().default("PROPOSED"),
    relationshipBasis: text("relationship_basis").notNull(),
    reviewStatus: text("review_status").notNull().default("UNREVIEWED"),
    legalReviewStatus: text("legal_review_status"),
    documentRef: text("document_ref"),
    notes: text("notes"),
    recordedBy: text("recorded_by").notNull(),
    authorityRef: text("authority_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_insurance_designations_policy_idx").on(t.policyId),
    index("family_insurance_designations_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §10 — Premium obligations                                            */
/* ------------------------------------------------------------------ */

export const familyInsurancePremiums = pgTable(
  "family_insurance_premiums",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    policyId: text("policy_id")
      .notNull()
      .references(() => familyInsurancePolicies.id),
    dueDate: date("due_date").notNull(),
    frequency: text("frequency").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    /** SCHEDULED | PAID | WAIVED | VOID. OVERDUE is derived at read time only. */
    status: text("status").notNull().default("SCHEDULED"),
    payerRef: text("payer_ref"),
    paidDate: date("paid_date"),
    paymentEvidenceDocumentRef: text("payment_evidence_document_ref"),
    /** Where Finance chooses to record the outflow, the pointer lands here. */
    financeRecordRef: text("finance_record_ref"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    epistemicClass: text("epistemic_class").notNull().default("USER_PROVIDED"),
    notes: text("notes"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("family_insurance_premiums_due_uidx").on(t.policyId, t.dueDate),
    index("family_insurance_premiums_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* Assignments & policy loans                                           */
/* ------------------------------------------------------------------ */

export const familyInsuranceAssignments = pgTable(
  "family_insurance_assignments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    policyId: text("policy_id")
      .notNull()
      .references(() => familyInsurancePolicies.id),
    assignmentType: text("assignment_type").notNull(), // COLLATERAL | ABSOLUTE
    assigneeRef: text("assignee_ref").notNull(),
    assigneeName: text("assignee_name").notNull(),
    securedAmount: numeric("secured_amount", { precision: 18, scale: 2 }),
    currency: text("currency"),
    effectiveDate: date("effective_date").notNull(),
    releaseDate: date("release_date"),
    /** ACTIVE | RELEASED | TERMINATED. */
    status: text("status").notNull().default("ACTIVE"),
    instrumentDocumentRef: text("instrument_document_ref").notNull(),
    notes: text("notes"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_insurance_assignments_policy_idx").on(t.policyId),
    index("family_insurance_assignments_tenant_idx").on(t.tenantId),
  ],
);

export const familyInsurancePolicyLoans = pgTable(
  "family_insurance_policy_loans",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    policyId: text("policy_id")
      .notNull()
      .references(() => familyInsurancePolicies.id),
    advancedDate: date("advanced_date").notNull(),
    principal: numeric("principal", { precision: 18, scale: 2 }).notNull(),
    interestRateBps: integer("interest_rate_bps"),
    outstandingBalance: numeric("outstanding_balance", { precision: 18, scale: 2 }),
    /** OUTSTANDING | REPAID | DEFAULTED. */
    status: text("status").notNull().default("OUTSTANDING"),
    repaidDate: date("repaid_date"),
    authorizationRef: text("authorization_ref"),
    notes: text("notes"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_insurance_policy_loans_policy_idx").on(t.policyId),
    index("family_insurance_policy_loans_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §14 — Policy review records                                          */
/* ------------------------------------------------------------------ */

export const familyInsuranceReviews = pgTable(
  "family_insurance_reviews",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    policyId: text("policy_id")
      .notNull()
      .references(() => familyInsurancePolicies.id),
    /** POLICY_REVIEW | BENEFICIARY_REVIEW | CLAIM_REVIEW | SUCCESSION_ALIGNMENT
     *  | MAJOR_FAMILY_CHANGE | MAJOR_OWNERSHIP_CHANGE. */
    reviewKind: text("review_kind").notNull(),
    reviewDate: date("review_date").notNull(),
    reviewerRef: text("reviewer_ref").notNull(),
    /** Always HUMAN for now; the column exists so the audit question
     *  "who reviewed this" has a typed answer, not an inferred one. */
    reviewerType: text("reviewer_type").notNull().default("HUMAN"),
    /** COMPLETED | EXCEPTIONS_RAISED | DEFERRED. */
    outcome: text("outcome").notNull(),
    /** The findings the reviewer stood over, serialized from the engine. */
    exceptions: jsonb("exceptions").$type<unknown[]>().notNull().default([]),
    nextReviewDate: date("next_review_date"),
    evidenceDocumentRefs: jsonb("evidence_document_refs").$type<string[]>().notNull().default([]),
    /** The governance stage this review concluded toward, if it moved one. */
    governanceStageAfter: text("governance_stage_after"),
    authorityRef: text("authority_ref"),
    notes: text("notes"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_insurance_reviews_policy_idx").on(t.policyId),
    index("family_insurance_reviews_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §16 — Claims ledger + its append-only event log                      */
/* ------------------------------------------------------------------ */

export const familyInsuranceClaims = pgTable(
  "family_insurance_claims",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    policyId: text("policy_id")
      .notNull()
      .references(() => familyInsurancePolicies.id),
    claimReference: text("claim_reference").notNull(),
    insuredRef: text("insured_ref").notNull(),
    insurerRef: text("insurer_ref").notNull(),
    incidentDate: date("incident_date").notNull(),
    notificationDate: date("notification_date"),
    /** §16 lifecycle, engine-guarded. */
    status: text("status").notNull().default("CLAIM_OPENED"),
    /** NONE | EXPECTED | CLAIMED | APPROVED | RECEIVED | ALLOCATED — monotonic. */
    proceedsState: text("proceeds_state").notNull().default("NONE"),
    approvedAmount: numeric("approved_amount", { precision: 18, scale: 2 }),
    receivedAmount: numeric("received_amount", { precision: 18, scale: 2 }),
    currency: text("currency").notNull(),
    proceedsReceivedDate: date("proceeds_received_date"),
    /** Reference to the Finance-side allocation; the movement itself is Finance's (§22). */
    allocationRef: text("allocation_ref"),
    decisionEvidenceRef: text("decision_evidence_ref"),
    documentRefs: jsonb("document_refs").$type<string[]>().notNull().default([]),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    epistemicClass: text("epistemic_class").notNull().default("USER_PROVIDED"),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("family_insurance_claims_ref_uidx").on(t.tenantId, t.claimReference),
    index("family_insurance_claims_policy_idx").on(t.policyId),
    index("family_insurance_claims_status_idx").on(t.tenantId, t.status),
  ],
);

export const familyInsuranceClaimEvents = pgTable(
  "family_insurance_claim_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    claimId: text("claim_id")
      .notNull()
      .references(() => familyInsuranceClaims.id),
    /** OPENED | DOCUMENT_REQUESTED | DOCUMENT_SUPPLIED | SUBMITTED
     *  | INSURER_DECISION | DISPUTE_RAISED | PROCEEDS_NOTED | ALLOCATED
     *  | NOTE | CLOSED. Append-only: no update or delete path exists. */
    eventKind: text("event_kind").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    evidenceDocumentRef: text("evidence_document_ref"),
    actorRef: text("actor_ref").notNull(),
    actorType: text("actor_type").notNull().default("HUMAN"),
    auditRef: text("audit_ref"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    index("family_insurance_claim_events_claim_idx").on(t.claimId),
    index("family_insurance_claim_events_tenant_idx").on(t.tenantId),
  ],
);

/* ------------------------------------------------------------------ */
/* §11 — Modeled protection-gap assessments                             */
/* ------------------------------------------------------------------ */

export const familyProtectionAssessments = pgTable(
  "family_protection_assessments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code"),
    /** What was assessed: a family member, a legal entity, or the family. */
    subjectRef: text("subject_ref").notNull(),
    subjectKind: text("subject_kind").notNull(), // FAMILY_MEMBER | LEGAL_ENTITY | FAMILY
    asOf: date("as_of").notNull(),
    currency: text("currency").notNull(),
    /** The six gap components with provenance, exactly as supplied. */
    components: jsonb("components").$type<unknown[]>().notNull(),
    /** Policies the caller counted as qualifying protection (with reasons). */
    policyRefs: jsonb("policy_refs").$type<string[]>().notNull().default([]),
    /** The full engine result — lines, bound, missing inputs, disclaimer. */
    result: jsonb("result").$type<unknown>().notNull(),
    methodology: text("methodology").notNull().default("beyu.protection-gap"),
    methodologyVersion: text("methodology_version").notNull(),
    /** DRAFT | FINAL. Only FINAL assessments are cited as a coverage target. */
    status: text("status").notNull().default("DRAFT"),
    epistemicClass: text("epistemic_class").notNull().default("MODELLED"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    disclaimer: text("disclaimer").notNull(),
    reviewedBy: text("reviewed_by"),
    authorityRef: text("authority_ref"),
    createdBy: text("created_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_protection_assessments_subject_idx").on(t.tenantId, t.subjectRef, t.asOf),
    index("family_protection_assessments_tenant_idx").on(t.tenantId),
  ],
);
