/**
 * BEYU OS — Family Office protection: the claim ledger.
 *
 * A claim is the family office's OWNED RECORD of an insurance claim: what was
 * notified, what documents exist, what the insurer's decision was reported to
 * be, and what proceeds were received. The engine enforces the lifecycle in
 * §16 and the proceeds posture in §13, and nothing else:
 *
 *   - the engine does not adjudicate. APPROVED / DENIED / DISPUTED are recorded
 *     REPORTS of the insurer's decision, each citing the decision evidence
 *     document; the module has no adjudication rules to run (§37);
 *   - amounts are recorded, never imputed. A claim whose insurer amount has not
 *     arrived is reported as missing, not estimated;
 *   - proceeds are not cash until they are RECEIVED. The proceeds state machine
 *     is MONOTONIC: EXPECTED → CLAIMED → APPROVED → RECEIVED → ALLOCATED,
 *     forward-only, and each step requires its evidence. `ALLOCATED` records
 *     the family office's allocation REFERENCE; the movement of the money is
 *     Finance OS truth (§22).
 */

import {
  CLAIM_STATUSES,
  PROCEEDS_STATES,
  isIsoDate,
  type ClaimStatus,
  type ProceedsState,
} from "./types";

export type ClaimRecord = {
  id: string;
  policyId: string;
  claimReference: string;
  insuredRef: string;
  insurerRef: string;
  incidentDate: string;
  notificationDate: string | null;
  status: ClaimStatus;
  proceedsState: ProceedsState;
  /** Insurer-reported amount (minor units); null until the insurer says so. */
  approvedAmountMinor: number | null;
  /** Actually-received amount (minor units); null until a receipt exists. */
  receivedAmountMinor: number | null;
  currency: string;
  proceedsReceivedDate: string | null;
  allocationRef: string | null;
  decisionEvidenceRef: string | null;
  documentRefs: string[];
};

export type ClaimFinding = { rule: string; message: string };

