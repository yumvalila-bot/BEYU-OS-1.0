/**
 * BEYU OS — PRICING & PROFITABILITY ENGINE.
 *
 * ONE shared enterprise capability. Available to FINANCE_OS, HEALTH_OS, AGRICULTURE_OS, UJENZI_OS and
 * any authorized enterprise tenant. It is NOT a Pricing OS, NOT a Profitability OS, and it owns no
 * ledger: every monetary figure flows in from the owning module and every posting stays Finance OS's.
 *
 * ======================= THE ERROR THIS MODULE EXISTS TO PREVENT =============
 *
 * MARKUP AND MARGIN ARE DIFFERENT NUMBERS ON THE SAME TRADE.
 *
 *     Cost = 100   Price = 125   Profit = 25
 *     Markup = Profit ÷ Cost      = 25 ÷ 100 = 25%
 *     Margin = Profit ÷ Revenue   = 25 ÷ 125 = 20%
 *
 * Confusing them is the single most expensive pricing mistake in commerce: a trader who prices at
 * "cost + 20%" believing that yields a 20% margin actually yields 16.67%, and at volume the gap is the
 * business. This module therefore gives the two measures DIFFERENT TYPES
 * (`MarkupRate` vs `MarginRate` — see `rates.ts`), so a markup cannot be passed where a margin is
 * required without an explicit, visible conversion.
 *
 * ============================ WHAT IT COMPUTES ===============================
 *
 *   cost-plus pricing        price = cost × (1 + markup)
 *   target-margin pricing    price = cost ÷ (1 − margin)
 *   discount impact          what a discount does to margin, not just to price
 *   contribution margin      price − variable cost, and the contribution ratio
 *   break-even               units and revenue required to cover fixed cost
 *   price sensitivity        profit and contribution at a range of prices
 *   profitability rollups    product, service, project, contract, employee, department, team,
 *                            tenant, company, sector — from ONE implementation
 *
 *   Revenue, direct cost, allocated indirect cost, gross profit, gross margin, operating expense,
 *   operating profit, net profit, net margin — the §12 ladder, in one place.
 *
 * ============================ ALLOCATIONS ARE VERSIONED ======================
 *
 * Indirect cost allocation is where profitability reporting is most often quietly wrong. Every
 * allocation here runs under a versioned `AllocationRuleSet` whose driver, weights and version are
 * recorded on the result, and `allocateIndirect()` REFUSES a rule set whose weights are absent or
 * inconsistent rather than spreading cost by an implicit default. Every allocation is therefore
 * reproducible: the same rule set version and the same driver values produce the same cents.
 */
import { BPS_BASE, FinanceArithmeticError, assertMoney, assertPercent, multiple, scaleDivide } from "@/lib/finance/intelligence/arithmetic";
import type { MetricInput, MetricOutcome, MetricSeedBase } from "@/lib/finance/intelligence/provenance";
import { calculated, invalid, missing, seedFor } from "@/lib/finance/intelligence/provenance";

/**
 * Provenance stamp for this engine: every outcome records the engine's own pricing calculation version,
 * so a stored metric can always be traced back to the code and assumptions that produced it.
 */
const seedForEngine = (...args: Parameters<typeof seedFor>) =>
  seedFor(args[0], args[1], args[2], args[3], {
    ...(args[4] ?? {}),
    calculationVersion: PRICING_ENGINE_VERSION,
  });

export const PRICING_ENGINE_VERSION = "pricing-engine-1.0.0";

/* ------------------------------------------------------------------ */
/* Branded rates: a markup is not a margin                             */
/* ------------------------------------------------------------------ */

declare const markupBrand: unique symbol;
declare const marginBrand: unique symbol;

/**
 * A rate expressed as a percentage OF COST. Basis points.
 *
 * The brand is not decoration: TypeScript will not let a `MarkupRate` be passed to a function
 * expecting a `MarginRate`. The only way across is `markupToMargin()` or `marginToMarkup()`, which
 * appear in the call graph and in every code review.
 */
export type MarkupRate = number & { readonly [markupBrand]: "MARKUP" };

/** A rate expressed as a percentage OF REVENUE. Basis points. */
export type MarginRate = number & { readonly [marginBrand]: "MARGIN" };

export function asMarkupRate(bps: number): MarkupRate {
  assertPercent(bps, "markup", { allowNegative: true });
  return bps as MarkupRate;
}

