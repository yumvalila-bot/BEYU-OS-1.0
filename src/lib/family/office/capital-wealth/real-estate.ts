/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: real estate (§12) and
 * alternative financing models (§13).
 *
 * ============================== WHAT THIS IS ================================
 *
 * A property model that carries the whole lifecycle the brief names —
 * OPPORTUNITY → DUE DILIGENCE → VALUATION → FINANCING → LEGAL → TAX → RISK →
 * GOVERNANCE → ACQUISITION → OPERATIONS → MONITORING → EXIT — and computes the
 * measures that make a property decision evidence-based rather than narrative:
 * NOI, cap rate, cash-on-cash, IRR, LTV, DSCR, equity and exit value.
 *
 * §13 adds analysis of seller financing, installment sale, lease purchase,
 * wrap-style financing and receivables financing — **ONLY AS MODELS**. That is
 * not a caveat bolted on at the end; it is structural. Every model carries
 * `modelOnly: true`, `executedLegalTransaction: false` and the jurisdiction,
 * counterparty, credit analysis, legal review, tax review, collateral, default
 * scenario, documentation and governance references the brief requires. A model
 * that is missing them is refused, because an undocumented structure presented
 * as a plan is how a family ends up in an unenforceable transaction.
 *
 * ============================ WHAT THIS IS NOT ================================
 *
 * Not a valuation authority. A valuation here is a MARK with an epistemic class
 * and a source; the authoritative valuation is a professional's, referenced by
 * document. Not accounting: the property's book value, depreciation and rental
 * income recognition are Finance OS's (§32).
 */

import {
  applyBpsSigned,
  assertMinorUnits,
  BPS_BASE,
  capRateBps,
  cashOnCashBps,
  dscrBps,
  irrBps,
  ltvBps,
  netOperatingIncomeMinor,
  npvMinor,
  ratioBps,
  yieldBps,
  type CapitalEpistemicClass,
} from "./metrics";

export const FAMILY_REAL_ESTATE_ENGINE_VERSION = "family-real-estate-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Vocabularies                                                        */
/* ------------------------------------------------------------------ */

/** Property classes (§12). */
export const PROPERTY_CLASSES = [
  "RESIDENTIAL",
  "COMMERCIAL",
  "INDUSTRIAL",
  "HOSPITALITY",
  "AGRICULTURAL",
  "LAND",
  "DEVELOPMENT",
] as const;
export type PropertyClass = (typeof PROPERTY_CLASSES)[number];

/** The acquisition lifecycle (§12), in order. */
export const PROPERTY_LIFECYCLE_STAGES = [
  "OPPORTUNITY",
  "DUE_DILIGENCE",
  "VALUATION",
  "FINANCING",
  "LEGAL",
  "TAX",
  "RISK",
  "GOVERNANCE",
  "ACQUISITION",
  "OPERATIONS",
  "MONITORING",
  "EXIT",
] as const;
export type PropertyLifecycleStage = (typeof PROPERTY_LIFECYCLE_STAGES)[number];

/**
 * Which lifecycle gates must be cleared before each stage may be entered.
 *
 * These are STRUCTURAL gates: the review that must exist. Whether it cleared is
 * recorded by a human through the governance engine. The engine refuses a
 * forward move whose gate is not recorded as cleared — it never clears one
 * itself.
 */
export const PROPERTY_STAGE_GATES: Record<PropertyLifecycleStage, readonly string[]> = {
  OPPORTUNITY: [],
  DUE_DILIGENCE: ["OPPORTUNITY_SCREENED"],
  VALUATION: ["DUE_DILIGENCE_STARTED"],
  FINANCING: ["VALUATION_RECORDED"],
  LEGAL: ["FINANCING_MODELLED"],
  TAX: ["LEGAL_REVIEW_RECORDED"],
  RISK: ["TAX_REVIEW_RECORDED"],
  GOVERNANCE: ["RISK_ASSESSED"],
  ACQUISITION: ["GOVERNANCE_APPROVAL_RECORDED", "LEGAL_REVIEW_CLEARED", "TAX_REVIEW_CLEARED"],
  OPERATIONS: ["ACQUISITION_COMPLETED"],
  MONITORING: ["OPERATIONS_STARTED"],
  EXIT: ["EXIT_STRATEGY_APPROVED", "TAX_REVIEW_CLEARED", "GOVERNANCE_APPROVAL_RECORDED"],
};

