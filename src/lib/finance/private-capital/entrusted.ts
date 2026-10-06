/**
 * BEYU OS — CAPITAL FORMATION & FIDUCIARY CAPITAL.
 *
 * FINANCE_OS → Capital Management → Capital Formation & Fiduciary Capital.
 *
 * ============================ WHAT THIS REPLACES =============================
 *
 * The programme deliberately does NOT introduce "Other People's Money" as a legal or accounting
 * category. It is informal, it is not a class any regulator recognises, and — most importantly — it
 * invites exactly the failure this module exists to prevent: treating capital BEYU holds on someone
 * else's behalf as though it were BEYU's own.
 *
 * The governed category is FIDUCIARY CAPITAL: capital for which BEYU is accountable to another party.
 * This module keeps four things apart, always:
 *
 *   OWNERSHIP          whose money is it in law and in beneficial interest
 *   CONTROL            who decides how it is deployed (BEYU may control capital it does not own)
 *   RESTRICTION        what the capital may and may not be used for
 *   ACCOUNTING         which ledger accounts carry it (Finance OS — never this module)
 *
 * ============================ THE SEPARATION LAW =============================
 *
 * `classifyCapitalOrigin()` returns exactly one origin for every arrangement, and
 * `assertCapitalSeparation()` REFUSES any portfolio view that mixes BEYU-OWNED capital with
 * FIDUCIARY capital into one total. A single "total capital" line that adds a fund's LP money to
 * BEYU's own balance sheet overstates BEYU's own resources; it is the most consequential number a
 * capital-formation system can get wrong.
 *
 * MONEY IS NOT MOVED HERE. This module records arrangements, mandates, commitments, drawdowns and the
 * fiduciary restrictions that govern them. Finance OS owns every ledger entry (§54).
 */
import { FinanceArithmeticError, assertMoney, assertPercent, multiple } from "../intelligence/arithmetic";
import type { MetricInput, MetricOutcome, MetricSeedBase } from "../intelligence/provenance";
import { calculated, invalid, missing, seedFor } from "../intelligence/provenance";

export const ENTRUSTED_CAPITAL_VERSION = "entrusted-capital-1.0.0";

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * Where capital came from, in consequence terms.
 *
 *   OWN  — BEYU's own capital. Its loss is BEYU's loss; no external party has a claim on it.
 *   FIDUCIARY — capital BEYU manages for another party. Its loss is a breach of duty.
 *   PROJECT — non-recourse project finance. Lenders look to the project's cash flows, not BEYU's balance
 *             sheet; the ring-fence is a legal fact, not a modelling convenience.
 *   GUARANTEED — BEYU-provided guarantees and credit support. No cash is received, but a contingent
 *             liability is created that is reportable in its own right.
 */
export const CAPITAL_ORIGIN = ["OWN", "FIDUCIARY", "PROJECT", "GUARANTEED"] as const;
export type CapitalOrigin = (typeof CAPITAL_ORIGIN)[number];

/** Capital origins that must never be aggregated into a BEYU-owned total. */
export const NON_OWN_ORIGINS: readonly CapitalOrigin[] = ["FIDUCIARY", "PROJECT", "GUARANTEED"];

/**
 * The instrument classes the programme's list resolves into. Each maps to exactly one origin, so an
 * arrangement can never be classified two ways.
 */
export const CAPITAL_INSTRUMENT = [
  "EXTERNAL_INVESTOR_EQUITY",
  "LP_COMMITMENT",
  "CO_INVESTMENT",
  "THIRD_PARTY_DEBT",
  "PROJECT_FINANCE",
  "MANAGED_CAPITAL",
  "ENTRUSTED_FUND",
  "INVESTMENT_MANDATE",
  "GUARANTEE",
  "CREDIT_FACILITY",
  "EXTERNAL_FINANCING",
  "CAPITAL_COMMITMENT",
] as const;
export type CapitalInstrument = (typeof CAPITAL_INSTRUMENT)[number];

const INSTRUMENT_ORIGIN: Readonly<Record<CapitalInstrument, CapitalOrigin>> = {
  EXTERNAL_INVESTOR_EQUITY: "FIDUCIARY",
  LP_COMMITMENT: "FIDUCIARY",
  CO_INVESTMENT: "FIDUCIARY",
  THIRD_PARTY_DEBT: "PROJECT",
  PROJECT_FINANCE: "PROJECT",
  MANAGED_CAPITAL: "FIDUCIARY",
  ENTRUSTED_FUND: "FIDUCIARY",
  INVESTMENT_MANDATE: "FIDUCIARY",
  GUARANTEE: "GUARANTEED",
  CREDIT_FACILITY: "PROJECT",
  EXTERNAL_FINANCING: "PROJECT",
  CAPITAL_COMMITMENT: "FIDUCIARY",
};

