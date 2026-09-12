/**
 * BEYU OS — FAMILY OFFICE PROTECTION & INSURANCE layer (entrypoint).
 *
 * Life insurance as a governed Family Office capability: protection records,
 * beneficiary designations, premium obligations, policy review, claims ledgers,
 * modeled protection gaps and succession-liquidity views — inside
 * `BEYU OS → Family Office`, sharing HCM, Risk, Finance, Legal, Documents,
 * Workflow, Events, Audit and Noelia/HIVE through their existing interfaces.
 *
 * IT IS NOT AN OS. There is no insurance marketplace, no brokerage, no
 * underwriting, no payment rail and no insurer integration here (§36, §37).
 * The whole of this layer is governed information, planning and workflow
 * records; consequential acts belong to their canonical owners:
 *
 *   contract state     → the insurer's record, entered by an authorized human
 *   accounting truth   → Finance OS (CAP_POSTING untouched, fail-closed as is)
 *   employee identity  → HCM
 *   legal outcome      → the instrument, via Legal & Liability
 *   risk posture       → Risk
 *
 * The sibling `../capital-wealth` layer holds the balance sheet, obligations
 * and generational plans this layer REFERENCES by id — it never recomputes or
 * re-stores them.
 */

export * from "./types";
export * from "./policy";
export * from "./beneficiaries";
export * from "./premiums";
export * from "./claims";
export * from "./reviews";
export * from "./protection-gap";
export * from "./liquidity";