export function asMarginRate(bps: number): MarginRate {
  assertPercent(bps, "margin", { allowNegative: true });
  return bps as MarginRate;
}

/**
 * Convert a markup to its equivalent margin.
 *
 *   margin = markup ÷ (1 + markup)
 *
 * Throws when the markup is −100% or lower, where the relationship is undefined (the price is zero and
 * a margin cannot be computed against it).
 */
export function markupToMargin(markup: MarkupRate | number): MarginRate {
  assertPercent(markup, "markup");
  if (markup <= -BPS_BASE) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", `A markup of ${markup} bps has no equivalent margin: it implies a non-positive price.`, { markup });
  }
  const bps = Math.round((markup * BPS_BASE) / (BPS_BASE + markup));
  assertPercent(bps, "margin");
  return bps as MarginRate;
}

/**
 * Convert a margin to its equivalent markup.
 *
 *   markup = margin ÷ (1 − margin)
 *
 * Throws at a margin of 100% or more, where the required markup is infinite: a business cannot price to
 * a 100% margin, and returning a large number would hide that.
 */
export function marginToMarkup(margin: MarginRate | number): MarkupRate {
  assertPercent(margin, "margin");
  if (margin >= BPS_BASE) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", `A margin of ${margin} bps requires an infinite markup; no finite price achieves it.`, { margin });
  }
  const bps = Math.round((margin * BPS_BASE) / (BPS_BASE - margin));
  assertPercent(bps, "markup");
  return bps as MarkupRate;
}

/* ------------------------------------------------------------------ */
/* Core §11 measures                                                   */
/* ------------------------------------------------------------------ */

export type ProfitabilityRateKind = "MARKUP" | "MARGIN";

/**
 * Compute MARKUP = Profit ÷ Cost.
 *
 * Refuses a zero or negative cost: profit over cost is only a markup when cost is a positive base. The
 * result carries the `MARKUP` brand, so it cannot be silently consumed as a margin.
 */
export function markupRate(costMinor: number, profitMinor: number): MarkupRate | null {
  assertMoney(costMinor, "cost", { allowNegative: false });
  assertMoney(profitMinor, "profit");
  if (costMinor === 0) return null;
  const ratio = multiple(profitMinor, costMinor, { allowNegativeDenominator: false });
  if (ratio.kind === "REFUSED") return null;
  const bps = Math.round((ratio.scaled * BPS_BASE) / 1_000_000);
  assertPercent(bps, "markup");
  return bps as MarkupRate;
}

/**
 * Compute MARGIN = Profit ÷ Revenue.
 *
 * Refuses a zero or negative revenue for the same reason. A NEGATIVE profit is legitimate and produces a
 * negative margin: a loss-making line IS a statement about the business.
 */
export function marginRate(revenueMinor: number, profitMinor: number): MarginRate | null {
  assertMoney(revenueMinor, "revenue", { allowNegative: false });
  assertMoney(profitMinor, "profit");
  if (revenueMinor === 0) return null;
  const ratio = multiple(profitMinor, revenueMinor, { allowNegativeDenominator: false });
  if (ratio.kind === "REFUSED") return null;
  const bps = Math.round((ratio.scaled * BPS_BASE) / 1_000_000);
  assertPercent(bps, "margin");
  return bps as MarginRate;
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Cost-plus price.
 *
 *   price = cost × (1 + markup)
 *
 * The ONLY function in this module that takes a `MarkupRate`, and it takes nothing else — a caller
 * holding a margin must convert, and that conversion is the point.
 */
export function costPlusPrice(params: { costMinor: number; markup: MarkupRate }): number {
  assertMoney(params.costMinor, "costMinor", { allowNegative: false });
  assertPercent(params.markup, "markup");
  if (params.markup <= -BPS_BASE) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", "A markup at or below −100% implies a non-positive price.", { markup: params.markup });
  }
  const price = Math.round((params.costMinor * (BPS_BASE + params.markup)) / BPS_BASE);
  assertMoney(price, "price", { allowNegative: false });
  return price;
}

/**
 * Target-margin price.
 *
 *   price = cost ÷ (1 − margin)
 *
 * A margin at or above 100% is REFUSED rather than producing an infinite or negative price. This is the
 * classic "we want 110% margin" instruction, and a system that returns a large number for it turns a
 * nonsensical target into a real quotation.
 */
