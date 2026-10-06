/**
 * BEYU OS — HCM COMPENSATION, BENEFITS & EMPLOYEE WELFARE schema.
 *
 * HCM → Compensation & Benefits → Employee Welfare → Incentives.
 *
 * HCM IS A SHARED ENTERPRISE CAPABILITY, NOT AN HR OS. These tables extend the existing people
 * domain (`positions`, `employees`, `employment_events`) — they do not create a second employment
 * record, a second identity, or a second ledger.
 *
 * THE THREE THINGS THIS SCHEMA REFUSES TO ALLOW:
 *
 *   1. SELF-APPROVAL. `compensation_approval_stages.actor_principal_id` carries a CHECK against the
 *      stage's own `beneficiary_principal_id`, so a beneficiary's approval cannot be inserted even by
 *      a bug in application code. The engine's `assertApprovalChain()` refuses the same thing earlier,
 *      with a comprehensible message; the constraint is the backstop that holds if the engine is
 *      bypassed.
 *
 *   2. A LOAN COUNTED AS PAY. `financial_treatment` separates PAYROLL / FRINGE_BENEFIT /
 *      NON_CASH_RECOGNITION / NON_REPAYABLE_WELFARE (costs) from LOAN_ADVANCE (a receivable). The
 *      reporting engine never sums across that boundary, and the column makes the boundary queryable.
 *
 *   3. THE THREE SPONSORSHIPS MERGED. Employee development (HCM), community (Foundation/CSR) and
 *      investment (FINANCE_OS) are three tables in three schemas with three different owners. Nothing
 *      here can record a community sponsorship or an investment as a staff benefit.
 *
 * Money is `numeric(38, 0)` integer minor units. Rates are integer basis points. No float, anywhere.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import { employees } from "./people";
import { users } from "./identity";

/* ------------------------------------------------------------------ */
/* §13 / §14 — Policies                                                */
/* ------------------------------------------------------------------ */

/**
 * A versioned compensation policy — a bonus policy, an allowance policy, a welfare policy or a
 * credit policy.
 *
 * Policies are VERSIONED rather than edited: a rate change is a new row. An award can therefore always
 * name the exact policy version that produced it, which is what makes a bonus explainable a year later.
 */
