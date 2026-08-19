import { ENGINE_VERSION_WATERFALL } from "./constants";
import { sha256, stableStringify } from "./crypto";

/**
 * BEYU OS Waterfall Cashflow Engine (deterministic, explainable, auditable).
 *
 * Canonical order (configurable per entity / jurisdiction / policy / period):
 *   REVENUE → TAXES → OPERATING COSTS → DEBT SERVICE → RESERVES →
 *   REQUIRED DISTRIBUTIONS → CAPITAL ALLOCATION → INVESTMENTS →
 *   REINVESTMENT → OWNER / BENEFICIARY DISTRIBUTIONS
 *
 * All arithmetic is performed in integer minor units (cents) to eliminate
 * floating point drift. Every line carries the formula that produced it.
 */

export type TierType =
  | "PERCENTAGE_OF_GROSS"
  | "PERCENTAGE_OF_REMAINING"
  | "FIXED"
  | "THRESHOLD_TOPUP"
  | "RESIDUAL";

export type WaterfallTierInput = {
  sequence: number;
  code: string;
  name: string;
  tierType: TierType;
  rate?: number | null;
  fixedAmount?: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  beneficiaryType: string;
  legalBasis?: string | null;
  mandatory?: boolean;
};

export type WaterfallLine = {
  sequence: number;
  tierCode: string;
  tierName: string;
  beneficiaryType: string;
  basisAmount: number;
  allocatedAmount: number;
  remainingAfter: number;
  formula: string;
  legalBasis?: string | null;
};

export type WaterfallResult = {
  engineVersion: string;
  grossAmount: number;
  currency: string;
  lines: WaterfallLine[];
  totalAllocated: number;
  residual: number;
  explanation: string[];
  checksum: string;
  warnings: string[];
};

const toMinor = (v: number) => Math.round(v * 100);
const toMajor = (v: number) => Math.round(v) / 100;

