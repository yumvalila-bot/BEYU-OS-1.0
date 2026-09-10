/**
 * Family Office capital & wealth — the obligation register (§8: "who owes whom?").
 *
 * Covers both-sides-named, per-currency aggregation, the covenant test's honest
 * outcomes, the transition guard, and the live-status authority requirement.
 */
import { describe, expect, it } from "vitest";
import {
  LIVE_OBLIGATION_STATUSES,
  assertObligationTransition,
  canTransitionObligation,
  counterpartyNettingBps,
  summariseObligationRegister,
  testCovenant,
  validateObligation,
  type ObligationCovenant,
} from "../../../../src/lib/family/office/capital-wealth";
import { D, obligation, party } from "./fixtures";

function covenant(over: Partial<ObligationCovenant> = {}): ObligationCovenant {
  return {
    id: "COV-1",
    obligationId: "OB-1",
    covenantType: "FINANCIAL",
    code: "MIN_DSCR",
    description: "DSCR must not fall below the stated floor",
    measureCode: "DSCR",
    direction: "MIN",
    thresholdBps: 12_000,
    consequenceOnBreach: "Event of default after the cure period",
    curePeriodDays: 30,
    ...over,
  };
}

describe("the register answers 'who owes whom' only when both sides are named", () => {
  it("a well-formed obligation validates clean", () => {
    expect(validateObligation(obligation())).toHaveLength(0);
  });

  it("an obligation with an unnamed borrower is refused", () => {
    const findings = validateObligation(obligation({ borrower: party({ ref: "", name: "" }) }));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => /borrower/i.test(f))).toBe(true);
  });

  it("an obligation with an unnamed lender is refused", () => {
    const findings = validateObligation(obligation({ lender: party({ ref: "", name: "" }) }));
    expect(findings.some((f) => /lender/i.test(f))).toBe(true);
  });

  it("a missing country code is refused, because country isolation depends on it", () => {
    const findings = validateObligation(obligation({ borrower: party({ countryCode: "" }) }));
    expect(findings.some((f) => /country/i.test(f))).toBe(true);
  });
});

describe("totals are per currency — never a cross-currency aggregate", () => {
  it("separates NGN and USD rather than adding them", () => {
    const ngn = obligation({ id: "OB-NGN", terms: { ...obligation().terms, currency: "NGN" } });
    const usd = obligation({
      id: "OB-USD",
      terms: { ...obligation().terms, currency: "USD" },
      direction: "FAMILY_IS_LENDER",
    });
    const summary = summariseObligationRegister([ngn, usd], D.asOf);

    expect(summary.byCurrency).toHaveLength(2);
    const currencies = summary.byCurrency.map((c) => c.currency).sort();
    expect(currencies).toEqual(["NGN", "USD"]);
    /**
     * There is deliberately no `totalMinor` across currencies. A caller wanting one
     * would have to invent an FX rate, and the summary refuses to hand one over.
     */
    expect(summary).not.toHaveProperty("totalMinor");
  });

  it("separates direction: owed BY the family is not owed TO it", () => {
    const borrowing = obligation({ id: "OB-A", direction: "FAMILY_IS_BORROWER", outstandingMinor: 50_000_000 });
    const lending = obligation({ id: "OB-B", direction: "FAMILY_IS_LENDER", outstandingMinor: 30_000_000 });
    const summary = summariseObligationRegister([borrowing, lending], D.asOf);
    const ngn = summary.byCurrency.find((c) => c.currency === "NGN");

    expect(ngn?.owedByFamilyMinor).toBe(50_000_000);
    expect(ngn?.owedToFamilyMinor).toBe(30_000_000);
    /** Net is presented per currency and never hides the two gross figures. */
    expect(ngn?.netMinor).toBe(-20_000_000);
  });

  it("a guarantee GIVEN is tracked separately from money owed", () => {
    const guarantee = obligation({
      id: "OB-G",
      direction: "FAMILY_IS_GUARANTOR",
      outstandingMinor: 25_000_000,
      security: { ...obligation().security, guaranteeDirection: "GIVEN", guarantorRef: "P-FAM" },
    });
    const summary = summariseObligationRegister([guarantee], D.asOf);
    expect(summary.byCurrency[0]?.guaranteedByFamilyMinor).toBe(25_000_000);
  });

  it("every summary declares FINANCE_OS as the accounting owner", () => {
    const summary = summariseObligationRegister([obligation()], D.asOf);
    expect(summary.authoritativeAccountingOwner).toBe("FINANCE_OS");
  });

  it("counterparty netting is zero — not null — when the family only owes one way", () => {
    /**
     * The denominator is floored at 1, so a one-sided exposure nets to 0 bps rather
     * than to null. Null is reserved for "not computable"; this one is computable
     * and the answer is that there is nothing to net.
     */
    const oneSided = {
      counterpartyRef: "P-1",
      counterpartyName: "External Bank plc",
      partyType: "EXTERNAL_LENDER" as const,
      countryCode: "GB",
      owedByFamilyMinor: 80_000_000,
      owedToFamilyMinor: 0,
      guaranteedByFamilyMinor: 0,
      netMinor: -80_000_000,
      obligationCount: 1,
      obligationIds: ["OB-1"],
    };
    /** -80000000 / 80000000 = -100%. */
    expect(counterpartyNettingBps(oneSided)).toBe(-10_000);

    const twoSided = { ...oneSided, owedToFamilyMinor: 40_000_000, netMinor: -40_000_000, obligationCount: 2 };
    /** -40000000 / 80000000 = -50%. A two-way relationship reads differently from a one-way one. */
    expect(counterpartyNettingBps(twoSided)).toBe(-5_000);
  });
});

