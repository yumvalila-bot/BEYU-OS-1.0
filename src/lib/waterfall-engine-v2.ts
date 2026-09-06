/**
 * BEYU OS 2.0 — Waterfall Cashflow Engine v2 (pure, deterministic, integer).
 *
 * ADOPTED SOURCE: BEYU-OS- `services/beyu-api/src/modules/waterfall/waterfall.engine.ts`
 * (b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72).
 *
 * DECISION (PHASE_09 architecture fusion / waterfall register):
 *   - SOURCE engine is authoritative for WHAT SHOULD HAPPEN (pure calculation).
 *   - DESTINATION Finance / ledger / posting / audit remains authoritative for
 *     HOW the authorized financial system posts and records it.
 *
 * GUARANTEES
 *   1. All money arithmetic is INTEGER minor units + INTEGER basis points;
 *      `BigInt` is used inside `applyBasisPoints` so no floating point reaches
 *      the value path.
 *   2. No hard-coded percentages. Every rate/floor/cap/threshold is data.
 *   3. Version-pinned calculation + deterministic SHA-256 input hash.
 *   4. No execution: this module never writes to the ledger, never calls the
 *      finance posting service, never creates audit rows, never touches the
 *      database, never performs network I/O, and never reads secrets.
 *   5. Conservation: inflow === totalAllocated + unallocated (asserted).
 *
 * SECURITY WARNING FOR CALLERS
 *   This module gives you a number. It does NOT grant authority. Any caller
 *   that would post a finance event must go through the existing Finance OS
 *   authorization + posting/ledger + audit path. Do not bypass it.
 */
import { createHash } from "node:crypto";

/** Canonical allocation categories (spec §29). */
export type WaterfallAllocationCategory =
  | "OPERATING_OBLIGATIONS"
  | "STATUTORY_TAX"
  | "DEBT_SERVICE"
  | "WORKING_CAPITAL"
  | "EMERGENCY_RESERVE"
  | "MAINTENANCE_CAPEX"
  | "GROWTH_CAPEX"
  | "STRATEGIC_INVESTMENT"
  | "APPROVED_DISTRIBUTIONS"
  | "TRUST_CAPITAL"
  | "FOUNDATION_ALLOCATION";

export type WaterfallTierComputationType =
  | "FIXED_AMOUNT"
  | "PERCENTAGE"
  | "RESERVE_TARGET"
  | "RESIDUAL";

export type WaterfallCalculationStatus =
  | "DRAFT"
  | "CALCULATED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "RELEASED_FOR_EXECUTION";

export interface WaterfallTierCondition {
  metric:
    | "inflow"
    | "available"
    | "periodRevenue"
    | "periodProfit"
    | "reserveBalance";
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  valueMinor: number;
}

export interface WaterfallTierV2 {
  id: string;
  ruleSetId: string;
  priority: number;
  name: string;
  category: WaterfallAllocationCategory;
  computationType: WaterfallTierComputationType;
  fixedAmountMinor?: number | null;
  percentageBps?: number | null;
  reserveTargetMinor?: number | null;
  reserveCurrentMinor?: number | null;
  minimumMinor?: number | null;
  maximumMinor?: number | null;
  thresholdMinor?: number | null;
  destinationEntityId?: string | null;
  countryCode?: string | null;
  sectorCode?: string | null;
  requiresApproval: boolean;
  condition?: WaterfallTierCondition | null;
  notes?: string | null;
}

