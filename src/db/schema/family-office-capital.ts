/**
 * BEYU OS — Family Office CAPITAL & WEALTH tables.
 *
 * ============================ RELATIONSHIP TO THE OTHER FAMILY SCHEMAS ========
 *
 * There are now three family schemas, each with a distinct job, and none of them
 * replaces another:
 *
 *   `people.ts`        — the LIVE Family Office: family_members, beneficiaries,
 *                        family_vault_items. Identity, lineage, entitlement,
 *                        vaults. Untouched by this module.
 *   `family-office.ts` — the NEUTRAL policy/ratification mechanism
 *                        (family_policy_definitions / _versions /
 *                        _ratifications). Deliberately NOT exported from the
 *                        schema barrel and NOT materialized, because its
 *                        materialization is gated on the first registered
 *                        ratification. Still not exported. Still not materialized.
 *                        Untouched by this module.
 *   `family-office-capital.ts` (this file) — the CAPITAL & WEALTH domain:
 *                        investments, obligations, real estate, cash flow,
 *                        balance-sheet and liquidity snapshots, scenarios,
 *                        allocation cases, committee decisions, intelligence,
 *                        education and generational plans.
 *
 * ============================== WHY THESE ARE MATERIALIZED ======================
 *
 * The institution layer stays unmaterialized because its records are gated on
 * unresolved legal and policy decisions (FIR-001…027) — a beneficiary record
 * cannot be persisted before the rules that make someone a beneficiary are
 * ratified. That reasoning does not apply here, and the distinction is the whole
 * of the reconciliation:
 *
 *   The capital & wealth tables store GOVERNED OPERATIONAL DATA — what the family
 *   owns, owes, models, decides and learns — not ratified policy values. Every
 *   policy-dependent value in this layer still arrives through the existing
 *   policy engine (`src/lib/family/office/policy.ts`) and still fails closed when
 *   it has not been ratified. Materializing these tables invents no policy.
 *
 * ============================== THE FIR-018 BOUNDARY ============================
 *
 * FIR-018 forbids a family record from being a shadow ledger, and it is intact.
 * These tables are not accounting:
 *
 *   - every monetary column is `numeric`, never float (§33);
 *   - every table that carries an amount carries `authoritative_owner`,
 *     defaulting to 'FINANCE_OS', and a nullable reference to the authoritative
 *     record;
 *   - `epistemic_class` is mandatory on every amount-carrying row, so a modelled
 *     figure can never be mistaken for a posted one;
 *   - no column here is a balance, a journal line, a period or a reconciliation.
 *
 * The Family Office computes, models, stresses, governs and learns. Finance OS
 * posts (§32).
 *
 * ============================== ISOLATION =======================================
 *
 * Every table carries `tenant_id` (references `tenants`), and where the domain
 * has one, `legal_entity_id` and `country_code`, so that tenant, entity and
 * country isolation are all expressible at the row level. Migration 0036 enables
 * RLS and installs the `tenant_id = ANY (beyu_tenant_ids())` policy on every
 * table below, matching `0035_foundation_os.sql`, and verifies it did.
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

/* ------------------------------------------------------------------ */
/* §5/§6 — Doctrine adoption and asset ladder                          */
/* ------------------------------------------------------------------ */

/**
 * Which doctrine principles the family has ADOPTED, and the ratified policy that
 * makes each enforceable.
 *
 * The principle statements themselves live in code (`capital-doctrine.ts`) as
 * quoted text; this table records the ACT of adoption and the policy reference
 * that turns a quoted principle into an enforceable one. `policy_version_ref` is
 * null until the policy engine resolves it, and an adopted principle with a null
 * policy reference may be cited but never applied.
 */
