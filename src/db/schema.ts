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
 * UJENZI OS — construction Sector OS (additive).
 *
 * Projects, sites, phases, milestones, governed BOQ versions, cost records
 * (ESTIMATE / BUDGET / COMMITTED / ACTUAL / FORECAST), procurement,
 * materials, equipment, site diaries, quality (inspection requests, NCRs),
 * HSE, variations, claims, payment certificates and handover punch lists.
 * Identity, HCM, documents, approvals, workflow and notifications stay
 * canonical in BEYU shared capabilities; Finance OS remains the only journal
 * writer (a Ujenzi payment certificate emits PAYMENT_CERTIFIED and never
 * posts; CAP_POSTING stays LOCKED). RLS tenant isolation mirrors migration
 * 0031/0034/0035: FORCE ROW LEVEL SECURITY with beyu_tenant_ids() policies.
 */
export * from "./schema/ujenzi";

/*
 * GOVERNED TENANT-DOMAIN REGISTRY (additive) — the ONE source of truth for
 * hostname → tenant mapping (Health OS tenant domains first).
 *
 * A domain row maps ONE hostname to ONE canonical tenant (optionally one legal
 * entity and country) for ONE operating system. Resolution happens through this
 * registry and then through the EXISTING authorization chain; a hostname NEVER
 * grants access — it can only restrict the tenant context a request is
 * evaluated in, and every request re-runs session, federation/OS authorization,
 * tenant/entity/country scope, RBAC/ABAC/policy and RLS server-side.
 *
 * RLS tenant isolation mirrors 0031/0034/0035/0043/0062: FORCE ROW LEVEL
 * SECURITY with a beyu_tenant_ids() policy. Only ACTIVE + VERIFIED tenant rows
 * resolve; unknown or inactive names fail closed and never fall back to a
 * default tenant.
 */
export * from "./schema/tenant-domains";

/*
 * UNIVERSAL DIMENSIONAL GRAPHICS FOUNDATION — shared capability (additive).
 *
 * ONE shared BEYU capability, NOT an OS and NOT a sector: dimension-extension
 * registry (9D+), scene configurations, digital-twin registrations and the
 * export ledger. Sector OSs — Health, Finance, Agriculture and UJENZI (each a
 * full Sector OS) — plus Foundation consume the capability through governed
 * adapters that re-check each sector's OWN authorization; RLS tenant isolation
 * mirrors migrations 0031/0034/0035/0043. No journal, ledger or posting
 * column exists here; Finance OS remains the only journal writer and
 * CAP_POSTING stays LOCKED.
 */
export * from "./schema/visualization";

/*
 * Governed CONTRACTING domain — materialized (additive).
 *
 * Contract records, party posture, authority checks, deterministic obligations
 * and their ledgers, SLA measurements, execution links, signature evidence,
 * disputes and legal-document lifecycle. Money truth stays in Finance OS
 * (`authoritative_owner`/`finance_record_ref`), documents stay canonical in
 * `documents`, identity stays canonical in `parties`, approvals stay canonical
 * in Governance. The pure engines in `src/lib/contracts/*` decide every state
 * transition; these tables store the governed result, never an inference.
 */
export * from "./schema/contracts";

/*
 * Governed BLOCKCHAIN capability — materialized (additive).
 *
 * Anchored commitments (EIP-712), smart-contract registry with testnet-first
 * progression, indexed events, governed oracles, non-authoritative token
 * positions and read-only reconciliation. There is deliberately no key
 * material, no wallet, and no write path that lets on-chain state overwrite a
 * canonical registry: BEYU computes and verifies evidence; an external,
 * governed signer executes.
 */
export * from "./schema/blockchain";

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

/*
 * ADMINISTRATIVE USER & TENANT GOVERNANCE (X10THINK administrative program) —
 * additive. ONE shared BEYU OS capability: the delegation instruments for
 * bounded administrative authority. Identity, tenants, roles, assignments,
 * audit and the authorization engine remain canonical; this table holds no
 * authority of its own — active delegations feed the SAME `can()` primitive
 * through resolvePrincipal(). Not an OS, not a second authorization model.
 */
export * from "./schema/admin-governance";

/*
 * P3 RELEASE GOVERNANCE — canonical control-plane capability (additive).
 *
 * Release records, transitions, PVG runs, canary deployments, blue/green
 * deployments and rollback requests. Governed, auditable, immutable append-only
 * where applicable. Not an OS — a shared BEYU OS capability. Reuses existing
 * audit_log + enterprise_events infrastructure for evidence; does not create
 * competing trails. Authorization via platform:config.manage / platform:dashboard.read
 * and existing RBAC/ABAC/RLS chain.
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