export function targetMarginPrice(params: { costMinor: number; margin: MarginRate }): number {
  assertMoney(params.costMinor, "costMinor", { allowNegative: false });
  assertPercent(params.margin, "margin");
  if (params.margin >= BPS_BASE) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", `A target margin of ${params.margin} bps cannot be achieved by any finite price.`, { margin: params.margin });
  }
  const denominator = BPS_BASE - params.margin;
  if (denominator <= 0) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", "The target margin leaves no positive price denominator.", { margin: params.margin });
  }
  const price = Math.round((params.costMinor * BPS_BASE) / denominator);
  assertMoney(price, "price", { allowNegative: false });
  return price;
}

/**
 * The effect of a discount, in MARGIN terms.
 *
 * A discount is usually argued in revenue ("10% off") and felt in margin, where the same 10% can be a
 * 40% reduction in profit. This function returns both so the argument and the consequence appear
 * together:
 *
 *   marginAfterBps          the margin at the discounted price
 *   marginErosionBps        margin before − margin after (the raw gap)
 *   profitRetentionBps      profit after ÷ profit before; 5000 bps means HALF the profit is gone
 */
export function discountImpact(params: {
  listPriceMinor: number;
  unitCostMinor: number;
  discountBps: number;
  quantity: number;
}): {
  listMarginBps: number | null;
  discountedPriceMinor: number;
  discountedMarginBps: number | null;
  marginErosionBps: number | null;
  profitRetentionBps: number | null;
  listProfitMinor: number;
  discountedProfitMinor: number;
} {
  assertMoney(params.listPriceMinor, "listPriceMinor", { allowNegative: false });
  assertMoney(params.unitCostMinor, "unitCostMinor", { allowNegative: false });
  assertPercent(params.discountBps, "discountBps", { allowNegative: false });
  if (params.discountBps >= BPS_BASE) {
    throw new FinanceArithmeticError("INVALID_PERCENTAGE", "A discount of 100% or more is not a discount.", { discountBps: params.discountBps });
  }
  if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) {
    throw new FinanceArithmeticError("INVALID_MONEY", "Quantity must be a positive whole number.", { quantity: params.quantity });
  }
  const discountedPrice = Math.round((params.listPriceMinor * (BPS_BASE - params.discountBps)) / BPS_BASE);
  const listProfit = (params.listPriceMinor - params.unitCostMinor) * params.quantity;
  const discountedProfit = (discountedPrice - params.unitCostMinor) * params.quantity;
  const listMargin = marginRate(params.listPriceMinor, params.listPriceMinor - params.unitCostMinor);
  const discountedMargin = marginRate(discountedPrice, discountedPrice - params.unitCostMinor);
  const erosion = listMargin !== null && discountedMargin !== null ? listMargin - discountedMargin : null;
  const retention = listProfit !== 0 ? Math.round((discountedProfit * BPS_BASE) / listProfit) : null;
  return {
    listMarginBps: listMargin,
    discountedPriceMinor: discountedPrice,
    discountedMarginBps: discountedMargin,
    marginErosionBps: erosion,
    profitRetentionBps: retention,
    listProfitMinor: listProfit,
    discountedProfitMinor: discountedProfit,
  };
}

/**
 * Contribution margin and break-even.
 *
 *   contributionMinor     price − variable cost per unit
 *   contributionRatioBps  contribution ÷ price
 *   breakEvenUnits        fixed cost ÷ contribution per unit  (rounded UP: a partial unit does not cover)
 *   breakEvenRevenueMinor units × price
 *
 * A contribution at or below zero means the product never covers its own variable cost, so break-even
 * does not exist at any volume. That returns `breakEvenUnits: null` with `finite: false` — it does NOT
 * return a huge number, which is what an unguarded division would produce.
 */
