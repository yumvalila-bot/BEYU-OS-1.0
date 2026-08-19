/**
 * BEYU OS → Finance OS domain (first-class domain, not a separate control plane).
 * Authoritative for financial consequences: ledger, capital, treasury,
 * the configurable waterfall engine and Tax Strategy Intelligence.
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
import {
  authorityStatusEnum,
  classificationEnum,
  eligibilityEnum,
  taxPositionEnum,
  versionStatusEnum,
} from "./enums";
import { legalEntities, tenants } from "./core";

export const financialPeriods = pgTable(
  "financial_periods",
  {
    id: text("id").primaryKey(),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN | CLOSING | CLOSED | LOCKED
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("financial_periods_uidx").on(t.legalEntityId, t.code)],
);

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(), // ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
    ifrsCategory: text("ifrs_category"),
    parentAccountId: text("parent_account_id"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("ledger_accounts_code_uidx").on(t.code)],
);

/** Immutable double-entry journal. Corrections are reversals, never edits. */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    periodId: text("period_id").references(() => financialPeriods.id),
    reference: text("reference").notNull(),
    description: text("description").notNull(),
    currency: text("currency").notNull(),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }).notNull().default("1"),
    postedBy: text("posted_by").notNull(),
    approvedBy: text("approved_by"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    reversalOfId: text("reversal_of_id"),
    idempotencyKey: text("idempotency_key"),
    source: text("source").notNull().default("MANUAL"),
  },
  (t) => [
    uniqueIndex("journal_entries_reference_uidx").on(t.reference),
    index("journal_entries_entity_idx").on(t.legalEntityId),
  ],
);

export const journalLines = pgTable("journal_lines", {
  id: text("id").primaryKey(),
  entryId: text("entry_id")
    .notNull()
    .references(() => journalEntries.id),
  accountId: text("account_id")
    .notNull()
    .references(() => ledgerAccounts.id),
  debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
  memo: text("memo"),
  costCentre: text("cost_centre"),
});

export const treasuryPositions = pgTable("treasury_positions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  legalEntityId: text("legal_entity_id")
    .notNull()
    .references(() => legalEntities.id),
  institution: text("institution").notNull(),
  accountLabel: text("account_label").notNull(),
  accountType: text("account_type").notNull().default("OPERATING"),
  currency: text("currency").notNull(),
  balance: numeric("balance", { precision: 18, scale: 2 }).notNull(),
  baseCurrencyBalance: numeric("base_currency_balance", { precision: 18, scale: 2 }).notNull(),
  asOf: date("as_of").notNull(),
  classification: classificationEnum("classification").notNull().default("RESTRICTED"),
});

