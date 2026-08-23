/**
 * BEYU OS — Canonical financial truth registry (Phase 7J, §3).
 *
 * WHAT THIS ANSWERS. For any financial datum: which table is authoritative for it, what epistemic
 * class it carries, and whether any other module is permitted to write it.
 *
 * WHY IT IS NEEDED. Before this phase the answer lived in six specialists' heads. Treasury knew it
 * shouldn't write the ledger; forecasting knew its output wasn't an actual — but nothing in the
 * codebase could be asked "what is the canonical source of a cash balance?" and give one answer.
 * A registry makes the rule checkable, and makes a violation a test failure rather than a code
 * review opinion.
 *
 * IT DEFINES NO NEW TABLE. Every entry points at a table that already exists. Adding a canonical
 * store here would be the exact duplicate-truth failure the registry exists to prevent.
 */
import type { EpistemicClass } from "./epistemics";

/** The financial domains of the Finance OS. */
export const FINANCE_DOMAIN = [
  "ACCOUNTING",
  "LEDGER",
  "TREASURY",
  "FPNA",
  "FORECASTING",
  "RISK",
  "COMPLIANCE",
  "AUDIT",
  "TAX",
  "CAPITAL",
  "AR",
  "AP",
  "FIXED_ASSETS",
  "INVENTORY",
  "INTERCOMPANY",
  "CLOSE",
  "CONSOLIDATION",
  "REPORTING",
] as const;
export type FinanceDomain = (typeof FINANCE_DOMAIN)[number];

export type TruthRecord = {
  domain: FinanceDomain;
  /** What this record is the truth ABOUT. */
  datum: string;
  /**
   * The authoritative table, or null when the domain has no substrate in this system yet.
   * Null is an honest NOT_AVAILABLE, never an invitation to invent one.
   */
  canonicalTable: string | null;
  /** The strongest epistemic class this source can produce. */
  producesClass: EpistemicClass;
  /**
   * The single module permitted to write the canonical table. Everything else is read-only.
   * Null means nothing may write it in the current architecture.
   */
  soleWriter: string | null;
  /** Modules that may read and derive from it. */
  derivedBy: string[];
  /** Why this source is authoritative, or why the domain has no source. */
  note: string;
};

/**
 * THE REGISTRY.
 *
 * Deliberately records absence. A domain with `canonicalTable: null` is reported as
 * NOT_AVAILABLE by the completeness matrix rather than quietly omitted, because an unlisted
 * domain looks like a domain nobody thought about.
 */
