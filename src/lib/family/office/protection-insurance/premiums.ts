/**
 * BEYU OS — Family Office protection: premium obligation tracking.
 *
 * A premium schedule is a RECURRING OBLIGATION the family owes, recorded so
 * the liquidity plan can see it. It is deliberately NOT a payment record in
 * the accounting sense: this module never marks money as moved. If a posting is
 * ever required, it flows through Finance OS's existing controlled pathways
 * (§22); `finance_record_ref` is the pointer where Finance decides to record
 * one, and CAP_POSTING is never invoked from here.
 *
 * OVERDUE is a READ-TIME derivation (`effectiveStatus`), never a stored
 * mutation: flipping rows on a schedule would be this module automatically
 * modifying records, which §14 forbids.
 */

import { isIsoDate, type PremiumFrequency, type PremiumStatus, type EffectivePremiumStatus } from "./types";

export type PremiumRecord = {
  id: string;
  policyId: string;
  dueDate: string;
  amountMinor: number;
  currency: string;
  frequency: PremiumFrequency;
  status: PremiumStatus;
  payerRef: string | null;
  paidDate: string | null;
  paymentEvidenceDocumentRef: string | null;
  financeRecordRef: string | null;
  notes: string | null;
};

export const PREMIUM_FINDINGS_PREFIX = "premium";

export function validatePremiumRecord(p: PremiumRecord): string[] {
  const findings: string[] = [];
  if (!Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0) findings.push(`${PREMIUM_FINDINGS_PREFIX}.amountMinor: a premium row is a positive integer in minor units.`);
  if (!isIsoDate(p.dueDate)) findings.push(`${PREMIUM_FINDINGS_PREFIX}.dueDate: must be an ISO calendar date.`);
  if (!/^[A-Z]{3}$/.test(p.currency)) findings.push(`${PREMIUM_FINDINGS_PREFIX}.currency: ISO 4217 code required.`);
  if (!["SCHEDULED", "PAID", "WAIVED", "VOID"].includes(p.status)) findings.push(`${PREMIUM_FINDINGS_PREFIX}.status: outside the controlled premium status set.`);
  if (p.status === "PAID" && p.paidDate === null) findings.push(`${PREMIUM_FINDINGS_PREFIX}.paidDate: a PAID row records the date it was recorded as paid; the payment itself is Finance's truth, not this row's.`);
  if (p.status === "PAID" && p.paymentEvidenceDocumentRef === null) findings.push(`${PREMIUM_FINDINGS_PREFIX}.paymentEvidenceDocumentRef: PAID requires the evidence reference (receipt or statement) that makes the claim checkable.`);
  // An early paidDate is normal (paid ahead of due) and never a finding; only
  // its shape is checked, because a malformed date would poison every read.
  if (p.paidDate !== null && !isIsoDate(p.paidDate)) findings.push(`${PREMIUM_FINDINGS_PREFIX}.paidDate: must be an ISO calendar date or null.`);
  return findings;
}

/**
 * The premium's status AT A DATE without touching storage. A SCHEDULED row past
 * its due date reads OVERDUE; a PAID row is never re-labelled.
 */
export function effectivePremiumStatus(p: PremiumRecord, asOf: string): EffectivePremiumStatus {
  if (p.status === "SCHEDULED" && p.dueDate < asOf) return "OVERDUE";
  return p.status;
}

/**
 * Annual premium obligation in minor units — deterministic integer arithmetic.
 *
 * `SINGLE` contributes zero to the RECURRING obligation (it is one
 * transactional amount recorded as a scheduled row); the annualization multiplies
 * the per-period figure and never rounds, because the per-period figure is
 * stored in exact minor units.
 */
export const PREMIUM_ANNUALIZATION: Record<PremiumFrequency, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMI_ANNUAL: 2,
  ANNUAL: 1,
  SINGLE: 0,
};

export function annualPremiumObligationMinor(amountMinor: number, frequency: PremiumFrequency): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return 0;
  const perYear = amountMinor * PREMIUM_ANNUALIZATION[frequency];
  if (!Number.isSafeInteger(perYear)) {
    throw new RangeError("Annualized premium obligation exceeds the safe integer range in minor units.");
  }
  return perYear;
}

/**
 * Premium obligations within a forward window (for liquidity planning).
 * Returns rows sorted by due date; no aggregation across currencies —
 * per-currency sums are the caller's only permitted rollup (§15 cross-currency
 * rule inherited from the capital domain).
 */
export function premiumsDueWithin(rows: readonly PremiumRecord[], fromIso: string, toIsoExclusive: string): PremiumRecord[] {
  return rows
    .filter((r) => r.status === "SCHEDULED" && r.dueDate >= fromIso && r.dueDate < toIsoExclusive)
    .slice()
    .sort((a, b) => (a.dueDate === b.dueDate ? a.id.localeCompare(b.id) : a.dueDate < b.dueDate ? -1 : 1));
}

export function sumPremiumsByCurrency(rows: readonly PremiumRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.currency] = (out[r.currency] ?? 0) + r.amountMinor;
  return out;
}