export const familyCapitalDoctrineAdopted = pgTable(
  "family_capital_doctrine_adopted",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** CAP-001 … CAP-015. */
    doctrineId: text("doctrine_id").notNull(),
    /** The policy key the adoption maps to, e.g. capital.debt.serviceability. */
    policyKey: text("policy_key").notNull(),
    /** The resolved policy version. Null = adopted but not yet enforceable. */
    policyVersionRef: text("policy_version_ref"),
    /** The governance act that adopted it. Required. */
    adoptedByRef: text("adopted_by_ref").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: text("status").notNull().default("ADOPTED"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("family_capital_doctrine_adopted_uidx").on(t.tenantId, t.doctrineId, t.effectiveFrom),
    index("family_capital_doctrine_adopted_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Where each position sits on the capital ladder (§6).
 *
 * Records location, never recommendation: the ladder is a scale for locating a
 * decision, and `recommends_stage_change` does not exist as a column because the
 * engine cannot produce one.
 */
export const familyAssetLadderPositions = pgTable(
  "family_asset_ladder_positions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** The subject: a property, an investment, a business or the family as a whole. */
    subjectRef: text("subject_ref").notNull(),
    subjectKind: text("subject_kind").notNull(),
    /** SMALL_PRODUCTIVE_ASSET … GENERATIONAL_CAPITAL. */
    stageCode: text("stage_code").notNull(),
    /** The last action taken: BUY | HOLD | IMPROVE | REFINANCE | CONSOLIDATE | SELL | REDEPLOY. */
    lastAction: text("last_action"),
    /** Which structural prerequisites are recorded as satisfied. */
    satisfiedPrerequisites: jsonb("satisfied_prerequisites").$type<string[]>().notNull().default([]),
    asOf: date("as_of").notNull(),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_asset_ladder_positions_tenant_idx").on(t.tenantId)],
);

/* ------------------------------------------------------------------ */
/* §8 — The obligation register ("who owes whom?")                      */
/* ------------------------------------------------------------------ */

export const familyObligations = pgTable(
  "family_obligations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** INTERCOMPANY_LOAN | SHAREHOLDER_LOAN | MORTGAGE | PROJECT_DEBT | VENDOR_FINANCING
     *  | RECEIVABLE | PAYABLE | LEASE | GUARANTEE | BOND | CAPITAL_COMMITMENT. */
    kind: text("kind").notNull(),
    /** FAMILY_IS_LENDER | FAMILY_IS_BORROWER | FAMILY_IS_GUARANTOR | FAMILY_IS_BENEFICIARY. */
    direction: text("direction").notNull(),
    /* Both sides of the relationship are always named — that is the point of §8. */
    borrowerRef: text("borrower_ref").notNull(),
    borrowerName: text("borrower_name").notNull(),
    borrowerPartyType: text("borrower_party_type").notNull(),
    borrowerCountryCode: text("borrower_country_code").notNull(),
    borrowerLegalEntityId: text("borrower_legal_entity_id").references(() => legalEntities.id),
    lenderRef: text("lender_ref").notNull(),
    lenderName: text("lender_name").notNull(),
    lenderPartyType: text("lender_party_type").notNull(),
    lenderCountryCode: text("lender_country_code").notNull(),
    lenderLegalEntityId: text("lender_legal_entity_id").references(() => legalEntities.id),
    /** Beneficial owner where it differs from the lender. */
    ownerRef: text("owner_ref"),
    /* Terms of the agreement. Governed data, not accounting. */
    currency: text("currency").notNull(),
    principal: numeric("principal", { precision: 18, scale: 2 }).notNull(),
    outstanding: numeric("outstanding", { precision: 18, scale: 2 }).notNull(),
    annualRateBps: integer("annual_rate_bps").notNull().default(0),
    /** FIXED | FLOATING | STEPPED | ZERO | IN_KIND. */
    rateType: text("rate_type").notNull(),
    floatingReference: text("floating_reference"),
    floatingSpreadBps: integer("floating_spread_bps"),
    maturityDate: date("maturity_date"),
    /** MONTHLY | QUARTERLY | SEMI_ANNUAL | ANNUAL | AT_MATURITY. */
    paymentFrequency: text("payment_frequency").notNull(),
    /** AMORTISING | BULLET | INTEREST_ONLY. */
    amortisation: text("amortisation").notNull(),
    /* Security. */
    collateralDescription: text("collateral_description"),
    collateralRef: text("collateral_ref"),
    guaranteeDescription: text("guarantee_description"),
    guarantorRef: text("guarantor_ref"),
    /** RECEIVED | GIVEN | NONE. A guarantee GIVEN is a contingent liability. */
    guaranteeDirection: text("guarantee_direction").notNull().default("NONE"),
    /* Governance chain. Each is a reference, never a claim. */
    agreementDocumentRef: text("agreement_document_ref"),
    approvalRef: text("approval_ref"),
    authorisedBy: text("authorised_by"),
    legalReviewRef: text("legal_review_ref"),
    jurisdictionRef: text("jurisdiction_ref"),
    status: text("status").notNull().default("DRAFT"),
    /* The FIR-018 boundary, stored on the row so no reader can miss it. */
    /** Always FINANCE_OS. The Family Office is never the accounting authority. */
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    /** OBSERVED | DERIVED | ASSUMPTION. Never POSTED. */
    epistemicClass: text("epistemic_class").notNull().default("OBSERVED"),
    /** The authoritative Finance OS record for this obligation. */
    financeRecordRef: text("finance_record_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_obligations_tenant_idx").on(t.tenantId),
    index("family_obligations_status_idx").on(t.status),
    index("family_obligations_country_idx").on(t.borrowerCountryCode, t.lenderCountryCode),
  ],
);

export const familyObligationCovenants = pgTable(
  "family_obligation_covenants",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => familyObligations.id),
    /** FINANCIAL | INFORMATION | RESTRICTIVE | MAINTENANCE. */
    covenantType: text("covenant_type").notNull(),
    code: text("code").notNull(),
    description: text("description").notNull(),
    measureCode: text("measure_code"),
    /** MIN | MAX. Null for a non-measurable covenant. */
    direction: text("direction"),
    thresholdBps: integer("threshold_bps"),
    /** As written in the agreement. Never inferred. */
    consequenceOnBreach: text("consequence_on_breach"),
    curePeriodDays: integer("cure_period_days"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_obligation_covenants_obligation_idx").on(t.obligationId)],
);

/* ------------------------------------------------------------------ */
/* §10/§11 — Investments, theses, valuations, journals, reviews         */
/* ------------------------------------------------------------------ */

export const familyInvestments = pgTable(
  "family_investments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").notNull(),
    /** REAL_ESTATE | EQUITY_PRIVATE | EQUITY_LISTED | FIXED_INCOME | FUND_INTEREST
     *  | BUSINESS_ACQUISITION | AGRICULTURAL | INTELLECTUAL_PROPERTY
     *  | CASH_EQUIVALENT | OTHER. */
    type: text("type").notNull(),
    name: text("name").notNull(),
    assetClass: text("asset_class").notNull(),
    currency: text("currency").notNull(),
    acquisitionCost: numeric("acquisition_cost", { precision: 18, scale: 2 }).notNull(),
    cashInvested: numeric("cash_invested", { precision: 18, scale: 2 }).notNull(),
    acquisitionDate: date("acquisition_date").notNull(),
    currentValue: numeric("current_value", { precision: 18, scale: 2 }),
    /** OBSERVED | DERIVED | ASSUMPTION | DATA_NOT_AVAILABLE. Never POSTED. */
    currentValueBasis: text("current_value_basis"),
    currentValueSource: text("current_value_source"),
    valuedAsOf: date("valued_as_of"),
    professionalValuationDocumentRef: text("professional_valuation_document_ref"),
    realisedGain: numeric("realised_gain", { precision: 18, scale: 2 }).notNull().default("0"),
    annualCashFlow: numeric("annual_cash_flow", { precision: 18, scale: 2 }).notNull().default("0"),
    realisedCashFlow: numeric("realised_cash_flow", { precision: 18, scale: 2 }).notNull().default("0"),
    attributableDebt: numeric("attributable_debt", { precision: 18, scale: 2 }).notNull().default("0"),
    /** LIQUID | NEAR_LIQUID | ILLIQUID. */
    liquidity: text("liquidity").notNull(),
    riskBps: integer("risk_bps"),
    /** IDEA … EXITED | WRITTEN_OFF. */
    governanceStatus: text("governance_status").notNull().default("IDEA"),
    heldYears: integer("held_years").notNull().default(0),
    exitStrategy: text("exit_strategy"),
    exitValueAssumption: numeric("exit_value_assumption", { precision: 18, scale: 2 }),
    legalReviewRef: text("legal_review_ref"),
    taxReviewRef: text("tax_review_ref"),
    committeeDecisionId: text("committee_decision_id"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_investments_tenant_idx").on(t.tenantId),
    index("family_investments_entity_idx").on(t.legalEntityId),
    index("family_investments_status_idx").on(t.governanceStatus),
  ],
);

export const familyInvestmentTheses = pgTable(
  "family_investment_theses",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    investmentId: text("investment_id")
      .notNull()
      .references(() => familyInvestments.id),
    thesis: text("thesis").notNull(),
    /** Required (CAP-008). A thesis without its counter-thesis cannot be monitored. */
    counterThesis: text("counter_thesis").notNull(),
    /** Required: what would prove the thesis wrong. */
    falsificationTest: text("falsification_test").notNull(),
    majorAssumptions: jsonb("major_assumptions").$type<string[]>().notNull().default([]),
    risks: jsonb("risks").$type<string[]>().notNull().default([]),
    maximumAcceptableLoss: numeric("maximum_acceptable_loss", { precision: 18, scale: 2 }).notNull(),
    exitCondition: text("exit_condition").notNull(),
    targetReturnBps: integer("target_return_bps"),
    targetHoldingMonths: integer("target_holding_months"),
    authorRef: text("author_ref").notNull(),
    /** Always HUMAN. An AI-authored thesis is refused by the engine (FIR-017). */
    authorType: text("author_type").notNull().default("HUMAN"),
    asOf: date("as_of").notNull(),
    /** CURRENT | UNDER_REVIEW | INVALIDATED | SUPERSEDED. */
    status: text("status").notNull().default("CURRENT"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_investment_theses_investment_idx").on(t.investmentId)],
);

export const familyInvestmentValuations = pgTable(
  "family_investment_valuations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    investmentId: text("investment_id")
      .notNull()
      .references(() => familyInvestments.id),
    value: numeric("value", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    /** OBSERVED | DERIVED | ASSUMPTION. A valuation is a mark, never posted truth. */
    basis: text("basis").notNull(),
    source: text("source").notNull(),
    asOf: date("as_of").notNull(),
    professionalValuationDocumentRef: text("professional_valuation_document_ref"),
    recordedBy: text("recorded_by").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_investment_valuations_investment_idx").on(t.investmentId, t.asOf),
  ],
);

export const familyDecisionJournalEntries = pgTable(
  "family_decision_journal_entries",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    investmentId: text("investment_id").references(() => familyInvestments.id),
    /** The eight §11 questions, keyed by question key. */
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    /** Required and non-empty (CAP-009). */
    emotionDisclosure: text("emotion_disclosure").notNull(),
    authorRef: text("author_ref").notNull(),
    /** Always HUMAN (FIR-017). */
    authorType: text("author_type").notNull().default("HUMAN"),
    asOf: date("as_of").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_decision_journal_entries_tenant_idx").on(t.tenantId)],
);

export const familyPostInvestmentReviews = pgTable(
  "family_post_investment_reviews",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    investmentId: text("investment_id")
      .notNull()
      .references(() => familyInvestments.id),
    /** The pre-investment entry this is measured against. Required. */
    preInvestmentEntryId: text("pre_investment_entry_id")
      .notNull()
      .references(() => familyDecisionJournalEntries.id),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    /** THESIS_CORRECT_EXECUTION_CORRECT | THESIS_CORRECT_EXECUTION_WRONG
     *  | THESIS_WRONG_EXECUTION_CORRECT | THESIS_WRONG_EXECUTION_WRONG | INDETERMINATE. */
    outcome: text("outcome").notNull(),
    /** Required (CAP-010): a review that names no lesson is a record, not a learning. */
    lessonsApplied: jsonb("lessons_applied").$type<string[]>().notNull().default([]),
    realisedGain: numeric("realised_gain", { precision: 18, scale: 2 }).notNull(),
    maximumAcceptableLoss: numeric("maximum_acceptable_loss", { precision: 18, scale: 2 }).notNull(),
    maximumLossBreached: boolean("maximum_loss_breached").notNull().default(false),
    reviewerRef: text("reviewer_ref").notNull(),
    reviewerType: text("reviewer_type").notNull().default("HUMAN"),
    asOf: date("as_of").notNull(),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_post_investment_reviews_investment_idx").on(t.investmentId)],
);

/* ------------------------------------------------------------------ */
/* §12/§13 — Real estate and financing models                           */
/* ------------------------------------------------------------------ */

export const familyRealEstateAssets = pgTable(
  "family_real_estate_assets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").notNull(),
    /** RESIDENTIAL | COMMERCIAL | INDUSTRIAL | HOSPITALITY | AGRICULTURAL | LAND | DEVELOPMENT. */
    propertyClass: text("property_class").notNull(),
    name: text("name").notNull(),
    /** OPPORTUNITY … EXIT. */
    stage: text("stage").notNull().default("OPPORTUNITY"),
    /* Operating. */
    grossPotentialRent: numeric("gross_potential_rent", { precision: 18, scale: 2 }).notNull().default("0"),
    vacancyBps: integer("vacancy_bps").notNull().default(0),
    otherIncome: numeric("other_income", { precision: 18, scale: 2 }).notNull().default("0"),
    operatingExpenses: numeric("operating_expenses", { precision: 18, scale: 2 }).notNull().default("0"),
    maintenance: numeric("maintenance", { precision: 18, scale: 2 }).notNull().default("0"),
    propertyTax: numeric("property_tax", { precision: 18, scale: 2 }).notNull().default("0"),
    insurance: numeric("insurance", { precision: 18, scale: 2 }).notNull().default("0"),
    /* Financing. Null until financing exists. */
    purchasePrice: numeric("purchase_price", { precision: 18, scale: 2 }),
    cashInvested: numeric("cash_invested", { precision: 18, scale: 2 }),
    debt: numeric("debt", { precision: 18, scale: 2 }),
    annualRateBps: integer("annual_rate_bps"),
    rateType: text("rate_type"),
    annualDebtService: numeric("annual_debt_service", { precision: 18, scale: 2 }),
    tenorMonths: integer("tenor_months"),
    amortisation: text("amortisation"),
    currency: text("currency").notNull(),
    /* Valuation. Null before any mark exists. */
    valuation: numeric("valuation", { precision: 18, scale: 2 }),
    valuationBasis: text("valuation_basis"),
    valuationSource: text("valuation_source"),
    valuedAsOf: date("valued_as_of"),
    professionalValuationDocumentRef: text("professional_valuation_document_ref"),
    heldYears: integer("held_years").notNull().default(0),
    exitValueAssumption: numeric("exit_value_assumption", { precision: 18, scale: 2 }),
    exitStrategy: text("exit_strategy"),
    annualCashFlowAfterDebt: numeric("annual_cash_flow_after_debt", { precision: 18, scale: 2 }),
    realisedCashFlow: numeric("realised_cash_flow", { precision: 18, scale: 2 }).notNull().default("0"),
    acquisitionCost: numeric("acquisition_cost", { precision: 18, scale: 2 }).notNull().default("0"),
    /** Which lifecycle gates are recorded as cleared. */
    clearedGates: jsonb("cleared_gates").$type<string[]>().notNull().default([]),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_real_estate_assets_tenant_idx").on(t.tenantId),
    index("family_real_estate_assets_stage_idx").on(t.stage),
  ],
);

