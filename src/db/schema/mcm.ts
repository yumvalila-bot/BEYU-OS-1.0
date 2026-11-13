/**
 * BEYU OS — MULTI_COMPANY_MANAGEMENT (MCM) domain.
 *
 * ONE capability inside BEYU OS. Never an OS, never a second ledger, never a
 * second corporate registry, never a second identity model.
 *
 * SOURCE-OF-TRUTH BOUNDARIES HELD BY THIS MODULE
 *   legal_entities / ownership_records / entity_appointments / org_units
 *       remain the ONLY corporate registry. MCM adds satellites keyed by
 *       legal_entity_id and never restates a registry fact.
 *   journal_entries / journal_lines / financial_periods  (FINANCE_OS)
 *       remain the ONLY booked truth. Nothing here posts, and CAP_POSTING stays
 *       LOCKED. Consolidation is EXACTLY an analysis artefact: a run, its
 *       translated per-entity balances, and its proposed elimination
 *       adjustments, each of which a human must review and Finance OS must
 *       separately authorise before any journal could exist.
 *   employees  (HCM) remains the ONLY employee master. MCM workforce figures are
 *       rollups over existing rows; MCM assigns no employee.
 *   governance_bodies / governance_members / resolutions / governance_meetings
 *       remain the ONLY governance authority. MCM records WHICH of them govern a
 *       company and links to the evidence; it cannot appoint, vote or decide.
 *
 * FINANCIAL REPRESENTATION
 *   Money is EXACT numeric minor units with an explicit currency on every row
 *   (`numeric(38,0)`), matching the convention established by migration 0074.
 *   Rates are integer basis points; percentages are `numeric(9,6)`.
 *   `data_state` (ACTUAL | CONSOLIDATED | ESTIMATED | FORECAST | PENDING |
 *   RESTRICTED | UNAVAILABLE) is NOT NULL on every figure-bearing table so an
 *   aggregate can never present a modelled number as booked truth, and
 *   UNAVAILABLE is an explicit state rather than a silent zero.
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
  classificationEnum,
  consolidationStateEnum,
  entityRelationshipTypeEnum,
  intercompanyStateEnum,
  mcmDataStateEnum,
  mcmIntegrationStateEnum,
  mcmLifecycleStateEnum,
  ownershipValidationStateEnum,
} from "./enums";
import { countries, jurisdictions, legalEntities, tenants } from "./core";
import { users } from "./identity";
import { documents } from "./platform";
import { financialPeriods, journalEntries } from "./finance";
import { capitalRequests } from "./finance";

/* ================================================================== */
/* 1. CORPORATE REGISTRY COMPLETION                                    */
/* ================================================================== */

/**
 * MCM profile satellite for a legal entity.
 *
 * ONE row per legal entity (unique on legal_entity_id). It carries the corporate
 * facts `legal_entities` does not: registered office, statutory identifiers,
 * reporting currency (distinct from functional currency), group reporting
 * timezone, MCM lifecycle state, verification state and statutory obligations.
 *
 * It never restates legal_name/entity_type/country_code: those stay in
 * `legal_entities` and are joined, so a profile can never disagree with the
 * registry.
 */
