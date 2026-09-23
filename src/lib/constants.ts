/** BEYU OS platform constants — single definition, consumed everywhere. */

export const SYSTEM_VERSION = "BEYU-OS/1.0.0";
export const ENGINE_VERSION_WATERFALL = "waterfall-engine/1.2.0";
export const NOELIA_IDENTITY = "NOELIA";
export const HIVE_RUNTIME = "HIVE";
/** Governed scheduler/worker service identity — distinct from the interactive Noelia identity. */
export const NOELIA_SCHEDULER_IDENTITY = "NOELIA_SCHEDULER";
export const NOELIA_PROMPT_VERSION = "noelia-prompt/2.0.0";
export const SESSION_COOKIE = "beyu_os_session";
/** httpOnly cookie carrying the one-time administrator enrollment token. */
export const BOOTSTRAP_ENROLLMENT_COOKIE = "beyu_os_admin_enrollment";
export const SESSION_TTL_HOURS = 12;

/**
 * Canonical strategic horizons (Noelia executive intelligence metadata).
 *
 * Horizons are INTELLIGENCE METADATA, never automatic authority levels. A
 * longer horizon implies no additional authority; every recommendation remains
 * subject to the full BEYU governance boundary regardless of horizon.
 */
export const NOELIA_HORIZONS = [
  "HORIZON_1_IMMEDIATE",
  "HORIZON_2_NEAR_TERM",
  "HORIZON_3_MEDIUM_TERM",
  "HORIZON_4_LONG_TERM",
  "HORIZON_5_GENERATIONAL",
  "HORIZON_6_INSTITUTIONAL_CONTINUITY_100Y",
] as const;
export type NoeliaHorizon = (typeof NOELIA_HORIZONS)[number];

export const HORIZON_LABELS: Record<NoeliaHorizon, string> = {
  HORIZON_1_IMMEDIATE: "Immediate (0–90 days)",
  HORIZON_2_NEAR_TERM: "Near term (90 days–1 year)",
  HORIZON_3_MEDIUM_TERM: "Medium term (1–3 years)",
  HORIZON_4_LONG_TERM: "Long term (3–10 years)",
  HORIZON_5_GENERATIONAL: "Generational (10–30 years)",
  HORIZON_6_INSTITUTIONAL_CONTINUITY_100Y: "Institutional continuity (30–100 years)",
};

/**
 * Canonical analytic epistemics for every Noelia analytical result.
 *
 * Every finding, metric and recommendation must carry one of these statuses.
 * The mapping to the legacy ai_output_class enum is lossless: these statuses
 * are the fine-grained classes, and the outputClass remains the coarse
 * envelope for the ai_decisions table.
 */
export const NOELIA_EPISTEMIC_STATUS = [
  "OBSERVED",
  "DERIVED",
  "FORECAST",
  "SCENARIO",
  "INFERENCE",
  "RECOMMENDATION",
  "PREDICTION",
  "UNCERTAINTY",
  "UNAVAILABLE",
  "UNVERIFIED",
  "STALE",
  "REQUIRES_HUMAN_REVIEW",
] as const;
export type NoeliaEpistemicStatus = (typeof NOELIA_EPISTEMIC_STATUS)[number];

export const EPISTEMIC_STATUS_LABELS: Record<NoeliaEpistemicStatus, string> = {
  OBSERVED: "Directly measured from an authoritative source.",
  DERIVED: "Computed deterministically from OBSERVED inputs.",
  FORECAST: "A projection from observed history. Never a fact.",
  SCENARIO: "A hypothetical world. Never financial truth.",
  INFERENCE: "A reasoned conclusion from evidence; not directly measured.",
  RECOMMENDATION: "A proposed course of action; requires accountable decision.",
  PREDICTION: "A statement about an unobserved future state.",
  UNCERTAINTY: "Evidence is insufficient or conflicting.",
  UNAVAILABLE: "The data does not exist or is not in scope. Never zero.",
  UNVERIFIED: "Retrieved but not verified as authoritative.",
  STALE: "Outside its governed validity window.",
  REQUIRES_HUMAN_REVIEW: "A human with authority must decide.",
};

export const CLASSIFICATION_ORDER = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
] as const;

export type Classification = (typeof CLASSIFICATION_ORDER)[number];

export function classificationRank(c: string): number {
  const idx = CLASSIFICATION_ORDER.indexOf(c as Classification);
  return idx < 0 ? CLASSIFICATION_ORDER.length : idx;
}

/** Known catalogue only. Unknown strings must never be treated as a clearance. */
export function isKnownClassification(c: string): c is Classification {
  return (CLASSIFICATION_ORDER as readonly string[]).includes(c);
}

/**
 * Enumerate the data classifications visible at a known principal clearance.
 * Unknown clearances deliberately produce an empty SQL allow-list rather than
 * inheriting classificationRank()'s high sentinel value.
 */
export function classificationsAtOrBelow(clearance: string): Classification[] {
  if (!isKnownClassification(clearance)) return [];
  return CLASSIFICATION_ORDER.slice(0, classificationRank(clearance) + 1);
}

/**
 * Canonical permission catalogue (domain:object.action).
 * A capability that is not listed here does not exist constitutionally.
 */