export function runWaterfall(params: {
  grossAmount: number;
  currency: string;
  tiers: WaterfallTierInput[];
  scenario?: string;
}): WaterfallResult {
  const gross = toMinor(params.grossAmount);
  if (!Number.isFinite(gross) || gross < 0) {
    throw new Error("Waterfall gross amount must be a non-negative finite number");
  }
  const tiers = [...params.tiers].sort((a, b) => a.sequence - b.sequence);
  const lines: WaterfallLine[] = [];
  const explanation: string[] = [];
  const warnings: string[] = [];

  explanation.push(
    `Engine ${ENGINE_VERSION_WATERFALL} executed scenario ${params.scenario ?? "BASE"} on gross ${toMajor(
      gross,
    ).toFixed(2)} ${params.currency}.`,
  );

  let remaining = gross;
  let allocatedTotal = 0;

  for (const tier of tiers) {
    const basis =
      tier.tierType === "PERCENTAGE_OF_GROSS" ? gross : remaining;
    let allocation = 0;
    let formula = "";

    switch (tier.tierType) {
      case "PERCENTAGE_OF_GROSS": {
        const rate = tier.rate ?? 0;
        allocation = Math.round(gross * rate);
        formula = `${(rate * 100).toFixed(4)}% × gross ${toMajor(gross).toFixed(2)}`;
        break;
      }
      case "PERCENTAGE_OF_REMAINING": {
        const rate = tier.rate ?? 0;
        allocation = Math.round(remaining * rate);
        formula = `${(rate * 100).toFixed(4)}% × remaining ${toMajor(remaining).toFixed(2)}`;
        break;
      }
      case "FIXED": {
        allocation = toMinor(tier.fixedAmount ?? 0);
        formula = `fixed allocation ${toMajor(allocation).toFixed(2)}`;
        break;
      }
      case "THRESHOLD_TOPUP": {
        const target = toMinor(tier.minAmount ?? 0);
        allocation = Math.max(0, Math.min(target, remaining));
        formula = `top-up to reserve floor ${toMajor(target).toFixed(2)} from remaining ${toMajor(
          remaining,
        ).toFixed(2)}`;
        break;
      }
      case "RESIDUAL": {
        allocation = remaining;
        formula = `residual sweep of ${toMajor(remaining).toFixed(2)}`;
        break;
      }
    }

    if (tier.maxAmount != null) {
      const cap = toMinor(tier.maxAmount);
      if (allocation > cap) {
        formula += ` capped at ${toMajor(cap).toFixed(2)}`;
        allocation = cap;
      }
    }
    if (tier.minAmount != null && tier.tierType !== "THRESHOLD_TOPUP") {
      const floor = toMinor(tier.minAmount);
      if (allocation < floor) {
        formula += ` floored at ${toMajor(floor).toFixed(2)}`;
        allocation = floor;
      }
    }

    if (allocation > remaining) {
      if (tier.mandatory === false) {
        formula += ` reduced to available ${toMajor(remaining).toFixed(2)}`;
        allocation = Math.max(0, remaining);
      } else {
        warnings.push(
          `Tier ${tier.code} (${tier.name}) is mandatory but exceeds available cash by ${toMajor(
            allocation - remaining,
          ).toFixed(2)} ${params.currency}. Shortfall requires governance escalation.`,
        );
        allocation = Math.max(0, remaining);
        formula += ` limited by available cash (shortfall escalated)`;
      }
    }
    if (allocation < 0) allocation = 0;

    remaining -= allocation;
    allocatedTotal += allocation;

    lines.push({
      sequence: tier.sequence,
      tierCode: tier.code,
      tierName: tier.name,
      beneficiaryType: tier.beneficiaryType,
      basisAmount: toMajor(basis),
      allocatedAmount: toMajor(allocation),
      remainingAfter: toMajor(remaining),
      formula,
      legalBasis: tier.legalBasis ?? null,
    });
    explanation.push(
      `#${tier.sequence} ${tier.name} → ${toMajor(allocation).toFixed(2)} ${params.currency} (${formula}); remaining ${toMajor(
        remaining,
      ).toFixed(2)}.`,
    );
  }

  if (allocatedTotal + remaining !== gross) {
    warnings.push("Reconciliation variance detected — run rejected for commitment.");
  }

  const result: Omit<WaterfallResult, "checksum"> = {
    engineVersion: ENGINE_VERSION_WATERFALL,
    grossAmount: toMajor(gross),
    currency: params.currency,
    lines,
    totalAllocated: toMajor(allocatedTotal),
    residual: toMajor(remaining),
    explanation,
    warnings,
  };

  return { ...result, checksum: sha256(stableStringify(result)) };
}

/** Canonical default tier template used when bootstrapping a new entity. */
export const CANONICAL_TIER_TEMPLATE: WaterfallTierInput[] = [
  { sequence: 1, code: "TAX", name: "Statutory taxes", tierType: "PERCENTAGE_OF_GROSS", rate: 0.3, beneficiaryType: "TAX_AUTHORITY", legalBasis: "Income Tax Act (jurisdiction specific)" },
  { sequence: 2, code: "OPEX", name: "Operating costs", tierType: "PERCENTAGE_OF_GROSS", rate: 0.35, beneficiaryType: "OPERATIONS" },
  { sequence: 3, code: "DEBT", name: "Debt service", tierType: "PERCENTAGE_OF_REMAINING", rate: 0.25, beneficiaryType: "LENDER" },
  { sequence: 4, code: "RESERVE", name: "Mandatory reserves", tierType: "THRESHOLD_TOPUP", minAmount: 0, beneficiaryType: "RESERVE" },
  { sequence: 5, code: "CAPEX", name: "Capital allocation", tierType: "PERCENTAGE_OF_REMAINING", rate: 0.3, beneficiaryType: "CAPITAL" },
  { sequence: 6, code: "FOUNDATION", name: "Foundation allocation", tierType: "PERCENTAGE_OF_REMAINING", rate: 0.1, beneficiaryType: "FOUNDATION" },
  { sequence: 7, code: "OWNER", name: "Owner / beneficiary distributions", tierType: "RESIDUAL", beneficiaryType: "OWNER" },
];
