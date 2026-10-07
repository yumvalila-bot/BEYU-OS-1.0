/**
 * BEYU OS — SHARED PRICING, MARGIN & PROFITABILITY schema.
 *
 * This is a SHARED ENTERPRISE CAPABILITY, not an OS. It is the one place where an enterprise price,
 * a markup, a margin and a cost allocation live, so that four sector OSs cannot each grow their own
 * and disagree about what a margin is.
 *
 * ============================ THE DISTINCTION THAT MATTERS ==================
 *
 *   MARKUP = (price − cost) / cost
 *   MARGIN = (price − cost) / price
 *
 * 100 cost, 125 price ⇒ 25% markup, 20% margin. Both are stored in basis points in SEPARATELY NAMED
 * columns, and the check constraints below make the relationship a database-level fact rather than a
 * convention: a row whose `margin_bps` does not equal `round(markup_bps * 10000 / (10000 + markup_bps))`
 * cannot be written. A single mislabelled column is how an enterprise ends up pricing at a loss while
 * reporting a healthy margin, so the database refuses to hold the two interchangeably.
 *
 * ============================ COST ALLOCATION IS EXACT ======================
 *
 * `cost_allocation_lines` carries the exact distributed amount per unit, and the run carries the
 * remainder policy. The engine distributes the pool by largest remainder, so the lines sum to the pool
 * EXACTLY — never to the pool plus a rounding artefact. A `CHECK` on the run cannot verify a sum across
 * rows; the engine asserts it, the run records the verified totals, and both totals are stored so a
 * reader can see that they agree.
 *
 * Money is `numeric(38, 0)` integer minor units. Rates are integer basis points.
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
/* Price lists and prices                                              */
/* ------------------------------------------------------------------ */

export const priceLists = pgTable(
  "price_lists",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** RETAIL | WHOLESALE | DISTRIBUTOR | CORPORATE | GOVERNMENT | INTERNAL | TRANSFER. */
    channel: text("channel").notNull(),
    currency: text("currency").notNull(),
    /** COUNTRY | SECTOR | TENANT | GLOBAL — the scope the list is authoritative for. */
    scopeType: text("scope_type").notNull().default("TENANT"),
    scopeId: text("scope_id"),
    /** Whether prices in this list are inclusive of tax. Never inferred; always recorded. */
    taxInclusive: boolean("tax_inclusive").notNull().default(false),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    approvalRef: text("approval_ref"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("price_lists_code_version_uidx").on(t.tenantId, t.code, t.version),
    index("price_lists_channel_idx").on(t.tenantId, t.channel, t.status),
    check("price_lists_currency_check", sql`char_length(currency) = 3`),
    check("price_lists_channel_check", sql`channel IN ('RETAIL','WHOLESALE','DISTRIBUTOR','CORPORATE','GOVERNMENT','INTERNAL','TRANSFER')`),
    check("price_lists_version_check", sql`version >= 1`),
    check("price_lists_period_check", sql`effective_to IS NULL OR effective_to >= effective_from`),
    check("price_lists_status_check", sql`status IN ('DRAFT','PENDING_APPROVAL','ACTIVE','SUPERSEDED','WITHDRAWN')`),
    check(
      "price_lists_approval_check",
      sql`status <> 'ACTIVE' OR (approval_ref IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)`,
    ),
  ],
);

/**
 * One priced item.
 *
 * `cost_minor` is the declared unit cost the price was built from, `price_minor` the declared price,
 * and `markup_bps` / `margin_bps` the two rates derived from them. All four are stored: the cost and
 * price are FACTS the business declares, and the two rates are the ARITHMETIC that follows — keeping
 * all four means a reader can check the arithmetic instead of trusting it, and the CHECK constraints
 * mean a wrong one cannot be stored.
 */
