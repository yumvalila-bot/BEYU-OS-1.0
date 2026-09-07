/**
 * Payment domain model: four independent status axes, each with a default-deny
 * transition table, plus the single gate that decides whether money may reach
 * accounting.
 *
 * WHY FOUR AXES AND NOT ONE `status`
 *   A payment can be simultaneously VERIFIED by the provider, UNMATCHED against
 *   any internal obligation, PENDING settlement, and NOT_PREPARED for accounting.
 *   A single status column forces those to overwrite each other, and the first
 *   thing that goes is the distinction between "the provider said so" and "we
 *   have proved it internally". The platform already refuses that collapse —
 *   `src/lib/finance/reconciliation.ts` reports a comparison without adjusting
 *   anything — so this module reuses `RECONCILIATION_STATUS` verbatim instead of
 *   minting a payment-specific synonym for it.
 *
 * DEFAULT DENY
 *   Like `WORKFLOW_TRANSITIONS` in `src/lib/finance/workflow.ts`, a transition
 *   that is absent from the table is illegal. A new state can therefore never be
 *   reached by omission. Terminal states have empty lists, not special cases.
 *
 * THE ACCOUNTING GATE
 *   `mayAttemptPosting()` encodes one rule: a provider's claim is never
 *   accounting truth. Reaching accounting requires verified provider evidence,
 *   an internal reconciliation (or an explicit human confirmation), and no
 *   blocking exception. Even then the write goes through `postJournal()` and
 *   `CAP_POSTING`, which this module neither grants nor bypasses.
 */

import { RECONCILIATION_STATUS } from "../finance/reconciliation";

export const PAYMENT_DOMAIN_VERSION = "payment-domain-1.1.0";

/* ---------------------------- axis catalogues ---------------------------- */