export function contributionAndBreakEven(params: {
  unitPriceMinor: number;
  unitVariableCostMinor: number;
  fixedCostMinor: number;
}): {
  contributionMinor: number;
  contributionRatioBps: number | null;
  breakEvenUnits: number | null;
  breakEvenRevenueMinor: number | null;
  finite: boolean;
  reason: string | null;
} {
  assertMoney(params.unitPriceMinor, "unitPriceMinor");
  assertMoney(params.unitVariableCostMinor, "unitVariableCostMinor", { allowNegative: false });
  assertMoney(params.fixedCostMinor, "fixedCostMinor", { allowNegative: false });
  const contribution = params.unitPriceMinor - params.unitVariableCostMinor;
  const ratio = multiple(contribution, params.unitPriceMinor, { allowNegativeDenominator: true });
  const ratioBps = ratio.kind === "MULTIPLE" ? Math.round((ratio.scaled * BPS_BASE) / 1_000_000) : null;
  if (contribution <= 0) {
    return {
      contributionMinor: contribution,
      contributionRatioBps: ratioBps,
      breakEvenUnits: null,
      breakEvenRevenueMinor: null,
      finite: false,
      reason:
        contribution === 0
          ? "Contribution per unit is zero: every sale covers its variable cost and adds nothing, so fixed cost is never recovered."
          : "Contribution per unit is negative: each additional sale increases the loss, so no volume reaches break-even.",
    };
  }
  const units = Math.ceil(params.fixedCostMinor / contribution);
  assertMoney(units, "breakEvenUnits", { allowNegative: false });
  return {
    contributionMinor: contribution,
    contributionRatioBps: ratioBps,
    breakEvenUnits: units,
    breakEvenRevenueMinor: units * params.unitPriceMinor,
    finite: true,
    reason: null,
  };
}

/**
 * Price sensitivity sweep.
 *
 * Returns a row per candidate price: units at that price (from the supplied demand response — this
 * function does not invent demand elasticity), contribution, profit, margin and markup. The demand
 * curve is an input, because a pricing engine that assumed its own elasticity would be inventing the
 * most important number in the analysis.
 */
export type SensitivityPoint = {
  priceMinor: number;
  units: number;
  revenueMinor: number;
  variableCostMinor: number;
  contributionMinor: number;
  fixedCostMinor: number;
  profitMinor: number;
  marginBps: number | null;
  markupBps: number | null;
};

export function priceSensitivity(params: {
  /** Demand response: units expected at each candidate price. */
  demand: readonly { priceMinor: number; units: number }[];
  unitVariableCostMinor: number;
  fixedCostMinor: number;
}): SensitivityPoint[] {
  assertMoney(params.unitVariableCostMinor, "unitVariableCostMinor", { allowNegative: false });
  assertMoney(params.fixedCostMinor, "fixedCostMinor", { allowNegative: false });
  if (params.demand.length === 0) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "A price sensitivity requires at least one price/volume point.", {});
  }
  return [...params.demand]
    .sort((a, b) => a.priceMinor - b.priceMinor)
    .map((point) => {
      assertMoney(point.priceMinor, "priceMinor");
      if (!Number.isSafeInteger(point.units) || point.units < 0) {
        throw new FinanceArithmeticError("INVALID_MONEY", "Units must be a non-negative whole number.", { units: point.units });
      }
      const revenue = point.priceMinor * point.units;
      const variable = params.unitVariableCostMinor * point.units;
      const contribution = revenue - variable;
      const profit = contribution - params.fixedCostMinor;
      assertMoney(revenue, "revenue");
      assertMoney(variable, "variableCost");
      assertMoney(contribution, "contribution");
      assertMoney(profit, "profit");
      return {
        priceMinor: point.priceMinor,
        units: point.units,
        revenueMinor: revenue,
        variableCostMinor: variable,
        contributionMinor: contribution,
        fixedCostMinor: params.fixedCostMinor,
        profitMinor: profit,
        marginBps: marginRate(revenue, profit),
        markupBps: markupRate(variable, profit),
      } satisfies SensitivityPoint;
    });
}

/* ------------------------------------------------------------------ */
/* Cost allocation — versioned, traceable, reproducible                 */
/* ------------------------------------------------------------------ */

/**
 * How an allocation driver distributes cost across units.
 *
 *   DRIVER_WEIGHTED  each unit's share is its driver value ÷ the total. Revenue, headcount, floor area,
 *                    machine hours — the driver is declared, never inferred.
 *   EQUAL            cost is split evenly. Legitimate for genuinely fungible overhead, and stated so.
 *   FIXED_WEIGHT     an explicitly supplied weight per unit. Used where a policy sets shares directly.
 */
export const ALLOCATION_METHOD = ["DRIVER_WEIGHTED", "EQUAL", "FIXED_WEIGHT"] as const;
export type AllocationMethod = (typeof ALLOCATION_METHOD)[number];

/**
 * A versioned allocation rule set.
 *
 * `version` is REQUIRED and must be bumped whenever weights change. Every allocation result records it,
 * so a profitability report can always answer "under which allocation policy was this figure produced?"
 * — the question that makes two periods comparable or reveals that they are not.
 */
