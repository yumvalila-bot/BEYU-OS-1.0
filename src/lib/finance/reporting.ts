/**
 * BEYU OS — Financial reporting engine (Finance OS, Phase 20).
 *
 * THE ONE RULE THIS ENFORCES. A report must never present a derived, forecast or assumed figure as
 * accounting truth. Every line carries its epistemic class, and a report containing any non-factual
 * line is labelled as a whole — so a reader cannot mistake a projection for a balance.
 *
 * WHAT IT COMPUTES. Trial balance from journal lines, and statement skeletons whose structure is
 * policy-independent. Debits and credits net to zero under any accounting policy; that is
 * arithmetic, not judgement.
 *
 * WHAT IT REFUSES. Which account belongs in which statement caption, what "revenue" means, when a
 * cost is capitalised, how equity movements are presented — all IFRS/policy judgements (P1),
 * unratified. Statements therefore return REQUIRES_AUTHORITY for classification while still
 * proving the underlying arithmetic works.
 *
 * THE LEDGER IS EMPTY. Every report against real data returns DATA_NOT_AVAILABLE, never 0.00. A
 * balance sheet of zeros asserts a measured position that was never observed, and is the single
 * most misleading artefact this module could emit.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries, journalLines, ledgerAccounts } from "@/db/schema";
import type { EpistemicClass } from "./epistemics";

export const REPORTING_ENGINE_VERSION = "reporting-1.0.0";

/** Reports the engine can produce, and those it structurally cannot without policy. */
export const REPORT_KIND = [
  "TRIAL_BALANCE",
  "BALANCE_SHEET",
  "INCOME_STATEMENT",
  "CASH_FLOW",
  "CHANGES_IN_EQUITY",
  "MANAGEMENT_ACCOUNTS",
  "BUDGET_VS_ACTUAL",
  "FORECAST_VS_ACTUAL",
  "TREASURY_REPORT",
  "CONSOLIDATED",
] as const;
export type ReportKind = (typeof REPORT_KIND)[number];

/** Assurance level. Absent an audit process, everything real is UNAUDITED. */
export const ASSURANCE_LEVEL = ["AUDITED", "UNAUDITED", "REQUIRES_AUTHORITY", "NOT_APPLICABLE"] as const;
export type AssuranceLevel = (typeof ASSURANCE_LEVEL)[number];

export type ReportLine = {
  caption: string;
  accountCode: string | null;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  currency: string | null;
  epistemicClass: EpistemicClass;
  /** Why a line has no value, when it has none. */
  reason: string | null;
};

/**
 * Every report carries its full provenance envelope. These fields are mandatory, not optional
 * metadata: a financial figure without tenant, entity, period, currency and class is unusable as
 * evidence.
 */
export type FinancialReport = {
  kind: ReportKind;
  tenantId: string;
  legalEntityId: string | null;
  periodCode: string | null;
  asOf: string;
  reportingCurrency: string | null;
  lines: ReportLine[];
  /** The weakest class present. The whole report is only as strong as its weakest line. */
  overallClass: EpistemicClass;
  assurance: AssuranceLevel;
  /** True only when the report is arithmetically complete AND policy-independent. */
  authoritative: boolean;
  balanced: boolean | null;
  totalDebits: string | null;
  totalCredits: string | null;
  policyDependencies: string[];
  provenance: {
    sourceTables: string[];
    engineVersion: string;
    generatedAt: string;
    linesFromSubstrate: number;
  };
  limitations: string[];
};

function weakestClass(classes: EpistemicClass[]): EpistemicClass {
  if (classes.length === 0) return "DATA_NOT_AVAILABLE";
  for (const dominant of ["DATA_CONFLICT", "DATA_NOT_AVAILABLE", "REQUIRES_AUTHORITY", "REQUIRES_POLICY"] as const) {
    if (classes.includes(dominant)) return dominant;
  }
  const order: EpistemicClass[] = ["POSTED", "OBSERVED", "DERIVED", "FORECAST", "ASSUMPTION", "SCENARIO"];
  let weakest: EpistemicClass = "POSTED";
  for (const c of classes) {
    if (order.indexOf(c) > order.indexOf(weakest)) weakest = c;
  }
  return weakest;
}

/**
 * Trial balance — the one statement whose logic is genuinely policy-independent.
 *
 * Summing debits and credits per account requires no accounting judgement. Whether the result
 * *balances* is a property of the data, and the immutability triggers already enforce balance at
 * write time, so a non-zero difference here would indicate corruption rather than a posting error.
 */