/**
 * §13 alternative financing MODELS.
 *
 * `model_only` is a NOT NULL column defaulting to true and
 * `executed_legal_transaction` defaults to false: the schema itself makes it
 * impossible to store a wrap or lease-purchase as though it had happened.
 */
export const familyRealEstateFinancingModels = pgTable(
  "family_real_estate_financing_models",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    propertyId: text("property_id").references(() => familyRealEstateAssets.id),
    /** SELLER_FINANCING | INSTALLMENT_SALE | LEASE_PURCHASE | WRAP_FINANCING | RECEIVABLES_FINANCING. */
    structure: text("structure").notNull(),
    modelOnly: boolean("model_only").notNull().default(true),
    executedLegalTransaction: boolean("executed_legal_transaction").notNull().default(false),
    jurisdictionRef: text("jurisdiction_ref").notNull(),
    counterpartyRef: text("counterparty_ref").notNull(),
    counterpartyName: text("counterparty_name").notNull(),
    counterpartyCountryCode: text("counterparty_country_code").notNull(),
    creditAnalysisRef: text("credit_analysis_ref"),
    legalReviewRef: text("legal_review_ref"),
    taxReviewRef: text("tax_review_ref"),
    collateralDescription: text("collateral_description"),
    defaultScenario: text("default_scenario"),
    documentationRef: text("documentation_ref"),
    governanceApprovalRef: text("governance_approval_ref"),
    currency: text("currency").notNull(),
    financedAmount: numeric("financed_amount", { precision: 18, scale: 2 }).notNull(),
    annualRateBps: integer("annual_rate_bps").notNull().default(0),
    tenorMonths: integer("tenor_months").notNull(),
    purchasePrice: numeric("purchase_price", { precision: 18, scale: 2 }),
    creditedAmount: numeric("credited_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_real_estate_financing_models_tenant_idx").on(t.tenantId)],
);