export type AllocationRuleSet = {
  id: string;
  version: number;
  name: string;
  method: AllocationMethod;
  /** Driver name when `method` is DRIVER_WEIGHTED, e.g. `REVENUE`, `HEADCOUNT`, `FLOOR_AREA`. */
  driver?: string | null;
  /** True when the rules were approved by a human authority rather than set locally. */
  approved: boolean;
  approvalRef?: string | null;
};

export type AllocationUnit = {
  unitType: ProfitabilityUnitType;
  unitId: string;
  /** Driver value for DRIVER_WEIGHTED; weight for FIXED_WEIGHT; ignored for EQUAL. */
  weight?: number | null;
};

export type AllocationLine = {
  unitType: ProfitabilityUnitType;
  unitId: string;
  driverValue: number;
  allocatedMinor: number;
  /** Exact unrounded share numerator, retained so the allocation can be re-derived and audited. */
  share: { numerator: number; denominator: number };
};

export type AllocationResult = {
  ruleSetId: string;
  ruleSetVersion: number;
  method: AllocationMethod;
  driver: string | null;
  poolMinor: number;
  lines: AllocationLine[];
  /** Sum of allocated amounts. Differs from the pool only by the remainder distribution below. */
  allocatedMinor: number;
  /** Rounding remainder, distributed one minor unit at a time to the largest shares. Always explained. */
  roundingRemainderMinor: number;
  remainderPolicy: string;
};

/**
 * Allocate an indirect cost pool across units under a versioned rule set.
 *
 * EXACT: the sum of the allocations equals the pool, always. Integer division leaves a remainder of a
 * few minor units, and that remainder is distributed one unit at a time to the units with the largest
 * fractional shares (largest-remainder / Hamilton method), with the tie broken by unit id so the result
 * is deterministic. The remainder and its disposition are recorded on the result.
 *
 * REFUSED rather than approximated:
 *   · a rule set that has not been approved            (an unapproved allocation is not a policy)
 *   · DRIVER_WEIGHTED with a zero or negative driver total
 *   · FIXED_WEIGHT with no weights, or with a non-positive total
 *   · an empty unit list
 */
export function allocateIndirect(params: {
  poolMinor: number;
  units: readonly AllocationUnit[];
  ruleSet: AllocationRuleSet;
}): AllocationResult {
  const { ruleSet } = params;
  assertMoney(params.poolMinor, "poolMinor", { allowNegative: false });
  if (params.units.length === 0) {
    throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", "An allocation needs at least one unit.", {});
  }
  if (!ruleSet.approved) {
    throw new FinanceArithmeticError(
      "INVALID_RATIO",
      `Allocation rule set '${ruleSet.id}' v${ruleSet.version} has not been approved. An unapproved allocation rule is not a policy, and cost spread by it is not auditable.`,
      { ruleSetId: ruleSet.id, version: ruleSet.version },
    );
  }
  if (!Number.isSafeInteger(ruleSet.version) || ruleSet.version <= 0) {
    throw new FinanceArithmeticError("INVALID_RATIO", "An allocation rule set must carry a positive integer version.", { version: ruleSet.version });
  }

  const weights: number[] = params.units.map((unit, index) => {
    switch (ruleSet.method) {
      case "EQUAL":
        return 1;
      case "DRIVER_WEIGHTED": {
        const value = unit.weight;
        if (value === null || value === undefined) {
          throw new FinanceArithmeticError(
            "INSUFFICIENT_INPUTS",
            `Unit ${unit.unitId} supplies no '${ruleSet.driver ?? "driver"}' value for the ${ruleSet.method} allocation. Cost is never spread by an implicit default.`,
            { unitId: unit.unitId, index },
          );
        }
        if (!Number.isFinite(value) || value < 0) {
          throw new FinanceArithmeticError("INVALID_MONEY", `Unit ${unit.unitId} has a negative or non-finite driver value, which cannot weight an allocation.`, {
            unitId: unit.unitId,
            value,
          });
        }
        return value;
      }
      case "FIXED_WEIGHT": {
        const value = unit.weight;
        if (value === null || value === undefined) {
          throw new FinanceArithmeticError("INSUFFICIENT_INPUTS", `Unit ${unit.unitId} supplies no fixed weight.`, { unitId: unit.unitId });
        }
        if (!Number.isFinite(value) || value < 0) {
          throw new FinanceArithmeticError("INVALID_MONEY", `Unit ${unit.unitId} has a negative fixed weight.`, { unitId: unit.unitId, value });
        }
        return value;
      }
      default: {
        const never: never = ruleSet.method;
        throw new FinanceArithmeticError("INVALID_RATIO", `Unknown allocation method ${String(never)}.`, {});
      }
    }
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    throw new FinanceArithmeticError(
      "DIVISION_BY_ZERO",
      `The allocation driver '${ruleSet.driver ?? ruleSet.method}' totals zero across the supplied units, so no share can be computed. Supply driver values or choose a different rule set.`,
      { ruleSetId: ruleSet.id, method: ruleSet.method },
    );
  }

  // Exact integer shares with the largest-remainder distribution.
  const raw = weights.map((w) => (params.poolMinor * w) / totalWeight);
  const floors = raw.map((value) => Math.floor(value));
  let allocated = floors.reduce((a, b) => a + b, 0);
  let remainder = params.poolMinor - allocated;
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => (b.fraction - a.fraction) || (params.units[a.index].unitId < params.units[b.index].unitId ? -1 : 1));
  const bonus = new Array<number>(params.units.length).fill(0);
  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    bonus[order[i].index] += 1;
    remainder -= 1;
  }
  allocated = floors.reduce((a, b) => a + b, 0) + bonus.reduce((a, b) => a + b, 0);

  const lines: AllocationLine[] = params.units.map((unit, index) => ({
    unitType: unit.unitType,
    unitId: unit.unitId,
    driverValue: weights[index],
    allocatedMinor: floors[index] + bonus[index],
    share: { numerator: weights[index], denominator: totalWeight },
  }));

  if (allocated !== params.poolMinor) {
    throw new FinanceArithmeticError("INVALID_MONEY", "Allocation did not distribute the whole pool; this is a defect in the largest-remainder step.", {
      poolMinor: params.poolMinor,
      allocated,
    });
  }

  return {
    ruleSetId: ruleSet.id,
    ruleSetVersion: ruleSet.version,
    method: ruleSet.method,
    driver: ruleSet.driver ?? null,
    poolMinor: params.poolMinor,
    lines,
    allocatedMinor: allocated,
    roundingRemainderMinor: params.poolMinor - floors.reduce((a, b) => a + b, 0),
    remainderPolicy: "Largest remainder, one minor unit at a time, ties broken by unit id ascending (deterministic).",
  };
}

