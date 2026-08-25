/**
 * BEYU OS — FAMILY LOAN OFFICE ENGINE (pure).
 *
 * A first-class capability INSIDE the Family Office. It is NOT a separate Loan
 * OS, NOT a bank, and NOT an uncontrolled family cash-transfer mechanism.
 *
 * ============================ THE CENTRAL RULE =============================
 *
 *     FAMILY LOANS MUST NEVER BE UNDOCUMENTED TRANSFERS.
 *
 * `assertLoanDocumented` throws unless all seventeen loan disciplines are
 * recorded. There is no "informal" family loan in this model, and no code path
 * that represents one.
 *
 * ============================== WHAT IT IS NOT ==============================
 *
 * Not a lender of record and not a ledger. Disbursement and repayment are
 * financial consequences recorded by Finance OS; a loan record here references
 * the journal entries it produced, it never substitutes for them. Interest
 * accrual is computed here as TERMS, and the accounting classification of that
 * accrual is Finance OS's, recorded in `accountingTreatment`.
 *
 * ============================ ARITHMETIC CONVENTION =========================
 *
 * Money is integer minor units throughout, matching the waterfall engine. Rates
 * are basis points per annum. Schedules are deterministic: the same inputs
 * always produce the same instalments, and the rounding remainder is carried to
 * the final instalment so the schedule always sums exactly to principal plus
 * interest.
 */
import {
  BORROWER_CLASSES,
  LOAN_DISCIPLINE_FIELDS,
  LOAN_STATUSES,
  LOAN_TYPES,
  assertHumanAuthority,
  assertIsoDate,
  FamilyInstitutionError,
  isPresent,
  type BorrowerClass,
  type FamilyActorType,
  type LoanStatus,
  type LoanType,
  type PolicyDecisionRequirement,
} from "./model";

export const FAMILY_LOAN_ENGINE_VERSION = "family-loan-1.0.0";

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

/**
 * Permitted status transitions. Anything not listed here is refused.
 *
 * Terminal states are terminal: a CLOSED loan cannot be reopened, and a forgiven
 * loan cannot be un-forgiven. Corrections are new governed actions, never edits.
 */
export const LOAN_TRANSITIONS: Record<LoanStatus, LoanStatus[]> = {
  DRAFT: ["SUBMITTED", "REJECTED"],
  SUBMITTED: ["UNDER_ASSESSMENT", "REJECTED"],
  UNDER_ASSESSMENT: ["APPROVED", "REJECTED"],
  APPROVED: ["DOCUMENTED", "REJECTED"],
  DOCUMENTED: ["DISBURSED"],
  DISBURSED: ["REPAYING"],
  REPAYING: ["RESTRUCTURED", "REFINANCED", "IN_DEFAULT", "FORGIVEN", "CLOSED"],
  RESTRUCTURED: ["REPAYING", "IN_DEFAULT", "CLOSED"],
  REFINANCED: ["CLOSED"],
  IN_DEFAULT: ["IN_RECOVERY", "RESTRUCTURED", "FORGIVEN", "CLOSED"],
  IN_RECOVERY: ["REPAYING", "FORGIVEN", "CLOSED"],
  FORGIVEN: ["CLOSED"],
  CLOSED: [],
  REJECTED: [],
};

export const TERMINAL_LOAN_STATUSES: LoanStatus[] = ["CLOSED", "REJECTED"];

export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
  if (!LOAN_STATUSES.includes(from) || !LOAN_STATUSES.includes(to)) return false;
  return LOAN_TRANSITIONS[from].includes(to);
}

