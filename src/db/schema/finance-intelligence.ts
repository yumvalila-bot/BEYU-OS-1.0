/**
 * BEYU OS — FINANCE INTELLIGENCE, VALUATION, PRIVATE CAPITAL, LBO & FIDUCIARY CAPITAL schema.
 *
 * FINANCE_OS domains:
 *   Investment & Capital Management → Financial Intelligence → Valuation & Analytics
 *   Capital Management → Private Capital / Private Equity → Transaction Models → LBO
 *   Capital Management → Capital Formation & Fiduciary Capital
 *
 * ================================ DESIGN LAWS ================================
 *
 *  1. NO SECOND LEDGER. Nothing here is an accounting record. `journal_entries` /
 *     `journal_lines` remain the ONE booked truth and CAP_POSTING remains LOCKED. Every table
 *     in this file stores an ANALYSIS, a MODEL, a MARK or an ENTITLEMENT — never a posting.
 *
 *  2. MONEY IS `numeric`, NEVER FLOAT. Every monetary column is `numeric(38, 0)` holding integer
 *     minor units. Ratios are `numeric(20, 8)`. Rates are integer basis points. A `double
 *     precision` column would make two reads of the same row compare unequal.
 *
 *  3. CURRENCY IS ON EVERY MONETARY ROW. Aggregation across currencies is refused by the engine,
 *     so the column must be present to detect a mismatch at all.
 *
 *  4. PROVENANCE IS STRUCTURAL. A metric observation without its source, period, method and
 *     calculation version cannot be written; the NOT NULL constraints enforce what §5 requires.
 *
 *  5. TENANT ISOLATION IS THE DATABASE'S JOB. Every table carries `tenant_id`, and the migration
 *     that creates them enables RLS with the canonical `beyu_tenant_ids()` predicate.
 *
 *  6. ASSUMPTIONS ARE VERSIONED, NOT OVERWRITTEN. `valuation_assumption_sets` is append-only per
 *     version, and the fingerprint column makes two runs comparable or obviously not.
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
import { users } from "./identity";

/* ------------------------------------------------------------------ */
/* Subject of valuation: instruments & securities                      */
/* ------------------------------------------------------------------ */

export const INSTRUMENT_TYPE = [
  "LISTED_EQUITY",
  "PRIVATE_EQUITY",
  "PREFERRED_EQUITY",
  "CONVERTIBLE",
  "CORPORATE_BOND",
  "GOVERNMENT_BOND",
  "FUND_INTEREST",
  "PARTNERSHIP_INTEREST",
  "REAL_ESTATE",
  "OTHER",
] as const;

/**
 * A financial instrument (a security, a share class, a fund interest) that valuation measures may be
 * taken on.
 *
 * `legal_entity_id` is the issuer/subject when the instrument is an equity claim on a company.
 * No ownership truth is held here: `ownership_records` remains the canonical ownership registry, and
 * this table records the SECURITY, not who owns it.
 */
export const financialInstruments = pgTable(
  "financial_instruments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    instrumentType: text("instrument_type").notNull(),
    /** Exchange/venue ticker or internal instrument code. */
    symbol: text("symbol"),
    name: text("name").notNull(),
    /** ISO-4217 currency in which the instrument is denominated and quoted. */
    currency: text("currency").notNull(),
    /** Share class label where the issuer has more than one. */
    shareClass: text("share_class"),
    /** Whether the instrument's price is observable in a market (vs. a private mark). */
    listed: boolean("listed").notNull().default(false),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    status: text("status").notNull().default("ACTIVE"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("financial_instruments_tenant_idx").on(t.tenantId),
    index("financial_instruments_entity_idx").on(t.legalEntityId),
    uniqueIndex("financial_instruments_tenant_symbol_uidx").on(t.tenantId, t.symbol, t.shareClass),
    check("financial_instruments_type_check", sql`"instrument_type" IN ('LISTED_EQUITY','PRIVATE_EQUITY','PREFERRED_EQUITY','CONVERTIBLE','CORPORATE_BOND','GOVERNMENT_BOND','FUND_INTEREST','PARTNERSHIP_INTEREST','REAL_ESTATE','OTHER')`),
    check("financial_instruments_currency_check", sql`char_length("currency") = 3`),
  ],
);

/* ------------------------------------------------------------------ */
/* Metric provenance store (§5)                                        */
/* ------------------------------------------------------------------ */

/**
 * Every financial metric the intelligence layer produces, with its complete lineage.
 *
 * This is the table §5 requires: metric id, entity/security, period, currency, value, calculation
 * method, inputs, source, source timestamp, data timestamp, calculation version, state and quality.
 *
 * APPEND-ONLY IN PRACTICE. A metric is never updated in place; a re-taken measurement is a new row
 * with a later `data_timestamp`. The value column is NULLABLE BY DESIGN — a MISSING or INVALID metric
 * has no value, and a NOT NULL default of zero would make every absent metric read as zero, which is
 * the exact fabrication this table exists to prevent. A CHECK constraint enforces the pairing: a
 * value-bearing state MUST have a value, and a non-value state MUST NOT.
 */