/**
 * The origin of a capital instrument.
 *
 * Total and deterministic: every instrument in the closed catalogue maps to exactly one origin, so
 * there is no arrangement whose ownership consequence is "unclassified".
 */
export function classifyCapitalOrigin(instrument: CapitalInstrument): CapitalOrigin {
  const origin = INSTRUMENT_ORIGIN[instrument];
  if (!origin) {
    throw new FinanceArithmeticError("INVALID_RATIO", `Instrument '${String(instrument)}' is not in the governed capital-instrument catalogue.`, {
      instrument,
    });
  }
  return origin;
}

/* ------------------------------------------------------------------ */
/* Arrangements                                                        */
/* ------------------------------------------------------------------ */

/**
 * One capital arrangement.
 *
 * `beneficialOwnerPartyId` is optional because the beneficial owner behind a nominee is not always
 * disclosed TO BEYU — but where an authorized user IS entitled to it, the field carries it, and its
 * absence is recorded rather than elided. §10 requires the field to exist and be governed, not to be
 * universally populated.
 */
export type CapitalArrangement = {
  id: string;
  instrument: CapitalInstrument;
  /** The legal entity that holds or owes the capital. */
  legalEntityId: string;
  /** The party that provided the capital (an LP, a lender, a guarantor). */
  providerPartyId: string;
  /** The party who economically owns the capital, when known and authorized to be recorded. */
  beneficialOwnerPartyId?: string | null;
  /** Currency. Never mixed across an aggregation. */
  currency: string;
  /** Committed amount, minor units. Zero for an undrawn credit facility or a pure guarantee. */
  commitmentMinor: number;
  /** Amount actually drawn. */
  drawnMinor: number;
  /** Restrictions on use, as free-text policy references — never as arithmetic. */
  restrictions: readonly string[];
  /** Stated purpose of the capital. */
  purpose: string;
  /** Maturity date, ISO-8601, or null for perpetual capital. */
  maturityDate?: string | null;
  /** Governing agreement reference (a contract register id). */
  governingAgreementRef?: string | null;
  /** Covenant references. */
  covenantRefs?: readonly string[];
  /** Whether repayment is contractually required. */
  repayable: boolean;
  /** Contractual return, basis points per annum. Null when the return is not a rate (equity returns). */
  returnRateBps?: number | null;
  /** Fee rate, basis points per annum. */
  feeRateBps?: number | null;
  /** Fiduciary restrictions that apply beyond the use restrictions — e.g. permitted-investment lists. */
  fiduciaryRestrictions?: readonly string[];
  /** Approval reference: the resolution or committee decision authorizing this arrangement. */
  approvalRef?: string | null;
  /** Lifecycle state. */
  status: "PROPOSED" | "APPROVED" | "ACTIVE" | "MATURED" | "REPAID" | "CANCELLED";
};

export type CapitalPosition = {
  arrangementId: string;
  instrument: CapitalInstrument;
  origin: CapitalOrigin;
  currency: string;
  commitmentMinor: number;
  drawnMinor: number;
  undrawnMinor: number;
  /** Drawn ÷ commitment, fixed-point. Null for a pure guarantee (no drawable commitment). */
  utilisationScaled: number | null;
  repayable: boolean;
  maturityDate: string | null;
  /** Days to maturity from the supplied asOf date. Null when perpetual or no as-of date. */
  daysToMaturity: number | null;
  restrictions: readonly string[];
  fiduciaryRestrictions: readonly string[];
  /** True when the arrangement lacks an approval reference while being ACTIVE. */
  approvalGap: boolean;
};

/**
 * Validate one arrangement. Returns findings; an empty array means it is internally consistent.
 *
 * Structural faults THROW (a commitment that is negative, a currency that is empty). Governance gaps
 * — an ACTIVE arrangement with no approval reference, a FIDUCIARY arrangement with no stated purpose —
 * are RETURNED, because they are findings a governance report must be able to enumerate rather than
 * crashes that hide the rest of the portfolio.
 */
