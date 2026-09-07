/**
 * STATUS AXES AND THE ACCOUNTING GATE — program §6, §14, §16, §21, §55.
 *
 * The domain is default-deny: an unknown state has no legal successors, so a
 * typo or a new provider vocabulary produces a refusal rather than a free path
 * to POSTED. The gate is the same pure function the bridge and the review route
 * both call, so there is no way to be "approved" by one path and blocked by
 * another.
 */
import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_SUFFICIENT_TRUST,
  MATCH_CONFIDENCE_CEILING,
  MATCH_METHOD,
  TRUST_LEVEL,
  VERIFICATION_STATUS,
  assertReconciliationVocabularyAligned,
  assertTransition,
  defaultState,
  isLegalTransition,
  legalNextStates,
  evaluateAccountingGate,
  type GateInput,
} from "@/lib/payments/domain";
// The payment axis reuses the platform's reconciliation vocabulary verbatim rather
// than minting its own; importing it from its owner is how this test proves the
// reuse instead of restating it.
import { RECONCILIATION_STATUS } from "@/lib/finance/reconciliation";

const BASE: GateInput = {
  verificationStatus: "VERIFIED",
  trustLevel: "RECONCILED_BANK",
  reconciliationStatus: "RECONCILED",
  settlementStatus: "SETTLED",
  accountingStatus: "PREPARED",
  blockingExceptionCount: 0,
  hasAccountMapping: true,
  policyApproved: true,
  amountMinor: 250000,
  autoPostCeilingMinor: 0,
  requiresApproval: false,
  approved: false,
};

const gate = (patch: Partial<GateInput> = {}) => evaluateAccountingGate({ ...BASE, ...patch });

describe("status axes are independent and default-deny", () => {
  it("the five axes each have their own vocabulary and default", () => {
    expect(defaultState("VERIFICATION")).toBe("CANDIDATE");
    expect(defaultState("TRUST")).toBe("RAW");
    expect(defaultState("SETTLEMENT")).toBe("PENDING");
    expect(defaultState("ACCOUNTING")).toBe("NOT_PREPARED");
    // The platform's reconciliation vocabulary begins at RECONCILED, which is a
    // conclusion; the payment axis must therefore not default to it.
    expect(RECONCILIATION_STATUS[0]).toBe("RECONCILED");
    expect(defaultState("RECONCILIATION")).toBe("RECONCILIATION_REQUIRED");
    expect(defaultState("RECONCILIATION")).not.toBe(RECONCILIATION_STATUS[0]);
  });

  it("an authenticated message is not a corroborated row, and neither is a reconciled one posted", () => {
    expect(isLegalTransition("VERIFICATION", "CANDIDATE", "VERIFIED")).toBe(true);
    expect(isLegalTransition("TRUST", "RAW", "AUTHENTICATED")).toBe(true);
    // Corroboration requires authentication first: no jump from RAW to a
    // provider- or bank-confirmed level.
    expect(isLegalTransition("TRUST", "RAW", "VERIFIED_PROVIDER")).toBe(false);
    expect(isLegalTransition("TRUST", "RAW", "RECONCILED_BANK")).toBe(false);
    // Two independent corroborating sources, in either order, but CONFIRMED_MANUAL
    // is terminal: a human decision is the last word, and nothing un-decides it.
    expect(isLegalTransition("TRUST", "AUTHENTICATED", "RECONCILED_BANK")).toBe(true);
    expect(isLegalTransition("TRUST", "AUTHENTICATED", "VERIFIED_PROVIDER")).toBe(true);
    expect(legalNextStates("TRUST", "CONFIRMED_MANUAL")).toEqual([]);
    expect(TRUST_LEVEL.filter((t) => ACCOUNTING_SUFFICIENT_TRUST.includes(t))).toHaveLength(3);
  });

  it("unknown states have no successors at all", () => {
    expect(legalNextStates("TRUST", "TRUSTED_BY_ME")).toEqual([]);
    expect(legalNextStates("VERIFICATION", "")).toEqual([]);
    expect(isLegalTransition("VERIFICATION", "MYSTERY", "VERIFIED")).toBe(false);
    expect(() => assertTransition({ axis: "VERIFICATION", from: "MYSTERY", to: "VERIFIED" })).toThrowError(/not legal/);
  });

  it("a replayed transition is a no-op, not a fabricated state change", () => {
    const same = assertTransition({ axis: "SETTLEMENT", from: "SETTLED", to: "SETTLED" });
    expect(same.changed).toBe(false);
    const moved = assertTransition({ axis: "SETTLEMENT", from: "IN_SETTLEMENT", to: "SETTLED" });
    expect(moved.changed).toBe(true);
    // POSTED only unwinds by reversal.
    expect(isLegalTransition("ACCOUNTING", "POSTED", "REVERSED")).toBe(true);
    expect(isLegalTransition("ACCOUNTING", "POSTED", "PREPARED")).toBe(false);
  });

  it("reconciliation vocabulary stays aligned with the platform's, and the check is real", () => {
    const aligned = assertReconciliationVocabularyAligned();
    expect(aligned.aligned).toBe(true);
    expect(aligned.missing).toEqual([]);
    expect(aligned.extra).toEqual([]);
  });

  it("a fuzzy match can never reach the confidence of an exact one, and the ceilings are declared", () => {
    expect(MATCH_METHOD).toContain("FUZZY");
    expect(MATCH_CONFIDENCE_CEILING.FUZZY).toBeLessThan(MATCH_CONFIDENCE_CEILING.AMOUNT_ACCOUNT_EXACT);
    expect(MATCH_CONFIDENCE_CEILING.FUZZY).toBeLessThanOrEqual(0.75);
    for (const method of MATCH_METHOD) {
      expect(MATCH_CONFIDENCE_CEILING[method], method).toBeGreaterThan(0);
      expect(MATCH_CONFIDENCE_CEILING[method], method).toBeLessThanOrEqual(1);
    }
  });
});