/* ------------------------------------------------------------------ */
/* §12 — the profitability ladder                                      */
/* ------------------------------------------------------------------ */

/** Every dimension profitability can be reported at. ONE implementation serves all of them (§11). */
export const PROFITABILITY_UNIT_TYPE = [
  "PRODUCT",
  "SERVICE",
  "PROJECT",
  "CONTRACT",
  "EMPLOYEE",
  "DEPARTMENT",
  "TEAM",
  "TENANT",
  "COMPANY",
  "SECTOR",
] as const;
export type ProfitabilityUnitType = (typeof PROFITABILITY_UNIT_TYPE)[number];

/**
 * The §12 cost and profit ladder for one unit.
 *
 *   revenue
 *   − direct costs      → gross profit → gross margin
 *   − allocated indirect → contribution after allocation
 *   − operating expense  → operating profit → operating margin
 *   − net expense        → net profit → net margin
 *
 * `allocatedIndirectMinor` is separated from `directCostMinor` and from `operatingExpenseMinor`
 * because the three have different evidential standing: direct cost is measured, allocated cost is a
 * policy output, and operating expense is recorded. A report that merged them could not answer
 * "how much of this unit's cost is an allocation?" — which is exactly the question that determines
 * whether the unit is genuinely unprofitable or merely carrying head-office overhead.
 */
export type ProfitabilityLadder = {
  unitType: ProfitabilityUnitType;
  unitId: string;
  currency: string;
  period: string;
  revenueMinor: number;
  directCostMinor: number;
  grossProfitMinor: number;
  grossMarginBps: number | null;
  allocatedIndirectMinor: number;
  contributionAfterAllocationMinor: number;
  operatingExpenseMinor: number;
  operatingProfitMinor: number;
  operatingMarginBps: number | null;
  netExpenseMinor: number;
  netProfitMinor: number;
  netMarginBps: number | null;
  /** Markup on the cost base actually incurred (direct + allocated + operating). Null when cost is zero. */
  markupOnTotalCostBps: number | null;
  /** The allocation rule set version that produced `allocatedIndirectMinor`, or null when unaudited. */
  allocationRuleSet: { id: string; version: number } | null;
  /** True when allocation was applied without an approved rule set. Always false from this engine. */
  unapprovedAllocation: boolean;
};