export function validateArrangement(arrangement: CapitalArrangement): string[] {
  const findings: string[] = [];
  assertMoney(arrangement.commitmentMinor, `${arrangement.id}.commitmentMinor`, { allowNegative: false });
  assertMoney(arrangement.drawnMinor, `${arrangement.id}.drawnMinor`, { allowNegative: false });
  if (!arrangement.currency || arrangement.currency.trim().length !== 3) {
    throw new FinanceArithmeticError("INVALID_MONEY", `Arrangement ${arrangement.id} must carry a 3-letter ISO-4217 currency.`, { id: arrangement.id });
  }
  if (arrangement.drawnMinor > arrangement.commitmentMinor) {
    throw new FinanceArithmeticError(
      "INVALID_MONEY",
      `Arrangement ${arrangement.id} has drawn ${arrangement.drawnMinor} against a commitment of ${arrangement.commitmentMinor}.`,
      { id: arrangement.id },
    );
  }
  if (arrangement.returnRateBps !== null && arrangement.returnRateBps !== undefined) {
    assertPercent(arrangement.returnRateBps, `${arrangement.id}.returnRateBps`);
  }
  if (arrangement.feeRateBps !== null && arrangement.feeRateBps !== undefined) {
    assertPercent(arrangement.feeRateBps, `${arrangement.id}.feeRateBps`, { allowNegative: false });
  }
  if (!arrangement.purpose || arrangement.purpose.trim().length < 4) {
    findings.push(`Arrangement ${arrangement.id} states no purpose for the capital.`);
  }
  const origin = classifyCapitalOrigin(arrangement.instrument);
  if (origin !== "OWN" && arrangement.restrictions.length === 0) {
    findings.push(
      `Arrangement ${arrangement.id} is ${origin} capital but declares no use restrictions. Fiduciary and project capital must state what it may be used for.`,
    );
  }
  if (arrangement.status === "ACTIVE" && !arrangement.approvalRef) {
    findings.push(`Arrangement ${arrangement.id} is ACTIVE without an approval reference. Every active capital arrangement must cite the authority that approved it.`);
  }
  if (origin === "FIDUCIARY" && (arrangement.fiduciaryRestrictions ?? []).length === 0) {
    findings.push(
      `Arrangement ${arrangement.id} is FIDUCIARY capital without declared fiduciary restrictions. A managed mandate that does not state its permitted universe cannot be monitored against it.`,
    );
  }
  if (arrangement.providerPartyId === arrangement.beneficialOwnerPartyId && origin === "FIDUCIARY" && !arrangement.beneficialOwnerPartyId) {
    findings.push(`Arrangement ${arrangement.id}: the beneficial owner is not recorded. Where it is authorized to be known, it must be.`);
  }
  return findings;
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/** Derive the position of one arrangement at a point in time. Pure. */
export function capitalPosition(params: { arrangement: CapitalArrangement; asOf?: string | null }): CapitalPosition {
  const a = params.arrangement;
  const utilisation = multiple(a.drawnMinor, a.commitmentMinor);
  return {
    arrangementId: a.id,
    instrument: a.instrument,
    origin: classifyCapitalOrigin(a.instrument),
    currency: a.currency,
    commitmentMinor: a.commitmentMinor,
    drawnMinor: a.drawnMinor,
    undrawnMinor: a.commitmentMinor - a.drawnMinor,
    utilisationScaled: utilisation.kind === "MULTIPLE" ? utilisation.scaled : null,
    repayable: a.repayable,
    maturityDate: a.maturityDate ?? null,
    daysToMaturity: a.maturityDate && params.asOf ? daysBetween(params.asOf, a.maturityDate) : null,
    restrictions: a.restrictions,
    fiduciaryRestrictions: a.fiduciaryRestrictions ?? [],
    approvalGap: a.status === "ACTIVE" && !a.approvalRef,
  };
}

/* ------------------------------------------------------------------ */
/* Separation                                                          */
/* ------------------------------------------------------------------ */

export type CapitalOriginTotals = {
  origin: CapitalOrigin;
  currency: string;
  arrangements: number;
  commitmentMinor: number;
  drawnMinor: number;
  undrawnMinor: number;
};

export type CapitalPortfolio = {
  currency: string;
  totals: CapitalOriginTotals[];
  /** BEYU's own capital. NEVER includes fiduciary, project or guaranteed capital. */
  ownDrawnMinor: number;
  /** Capital BEYU is accountable for but does not own. */
  fiduciaryDrawnMinor: number;
  projectDrawnMinor: number;
  /** The face value of contingent liabilities created by guarantees. */
  guaranteedNotionalMinor: number;
  /** Findings from validating every arrangement. */
  findings: string[];
  /** Arrangements whose currency differs from the reporting currency; they are EXCLUDED from totals. */
  excluded: { arrangementId: string; reason: string }[];
};

/**
 * Aggregate a portfolio of capital arrangements, keeping origins apart.
 *
 * `assertCapitalSeparation` is applied at the end: the returned object exposes `ownDrawnMinor`
 * separately from every non-own figure, and there is deliberately NO `totalDrawnMinor`. There is no
 * property a caller could read as "all of BEYU's capital" that silently includes money BEYU merely
 * manages.
 */
export function aggregateCapitalPortfolio(params: {
  arrangements: readonly CapitalArrangement[];
  reportingCurrency: string;
  asOf?: string | null;
}): CapitalPortfolio {
  const findings: string[] = [];
  const excluded: { arrangementId: string; reason: string }[] = [];
  const byOrigin = new Map<CapitalOrigin, CapitalOriginTotals>();

  for (const arrangement of params.arrangements) {
    findings.push(...validateArrangement(arrangement));
    if (arrangement.currency.toUpperCase() !== params.reportingCurrency.toUpperCase()) {
      excluded.push({
        arrangementId: arrangement.id,
        reason: `Denominated in ${arrangement.currency}; the portfolio reports in ${params.reportingCurrency}. Convert with a governed FX rate before aggregating.`,
      });
      continue;
    }
    const origin = classifyCapitalOrigin(arrangement.instrument);
    const bucket = byOrigin.get(origin) ?? {
      origin,
      currency: params.reportingCurrency,
      arrangements: 0,
      commitmentMinor: 0,
      drawnMinor: 0,
      undrawnMinor: 0,
    };
    bucket.arrangements += 1;
    bucket.commitmentMinor += arrangement.commitmentMinor;
    bucket.drawnMinor += arrangement.drawnMinor;
    bucket.undrawnMinor += arrangement.commitmentMinor - arrangement.drawnMinor;
    byOrigin.set(origin, bucket);
  }

  const totals = [...byOrigin.values()].sort((a, b) => (a.origin < b.origin ? -1 : 1));
  const pick = (origin: CapitalOrigin): number => byOrigin.get(origin)?.drawnMinor ?? 0;
  const portfolio: CapitalPortfolio = {
    currency: params.reportingCurrency,
    totals,
    ownDrawnMinor: pick("OWN"),
    fiduciaryDrawnMinor: pick("FIDUCIARY"),
    projectDrawnMinor: pick("PROJECT"),
    guaranteedNotionalMinor: pick("GUARANTEED"),
    findings,
    excluded,
  };
  assertCapitalSeparation(portfolio);
  return portfolio;
}

/**
 * Refuse a portfolio in which fiduciary, project or guaranteed capital has been folded into ownership.
 *
 * This is a guard rather than an assertion of style. A caller that constructs a `CapitalPortfolio`
 * by hand — or a future refactor that adds a convenience `totalDrawnMinor` — fails here.
 */
export function assertCapitalSeparation(portfolio: Pick<CapitalPortfolio, "ownDrawnMinor" | "fiduciaryDrawnMinor" | "projectDrawnMinor" | "guaranteedNotionalMinor">): void {
  // ONLY the four origin totals are amounts. A portfolio also carries its currency, its per-origin
  // table and its findings — inspecting every property would reject its own currency code, and a guard
  // that fires on a legitimate object is a guard that gets deleted.
  const originTotals = ["ownDrawnMinor", "fiduciaryDrawnMinor", "projectDrawnMinor", "guaranteedNotionalMinor"] as const;
  for (const label of originTotals) {
    const value = (portfolio as Record<string, unknown>)[label];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new FinanceArithmeticError("INVALID_MONEY", `Capital origin total '${label}' must be a non-negative integer in minor units, received ${String(value)}.`, { label });
    }
  }
  const anyRecord = Object.prototype.hasOwnProperty.call(portfolio, "totalDrawnMinor") || Object.prototype.hasOwnProperty.call(portfolio, "totalCapitalMinor");
  if (anyRecord) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      "A capital portfolio must not expose a single combined 'total' figure: BEYU-owned capital and fiduciary capital are different claims and may never be summed into one number.",
      {},
    );
  }
}