describe("accounting gate is conjunctive and refuses on every missing control", () => {
  it("passes only when every control holds", () => {
    const ok = gate({ autoPostCeilingMinor: null, approved: true });
    expect(ok.blockers).toEqual([]);
    expect(ok.allowed).toBe(true);
  });

  it("blocks on each control individually", () => {
    expect(gate({ verificationStatus: "SUSPICIOUS" }).blockers).toContain("NOT_VERIFIED_BY_PROVIDER");
    expect(gate({ trustLevel: "AUTHENTICATED" }).blockers).toContain("TRUST_INSUFFICIENT");
    expect(gate({ reconciliationStatus: "RECONCILIATION_REQUIRED" }).blockers).toContain("NOT_INTERNALLY_RECONCILED");
    // A FAILED settlement blocks; an unsettled receipt does not, because accrual
    // recognition is a policy the CFO owns, not something this bridge may decide.
    expect(gate({ settlementStatus: "FAILED" }).blockers).toContain("SETTLEMENT_FAILED");
    expect(gate({ settlementStatus: "PENDING" }).blockers).not.toContain("SETTLEMENT_FAILED");
    expect(gate({ blockingExceptionCount: 2 }).blockers).toContain("BLOCKING_EXCEPTION_OPEN");
    expect(gate({ hasAccountMapping: false }).blockers).toContain("ACCOUNT_MAPPING_MISSING");
    expect(gate({ policyApproved: false }).blockers).toContain("ACCOUNTING_POLICY_MISSING");
    expect(gate({ amountMinor: 0 }).blockers).toContain("AMOUNT_NOT_POSITIVE");
    expect(gate({ accountingStatus: "REVERSED" }).blockers).toContain("ALREADY_REVERSED");
    expect(gate({ requiresApproval: true }).blockers).toContain("HUMAN_APPROVAL_REQUIRED");
  });

  it("an unreported ceiling means unlimited, so a fixture must set it to zero", () => {
    // This is the trap the sandbox fixture is written to avoid: `null` is not
    // "never auto-post", it is "no ceiling". A demo policy sets 0.
    expect(gate({ autoPostCeilingMinor: null }).blockers).not.toContain("ABOVE_AUTO_POST_CEILING");
    expect(gate({ autoPostCeilingMinor: 0 }).blockers).toContain("ABOVE_AUTO_POST_CEILING");
    expect(gate({ autoPostCeilingMinor: 0, approved: true }).blockers).not.toContain("ABOVE_AUTO_POST_CEILING");
  });

  it("reports the human-approval condition without deciding it", () => {
    expect(gate({ autoPostCeilingMinor: 1000, amountMinor: 250000 }).requiresHumanApproval).toBe(true);
    expect(gate({ autoPostCeilingMinor: 1000, amountMinor: 250000, approved: true }).allowed).toBe(true);
    expect(gate({ requiresApproval: true }).requiresHumanApproval).toBe(true);
  });
});