/* ------------------------------------------------------------------ */
/* §15–§18 — Cash flow, balance sheet, liquidity                        */
/* ------------------------------------------------------------------ */

export const familyCashFlowItems = pgTable(
  "family_cash_flow_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").notNull(),
    currency: text("currency").notNull(),
    /** ISO period, e.g. 2026-09 or 2026-Q3. */
    period: text("period").notNull(),
    /** INFLOW | OUTFLOW. The direction carries the sign; the amount is unsigned. */
    direction: text("direction").notNull(),
    /** BUSINESS_INCOME | RENTAL_INCOME | INTEREST | DIVIDENDS | ROYALTIES
     *  | AGRICULTURE | CAPITAL_GAINS | FINANCING_INFLOW | CAPITAL_CONTRIBUTION
     *  | OPERATING_COST | TAX | DEBT_SERVICE | CAPEX | DISTRIBUTION. */
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    /** POSTED | OBSERVED | DERIVED | FORECAST | ASSUMPTION | SCENARIO. */
    basis: text("basis").notNull(),
    sourceRef: text("source_ref").notNull(),
    recurring: boolean("recurring").notNull().default(false),
    /** The sector OS it came from, for the cross-sector view (§31). */
    sectorCode: text("sector_code"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_cash_flow_items_tenant_period_idx").on(t.tenantId, t.period),
    index("family_cash_flow_items_category_idx").on(t.category),
  ],
);

