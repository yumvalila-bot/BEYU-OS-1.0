/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: investments (§10), the
 * decision journal (§11) and post-investment review (§10/§11, CAP-010).
 *
 * ============================== WHAT THIS IS ================================
 *
 * Every material investment carries a thesis AND a counter-thesis, its cost and
 * current value, realised and unrealised gain, cash flow, yield, ROI, IRR, CAGR,
 * cash-on-cash, risk, liquidity, concentration, target return, maximum loss,
 * holding period, exit strategy, legal review, tax review and governance status.
 *
 * The decision journal is the part that makes the rest honest. Before the
 * investment it records why, the thesis, what would prove it wrong, the major
 * assumptions, the risks, the maximum acceptable loss, the exit condition and —
 * unusually and deliberately — what emotions may be influencing the decision
 * (CAP-009). After it, it records what happened against what was expected, and
 * whether the thesis was wrong or the execution was.
 *
 * ============================ WHAT THIS IS NOT ================================
 *
 * Not a performance system of record. Realised gain of record is Finance OS's.
 * A valuation here is a mark with an epistemic class. Nothing here posts, and no
 * investment is approved by this module: approval is a governance act recorded
 * by a human (§24, §43).
 */

import {
  assertMinorUnits,
  cagrBps,
  cashOnCashBps,
  irrBps,
  npvMinor,
  ratioBps,
  roiBps,
  yieldBps,
  type CapitalEpistemicClass,
} from "./metrics";

export const FAMILY_INVESTMENT_ENGINE_VERSION = "family-investment-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Vocabularies                                                        */
/* ------------------------------------------------------------------ */

export const INVESTMENT_TYPES = [
  "REAL_ESTATE",
  "EQUITY_PRIVATE",
  "EQUITY_LISTED",
  "FIXED_INCOME",
  "FUND_INTEREST",
  "BUSINESS_ACQUISITION",
  "AGRICULTURAL",
  "INTELLECTUAL_PROPERTY",
  "CASH_EQUIVALENT",
  "OTHER",
] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

/** Liquidity classification. Determines the liquidity engine's bucketing. */
export const INVESTMENT_LIQUIDITY = [
  { code: "LIQUID", label: "Liquid", description: "Convertible to cash within 30 days without material loss of value." },
  { code: "NEAR_LIQUID", label: "Near-liquid", description: "Convertible within 180 days, subject to a known process." },
  { code: "ILLIQUID", label: "Illiquid", description: "Not convertible on a known timetable." },
] as const;
export type InvestmentLiquidityCode = (typeof INVESTMENT_LIQUIDITY)[number]["code"];

