/**
 * Family Office capital & wealth — real estate (§12) and the alternative financing
 * structures that must remain models only.
 *
 * The load-bearing claim: a wrap, lease-purchase or seller-financed structure is
 * a MODEL. It is structurally impossible for it to claim to be an executed legal
 * transaction, and completeness never makes it lawful or enforceable.
 */
import { describe, expect, it } from "vitest";
import {
  ALTERNATIVE_FINANCING_STRUCTURES,
  PROPERTY_CLASSES,
  PROPERTY_LIFECYCLE_STAGES,
  PROPERTY_STAGE_GATES,
  assertPropertyStageTransition,
  checkAlternativeFinancingModel,
  measureProperty,
  propertyStageRank,
  unmetPropertyGates,
  type AlternativeFinancingModel,
} from "../../../../src/lib/family/office/capital-wealth";
import { D, property } from "./fixtures";

function financingModel(over: Partial<AlternativeFinancingModel> = {}): AlternativeFinancingModel {
  return {
    structure: "WRAP_FINANCING",
    modelOnly: true,
    executedLegalTransaction: false,
    jurisdictionRef: "NG",
    counterparty: { ref: "P-VENDOR", name: "Vendor Ltd", countryCode: "NG" },
    creditAnalysisRef: "CA-1",
    legalReviewRef: "LR-1",
    taxReviewRef: "TR-1",
    collateralDescription: "Charge over the asset pending transfer",
    defaultScenario: "On default the vendor re-enters and retains credited amounts as liquidated damages.",
    documentationRef: "DOC-1",
    governanceApprovalRef: "RES-1",
    terms: {
      currency: "NGN",
      financedAmountMinor: 60_000_000,
      annualRateBps: 1_200,
      tenorMonths: 60,
      purchasePriceMinor: 100_000_000,
      creditedMinor: 0,
    },
    ...over,
  };
}

describe("§12 — the property measure set", () => {
  it("computes NOI, cap rate, cash-on-cash, LTV and DSCR from the fixture", () => {
    const m = measureProperty(property());
    /**
     * Gross 12,000,000 less 500 bps vacancy = 11,400,000 effective, less 5,000,000
     * operating expenses = 6,400,000 NOI. Debt service is excluded by definition.
     */
    expect(m.noiMinor).toBe(6_400_000);
    expect(m.effectiveGrossIncomeMinor).toBe(11_400_000);
    /** Cap rate on value: 6,400,000 / 120,000,000 = 5.33%. */
    expect(m.capRateBps).toBe(533);
    /** LTV: 60,000,000 / 120,000,000 = 50%. */
    expect(m.ltvBps).toBe(5_000);
    /** DSCR: 6,400,000 / 8,000,000 = 0.80 — below 1, so debt service is not covered. */
    expect(m.dscrBps).toBe(8_000);
    /** Equity: 120,000,000 − 60,000,000. */
    expect(m.equityMinor).toBe(60_000_000);
    /** Unrealised: 120,000,000 − 100,000,000. */
    expect(m.unrealisedGainMinor).toBe(20_000_000);
  });

  it("cash-on-cash uses cash invested, not purchase price", () => {
    /**
     * This is why a leveraged acquisition can show a high cash-on-cash and a
     * modest cap rate at the same time. Both are true; they measure different
     * things, and conflating them is the commonest error in property analysis.
     */
    const m = measureProperty(property());
    expect(m.capRateBps).not.toBe(m.cashOnCashBps);
    /** The explanation states the definitional exclusion, so the reader cannot conflate them. */
    expect(m.explanation.join(" ")).toMatch(/excludes debt service/);
  });

  it("a property with no valuation reports its measures as undefined, not zero", () => {
    const m = measureProperty(property({ valuation: null }));
    expect(m.capRateBps).toBeNull();
    expect(m.ltvBps).toBeNull();
    expect(m.equityMinor).toBeNull();
    expect(m.unrealisedGainMinor).toBeNull();
    expect(m.missingInputs.join(" ")).toMatch(/valuation/i);
  });

  it("an unfinanced property has no DSCR and says why", () => {
    const m = measureProperty(property({ financing: null }));
    expect(m.dscrBps).toBeNull();
    expect(m.ltvBps).toBeNull();
    /** NOI still computes: it excludes debt service by definition. */
    expect(m.noiMinor).toBe(6_400_000);
  });

  it("every measure set names its inputs and carries an explanation", () => {
    expect(measureProperty(property()).explanation.length).toBeGreaterThan(0);
  });
});

