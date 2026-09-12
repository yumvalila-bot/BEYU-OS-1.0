/**
 * BEYU OS — Family Office protection: succession-liquidity modeling (§13).
 *
 * THE BUCKET RULE, and it is the whole of this file:
 *
 *     MODELED SUCCESSION LIQUIDITY
 *   = current liquid resources (recorded cash, Finance-sourced inputs)
 *   + insurance proceeds ACTUALLY RECEIVED
 *   + trust liquidity (caller input)
 *   + business liquidity (caller input)
 *   − known obligations
 *
 * and, in a SEPARATE bucket that the total above never touches:
 *
 *     CONTINGENT PROTECTION LIQUIDITY
 *   = in-force death benefits (policy proceeds contingent on a death the model
 *     does not assume) + claim proceeds in EXPECTED/CLAIMED/APPROVED
 *
 * A death benefit is not net worth (§4). The engine therefore cannot be asked
 * to include contingent proceeds "just for the total": `buckets` keeps them
 * apart, `modeledTotalMinor` is defined to exclude them, and every figure
 * carries its state so a screen can never render one as the other.
 *
 * Cross-currency rule inherited from the capital domain: totals are
 * per-currency or nothing. This module has no FX authority.
 */

import { proceedsAreContingent, proceedsCountAsCash } from "./claims";
import type { ProceedsState } from "./types";

export type LiquidityInputRow = {
  /** What the row is: cash, received proceeds, contingent benefit, obligation. */
  kind:
    | "LIQUID_RESOURCE"
    | "INSURANCE_PROCEEDS"
    | "POLICY_DEATH_BENEFIT"
    | "TRUST_LIQUIDITY"
    | "BUSINESS_LIQUIDITY"
    | "POLICY_CASH_VALUE"
    | "POLICY_SURRENDER_VALUE"
    | "OBLIGATION";
  amountMinor: number;
  currency: string;
  label: string;
  /** For INSURANCE_PROCEEDS rows: where in the proceeds machine the claim sits. */
  proceedsState?: ProceedsState;
  /** For INSURANCE_PROCEEDS rows: the claim reference the row points at. */
  sourceRef?: string | null;
  provenance: "VERIFIED" | "USER_PROVIDED" | "MODELLED" | "ESTIMATED" | "UNVERIFIED";
};

export type SuccessionLiquidityResult = {
  methodology: "beyu.succession-liquidity";
  asOf: string;
  currency: string;
  buckets: {
    currentLiquidMinor: number;
    receivedInsuranceProceedsMinor: number;
    trustLiquidityMinor: number;
    businessLiquidityMinor: number;
    /** Recorded surrender values — MODELLED liquidity potential, not cash. */
    policySurrenderValuePotentialMinor: number;
    knownObligationsMinor: number;
    /** Death benefits contingent on the modeled event; EXCLUDED from the total. */
    contingentInsuranceProceedsMinor: number;
    /** Claims in flight that are not yet received; also EXCLUDED from the total. */
    expectedClaimProceedsMinor: number;
  };
  modeledTotalMinor: number;
  shortfallMinor: number | null;
  /** modeledTotal / obligations in bps, floored; null when obligations are 0/absent. */
  coverageBps: number | null;
  excludedRows: { label: string; reason: string; amountMinor: number }[];
  notes: string[];
  epistemicClass: "MODELLED";
  disclaimer: string;
};

export class SuccessionLiquidityInputError extends Error {
  constructor(readonly findings: readonly string[]) {
    super(`Succession-liquidity input refused:\n - ${findings.join("\n - ")}`);
    this.name = "SuccessionLiquidityInputError";
  }
}

/**
 * Aggregate one currency's rows into the modeled succession-liquidity view.
 * Every row is placed by KIND and PROCEEDS STATE — an INSURANCE_PROCEEDS row
 * in a contingent state goes to the contingent bucket by definition; the
 * caller cannot route it into the total.
 */