export interface WaterfallRuleSetV2 {
  id: string;
  name: string;
  version: string;
  status: string;
  entityId: string | null;
  countryCode: string | null;
  sectorCode: string | null;
  currency: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  tiers: WaterfallTierV2[];
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaterfallCalculationInputV2 {
  ruleSetId: string;
  periodId: string;
  inflowMinor: number;
  currency: string;
  context?: {
    periodRevenueMinor?: number;
    periodProfitMinor?: number;
  };
}

export interface WaterfallAllocationLineV2 {
  tierId: string;
  tierName: string;
  priority: number;
  category: WaterfallAllocationCategory;
  computationType: WaterfallTierComputationType;
  availableBeforeMinor: number;
  allocatedMinor: number;
  remainingAfterMinor: number;
  skipped: boolean;
  skipReason?: string;
  adjustments: string[];
  destinationEntityId?: string | null;
  requiresApproval: boolean;
}

export interface WaterfallCalculationResultV2 {
  calculationId: string;
  ruleSetId: string;
  ruleSetVersion: string;
  periodId: string;
  currency: string;
  inflowMinor: number;
  totalAllocatedMinor: number;
  unallocatedMinor: number;
  lines: WaterfallAllocationLineV2[];
  status: WaterfallCalculationStatus;
  inputHash: string;
  calculatedAt: string;
  calculatedBy: string;
}

export class WaterfallEngineV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaterfallEngineV2Error";
  }
}

/** Basis-point denominator. 10000 bps = 100%. */
const BPS_DENOMINATOR = 10_000;

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new WaterfallEngineV2Error(
      `${label} must be an integer in minor units; received ${value}. ` +
        "Floating-point money is not permitted in the waterfall engine.",
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new WaterfallEngineV2Error(
      `${label} exceeds the safe integer range: ${value}.`,
    );
  }
}

/**
 * Multiplies an integer minor-unit amount by basis points using only integer
 * arithmetic (BigInt), rounding half away from zero.
 */
export function applyBasisPoints(amountMinor: number, bps: number): number {
  assertSafeInteger(amountMinor, "amountMinor");
  assertSafeInteger(bps, "bps");
  if (bps < 0 || bps > BPS_DENOMINATOR) {
    throw new WaterfallEngineV2Error(
      `Basis points must be between 0 and ${BPS_DENOMINATOR}, received ${bps}.`,
    );
  }
  const product = BigInt(amountMinor) * BigInt(bps);
  const denominator = BigInt(BPS_DENOMINATOR);
  const two = BigInt(2);
  const half = denominator / two;
  const rounded =
    product >= BigInt(0)
      ? (product + half) / denominator
      : -((-product + half) / denominator);
  const result = Number(rounded);
  assertSafeInteger(result, "basis point result");
  return result;
}

/** Validates a rule set before it may be calculated against. */
export function validateWaterfallRuleSetV2(
  ruleSet: WaterfallRuleSetV2,
): string[] {
  const errors: string[] = [];
  if (!ruleSet.tiers || ruleSet.tiers.length === 0) {
    errors.push("Rule set must define at least one tier.");
    return errors;
  }

  const priorities = new Set<number>();
  for (const tier of ruleSet.tiers) {
    if (priorities.has(tier.priority)) {
      errors.push(`Duplicate tier priority ${tier.priority} in rule set ${ruleSet.id}.`);
    }
    priorities.add(tier.priority);

    switch (tier.computationType) {
      case "FIXED_AMOUNT":
        if (tier.fixedAmountMinor == null) {
          errors.push(`Tier "${tier.name}" is FIXED_AMOUNT but has no fixedAmountMinor.`);
        } else if (tier.fixedAmountMinor < 0) {
          errors.push(`Tier "${tier.name}" has a negative fixed amount.`);
        }
        break;
      case "PERCENTAGE":
        if (tier.percentageBps == null) {
          errors.push(`Tier "${tier.name}" is PERCENTAGE but has no percentageBps.`);
        } else if (tier.percentageBps < 0 || tier.percentageBps > BPS_DENOMINATOR) {
          errors.push(
            `Tier "${tier.name}" percentageBps must be between 0 and ${BPS_DENOMINATOR}.`,
          );
        }
        break;
      case "RESERVE_TARGET":
        if (tier.reserveTargetMinor == null) {
          errors.push(`Tier "${tier.name}" is RESERVE_TARGET but has no reserveTargetMinor.`);
        }
        break;
      case "RESIDUAL":
        break;
      default:
        errors.push(`Tier "${tier.name}" has unknown computationType.`);
    }

    if (
      tier.minimumMinor != null &&
      tier.maximumMinor != null &&
      tier.minimumMinor > tier.maximumMinor
    ) {
      errors.push(`Tier "${tier.name}" has minimum greater than maximum.`);
    }
  }

  const residuals = ruleSet.tiers.filter((t) => t.computationType === "RESIDUAL");
  if (residuals.length > 1) {
    errors.push("A rule set may contain at most one RESIDUAL tier.");
  }
  if (residuals.length === 1) {
    const maxPriority = Math.max(...ruleSet.tiers.map((t) => t.priority));
    if (residuals[0].priority !== maxPriority) {
      errors.push("The RESIDUAL tier must have the highest (last) priority.");
    }
  }
  return errors;
}