export const compensationPolicies = pgTable(
  "compensation_policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    code: text("code").notNull(),
    version: integer("version").notNull().default(1),
    /** BONUS | ALLOWANCE | CREDIT | WELFARE | BENEFIT | SPONSORSHIP. */
    policyFamily: text("policy_family").notNull(),
    /** Bonus type, allowance type or credit kind, per the family. */
    policyType: text("policy_type").notNull(),
    /** Bonus calculation basis, allowance frequency, or credit convention, per the family. */
    calculationBasis: text("calculation_basis"),
    currency: text("currency").notNull(),
    rateBps: integer("rate_bps"),
    fixedAmountMinor: numeric("fixed_amount_minor", { precision: 38, scale: 0 }),
    unitRateMinor: numeric("unit_rate_minor", { precision: 38, scale: 0 }),
    budgetMinor: numeric("budget_minor", { precision: 38, scale: 0 }),
    monthlyCeilingMinor: numeric("monthly_ceiling_minor", { precision: 38, scale: 0 }),
    minimumServiceMonths: integer("minimum_service_months"),
    performanceThresholdBps: integer("performance_threshold_bps"),
    quotaMinor: numeric("quota_minor", { precision: 38, scale: 0 }),
    requiresManagerRecommendation: boolean("requires_manager_recommendation").notNull().default(true),
    requiresHrValidation: boolean("requires_hr_validation").notNull().default(true),
    requiresFinanceValidation: boolean("requires_finance_validation").notNull().default(true),
    requiresFinalApproval: boolean("requires_final_approval").notNull().default(true),
    eligibilityRule: text("eligibility_rule").notNull(),
    policyStatement: text("policy_statement").notNull(),
    approved: boolean("approved").notNull().default(false),
    approvalRef: text("approval_ref"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: text("status").notNull().default("DRAFT"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("compensation_policies_code_version_uidx").on(t.tenantId, t.code, t.version),
    index("compensation_policies_family_idx").on(t.policyFamily, t.policyType),
    check("compensation_policies_family_check", sql`policy_family IN ('BONUS','ALLOWANCE','CREDIT','WELFARE','BENEFIT','SPONSORSHIP')`),
    check("compensation_policies_currency_check", sql`char_length(currency) = 3`),
    check("compensation_policies_version_check", sql`version >= 1`),
    check("compensation_policies_rate_check", sql`rate_bps IS NULL OR (rate_bps >= 0 AND rate_bps <= 10000)`),
    check(
      "compensation_policies_amounts_check",
      sql`(fixed_amount_minor IS NULL OR fixed_amount_minor >= 0) AND (unit_rate_minor IS NULL OR unit_rate_minor >= 0) AND (budget_minor IS NULL OR budget_minor >= 0) AND (monthly_ceiling_minor IS NULL OR monthly_ceiling_minor >= 0) AND (quota_minor IS NULL OR quota_minor >= 0)`,
    ),
    check(
      "compensation_policies_approval_check",
      sql`(approved = false AND approval_ref IS NULL) OR (approved = true AND approval_ref IS NOT NULL)`,
    ),
    check(
      "compensation_policies_period_check",
      sql`effective_to IS NULL OR effective_to >= effective_from`,
    ),
    check("compensation_policies_eligibility_check", sql`char_length(eligibility_rule) >= 8`),
  ],
);

/* ------------------------------------------------------------------ */
/* §13 — Entitlements                                                  */
/* ------------------------------------------------------------------ */

/**
 * One employee entitlement — the HCM-owned "who is owed what, why".
 *
 * This is NOT a payment and NOT a ledger entry. Finance OS records the payment from this authorised
 * entitlement; `finance_reference_id` holds the pointer back to that record when it exists.
 */
export const compensationEntitlements = pgTable(
  "compensation_entitlements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    /** CANONICAL IDENTITY — the employee record. Employee IDs are never authentication identities. */
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    /** The GlobalUserID this employee is, when known. Used for the segregation-of-duties check. */
    employeePrincipalId: text("employee_principal_id").references(() => users.id),
    policyId: text("policy_id").references(() => compensationPolicies.id),
    /** The exact policy version used, so a result is reproducible after the policy changes. */
    policyVersion: integer("policy_version"),
    kind: text("kind").notNull(),
    period: text("period"),
    currency: text("currency").notNull(),
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0 }).notNull(),
    /** VERIFIED | CALCULATED | ESTIMATED | FORECAST — the evidential standing of the figure. */
    dataState: text("data_state").notNull().default("CALCULATED"),
    financialTreatment: text("financial_treatment").notNull(),
    eligibility: text("eligibility").notNull(),
    reason: text("reason").notNull(),
    policyRef: text("policy_ref").notNull(),
    effectiveDate: date("effective_date").notNull(),
    status: text("status").notNull().default("DRAFT"),
    /** The calculation that produced this amount, preserved verbatim. */
    calculation: jsonb("calculation").$type<Record<string, unknown>>(),
    /** Finance OS pointer to the posted payment, when one exists. Never a posting. */
    financeReferenceId: text("finance_reference_id"),
    /**
     * The CANONICAL employment record this entitlement derives from.
     *
     * Contracted base pay is owned by the employee registry (`employees.base_salary`) — not by this
     * table. A BASE_COMPENSATION entitlement is a governed PRESENTATION of that registry row (with its
     * own approval chain), so it must cite the record it mirrors. Without the reference the two could
     * diverge silently and the compensation register would become a second source of truth for pay.
     */
    employmentRelationshipRef: text("employment_relationship_ref"),
    raisedBy: text("raised_by")
      .notNull()
      .references(() => users.id),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    index("compensation_entitlements_employee_idx").on(t.employeeId, t.effectiveDate),
    index("compensation_entitlements_status_idx").on(t.tenantId, t.status),
    index("compensation_entitlements_kind_idx").on(t.kind),
    check(
      "compensation_entitlements_kind_check",
      sql`kind IN ('BASE_COMPENSATION','PERFORMANCE_BONUS','PROFIT_SHARING','SALES_COMMISSION','PROJECT_COMPLETION_BONUS','RETENTION_BONUS','RECOGNITION_AWARD','DISCRETIONARY_BONUS','ALLOWANCE','BENEFIT','EMPLOYEE_CREDIT','EMERGENCY_ASSISTANCE','EDUCATION_SPONSORSHIP','PROFESSIONAL_DEVELOPMENT')`,
    ),
    check(
      "compensation_entitlements_treatment_check",
      sql`financial_treatment IN ('PAYROLL','EXPENSE_REIMBURSEMENT','FRINGE_BENEFIT','LOAN_ADVANCE','NON_CASH_RECOGNITION','NON_REPAYABLE_WELFARE')`,
    ),
    check(
      "compensation_entitlements_status_check",
      sql`status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAID','CANCELLED','EXPIRED')`,
    ),
    check(
      "compensation_entitlements_state_check",
      sql`data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST')`,
    ),
    check("compensation_entitlements_amount_check", sql`amount_minor >= 0`),
    check(
      "compensation_entitlements_base_source_check",
      sql`kind <> 'BASE_COMPENSATION' OR employment_relationship_ref IS NOT NULL`,
    ),
    check("compensation_entitlements_currency_check", sql`char_length(currency) = 3`),
    check("compensation_entitlements_reason_check", sql`char_length(reason) >= 3 AND char_length(eligibility) >= 3`),
    check(
      "compensation_entitlements_paid_check",
      sql`status <> 'PAID' OR finance_reference_id IS NOT NULL`,
    ),
  ],
);

