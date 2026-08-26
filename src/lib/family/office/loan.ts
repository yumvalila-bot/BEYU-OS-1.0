/**
 * BEYU OS — Family Office: loan engineering.
 *
 * The loan RAILS: references to loans, and the loan-terms MECHANISM.
 *
 * HARD BOUNDARIES:
 *   - the Family Office NEVER stores a loan book, ledger, balance, or
 *     payment schedule — loans live in the FINANCE OS;
 *   - loan TERMS (interest rate, term, eligibility, covenants, security,
 *     repayment) are POLICY — the engine accepts a RATIFIED
 *     LoanTermsRule and validates a proposed loan against it;
 *   - no interest rate, term, or eligibility is ever a default here.
 *
 * A proposed loan with no ratified terms → POLICY_DECISION_REQUIRED.
 * A proposed loan violating a ratified term → DENIED with the exact term
 * named. The engine performs the comparison; it never invents the term.
 */

import { familyError } from "../phase3/errors";
import { validateLoanInstruction, type FamilyLoanInstruction } from "../phase3/contracts";
import { isIsoDate, type EffectivePeriod } from "./types";
import type { OfficeOutcome } from "./types";
import type { PolicyRegistry } from "./policy";
import { resolvePolicy } from "./policy";

/** Reference to a loan in the Finance OS (the sole financial truth). */
export interface LoanReference {
  loanRef: string;
  /** The Finance OS loan reference (the truth — balances, payments, etc.). */
  financeLoanRef: string;
  borrowerRef: string;
  lenderRef: string;
  tenantId: string;
}

export function assertLoanReference(l: LoanReference): void {
  if (typeof l.financeLoanRef !== "string" || l.financeLoanRef.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "A loan reference must point at the Finance OS loan. The office never stores a loan book.", []);
  }
}

/**
 * A RATIFIED loan terms rule (configuration, carried by the ratification).
 * Every field is a bound the ratified policy sets — no field has a default.
 */
export interface LoanTermsRule {
  ruleRef: string;
  policyKey: string;
  /** Interest rate bounds (inclusive). Both required — no default. */
  interestRateMin: number;
  interestRateMax: number;
  /** Term bounds in days (inclusive). Both required — no default. */
  termDaysMin: number;
  termDaysMax: number;
  /** The borrower contexts the rule applies to. A borrower not listed is NOT covered. */
  eligibleContexts: readonly string[];
  /** Security required (a reference to the ratified security policy, or null if the rule says "none required" — but that's still a ratified statement). */
  securityRef: string | null;
}

export function assertLoanTermsRule(r: LoanTermsRule): void {
  if (!Number.isFinite(r.interestRateMin) || !Number.isFinite(r.interestRateMax) || r.interestRateMin > r.interestRateMax) {
    throw familyError("POLICY_INVENTION_REFUSED", `Loan terms rule ${r.ruleRef}: invalid interest rate bounds (${r.interestRateMin}..${r.interestRateMax}).`, []);
  }
  if (!Number.isFinite(r.termDaysMin) || !Number.isFinite(r.termDaysMax) || r.termDaysMin <= 0 || r.termDaysMin > r.termDaysMax) {
    throw familyError("POLICY_INVENTION_REFUSED", `Loan terms rule ${r.ruleRef}: invalid term bounds (${r.termDaysMin}..${r.termDaysMax}).`, []);
  }
  if (r.eligibleContexts.length === 0) {
    throw familyError("POLICY_INVENTION_REFUSED", `Loan terms rule ${r.ruleRef}: an empty eligibility list is a decision, not a mechanism.`, []);
  }
}

export interface ProposedLoan {
  proposedLoanRef: string;
  borrowerRef: string;
  /** The borrower's eligibility context key (the rule's domain). */
  borrowerContextKey: string;
  proposedInterestRate: number;
  proposedTermDays: number;
  securityRef: string | null;
  tenantId: string;
}

/**
 * Validate a PROPOSED loan against a RATIFIED terms rule.
 *
 *   - no rule → POLICY_DECISION_REQUIRED (no loan terms exist to check);
 *   - borrower context not in the rule → DENIED (the rule does not cover
 *     this borrower; absence of coverage is not coverage);
 *   - rate/term out of the ratified bounds → DENIED with the exact bound;
 *   - security mismatch → DENIED;
 *   - all in bounds → RESOLVED (proceed to the Finance OS for the actual
 *     loan record — the office never creates it).
 */
export function validateProposedLoan(
  rule: LoanTermsRule | null,
  proposed: ProposedLoan,
): OfficeOutcome<{ ok: true; borrowerRef: string; financeHandoffRequired: true }> {
  if (rule === null) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: "loan.terms",
      reason: "No ratified loan terms. A proposed loan with no ratified terms is not approvable — missing terms are never a default (no 0%, no standard term).",
    };
  }
  assertLoanTermsRule(rule);
  if (!rule.eligibleContexts.includes(proposed.borrowerContextKey)) {
    return {
      state: "DENIED",
      code: "AUTHORITY_UNPROVEN",
      reason: `Ratified loan terms ${rule.ruleRef} do not cover borrower context "${proposed.borrowerContextKey}". Absence of coverage is not coverage.`,
    };
  }
  if (proposed.proposedInterestRate < rule.interestRateMin || proposed.proposedInterestRate > rule.interestRateMax) {
    return {
      state: "DENIED",
      code: "POLICY_DECISION_REQUIRED",
      reason: `Proposed rate ${proposed.proposedInterestRate} is outside the ratified bounds [${rule.interestRateMin}, ${rule.interestRateMax}] for ${rule.ruleRef}.`,
    };
  }
  if (proposed.proposedTermDays < rule.termDaysMin || proposed.proposedTermDays > rule.termDaysMax) {
    return {
      state: "DENIED",
      code: "POLICY_DECISION_REQUIRED",
      reason: `Proposed term ${proposed.proposedTermDays}d is outside the ratified bounds [${rule.termDaysMin}, ${rule.termDaysMax}] for ${rule.ruleRef}.`,
    };
  }
  if (rule.securityRef !== null && rule.securityRef !== proposed.securityRef) {
    return {
      state: "DENIED",
      code: "AUTHORITY_UNPROVEN",
      reason: `Ratified security requirement ${rule.securityRef} is not satisfied by proposed security ${String(proposed.securityRef)}.`,
    };
  }
  return { state: "RESOLVED", value: { ok: true, borrowerRef: proposed.borrowerRef, financeHandoffRequired: true } };
}