function evaluateCondition(
  condition: WaterfallTierCondition,
  ctx: {
    inflow: number;
    available: number;
    periodRevenue: number;
    periodProfit: number;
    reserveBalance: number;
  },
): boolean {
  const actual =
    condition.metric === "inflow"
      ? ctx.inflow
      : condition.metric === "available"
        ? ctx.available
        : condition.metric === "periodRevenue"
          ? ctx.periodRevenue
          : condition.metric === "periodProfit"
            ? ctx.periodProfit
            : ctx.reserveBalance;
  switch (condition.operator) {
    case "gt":
      return actual > condition.valueMinor;
    case "gte":
      return actual >= condition.valueMinor;
    case "lt":
      return actual < condition.valueMinor;
    case "lte":
      return actual <= condition.valueMinor;
    case "eq":
      return actual === condition.valueMinor;
    case "neq":
      return actual !== condition.valueMinor;
    default:
      return false;
  }
}

function skippedLine(
  tier: WaterfallTierV2,
  availableBefore: number,
  reason: string,
): WaterfallAllocationLineV2 {
  return {
    tierId: tier.id,
    tierName: tier.name,
    priority: tier.priority,
    category: tier.category,
    computationType: tier.computationType,
    availableBeforeMinor: availableBefore,
    allocatedMinor: 0,
    remainingAfterMinor: availableBefore,
    skipped: true,
    skipReason: reason,
    adjustments: [],
    destinationEntityId: tier.destinationEntityId ?? null,
    requiresApproval: tier.requiresApproval,
  };
}

function computeTierRequest(
  tier: WaterfallTierV2,
  available: number,
): number {
  switch (tier.computationType) {
    case "FIXED_AMOUNT":
      return tier.fixedAmountMinor ?? 0;
    case "PERCENTAGE":
      return applyBasisPoints(available, tier.percentageBps ?? 0);
    case "RESERVE_TARGET": {
      const target = tier.reserveTargetMinor ?? 0;
      const current = tier.reserveCurrentMinor ?? 0;
      const gap = target - current;
      return gap > 0 ? gap : 0;
    }
    case "RESIDUAL":
      return available;
    default:
      throw new WaterfallEngineV2Error(
        `Unsupported tier computation type: ${String(tier.computationType)}`,
      );
  }
}