/* ------------------------------------------------------------------ */
/* Fiduciary performance reporting (governed, never a ledger)          */
/* ------------------------------------------------------------------ */

export type FiduciaryReportParams = {
  seed: MetricSeedBase;
  portfolio: CapitalPortfolio;
  /** Contractual returns payable on drawn fiduciary capital, minor units, for the period. */
  returnsPayableMinor: number;
  /** Fees payable to BEYU for managing the capital, minor units, for the period. */
  managementFeesEarnedMinor: number;
  period: string;
};

/**
 * Report on fiduciary capital without presenting it as BEYU resources.
 *
 * The result names the fiduciary figure explicitly and never adds it to own capital. `netFiduciaryMarginBps`
 * measures the spread BEYU earns as a manager, which is a genuine revenue statement — and is computed
 * against fiduciary capital, not against BEYU's own.
 */
export function fiduciaryReport(params: FiduciaryReportParams): MetricOutcome<{ managedCapitalMinor: number; returnsPayableMinor: number; managementFeesEarnedMinor: number; netFiduciaryMarginBps: number | null; note: string }> {
  const inputs: MetricInput[] = [
    { name: "fiduciaryDrawnMinor", value: String(params.portfolio.fiduciaryDrawnMinor), unit: params.portfolio.currency, kind: "OBSERVED", source: "entrusted capital register", period: params.period, currency: params.portfolio.currency },
    { name: "returnsPayableMinor", value: String(params.returnsPayableMinor), unit: params.portfolio.currency, kind: "OBSERVED", source: "distribution ledger", period: params.period, currency: params.portfolio.currency },
    { name: "managementFeesEarnedMinor", value: String(params.managementFeesEarnedMinor), unit: params.portfolio.currency, kind: "OBSERVED", source: "management fee ledger", period: params.period, currency: params.portfolio.currency },
  ];
  const seed = () =>
    seedFor(params.seed, "FIN.CAPITAL.FIDUCIARY_REPORT", "Fiduciary capital report: managed capital, returns payable to capital providers, and the management fee earned on the mandate", inputs, {
      period: params.period,
      currency: params.portfolio.currency,
      quality: "MANAGEMENT",
    });

  assertMoney(params.returnsPayableMinor, "returnsPayableMinor", { allowNegative: false });
  assertMoney(params.managementFeesEarnedMinor, "managementFeesEarnedMinor", { allowNegative: false });

  if (params.portfolio.fiduciaryDrawnMinor === 0) {
    return missing(seed(), "No fiduciary capital is drawn, so there is no mandate to report on.");
  }
  const spread = params.managementFeesEarnedMinor - params.returnsPayableMinor;
  const ratio = multiple(spread, params.portfolio.fiduciaryDrawnMinor, { allowNegativeDenominator: false });
  const marginBps = ratio.kind === "MULTIPLE" ? Math.round((ratio.scaled * 10_000) / 1_000_000) : null;
  if (ratio.kind === "REFUSED") return invalid(seed(), ratio.detail);
  return calculated(seed(), {
    managedCapitalMinor: params.portfolio.fiduciaryDrawnMinor,
    returnsPayableMinor: params.returnsPayableMinor,
    managementFeesEarnedMinor: params.managementFeesEarnedMinor,
    netFiduciaryMarginBps: marginBps,
    note: "Managed capital is reported separately from BEYU-owned capital and is never added to it.",
  });
}

/* ------------------------------------------------------------------ */
/* Weighted cost of capital formation                                   */
/* ------------------------------------------------------------------ */

/**
 * Blended cost of drawn capital across the portfolio, weighted by drawn amount.
 *
 * Returns null when no arrangement carries a return rate, rather than 0% — a capital stack with no
 * stated cost is not free capital, it is undocumented capital.
 */
export function blendedCostOfCapitalBps(arrangements: readonly CapitalArrangement[]): number | null {
  let weighted = 0;
  let total = 0;
  for (const arrangement of arrangements) {
    if (arrangement.drawnMinor <= 0) continue;
    const rate = arrangement.returnRateBps;
    if (rate === null || rate === undefined) continue;
    weighted += arrangement.drawnMinor * rate;
    total += arrangement.drawnMinor;
  }
  if (total === 0) return null;
  return Math.round(weighted / total);
}