describe("§12 — the acquisition lifecycle and its gates", () => {
  it("runs OPPORTUNITY through to EXIT in order", () => {
    expect(PROPERTY_LIFECYCLE_STAGES[0]).toBe("OPPORTUNITY");
    expect(PROPERTY_LIFECYCLE_STAGES[PROPERTY_LIFECYCLE_STAGES.length - 1]).toBe("EXIT");
    for (const stage of ["DUE_DILIGENCE", "VALUATION", "FINANCING", "LEGAL", "TAX", "RISK", "GOVERNANCE", "ACQUISITION", "OPERATIONS", "MONITORING"]) {
      expect(PROPERTY_LIFECYCLE_STAGES).toContain(stage);
    }
  });

  it("covers all seven property classes", () => {
    expect(PROPERTY_CLASSES).toEqual([
      "RESIDENTIAL",
      "COMMERCIAL",
      "INDUSTRIAL",
      "HOSPITALITY",
      "AGRICULTURAL",
      "LAND",
      "DEVELOPMENT",
    ]);
  });

  it("rank increases monotonically along the lifecycle", () => {
    for (let i = 1; i < PROPERTY_LIFECYCLE_STAGES.length; i++) {
      expect(propertyStageRank(PROPERTY_LIFECYCLE_STAGES[i]!)).toBeGreaterThan(propertyStageRank(PROPERTY_LIFECYCLE_STAGES[i - 1]!));
    }
  });

  it("permits returning to an earlier stage", () => {
    /**
     * Going backwards is allowed deliberately. A deal can fall out of financing and
     * return to DUE_DILIGENCE, and refusing that would force the record to lie
     * about where the matter actually is.
     */
    expect(() => assertPropertyStageTransition("OPERATIONS", "DUE_DILIGENCE")).not.toThrow();
  });

  it("allows a single forward step", () => {
    expect(() => assertPropertyStageTransition("OPPORTUNITY", "DUE_DILIGENCE")).not.toThrow();
  });

  it("refuses skipping a stage forward", () => {
    /**
     * This is the gate that matters. The lifecycle advances one stage at a time so
     * no gate can be passed without being recorded — a property that jumps from
     * OPPORTUNITY to ACQUISITION has bypassed due diligence, valuation, financing,
     * legal, tax, risk and governance.
     */
    try {
      assertPropertyStageTransition("OPPORTUNITY", "ACQUISITION");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).message).toMatch(/skips/);
    }
  });

  it("names every unmet gate for a stage", () => {
    const unmet = unmetPropertyGates("ACQUISITION", []);
    expect(unmet).toEqual(PROPERTY_STAGE_GATES.ACQUISITION);
  });

  it("reports no gap once every gate is cleared", () => {
    expect(unmetPropertyGates("ACQUISITION", PROPERTY_STAGE_GATES.ACQUISITION)).toHaveLength(0);
  });
});

describe("§12 — alternative financing structures are models, never executed transactions", () => {
  it("the catalogue covers the three structures the brief names, plus two more", () => {
    const codes = ALTERNATIVE_FINANCING_STRUCTURES.map((s) => s.code);
    expect(codes).toContain("WRAP_FINANCING");
    expect(codes).toContain("LEASE_PURCHASE");
    expect(codes).toContain("SELLER_FINANCING");
    expect(codes).toContain("INSTALLMENT_SALE");
    expect(codes).toContain("RECEIVABLES_FINANCING");
  });

  it("a complete model is presentable", () => {
    const check = checkAlternativeFinancingModel(financingModel());
    expect(check.complete).toBe(true);
    expect(check.missing).toHaveLength(0);
  });

  it("structurally cannot represent an executed transaction", () => {
    /**
     * `executedLegalTransaction` is typed `false`, so the compiler holds this line
     * as well as the runtime. There is no code path that can set it true.
     */
    const model = financingModel();
    expect(model.modelOnly).toBe(true);
    expect(model.executedLegalTransaction).toBe(false);

    const check = checkAlternativeFinancingModel(model);
    expect(check.representsExecutedTransaction).toBe(false);
  });

  it("names every one of the nine required elements when absent", () => {
    const check = checkAlternativeFinancingModel(
      financingModel({
        jurisdictionRef: "",
        counterparty: { ref: "", name: "", countryCode: "" },
        creditAnalysisRef: null,
        legalReviewRef: null,
        taxReviewRef: null,
        collateralDescription: null,
        defaultScenario: null,
        documentationRef: null,
        governanceApprovalRef: null,
      }),
    );
    expect(check.complete).toBe(false);
    for (const required of [
      "jurisdiction",
      "counterparty",
      "credit analysis",
      "legal review",
      "tax review",
      "collateral",
      "default scenario",
      "documentation",
      "governance",
    ]) {
      expect(check.missing.some((m) => m.toLowerCase().includes(required)), `missing "${required}"`).toBe(true);
    }
  });

  it("completeness never establishes that the structure is lawful, enforceable or tax-efficient", () => {
    /**
     * This is the guard against the model being read as advice. A complete model
     * is complete; it is not approved, lawful or enforceable, and the check says
     * so every single time rather than only when asked.
     */
    const check = checkAlternativeFinancingModel(financingModel());
    expect(check.notEstablished.length).toBeGreaterThan(0);
    const text = check.notEstablished.join(" ").toLowerCase();
    expect(text).toMatch(/lawful|enforceab/);
    expect(check.explanation.join(" ")).toMatch(/model/i);
  });

  it("a lease-purchase model carries the credited amount against its price", () => {
    const check = checkAlternativeFinancingModel(
      financingModel({
        structure: "LEASE_PURCHASE",
        terms: { ...financingModel().terms, purchasePriceMinor: 100_000_000, creditedMinor: 12_000_000 },
      }),
    );
    expect(check.structure).toBe("LEASE_PURCHASE");
    expect(check.complete).toBe(true);
  });
});

describe("§12 — the measures are exact integers, never floats", () => {
  it("every monetary and basis-point measure is an integer", () => {
    const m = measureProperty(property());
    for (const [key, value] of Object.entries(m)) {
      if (typeof value === "number") {
        expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
      }
    }
  });

  it("is deterministic for the same input", () => {
    const a = measureProperty(property());
    const b = measureProperty(property());
    expect(a.noiMinor).toBe(b.noiMinor);
    expect(a.capRateBps).toBe(b.capRateBps);
    expect(a.dscrBps).toBe(b.dscrBps);
    expect(D.asOf).toBe("2026-03-31");
  });
});
