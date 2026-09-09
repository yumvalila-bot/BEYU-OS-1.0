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