/** Governance status of the investment. Distinct from the accounting status. */
export const INVESTMENT_GOVERNANCE_STATUSES = [
  "IDEA",
  "SCREENING",
  "DUE_DILIGENCE",
  "COMMITTEE_REVIEW",
  "APPROVED",
  "APPROVED_WITH_CONDITIONS",
  "REJECTED",
  "DEFERRED",
  "EXECUTED",
  "MONITORED",
  "UNDER_REVIEW_FOR_EXIT",
  "EXITED",
  "WRITTEN_OFF",
] as const;
export type InvestmentGovernanceStatus = (typeof INVESTMENT_GOVERNANCE_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Thesis and counter-thesis (§10, CAP-008)                            */
/* ------------------------------------------------------------------ */

/**
 * An investment thesis.
 *
 * `counterThesis` is required, not optional. CAP-008 requires both, and a thesis
 * recorded without its counter-thesis is refused: the counter-thesis is what
 * makes the thesis falsifiable, and an unfalsifiable thesis cannot be monitored.
 */
export type InvestmentThesis = {
  id: string;
  investmentId: string;
  /** The affirmative case, in the author's own words. */
  thesis: string;
  /** The case against. Required — a thesis without one is refused. */
  counterThesis: string;
  /** What would prove the thesis wrong. Required: this is the falsification test. */
  falsificationTest: string;
  /** The major assumptions the thesis rests on. */
  majorAssumptions: readonly string[];
  /** The risks, each named. */
  risks: readonly string[];
  /** Maximum acceptable loss, minor units. Required by §11. */
  maximumAcceptableLossMinor: number;
  /** The exit condition: what makes the family sell. Required. */
  exitCondition: string;
  /** Target return, basis points. */
  targetReturnBps: number | null;
  /** Target holding period, months. */
  targetHoldingMonths: number | null;
  /** Who wrote it. Always a human; an AI author is refused by `assertThesisIsHuman`. */
  authorRef: string;
  authorType: "HUMAN" | "AI";
  asOf: string;
  /** Whether the thesis still holds, per the latest monitoring review. */
  status: "CURRENT" | "UNDER_REVIEW" | "INVALIDATED" | "SUPERSEDED";
};

/**
 * Refuse a thesis with no counter-thesis, no falsification test or an AI author.
 *
 * Three separate refusals, each load-bearing:
 *   - no counter-thesis ⇒ CAP-008 unmet, and the thesis cannot be monitored;
 *   - no falsification test ⇒ the thesis can never be shown wrong, so monitoring
 *     it is theatre;
 *   - an AI author ⇒ FIR-017: an analytical system may draft, but a thesis is a
 *     position the family takes, and taking it is a human act.
 */
export function assertThesisIsComplete(thesis: InvestmentThesis): readonly string[] {
  const findings: string[] = [];
  if (thesis.counterThesis.trim().length < 20) {
    findings.push("A counter-thesis is required (CAP-008). A thesis recorded without the case against it cannot be monitored, because nothing would show it wrong.");
  }
  if (thesis.falsificationTest.trim().length < 20) {
    findings.push("A falsification test is required: what would prove the thesis wrong? Without one the thesis is unfalsifiable and monitoring it is theatre.");
  }
  if (thesis.majorAssumptions.length === 0) {
    findings.push("The major assumptions must be named. An unstated assumption is the one that is never tested.");
  }
  if (thesis.risks.length === 0) {
    findings.push("The risks must be named.");
  }
  if (thesis.exitCondition.trim().length < 10) {
    findings.push("An exit condition is required (§11): what would make the family sell?");
  }
  assertMinorUnits(thesis.maximumAcceptableLossMinor, "maximumAcceptableLoss");
  if (thesis.maximumAcceptableLossMinor <= 0) {
    findings.push("The maximum acceptable loss must be a positive amount. 'No loss is acceptable' is not a risk limit, it is an absence of one.");
  }
  if (thesis.authorType !== "HUMAN") {
    findings.push("A thesis must be authored by a human (FIR-017). Noelia may draft and analyse; taking an investment position is a human act.");
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* The investment record                                               */
/* ------------------------------------------------------------------ */

export type InvestmentValuation = {
  valueMinor: number;
  basis: CapitalEpistemicClass;
  source: string;
  asOf: string;
  professionalValuationDocumentRef: string | null;
};

export type FamilyInvestment = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  countryCode: string;
  type: InvestmentType;
  name: string;
  /** Asset class for concentration analysis. */
  assetClass: string;
  currency: string;
  /** Acquisition cost, minor units. */
  acquisitionCostMinor: number;
  /** Cash the family actually invested, minor units. Differs from cost when leveraged. */
  cashInvestedMinor: number;
  acquisitionDate: string;
  /** Current valuation mark. Null before any mark exists. */
  valuation: InvestmentValuation | null;
  /** Realised gain or loss to date, minor units. Signed. */
  realisedGainMinor: number;
  /** Annual cash flow generated, minor units. */
  annualCashFlowMinor: number;
  /** Cash flow received to date, minor units. */
  realisedCashFlowMinor: number;
  /** Debt attributable to the position, minor units. */
  attributableDebtMinor: number;
  liquidity: InvestmentLiquidityCode;
  /** Annualised risk measure, basis points. A caller input, never inferred. */
  riskBps: number | null;
  governanceStatus: InvestmentGovernanceStatus;
  /** Holding period to date, whole years. */
  heldYears: number;
  exitStrategy: string | null;
  /** The exit value assumption used in IRR, minor units. */
  exitValueAssumptionMinor: number | null;
  legalReviewRef: string | null;
  taxReviewRef: string | null;
  /** The committee decision that authorised it. Required once past screening. */
  committeeDecisionRef: string | null;
  /** The authoritative Finance OS record. */
  financeRecordRef: string | null;
};

/** Governance statuses past which an authorising committee decision must exist. */
export const STATUSES_REQUIRING_COMMITTEE_DECISION: readonly InvestmentGovernanceStatus[] = [
  "APPROVED",
  "APPROVED_WITH_CONDITIONS",
  "EXECUTED",
  "MONITORED",
  "UNDER_REVIEW_FOR_EXIT",
  "EXITED",
];

/**
 * Validate an investment record.
 *
 * A record past screening with no committee decision is a governance defect the
 * moment it is recorded. A record with no legal or tax review is flagged but not
 * refused, because screening genuinely precedes those reviews — the flag exists
 * so the gap is visible rather than assumed closed.
 */
export function validateInvestment(investment: FamilyInvestment): readonly string[] {
  const findings: string[] = [];
  assertMinorUnits(investment.acquisitionCostMinor, "acquisitionCost");
  assertMinorUnits(investment.cashInvestedMinor, "cashInvested");
  assertMinorUnits(investment.realisedGainMinor, "realisedGain");
  assertMinorUnits(investment.annualCashFlowMinor, "annualCashFlow");
  assertMinorUnits(investment.realisedCashFlowMinor, "realisedCashFlow");
  assertMinorUnits(investment.attributableDebtMinor, "attributableDebt");

  if (investment.acquisitionCostMinor <= 0) findings.push("Acquisition cost must be positive.");
  if (investment.cashInvestedMinor <= 0) findings.push("Cash invested must be positive; it is the cash-on-cash denominator.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(investment.acquisitionDate)) findings.push(`Acquisition date must be ISO; received "${investment.acquisitionDate}".`);
  if (STATUSES_REQUIRING_COMMITTEE_DECISION.includes(investment.governanceStatus) && !investment.committeeDecisionRef) {
    findings.push(`An investment in ${investment.governanceStatus} must reference the committee decision that authorised it.`);
  }
  if (investment.governanceStatus === "EXECUTED" && !investment.financeRecordRef) {
    findings.push("An EXECUTED investment must reference the authoritative Finance OS record; otherwise the family cannot reconcile it.");
  }
  if (["EXECUTED", "MONITORED", "UNDER_REVIEW_FOR_EXIT", "EXITED"].includes(investment.governanceStatus) && !investment.legalReviewRef) {
    findings.push("A live investment with no legal review reference is unreviewed (CAP-011).");
  }
  if (["EXECUTED", "MONITORED", "UNDER_REVIEW_FOR_EXIT", "EXITED"].includes(investment.governanceStatus) && !investment.taxReviewRef) {
    findings.push("A live investment with no tax review reference is unreviewed (CAP-012).");
  }
  if (!investment.exitStrategy && ["EXECUTED", "MONITORED"].includes(investment.governanceStatus)) {
    findings.push("A live investment must record an exit strategy (§10). An exit decided under pressure is not a strategy.");
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Investment measures (§10)                                           */
/* ------------------------------------------------------------------ */

export type InvestmentMeasureSet = {
  engineVersion: string;
  investmentId: string;
  acquisitionCostMinor: number;
  currentValueMinor: number | null;
  /** Unrealised gain or loss. Null when no valuation exists. */
  unrealisedGainMinor: number | null;
  realisedGainMinor: number;
  /** Total gain, realised plus unrealised. */
  totalGainMinor: number | null;
  /** ROI on acquisition cost, basis points. */
  roiBps: number | null;
  /** Annual yield on current value, basis points. */
  yieldBps: number | null;
  /** Cash-on-cash on the cash actually invested, basis points. */
  cashOnCashBps: number | null;
  /** CAGR over the holding period, basis points. Null when undefined. */
  cagrBps: number | null;
  /** IRR including the exit assumption, basis points. Null when undefined. */
  irrBps: number | null;
  /** Cash received to date as a share of cash invested, basis points. */
  cashReturnToBps: number | null;
  /** Attributable debt as a share of current value, basis points. */
  ltvBps: number | null;
  /** Net position: value plus realised cash flow less cost, minor units. */
  netPositionMinor: number | null;
  /** Basis of every value in this set. */
  basis: CapitalEpistemicClass;
  missingInputs: string[];
  explanation: string[];
};

/**
 * Compute the investment measure set (§10).
 *
 * Every ratio is `null` when its input is absent, and the absence is named. A
 * position with no valuation is reported as unvalued, never as flat: "we have
 * not marked it" and "it has not moved" are different governance statements, and
 * only one of them is true.
 */
export function measureInvestment(investment: FamilyInvestment): InvestmentMeasureSet {
  const findings = validateInvestment(investment);
  const value = investment.valuation?.valueMinor ?? null;
  const missingInputs: string[] = [];
  if (value === null) missingInputs.push("No valuation mark exists, so unrealised gain, ROI, yield, CAGR and LTV are undefined.");
  if (investment.exitValueAssumptionMinor === null) missingInputs.push("No exit value assumption, so IRR is undefined.");
  if (investment.heldYears === 0) missingInputs.push("Holding period is zero, so CAGR is undefined.");
  if (findings.length > 0) missingInputs.push(`Record findings: ${findings.join(" ")}`);

  const unrealised = value !== null ? value - investment.acquisitionCostMinor : null;
  const totalGain = unrealised !== null ? unrealised + investment.realisedGainMinor : null;

  let irr: number | null = null;
  if (investment.exitValueAssumptionMinor !== null && investment.heldYears > 0) {
    const flows = [-investment.acquisitionCostMinor];
    const annualFlow = Math.round(investment.realisedCashFlowMinor / Math.max(investment.heldYears, 1));
    for (let i = 0; i < investment.heldYears; i += 1) flows.push(annualFlow);
    flows[flows.length - 1] += investment.exitValueAssumptionMinor;
    irr = irrBps(flows);
  }

  return {
    engineVersion: FAMILY_INVESTMENT_ENGINE_VERSION,
    investmentId: investment.id,
    acquisitionCostMinor: investment.acquisitionCostMinor,
    currentValueMinor: value,
    unrealisedGainMinor: unrealised,
    realisedGainMinor: investment.realisedGainMinor,
    totalGainMinor: totalGain,
    roiBps: totalGain !== null ? roiBps(totalGain, investment.acquisitionCostMinor) : null,
    yieldBps: value !== null ? yieldBps(investment.annualCashFlowMinor, value) : null,
    cashOnCashBps: cashOnCashBps(investment.annualCashFlowMinor, investment.cashInvestedMinor),
    cagrBps: value !== null && investment.heldYears > 0 ? cagrBps(investment.acquisitionCostMinor, value, investment.heldYears) : null,
    irrBps: irr,
    cashReturnToBps: ratioBps(investment.realisedCashFlowMinor, investment.cashInvestedMinor),
    ltvBps: value !== null ? ratioBps(investment.attributableDebtMinor, value) : null,
    netPositionMinor: value !== null ? value + investment.realisedCashFlowMinor - investment.acquisitionCostMinor : null,
    basis: investment.valuation?.basis ?? "DATA_NOT_AVAILABLE",
    missingInputs,
    explanation: [
      `Cost ${investment.acquisitionCostMinor}; cash invested ${investment.cashInvestedMinor}; realised gain ${investment.realisedGainMinor}; realised cash flow ${investment.realisedCashFlowMinor}.`,
      value !== null ? `Current mark ${value} (basis ${investment.valuation?.basis}, source ${investment.valuation?.source}); unrealised ${unrealised}; total gain ${totalGain}.` : "No valuation mark: unrealised gain, ROI, yield, CAGR and LTV are undefined rather than assumed flat.",
      irr !== null ? `IRR ${irr} bps over ${investment.heldYears} year(s), including the exit assumption. The exit value is an ASSUMPTION, so the IRR is a function of it.` : "IRR undefined.",
      `Cash-on-cash ${investment.annualCashFlowMinor}/${investment.cashInvestedMinor}: the denominator is cash in, not total cost, which is why a leveraged position can show a high cash-on-cash and a modest ROI at once.`,
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Portfolio aggregation                                               */
/* ------------------------------------------------------------------ */

export type PortfolioConcentration = {
  key: string;
  label: string;
  valueMinor: number;
  shareBps: number | null;
  investmentIds: string[];
};

export type PortfolioSummary = {
  engineVersion: string;
  asOf: string;
  /** Per currency. No cross-currency total: no FX rate has been ratified. */
  byCurrency: { currency: string; costMinor: number; valueMinor: number | null; count: number }[];
  totalCostMinor: number;
  /** Null when ANY position is unmarked, because a partial total is a misleading one. */
  totalValueMinor: number | null;
  /** Names the unmarked positions, so a missing total is attributable. */
  unmarkedInvestmentIds: string[];
  totalRealisedGainMinor: number;
  totalUnrealisedGainMinor: number | null;
  totalAnnualCashFlowMinor: number;
  /** Portfolio yield on marked value, basis points. */
  portfolioYieldBps: number | null;
  /** Portfolio cash-on-cash, basis points. */
  portfolioCashOnCashBps: number | null;
  byAssetClass: PortfolioConcentration[];
  byCountry: PortfolioConcentration[];
  byLegalEntity: PortfolioConcentration[];
  byLiquidity: PortfolioConcentration[];
  /** The single largest position's share, basis points — the headline concentration. */
  largestPositionShareBps: number | null;
  largestPositionId: string | null;
  /** Positions whose governance status requires a committee decision but has none. */
  governanceGaps: { investmentId: string; finding: string }[];
  explanation: string[];
};

/**
 * Aggregate a portfolio with concentration by asset class, country, entity and
 * liquidity.
 *
 * `totalValueMinor` is `null` when any position is unmarked, and the unmarked
 * positions are named. A total that silently omits unmarked positions understates
 * the portfolio and every concentration ratio derived from it, which is the one
 * aggregation error that makes a risk report actively misleading.
 */
export function summarisePortfolio(investments: readonly FamilyInvestment[], asOf: string): PortfolioSummary {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`asOf must be an ISO date; received "${asOf}".`);
  const unmarked = investments.filter((i) => i.valuation === null);
  const totalCost = investments.reduce((s, i) => s + i.acquisitionCostMinor, 0);
  const totalValue = unmarked.length === 0 ? investments.reduce((s, i) => s + (i.valuation?.valueMinor ?? 0), 0) : null;
  const totalCashFlow = investments.reduce((s, i) => s + i.annualCashFlowMinor, 0);
  const totalCashInvested = investments.reduce((s, i) => s + i.cashInvestedMinor, 0);

  const group = (keyOf: (i: FamilyInvestment) => string, labelOf: (k: string) => string): PortfolioConcentration[] => {
    const map = new Map<string, { value: number; ids: string[] }>();
    for (const i of investments) {
      const key = keyOf(i);
      const entry = map.get(key) ?? { value: 0, ids: [] };
      entry.value += i.valuation?.valueMinor ?? i.acquisitionCostMinor;
      entry.ids.push(i.id);
      map.set(key, entry);
    }
    const basis = totalValue ?? investments.reduce((s, i) => s + (i.valuation?.valueMinor ?? i.acquisitionCostMinor), 0);
    return [...map.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([key, v]) => ({ key, label: labelOf(key), valueMinor: v.value, shareBps: ratioBps(v.value, basis), investmentIds: v.ids }));
  };

  const positions = investments
    .map((i) => ({ id: i.id, value: i.valuation?.valueMinor ?? i.acquisitionCostMinor }))
    .sort((a, b) => b.value - a.value);
  const concentrationBasis = totalValue ?? positions.reduce((s, p) => s + p.value, 0);

  const governanceGaps = investments.flatMap((i) => validateInvestment(i).map((f) => ({ investmentId: i.id, finding: f })));

  return {
    engineVersion: FAMILY_INVESTMENT_ENGINE_VERSION,
    asOf,
    byCurrency: [...new Set(investments.map((i) => i.currency))].sort().map((currency) => {
      const rows = investments.filter((i) => i.currency === currency);
      const unmarkedInCurrency = rows.filter((i) => i.valuation === null).length;
      return {
        currency,
        costMinor: rows.reduce((s, i) => s + i.acquisitionCostMinor, 0),
        valueMinor: unmarkedInCurrency === 0 ? rows.reduce((s, i) => s + (i.valuation?.valueMinor ?? 0), 0) : null,
        count: rows.length,
      };
    }),
    totalCostMinor: totalCost,
    totalValueMinor: totalValue,
    unmarkedInvestmentIds: unmarked.map((i) => i.id),
    totalRealisedGainMinor: investments.reduce((s, i) => s + i.realisedGainMinor, 0),
    totalUnrealisedGainMinor: totalValue !== null ? totalValue - totalCost : null,
    totalAnnualCashFlowMinor: totalCashFlow,
    portfolioYieldBps: totalValue !== null ? yieldBps(totalCashFlow, totalValue) : null,
    portfolioCashOnCashBps: cashOnCashBps(totalCashFlow, totalCashInvested),
    byAssetClass: group((i) => i.assetClass, (k) => k),
    byCountry: group((i) => i.countryCode, (k) => k),
    byLegalEntity: group((i) => i.legalEntityId, (k) => k),
    byLiquidity: group((i) => i.liquidity, (k) => INVESTMENT_LIQUIDITY.find((l) => l.code === k)?.label ?? k),
    largestPositionShareBps: positions.length > 0 ? ratioBps(positions[0].value, concentrationBasis) : null,
    largestPositionId: positions[0]?.id ?? null,
    governanceGaps,
    explanation: [
      `${investments.length} position(s), total cost ${totalCost}.`,
      totalValue !== null
        ? `Total marked value ${totalValue}; unrealised ${totalValue - totalCost}; realised ${investments.reduce((s, i) => s + i.realisedGainMinor, 0)}.`
        : `Total value is NOT reported: ${unmarked.length} position(s) are unmarked (${unmarked.map((i) => i.id).join(", ")}). A total that omits them would understate the portfolio and every concentration ratio derived from it.`,
      "Concentration shares use marked value where it exists and acquisition cost where it does not, so a share is always computed — but it is only comparable across positions once every position is marked.",
      "Totals are per currency. No cross-currency total is produced because no FX rate has been ratified.",
      governanceGaps.length > 0 ? `${governanceGaps.length} record finding(s) across the portfolio.` : "No record findings.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* §11 — Decision journal                                              */
/* ------------------------------------------------------------------ */

/**
 * The pre-investment questions (§11). Every one is required before an
 * investment may be presented to committee.
 */
export const PRE_INVESTMENT_QUESTIONS = [
  { key: "why", question: "Why are we doing this?" },
  { key: "thesis", question: "What is the thesis?" },
  { key: "falsification", question: "What could prove the thesis wrong?" },
  { key: "assumptions", question: "What are the major assumptions?" },
  { key: "risks", question: "What are the risks?" },
  { key: "maximumLoss", question: "What is the maximum acceptable loss?" },
  { key: "exitCondition", question: "What is the exit condition?" },
  { key: "emotions", question: "What emotions may be influencing this decision?" },
] as const;
export type PreInvestmentQuestionKey = (typeof PRE_INVESTMENT_QUESTIONS)[number]["key"];

/**
 * The post-investment questions (§11, CAP-010). Asked after the fact, against
 * what was written before it.
 */
export const POST_INVESTMENT_QUESTIONS = [
  { key: "whatHappened", question: "What happened?" },
  { key: "expected", question: "What did we expect?" },
  { key: "unexpected", question: "What was unexpected?" },
  { key: "thesisWrong", question: "Was the thesis wrong?" },
  { key: "executionWrong", question: "Was the execution wrong?" },
  { key: "learned", question: "What did we learn?" },
] as const;
export type PostInvestmentQuestionKey = (typeof POST_INVESTMENT_QUESTIONS)[number]["key"];

/**
 * The outcome attribution for a post-investment review.
 *
 * Distinguishing a wrong thesis from wrong execution is the whole value of the
 * review: a wrong thesis means the analysis was bad, wrong execution means the
 * analysis was sound and the implementation was not, and treating them the same
 * teaches the family the wrong lesson. `BOTH` and `NEITHER` exist because they
 * are real outcomes and forcing a single cause would be a fabrication.
 */
export const REVIEW_OUTCOMES = [
  { code: "THESIS_CORRECT_EXECUTION_CORRECT", label: "Thesis sound, execution sound" },
  { code: "THESIS_CORRECT_EXECUTION_WRONG", label: "Thesis sound, execution wrong" },
  { code: "THESIS_WRONG_EXECUTION_CORRECT", label: "Thesis wrong, execution sound" },
  { code: "THESIS_WRONG_EXECUTION_WRONG", label: "Thesis wrong, execution wrong" },
  { code: "INDETERMINATE", label: "Cannot be attributed" },
] as const;
export type ReviewOutcomeCode = (typeof REVIEW_OUTCOMES)[number]["code"];

export type PreInvestmentJournalEntry = {
  id: string;
  investmentId: string;
  tenantId: string;
  /** Answers keyed by question. Free text; the engine checks presence, not quality. */
  answers: Partial<Record<PreInvestmentQuestionKey, string>>;
  /** Always a human. FIR-017: Noelia may draft; deciding is human. */
  authorRef: string;
  authorType: "HUMAN" | "AI";
  /** The emotion disclosure (CAP-009). Required, and required to be non-empty. */
  emotionDisclosure: string;
  asOf: string;
};

export type PostInvestmentReview = {
  id: string;
  investmentId: string;
  /** The pre-investment entry this review is measured against. Required. */
  preInvestmentEntryId: string;
  tenantId: string;
  answers: Partial<Record<PostInvestmentQuestionKey, string>>;
  outcome: ReviewOutcomeCode;
  /** What the family will do differently. Required — a lesson not applied is not learned. */
  lessonsApplied: readonly string[];
  /** Measured outcome at review time, minor units. */
  realisedGainMinor: number;
  /** The thesis's stated maximum acceptable loss, for comparison. */
  maximumAcceptableLossMinor: number;
  /** True when the realised loss exceeded the stated maximum. */
  maximumLossBreached: boolean;
  reviewerRef: string;
  reviewerType: "HUMAN" | "AI";
  asOf: string;
};

/**
 * Validate a pre-investment journal entry.
 *
 * Every one of the eight questions must be answered. The emotion disclosure is
 * required and must be non-empty: CAP-009 exists because the question is
 * uncomfortable, and a journal that lets it be skipped is a journal that does
 * not do its job.
 */
export function validatePreInvestmentEntry(entry: PreInvestmentJournalEntry): readonly string[] {
  const findings: string[] = [];
  for (const q of PRE_INVESTMENT_QUESTIONS) {
    const answer = entry.answers[q.key];
    if (typeof answer !== "string" || answer.trim().length < 10) {
      findings.push(`"${q.question}" is unanswered or too brief to be an answer.`);
    }
  }
  if (entry.emotionDisclosure.trim().length < 5) {
    findings.push("The emotion disclosure is required and must be non-empty (CAP-009). The question is uncomfortable; that is why it is asked.");
  }
  if (entry.authorType !== "HUMAN") {
    findings.push("A decision journal entry must be authored by a human (FIR-017). Noelia may draft an entry for a human to adopt; it cannot author the family's reasoning.");
  }
  return findings;
}

/**
 * Validate a post-investment review.
 *
 * It must reference the pre-investment entry it is measured against, answer all
 * six questions, state an outcome attribution, and name at least one lesson
 * applied. A review that names no lesson is a record, not a learning.
 */
export function validatePostInvestmentReview(review: PostInvestmentReview): readonly string[] {
  const findings: string[] = [];
  for (const q of POST_INVESTMENT_QUESTIONS) {
    const answer = review.answers[q.key];
    if (typeof answer !== "string" || answer.trim().length < 10) {
      findings.push(`"${q.question}" is unanswered or too brief to be an answer.`);
    }
  }
  if (!review.preInvestmentEntryId.trim()) {
    findings.push("A post-investment review must reference the pre-investment entry it is measured against. Without it there is no baseline and the review cannot say whether the thesis was wrong.");
  }
  if (review.lessonsApplied.length === 0) {
    findings.push("At least one lesson applied must be named (CAP-010). A review that names no lesson is a record, not a learning.");
  }
  if (review.reviewerType !== "HUMAN") {
    findings.push("A post-investment review must be signed by a human (FIR-017).");
  }
  assertMinorUnits(review.realisedGainMinor, "realisedGain");
  assertMinorUnits(review.maximumAcceptableLossMinor, "maximumAcceptableLoss");
  return findings;
}

/**
 * Compare what was written before the investment with what happened.
 *
 * Returns the factual deltas — loss against the stated maximum, the falsification
 * test as written, the exit condition as written — without judging them. Whether
 * the thesis was wrong is the reviewer's recorded attribution, not the engine's
 * inference: an engine that concluded "the thesis was wrong" would be making the
 * judgement CAP-010 assigns to a human.
 */
export function compareAgainstJournal(params: {
  pre: PreInvestmentJournalEntry;
  post: PostInvestmentReview;
  thesis: InvestmentThesis | null;
}): {
  engineVersion: string;
  /** Realised gain at review, minor units. */
  realisedGainMinor: number;
  /** The stated maximum acceptable loss, minor units. */
  maximumAcceptableLossMinor: number | null;
  /** True when the realised outcome breached the stated maximum. */
  maximumLossBreached: boolean;
  /** The falsification test as written before the investment. */
  falsificationTestAsWritten: string | null;
  /** The exit condition as written before the investment. */
  exitConditionAsWritten: string | null;
  /** The reviewer's own attribution. Never inferred by the engine. */
  recordedOutcome: ReviewOutcomeCode;
  /** Lessons the reviewer named. */
  lessonsApplied: readonly string[];
  /** Always false: the engine never attributes the outcome itself. */
  outcomeInferredByEngine: false;
  explanation: string[];
} {
  const maxLoss = params.thesis?.maximumAcceptableLossMinor ?? null;
  const breached = maxLoss !== null && params.post.realisedGainMinor < -maxLoss;

  return {
    engineVersion: FAMILY_INVESTMENT_ENGINE_VERSION,
    realisedGainMinor: params.post.realisedGainMinor,
    maximumAcceptableLossMinor: maxLoss,
    maximumLossBreached: breached,
    falsificationTestAsWritten: params.thesis?.falsificationTest ?? null,
    exitConditionAsWritten: params.thesis?.exitCondition ?? null,
    recordedOutcome: params.post.outcome,
    lessonsApplied: params.post.lessonsApplied,
    outcomeInferredByEngine: false,
    explanation: [
      `Realised outcome ${params.post.realisedGainMinor} against a stated maximum acceptable loss of ${maxLoss ?? "not recorded"}.`,
      breached
        ? `The stated maximum acceptable loss was BREACHED by ${-params.post.realisedGainMinor - (maxLoss ?? 0)}. That is a fact about the record, and it is exactly what the journal exists to surface.`
        : maxLoss !== null
          ? "The stated maximum acceptable loss was not breached."
          : "No maximum acceptable loss was recorded before the investment, so breach cannot be assessed. That absence is itself the finding.",
      params.thesis ? `Falsification test as written: "${params.thesis.falsificationTest}". Exit condition as written: "${params.thesis.exitCondition}".` : "No thesis record was supplied, so the pre-investment commitments cannot be quoted.",
      `Outcome attribution "${params.post.outcome}" is the reviewer's, not the engine's. Whether the thesis was wrong or the execution was is a human judgement (CAP-010).`,
    ],
  };
}

export { npvMinor };