describe("covenant tests report their own absence honestly", () => {
  it("a compliant measure is COMPLIANT", () => {
    const t = testCovenant(covenant(), 13_000);
    expect(t.status).toBe("COMPLIANT");
    expect(t.headroomBps).toBe(1_000);
  });

  it("a measure below the floor is BREACHED", () => {
    const t = testCovenant(covenant(), 11_000);
    expect(t.status).toBe("BREACHED");
    expect(t.consequenceOnBreach).toMatch(/default/i);
  });

  it("a measure that was never supplied is MEASURE_ABSENT, never COMPLIANT", () => {
    /**
     * This is the load-bearing case. Reporting an unmeasured covenant as compliant
     * would make absence of a breach signal into evidence of compliance, which is
     * how a covenant quietly stops being monitored.
     */
    const t = testCovenant(covenant(), null);
    expect(t.status).toBe("MEASURE_ABSENT");
  });

  it("a covenant with no threshold is THRESHOLD_ABSENT and flags REQUIRES_POLICY", () => {
    const t = testCovenant(covenant({ thresholdBps: null }), 13_000);
    expect(t.status).toBe("THRESHOLD_ABSENT");
    expect(t.basis).toBe("REQUIRES_POLICY");
  });

  it("an information covenant is NOT_MEASURABLE rather than silently passing", () => {
    const t = testCovenant(
      covenant({ covenantType: "INFORMATION", measureCode: null, direction: null, thresholdBps: null }),
      null,
    );
    expect(t.status).toBe("NOT_MEASURABLE");
    expect(t.explanation).toMatch(/documentary judgement/i);
  });
});

describe("the status machine refuses illegal transitions", () => {
  it("SETTLED is terminal", () => {
    expect(canTransitionObligation("SETTLED", "ACTIVE")).toBe(false);
    /**
     * The transition guard raises FamilyMetricsError, the capital layer's own error
     * type, rather than the institution layer's FamilyError. Different layers,
     * different error classes; a caller catching one must not silently swallow the
     * other.
     */
    try {
      assertObligationTransition("SETTLED", "ACTIVE");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).name).toBe("FamilyMetricsError");
      expect((e as Error).message).toMatch(/terminal state/);
    }
  });

  it("a draft may not jump straight to ACTIVE", () => {
    expect(canTransitionObligation("DRAFT", "ACTIVE")).toBe(false);
  });

  it("a live status must carry an authorising reference", () => {
    for (const status of LIVE_OBLIGATION_STATUSES) {
      const findings = validateObligation(
        obligation({ status, governance: { agreementDocumentRef: null, approvalRef: null, authorisedBy: null, legalReviewRef: null, jurisdictionRef: null } }),
      );
      expect(findings.length, `status ${status} should require authority`).toBeGreaterThan(0);
    }
  });

  it("a DRAFT needs no authority, because nothing is live yet", () => {
    const findings = validateObligation(
      obligation({ status: "DRAFT", governance: { agreementDocumentRef: null, approvalRef: null, authorisedBy: null, legalReviewRef: null, jurisdictionRef: null } }),
    );
    expect(findings.filter((f) => /authoris|authoriz/i.test(f))).toHaveLength(0);
  });
});