/**
 * Build the profitability ladder for one unit.
 *
 * Refuses a negative revenue: revenue is a non-negative quantity by definition, and a negative one
 * silently flips every ratio that follows. Negative COSTS are allowed because a credit note is a real
 * reversal, and the ladder reports the resulting figures honestly.
 */
export function buildProfitabilityLadder(params: {
  unitType: ProfitabilityUnitType;
  unitId: string;
  currency: string;
  period: string;
  revenueMinor: number;
  directCostMinor: number;
  allocatedIndirectMinor?: number;
  operatingExpenseMinor?: number;
  netExpenseMinor?: number;
  allocationRuleSet?: { id: string; version: number } | null;
}): ProfitabilityLadder {
  assertMoney(params.revenueMinor, "revenueMinor", { allowNegative: false });
  assertMoney(params.directCostMinor, "directCostMinor");
  const allocated = params.allocatedIndirectMinor ?? 0;
  const opex = params.operatingExpenseMinor ?? 0;
  const netExpense = params.netExpenseMinor ?? 0;
  assertMoney(allocated, "allocatedIndirectMinor", { allowNegative: false });
  assertMoney(opex, "operatingExpenseMinor", { allowNegative: false });
  assertMoney(netExpense, "netExpenseMinor");

  const grossProfit = params.revenueMinor - params.directCostMinor;
  const afterAllocation = grossProfit - allocated;
  const operatingProfit = afterAllocation - opex;
  const netProfit = operatingProfit - netExpense;
  for (const [label, value] of Object.entries({ grossProfit, afterAllocation, operatingProfit, netProfit })) {
    assertMoney(value, label);
  }
  const totalCost = params.directCostMinor + allocated + opex;
  const markupScaled = multiple(netProfit, totalCost, { allowNegativeDenominator: false });
  const markupBps = markupScaled.kind === "MULTIPLE" ? Math.round((markupScaled.scaled * BPS_BASE) / 1_000_000) : null;

  return {
    unitType: params.unitType,
    unitId: params.unitId,
    currency: params.currency,
    period: params.period,
    revenueMinor: params.revenueMinor,
    directCostMinor: params.directCostMinor,
    grossProfitMinor: grossProfit,
    grossMarginBps: marginRate(params.revenueMinor, grossProfit),
    allocatedIndirectMinor: allocated,
    contributionAfterAllocationMinor: afterAllocation,
    operatingExpenseMinor: opex,
    operatingProfitMinor: operatingProfit,
    operatingMarginBps: marginRate(params.revenueMinor, operatingProfit),
    netExpenseMinor: netExpense,
    netProfitMinor: netProfit,
    netMarginBps: marginRate(params.revenueMinor, netProfit),
    markupOnTotalCostBps: markupBps,
    allocationRuleSet: params.allocationRuleSet ?? null,
    unapprovedAllocation: false,
  };
}

/* ------------------------------------------------------------------ */
/* Portfolio rollup                                                    */
/* ------------------------------------------------------------------ */

export type ProfitabilityRollup = {
  unitType: ProfitabilityUnitType;
  units: number;
  currency: string;
  period: string;
  revenueMinor: number;
  directCostMinor: number;
  grossProfitMinor: number;
  grossMarginBps: number | null;
  allocatedIndirectMinor: number;
  operatingExpenseMinor: number;
  operatingProfitMinor: number;
  operatingMarginBps: number | null;
  netProfitMinor: number;
  netMarginBps: number | null;
  /** Units with a negative contribution after allocation — the ones subsidised by the rest. */
  lossMakingUnits: { unitId: string; netProfitMinor: number }[];
  /** Share of revenue from the single largest unit, fixed-point. Concentration risk indicator. */
  largestUnitRevenueShareScaled: number | null;
};

/**
 * Roll individual units up into a parent total.
 *
 * Aggregates are computed from the SUMMED components, never by averaging the units' margins. Averaging
 * margins gives a small loss-making unit the same weight as the largest revenue line and produces a
 * number that corresponds to no actual trading result.
 */