export function propertyStageRank(stage: PropertyLifecycleStage): number {
  return PROPERTY_LIFECYCLE_STAGES.indexOf(stage);
}

/**
 * Assert a lifecycle move is legal.
 *
 * Only one step forward, or backward to an earlier stage (a matter can be
 * returned to due diligence). Skipping a stage is refused: `ACQUISITION` reached
 * from `OPPORTUNITY` without legal, tax, risk and governance is exactly the
 * failure the lifecycle exists to prevent.
 */
export function assertPropertyStageTransition(from: PropertyLifecycleStage, to: PropertyLifecycleStage): void {
  if (from === to) return;
  const delta = propertyStageRank(to) - propertyStageRank(from);
  if (delta < 0) return; // returning to an earlier stage is always permitted
  if (delta > 1) {
    throw new Error(
      `A property cannot move from ${from} to ${to}: that skips ${delta - 1} stage(s). The lifecycle advances one stage at a time so that no gate can be passed without being recorded.`,
    );
  }
}

/**
 * Check whether a stage's gates are recorded as cleared.
 *
 * Returns the unmet gates. An empty list means the stage may be entered. The
 * engine never marks a gate cleared on its own.
 */
export function unmetPropertyGates(stage: PropertyLifecycleStage, clearedGates: readonly string[]): readonly string[] {
  const cleared = new Set(clearedGates);
  return PROPERTY_STAGE_GATES[stage].filter((g) => !cleared.has(g));
}

/* ------------------------------------------------------------------ */
/* The property model                                                  */
/* ------------------------------------------------------------------ */

export type PropertyValuation = {
  /** The marked value, minor units. */
  valueMinor: number;
  /** Who or what produced the mark. Never assumed to be a professional valuation. */
  basis: CapitalEpistemicClass;
  /** The source of the mark: a document, a comparable set, an internal model. */
  source: string;
  asOf: string;
  /** Reference to the authoritative professional valuation document, when one exists. */
  professionalValuationDocumentRef: string | null;
};

export type PropertyOperatingInput = {
  grossPotentialRentMinor: number;
  /** Vacancy and collection loss, basis points. */
  vacancyBps: number;
  otherIncomeMinor: number;
  operatingExpensesMinor: number;
  /** Annual maintenance, minor units. Included in operating expenses above. */
  maintenanceMinor: number;
  /** Annual property tax, minor units. Included in operating expenses above. */
  propertyTaxMinor: number;
  /** Annual insurance, minor units. Included in operating expenses above. */
  insuranceMinor: number;
};

export type PropertyFinancing = {
  /** Purchase price, minor units. */
  purchasePriceMinor: number;
  /** Cash the family actually put in, minor units. The cash-on-cash denominator. */
  cashInvestedMinor: number;
  /** Debt raised, minor units. */
  debtMinor: number;
  /** Annual rate, basis points. */
  annualRateBps: number;
  rateType: "FIXED" | "FLOATING";
  /** Annual debt service, minor units. */
  annualDebtServiceMinor: number;
  tenorMonths: number;
  /** Amortising or bullet. A bullet has no principal repayment before maturity. */
  amortisation: "AMORTISING" | "BULLET" | "INTEREST_ONLY";
  currency: string;
};

export type FamilyProperty = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  countryCode: string;
  propertyClass: PropertyClass;
  name: string;
  stage: PropertyLifecycleStage;
  operating: PropertyOperatingInput;
  financing: PropertyFinancing | null;
  /** The current valuation mark. Null before any valuation exists. */
  valuation: PropertyValuation | null;
  /** Holding period to date, whole years. Used for CAGR and IRR. */
  heldYears: number;
  /** Exit value assumption, minor units. An ASSUMPTION, never a forecast of fact. */
  exitValueMinor: number | null;
  exitStrategy: string | null;
  /** Annual cash flow to the family after debt service, minor units. */
  annualCashFlowAfterDebtMinor: number | null;
  /** Annual realised cash flow received to date, minor units. */
  realisedCashFlowMinor: number;
  /** Acquisition cost, minor units. */
  acquisitionCostMinor: number;
  /** The authoritative Finance OS record for this property. */
  financeRecordRef: string | null;
};