export const PERMISSIONS = {
  // Control plane
  "platform:dashboard.read": "View the executive control centre",
  "platform:config.manage": "Manage configuration and feature flags",
  "platform:registry.read": "Read the OS / source-of-truth registry",
  "platform:registry.manage": "Register or retire an OS",
  //
  // Shared Search (ONE shared BEYU OS capability — kind SHARED_CAPABILITY in
  // os_registry, never a Search OS / Knowledge OS / Documents OS).
  //
  // `platform:search.read` is the key to the canonical cross-OS search query.
  // It grants NO data of its own: every result source is separately gated by
  // that source's EXISTING read permission (organization:entity.read,
  // documents:registry.read, governance:resolution.read, ujenzi:data.read,
  // agriculture:data.read, foundation:registry.read, ai:noelia.query), so a
  // search can only surface records the principal may already read through the
  // normal governed API. Search has no write path and confers no posting,
  // mutation, approval or financial capability — CAP_POSTING stays LOCKED.
  // Scope (tenant/entity/country) and the classification ceiling are always
  // resolved from the authenticated principal, never from request input.
  "platform:search.read": "Query the governed shared cross-OS search (read-only; surfaces only records already readable through each source's own permission)",
  // Identity
  "identity:user.read": "Read identity records",
  "identity:user.manage": "Create, suspend or revoke identities",
  "identity:role.grant": "Grant or revoke role assignments",
  "identity:emergency.activate": "Activate break-glass emergency access",
  //
  // Administrative user & tenant governance (X10THINK administrative program).
  //
  // ONE shared BEYU OS capability — NOT an Admin OS. These are the FINE-GRAINED,
  // DELEGABLE keys of the administrative surface. They EXTEND the existing
  // umbrella permissions rather than duplicating them: `identity:user.manage`
  // remains the constitutional umbrella over identity mutation and governs
  // profile updates; the fine-grained keys below exist so that governance can
  // separate registering a user from suspending one from removing one, and so
  // that delegated administrative authority can be scoped to exactly one of
  // these acts (a delegation of the umbrella would hand over every act at
  // once). `organization:tenant.*` is genuinely new capability space: the
  // tenant registry previously had NO permission at all, so nothing could
  // govern tenant registration or lifecycle through a runtime path.
  //
  // Every key is enforced by the same canonical `can()` primitive, the same
  // `guarded()` API boundary, the same audit ledger and the same RLS model as
  // the rest of the catalogue. None of them bypasses anything.
  "identity:user.register": "Register (create) a user identity through the governed administrative flow",
  "identity:user.suspend": "Suspend, deactivate or reactivate an existing user identity",
  "identity:user.remove": "Remove a user identity (irreversible governed act; anonymizes PII and retains attribution)",
  "identity:membership.manage": "Assign or remove a user's membership of a tenant",
  "identity:delegation.manage": "Delegate bounded administrative authority to another administrator, and revoke it",
  "organization:tenant.register": "Register a tenant in the canonical organization model",
  "organization:tenant.manage": "Transition tenant lifecycle status (activate, suspend, deactivate, reactivate, archive)",
  "organization:tenant.remove": "Remove a tenant from active operation (dependency-checked; retains legal, financial and audit history)",
  //
  // Governed tenant domains (hostname → tenant mapping). The registry is the ONE
  // source of truth for which hostname belongs to which tenant; these keys
  // govern its lifecycle. A permission here grants the ability to ADMINISTER a
  // mapping — never to reach a tenant: downloading/publishing a hostname is not
  // access, and every request still passes session, federation, RBAC/ABAC,
  // tenant/entity/country scope and RLS. Registering a domain creates no tenant,
  // and reassigning one is a step-up, destructive-scale act (see HIGH_RISK).
  "organization:tenantdomain.read": "Read the governed tenant-domain registry (hostname → tenant mapping) within scope",
  "organization:tenantdomain.register": "Register a hostname for an existing operational tenant (creates no tenant)",
  "organization:tenantdomain.verify": "Record proof of control of a registered hostname (live DNS TXT verification, fail-closed)",
  "organization:tenantdomain.manage": "Transition a tenant domain lifecycle (activate, suspend, retire)",
  "organization:tenantdomain.reassign": "Move a suspended tenant domain to another in-scope tenant (never while ACTIVE)",
  // Organization & ownership
  "organization:entity.read": "Read corporate structure",
  "organization:entity.manage": "Create or amend legal entities",
  "organization:ownership.read": "Read ownership and beneficial ownership",
  "organization:ownership.manage": "Record ownership changes",
  // Governance
  "governance:body.read": "Read governance bodies",
  "governance:resolution.read": "Read resolutions",
  "governance:resolution.propose": "Propose a resolution",
  "governance:resolution.vote": "Cast a governance vote",
  "governance:resolution.approve": "Record a resolution outcome",
  "governance:policy.read": "Read policies",
  "governance:policy.manage": "Author or amend policy",
  // Risk / compliance / legal
  "risk:register.read": "Read the enterprise risk register",
  "risk:register.manage": "Create or update risks and controls",
  "compliance:obligation.read": "Read compliance obligations",
  "compliance:assessment.manage": "Record compliance assessments",
  "legal:matter.read": "Read legal matters",
  "legal:matter.manage": "Manage legal matters",
  // Finance
  "finance:ledger.read": "Read financial records",
  "finance:ledger.post": "Post journal entries",
  "finance:treasury.read": "Read treasury positions",
  "finance:capital.read": "Read capital requests",
  "finance:capital.manage": "Create or amend capital requests",
  "finance:waterfall.read": "Read waterfall configurations and runs",
  "finance:waterfall.simulate": "Simulate a waterfall distribution",
  "finance:waterfall.commit": "Commit a waterfall run (requires resolution)",
  "finance:tax.read": "Read tax strategy intelligence",
  "finance:tax.assess": "Assess tax strategy eligibility",
  // Payments & banking integration. Deliberately split read / ingest / review /
  // authorize / configure: a single "payments" permission would let one grant
  // carry both ingestion and payout authorisation, which is the separation of
  // duties this domain exists to enforce.
  "finance:payments.read": "Read payment transactions, settlements and exceptions",
  "finance:payments.ingest": "Ingest provider events and settlement batches (no ledger effect)",
  "finance:payments.review": "Confirm or reject a proposed payment match; resolve an exception",
  "finance:payments.authorize": "Authorize a payment transaction for accounting and accept residual risk",
  "finance:payments.configure": "Propose payment configuration; the database write itself requires the admin DSN",
  "finance:settlement.manage": "Manage settlement batches and clearing reconciliation",
  // Workforce
  "hcm:employee.read": "Read workforce records",
  "hcm:employee.manage": "Manage workforce records",
  // Family office
  "family:member.read": "Read the family registry",
  "family:member.manage": "Manage family lineage records",
  "family:beneficiary.read": "Read beneficiary entitlements",
  "family:beneficiary.manage": "Manage beneficiary entitlements",
  "family:vault.read": "Read family vault index",
  // Family office — capital & wealth domain.
  //
  // These EXTEND the five permissions above; they do not replace them. The
  // split is read vs manage, and every `manage` is a governed mutation that
  // still requires a human actor, a recorded authority reference and an audit
  // append. None of these permissions can approve, transfer money, execute an
  // investment, change ownership or bypass CAP_POSTING (§24): those remain
  // `governance:resolution.approve`, `finance:payments.authorize`,
  // `finance:ledger.post` and `organization:ownership.manage` respectively, so
  // granting the whole Family Office capital set confers no money-moving
  // authority whatsoever.
  "familyoffice:capital.read": "Read the Family Office capital position, allocation cases and doctrine adoption",
  "familyoffice:capital.manage": "Record Family Office capital allocation cases and ladder positions",
  "familyoffice:investment.read": "Read Family Office investments, theses, valuations and portfolio aggregation",
  "familyoffice:investment.manage": "Record Family Office investments, theses and valuation marks",
  "familyoffice:obligation.read": "Read the obligation register (who owes whom), covenants and covenant tests",
  "familyoffice:obligation.manage": "Record and transition obligations and covenants",
  "familyoffice:realestate.read": "Read Family Office real-estate assets and financing models",
  "familyoffice:realestate.manage": "Record Family Office real-estate assets and financing models",
  "familyoffice:treasury.read": "Read Family Office treasury and liquidity projections",
  "familyoffice:cashflow.read": "Read consolidated Family Office cash flow and balance-sheet snapshots",
  "familyoffice:risk.read": "Read Family Office debt, risk and stress results",
  "familyoffice:liquidity.read": "Read Family Office liquidity positions and alerts",
  "familyoffice:scenario.read": "Read Family Office scenario models, results and capital simulations",
  "familyoffice:scenario.simulate": "Run a Family Office scenario or capital simulation (never executes anything)",
  "familyoffice:capitalrequest.read": "Read Family Office capital allocation cases against Finance OS capital requests",
  "familyoffice:capitalrequest.manage": "Raise and progress Family Office capital allocation cases",
  "familyoffice:committee.read": "Read investment committee decisions, quorum, votes and dissent",
  "familyoffice:committee.decide": "Record an investment committee decision (human only; requires authority reference)",
  "familyoffice:decisionjournal.read": "Read the investment decision journal and post-investment reviews",
  "familyoffice:decisionjournal.manage": "Record decision journal entries and post-investment reviews",
  "familyoffice:intelligence.read": "Read regulatory, market and tax intelligence",
  "familyoffice:intelligence.manage": "Record regulatory, market and tax intelligence items",
  "familyoffice:generational.read": "Read generational wealth plans, succession objectives and interests",
  "familyoffice:generational.manage": "Record generational plans and succession objectives",
  "familyoffice:education.read": "Read the family education curriculum and progress",
  "familyoffice:education.manage": "Publish family education lessons and record progress",
  "familyoffice:capital.postmortem": "Record a post-investment review outcome attribution",
  // Family office — PROTECTION & INSURANCE (life insurance as a governed Family
  // Office capability: §4–§26 of the protection design). Read is one gate
  // because the domain's sensitivity is uniform; the three write permissions
  // are deliberately split: recording a policy, changing an insurance
  // beneficiary designation, and progressing a claim are different acts with
  // different consequences. None of them posts money — Finance OS stays the
  // sole accounting authority and CAP_POSTING is never referenced here.
  "familyoffice:protection.read": "Read Family Office insurance policies, coverage, premiums, assignments, loans, reviews and protection assessments",
  "familyoffice:protection.manage": "Record and transition Family Office insurance policies, premium obligations, reviews and modeled protection assessments (never a posting)",
  "familyoffice:beneficiary.manage": "Record, supersede or revoke insurance beneficiary designations (distinct from trust beneficiary entitlements; consequential legal act — MFA step-up)",
  "familyoffice:claim.read": "Read the insurance claims ledger and proceeds posture (contingent vs received)",
  "familyoffice:claim.manage": "Record insurance claims and their lifecycle transitions (records the insurer's reported decision and the receipt; adjudication and money movement belong elsewhere)",
  // Founder equity / capitalization / ESOP domain (X10THINK Phase 2, §9–§15).
  //
  // Instrument-level capitalization INSIDE BEYU OS — NOT a Capital OS and NOT a
  // second ownership registry: entity-level ownership truth remains
  // `organization:ownership.*` over `ownership_records`. The `manage` verbs are
  // governed mutations that still require a human actor, authority/approval
  // references and audit+event appends. NONE of them moves money, posts a
  // journal entry, pays a repurchase or bypasses CAP_POSTING (§24): repurchase
  // and exercise proceeds remain `finance:payments.authorize` / Finance OS
  // authority, and vesting/leaver/ESOP terms remain REQUIRES_LEGAL_REVIEW until
  // a human lawyer closes them — the software records state, never legal effect.
  "equity:cap-table.read": "Read share classes, equity positions and reconstructable cap-table snapshots",
  "equity:cap-table.manage": "Record share classes, equity issuances/transfers and compute cap-table snapshots (governed; never an ownership-registry mutation)",
  "equity:vesting.read": "Read vesting schedules and the append-only vesting ledger",
  "equity:vesting.manage": "Create, activate and run vesting schedules; apply acceleration (governed; approval + legal-review state required)",
  "equity:leaver.read": "Read good/bad leaver cases and repurchase treatment records",
  "equity:leaver.manage": "Initiate and progress leaver cases (classification requires legal review + governance approval; payment stays Finance OS authority)",
  "equity:esop.read": "Read ESOP plans, grants and the append-only grant ledger",
  "equity:esop.manage": "Record ESOP plans and grants; exercise, cancel or forfeit grants (governed; HCM remains employee truth)",
  "equity:dilution.read": "Read dilution scenarios (analysis only)",
  "equity:dilution.simulate": "Create dilution scenarios — pre/transaction/post analysis that NEVER executes and never alters actuals",
  // Family Trust governance persistence (X10THINK Phase 3, §8/§11/§48).
  // Persists the existing trust rails; beneficiaries, entity appointments,
  // documents and the governance engine remain canonical. `manage` on trust
  // instruments/provisions/decisions/distributions is a consequential legal act
  // on family entitlement — MFA step-up, human only, REQUIRES_LEGAL_REVIEW.
  "familyoffice:trust.read": "Read trust instruments, provisions, trustee decisions and distribution records",
  "familyoffice:trust.manage": "Record trust instruments, jurisdiction-aware provisions (INERT without ratified legal effect), trustee decisions and distribution decision records (never a payment; consequential legal act — MFA step-up)",
  // Governed contracting domain (X10THINK master program, §13–§22, §37–§39).
  //
  // ONE governed contract lifecycle capability inside BEYU OS — deliberately
  // NOT a Contract OS and never a second document store, party registry,
  // accounting system or ownership registry. The three permissions split
  // visibility (read), lifecycle progression (manage) and the consequential
  // authority acts (authority: commercial approval, authority verification,
  // execution, termination, dispute disposition). NONE of them moves money,
  // posts a journal entry, alters the cap table or touches CAP_POSTING (§44,
  // §45): payment obligations are governed Finance OS references. Execution
  // additionally fails closed unless the authority engine records every
  // mandatory check as satisfied by canonical rows — a client-supplied status
  // is never authority (§17).
  "contracts:read": "Read the contract register, lifecycle history, obligations, counterparty posture and signature/anchor evidence",
  "contracts:manage": "Request, draft, review-gate, execute, amend, renew, complete, expire or archive governed contract records",
  "contracts:authority": "Close approval gates, record authority determinations, terminate for cause, dispose disputes and manage legal-hold on the register (MFA step-up; human only)",
  // Governed blockchain capability (§23–§40). Blockchain is an execution and
  // evidence technology UNDER BEYU governance; it never becomes a source of
  // truth for identity, ownership, accounting or authorization. These
  // permissions read and maintain the smart-contract registry, evidence
  // anchors, oracle sources and reconciliation findings — they cannot deploy,
  // upgrade, transfer or execute anything by themselves, and no on-chain state
  // can override a BEYU record (reconciliation records discrepancies, it never
  // silently overwrites).
  "blockchain:read": "Read the smart-contract registry, anchored commitments, oracle sources/readings, indexed events and reconciliation findings",
  "blockchain:manage": "Register smart contracts, record anchor/execution evidence and maintain governed oracle sources (governed references only; never chain key custody, never a posting route)",
  // Documents / audit / AI
  "documents:registry.read": "Read the document & attachment registry",
  "documents:registry.manage": "Register or supersede documents",
  // Agriculture OS — sector operational records. SECTOR_OPERATOR is the
  // registry owner (read + manage). Named enterprise roles receive read only
  // by explicit grant (A-06-1); they never inherit via Object.keys(PERMISSIONS).
  "agriculture:data.read": "Read Agriculture OS operational records (farms, fields, crop cycles, harvests, livestock, land, aqua, inventory, work, observations, traceability)",
  "agriculture:data.manage": "Create or amend Agriculture OS operational records",
  // Ujenzi OS — construction sector operational records. SECTOR_OPERATOR is the
  // registry owner (read + manage); named enterprise roles receive read only by
  // explicit grant, mirroring the Agriculture grant model (A-06-1). Ujenzi
  // never owns identity, HCM, journals, documents, approvals or AI: those stay
  // canonical in BEYU shared capabilities.
  "ujenzi:data.read": "Read Ujenzi OS operational records (projects, sites, phases, milestones, BOQ, cost records, procurement, materials, equipment, site diaries, quality, HSE, variations, claims, payment certificates, handover)",
  "ujenzi:data.manage": "Create or amend Ujenzi OS operational records",
  // Universal Dimensional Graphics, Visualization, Simulation, Digital Twin &
  // Future XR Foundation — ONE shared BEYU capability, NOT an OS and NOT a
  // sector. Sector OSs (Health, Finance, Agriculture, UJENZI — each a full
  // Sector OS) plus Foundation consume it through governed adapters. Holding a
  // viz permission NEVER grants sector data on its own: every scene/twin/
  // export re-checks the sector's OWN read boundary (ujenzi:data.read,
  // agriculture:data.read, the Finance read paths, the Health federation
  // link, Foundation scope) and RLS remains the final database boundary.
  // Visualization never posts money: CAP_POSTING stays LOCKED (§24/§44).
  "viz:registry.read": "Read the Universal Dimension Registry (1D–8D, governed 9D+ extensions, XD) and the renderer capability matrix",
  "viz:scene.read": "View governed visualization scenes and digital twins through authorized sector adapters (read-only; never a sector grant by itself)",
  "viz:scene.manage": "Create, amend or archive visualization scene configurations and digital-twin registrations (configuration only — never sector data mutation)",
  "viz:export": "Export governed visualization data (JSON/CSV of the allowlisted manifest); separate from viewing — an authorized viewer is not automatically an exporter; every export is ledgered and audited",
  "viz:dimension.manage": "Register or amend governed 9D+ dimension extensions in the Universal Dimension Registry (HIGH-RISK: extends the shared capability model; MFA step-up)",
  // Foundation OS — ONE institutional OS; these are domain capabilities inside
  // it, not sub-OS products. Approval permissions are HIGH_RISK (MFA step-up).
  "foundation:registry.read": "Read the Foundation Registry",
  "foundation:registry.manage": "Register foundations and transition lifecycle states",
  "foundation:formation.read": "Read foundation formation cases",
  "foundation:formation.manage": "Run formation cases and record assessments",
  "foundation:structure.read": "Read organization structures and scenarios",
  "foundation:structure.manage": "Author structure proposals",
  "foundation:structure.simulate": "Run structure-change simulations",
  "foundation:governance.read": "Read foundation meetings and conflict declarations",
  "foundation:governance.manage": "Schedule meetings and record conflicts",
  "foundation:tax.read": "Read foundation tax profiles, rules and assessments",
  "foundation:tax.assess": "Record foundation tax assessments",
  "foundation:compliance.read": "Read foundation obligations, deadlines and tasks",
  "foundation:compliance.manage": "Manage obligations, deadlines, tasks, evidence and escalations",
  "foundation:donor.read": "Read donor profiles and donations",
  "foundation:donor.manage": "Manage donors, donations and pledges",
  "foundation:fund.read": "Read funds, restrictions and allocations",
  "foundation:fund.manage": "Manage funds, restrictions and allocations",
  "foundation:grant.read": "Read grantees, grants, milestones and disbursements",
  "foundation:grant.manage": "Manage grants across the grant lifecycle",
  "foundation:grant.approve": "Approve grants and disbursements (material decision)",
  "foundation:program.read": "Read foundation programs, projects and beneficiaries",
  "foundation:program.manage": "Manage programs, projects and beneficiary services",
  "foundation:beneficiary.read": "Read beneficiary records (restricted)",
  "foundation:beneficiary.manage": "Manage beneficiary eligibility, consent and services",
  "foundation:procurement.read": "Read suppliers and procurements",
  "foundation:procurement.manage": "Manage suppliers and the procurement lifecycle",
  "foundation:asset.read": "Read the foundation asset register",
  "foundation:asset.manage": "Manage assets across acquire → dispose",
  "foundation:investment.read": "Read investment policies and positions",
  "foundation:investment.manage": "Manage investment policies and proposals",
  "foundation:investment.approve": "Approve material investments (material decision)",
  "foundation:safeguarding.read": "Read safeguarding cases (highly restricted)",
  "foundation:safeguarding.manage": "Manage safeguarding cases and corrective action",
  "foundation:impact.read": "Read impact metrics and measurements",
  "foundation:impact.manage": "Manage impact metrics and record measurements",
  "foundation:assignment.read": "Read foundation workforce assignments",
  "foundation:assignment.manage": "Assign HCM workers to foundation contexts",
  // Government Integration Fabric — ONE shared gateway inside BEYU OS (not a
  // Government OS). Read/submit are deliberately split so holding registry
  // visibility never implies the authority to transmit data to a government
  // system. Submission is HIGH_RISK (MFA step-up): a fiscal receipt, claim or
  // report sent to a government authority is a material external act.
  "government:integration.read": "Read the government integration registry and submission records",
  "government:submission.manage": "Submit governed operations (fiscal, claims, reports, verifications) to government systems through the canonical gateway",
  "audit:log.read": "Read the immutable audit ledger",
  "audit:event.read": "Read the enterprise event stream",
  "ai:noelia.query": "Query Noelia AI",
  "ai:decision.review": "Review and dispose AI decisions",
  "ai:executive.read": "Request executive intelligence briefings",
  "ai:analytics.read": "Request governed enterprise analytics",
  "ai:workflow.run": "Run governed Noelia agentic workflows",
  "ai:workflow.approve": "Approve a Noelia workflow or prepared action",
  "ai:memory.read": "Read governed enterprise memory",
  "ai:memory.write": "Write governed enterprise memory",
  "ai:knowledge.ingest": "Register a governed knowledge source",
  "ai:schedule.manage": "Manage governed Noelia schedules",
  "ai:model.registry.read": "Read the governed model registry",
  "ai:model.registry.manage": "Register, approve, suspend or retire a governed model",
  "ai:model.router.read": "Read the governed model-router selection decision",
  "ai:provider.registry.read": "Read the governed AI provider registry",
  "ai:provider.registry.manage": "Register, assess, activate or suspend an AI provider",
  "ai:identity.read": "Read canonical AI identities",
  "ai:identity.manage": "Manage canonical AI identity state (suspend/retire)",
  "ai:evaluation.read": "Read governed AI model evaluation records",
  "ai:evaluation.manage": "Record or update governed AI model evaluation evidence",
  "ai:risk.register.read": "Read the BEYU AI risk register",
  "ai:risk.register.manage": "Maintain the BEYU AI risk register",
  "ai:incident.manage": "Manage AI incident containment/resolution records",
  "ai:killswitch.manage": "Activate or deactivate a Noelia kill switch",
  "ai:compliance.read": "Read AI requirements, applicability, controls, evidence and assurance records",
  "ai:compliance.write": "Create/update AI requirements, applicability, controls, evidence and assurance records",
  "ai:compliance.audit": "Run and manage AI internal audits, findings and corrective actions",
  "ai:compliance.certification": "Transition certification/readiness state using documented evidence",
  "ai:compliance.metrics": "Read AI compliance metrics, blocking controls and assurance dashboards",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

/**
 * The CLOSED set of administrative capabilities that may be DELEGATED to
 * another administrator (governed admin program). Everything else — including
 * `identity:delegation.manage` itself — is structurally non-delegable:
 *
 *   - `identity:delegation.manage` is excluded so a delegated administrator can
 *     never create further delegations: no recursive privilege amplification,
 *     ever. Delegation chains have depth exactly one.
 *   - The read-side capabilities (`identity:user.read`, `audit:log.read`, …) are
 *     ordinary grants; a delegatee who needs visibility receives it through the
 *     same governed role-assignment path as everyone else.
 *   - The umbrella permissions are excluded: delegation is scoped to the
 *     fine-grained acts (register / suspend / remove / membership / roles /
 *     tenant register / manage / remove) so a delegation can never hand over
 *     "everything at once".
 */
export const ADMIN_DELEGATABLE_PERMISSIONS: readonly PermissionCode[] = [
  "identity:user.register",
  "identity:user.suspend",
  "identity:user.remove",
  "identity:membership.manage",
  "identity:role.grant",
  "organization:tenant.register",
  "organization:tenant.manage",
  "organization:tenant.remove",
] as const;

/** True when the code is inside the closed delegable set (unknown codes fail closed). */
export function isDelegablePermission(code: string): code is PermissionCode {
  return (ADMIN_DELEGATABLE_PERMISSIONS as readonly string[]).includes(code);
}

/** Canonical Agriculture OS tenant code (seed `T.agri`). Agriculture writes require this tenant. */
export const AGRICULTURE_OS_TENANT_CODE = "BEYU-AGRI";

/** Canonical Ujenzi OS tenant code (seed `T.ujenzi`). Construction writes require this tenant. */
export const UJENZI_OS_TENANT_CODE = "BEYU-UJENZI";

export const HIGH_RISK_PERMISSIONS: PermissionCode[] = [
  "identity:emergency.activate",
  "identity:role.grant",
  "organization:ownership.manage",
  "finance:ledger.post",
  "finance:payments.authorize",
  "finance:settlement.manage",
  "finance:waterfall.commit",
  "family:beneficiary.manage",
  // Changing an insurance beneficiary designation changes who receives a
  // contingent death benefit. It is a consequential legal act on the same
  // footing as a trust beneficiary change, so it carries the same MFA step-up.
  "familyoffice:beneficiary.manage",
  // Recording an investment committee decision is the moment capital authority
  // is created, so it carries the same MFA step-up as a resolution approval.
  "familyoffice:committee.decide",
  // Capitalization mutations change who owns what: issuance, vesting (which
  // moves shares from unvested to vested), leaver treatment (repurchase /
  // forfeiture) and ESOP grants/exercises are consequential ownership acts on
  // the same footing as an ownership-registry change — MFA step-up. They still
  // never post money and never replace `organization:ownership.manage`.
  "equity:cap-table.manage",
  "equity:vesting.manage",
  "equity:leaver.manage",
  "equity:esop.manage",
  // Trust instruments, provisions, trustee decisions and distributions alter
  // family entitlement and trustee authority — consequential legal acts, same
  // footing as a trust beneficiary change (MFA step-up).
  "familyoffice:trust.manage",
  // Executing, terminating or disposing a contract is the moment legal
  // consequence is created; closing the commercial/authority gates is the
  // moment BEYU commits. Both are consequential acts and carry MFA step-up.
  "contracts:authority",
  // Registering a smart contract or mutating the governed oracle source list
  // changes what BEYU will trust as evidence/execution input. Step-up required.
  "blockchain:manage",
  "governance:policy.manage",
  "government:submission.manage",
  // Administrative user & tenant governance. Removing an identity or a tenant
  // is the irreversible end of an governed lifecycle: even though the rows are
  // retained (audit/legal attribution) and PII is anonymized, the act destroys
  // the subject's standing in the control plane. Delegating administrative
  // authority creates new authority in another human, which is the same
  // constitutional weight as granting a role. All three carry MFA step-up.
  "identity:user.remove",
  "organization:tenant.remove",
  "identity:delegation.manage",
  // Re-pointing a live hostname at a different tenant changes which tenant a
  // public address belongs to. It is never allowed while the domain is ACTIVE
  // (the service must suspend it first) and it carries MFA step-up for the same
  // reason tenant removal does: the act moves constitutional weight.
  "organization:tenantdomain.reassign",
  // Registering a 9D+ dimension extension changes the shared capability model
  // every Sector OS consumes. It creates no data access and no posting path,
  // but it is a constitutional-scale configuration act: MFA step-up applies.
  "viz:dimension.manage",
];

/** Canonical role catalogue with constitutional scope. */
export const ROLES: Record<
  string,
  { name: string; description: string; scope: string; privileged: boolean; permissions: PermissionCode[] }
> = {
  PLATFORM_ADMIN: {
    name: "Platform Administrator",
    description: "System administration of the BEYU OS control plane. No financial or governance authority.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "platform:config.manage",
      "platform:registry.read",
      "platform:registry.manage",
      "identity:user.read",
      "identity:user.manage",
      "identity:role.grant",
      // Administrative user & tenant governance (X10THINK). The platform
      // administrator holds the COMPLETE fine-grained set — including the two
      // destructive removals and delegation itself, which no other role holds.
      "identity:user.register",
      "identity:user.suspend",
      "identity:user.remove",
      "identity:membership.manage",
      "identity:delegation.manage",
      "organization:tenant.register",
      "organization:tenant.manage",
      "organization:tenant.remove",
      "organization:tenantdomain.read",
      "organization:tenantdomain.register",
      "organization:tenantdomain.verify",
      "organization:tenantdomain.manage",
      "organization:tenantdomain.reassign",
      "audit:log.read",
      "audit:event.read",
      "documents:registry.read",
      "organization:entity.read",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:schedule.manage",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",

      // Universal Dimensional Graphics (shared capability): the platform administrator
      // maintains the shared dimension registry and scene configuration. Sector data
      // remains behind each sector's OWN boundary; CAP_POSTING stays LOCKED.
      "viz:registry.read",
      "viz:scene.read",
      "viz:scene.manage",
      "viz:export",
      "viz:dimension.manage",
    ],
  },
  GROUP_CEO: {
    name: "Group Chief Executive",
    description: "Enterprise executive authority across all sectors, subject to board reserved matters.",
    scope: "ENTERPRISE",
    privileged: true,
    // Explicit enumeration (Finding A-06-1): previously computed via
    // Object.keys(PERMISSIONS).filter(exclusions), which silently granted the
    // CEO every permission added in the future. The effective set is unchanged;
    // new permissions now require an explicit decision to grant.
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "platform:registry.read",
      "platform:registry.manage",
      "identity:user.read",
      "identity:user.manage",
      "identity:role.grant",
      // Administrative user & tenant governance (X10THINK). The enterprise
      // executive may operate the identity and tenant machinery day to day —
      // register users, suspend them, register tenants, govern membership and
      // assignments — but the two IRREVERSIBLE removals (user, tenant) and the
      // delegation of administrative authority stay with the platform
      // administrator. Destructive acts remain available to the CEO through
      // the governance resolution path, which is where they constitutionally
      // belong.
      "identity:user.register",
      "identity:user.suspend",
      "identity:membership.manage",
      "organization:tenant.register",
      "organization:tenant.manage",
      // Governed tenant domains: the enterprise executive registers, verifies
      // and operates tenant hostnames day to day, exactly as it registers and
      // manages tenants. Re-pointing an existing hostname at a DIFFERENT tenant
      // (reassignment) stays with the platform administrator, mirroring the way
      // the irreversible tenant removal does.
      "organization:tenantdomain.read",
      "organization:tenantdomain.register",
      "organization:tenantdomain.verify",
      "organization:tenantdomain.manage",
      "organization:entity.read",
      "organization:entity.manage",
      "organization:ownership.read",
      "organization:ownership.manage",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "governance:resolution.approve",
      "governance:policy.read",
      "governance:policy.manage",
      "risk:register.read",
      "risk:register.manage",
      "compliance:obligation.read",
      "compliance:assessment.manage",
      "legal:matter.read",
      "legal:matter.manage",
      "finance:ledger.read",
      "finance:treasury.read",
      "finance:capital.read",
      "finance:capital.manage",
      "finance:waterfall.read",
      "finance:waterfall.simulate",
      "finance:waterfall.commit",
      "finance:tax.read",
      "finance:tax.assess",
      "hcm:employee.read",
      "hcm:employee.manage",
      "family:member.read",
      "family:member.manage",
      "family:beneficiary.read",
      "family:beneficiary.manage",
      "family:vault.read",
      "documents:registry.read",
      "documents:registry.manage",
      "foundation:registry.read",
      "foundation:formation.read",
      "foundation:structure.read",
      "foundation:governance.read",
      "foundation:tax.read",
      "foundation:compliance.read",
      "foundation:donor.read",
      "foundation:fund.read",
      "foundation:grant.read",
      "foundation:grant.approve",
      "foundation:program.read",
      "foundation:beneficiary.read",
      "foundation:procurement.read",
      "foundation:asset.read",
      "foundation:investment.read",
      "foundation:investment.approve",
      "foundation:safeguarding.read",
      "foundation:impact.read",
      "foundation:assignment.read",
      "audit:log.read",
      "audit:event.read",
      "ai:noelia.query",
      "ai:decision.review",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:workflow.run",
      "ai:workflow.approve",
      "ai:memory.read",
      "ai:memory.write",
      "ai:knowledge.ingest",
      "ai:schedule.manage",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
      "agriculture:data.read",
      "ujenzi:data.read",
      // Founder equity visibility + leaver initiation (X10THINK Phase 2). The
      // CEO may see capitalization and initiate leaver treatment; classifying
      // and approving a leaver case still requires legal review and a
      // governance resolution, and trust instruments remain Family Office
      // authority (read-only here).
      "equity:cap-table.read",
      "equity:vesting.read",
      "equity:leaver.read",
      "equity:leaver.manage",
      "equity:esop.read",
      "equity:dilution.read",
      "familyoffice:trust.read",
      // Governed contracting oversight (explicit grant, A-06-1): the CEO progresses the
      // lifecycle and reads the evidence ledger. No money movement is granted here —
      // CAP_POSTING, the Finance posting engine, the ownership registry and HCM remain
      // canonical for what they own, exactly as before.
      "contracts:read",
      "contracts:manage",
      "blockchain:read",

      // Universal Dimensional Graphics (shared capability): enterprise-wide governed
      // visualization read + audited export. Sector data access still requires the
      // sector's own read boundary per scene.
      "viz:registry.read",
      "viz:scene.read",
      "viz:export",
    ] as PermissionCode[],
  },
  GROUP_CFO: {
    name: "Group Chief Financial Officer",
    description: "Authoritative for financial consequences, treasury, capital and tax governance.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "governance:policy.read",
      "risk:register.read",
      "compliance:obligation.read",
      "finance:ledger.read",
      "finance:ledger.post",
      "finance:payments.read",
      "finance:payments.ingest",
      "finance:payments.review",
      "finance:payments.authorize",
      "finance:payments.configure",
      "finance:settlement.manage",
      "finance:treasury.read",
      "finance:capital.read",
      "finance:capital.manage",
      "finance:waterfall.read",
      "finance:waterfall.simulate",
      "finance:waterfall.commit",
      "finance:tax.read",
      "finance:tax.assess",
      // Founder equity / cap table / ESOP (X10THINK Phase 2). The CFO operates
      // the capitalization machinery; every manage verb remains a governed
      // mutation (authority/approval references, audit, events) and none of
      // them posts money — CAP_POSTING and payments authority are unchanged.
      "equity:cap-table.read",
      "equity:cap-table.manage",
      "equity:vesting.read",
      "equity:vesting.manage",
      "equity:leaver.read",
      "equity:esop.read",
      "equity:esop.manage",
      "equity:dilution.read",
      "equity:dilution.simulate",
      // Fiscal/statutory government submissions (TRA VFD, contributions) are a
      // CFO accountability; HIGH_RISK so MFA step-up applies.
      "government:integration.read",
      "government:submission.manage",
      "documents:registry.read",
      "audit:log.read",
      "ai:noelia.query",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:memory.write",
      "ai:workflow.run",
      "ai:model.registry.read",
      "agriculture:data.read",
      "ujenzi:data.read",
      // Contracting capability for financing/commercial agreements plus the governed
      // smart-contract registry and evidence anchors. No money movement: CAP_POSTING and
      // the Finance posting engine remain the only Finance write path (fail-closed).
      "contracts:read",
      "contracts:manage",
      "contracts:authority",
      "blockchain:read",
      "blockchain:manage",

      // Universal Dimensional Graphics (shared capability): governed visualization read
      // + audited export. Financial visualization is READ-GOVERNED: it never posts,
      // never alters balances and never bypasses Finance authorization (CAP_POSTING
      // stays LOCKED).
      "viz:registry.read",
      "viz:scene.read",
      "viz:export",
    ],
  },
  CHIEF_GOVERNANCE_OFFICER: {
    name: "Chief Governance Officer",
    description: "Custodian of the Constitution, policy hierarchy and governance execution.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "platform:registry.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "governance:resolution.approve",
      "governance:policy.read",
      "governance:policy.manage",
      "risk:register.read",
      "compliance:obligation.read",
      "compliance:assessment.manage",
      "legal:matter.read",
      // Capitalization & trust governance custody (X10THINK Phase 2/3). The CGO
      // is custodian of the governed mutation machinery (authority, approvals,
      // reservations), so holds the equity/trust manage verbs; each is still a
      // governed mutation requiring authority + legal-review state, never a
      // money movement or an ownership-registry override.
      "equity:cap-table.read",
      "equity:cap-table.manage",
      "equity:vesting.read",
      "equity:vesting.manage",
      "equity:leaver.read",
      "equity:leaver.manage",
      "equity:esop.read",
      "equity:esop.manage",
      "equity:dilution.read",
      "equity:dilution.simulate",
      "familyoffice:trust.read",
      "familyoffice:trust.manage",
      "foundation:registry.read",
      "foundation:structure.read",
      "foundation:governance.read",
      "foundation:governance.manage",
      "foundation:compliance.read",
      "foundation:safeguarding.read",
      "documents:registry.read",
      "documents:registry.manage",
      "audit:log.read",
      "audit:event.read",
      "ai:noelia.query",
      "ai:decision.review",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:workflow.approve",
      "ai:memory.read",
      "ai:memory.write",
      "ai:knowledge.ingest",
      "ai:schedule.manage",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
      // Governance owner of the authority gate: verification, approval closure, dispute
      // disposition and legal hold. Registering chain evidence is a governance act, not a
      // money act: no permission here reaches the Finance posting engine or CAP_POSTING.
      "contracts:read",
      "contracts:manage",
      "contracts:authority",
      "blockchain:read",
      "blockchain:manage",

      // Universal Dimensional Graphics (shared capability): governed visualization read.
      "viz:registry.read",
      "viz:scene.read",
    ],
  },
  CHIEF_RISK_COMPLIANCE: {
    name: "Chief Risk & Compliance Officer",
    description: "Enterprise risk register, controls, compliance assessment and regulatory obligations.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "organization:entity.read",
      "governance:resolution.read",
      "governance:resolution.vote",
      "governance:policy.read",
      "risk:register.read",
      "risk:register.manage",
      "compliance:obligation.read",
      "compliance:assessment.manage",
      "legal:matter.read",
      "documents:registry.read",
      "audit:log.read",
      "ai:noelia.query",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:knowledge.ingest",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "ai:risk.register.manage",
      "ai:compliance.read",
      "ai:compliance.write",
      "ai:compliance.audit",
      "ai:compliance.certification",
      "ai:compliance.metrics",
      "agriculture:data.read",
      "ujenzi:data.read",
      // Risk & compliance review of the contracting register and of governed oracle and
      // evidence inputs (read side). Compliance findings can block execution through the
      // authority engine; they can never authorise a payment or an ownership change.
      "contracts:read",
      "contracts:manage",
      "blockchain:read",

      // Universal Dimensional Graphics (shared capability): risk/compliance overlays (8D)
      // + audited export for evidence. A viz export is not compliance evidence by
      // itself; the underlying governed records remain canonical.
      "viz:registry.read",
      "viz:scene.read",
      "viz:export",
    ],
  },
  FAMILY_OFFICE_PRINCIPAL: {
    name: "Family Office Principal",
    description: "Family governance, lineage verification, beneficiary oversight and vault custody.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "family:member.read",
      "family:member.manage",
      "family:beneficiary.read",
      "family:beneficiary.manage",
      "family:vault.read",
      // Capital & wealth domain (§38). The Principal sees and records the whole
      // domain, and decides nothing: every `.manage` here is a governed record,
      // and committee decisions require `familyoffice:committee.decide` plus an
      // authority reference, which this role deliberately does NOT hold.
      "familyoffice:capital.read",
      "familyoffice:capital.manage",
      "familyoffice:investment.read",
      "familyoffice:investment.manage",
      "familyoffice:obligation.read",
      "familyoffice:obligation.manage",
      "familyoffice:realestate.read",
      "familyoffice:realestate.manage",
      "familyoffice:treasury.read",
      "familyoffice:cashflow.read",
      "familyoffice:risk.read",
      "familyoffice:liquidity.read",
      "familyoffice:scenario.read",
      "familyoffice:scenario.simulate",
      "familyoffice:capitalrequest.read",
      "familyoffice:capitalrequest.manage",
      "familyoffice:committee.read",
      "familyoffice:decisionjournal.read",
      "familyoffice:decisionjournal.manage",
      "familyoffice:intelligence.read",
      "familyoffice:intelligence.manage",
      "familyoffice:generational.read",
      "familyoffice:generational.manage",
      "familyoffice:education.read",
      "familyoffice:education.manage",
      // Protection & insurance: the Principal records and governs the whole
      // domain — designations included — and nothing here bypasses the MFA
      // step-up on `familyoffice:beneficiary.manage` or the finance boundary.
      "familyoffice:protection.read",
      "familyoffice:protection.manage",
      "familyoffice:beneficiary.manage",
      "familyoffice:claim.read",
      "familyoffice:claim.manage",
      // Family Trust governance (X10THINK Phase 3). The Principal records trust
      // instruments, jurisdiction-aware provisions (INERT without a ratified
      // legal-effect reference), trustee decisions and distribution decision
      // records. `trust.manage` is HIGH_RISK (MFA step-up); a distribution is a
      // decision record only — payment/accounting stays Finance OS authority,
      // and legal enforceability stays REQUIRES_LEGAL_REVIEW.
      "familyoffice:trust.read",
      "familyoffice:trust.manage",
      // Cap-table visibility for succession/liquidity planning (read-only).
      "equity:cap-table.read",
      "equity:vesting.read",
      "documents:registry.read",
      "ai:noelia.query",
      "ai:executive.read",
      "ai:memory.read",
    ],
  },
  /**
   * Family Office Director — runs the office day to day.
   *
   * Read across the capital & wealth domain plus the recording permissions, but
   * NOT `familyoffice:committee.decide` and NOT `familyoffice:capital.postmortem` outcome
   * attribution: running the office is not deciding for it (§40 segregation of
   * duties — requester ≠ approver).
   */
  FAMILY_OFFICE_DIRECTOR: {
    name: "Family Office Director",
    description: "Operates the Family Office capital, wealth and treasury domain. Records and reports; does not approve.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      "organization:entity.read",
      "family:member.read",
      "familyoffice:capital.read",
      "familyoffice:capital.manage",
      "familyoffice:investment.read",
      "familyoffice:investment.manage",
      "familyoffice:obligation.read",
      "familyoffice:obligation.manage",
      "familyoffice:realestate.read",
      "familyoffice:realestate.manage",
      "familyoffice:treasury.read",
      "familyoffice:cashflow.read",
      "familyoffice:risk.read",
      "familyoffice:liquidity.read",
      "familyoffice:scenario.read",
      "familyoffice:scenario.simulate",
      "familyoffice:capitalrequest.read",
      "familyoffice:capitalrequest.manage",
      "familyoffice:committee.read",
      "familyoffice:decisionjournal.read",
      "familyoffice:decisionjournal.manage",
      "familyoffice:intelligence.read",
      "familyoffice:intelligence.manage",
      "familyoffice:generational.read",
      "familyoffice:education.read",
      "familyoffice:education.manage",
      // Protection & insurance: records and reports; the domain carries no
      // approval permission at all (claim transitions record FACTS; the
      // insurer decides, and designation changes stay under MFA step-up).
      "familyoffice:protection.read",
      "familyoffice:protection.manage",
      "familyoffice:beneficiary.manage",
      "familyoffice:claim.read",
      "familyoffice:claim.manage",
      "documents:registry.read",
      "ai:noelia.query",
    ],
  },
  /** Investment Officer — builds the case; never approves it. */
  INVESTMENT_OFFICER: {
    name: "Investment Officer",
    description: "Builds investment cases, theses and models for committee review. Has no approval authority.",
    scope: "ENTITY",
    privileged: false,
    permissions: [
      "organization:entity.read",
      "familyoffice:capital.read",
      "familyoffice:investment.read",
      "familyoffice:investment.manage",
      "familyoffice:obligation.read",
      "familyoffice:realestate.read",
      "familyoffice:realestate.manage",
      "familyoffice:cashflow.read",
      "familyoffice:risk.read",
      "familyoffice:scenario.read",
      "familyoffice:scenario.simulate",
      "familyoffice:capitalrequest.read",
      "familyoffice:capitalrequest.manage",
      "familyoffice:decisionjournal.read",
      "familyoffice:decisionjournal.manage",
      "familyoffice:intelligence.read",
      "familyoffice:protection.read",
      "documents:registry.read",
      "ai:noelia.query",
    ],
  },
  /** Treasury Officer — liquidity, cash and debt service. */
  TREASURY_OFFICER: {
    name: "Treasury Officer",
    description: "Family Office treasury, liquidity and debt-service monitoring. Read and project; never transfer.",
    scope: "ENTITY",
    privileged: false,
    permissions: [
      "organization:entity.read",
      "finance:treasury.read",
      "familyoffice:capital.read",
      "familyoffice:treasury.read",
      "familyoffice:cashflow.read",
      "familyoffice:liquidity.read",
      "familyoffice:obligation.read",
      "familyoffice:obligation.manage",
      "familyoffice:risk.read",
      "familyoffice:scenario.read",
      "familyoffice:scenario.simulate",
      "familyoffice:intelligence.read",
      "familyoffice:protection.read",
      "familyoffice:claim.read",
      "ai:noelia.query",
    ],
  },
  /** Risk Officer — stress, concentration and the financial red line. */
  RISK_OFFICER: {
    name: "Family Office Risk Officer",
    description: "Family Office risk, stress testing and financial red-line reporting. Advisory; no approval authority.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "organization:entity.read",
      "risk:register.read",
      "familyoffice:capital.read",
      "familyoffice:investment.read",
      "familyoffice:obligation.read",
      "familyoffice:realestate.read",
      "familyoffice:treasury.read",
      "familyoffice:cashflow.read",
      "familyoffice:risk.read",
      "familyoffice:liquidity.read",
      "familyoffice:scenario.read",
      "familyoffice:scenario.simulate",
      "familyoffice:intelligence.read",
      "familyoffice:intelligence.manage",
      "familyoffice:protection.read",
      "familyoffice:claim.read",
      "ai:noelia.query",
    ],
  },
  /**
   * Legal Reviewer — clears the LEGAL_REVIEW gate and nothing else.
   *
   * Deliberately narrow: a reviewer who could also approve would be able to
   * clear their own review, which is the collapse of duties §40 forbids.
   */
  LEGAL_REVIEWER: {
    name: "Legal Reviewer",
    description: "Records legal review against Family Office matters. Review authority only; no approval authority.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "legal:matter.read",
      "legal:matter.manage",
      "familyoffice:capitalrequest.read",
      "familyoffice:investment.read",
      "familyoffice:obligation.read",
      "familyoffice:realestate.read",
      "familyoffice:intelligence.read",
      "familyoffice:protection.read",
      "familyoffice:claim.read",
      // Leaver conditions, vesting terms and ESOP provisions require legal
      // review before they may leave REQUIRES_LEGAL_REVIEW (X10THINK §48).
      // Review visibility only — no approval, no manage verb.
      "equity:leaver.read",
      "equity:vesting.read",
      "equity:esop.read",
      "documents:registry.read",
      // Legal review of the contracting register: counsel reads records and progresses
      // the review gates that carry REQUIRES_LEGAL_REVIEW. Enforceability remains a human
      // legal act; the software records closure, it never assumes it.
      "contracts:read",
      "contracts:manage",
    ],
  },
  /**
   * Tax Reviewer — clears the TAX_REVIEW gate and nothing else.
   *
   * May record at PROFESSIONAL_REVIEW level; may NEVER record
   * FINAL_ACCOUNTING_TREATMENT, which is Finance OS's (§22, §32).
   */
  TAX_REVIEWER: {
    name: "Tax Reviewer",
    description: "Records tax review and tax positions at ASSUMPTION, ESTIMATE, CURRENT_RULE or PROFESSIONAL_REVIEW level. Never asserts final accounting treatment.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "finance:tax.read",
      "familyoffice:capitalrequest.read",
      "familyoffice:investment.read",
      "familyoffice:obligation.read",
      "familyoffice:realestate.read",
      "familyoffice:intelligence.read",
      "familyoffice:intelligence.manage",
      "familyoffice:protection.read",
      "documents:registry.read",
    ],
  },
  /**
   * Investment Committee Member — the approval seat.
   *
   * Holds `familyoffice:committee.decide`, which requires an authority reference
   * (a resolution or approval instrument) on every decision. Deliberately does
   * NOT hold `familyoffice:capitalrequest.manage`: the committee must not be able to
   * raise the matter it then approves (§40).
   */
  INVESTMENT_COMMITTEE_MEMBER: {
    name: "Investment Committee Member",
    description: "Reviews and decides Family Office capital allocations under a recorded authority instrument. Cannot raise the matter it decides.",
    scope: "ENTERPRISE",
    privileged: true,
    permissions: [
      "organization:entity.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.vote",
      "familyoffice:capital.read",
      "familyoffice:investment.read",
      "familyoffice:obligation.read",
      "familyoffice:realestate.read",
      "familyoffice:cashflow.read",
      "familyoffice:risk.read",
      "familyoffice:liquidity.read",
      "familyoffice:scenario.read",
      "familyoffice:capitalrequest.read",
      "familyoffice:committee.read",
      "familyoffice:committee.decide",
      "familyoffice:decisionjournal.read",
      "familyoffice:capital.postmortem",
      "familyoffice:generational.read",
      "familyoffice:protection.read",
      "documents:registry.read",
      "ai:noelia.query",
    ],
  },
  /** Family Analyst — read and model, no recording authority beyond scenarios. */
  FAMILY_ANALYST: {
    name: "Family Office Analyst",
    description: "Analyses and models the Family Office capital position. Read plus simulation; records nothing authoritative.",
    scope: "ENTITY",
    privileged: false,
    permissions: [
      "organization:entity.read",
      "familyoffice:capital.read",
      "familyoffice:investment.read",
      "familyoffice:obligation.read",
      "familyoffice:realestate.read",
      "familyoffice:treasury.read",
      "familyoffice:cashflow.read",
      "familyoffice:risk.read",
      "familyoffice:liquidity.read",
      "familyoffice:scenario.read",
      "familyoffice:scenario.simulate",
      "familyoffice:capitalrequest.read",
      "familyoffice:committee.read",
      "familyoffice:decisionjournal.read",
      "familyoffice:intelligence.read",
      "familyoffice:generational.read",
      "familyoffice:education.read",
      "familyoffice:protection.read",
      "familyoffice:claim.read",
      "ai:noelia.query",
    ],
  },
  /**
   * Family Member (read only) — the least-privilege seat.
   *
   * Sees the education curriculum and their own generational position, and
   * nothing else. No capital, investment, obligation, debt or liquidity data:
   * a read-only family seat is not a read-only analyst seat.
   */
  FAMILY_MEMBER_VIEW: {
    name: "Family Member (read only)",
    description: "Read-only access to family education and their own generational position. No capital, investment or debt data.",
    scope: "ENTITY",
    privileged: false,
    permissions: ["family:member.read", "familyoffice:education.read", "familyoffice:generational.read"],
  },
  HCM_DIRECTOR: {
    name: "Group HCM Director",
    description: "Single source of truth for the workforce lifecycle.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "organization:entity.read",
      "hcm:employee.read",
      "hcm:employee.manage",
      "governance:policy.read",
      "documents:registry.read",
      "ai:noelia.query",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      // Workforce contracting: offer letters, employment agreements, contractor and
      // amendment records. HCM stays the employee master — a contract record updates HCM
      // only through governed HCM workflows, never directly.
      "contracts:read",
      "contracts:manage",

      // Universal Dimensional Graphics (shared capability): governed visualization read.
      "viz:registry.read",
      "viz:scene.read",
    ],
  },
  SECTOR_OPERATOR: {
    name: "Sector OS Operator",
    description: "Operational execution inside a single Sector OS under BEYU OS governance.",
    scope: "SECTOR",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "organization:entity.read",
      "hcm:employee.read",
      "finance:capital.read",
      "risk:register.read",
      "compliance:obligation.read",
      "documents:registry.read",
      // Sector operational government submissions (NHIF folios, DHIS2 reports)
      // through the canonical gateway; HIGH_RISK so MFA step-up applies.
      "government:integration.read",
      "government:submission.manage",
      "agriculture:data.read",
      "ujenzi:data.read",
      "agriculture:data.manage",
      "ujenzi:data.manage",
      "foundation:program.read",
      "foundation:compliance.read",
      "foundation:impact.read",
      "ai:noelia.query",
      "ai:executive.read",
      "ai:analytics.read",
      // Sector operators read contract records inside their own tenant scope: visibility
      // only. Lifecycle progression, execution and counterparty screening stay with the
      // group functions that own them; RLS still bounds every read.
      "contracts:read",

      // Universal Dimensional Graphics (shared capability): sector operators build and
      // read scenes for their own Sector OS and export through the audited path.
      // Scene configuration is NOT sector data mutation: every dataset still flows
      // through the sector's own authorization and RLS.
      "viz:registry.read",
      "viz:scene.read",
      "viz:scene.manage",
      "viz:export",
    ],
  },
  FOUNDATION_DIRECTOR: {
    name: "Foundation Director",
    description: "Accountable executive for a foundation tenant: lifecycle, governance, material grants and investments.",
    scope: "SECTOR",
    privileged: true,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "organization:entity.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:resolution.propose",
      "governance:resolution.vote",
      "risk:register.read",
      "risk:register.manage",
      "compliance:obligation.read",
      "legal:matter.read",
      "hcm:employee.read",
      "documents:registry.read",
      "documents:registry.manage",
      "foundation:registry.read",
      "foundation:registry.manage",
      "foundation:formation.read",
      "foundation:formation.manage",
      "foundation:structure.read",
      "foundation:structure.manage",
      "foundation:structure.simulate",
      "foundation:governance.read",
      "foundation:governance.manage",
      "foundation:tax.read",
      "foundation:tax.assess",
      "foundation:compliance.read",
      "foundation:compliance.manage",
      "foundation:donor.read",
      "foundation:donor.manage",
      "foundation:fund.read",
      "foundation:fund.manage",
      "foundation:grant.read",
      "foundation:grant.manage",
      "foundation:grant.approve",
      "foundation:program.read",
      "foundation:program.manage",
      "foundation:beneficiary.read",
      "foundation:beneficiary.manage",
      "foundation:procurement.read",
      "foundation:procurement.manage",
      "foundation:asset.read",
      "foundation:asset.manage",
      "foundation:investment.read",
      "foundation:investment.manage",
      "foundation:investment.approve",
      "foundation:safeguarding.read",
      "foundation:safeguarding.manage",
      "foundation:impact.read",
      "foundation:impact.manage",
      "foundation:assignment.read",
      "foundation:assignment.manage",
      "audit:log.read",
      "audit:event.read",
      "ai:noelia.query",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      // Foundation contracting: donor, grant, government, NGO-implementation and
      //   development-partner agreements, with tranche and reporting obligations. BEYU
      //   records authorized commitments; it never assumes government or donor authority.
      "contracts:read",
      "contracts:manage",

      // Universal Dimensional Graphics (shared capability): governed visualization read
      // within Foundation scope.
      "viz:registry.read",
      "viz:scene.read",
    ],
  },
  FOUNDATION_OFFICER: {
    name: "Foundation Officer",
    description: "Day-to-day foundation operations. Cannot approve material grants or investments.",
    scope: "SECTOR",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "organization:entity.read",
      "governance:resolution.read",
      "risk:register.read",
      "compliance:obligation.read",
      "hcm:employee.read",
      "documents:registry.read",
      "documents:registry.manage",
      "foundation:registry.read",
      "foundation:formation.read",
      "foundation:formation.manage",
      "foundation:structure.read",
      "foundation:structure.simulate",
      "foundation:governance.read",
      "foundation:governance.manage",
      "foundation:tax.read",
      "foundation:compliance.read",
      "foundation:compliance.manage",
      "foundation:donor.read",
      "foundation:donor.manage",
      "foundation:fund.read",
      "foundation:grant.read",
      "foundation:grant.manage",
      "foundation:program.read",
      "foundation:program.manage",
      "foundation:beneficiary.read",
      "foundation:beneficiary.manage",
      "foundation:procurement.read",
      "foundation:procurement.manage",
      "foundation:asset.read",
      "foundation:asset.manage",
      "foundation:investment.read",
      "foundation:safeguarding.read",
      "foundation:impact.read",
      "foundation:impact.manage",
      "foundation:assignment.read",
      "ai:noelia.query",
      "ai:executive.read",
      "ai:analytics.read",
      // Foundation officer operates the day-to-day contracting register for their own
      //   foundation tenant: drafting, obligation tracking and evidence capture. Approval and
      //   execution gates still require the accountable authority above this role.
      "contracts:read",
      "contracts:manage",

      // Universal Dimensional Graphics (shared capability): governed visualization read
      // within Foundation scope.
      "viz:registry.read",
      "viz:scene.read",
    ],
  },
  AUDITOR: {
    name: "Internal Auditor",
    description: "Read-only assurance access across the control plane. Cannot mutate any record.",
    scope: "ENTERPRISE",
    privileged: false,
    permissions: [
      "platform:dashboard.read",
      // Shared Search: read-only; each source remains behind its own permission.
      "platform:search.read",
      "platform:registry.read",
      "organization:entity.read",
      "organization:ownership.read",
      "governance:body.read",
      "governance:resolution.read",
      "governance:policy.read",
      "risk:register.read",
      "compliance:obligation.read",
      "legal:matter.read",
      "finance:ledger.read",
      "finance:treasury.read",
      "finance:capital.read",
      "finance:waterfall.read",
      "finance:tax.read",
      "finance:payments.read",
      "government:integration.read",
      "hcm:employee.read",
      "documents:registry.read",
      "audit:log.read",
      "audit:event.read",
      "ai:executive.read",
      "ai:analytics.read",
      "ai:memory.read",
      "ai:workflow.approve",
      "ai:model.registry.read",
      "ai:model.router.read",
      "ai:provider.registry.read",
      "ai:identity.read",
      "ai:evaluation.read",
      "ai:risk.register.read",
      "agriculture:data.read",
      "ujenzi:data.read",
      // Read-only capitalization oversight (X10THINK Phase 2). AUDITOR clearance
      // is RESTRICTED, matching the equity tables' default classification; no
      // manage verb and no trust access (HIGHLY_RESTRICTED) is granted.
      "equity:cap-table.read",
      "equity:vesting.read",
      "equity:leaver.read",
      "equity:esop.read",
      "equity:dilution.read",
      // Read-only contracting and blockchain-evidence visibility for independent audit
      //   of the register, its determinations and its anchors. No manage or authority verbs.
      "contracts:read",
      "blockchain:read",

      // Universal Dimensional Graphics (shared capability): independent read + audited
      // export of governed visualizations. No manage verb and no registry mutation.
      "viz:registry.read",
      "viz:scene.read",
      "viz:export",
    ],
  },
  /**
   * Tenant membership marker (administrative governance program).
   *
   * In the canonical model a user "belongs" to a tenant through their
   * `primary_tenant_id` plus their tenant-scoped role assignments. There is —
   * deliberately — no separate membership table. TENANT_MEMBER is the
   * ZERO-CAPABILITY membership representation: an active TENANT_MEMBER
   * assignment in a tenant is the governed statement "this user is a member of
   * this tenant", granting no data visibility whatsoever (an empty permission
   * set fails `checkBeyuOSAuthorization`, so a pure member cannot even enter
   * the /os control plane). Any actual capability is a separately governed
   * role assignment.
   */
  TENANT_MEMBER: {
    name: "Tenant Member",
    description: "Membership of one tenant with no capability. Presence, not authority.",
    scope: "TENANT",
    privileged: false,
    permissions: [],
  },
};