export function modelSuccessionLiquidity(input: {
  asOf: string;
  currency: string;
  rows: readonly LiquidityInputRow[];
}): SuccessionLiquidityResult {
  const { currency, asOf } = input;
  const findings: string[] = [];
  if (!/^[A-Z]{3}$/.test(currency)) findings.push("currency must be an ISO 4217 code.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) findings.push("asOf must be an ISO calendar date.");
  for (const r of input.rows) {
    if (!Number.isSafeInteger(r.amountMinor) || r.amountMinor < 0) findings.push(`row "${r.label}": amountMinor must be a non-negative integer in minor units.`);
    if (r.currency !== currency) findings.push(`row "${r.label}" is in ${r.currency} while the model is ${currency}: no cross-currency aggregation is performed (§15). Assess per currency or convert with a ratified rate outside the engine.`);
  }
  if (findings.length > 0) throw new SuccessionLiquidityInputError(findings);

  const b = {
    currentLiquidMinor: 0,
    receivedInsuranceProceedsMinor: 0,
    trustLiquidityMinor: 0,
    businessLiquidityMinor: 0,
    policySurrenderValuePotentialMinor: 0,
    knownObligationsMinor: 0,
    contingentInsuranceProceedsMinor: 0,
    expectedClaimProceedsMinor: 0,
  };
  const excluded: SuccessionLiquidityResult["excludedRows"] = [];
  const notes: string[] = [];

  for (const r of input.rows) {
    switch (r.kind) {
      case "LIQUID_RESOURCE":
        b.currentLiquidMinor += r.amountMinor;
        break;
      case "TRUST_LIQUIDITY":
        b.trustLiquidityMinor += r.amountMinor;
        break;
      case "BUSINESS_LIQUIDITY":
        b.businessLiquidityMinor += r.amountMinor;
        break;
      case "POLICY_SURRENDER_VALUE":
        b.policySurrenderValuePotentialMinor += r.amountMinor;
        excluded.push({ label: r.label, reason: "Surrender value is a policy-dependent exit value, not liquid wealth; reported separately.", amountMinor: r.amountMinor });
        break;
      case "POLICY_CASH_VALUE":
        // Cash value inside a contract is NOT in hand; it is reported with the
        // surrender bucket because surrender is the path to liquidity the
        // contract actually provides.
        b.policySurrenderValuePotentialMinor += 0;
        excluded.push({ label: r.label, reason: "In-contract cash value is not cash; the surrender value (where recorded) is the liquidity the contract offers.", amountMinor: r.amountMinor });
        break;
      case "OBLIGATION":
        b.knownObligationsMinor += r.amountMinor;
        break;
      case "POLICY_DEATH_BENEFIT":
        // The face amount of a live contract: contingent by construction.
        // It can enter this bucket and no other (§4).
        b.contingentInsuranceProceedsMinor += r.amountMinor;
        break;
      case "INSURANCE_PROCEEDS": {
        const state = r.proceedsState ?? "EXPECTED";
        if (proceedsCountAsCash(state)) {
          b.receivedInsuranceProceedsMinor += r.amountMinor;
        } else if (proceedsAreContingent(state)) {
          b.expectedClaimProceedsMinor += r.amountMinor;
        } else {
          // NONE on a proceeds row is incoherent: a claim row exists, so its
          // proceeds posture must too. Report it; do not silently drop it.
          excluded.push({ label: r.label, reason: `Proceeds row in state ${state} carries no proceeds posture the model can use; record the claim state first.`, amountMinor: r.amountMinor });
        }
        break;
      }
    }
  }

  const modeledTotalMinor =
    b.currentLiquidMinor +
    b.receivedInsuranceProceedsMinor +
    b.trustLiquidityMinor +
    b.businessLiquidityMinor -
    b.knownObligationsMinor;

  // The net may legitimately be negative: recorded obligations exceeding
  // available liquidity IS the finding. `shortfallMinor` states it positively
  // for screens; the total is never floored into hiding it.
  const availableMinor = b.currentLiquidMinor + b.receivedInsuranceProceedsMinor + b.trustLiquidityMinor + b.businessLiquidityMinor;
  const shortfallMinor = availableMinor < b.knownObligationsMinor ? b.knownObligationsMinor - availableMinor : 0;

  const coverageBps = b.knownObligationsMinor > 0
    ? Math.floor(((b.currentLiquidMinor + b.receivedInsuranceProceedsMinor + b.trustLiquidityMinor + b.businessLiquidityMinor) * 10_000) / b.knownObligationsMinor)
    : null;

  if (b.expectedClaimProceedsMinor > 0) {
    notes.push(`${b.expectedClaimProceedsMinor} minor units of claim proceeds are in EXPECTED/CLAIMED/APPROVED state. Contingent until received: excluded from the modeled total by design (§13).`);
  }
  if (b.policySurrenderValuePotentialMinor > 0) {
    notes.push(`${b.policySurrenderValuePotentialMinor} minor units of recorded surrender value are available liquidity ONLY by surrendering coverage; the trade-off is a family decision, not a model output.`);
  }
  notes.push("Modeled planning view over recorded data and caller-supplied inputs. Not a forecast, not a valuation, not accounting truth (§32).");

  return {
    methodology: "beyu.succession-liquidity",
    asOf,
    currency,
    buckets: { ...b },
    modeledTotalMinor,
    shortfallMinor,
    coverageBps,
    excludedRows: excluded,
    notes,
    epistemicClass: "MODELLED",
    disclaimer:
      "MODELED succession-liquidity view. Contingent insurance proceeds are NEVER included in liquidity; only amounts recorded as received are. Finance OS holds the accounting truth.",
  };
}