export const capitalRequests = pgTable(
  "capital_requests",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    requestType: text("request_type").notNull(), // CAPEX | OPEX | INVESTMENT | FINANCING | RESERVE
    sectorCode: text("sector_code"),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    horizonMonths: integer("horizon_months").notNull().default(60),
    expectedIrr: numeric("expected_irr", { precision: 7, scale: 4 }),
    expectedNpv: numeric("expected_npv", { precision: 18, scale: 2 }),
    paybackMonths: integer("payback_months"),
    riskScore: integer("risk_score").notNull().default(0),
    riskAdjustedReturn: numeric("risk_adjusted_return", { precision: 7, scale: 4 }),
    strategicObjectiveId: text("strategic_objective_id"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | FUNDED
    requestedBy: text("requested_by").notNull(),
    resolutionId: text("resolution_id"),
    decisionDate: timestamp("decision_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("capital_requests_code_uidx").on(t.code)],
);

/** Configurable waterfall — governed by entity, jurisdiction, policy, period. */
export const waterfallConfigs = pgTable(
  "waterfall_configs",
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
    version: text("version").notNull().default("1.0.0"),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    transactionType: text("transaction_type").notNull().default("OPERATING_SURPLUS"),
    currency: text("currency").notNull(),
    status: versionStatusEnum("status").notNull().default("DRAFT"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    approvedByResolutionId: text("approved_by_resolution_id"),
    policyId: text("policy_id"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("waterfall_configs_code_version_uidx").on(t.code, t.version)],
);

export const waterfallTiers = pgTable(
  "waterfall_tiers",
  {
    id: text("id").primaryKey(),
    configId: text("config_id")
      .notNull()
      .references(() => waterfallConfigs.id),
    sequence: integer("sequence").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    tierType: text("tier_type").notNull(), // PERCENTAGE_OF_GROSS | PERCENTAGE_OF_REMAINING | FIXED | RESIDUAL | THRESHOLD_TOPUP
    rate: numeric("rate", { precision: 9, scale: 6 }),
    fixedAmount: numeric("fixed_amount", { precision: 18, scale: 2 }),
    minAmount: numeric("min_amount", { precision: 18, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 18, scale: 2 }),
    beneficiaryType: text("beneficiary_type").notNull(), // TAX_AUTHORITY | OPERATIONS | LENDER | RESERVE | CAPITAL | INVESTMENT | FOUNDATION | OWNER
    beneficiaryRef: text("beneficiary_ref"),
    legalBasis: text("legal_basis"),
    mandatory: boolean("mandatory").notNull().default(true),
  },
  (t) => [uniqueIndex("waterfall_tiers_uidx").on(t.configId, t.sequence)],
);

export const waterfallRuns = pgTable(
  "waterfall_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    configId: text("config_id")
      .notNull()
      .references(() => waterfallConfigs.id),
    period: text("period").notNull(),
    grossAmount: numeric("gross_amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    totalAllocated: numeric("total_allocated", { precision: 18, scale: 2 }).notNull(),
    residual: numeric("residual", { precision: 18, scale: 2 }).notNull(),
    scenario: text("scenario").notNull().default("BASE"),
    inputs: jsonb("inputs").$type<Record<string, number>>().notNull().default({}),
    explanation: jsonb("explanation").$type<string[]>().notNull().default([]),
    engineVersion: text("engine_version").notNull(),
    checksum: text("checksum").notNull(),
    executedBy: text("executed_by").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
    approvedByResolutionId: text("approved_by_resolution_id"),
    status: text("status").notNull().default("SIMULATED"), // SIMULATED | COMMITTED
  },
  (t) => [index("waterfall_runs_config_idx").on(t.configId)],
);

export const waterfallRunLines = pgTable("waterfall_run_lines", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => waterfallRuns.id),
  sequence: integer("sequence").notNull(),
  tierCode: text("tier_code").notNull(),
  tierName: text("tier_name").notNull(),
  beneficiaryType: text("beneficiary_type").notNull(),
  basisAmount: numeric("basis_amount", { precision: 18, scale: 2 }).notNull(),
  allocatedAmount: numeric("allocated_amount", { precision: 18, scale: 2 }).notNull(),
  remainingAfter: numeric("remaining_after", { precision: 18, scale: 2 }).notNull(),
  formula: text("formula").notNull(),
  legalBasis: text("legal_basis"),
});

/** Tax Strategy Intelligence — a Finance OS capability, never a separate OS. */
export const taxStrategies = pgTable(
  "tax_strategies",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    category: text("category").notNull(),
    position: taxPositionEnum("position").notNull(),
    legalBasis: text("legal_basis").notNull(),
    statutoryReference: text("statutory_reference").notNull(),
    eligibilityCriteria: jsonb("eligibility_criteria").$type<TaxEligibilityCriterion[]>().notNull().default([]),
    documentationRequirements: jsonb("documentation_requirements").$type<string[]>().notNull().default([]),
    implementationSteps: jsonb("implementation_steps").$type<string[]>().notNull().default([]),
    economicBenefitBasis: text("economic_benefit_basis").notNull(),
    benefitRate: numeric("benefit_rate", { precision: 7, scale: 4 }),
    taxEffect: text("tax_effect").notNull(),
    cashflowEffect: text("cashflow_effect").notNull(),
    accountingEffect: text("accounting_effect").notNull(),
    complianceRisk: integer("compliance_risk").notNull(),
    auditRisk: integer("audit_risk").notNull(),
    legalRisk: integer("legal_risk").notNull(),
    reputationalRisk: integer("reputational_risk").notNull(),
    requiredApprovals: jsonb("required_approvals").$type<string[]>().notNull().default([]),
    alternatives: jsonb("alternatives").$type<string[]>().notNull().default([]),
    evidenceRequirements: jsonb("evidence_requirements").$type<string[]>().notNull().default([]),
    provenanceSource: text("provenance_source").notNull(),
    authorityStatus: authorityStatusEnum("authority_status").notNull().default("AUTHORITATIVE"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    reviewDate: date("review_date").notNull(),
    knowledgeSourceId: text("knowledge_source_id"),
  },
  (t) => [uniqueIndex("tax_strategies_code_uidx").on(t.code)],
);

export type TaxEligibilityCriterion = {
  key: string;
  label: string;
  operator: "EQUALS" | "AT_LEAST" | "AT_MOST" | "IN";
  value: string | number | boolean | string[];
  mandatory: boolean;
};

export const taxStrategyAssessments = pgTable("tax_strategy_assessments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  strategyId: text("strategy_id")
    .notNull()
    .references(() => taxStrategies.id),
  legalEntityId: text("legal_entity_id")
    .notNull()
    .references(() => legalEntities.id),
  period: text("period").notNull(),
  eligibility: eligibilityEnum("eligibility").notNull(),
  unmetCriteria: jsonb("unmet_criteria").$type<string[]>().notNull().default([]),
  estimatedBenefit: numeric("estimated_benefit", { precision: 18, scale: 2 }),
  currency: text("currency").notNull().default("TZS"),
  riskSummary: text("risk_summary").notNull(),
  governanceRequirement: text("governance_requirement").notNull(),
  humanReviewRequired: boolean("human_review_required").notNull().default(true),
  approvedByResolutionId: text("approved_by_resolution_id"),
  assessedBy: text("assessed_by").notNull(),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
});