export const legalEntityProfiles = pgTable(
  "legal_entity_profiles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    /** DRAFT | PENDING_VERIFICATION | ACTIVE | SUSPENDED | DORMANT | DISSOLVED | ARCHIVED */
    mcmLifecycleState: mcmLifecycleStateEnum("mcm_lifecycle_state").notNull().default("ACTIVE"),
    /** Free-text registered office as recorded on the registration instrument. */
    registeredOffice: text("registered_office"),
    registeredOfficeCountryCode: text("registered_office_country_code").references(() => countries.code),
    /** Statutory / regulatory identifiers beyond tax_identifier, each with its issuer. */
    statutoryIdentifiers: jsonb("statutory_identifiers")
      .$type<Array<{ scheme: string; value: string; issuer: string; countryCode: string }>>()
      .notNull()
      .default([]),
    /** Group reporting currency. Distinct from legal_entities.functional_currency. */
    reportingCurrency: text("reporting_currency").notNull(),
    /** IANA timezone for statutory deadlines and period cut-offs. */
    reportingTimezone: text("reporting_timezone").notNull(),
    /** Statutory obligations this entity is subject to, by reference code. */
    statutoryObligations: jsonb("statutory_obligations").$type<string[]>().notNull().default([]),
    /** Whether the entity consolidates into the group and from when. */
    consolidated: boolean("consolidated").notNull().default(true),
    consolidationMethod: text("consolidation_method").notNull().default("FULL"),
    /** Incorporation instrument evidence. */
    incorporationDocumentId: text("incorporation_document_id").references(() => documents.id),
    /** Verification of the registration against the issuing registry. */
    verificationState: text("verification_state").notNull().default("PENDING_VERIFICATION"),
    verifiedByUserId: text("verified_by_user_id").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationEvidenceDocumentId: text("verification_evidence_document_id").references(() => documents.id),
    /** Why verification is pending, when it is. Never silently omitted. */
    pendingVerificationNote: text("pending_verification_note"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    uniqueIndex("legal_entity_profiles_entity_uidx").on(t.legalEntityId),
    index("legal_entity_profiles_tenant_idx").on(t.tenantId),
    index("legal_entity_profiles_state_idx").on(t.mcmLifecycleState),
  ],
);

/**
 * Append-only lifecycle ledger for a legal entity.
 *
 * Lifecycle transitions are never a silent UPDATE: the profile materialises the
 * current state, and this table holds every transition with actor, authority,
 * evidence, effective date and reason. Immutability is enforced by a database
 * trigger, not only by convention.
 */
