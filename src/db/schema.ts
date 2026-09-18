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