export const priceListItems = pgTable(
  "price_list_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    priceListId: text("price_list_id")
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    /** The priced subject: a product, a service, a farm lot, a construction BOQ line. */
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    subjectLabel: text("subject_label"),
    unitOfMeasure: text("unit_of_measure").notNull(),
    currency: text("currency").notNull(),
    /** Declared unit cost, minor units. Zero is permitted for a giveaway line, and is visible as such. */
    costMinor: numeric("cost_minor", { precision: 38, scale: 0 }).notNull(),
    /** Declared unit price, minor units. */
    priceMinor: numeric("price_minor", { precision: 38, scale: 0 }).notNull(),
    /** Markup rate: (price − cost) / cost, basis points. Null when cost is zero (undefined, not zero). */
    markupBps: integer("markup_bps"),
    /** Margin rate: (price − cost) / price, basis points. Null when price is zero (undefined, not zero). */
    marginBps: integer("margin_bps"),
    /** Floor price below which the line may not be sold, minor units. */
    floorPriceMinor: numeric("floor_price_minor", { precision: 38, scale: 0 }),
    /** Standard maximum discount, basis points. */
    maximumDiscountBps: integer("maximum_discount_bps"),
    /** Whether the price was derived (cost-plus / target-margin) or set by the market. */
    pricingBasis: text("pricing_basis").notNull(),
    /** The price of record: VERIFIED | CALCULATED | ESTIMATED | FORECAST. */
    dataState: text("data_state").notNull().default("CALCULATED"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    status: text("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("price_list_items_list_subject_uidx").on(t.priceListId, t.subjectType, t.subjectId, t.effectiveFrom),
    index("price_list_items_subject_idx").on(t.tenantId, t.subjectType, t.subjectId),
    check("price_list_items_currency_check", sql`char_length(currency) = 3`),
    check("price_list_items_cost_price_check", sql`cost_minor >= 0 AND price_minor >= 0`),
    check(
      "price_list_items_basis_check",
      sql`pricing_basis IN ('COST_PLUS_MARKUP','TARGET_MARGIN','MARKET_REFERENCE','COMPETITOR_REFERENCE','REGULATED','LEGACY_CONTRACT','INTERCOMPANY')`,
    ),
    check(
      "price_list_items_state_check",
      sql`data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST')`,
    ),
    check(
      "price_list_items_discount_check",
      sql`maximum_discount_bps IS NULL OR (maximum_discount_bps >= 0 AND maximum_discount_bps <= 10000)`,
    ),
    check(
      "price_list_items_floor_check",
      sql`floor_price_minor IS NULL OR (floor_price_minor >= 0 AND floor_price_minor <= price_minor)`,
    ),
    // ── THE MARKUP/MARGIN RELATIONSHIP, ENFORCED BY THE DATABASE ────────────────
    // markup = (price − cost) / cost  (undefined at cost = 0)
    check(
      "price_list_items_markup_check",
      sql`(cost_minor = 0 AND markup_bps IS NULL) OR (cost_minor > 0 AND markup_bps = round(((price_minor - cost_minor) * 10000.0) / cost_minor))`,
    ),
    // margin = (price − cost) / price  (undefined at price = 0)
    check(
      "price_list_items_margin_check",
      sql`(price_minor = 0 AND margin_bps IS NULL) OR (price_minor > 0 AND margin_bps = round(((price_minor - cost_minor) * 10000.0) / price_minor))`,
    ),
    check(
      "price_list_items_consistency_check",
      sql`cost_minor = 0 OR price_minor = 0 OR margin_bps IS NULL OR markup_bps IS NULL OR (((markup_bps - margin_bps) * 1.0) = round((markup_bps * margin_bps) / 10000.0))`,
    ),
    check("price_list_items_period_check", sql`effective_to IS NULL OR effective_to >= effective_from`),
  ],
);

/** An approved change to a price, with its authority. A price never changes without a recorded decision. */
export const pricingDecisions = pgTable(
  "pricing_decisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    priceListId: text("price_list_id").references(() => priceLists.id),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    currency: text("currency").notNull(),
    previousPriceMinor: numeric("previous_price_minor", { precision: 38, scale: 0 }),
    newPriceMinor: numeric("new_price_minor", { precision: 38, scale: 0 }).notNull(),
    previousMarginBps: integer("previous_margin_bps"),
    newMarginBps: integer("new_margin_bps"),
    /** COMPETITIVE_RESPONSE | COST_CHANGE | INFLATION | PROMOTION | CONTRACT_RENEWAL | STRATEGIC | MARGIN_RECOVERY. */
    reasonCategory: text("reason_category").notNull(),
    rationale: text("rationale").notNull(),
    /** The pricing engine's own analysis, preserved verbatim. */
    analysis: jsonb("analysis").$type<Record<string, unknown>>(),
    proposedBy: text("proposed_by")
      .notNull()
      .references(() => users.id),
    approvedBy: text("approved_by").references(() => users.id),
    approvalRef: text("approval_ref"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    effectiveFrom: date("effective_from").notNull(),
    status: text("status").notNull().default("PROPOSED"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pricing_decisions_subject_idx").on(t.tenantId, t.subjectType, t.subjectId, t.decidedAt),
    check("pricing_decisions_currency_check", sql`char_length(currency) = 3`),
    check("pricing_decisions_price_check", sql`new_price_minor >= 0`),
    check(
      "pricing_decisions_reason_check",
      sql`reason_category IN ('COMPETITIVE_RESPONSE','COST_CHANGE','INFLATION','PROMOTION','CONTRACT_RENEWAL','STRATEGIC','MARGIN_RECOVERY')`,
    ),
    check("pricing_decisions_rationale_check", sql`char_length(rationale) >= 16`),
    check("pricing_decisions_status_check", sql`status IN ('PROPOSED','APPROVED','REJECTED','SUPERSEDED')`),
    check(
      "pricing_decisions_approval_check",
      sql`status <> 'APPROVED' OR (approved_by IS NOT NULL AND approval_ref IS NOT NULL AND decided_at IS NOT NULL)`,
    ),
    check(
      "pricing_decisions_sod_check",
      sql`approved_by IS NULL OR approved_by <> proposed_by`,
    ),
  ],
);

/* ------------------------------------------------------------------ */
/* Cost allocation (§11)                                               */
/* ------------------------------------------------------------------ */

/**
 * A versioned indirect-cost allocation rule set.
 *
 * `rules` is structured: each rule names a cost pool, a driver (revenue, headcount, floor area,
 * machine hours, units shipped) and the weights by receiving unit. An allocation without an approved,
 * versioned rule set is not an allocation — it is an assertion — so `approved` gates every run.
 */
export const costAllocationRuleSets = pgTable(
  "cost_allocation_rule_sets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    code: text("code").notNull(),
    version: integer("version").notNull(),
    currency: text("currency").notNull(),
    period: text("period").notNull(),
    /** The rule payload: pools, drivers and weights. */
    rules: jsonb("rules").$type<readonly unknown[]>().notNull(),
    /** LARGEST_REMAINDER is the only remainder policy this system implements, and it is stated. */
    remainderPolicy: text("remainder_policy").notNull().default("LARGEST_REMAINDER"),
    rationale: text("rationale").notNull(),
    approved: boolean("approved").notNull().default(false),
    approvalRef: text("approval_ref"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    supersedesId: text("supersedes_id"),
    status: text("status").notNull().default("DRAFT"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cost_allocation_rule_sets_code_version_uidx").on(t.tenantId, t.code, t.version),
    check("cost_allocation_rule_sets_version_check", sql`version >= 1`),
    check("cost_allocation_rule_sets_currency_check", sql`char_length(currency) = 3`),
    check("cost_allocation_rule_sets_remainder_check", sql`remainder_policy = 'LARGEST_REMAINDER'`),
    check("cost_allocation_rule_sets_rules_check", sql`jsonb_array_length(rules) > 0`),
    check("cost_allocation_rule_sets_rationale_check", sql`char_length(rationale) >= 16`),
    check(
      "cost_allocation_rule_sets_approval_check",
      sql`approved = false OR (approval_ref IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)`,
    ),
    check("cost_allocation_rule_sets_status_check", sql`status IN ('DRAFT','APPROVED','SUPERSEDED','WITHDRAWN')`),
  ],
);

/** One execution of a rule set against a declared cost pool. */
export const costAllocationRuns = pgTable(
  "cost_allocation_runs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ruleSetId: text("rule_set_id")
      .notNull()
      .references(() => costAllocationRuleSets.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    period: text("period").notNull(),
    currency: text("currency").notNull(),
    /** The cost pool as declared by the caller, minor units. */
    poolMinor: numeric("pool_minor", { precision: 38, scale: 0 }).notNull(),
    /** The sum of the distributed lines. Stored so it can be compared to `pool_minor`, not assumed. */
    allocatedMinor: numeric("allocated_minor", { precision: 38, scale: 0 }).notNull(),
    remainderMinor: numeric("remainder_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    remainderPolicy: text("remainder_policy").notNull().default("LARGEST_REMAINDER"),
    dataState: text("data_state").notNull().default("CALCULATED"),
    reason: text("reason"),
    runBy: text("run_by")
      .notNull()
      .references(() => users.id),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    traceId: text("trace_id"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    uniqueIndex("cost_allocation_runs_code_period_uidx").on(t.tenantId, t.code, t.period),
    index("cost_allocation_runs_ruleset_idx").on(t.ruleSetId),
    check("cost_allocation_runs_currency_check", sql`char_length(currency) = 3`),
    check(
      "cost_allocation_runs_exactness_check",
      sql`allocated_minor + remainder_minor = pool_minor`,
    ),
    check(
      "cost_allocation_runs_state_check",
      sql`data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')`,
    ),
    check(
      "cost_allocation_runs_reason_check",
      sql`data_state NOT IN ('MISSING','NOT_APPLICABLE','INVALID') OR (reason IS NOT NULL AND char_length(reason) >= 8)`,
    ),
  ],
);

/** One receiving unit's allocated share. */
export const costAllocationLines = pgTable(
  "cost_allocation_lines",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    runId: text("run_id")
      .notNull()
      .references(() => costAllocationRuns.id, { onDelete: "cascade" }),
    /** The cost pool this line allocates from. A run may hold several pools. */
    poolCode: text("pool_code").notNull(),
    /** The receiving unit: an org unit, a product line, a project, a sector entity. */
    receivingUnitType: text("receiving_unit_type").notNull(),
    receivingUnitId: text("receiving_unit_id").notNull(),
    driverCode: text("driver_code").notNull(),
    driverValue: numeric("driver_value", { precision: 30, scale: 6 }).notNull(),
    driverTotal: numeric("driver_total", { precision: 30, scale: 6 }).notNull(),
    allocatedMinor: numeric("allocated_minor", { precision: 38, scale: 0 }).notNull(),
    currency: text("currency").notNull(),
    roundingAdjustmentMinor: numeric("rounding_adjustment_minor", { precision: 38, scale: 0 }).notNull().default("0"),
  },
  (t) => [
    index("cost_allocation_lines_run_idx").on(t.runId),
    index("cost_allocation_lines_unit_idx").on(t.tenantId, t.receivingUnitType, t.receivingUnitId),
    check("cost_allocation_lines_amount_check", sql`allocated_minor >= 0`),
    check("cost_allocation_lines_driver_check", sql`driver_total >= 0 AND driver_value >= 0 AND driver_value <= driver_total`),
    check("cost_allocation_lines_currency_check", sql`char_length(currency) = 3`),
  ],
);

/* ------------------------------------------------------------------ */
/* §12 — Profitability analysis                                        */
/* ------------------------------------------------------------------ */

/**
 * A profitability analysis for a period: the §12 ladder rolled up across units.
 *
 * The ladder separates DIRECT cost, ALLOCATED INDIRECT cost and OPERATING EXPENSE because the three
 * have different evidential standing — a direct cost is an observed fact, an allocated cost is the
 * product of an approved rule set, an operating expense is a corporate decision. Collapsing them into
 * one "cost" line would present an allocation as a fact.
 */
export const profitabilityAnalyses = pgTable(
  "profitability_analyses",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    period: text("period").notNull(),
    currency: text("currency").notNull(),
    /** The rule set used for the allocated-indirect layer. Null when the analysis is direct-cost only. */
    allocationRunId: text("allocation_run_id").references(() => costAllocationRuns.id),
    revenueMinor: numeric("revenue_minor", { precision: 38, scale: 0 }).notNull(),
    directCostMinor: numeric("direct_cost_minor", { precision: 38, scale: 0 }).notNull(),
    allocatedIndirectMinor: numeric("allocated_indirect_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    operatingExpenseMinor: numeric("operating_expense_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    /** All four computed by the engine and stored, so a reader can check rather than trust. */
    grossMarginMinor: numeric("gross_margin_minor", { precision: 38, scale: 0 }).notNull(),
    contributionMinor: numeric("contribution_minor", { precision: 38, scale: 0 }).notNull(),
    operatingProfitMinor: numeric("operating_profit_minor", { precision: 38, scale: 0 }).notNull(),
    grossMarginBps: integer("gross_margin_bps"),
    contributionMarginBps: integer("contribution_margin_bps"),
    operatingMarginBps: integer("operating_margin_bps"),
    /** Whether any line in the analysis used an unapproved allocation. Always false from this engine. */
    unapprovedAllocation: boolean("unapproved_allocation").notNull().default(false),
    dataState: text("data_state").notNull().default("CALCULATED"),
    reason: text("reason"),
    runBy: text("run_by")
      .notNull()
      .references(() => users.id),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    traceId: text("trace_id"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
  },
  (t) => [
    uniqueIndex("profitability_analyses_code_period_uidx").on(t.tenantId, t.code, t.period),
    index("profitability_analyses_period_idx").on(t.tenantId, t.period),
    check("profitability_analyses_currency_check", sql`char_length(currency) = 3`),
    check(
      "profitability_analyses_ladder_check",
      sql`gross_margin_minor = revenue_minor - direct_cost_minor AND contribution_minor = gross_margin_minor - allocated_indirect_minor AND operating_profit_minor = contribution_minor - operating_expense_minor`,
    ),
    check("profitability_analyses_unapproved_check", sql`unapproved_allocation = false`),
    check(
      "profitability_analyses_state_check",
      sql`data_state IN ('VERIFIED','CALCULATED','ESTIMATED','FORECAST','MISSING','NOT_APPLICABLE','INVALID')`,
    ),
    check(
      "profitability_analyses_reason_check",
      sql`data_state NOT IN ('MISSING','NOT_APPLICABLE','INVALID') OR (reason IS NOT NULL AND char_length(reason) >= 8)`,
    ),
  ],
);

/** One unit's rung on the profitability ladder. */
export const profitabilityLines = pgTable(
  "profitability_lines",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => profitabilityAnalyses.id, { onDelete: "cascade" }),
    unitType: text("unit_type").notNull(),
    unitId: text("unit_id").notNull(),
    unitLabel: text("unit_label"),
    revenueMinor: numeric("revenue_minor", { precision: 38, scale: 0 }).notNull(),
    directCostMinor: numeric("direct_cost_minor", { precision: 38, scale: 0 }).notNull(),
    allocatedIndirectMinor: numeric("allocated_indirect_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    operatingExpenseMinor: numeric("operating_expense_minor", { precision: 38, scale: 0 }).notNull().default("0"),
    grossMarginMinor: numeric("gross_margin_minor", { precision: 38, scale: 0 }).notNull(),
    contributionMinor: numeric("contribution_minor", { precision: 38, scale: 0 }).notNull(),
    operatingProfitMinor: numeric("operating_profit_minor", { precision: 38, scale: 0 }).notNull(),
    /** The unit's margin, basis points. Null when revenue is zero — undefined, never 0. */
    operatingMarginBps: integer("operating_margin_bps"),
    /** True where the unit loses money at the operating-profit rung; surfaced, never hidden. */
    lossMaking: boolean("loss_making").notNull().default(false),
    currency: text("currency").notNull(),
  },
  (t) => [
    uniqueIndex("profitability_lines_analysis_unit_uidx").on(t.analysisId, t.unitType, t.unitId),
    index("profitability_lines_unit_idx").on(t.tenantId, t.unitType, t.unitId),
    check("profitability_lines_currency_check", sql`char_length(currency) = 3`),
    check(
      "profitability_lines_ladder_check",
      sql`gross_margin_minor = revenue_minor - direct_cost_minor AND contribution_minor = gross_margin_minor - allocated_indirect_minor AND operating_profit_minor = contribution_minor - operating_expense_minor`,
    ),
    check(
      "profitability_lines_margin_check",
      sql`(revenue_minor = 0 AND operating_margin_bps IS NULL) OR (revenue_minor > 0 AND operating_margin_bps = round((operating_profit_minor * 10000.0) / revenue_minor))`,
    ),
    check("profitability_lines_loss_check", sql`loss_making = (operating_profit_minor < 0)`),
  ],
);