export const familyBalanceSheetSnapshots = pgTable(
  "family_balance_sheet_snapshots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    asOf: date("as_of").notNull(),
    currency: text("currency").notNull(),
    totalAssets: numeric("total_assets", { precision: 18, scale: 2 }).notNull(),
    totalLiabilities: numeric("total_liabilities", { precision: 18, scale: 2 }).notNull(),
    netWorth: numeric("net_worth", { precision: 18, scale: 2 }).notNull(),
    liquidAssets: numeric("liquid_assets", { precision: 18, scale: 2 }).notNull().default("0"),
    nearLiquidAssets: numeric("near_liquid_assets", { precision: 18, scale: 2 }).notNull().default("0"),
    illiquidAssets: numeric("illiquid_assets", { precision: 18, scale: 2 }).notNull().default("0"),
    productiveAssets: numeric("productive_assets", { precision: 18, scale: 2 }).notNull().default("0"),
    investableCapital: numeric("investable_capital", { precision: 18, scale: 2 }).notNull().default("0"),
    capitalCommitments: numeric("capital_commitments", { precision: 18, scale: 2 }).notNull().default("0"),
    /** Disclosed, never netted into net worth. */
    contingentLiabilities: numeric("contingent_liabilities", { precision: 18, scale: 2 }).notNull().default("0"),
    productiveCapitalRatioBps: integer("productive_capital_ratio_bps"),
    capitalUtilisationBps: integer("capital_utilisation_bps"),
    /** The authorised breakdowns (§17). */
    byEntity: jsonb("by_entity").$type<unknown[]>().notNull().default([]),
    byCountry: jsonb("by_country").$type<unknown[]>().notNull().default([]),
    byAssetClass: jsonb("by_asset_class").$type<unknown[]>().notNull().default([]),
    /** Lines excluded from the snapshot, with the reason. */
    excluded: jsonb("excluded").$type<unknown[]>().notNull().default([]),
    basis: text("basis").notNull().default("DERIVED"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("family_balance_sheet_snapshots_uidx").on(t.tenantId, t.asOf, t.currency)],
);

