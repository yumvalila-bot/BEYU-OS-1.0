/**
 * BEYU OS canonical schema entrypoint.
 * Drizzle Kit reads this barrel; domain tables live in ./schema/*.
 */
export * from "./schema/enums";
export * from "./schema/core";
export * from "./schema/identity";
export * from "./schema/bootstrap";
export * from "./schema/governance";
export * from "./schema/assurance";
export * from "./schema/finance";
export * from "./schema/payments";
export * from "./schema/people";
export * from "./schema/platform";
export * from "./schema/ai";
export * from "./schema/ai-compliance";
export * from "./schema/ai-phase5";
export * from "./schema/agriculture";
export * from "./schema/foundation";
export * from "./schema/government";

/*
 * Family Office CAPITAL & WEALTH domain — materialized.
 *
 * `./schema/family-office` (the neutral policy/ratification mechanism) is
 * deliberately NOT exported here: its materialization is gated on the first
 * registered ratification, and exporting it would create tables the governance
 * process has not yet earned. That is unchanged.
 */
export * from "./schema/family-office-capital";

/*
 * Family Office PROTECTION & INSURANCE domain — materialized (additive).
 * Governed records of life-insurance protection, beneficiary designations,
 * premium obligations, reviews, claims and modeled protection gaps. A Family
 * Office capability, not an OS; Finance, HCM, Risk, Legal, Documents, Audit
 * and Noelia remain canonical for what they already own.
 */
export * from "./schema/family-office-protection";

/*
 * FOUNDER EQUITY, CAPITALIZATION & ESOP domain (X10THINK Phase 2) — additive.
 * Instrument-level capitalization INSIDE BEYU OS: `ownership_records` remains
 * the canonical entity-level ownership registry, Finance OS remains the sole
 * accounting authority (CAP_POSTING untouched), HCM remains the employee
 * master, documents/approvals/resolutions remain canonical. Not an OS.
 */
export * from "./schema/equity";

/*
 * FAMILY TRUST GOVERNANCE domain (X10THINK Phase 3) — additive. Persists the
 * existing trust rails (`src/lib/family/office/trust.ts`): instruments,
 * jurisdiction-aware provisions (INERT without ratified legal effect), trustee
 * decisions and distribution decision records. Beneficiaries, entity
 * appointments, documents and the governance engine remain canonical. Not an OS.
 */
export * from "./schema/family-trust";