/* ------------------------------------------------------------------ */
/* Measures                                                            */
/* ------------------------------------------------------------------ */

export type PropertyMeasureSet = {
  engineVersion: string;
  propertyId: string;
  /** Net operating income, minor units. Debt service is excluded by definition. */
  noiMinor: number;
  /** Effective gross income after vacancy, minor units. */
  effectiveGrossIncomeMinor: number;
  capRateBps: number | null;
  cashOnCashBps: number | null;
  yieldBps: number | null;
  ltvBps: number | null;
  dscrBps: number | null;
  /** Equity = valuation − debt. Null when no valuation exists. */
  equityMinor: number | null;
  /** Unrealised gain against acquisition cost. Null when no valuation exists. */
  unrealisedGainMinor: number | null;
  /** Return on the cash actually invested, to date, basis points. */
  cashReturnToBps: number | null;
  /** Internal rate of return over the holding period, basis points. Null when undefined. */
  irrBps: number | null;
  /** Debt service as a share of NOI, basis points — the inverse reading of DSCR. */
  debtServiceShareOfNoiBps: number | null;
  missingInputs: string[];
  /** Always non-empty: every measure names its inputs. */
  explanation: string[];
};

/**
 * Compute the property measure set.
 *
 * `NOI` excludes debt service, income tax, depreciation and capital expenditure;
 * including any of them would make the result something other than NOI and every
 * cap rate derived from it wrong. `cashOnCash` uses the cash actually invested,
 * not the purchase price, which is why a leveraged acquisition can show a high
 * cash-on-cash and a modest cap rate at the same time — both are true and they
 * measure different things.
 */