export const familyLiquiditySnapshots = pgTable(
  "family_liquidity_snapshots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    asOf: date("as_of").notNull(),
    currency: text("currency").notNull(),
    liquid: numeric("liquid", { precision: 18, scale: 2 }).notNull(),
    nearLiquid: numeric("near_liquid", { precision: 18, scale: 2 }).notNull().default("0"),
    illiquid: numeric("illiquid", { precision: 18, scale: 2 }).notNull().default("0"),
    /** The 30/90/180/365-day projections (§15). */
    horizons: jsonb("horizons").$type<unknown[]>().notNull().default([]),
    liquidityCoverageBps: integer("liquidity_coverage_bps"),
    liquidityRunwayDays: integer("liquidity_runway_days"),
    averageDailyNetObligation: numeric("average_daily_net_obligation", { precision: 18, scale: 2 }).notNull().default("0"),
    /** Raised alerts. Advisory only — an alert never freezes or transfers. */
    alerts: jsonb("alerts").$type<unknown[]>().notNull().default([]),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
    /** Always SCENARIO. A projection is never a cash balance. */
    basis: text("basis").notNull().default("SCENARIO"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("family_liquidity_snapshots_uidx").on(t.tenantId, t.asOf, t.currency)],
);

/* ------------------------------------------------------------------ */
/* §14 — Scenario models and results                                    */
/* ------------------------------------------------------------------ */

export const familyScenarioModels = pgTable(
  "family_scenario_models",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    /** DEBT_STRESS | CAPITAL_SIMULATION | PROPERTY_PROJECTION | PORTFOLIO_SCENARIO. */
    scenarioType: text("scenario_type").notNull(),
    /** The inputs, exactly as supplied. A scenario without its inputs cannot be reproduced. */
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull(),
    /** Named on the record, because a scenario without its assumptions is not evidence. */
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
    /** Always SCENARIO. Structurally never OBSERVED or POSTED. */
    basis: text("basis").notNull().default("SCENARIO"),
    /** Always false. A scenario never guarantees an outcome (§28). */
    outcomeGuaranteed: boolean("outcome_guaranteed").notNull().default(false),
    createdBy: text("created_by").notNull(),
    asOf: date("as_of").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_scenario_models_tenant_idx").on(t.tenantId)],
);