/**
 * Full loan proposal assessment: the canonical Phase 3A loan-instruction
 * contract FIRST (FIR-018 boundary, human actor, terms source docs,
 * approval refs — any violation is DENIED with the exact code), THEN the
 * ratified terms rule (POLICY_DECISION_REQUIRED if absent; DENIED if
 * violated). The composition is the mechanism; neither half invents the
 * other's part.
 */
export function assessLoanInstruction(
  registry: PolicyRegistry,
  instruction: FamilyLoanInstruction,
  termsRule: LoanTermsRule | null,
  asOf: string,
): OfficeOutcome<{ ok: true; instructionId: string; financeRef: string | null }> {
  const contractCheck = validateLoanInstruction(instruction);
  if (!contractCheck.ok) {
    const violations = contractCheck.violations;
    return {
      state: "DENIED",
      code: violations[0].code,
      reason: violations.map((v) => `${v.field}: ${v.reason}`).join(" | "),
    };
  }
  const value = contractCheck.value;
  for (const p of value.policyRefs) {
    const resolved = resolvePolicy<Record<string, unknown>>(registry, p.policyId, asOf);
    if (resolved.state !== "RESOLVED") {
      return {
        state: "POLICY_DECISION_REQUIRED",
        policyKey: p.policyId,
        reason: `Loan instruction ${value.id} cites policy ${p.policyId}@${p.policyVersion}, which is not resolved at ${asOf}: ${resolved.reason}.`,
      };
    }
  }
  // Terms assessment: the instruction's borrower context must be covered by
  // the ratified rule. The instruction itself carries no numbers to check
  // (that's Finance's record) — the rule's coverage + terms source docs are
  // the checkable surface here.
  if (termsRule === null) {
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey: "loan.terms",
      reason: `Loan instruction ${value.id} passes the contract, but no ratified loan terms exist for borrower context "${value.borrowerPartyId}". Missing terms are never a default.`,
    };
  }
  if (!termsRule.eligibleContexts.includes(value.borrowerPartyId)) {
    return {
      state: "DENIED",
      code: "AUTHORITY_UNPROVEN",
      reason: `Ratified loan terms ${termsRule.ruleRef} do not cover borrower context "${value.borrowerPartyId}". Absence of coverage is not coverage.`,
    };
  }
  return { state: "RESOLVED", value: { ok: true, instructionId: value.id, financeRef: value.financeRef } };
}

/** Pull a LoanTermsRule from the policy registry (ratified, or absent). */
export function loanTermsRuleFromRegistry(
  registry: PolicyRegistry,
  policyKey: string,
  asOf: string,
): LoanTermsRule | null {
  const outcome = resolvePolicy<{ interestRateMin: number; interestRateMax: number; termDaysMin: number; termDaysMax: number; eligibleContexts: string[]; securityRef: string | null }>(
    registry,
    policyKey,
    asOf,
  );
  if (outcome.state !== "RESOLVED") return null;
  const get = (k: string): unknown => outcome.parameters.find((p) => p.key === k)?.value;
  const rateMin = get("interestRateMin");
  const rateMax = get("interestRateMax");
  const termMin = get("termDaysMin");
  const termMax = get("termDaysMax");
  const contexts = get("eligibleContexts");
  const security = get("securityRef");
  if (
    typeof rateMin !== "number" ||
    typeof rateMax !== "number" ||
    typeof termMin !== "number" ||
    typeof termMax !== "number" ||
    !Array.isArray(contexts)
  ) {
    return null;
  }
  const rule: LoanTermsRule = {
    ruleRef: `${policyKey}@v${outcome.version}`,
    policyKey,
    interestRateMin: rateMin,
    interestRateMax: rateMax,
    termDaysMin: termMin,
    termDaysMax: termMax,
    eligibleContexts: contexts as string[],
    securityRef: typeof security === "string" ? security : null,
  };
  assertLoanTermsRule(rule);
  return rule;
}

export interface LoanStatusRecord {
  loanRef: string;
  /** The Finance OS loan status this record mirrors (reference, not state). */
  financeStatusRef: string;
  status: "PROPOSED" | "APPROVED" | "ACTIVE" | "COMPLETED" | "DEFAULTED" | "REVOKED";
  period: EffectivePeriod | null;
  tenantId: string;
}

export function assertLoanStatusRecord(r: LoanStatusRecord): void {
  if (typeof r.financeStatusRef !== "string" || r.financeStatusRef.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "A loan status record references the Finance OS status; it never stores loan state.", []);
  }
  if (r.period !== null && !isIsoDate(r.period.effectiveFrom)) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Loan status period must start at an ISO date.", []);
  }
}