export function measureProperty(property: FamilyProperty): PropertyMeasureSet {
  assertMinorUnits(property.acquisitionCostMinor, "acquisitionCost");
  assertMinorUnits(property.realisedCashFlowMinor, "realisedCashFlow");

  const noi = netOperatingIncomeMinor({
    grossPotentialRentMinor: property.operating.grossPotentialRentMinor,
    vacancyBps: property.operating.vacancyBps,
    otherIncomeMinor: property.operating.otherIncomeMinor,
    operatingExpensesMinor: property.operating.operatingExpensesMinor,
  });
  const vacancyLoss = applyBpsSigned(property.operating.grossPotentialRentMinor, property.operating.vacancyBps);
  const egi = property.operating.grossPotentialRentMinor - vacancyLoss + property.operating.otherIncomeMinor;

  const missingInputs: string[] = [];
  if (!property.valuation) missingInputs.push("No valuation exists, so cap rate, equity and unrealised gain are undefined.");
  if (!property.financing) missingInputs.push("No financing exists, so LTV, DSCR and cash-on-cash are undefined.");
  if (property.annualCashFlowAfterDebtMinor === null) missingInputs.push("Annual cash flow after debt service was not supplied, so cash-on-cash is undefined.");
  if (property.exitValueMinor === null) missingInputs.push("No exit value assumption, so IRR is undefined.");

  const value = property.valuation?.valueMinor ?? null;
  const debt = property.financing?.debtMinor ?? null;
  const equity = value !== null && debt !== null ? value - debt : null;
  const cashFlow = property.annualCashFlowAfterDebtMinor;
  const cashInvested = property.financing?.cashInvestedMinor ?? null;

  // IRR over the holding period: acquisition outlay, annual cash flows, exit.
  let irr: number | null = null;
  if (property.exitValueMinor !== null && cashFlow !== null && property.heldYears > 0) {
    const flows: number[] = [-property.acquisitionCostMinor];
    for (let i = 0; i < property.heldYears; i += 1) flows.push(cashFlow);
    flows[flows.length - 1] += property.exitValueMinor;
    irr = irrBps(flows);
  }

  return {
    engineVersion: FAMILY_REAL_ESTATE_ENGINE_VERSION,
    propertyId: property.id,
    noiMinor: noi,
    effectiveGrossIncomeMinor: egi,
    capRateBps: value !== null ? capRateBps(noi, value) : null,
    cashOnCashBps: cashFlow !== null && cashInvested !== null ? cashOnCashBps(cashFlow, cashInvested) : null,
    yieldBps: value !== null ? yieldBps(cashFlow ?? noi, value) : null,
    ltvBps: debt !== null && value !== null ? ltvBps(debt, value) : null,
    dscrBps: property.financing ? dscrBps(noi, property.financing.annualDebtServiceMinor) : null,
    equityMinor: equity,
    unrealisedGainMinor: value !== null ? value - property.acquisitionCostMinor : null,
    cashReturnToBps: cashInvested !== null ? ratioBps(property.realisedCashFlowMinor, cashInvested) : null,
    irrBps: irr,
    debtServiceShareOfNoiBps: property.financing ? ratioBps(property.financing.annualDebtServiceMinor, noi) : null,
    missingInputs,
    explanation: [
      `NOI ${noi} = effective gross income ${egi} − operating expenses ${property.operating.operatingExpensesMinor} (vacancy ${property.operating.vacancyBps} bps of gross potential rent).`,
      "NOI excludes debt service, income tax, depreciation and capital expenditure by definition.",
      value !== null ? `Valuation ${value} on basis ${property.valuation?.basis} from ${property.valuation?.source}; equity ${equity}.` : "No valuation: cap rate, equity and unrealised gain are undefined rather than assumed.",
      property.financing ? `Debt ${debt} at ${property.financing.annualRateBps} bps ${property.financing.rateType.toLowerCase()}; annual service ${property.financing.annualDebtServiceMinor}.` : "No financing recorded.",
      irr !== null ? `IRR over ${property.heldYears} year(s) with the supplied exit assumption: ${irr} bps. The exit value is an ASSUMPTION, so the IRR is only as good as it.` : "IRR is undefined: no exit value assumption, no annual cash flow, or no holding period.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* §13 — Alternative financing MODELS                                  */
/* ------------------------------------------------------------------ */

/**
 * The alternative financing structures the Family Office may MODEL (§13).
 *
 * Each is a real structure with real legal and tax consequences. The engine
 * models the economics; it does not opine on enforceability, and it never
 * represents a model as an executed transaction.
 */
export const ALTERNATIVE_FINANCING_STRUCTURES = [
  { code: "SELLER_FINANCING", label: "Seller financing", description: "The seller extends credit for part or all of the price, secured on the asset." },
  { code: "INSTALLMENT_SALE", label: "Installment sale", description: "The price is paid in instalments, with title transferring on a stated schedule." },
  { code: "LEASE_PURCHASE", label: "Lease purchase", description: "A lease carrying an option or obligation to purchase at a stated price." },
  { code: "WRAP_FINANCING", label: "Wrap-style financing", description: "A new debt that wraps an existing one; the new lender services the underlying debt." },
  { code: "RECEIVABLES_FINANCING", label: "Receivables financing", description: "Funding advanced against assigned receivables." },
] as const;
export type AlternativeFinancingCode = (typeof ALTERNATIVE_FINANCING_STRUCTURES)[number]["code"];

export type AlternativeFinancingModel = {
  structure: AlternativeFinancingCode;
  /** Always true. A model is never an executed transaction. */
  modelOnly: true;
  /** Always false. Structurally impossible to claim otherwise. */
  executedLegalTransaction: false;
  /** The jurisdiction whose law governs. Required — a structure is meaningless without it. */
  jurisdictionRef: string;
  /** The counterparty. Required. */
  counterparty: { ref: string; name: string; countryCode: string };
  /** Credit analysis reference. Required. */
  creditAnalysisRef: string | null;
  /** Legal review reference. Required before the model may be presented as a plan. */
  legalReviewRef: string | null;
  /** Tax review reference. Required before the model may be presented as a plan. */
  taxReviewRef: string | null;
  /** What secures it. Required — an unsecured alternative structure is a different risk. */
  collateralDescription: string | null;
  /** The default scenario: what happens if the counterparty does not perform. Required. */
  defaultScenario: string | null;
  /** Documentation reference. Required. */
  documentationRef: string | null;
  /** Governance approval reference. Required before execution, never before modelling. */
  governanceApprovalRef: string | null;
  /** Economic terms, minor units and basis points. */
  terms: {
    currency: string;
    financedAmountMinor: number;
    /** Rate charged, basis points. Zero for a zero-coupon or rent-credited structure. */
    annualRateBps: number;
    tenorMonths: number;
    /** Purchase or exercise price where the structure carries one. */
    purchasePriceMinor: number | null;
    /** Amount credited against the price, e.g. rent credited on a lease purchase. */
    creditedMinor: number;
  };
};

export type AlternativeFinancingCheck = {
  engineVersion: string;
  structure: AlternativeFinancingCode;
  /** The missing required elements. Empty means the model is complete enough to present. */
  missing: string[];
  /** True when every required element is present. */
  complete: boolean;
  /** Always false — the engine never represents a model as executed. */
  representsExecutedTransaction: false;
  /** What the model does NOT establish. Always non-empty. */
  notEstablished: readonly string[];
  explanation: string[];
};

/**
 * Check an alternative financing model for completeness.
 *
 * The brief names nine required elements (§13): jurisdiction, counterparty,
 * credit analysis, legal review, tax review, collateral, default scenario,
 * documentation and governance. Each missing element is named. Completeness
 * makes the model presentable; it does NOT make the structure lawful,
 * enforceable or tax-efficient, and `notEstablished` says so every time.
 */
export function checkAlternativeFinancingModel(model: AlternativeFinancingModel): AlternativeFinancingCheck {
  const missing: string[] = [];
  if (!model.jurisdictionRef.trim()) missing.push("jurisdiction");
  if (!model.counterparty.ref.trim()) missing.push("counterparty");
  if (!model.creditAnalysisRef) missing.push("credit analysis");
  if (!model.legalReviewRef) missing.push("legal review");
  if (!model.taxReviewRef) missing.push("tax review");
  if (!model.collateralDescription) missing.push("collateral");
  if (!model.defaultScenario) missing.push("default scenario");
  if (!model.documentationRef) missing.push("documentation");
  if (!model.governanceApprovalRef) missing.push("governance approval");
  assertMinorUnits(model.terms.financedAmountMinor, "financedAmount");
  assertMinorUnits(model.terms.creditedMinor, "credited");

  return {
    engineVersion: FAMILY_REAL_ESTATE_ENGINE_VERSION,
    structure: model.structure,
    missing,
    complete: missing.length === 0,
    representsExecutedTransaction: false,
    notEstablished: [
      "That the structure is lawful in the stated jurisdiction.",
      "That the structure is enforceable against the counterparty.",
      "That the tax treatment modelled is the treatment that will apply. Final tax treatment is the authority of Finance OS and qualified professionals (§22).",
      "That the collateral is perfected or registrable.",
      "That any regulated-activity boundary is cleared (§7).",
      "That the transaction has occurred. This is a model (§13).",
    ],
    explanation: [
      `${ALTERNATIVE_FINANCING_STRUCTURES.find((s) => s.code === model.structure)?.label}: ${ALTERNATIVE_FINANCING_STRUCTURES.find((s) => s.code === model.structure)?.description}`,
      missing.length === 0
        ? "All nine required elements are recorded, so the model may be presented for governance review."
        : `Missing required element(s): ${missing.join(", ")}. An undocumented structure presented as a plan is how a family ends up in an unenforceable transaction.`,
      "The Family Office models this structure. It does not perform regulated lending, and a model is never an executed legal transaction (§13).",
    ],
  };
}

/**
 * Compute the economics of a wrap-style financing model.
 *
 * The wrap lender's net position is the wrapped debt service they must pay minus
 * the payments they receive, netted against the interest they earn on the
 * financed amount. The existing underlying debt is the structural risk: the wrap
 * lender is exposed to a debt they do not control, and that is stated rather
 * than netted away.
 */
export function modelWrapFinancing(params: {
  wrappedDebtOutstandingMinor: number;
  wrappedDebtAnnualRateBps: number;
  wrappedDebtAnnualServiceMinor: number;
  newFinancedAmountMinor: number;
  newAnnualRateBps: number;
  newAnnualServiceMinor: number;
}): {
  engineVersion: string;
  /** What the wrap lender receives, minor units per year. */
  receivedAnnualMinor: number;
  /** What the wrap lender must pay on the underlying debt, minor units per year. */
  paidAnnualMinor: number;
  /** The net annual position, minor units. */
  netAnnualMinor: number;
  /** Interest earned on the new financed amount, minor units per year. */
  interestEarnedAnnualMinor: number;
  /** Interest paid on the wrapped debt, minor units per year. */
  interestPaidAnnualMinor: number;
  /** Net interest margin, basis points on the new financed amount. */
  netInterestMarginBps: number | null;
  /** Always SCENARIO. */
  basis: Extract<CapitalEpistemicClass, "SCENARIO">;
  explanation: string[];
} {
  assertMinorUnits(params.wrappedDebtOutstandingMinor, "wrappedDebtOutstanding");
  assertMinorUnits(params.newFinancedAmountMinor, "newFinancedAmount");
  const interestEarned = applyBpsSigned(params.newFinancedAmountMinor, params.newAnnualRateBps);
  const interestPaid = applyBpsSigned(params.wrappedDebtOutstandingMinor, params.wrappedDebtAnnualRateBps);
  const net = params.newAnnualServiceMinor - params.wrappedDebtAnnualServiceMinor;

  return {
    engineVersion: FAMILY_REAL_ESTATE_ENGINE_VERSION,
    receivedAnnualMinor: params.newAnnualServiceMinor,
    paidAnnualMinor: params.wrappedDebtAnnualServiceMinor,
    netAnnualMinor: net,
    interestEarnedAnnualMinor: interestEarned,
    interestPaidAnnualMinor: interestPaid,
    netInterestMarginBps: ratioBps(interestEarned - interestPaid, params.newFinancedAmountMinor),
    basis: "SCENARIO",
    explanation: [
      `The wrap lender receives ${params.newAnnualServiceMinor} per year and must pay ${params.wrappedDebtAnnualServiceMinor} on the underlying debt: a net annual position of ${net}.`,
      `Interest earned ${interestEarned} against interest paid ${interestPaid}.`,
      "The underlying debt remains the structural risk: the wrap lender services an obligation they do not control, and a default on it is not cured by the wrapped borrower paying on time.",
      "A wrap may be unlawful or may trigger a due-on-sale clause in the underlying loan in many jurisdictions. Legal review is mandatory before this model is presented as a plan (§13).",
    ],
  };
}

/**
 * Model a lease purchase: rent paid, credit against price, and the residual the
 * buyer must still fund at exercise.
 */
export function modelLeasePurchase(params: {
  purchasePriceMinor: number;
  monthlyRentMinor: number;
  leaseTermMonths: number;
  /** Rent credited against the price, basis points of rent paid. */
  rentCreditBps: number;
  /** Option fee paid up front and credited, minor units. */
  optionFeeMinor: number;
}): {
  engineVersion: string;
  totalRentPaidMinor: number;
  rentCreditedMinor: number;
  optionFeeCreditedMinor: number;
  totalCreditedMinor: number;
  /** What the buyer must still fund at exercise, minor units. Never negative. */
  residualDueAtExerciseMinor: number;
  /** Credit as a share of the price, basis points. */
  creditShareOfPriceBps: number | null;
  basis: Extract<CapitalEpistemicClass, "SCENARIO">;
  explanation: string[];
} {
  assertMinorUnits(params.purchasePriceMinor, "purchasePrice");
  assertMinorUnits(params.monthlyRentMinor, "monthlyRent");
  assertMinorUnits(params.optionFeeMinor, "optionFee");
  if (!Number.isInteger(params.leaseTermMonths) || params.leaseTermMonths <= 0) {
    throw new Error(`Lease term must be a positive integer number of months; received ${params.leaseTermMonths}.`);
  }
  const totalRent = params.monthlyRentMinor * params.leaseTermMonths;
  const rentCredited = applyBpsSigned(totalRent, params.rentCreditBps);
  const totalCredited = rentCredited + params.optionFeeMinor;
  const residual = Math.max(params.purchasePriceMinor - totalCredited, 0);

  return {
    engineVersion: FAMILY_REAL_ESTATE_ENGINE_VERSION,
    totalRentPaidMinor: totalRent,
    rentCreditedMinor: rentCredited,
    optionFeeCreditedMinor: params.optionFeeMinor,
    totalCreditedMinor: totalCredited,
    residualDueAtExerciseMinor: residual,
    creditShareOfPriceBps: ratioBps(totalCredited, params.purchasePriceMinor),
    basis: "SCENARIO",
    explanation: [
      `Over ${params.leaseTermMonths} month(s) the buyer pays ${totalRent} in rent, of which ${rentCredited} is credited (${params.rentCreditBps} bps), plus a ${params.optionFeeMinor} option fee.`,
      `Total credit ${totalCredited} against a price of ${params.purchasePriceMinor}, leaving ${residual} to fund at exercise.`,
      totalCredited > params.purchasePriceMinor
        ? "Credit exceeds the price. The excess is not a profit unless the agreement says so; whether it is refundable is a legal question, not an arithmetic one."
        : "Credit does not exceed the price.",
      "Whether the option is exercisable, and on what terms, is a legal question. The model computes the economics only (§13).",
    ],
  };
}

/**
 * Discount a property's projected cash flows to a present value, so that two
 * properties with different cash-flow shapes can be compared on one number.
 *
 * The discount rate is a caller ASSUMPTION with provenance; the engine supplies
 * none, because a hard-coded hurdle rate would be an unratified investment
 * policy presented as a fact.
 */
export function discountPropertyCashFlows(params: {
  annualCashFlowsMinor: readonly number[];
  /** Discount rate, basis points. */
  discountRateBps: number;
  /** Terminal (exit) value added to the final period, minor units. */
  terminalValueMinor: number;
  /** Acquisition outlay at t=0, minor units. */
  acquisitionOutlayMinor: number;
}): {
  engineVersion: string;
  npvMinor: number;
  /** Always SCENARIO. */
  basis: Extract<CapitalEpistemicClass, "SCENARIO">;
  assumptions: string[];
  explanation: string[];
} {
  if (params.annualCashFlowsMinor.length === 0) throw new Error("At least one projected annual cash flow is required.");
  const flows = [-params.acquisitionOutlayMinor, ...params.annualCashFlowsMinor];
  flows[flows.length - 1] += params.terminalValueMinor;
  const npv = npvMinor(flows, params.discountRateBps);

  return {
    engineVersion: FAMILY_REAL_ESTATE_ENGINE_VERSION,
    npvMinor: npv,
    basis: "SCENARIO",
    assumptions: [
      `Discount rate of ${params.discountRateBps} bps is a caller ASSUMPTION. The engine supplies no hurdle rate: a hard-coded one would be an unratified investment policy.`,
      `Terminal value of ${params.terminalValueMinor} added to the final period is an ASSUMPTION, and it typically dominates the result — treat the NPV as a function of it, not a fact.`,
      "Cash flows are annual and end-of-period. Intra-year timing is not modelled.",
    ],
    explanation: [
      `NPV of ${npv} minor units over ${params.annualCashFlowsMinor.length} year(s) at ${params.discountRateBps} bps, including a terminal value of ${params.terminalValueMinor}.`,
      "A positive NPV means the projection clears the assumed rate. It is not a recommendation, and it is only as sound as the terminal value assumption behind it.",
    ],
  };
}

export { BPS_BASE };