/** Classification ceiling per role — ABAC dimension enforced at read time. */
export const ROLE_CLEARANCE: Record<string, Classification> = {
  PLATFORM_ADMIN: "RESTRICTED",
  GROUP_CEO: "HIGHLY_RESTRICTED",
  GROUP_CFO: "RESTRICTED",
  CHIEF_GOVERNANCE_OFFICER: "HIGHLY_RESTRICTED",
  CHIEF_RISK_COMPLIANCE: "RESTRICTED",
  FAMILY_OFFICE_PRINCIPAL: "HIGHLY_RESTRICTED",
  // Family Office capital & wealth seats. Clearance is granted on need, not on
  // seniority: the committee member and the director see the capital domain at
  // HIGHLY_RESTRICTED because the decision journal and generational plans live
  // there, while the reviewer seats are capped at RESTRICTED because a reviewer
  // needs the matter, not the family's private reasoning.
  FAMILY_OFFICE_DIRECTOR: "HIGHLY_RESTRICTED",
  INVESTMENT_OFFICER: "RESTRICTED",
  TREASURY_OFFICER: "RESTRICTED",
  RISK_OFFICER: "RESTRICTED",
  LEGAL_REVIEWER: "RESTRICTED",
  TAX_REVIEWER: "RESTRICTED",
  INVESTMENT_COMMITTEE_MEMBER: "HIGHLY_RESTRICTED",
  FAMILY_ANALYST: "RESTRICTED",
  FAMILY_MEMBER_VIEW: "HIGHLY_RESTRICTED",
  HCM_DIRECTOR: "RESTRICTED",
  SECTOR_OPERATOR: "CONFIDENTIAL",
  // Foundation safeguarding records are HIGHLY_RESTRICTED. These roles carry
  // explicit safeguarding grants above, so their clearance must be explicit
  // rather than silently falling back to INTERNAL.
  FOUNDATION_DIRECTOR: "HIGHLY_RESTRICTED",
  FOUNDATION_OFFICER: "HIGHLY_RESTRICTED",
  AUDITOR: "RESTRICTED",
  // Membership marker: presence in a tenant, never data visibility. INTERNAL is
  // the minimum catalogue clearance; the role holds zero permissions so the
  // clearance is inert by construction.
  TENANT_MEMBER: "INTERNAL",
};
