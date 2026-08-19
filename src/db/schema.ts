/**
 * BEYU OS canonical schema entrypoint.
 * Drizzle Kit reads this barrel; domain tables live in ./schema/*.
 */
export * from "./schema/enums";
export * from "./schema/core";
export * from "./schema/identity";
export * from "./schema/governance";
export * from "./schema/assurance";
export * from "./schema/finance";
export * from "./schema/people";
export * from "./schema/platform";