export const financialMetricObservations = pgTable(
  "financial_metric_observations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    metricCode: text("metric_code").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    /** Security/subject link when the subject is an instrument. */
    instrumentId: text("instrument_id").references(() => financialInstruments.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    period: text("period"),
    currency: text("currency"),
    /** The numeric value in minor units, or a fixed-point multiple, per the metric code. Null when absent. */
    value: numeric("value", { precision: 38, scale: 0 }),
    /** For ratio metrics: the fixed-point scaled value (10^6). Null for monetary metrics. */
    valueScaled: numeric("value_scaled", { precision: 38, scale: 0 }),
    /** VERIFIED | CALCULATED | ESTIMATED | FORECAST | MISSING | NOT_APPLICABLE | INVALID */
    dataState: text("data_state").notNull(),
    method: text("method").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    inputs: jsonb("inputs").$type<readonly unknown[]>().notNull().default([]),
    source: text("source").notNull(),
    sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
    dataTimestamp: timestamp("data_timestamp", { withTimezone: true }).notNull().defaultNow(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    quality: text("quality").notNull().default("UNSPECIFIED"),
    /** Reason recorded for every non-value state, so an absent metric explains itself. */
    reason: text("reason"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    /** Correlation with the audit ledger entry that recorded the read/calculation. */
    traceId: text("trace_id"),
  },
  (t) => [
    index("financial_metric_observations_subject_idx").on(t.tenantId, t.subjectType, t.subjectId, t.metricCode),
    index("financial_metric_observations_metric_idx").on(t.metricCode),
    index("financial_metric_observations_state_idx").on(t.dataState),
    check("financial_metric_observations_state_check", sql`"data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')`),
    check("financial_metric_observations_value_pairing_check", sql`(("data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST')) AND ("value" IS NOT NULL OR "value_scaled" IS NOT NULL)) OR (("data_state" IN ('MISSING','NOT_APPLICABLE','INVALID')) AND "value" IS NULL AND "value_scaled" IS NULL AND "reason" IS NOT NULL)`),
    check("financial_metric_observations_confidence_check", sql`"confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)`),
  ],
);

/* ------------------------------------------------------------------ */
/* Valuation models, assumptions and runs                              */
/* ------------------------------------------------------------------ */

export const VALUATION_METHOD = ["DCF", "TRADING_MULTIPLES", "TRANSACTION_MULTIPLES", "REVENUE_MULTIPLES", "EBITDA_MULTIPLES", "PE", "PS", "EV_EBITDA", "FCF_YIELD", "ROIC_ANALYSIS"] as const;

/**
 * A valuation model definition. The model is the SUBJECT identity; its assumptions live in versioned
 * sets and its outputs in runs. Nothing about a model changes in place except its lifecycle status.
 */
export const valuationModels = pgTable(
  "valuation_models",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    instrumentId: text("instrument_id").references(() => financialInstruments.id),
    name: text("name").notNull(),
    method: text("method").notNull(),
    currency: text("currency").notNull(),
    /** Current assumption-set version the model points at. Runs record the version they USED. */
    currentVersion: integer("current_version").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("valuation_models_subject_idx").on(t.tenantId, t.subjectType, t.subjectId),
    index("valuation_models_status_idx").on(t.status),
    check("valuation_models_currency_check", sql`char_length("currency") = 3`),
    check("valuation_models_method_check", sql`"method" IN ('DCF','TRADING_MULTIPLES','TRANSACTION_MULTIPLES','REVENUE_MULTIPLES','EBITDA_MULTIPLES','PE','PS','EV_EBITDA','FCF_YIELD','ROIC_ANALYSIS')`),
  ],
);

/**
 * One version of a model's assumptions. APPEND-ONLY: a change writes a new row with `version + 1`,
 * never an UPDATE of the old one. The fingerprint is computed by the engine and stored so two runs are
 * comparable only when the fingerprint matches — and so an unexplained assumption change is visible as
 * a version delta with its own attributed author and reason.
 */
export const valuationAssumptionSets = pgTable(
  "valuation_assumption_sets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    modelId: text("model_id")
      .notNull()
      .references(() => valuationModels.id),
    version: integer("version").notNull(),
    scenarioKind: text("scenario_kind").notNull().default("BASE"),
    /** Stable fingerprint over the assumption content. Two runs with different fingerprints are not comparable. */
    fingerprint: text("fingerprint").notNull(),
    assumptions: jsonb("assumptions").$type<readonly unknown[]>().notNull(),
    rationale: text("rationale"),
    authoredBy: text("authored_by")
      .notNull()
      .references(() => users.id),
    authoredAt: timestamp("authored_at", { withTimezone: true }).notNull().defaultNow(),
    /** The prior version this one supersedes. Null for version 1. */
    supersedesId: text("supersedes_id"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    uniqueIndex("valuation_assumption_sets_model_version_uidx").on(t.modelId, t.version, t.scenarioKind),
    index("valuation_assumption_sets_fingerprint_idx").on(t.fingerprint),
    check("valuation_assumption_sets_version_check", sql`"version" >= 1`),
    check("valuation_assumption_sets_scenario_check", sql`"scenario_kind" IN ('BASE','UPSIDE','DOWNSIDE','CUSTOM')`),
    check("valuation_assumption_sets_rationale_check", sql`"scenario_kind" = 'BASE' OR ("rationale" IS NOT NULL AND char_length("rationale") >= 8)`),
  ],
);

/**
 * One valuation run. Records which assumption version produced which result, the scenario label, the
 * full result payload and the sensitivity grid. An output is never edited: a corrected valuation is a
 * new run.
 */
export const valuationRuns = pgTable(
  "valuation_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    modelId: text("model_id")
      .notNull()
      .references(() => valuationModels.id),
    assumptionSetId: text("assumption_set_id")
      .notNull()
      .references(() => valuationAssumptionSets.id),
    scenarioKind: text("scenario_kind").notNull(),
    fingerprint: text("fingerprint").notNull(),
    currency: text("currency").notNull(),
    enterpriseValueMinor: numeric("enterprise_value_minor", { precision: 38, scale: 0 }),
    equityValueMinor: numeric("equity_value_minor", { precision: 38, scale: 0 }),
    impliedSharePriceMinor: numeric("implied_share_price_minor", { precision: 38, scale: 0 }),
    /** Result payload: the yearly DCF, the multiples applied, the terminal value method. */
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    /** Sensitivity grid, when produced. Stored whole: a grid is one analytical artifact. */
    sensitivity: jsonb("sensitivity").$type<Record<string, unknown>>(),
    dataState: text("data_state").notNull(),
    reason: text("reason"),
    runBy: text("run_by")
      .notNull()
      .references(() => users.id),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    traceId: text("trace_id"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    index("valuation_runs_model_idx").on(t.modelId, t.runAt),
    index("valuation_runs_fingerprint_idx").on(t.fingerprint),
    check("valuation_runs_state_check", sql`"data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')`),
    check("valuation_runs_scenario_check", sql`"scenario_kind" IN ('BASE','UPSIDE','DOWNSIDE','CUSTOM')`),
  ],
);

/* ------------------------------------------------------------------ */
/* Private Equity                                                      */
/* ------------------------------------------------------------------ */

export const privateFunds = pgTable(
  "private_funds",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    /** The GP legal entity. Distinct from the fund vehicle. */
    generalPartnerEntityId: text("general_partner_entity_id").references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** Fund strategy: BUYOUT, GROWTH, VENTURE, MEZZANINE, REAL_ASSETS, FUND_OF_FUNDS, OTHER. */
    strategy: text("strategy").notNull(),
    vintageYear: integer("vintage_year").notNull(),
    currency: text("currency").notNull(),
    targetSizeMinor: numeric("target_size_minor", { precision: 38, scale: 0 }),
    hardCapMinor: numeric("hard_cap_minor", { precision: 38, scale: 0 }),
    /** Preferred return, basis points per annum. */
    preferredReturnBps: integer("preferred_return_bps"),
    /** GP carry share, basis points. */
    carryBps: integer("carry_bps"),
    managementFeeBps: integer("management_fee_bps"),
    /** Management-fee base: COMMITTED | INVESTED. */
    managementFeeBasis: text("management_fee_basis").notNull().default("COMMITTED"),
    termYears: integer("term_years"),
    /** The waterfall form the fund's terms specify. Recorded so a result can say which form produced it. */
    waterfallForm: text("waterfall_form").notNull().default("EUROPEAN_WHOLE_FUND"),
    status: text("status").notNull().default("FUNDRAISING"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("private_funds_tenant_code_uidx").on(t.tenantId, t.code),
    index("private_funds_status_idx").on(t.status),
    check("private_funds_currency_check", sql`char_length("currency") = 3`),
    check("private_funds_vintage_check", sql`"vintage_year" BETWEEN 1900 AND 2200`),
    check("private_funds_strategy_check", sql`"strategy" IN ('BUYOUT','GROWTH','VENTURE','MEZZANINE','REAL_ASSETS','FUND_OF_FUNDS','OTHER')`),
    check("private_funds_waterfall_check", sql`"waterfall_form" IN ('EUROPEAN_WHOLE_FUND','AMERICAN_DEAL_BY_DEAL','CUSTOM_GOVERNED')`),
    check("private_funds_carry_check", sql`"carry_bps" IS NULL OR ("carry_bps" >= 0 AND "carry_bps" <= 10000)`),
  ],
);

/**
 * A participant's capital account in a fund: the LP, the GP or a co-investor.
 *
 * The seven figures the programme names are held here explicitly rather than derived, because each is
 * a fact from a different ledger (commitment from the LPA, paid-in from the capital-call ledger,
 * distributed from the distribution ledger, unrealized from a valuation mark) and deriving one from
 * another would invent the difference.
 */
export const privateFundParticipants = pgTable(
  "private_fund_participants",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fundId: text("fund_id")
      .notNull()
      .references(() => privateFunds.id),
    /** IDENTITY IS CANONICAL: the counterparty is a Party (person or organization). */
    partyId: text("party_id").notNull(),
    accountClass: text("account_class").notNull(),
    currency: text("currency").notNull(),
    commitmentMinor: numeric("commitment_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    paidInMinor: numeric("paid_in_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    distributedMinor: numeric("distributed_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    unrealizedMinor: numeric("unrealized_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    managementFeesMinor: numeric("management_fees_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    carriedInterestMinor: numeric("carried_interest_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    /** When the unrealized figure was last marked — a mark without a date is not a mark. */
    markedAt: timestamp("marked_at", { withTimezone: true }),
    /** Who produced the mark: a valuation committee, a third-party appraiser, a model. */
    markSource: text("mark_source"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("private_fund_participants_fund_party_class_uidx").on(t.fundId, t.partyId, t.accountClass),
    index("private_fund_participants_fund_idx").on(t.fundId),
    check("private_fund_participants_class_check", sql`"account_class" IN ('LP','GP','CO_INVESTOR','PARALLEL_VEHICLE','EMPLOYEE_VEHICLE')`),
    check("private_fund_participants_amounts_check", sql`"commitment_minor" >= 0 AND "paid_in_minor" >= 0 AND "distributed_minor" >= 0 AND "unrealized_minor" >= 0 AND "paid_in_minor" <= "commitment_minor"`),
  ],
);

/** A capital call against a fund's participants. Records the CALL; the cash movement is Finance OS's. */
export const privateCapitalCalls = pgTable(
  "private_capital_calls",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fundId: text("fund_id")
      .notNull()
      .references(() => privateFunds.id),
    callNumber: integer("call_number").notNull(),
    purpose: text("purpose").notNull(),
    currency: text("currency").notNull(),
    callAmountMinor: numeric("call_amount_minor", { precision: 38, scale: 0 }).notNull(),
    /** The investment this call funds, when it funds one. */
    portfolioCompanyId: text("portfolio_company_id"),
    noticeDate: date("notice_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** ILLUSTRATIVE, NOT A STATUS. `recorded` means the call is issued; payment is a Finance OS fact. */
    status: text("status").notNull().default("NOTICE_ISSUED"),
    /** Finance OS reference to the accounting record, when one exists. Never a posting from here. */
    financeReferenceId: text("finance_reference_id"),
    approvalRef: text("approval_ref"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("private_capital_calls_fund_number_uidx").on(t.fundId, t.callNumber),
    index("private_capital_calls_due_idx").on(t.dueDate),
    check("private_capital_calls_amount_check", sql`"call_amount_minor" > 0`),
    check("private_capital_calls_number_check", sql`"call_number" >= 1`),
  ],
);

/** A distribution to a fund's participants. Records the DISTRIBUTION, not the payment. */
export const privateFundDistributions = pgTable(
  "private_fund_distributions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fundId: text("fund_id")
      .notNull()
      .references(() => privateFunds.id),
    participantId: text("participant_id").references(() => privateFundParticipants.id),
    distributionNumber: integer("distribution_number").notNull(),
    currency: text("currency").notNull(),
    /** Return OF capital. */
    returnOfCapitalMinor: numeric("return_of_capital_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    /** Return ON capital (gain). */
    gainMinor: numeric("gain_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    carriedInterestMinor: numeric("carried_interest_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    distributionDate: date("distribution_date").notNull(),
    /** What produced the distribution: an exit, a dividend recap, portfolio income. */
    source: text("source").notNull(),
    exitEventId: text("exit_event_id"),
    status: text("status").notNull().default("DECLARED"),
    financeReferenceId: text("finance_reference_id"),
    approvalRef: text("approval_ref"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("private_fund_distributions_fund_idx").on(t.fundId, t.distributionDate),
    check("private_fund_distributions_amount_check", sql`"return_of_capital_minor" >= 0 AND "gain_minor" >= 0 AND "carried_interest_minor" >= 0`),
    check("private_fund_distributions_total_check", sql`("return_of_capital_minor" + "gain_minor") > 0`),
  ],
);

/**
 * A portfolio company — the Enterprise Registry's canonical identity, referenced rather than duplicated.
 *
 * `legal_entity_id` points at the registry's entity when the company is inside the BEYU group;
 * `external_party_id` points at the Party record when it is not. A portfolio company is NEVER given a
 * second identity here (§55).
 */
export const portfolioCompanies = pgTable(
  "portfolio_companies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fundId: text("fund_id").references(() => privateFunds.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    externalPartyId: text("external_party_id"),
    name: text("name").notNull(),
    sector: text("sector"),
    countryCode: text("country_code").notNull(),
    currency: text("currency").notNull(),
    /** Equity invested by the fund, minor units. */
    investedMinor: numeric("invested_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    /** Current mark of the holding, minor units. An opinion with a date. */
    currentValueMinor: numeric("current_value_minor", { precision: 38, scale: 0 }),
    valuedAt: date("valued_at"),
    /** Ownership percentage held, basis points. */
    ownershipBps: integer("ownership_bps"),
    /** Investment lifecycle: PIPELINE, SCREENING, DUE_DILIGENCE, IC_REVIEW, APPROVED, INVESTED, EXITED, WRITTEN_OFF. */
    stage: text("stage").notNull().default("INVESTED"),
    controlType: text("control_type"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("portfolio_companies_fund_idx").on(t.fundId),
    index("portfolio_companies_stage_idx").on(t.stage),
    check("portfolio_companies_currency_check", sql`char_length("currency") = 3`),
    check("portfolio_companies_ownership_check", sql`"ownership_bps" IS NULL OR ("ownership_bps" >= 0 AND "ownership_bps" <= 10000)`),
    check("portfolio_companies_stage_check", sql`"stage" IN ('PIPELINE','SCREENING','DUE_DILIGENCE','IC_REVIEW','APPROVED','INVESTED','EXITED','WRITTEN_OFF')`),
    check("portfolio_companies_identity_check", sql`"legal_entity_id" IS NOT NULL OR "external_party_id" IS NOT NULL`),
  ],
);

/** One due-diligence workstream item against a portfolio company. */
export const peDueDiligenceItems = pgTable(
  "pe_due_diligence_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    portfolioCompanyId: text("portfolio_company_id")
      .notNull()
      .references(() => portfolioCompanies.id),
    /** COMMERCIAL, FINANCIAL, LEGAL, TAX, TECHNICAL, ESG, MANAGEMENT, REGULATORY, OPERATIONAL. */
    workstream: text("workstream").notNull(),
    title: text("title").notNull(),
    /** OPEN, IN_PROGRESS, COMPLETE, BLOCKED, NOT_APPLICABLE. */
    status: text("status").notNull().default("OPEN"),
    /** Red/amber/green assessment: RED, AMBER, GREEN, UNASSESSED. */
    assessment: text("assessment").notNull().default("UNASSESSED"),
    /** The material finding. Required once the item is COMPLETE — a "complete" item with no finding is not evidence. */
    finding: text("finding"),
    /** Risk severity: LOW, MEDIUM, HIGH, CRITICAL. */
    riskSeverity: text("risk_severity"),
    /** Mitigation agreed. */
    mitigation: text("mitigation"),
    /** Document references — the records capability owns the file, this holds the pointer. */
    evidenceRefs: jsonb("evidence_refs").$type<readonly string[]>().notNull().default([]),
    ownerPrincipalId: text("owner_principal_id"),
    dueDate: date("due_date"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pe_due_diligence_items_company_idx").on(t.portfolioCompanyId, t.workstream),
    check("pe_due_diligence_items_workstream_check", sql`"workstream" IN ('COMMERCIAL','FINANCIAL','LEGAL','TAX','TECHNICAL','ESG','MANAGEMENT','REGULATORY','OPERATIONAL')`),
    check("pe_due_diligence_items_status_check", sql`"status" IN ('OPEN','IN_PROGRESS','COMPLETE','BLOCKED','NOT_APPLICABLE')`),
    check("pe_due_diligence_items_assessment_check", sql`"assessment" IN ('RED','AMBER','GREEN','UNASSESSED')`),
    check("pe_due_diligence_items_severity_check", sql`"risk_severity" IS NULL OR "risk_severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')`),
    check("pe_due_diligence_items_finding_check", sql`"status" <> 'COMPLETE' OR ("finding" IS NOT NULL AND char_length("finding") >= 8)`),
  ],
);

/**
 * An investment committee decision on a deal.
 *
 * Records the DECISION and who made it. `proposerPrincipalId` and `deciderPrincipalId` must differ —
 * the database enforces the segregation of duties the programme requires (§30) so an application bug
 * cannot create a sole-approver decision.
 */
export const peInvestmentCommitteeDecisions = pgTable(
  "pe_investment_committee_decisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    portfolioCompanyId: text("portfolio_company_id")
      .notNull()
      .references(() => portfolioCompanies.id),
    fundId: text("fund_id").references(() => privateFunds.id),
    /** The resolution or committee authority this decision is recorded under. */
    authorityRef: text("authority_ref").notNull(),
    /** APPROVE, APPROVE_WITH_CONDITIONS, DEFER, REJECT, WITHDRAW. */
    decision: text("decision").notNull(),
    conditions: text("conditions"),
    rationale: text("rationale").notNull(),
    /** Amount approved, minor units, when the decision approves capital. */
    approvedAmountMinor: numeric("approved_amount_minor", { precision: 38, scale: 0 }),
    currency: text("currency"),
    proposedByPrincipalId: text("proposed_by_principal_id")
      .notNull()
      .references(() => users.id),
    decidedByPrincipalId: text("decided_by_principal_id")
      .notNull()
      .references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    /** Quorum and dissent, recorded as structured data rather than prose. */
    votes: jsonb("votes").$type<Record<string, unknown>>().notNull().default({}),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
  },
  (t) => [
    index("pe_ic_decisions_company_idx").on(t.portfolioCompanyId, t.decidedAt),
    check("pe_ic_decisions_decision_check", sql`"decision" IN ('APPROVE','APPROVE_WITH_CONDITIONS','DEFER','REJECT','WITHDRAW')`),
    check("pe_ic_decisions_rationale_check", sql`char_length("rationale") >= 16`),
    check("pe_ic_decisions_sod_check", sql`"proposed_by_principal_id" <> "decided_by_principal_id"`),
    check("pe_ic_decisions_conditions_check", sql`"decision" <> 'APPROVE_WITH_CONDITIONS' OR ("conditions" IS NOT NULL AND char_length("conditions") >= 8)`),
  ],
);

/** A portfolio exit event. Records the exit; the proceeds are a Finance OS fact. */
export const peExitEvents = pgTable(
  "pe_exit_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    portfolioCompanyId: text("portfolio_company_id")
      .notNull()
      .references(() => portfolioCompanies.id),
    /** TRADE_SALE, SECONDARY, IPO, RECAPITALISATION, WRITE_OFF, MERGER. */
    exitType: text("exit_type").notNull(),
    currency: text("currency").notNull(),
    exitValueMinor: numeric("exit_value_minor", { precision: 38, scale: 0 }).notNull(),
    investedMinor: numeric("invested_minor", { precision: 38, scale: 0 }).notNull(),
    exitDate: date("exit_date").notNull(),
    holdingPeriodYears: numeric("holding_period_years", { precision: 6, scale: 2 }),
    /** Realized MOIC, fixed-point (10^6). Null until computed. */
    moicScaled: numeric("moic_scaled", { precision: 38, scale: 0 }),
    /** Realized IRR in basis points. Null when the solver found no IRR. */
    irrBps: integer("irr_bps"),
    /** A realized exit is CALCULATED; nothing here may be recorded as an estimate. */
    dataState: text("data_state").notNull().default("CALCULATED"),
    financeReferenceId: text("finance_reference_id"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pe_exit_events_company_idx").on(t.portfolioCompanyId),
    check("pe_exit_events_type_check", sql`"exit_type" IN ('TRADE_SALE','SECONDARY','IPO','RECAPITALISATION','WRITE_OFF','MERGER')`),
    check("pe_exit_events_amount_check", sql`"exit_value_minor" >= 0 AND "invested_minor" > 0`),
    check("pe_exit_events_state_check", sql`"data_state" IN ('CALCULATED','VERIFIED')`),
  ],
);

/* ------------------------------------------------------------------ */
/* LBO                                                                 */
/* ------------------------------------------------------------------ */

/**
 * An LBO model. The transaction and operating assumptions are stored as structured JSON alongside the
 * columns the engine indexes on, so the model can be re-run byte-identically from its stored
 * assumption set.
 *
 * `assumption_set_id` is REQUIRED: an LBO whose assumptions are not versioned cannot be audited, and
 * the programme requires every model assumption to be versioned.
 */
export const lboModels = pgTable(
  "lbo_models",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    modelId: text("model_id").references(() => valuationModels.id),
    assumptionSetId: text("assumption_set_id")
      .notNull()
      .references(() => valuationAssumptionSets.id),
    portfolioCompanyId: text("portfolio_company_id").references(() => portfolioCompanies.id),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    purchasePriceMinor: numeric("purchase_price_minor", { precision: 38, scale: 0 }).notNull(),
    /** Entry EV/EBITDA multiple, fixed-point (10^6). */
    entryMultipleScaled: numeric("entry_multiple_scaled", { precision: 38, scale: 0 }).notNull(),
    entryEbitdaMinor: numeric("entry_ebitda_minor", { precision: 38, scale: 0 }).notNull(),
    transactionFeeMinor: numeric("transaction_fee_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    sponsorEquityMinor: numeric("sponsor_equity_minor", { precision: 38, scale: 0 }).notNull(),
    rolloverEquityMinor: numeric("rollover_equity_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    targetCashUsedMinor: numeric("target_cash_used_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    /** Declared leverage ceiling (debt/EBITDA, fixed-point). The engine refuses a breach. */
    maximumLeverageScaled: numeric("maximum_leverage_scaled", { precision: 38, scale: 0 }),
    /** Declared minimum interest coverage (fixed-point). The engine refuses a breach. */
    minimumInterestCoverageScaled: numeric("minimum_interest_coverage_scaled", { precision: 38, scale: 0 }),
    /** Exit method: MULTIPLE | EXPLICIT_VALUE. */
    exitMethod: text("exit_method").notNull(),
    exitMultipleScaled: numeric("exit_multiple_scaled", { precision: 38, scale: 0 }),
    exitEnterpriseValueMinor: numeric("exit_enterprise_value_minor", { precision: 38, scale: 0 }),
    holdingPeriodYears: integer("holding_period_years").notNull(),
    /** Operating assumptions: growth, margins, D&A, capex, working capital, tax. */
    operatingAssumptions: jsonb("operating_assumptions").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("DRAFT"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lbo_models_tenant_idx").on(t.tenantId),
    index("lbo_models_company_idx").on(t.portfolioCompanyId),
    check("lbo_models_currency_check", sql`char_length("currency") = 3`),
    check("lbo_models_price_check", sql`"purchase_price_minor" > 0 AND "entry_ebitda_minor" > 0 AND "sponsor_equity_minor" >= 0`),
    check("lbo_models_exit_method_check", sql`"exit_method" IN ('MULTIPLE','EXPLICIT_VALUE')`),
    check("lbo_models_exit_input_check", sql`("exit_method" = 'MULTIPLE' AND "exit_multiple_scaled" IS NOT NULL) OR ("exit_method" = 'EXPLICIT_VALUE' AND "exit_enterprise_value_minor" IS NOT NULL)`),
    check("lbo_models_hold_check", sql`"holding_period_years" BETWEEN 1 AND 30`),
  ],
);

/** One debt tranche in an LBO's financing structure. */
export const lboDebtTranches = pgTable(
  "lbo_debt_tranches",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    lboModelId: text("lbo_model_id")
      .notNull()
      .references(() => lboModels.id),
    code: text("code").notNull(),
    /** Precedence order, 1 = most senior. */
    seniorityRank: integer("seniority_rank").notNull(),
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0 }).notNull(),
    interestRateBps: integer("interest_rate_bps").notNull(),
    mandatoryAmortisationBps: integer("mandatory_amortisation_bps").notNull().default(0),
    cashSweepEligible: boolean("cash_sweep_eligible").notNull().default(false),
    cashSweepShareBps: integer("cash_sweep_share_bps").notNull().default(10000),
    isRevolver: boolean("is_revolver").notNull().default(false),
    commitmentMinor: numeric("commitment_minor", { precision: 38, scale: 0 }),
    arrangementFeeMinor: numeric("arrangement_fee_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
  },
  (t) => [
    uniqueIndex("lbo_debt_tranches_model_code_uidx").on(t.lboModelId, t.code),
    index("lbo_debt_tranches_model_idx").on(t.lboModelId, t.seniorityRank),
    check("lbo_debt_tranches_amount_check", sql`"amount_minor" >= 0`),
    check("lbo_debt_tranches_rate_check", sql`"interest_rate_bps" > -10000`),
    check("lbo_debt_tranches_amort_check", sql`"mandatory_amortisation_bps" BETWEEN 0 AND 10000`),
    check("lbo_debt_tranches_sweep_check", sql`"cash_sweep_share_bps" BETWEEN 0 AND 10000`),
    check("lbo_debt_tranches_revolver_check", sql`NOT "is_revolver" OR ("commitment_minor" IS NOT NULL AND "commitment_minor" >= "amount_minor")`),
  ],
);

/** One run of an LBO model: the sources & uses, the projections and the sponsor returns. */
export const lboModelRuns = pgTable(
  "lbo_model_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    lboModelId: text("lbo_model_id")
      .notNull()
      .references(() => lboModels.id),
    scenarioKind: text("scenario_kind").notNull(),
    fingerprint: text("fingerprint").notNull(),
    currency: text("currency").notNull(),
    sourcesAndUses: jsonb("sources_and_uses").$type<Record<string, unknown>>().notNull(),
    projections: jsonb("projections").$type<readonly unknown[]>().notNull(),
    exitEnterpriseValueMinor: numeric("exit_enterprise_value_minor", { precision: 38, scale: 0 }),
    exitNetDebtMinor: numeric("exit_net_debt_minor", { precision: 38, scale: 0 }),
    exitEquityValueMinor: numeric("exit_equity_value_minor", { precision: 38, scale: 0 }),
    sponsorMoicScaled: numeric("sponsor_moic_scaled", { precision: 38, scale: 0 }),
    sponsorIrrBps: integer("sponsor_irr_bps"),
    totalDebtPaydownMinor: numeric("total_debt_paydown_minor", { precision: 38, scale: 0 }),
    sensitivity: jsonb("sensitivity").$type<Record<string, unknown>>(),
    dataState: text("data_state").notNull(),
    reason: text("reason"),
    runBy: text("run_by")
      .notNull()
      .references(() => users.id),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    traceId: text("trace_id"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
  },
  (t) => [
    index("lbo_model_runs_model_idx").on(t.lboModelId, t.runAt),
    index("lbo_model_runs_fingerprint_idx").on(t.fingerprint),
    check("lbo_model_runs_scenario_check", sql`"scenario_kind" IN ('BASE','UPSIDE','DOWNSIDE','CUSTOM')`),
    check("lbo_model_runs_state_check", sql`"data_state" IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')`),
    check("lbo_model_runs_reason_check", sql`"data_state" NOT IN ('MISSING','NOT_APPLICABLE','INVALID') OR ("reason" IS NOT NULL AND char_length("reason") >= 8)`),
  ],
);

/* ------------------------------------------------------------------ */
/* Capital formation & fiduciary capital                               */
/* ------------------------------------------------------------------ */

/**
 * An external or entrusted capital arrangement.
 *
 * `capital_origin` is the column the whole capability turns on: OWN, FIDUCIARY, PROJECT or GUARANTEED.
 * It is stored explicitly (derived by the engine from the instrument, and checked against it) so that no
 * query can accidentally aggregate fiduciary capital into a BEYU-owned total by joining only on amount.
 */
export const entrustedCapitalArrangements = pgTable(
  "entrusted_capital_arrangements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    /** The party providing the capital. Canonical Party identity. */
    providerPartyId: text("provider_party_id").notNull(),
    /** The economic owner, where authorized to be recorded. */
    beneficialOwnerPartyId: text("beneficial_owner_party_id"),
    instrument: text("instrument").notNull(),
    capitalOrigin: text("capital_origin").notNull(),
    currency: text("currency").notNull(),
    commitmentMinor: numeric("commitment_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    drawnMinor: numeric("drawn_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    purpose: text("purpose").notNull(),
    restrictions: jsonb("restrictions").$type<readonly string[]>().notNull().default([]),
    fiduciaryRestrictions: jsonb("fiduciary_restrictions").$type<readonly string[]>().notNull().default([]),
    maturityDate: date("maturity_date"),
    repayable: boolean("repayable").notNull().default(true),
    returnRateBps: integer("return_rate_bps"),
    feeRateBps: integer("fee_rate_bps"),
    governingAgreementRef: text("governing_agreement_ref"),
    covenantRefs: jsonb("covenant_refs").$type<readonly string[]>().notNull().default([]),
    approvalRef: text("approval_ref"),
    status: text("status").notNull().default("PROPOSED"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("entrusted_capital_arrangements_origin_idx").on(t.tenantId, t.capitalOrigin),
    index("entrusted_capital_arrangements_provider_idx").on(t.providerPartyId),
    check("entrusted_capital_arrangements_currency_check", sql`char_length("currency") = 3`),
    check("entrusted_capital_arrangements_instrument_check", sql`"instrument" IN ('EXTERNAL_INVESTOR_EQUITY','LP_COMMITMENT','CO_INVESTMENT','THIRD_PARTY_DEBT','PROJECT_FINANCE','MANAGED_CAPITAL','ENTRUSTED_FUND','INVESTMENT_MANDATE','GUARANTEE','CREDIT_FACILITY','EXTERNAL_FINANCING','CAPITAL_COMMITMENT')`),
    check("entrusted_capital_arrangements_origin_check", sql`"capital_origin" IN ('OWN','FIDUCIARY','PROJECT','GUARANTEED')`),
    check("entrusted_capital_arrangements_amount_check", sql`"commitment_minor" >= 0 AND "drawn_minor" >= 0 AND "drawn_minor" <= "commitment_minor"`),
    check("entrusted_capital_arrangements_status_check", sql`"status" IN ('PROPOSED','APPROVED','ACTIVE','MATURED','REPAID','CANCELLED')`),
    check("entrusted_capital_arrangements_restrictions_check", sql`"capital_origin" = 'OWN' OR jsonb_array_length("restrictions") > 0`),
    check("entrusted_capital_arrangements_fiduciary_check", sql`"capital_origin" <> 'FIDUCIARY' OR jsonb_array_length("fiduciary_restrictions") > 0`),
    check("entrusted_capital_arrangements_approval_check", sql`"status" <> 'ACTIVE' OR "approval_ref" IS NOT NULL`),
  ],
);

/** A drawdown against an entrusted capital arrangement. Records the DRAW, not the cash movement. */
export const entrustedCapitalDrawdowns = pgTable(
  "entrusted_capital_drawdowns",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    arrangementId: text("arrangement_id")
      .notNull()
      .references(() => entrustedCapitalArrangements.id),
    sequenceNumber: integer("sequence_number").notNull(),
    currency: text("currency").notNull(),
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0 }).notNull(),
    purpose: text("purpose").notNull(),
    drawdownDate: date("drawdown_date").notNull(),
    /** Whether the draw complied with the arrangement's stated restrictions. */
    restrictionCheckPassed: boolean("restriction_check_passed").notNull().default(false),
    restrictionNotes: text("restriction_notes"),
    financeReferenceId: text("finance_reference_id"),
    approvalRef: text("approval_ref"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("entrusted_capital_drawdowns_arrangement_seq_uidx").on(t.arrangementId, t.sequenceNumber),
    check("entrusted_capital_drawdowns_amount_check", sql`"amount_minor" > 0`),
    check("entrusted_capital_drawdowns_restriction_check", sql`"restriction_check_passed" OR ("restriction_notes" IS NOT NULL AND char_length("restriction_notes") >= 8)`),
  ],
);

/** Allocation of discovered capital to a subject, held apart by origin so no aggregate can merge them. */
export const capitalFormationPositions = pgTable(
  "capital_formation_positions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    capitalOrigin: text("capital_origin").notNull(),
    currency: text("currency").notNull(),
    commitmentMinor: numeric("commitment_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    drawnMinor: numeric("drawn_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    asOf: date("as_of").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("capital_formation_positions_entity_origin_date_uidx").on(t.legalEntityId, t.capitalOrigin, t.asOf),
    check("capital_formation_positions_origin_check", sql`"capital_origin" IN ('OWN','FIDUCIARY','PROJECT','GUARANTEED')`),
    check("capital_formation_positions_amount_check", sql`"commitment_minor" >= 0 AND "drawn_minor" >= 0 AND "drawn_minor" <= "commitment_minor"`),
  ],
);