export async function trialBalance(input: {
  tenantId: string;
  legalEntityId?: string | null;
  asOf: string;
  reportingCurrency?: string;
}): Promise<FinancialReport> {
  const conditions = [eq(journalEntries.tenantId, input.tenantId)];
  if (input.legalEntityId) {
    conditions.push(eq(journalEntries.legalEntityId, input.legalEntityId));
  }

  const rows = await db
    .select({
      accountId: journalLines.accountId,
      accountCode: ledgerAccounts.code,
      accountName: ledgerAccounts.name,
      debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)::text`,
      credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)::text`,
      currency: sql<string>`min(${journalEntries.currency})`,
      currencies: sql<number>`count(distinct ${journalEntries.currency})::int`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .leftJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(and(...conditions))
    .groupBy(journalLines.accountId, ledgerAccounts.code, ledgerAccounts.name);

  const base = {
    kind: "TRIAL_BALANCE" as const,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId ?? null,
    periodCode: null,
    asOf: input.asOf,
    reportingCurrency: input.reportingCurrency ?? null,
    policyDependencies: [] as string[],
    provenance: {
      sourceTables: ["journal_entries", "journal_lines", "ledger_accounts"],
      engineVersion: REPORTING_ENGINE_VERSION,
      generatedAt: input.asOf,
      linesFromSubstrate: rows.length,
    },
  };

  if (rows.length === 0) {
    return {
      ...base,
      lines: [],
      overallClass: "DATA_NOT_AVAILABLE",
      assurance: "NOT_APPLICABLE",
      authoritative: false,
      balanced: null,
      totalDebits: null,
      totalCredits: null,
      limitations: [
        "The general ledger contains no journal lines for this scope.",
        "Totals are null, NOT 0.00: a zero would assert a measured balance that was never observed.",
        "No trial balance can be produced until posting is authorised (P1) and entries exist.",
      ],
    };
  }

  // Mixed currencies cannot be summed into one column without a governed rate.
  const mixed = rows.some((r) => Number(r.currencies) > 1);

  const lines: ReportLine[] = rows.map((r) => ({
    caption: r.accountName ?? `(unmapped account ${r.accountId})`,
    accountCode: r.accountCode ?? null,
    debit: r.debit,
    credit: r.credit,
    balance: (Number(r.debit) - Number(r.credit)).toFixed(2),
    currency: r.currency,
    // Aggregating posted lines yields a DERIVED figure, not a POSTED one.
    epistemicClass: r.accountCode === null ? "DATA_CONFLICT" : "DERIVED",
    reason:
      r.accountCode === null
        ? `Journal lines reference account ${r.accountId}, which does not exist in the chart of accounts.`
        : null,
  }));

  const totalDebits = rows.reduce((s, r) => s + Number(r.debit), 0).toFixed(2);
  const totalCredits = rows.reduce((s, r) => s + Number(r.credit), 0).toFixed(2);
  const balanced = Number(totalDebits) === Number(totalCredits);

  const limitations: string[] = [];
  if (mixed) {
    limitations.push(
      "Multiple transaction currencies are present. Totals are arithmetic sums of mixed units and " +
        "are NOT meaningful without a governed FX rate (P4).",
    );
  }
  if (!balanced) {
    limitations.push(
      `Debits (${totalDebits}) do not equal credits (${totalCredits}). Database triggers enforce ` +
        "balance at write time, so this indicates data corruption, not an ordinary posting error.",
    );
  }

  return {
    ...base,
    lines: lines.sort((a, b) => (a.accountCode ?? "").localeCompare(b.accountCode ?? "")),
    overallClass: mixed ? "DATA_CONFLICT" : weakestClass(lines.map((l) => l.epistemicClass)),
    assurance: "UNAUDITED",
    authoritative: balanced && !mixed,
    balanced,
    totalDebits,
    totalCredits,
    policyDependencies: mixed ? ["P4"] : [],
    limitations,
  };
}

/**
 * Statement skeletons (balance sheet, P&L, cash flow, equity).
 *
 * Structurally honest: mapping accounts to captions requires a ratified classification policy, so
 * the engine returns the required shape with REQUIRES_AUTHORITY rather than guessing that
 * "account code starting 1 = asset". That guess is exactly how a wrong balance sheet gets built.
 */
export async function statement(input: {
  kind: Extract<ReportKind, "BALANCE_SHEET" | "INCOME_STATEMENT" | "CASH_FLOW" | "CHANGES_IN_EQUITY">;
  tenantId: string;
  legalEntityId?: string | null;
  asOf: string;
  reportingCurrency?: string;
}): Promise<FinancialReport> {
  const tb = await trialBalance({
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId,
    asOf: input.asOf,
    reportingCurrency: input.reportingCurrency,
  });

  const captions: Record<typeof input.kind, string[]> = {
    BALANCE_SHEET: ["Assets", "Liabilities", "Equity"],
    INCOME_STATEMENT: ["Revenue", "Cost of sales", "Operating expenses", "Profit for the period"],
    CASH_FLOW: ["Operating activities", "Investing activities", "Financing activities", "Net movement in cash"],
    CHANGES_IN_EQUITY: ["Opening equity", "Movements", "Closing equity"],
  };

  const lines: ReportLine[] = captions[input.kind].map((caption) => ({
    caption,
    accountCode: null,
    debit: null,
    credit: null,
    balance: null,
    currency: input.reportingCurrency ?? null,
    epistemicClass: "REQUIRES_AUTHORITY",
    reason:
      "Mapping ledger accounts to this caption requires a ratified account-classification policy (P1). " +
      "Inferring it from account codes would fabricate an accounting classification.",
  }));

  return {
    kind: input.kind,
    tenantId: input.tenantId,
    legalEntityId: input.legalEntityId ?? null,
    periodCode: null,
    asOf: input.asOf,
    reportingCurrency: input.reportingCurrency ?? null,
    lines,
    overallClass: "REQUIRES_AUTHORITY",
    assurance: "REQUIRES_AUTHORITY",
    authoritative: false,
    balanced: null,
    totalDebits: null,
    totalCredits: null,
    policyDependencies: ["P1"],
    provenance: {
      sourceTables: ["journal_entries", "journal_lines", "ledger_accounts"],
      engineVersion: REPORTING_ENGINE_VERSION,
      generatedAt: input.asOf,
      linesFromSubstrate: tb.provenance.linesFromSubstrate,
    },
    limitations: [
      `The ${input.kind} structure is defined, but no line can be populated.`,
      "Account-to-caption classification is an accounting-policy judgement (P1), unratified.",
      ...(tb.provenance.linesFromSubstrate === 0
        ? ["The underlying ledger is also empty, so no figures exist to classify."]
        : []),
    ],
  };
}

/**
 * Combines actuals with a projection, keeping the classes strictly separate.
 *
 * A variance between an actual and a forecast is itself a projection-dependent figure, so the
 * combined report can never be authoritative — which is the point: this is where a forecast most
 * easily launders itself into looking like an actual.
 */
export function composeActualVsProjection(input: {
  kind: Extract<ReportKind, "BUDGET_VS_ACTUAL" | "FORECAST_VS_ACTUAL">;
  tenantId: string;
  asOf: string;
  actualLines: ReportLine[];
  projectionLines: ReportLine[];
}): FinancialReport {
  // A projected line may never claim to be POSTED or OBSERVED.
  const projection: ReportLine[] = input.projectionLines.map((l) => ({
    ...l,
    epistemicClass:
      l.epistemicClass === "POSTED" || l.epistemicClass === "OBSERVED" ? "FORECAST" : l.epistemicClass,
    caption: `${l.caption} (projected)`,
  }));

  const lines = [...input.actualLines, ...projection];

  return {
    kind: input.kind,
    tenantId: input.tenantId,
    legalEntityId: null,
    periodCode: null,
    asOf: input.asOf,
    reportingCurrency: null,
    lines,
    overallClass: weakestClass(lines.map((l) => l.epistemicClass)),
    assurance: "UNAUDITED",
    // Never authoritative: it contains projections by construction.
    authoritative: false,
    balanced: null,
    totalDebits: null,
    totalCredits: null,
    policyDependencies: [],
    provenance: {
      sourceTables: ["journal_entries", "journal_lines", "forecast:derived"],
      engineVersion: REPORTING_ENGINE_VERSION,
      generatedAt: input.asOf,
      linesFromSubstrate: input.actualLines.length,
    },
    limitations: [
      "This report mixes actual and projected figures. Projected lines are labelled and can never " +
        "be POSTED or OBSERVED.",
      "Variances are projection-dependent and are not accounting truth.",
    ],
  };
}

/** Machine-checkable assertion that a report never presents a projection as truth. */
export function assertReportIntegrity(report: FinancialReport): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (report.authoritative) {
    const nonFactual = report.lines.filter(
      (l) => !["POSTED", "OBSERVED", "DERIVED"].includes(l.epistemicClass),
    );
    if (nonFactual.length > 0) {
      violations.push(
        `Report is marked authoritative but contains ${nonFactual.length} non-factual line(s): ` +
          nonFactual.map((l) => `${l.caption}=${l.epistemicClass}`).join(", "),
      );
    }
    if (report.overallClass === "FORECAST" || report.overallClass === "SCENARIO") {
      violations.push(`Report is marked authoritative but its overall class is ${report.overallClass}.`);
    }
  }

  for (const line of report.lines) {
    const nonValue = ["REQUIRES_AUTHORITY", "REQUIRES_POLICY", "DATA_NOT_AVAILABLE", "DATA_CONFLICT"];
    if (nonValue.includes(line.epistemicClass) && line.balance !== null) {
      violations.push(`Line '${line.caption}' is ${line.epistemicClass} but carries a balance.`);
    }
    if (nonValue.includes(line.epistemicClass) && line.reason === null) {
      violations.push(`Line '${line.caption}' is ${line.epistemicClass} but gives no reason.`);
    }
  }

  if (report.overallClass === "DATA_NOT_AVAILABLE" && report.totalDebits !== null) {
    violations.push("Report claims DATA_NOT_AVAILABLE but reports a total — a fabricated zero.");
  }

  return { valid: violations.length === 0, violations };
}