export const familyScenarioResults = pgTable(
  "family_scenario_results",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    scenarioModelId: text("scenario_model_id")
      .notNull()
      .references(() => familyScenarioModels.id),
    /** The case label, e.g. "Revenue -30%" or "Year 10". */
    caseLabel: text("case_label").notNull(),
    axis: text("axis"),
    shockBps: integer("shock_bps"),
    /** The computed outputs. */
    outputs: jsonb("outputs").$type<Record<string, unknown>>().notNull(),
    basis: text("basis").notNull().default("SCENARIO"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_scenario_results_model_idx").on(t.scenarioModelId)],
);

/* ------------------------------------------------------------------ */
/* §9/§43 — Allocation cases and committee decisions                    */
/* ------------------------------------------------------------------ */

export const familyCapitalAllocations = pgTable(
  "family_capital_allocations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** The canonical Finance OS capital request this allocates against. */
    capitalRequestRef: text("capital_request_ref").notNull(),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    title: text("title").notNull(),
    purpose: text("purpose").notNull(),
    requesterRef: text("requester_ref").notNull(),
    /** The sixteen steps and their state. */
    steps: jsonb("steps").$type<unknown[]>().notNull().default([]),
    stepsNotApplicable: jsonb("steps_not_applicable").$type<string[]>().notNull().default([]),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    /** IN_PROGRESS | APPROVED | REJECTED | DEFERRED | APPROVED_WITH_CONDITIONS | EXECUTED | CLOSED. */
    status: text("status").notNull().default("IN_PROGRESS"),
    /** Segregation evidence (§40). */
    executorRef: text("executor_ref"),
    reconcilerRef: text("reconciler_ref"),
    segregationWaivedByPolicy: boolean("segregation_waived_by_policy").notNull().default(false),
    segregationPolicyRef: text("segregation_policy_ref"),
    authoritativeOwner: text("authoritative_owner").notNull().default("FINANCE_OS"),
    financeRecordRef: text("finance_record_ref"),
    auditRef: text("audit_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_capital_allocations_tenant_idx").on(t.tenantId),
    index("family_capital_allocations_status_idx").on(t.status),
  ],
);

export const familyCommitteeDecisions = pgTable(
  "family_committee_decisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    allocationId: text("allocation_id").references(() => familyCapitalAllocations.id),
    /** APPROVE | APPROVE_WITH_CONDITIONS | REJECT | DEFER | REQUEST_INFORMATION. */
    decision: text("decision").notNull(),
    /** The body that decided. A decision with no body has no authority. */
    bodyRef: text("body_ref").notNull(),
    members: jsonb("members").$type<unknown[]>().notNull().default([]),
    quorumMinimum: integer("quorum_minimum").notNull(),
    /** SIMPLE | TWO_THIRDS | UNANIMOUS | CHAIR_CASTING. */
    majorityRule: text("majority_rule").notNull(),
    decisionDate: date("decision_date").notNull(),
    reason: text("reason").notNull(),
    conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
    followUps: jsonb("follow_ups").$type<unknown[]>().notNull().default([]),
    /** The resolution or approval instrument. Required. */
    authorityRef: text("authority_ref"),
    /** Always HUMAN (§24, FIR-017). */
    decidedByActorType: text("decided_by_actor_type").notNull().default("HUMAN"),
    requesterRef: text("requester_ref").notNull(),
    executorRef: text("executor_ref"),
    reconcilerRef: text("reconciler_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_committee_decisions_allocation_idx").on(t.allocationId)],
);

/* ------------------------------------------------------------------ */
/* §21/§22 — Regulatory and tax intelligence                            */
/* ------------------------------------------------------------------ */

export const familyRegulatoryEvents = pgTable(
  "family_regulatory_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** TAX | COMPANY_LAW | FINANCIAL_REGULATION | LAND | AGRICULTURE | HEALTHCARE
     *  | FOREIGN_EXCHANGE | TRADE | INTEREST_RATES | INFLATION | COMMODITIES
     *  | TECHNOLOGY | DEMOGRAPHICS. */
    domain: text("domain").notNull(),
    /** OPPORTUNITY | THREAT | REVIEW_REQUIRED. */
    classification: text("classification").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    /** Required: an unsourced item is a rumour. */
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    eventDate: date("event_date").notNull(),
    jurisdictionRef: text("jurisdiction_ref").notNull(),
    countryCodes: jsonb("country_codes").$type<string[]>().notNull().default([]),
    /** CONFIRMED | LIKELY | REPORTED | SPECULATIVE. */
    confidence: text("confidence").notNull(),
    affectedEntityRefs: jsonb("affected_entity_refs").$type<string[]>().notNull().default([]),
    affectedAssetRefs: jsonb("affected_asset_refs").$type<string[]>().notNull().default([]),
    recommendedAction: text("recommended_action"),
    reviewAssignedTo: text("review_assigned_to"),
    reviewDueDate: date("review_due_date"),
    /** NEW | UNDER_REVIEW | ACTIONED | DISMISSED | EXPIRED. */
    status: text("status").notNull().default("NEW"),
    recordedBy: text("recorded_by").notNull(),
    /** HUMAN | SERVICE | AI. An AI-recorded item may not be CONFIRMED. */
    recordedByActorType: text("recorded_by_actor_type").notNull().default("HUMAN"),
    securityClassification: classificationEnum("security_classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("family_regulatory_events_tenant_idx").on(t.tenantId),
    index("family_regulatory_events_domain_idx").on(t.domain, t.classification),
  ],
);