export function assertLoanTransition(from: LoanStatus, to: LoanStatus): void {
  if (!canTransition(from, to)) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      `A family loan cannot move from ${from} to ${to}. Permitted: ${LOAN_TRANSITIONS[from].join(", ") || "(none — terminal state)"}.`,
      { from, to },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Loan record                                                         */
/* ------------------------------------------------------------------ */

export type FamilyLoan = {
  loanId: string;
  loanType: LoanType;
  borrowerClass: BorrowerClass;
  borrowerId: string;
  lenderEntityId: string;
  amountMinor: number;
  currency: string;
  purpose: string | null;
  annualRateBps: number;
  tenorMonths: number;
  repaymentTerms: string | null;
  collateral: string | null;
  guarantor: string | null;
  authorityReference: string | null;
  approvalReference: string | null;
  legalDocumentation: string | null;
  taxTreatment: string | null;
  accountingTreatment: string | null;
  status: LoanStatus;
  auditTrailReference: string | null;
  /** Journal entries Finance OS produced for this loan. */
  journalEntryReferences: string[];
  disbursedAt: string | null;
  jurisdictionCode: string;
};

export type LoanDocumentationAssessment = {
  engineVersion: string;
  loanId: string;
  documented: boolean;
  missing: string[];
  reason: string;
  policyDecisionRequired: PolicyDecisionRequirement | null;
};

/**
 * The seventeen loan disciplines.
 *
 * Note that `collateral` and `guarantor` may legitimately be "NONE" for an
 * unsecured loan — but "NONE" is a recorded decision, not an absence. An
 * unrecorded collateral position is indistinguishable from an undocumented
 * transfer, which is precisely what this engine exists to prevent.
 */
export function assessLoanDocumentation(loan: FamilyLoan): LoanDocumentationAssessment {
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  const record: Record<string, unknown> = {
    lender: loan.lenderEntityId,
    borrower: loan.borrowerId,
    amount: loan.amountMinor > 0 ? loan.amountMinor : null,
    currency: loan.currency,
    purpose: loan.purpose,
    interest: Number.isFinite(loan.annualRateBps) && loan.annualRateBps >= 0 ? loan.annualRateBps : null,
    tenor: loan.tenorMonths > 0 ? loan.tenorMonths : null,
    repayment: loan.repaymentTerms,
    collateral: loan.collateral,
    guarantor: loan.guarantor,
    authority: loan.authorityReference,
    approval: loan.approvalReference,
    legalDocumentation: loan.legalDocumentation,
    taxTreatment: loan.taxTreatment,
    accountingTreatment: loan.accountingTreatment,
    status: loan.status,
    auditTrail: loan.auditTrailReference,
  };

  const missing: string[] = LOAN_DISCIPLINE_FIELDS.filter((f) => !isPresent(record[f]));

  if (!LOAN_TYPES.includes(loan.loanType)) missing.push("loanType(unknown)");
  if (!BORROWER_CLASSES.includes(loan.borrowerClass)) missing.push("borrowerClass(unknown)");
  if (!LOAN_STATUSES.includes(loan.status)) missing.push("status(unknown)");
  if (!isPresent(loan.jurisdictionCode)) missing.push("jurisdictionCode");

  // An interest rate of zero is a policy question, not an error — but it must be
  // an explicit one, because a below-market family loan has tax consequences in
  // most jurisdictions.
  if (loan.annualRateBps === 0 && !isPresent(loan.taxTreatment)) {
    policyDecisionRequired = {
      code: `FAM-PD-LOAN-IMPUTED-${loan.loanId}`,
      issue: "Whether a zero-interest family loan is permitted, and how imputed interest is treated.",
      domain: "FAMILY_CAPITAL",
      options: [
        "Require a market-rate loan in every case.",
        "Permit concessional rates with imputed-interest treatment recorded for tax.",
        "Permit zero-interest loans only for education and emergency purposes.",
      ],
      assumptions: ["A zero rate was requested.", "No tax treatment was recorded."],
      legalImplications:
        "Below-market loans between related parties can be recharacterised as distributions or gifts under many jurisdictions' law.",
      taxImplications:
        "Imputed interest may be taxable to the lender and deductible or taxable to the borrower depending on jurisdiction and purpose.",
      financialImplications: "A concessional loan is a transfer of value and must be measured as one.",
      risk: "Related-party abuse and undisclosed wealth transfer.",
      decisionAuthority: "Family Loan Committee recommendation, Family Council approval, on tax advice per jurisdiction.",
      status: "OPEN",
      decision: null,
      decisionReference: null,
      effectiveDate: null,
    };
  }

  return {
    engineVersion: FAMILY_LOAN_ENGINE_VERSION,
    loanId: loan.loanId,
    documented: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? `Loan ${loan.loanId} records all ${LOAN_DISCIPLINE_FIELDS.length} disciplines.`
        : `Loan ${loan.loanId} is NOT a documented loan — missing: ${missing.join(", ")}. It must not be disbursed.`,
    policyDecisionRequired,
  };
}

/** Refuse an undocumented family loan. Always. */
export function assertLoanDocumented(loan: FamilyLoan): void {
  const assessment = assessLoanDocumentation(loan);
  if (!assessment.documented) {
    throw new FamilyInstitutionError(
      "UNDOCUMENTED_TRANSFER",
      assessment.reason,
      { loanId: loan.loanId, missing: assessment.missing },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

export type LoanEligibilityInput = {
  loanId: string;
  borrowerClass: BorrowerClass;
  /** For ELIGIBLE_DESCENDANT: the lineage engine's determination. */
  directDescendant: boolean | null;
  /** For AUTHORIZED_FAMILY_MEMBER: the governance reference authorising them. */
  memberAuthorisationReference: string | null;
  /** For APPROVED_FAMILY_VENTURE / APPROVED_STRATEGIC_PROJECT: approval reference. */
  approvalReference: string | null;
  /** For FAMILY_CONTROLLED_ENTITY: evidence of control. */
  controlEvidenceReference: string | null;
  /** Credit and affordability inputs. Null means not assessed. */
  creditAssessment: { score: number; assessedByReference: string | null } | null;
  affordability: { affordable: boolean; basis: string | null } | null;
};

export type LoanEligibility = {
  engineVersion: string;
  loanId: string;
  eligible: boolean;
  borrowerClass: BorrowerClass;
  blockers: string[];
  basis: string[];
  policyDecisionRequired: PolicyDecisionRequirement | null;
};

/**
 * Borrower eligibility.
 *
 * Only five classes may borrow. A borrower outside them is refused rather than
 * reclassified, because "the family lent to someone" without a class is exactly
 * the undocumented transfer the Loan Office exists to prevent.
 */
export function assessLoanEligibility(input: LoanEligibilityInput): LoanEligibility {
  const blockers: string[] = [];
  const basis: string[] = [];
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  switch (input.borrowerClass) {
    case "ELIGIBLE_DESCENDANT":
      if (input.directDescendant === null) {
        blockers.push("Direct-descendant status was not determined; eligibility cannot be presumed.");
      } else if (!input.directDescendant) {
        blockers.push("The borrower is not a verified direct descendant.");
      } else {
        basis.push("The borrower is a verified direct descendant of the family line.");
      }
      break;
    case "AUTHORIZED_FAMILY_MEMBER":
      if (!isPresent(input.memberAuthorisationReference)) {
        blockers.push(
          "No governance reference authorises this family member to borrow. Family membership alone does not confer borrowing rights.",
        );
      } else {
        basis.push(`Authorised under ${input.memberAuthorisationReference}.`);
      }
      break;
    case "APPROVED_FAMILY_VENTURE":
    case "APPROVED_STRATEGIC_PROJECT":
      if (!isPresent(input.approvalReference)) {
        blockers.push(`No approval reference for this ${input.borrowerClass === "APPROVED_FAMILY_VENTURE" ? "venture" : "project"}.`);
      } else {
        basis.push(`Approved under ${input.approvalReference}.`);
      }
      break;
    case "FAMILY_CONTROLLED_ENTITY":
      if (!isPresent(input.controlEvidenceReference)) {
        blockers.push("No evidence of family control was recorded for this entity.");
      } else {
        basis.push(`Control evidenced by ${input.controlEvidenceReference}.`);
      }
      break;
    default:
      blockers.push(`${String(input.borrowerClass)} is not a permitted borrower class.`);
  }

  if (!input.creditAssessment) {
    blockers.push("No credit assessment recorded.");
  } else if (!isPresent(input.creditAssessment.assessedByReference)) {
    blockers.push("The credit assessment has no assessing reference.");
  } else {
    basis.push(`Credit assessed at ${input.creditAssessment.score} under ${input.creditAssessment.assessedByReference}.`);
  }

  if (!input.affordability) {
    blockers.push("No affordability assessment recorded.");
  } else if (!input.affordability.affordable) {
    blockers.push(`Affordability assessment is negative: ${input.affordability.basis ?? "no basis recorded"}.`);
  } else {
    basis.push(`Affordability: ${input.affordability.basis ?? "recorded as affordable"}.`);
  }

  return {
    engineVersion: FAMILY_LOAN_ENGINE_VERSION,
    loanId: input.loanId,
    eligible: blockers.length === 0,
    borrowerClass: input.borrowerClass,
    blockers,
    basis,
    policyDecisionRequired,
  };
}

/* ------------------------------------------------------------------ */
/* Repayment schedule                                                  */
/* ------------------------------------------------------------------ */

export type ScheduleInput = {
  principalMinor: number;
  annualRateBps: number;
  tenorMonths: number;
  /** Instalments per year. 12 monthly, 4 quarterly, 2 semi-annual, 1 annual. */
  frequencyPerYear: 1 | 2 | 4 | 12;
};

export type Instalment = {
  /** 1-based instalment number. */
  n: number;
  principalMinor: number;
  interestMinor: number;
  totalMinor: number;
  /** Outstanding principal AFTER this instalment. Zero on the final instalment. */
  balanceAfterMinor: number;
};

export type RepaymentSchedule = {
  engineVersion: string;
  instalments: Instalment[];
  totalPrincipalMinor: number;
  totalInterestMinor: number;
  totalRepayableMinor: number;
  /** True when the schedule sums exactly to principal plus interest. Always true. */
  reconciles: boolean;
  convention: string;
};

const FREQUENCY_LABEL: Record<number, string> = { 12: "monthly", 4: "quarterly", 2: "semi-annual", 1: "annual" };

/**
 * Straight-line principal amortisation with interest on the opening balance.
 *
 * Integer minor units throughout, matching the waterfall engine's convention
 * (`src/lib/waterfall.ts` performs all arithmetic in integer minor units to
 * eliminate floating-point drift). tsconfig targets ES2017, so BigInt literals
 * are unavailable — the same constraint `src/lib/specialist/audit/engines.ts`
 * documents — and minor-unit integers stay exact within Number.MAX_SAFE_INTEGER.
 *
 * Per-period interest is `balance * annualRateBps / (10000 * frequencyPerYear)`,
 * truncated toward zero. The principal rounding remainder is carried to the final
 * instalment so the schedule repays exactly the principal borrowed, and
 * `reconciles` asserts that it did.
 *
 * This convention is stated rather than hidden because two conventions produce
 * different final instalments, and a family loan schedule is legal
 * documentation.
 */
export function buildRepaymentSchedule(input: ScheduleInput): RepaymentSchedule {
  if (!Number.isInteger(input.principalMinor) || input.principalMinor <= 0) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      "Principal must be a positive integer number of minor units.",
    );
  }
  if (!Number.isInteger(input.annualRateBps) || input.annualRateBps < 0) {
    throw new FamilyInstitutionError("RULE_VIOLATION", "Annual rate must be a non-negative integer number of basis points.");
  }
  if (!Number.isInteger(input.tenorMonths) || input.tenorMonths <= 0) {
    throw new FamilyInstitutionError("RULE_VIOLATION", "Tenor must be a positive integer number of months.");
  }
  if (input.tenorMonths % (12 / input.frequencyPerYear) !== 0) {
    throw new FamilyInstitutionError(
      "RULE_VIOLATION",
      `Tenor of ${input.tenorMonths} months is not a whole number of ${FREQUENCY_LABEL[input.frequencyPerYear]} periods.`,
    );
  }

  const periods = (input.tenorMonths * input.frequencyPerYear) / 12;
  const principalPerPeriod = Math.floor(input.principalMinor / periods);
  const principalRemainder = input.principalMinor - principalPerPeriod * periods;
  const rateDenominator = 10_000 * input.frequencyPerYear;

  const instalments: Instalment[] = [];
  let balance = input.principalMinor;
  let totalInterest = 0;

  for (let n = 1; n <= periods; n += 1) {
    // Truncate toward zero: interest is never rounded up in the borrower's
    // disfavour by this schedule, and the truncation is disclosed in `convention`.
    const interest = Math.trunc((balance * input.annualRateBps) / rateDenominator);
    // The principal rounding remainder goes to the final instalment so the
    // schedule repays exactly the principal borrowed.
    const principal = n === periods ? principalPerPeriod + principalRemainder : principalPerPeriod;

    balance -= principal;
    totalInterest += interest;

    instalments.push({
      n,
      principalMinor: principal,
      interestMinor: interest,
      totalMinor: principal + interest,
      balanceAfterMinor: balance,
    });
  }

  const totalPrincipal = instalments.reduce((s, i) => s + i.principalMinor, 0);
  const totalRepayable = instalments.reduce((s, i) => s + i.totalMinor, 0);

  return {
    engineVersion: FAMILY_LOAN_ENGINE_VERSION,
    instalments,
    totalPrincipalMinor: totalPrincipal,
    totalInterestMinor: totalInterest,
    totalRepayableMinor: totalRepayable,
    reconciles: totalPrincipal === input.principalMinor && totalRepayable === totalPrincipal + totalInterest,
    convention:
      `Straight-line principal amortisation with interest on the opening balance, ` +
      `${FREQUENCY_LABEL[input.frequencyPerYear]} instalments, integer minor units, ` +
      `interest truncated per period, principal rounding remainder on the final instalment.`,
  };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export const LOAN_EVENT_TYPES = [
  "APPLIED",
  "KYC_COMPLETED",
  "ELIGIBILITY_DETERMINED",
  "CREDIT_ASSESSED",
  "AFFORDABILITY_ASSESSED",
  "PURPOSE_VALIDATED",
  "RISK_ASSESSED",
  "APPROVED",
  "REJECTED",
  "DOCUMENTED",
  "DISBURSED",
  "INSTALMENT_RECEIVED",
  "MISSED_INSTALMENT",
  "RESTRUCTURED",
  "REFINANCED",
  "DEFAULTED",
  "RECOVERY_ACTION",
  "FORGIVEN",
  "CLOSED",
] as const;
export type LoanEventType = (typeof LOAN_EVENT_TYPES)[number];

export type LoanEvent = {
  eventId: string;
  loanId: string;
  type: LoanEventType;
  occurredAt: string;
  actorType: FamilyActorType;
  actorReference: string;
  /** Finance OS journal reference, where the event had a financial consequence. */
  journalReference: string | null;
  detail: string;
};

/**
 * Every loan event is auditable, and disbursement/recovery events must cite the
 * Finance OS journal entry they produced.
 *
 * A disbursement with no journal reference is an undocumented transfer by
 * another name, and is refused.
 */
export function assertLoanEventSound(event: LoanEvent): void {
  assertIsoDate(event.occurredAt.slice(0, 10), `event ${event.eventId} date`);
  if (event.actorType === "AI") {
    throw new FamilyInstitutionError(
      "AI_AUTHORITY_REFUSED",
      `Noelia may not record a ${event.type} loan event. Loan actions are executed and recorded by accountable humans.`,
      { eventId: event.eventId },
    );
  }
  const REQUIRES_JOURNAL: LoanEventType[] = ["DISBURSED", "INSTALMENT_RECEIVED", "RECOVERY_ACTION", "FORGIVEN"];
  if (REQUIRES_JOURNAL.includes(event.type) && !isPresent(event.journalReference)) {
    throw new FamilyInstitutionError(
      "UNDOCUMENTED_TRANSFER",
      `A ${event.type} event must reference the Finance OS journal entry it produced. Without it the movement of value is undocumented.`,
      { eventId: event.eventId, type: event.type },
    );
  }
  if (!isPresent(event.detail)) {
    throw new FamilyInstitutionError("RULE_VIOLATION", `Loan event ${event.eventId} has no detail recorded.`);
  }
}

/* ------------------------------------------------------------------ */
/* Portfolio reporting                                                 */
/* ------------------------------------------------------------------ */

/**
 * Loan portfolio summary for reporting.
 *
 * Counts and minor-unit totals only. Borrower identities are HIGHLY_RESTRICTED
 * and are never included in a portfolio roll-up, because a family loan portfolio
 * is small enough that aggregates identify individuals.
 */
export function summariseLoanPortfolio(loans: readonly FamilyLoan[]): {
  engineVersion: string;
  count: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  outstandingPrincipalMinor: number;
  undocumentedCount: number;
  /** Loan ids that are undocumented and must not be disbursed. */
  undocumentedLoanIds: string[];
} {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let outstandingPrincipalMinor = 0;
  const undocumentedLoanIds: string[] = [];

  const OUTSTANDING: LoanStatus[] = ["DISBURSED", "REPAYING", "RESTRUCTURED", "IN_DEFAULT", "IN_RECOVERY"];

  for (const loan of loans) {
    byStatus[loan.status] = (byStatus[loan.status] ?? 0) + 1;
    byType[loan.loanType] = (byType[loan.loanType] ?? 0) + 1;
    if (OUTSTANDING.includes(loan.status)) outstandingPrincipalMinor += loan.amountMinor;
    if (!assessLoanDocumentation(loan).documented) undocumentedLoanIds.push(loan.loanId);
  }

  return {
    engineVersion: FAMILY_LOAN_ENGINE_VERSION,
    count: loans.length,
    byStatus,
    byType,
    outstandingPrincipalMinor,
    undocumentedCount: undocumentedLoanIds.length,
    undocumentedLoanIds: undocumentedLoanIds.sort(),
  };
}

/** Loan records may never be written by an AI actor. */
export function assertLoanWriteIsHuman(actorType: FamilyActorType, operation: string): void {
  assertHumanAuthority(actorType, operation);
}
