/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH layer (entrypoint).
 *
 * This is the capital, wealth, treasury, investment and generational capability
 * INSIDE the existing Family Office. It extends `src/lib/family/office/*` and
 * consumes the existing Finance OS, treasury, risk, governance, audit and Noelia
 * infrastructure. It does not replace any of them.
 *
 * Design invariants, each enforced in code and covered by tests:
 *
 *   1. Integer minor units and basis points throughout. Never floating point for
 *      money (`metrics.ts`).
 *   2. No threshold, appetite or policy value is hard-coded. Every limit arrives
 *      with provenance or the measure reports REQUIRES_POLICY.
 *   3. The Family Office models capital; Finance OS owns accounting. Every
 *      monetary record declares its authoritative owner and can never be
 *      presented as posted (`obligations.ts`, `cash-flow.ts`, `intelligence.ts`).
 *   4. Noelia recommends; a human decides; an authorised system executes; Finance
 *      OS accounts; audit proves. The chain is structural, not documented
 *      (`noelia-intelligence.ts`).
 *   5. A model is never an executed transaction (`real-estate.ts`).
 *   6. A doctrine principle is never an investment instruction
 *      (`capital-doctrine.ts`).
 */

export * from "./errors";
export * from "./metrics";
export * from "./capital-doctrine";
export * from "./obligations";
export * from "./debt";
export * from "./real-estate";
export * from "./investment";
export * from "./cash-flow";
export * from "./capital-allocation";
export * from "./generational";
export * from "./intelligence";
export * from "./noelia-intelligence";

/** The layer's own version, for audit records and API responses. */
export const FAMILY_OFFICE_CAPITAL_WEALTH_VERSION = "family-office-capital-wealth-1.0.0";
