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
export * from "./schema/search";

/*
 * FEDERATION & TRUST — shared BEYU OS capability (additive, migration 0071).
 */
export * from "./schema/federation";

/*
 * UJENZI OS — construction Sector OS (additive).
 */
export * from "./schema/ujenzi";

/*
 * GOVERNED TENANT-DOMAIN REGISTRY (additive)
 */
export * from "./schema/tenant-domains";

/*
 * UNIVERSAL DIMENSIONAL GRAPHICS FOUNDATION — shared capability (additive).
 */
export * from "./schema/visualization";

/*
 * Governed CONTRACTING domain — materialized (additive).
 */
export * from "./schema/contracts";

/*
 * Governed BLOCKCHAIN capability — materialized (additive).
 */
export * from "./schema/blockchain";

/*
 * Family Office CAPITAL & WEALTH domain — materialized.
 */
export * from "./schema/family-office-capital";

/*
 * Family Office PROTECTION & INSURANCE domain — materialized (additive).
 */
export * from "./schema/family-office-protection";

/*
 * FOUNDER EQUITY, CAPITALIZATION & ESOP domain (X10THINK Phase 2) — additive.
 */
export * from "./schema/equity";

/*
 * FAMILY TRUST GOVERNANCE domain (X10THINK Phase 3) — additive.
 */
export * from "./schema/family-trust";

/*
 * ADMINISTRATIVE USER & TENANT GOVERNANCE (X10THINK administrative program) — additive.
 */
export * from "./schema/admin-governance";

/*
 * P3 RELEASE GOVERNANCE — canonical control-plane capability (additive).
 */
export * from "./schema/release";

export * from "./schema/governance-execution";
export * from "./schema/governance-charters";

export * from "./schema/governance-appointments";

export * from "./schema/governance-establishments";

export * from "./schema/governance-activations";
export * from "./schema/governance-membership";

export * from "./schema/governance-body-changes";

export * from "./schema/governance-meetings";

export * from "./schema/governance-calendar";

/*
 * SHARED COMMUNICATIONS CAPABILITY — world-class governed communications
 * platform (additive, migration 0072).
 *
 * ONE shared BEYU OS capability, NOT an OS: the governed communication layer
 * for WhatsApp, SMS, Email, In-App, Internal BEYU messaging, unified
 * conversations, contact 360°, omnichannel continuity, orchestration,
 * routing, templates, localization, consent, preferences, human handoff,
 * cases/tickets, SLA/escalation, invoices, receipts, reports, documents,
 * feedback, surveys, alerts, reminders, journeys, workflow-triggered
 * communications, AI-assisted communication through Noelia/HIVE, human
 * approval, delivery tracking, provider failover, reliability, analytics,
 * cost intelligence, security monitoring, international/country-specific
 * providers, accessibility, auditability, governance.
 *
 * Preserves GlobalUserID, RBAC/ABAC/RLS, audit/events, idempotency,
 * documents, workflow, Noelia. CAP_POSTING remains LOCKED.
 */
export * from "./schema/communications";
