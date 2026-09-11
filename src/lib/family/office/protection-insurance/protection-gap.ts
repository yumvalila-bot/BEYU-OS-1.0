/**
 * BEYU OS — Family Office protection: the protection-gap engine (§11).
 *
 * THE FORMULA, stated once, in code and in this comment:
 *
 *     MODELED PROTECTION GAP
 *   = ( economic/family exposure
 *     + succession liquidity need
 *     + debt & obligation exposure
 *     + business dependency exposure )
 *   − ( qualifying resources
 *     + existing qualifying protection )
 *
 * Everything the engine reports is explained line by line, in integer minor
 * units, with each line's provenance. Three honesty rules are structural:
 *
 *  1. A missing input is NEVER zero. If an input that ADDS to the gap is
 *     missing, the computed gap is a LOWER BOUND. If an input that REDUCES it
 *     is missing, the gap is an UPPER BOUND. Both missing → NOT_QUANTIFIED.
 *     This is why the result carries a `bound` and an explanation, and why
 *     "coverage 100%" can only ever be claimed when every line is quantified.
 *  2. "Existing qualifying protection" counts ONLY in-force death benefits,
 *     summed WITHIN one currency, with no cross-currency rollup (§15 parity),
 *     and never a contingent benefit that the caller excluded (assigned/
 *     encumbered policies are passed in by the caller with a reason).
 *  3. The output is MODELED planning data. It is not advice, not actuarial,
 *     not an insurer quote, and carries the module's disclaimer on its face.
 */

import {
  FAMILY_OFFICE_PROTECTION_VERSION,
  PROTECTION_MODELED_DISCLAIMER,
  type ProvenanceClass,
} from "./types";

export type GapComponentCode =
  | "ECONOMIC_FAMILY_EXPOSURE"
  | "SUCCESSION_LIQUIDITY_NEED"
  | "DEBT_OBLIGATION_EXPOSURE"
  | "BUSINESS_DEPENDENCY_EXPOSURE"
  | "QUALIFYING_RESOURCES"
  | "EXISTING_QUALIFYING_PROTECTION";

export type GapComponent = {
  code: GapComponentCode;
  /** null = NOT_QUANTIFIED: absent. Never coerced to zero. */
  valueMinor: number | null;
  provenance: ProvenanceClass;
  sourceRef: string | null;
  label: string;
};

export type GapLine = {
  code: GapComponentCode;
  effect: "+" | "−";
  amountMinor: number | null;
  quantified: boolean;
  provenance: ProvenanceClass;
  label: string;
};

export type ProtectionGapResult = {
  methodology: "beyu.protection-gap";
  methodologyVersion: string;
  asOf: string;
  currency: string;
  lines: GapLine[];
  /** Sum of quantified + lines; null if any ADDITIVE input is missing. */
  totalExposureMinor: number | null;
  /** Sum of quantified − lines; null if any SUBTRACTIVE input is missing. */
  totalQualifyingMinor: number | null;
  /** The modeled gap, or null when it cannot be honestly stated. */
  modeledGapMinor: number | null;
  bound: "EXACT" | "UPPER_BOUND" | "LOWER_BOUND" | "NOT_QUANTIFIED";
  /** Floor(coverage × 10000 / exposure); null unless EXACT. */
  coverageRatioBps: number | null;
  missingInputs: GapComponentCode[];
  completeness: "COMPLETE" | "PARTIAL" | "NOT_QUANTIFIED";
  epistemicClass: "MODELLED";
  disclaimer: string;
};

const ADDITIVE: readonly GapComponentCode[] = [
  "ECONOMIC_FAMILY_EXPOSURE",
  "SUCCESSION_LIQUIDITY_NEED",
  "DEBT_OBLIGATION_EXPOSURE",
  "BUSINESS_DEPENDENCY_EXPOSURE",
];

export class ProtectionGapInputError extends Error {
  constructor(readonly findings: readonly string[]) {
    super(`Protection-gap input refused:\n - ${findings.join("\n - ")}`);
    this.name = "ProtectionGapInputError";
  }
}

/** Deterministic validation of the caller's inputs, before any arithmetic. */
export function assertGapInputs(currency: string, components: readonly GapComponent[]): void {
  const findings: string[] = [];
  if (!/^[A-Z]{3}$/.test(currency)) findings.push("currency must be an ISO 4217 three-letter code.");
  if (components.length !== 6) findings.push("exactly six components are required; an omitted component is a fabricated zero.");
  const seen = new Set<string>();
  for (const c of components) {
    if (seen.has(c.code)) findings.push(`component ${c.code} supplied twice.`);
    seen.add(c.code);
    if (c.valueMinor !== null && (!Number.isSafeInteger(c.valueMinor) || c.valueMinor < 0)) {
      findings.push(`component ${c.code}: valueMinor must be a non-negative integer in minor units, or null for NOT_QUANTIFIED.`);
    }
    if ((c.provenance === "VERIFIED" || c.provenance === "MODELLED") && !c.sourceRef) {
      findings.push(`component ${c.code}: ${c.provenance} figures must cite a source ref.`);
    }
    if (!c.label.trim()) findings.push(`component ${c.code}: every line needs a human-readable label.`);
  }
  for (const code of ADDITIVE) {
    if (!seen.has(code)) findings.push(`missing component ${code} (supply it, or mark it NOT_QUANTIFIED via valueMinor null).`);
  }
  if (findings.length > 0) throw new ProtectionGapInputError(findings);
}