export const familyTaxPositions = pgTable(
  "family_tax_positions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    subjectRef: text("subject_ref").notNull(),
    /** INVESTMENT | PROPERTY | ENTITY | TRANSACTION | OBLIGATION | DISTRIBUTION. */
    subjectKind: text("subject_kind").notNull(),
    jurisdictionRef: text("jurisdiction_ref").notNull(),
    countryCode: text("country_code").notNull(),
    taxType: text("tax_type").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    /**
     * ASSUMPTION | ESTIMATE | CURRENT_RULE | PROFESSIONAL_REVIEW |
     * FINAL_ACCOUNTING_TREATMENT. The level travels with the amount (§22).
     */
    level: text("level").notNull(),
    ruleReference: text("rule_reference"),
    ruleAsOf: date("rule_as_of"),
    professionalReviewRef: text("professional_review_ref"),
    /** Required at FINAL_ACCOUNTING_TREATMENT, and only Finance OS may set it. */
    financeRecordRef: text("finance_record_ref"),
    recordedBy: text("recorded_by").notNull(),
    recordedByActorType: text("recorded_by_actor_type").notNull().default("HUMAN"),
    asOf: date("as_of").notNull(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_tax_positions_subject_idx").on(t.tenantId, t.subjectRef)],
);

/* ------------------------------------------------------------------ */
/* §26/§27/§30 — Generational plans, education, business maturity       */
/* ------------------------------------------------------------------ */

export const familyGenerationalPlans = pgTable(
  "family_generational_plans",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** The structure or entity the plan concerns. */
    structureRef: text("structure_ref").notNull(),
    objective: text("objective").notNull(),
    generation: integer("generation").notNull(),
    /** Required: an objective with no criteria cannot be met or missed. */
    successCriteria: text("success_criteria").notNull(),
    requiredPreparation: jsonb("required_preparation").$type<string[]>().notNull().default([]),
    /** Interests recorded as governed data — never the creation of an interest. */
    interests: jsonb("interests").$type<unknown[]>().notNull().default([]),
    targetDate: date("target_date"),
    /** PLANNED | IN_PROGRESS | MET | ABANDONED | SUPERSEDED. */
    status: text("status").notNull().default("PLANNED"),
    /** The governance act that adopted it. Required. */
    adoptedByRef: text("adopted_by_ref"),
    /** Null until a ratified instrument or ruling supplies it. */
    legalEffectReference: text("legal_effect_reference"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_generational_plans_tenant_idx").on(t.tenantId)],
);

export const familyEducationLessons = pgTable(
  "family_education_lessons",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** FINANCIAL_LITERACY | ACCOUNTING | CASH_FLOW | ASSETS_AND_LIABILITIES | DEBT
     *  | RISK | COMPOUNDING | INVESTING | REAL_ESTATE | BUSINESS | TAX
     *  | BEHAVIOURAL_FINANCE | CAPITAL_ALLOCATION | ENTREPRENEURSHIP | GOVERNANCE. */
    topic: text("topic").notNull(),
    /** LESSON | SIMULATION | CASE_STUDY | QUIZ | DECISION_JOURNAL_EXERCISE. */
    format: text("format").notNull(),
    title: text("title").notNull(),
    learningObjective: text("learning_objective").notNull(),
    prerequisites: jsonb("prerequisites").$type<string[]>().notNull().default([]),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    /** When true the lesson is subject to the same clearance as the data it shows. */
    usesLiveFamilyData: boolean("uses_live_family_data").notNull().default(false),
    /** DRAFT | PUBLISHED | RETIRED. */
    status: text("status").notNull().default("DRAFT"),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_education_lessons_topic_idx").on(t.topic, t.format)],
);

export const familyBusinessMaturityAssessments = pgTable(
  "family_business_maturity_assessments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Attribution lives with the legal entity, not the family. */
    legalEntityRef: text("legal_entity_ref").notNull(),
    asOf: date("as_of").notNull(),
    /** The eight §30 dimensions, each with evidence. */
    dimensions: jsonb("dimensions").$type<unknown[]>().notNull().default([]),
    /** FOUNDER_DEPENDENT … OWNER_INDEPENDENT. */
    assessedLevel: text("assessed_level").notNull(),
    keyPersons: jsonb("key_persons").$type<unknown[]>().notNull().default([]),
    assessorRef: text("assessor_ref").notNull(),
    /** Always HUMAN. */
    assessorType: text("assessor_type").notNull().default("HUMAN"),
    adoptedByRef: text("adopted_by_ref"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("family_business_maturity_assessments_entity_idx").on(t.legalEntityRef, t.asOf)],
);
