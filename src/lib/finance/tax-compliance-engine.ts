/**
 * FINANCE_OS — effective-dated tax compliance obligation planner.
 *
 * Dates are statutory/calendar candidates, not a TRA filing confirmation.
 * It deliberately does not apply weekend/public-holiday adjustments, extensions,
 * or taxpayer-specific concessions without authenticated rules and specialist review.
 */
export type TaxObligationKind =
  | "VAT_RETURN_AND_PAYMENT" | "VAT_WITHHOLDING_PAYMENT" | "VAT_WITHHOLDING_STATEMENT"
  | "PAYE_REMITTANCE" | "INCOME_TAX_WITHHOLDING_REMITTANCE"
  | "CORPORATE_PROVISIONAL_INSTALMENT" | "CORPORATE_FINAL_RETURN"
  | "INDIVIDUAL_FINAL_RETURN" | "PRESUMPTIVE_RETURN" | "CUSTOMS_ENTRY_REVIEW";

export type TaxComplianceObligation = {
  id: string;
  kind: TaxObligationKind;
  jurisdictionCode: "TZ_MAINLAND";
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountTzs: number | null;
  status: "PLANNED_UNCONFIRMED";
  authorityRefs: string[];
  evidenceRequired: string[];
  warnings: string[];
  calendarAdjustmentRequired: true;
};

function iso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function addDays(value: string, days: number): string {
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonths(value: string, months: number): string {
  const [y, m, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}
function monthBounds(start: string, end: string): boolean {
  const a = new Date(`${start}T00:00:00.000Z`);
  const b = new Date(`${end}T00:00:00.000Z`);
  return a.getUTCDate() === 1 && a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    b.getUTCDate() === new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Build a due-date candidate only for a period whose boundaries are validated. */
export function buildTaxComplianceObligations(input: {
  taxType: "VAT" | "VAT_WITHHOLDING" | "PAYE" | "WITHHOLDING_TAX" | "CORPORATE_INCOME_TAX" | "PERSONAL_INCOME_TAX" | "PRESUMPTIVE_INCOME_TAX";
  periodStart: string;
  periodEnd: string;
  amountTzs?: number | null;
  presumptiveTaxThresholdExceeded?: boolean;
}): TaxComplianceObligation[] {
  if (!iso(input.periodStart) || !iso(input.periodEnd) || input.periodEnd < input.periodStart) {
    throw new Error("A valid ordered ISO tax period is required.");
  }
  const year = input.periodEnd.slice(0, 4);
  const monthly = ["VAT", "VAT_WITHHOLDING", "PAYE", "WITHHOLDING_TAX"].includes(input.taxType);
  if (monthly && !monthBounds(input.periodStart, input.periodEnd)) {
    throw new Error("Monthly obligations require one complete calendar month.");
  }
  const make = (kind: TaxObligationKind, dueDate: string, refs: string[], evidence: string[]): TaxComplianceObligation => ({
    id: `${kind}:${input.periodStart}:${input.periodEnd}`,
    kind, jurisdictionCode: "TZ_MAINLAND", periodStart: input.periodStart, periodEnd: input.periodEnd,
    dueDate, amountTzs: input.amountTzs ?? null, status: "PLANNED_UNCONFIRMED",
    authorityRefs: refs, evidenceRequired: evidence,
    warnings: ["Confirm current TRA portal form, taxpayer registration, extensions, weekends and public holidays before relying on this date."],
    calendarAdjustmentRequired: true,
  });
  const nextMonth = addMonths(input.periodEnd, 1);
  switch (input.taxType) {
    case "VAT":
      return [make("VAT_RETURN_AND_PAYMENT", `${nextMonth.slice(0, 7)}-20`, ["TRA_VAT_GUIDE"], ["Sales and purchase ledgers", "Tax invoices", "Input-credit evidence", "Payment confirmation"] )];
    case "VAT_WITHHOLDING":
      return [
        make("VAT_WITHHOLDING_PAYMENT", addDays(input.periodEnd, 10), ["TZ_FINANCE_ACT_2_2026_S95"], ["Withholding-agent appointment", "Supplier tax invoices", "Withholding ledger", "Payment confirmation"]),
        make("VAT_WITHHOLDING_STATEMENT", `${nextMonth.slice(0, 7)}-10`, ["TZ_FINANCE_ACT_2_2026_S95"], ["Supplier schedule", "Withholding certificates", "Filed statement acknowledgement"]),
      ];
    case "PAYE":
      return [make("PAYE_REMITTANCE", `${nextMonth.slice(0, 7)}-07`, ["INCOME_TAX_ACT_S109", "TRA_PAYE_GUIDE"], ["Payroll register", "PAYE computation", "Payment confirmation"] )];
    case "WITHHOLDING_TAX":
      return [make("INCOME_TAX_WITHHOLDING_REMITTANCE", `${nextMonth.slice(0, 7)}-07`, ["INCOME_TAX_ACT_S105_S106", "TRA_WHT_GUIDE"], ["Payment vouchers", "Withholding certificates", "Payee TIN/residency evidence", "Payment confirmation"] )];
    case "CORPORATE_INCOME_TAX":
      return [
        ...["03-31", "06-30", "09-30", "12-31"].map((date, index) => make("CORPORATE_PROVISIONAL_INSTALMENT", `${year}-${date}`, ["INCOME_TAX_ACT_S88"], ["Provisional income estimate", "Instalment computation", "Payment evidence"])),
        make("CORPORATE_FINAL_RETURN", addMonths(input.periodEnd, 6), ["INCOME_TAX_ACT_S90", "TRA_CORPORATION_GUIDE"], ["Audited financial statements where required", "Tax reconciliation", "Final return and payment evidence"]),
      ];
    case "PERSONAL_INCOME_TAX":
      return [make("INDIVIDUAL_FINAL_RETURN", addMonths(input.periodEnd, 6), ["INCOME_TAX_ACT_S91", "TRA_INDIVIDUAL_GUIDE"], ["Income schedules", "Allowable deduction evidence", "Withholding certificates", "Final return acknowledgement"] )];
    case "PRESUMPTIVE_INCOME_TAX":
      if (input.presumptiveTaxThresholdExceeded === false) return [];
      return ["03-31", "06-30", "09-30", "12-31"].map((date, index) =>
        make("PRESUMPTIVE_RETURN", `${year}-${date}`, ["INCOME_TAX_ACT_FIRST_SCHEDULE", "TRA_INDIVIDUAL_GUIDE"], ["Turnover ledger", "Presumptive tax computation", "Payment evidence"])
      );
  }
}