/**
 * The gap calculation. Pure, integer-only, and total — the same inputs always
 * produce the same lines in the same order.
 */
export function computeProtectionGap(input: {
  asOf: string;
  currency: string;
  components: readonly GapComponent[];
}): ProtectionGapResult {
  assertGapInputs(input.currency, input.components);
  const byCode = new Map(input.components.map((c) => [c.code, c]));

  const lines: GapLine[] = input.components.map((c) => ({
    code: c.code,
    effect: ADDITIVE.includes(c.code) ? "+" : "−",
    amountMinor: c.valueMinor,
    quantified: c.valueMinor !== null,
    provenance: c.provenance,
    label: c.label,
  }));

  const missing = input.components.filter((c) => c.valueMinor === null).map((c) => c.code);
  const missingAdditive = missing.some((code) => ADDITIVE.includes(code));
  const missingSubtractive = missing.some((code) => !ADDITIVE.includes(code));

  let totalExposureMinor: number | null = 0;
  for (const code of ADDITIVE) {
    const v = byCode.get(code)?.valueMinor;
    if (v === null || v === undefined) {
      totalExposureMinor = null;
      break;
    }
    totalExposureMinor += v;
  }
  let totalQualifyingMinor: number | null = 0;
  for (const code of ["QUALIFYING_RESOURCES", "EXISTING_QUALIFYING_PROTECTION"] as const) {
    const v = byCode.get(code)?.valueMinor;
    if (v === null || v === undefined) {
      totalQualifyingMinor = null;
      break;
    }
    totalQualifyingMinor += v;
  }

  let modeledGapMinor: number | null = null;
  let bound: ProtectionGapResult["bound"] = "NOT_QUANTIFIED";
  let completeness: ProtectionGapResult["completeness"] = "NOT_QUANTIFIED";
  if (totalExposureMinor !== null && totalQualifyingMinor !== null) {
    // An exact number: everything supplied. The gap floors at zero (a surplus
    // is not negative protection), and the surplus is reported as coverage.
    modeledGapMinor = Math.max(0, totalExposureMinor - totalQualifyingMinor);
    bound = "EXACT";
    completeness = "COMPLETE";
  } else if (!missingSubtractive && missingAdditive) {
    // Only additive inputs missing → we know ALL the qualifying side; the gap
    // can only be BIGGER than (qualifying − exposure-so-far) floored at zero.
    const knownExposure = ADDITIVE.reduce((acc, code) => acc + (byCode.get(code)?.valueMinor ?? 0), 0);
    modeledGapMinor = Math.max(0, knownExposure - (totalQualifyingMinor ?? 0));
    bound = "LOWER_BOUND";
    completeness = "PARTIAL";
  } else if (!missingAdditive && missingSubtractive) {
    // Only subtractive inputs missing → we know the FULL exposure; the gap can
    // only be SMALLER than exposure minus the qualifying supplied so far.
    const suppliedQualifying =
      (byCode.get("QUALIFYING_RESOURCES")?.valueMinor ?? 0) +
      (byCode.get("EXISTING_QUALIFYING_PROTECTION")?.valueMinor ?? 0);
    modeledGapMinor = Math.max(0, (totalExposureMinor as number) - suppliedQualifying);
    bound = "UPPER_BOUND";
    completeness = "PARTIAL";
  }

  const coverageRatioBps =
    bound === "EXACT" && totalExposureMinor !== null && totalExposureMinor > 0
      ? Math.min(10_000, Math.floor((((totalExposureMinor as number) - (modeledGapMinor ?? 0)) * 10_000) / (totalExposureMinor as number)))
      : null;

  return {
    methodology: "beyu.protection-gap",
    methodologyVersion: FAMILY_OFFICE_PROTECTION_VERSION,
    asOf: input.asOf,
    currency: input.currency,
    lines,
    totalExposureMinor,
    totalQualifyingMinor,
    modeledGapMinor,
    bound,
    coverageRatioBps,
    missingInputs: missing,
    completeness,
    epistemicClass: "MODELLED",
    disclaimer: PROTECTION_MODELED_DISCLAIMER,
  };
}

/**
 * Convenience: the coverage side of the formula assembled from recorded
 * policies. The CALLER decides which policies qualify (in-force, unassigned,
 * right purpose); this only sums, within one currency, what it was given.
 * A mixed-currency list is refused rather than silently filtered, because a
 * quietly dropped policy is a fabricated protection figure.
 */
export function sumInForceDeathBenefits(policies: readonly { currency: string; deathBenefitMinor: number }[], currency: string): number {
  let total = 0;
  for (const p of policies) {
    if (p.currency !== currency) {
      throw new ProtectionGapInputError([`sumInForceDeathBenefits: policy currency ${p.currency} ≠ assessment currency ${currency}. No FX conversion is performed here — convert only with a ratified rate, outside the engine, or assess in each currency.`]);
    }
    if (!Number.isSafeInteger(p.deathBenefitMinor) || p.deathBenefitMinor < 0) {
      throw new ProtectionGapInputError(["sumInForceDeathBenefits: every policy must carry a non-negative integer death benefit."]);
    }
    total += p.deathBenefitMinor;
  }
  return total;
}
