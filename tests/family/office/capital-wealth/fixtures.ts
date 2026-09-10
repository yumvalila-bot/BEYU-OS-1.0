/**
 * Shared fixtures for the Family Office capital & wealth test suite.
 *
 * Every value here is a STRUCTURAL test fixture: an id, a date, a counterparty
 * name, a reference. The only numeric values are inputs to a pure calculation
 * whose expected result is derived by hand inside the test — never a policy
 * threshold. No threshold, appetite or red-line boundary is ever supplied as a
 * fixture default, because the suite's central claim is that the engine holds
 * none.
 */
import type {
  CapitalThreshold,
  FamilyInvestment,
  FamilyObligation,
  FamilyProperty,
  RedLineLadder,
} from "../../../../src/lib/family/office/capital-wealth";

export const TENANT = "T-CAP-1";
export const OTHER_TENANT = "T-CAP-2";

export const D = {
  asOf: "2026-03-31",
  acquired: "2021-03-31",
  maturity: "2029-03-31",
  effectiveFrom: "2026-01-01",
} as const;

/**
 * A threshold WITH provenance. Every fixture threshold carries a source reference
 * and an effective date because `assertThresholdProvenance` refuses one without —
 * that refusal is itself under test.
 */
export function threshold(over: Partial<CapitalThreshold> = {}): CapitalThreshold {
  return {
    code: "TEST_THRESHOLD",
    value: 5_000,
    unit: "BPS",
    direction: "MAX",
    sourceReference: "TEST-FIXTURE-ONLY: not a ratified policy value",
    effectiveFrom: D.effectiveFrom,
    ...over,
  };
}

export function ladder(over: Partial<RedLineLadder> = {}): RedLineLadder {
  return {
    measureCode: "TEST_MEASURE",
    healthyBand: "GREEN",
    rungs: [
      { band: "RED", threshold: threshold({ code: "TEST_RED", value: 8_000, direction: "MAX" }) },
      { band: "YELLOW", threshold: threshold({ code: "TEST_YELLOW", value: 6_000, direction: "MAX" }) },
    ],
    ...over,
  };
}

export function party(over: Partial<FamilyObligation["borrower"]> = {}): FamilyObligation["borrower"] {
  return {
    ref: "P-1",
    name: "Test Counterparty Ltd",
    partyType: "EXTERNAL_LENDER",
    countryCode: "NG",
    legalEntityRef: null,
    ...over,
  };
}

/** A well-formed obligation. Tests mutate one field at a time from here. */
export function obligation(over: Partial<FamilyObligation> = {}): FamilyObligation {
  return {
    id: "OB-1",
    tenantId: TENANT,
    kind: "INTERCOMPANY_LOAN",
    direction: "FAMILY_IS_BORROWER",
    borrower: party({ ref: "P-FAM", name: "Family Vehicle Ltd", partyType: "GROUP_ENTITY" }),
    lender: party({ ref: "P-EXT", name: "External Bank plc", partyType: "EXTERNAL_LENDER", countryCode: "GB" }),
    ownerRef: null,
    terms: {
      currency: "NGN",
      principalMinor: 100_000_000,
      annualRateBps: 1_200,
      rateType: "FIXED",
      floatingReference: null,
      floatingSpreadBps: null,
      maturityDate: D.maturity,
      paymentFrequency: "QUARTERLY",
      amortisation: "AMORTISING",
    },
    security: {
      collateralDescription: "Test charge over the asset",
      collateralRef: "C-1",
      guaranteeDescription: null,
      guarantorRef: null,
      guaranteeDirection: "NONE",
    },
    governance: {
      agreementDocumentRef: "DOC-1",
      approvalRef: "RES-1",
      authorisedBy: "U-AUTH-1",
      legalReviewRef: "LR-1",
      jurisdictionRef: "NG",
    },
    status: "ACTIVE",
    outstandingMinor: 80_000_000,
    financeRecordRef: "FIN-1",
    authoritativeAccounting: false,
    authoritativeAccountingOwner: "FINANCE_OS",
    amountBasis: "OBSERVED",
    createdAt: D.acquired,
    updatedAt: D.asOf,
    ...over,
  };
}

export function investment(over: Partial<FamilyInvestment> = {}): FamilyInvestment {
  return {
    id: "INV-1",
    tenantId: TENANT,
    legalEntityId: "LE-1",
    countryCode: "NG",
    type: "REAL_ESTATE",
    name: "Test Asset",
    assetClass: "COMMERCIAL_PROPERTY",
    currency: "NGN",
    acquisitionCostMinor: 100_000_000,
    cashInvestedMinor: 40_000_000,
    acquisitionDate: D.acquired,
    valuation: {
      valueMinor: 120_000_000,
      basis: "OBSERVED",
      source: "Test valuation",
      asOf: D.asOf,
      professionalValuationDocumentRef: "VAL-1",
    },
    realisedGainMinor: 0,
    annualCashFlowMinor: 8_000_000,
    realisedCashFlowMinor: 16_000_000,
    attributableDebtMinor: 60_000_000,
    liquidity: "ILLIQUID",
    riskBps: null,
    governanceStatus: "MONITORED",
    heldYears: 5,
    exitStrategy: "Sell on lease expiry",
    exitValueAssumptionMinor: 150_000_000,
    legalReviewRef: "LR-1",
    taxReviewRef: "TR-1",
    committeeDecisionRef: "CD-1",
    financeRecordRef: "FIN-1",
    ...over,
  };
}

export function property(over: Partial<FamilyProperty> = {}): FamilyProperty {
  return {
    id: "PR-1",
    tenantId: TENANT,
    legalEntityId: "LE-1",
    countryCode: "NG",
    propertyClass: "COMMERCIAL",
    name: "Test Property",
    stage: "OPERATIONS",
    operating: {
      grossPotentialRentMinor: 12_000_000,
      vacancyBps: 500,
      otherIncomeMinor: 0,
      operatingExpensesMinor: 5_000_000,
      maintenanceMinor: 1_000_000,
      propertyTaxMinor: 600_000,
      insuranceMinor: 400_000,
    },
    financing: {
      purchasePriceMinor: 100_000_000,
      cashInvestedMinor: 40_000_000,
      debtMinor: 60_000_000,
      annualRateBps: 1_200,
      rateType: "FIXED",
      annualDebtServiceMinor: 8_000_000,
      tenorMonths: 120,
      amortisation: "AMORTISING",
      currency: "NGN",
    },
    valuation: {
      valueMinor: 120_000_000,
      basis: "OBSERVED",
      source: "Test valuation",
      asOf: D.asOf,
      professionalValuationDocumentRef: "VAL-1",
    },
    heldYears: 5,
    exitValueMinor: 150_000_000,
    exitStrategy: "Sell on lease expiry",
    annualCashFlowAfterDebtMinor: -500_000,
    realisedCashFlowMinor: 0,
    acquisitionCostMinor: 100_000_000,
    financeRecordRef: "FIN-1",
    ...over,
  };
}