export const VERIFICATION_STATUS = ["CANDIDATE", "UNTRUSTED", "VERIFIED", "SUSPICIOUS", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export const TRUST_LEVEL = [
  "RAW",
  "AUTHENTICATED",
  "VERIFIED_PROVIDER",
  "RECONCILED_BANK",
  "CONFIRMED_MANUAL",
] as const;
export type TrustLevel = (typeof TRUST_LEVEL)[number];

/** Order matters: reconciliation or explicit human confirmation clears the gate. */
export const TRUST_RANK: Record<TrustLevel, number> = {
  RAW: 0,
  AUTHENTICATED: 1,
  VERIFIED_PROVIDER: 2,
  RECONCILED_BANK: 3,
  CONFIRMED_MANUAL: 3,
};

/** Sufficient trust for accounting: a second, independent source or a human decision. */
export const ACCOUNTING_SUFFICIENT_TRUST: readonly TrustLevel[] = ["VERIFIED_PROVIDER", "RECONCILED_BANK", "CONFIRMED_MANUAL"];

export const SETTLEMENT_STATUS = ["PENDING", "IN_SETTLEMENT", "SETTLED", "FAILED", "NOT_APPLICABLE"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUS)[number];

export const ACCOUNTING_STATUS = [
  "NOT_PREPARED",
  "POLICY_MISSING",
  "PREPARED",
  "READY",
  "POSTED",
  "POSTING_FAILED",
  "REVERSED",
] as const;
export type AccountingStatus = (typeof ACCOUNTING_STATUS)[number];

export const TRANSACTION_TYPE = [
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER",
  "PAYMENT",
  "REFUND",
  "REVERSAL",
  "FEE",
  "SETTLEMENT_ADJUSTMENT",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPE)[number];

export const DIRECTION = ["INBOUND", "OUTBOUND"] as const;
export type Direction = (typeof DIRECTION)[number];

export const TRANSACTION_SOURCE = ["PROVIDER_WEBHOOK", "PROVIDER_POLL", "STATEMENT_FILE", "MANUAL_GOVERNED"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCE)[number];

export const MATCH_METHOD = [
  "EXACT_REFERENCE",
  "EXACT_IDEMPOTENCY",
  "AMOUNT_ACCOUNT_EXACT",
  "AMOUNT_DATE_WINDOW",
  "INVOICE_REFERENCE",
  "COUNTERPARTY_DIGEST",
  "FUZZY",
] as const;
export type MatchMethod = (typeof MATCH_METHOD)[number];

/**
 * Confidence each method may claim, and therefore whether it can ever be
 * sufficient on its own. A method that is not exact cannot reach 1.000, and a
 * FUZZY match is capped below any sane `confidence_floor`, which is how
 * "fuzzy matching must never become unquestioned truth" is enforced rather
 * than merely promised.
 */
export const MATCH_CONFIDENCE_CEILING: Record<MatchMethod, number> = {
  EXACT_REFERENCE: 1.0,
  EXACT_IDEMPOTENCY: 1.0,
  AMOUNT_ACCOUNT_EXACT: 0.995,
  AMOUNT_DATE_WINDOW: 0.95,
  INVOICE_REFERENCE: 1.0,
  COUNTERPARTY_DIGEST: 0.9,
  FUZZY: 0.75,
};

export const MATCHING_METHODS = MATCH_METHOD;

export type StatusAxis = "VERIFICATION" | "TRUST" | "RECONCILIATION" | "SETTLEMENT" | "ACCOUNTING";

/* --------------------------- transition tables --------------------------- */

const VERIFICATION_TRANSITIONS: Record<VerificationStatus, readonly VerificationStatus[]> = {
  CANDIDATE: ["UNTRUSTED", "VERIFIED", "SUSPICIOUS", "REJECTED"],
  UNTRUSTED: ["CANDIDATE", "SUSPICIOUS", "REJECTED"],
  VERIFIED: ["SUSPICIOUS", "REJECTED"],
  SUSPICIOUS: ["VERIFIED", "UNTRUSTED", "REJECTED"],
  REJECTED: [],
};

const TRUST_TRANSITIONS: Record<TrustLevel, readonly TrustLevel[]> = {
  RAW: ["AUTHENTICATED"],
  // VERIFIED_PROVIDER (the provider's own status endpoint confirmed the row) and
  // RECONCILED_BANK (a settlement batch plus the bank credit confirmed it) are two
  // INDEPENDENT corroborating sources, not a mandatory sequence: a bank artefact is
  // not weaker than a provider artefact, and a settlement arriving before anyone
  // polled a status endpoint must not be forced to distrust the bank. Both edges
  // therefore leave AUTHENTICATED, and neither can be reached from RAW —
  // authentication of the message is still the precondition for any corroboration.
  AUTHENTICATED: ["VERIFIED_PROVIDER", "RECONCILED_BANK", "RAW"],
  VERIFIED_PROVIDER: ["RECONCILED_BANK", "CONFIRMED_MANUAL", "AUTHENTICATED"],
  RECONCILED_BANK: ["VERIFIED_PROVIDER", "CONFIRMED_MANUAL"],
  CONFIRMED_MANUAL: [],
};

const RECONCILIATION_TRANSITIONS: Record<string, readonly string[]> = {
  RECONCILIATION_REQUIRED: ["RECONCILED", "ATTRIBUTION_CONFLICT", "DATA_CONFLICT", "REQUIRES_AUTHORITY", "DATA_NOT_AVAILABLE"],
  DATA_NOT_AVAILABLE: ["RECONCILIATION_REQUIRED", "DATA_CONFLICT", "REQUIRES_AUTHORITY"],
  ATTRIBUTION_CONFLICT: ["RECONCILIATION_REQUIRED", "DATA_CONFLICT", "REQUIRES_AUTHORITY"],
  DATA_CONFLICT: ["RECONCILIATION_REQUIRED", "ATTRIBUTION_CONFLICT", "REQUIRES_AUTHORITY"],
  REQUIRES_AUTHORITY: ["RECONCILIATION_REQUIRED", "DATA_CONFLICT"],
  RECONCILED: ["DATA_CONFLICT", "ATTRIBUTION_CONFLICT"],
};

const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, readonly SettlementStatus[]> = {
  PENDING: ["IN_SETTLEMENT", "NOT_APPLICABLE", "FAILED"],
  IN_SETTLEMENT: ["SETTLED", "FAILED", "PENDING"],
  SETTLED: ["FAILED"],
  FAILED: ["PENDING", "IN_SETTLEMENT"],
  NOT_APPLICABLE: [],
};

const ACCOUNTING_TRANSITIONS: Record<AccountingStatus, readonly AccountingStatus[]> = {
  NOT_PREPARED: ["POLICY_MISSING", "PREPARED"],
  POLICY_MISSING: ["PREPARED", "NOT_PREPARED"],
  PREPARED: ["READY", "POLICY_MISSING", "POSTING_FAILED"],
  READY: ["POSTED", "POSTING_FAILED", "PREPARED"],
  POSTED: ["REVERSED"],
  POSTING_FAILED: ["PREPARED", "READY"],
  REVERSED: [],
};

const TRANSITIONS: Record<StatusAxis, Record<string, readonly string[]>> = {
  VERIFICATION: VERIFICATION_TRANSITIONS,
  TRUST: TRUST_TRANSITIONS,
  RECONCILIATION: RECONCILIATION_TRANSITIONS,
  SETTLEMENT: SETTLEMENT_TRANSITIONS,
  ACCOUNTING: ACCOUNTING_TRANSITIONS,
};

export class PaymentTransitionError extends Error {
  readonly code = "ILLEGAL_STATE_TRANSITION";
  constructor(
    readonly axis: StatusAxis,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${axis} transition ${from} -> ${to} is not legal. Legal from "${from}": ${legalNextStates(axis, from).join(", ") || "(terminal state)"}.`);
    this.name = "PaymentTransitionError";
  }
}

export function legalNextStates(axis: StatusAxis, from: string): readonly string[] {
  return TRANSITIONS[axis][from] ?? [];
}

/** Pure, default-deny check. `from === to` is a no-op, not an error, so an idempotent replay never fabricates a transition. */
export function isLegalTransition(axis: StatusAxis, from: string, to: string): boolean {
  if (from === to) return true;
  return legalNextStates(axis, from).includes(to);
}

export function assertTransition(input: {
  axis: StatusAxis;
  from: string | null | undefined;
  to: string;
}): { changed: boolean; from: string; to: string } {
  const from = input.from ?? defaultState(input.axis);
  if (!isLegalTransition(input.axis, from, input.to)) throw new PaymentTransitionError(input.axis, from, input.to);
  return { changed: from !== input.to, from, to: input.to };
}

export function defaultState(axis: StatusAxis): string {
  switch (axis) {
    case "VERIFICATION":
      return "CANDIDATE";
    case "TRUST":
      return "RAW";
    case "RECONCILIATION":
      // The platform vocabulary starts at RECONCILED, which is a conclusion and
      // therefore can never be a default. The DB column default is the same.
      return "RECONCILIATION_REQUIRED";
    case "SETTLEMENT":
      return "PENDING";
    case "ACCOUNTING":
      return "NOT_PREPARED";
  }
  return neverAxis(axis);
}

function neverAxis(axis: never): never {
  throw new Error(`Unhandled status axis: ${axis}`);
}

/** Every axis the pipeline may drive, for exhaustive testing. */
export const STATUS_AXES: readonly StatusAxis[] = ["VERIFICATION", "TRUST", "RECONCILIATION", "SETTLEMENT", "ACCOUNTING"];

/** The reconciled vocabulary, re-exported so callers never retype it. */
export const RECONCILIATION_VOCABULARY: readonly string[] = RECONCILIATION_STATUS;

export function isReconciliationStatus(value: unknown): value is (typeof RECONCILIATION_STATUS)[number] {
  return typeof value === "string" && (RECONCILIATION_STATUS as readonly string[]).includes(value);
}

/**
 * Structural self-check, mirroring `assertIncompatibilitySymmetry()` in
 * `workflow.ts`: the transition table must cover the shared vocabulary exactly,
 * with no orphan state and no invented one. If Finance OS ever adds a status,
 * this fails loudly instead of silently default-denying the new state.
 */
export function assertReconciliationVocabularyAligned(): { aligned: boolean; missing: string[]; extra: string[] } {
  const keys = Object.keys(RECONCILIATION_TRANSITIONS);
  const missing = RECONCILIATION_STATUS.filter((s) => !keys.includes(s));
  const extra = keys.filter((k) => !(RECONCILIATION_STATUS as readonly string[]).includes(k));
  return { aligned: missing.length === 0 && extra.length === 0, missing, extra };
}

/* ------------------------------ the gate -------------------------------- */

export type GateInput = {
  verificationStatus: VerificationStatus;
  trustLevel: TrustLevel;
  reconciliationStatus: string;
  settlementStatus: SettlementStatus;
  accountingStatus: AccountingStatus;
  blockingExceptionCount: number;
  hasAccountMapping: boolean;
  policyApproved: boolean;
  amountMinor: number;
  autoPostCeilingMinor: number | null;
  requiresApproval: boolean;
  approved: boolean;
};

export type GateDecision = {
  allowed: boolean;
  /** Stable reason codes; the first blocker wins so behaviour is deterministic. */
  blockers: string[];
  requiresHumanApproval: boolean;
};

/**
 * The single place that decides whether a payment transaction may be presented
 * to the ledger. Note what it does NOT do: it does not check CAP_POSTING (the
 * posting engine's job, step 1 of 8), does not check RBAC, and does not create
 * an accounting policy. `hasAccountMapping === false` is a stop, not a guess.
 */
export function evaluateAccountingGate(input: GateInput): GateDecision {
  const blockers: string[] = [];
  if (input.verificationStatus !== "VERIFIED") blockers.push("NOT_VERIFIED_BY_PROVIDER");
  if (TRUST_RANK[input.trustLevel] < TRUST_RANK.VERIFIED_PROVIDER) blockers.push("TRUST_INSUFFICIENT");
  if (input.reconciliationStatus !== "RECONCILED") blockers.push("NOT_INTERNALLY_RECONCILED");
  if (input.settlementStatus === "FAILED") blockers.push("SETTLEMENT_FAILED");
  if (input.blockingExceptionCount > 0) blockers.push("BLOCKING_EXCEPTION_OPEN");
  if (!input.hasAccountMapping) blockers.push("ACCOUNT_MAPPING_MISSING");
  if (!input.policyApproved) blockers.push("ACCOUNTING_POLICY_MISSING");
  if (input.amountMinor <= 0) blockers.push("AMOUNT_NOT_POSITIVE");
  if (
    input.autoPostCeilingMinor !== null &&
    input.amountMinor > input.autoPostCeilingMinor &&
    !input.approved
  ) {
    blockers.push("ABOVE_AUTO_POST_CEILING");
  }
  if (input.requiresApproval && !input.approved) blockers.push("HUMAN_APPROVAL_REQUIRED");
  if (input.accountingStatus === "REVERSED") blockers.push("ALREADY_REVERSED");

  return {
    allowed: blockers.length === 0,
    blockers,
    requiresHumanApproval:
      (input.autoPostCeilingMinor !== null && input.amountMinor > input.autoPostCeilingMinor) ||
      input.requiresApproval,
  };
}

/* --------------------------- input validation --------------------------- */

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/+#-]{0,127}$/;

/** Provider-supplied identifiers are allowed into a digest and a column, not into SQL or a path. */
export function isSafeExternalRef(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value);
}

export function assertSafeExternalRef(value: unknown, label: string): string {
  if (!isSafeExternalRef(value)) {
    throw new Error(`${label} must match ${SAFE_TOKEN} — got an unusable value (type ${typeof value}).`);
  }
  return value;
}

const CURRENCY_TOKEN = /^[A-Z]{3}$/;

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && CURRENCY_TOKEN.test(value);
}

/** Never echo a provider's free-text name into a report unmarked. */
export function describeUntrustedText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^\P{C}\n]/gu, "").slice(0, max);
}
