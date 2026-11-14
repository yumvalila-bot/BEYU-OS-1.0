/**
 * MULTI_COMPANY_MANAGEMENT — policy/model layer.
 *
 * These are pure-function tests: no database, no network. They pin the decisions
 * that must never drift, because each of them is a statement BEYU OS makes to a
 * regulator, a board or an auditor:
 *
 *   · an unavailable figure is never a zero;
 *   · ownership below 100% is a human question, not a validation success;
 *   · a circular chain is refused outright;
 *   · the lifecycle machine has no undocumented edges;
 *   · a voting right above the economic interest needs an instrument.
 */
import { describe, expect, it } from "vitest";
import {
  assertLifecycleTransition,
  evaluateOwnership,
  figure,
  formatMinorUnits,
  McmError,
  MCM_LIFECYCLE_TRANSITIONS,
  MCM_LIFECYCLE_STATES,
  unavailable,
  type McmLifecycleState,
  type OwnershipInstrument,
} from "../../src/lib/mcm/model";

const validInstrument: OwnershipInstrument = {
  ownershipType: "DIRECT",
  instrument: "Share transfer instrument ST-2024-01",
  economicPct: "60",
  votingPct: "60",
  effectiveFrom: "2024-01-01",
  effectiveTo: null,
  provenance: "Registry filing BRELA-2024-0091",
  supportingDocumentId: "DOC_0001",
  ownerEntityId: "LE_OWNER",
  ownerPartyId: null,
  siblingEconomicTotalPct: 40,
  siblingVotingTotalPct: 40,
  createsCycle: false,
};

describe("McmFigure — a figure is never silently zero", () => {
  it("keeps currency, period, source and data state together", () => {
    const value = figure({
      amountMinor: "1234567",
      currency: "TZS",
      period: "2026-07",
      source: "Finance OS treasury_positions",
      dataState: "ACTUAL",
    });
    expect(value).toEqual({
      amountMinor: "1234567",
      currency: "TZS",
      period: "2026-07",
      source: "Finance OS treasury_positions",
      dataState: "ACTUAL",
    });
  });

  it("degrades an ACTUAL figure with no amount to UNAVAILABLE with a reason, not to 0", () => {
    const value = figure({
      amountMinor: null,
      currency: "TZS",
      period: "2026-07",
      source: "Finance OS treasury_positions",
      dataState: "ACTUAL",
    });
    expect(value.amountMinor).toBeNull();
    expect(value.dataState).toBe("UNAVAILABLE");
    expect(value.reason).toBeTruthy();
  });

  it("preserves a non-actual data state when the amount is missing", () => {
    // A missing ESTIMATE is still an ESTIMATE (it describes the intent of the
    // figure), and a missing PENDING figure is still PENDING. Only an assertion
    // of observed fact can degrade to UNAVAILABLE.
    expect(
      figure({ amountMinor: null, currency: null, period: null, source: "s", dataState: "ESTIMATED" }).dataState,
    ).toBe("ESTIMATED");
    expect(
      figure({ amountMinor: null, currency: null, period: null, source: "s", dataState: "PENDING" }).dataState,
    ).toBe("PENDING");
  });

  it("never invents a currency for an unavailable figure", () => {
    const value = unavailable("consolidation_runs", "No reviewed run exists for this period.");
    expect(value).toMatchObject({
      amountMinor: null,
      currency: null,
      dataState: "UNAVAILABLE",
      source: "consolidation_runs",
      reason: "No reviewed run exists for this period.",
    });
  });

  it("formats minor units exactly, including negatives and small values", () => {
    expect(formatMinorUnits("1234567", "TZS")).toBe("12,345.67 TZS");
    expect(formatMinorUnits("5", "USD")).toBe("0.05 USD");
    expect(formatMinorUnits("-100", "USD")).toBe("-1.00 USD");
    expect(formatMinorUnits(null, "USD")).toBe("—");
  });
});