/**
 * One cleared approval stage on an entitlement.
 *
 * `beneficiary_principal_id` is denormalised onto every stage precisely so the CHECK below can refuse a
 * self-approval inside a single row, without a trigger. `actor_principal_id` is NOT NULL: an "approved
 * by the system" stage with no accountable human is exactly what the governance model forbids, and the
 * engine refuses a chain containing one.
 */
export const compensationApprovalStages = pgTable(
  "compensation_approval_stages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    entitlementId: text("entitlement_id")
      .notNull()
      .references(() => compensationEntitlements.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    actorPrincipalId: text("actor_principal_id")
      .notNull()
      .references(() => users.id),
    beneficiaryPrincipalId: text("beneficiary_principal_id").references(() => users.id),
    /** The basis the approver relied on. Required for every stage except PAYMENT. */
    note: text("note"),
    actedAt: timestamp("acted_at", { withTimezone: true }).notNull().defaultNow(),
    sequence: integer("sequence").notNull(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    uniqueIndex("compensation_approval_stages_entitlement_stage_uidx").on(t.entitlementId, t.stage),
    index("compensation_approval_stages_entitlement_idx").on(t.entitlementId, t.sequence),
    check(
      "compensation_approval_stages_stage_check",
      sql`stage IN ('MANAGER_RECOMMENDATION','HR_VALIDATION','FINANCE_VALIDATION','FINAL_APPROVAL','PAYMENT')`,
    ),
    check(
      "compensation_approval_stages_sod_check",
      sql`beneficiary_principal_id IS NULL OR actor_principal_id <> beneficiary_principal_id`,
    ),
    check(
      "compensation_approval_stages_note_check",
      sql`stage = 'PAYMENT' OR (note IS NOT NULL AND char_length(note) >= 4)`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* §15 — Employee credit and loans                                     */
/* ------------------------------------------------------------------ */

export const employeeCreditFacilities = pgTable(
  "employee_credit_facilities",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    employeePrincipalId: text("employee_principal_id").references(() => users.id),
    kind: text("kind").notNull(),
    policyId: text("policy_id").references(() => compensationPolicies.id),
    currency: text("currency").notNull(),
    principalMinor: numeric("principal_minor", { precision: 38, scale: 0 }).notNull(),
    annualInterestRateBps: integer("annual_interest_rate_bps").notNull().default(0),
    instalments: integer("instalments").notNull(),
    firstInstalmentDate: date("first_instalment_date").notNull(),
    payrollDeductionAuthorised: boolean("payroll_deduction_authorised").notNull().default(false),
    authorisationRef: text("authorisation_ref"),
    maximumDeductionPerPeriodMinor: numeric("maximum_deduction_per_period_minor", { precision: 38, scale: 0 }),
    purpose: text("purpose").notNull(),
    approvalRef: text("approval_ref"),
    status: text("status").notNull().default("PENDING"),
    disbursedOn: date("disbursed_on"),
    financeReferenceId: text("finance_reference_id"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("employee_credit_facilities_employee_idx").on(t.employeeId, t.status),
    check("employee_credit_facilities_kind_check", sql`kind IN ('SALARY_ADVANCE','EMPLOYEE_LOAN','EMERGENCY_CREDIT','EDUCATION_CREDIT')`),
    check("employee_credit_facilities_currency_check", sql`char_length(currency) = 3`),
    check("employee_credit_facilities_principal_check", sql`principal_minor > 0`),
    check("employee_credit_facilities_instalments_check", sql`instalments >= 1`),
    check("employee_credit_facilities_rate_check", sql`annual_interest_rate_bps > -10000`),
    check(
      "employee_credit_facilities_deduction_check",
      sql`payroll_deduction_authorised = false OR authorisation_ref IS NOT NULL`,
    ),
    check("employee_credit_facilities_status_check", sql`status IN ('DRAFT','PENDING','APPROVED','REJECTED','PAID','CANCELLED','EXPIRED')`),
    check(
      "employee_credit_facilities_disbursed_check",
      sql`disbursed_on IS NULL OR status = 'PAID'`,
    ),
  ],
);

/** The stored repayment schedule. Regenerable from the facility, stored so a statement is reproducible. */
export const employeeCreditInstalments = pgTable(
  "employee_credit_instalments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    facilityId: text("facility_id")
      .notNull()
      .references(() => employeeCreditFacilities.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    dueDate: date("due_date").notNull(),
    openingBalanceMinor: numeric("opening_balance_minor", { precision: 38, scale: 0 }).notNull(),
    interestMinor: numeric("interest_minor", { precision: 38, scale: 0 }).notNull(),
    principalMinor: numeric("principal_minor", { precision: 38, scale: 0 }).notNull(),
    instalmentMinor: numeric("instalment_minor", { precision: 38, scale: 0 }).notNull(),
    closingBalanceMinor: numeric("closing_balance_minor", { precision: 38, scale: 0 }).notNull(),
    paidOn: date("paid_on"),
    /** Finance OS pointer for the payment that settled this instalment. */
    financeReferenceId: text("finance_reference_id"),
  },
  (t) => [
    uniqueIndex("employee_credit_instalments_facility_number_uidx").on(t.facilityId, t.number),
    check("employee_credit_instalments_number_check", sql`number >= 1`),
    check(
      "employee_credit_instalments_amounts_check",
      sql`opening_balance_minor >= 0 AND interest_minor >= 0 AND principal_minor >= 0 AND instalment_minor > 0 AND closing_balance_minor >= 0`,
    ),
    check(
      "employee_credit_instalments_balance_check",
      sql`opening_balance_minor - principal_minor = closing_balance_minor`,
    ),
    check(
      "employee_credit_instalments_instalment_check",
      sql`instalment_minor = principal_minor + interest_minor`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* §18 — Emergency assistance fund                                     */
/* ------------------------------------------------------------------ */

export const emergencyAssistanceCases = pgTable(
  "emergency_assistance_cases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    employeePrincipalId: text("employee_principal_id").references(() => users.id),
    caseNumber: text("case_number").notNull(),
    category: text("category").notNull(),
    currency: text("currency").notNull(),
    requestedAmountMinor: numeric("requested_amount_minor", { precision: 38, scale: 0 }).notNull(),
    approvedAmountMinor: numeric("approved_amount_minor", { precision: 38, scale: 0 }),
    /** Records capability pointers. Evidence files are never copied into this table. */
    evidenceRefs: jsonb("evidence_refs").$type<readonly string[]>().notNull().default([]),
    repayable: boolean("repayable").notNull().default(false),
    status: text("status").notNull().default("SUBMITTED"),
    reviewNotes: text("review_notes"),
    /** The finding set from reviewEmergencyCase(), preserved so the decision is explainable. */
    reviewFindings: jsonb("review_findings").$type<readonly string[]>().notNull().default([]),
    approvalRef: text("approval_ref"),
    approvedByPrincipalId: text("approved_by_principal_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    financeReferenceId: text("finance_reference_id"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    uniqueIndex("emergency_assistance_cases_number_uidx").on(t.tenantId, t.caseNumber),
    index("emergency_assistance_cases_employee_idx").on(t.employeeId, t.status),
    index("emergency_assistance_cases_status_idx").on(t.tenantId, t.status),
    check(
      "emergency_assistance_cases_status_check",
      sql`status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','DISBURSED','CLOSED')`,
    ),
    check("emergency_assistance_cases_amount_check", sql`requested_amount_minor > 0`),
    check(
      "emergency_assistance_cases_approved_check",
      sql`approved_amount_minor IS NULL OR (approved_amount_minor >= 0 AND approved_amount_minor <= requested_amount_minor)`,
    ),
    check("emergency_assistance_cases_currency_check", sql`char_length(currency) = 3`),
    check("emergency_assistance_cases_category_check", sql`char_length(category) >= 3`),
    check(
      "emergency_assistance_cases_approval_check",
      sql`status NOT IN ('APPROVED','DISBURSED') OR (approval_ref IS NOT NULL AND approved_amount_minor IS NOT NULL)`,
    ),
    check(
      "emergency_assistance_cases_sod_check",
      sql`employee_principal_id IS NULL OR approved_by_principal_id IS NULL OR approved_by_principal_id <> employee_principal_id`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* §17 — Employee development sponsorship (HCM side only)               */
/* ------------------------------------------------------------------ */

/**
 * Employee learning & development sponsorship — the HCM-owned category.
 *
 * The community category belongs to the Foundation schema and the investment category to the Finance
 * schema; neither can be written here. The `domain` CHECK makes the separation structural rather than
 * conventional.
 */
export const employeeSponsorships = pgTable(
  "employee_sponsorships",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id),
    /** Fixed to EMPLOYEE_DEVELOPMENT: this table cannot hold another sponsorship category. */
    domain: text("domain").notNull().default("EMPLOYEE_DEVELOPMENT"),
    /** Fixed to HCM: the owner of this category. */
    ownerCapability: text("owner_capability").notNull().default("HCM"),
    policyId: text("policy_id").references(() => compensationPolicies.id),
    programme: text("programme").notNull(),
    currency: text("currency").notNull(),
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0 }).notNull(),
    financialTreatment: text("financial_treatment").notNull().default("FRINGE_BENEFIT"),
    retentionObligationMonths: integer("retention_obligation_months"),
    repayableOnEarlyExit: boolean("repayable_on_early_exit").notNull().default(false),
    policyRef: text("policy_ref").notNull(),
    status: text("status").notNull().default("DRAFT"),
    financeReferenceId: text("finance_reference_id"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("employee_sponsorships_employee_idx").on(t.employeeId),
    check("employee_sponsorships_domain_check", sql`domain = 'EMPLOYEE_DEVELOPMENT'`),
    check("employee_sponsorships_owner_check", sql`owner_capability = 'HCM'`),
    check(
      "employee_sponsorships_treatment_check",
      sql`financial_treatment IN ('FRINGE_BENEFIT','EXPENSE_REIMBURSEMENT')`,
    ),
    check("employee_sponsorships_amount_check", sql`amount_minor >= 0`),
    check("employee_sponsorships_currency_check", sql`char_length(currency) = 3`),
    check(
      "employee_sponsorships_retention_check",
      sql`repayable_on_early_exit = false OR (retention_obligation_months IS NOT NULL AND retention_obligation_months > 0)`,
    ),
  ],
);

/** Policy families and treatments, exported for engines and routes so neither re-declares them. */
export const COMPENSATION_POLICY_FAMILIES = ["BONUS", "ALLOWANCE", "CREDIT", "WELFARE", "BENEFIT", "SPONSORSHIP"] as const;
export const COMPENSATION_FINANCIAL_TREATMENTS = [
  "PAYROLL",
  "EXPENSE_REIMBURSEMENT",
  "FRINGE_BENEFIT",
  "LOAN_ADVANCE",
  "NON_CASH_RECOGNITION",
  "NON_REPAYABLE_WELFARE",
] as const;

/** Employees-as-principals view helper type: a person may hold a user account AND an employee record. */
export type CompensationBeneficiary = { employeeId: string; employeePrincipalId: string | null };