export function validateClaimRecord(c: ClaimRecord): ClaimFinding[] {
  const f: ClaimFinding[] = [];
  if (!c.claimReference?.trim()) f.push({ rule: "REQUIRED", message: "A claim without the insurer's claim reference cannot be reconciled with the insurer." });
  if (!isIsoDate(c.incidentDate)) f.push({ rule: "DATE", message: "incidentDate must be an ISO calendar date." });
  if (c.notificationDate !== null) {
    if (!isIsoDate(c.notificationDate)) f.push({ rule: "DATE", message: "notificationDate must be an ISO calendar date or null." });
    else if (c.notificationDate < c.incidentDate) f.push({ rule: "DATE_ORDER", message: "A claim cannot be notified before the date of the incident." });
  }
  if (!CLAIM_STATUSES.includes(c.status)) f.push({ rule: "TAXONOMY", message: "Claim status is outside the controlled lifecycle." });
  if (!PROCEEDS_STATES.includes(c.proceedsState)) f.push({ rule: "TAXONOMY", message: "Proceeds state is outside the controlled set." });
  if (!/^[A-Z]{3}$/.test(c.currency)) f.push({ rule: "FORMAT", message: "A claim must carry the currency its amounts are denominated in." });
  if (c.approvedAmountMinor !== null && (!Number.isSafeInteger(c.approvedAmountMinor) || c.approvedAmountMinor < 0)) f.push({ rule: "MONEY", message: "approvedAmountMinor must be a non-negative integer in minor units, or null." });
  if (c.receivedAmountMinor !== null && (!Number.isSafeInteger(c.receivedAmountMinor) || c.receivedAmountMinor < 0)) f.push({ rule: "MONEY", message: "receivedAmountMinor must be a non-negative integer in minor units, or null." });
  if (c.approvedAmountMinor !== null && c.receivedAmountMinor !== null && c.receivedAmountMinor > c.approvedAmountMinor) {
    f.push({ rule: "AMOUNT_ORDER", message: "More received than approved is contradictory; correct one of the two against the insurer and bank records." });
  }
  if ((c.status === "APPROVED" || c.proceedsState === "APPROVED") && c.approvedAmountMinor === null) {
    f.push({ rule: "NO_FABRICATION", message: "An APPROVED claim reports the insurer's approved amount; the engine will not guess it." });
  }
  if (c.status === "DENIED" && c.decisionEvidenceRef === null) {
    f.push({ rule: "EVIDENCE", message: "A DENIED claim must cite the insurer's decision evidence." });
  }
  if ((c.proceedsState === "RECEIVED" || c.proceedsState === "ALLOCATED") && (c.receivedAmountMinor === null || c.proceedsReceivedDate === null)) {
    f.push({ rule: "RECEIPT", message: "Proceeds recorded RECEIVED carry the received amount and the receipt date." });
  }
  if (c.proceedsState === "ALLOCATED" && c.allocationRef === null) {
    f.push({ rule: "ALLOCATION_REF", message: "ALLOCATED records the Finance-side allocation reference; the reference, not a re-derived movement, is what this ledger may hold." });
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* Claim status machine                                                  */
/* ------------------------------------------------------------------ */

export const CLAIM_TRANSITIONS: Record<ClaimStatus, readonly ClaimStatus[]> = {
  CLAIM_OPENED: ["DOCUMENTATION_PENDING", "UNDER_REVIEW", "CLOSED"],
  DOCUMENTATION_PENDING: ["UNDER_REVIEW", "SUBMITTED", "CLOSED"],
  UNDER_REVIEW: ["SUBMITTED", "CLOSED"],
  SUBMITTED: ["INSURER_REVIEW", "CLOSED"],
  INSURER_REVIEW: ["APPROVED", "DENIED", "DISPUTED"],
  APPROVED: ["PROCEEDS_PENDING"],
  DENIED: ["DISPUTED", "CLOSED"],
  DISPUTED: ["INSURER_REVIEW", "APPROVED", "DENIED", "CLOSED"],
  PROCEEDS_PENDING: ["PROCEEDS_RECEIVED"],
  PROCEEDS_RECEIVED: ["ALLOCATED"],
  ALLOCATED: ["CLOSED"],
  CLOSED: [],
} as const;

/**
 * Validate one proposed claim transition. `evidenceRef` is required at exactly
 * the steps where the fact being recorded comes from OUTSIDE this system —
 * insurer decisions and receipts — because those are the steps a fabrication
 * would otherwise survive.
 */
export function canTransitionClaim(
  from: ClaimStatus,
  to: ClaimStatus,
  opts: {
    evidenceRef: string | null;
    approvedAmountMinor: number | null;
    receivedAmountMinor: number | null;
    receivedDate: string | null;
    allocationRef: string | null;
    actorType: "HUMAN" | "SERVICE" | "AI";
  },
): ClaimFinding[] {
  const f: ClaimFinding[] = [];
  if (!CLAIM_TRANSITIONS[from].includes(to)) {
    f.push({ rule: "LIFECYCLE", message: `A claim recorded ${from} cannot transition to ${to}. History is corrected by a new transition from the true state, citing the insurer record.` });
    return f;
  }
  if (opts.actorType === "AI") {
    f.push({ rule: "HUMAN_AUTHORITY", message: "An AI actor may prepare and summarize, but a claim transition is recorded by a human (§27)." });
  }
  if (to === "APPROVED" || to === "DENIED") {
    if (opts.evidenceRef === null) f.push({ rule: "EVIDENCE", message: `${to} records the insurer's decision and must cite the decision document; the engine never decides claims.` });
    if (to === "APPROVED" && opts.approvedAmountMinor === null) f.push({ rule: "NO_FABRICATION", message: "Recording an APPROVED decision without the insurer's stated amount would fabricate the amount; record the decision and the amount together." });
  }
  if (to === "PROCEEDS_PENDING" && opts.approvedAmountMinor === null) {
    f.push({ rule: "NO_FABRICATION", message: "Proceeds can only be expected against a recorded approved amount." });
  }
  if (to === "PROCEEDS_RECEIVED") {
    if (opts.receivedAmountMinor === null) f.push({ rule: "RECEIPT_AMOUNT", message: "Receipt of proceeds is a financial fact recorded with its amount; without one the row would be an assertion of cash." });
    if (opts.receivedDate === null || !isIsoDate(opts.receivedDate)) f.push({ rule: "RECEIPT_DATE", message: "The receipt date is required the moment proceeds are recorded RECEIVED." });
  }
  if (to === "ALLOCATED" && opts.allocationRef === null) {
    f.push({ rule: "ALLOCATION_REF", message: "Allocation is recorded as the Finance-side reference this ledger points at — not as money moved here." });
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* Proceeds state machine (§13) — monotonic, forward-only                */
/* ------------------------------------------------------------------ */

export function validateProceedsAdvance(from: ProceedsState, to: ProceedsState): ClaimFinding[] {
  const f: ClaimFinding[] = [];
  // The catalogue ITSELF is the order: types.ts declares NONE → EXPECTED →
  // CLAIMED → APPROVED → RECEIVED → ALLOCATED, and the monotonic rule reads
  // that declaration rather than a second copy of it that could drift.
  const fi = PROCEEDS_STATES.indexOf(from);
  const ti = PROCEEDS_STATES.indexOf(to);
  if (ti !== fi + 1) {
    f.push({ rule: "PROCEEDS_MONOTONIC", message: `Proceeds advance strictly NONE → EXPECTED → CLAIMED → APPROVED → RECEIVED → ALLOCATED; ${from} → ${to} is refused. A skipped step is either a real skipped step (record it) or a mis-mapped one (fix the record).` });
  }
  return f;
}

/** The single predicate that keeps contingency out of cash: what COUNTS as received money. */
export function proceedsCountAsCash(state: ProceedsState): boolean {
  return state === "RECEIVED" || state === "ALLOCATED";
}

/** Buckets that are contingent: expected to exist, not yet existing as cash. */
export function proceedsAreContingent(state: ProceedsState): boolean {
  return state === "EXPECTED" || state === "CLAIMED" || state === "APPROVED";
}