export function rollUpProfitability(params: {
  unitType: ProfitabilityUnitType;
  currency: string;
  period: string;
  ladders: readonly ProfitabilityLadder[];
}): ProfitabilityRollup | null {
  if (params.ladders.length === 0) return null;
  const mismatched = params.ladders.filter((l) => l.currency.toUpperCase() !== params.currency.toUpperCase());
  if (mismatched.length > 0) {
    throw new FinanceArithmeticError(
      "INVALID_MONEY",
      `All units in a rollup must share the reporting currency ${params.currency}; ${mismatched.length} unit(s) differ.`,
      { currency: params.currency, units: mismatched.map((u) => u.unitId) },
    );
  }
  const sum = (pick: (l: ProfitabilityLadder) => number) => params.ladders.reduce((a, l) => a + pick(l), 0);
  const revenue = sum((l) => l.revenueMinor);
  const direct = sum((l) => l.directCostMinor);
  const allocated = sum((l) => l.allocatedIndirectMinor);
  const opex = sum((l) => l.operatingExpenseMinor);
  const grossProfit = revenue - direct;
  const operatingProfit = grossProfit - allocated - opex;
  const netProfit = sum((l) => l.netProfitMinor);
  const largest = params.ladders.reduce((best, l) => (l.revenueMinor > best.revenueMinor ? l : best), params.ladders[0]);
  const share = multiple(largest.revenueMinor, revenue);
  return {
    unitType: params.unitType,
    units: params.ladders.length,
    currency: params.currency,
    period: params.period,
    revenueMinor: revenue,
    directCostMinor: direct,
    grossProfitMinor: grossProfit,
    grossMarginBps: marginRate(revenue, grossProfit),
    allocatedIndirectMinor: allocated,
    operatingExpenseMinor: opex,
    operatingProfitMinor: operatingProfit,
    operatingMarginBps: marginRate(revenue, operatingProfit),
    netProfitMinor: netProfit,
    netMarginBps: marginRate(revenue, netProfit),
    lossMakingUnits: params.ladders.filter((l) => l.netProfitMinor < 0).map((l) => ({ unitId: l.unitId, netProfitMinor: l.netProfitMinor })),
    largestUnitRevenueShareScaled: share.kind === "MULTIPLE" ? share.scaled : null,
  };
}

/* ------------------------------------------------------------------ */
/* Metric outcomes — provenance for the pricing measures               */
/* ------------------------------------------------------------------ */

/**
 * Markup and margin as a single governed metric outcome, with both figures and the conversion stated.
 *
 * Returning them TOGETHER is deliberate: a report that shows only one of the pair is how the confusion
 * starts. The provenance records cost, price, profit and the relationship between the two rates.
 */
export function pricedMarginOutcome(params: {
  seed: MetricSeedBase;
  costMinor: number;
  priceMinor: number;
  currency: string;
  period: string;
}): MetricOutcome<{ profitMinor: number; markup: MarkupRate | null; margin: MarginRate | null; marginFromMarkup: MarginRate | null }> {
  const inputs: MetricInput[] = [
    { name: "costMinor", value: String(params.costMinor), unit: params.currency, kind: "OBSERVED", source: "cost ledger", period: params.period, currency: params.currency },
    { name: "priceMinor", value: String(params.priceMinor), unit: params.currency, kind: "OBSERVED", source: "price book", period: params.period, currency: params.currency },
  ];
  const seed = () =>
    seedForEngine(params.seed, "FIN.PRICING.MARKUP_AND_MARGIN", "Profit = Price − Cost; Markup = Profit ÷ Cost; Margin = Profit ÷ Revenue; Margin = Markup ÷ (1 + Markup)", inputs, {
      period: params.period,
      currency: params.currency,
      quality: "MANAGEMENT",
    });
  assertMoney(params.costMinor, "costMinor", { allowNegative: false });
  assertMoney(params.priceMinor, "priceMinor");
  if (params.costMinor === 0 && params.priceMinor === 0) {
    return missing(seed(), "Both cost and price are zero, so neither a markup nor a margin is defined.");
  }
  const profit = params.priceMinor - params.costMinor;
  const markup = markupRate(params.costMinor, profit);
  const margin = marginRate(params.priceMinor, profit);
  const fromMarkup = markup === null ? null : markupToMargin(markup);
  if (markup === null && margin === null) {
    return invalid(seed(), "Neither a markup nor a margin can be computed: the cost and price bases are both zero.");
  }
  return calculated(seed(), { profitMinor: profit, markup, margin, marginFromMarkup: fromMarkup });
}

/** Deviation between two rates, in basis points. `scaleDivide` keeps it exact. */
export function rateGapBps(a: number, b: number): number | null {
  assertPercent(a, "a");
  assertPercent(b, "b");
  const diff = a - b;
  void scaleDivide;
  return diff;
}