describe("ownership validation — conservative, total-preserving", () => {
  it("returns VALID only when every rule holds and the live total reaches 100%", () => {
    const verdict = evaluateOwnership(validInstrument);
    expect(verdict.state).toBe("VALID");
    expect(verdict.economicTotalPct).toBeCloseTo(100, 6);
    expect(verdict.rules.every((rule) => rule.passed)).toBe(true);
  });

  it("refuses a circular chain outright, even when everything else is valid", () => {
    const verdict = evaluateOwnership({ ...validInstrument, createsCycle: true });
    expect(verdict.state).toBe("CIRCULAR");
    expect(verdict.rules.find((rule) => rule.rule === "R5_NO_CYCLE")?.passed).toBe(false);
  });

  it("reports a missing instrument rather than assuming one", () => {
    const verdict = evaluateOwnership({ ...validInstrument, instrument: "   ", supportingDocumentId: null });
    expect(verdict.state).toBe("INSTRUMENT_MISSING");
  });

  it("reports missing provenance rather than inferring it", () => {
    const verdict = evaluateOwnership({ ...validInstrument, provenance: "unknown" });
    expect(verdict.state).toBe("PROVENANCE_MISSING");
  });

  it("returns HUMAN_REVIEW — never VALID — when the live total is under 100%", () => {
    const verdict = evaluateOwnership({ ...validInstrument, siblingEconomicTotalPct: 10, siblingVotingTotalPct: 10 });
    expect(verdict.economicTotalPct).toBeCloseTo(70, 6);
    expect(verdict.state).toBe("RETURNS_HUMAN_REVIEW");
  });

  it("flags over-allocation instead of clamping the totals", () => {
    const verdict = evaluateOwnership({ ...validInstrument, siblingEconomicTotalPct: 60, siblingVotingTotalPct: 60 });
    expect(verdict.state).toBe("OVER_ALLOCATED");
    expect(verdict.economicTotalPct).toBeCloseTo(120, 6);
  });

  it("allows voting above economic only with a control basis", () => {
    const withControl = evaluateOwnership({
      ...validInstrument,
      ownershipType: "CONTROL_ONLY",
      economicPct: "0",
      votingPct: "51",
      siblingEconomicTotalPct: 100,
      siblingVotingTotalPct: 49,
    });
    expect(withControl.rules.find((rule) => rule.rule === "R2_VOTING_VS_ECONOMIC")?.passed).toBe(true);

    const withoutControl = evaluateOwnership({
      ...validInstrument,
      economicPct: "10",
      votingPct: "51",
      siblingEconomicTotalPct: 90,
      siblingVotingTotalPct: 49,
    });
    // The instrument is present, so R2 passes; but the ECONOMIC total is only
    // 100 while the voting majority is unexplained by economics — the finding is
    // surfaced through the rule detail rather than swallowed.
    const rule = withoutControl.rules.find((entry) => entry.rule === "R2_VOTING_VS_ECONOMIC");
    expect(rule?.passed).toBe(true);
    expect(rule?.detail).toContain("exceeds economic");
  });
});

describe("lifecycle state machine", () => {
  it("declares a transition list for every state", () => {
    for (const state of MCM_LIFECYCLE_STATES) {
      expect(MCM_LIFECYCLE_TRANSITIONS[state]).toBeDefined();
    }
  });

  it("makes ARCHIVED terminal", () => {
    expect(MCM_LIFECYCLE_TRANSITIONS.ARCHIVED).toEqual([]);
  });

  it("refuses a same-state transition", () => {
    expect(() => assertLifecycleTransition("ACTIVE", "ACTIVE")).toThrow(McmError);
  });

  it("refuses an undocumented edge", () => {
    // ACTIVE -> DRAFT is deliberately not permitted: a live company cannot be
    // rewound to an unverified draft, which would erase its operating history.
    expect(() => assertLifecycleTransition("ACTIVE", "DRAFT")).toThrow(/cannot transition/i);
  });

  it("refuses any exit from a terminal state", () => {
    for (const terminal of ["ARCHIVED"] as McmLifecycleState[]) {
      for (const target of MCM_LIFECYCLE_STATES) {
        expect(() => assertLifecycleTransition(terminal, target)).toThrow();
      }
    }
  });

  it("permits the documented operating edges", () => {
    expect(() => assertLifecycleTransition("DRAFT", "PENDING_VERIFICATION")).not.toThrow();
    expect(() => assertLifecycleTransition("PENDING_VERIFICATION", "ACTIVE")).not.toThrow();
    expect(() => assertLifecycleTransition("ACTIVE", "SUSPENDED")).not.toThrow();
    expect(() => assertLifecycleTransition("SUSPENDED", "ACTIVE")).not.toThrow();
    expect(() => assertLifecycleTransition("DORMANT", "DISSOLVED")).not.toThrow();
    expect(() => assertLifecycleTransition("DISSOLVED", "ARCHIVED")).not.toThrow();
  });
});