/** Deterministic hash over the exact rules + inputs used. */
export function computeWaterfallInputHash(
  ruleSet: WaterfallRuleSetV2,
  input: WaterfallCalculationInputV2,
): string {
  const canonicalTiers = [...ruleSet.tiers]
    .sort((a, b) => a.priority - b.priority)
    .map((t) => ({
      priority: t.priority,
      category: t.category,
      computationType: t.computationType,
      fixedAmountMinor: t.fixedAmountMinor ?? null,
      percentageBps: t.percentageBps ?? null,
      reserveTargetMinor: t.reserveTargetMinor ?? null,
      reserveCurrentMinor: t.reserveCurrentMinor ?? null,
      minimumMinor: t.minimumMinor ?? null,
      maximumMinor: t.maximumMinor ?? null,
      thresholdMinor: t.thresholdMinor ?? null,
      condition: t.condition ?? null,
      destinationEntityId: t.destinationEntityId ?? null,
    }));
  const canonical = JSON.stringify({
    ruleSetId: ruleSet.id,
    ruleSetVersion: ruleSet.version,
    currency: input.currency,
    inflowMinor: input.inflowMinor,
    periodId: input.periodId,
    context: {
      periodRevenueMinor: input.context?.periodRevenueMinor ?? null,
      periodProfitMinor: input.context?.periodProfitMinor ?? null,
    },
    tiers: canonicalTiers,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * PURE waterfall calculation. Deterministic, side-effect free, integer.
 *
 * It returns a calculation result only. It never post, never writes a ledger,
 * never contacts Finance, never creates audit rows, and cannot be "executed"
 * by itself. Callers must route approved results through Finance OS.
 */
export function calculateWaterfallV2(
  ruleSet: WaterfallRuleSetV2,
  input: WaterfallCalculationInputV2,
  meta: { calculationId: string; calculatedBy: string; calculatedAt: string },
): WaterfallCalculationResultV2 {
  const validationErrors = validateWaterfallRuleSetV2(ruleSet);
  if (validationErrors.length > 0) {
    throw new WaterfallEngineV2Error(
      `Cannot calculate with an invalid rule set: ${validationErrors.join(" ")}`,
    );
  }
  if (ruleSet.currency !== input.currency) {
    throw new WaterfallEngineV2Error(
      `Currency mismatch: rule set is ${ruleSet.currency}, input is ${input.currency}. ` +
        "Cross-currency waterfalls require an explicit, audited conversion step.",
    );
  }
  assertSafeInteger(input.inflowMinor, "inflowMinor");
  if (input.inflowMinor < 0) {
    throw new WaterfallEngineV2Error("Inflow cannot be negative.");
  }

  const tiers = [...ruleSet.tiers].sort((a, b) => a.priority - b.priority);
  const lines: WaterfallAllocationLineV2[] = [];
  let available = input.inflowMinor;
  let totalAllocated = 0;

  for (const tier of tiers) {
    const availableBefore = available;
    const adjustments: string[] = [];
    const conditionContext = {
      inflow: input.inflowMinor,
      available,
      periodRevenue: input.context?.periodRevenueMinor ?? 0,
      periodProfit: input.context?.periodProfitMinor ?? 0,
      reserveBalance: tier.reserveCurrentMinor ?? 0,
    };

    if (tier.thresholdMinor != null && available < tier.thresholdMinor) {
      lines.push(
        skippedLine(
          tier,
          availableBefore,
          `Available ${available} is below tier threshold ${tier.thresholdMinor}.`,
        ),
      );
      continue;
    }
    if (tier.condition && !evaluateCondition(tier.condition, conditionContext)) {
      lines.push(
        skippedLine(
          tier,
          availableBefore,
          `Condition ${tier.condition.metric} ${tier.condition.operator} ` +
            `${tier.condition.valueMinor} was not met.`,
        ),
      );
      continue;
    }
    if (available <= 0) {
      lines.push(skippedLine(tier, availableBefore, "No funds remaining at this tier."));
      continue;
    }

    let requested = computeTierRequest(tier, available);
    if (tier.minimumMinor != null && requested < tier.minimumMinor) {
      requested = tier.minimumMinor;
      adjustments.push(`Raised to minimum ${tier.minimumMinor}.`);
    }
    if (tier.maximumMinor != null && requested > tier.maximumMinor) {
      requested = tier.maximumMinor;
      adjustments.push(`Capped at maximum ${tier.maximumMinor}.`);
    }
    if (requested > available) {
      adjustments.push(
        `Reduced from ${requested} to available balance ${available} (partial funding).`,
      );
      requested = available;
    }
    if (requested < 0) {
      requested = 0;
      adjustments.push("Negative allocation clamped to zero.");
    }

    available -= requested;
    totalAllocated += requested;

    lines.push({
      tierId: tier.id,
      tierName: tier.name,
      priority: tier.priority,
      category: tier.category,
      computationType: tier.computationType,
      availableBeforeMinor: availableBefore,
      allocatedMinor: requested,
      remainingAfterMinor: available,
      skipped: false,
      adjustments,
      destinationEntityId: tier.destinationEntityId ?? null,
      requiresApproval: tier.requiresApproval,
    });
  }

  if (totalAllocated + available !== input.inflowMinor) {
    throw new WaterfallEngineV2Error(
      `Conservation violation: allocated ${totalAllocated} + remaining ${available} ` +
        `!== inflow ${input.inflowMinor}.`,
    );
  }

  return {
    calculationId: meta.calculationId,
    ruleSetId: ruleSet.id,
    ruleSetVersion: ruleSet.version,
    periodId: input.periodId,
    currency: input.currency,
    inflowMinor: input.inflowMinor,
    totalAllocatedMinor: totalAllocated,
    unallocatedMinor: available,
    lines,
    status: "CALCULATED",
    inputHash: computeWaterfallInputHash(ruleSet, input),
    calculatedAt: meta.calculatedAt,
    calculatedBy: meta.calculatedBy,
  };
}

// ---------------------------------------------------------------------------
// Destination-compatible wrapper.
//
// The destination `src/lib/waterfall.ts` (runWaterfall) accepts MAJOR-unit
// inputs and fractional rates. The v2 engine accepts integer MINOR units and
// integer basis points. This wrapper converts the legacy shape into integer
// semantics so parity can be measured without changing Finance execution.
// ---------------------------------------------------------------------------

import type {
  WaterfallResult,
  WaterfallTierInput,
} from "./waterfall";

function toMinor(v: number): number {
  if (!Number.isFinite(v)) {
    throw new WaterfallEngineV2Error("Money amount must be finite.");
  }
  return Math.round(v * 100);
}

function toMajor(v: number): number {
  return Math.round(v) / 100;
}

function categoryForPriority(priority: number): WaterfallAllocationCategory {
  switch (priority) {
    case 1:
      return "STATUTORY_TAX";
    case 2:
      return "OPERATING_OBLIGATIONS";
    case 3:
      return "DEBT_SERVICE";
    case 4:
      return "WORKING_CAPITAL";
    case 5:
      return "MAINTENANCE_CAPEX";
    case 6:
      return "GROWTH_CAPEX";
    case 7:
      return "STRATEGIC_INVESTMENT";
    case 8:
      return "APPROVED_DISTRIBUTIONS";
    default:
      return "APPROVED_DISTRIBUTIONS";
  }
}

/**
 * Run the legacy destination inputs through the adopted integer engine.
 *
 * PERCENTAGE tiers are converted from fractional rates to integer basis points
 * with `Math.round(rate * 10000)`. Rates that are not exactly representable in
 * 1-bp increments (e.g. 1/3) therefore differ from the legacy float engine by a
 * documented rounding correction. Financial consumers should pass integer bps
 * (or converted rates) rather than arbitrary fractions.
 */
export function runWaterfallV2(params: {
  grossAmount: number;
  currency: string;
  tiers: WaterfallTierInput[];
  scenario?: string;
}): WaterfallResult {
  const gross = toMinor(params.grossAmount);
  if (gross < 0) {
    throw new WaterfallEngineV2Error("Waterfall gross amount must be non-negative.");
  }

  const ruleSetId = params.scenario ?? "BASE";
  const tiers: WaterfallTierV2[] = params.tiers.map((t, i) => ({
    id: `T${t.sequence}`,
    ruleSetId,
    priority: t.sequence,
    name: t.name,
    category: categoryForPriority(t.sequence),
    computationType:
      t.tierType === "PERCENTAGE_OF_GROSS"
        ? "FIXED_AMOUNT"
        : t.tierType === "PERCENTAGE_OF_REMAINING"
          ? "PERCENTAGE"
          : t.tierType === "FIXED"
            ? "FIXED_AMOUNT"
            : t.tierType === "THRESHOLD_TOPUP"
              ? "RESERVE_TARGET"
              : "RESIDUAL",
    // PERCENTAGE_OF_GROSS is represented as a fixed minor-unit amount derived
    // from the GROSS inflow with integer basis points, because the adopted pure
    // engine's PERCENTAGE basis is the REMAINING available amount. This keeps
    // legacy gross-based semantics while keeping money arithmetic integer.
    fixedAmountMinor:
      t.tierType === "PERCENTAGE_OF_GROSS" && t.rate != null
        ? applyBasisPoints(gross, Math.round(t.rate * 10_000))
        : t.fixedAmount != null
          ? toMinor(t.fixedAmount)
          : null,
    percentageBps:
      t.rate != null && t.tierType === "PERCENTAGE_OF_REMAINING"
        ? Math.round(t.rate * 10_000)
        : null,
    reserveTargetMinor:
      t.tierType === "THRESHOLD_TOPUP" && t.minAmount != null ? toMinor(t.minAmount) : null,
    minimumMinor: t.minAmount != null && t.tierType !== "THRESHOLD_TOPUP" ? toMinor(t.minAmount) : null,
    maximumMinor: t.maxAmount != null ? toMinor(t.maxAmount) : null,
    thresholdMinor: null,
    destinationEntityId: null,
    countryCode: null,
    sectorCode: null,
    requiresApproval: t.mandatory === true,
    condition: null,
    notes: t.legalBasis ?? null,
  }));

  const ruleSet: WaterfallRuleSetV2 = {
    id: ruleSetId,
    name: params.scenario ?? "BASE",
    version: "1.0.0",
    status: "ACTIVE",
    entityId: null,
    countryCode: null,
    sectorCode: null,
    currency: params.currency,
    effectiveFrom: null,
    effectiveTo: null,
    tiers,
    createdBy: "waterfall-v2-wrapper",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };

  const result = calculateWaterfallV2(
    ruleSet,
    { ruleSetId, periodId: "P1", inflowMinor: gross, currency: params.currency },
    {
      calculationId: "wfr-v2-" + params.scenario,
      calculatedBy: "waterfall-v2-wrapper",
      calculatedAt: "1970-01-01T00:00:00.000Z",
    },
  );

  const lines = result.lines.map((l) => ({
    sequence: l.priority,
    tierCode: l.tierId,
    tierName: l.tierName,
    beneficiaryType: params.tiers.find((t) => t.sequence === l.priority)?.beneficiaryType ?? "",
    basisAmount: toMajor(l.availableBeforeMinor),
    allocatedAmount: toMajor(l.allocatedMinor),
    remainingAfter: toMajor(l.remainingAfterMinor),
    formula: l.skipped
      ? `skipped: ${l.skipReason ?? ""}`
      : `${l.adjustments.join("; ")} t${l.tierId}`, // adapted to WaterfallLine shape
    legalBasis:
      params.tiers.find((t) => t.sequence === l.priority)?.legalBasis ?? null,
  }));

  const totalAllocated = toMajor(result.totalAllocatedMinor);
  const residual = toMajor(result.unallocatedMinor);

  const out: Omit<WaterfallResult, "checksum"> = {
    engineVersion: "waterfall-engine-v2-adopted",
    grossAmount: toMajor(gross),
    currency: params.currency,
    lines,
    totalAllocated,
    residual,
    explanation: [
      `v2 integer engine executed scenario ${params.scenario ?? "BASE"} on ${toMajor(gross).toFixed(2)} ${params.currency}.`,
    ],
    warnings: [],
  };
  return { ...out, checksum: result.inputHash };
}