export const legalEntityLifecycleEvents = pgTable(
  "legal_entity_lifecycle_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    fromState: mcmLifecycleStateEnum("from_state"),
    toState: mcmLifecycleStateEnum("to_state").notNull(),
    effectiveDate: date("effective_date").notNull(),
    /** Why the transition is lawful — the instrument, resolution or filing. */
    reason: text("reason").notNull(),
    authorityRef: text("authority_ref"),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
    actingPartyId: text("acting_party_id"),
    actingUserId: text("acting_user_id")
      .notNull()
      .references(() => users.id),
    approvalRef: text("approval_ref"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    index("legal_entity_lifecycle_entity_idx").on(t.legalEntityId),
    index("legal_entity_lifecycle_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Non-ownership entity relationships, effective-dated.
 *
 * Deliberately separate from `ownership_records`: not every organizational
 * relationship is legal ownership. There is NO `OWNERSHIP` member here — an
 * attempt to record ownership through this table is refused by a CHECK
 * constraint, so ownership can only ever come from the ownership registry.
 */
export const entityRelationships = pgTable(
  "entity_relationships",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** The entity that holds the relationship (e.g. the managing company). */
    subjectEntityId: text("subject_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    /** The entity the relationship is held over (e.g. the managed company). */
    objectEntityId: text("object_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    relationshipType: entityRelationshipTypeEnum("relationship_type").notNull(),
    /** The instrument that creates the relationship (agreement, mandate, deed). */
    instrumentRef: text("instrument_ref"),
    instrumentDocumentId: text("instrument_document_id").references(() => documents.id),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    /** Scope of the relationship in plain English — never inferred. */
    scopeNote: text("scope_note").notNull(),
    /** Only PARENT_SUBSIDIARY relationships contribute to the hierarchy tree. */
    structural: boolean("structural").notNull().default(false),
    provenance: text("provenance").notNull(),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    index("entity_relationships_subject_idx").on(t.subjectEntityId),
    index("entity_relationships_object_idx").on(t.objectEntityId),
    index("entity_relationships_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Instrument-backed validation result for one ownership record.
 *
 * Ownership truth stays in `ownership_records`. This table records the
 * VALIDATION: were economic and voting percentages within their legal bounds,
 * was the supporting instrument present, was the provenance string present, and
 * would this row create a circular corporate hierarchy? The result is stored so
 * a reviewer sees the reasoning, never a boolean without a reason.
 */
export const ownershipValidations = pgTable(
  "ownership_validations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ownershipRecordId: text("ownership_record_id").notNull(),
    ownedEntityId: text("owned_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    ownerEntityId: text("owner_entity_id").references(() => legalEntities.id),
    state: ownershipValidationStateEnum("state").notNull(),
    /** Every rule evaluated, with its outcome. Machine-readable evidence. */
    rules: jsonb("rules")
      .$type<Array<{ rule: string; passed: boolean; detail: string }>>()
      .notNull()
      .default([]),
    /** Sum of validated economic percentages for the same owned entity + date. */
    economicTotalPct: numeric("economic_total_pct", { precision: 12, scale: 6 }),
    votingTotalPct: numeric("voting_total_pct", { precision: 12, scale: 6 }),
    validatedByUserId: text("validated_by_user_id").references(() => users.id),
    validatedAt: timestamp("validated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ownership_validations_record_idx").on(t.ownershipRecordId),
    index("ownership_validations_owned_idx").on(t.ownedEntityId),
  ],
);

/* ================================================================== */
/* 2. MULTI-COUNTRY CONFIGURATION                                      */
/* ================================================================== */

/**
 * Per-country MCM configuration. Configuration ONLY.
 *
 * Tanzania (TZ) is the first configured jurisdiction. Where a regulator has no
 * verified machine interface (BRELA, TRA, NSSF, WCF today) the filing mode is
 * explicitly MANUAL or DOCUMENT_BASED — the platform never invents an API. A
 * `VERIFIED_API` mode may only be set by a human after the integration has been
 * registered in `integrations` and verified.
 */
export const mcmCountryProfiles = pgTable(
  "mcm_country_profiles",
  {
    id: text("id").primaryKey(),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    /** Configuration is versioned and effective-dated; law changes over time. */
    version: integer("version").notNull().default(1),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    groupReportingCurrency: text("group_reporting_currency").notNull(),
    localCurrency: text("local_currency").notNull(),
    timezone: text("timezone").notNull(),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    accountingFrameworks: jsonb("accounting_frameworks").$type<string[]>().notNull().default([]),
    incorporationAuthority: text("incorporation_authority"),
    taxAuthority: text("tax_authority"),
    socialSecurityAuthority: text("social_security_authority"),
    workersCompensationAuthority: text("workers_compensation_authority"),
    /**
     * How statutory filings with each authority are executed. Closed vocabulary;
     * anything other than MANUAL/DOCUMENT_BASED requires a verified integration.
     */
    filingModes: jsonb("filing_modes")
      .$type<Array<{ authority: string; mode: "MANUAL" | "DOCUMENT_BASED" | "VERIFIED_API"; integrationCode?: string; note: string }>>()
      .notNull()
      .default([]),
    /** Country-specific statutory reporting requirements (periodicity, form). */
    statutoryReports: jsonb("statutory_reports")
      .$type<Array<{ code: string; title: string; authority: string; frequency: string }>>()
      .notNull()
      .default([]),
    /** Country-specific compliance notes. Never generalised to another country. */
    notes: text("notes").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mcm_country_profiles_uidx").on(t.countryCode, t.version),
    index("mcm_country_profiles_country_idx").on(t.countryCode),
  ],
);

/**
 * Statutory filing register — one row per entity / obligation / period.
 *
 * Manual or document-based where no verified API exists; the row records WHO
 * filed, WHEN, with WHAT evidence, and the authority's reference. A filing is
 * never auto-marked complete.
 */
export const mcmStatutoryFilings = pgTable(
  "mcm_statutory_filings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
    authority: text("authority").notNull(),
    filingCode: text("filing_code").notNull(),
    title: text("title").notNull(),
    period: text("period").notNull(),
    dueOn: date("due_on").notNull(),
    filedOn: date("filed_on"),
    status: text("status").notNull().default("PENDING"),
    filingMode: text("filing_mode").notNull().default("MANUAL"),
    /** The authority's own acknowledgement reference, when one exists. */
    authorityReference: text("authority_reference"),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
    /** Linked canonical obligation, when the obligation register already holds it. */
    complianceObligationId: text("compliance_obligation_id"),
    submittedByUserId: text("submitted_by_user_id").references(() => users.id),
    note: text("note"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mcm_statutory_filings_entity_idx").on(t.legalEntityId),
    index("mcm_statutory_filings_due_idx").on(t.dueOn),
    uniqueIndex("mcm_statutory_filings_uidx").on(t.legalEntityId, t.filingCode, t.period),
  ],
);

/* ================================================================== */
/* 3. FX RATES (governed rate source for translation)                  */
/* ================================================================== */

/**
 * Effective-dated FX rate with provenance.
 *
 * Finance OS journals carry an `fx_rate` per entry, but there was no governed
 * rate SOURCE. Translation for consolidation requires one, with a stated
 * provenance (central bank, bank statement, contractual rate) so a consolidated
 * figure can always name where its rate came from.
 *
 * `rate` is expressed as units of quote currency per 1 unit of base, scale 12.
 * Translation is CLOSING for balance-sheet and AVERAGE for P&L; the rate type is
 * carried explicitly rather than inferred.
 */
export const fxRates = pgTable(
  "fx_rates",
  {
    id: text("id").primaryKey(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: numeric("rate", { precision: 24, scale: 12 }).notNull(),
    rateDate: date("rate_date").notNull(),
    rateType: text("rate_type").notNull().default("CLOSING"),
    source: text("source").notNull(),
    provenance: text("provenance").notNull(),
    recordedBy: text("recorded_by").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fx_rates_uidx").on(t.baseCurrency, t.quoteCurrency, t.rateDate, t.rateType),
    index("fx_rates_pair_idx").on(t.baseCurrency, t.quoteCurrency),
  ],
);

/* ================================================================== */
/* 4. INTERCOMPANY                                                     */
/* ================================================================== */

/**
 * Intercompany agreement — the instrument authorising a class of related-party
 * flows between two legal entities. No transaction may exist without one.
 */
export const intercompanyAgreements = pgTable(
  "intercompany_agreements",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    agreementType: text("agreement_type").notNull(),
    fromEntityId: text("from_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    toEntityId: text("to_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    currency: text("currency").notNull(),
    /** Pricing basis is a recorded fact of the instrument, not a default. */
    pricingBasis: text("pricing_basis").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    documentId: text("document_id").references(() => documents.id),
    /** Which governance body approved the instrument and under what resolution. */
    approvingBodyId: text("approving_body_id"),
    approvalResolutionRef: text("approval_resolution_ref"),
    status: text("status").notNull().default("DRAFT"),
    /** Transfer-pricing review state; a human legal/tax decision. */
    transferPricingReview: text("transfer_pricing_review").notNull().default("REQUIRES_REVIEW"),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    uniqueIndex("intercompany_agreements_tenant_code_uidx").on(t.tenantId, t.code),
    index("intercompany_agreements_from_idx").on(t.fromEntityId),
    index("intercompany_agreements_to_idx").on(t.toEntityId),
  ],
);

/**
 * Intercompany transaction with DUAL-SIDE authorisation and reconciliation.
 *
 * Both legal entities must authorise their own side. The state machine cannot
 * reach BOTH_SIDES_AUTHORIZED unless both actor columns are populated and the
 * database CHECK constraint enforces that they are different principals (a
 * single user can never authorise both sides).
 *
 * NOTHING HERE POSTS. `financeReferenceId` points at the Finance OS entry that a
 * human separately authorised; CAP_POSTING remains LOCKED.
 */
export const intercompanyTransactions = pgTable(
  "intercompany_transactions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => intercompanyAgreements.id),
    reference: text("reference").notNull(),
    transactionType: text("transaction_type").notNull(),
    /** The entity that books the receivable / income side. */
    receivableEntityId: text("receivable_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    /** The entity that books the payable / expense side. */
    payableEntityId: text("payable_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    periodId: text("period_id").references(() => financialPeriods.id),
    periodCode: text("period_code").notNull(),
    currency: text("currency").notNull(),
    /** Exact minor units. */
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0 }).notNull(),
    /** Matching amount in the counterparty's own ledger currency, when different. */
    counterpartyCurrency: text("counterparty_currency"),
    counterpartyAmountMinor: numeric("counterparty_amount_minor", { precision: 38, scale: 0 }),
    fxRateUsed: numeric("fx_rate_used", { precision: 24, scale: 12 }),
    description: text("description").notNull(),
    state: intercompanyStateEnum("state").notNull().default("DRAFT"),
    receivableAuthorizedByUserId: text("receivable_authorized_by_user_id").references(() => users.id),
    receivableAuthorizedAt: timestamp("receivable_authorized_at", { withTimezone: true }),
    payableAuthorizedByUserId: text("payable_authorized_by_user_id").references(() => users.id),
    payableAuthorizedAt: timestamp("payable_authorized_at", { withTimezone: true }),
    /** Difference recorded during reconciliation. Never silently zeroed. */
    reconciliationDifferenceMinor: numeric("reconciliation_difference_minor", { precision: 38, scale: 0 }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledByUserId: text("reconciled_by_user_id").references(() => users.id),
    /** Pointer to the Finance OS entry a HUMAN authorised. Never written here. */
    financeReferenceId: text("finance_reference_id").references(() => journalEntries.id),
    /** Prevents the same instrument being booked twice. */
    idempotencyKey: text("idempotency_key").notNull(),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    raisedBy: text("raised_by").notNull(),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    uniqueIndex("intercompany_transactions_reference_uidx").on(t.reference),
    uniqueIndex("intercompany_transactions_idem_uidx").on(t.idempotencyKey),
    index("intercompany_transactions_receivable_idx").on(t.receivableEntityId),
    index("intercompany_transactions_payable_idx").on(t.payableEntityId),
    index("intercompany_transactions_tenant_idx").on(t.tenantId),
  ],
);

/** One reconciliation run over a period; records what was compared and found. */
export const intercompanyReconciliationRuns = pgTable(
  "intercompany_reconciliation_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodCode: text("period_code").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    runByUserId: text("run_by_user_id")
      .notNull()
      .references(() => users.id),
    pairsExamined: integer("pairs_examined").notNull().default(0),
    matchedPairs: integer("matched_pairs").notNull().default(0),
    unmatchedPairs: integer("unmatched_pairs").notNull().default(0),
    totalDifferenceMinor: numeric("total_difference_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    currency: text("currency").notNull(),
    /** Per-pair findings with entity ids and amounts. */
    findings: jsonb("findings")
      .$type<Array<{ receivableEntityId: string; payableEntityId: string; receivableMinor: string; payableMinor: string; differenceMinor: string; detail: string }>>()
      .notNull()
      .default([]),
    dataState: mcmDataStateEnum("data_state").notNull().default("ACTUAL"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [index("intercompany_recon_runs_period_idx").on(t.periodCode)],
);

/* ================================================================== */
/* 5. CONSOLIDATION (analysis only)                                    */
/* ================================================================== */

/**
 * A consolidation run. ANALYSIS ARTEFACT — never a posting, never a ledger.
 *
 * The run records the period, the reporting currency, the rate set used, the
 * entities included, the translated balances and the proposed eliminations. A
 * human must REVIEW it; `reviewedByUserId` is a person, and the review is
 * recorded in the audit ledger. Finance OS would have to separately authorise
 * any resulting journal — and CAP_POSTING stays LOCKED, so none can exist today.
 */
export const consolidationRuns = pgTable(
  "consolidation_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    periodId: text("period_id").references(() => financialPeriods.id),
    periodCode: text("period_code").notNull(),
    reportingCurrency: text("reporting_currency").notNull(),
    state: consolidationStateEnum("state").notNull().default("DRAFT"),
    /** The FX rate set actually used, by pair and type, with provenance. */
    rateSet: jsonb("rate_set")
      .$type<Array<{ base: string; quote: string; rate: string; rateType: string; rateDate: string; source: string }>>()
      .notNull()
      .default([]),
    entitiesIncluded: integer("entities_included").notNull().default(0),
    totalAssetsMinor: numeric("total_assets_minor", { precision: 38, scale: 0 }),
    totalLiabilitiesMinor: numeric("total_liabilities_minor", { precision: 38, scale: 0 }),
    totalEquityMinor: numeric("total_equity_minor", { precision: 38, scale: 0 }),
    /** Sum of the eliminations applied in this run. */
    eliminationsMinor: numeric("eliminations_minor", { precision: 38, scale: 0 }),
    /** Residual imbalance AFTER elimination. Non-zero means the run does NOT balance. */
    residualMinor: numeric("residual_minor", { precision: 38, scale: 0 }),
    preparedByUserId: text("prepared_by_user_id")
      .notNull()
      .references(() => users.id),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revision: integer("revision").notNull().default(1),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    uniqueIndex("consolidation_runs_tenant_code_uidx").on(t.tenantId, t.code),
    index("consolidation_runs_period_idx").on(t.periodCode),
  ],
);

/** Per-entity translated balances inside a consolidation run. */
export const consolidationEntities = pgTable(
  "consolidation_entities",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => consolidationRuns.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    functionalCurrency: text("functional_currency").notNull(),
    ownershipPct: numeric("ownership_pct", { precision: 9, scale: 6 }).notNull(),
    /** Rates taken from the run's rate set; stored per entity for traceability. */
    closingRate: numeric("closing_rate", { precision: 24, scale: 12 }),
    averageRate: numeric("average_rate", { precision: 24, scale: 12 }),
    /** Local-currency source totals (ACTUAL, from Finance OS). */
    localAssetsMinor: numeric("local_assets_minor", { precision: 38, scale: 0 }),
    localLiabilitiesMinor: numeric("local_liabilities_minor", { precision: 38, scale: 0 }),
    localEquityMinor: numeric("local_equity_minor", { precision: 38, scale: 0 }),
    /** Translated into the run's reporting currency. */
    translatedAssetsMinor: numeric("translated_assets_minor", { precision: 38, scale: 0 }),
    translatedLiabilitiesMinor: numeric("translated_liabilities_minor", { precision: 38, scale: 0 }),
    translatedEquityMinor: numeric("translated_equity_minor", { precision: 38, scale: 0 }),
    /** Translation difference recognised in OCI — computed, never invented. */
    translationReserveMinor: numeric("translation_reserve_minor", { precision: 38, scale: 0 }),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    /** Why a figure is unavailable, when it is. */
    unavailabilityReason: text("unavailability_reason"),
    included: boolean("included").notNull().default(true),
  },
  (t) => [
    uniqueIndex("consolidation_entities_uidx").on(t.runId, t.legalEntityId),
    index("consolidation_entities_run_idx").on(t.runId),
  ],
);

/** Proposed elimination / adjustment. Reviewed by a human; never posted. */
export const consolidationAdjustments = pgTable(
  "consolidation_adjustments",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => consolidationRuns.id),
    adjustmentType: text("adjustment_type").notNull(),
    description: text("description").notNull(),
    debitEntityId: text("debit_entity_id").references(() => legalEntities.id),
    creditEntityId: text("credit_entity_id").references(() => legalEntities.id),
    amountMinor: numeric("amount_minor", { precision: 38, scale: 0 }).notNull(),
    currency: text("currency").notNull(),
    /** Provenance: which intercompany transactions or ownership rows justify it. */
    sourceReferences: jsonb("source_references").$type<string[]>().notNull().default([]),
    approvedByUserId: text("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Explicit: an unapproved adjustment is proposed, not applied. */
    applied: boolean("applied").notNull().default(false),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [index("consolidation_adjustments_run_idx").on(t.runId)],
);

/* ================================================================== */
/* 6. GROUP CAPITAL ALLOCATION                                         */
/* ================================================================== */

/**
 * Group capital allocation proposal.
 *
 * Group-level allocation policy lives in BEYU OS; the AUTHORITATIVE financial
 * request stays in Finance OS `capital_requests`, referenced by id. Where the
 * amount is derived from Finance OS the `dataState` is ACTUAL; where the proposal
 * is still a policy hypothesis it is ESTIMATED/PENDING and must never be added to
 * a booked total.
 */
export const mcmCapitalAllocations = pgTable(
  "mcm_capital_allocations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    cycle: text("cycle").notNull(),
    beneficiaryEntityId: text("beneficiary_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    /** Finance OS capital request this proposal would fund, when one exists. */
    capitalRequestId: text("capital_request_id").references(() => capitalRequests.id),
    currency: text("currency").notNull(),
    proposedAmountMinor: numeric("proposed_amount_minor", { precision: 38, scale: 0 }),
    approvedAmountMinor: numeric("approved_amount_minor", { precision: 38, scale: 0 }),
    strategicPriority: text("strategic_priority").notNull(),
    rationale: text("rationale").notNull(),
    status: text("status").notNull().default("DRAFT"),
    /** Governance body that must decide; never decided by MCM or NOELIA. */
    decidingBodyId: text("deciding_body_id"),
    decisionResolutionRef: text("decision_resolution_ref"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    proposedByUserId: text("proposed_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
  },
  (t) => [
    uniqueIndex("mcm_capital_allocations_tenant_code_uidx").on(t.tenantId, t.code),
    index("mcm_capital_allocations_entity_idx").on(t.beneficiaryEntityId),
  ],
);

/* ================================================================== */
/* 7. ENTERPRISE MODULES (entity-aware, no duplicated truth)           */
/* ================================================================== */

/**
 * Entity-scoped group procurement register.
 *
 * References the Foundation's `procurements` and Ujenzi's purchase orders by id
 * rather than replacing either. A group procurement that belongs to a Foundation
 * entity must be refused unless it points at the Foundation model, preserving
 * Foundation isolation.
 */
export const mcmProcurementRegister = pgTable(
  "mcm_procurement_register",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    title: text("title").notNull(),
    category: text("category").notNull(),
    currency: text("currency").notNull(),
    budgetMinor: numeric("budget_minor", { precision: 38, scale: 0 }),
    committedMinor: numeric("committed_minor", { precision: 38, scale: 0 }),
    supplierPartyId: text("supplier_party_id"),
    /** Linked canonical contract, when one exists. */
    contractId: text("contract_id"),
    /** Linked Foundation procurement, when the entity is the Foundation. */
    foundationProcurementId: text("foundation_procurement_id"),
    status: text("status").notNull().default("PLANNED"),
    conflictCheckState: text("conflict_check_state").notNull().default("NOT_CHECKED"),
    approvalRef: text("approval_ref"),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    ownerUserId: text("owner_user_id").references(() => users.id),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    uniqueIndex("mcm_procurement_register_uidx").on(t.tenantId, t.code),
    index("mcm_procurement_register_entity_idx").on(t.legalEntityId),
  ],
);

/** Entity-scoped asset and property register (owned / leased / licensed). */
export const mcmAssetRegister = pgTable(
  "mcm_asset_register",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    name: text("name").notNull(),
    assetClass: text("asset_class").notNull(),
    tenure: text("tenure").notNull().default("OWNED"),
    countryCode: text("country_code").references(() => countries.code),
    locationDescription: text("location_description"),
    titleDocumentId: text("title_document_id").references(() => documents.id),
    currency: text("currency"),
    carryingAmountMinor: numeric("carrying_amount_minor", { precision: 38, scale: 0 }),
    /** Custodian of the asset — never inferred from ownership. */
    custodianEntityId: text("custodian_entity_id").references(() => legalEntities.id),
    status: text("status").notNull().default("ACTIVE"),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    uniqueIndex("mcm_asset_register_uidx").on(t.tenantId, t.code),
    index("mcm_asset_register_entity_idx").on(t.legalEntityId),
  ],
);

/**
 * Group project and portfolio register.
 *
 * One row per governed project an entity owns. Sector-local project systems
 * (`ujenzi_projects`, `agriculture_projects`, `foundation_projects`) remain the
 * operational truth for delivery detail; this register carries the group
 * portfolio view and the reference back.
 */
export const mcmProjectPortfolio = pgTable(
  "mcm_project_portfolio",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    name: text("name").notNull(),
    programme: text("programme"),
    sectorCode: text("sector_code"),
    /** Existing sector project this portfolio entry observes. */
    sectorProjectSource: text("sector_project_source"),
    currency: text("currency"),
    budgetMinor: numeric("budget_minor", { precision: 38, scale: 0 }),
    actualMinor: numeric("actual_minor", { precision: 38, scale: 0 }),
    status: text("status").notNull().default("PLANNED"),
    health: text("health").notNull().default("UNKNOWN"),
    startsOn: date("starts_on"),
    endsOn: date("ends_on"),
    sponsorUserId: text("sponsor_user_id").references(() => users.id),
    dataState: mcmDataStateEnum("data_state").notNull().default("PENDING"),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    uniqueIndex("mcm_project_portfolio_uidx").on(t.tenantId, t.code),
    index("mcm_project_portfolio_entity_idx").on(t.legalEntityId),
  ],
);

/**
 * Entity-aware pointers into the SHARED modules (legal, risk, compliance,
 * audit, documents, contracts) without copying their truth.
 *
 * `moduleType` + `sourceId` name a row in its authoritative store; this table
 * only says which legal entity it belongs to and how it relates to MCM.
 */
export const mcmModuleLinks = pgTable(
  "mcm_module_links",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    moduleType: text("module_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceTable: text("source_table").notNull(),
    linkRole: text("link_role").notNull().default("GOVERNED_BY"),
    note: text("note"),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mcm_module_links_uidx").on(t.legalEntityId, t.sourceTable, t.sourceId, t.linkRole),
    index("mcm_module_links_entity_idx").on(t.legalEntityId),
    index("mcm_module_links_module_idx").on(t.moduleType),
  ],
);

/* ================================================================== */
/* 8. CROSS-OS INTEGRATION CONTRACTS                                   */
/* ================================================================== */

/**
 * Declared data contract between MCM and another governed system (Finance OS,
 * Health OS, Agriculture OS, Ujenzi OS, HCM, NOELIA, Documents, Risk).
 *
 * This is the ONLY route by which MCM may receive another system's data. It
 * names the data owner, the exact fields exposed, the direction, the
 * classification ceiling and the failure policy, and it records health. A
 * contract that is not VERIFIED makes its source UNAVAILABLE rather than
 * silently treated as empty.
 */
export const mcmIntegrationContracts = pgTable(
  "mcm_integration_contracts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    /** FINANCE_OS | HEALTH_OS | AGRICULTURE_OS | UJENZI_OS | HCM | NOELIA | DOCUMENTS | RISK */
    counterpartSystem: text("counterpart_system").notNull(),
    /** Data owner — the system that remains authoritative. */
    dataOwner: text("data_owner").notNull(),
    dataSet: text("data_set").notNull(),
    direction: text("direction").notNull().default("INBOUND"),
    transport: text("transport").notNull().default("INTERNAL_SERVICE"),
    /** Exact exposed fields. An empty list is a malformed contract. */
    exposedFields: jsonb("exposed_fields").$type<string[]>().notNull().default([]),
    classificationCeiling: classificationEnum("classification_ceiling").notNull().default("CONFIDENTIAL"),
    state: mcmIntegrationStateEnum("state").notNull().default("DECLARED"),
    /** Retry / failure policy. */
    failurePolicy: text("failure_policy").notNull().default("FAIL_CLOSED_UNAVAILABLE"),
    maxRetries: integer("max_retries").notNull().default(3),
    /** Last successful observation, and the reason for the current state. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastFailureReason: text("last_failure_reason"),
    verifiedByUserId: text("verified_by_user_id").references(() => users.id),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mcm_integration_contracts_code_uidx").on(t.code),
    index("mcm_integration_contracts_system_idx").on(t.counterpartSystem),
  ],
);

/**
 * Append-only integration audit trail. One row per contract invocation outcome
 * that MCM performed (read, refusal, timeout). Provenance for every cross-system
 * figure that reached an MCM surface.
 */
export const mcmIntegrationEvents = pgTable(
  "mcm_integration_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    contractCode: text("contract_code").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id),
    outcome: text("outcome").notNull(),
    recordsReturned: integer("records_returned"),
    latencyMs: integer("latency_ms"),
    failureReason: text("failure_reason"),
    traceId: text("trace_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mcm_integration_events_contract_idx").on(t.contractCode),
    index("mcm_integration_events_time_idx").on(t.occurredAt),
  ],
);