export const FINANCIAL_TRUTH: readonly TruthRecord[] = [
  {
    domain: "LEDGER",
    datum: "Chart of accounts",
    canonicalTable: "ledger_accounts",
    producesClass: "REFERENCE_DATA",
    soleWriter: null,
    derivedBy: ["finance/posting-engine", "specialist/fpna", "specialist/audit"],
    note: "Account structure is reference data. Creating accounts is an accounting-policy act (P1) and has no writer today.",
  },
  {
    domain: "ACCOUNTING",
    datum: "Journal entries and lines — booked accounting truth",
    canonicalTable: "journal_entries + journal_lines",
    producesClass: "POSTED",
    soleWriter: "finance/posting-engine",
    derivedBy: ["specialist/fpna", "specialist/forecast", "specialist/audit", "finance/reconciliation"],
    note: "The ONLY source of POSTED truth. postJournal() is the sole writer and is gated on CAP_POSTING, which is LOCKED.",
  },
  {
    domain: "ACCOUNTING",
    datum: "Accounting period state",
    canonicalTable: "financial_periods",
    producesClass: "OBSERVED",
    soleWriter: null,
    derivedBy: ["finance/posting-engine", "finance/close"],
    note: "Period open/closed governs posting. Opening and closing a period requires ratified authority; no writer exists.",
  },
  {
    domain: "LEDGER",
    datum: "Account balances",
    canonicalTable: null,
    producesClass: "DERIVED",
    soleWriter: null,
    derivedBy: ["finance/posting-engine:trialBalance"],
    note: "Balances are DERIVED by aggregating journal lines and are never stored. A stored balance would be a second truth that can drift from its own ledger.",
  },
  {
    domain: "TREASURY",
    datum: "Cash and bank positions",
    canonicalTable: "treasury_positions",
    producesClass: "OBSERVED",
    soleWriter: null,
    derivedBy: ["specialist/treasury", "specialist/risk", "specialist/forecast"],
    note: "Bank truth, observed as at a date. Treasury observations are NOT accounting truth and must be reconciled to the ledger, never posted from.",
  },
  {
    domain: "FPNA",
    datum: "Budgets and plans",
    canonicalTable: null,
    producesClass: "DATA_NOT_AVAILABLE",
    soleWriter: null,
    derivedBy: [],
    note: "No budget table exists. FP&A operates on ledger actuals only. Reported as NOT_AVAILABLE rather than substituted with a forecast.",
  },
  {
    domain: "FORECASTING",
    datum: "Forecasts and scenarios",
    canonicalTable: null,
    producesClass: "FORECAST",
    soleWriter: null,
    derivedBy: ["specialist/forecast"],
    note: "Forecasts are computed on demand and never persisted, so no forecast can be mistaken for, or overwrite, an actual.",
  },
  {
    domain: "RISK",
    datum: "Risk register",
    canonicalTable: "risks",
    producesClass: "OBSERVED",
    soleWriter: null,
    derivedBy: ["specialist/risk", "specialist/forecast"],
    note: "Risk observations. Risk never mutates ledger, treasury or capital.",
  },
  {
    domain: "COMPLIANCE",
    datum: "Obligations, assessments, controls",
    canonicalTable: "compliance_obligations + compliance_assessments + controls",
    producesClass: "OBSERVED",
    soleWriter: null,
    derivedBy: ["specialist/compliance", "specialist/audit"],
    note: "A compliance assertion is an observation about control state, never a financial figure.",
  },
  {
    domain: "AUDIT",
    datum: "Audit log and enterprise events",
    canonicalTable: "audit_log + enterprise_events",
    producesClass: "POSTED",
    soleWriter: "lib/audit (recordAuditTx + publishEventTx)",
    derivedBy: ["specialist/audit"],
    note: "Append-only and trigger-protected against UPDATE and TRUNCATE. Audit truth is immutable by construction.",
  },
  {
    domain: "TAX",
    datum: "Tax strategies and assessments",
    canonicalTable: "tax_strategies + tax_strategy_assessments",
    producesClass: "OBSERVED",
    soleWriter: null,
    derivedBy: ["specialist/tax-intelligence"],
    note: "Strategy records only. No tax rate, treatment or computation is authoritative without ratified authority (P8/TGC).",
  },
  {
    domain: "CAPITAL",
    datum: "Capital requests and waterfall runs",
    canonicalTable: "capital_requests + waterfall_runs + waterfall_run_lines",
    producesClass: "OBSERVED",
    soleWriter: "lib/capital-governance-service",
    derivedBy: ["specialist/risk", "specialist/fpna"],
    note: "Governed capital records. Allocation, commitment and disbursement remain LOCKED behind IC authority.",
  },
  { domain: "AR", datum: "Receivables subledger", canonicalTable: null, producesClass: "DATA_NOT_AVAILABLE", soleWriter: null, derivedBy: [], note: "No AR substrate exists. NOT_AVAILABLE — creating one requires ratified accounting policy." },
  { domain: "AP", datum: "Payables subledger", canonicalTable: null, producesClass: "DATA_NOT_AVAILABLE", soleWriter: null, derivedBy: [], note: "No AP substrate exists. NOT_AVAILABLE." },
  { domain: "FIXED_ASSETS", datum: "Asset register and depreciation", canonicalTable: null, producesClass: "DATA_NOT_AVAILABLE", soleWriter: null, derivedBy: [], note: "No fixed-asset substrate. Depreciation is an accounting-policy judgement (P1) and is not invented here." },
  { domain: "INVENTORY", datum: "Inventory and valuation", canonicalTable: null, producesClass: "DATA_NOT_AVAILABLE", soleWriter: null, derivedBy: [], note: "No inventory substrate. Valuation basis requires ratified policy." },
  {
    domain: "INTERCOMPANY",
    datum: "Entity ownership and cross-entity relationships",
    canonicalTable: "legal_entities + ownership_records",
    producesClass: "OBSERVED",
    soleWriter: null,
    derivedBy: ["finance/attribution", "specialist/treasury"],
    note: "legal_entities.tenant_id is the canonical owner of an entity. Any financial row disagreeing with it is an attribution conflict.",
  },
  {
    domain: "CLOSE",
    datum: "Period close and checklist",
    canonicalTable: "financial_periods",
    producesClass: "OBSERVED",
    soleWriter: null,
    derivedBy: ["finance/close"],
    note: "Period status is the only close substrate. A close checklist, reconciliation sign-off and reporting lock require ratified authority.",
  },
  {
    domain: "CONSOLIDATION",
    datum: "Group consolidated position",
    canonicalTable: null,
    producesClass: "REQUIRES_AUTHORITY",
    soleWriter: null,
    derivedBy: [],
    note: "Consolidation requires a ratified consolidation and elimination policy. None exists, and inventing one is forbidden.",
  },
  {
    domain: "REPORTING",
    datum: "Governed financial reports",
    canonicalTable: null,
    producesClass: "DERIVED",
    soleWriter: null,
    derivedBy: ["finance/reporting"],
    note: "Reports are derived views over canonical truth, never a store. Each must carry tenant, entity, period, currency, source, class, provenance and authority.",
  },
];

/** All truth records for a domain. */
export function truthFor(domain: FinanceDomain): TruthRecord[] {
  return FINANCIAL_TRUTH.filter((r) => r.domain === domain);
}

/** The module permitted to write a table, or null when nothing may. */
export function soleWriterOf(table: string): string | null {
  return FINANCIAL_TRUTH.find((r) => r.canonicalTable === table)?.soleWriter ?? null;
}

/**
 * Is `module` allowed to write `table`?
 *
 * Default deny: a table absent from the registry cannot be written by anyone, so adding a new
 * financial store without registering it fails rather than silently becoming a second truth.
 */
export function mayWrite(module: string, table: string): boolean {
  const record = FINANCIAL_TRUTH.find((r) => r.canonicalTable === table);
  if (!record || record.soleWriter === null) return false;
  return record.soleWriter === module;
}

/** Domains with no substrate — reported honestly rather than hidden. */
export function domainsWithoutSubstrate(): FinanceDomain[] {
  return [...new Set(
    FINANCIAL_TRUTH.filter((r) => r.canonicalTable === null).map((r) => r.domain),
  )].filter((d) => !FINANCIAL_TRUTH.some((r) => r.domain === d && r.canonicalTable !== null));
}
