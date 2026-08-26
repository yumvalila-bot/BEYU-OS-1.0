# Phase 3A — Family Institution Technical Architecture Specification

**Status:** PHASE 3A — TECHNICAL ARCHITECTURE SPECIFICATION ONLY — AUTHORIZED.

**Hard limits of this phase (binding):**

- No production behavior is implemented by this document.
- No migration `0018` is created; no database schema is modified.
- No production API routes are created; no production permissions are added.
- No production UI is built.
- Finance OS, Noelia/HIVE, and the Phase 1–2 Family Institution engines are not modified.
- No unratified legal, governance, fiduciary, beneficiary, jurisdictional, tax, privacy, capital, loan, or constitutional policy is chosen or inferred.

**Governing rule (unchanged, authoritative):**

```text
EXPLICIT RATIFICATION  →  MAY EVENTUALLY IMPLEMENT
NO RATIFICATION        →  FAIL CLOSED → DO NOT IMPLEMENT
```

Architecture may proceed ahead of ratification **only** where the technical mechanism can safely remain policy-configurable. This document designs exactly that: a complete technical system in which every policy value is a named, owned, audited configuration point — and every unratified value fails closed.

**Baseline verified before authoring:** `main` / branch baseline = `da1ef20df72dd593773d8d698b90ec76f4137558` (PR #7 merge: Phase 1–2 governed engines). Authoring performed on session branch `arena/01a03aec-beyu-os-1-0` at `56ac039` (Phase 2.5 documents + Phase 3 ratification gates, all in open PR #8). No migration named `0018` exists. Working tree was clean except for this document's addition.

**Authoritative inputs used and inspected:**

| Document | Role in this specification |
|---|---|
| `docs/architecture/phase-2.5-family-institution-domain-contract.md` | Domain contract, entity model, authority matrix, gap list |
| `docs/architecture/phase-2.5-family-institution-policy-ratification-register.md` | FIR-001…FIR-027 decision records, database gate register, blocker matrix, entry criteria |
| `docs/architecture/phase-2.5-family-institution-ratification-decision-matrix.md` | 27-decision status matrix (RESOLVED 3 / PARTIAL 5 / UNRESOLVED 6 / REQUIRES LEGAL-POLICY RATIFICATION 13 / BLOCKING 24) |
| `docs/architecture/phase-3-ratified-implementation-allowlist.md` | Intentionally empty allowlist; FIR-017/018/019 are boundaries, not grants |
| `docs/architecture/phase-3-unratified-denylist.md` | Denied implementation scope per FIR |
| `docs/architecture/phase-3-readiness-gate.md` | `PHASE 3 NOT READY — POLICY RATIFICATION REQUIRED` |

**Repository technical truth (source of truth for all citations below):** `src/db/schema/{core,identity,people,governance,platform,finance,enums}.ts`, `src/lib/family/*.ts` (Phase 1–2 engines), `tests/family/*.ts`, `src/lib/constants.ts`, `src/lib/{authz,guard,api,audit}.ts`, `src/lib/governance/delegation.ts`, `src/lib/noelia*`, `src/lib/architecture/completeness.ts`, `src/app/os/family/page.tsx`, `package.json`.

---

## Table of contents

**Part 0 — Framing**

- 0. How to read this specification (marker legend, method, stop conditions)

**Part I — Executive architecture**

- 1. Executive architecture

**Part II — Placement, boundaries, canonical model**

- 2. BEYU OS → Family Office → Family Institution placement
- 3. Domain boundaries
- 4. Capability map
- 5. Context/module boundaries
- 6. Canonical entity model
- 7. Conceptual relationship model

**Part III — Identity, tenancy, legal structure**

- 8. Identity architecture
- 9. Tenant architecture
- 10. Legal-entity architecture
- 11. Country/jurisdiction architecture

**Part IV — Family Institution core architectures**

- 12. Family membership architecture
- 13. Genealogical descent architecture
- 14. Evidence architecture
- 15. Family Constitution architecture
- 16. Governance-body architecture
- 17. Eligibility architecture
- 18. Beneficiary architecture
- 19. Delegation architecture
- 20. Family Capital architecture
- 21. Family Loan architecture
- 22. Document/vault architecture
- 23. Decision architecture
- 24. Policy-decision architecture

**Part V — Cross-cutting technical architecture**

- 25. Lifecycle/state-machine architecture
- 26. Authorization architecture
- 27. Permission architecture (DRAFT)
- 28. Audit architecture
- 29. Event architecture
- 30. Finance OS integration architecture
- 31. Noelia/HIVE integration architecture

**Part VI — Interface architecture**

- 32. API contract architecture (DRAFT)
- 33. UI architecture (DRAFT)

**Part VII — Non-functional architecture**

- 34. Data classification architecture
- 35. Privacy/security architecture
- 36. Failure/fail-closed architecture
- 37. Error model
- 38. Observability architecture
- 39. Testing architecture

**Part VIII — Delivery architecture**

- 40. Migration strategy
- 41. Deployment strategy
- 42. Dependency graph
- 43. Phase 3 implementation sequence
- 44. Phase 3 entry gates
- 45. Policy-ratification dependency map
- 46. Architecture decision records required before implementation

**Part IX — 27-decision architecture dependency matrix**

- 47. FIR-001…FIR-027 architecture dependency matrix (seven-field mapping per decision)

**Part X — Consolidated models, remaining decisions, roadmap, final report**

- 48. Conceptual domain model (consolidated)
- 49. Conceptual data model (entity catalog with canonical ownership)
- 50. Exact remaining policy decisions required before implementation
- 51. Phase 3A → 3B → 3C → 3D roadmap
- 52. Final status report and non-action confirmation

**Appendices**

- Appendix A — Marker and status vocabulary
- Appendix B — Repository evidence index (verified technical facts)
- Appendix C — Policy configuration-point register (CFG-xx)
- Appendix D — Architecture decision records made by this specification (KDD-xx)
- Appendix E — Cross-reference: FIR → architecture components

---

# Part 0 — Framing

## 0. How to read this specification

### 0.1 The two-plane discipline

Every architectural component in this document is separated into two planes:

- **Plane A — TECHNICAL STRUCTURE.** What exists, what will exist as mechanism, how data flows, which invariants hold, which tables/fields/endpoints/permissions are proposed. This plane is **authorized by Phase 3A** as design.
- **Plane B — POLICY VALUE.** The concrete values, authorities, thresholds, rules, and legal effects the mechanism will carry. This plane is **not decided** by this document unless an authoritative ratification already exists in the repository.

The separation is the entire point of Phase 3A: later ratification selects Plane B values; Plane A does not change as a result. Any design that forces Plane B to be answered in order to be expressed has a defect here and must be redesigned around a configuration point (Appendix C) or flagged.

### 0.2 Marker legend (normative)

| Marker | Meaning |
|---|---|
| `TECH:` | Technical-structure fact or design decision. |
| `POLICY:` | A policy-value slot the mechanism will carry. |
| `POLICY_DEFINED` | A policy value already ratified in the repository (for the Family Institution, only the three canonical boundary decisions FIR-017/018/019, and only as prohibitions/boundaries). |
| `POLICY DECISION REQUIRED (FIR-xxx)` | Unresolved policy. The mechanism fails closed for the affected behavior until ratification. |
| `ARCHITECTURE DECISION REQUIRED` | A technical invariant is not safely determinable from repository evidence; it is flagged, not guessed. |
| `DESIGN ONLY — NOT IMPLEMENTATION AUTHORIZED` | Draft API contract. No production route is created. |
| `PROPOSED — NOT AUTHORIZED` | Draft permission. Not added to `src/lib/constants.ts` or any role. |
| `EXISTING CANONICAL TABLE` | Table in the repository; owned by its canonical domain; reused, never duplicated. |
| `EXTENSION CANDIDATE` | Additive, policy-gated change to an existing canonical table. Blocked until its FIR(s) ratify. |
| `NEW TABLE CANDIDATE` | New table proposed conceptually. Blocked until its FIR(s) ratify. |
| `POLICY-DEPENDENT TABLE` | A candidate table whose very existence depends on a policy decision. |
| `BLOCKED` | Implementation of the referenced work is denied under the current allowlist. |

### 0.3 Method for separating A from B

For each component this document states, in order: (1) canonical owner; (2) technical structure; (3) configuration points (where the policy values will live — always existing canonical policy storage or engine input parameters, never new hardcoded constants); (4) policy values required (each mapped to its FIR); (5) fail-closed behavior while unresolved (always the standard behavior FC-1, Section 36); (6) audit obligation; (7) invariants.

### 0.4 Configuration mechanism (KDD-2, normative)

Where policy is unresolved, this architecture uses **configuration points**, defined as one of:

1. **Canonical policy record** — a row in `governance.policies` (`domain`, `jurisdictionCode`, `entityScope`, `roleScope`, `rules` JSONB, `ownerRole`, `approvedByResolutionId`, `version`) — i.e., the value exists as a governed, versioned, resolution-approved policy document; or
2. **Canonical body configuration** — fields of `governance.governance_bodies` (`quorumMinimum`, `majorityRule`, `reservedMatters`, `charterDocumentId`) or `governance_members` (`seatRole`, `votingRights`); or
3. **Engine input parameter** — a value passed to a Phase 1–2 engine function (e.g., the electorate snapshot, thresholds, or instrument references supplied to `assessAmendment`, `evaluateDecisionGate`, `evaluateEligibility`) that the engine consumes without assuming any default policy meaning; or
4. **Canonical reference record** — `consents`, `retentionPolicies`, `delegations`, `documents`, `idempotencyRecords`.

**No new database field is introduced in this specification solely to hold a theoretically useful policy value.** Every candidate field in Section 49 carries the seven-mandate (canonical ownership, purpose, source of truth, lifecycle, authorization, audit requirement, policy dependency). If a candidate field cannot pass the seven-mandate, it is not in the model.

### 0.5 Stop conditions (from the Phase 3A authorization)

The author stopped-and-flagged (never guessed) in the following cases; each flag is recorded in this document at the point of occurrence:

1. Repository evidence conflicts with the architecture → `ARCHITECTURE DECISION REQUIRED`.
2. A policy decision is required to define a technical invariant → `POLICY DECISION REQUIRED (FIR-xxx)`.
3. An existing canonical owner is ambiguous → `ARCHITECTURE DECISION REQUIRED`.
4. Implementation would require choosing an unratified policy → `POLICY DECISION REQUIRED (FIR-xxx)`.
5. Finance OS ownership would be violated → design rejected at the boundary; no alternative.
6. Noelia/HIVE would acquire authority → design rejected at the boundary; no alternative.
7. Tenant/entity isolation cannot be guaranteed → `POLICY DECISION REQUIRED (FIR-002)` for cross-tenant semantics; isolation is guaranteed within tenant by construction.

### 0.6 Phase 3A authorization scope (restated as acceptance criteria for this document)

Phase 3A is complete when this specification: (a) covers sections 1–46 and outputs 1–16 of the authorization; (b) separates A/B for every component; (c) maps every architecture dependency to FIR-001…FIR-027; (d) leaves every unratified value as a fail-closed configuration point; (e) changes no production artifact.

---

# Part I — Executive architecture

## 1. Executive architecture

### 1.1 What Phase 3A delivers

A complete technical architecture for the **BEYU Multigenerational Family Institution Model** — the cross-cutting institutional layer inside the first-class **BEYU Family Office** capability of **BEYU OS** — such that:

1. Every future policy ratification can be expressed by **selecting a value at a named configuration point** (Appendix C), not by redesign.
2. Every unratified policy has one, uniform, mechanically enforced **fail-closed behavior** (Section 36, FC-1).
3. No unratified policy is encoded as executable behavior anywhere in the proposed design.
4. The Phase 1–2 engines, canonical BEYU primitives, Finance OS, and Noelia/HIVE are **reused exactly as they exist**; the architecture is a governed, reference-only, instruction-only extension surface.

### 1.2 System context

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  BEYU OS                                                                             │
│  = Constitutional Control Plane + Enterprise Operating Kernel + Governed Intelligence │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Constitutional Control Plane                                                  │  │
│  │  BEYU Constitution · policy hierarchy (governance.policies) · resolutions ·    │  │
│  │  approvals · authority rules — SUPERIOR to everything below (I-08)             │  │
│  ├────────────────────────────────────────────────────────────────────────────────┤  │
│  │  Enterprise Operating Kernel                                                   │  │
│  │  identity (parties/users/delegations/consents) · tenants · legal entities ·    │  │
│  │  countries/jurisdictions · documents · retention · audit/events · RBAC/ABAC ·  │  │
│  │  idempotency · workflow                                                        │  │
│  │                                                                                │  │
│  │  ┌──────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │  BEYU Family Office — first-class capability (never a separate OS)       │  │  │
│  │  │                                                                          │  │  │
│  │  │  ┌────────────────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │  BEYU Multigenerational Family Institution Model                   │  │  │  │
│  │  │  │  (cross-cutting institutional layer; Phase 1–2 governed engines)   │  │  │  │
│  │  │  │                                                                    │  │  │  │
│  │  │  │  membership · lineage/evidence · constitution · governance bodies  │  │  │  │
│  │  │  │  eligibility · beneficiary registry · delegation · capital · loan  │  │  │  │
│  │  │  │  vault · decisions · policy-decisions · alignment (Noelia boundary) │  │  │  │
│  │  │  └────────────────────────────────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                │  │
│  │  Finance OS — CANONICAL FINANCIAL TRUTH (I-02)                                 │  │
│  │  ledger · treasury · capital requests · waterfalls · tax · financial provenance │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Governed Intelligence Layer                                                   │  │
│  │  HIVE = governed AI runtime · Noelia = single governed BEYU AI identity        │  │
│  │  ADVISORY ONLY — never constitutional authority (I-03, FIR-017)                │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
         │                                        │
         ▼ instruction/reference only             ▼ advisory only
  ┌──────────────────────┐            ┌──────────────────────────┐
  │  Finance OS services │            │  Noelia decision support │
  │  (sole executor of   │            │  (explain · detect ·      │
  │  financial effects)  │            │  recommend · draft)       │
  └──────────────────────┘            └──────────────────────────┘
```

### 1.3 Architectural invariants (normative, all verifiable)

| ID | Invariant | Enforcement point |
|---|---|---|
| I-01 | Placement: BEYU OS → Family Office (first-class capability) → Family Institution Model (cross-cutting layer). The model is **not** an OS, ledger, identity system, or control plane. | `completeness.ts` classification; this spec §2; denylist "Denied by architecture" |
| I-02 | Finance OS is the **only** financial truth. No family-owned ledger, journal, treasury, loan book, accounting system, balance store, or financial lineage exists or may exist. | §20, §21, §30; FIR-018 boundary |
| I-03 | AI is never constitutional authority. Noelia/HIVE outputs are advisory, attributable, and auditable; no AI path creates authority, entitlement, amendments, appointments, approvals, postings, or disbursements. | §31; `alignment.ts` NOELIA_MAY/MAY_NOT; FIR-017 boundary |
| I-04 | Identity is canonical: one `parties` master, one `users` GlobalUserID per party. A `family_member` is a classified institutional **relationship to a party**, never a second person identity. | §8; `family_members.party_id` unique anchor; FIR-019 boundary |
| I-05 | Tenant isolation is absolute. Every family record is tenant-scoped; every read/write passes tenant scope and classification filtering; cross-tenant membership semantics fail closed (FIR-002). | §9; `tenantScopeIds`/`withTenantDatabaseContext`; `can()` in `authz.ts` |
| I-06 | Legal attribution is preserved. Trusts, foundations, and holdings keep their own legal identity and fiduciary authority in `legal_entities` + valid instruments; family records reference, never re-attribute. | §10; `beneficiaries.trustEntityId` |
| I-07 | Governance is the authority. Only canonical `resolutions` (with votes) and canonical `delegations` confer execution capacity; family permissions never confer legal/trustee/constitutional authority. | §19, §23, §26 |
| I-08 | Supremacy order is fixed: applicable law → court order → trust instrument → trustee fiduciary duty → trust protector power → regulatory requirement → corporate constitutional document → shareholder agreement → letter of wishes → Family Constitution → family policies → operational procedures. Lower levels cannot amend, override, or infer higher-level authority. | `SUPERIOR_INSTRUMENTS`, `checkSupremacy`, §15 |
| I-09 | Genealogical descent (person/descent evidence) and financial lineage/provenance (financial-record derivation) never share a table, identifier semantics, or authority rule. | §13, §30; `lineage.ts` vs Finance provenance |
| I-10 | The six participation axes (ATTENDANCE, CONSULTATION, VOTING, OWNERSHIP, BENEFICIARY, GOVERNANCE_RIGHT) are independent; no axis is derived from another. | `FORBIDDEN_AXIS_DERIVATIONS`, `assertParticipationAxesIndependent` |
| I-11 | Every material mutation occurs in ONE transaction with its audit record and durable event(s), performed by a HUMAN actor, with authority context, inside tenant + classification checks. | `publishEventTx` transactional pattern; `guarded()`; §28, §29 |
| I-12 | Unresolved policy fails closed: `POLICY_DECISION_REQUIRED` — no write, no approval, no execution, no financial consequence, no legal-status change. | §36 FC-1; `raisePolicyDecisionRequirement`; §37 |
| I-13 | No duplicate master: no new party, user, tenant, legal entity, delegation, audit, or event system. | FIR-019 boundary; §8–11, §28, §29 |
| I-14 | Audit is append-only and hash-chained (`audit_log`, `enterprise_events`, `audit_chain_heads`); AI summaries are not evidence without human verification + provenance. | §28 |
| I-15 | Phase 1–2 engines are preserved exactly, versioned (`*-1.0.0`), deterministic; they are assessed against, never modified by, this phase. | §48; tests/family unchanged |
| I-16 | Schema discipline: no candidate field/entity without canonical ownership, purpose, source of truth, lifecycle, authorization, audit requirement, and policy dependency (seven-mandate). | §49 seven-mandate table |

### 1.4 The five hard boundaries (executive summary)

1. **Finance boundary** (§30): unidirectional instruction flow; Finance OS executes and owns truth; family layer holds non-financial instructions + Finance references only.
2. **AI boundary** (§31): advisory interfaces only; `NOELIA_MAY_NOT` is normative; human approval handoff is the only path from AI output to effect.
3. **Identity/tenancy boundary** (§8–9): canonical parties/users/tenants; family membership is a classified relationship; cross-tenant is fail-closed pending FIR-002.
4. **Authority boundary** (§15, §23, §26): superior instruments dominate; trustees/instruments own fiduciary matters (`TRUSTEE_RESERVED_MATTERS`); family bodies advise unless a superior instrument confers power; canonical governance is the only decision engine.
5. **Policy boundary** (§36): any `POLICY DECISION REQUIRED` state produces FC-1 behavior, uniformly, in every component.

### 1.5 Key design decisions made by this specification (technical only)

These are architectural decisions (Plane A). Each is recorded in Appendix D as KDD-xx with its ratification-neutrality proof. None answers a FIR.

| ID | Decision | Why it is ratification-neutral |
|---|---|---|
| KDD-1 | The institution root of reads defaults to **tenant scope**; a `family_institutions` record is an **optional** policy-defined refinement, not a prerequisite for any read path. | Works whether FIR-001 chooses tenant-scoped, entity-scoped, or multi-entity institution models; no FK exists before ratification. |
| KDD-2 | Policy values live in **canonical policy records / body configuration / engine input parameters / canonical reference records** — never in new family-owned policy tables or new constants. | Any ratified value (quorum, threshold, rule, jurisdiction) is expressible today via `governance.policies.rules` + engine parameters; no value is fixed. |
| KDD-3 | Evidence is **document-bound**: canonical `documents` rows (with checksum, version, supersession) referenced by future binding tables; no new evidence content store. | Evidence authority (FIR-004) is a property of which documents/verifiers are accepted — a policy value; the binding mechanism is value-neutral. |
| KDD-4 | Family governance bodies project onto **canonical** `governance_bodies` / `governance_members` (`bodyType` already includes `FAMILY_COUNCIL`); no parallel governance store. | FIR-008/021 decide mandates and membership lifecycle, not whether a parallel store exists (a parallel store is prohibited by I-07/I-13 regardless). |
| KDD-5 | Constitutional text is **document-first**: canonical `documents` (versioned, checksummed, supersession-linked) are the source of truth for text; a provision/version registry (if ratified) is a projection. | FIR-006/007/022 decide who/when/thresholds; the text-storage mechanism is value-neutral and subordinate per I-08. |
| KDD-6 | Capital and loan integration is a **unidirectional instruction adapter**: family instruction → canonical Finance request → Finance-owned lifecycle; the family record stores the Finance request reference and its own non-financial state only. | I-02 is a resolved boundary (FIR-018); the adapter direction is the only compliant shape. |
| KDD-7 | One standard fail-closed error — `POLICY_DECISION_REQUIRED` carrying the FIR reference(s) — plus one standard denial-audit event type; applied uniformly. | Uniformity is technical; it fixes no policy value. |
| KDD-8 | All future endpoints are `GET/POST /api/v1/family/*` through `guarded()`, tenant-scoped, human-mutation-only, idempotency-recorded, audit-emitting. | Reuses the canonical API pattern; scope/permission values remain FIR-gated. |

### 1.6 What this specification explicitly does NOT do

- Does not ratify, propose values for, or infer answers to FIR-001…FIR-027 (the three RESOLVED records are canonical boundaries and are preserved, not expanded).
- Does not create migration 0018, alter `src/db/schema/**`, add to `PERMISSIONS`, add routes under `src/app/api/**`, add UI, or touch `src/lib/family/**`, `src/lib/finance/**`, `src/lib/noelia*`, `tests/family/**`.
- Does not treat engine capability, DB columns, comments, AI recommendations, or best practice as ratification.
- Does not resolve any stop condition by guessing; all flags are recorded (§0.5, and inline markers).

### 1.7 Executive verdict

**The architecture is complete, consistent with the repository evidence, and ratification-ready.** It introduces no policy value, violates no canonical ownership, and keeps every unratified behavior fail-closed. Phase 3 implementation remains **NOT AUTHORIZED** (allowlist empty; 24 of 27 FIRs blocking).

---
# Part II — Placement, boundaries, canonical model

## 2. BEYU OS → Family Office → Family Institution placement

### 2.1 Placement (normative, from the approved architecture)

```text
BEYU OS
├── Constitutional Control Plane      (supreme; I-08)
├── Enterprise Operating Kernel       (identity · tenancy · legal entities · documents · audit · authorization)
│   └── BEYU Family Office            (FIRST-CLASS CAPABILITY; HIGHLY_RESTRICTED; never a separate OS)
│       └── BEYU Multigenerational Family Institution Model
│           (CROSS-CUTTING INSTITUTIONAL LAYER inside Family Office)
├── Finance OS                        (CANONICAL FINANCIAL TRUTH; sibling capability)
└── Governed Intelligence Layer       (HIVE runtime + Noelia identity; advisory)
```

**TECH:** The Family Institution Model is expressed as (a) Phase 1–2 governed engines in `src/lib/family/`, (b) three canonical registry tables (`family_members`, `beneficiaries`, `family_vault_items`) in `src/db/schema/people.ts`, (c) a read-oriented workspace at `src/app/os/family/page.tsx`, and (d) write/API surfaces that are **absent by design** until Phase 3D authorization.

**POLICY:** The operational scope, formation authority, and canonical identity of a "Family Institution" as a persistent object. → `POLICY DECISION REQUIRED (FIR-001)`.

**Consequence:** The model is a capability with an institutional *layer*, not a system. It owns no control plane, no identity, no ledger, no authority of its own. Its existence does not create a tenant, entity, user, or OS registry entry.

### 2.2 Why this placement is load-bearing

1. **Authority flow:** constitutional and legal authority enter the model only through the top (law, instruments, BEYU constitutional authority); they are never generated inside the model (I-08).
2. **Isolation flow:** tenancy and classification enter from the kernel; the model cannot opt out (I-05).
3. **Financial flow:** money effects exit only through Finance OS; nothing financial terminates inside the model (I-02).
4. **Intelligence flow:** AI assistance enters only as advisory context; nothing authoritative exits the AI layer into the model (I-03).

## 3. Domain boundaries

### 3.1 Domain map

| Domain | Owner | Family layer role | Boundary rule |
|---|---|---|---|
| Identity & access | BEYU OS kernel (`parties`, `users`, `roles`, `delegations`, `consents`) | Reference only; membership is a classified relationship to a party | No second person identity (I-04) |
| Tenancy | BEYU OS kernel (`tenants`) | All records tenant-scoped | Cross-tenant semantics fail closed (FIR-002) |
| Legal structure | BEYU OS kernel (`legal_entities`, `countries`, `jurisdictions`) | Reference + attribution only | Family records never re-attribute legal ownership (I-06) |
| Governance & authority | BEYU OS control plane (`constitutionArticles`, `policies`, `resolutions`, `resolutionVotes`, `approvals`, `governanceBodies/Members`) | Consume decisions; never create parallel decisions | Only canonical governance confers execution capacity (I-07) |
| Family Institution (this domain) | Family Office (capability) + Family Institution layer (cross-cutting) | Owns: registry projections, assessment records, non-financial instructions, vault index | Writes only through ratified, guarded, audited workflows (Phase 3D) |
| Finance | Finance OS (`ledger*`, `treasury*`, `capitalRequests`, `waterfall*`, `tax*`, financial provenance) | Instruct + reference only | No shadow financial truth (I-02, FIR-018) |
| Governed intelligence | HIVE + Noelia | Advisory input only | No AI authority (I-03, FIR-017) |
| Audit & events | BEYU OS kernel (`audit_log`, `enterprise_events`, `audit_chain_heads`, `ai_decisions`) | Emit through `publishEventTx`; never own a log | No family-owned event store (I-13, I-14) |

### 3.2 Explicit boundary prohibitions (denied by architecture, regardless of future policy)

From the denylist, preserved verbatim in force: nothing — even after ratification — may create a separate Family Institution OS; duplicate parties/users/tenants/legal entities/delegations/audit/events; override superior instruments; create AI authority; create beneficiary entitlement without legal authority; or create Family Office financial truth.

### 3.3 Domain invariants the interfaces must preserve

- **D-1** A family member record can never be the source of an identity decision (identity reads `parties`).
- **D-2** A beneficiary record can never be the source of an entitlement decision (entitlement reads trustee/instrument/law; the record stores verified *references and outcomes*).
- **D-3** A family capital/loan instruction can never be the source of a financial decision (Finance reads its own ledger/requests).
- **D-4** A family constitution record can never be the source of legal authority (supremacy checks run before any use).
- **D-5** A Noelia assessment can never be the source of a decision (human approval handoff required).
- **D-6** An AI-generated summary can never be treated as evidence without human verification and source provenance (I-14).

## 4. Capability map

### 4.1 The six canonical Family Office categories (capability layer, not OS layer)

| Category | Institutional layer consumed | Canonical owner of effects | Phase 3A technical position |
|---|---|---|---|
| Business Development | Opportunity/advisory records; Noelia advisory | Operating legal entities (legal attribution I-06) | Read/advisory surfaces only; no opportunity ledger of its own |
| Wealth Management | Family Capital assessment (`capital.ts`); instructions | **Finance OS** exclusively | Instruction adapter (KDD-6); execution stays in Finance |
| Wealth Planning | Planning inputs; legal/tax counsel references | Legal/tax counsel + legal entities | Reference-only planning records; tax positions owned by Finance tax domain |
| Family Governance | Forums, committees, resolutions, constitution | Canonical governance + instruments | Canonical governance reuse (KDD-4); family bodies are projections |
| Lifestyle Management | Service coordination records | Service legal entities / staff | Service-coordination references; no benefit ledger |
| Philanthropy | Foundation/nonprofit legal entities (`entityType NON_PROFIT`) | The foundations (legal attribution) | Reference to foundation entities; grant decisions stay with foundation governance |

**POLICY:** each category's operational mandate, its accountable body, and its interaction rules with family bodies. → `POLICY DECISION REQUIRED (FIR-008)` for body mandates; category-specific mandates are unratified.

### 4.2 Cross-cutting layer (six concerns, inside Family Office — not a seventh category, not six new ledgers)

| Concern | Technical carrier (existing) | Technical carrier (future, gated) |
|---|---|---|
| Family Constitution | `constitution.ts` engine (supremacy, in-force, amendment stages) | Document-first text (KDD-5) + provision projection (FIR-006/007/022) |
| Family Stewardship | `institution.ts` accountability/conflict assessments | Stewardship records only after FIR-008 |
| Family Education | (none persistent) | Out of Phase 3 scope unless ratified; no table proposed |
| Family Governance | `governanceBodies/Members`, `resolutions`, `institution.ts` forums/committees | Projections on canonical governance (KDD-4) after FIR-008/021 |
| Family Capital | `capital.ts` pool/segregation/allocation/IPS assessments | Non-financial instructions + Finance reference (FIR-012/025) |
| Family Legacy | `family_vault_items` (LEGACY vault type) | Vault/document linkage after FIR-024 |

### 4.3 Capability state at baseline (from `completeness.ts`)

Family Office is classified **first-class but PARTIAL**: `serviceBoundary: false`, missing component "write API (UI + schema only)", HIGHLY_RESTRICTED. Phase 3A designs the missing service boundary; Phase 3D (if authorized) builds it.

## 5. Context/module boundaries

### 5.1 Bounded contexts (module map)

```text
┌─ CONTEXT: Family Identity & Membership ─────────────────────────────────────────┐
│  modules: family-membership (registry read/write gateway)                        │
│  reuses:  identity.parties, core.tenants                                         │
│  owns:    family_members (registry projection) — extension gated FIR-020         │
│  fails:   cross-tenant semantics (FIR-002), lifecycle effects (FIR-020)          │
├─ CONTEXT: Genealogy & Evidence ─────────────────────────────────────────────────┤
│  modules: lineage-graph, evidence-binding, verification-workflow                 │
│  reuses:  platform.documents, platform.audit/events, engines lineage.ts          │
│  owns:    (future) family_lineage_evidence binding — gated FIR-004/005           │
│  fails:   evidence authority (FIR-004), parent integrity (FIR-005)               │
├─ CONTEXT: Family Constitution ──────────────────────────────────────────────────┤
│  modules: constitution-document (document-first), provision-projection,           │
│            amendment-workflow                                                     │
│  reuses:  documents, policies, resolutions, activation, engines constitution.ts  │
│  owns:    (future) provision/version registry — gated FIR-006/007/022            │
│  fails:   authority matrix (FIR-006), lifecycle rules (FIR-007)                  │
├─ CONTEXT: Family Governance Bodies ─────────────────────────────────────────────┤
│  modules: body-projection (onto governance_bodies/members), membership-workflow  │
│  reuses:  governance.* exclusively (KDD-4), engines institution.ts               │
│  owns:    (future) family body membership links — gated FIR-008/021              │
│  fails:   mandates/authority (FIR-008), persistence (FIR-021)                    │
├─ CONTEXT: Eligibility & Beneficiaries ──────────────────────────────────────────┤
│  modules: eligibility-assessment, beneficiary-registry gateway                   │
│  reuses:  beneficiaries, legal_entities, engines eligibility.ts, lineage.ts      │
│  owns:    (future) eligibility determination records — gated FIR-009             │
│  fails:   eligibility rules (FIR-009), uniqueness/periods (FIR-010)              │
├─ CONTEXT: Delegation (family view) ─────────────────────────────────────────────┤
│  modules: delegation-assessment (canonical delegations only, KDD)                │
│  reuses:  identity.delegations, governance/delegation.ts, engine decision-gate   │
│  owns:    NOTHING new (no family delegation table, ever)                          │
│  fails:   family scope rules (FIR-011)                                           │
├─ CONTEXT: Family Capital & Loan Instructions ───────────────────────────────────┤
│  modules: capital-instruction, loan-instruction, finance-handoff adapter         │
│  reuses:  finance.capitalRequests (canonical target), engines capital.ts/loan.ts │
│  owns:    (future) non-financial instruction records — gated FIR-012/025,        │
│           FIR-013/026                                                            │
│  fails:   legal owner/authority (FIR-012/013), persistence (FIR-025/026)         │
├─ CONTEXT: Documents & Vault ────────────────────────────────────────────────────┤
│  modules: vault-index gateway, document-linkage                                  │
│  reuses:  family_vault_items, documents, access policies, retention, legal holds │
│  owns:    (future) vault↔document bindings — gated FIR-024                        │
│  fails:   custody/access/sealed rules (FIR-015/024)                              │
├─ CONTEXT: Decisions & Policy-Decisions ─────────────────────────────────────────┤
│  modules: decision-gateway (canonical resolutions), policy-decision register     │
│  reuses:  resolutions/votes/activation, engines decision-gate.ts,                │
│           policy-decisions.ts                                                    │
│  owns:    (future) policy-decision records — gated FIR-027                        │
│  fails:   register operation (FIR-027)                                           │
└──────────────────────────────────────────────────────────────────────────────────┘
Cross-context: Authorization (guard/authz), Audit/Events (publishEventTx),
Finance adapter (one-way), Noelia advisory (read-only context injection).
```

### 5.2 Context rules

1. Contexts communicate only through the kernel services (`guard`, `authz`, `publishEventTx`, tenant scope) and reference data; no context writes another context's tables.
2. The Finance adapter context is the **only** family context that touches Finance, and only to create/refer canonical Finance requests (KDD-6).
3. The Noelia context is the **only** family context that consumes AI output, and only advisory fields (KDD: §31).
4. Every context's write path (when ratified) is: `guarded()` → authority check → policy gate (FIR check) → engine assessment → single-transaction mutation + audit + event (§26, §36).

## 6. Canonical entity model

### 6.1 Entity classes (conceptual)

| Entity | Class | Canonical owner | Notes |
|---|---|---|---|
| Party | Person/organization master | Identity (`parties`) | Global MDM; `duplicateOfPartyId` anti-duplication |
| User / GlobalUserID | Operational identity | Identity (`users`) | One per party (`users_party_uidx`) |
| Tenant | Isolation boundary | Kernel (`tenants`) | `isolationTier`, parent hierarchy |
| Legal Entity | Legal attribution | Kernel (`legal_entities`) | Trusts, foundations, holdings, non-profits |
| Country / Jurisdiction | Legal reference | Kernel (`countries`, `jurisdictions`) | References only; no legal conclusions from fields |
| Family Member | Institutional relationship to a party | Family Office (`family_members`) | Registry projection; `partyId` unique anchor (I-04); `parentMemberId` without FK (FIR-005) |
| Descent Edge / Lineage Evidence | Person/descent evidence | Family Office (future binding; evidence in `documents`) | Distinct from financial lineage (I-09) |
| Constitution Provision / Version | Subordinate policy text | Family Office projection; text in `documents`; authority via `policies`/`resolutions` | Subordinate per I-08 |
| Family Forum / Committee | Governance body (projection) | Canonical `governance_bodies`/`governance_members` | `FAMILY_COUNCIL` bodyType exists |
| Resolution / Vote / Approval | Decision record | Canonical governance | The only decision engine (I-07) |
| Participation Grant | Per-axis rights bundle | Family governance (resolution-backed) | Six independent axes (I-10) |
| Eligibility Determination | Domain-specific assessment record | Family Office assessment (not legal entitlement) | Never confers rights (I-10, D-2) |
| Beneficiary Record | Trust-specific registry entry | Family Office (`beneficiaries`) + legal attribution via `legal_entities` | Entitlement owned by trustee/instrument/law |
| Delegation | Delegable execution capacity | Canonical `delegations` only | No family delegation store, ever |
| Capital Instruction | Non-financial governance instruction | Family Office (future) → Finance reference | Never financial truth (I-02) |
| Loan Instruction | Non-financial governance instruction | Family Office (future) → Finance/legal reference | Never a loan book (I-02) |
| Vault Item | Metadata/index entry | Family Office (`family_vault_items`) | Not storage, not a secrets system (FIR-024) |
| Document | Canonical content record | Platform (`documents`) | Checksummed, versioned, supersession-linked |
| Policy / Constitution Article | Governing rule text | Control plane (`policies`, `constitutionArticles`) | Family policies are subordinate rows in the same hierarchy |
| Audit Log / Enterprise Event | Mutation history | Platform (append-only, hash-chained) | No family-owned log (I-13) |
| AI Decision | Attributable AI output | Platform (`ai_decisions`) | Advisory; `policyDecision`, `deniedScopes`, review fields |

### 6.2 Identity of entities (technical)

- All entities use canonical text PKs (`id`); family candidate entities follow the same convention.
- Every family entity carries `tenantId` (notNull FK) — isolation by construction (I-05).
- Every family registry entity carries `classification` (default `HIGHLY_RESTRICTED` for member/beneficiary/vault rows).
- References between family entities and canonical entities are explicit FKs where the repository already has them (`partyId`, `tenantId`, `trustEntityId`, `ownerMemberId`, `familyMemberId`); text-without-FK fields (`parentMemberId`, `approvedByResolutionId`, `documentId`, `accessPolicyId`) are **intentionally unfixed pending their FIRs** (FIR-005, FIR-024) and are validated in-engine, not in-DB.

## 7. Conceptual relationship model

### 7.1 ER diagram (conceptual; arrows to Finance/AI are references, never ownership of effects)

```text
Tenant ──< LegalEntity (TRUST | FOUNDATION | HOLDING | NON_PROFIT | ...)
Tenant ──< Party ──0..1 FamilyMember ──< LineageEdge (parentMemberId, no FK yet)
                                       │        (evidence: documents, future binding)
FamilyMember ──< ParticipationGrant >── Forum/Committee (canonical governance_bodies)
FamilyMember ──< Beneficiary >── LegalEntity(TRUST)     [entitlement: trustee/instrument]
FamilyMember ──< FamilyVaultItem (metadata) ──> Document (canonical, checksummed)
Forum/Committee ──< Resolution >── ResolutionVote (members), Approval (maker/checker)
ConstitutionProvision (text: Document) ──< governed Resolution (amendments)
Policy (family domain rows) ──< Resolution (ratifications)
CapitalInstruction ──> Finance capitalRequest (REFERENCE; Finance owns all effects)
LoanInstruction    ──> Finance/legal request (REFERENCE; Finance/legal owns effects)
Delegation (canonical) ── assessed by decision-gate engine for any family execution
All governed mutations ──> AuditLog + EnterpriseEvent (one transaction, I-11)
Noelia (advisory) ──> ai_decisions + action requests ──> HUMAN approval ──> canonical path
```

### 7.2 Cardinalities (normative, technical)

| Relationship | Cardinality | Constraint status |
|---|---|---|
| Tenant → FamilyMember | 1..n | FK notNull |
| Party → FamilyMember | 1..1 (global) | `family_members_party_uidx` (unique on `partyId` ALONE); cross-tenant meaning `POLICY DECISION REQUIRED (FIR-002)` — do not change |
| FamilyMember → parent FamilyMember | 0..n children; 0..1 parent | `parentMemberId` text, **no FK** (FIR-005); in-engine graph validation (`buildDescentGraph`, max depth 25) |
| FamilyMember → BeneficiaryRecord | 1..n | FK notNull; uniqueness rule `POLICY DECISION REQUIRED (FIR-010)` — no constraint today, none may be inferred |
| BeneficiaryRecord → LegalEntity(TRUST) | n..1 | FK notNull (`trustEntityId`) |
| FamilyMember → VaultItem | 1..n owner | FK nullable (`ownerMemberId`) |
| VaultItem → Document | n..0..1 reference | `documentId` text, no FK (FIR-024) |
| GovernanceBody → Resolution | 1..n | FK notNull |
| Resolution → Vote | 1..n | FK notNull |
| FamilyMember → ParticipationGrant | 1..n (future) | Gated; axes independent (I-10) |
| FamilyMember → EligibilityDetermination | 1..n (future) | Gated; domain-specific, non-confering |
| Capital/LoanInstruction → Finance request | 1..0..1 reference | Gated; reference-only (KDD-6) |
| FamilyMember ↔ User | n..0..n via party | No direct link; identity resolves through `parties` (I-04) |

### 7.3 Anti-relationships (must never exist)

- FamilyMember ↔ User identity merge (D-1)
- BeneficiaryRecord ↔ entitlement effect (D-2)
- Capital/LoanInstruction ↔ balance/payment/posting (D-3)
- LineageEdge ↔ financial lineage record (I-09)
- ConstitutionProvision ↔ legal instrument amendment (I-08, D-4)
- AI output ↔ any of the above effects (D-5, D-6)

---

# Part III — Identity, tenancy, legal structure

## 8. Identity architecture

**Canonical owner:** Identity domain — `parties` (global person/org master, `partyType PERSON|ORGANIZATION|SERVICE_ACCOUNT|AI_AGENT|DEVICE`, `duplicateOfPartyId`), `users` (one GlobalUserID per party via `users_party_uidx`), `roles`, `permissions`, `rolePermissions`, `roleAssignments`, `emergencyAccessGrants`, `delegations`, `consents`.

### 8.1 Technical structure

- **TECH:** A `family_member` is a **classified institutional relationship record to a party** (`family_members.partyId` notNull FK; global unique). The person's identity, KYC state, and nationality/country live in `parties` and are read through it. No family table ever stores person identity attributes that `parties` owns.
- **TECH:** Authorization principals are `users` (GlobalUserID). A family member who is also a system user acts through the user; a family member without a user cannot authenticate — membership confers no access (I-04, I-07).
- **TECH:** Service accounts and AI agents are parties of `SERVICE_ACCOUNT`/`AI_AGENT` type; they may never be the `verifiedBy`/decider of a family governance act (human-only write assertions in every engine).
- **TECH:** Anti-duplication: `family_members_party_uidx` is the structural guarantee that one party is at most one family member **globally** (current constraint; its cross-tenant meaning is policy, §8.3).

### 8.2 Configuration points

- **CFG-ID-1** (Appendix C): lawful basis / consent records for processing a member's family data → canonical `consents` (purpose, lawfulBasis, jurisdictionCode, granted/withdrawn). `POLICY DECISION REQUIRED (FIR-015)` for the required purposes/bases.

### 8.3 Policy values required

- **POLICY:** whether one party may hold family membership in more than one institution/tenant, and the cross-tenant control set. → `POLICY DECISION REQUIRED (FIR-002)`. Until ratified: the existing global-unique constraint stands; any cross-tenant family workflow fails closed (FC-1); no migration touches `family_members_party_uidx`.

### 8.4 Fail-closed behavior

Cross-tenant membership requests, duplicate-identity attempts, or AI/service actors attempting identity-conferring actions → FC-1 + `DUPLICATE_IDENTITY_DENIED` / `TENANT_ISOLATION_DENIED` (§37).

## 9. Tenant architecture

**Canonical owner:** Kernel — `tenants` (code unique, type, parent hierarchy, countryCode, `isolationTier` default `LOGICAL`, status, classification).

### 9.1 Technical structure

- **TECH:** Every family table carries `tenantId` notNull FK to `tenants`. All reads run inside `withTenantDatabaseContext(principal, ...)` with `tenantScopeIds(principal)`; all writes pass the same scope in the `guarded()` context. Tenant ancestry (`tenantAncestry`) is the only sanctioned cross-tenant read direction (parent sees child scope per existing rules).
- **TECH:** The family institution root **defaults to tenant scope** (KDD-1): all reads are expressible as "family records of tenant T" before any institution record exists. If FIR-001 ratifies a narrower institution scope, a `family_institutions` record (tenantId + scope reference) is added **inside** the tenant and becomes the filter root — the read architecture does not change.
- **TECH:** Isolation guarantees: classification filtering (`filterByClearance`) + role grants + step-up; no family query path exists outside tenant scope (I-05).

### 9.2 Configuration points

- **CFG-TN-1**: institution-scope filter root (tenant | institution record) → engine/query parameter set by ratified FIR-001 policy record. `POLICY DECISION REQUIRED (FIR-001)`.

### 9.3 Policy values required

- **POLICY:** institution tenancy model; cross-tenant party membership; cross-tenant data sharing. → `POLICY DECISION REQUIRED (FIR-001, FIR-002)`.

### 9.4 Fail-closed behavior

Any cross-tenant access beyond existing canonical rules → denied + audited (`TENANT_ISOLATION_DENIED`). Institution-scoped writes before FIR-001 → FC-1.

## 10. Legal-entity architecture

**Canonical owner:** Kernel — `legal_entities` (entityType TRUST|FOUNDATION|HOLDING|COUNTRY_HOLDING|OPERATING_COMPANY|SUBSIDIARY|ASSOCIATE|JOINT_VENTURE|PARTNERSHIP|BRANCH|NON_PROFIT; countryCode FK; jurisdictionId; registration/tax identifiers; functional currency; accounting standard; status; classification) + `ownershipRecords` + `entityAppointments`.

### 10.1 Technical structure

- **TECH:** Family architecture treats legal entities as **attribution and mandate anchors**:
  - `beneficiaries.trustEntityId` — the trust the beneficiary record belongs to (legal attribution of entitlement context; the entitlement itself is trustee/instrument-owned, D-2).
  - Capital/loan instructions (future) — target legal entity for which the instruction is issued; Finance requests already carry `legalEntityId` canonically.
  - Family bodies (canonical `governance_bodies.legalEntityId`) — the entity whose governance a body belongs to.
- **TECH:** No family table may assert ownership of an entity, its assets, or its mandates. `ownershipRecords`/`entityAppointments` remain the only canonical ownership/appointment records (I-06).
- **TECH:** Entity lifecycle (`lifecycleStatusEnum`) and classification gate family reads that join entities.

### 10.2 Configuration points

- **CFG-LE-1**: which entity types may be trust anchors for beneficiary records, and the instrument-verification profile → policy record per FIR-009. `POLICY DECISION REQUIRED (FIR-009)`.

### 10.3 Policy values required

- **POLICY:** legal/economic ownership of capital pools; lender/borrower entities for family loans; formation and ownership of the institution itself. → `POLICY DECISION REQUIRED (FIR-001, FIR-012, FIR-013)`.

### 10.4 Fail-closed behavior

Instruction/registry writes asserting ownership or mandate of an entity → rejected (`AUTHORITY_UNPROVEN`) + FC-1 for the underlying policy.

## 11. Country/jurisdiction architecture

**Canonical owner:** Kernel — `countries` (code), `jurisdictions` (countryCode FK, level NATIONAL|STATE|MUNICIPAL|REGULATOR, code, name, regulator, legalSystem, effectiveFrom/To).

### 11.1 Technical structure

- **TECH:** Jurisdiction is a **reference dimension**: `legal_entities.jurisdictionId`, `tenants.countryCode`, `parties` nationality/country fields, `documents.jurisdictionCode`, `policies.jurisdictionCode`, `consents.jurisdictionCode`, `jurisdictions` effective periods.
- **TECH:** Engines consume jurisdiction **only as an input parameter** where a policy supplies one (e.g., an eligibility or amendment assessment receives the governing jurisdiction reference of the instrument/policy). No engine infers applicable law from a country code (I-08; contract §8).
- **TECH:** Jurisdiction-sensitive writes (any mutation whose legal effect depends on governing law) pass a **jurisdiction gate**: (a) a ratified governing-jurisdiction policy record exists for the object, (b) the jurisdiction reference is present and valid, (c) the legal-review flag required by the FIR is recorded in the authority context. Missing any → FC-1.

### 11.2 Configuration points

- **CFG-JX-1**: governing-jurisdiction mapping per object class (institution, trust, member, beneficiary, loan, capital) → policy records (KDD-2). `POLICY DECISION REQUIRED (FIR-014)`.
- **CFG-JX-2**: conflict-of-laws escalation path (which legal body/counsel, which record) → policy record. `POLICY DECISION REQUIRED (FIR-014)`.

### 11.3 Policy values required

- **POLICY:** which law governs the institution, each trust, cross-border conflicts, tax, privacy applicability. → `POLICY DECISION REQUIRED (FIR-014)`. Country/jurisdiction fields are references, **never legal conclusions**.

### 11.4 Fail-closed behavior

Jurisdiction-sensitive mutation without a ratified governing-jurisdiction policy → FC-1 (`POLICY_DECISION_REQUIRED (FIR-014)`); conflict cases route to the escalation path once CFG-JX-2 is ratified; until then, conflict = FC-1 (no inference).

---
# Part IV — Family Institution core architectures

## 12. Family membership architecture

**Canonical owner:** Family Office registry — `family_members` (existing canonical table).
**Existing columns (verified):** `id`, `tenantId` (FK tenants), `partyId` (FK parties, **globally unique**), `familyLine`, `branch`, `generation` (int), `parentMemberId` (text, **no FK**), `relationshipToParent` (default `CHILD`), `directDescendant` (bool default false), `verificationStatus` (`UNVERIFIED|DOCUMENTED|VERIFIED|DISPUTED`), `verificationMethod`, `verifiedBy`, `verifiedAt`, `deceasedOn`, `classification` (default `HIGHLY_RESTRICTED`); index `family_members_branch_idx`.

### 12.1 Technical structure

- **TECH:** Membership is a **registry projection**: the authoritative person is `parties`; the record classifies that party's institutional relationship (line, branch, generation, verification state).
- **TECH:** Read path (exists today in the UI): tenant-scoped join of `family_members` + `parties` (display name, KYC status), filtered by `family:member.read` + clearance.
- **TECH:** Write path (future, gated): `guarded()` → human actor → authority proof (verifier role per ratified matrix) → evidence present (FIR-004) → engine validation (descent graph, `MAX_GENERATION_DEPTH = 25`) → mutation + audit + event in one transaction.
- **TECH:** Dispute state is first-class: `verificationStatus = DISPUTED` is a stable state; disputed records carry no effects beyond what a ratified lifecycle allows (none ratified: FC-1 for effect-bearing reads).
- **TECH:** Deceased members: `deceasedOn` is data, not a lifecycle decision; rights/effects on death are policy (FIR-003) and currently confer nothing.

### 12.2 Configuration points

- **CFG-MB-1**: member lifecycle states and their effects (which statuses exist, what each permits) → engine input parameters + `lifecycleStatusEnum` mapping, ratified via FIR-020. `POLICY DECISION REQUIRED (FIR-020)`.
- **CFG-MB-2**: relationship vocabulary and its effects (which `relationshipToParent` values exist, what each implies) → vocabulary list + policy record per FIR-003. `POLICY DECISION REQUIRED (FIR-003)`.
- **CFG-MB-3**: verifier role/roles and verification method acceptance → authority matrix (FIR-004/023). `POLICY DECISION REQUIRED (FIR-004)`.

### 12.3 Policy values required

Relationship legal effects (FIR-003); evidence standard (FIR-004); parent integrity/temporality (FIR-005); lifecycle and effects (FIR-020); cross-tenant membership (FIR-002).

### 12.4 Fail-closed behavior

All member **writes** (create, verify, dispute, correct, deactivate, archive) before ratification → FC-1. Reads of HIGHLY_RESTRICTED registry data follow existing classification/clearance rules (already live). Any workflow that would infer rights from relationship → rejected at the engine level (`assertNoAutomaticConferment` pattern; I-10).

## 13. Genealogical descent architecture

**Canonical owner:** Family Office (registry edges in `family_members`; evidence in `documents`; assessment engine `lineage.ts` v `family-lineage-1.0.0`).

### 13.1 Technical structure

- **TECH:** Descent is a **bounded, validated graph**: `buildDescentGraph` (cycle detection, max depth 25, duplicate-parent detection) over `DescentNode` inputs; `determineDescendantStatus` produces a `DescendantStatus` determination with evidence requirements; `assessLineageEvidence` evaluates evidence against the candidate standard per relationship (`CANDIDATE_EVIDENCE_STANDARD`); `verifiedDescendantsOf` and `reconcileStoredDescendantFlags` reconcile registry flags against assessed evidence.
- **TECH:** Descent vocabulary (existing, technical): `LINEAGE_RELATIONSHIPS` with `DESCENT_RELATIONSHIPS` vs `AFFINAL_RELATIONSHIPS` split; `LINEAGE_EVIDENCE_TYPES`; `LINEAGE_VERIFICATION_STATES`. The vocabulary is a *representation*; which relationship confers what effect is policy (FIR-003).
- **TECH:** **Genealogical lineage ≠ financial lineage (I-09):** the descent graph has no financial fields, no amounts, no instrument-derived "beneficial ownership" semantics; Finance provenance is a separate domain with its own identifiers.
- **TECH:** Future persistence (gated): a `family_lineage_evidence` binding (member edge ↔ document IDs + verifier + effective dates) and, only if FIR-005 ratifies temporality, a relationship-history record. The current `parentMemberId` text-without-FK remains untouched until FIR-005 ratifies the integrity model (FK vs temporal vs none).

### 13.2 Configuration points

- **CFG-LN-1**: evidence hierarchy (which evidence types are authoritative per relationship, per jurisdiction) → policy record consumed by `assessLineageEvidence` inputs. `POLICY DECISION REQUIRED (FIR-004)`.
- **CFG-LN-2**: verifier authority (who may verify/correct, dispute escalation) → authority matrix (FIR-004/023). `POLICY DECISION REQUIRED (FIR-004)`.
- **CFG-LN-3**: parent-integrity model (FK / temporal / none; tenant-consistency rule) → schema decision gated by FIR-005. `POLICY DECISION REQUIRED (FIR-005)`.

### 13.3 Fail-closed behavior

Lineage writes/verification/correction/dispute-resolution → FC-1 until FIR-004/005/020 ratify. Assessment-only use of the engine (in-memory, human-initiated, read of existing registry) is the permitted current use.

## 14. Evidence architecture

**Canonical owner:** Platform `documents` (canonical content: `checksum`, `version`, `supersedesId`/`supersededById`, `jurisdictionCode`, `entityScope`, `accessPolicyId`, `storageUri`, `uploadedBy`) + retention policies + legal holds. Family layer owns only **bindings** (future, gated).

### 14.1 Technical structure

- **TECH:** Evidence is **document-bound, not content-bound** (KDD-3): a family evidence reference is a set of `documents` IDs + the assessment that consumed them. No family table stores document content or hashes its own way (the canonical checksum is authoritative).
- **TECH:** Evidence lifecycle follows the document lifecycle (version, supersession) plus a family verification state (`UNVERIFIED|DOCUMENTED|VERIFIED|DISPUTED` on the owning object, and the engine's `LineageVerificationState` for descent edges).
- **TECH:** AI-generated content can enter `documents` only as a draft with source provenance; it becomes evidence **only after** human verification + provenance recorded (I-14, D-6).
- **TECH:** Access to evidence documents is governed by `accessPolicyId` + classification + (future ratified) sealed/retention rules; every access is audited.

### 14.2 Configuration points

- **CFG-EV-1**: evidence types, authority ranking, verification workflow, correction/supersession rules → policy record + event profile (FIR-004, FIR-016). `POLICY DECISION REQUIRED`.
- **CFG-EV-2**: retention period and legal-hold rules for family evidence → `retentionPolicies` rows (FIR-015). `POLICY DECISION REQUIRED (FIR-015)`.

### 14.3 Fail-closed behavior

Evidence ingestion, verification, correction, and any effect-bearing use of unverified evidence → FC-1. Reading existing document metadata under current access rules remains available (no change).

## 15. Family Constitution architecture

**Canonical owner:** Text in `documents` (document-first, KDD-5); governing status via `policies` + `resolutions` + decision activation; assessment engine `constitution.ts` v `family-constitution-1.0.0`.

### 15.1 Technical structure

- **TECH:** The constitution engine operates on `ConstitutionProvision` inputs (domain, text/version references, status, effective period) and provides: `checkSupremacy` (against `SUPERIOR_INSTRUMENTS` — the nine-rank supremacy ladder, I-08), `provisionsInForce` (effective-period evaluation), `assessAmendment` (staged amendment assessment against `AMENDMENT_STAGE_REQUIREMENTS`), `compareProvisionVersions`, and human-only write assertions.
- **TECH:** Text storage (KDD-5): each constitution version is a canonical `documents` row (versioned, checksummed, `supersededById`-linked). A provision registry (future, FIR-022) is a **projection** of document sections with machine-checkable identifiers — never a second text store.
- **TECH:** Authority: a family constitution row/provision has **no authority by itself** (I-08). It operates only when: (a) ratified via a canonical `resolution` (votes, quorum recorded), (b) activation state reached (`decisionActivationStateEnum`), (c) supremacy checks pass for all provisions.
- **TECH:** Amendment flow (gated): proposal (document + resolution draft) → staging per `AMENDMENT_STAGE_REQUIREMENTS` (electorate snapshot, quorum, threshold supplied **as inputs** from CFG-CON-*) → assessment → approval resolution → activation → effective period → supersession of prior version. Every stage records evidence + authority context.

### 15.2 Configuration points (the A/B split the authorization itself used as its example)

- **CFG-CON-1** — proposer authority: who may propose amendments. `POLICY DECISION REQUIRED (FIR-006)`.
- **CFG-CON-2** — electorate definition: who votes (member class, seat role, delegation rules). `POLICY DECISION REQUIRED (FIR-006)`.
- **CFG-CON-3** — quorum and voting threshold (including supermajority rules). `POLICY DECISION REQUIRED (FIR-007)`. Supplied to `assessAmendment` as inputs; **no default may be assumed** — the engine's staged requirements define the *shape* of the data, not its values.
- **CFG-CON-4** — ratification authority (who ratifies; instrument reference). `POLICY DECISION REQUIRED (FIR-006)`.
- **CFG-CON-5** — amendment authority and emergency-amendment rules (if any). `POLICY DECISION REQUIRED (FIR-007)`.
- **CFG-CON-6** — effective-date rules, suspension, supersession, conflict handling with superior instruments. `POLICY DECISION REQUIRED (FIR-007)`.
- **CFG-CON-7** — jurisdictional applicability of the constitution. `POLICY DECISION REQUIRED (FIR-014)`.

### 15.3 Invariants

A constitution provision may never: amend law/instruments; appoint or remove trustees; create beneficiary entitlement; override a superior instrument; operate while supremacy checks fail; or operate without a recorded resolution + activation. Violations are engine-detected (`checkSupremacy`) and FC-1 at the workflow layer.

## 16. Governance-body architecture

**Canonical owner:** Canonical governance — `governance_bodies` (bodyType already includes `FAMILY_COUNCIL`, plus BOARD|COMMITTEE|TRUSTEES|SHAREHOLDERS|EXECUTIVE; `quorumMinimum`, `majorityRule` SIMPLE|TWO_THIRDS|UNANIMOUS, `reservedMatters`, `charterDocumentId`, status), `governance_members` (seatRole CHAIR|MEMBER|SECRETARY|OBSERVER, `votingRights`, appointment/retirement dates), `resolutions`, `resolutionVotes` (FOR|AGAINST|ABSTAIN|RECUSED, `conflictDeclared`), `approvals` (maker/checker). Assessment engine: `institution.ts` v `family-institution-1.0.0`.

### 16.1 Technical structure

- **TECH:** Family bodies **are** canonical governance bodies of `FAMILY_COUNCIL`/`COMMITTEE` type (KDD-4). No parallel body store exists or may (I-07, I-13).
- **TECH:** The institution engine provides: `validateForum` (forum definition coherence), `assessCommitteeMandate` (mandate element completeness — `COMMITTEE_MANDATE_ELEMENTS`), `assessMeeting` (meeting constraints), `assessAccountability` (`FAMILY_OFFICE_FUNCTIONS` accountability), `assessConflict` (conflict declaration workflow — `CONFLICT_WORKFLOW`), axis-independence enforcement (`FORBIDDEN_AXIS_DERIVATIONS`), and human-only governance write assertions.
- **TECH:** Body authority is **mandate-scoped**: a body decides only within `reservedMatters` + ratified mandate; trustee-reserved matters (`TRUSTEE_RESERVED_MATTERS`: TRUST_DISTRIBUTION, TRUST_AMENDMENT, TRUSTEE_APPOINTMENT/REMOVAL/REPLACEMENT, TRUST_INVESTMENT, BENEFICIARY_DETERMINATION, TRUST_PROTECTOR_EXERCISE) are **advisable but not decidable** by family bodies unless a superior instrument validly confers the power (engine invariant).
- **TECH:** Future persistence (gated, FIR-021): the projection needs only (a) the canonical body/member rows (exist), (b) family-side links from members to seats (future, minimal), (c) appointment instruments as `documents` references. No new decision mechanics.

### 16.2 Configuration points

- **CFG-BD-1**: body roster, mandates, scopes, and role-to-authority matrix per instrument/jurisdiction. `POLICY DECISION REQUIRED (FIR-008)`.
- **CFG-BD-2**: appointment/removal authority, terms, recusal rules, non-delegable powers. `POLICY DECISION REQUIRED (FIR-008)`.
- **CFG-BD-3**: quorum/majority per body → canonical `governance_bodies.quorumMinimum`/`majorityRule` (values chosen only under FIR-008 ratification; defaults in the schema are technical placeholders, **not policy values**).
- **CFG-BD-4**: body-membership persistence lifecycle (link to canonical governance members). `POLICY DECISION REQUIRED (FIR-021)`.

### 16.3 Fail-closed behavior

Body appointment, mandate change, membership writes, and any decision by a family body on a `TRUSTEE_RESERVED_MATTER` without superior-instrument conferral → FC-1 / engine refusal. Meetings/assessments (read/assess-only) remain available.

## 17. Eligibility architecture

**Canonical owner:** Family Office assessment — engine `eligibility.ts` v `family-eligibility-1.0.0`; input facts from membership/lineage; results are **assessment records**, never entitlements.

### 17.1 Technical structure

- **TECH:** Eligibility is evaluated **independently per domain** across the six participation axes (I-10); `evaluateEligibility` returns a per-domain `EligibilityDetermination` (result `ELIGIBLE|NOT_ELIGIBLE|INDETERMINATE` + rationale + evidence references); `evaluateAllDomains` and `summariseDeterminations` aggregate for review.
- **TECH:** Hard non-conferment guards: `assertNoAutomaticConferment` (against `FORBIDDEN_CONFERMENT_SOURCES`) and `assertNoSpousalInheritanceOfFamilyLineRights` — eligibility outcomes do not auto-create beneficiary, ownership, voting, attendance, or governance rights.
- **TECH:** Through-desendant authorisation is an explicit, separately-evidenced input (`ThroughDescendantAuthorisation`), not a derivation.
- **TECH:** Future persistence (gated, FIR-009): determination records (member, domain, result, rationale, evidence references, engine version/input checksum, effective period) — assessment history only; legal beneficiary determination remains trustee/instrument-owned (D-2).

### 17.2 Configuration points

- **CFG-EL-1**: eligibility rules per domain (facts, thresholds, exceptions, jurisdictional treatment of adoption/spouse/minor/incapacity/deceased/disputed). `POLICY DECISION REQUIRED (FIR-003, FIR-009, FIR-014)`.
- **CFG-EL-2**: evidence requirements per domain. `POLICY DECISION REQUIRED (FIR-004, FIR-009)`.
- **CFG-EL-3**: who may commission/confirm determinations (assessor role; confirmation by trustee/instrument authority where legal effect is claimed). `POLICY DECISION REQUIRED (FIR-009, FIR-023)`.

### 17.3 Fail-closed behavior

Any effect-bearing use of eligibility (granting participation, beneficiary processing, access) → FC-1 until CFG-EL-* ratify. Determination assessment (in-memory, human-initiated, non-persisted or gated-persisted) is the permitted use.

## 18. Beneficiary architecture

**Canonical owner:** Registry — `beneficiaries` (existing canonical table); legal attribution — `legal_entities` (trusts); **legal entitlement — trustee/trust instrument/law (not BEYU, not the Family Office)**.

**Existing columns (verified):** `id`, `tenantId`, `familyMemberId` (FK), `trustEntityId` (FK legal_entities), `beneficiaryClass` (PRIMARY|CONTINGENT|DISCRETIONARY|CHARITABLE), `eligibility` (default `UNDER_REVIEW`), `eligibilityRationale` (notNull), `entitlementPct` (numeric 9,6), `conditions` (jsonb string[]), `effectiveFrom` (notNull), `effectiveTo`, `verifiedBy`, `approvedByResolutionId` (text, no FK), `classification` (default HIGHLY_RESTRICTED). **No unique constraint on member/trust/class/period.**

### 18.1 Technical structure

- **TECH:** The registry stores **verified references and outcomes**: which member, which trust, which class, which verified-by, which resolution reference, effective period, conditions. It is a *projection of a legally-owned determination* — the record's authority is the ratifying resolution + trustee/instrument confirmation, not the row.
- **TECH:** Reads (current UI): tenant-scoped, `family:beneficiary.read`, clearance-filtered.
- **TECH:** Writes (future, gated): proposer (family member/office) → verification against instrument (trustee/instrument confirmation recorded) → resolution approval (`approvedByResolutionId` populated by canonical governance) → mutation + audit + event. `family:beneficiary.manage` is HIGH_RISK and is a **capability, not trustee authority** (FIR-009 note in the register).
- **TECH:** Entitlement percentages (`entitlementPct`) are stored as *reported values with provenance* (verifiedBy + resolution), never recomputed or applied by BEYU; any distribution computation belongs to the trust/Finance under legal authority.

### 18.2 Configuration points

- **CFG-BF-1**: beneficiary rules per trust/instrument (classes, contingent/discretionary treatment, effective-date semantics, trust-specific rules). `POLICY DECISION REQUIRED (FIR-009)`.
- **CFG-BF-2**: uniqueness and overlap rules (per instrument; legitimate overlapping contingent/discretionary arrangements may exist). `POLICY DECISION REQUIRED (FIR-010)`.
- **CFG-BF-3**: trustee-authority proof (what evidence a verification carries; who holds it). `POLICY DECISION REQUIRED (FIR-009)`.

### 18.3 Fail-closed behavior

All beneficiary writes, eligibility changes, and any use of registry data as an entitlement basis → FC-1. Existing read surfaces are unchanged. `BENEFICIARY_DETERMINATION` is a `TRUSTEE_RESERVED_MATTER`: no family body may decide it (engine-enforced).

## 19. Delegation architecture

**Canonical owner:** Canonical `delegations` (identity domain) — **exclusive**. Family layer owns **nothing** (KDD; I-07, I-13, FIR-011 contract position: reuse, do not compete).

**Existing canonical shape (verified):** `delegations`: `id`, `tenantId`, `fromUserId`, `toUserId`, `scope`, `monetaryLimit`, `effectiveFrom`, `effectiveTo`, `authorizedBy`, `revokedAt`. Governance module `src/lib/governance/delegation.ts` rejects self-delegation; human→AI material delegation is prohibited canonically.

### 19.1 Technical structure

- **TECH:** Family execution paths that require delegated capacity call `assessDelegation` (decision-gate engine) against a **canonical delegation record**; the assessment validates scope, monetary limit (where relevant), effective window, non-revocation, and that the delegate is a human user (AI delegate ⇒ refused for material family acts).
- **TECH:** The decision gate (`evaluateDecisionGate`) sequences its steps (states `PASSED|FAILED|NOT_REACHED|REQUIRES_HUMAN`) such that delegation assessment is one step; any `FAILED`/`REQUIRES_HUMAN` halts the flow (FC-1 for execution).
- **TECH:** Emergency authority is a distinct assessment (`assessEmergencyAuthority`) with its own evidence requirements — no emergency path exists in the repository today and none is proposed (policy may create one; until then, emergency = FC-1).
- **TECH:** No family table stores delegation state; no family API creates delegations; canonical identity/governance services are the only creators.

### 19.2 Configuration points

- **CFG-DL-1**: which family powers are delegable vs non-delegable (per power, per instrument). `POLICY DECISION REQUIRED (FIR-011)`.
- **CFG-DL-2**: scope taxonomy, limits, expiries, revocation and emergency controls, segregation rules. `POLICY DECISION REQUIRED (FIR-011)`.

### 19.3 Fail-closed behavior

Any execution step requiring a delegation whose scope is not ratified/verifiable → `REQUIRES_HUMAN`/FC-1. A permission grant can never convert non-delegable authority into delegable authority (invariant, enforced by authorization design §26).

## 20. Family Capital architecture

**Canonical owner:** Family Office — non-financial instruction + assessment (future instruction record gated FIR-012/025); **Finance OS — all financial truth** (`capitalRequests` canonical: requestType CAPEX|OPEX|INVESTMENT|FINANCING|RESERVE, amount, currency, expectedIrr/Npv, status DRAFT|SUBMITTED|UNDER_REVIEW|APPROVED|REJECTED|FUNDED, legalEntityId, strategicObjectiveId). Assessment engine: `capital.ts` v `family-capital-1.0.0` (pools, segregation, allocation steps, IPS).

### 20.1 Technical structure

- **TECH (assessment, exists):** `assessCapitalPool` (pool definition completeness — `CAPITAL_POOL_DEFINITION_FIELDS`), `assessSegregationTransfer` + `assertSegregationTransferDocumented` (segregation preconditions `SEGREGATION_PRECONDITIONS`), `assessAllocation` (stepwise against `CAPITAL_ALLOCATION_STEPS`, states incl. `REQUIRES_HUMAN`), `assessInvestmentPolicyStatement` (`IPS_ELEMENTS`), `poolDefinitionCompleteness`. All human-write-asserted; all non-ledger.
- **TECH (instruction, future, gated):** `FamilyCapitalInstruction` — non-financial only: purpose, requesting party, policy/resolution references, target legal entity, engine assessment summary (version + input checksum), Finance request reference (null until submitted), family-side status (non-financial lifecycle). **Forbidden fields (architecture prohibition):** balances, account numbers, commitments, postings, waterfall truth, portfolio duplication (I-02, seven-mandate denial).
- **TECH (hand-off, future, gated):** the instruction adapter submits to the canonical Finance capital request surface; Finance independently applies its own authorization, legal-entity mandate, treasury, tax, compliance, and posting controls; the family record stores the returned Finance reference; family-side status then **mirrors by reference only** (e.g., "Finance request X is in state Y" read from Finance, never written from family).
- **TECH:** Amounts appear in family records **only as the submitted request payload echo** for audit, with classification HIGHLY_RESTRICTED; the amount of record is Finance's.

### 20.2 Configuration points

- **CFG-CP-1**: legal/economic owner of pools; policy/allocation/investment/distribution/liquidity/reporting authorities and thresholds (including approval limits). `POLICY DECISION REQUIRED (FIR-012)`.
- **CFG-CP-2**: Finance hand-off contract (request types used, reference scheme, idempotency, result-reference convention). `POLICY DECISION REQUIRED (FIR-012, FIR-016, FIR-025)`.

### 20.3 Fail-closed behavior

Capital instruction creation/submission before ratification → FC-1. Any attempt to store a balance/posting/balance-like field in a family table → architecture violation (rejected at design review; no such field exists in this spec).

## 21. Family Loan architecture

**Canonical owner:** Family Office — non-financial instruction + assessment (future, gated FIR-013/026); **Finance OS — ledger/treasury/postings; legal/tax owners — contract, receivable/payable, tax treatment**. Assessment engine: `loan.ts` v `family-loan-1.0.0`.

### 21.1 Technical structure

- **TECH (assessment, exists):** `assessLoanDocumentation` + `assertLoanDocumented` (documentation completeness — `LOAN_DISCIPLINE_FIELDS`), `assessLoanEligibility`, `buildRepaymentSchedule` (arithmetic only, no effect), `assertLoanEventSound` (event integrity — `LOAN_EVENT_TYPES`), `summariseLoanPortfolio`, lifecycle transitions validated by `canTransition`/`assertLoanTransition` over `LOAN_TRANSITIONS` with `TERMINAL_LOAN_STATUSES` (CLOSED, REJECTED).
- **TECH (instruction, future, gated):** `FamilyLoanInstruction` — non-financial only: purpose, borrower party, lender legal entity (attribution), terms-source reference (instrument/policy document IDs), jurisdiction reference, approvals (resolution IDs), Finance/legal reference (null until submitted), family-side status. **Forbidden:** any receivable, disbursement, repayment posting, impairment, tax position, interest computation of record (arithmetic in the engine is assessment aid only; the numbers of record are Finance/legal-owned).
- **TECH (hand-off, future, gated):** same unidirectional adapter pattern as capital (KDD-6): submit → Finance/legal owns the rest → family stores references; no bidirectional financial state.

### 21.2 Configuration points

- **CFG-LD-1**: permitted purposes, lender/borrower classes, approval authorities, documentation standards, interest/repayment/default/restructuring terms, tax/accounting/legal treatment, Finance integration contract. `POLICY DECISION REQUIRED (FIR-013)`.
- **CFG-LD-2**: instruction persistence shape and audit profile. `POLICY DECISION REQUIRED (FIR-013, FIR-016, FIR-026)`.

### 21.3 Fail-closed behavior

Loan instruction creation/submission before ratification → FC-1. A family loan table can never become a shadow loan book (I-02; enforcement by field-level prohibition in §49 seven-mandate).

## 22. Document/vault architecture

**Canonical owner:** Platform `documents` (content of record) + retention/legal-hold; Family Office `family_vault_items` (metadata/index).

**Existing vault columns (verified):** `id`, `tenantId`, `vaultType` (FAMILY|MEMBER|TRUST|EMERGENCY|CREDENTIAL|LEGACY), `title`, `description`, `documentId` (text, **no FK**), `ownerMemberId` (FK family_members, nullable), `custodianRole` (notNull), `accessPolicyId` (text), `sealedUntil`, `successionInstruction`, `classification` (default HIGHLY_RESTRICTED), `createdAt`.

### 22.1 Technical structure

- **TECH:** The vault is an **index/metadata structure**: it points at canonical documents, names a custodian role, references an access policy, and carries seal/succession metadata. It stores no content and is not a secrets system (contract §11, FIR-024 position: leave untouched pending ownership policy).
- **TECH:** Document linkage (future, gated FIR-024): `documentId` gains referential integrity (FK or enforced validation + audit) only after the linkage policy ratifies; sealed access (`sealedUntil`) release rules, custodian authority, and succession instruction semantics are all policy.
- **TECH:** Access flow (design): `family:vault.read` (existing) + clearance + (future ratified) sealed/vault-type rules → every access audited (object, actor, policy, outcome).
- **TECH:** Retention and legal hold apply through canonical `retentionPolicies`/holds on the referenced documents; the vault item itself is metadata and follows document retention.

### 22.2 Configuration points

- **CFG-VL-1**: vault custody model (custodian roles and their authority per vault type). `POLICY DECISION REQUIRED (FIR-024)`.
- **CFG-VL-2**: sealed-record release rules, succession instruction effect, EMERGENCY vault access. `POLICY DECISION REQUIRED (FIR-024, FIR-015)`.
- **CFG-VL-3**: retention/access matrix for sealed/retained family records. `POLICY DECISION REQUIRED (FIR-015)`.

### 22.3 Fail-closed behavior

Vault writes, seal/unseal, succession actions, and any access beyond current read rules → FC-1 until ratified. No vault extension changes existing schema (FIR-024 blocks schema impact).

## 23. Decision architecture

**Canonical owner:** Canonical governance — `resolutions` (bodyId, reference, title, category RESERVED_MATTER|CAPITAL|POLICY|APPOINTMENT|TAX|RISK|OTHER, summary, rationale, `dataBasis`, `authorityPolicyId`, consequences, `linkedObjectType/Id`, proposedBy, `requiredMajority` default SIMPLE, `quorumMet`, votes, voting window, tabled/decided metadata), `resolutionVotes` (vote FOR|AGAINST|ABSTAIN|RECUSED, `conflictDeclared`), `approvals` (maker/checker), decision activation states. Assessment: `decision-gate.ts` v `family-decision-gate-1.0.0`.

### 23.1 Technical structure

- **TECH:** The Family Institution has **no decision engine of its own**. Every decision-producing act (constitution amendment, mandate change, beneficiary verification, instruction approval, policy ratification) is a canonical resolution lifecycle: DRAFT → TABLED → VOTED → APPROVED/REJECTED/… (`decisionStatusEnum`) → activation (`decisionActivationStateEnum`).
- **TECH:** Before any decision-dependent execution, the decision gate runs `evaluateDecisionGate` over `DECISION_GATE_STEPS` (each step `PASSED|FAILED|NOT_REACHED|REQUIRES_HUMAN`); the gate consumes: decision reference + status, authority policy, quorum evidence, delegation (if acting by delegation), emergency state (if claimed), jurisdiction applicability, policy-version references.
- **TECH:** `assessEmergencyAuthority` exists as an assessment shape; **no emergency authority is defined** (CFG-EM-1). Until ratified, any emergency claim fails the gate (`REQUIRES_HUMAN` → FC-1).
- **TECH:** `linkedObjectType/Id` on resolutions is the canonical binding between a resolution and the family object it authorizes (member verification, beneficiary record, instruction, amendment) — the mechanism by which "authority proof" (FIR-023) will be attached to every effect-bearing record.

### 23.2 Configuration points

- **CFG-GV-1**: decision categories used by family workflows, authority policies per category (`authorityPolicyId`), quorum/majority per body (canonical fields, values policy-gated). `POLICY DECISION REQUIRED (FIR-006, FIR-008)`.
- **CFG-EM-1**: emergency authority (existence, holders, scope, evidence, sunset). `POLICY DECISION REQUIRED (FIR-007)`.

### 23.3 Fail-closed behavior

Any execution step whose required decision is missing, unapproved, unactivated, or gate-failed → FC-1 with the failing step recorded. No decision may be "silently satisfied" by an AI, a default, or an engine recommendation.

## 24. Policy-decision architecture

**Canonical owner:** Family Office policy-decision mechanism — `policy-decisions.ts` v `family-policy-decision-1.0.0` (raises/resolves `PolicyDecisionRequirement` records; `STANDING_POLICY_DECISIONS`; `policyDecisionRegister`, `openRequirements`, `summariseRegister`, `findInventedPolicies`) + canonical governance for ratification acts.

### 24.1 Technical structure

- **TECH:** The mechanism is the **canonical representation of "absence"**: whenever a workflow hits an unresolved policy, it `raisePolicyDecisionRequirement`s a record (domain, decision reference, rationale, authority required, raised-by, effective context) instead of guessing. `findInventedPolicies` detects values being treated as policy without a ratified record — an anti-authority-laundering control.
- **TECH:** Resolution path: a `PolicyDecisionRequirement` is closed only by `resolvePolicyDecision` with a **ratification reference** (resolution ID / policy record ID / instrument reference + authority + effective date). AI cannot resolve; humans with the recorded authority can.
- **TECH:** The FIR register (Phase 2.5) is the **institution-level** policy-decision register; the mechanism is the **operational** one. Future persistence of operational records (gated, FIR-027) links each record to canonical resolutions/documents; no new registry is created unless the canonical governance owner approves one (register position).
- **TECH:** `STANDING_POLICY_DECISIONS` (existing) encode standing unratified items the engines assume; this spec treats them as inputs to the ratification backlog, never as values.

### 24.2 Configuration points

- **CFG-PD-1**: register operation — submission, assignment to accountable owners/bodies, evidence requirements, expiry/supersession, publication to implementers. `POLICY DECISION REQUIRED (FIR-027)`.
- **CFG-PD-2**: standing-decision treatment (each entry's ratification or formal scoping-out). Per-FIR.

### 24.3 Fail-closed behavior

An unresolved requirement blocks exactly the behavior it names (FC-1); the register itself is readable (its existence is transparency, not authority). `POLICY DECISION REQUIRED` can never be resolved by code, by AI, or by an implementer's convenience (I-12, FIR-027).

---
# Part V — Cross-cutting technical architecture

## 25. Lifecycle/state-machine architecture

### 25.1 The standard governed lifecycle (technical, value-neutral)

All future family records (institution scope, member lifecycle state, constitution version, body membership, eligibility determination, capital/loan instruction) follow ONE standard lifecycle contract (contract §16 — not a new enum family):

```text
DRAFT → EVIDENCE_PENDING → UNDER_REVIEW → GOVERNED_DECISION → EFFECTIVE
   │          │                   │                │
   │          │                   │                └→ DECLINED
   │          │                   └→ (return to EVIDENCE_PENDING)
   │          └→ (return to DRAFT)
   └→ WITHDRAWN
EFFECTIVE → SUSPENDED → EFFECTIVE | SUPERSEDED | ARCHIVED
EFFECTIVE → SUPERSEDED → ARCHIVED
```

**TECH:** Each conceptual state maps to canonical enums already in the repository — no new lifecycle enums:

| Conceptual state | Canonical carrier |
|---|---|
| DRAFT / created | `lifecycleStatusEnum.CREATED` / `decisionStatusEnum.DRAFT` |
| EVIDENCE_PENDING / DOCUMENTED | `verificationStatusEnum.DOCUMENTED` |
| UNDER_REVIEW | `verificationStatusEnum.UNVERIFIED`→`DOCUMENTED` + `decisionStatusEnum.TABLED` |
| VERIFIED | `verificationStatusEnum.VERIFIED` |
| GOVERNED_DECISION | `decisionStatusEnum` (VOTED/APPROVED/REJECTED/DEFERRED/DEADLOCKED) |
| EFFECTIVE / ACTIVE | `decisionActivationStateEnum.EFFECTIVE|ACTIVATED` / `lifecycleStatusEnum.ACTIVE|VERIFIED` |
| SUSPENDED | `lifecycleStatusEnum.SUSPENDED` / activation SUSPENDED |
| SUPERSEDED | `lifecycleStatusEnum.SUPERSEDED` semantics / activation SUPERSEDED / `documents.supersededById` |
| DECLINED / REVOKED / ARCHIVED | `decisionStatusEnum.REJECTED|WITHDRAWN` / `lifecycleStatusEnum.REVOKED|DEACTIVATED|ARCHIVED` |

### 25.2 Transition guards (normative, technical)

A transition is permitted **only** when ALL hold (missing any ⇒ FC-1):

1. **Human actor** — engine assertion (`assert*WriteIsHuman`) and `guarded()` principal.
2. **Authority context** — the actor's authority for THIS transition (permission + role + (where required) resolution/delegation reference) is present and valid.
3. **Evidence** — the transition's evidence requirement (per the ratified transition profile, CFG-*) is met with document references + checksums.
4. **Policy gate** — every FIR-gated value the transition depends on is ratified (CFG-* populated by ratified records).
5. **Tenant + classification** — scope and clearance pass.
6. **Audit + event** — the mutation, audit row, and event(s) commit in ONE transaction (I-11); the audit row records prior state, new state, authority, evidence, policy version, trace.
7. **No financial/legal side effect** unless the Finance/legally-owned step is independently performed by its owner (I-02, I-06).

### 25.3 Effect-bearing vs inert states

**TECH:** A state is *effect-bearing* only if a ratified policy says it has effects. While FIR-020/003/009/etc. are unratified, **all states are inert for effect purposes**: the registry may display states; no downstream workflow may consume them as authority (FC-1). This is the mechanism by which "storing data" never becomes "operating policy".

## 26. Authorization architecture

### 26.1 Layered authorization (all existing, all reused — KDD-8)

```text
Request
  → authenticate (session → Principal {userId, tenantId, roles, classification, ip, ua})
  → guarded() (src/lib/api.ts): rate limit, permission check via can(),
      tenant scope, clearance filter, step-up/MFA hooks, audit hooks,
      idempotency (idempotencyRecords)
  → domain authority check: role/permission sufficient? + (write) HUMAN actor?
  → policy gate: required FIR/CFG values ratified? (else POLICY_DECISION_REQUIRED)
  → decision gate: resolution/delegation/emergency assessment (if execution)
  → engine assessment (deterministic; versioned)
  → mutation + audit + event (single transaction)
```

### 26.2 Actor classes (normative)

| Actor | May read | May write | May decide | May execute | May delegate-receive |
|---|---|---|---|---|---|
| HUMAN user (granted) | per permission + clearance | per permission + policy gate + human assertions | via canonical governance (seat/vote) | only with decision/delegation proof | via canonical `delegations` (human→human) |
| SERVICE (bounded) | per service grants | only pre-approved service operations | never | only its own scoped operations | never |
| AI (Noelia via HIVE) | per AI grants, classified | **no family writes** (engine assertions deny) | never (NOELIA_MAY_NOT) | never | never (human→AI material delegation prohibited) |

### 26.3 Separation of duties (technical structure)

SoD is expressed as **distinct authority slots** that a single principal may not simultaneously fill for one act (values — which roles fill which slots — are CFG-gated, FIR-023):

- **proposer ≠ verifier** (membership/evidence: the person proposing a relationship/record is not the verifier)
- **verifier ≠ decider** (evidence verifier is not the vote/approval authority)
- **requester ≠ approver** (capital/loan: instruction requester is not the approver; Finance's maker/checker is independent of family's)
- **delegator ≠ delegate** (canonical: `fromUserId` ≠ `toUserId`, enforced by `delegation.ts`)
- **AI ≠ any slot** (every slot requires a human or bounded service principal)

**TECH:** Enforcement point is the decision gate + write assertions; the draft permission matrix (§27) assigns slots, and Phase 3D must implement slot-conflict checks before any write API exists.

### 26.4 Authority proof model

Every effect-bearing record carries (or will carry) an **authority block**: `authorityContext` in the event/audit (existing field), plus on the record: resolution reference (`approvedByResolutionId` pattern), delegation reference (where acting by delegation), policy record reference (which ratified policy authorized it), engine version + input checksum (which assessment ran). Missing authority block = record is inert (FC-1) and its write is refused at the API layer.

## 27. Permission architecture (DRAFT)

**Status:** every row below marked `PROPOSED — NOT AUTHORIZED` is a **design candidate only**. None is added to `PERMISSIONS` in `src/lib/constants.ts`, to any role, or to any parity list by this phase. The five existing permissions are unchanged.

### 27.1 Existing permissions (unchanged, normative)

| Permission | Description (constants.ts) | Risk class | Notes |
|---|---|---|---|
| `family:member.read` | Read the family registry | normal | Read path, clearance-filtered |
| `family:member.manage` | Manage family lineage records | normal (currently) | Capability only; Phase 3D may re-classify under FIR-023 |
| `family:beneficiary.read` | Read beneficiary entitlements | normal | Read path |
| `family:beneficiary.manage` | Manage beneficiary entitlements | **HIGH_RISK** | Capability ≠ trustee authority (FIR-009) |
| `family:vault.read` | Read family vault index | normal | Read path |

Role: `FAMILY_OFFICE_PRINCIPAL` (HIGHLY_RESTRICTED classification) holds the five.

### 27.2 Draft permission matrix (all `PROPOSED — NOT AUTHORIZED` unless marked EXISTING)

Fields per the authorization: actor, action, object, scope, tenant, legal entity, classification, approval, MFA/step-up, separation of duties, audit.

| Permission (draft) | Actor | Action | Object | Scope | Tenant | Legal entity | Classification | Approval | MFA/step-up | SoD | Audit | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `family:member.read` | EXISTING | read | family member registry | tenant + clearance | enforcing | n/a | HIGHLY_RESTRICTED rows filtered | role grant | step-up if row HIGHLY_RESTRICTED and role requires | n/a | read access event | EXISTING (unchanged) |
| `family:member.manage` | EXISTING | manage | family member registry | tenant | enforcing | n/a | HIGHLY_RESTRICTED | role grant | step-up | verifier≠proposer (when ratified) | mutation + audit | EXISTING (unchanged) |
| `family:beneficiary.read` | EXISTING | read | beneficiary registry | tenant + clearance | enforcing | trust-scoped | HIGHLY_RESTRICTED filtered | role grant | step-up | n/a | read access event | EXISTING (unchanged) |
| `family:beneficiary.manage` | EXISTING | manage | beneficiary registry | tenant | enforcing | trust-scoped | HIGHLY_RESTRICTED | role grant | **HIGH_RISK step-up** | verifier≠decider; trustee proof separate | mutation + audit + resolution ref | EXISTING (unchanged) |
| `family:vault.read` | EXISTING | read | vault index | tenant + clearance | enforcing | n/a | HIGHLY_RESTRICTED filtered | role grant | step-up; sealed rules (CFG-VL) pending | n/a | access event | EXISTING (unchanged) |
| `family:institution.read` | human, granted | read | institution scope reference | tenant | enforcing | optional | per record | role grant (FIR-023) | — | n/a | read access event | PROPOSED — NOT AUTHORIZED (FIR-001, FIR-023) |
| `family:member.propose` | human, granted | propose | membership/relationship change requests | tenant | enforcing | n/a | HIGHLY_RESTRICTED | role grant | step-up | proposer ≠ verifier | proposal + audit | PROPOSED — NOT AUTHORIZED (FIR-003/020/023) |
| `family:lineage.verify` | human, granted (verifier role) | verify/correct | lineage edges + evidence | tenant | enforcing | n/a | HIGHLY_RESTRICTED | role grant + authority matrix (CFG-LN-2) | step-up (high sensitivity) | verifier ≠ proposer, ≠ decider | verification + evidence + audit | PROPOSED — NOT AUTHORIZED (FIR-004/023) |
| `family:evidence.submit` | human, granted | submit | evidence documents (bindings) | tenant | enforcing | n/a | per document | role grant | step-up if sealed/sensitive | submitter ≠ verifier | submission + audit | PROPOSED — NOT AUTHORIZED (FIR-004/015/016) |
| `family:eligibility.assess` | human, granted | assess/read | eligibility determinations | tenant | enforcing | n/a | HIGHLY_RESTRICTED | role grant | step-up | assessor ≠ conferrer (no conferment exists) | assessment + audit | PROPOSED — NOT AUTHORIZED (FIR-009/023) |
| `family:beneficiary.verify` | human, granted (trustee-authority holder) | verify | beneficiary records | tenant | enforcing | **trust-scoped** | HIGHLY_RESTRICTED | role grant + trustee-authority proof (CFG-BF-3) | step-up (HIGH_RISK class) | verifier ≠ proposer; ≠ decider | verification + trustee proof + resolution + audit | PROPOSED — NOT AUTHORIZED (FIR-009/023) |
| `family:constitution.read` | human, granted | read | constitution documents/projections | tenant | enforcing | n/a | per record | role grant | — | n/a | read access event | PROPOSED — NOT AUTHORIZED (FIR-022/023) |
| `family:constitution.propose` | human, granted (proposer authority CFG-CON-1) | propose | amendment proposals | tenant | enforcing | n/a | per record | role grant + proposer authority | step-up | proposer ≠ ratifier | proposal + audit | PROPOSED — NOT AUTHORIZED (FIR-006/023) |
| `family:forum.read` | human, granted | read | family bodies/mandates | tenant | enforcing | optional | per record | role grant | — | n/a | read access event | PROPOSED — NOT AUTHORIZED (FIR-021/023) |
| `family:forum.manage` | human, granted (body authority CFG-BD-1) | manage | body memberships/mandates | tenant | enforcing | optional | per record | role grant + authority matrix | step-up | appointer ≠ appointee (instrument-gated) | appointment + audit | PROPOSED — NOT AUTHORIZED (FIR-008/021/023) |
| `family:capital.request` | human, granted | create/submit | capital instructions | tenant | enforcing | target entity | HIGHLY_RESTRICTED | role grant + authority (CFG-CP-1) | step-up (HIGH_RISK class) | requester ≠ approver; Finance approval independent | instruction + audit + Finance ref | PROPOSED — NOT AUTHORIZED (FIR-012/023) |
| `family:loan.request` | human, granted | create/submit | loan instructions | tenant | enforcing | lender entity | HIGHLY_RESTRICTED | role grant + authority (CFG-LD-1) | step-up (HIGH_RISK class) | requester ≠ approver | instruction + audit + refs | PROPOSED — NOT AUTHORIZED (FIR-013/023) |
| `family:policydecision.read` | human, granted | read | policy-decision register | tenant | enforcing | n/a | INTERNAL+ | role grant | — | n/a | read access event | PROPOSED — NOT AUTHORIZED (FIR-027/023) |

### 27.3 Permission invariants (normative)

1. No family permission grants trustee, court, legal-entity, or constitutional authority (FIR-023 position; denylist).
2. No family permission implies Finance posting/execution (FIR-018 boundary).
3. No AI grant may confer human/legal authority (FIR-017 boundary).
4. Any create/verify/manage right over lineage, eligibility, constitution, capital, or loans must be HIGH_RISK-classed with step-up (design rule; ratification under FIR-023).
5. No broad `family:*` grants; object/action-scoped only.

## 28. Audit architecture

**Canonical owner:** Platform — `audit_log` (append-only, hash-chained), `enterprise_events` (hash-chained, `traceId`, `authorityContext`, `policyVersion`), `audit_chain_heads`, `ai_decisions`. Writer: `publishEventTx(tx, EventInput)` — domain mutation + audit + event(s) in ONE transaction (roll back together).

### 28.1 Event envelope (existing `EventInput`, reused)

`type`, `source`, `domain`, `operation`, `destinationDomain`, `tenantId`, `legalEntityId`, `subjectType`, `subjectId`, `actorUserId`, `actorType (HUMAN|SERVICE|AI)`, `classification`, `payload`, `traceId`, `correlationId`, `causationId`, `authorityContext`, `policyVersion`, …

### 28.2 Family event catalogue (design; names are technical, not policy)

| Event type | Emitted on | Required payload elements | Policy dependency |
|---|---|---|---|
| `FAMILY_MEMBER_PROPOSED` | membership proposal | member ref, relationship fields, proposer, evidence refs | FIR-003/020 (gated) |
| `FAMILY_MEMBER_VERIFIED` | verification | prior state, evidence docs, verifier, method, jurisdiction ref | FIR-004 (gated) |
| `FAMILY_MEMBER_DISPUTED` / `_DISPUTE_RESOLVED` | dispute lifecycle | dispute basis, evidence, resolver, resolution ref | FIR-004/020 (gated) |
| `FAMILY_LINEAGE_CORRECTED` | edge correction | prior assertion, new assertion, evidence, correction authority, effective dates | FIR-005 (gated) |
| `FAMILY_EVIDENCE_LINKED` | evidence binding | member/edge ref, document IDs + checksums, verifier | FIR-004/016 (gated) |
| `FAMILY_CONSTITUTION_PROPOSED` | amendment proposal | document ref, version, proposer, electorate snapshot ref | FIR-006 (gated) |
| `FAMILY_CONSTITUTION_RATIFIED` | ratification | resolution ref, quorum evidence, threshold, effective period, supremacy result | FIR-006/007 (gated) |
| `FAMILY_CONSTITUTION_ACTIVATED/SUSPENDED/SUPERSEDED` | activation lifecycle | prior version, authority, effective dates | FIR-007 (gated) |
| `FAMILY_BODY_MEMBER_APPOINTED/REMOVED` | body membership | body ref, seat role, instrument ref, term, authority | FIR-008/021 (gated) |
| `FAMILY_ELIGIBILITY_DETERMINED` | assessment persistence | member, domain, result, rationale, evidence, engine version + checksum | FIR-009 (gated) |
| `FAMILY_BENEFICIARY_PROPOSED/VERIFIED/CHANGED` | beneficiary lifecycle | record ref, trust ref, class, effective period, trustee proof ref, resolution ref | FIR-009/010 (gated) |
| `FAMILY_CAPITAL_INSTRUCTION_CREATED/SUBMITTED` | capital instruction | instruction ref, resolution refs, policy refs, target entity, Finance request ref (on submit), amount echo (HIGHLY_RESTRICTED) | FIR-012/025 (gated) |
| `FAMILY_LOAN_INSTRUCTION_CREATED/SUBMITTED` | loan instruction | instruction ref, terms-source docs, approvals, lender entity, Finance/legal refs | FIR-013/026 (gated) |
| `FAMILY_VAULT_ACCESS` / `_SEALED` / `_UNSEALED` / `_SUCCESSION` | vault actions | item ref, document ref, actor, policy, outcome | FIR-015/024 (gated) |
| `POLICY_DECISION_RAISED` / `_RESOLVED` | policy-decision lifecycle | requirement ref, FIR ref, authority, resolution/policy/instrument ref, effective date | FIR-027 (gated) |
| `FAMILY_POLICY_GATE_DENIED` | **every FC-1 denial** | denial code, FIR ref(s), actor, object, trace | none (emitted today's design forward) |

**TECH:** Denial auditability (KDD-7): a fail-closed denial is an auditable event — the system must show *why* nothing happened. `FAMILY_POLICY_GATE_DENIED` is the only event in this catalogue with no policy dependency (it records the absence of policy).

### 28.3 Audit invariants

- I-14: append-only, hash-chained; no update/delete path (platform-enforced).
- Every material mutation ⇒ ≥1 audit row + ≥1 event in the same transaction (I-11).
- `authorityContext` + `policyVersion` are mandatory on all gated events (existing envelope fields).
- AI involvement: any AI-assisted step additionally records in `ai_decisions` (agent NOELIA, runtime HIVE, `policyDecision`, `deniedScopes`, human `reviewedBy`/`reviewDecision` for material outputs).

## 29. Event architecture

**Canonical owner:** Platform `enterprise_events` (hash-chained; `traceId`/`correlationId`/`causationId`; `destinationDomain` for cross-domain routing; `authorityContext`; `policyVersion`).

### 29.1 Eventing rules

1. **One transaction, all effects (I-11):** `publishEventTx` inside the mutation transaction; decision-producing mutations emit both the act and the consequence (e.g., VOTE_CAST + DECIDED) atomically.
2. **Domain tagging:** family events use `domain: "family"`, `source: "family-institution"`, `operation: <operation>`, `destinationDomain: "finance" | "governance" | "identity" | null`.
3. **Cross-domain events are reference events:** `FAMILY_CAPITAL_INSTRUCTION_SUBMITTED` with `destinationDomain: "finance"` carries the family instruction reference + Finance request reference; Finance's own events remain Finance-owned. No event carries financial state into the family domain (I-02).
4. **Trace discipline:** trace/correlation/causation IDs flow from the API layer (`guarded()` meta) through engine and audit; every family event is traceable to the originating request and (for consequences) to the causing event.
5. **No family-owned event log (I-13):** consumers (dashboards, assurance) read the canonical event store.

### 29.2 Consumption

- **Finance adapter** subscribes (or is invoked) for hand-off submissions; it does not consume family events for financial truth.
- **Observability/assurance** (§38) reads events for audit-completeness checks.
- **Noelia** may read events within its governed scope for advisory detection; event reading grants no authority.

## 30. Finance OS integration architecture

**Canonical owner:** Finance OS — `capitalRequests`, `ledgerAccounts`, `journalEntries/Lines`, `treasuryPositions`, `waterfallConfigs/Tiers/Runs/RunLines`, `taxStrategies/Assessments`, `financialPeriods` + Finance services/contracts (governance-authorization patterns in Finance's own domain).

### 30.1 The integration contract (normative, KDD-6)

```text
Family Institution Governance
   (resolution + authority + policy gate passed)
        ↓  (1) instruction created (family-owned, non-financial)
FamilyCapitalInstruction / FamilyLoanInstruction
        ↓  (2) adapter submits to canonical Finance request surface
Finance OS (capitalRequests / loan-funding flow)
        ↓  (3) Finance applies ITS OWN controls:
            authorization · legal-entity mandate · treasury · tax ·
            compliance · posting · waterfall
Finance OS — CANONICAL FINANCIAL TRUTH (ledger, balances, postings)
        ↑  (4) family record stores the Finance request reference (write-once)
        ↑  (5) family UI/API displays Finance status BY REFERENCE (read)
```

### 30.2 Rules (all normative)

- **F-1 Unidirectional:** family → Finance is instruction only; Finance → family is reference/read only. No family write alters a Finance record; no Finance write alters a family record (the reference is set once at submission).
- **F-2 No shadow:** no family table may contain: balances, account numbers, postings, journal lines, commitments of record, waterfall allocation truth, portfolio duplication, receivable/payable state, or financial lineage (I-02, denylist).
- **F-3 Independent controls:** a family-approved instruction is **not** a Finance approval; Finance runs its own authorization (maker/checker), mandate, treasury, tax, compliance, posting gates.
- **F-4 Reference integrity:** the Finance request reference is immutable on the family instruction; corrections re-submit (new instruction + new request), never mutate the reference.
- **F-5 Idempotency:** submissions carry an idempotency key recorded in canonical `idempotencyRecords`; retries cannot double-submit.
- **F-6 Classification:** instruction amounts and Finance references are HIGHLY_RESTRICTED; reads require the capital/loan read permission (when ratified) + step-up.
- **F-7 Distinct lineage:** genealogical lineage (descent) and financial lineage (provenance of financial records) remain separate identifiers, separate tables, separate domains (I-09).

### 30.3 Policy values required

- **POLICY:** legal/economic owner and authority matrices (FIR-012, FIR-013); hand-off contract details (request types, reference scheme, settlement of result states) (FIR-012/013/016/025/026).

### 30.4 Fail-closed behavior

No instruction table, no adapter, no endpoint exists until the FIRs ratify; until then, any capital/loan workflow terminates at the policy gate (FC-1). The architecture's failure mode is **absence**, not default behavior.

## 31. Noelia/HIVE integration architecture

**Canonical owner:** Governed Intelligence Layer — HIVE (governed AI runtime), Noelia (single governed BEYU AI identity/interface), `ai_decisions` (attributable output record), `noelia_action_requests` (human-handoff records), family `alignment.ts` v `noelia-alignment-1.0.0` (`NOELIA_MAY` / `NOELIA_MAY_NOT` / `assertWithinNoeliaBoundary`).

### 31.1 Permitted interfaces (advisory only)

| Interface | Technical shape | Boundary |
|---|---|---|
| Advisory analysis | Noelia reads family data within governed scope → `ai_decisions` record (inputs, sources, model/prompt versions, `policyDecision`, `deniedScopes`) | Read-only; output stored, attributable |
| Decision support | Human-initiated question about a pending decision/assessment → structured recommendation + explanation attached to the workflow record | Recommendation ≠ decision; gate never consumes AI output as authority |
| Risk detection | Governed scheduled/on-demand scans over family records/events → anomaly/risk alerts to authorized humans | Alert ≠ action; no automatic remediation |
| Policy evaluation | Noelia checks proposed actions against ratified policy records → conflict/explanation report | Evaluated policies must exist (ratified); missing policy ⇒ report says `POLICY DECISION REQUIRED`, never a default (FIR-017: no silent resolution) |
| Explanation | Human-readable explanation of an engine assessment (version + inputs) attached to records | Deterministic engine is the authority; Noelia explains, never decides |
| Recommendation | Ranked options with rationale for a human decision-maker | Stored as advisory; human votes/decides via canonical governance |
| Human approval handoff | `noelia_action_requests`: AI-proposed step → HUMAN review/approval → canonical path executes | The canonical path (guarded write) is the executor; Noelia is the requester at most |
| Audit | Every material interaction in `ai_decisions` + audit/event with `actorType: AI` where applicable | I-14; `deniedScopes` records refusals |

### 31.2 Prohibitions (normative, `POLICY_DEFINED` via FIR-017 boundary)

Noelia/HIVE must not: create constitutional authority; determine beneficiaries; appoint or remove trustees; amend the Family Constitution or trust instruments; override trustees/Family Council/legal authority; approve or disburse material capital; bypass RBAC/ABAC/audit; hide decisions; create legal authority; **invent policy**; **silently resolve `POLICY DECISION REQUIRED`**. Technical enforcement: `assertWithinNoeliaBoundary` (refuses operations outside `NOELIA_MAY`), `*WriteIsHuman` assertions in every family engine, AI actor refusal in the decision gate, AI-delegate prohibition in delegation assessment.

### 31.3 Failure behavior

An AI call that would touch a `NOELIA_MAY_NOT` operation ⇒ boundary assertion fails ⇒ request denied ⇒ `ai_decisions` with `policyDecision`/`deniedScopes` populated ⇒ no state change. AI unavailability ⇒ workflows proceed without AI (AI is never a prerequisite for a human-authorized act).

# Part VI — Interface architecture

## 32. API contract architecture (DRAFT)

**Status:** every endpoint below is **DESIGN ONLY — NOT IMPLEMENTATION AUTHORIZED**. No production route is created. All would live under `/api/v1/family/*`, use `guarded()`, are tenant-scoped, human-mutation-only, idempotency-recorded, and emit the §28 audit events. Authorization decision point = the `guarded()` permission + the domain policy gate. Failure behavior = §37 error model; every policy-gated failure returns `POLICY_DECISION_REQUIRED` with the FIR reference(s) and audits `FAMILY_POLICY_GATE_DENIED`.

### 32.1 Read surface

| # | Endpoint | Purpose | Request model | Response model | Authorization decision point | Tenant scope | Entity scope | Audit event | Failure behavior | Policy dependencies |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | `GET /api/v1/family/members` | Registry list (paged) | `page`, `branch?`, `verificationStatus?` | member rows + party display (clearance-filtered) | `family:member.read` + clearance | enforcing | — | read access | 403/401 per guard; classification filter | none (read) |
| R2 | `GET /api/v1/family/lineage` | Descent graph (bounded, validated in-engine) | `memberId?`, `depth?` (≤25) | graph + determinations + evidence refs | `family:member.read` + clearance | enforcing | member-scoped | read access | graph errors → 409 `LINEAGE_GRAPH_INVALID` | none (assess-only) |
| R3 | `GET /api/v1/family/eligibility/{memberId}` | Per-domain determinations (assessment on demand or ratified persistence) | `domain?` | determinations + rationale + evidence refs + engine version | `family:eligibility.assess` (draft) | enforcing | member-scoped | `FAMILY_ELIGIBILITY_DETERMINED` | FC-1 if effect-claimed | FIR-009 (values) |
| R4 | `GET /api/v1/family/beneficiaries` | Registry list per trust | `trustEntityId?`, `class?` | beneficiary rows (clearance-filtered) | `family:beneficiary.read` + clearance | enforcing | trust-scoped | read access | 403/401 | none (read) |
| R5 | `GET /api/v1/family/constitution` | Constitution versions + in-force state | `version?` | documents refs, versions, activation state, supremacy results | `family:constitution.read` (draft) | enforcing | — | read access | FC-1 if in-force state unratified | FIR-006/007/022 |
| R6 | `GET /api/v1/family/forums` | Bodies, mandates, memberships (canonical projection) | `bodyType?` | body rows + member seats + mandate assessments | `family:forum.read` (draft) | enforcing | optional entity | read access | 403/401 | FIR-008/021 (mandate values) |
| R7 | `GET /api/v1/family/capital/instructions` | Instruction list (non-financial; Finance status by reference) | `status?` | instructions + Finance refs + Finance status (read from Finance) | `family:capital.request` (draft, read use) + step-up | enforcing | target-entity-scoped | read access | FC-1 pre-ratification | FIR-012/025 |
| R8 | `GET /api/v1/family/loans/instructions` | Instruction list (non-financial; Finance/legal refs) | `status?` | instructions + refs | `family:loan.request` (draft, read use) + step-up | enforcing | lender-entity-scoped | read access | FC-1 pre-ratification | FIR-013/026 |
| R9 | `GET /api/v1/family/vault` | Vault index (metadata) | `vaultType?` | vault items + document refs (no content) | `family:vault.read` + clearance | enforcing | — | `FAMILY_VAULT_ACCESS` | sealed items denied until CFG-VL-2 | FIR-015/024 (sealed rules) |
| R10 | `GET /api/v1/family/policy-decisions` | Open policy-decision register (transparency) | `domain?`, `status?` | requirements (FIR refs, authority, raised-by) | `family:policydecision.read` (draft) | enforcing | — | read access | 403/401 | FIR-027 (operation) |
| R11 | `GET /api/v1/family/institution` | Institution scope reference (default: tenant scope) | — | scope descriptor (tenant / institution record if ratified) | `family:institution.read` (draft) | enforcing | — | read access | FC-1 if institution record required by policy but absent | FIR-001 |

### 32.2 Mutation surface

| # | Endpoint | Purpose | Request model | Response model | Authorization decision point | Tenant scope | Entity scope | Audit event | Failure behavior | Policy dependencies |
|---|---|---|---|---|---|---|---|---|---|---|
| W1 | `POST /api/v1/family/members/proposals` | Membership/relationship proposal | party ref, line/branch/generation, relationship, evidence doc refs, justification | proposal ref + status | `family:member.propose` (draft) + human + SoD(proposer≠verifier) | enforcing | — | `FAMILY_MEMBER_PROPOSED` | 409 `DUPLICATE_IDENTITY_DENIED`; FC-1 (FIR-002/003/020) | FIR-002/003/020 |
| W2 | `POST /api/v1/family/members/{id}/verification` | Verify/dispute/correct a member record | action (VERIFY|DISPUTE|CORRECT), evidence doc refs, method, jurisdiction ref, rationale | new state + authority block | `family:lineage.verify` (draft) + authority matrix (CFG-LN-2) + SoD(verifier≠proposer) | enforcing | — | `FAMILY_MEMBER_VERIFIED/DISPUTED/LINEAGE_CORRECTED` | FC-1 (FIR-004/005/020); evidence insufficiency → 409 `EVIDENCE_INSUFFICIENT` | FIR-004/005/020 |
| W3 | `POST /api/v1/family/lineage/evidence` | Bind evidence to a descent edge | edge (member/parent), document IDs, claim, verifier ref | binding ref | `family:evidence.submit` (draft) + human + SoD(submitter≠verifier) | enforcing | — | `FAMILY_EVIDENCE_LINKED` | FC-1 (FIR-004/016); checksum mismatch → 409 | FIR-004/016 |
| W4 | `POST /api/v1/family/beneficiaries/proposals` | Beneficiary proposal (registry entry, non-entitlement) | member ref, trust entity ref, class, effective period, conditions, evidence refs, trustee-authority proof ref | proposal ref | `family:beneficiary.manage` (EXISTING, HIGH_RISK) + step-up + SoD + trustee proof (CFG-BF-3) | enforcing | trust-scoped | `FAMILY_BENEFICIARY_PROPOSED` | FC-1 (FIR-009/010); overlap conflict per CFG-BF-2 → 409 | FIR-009/010 |
| W5 | `POST /api/v1/family/constitution/amendments/proposals` | Amendment proposal (document + resolution draft) | provision/domain, new text doc ref, rationale, electorate snapshot ref, quorum/threshold inputs (from CFG-CON-*) | proposal ref + staged assessment | `family:constitution.propose` (draft) + proposer authority (CFG-CON-1) | enforcing | — | `FAMILY_CONSTITUTION_PROPOSED` | supremacy conflict → 409 `SUPERIOR_INSTRUMENT_CONFLICT`; FC-1 (FIR-006/007) | FIR-006/007/022 |
| W6 | `POST /api/v1/family/forums/memberships` | Body appointment/removal (canonical governance act) | body ref, member ref, seat role, instrument doc ref, term, authority ref | membership ref + governance reference | `family:forum.manage` (draft) + authority matrix (CFG-BD-2) + SoD | enforcing | optional entity | `FAMILY_BODY_MEMBER_APPOINTED/REMOVED` | trustee-reserved conflict → 409; FC-1 (FIR-008/021) | FIR-008/021 |
| W7 | `POST /api/v1/family/capital/instructions` | Create capital instruction (non-financial) | purpose, requester, policy/resolution refs, target entity, amount echo (submission payload), assessment summary (engine version + checksum) | instruction ref | `family:capital.request` (draft) + authority (CFG-CP-1) + SoD(requester≠approver) | enforcing | target-entity-scoped | `FAMILY_CAPITAL_INSTRUCTION_CREATED` | FC-1 (FIR-012/025); missing resolution → 409 `AUTHORITY_UNPROVEN` | FIR-012/016/025 |
| W8 | `POST /api/v1/family/capital/instructions/{id}/submit` | Finance hand-off (idempotent) | idempotency key | Finance request ref | same as W7 + step-up | enforcing | target-entity-scoped | `FAMILY_CAPITAL_INSTRUCTION_SUBMITTED` (destinationDomain finance) | idempotent replay → same ref; Finance rejection → 409 with Finance reason; FC-1 pre-ratification | FIR-012/025 |
| W9 | `POST /api/v1/family/loans/instructions` | Create loan instruction (non-financial) | purpose, borrower, lender entity, terms-source doc refs, jurisdiction ref, approvals, assessment summary | instruction ref | `family:loan.request` (draft) + authority (CFG-LD-1) + SoD | enforcing | lender-entity-scoped | `FAMILY_LOAN_INSTRUCTION_CREATED` | FC-1 (FIR-013/026) | FIR-013/016/026 |
| W10 | `POST /api/v1/family/loans/instructions/{id}/submit` | Finance/legal hand-off (idempotent) | idempotency key | Finance/legal request refs | same as W9 + step-up | enforcing | lender-entity-scoped | `FAMILY_LOAN_INSTRUCTION_SUBMITTED` | idempotent replay; rejection → 409; FC-1 pre-ratification | FIR-013/026 |
| W11 | `POST /api/v1/family/vault/seal|unseal|succession` | Vault seal/unseal/succession action | item ref, action, authority ref, rationale | new vault state | `family:vault.read` + (draft) vault action authority (CFG-VL-1) + human + step-up | enforcing | — | `FAMILY_VAULT_SEALED/UNSEALED/SUCCESSION` | FC-1 (FIR-024/015); unauthorized → 403 + audit | FIR-015/024 |
| W12 | `POST /api/v1/family/policy-decisions/{id}/resolve` | Resolve a policy requirement (governance act) | resolution/policy/instrument ref, authority ref, effective date, evidence | resolved state | existing governance permissions (canonical) + human + authority | enforcing | — | `POLICY_DECISION_RESOLVED` | non-author → 403; AI actor → 409 `HUMAN_ACTOR_REQUIRED`; AI resolution attempt → `POLICY_INVENTION_REFUSED` | FIR-027 |

### 32.3 API invariants

- No endpoint may: change a beneficiary legal entitlement, post money, amend a legal instrument, execute an AI decision, create a delegation, or read/write outside tenant scope.
- Every mutation endpoint requires: authenticated human principal + permission + (where applicable) step-up + policy gate + decision gate + audit/event in one transaction.
- All endpoints carry trace/correlation/causation; all denials are audited.
- Endpoints W1–W12 exist **only** after their FIR dependencies ratify **and** Phase 3D authorization issues; this table is the contract they must satisfy.

## 33. UI architecture (DRAFT)

**Status:** design only. No production UI is built. The existing `src/app/os/family/page.tsx` (read-oriented workspace, `force-dynamic`, `requireAccess("family:member.read")`, tenant-scoped) remains untouched by this phase.

### 33.1 Workspace map (future, gated)

| Surface | Content | Data source | Gate |
|---|---|---|---|
| Institution dashboard (read-only) | scope descriptor, registry counts, open policy decisions, body overview | R1, R6, R10, R11 | read permissions |
| Lineage/evidence review queue | disputed/unverified edges, evidence bindings, verification actions | R2, W2, W3 | `family:lineage.verify` (draft) |
| Policy-decision-required queue | open FIR/requirement records, owners, evidence state | R10, W12 | `family:policydecision.read` (draft) |
| Constitution & forum pages | versions, in-force state, amendments (linked to resolution records), bodies/mandates | R5, R6, W5, W6 | constitution/forum drafts |
| Eligibility explanation | per-domain determinations, rationale, evidence, engine version | R3 | `family:eligibility.assess` (draft) |
| Capital/loan instruction pages | non-financial instruction state + **Finance status displayed by reference** (F-1) | R7, R8, W7–W10 | capital/loan drafts |
| Audit/provenance panel | trace view: events, audit rows, authority blocks, AI decision refs | canonical audit/events read | audit-read governance (existing) |

### 33.2 UI invariants

1. The UI never exposes a second ledger, a trustee console, a decision-authority control beyond canonical governance UI, or a Noelia autonomous-approval experience.
2. Every mutation surface in the UI is the thin client for a W-endpoint (all control stays server-side).
3. HIGHLY_RESTRICTED data follows the same clearance/step-up as APIs; the UI adds no access path.
4. No UI state may be treated as authority (all state is server-rendered from canonical reads, `force-dynamic`).

---
# Part VII — Non-functional architecture

## 34. Data classification architecture

**Canonical owner:** Platform — `beyu_classification` enum: `PUBLIC | INTERNAL | CONFIDENTIAL | RESTRICTED | HIGHLY_RESTRICTED`. Clearance filtering via `clearanceForRoles` / `filterByClearance`.

### 34.1 Technical structure

- **TECH:** Classification is an attribute of every family record (`family_members`, `beneficiaries`, `family_vault_items` default `HIGHLY_RESTRICTED`; future candidate tables inherit the default of their domain: registry-derived = `HIGHLY_RESTRICTED`, instruction/governance-derived = at least `CONFIDENTIAL`, amounts/Finance references = `HIGHLY_RESTRICTED`).
- **TECH:** Enforcement chain (existing): role clearance ≥ record classification, else row filtered/denied; step-up may be required at the guard for HIGHLY_RESTRICTED access (role-defined); every access (including denials) audited.
- **TECH:** Classification is a **technical control value**, not a policy decision: the *default* levels are structural; the *access matrix* (who may see what, under what basis) is policy (FIR-015) and remains CFG-gated.

### 34.2 Policy values required

- **POLICY:** classification assignments per data class (including minor/capacity-implicated data), lawful basis, cross-border transfer rules. → `POLICY DECISION REQUIRED (FIR-015)`. Until ratified: existing defaults apply (HIGHLY_RESTRICTED for the registries), access follows existing role clearances, nothing is relaxed.

## 35. Privacy/security architecture

**Canonical owner:** BEYU security stack — RBAC/ABAC + clearance + step-up (guard/authz), `consents`, `retentionPolicies`, legal holds (platform), emergency access grants (identity), idempotency, rate limiting (`guarded()`), hash-chained audit.

### 35.1 Technical structure (reused, not redesigned)

1. **Authentication/session:** canonical sessions; principal resolution in `guarded()`.
2. **Authorization:** RBAC (roles/permissions) ∧ ABAC (tenant scope, entity scope, clearance) ∧ step-up/MFA hooks; service identities bounded; AI identities advisory-only (FIR-017).
3. **Consent & lawful basis:** family member processing reads `consents` (purpose, lawfulBasis, jurisdictionCode, grant/withdrawal); processing without a ratified purpose basis is FC-1 (FIR-015).
4. **Retention & legal hold:** `retentionPolicies` + holds apply to documents and (by reference) vault items and future family records; retention values are CFG-gated (FIR-015).
5. **Sensitive-data handling:** minors, incapacity, health implications, succession — HIGHLY_RESTRICTED by default; sealed vault items inaccessible until CFG-VL-2 ratifies release rules; no bulk-export path exists or is proposed.
6. **Insider risk:** SoD slots (§26.3), step-up for HIGH_RISK actions, full audit of reads of HIGHLY_RESTRICTED data, emergency access only via canonical `emergencyAccessGrants` (time-boxed, audited).
7. **Data quality:** duplicate-identity prevention (unique party anchor; `parties.duplicateOfPartyId`); referential validation in-engine where DB FKs are policy-blocked (parent edge, vault↔document).

### 35.2 Policy values required

All of FIR-015 (lawful basis, minors, sealed access, retention, deletion, legal hold, audit-access rules) + jurisdiction-specific data governance (FIR-014). Until ratified: the conservative defaults above hold; no relaxation.

### 35.3 Security invariants

- No family permission implies Finance execution or legal authority (§27.3).
- No AI path to a write (I-03).
- No cross-tenant read outside canonical ancestry rules (I-05).
- No exfiltration surface: no family API returns document content (metadata only, content via canonical document access with its own controls).

## 36. Failure/fail-closed architecture

### 36.1 The standard fail-closed behavior (FC-1, normative, universal)

Whenever any required policy value for a behavior is **not ratified** (`POLICY DECISION REQUIRED (FIR-xxx)`), the system exhibits exactly:

1. **No write** — no state change to any table (family or otherwise).
2. **No approval** — no vote, resolution, activation, or delegation effect is produced or consumed as authority.
3. **No execution** — no workflow step past the policy gate runs; the gate returns `REQUIRES_HUMAN`/denied.
4. **No financial consequence** — nothing reaches Finance OS; no Finance record is created/changed.
5. **No legal-status change** — no beneficiary, entitlement, relationship, constitutional, or lifecycle state is altered; records remain inert (§25.3).
6. **One standard error** — `POLICY_DECISION_REQUIRED` with the FIR reference(s) (§37).
7. **One denial audit** — `FAMILY_POLICY_GATE_DENIED` (or the object-specific denial event) is emitted with actor, object, trace, and FIR refs (KDD-7).
8. **No silent default** — no engine input is filled with a default policy value; missing values are passed as *missing* and the assessment result is `INDETERMINATE`/`REQUIRES_HUMAN`, never a favorable assumption.

### 36.2 Fail-closed points inventory (where FC-1 is enforced)

| Layer | Point | Behavior when unresolved |
|---|---|---|
| API guard | policy gate step in `guarded()` flow (§26.1) | 409/422 `POLICY_DECISION_DENIED`-family (§37), denial audited |
| Decision gate | `evaluateDecisionGate` step on required decision/authority | `REQUIRES_HUMAN`/`FAILED`; flow halts |
| Engines | threshold/electorate/evidence inputs missing | `INDETERMINATE` / assessment fails; no determination issued as authoritative |
| Supremacy | `checkSupremacy` conflict or missing instrument reference | conflict detected; no provision in force |
| Eligibility | missing domain rules (CFG-EL-*) | `INDETERMINATE`; no conferment (independent of ratification) |
| Delegation | scope not ratified / AI delegate | `DelegationAssessment` fails; execution refused |
| Finance adapter | hand-off policy not ratified | instruction cannot be created/submitted (FC-1) |
| Vault | sealed rules not ratified | sealed items remain sealed; unseal refused |
| Lifecycle | transition profile not ratified | transition refused; record stays in current (inert) state |
| Noelia | operation outside NOELIA_MAY; or "resolve this policy" request | boundary assertion fails; refusal recorded in `ai_decisions` |

### 36.3 Fail-open prohibition

No component may treat "policy not found" as "policy permits". The only representation of absent policy is the explicit `POLICY DECISION REQUIRED` marker/record, and its only consumption is the denial path. `findInventedPolicies` (policy-decisions engine) is the standing detection of any violation of this rule.

### 36.4 Availability under fail-closed

Read/assess surfaces (R1–R11, engine assessments, dashboards, the existing UI) remain available under current permissions; only effect-bearing behavior is gated. The system degrades to "institutional record + assessment", never to "institutional authority".

## 37. Error model

### 37.1 Standard error taxonomy (technical names; HTTP mappings for the future API layer)

| Code | Meaning | HTTP | Retryable | Audit | Policy dependency |
|---|---|---|---|---|---|
| `UNAUTHENTICATED` | no valid session | 401 | no (re-auth) | guard log | none |
| `PERMISSION_DENIED` | permission/clearance failure | 403 | no | guard log | none |
| `TENANT_ISOLATION_DENIED` | cross-tenant scope violation | 403 | no | `FAMILY_POLICY_GATE_DENIED`-class | FIR-002 (cross-tenant semantics) |
| `CLASSIFICATION_DENIED` | clearance < row classification | 403 | no | guard log | none |
| `STEP_UP_REQUIRED` | MFA/step-up pending | 428 | after step-up | guard log | none |
| `HUMAN_ACTOR_REQUIRED` | non-human (AI/service) attempted a human-only act | 409 | no | denial event + `ai_decisions` if AI | none (I-03 structural) |
| `POLICY_DECISION_REQUIRED` | required policy value unratified | 422 (with FIR refs) | after ratification | `FAMILY_POLICY_GATE_DENIED` | the named FIR(s) |
| `ARCHITECTURE_DECISION_REQUIRED` | technical invariant not determined | 500-class (design defect, not expected in production) | no | audit + incident | none |
| `AUTHORITY_UNPROVEN` | missing/invalid resolution/delegation/instrument reference | 409 | after authority supplied | denial event | CFG authority matrices |
| `EVIDENCE_INSUFFICIENT` | evidence standard not met (or unverifiable pre-ratification) | 409 | after evidence | denial event | FIR-004 (standard) |
| `DUPLICATE_IDENTITY_DENIED` | party already a member / duplicate party | 409 | no | denial event | FIR-002 (semantics) |
| `LINEAGE_GRAPH_INVALID` | cycle/depth/duplicate-parent in descent input | 409 | fix input | audit | none (structural) |
| `SUPERIOR_INSTRUMENT_CONFLICT` | provision/amendment conflicts with superior instrument | 409 | no | denial event + conflict record | FIR-007 (conflict handling) |
| `TRUSTEE_RESERVED_MATTER_DENIED` | family body attempted a reserved matter | 409 | no | denial event | none (structural, I-08) |
| `AI_AUTHORITY_DENIED` | AI attempted an authority action | 409 | no | denial + `ai_decisions` | none (structural, I-03) |
| `POLICY_INVENTION_REFUSED` | AI/code attempted to supply a policy value | 409 | no | denial + incident flag | none (structural, I-12) |
| `FINANCE_BOUNDARY_VIOLATION` | family write attempted a financial state | 409 | no | denial + incident flag | none (structural, I-02) |
| `EFFECTIVE_PERIOD_CONFLICT` | period overlap where rule says invalid | 409 | fix input | audit | FIR-010 (overlap rules) — pre-ratification, overlaps are *not* rejected on policy grounds; the conflict is recorded for the ratification decision |
| `IDEMPOTENCY_REPLAY` | replay of a submitted instruction | 200 (original ref) | n/a | idempotency record | none |
| `INSTRUCTION_SUBMISSION_REJECTED` | Finance/legal hand-off refused | 409 (with owner reason) | per owner | event | FIR-012/013 (contract) |

### 37.2 Error invariants

1. Every error carries `traceId` (and correlation/causation where applicable) and is recoverable to its audit record.
2. Denial-class errors are always audited; no silent 404s on gated resources (a gated resource returns the policy error, not a fake absence).
3. Error responses never leak HIGHLY_RESTRICTED row data (messages are code + refs only).
4. `POLICY_DECISION_REQUIRED` responses enumerate the FIR(s); they are the single channel by which implementers learn what to ratify.

## 38. Observability architecture

**Canonical owner:** Platform — `metricDefinitions`, `enterprise_events`, `audit_log`, trace IDs (existing), `featureFlags` (capability activation), `architectureDecisions` (registry for ADRs).

### 38.1 Technical structure

- **TECH:** No new telemetry store. Observability = (a) trace propagation (existing `traceId`/`correlationId`/`causationId`), (b) event-stream analysis over `enterprise_events`, (c) audit-completeness jobs over `audit_log` + chain heads, (d) metric definitions registered in `metricDefinitions` for family operations (latency, denial rate by code, open-policy-decision count, sealed-vault count, lineage dispute count).
- **TECH:** Denial-rate metric by error code is the primary fail-closed health indicator: a spike in `POLICY_DECISION_REQUIRED` = ratification backlog pressure, not a fault; a zero with non-zero writes = **alert** (possible policy-gate bypass → incident).
- **TECH:** Assurance checks (scheduled, read-only): (1) every effect-bearing mutation has audit + event in one tx (I-11); (2) no AI actor on any family write (I-03); (3) no family table holds forbidden financial fields (I-02, schema-lint style check); (4) chain-head integrity (I-14); (5) no axis-derivation violations (I-10); (6) open requirements ↔ blocker matrix consistency (FIR register currency).
- **TECH:** Feature-flag discipline: every future write capability is flag-gated (`featureFlags`) behind its ratified scope; flag activation is a governance-audited act.

### 38.2 Observability invariants

1. Observability reads are tenant-scoped and clearance-bound like any other read.
2. No observability path may mutate state.
3. Metrics never contain row-level HIGHLY_RESTRICTED content (counts/references only).

## 39. Testing architecture

**Status:** the suite below is **designed, not added**. Phase 3A adds no test code (the deliverable is the specification; no production behavior exists to test). The only category the authorization permits adding without implementation authorization — purely architectural/documentation-validation tests — is specified here as the first Phase 3C work item, with the exact validation rules.

### 39.1 Retained baseline

All `tests/family/*.test.ts` remain unchanged and green-referenced (Phase 1–2 engine coverage). No Phase 3A change touches them (I-15).

### 39.2 Future test catalog (Phase 3C/3D)

| ID | Area (per authorization) | What is tested | Primary fixtures | Gate |
|---|---|---|---|---|
| T-01 | Tenant isolation | cross-tenant read denied; scope filters complete; ancestry rules exact | 2 tenants, overlapping party references | FIR-002 (semantics) — isolation itself testable now |
| T-02 | Entity isolation | entity-scoped permissions (trust scope); cross-entity denial | 2 trusts, 1 member | read paths now |
| T-03 | Authorization | RBAC∧ABACclearance∧step-up matrix per §27 draft (ratified subset) | role/permission fixtures | FIR-023 |
| T-04 | Separation of duties | proposer≠verifier, verifier≠decider, requester≠approver, delegator≠delegate, AI≠slot | SoD fixtures | FIR-023/004/011 |
| T-05 | Constitutional supremacy | `checkSupremacy` ladder; lower-level amendment attempts fail; in-force only when ratified+activated | instrument fixtures | FIR-006/007 (values) — mechanism testable now |
| T-06 | Legal-instrument supremacy | trustee-reserved matters refused to family bodies; instrument conferral honored | reserved-matter fixtures | structural (now) |
| T-07 | Finance OS supremacy | no family write reaches Finance tables; instruction refs immutable; shadow-field lint (no balance/posting fields) | Finance schema lint + adapter fixtures | FIR-012/013 (hand-off) — boundary testable now |
| T-08 | AI non-authority | `assertWithinNoeliaBoundary` refusals; AI write assertions; AI delegate refusal; `POLICY_INVENTION_REFUSED` on silent resolution | AI actor fixtures | structural (now) |
| T-09 | Policy-decision required | every unratified CFG point produces FC-1 with correct FIR refs; no defaults; denial audited | empty-policy fixtures | structural (now) |
| T-10 | Audit completeness | mutation⇒audit+event same tx; chain integrity; authorityContext+policyVersion present | tx fixtures | FIR-016 (profiles) |
| T-11 | Lineage/evidence integrity | graph invariants (cycle/depth); evidence checksum binding; correction retains prior assertion | lineage fixtures | FIR-004/005 |
| T-12 | Beneficiary separation | registry never acts as entitlement; entitlement reads reference trustee proof; overlap rules per CFG-BF-2 | trust fixtures | FIR-009/010 |
| T-13 | Delegation boundaries | canonical-only store; scope/limit/window checks; revocation honored; emergency=FC-1 | delegation fixtures | FIR-011 |
| T-14 | Fail-closed behavior | universal FC-1 properties: no write/approval/execution/financial/legal effect under any unresolved FIR combination | property-based: random FIR-unresolved matrices | structural (now) |
| T-15 | Idempotency/concurrency | replay returns original ref; concurrent submissions serialized by idempotency records | adapter fixtures | FIR-012/013 |
| T-16 | Privacy/minor/sealed-vault | sealed access denial; minor data HIGHLY_RESTRICTED; consent checks; retention/hold application | vault fixtures | FIR-015/024 |
| T-17 | Migration/backfill integrity | additive-only migration properties; no overwrite of existing beneficiary/financial records; rollback restores pre-state | sandbox DB | FIR-002/005/010 (constraint scope) |
| T-18 | Documentation validation | spec self-consistency: all 27 FIRs mapped; all CFG points have an owner + fail-closed behavior; all draft permissions marked PROPOSED; all draft endpoints marked DESIGN ONLY; seven-mandate complete for every candidate field; no production artifact diff | this document + repo | none (documentation validation) |

### 39.3 Property-based tests (specified)

- **P-1 Lineage:** for any edge set, `buildDescentGraph` reports cycles/depth violations; `verifiedDescendantsOf` never returns an unverified descendant as verified.
- **P-2 Axis independence:** no combination of grants yields an axis true while its source axes are all false (`assertParticipationAxesIndependent` invariant).
- **P-3 Fail-closed:** for any subset of FIRs marked unratified, any effect-bearing call in the affected behavior set results in zero state changes (snapshot-diff property).
- **P-4 Supremacy monotonicity:** if provision P conflicts with instrument I, no amendment path yields P in-force without I's ratification recorded.

### 39.4 Anti-fabrication rule

No test may fabricate a policy decision to make a flow pass (contract §30). Tests that need a "ratified" fixture use an explicit ratification fixture marked `TEST-RATIFICATION`, isolated to test scope, never persisted.

---
# Part VIII — Delivery architecture

## 40. Migration strategy

**Status:** designed, not executed. **Migration 0018 remains BLOCKED** (no migration of that number exists and none is created; this section designs the eventual approach only).

### 40.1 Ground rules (normative)

1. **Additive only:** every migration adds tables/columns/indexes/constraints; none drops, renames, or rewrites existing data. Existing `family_members`, `beneficiaries`, `family_vault_items`, and all Finance/governance/identity rows are never overwritten.
2. **One decision, one migration group:** each migration wave is bounded by the FIR(s) it implements; a wave may not contain changes for unratified FIRs.
3. **Reversible:** every wave ships with a down-migration (drop what it added; backfilled data is never deleted by rollback — it becomes inert per §25.3).
4. **Dual-read before writes:** where a new table shadows an existing one's projection, the read path dual-reads and reconciles (drift report) before any write path activates.
5. **Tenant isolation in schema:** every new table carries `tenantId` notNull FK; every index is tenant-prefixed or tenant-unique as designed (§7.2).
6. **Classification defaults:** new registry-derived tables default `HIGHLY_RESTRICTED`; instructions default `CONFIDENTIAL` with HIGHLY_RESTRICTED fields for amounts/Finance refs.
7. **Audit of migration:** migration runs are recorded (actor, version, scope, result) through the governance/audit surface; the migration itself is a governed, human-initiated operation.
8. **Integrity before activation:** referential validation (in-engine where FKs are policy-blocked) + duplicate checks + effective-period conflict report must be clean (or formally accepted as `POLICY DECISION REQUIRED` items) before write activation.
9. **Legal/jurisdiction implications:** any constraint touching beneficiary periods, parent edges, or member uniqueness is applied **only** with the corresponding FIR ratification citing its jurisdictional basis (FIR-002/005/010/014).

### 40.2 Conceptual migration waves (each BLOCKED until its FIRs ratify)

| Wave | Content | FIR gate | Reuses | Additive elements | Backfill | Rollback |
|---|---|---|---|---|---|---|
| W-A | Institution scope (if ratified as a record) | FIR-001 | `tenants` | `family_institutions` (tenantId, scope refs, instrument refs, status) — POLICY-DEPENDENT | institution rows from ratified formation evidence (document refs) | drop table |
| W-B | Evidence binding + (if ratified) parent-integrity/temporal model | FIR-004, FIR-005, FIR-016 | `documents`, `family_members` | `family_lineage_evidence`; optional relationship-history table; optional FK/check per FIR-005 choice | evidence links from verified documents only | drop tables; FK drop |
| W-C | Constitution version/provision projection | FIR-006, FIR-007, FIR-022 | `documents`, `policies`, `resolutions` | `family_constitution_versions` + `family_constitution_provisions` (projection; document-first KDD-5) | from ratified constitution documents + ratifying resolutions | drop tables |
| W-D | Body membership projection | FIR-008, FIR-021 | `governance_bodies`, `governance_members` | minimal family-seat links (body, member, seat, instrument ref, term) | from canonical governance members where instrument exists | drop links |
| W-E | Participation grants + eligibility determinations | FIR-008, FIR-009, FIR-003 | `family_members`, `resolutions` | `family_participation_grants`, `family_eligibility_determinations` | none (fresh, resolution-backed only) | drop tables |
| W-F | Beneficiary constraint (per instrument, per ratified rule) | FIR-009, FIR-010 | `beneficiaries` | unique/exclusion constraint **scoped exactly** to the ratified rule | duplicate report → resolved per rule before constraint applied | drop constraint (data retained) |
| W-G | Capital/loan instruction tables + Finance references | FIR-012, FIR-025, FIR-013, FIR-026, FIR-016 | `finance.capitalRequests`, `legal_entities`, `documents` | `family_capital_instructions`, `family_loan_instructions` (non-financial fields only, §49 seven-mandate) | none (fresh instructions only) | drop tables |
| W-H | Vault/document linkage + sealed model | FIR-024, FIR-015 | `family_vault_items`, `documents`, `retentionPolicies` | document FK/validation, sealed metadata per ratified custody model | linkage from existing `documentId` values after validation | drop FK; data retained |

**Ordering constraint:** W-A first (scope root) → W-B → W-C/W-D (parallel) → W-E → W-F → W-G → W-H. Any wave may be deferred if its FIRs remain unratified; downstream waves that consume its tables are automatically deferred.

### 40.3 Explicitly NOT in any wave (architecture prohibitions)

No migration creates: party/user/tenant/entity masters; ledger/journal/treasury/loan-book/balance/financial-lineage tables; family-owned audit/event stores; delegation stores; a second RBAC/ABAC system. Altering `family_members_party_uidx` or `parentMemberId` semantics is permitted only per the exact ratified choice of FIR-002/FIR-005 — and even then as an additive constraint, with the prior state preserved in history.

## 41. Deployment strategy

**Canonical owner:** existing deployment (single Next.js application; `package.json` scripts: dev/build/lint/typecheck/test/verify/migrate/seed; `scripts/migrate.ts` runner; drizzle-kit).

### 41.1 Technical structure

- **TECH:** No new deployment unit. Family Institution work deploys with the BEYU OS application; capability activation is per-`featureFlags` (existing table), governed, audited.
- **TECH:** Rollout order per capability (Phase 3D, if authorized): (1) schema wave (additive, verified in staging with T-17), (2) read API behind flag, (3) dual-read reconciliation report (≥1 observation period, value), (4) mutation API behind flag + step-up, (5) per-tenant canary (single tenant), (6) full enablement. Each step has an explicit rollback = flag off (additive schema stays).
- **TECH:** Environment parity: staging uses the same migration runner; seed data is test-scoped and never production-identity.
- **TECH:** CI/CD gate: typecheck, lint, tests (including T-18 documentation validation), and the repo's normal checks must pass; the standing PR #8 Vercel failure must be resolved or formally waived per repository policy before any Phase 3D PR merges (blocker matrix, PR CI policy row).

### 41.2 Deployment invariants

1. No deployment may enable a write capability whose FIRs are not ratified (flag activation is refused by policy, not by hope).
2. Rollback never mutates data; it deactivates capability.
3. Finance and Noelia/HIVE deployments are never touched by family capability changes (separate change ownership).

## 42. Dependency graph

### 42.1 Architecture dependency DAG (components → mechanisms → FIR gates)

```text
                        ┌─────────────────────────────────────────────┐
                        │  RATIFICATION (Phase 3B) — the only source  │
                        │  of policy values; CFG-* populated          │
                        └───────────────┬─────────────────────────────┘
                                        │
        ┌───────────────┬───────────────┼────────────────┬───────────────┐
        ▼               ▼               ▼                ▼               ▼
  FIR-001 scope   FIR-002/003/004   FIR-005/014       FIR-006/007     FIR-008/021
  (W-A)            (membership+     (parent edge,     (constitution    (bodies/
                    evidence)                    jurisdiction)         mandates)
        │               │               │                │                │
        ▼               ▼               ▼                ▼                ▼
  institution    membership      lineage history   constitution      body membership
  scope root     lifecycle (20)  + verification    versions(C-W)     projection(D-W)
        │               │               │                │                │
        └───────┬───────┘               │                │                │
                ▼                        ▼                ▼                ▼
        eligibility (003/009)    evidence binding    amendments       participation
        determinations(E-W)      (B-W)               workflow         grants (E-W)
                │                        │                │                │
                ▼                        ▼                ▼                ▼
        beneficiary (009/010)    vault linkage        governance       decision gate
        constraint (F-W)         (H-W, 015/024)       decisions (23)   inputs complete
                │                        │                │
                └───────────┬────────────┘                │
                            ▼                             ▼
                 capital/loan instructions (G-W)   full effect-bearing
                 (012/013/025/026 + 016)          operation — Phase 3D
                            │
                            ▼
                 Finance OS hand-off (one-way; F-1…F-7)
```

Cross-cutting (always present, not FIR-gated): authorization (§26), audit/events (§28/29), fail-closed (§36), observability (§38), Noelia advisory (§31), tenant isolation (§9).

### 42.2 Dependency rules

1. A component may be **designed** (this document) without its FIRs ratifying — that is Phase 3A's purpose.
2. A component may be **implemented** only when: (a) its FIR dependencies are ratified with evidence, (b) all upstream DAG dependencies are live, (c) Phase 3C implementation spec exists for it, (d) Phase 3D authorization names it.
3. No component may be implemented by "partial ratification" — a component implements the full ratified scope of its FIRs or not at all (partial = new POLICY DECISION REQUIRED slice).
4. The three RESOLVED boundaries (FIR-017/018/019) are **prerequisites of every node**, never gates that can be "satisfied" to unlock something: they constrain all nodes permanently.

## 43. Phase 3 implementation sequence

**Status:** sequence is designed; execution is NOT authorized (allowlist empty).

| Step | Name | Entry condition | Content | Exit evidence |
|---|---|---|---|---|
| S-0 | Phase 3A (this document) | Authorization (granted) | Technical architecture; A/B separation; 27-decision mapping; fail-closed design; draft API/permission; migration/test design | This document, committed, reviewed |
| S-1 | Phase 3B — Policy/Legal Ratification | S-0 approved | Ratify (or expressly scope out) each of the 24 blocking FIRs via canonical governance/legal process; assign owners (FIR-027 operation); record evidence, authority, jurisdiction, effective dates; populate CFG-* | Ratification register entries (resolution IDs/instruments/policy records) per FIR; allowlist updated |
| S-2 | Phase 3C — Implementation Specification | S-0 + ratification of the specific scope | Bounded implementation spec(s): exact tables/fields (seven-mandate), endpoints, permissions, audit events, tests, migration waves — each spec names its ratified FIRs only | Approved implementation spec(s); T-18 updated |
| S-3 | Phase 3D — Schema/Migration/API/Permissions/UI | S-1 + S-2 + explicit implementation authorization per scope | Execute waves W-A…W-H and endpoints R*/W* strictly per spec; CI green (incl. resolved/waived Vercel policy) | Deployed capability behind flags; assurance checks green |
| S-4 | Assurance & category experiences | S-3 per scope | Category read/orchestration surfaces (Business Development, Wealth Management, Wealth Planning, Family Governance, Lifestyle, Philanthropy), audit dashboards, controls testing, data-quality program | Assurance report |

**Sequencing note:** S-3 is not monolithic — each wave/endpoint ships as its own gated increment (its FIRs + spec + authorization). Unratified FIRs simply wait at S-1; the architecture (S-0) already accommodates every ratification path.

## 44. Phase 3 entry gates

### 44.1 Gate definitions (normative)

| Gate | Name | Condition to pass |
|---|---|---|
| G-3A | Technical architecture | Section 1–46 + outputs 1–16 complete; A/B separation verified (T-18 rules); no policy value chosen; repository evidence cited and consistent |
| G-3B | Policy/legal ratification | For each in-scope FIR: ratified rule + accountable authority + jurisdiction + effective date + evidence reference + superior-instrument constraints, recorded in canonical governance/documents; or explicit scoping-out decision |
| G-3C | Implementation specification | Bounded spec exists per increment; seven-mandate complete for every field; draft→production permission mapping reviewed; audit event profile (FIR-016) attached; tests specified incl. T-01…T-18 applicability |
| G-3D | Implementation authorization | Explicit authorization names the exact increment (wave + endpoints + permissions); allowlist entry per the allowlist document's required-entry format (Decision ID, ratified rule, accountable authority, approved evidence/document identifier, exact bounded implementation, consequences, scope limitations) |

### 44.2 Gate properties

1. Gates are **evidence-based**: passing = referenced evidence exists in the repository/governance record, not a claim.
2. Gates are **per-increment**: G-3B/3C/3D can pass for a subset; the rest remain blocked.
3. Gate failure at any stage freezes the affected increment at its last safe state (FC-1 semantics apply to capability activation as to data).
4. The standing PR #8 Vercel failure is a **merge-policy** precondition of G-3D for any PR (blocker matrix row: "PR CI policy"), independent of schema design.

## 45. Policy-ratification dependency map

### 45.1 What each ratification unlocks (and nothing else)

| FIR group | Ratification content (what must be decided) | Unlocks (exact increments) | Never unlocks |
|---|---|---|---|
| FIR-001 | Institution formation/scope/owner/identity | W-A; R11; institution read permission | Any identity/tenant change |
| FIR-002 | Cross-tenant membership semantics; uniqueness fate | member uniqueness decision (additive constraint or explicit retention); cross-tenant workflow | Loosening of isolation |
| FIR-003 | Relationship vocabulary + legal effects | CFG-MB-2; membership effect rules; eligibility inputs | Automatic conferment (forever) |
| FIR-004 | Evidence hierarchy, verifiers, dispute/correction | W-B (evidence part); W2/W3; lineage.verify | AI-verified status (forever) |
| FIR-005 | Parent-edge integrity model; temporality | W-B (integrity part); W2 corrections | Any FK chosen unilaterally |
| FIR-006 | Constitution authority/electorate matrix | W-C; W5; constitution permissions | Constitution self-authority (forever, I-08) |
| FIR-007 | Quorum/thresholds/effectivity/emergency/conflict | CFG-CON-3/5/6; CFG-EM-1; activation workflow | Emergency override without record (forever) |
| FIR-008 | Body/mandate/role-authority matrix per instrument | W-D; W6; body permissions; participation inputs | Fiduciary power to family bodies (forever absent instrument) |
| FIR-009 | Beneficiary rules per trust; trustee proof | W-E (eligibility); W4; beneficiary.verify | Entitlement creation by BEYU (forever) |
| FIR-010 | Beneficiary uniqueness/overlap rules | W-F (constraint scoped to rule) | Duplicate institution-beneficiary entity (forever) |
| FIR-011 | Delegable scope/limits/emergency rules | delegation adapter scope (canonical store only) | Any family delegation store (forever) |
| FIR-012 | Capital owner/authority/Finance contract | W-G (capital); W7/W8; capital.request | Any shadow financial state (forever) |
| FIR-013 | Loan policy/Finance-legal contract | W-G (loan); W9/W10; loan.request | Any loan book (forever) |
| FIR-014 | Governing jurisdiction + conflict-of-laws + escalation | CFG-JX-1/2; jurisdiction gate enablement | Legal conclusions from country fields (forever) |
| FIR-015 | Privacy/retention/minors/sealed matrix | CFG-VL-3, CFG-EV-2; consent-driven processing | Relaxation of HIGHLY_RESTRICTED defaults before ratification |
| FIR-016 | Object audit/event/evidence profiles | audit contract for every W-endpoint; T-10 profiles | Family-owned log (forever) |
| FIR-020 | Member lifecycle states + effects | member mutation model (W2 lifecycle part); effect-bearing states | Effects from inert states (until profiled) |
| FIR-021 | Body persistence + canonical governance link | W-D membership lifecycle | Parallel governance system (forever) |
| FIR-022 | Provision/version persistence decision | W-C registry shape | Document-as-authority without ratification (forever) |
| FIR-023 | Permission/SoD/step-up/authority-proof matrix | §27 draft → production permissions; SoD checks | Permission-conferred legal authority (forever) |
| FIR-024 | Vault custody/access/sealed/succession | W-H; W11; vault action authority | Vault-as-secrets-system (forever) |
| FIR-025 | Capital instruction persistence shape/idempotency | W-G (capital tables) | Financial truth in family tables (forever) |
| FIR-026 | Loan instruction persistence shape/lifecycle | W-G (loan tables) | Loan book (forever) |
| FIR-027 | Register operation (owners, evidence, publication) | S-1 operation; W12; policydecision.read | Self-resolution of records (forever) |

### 45.2 Ratification sufficiency rule

An FIR is ratified for implementation purposes only when the record carries: accountable authority (named body/person with proven authority), applicable jurisdiction, effective date, evidence reference (resolution ID / instrument / policy record), and superior-instrument constraint statement. Engine capability, DB columns, comments, AI recommendations, and best practice are **not** ratification (universal rule, restated).

## 46. Architecture decision records required before implementation

### 46.1 ADRs made by this specification (recorded, Appendix D)

KDD-1…KDD-8 (§1.5) — each with ratification-neutrality proof; registered in `architectureDecisions` at Phase 3C.

### 46.2 ADRs REQUIRED before any implementation increment (gate G-3C artifact)

| ADR ID | Decision to record | Trigger | Inputs |
|---|---|---|---|
| ADR-FIR-001 | Institution scope model chosen (tenant / entity / multi-entity) and root FK design | S-1 ratifies FIR-001 | ratification record |
| ADR-FIR-002 | `family_members_party_uidx` fate (retain / additive constraint / new association) | FIR-002 | ratification + privacy basis |
| ADR-FIR-005 | Parent-edge integrity model (strict FK / temporal / none + tenant-consistency rule) | FIR-005 | ratification + evidence model |
| ADR-FIR-010 | Beneficiary constraint shape (unique set / exclusion rule / none) | FIR-010 | per-instrument rules |
| ADR-FIR-014 | Jurisdiction gate configuration (mapping + escalation path) | FIR-014 | counsel ratification |
| ADR-FIR-016 | Event/evidence profile per object (final catalogue) | FIR-016 | audit owner approval |
| ADR-FIR-022 | Document-first vs provision-registry-primary (confirm KDD-5 or revise) | FIR-022 | constitution authority |
| ADR-FIR-023 | Production permission matrix (from §27 draft) + SoD slot assignments + risk classes | FIR-023 | security review |
| ADR-INT-01 | Finance hand-off contract (request types, reference scheme, result mirroring) | FIR-012/013/025/026 | Finance owner sign-off |
| ADR-INT-02 | Noelia advisory integration surface (read scopes, action-request types) | Any AI-assisted surface | AI governance (existing) |
| ADR-SEC-01 | Step-up and emergency-access policy for family HIGH_RISK actions | FIR-015/023 | privacy + security review |

### 46.3 ADR rules

1. Every ADR carries: context, decision, alternatives rejected, FIR references, superior-instrument check, rollback note.
2. An ADR may not select a policy value; it selects the **technical shape** the ratified value will occupy.
3. ADR conflicts with a ratification ⇒ the ratification governs and the ADR is re-issued (documented), never the reverse.

---
# Part IX — 27-decision architecture dependency matrix

## 47. FIR-001…FIR-027 architecture dependency matrix

**Method (normative):** every architecture dependency is mapped with the seven mandated fields:

`Decision ID ↓ Architecture component affected ↓ Technical mechanism required ↓ Policy value required ↓ Current ratification status ↓ Can architecture proceed without the decision? ↓ Can implementation proceed without the decision?`

Status values are taken verbatim from the authoritative 27-decision matrix (Phase 2.5) as of this specification: RESOLVED 3 (FIR-017/018/019), PARTIAL 5 (FIR-004/011/016/023/027), UNRESOLVED 6 (FIR-020/021/022/024/025/026), REQUIRES LEGAL/POLICY RATIFICATION 13 (FIR-001/002/003/005/006/007/008/009/010/012/013/014/015). BLOCKING PHASE 3: 24 (all except the three RESOLVED boundaries).

### 47.1 Matrix summary

| FIR | Component(s) affected | Architecture proceeds without it? | Implementation proceeds without it? |
|---|---|---|---|
| FIR-001 | §9 institution root; §48 institution entity; R11; W-A | **Yes** — tenant-scope default root (KDD-1) | **No** — no institution record/scope writes |
| FIR-002 | §8/§9 identity/tenancy; §7.2 cardinality; W1; `family_members_party_uidx` | **Yes** — existing global-unique constraint retained | **No** — no uniqueness change, no cross-tenant workflow |
| FIR-003 | §12 membership effects; §17 eligibility inputs; CFG-MB-2 | **Yes** — relationship stored, effects inert | **No** — no effect-bearing relationship behavior |
| FIR-004 | §13/§14 lineage/evidence; W-B; W2/W3; `family:lineage.verify` | **Yes** — evidence-binding design; engine assess-only | **No** — no verification/correction/dispute writes |
| FIR-005 | §13 parent edge; W-B integrity part; CFG-LN-3 | **Yes** — no FK, in-engine validation only | **No** — no FK/history/temporal model |
| FIR-006 | §15 constitution; W-C; W5; CFG-CON-1/2/4 | **Yes** — authority matrix is a configuration point | **No** — no constitution workflow/persistence |
| FIR-007 | §15/§23 lifecycle; CFG-CON-3/5/6; CFG-EM-1; §23.2 | **Yes** — staged amendment shape exists, values absent | **No** — no effectivity/emergency/suspension behavior |
| FIR-008 | §16 bodies; W-D; W6; CFG-BD-1/2; participation inputs | **Yes** — canonical bodies exist; mandates are values | **No** — no mandate/membership/authority persistence |
| FIR-009 | §17/§18 eligibility/beneficiary; W-E/W-F; W4; CFG-BF-1/3 | **Yes** — assessment-only, non-confering | **No** — no eligibility/beneficiary write behavior |
| FIR-010 | §18 uniqueness; W-F constraint shape | **Yes** — no constraint, conflict recorded not enforced | **No** — no dedup/period constraint |
| FIR-011 | §19 delegation; decision gate delegation step | **Yes** — canonical store + assessment exist | **No** — no family delegation scope adapter |
| FIR-012 | §20 capital; W-G (capital); W7/W8; CFG-CP-1/2 | **Yes** — instruction/adapter designed | **No** — no capital instruction persistence/hand-off |
| FIR-013 | §21 loan; W-G (loan); W9/W10; CFG-LD-1/2 | **Yes** — instruction/adapter designed | **No** — no loan instruction persistence/hand-off |
| FIR-014 | §11 jurisdiction gate; CFG-JX-1/2; jurisdiction-sensitive writes | **Yes** — gate designed, references only | **No** — no jurisdiction-sensitive write decisions |
| FIR-015 | §34/§35 classification/privacy; CFG-EV-2/VL-3; consents | **Yes** — conservative defaults hold | **No** — no sensitive ingestion/retention/access changes |
| FIR-016 | §28/§29 audit/event profiles; W-endpoint audit contract; T-10 | **Yes** — event catalogue designed; generic envelope exists | **No** — no material mutation without ratified profile |
| FIR-020 | §12/§25 member lifecycle; W2 lifecycle part; CFG-MB-1 | **Yes** — lifecycle contract + enum mapping designed | **No** — no lifecycle transitions with effects |
| FIR-021 | §16 body persistence; W-D; CFG-BD-4 | **Yes** — projection designed on canonical tables | **No** — no body/membership persistence |
| FIR-022 | §15 provision/version registry; W-C registry shape | **Yes** — document-first (KDD-5) without registry | **No** — no provision/version persistence |
| FIR-023 | §26/§27 authorization/permissions; SoD slots; ADR-FIR-023 | **Yes** — draft matrix + slot structure designed | **No** — no production permission/SoD implementation |
| FIR-024 | §22 vault; W-H; W11; CFG-VL-1/2 | **Yes** — vault left as metadata index | **No** — no vault/document linkage/sealed behavior |
| FIR-025 | §20 instruction persistence shape; W-G (capital tables) | **Yes** — non-financial shape designed | **No** — no capital instruction table |
| FIR-026 | §21 instruction persistence shape; W-G (loan tables) | **Yes** — non-financial shape designed | **No** — no loan instruction table |
| FIR-027 | §24 policy-decision operation; W12; R10; S-1 operation | **Yes** — mechanism exists; operation values absent | **No** — no controlled closure/publication regime |
| FIR-017 | §31 Noelia/HIVE boundary (all AI surfaces) | **Yes** — boundary is a resolved prohibition, fully designed around | **No** — boundary only; authorizes no new AI implementation |
| FIR-018 | §30 Finance boundary (all financial surfaces) | **Yes** — boundary is a resolved prohibition, fully designed around | **No** — boundary only; authorizes no new financial adapter |
| FIR-019 | §8–§11/§28/§29 canonical ownership (all contexts) | **Yes** — boundary is a resolved prohibition, fully designed around | **No** — boundary only; authorizes no new persistence/reference model |

### 47.2 Decision records (seven-field detail)

#### FIR-001 — Family Institution formation and scope
- **Decision ID:** FIR-001
- **Architecture component affected:** institution root of record (§9, KDD-1); §48 institution entity; R11; W-A; `family:institution.read` (draft).
- **Technical mechanism required:** optional `family_institutions` record (tenantId + scope references + instrument references + status) as an additive filter root; read paths default to tenant scope until it exists.
- **Policy value required:** what constitutes a Family Institution; who establishes/owns/governs it; its canonical identity; scope model (tenant / entity / multi-entity).
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — tenant-scope default root (KDD-1) makes every read expressible today; the institution record is an optional refinement, not a prerequisite.
- **Can implementation proceed without the decision?** No — no institution-scoped writes, no W-A, no institution administration grants (denylist FIR-001 row).

#### FIR-002 — Person participation across Family Institutions and tenants
- **Decision ID:** FIR-002
- **Architecture component affected:** identity/tenancy architecture (§8–9); §7.2 cardinality table; W1 duplicate-identity handling; `family_members_party_uidx`.
- **Technical mechanism required:** retain the existing global-unique `partyId` constraint; cross-tenant family workflow designed but gated; any future association model additive only.
- **Policy value required:** whether one party may hold membership in more than one institution/tenant; cross-tenant controls; privacy/data-sharing basis.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the constraint is retained unchanged; the architecture treats its cross-tenant meaning as an open policy slot.
- **Can implementation proceed without the decision?** No — no uniqueness migration, no cross-tenant family workflow (database gate register: blocked).

#### FIR-003 — Family relationship classification
- **Decision ID:** FIR-003
- **Architecture component affected:** membership effects (§12); eligibility inputs (§17); CFG-MB-2; participation/eligibility determinations.
- **Technical mechanism required:** relationship vocabulary + effect rules as engine inputs/policy records; non-conferment guards already exist (`assertNoAutomaticConferment`).
- **Policy value required:** legal treatment of biological descent, adoption, spouse/former spouse, dependants, stepchildren, guardianship, affinity, minors, incapacity, deceased, disputed relationships — per jurisdiction/instrument.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — relationships are stored and represented; all effects are inert (FC-1).
- **Can implementation proceed without the decision?** No — no relationship-effect workflows, no automated membership/rights creation.

#### FIR-004 — Genealogical evidence and verification
- **Decision ID:** FIR-004
- **Architecture component affected:** lineage/evidence architecture (§13–14); W-B (evidence part); W2/W3; `family:lineage.verify` / `family:evidence.submit` (draft); CFG-LN-1/2, CFG-EV-1.
- **Technical mechanism required:** document-bound evidence bindings (KDD-3) with verifier + effective dates; verification workflow on existing `verificationStatus` states; human-only assertions.
- **Policy value required:** evidence hierarchy (authoritative evidence types per relationship/jurisdiction); verifier roles; dispute/correction processing.
- **Current ratification status:** PARTIAL — BLOCKING PHASE 3 (engine + verification fields exist; evidence bindings/persistence and authority absent).
- **Can architecture proceed without the decision?** Yes — binding mechanism and workflow are designed; assess-only engine use is the current permitted mode.
- **Can implementation proceed without the decision?** No — no lineage verification writes, no evidence-document linkage persistence.

#### FIR-005 — Parent-child integrity and history
- **Decision ID:** FIR-005
- **Architecture component affected:** parent-edge integrity (§13); W-B (integrity part); W2 corrections; CFG-LN-3; ADR-FIR-005.
- **Technical mechanism required:** one of (strict current-state FK) / (temporal relationship/evidence records) / (no persistence extension) — selected by ratification; in-engine graph validation (`buildDescentGraph`) covers the interim.
- **Policy value required:** whether a DB FK is appropriate; tenant-consistency rule; whether corrections require temporal/versioned relationship records.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the text-without-FK field remains; validation is in-engine; all three candidate models are expressible without redesign.
- **Can implementation proceed without the decision?** No — no FK, check constraint, temporal columns, or relationship-history table (database gate register: blocked).

#### FIR-006 — Family Constitution authority and electorate
- **Decision ID:** FIR-006
- **Architecture component affected:** constitution architecture (§15); W-C; W5; CFG-CON-1/2/4; `family:constitution.propose` (draft).
- **Technical mechanism required:** authority matrix as CFG points consumed by the amendment workflow; canonical resolution lifecycle for ratification; document-first text (KDD-5).
- **Policy value required:** who may propose, table, vote, approve, ratify, suspend, supersede, or amend the Family Constitution.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the amendment workflow shape (stages, electorate snapshot input, threshold inputs) is complete and value-neutral.
- **Can implementation proceed without the decision?** No — no constitution/amendment workflow or persistence.

#### FIR-007 — Constitutional lifecycle and superior-instrument conflicts
- **Decision ID:** FIR-007
- **Architecture component affected:** constitution/decision lifecycle (§15, §23); CFG-CON-3/5/6; CFG-EM-1; ADR-FIR-007 scope.
- **Technical mechanism required:** quorum/threshold/effective-date/supersession values supplied to `assessAmendment` + activation; emergency authority assessment shape exists (`assessEmergencyAuthority`) with no defined authority; supremacy checks exist (`checkSupremacy`).
- **Policy value required:** quorum, voting threshold, supermajority, effective date rules, emergency amendment authority (if any), suspension, supersession, conflict-handling rules.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the lifecycle mechanism is designed; every missing value is a gate input, and the fail-closed default is "no emergency, no automatic path".
- **Can implementation proceed without the decision?** No — no effective constitutional state, no activation/suspension workflow, no emergency path.

#### FIR-008 — Governance bodies and fiduciary roles
- **Decision ID:** FIR-008
- **Architecture component affected:** governance-body architecture (§16); W-D; W6; CFG-BD-1/2; participation-grant inputs; `family:forum.manage` (draft).
- **Technical mechanism required:** canonical `governance_bodies`/`governance_members` as the body substrate (KDD-4); mandate/role-authority matrix as CFG points; trustee-reserved-matter enforcement (existing engine invariant).
- **Policy value required:** appointment/removal authority, term, scope, voting, approval, delegation, conflict/recusal, non-delegable powers — per instrument and jurisdiction.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — bodies exist canonically; mandates are values the matrix carries, not structure it fixes.
- **Can implementation proceed without the decision?** No — no body/mandate/membership persistence or role-linked grants.

#### FIR-009 — Beneficiary eligibility versus legal entitlement
- **Decision ID:** FIR-009
- **Architecture component affected:** eligibility + beneficiary architecture (§17–18); W-E/W-F; W4; CFG-BF-1/3; `family:eligibility.assess` / `family:beneficiary.verify` (draft).
- **Technical mechanism required:** per-domain assessment (engine exists, non-confering); beneficiary writes with trustee-authority proof + resolution reference; determination records as assessment history only.
- **Policy value required:** eligibility rules, class treatment, contingent/successor status, effective dates, spouse/adoption/minor/deceased/disputed treatment, trust-specific rules; trustee-authority proof form.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — assessment-only, non-confering design; registry reads unchanged.
- **Can implementation proceed without the decision?** No — no beneficiary/eligibility write flows or determination persistence (trustee/instrument remains authoritative).

#### FIR-010 — Beneficiary uniqueness and effective periods
- **Decision ID:** FIR-010
- **Architecture component affected:** beneficiary uniqueness (§18); W-F; `EFFECTIVE_PERIOD_CONFLICT` handling (§37).
- **Technical mechanism required:** a constraint scoped **exactly** to the ratified rule (unique set / exclusion rule / none) — ADR-FIR-010; pre-ratification, period overlaps are recorded, not enforced.
- **Policy value required:** the uniqueness rule; whether overlapping effective periods/classes are permitted per instrument.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — no constraint exists and none is inferred; the conflict-reporting path is value-neutral.
- **Can implementation proceed without the decision?** No — no deduplication migration, no unique/exclusion constraint, no eligibility/entitlement mutation API.

#### FIR-011 — Canonical delegation reuse
- **Decision ID:** FIR-011
- **Architecture component affected:** delegation architecture (§19); decision-gate delegation step; `assessDelegation` consumption.
- **Technical mechanism required:** canonical `delegations` as the exclusive store (no family store, ever); scope/limit/window/revocation assessment (engine exists); human→AI prohibition (canonical).
- **Policy value required:** which family powers are delegable/non-delegable; scopes, limits, expiries, revocation and emergency controls; segregation rules.
- **Current ratification status:** PARTIAL — BLOCKING PHASE 3 (canonical primitive + assessment exist; family scope rules absent).
- **Can architecture proceed without the decision?** Yes — the adapter consumes canonical records and assessments; scope values are gate inputs.
- **Can implementation proceed without the decision?** No — no delegation adapter for family scopes; no reference fields beyond canonical.

#### FIR-012 — Family Capital authority and Finance hand-off
- **Decision ID:** FIR-012
- **Architecture component affected:** capital architecture (§20); W-G (capital); W7/W8; CFG-CP-1/2; ADR-INT-01; `family:capital.request` (draft).
- **Technical mechanism required:** non-financial instruction record (seven-mandate fields, §49); one-way adapter to canonical Finance request surface (KDD-6); idempotent submission; reference-only status mirroring.
- **Policy value required:** legal/economic owner; policy/allocation/investment/distribution/liquidity/reporting authorities and thresholds; Finance hand-off contract details.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — instruction shape + adapter contract are complete and financial-state-free.
- **Can implementation proceed without the decision?** No — no capital instruction persistence, no Finance submission/hand-off endpoint.

#### FIR-013 — Family Loan policy and Finance hand-off
- **Decision ID:** FIR-013
- **Architecture component affected:** loan architecture (§21); W-G (loan); W9/W10; CFG-LD-1/2; ADR-INT-01; `family:loan.request` (draft).
- **Technical mechanism required:** non-financial instruction record (terms-source document references, approvals, Finance/legal references); one-way adapter (KDD-6); assessment-only engine use.
- **Policy value required:** purposes, lender/borrower, approvals, documentation, interest, repayment, default, restructuring, tax, accounting, legal treatment, Finance integration.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — instruction shape + adapter contract are complete and loan-book-free.
- **Can implementation proceed without the decision?** No — no loan instruction persistence or hand-off; never a family loan ledger (denylist).

#### FIR-014 — Jurisdiction and conflict-of-laws model
- **Decision ID:** FIR-014
- **Architecture component affected:** jurisdiction architecture (§11); jurisdiction gate on sensitive writes; CFG-JX-1/2; ADR-FIR-014.
- **Technical mechanism required:** jurisdiction gate (ratified mapping + valid reference + recorded legal review); conflict escalation path as a CFG point; references-only data model (existing).
- **Policy value required:** governing law for institution/trust/entity/beneficiary/tax/privacy; conflict-of-laws approach; escalation path.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the gate is designed with "unmapped = FC-1"; country/jurisdiction fields remain references.
- **Can implementation proceed without the decision?** No — no jurisdiction-sensitive write decisions, no jurisdiction validation rules beyond reference validity.

#### FIR-015 — Privacy, minors, sealed and retained family records
- **Decision ID:** FIR-015
- **Architecture component affected:** classification/privacy architecture (§34–35); CFG-EV-2/VL-3; consents-driven processing; sealed vault rules.
- **Technical mechanism required:** classification defaults (structural, existing); consent checks; retention/hold application through canonical records; sealed-access denial until release rules exist.
- **Policy value required:** classification/access/consent basis/retention/deletion/legal hold/sealed-record/incapacity/audit-access rules per data class and jurisdiction.
- **Current ratification status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — conservative defaults hold; the mechanism is value-neutral.
- **Can implementation proceed without the decision?** No — no sensitive-record ingestion beyond existing reads, no retention/access/evidence field additions, no sealed-record model.

#### FIR-016 — Evidence, audit, provenance and correction contract
- **Decision ID:** FIR-016
- **Architecture component affected:** audit/event architecture (§28–29); event catalogue; W-endpoint audit contracts; T-10; ADR-FIR-016.
- **Technical mechanism required:** canonical envelope + `publishEventTx` transactional pattern (existing); per-object event/evidence profile as the ratified artifact; `authorityContext` + `policyVersion` mandatory.
- **Policy value required:** evidence types, event names, required authority context, policy versioning, effective dates, correction/supersession, retention rules per object.
- **Current ratification status:** PARTIAL — BLOCKING PHASE 3 (canonical stores + envelope exist; object profiles absent).
- **Can architecture proceed without the decision?** Yes — the catalogue is designed; the generic envelope is sufficient to record every denial today.
- **Can implementation proceed without the decision?** No — no material mutation may proceed without its ratified object profile (register position: "blocks any material mutation").

#### FIR-020 — Existing family-member record lifecycle
- **Decision ID:** FIR-020
- **Architecture component affected:** member lifecycle (§12, §25); W2 lifecycle part; CFG-MB-1; effect-bearing-state model.
- **Technical mechanism required:** standard lifecycle contract mapped to canonical enums (§25.1); transition guards (§25.2); inert-state default (§25.3).
- **Policy value required:** creation/verification/suspension/death/dispute/archival/correction lifecycle and its **effects**.
- **Current ratification status:** UNRESOLVED — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the lifecycle contract is value-neutral; all states default inert.
- **Can implementation proceed without the decision?** No — no write lifecycle, no transition constraints, no member mutations.

#### FIR-021 — Governance body persistence and membership lifecycle
- **Decision ID:** FIR-021
- **Architecture component affected:** body persistence (§16); W-D; CFG-BD-4.
- **Technical mechanism required:** projection links onto canonical `governance_bodies`/`governance_members` (KDD-4); no parallel store (prohibited by I-07/I-13 regardless).
- **Policy value required:** whether persistent body membership is required; its lifecycle relation to canonical governance members.
- **Current ratification status:** UNRESOLVED — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the canonical substrate exists; the projection is designed and optional.
- **Can implementation proceed without the decision?** No — no body/committee persistence, no membership relation tables/FKs.

#### FIR-022 — Constitutional provision/version persistence
- **Decision ID:** FIR-022
- **Architecture component affected:** provision/version registry (§15); W-C registry shape; KDD-5; ADR-FIR-022.
- **Technical mechanism required:** document-first text (canonical `documents`); provision registry as an optional projection linked to documents/resolutions/activation.
- **Policy value required:** whether a persistent provision/version registry is required; its linkage model to documents, resolutions, activation, effective periods, suspension, supersession.
- **Current ratification status:** UNRESOLVED — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — document-first works without any registry; the registry is an optimization, not a prerequisite.
- **Can implementation proceed without the decision?** No — no constitution/provision/version tables or FKs.

#### FIR-023 — Permission and separation-of-duties matrix
- **Decision ID:** FIR-023
- **Architecture component affected:** authorization/permission architecture (§26–27); SoD slots; ADR-FIR-023; every W-endpoint's authorization point.
- **Technical mechanism required:** layered guard flow (existing); draft permission matrix (§27.2) with all ten fields per permission; SoD slot-conflict checks; step-up for HIGH_RISK-class actions.
- **Policy value required:** the object/action permission matrix (read/propose/verify/assess/approve/execute/audit), separation/step-up rules, authority-proof requirements.
- **Current ratification status:** PARTIAL — BLOCKING PHASE 3 (existing five permissions + kernel controls exist; the family matrix is proposal-only).
- **Can architecture proceed without the decision?** Yes — the full draft matrix is designed with every field; nothing is added to production.
- **Can implementation proceed without the decision?** No — no write API, no approval controls, no permission additions (all §27.2 rows remain PROPOSED — NOT AUTHORIZED).

#### FIR-024 — Family vault/document linkage
- **Decision ID:** FIR-024
- **Architecture component affected:** vault architecture (§22); W-H; W11; CFG-VL-1/2.
- **Technical mechanism required:** vault remains metadata/index (existing); document linkage (FK or enforced validation) additive only; seal/succession actions through the guarded path.
- **Policy value required:** custody model (custodian authority per vault type); sealed-release rules; succession instruction effects; document-linkage integrity.
- **Current ratification status:** UNRESOLVED — BLOCKING PHASE 3.
- **Can architecture proceed without the decision?** Yes — the vault is left untouched; the linkage design is additive and optional.
- **Can implementation proceed without the decision?** No — no vault/document linkage writes, no seal/unseal/succession endpoints, no schema changes to `family_vault_items`.

#### FIR-025 — Family Capital instruction persistence
- **Decision ID:** FIR-025
- **Architecture component affected:** capital instruction table shape (§20, §49); W-G (capital tables); idempotency design.
- **Technical mechanism required:** non-financial instruction table (seven-mandate fields; forbidden-field list); Finance reference field (write-once); idempotency via canonical records.
- **Policy value required:** whether a persistent non-financial instruction record is justified; which references, lifecycle, legal-owner, Finance-request, and idempotency fields are required.
- **Current ratification status:** UNRESOLVED — BLOCKING PHASE 3 (depends on FIR-012 + FIR-016).
- **Can architecture proceed without the decision?** Yes — the shape is designed and financially inert.
- **Can implementation proceed without the decision?** No — no instruction table/index/FK design execution.

#### FIR-026 — Family Loan instruction persistence
- **Decision ID:** FIR-026
- **Architecture component affected:** loan instruction table shape (§21, §49); W-G (loan tables).
- **Technical mechanism required:** non-financial instruction table (seven-mandate; terms-source document refs; approvals; Finance/legal refs); idempotency via canonical records.
- **Policy value required:** whether a persistent non-financial loan instruction is justified; which legal/Finance references and lifecycle fields are required.
- **Current ratification status:** UNRESOLVED — BLOCKING PHASE 3 (depends on FIR-013 + FIR-016).
- **Can architecture proceed without the decision?** Yes — the shape is designed and loan-book-free.
- **Can implementation proceed without the decision?** No — no instruction table/index/FK design execution.

#### FIR-027 — Explicit family policy-decision register operation
- **Decision ID:** FIR-027
- **Architecture component affected:** policy-decision architecture (§24); W12; R10; S-1 operation; `family:policydecision.read` (draft).
- **Technical mechanism required:** existing `policy-decisions.ts` mechanism (raise/resolve, standing decisions, `findInventedPolicies`); operational records linked to canonical resolutions/documents; no new registry unless the canonical governance owner approves one.
- **Policy value required:** how records are submitted, assigned to accountable owners/bodies, evidenced, ratified, expired, superseded, and published to implementers.
- **Current ratification status:** PARTIAL — BLOCKING PHASE 3 (mechanism exists; institutional owners/operation not assigned).
- **Can architecture proceed without the decision?** Yes — the mechanism is canonical and designed; the FIR register is the institutional-level record.
- **Can implementation proceed without the decision?** No — no controlled closure of blocker records, no policy-resolution workflow beyond canonical governance.

#### FIR-017 — Noelia/HIVE constitutional boundary (RESOLVED)
- **Decision ID:** FIR-017
- **Architecture component affected:** every AI surface (§31; §26.2 actor classes; T-08; §28.3 AI audit).
- **Technical mechanism required:** advisory interfaces only; `assertWithinNoeliaBoundary`; `*WriteIsHuman` assertions; AI refusal in decision gate; `ai_decisions` attribution; human approval handoff via `noelia_action_requests`.
- **Policy value required:** none — the boundary itself is the ratified value (AI is advisory; never authority).
- **Current ratification status:** RESOLVED (existing canonical boundary; `POLICY_DEFINED` as a prohibition).
- **Can architecture proceed without the decision?** The decision exists and is fully designed around; no open slot.
- **Can implementation proceed without the decision?** It is a **boundary, not a grant**: it permits no new AI implementation; any future family-AI feature must use the existing governed workflow (allowlist position).

#### FIR-018 — Finance OS financial-truth boundary (RESOLVED)
- **Decision ID:** FIR-018
- **Architecture component affected:** Finance integration (§30); capital/loan architectures (§20–21); F-1…F-7; T-07.
- **Technical mechanism required:** one-way instruction adapter (KDD-6); reference-only status mirroring; forbidden-field prohibitions (I-02); Finance-owned controls.
- **Policy value required:** none — the boundary itself is the ratified value (Finance OS is canonical financial truth).
- **Current ratification status:** RESOLVED (existing canonical boundary; `POLICY_DEFINED` as a prohibition).
- **Can architecture proceed without the decision?** The decision exists and is fully designed around; no open slot.
- **Can implementation proceed without the decision?** It is a **boundary, not a grant**: it authorizes no new financial adapter (allowlist position); legal effects still require FIR-012/013.

#### FIR-019 — Identity, legal entity, and audit canonical ownership (RESOLVED)
- **Decision ID:** FIR-019
- **Architecture component affected:** identity/tenant/legal/audit/event architecture (§8–11, §28–29); I-04/I-05/I-06/I-13; every candidate table (reuse mandate).
- **Technical mechanism required:** reuse of canonical `parties`/`users`/`tenants`/`legal_entities`/`delegations`/`documents`/`audit_log`/`enterprise_events`; no duplicate masters; extension-only changes.
- **Policy value required:** none — the boundary itself is the ratified value (canonical BEYU ownership).
- **Current ratification status:** RESOLVED (existing canonical boundary; `POLICY_DEFINED` as a prohibition).
- **Can architecture proceed without the decision?** The decision exists and is fully designed around; no open slot.
- **Can implementation proceed without the decision?** It is a **boundary, not a grant**: it authorizes no new reference/persistence model (allowlist position); all future records are references/extensions, gated by their own FIRs.

### 47.3 Matrix invariants

1. **Every** architecture component in sections 1–39 maps to ≥1 FIR or to a resolved boundary; none is orphaned (cross-reference: Appendix E).
2. "Architecture proceeds = yes" means the component's **design** is complete and ratification-neutral; it never means the component may ship.
3. "Implementation proceeds = no" holds for 24 of 27 decisions; the three RESOLVED boundaries never authorize implementation of anything new.
4. Any future ratification must be mapped to this matrix **before** an allowlist entry is drafted (gate G-3D format).

---
# Part X — Consolidated models, remaining decisions, roadmap, final report

## 48. Conceptual domain model (consolidated)

### 48.1 The governed relationship and instruction layer (restated with this spec's mechanism mapping)

```text
Institutional Family (scope: tenant default; institution record optional — FIR-001)
   → FamilyMember (party relationship; lineage edges + document-bound evidence)
   → ParticipationRights (six independent axes; resolution-backed; no derivation)
Forum/Committee (canonical governance bodies; mandate-scoped; reserved matters protected)
   → governed Resolution / Vote / Approval (the only decision engine)
   → canonical Delegation (exclusive; human→human)
ConstitutionProvision (document-first text; subordinate per I-08; resolution-ratified; activation-gated)
EligibilityDetermination (domain-specific; non-confering; assessment history)
BeneficiaryRecord (trust-scoped registry; verified references/outcomes; entitlement is legally owned)
CapitalInstruction / LoanInstruction (non-financial; one-way Finance hand-off; reference-only)
VaultItem (metadata/index; document-bound; sealed per ratified custody)
PolicyDecisionRequirement (canonical absence record; raised by gate, resolved by governance only)
All governed mutations → AuditLog + EnterpriseEvent (one transaction; I-11)
Noelia (advisory only) → ai_decisions + action requests → HUMAN → canonical path
```

### 48.2 Six categories + cross-cutting concerns (operational placement)

The six categories (Business Development, Wealth Management, Wealth Planning, Family Governance, Lifestyle Management, Philanthropy) consume the layer above; none creates its own store of authority or money. The cross-cutting concerns (Family Constitution, Stewardship, Education, Governance, Capital, Legacy) are capabilities inside Family Office — not a seventh category, not six new ledgers (contract §13; §4.2).

### 48.3 Domain invariants recap (verifiable set)

D-1…D-6 (§3.3) + I-01…I-16 (§1.3) + F-1…F-7 (§30.2) + UI invariants (§33.2) + permission invariants (§27.3) + error invariants (§37.2) + observability invariants (§38.2) + anti-fabrication rule (§39.4). These constitute the complete invariant set a Phase 3C spec and Phase 3D implementation must satisfy (T-18 validates the design-level set).

## 49. Conceptual data model

### 49.1 Entity catalog — classification

**A. EXISTING CANONICAL TABLES (reused; no change authorized in Phase 3A; extension gated as listed):**

| Table (module.file) | Owner | Family role | Extension candidate (gated) |
|---|---|---|---|
| `parties` (identity) | Identity | party master; anti-duplication | none |
| `users` (identity) | Identity | principal; GlobalUserID | none |
| `delegations` (identity) | Identity/Governance | exclusive delegation store | none (reference-only consumption) |
| `consents` (identity) | Identity/Privacy | lawful basis records | consent purposes per FIR-015 (data, not schema) |
| `tenants` (core) | Kernel | isolation root | none |
| `countries`, `jurisdictions` (core) | Kernel | legal references | none |
| `legal_entities` (core) | Kernel | attribution/mandate anchors | none |
| `family_members` (people) | Family Office | registry projection | verification/evidence refs + lifecycle extension (FIR-004/020); parent FK/temporality (FIR-005); uniqueness fate (FIR-002) |
| `beneficiaries` (people) | Family Office + legal attribution | trust-scoped registry | constraint per FIR-010; effective-period model per FIR-009 |
| `family_vault_items` (people) | Family Office | metadata/index | document linkage + sealed model (FIR-024/015) |
| `documents` (platform) | Platform | content of record (evidence, instruments, constitution text) | none (referenced) |
| `retentionPolicies` (platform) | Platform | retention/hold | retention values per FIR-015 (data) |
| `audit_log`, `enterprise_events`, `audit_chain_heads` (platform) | Platform | mutation history | none (family event catalogue is data) |
| `ai_decisions`, `noelia_action_requests` (platform) | Platform | AI attribution + handoff | none |
| `idempotencyRecords`, `featureFlags`, `architectureDecisions` (platform) | Platform | submission idempotency, capability activation, ADR registry | none |
| `constitutionArticles`, `policies` (governance) | Control plane | policy hierarchy; family policies = subordinate rows | family-domain policy rows (data, per FIR) |
| `governance_bodies`, `governance_members` (governance) | Governance | family body substrate | family seat links (FIR-008/021) |
| `resolutions`, `resolutionVotes`, `approvals` (governance) | Governance | decision engine | none (referenced) |
| `financialPeriods`, `ledgerAccounts`, `journalEntries/Lines`, `treasuryPositions`, `capitalRequests`, `waterfall*`, `tax*` (finance) | **Finance OS** | canonical financial truth | **none, ever, from family** (I-02) |

**B. NEW TABLE CANDIDATES (all POLICY-DEPENDENT; each blocked by its FIRs; seven-mandate per table below):**

| Table | Class | Policy dependency | Migration wave |
|---|---|---|---|
| `family_institutions` | POLICY-DEPENDENT | FIR-001 | W-A |
| `family_lineage_evidence` | NEW TABLE CANDIDATE | FIR-004, FIR-016 | W-B |
| `family_relationship_history` (only if FIR-005 chooses temporality) | POLICY-DEPENDENT | FIR-005 | W-B |
| `family_constitution_versions` | NEW TABLE CANDIDATE | FIR-006/007/022 | W-C |
| `family_constitution_provisions` (projection) | POLICY-DEPENDENT | FIR-022 (KDD-5: document-first) | W-C |
| `family_forum_memberships` (seat links) | NEW TABLE CANDIDATE | FIR-008/021 | W-D |
| `family_participation_grants` | NEW TABLE CANDIDATE | FIR-008 (+FIR-003 for effects) | W-E |
| `family_eligibility_determinations` | NEW TABLE CANDIDATE | FIR-009 | W-E |
| `family_capital_instructions` | NEW TABLE CANDIDATE | FIR-012/025/016 | W-G |
| `family_loan_instructions` | NEW TABLE CANDIDATE | FIR-013/026/016 | W-G |
| `family_policy_decision_records` (only if canonical governance owner approves persistence) | POLICY-DEPENDENT | FIR-027 | S-1 dependent |

### 49.2 Seven-mandate detail for each candidate table

Mandates: (1) canonical ownership, (2) purpose, (3) attributes, (4) relationships + cardinality, (5) lifecycle, (6) authorization, (7) audit requirement + policy dependency + migration dependency.

**T1 `family_institutions`** (W-A; FIR-001)
- Ownership: Family Office; tenant-scoped; references instrument documents.
- Purpose: policy-defined institution scope root (KDD-1 refinement of tenant default).
- Attributes (candidate, each mandated): `id`; `tenantId` (notNull FK); `code`; `name`; `scopeType` (ratified scope model enum — value per FIR-001); `scopeEntityIds` (jsonb refs to legal entities, if multi-entity); `formationInstrumentDocId` (ref `documents`); `governingJurisdictionId` (ref `jurisdictions`); `status` (lifecycleStatusEnum); `classification` (default HIGHLY_RESTRICTED); `createdAt`.
- Relationships: Tenant 1..n Institution; Institution 0..n LegalEntity (scope refs, n..n reference list); Institution n..0..1 formation document.
- Lifecycle: standard contract (§25) mapped to lifecycleStatusEnum.
- Authorization: `family:institution.read` (draft) for read; formation/management per ratified formation authority (FIR-001) + `family:institution.manage` candidate (PROPOSED — NOT AUTHORIZED).
- Audit: `FAMILY_INSTITUTION_CREATED/CHANGED` (catalogue extension at S-2) with authority context + instrument ref.
- Policy dependency: FIR-001 (existence, scope model, owner). Migration: W-A, after formation evidence ratified.

**T2 `family_lineage_evidence`** (W-B; FIR-004/016)
- Ownership: Family Office evidence register; evidence content in `documents`.
- Purpose: bind descent-edge assertions to verified documents + verifier + effective period (KDD-3).
- Attributes: `id`; `tenantId`; `memberId` (FK family_members); `parentMemberId` (text, consistent with member row — validation per FIR-005 model); `relationship` (LINEAGE_RELATIONSHIPS value); `documentIds` (jsonb refs `documents`, each with checksum at binding time); `verifierUserId` (ref users); `verificationMethod`; `jurisdictionCode` (ref); `effectiveFrom`/`effectiveTo`; `status` (verificationStatusEnum); `classification` (default HIGHLY_RESTRICTED); `createdAt`.
- Relationships: Member 1..n edges; Edge n..n documents (ref list, validated); Verifier 1..n.
- Lifecycle: DRAFT→DOCUMENTED→VERIFIED/DISPUTED (verificationStatusEnum) + supersession (new binding supersedes; prior retained).
- Authorization: `family:evidence.submit` (submitter) / `family:lineage.verify` (verifier) — drafts; SoD submitter≠verifier; step-up.
- Audit: `FAMILY_EVIDENCE_LINKED`, `FAMILY_MEMBER_VERIFIED`, `FAMILY_LINEAGE_CORRECTED` with evidence doc IDs + checksums.
- Policy dependency: FIR-004 (evidence authority/verifiers), FIR-016 (event profile). Migration: W-B.

**T3 `family_relationship_history`** (W-B; only if FIR-005 ratifies temporality)
- Ownership: Family Office (registry integrity).
- Purpose: preserve prior parent/child assertions with evidence and correction authority (temporal model).
- Attributes: `id`; `tenantId`; `memberId`; `parentMemberId`; `relationshipToParent`; `effectiveFrom`/`effectiveTo`; `supersededById`; `correctionAuthorityRef` (resolution id); `evidenceDocIds` (jsonb); `classification`.
- Relationships: Member 1..n history rows; history n..0..1 correction resolution.
- Lifecycle: append-only history; rows immutable once superseded.
- Authorization: `family:lineage.verify` + correction authority per CFG-LN-2.
- Audit: `FAMILY_LINEAGE_CORRECTED` must reference prior row id + new row id.
- Policy dependency: FIR-005 (existence decision + model). Migration: W-B (contingent).

**T4 `family_constitution_versions`** (W-C; FIR-006/007/022)
- Ownership: Family Office projection; **text in `documents`** (KDD-5); authority via `policies`/`resolutions`.
- Purpose: versioned constitution state with ratification + activation linkage.
- Attributes: `id`; `tenantId`; `institutionId` (ref T1, nullable if tenant-root); `documentId` (notNull ref `documents` — the text of record); `version` (semver string); `status` (versionStatusEnum / decisionActivationStateEnum per §25 mapping); `ratifyingResolutionId` (ref resolutions); `quorumEvidence` (jsonb: electorate snapshot ref + counts); `thresholdRef` (policy record id — CFG-CON-3); `effectiveFrom`/`effectiveTo`; `supersededById`; `classification`.
- Relationships: Version n..1 document (1:1 text); Version n..1 ratifying resolution; Institution 1..n versions.
- Lifecycle: DRAFT→TABLED→APPROVED→ACTIVATED(EFFECTIVE)→SUSPENDED/SUPERSEDED/RETIRED (§25.1 mapping).
- Authorization: `family:constitution.propose` (proposal); ratification via canonical governance (FIR-006 authority); activation per CFG-CON-6.
- Audit: `FAMILY_CONSTITUTION_PROPOSED/RATIFIED/ACTIVATED/SUSPENDED/SUPERSEDED` with supremacy-check result.
- Policy dependency: FIR-006 (authority), FIR-007 (lifecycle values), FIR-022 (persistence decision). Migration: W-C.

**T5 `family_constitution_provisions`** (W-C; FIR-022; KDD-5 projection)
- Ownership: Family Office projection of document sections; **not** a text store (text stays in `documents`).
- Attributes: `id`; `tenantId`; `versionId` (ref T4); `provisionCode`; `domain` (CONSTITUTION_DOMAINS value); `textReference` (document id + section locator + checksum at projection time); `status`; `jurisdictionCode`; `classification`.
- Relationships: Version 1..n provisions; provision n..1 document section.
- Lifecycle: follows version lifecycle; provisions are read-mostly (changes = new version).
- Authorization: read per `family:constitution.read` (draft); mutation only via version workflow.
- Audit: version events cover provisions; projection drift (checksum) is an alert (§38.1).
- Policy dependency: FIR-022 (existence — document-first works without this table). Migration: W-C (contingent).

**T6 `family_forum_memberships`** (W-D; FIR-008/021)
- Ownership: Family Office projection; **canonical seats in `governance_members`**.
- Purpose: link family members to canonical body seats with instrument + term (projection, not a parallel store — KDD-4).
- Attributes: `id`; `tenantId`; `memberId` (ref family_members); `governanceBodyId` (notNull ref governance_bodies); `governanceMemberId` (notNull ref governance_members — the canonical seat); `seatRole` (mirrors canonical, validated); `appointmentInstrumentDocId` (ref documents); `termFrom`/`termTo`; `authorityRef` (policy record / resolution id per CFG-BD-2); `classification`.
- Relationships: Body 1..n; Member 1..n; canonical governance_member 1:1 (integrity check enforced in-DB as FK).
- Lifecycle: appointment→retirement/removal; mirrors canonical seat state (drift = alert).
- Authorization: `family:forum.manage` (draft) + appointer authority per CFG-BD-2; SoD appointer≠appointee.
- Audit: `FAMILY_BODY_MEMBER_APPOINTED/REMOVED` with instrument ref.
- Policy dependency: FIR-008 (mandates/authority), FIR-021 (persistence decision). Migration: W-D.

**T7 `family_participation_grants`** (W-E; FIR-008 + FIR-003 for effects)
- Ownership: Family governance (resolution-backed).
- Purpose: per-axis participation rights, independently granted (I-10).
- Attributes: `id`; `tenantId`; `memberId`; `forumId` (ref body); `axis` (PARTICIPATION_AXES value); `granted` (bool); `grantResolutionId` (notNull ref resolutions); `effectiveFrom`/`effectiveTo`; `rationale`; `classification`.
- Relationships: Member 1..n grants (one per axis per body); Grant n..1 resolution.
- Lifecycle: grant window + suspension/revocation by resolution; no derivation between axes (enforced: writing one axis never writes another).
- Authorization: `family:forum.manage` (draft) + electorate authority per CFG-BD-1.
- Audit: grant/withdraw events with resolution ref.
- Policy dependency: FIR-008 (bodies/mandates), FIR-003 (what grants may imply — effects). Migration: W-E.

**T8 `family_eligibility_determinations`** (W-E; FIR-009)
- Ownership: Family Office assessment record (**not** legal entitlement).
- Attributes: `id`; `tenantId`; `memberId`; `domain` (ELIGIBILITY_DOMAINS value); `result` (ELIGIBILITY_RESULTS value); `rationale`; `evidenceDocIds` (jsonb); `engineVersion` + `inputChecksum` (determinism proof); `jurisdictionCode`; `assessedByUserId`; `effectiveFrom`/`effectiveTo` (assessment validity, not entitlement dates); `classification` (default HIGHLY_RESTRICTED).
- Relationships: Member 1..n determinations (per domain/period); n..n evidence docs.
- Lifecycle: assessment is point-in-time + validity window; superseded by re-assessment (history retained).
- Authorization: `family:eligibility.assess` (draft) + assessor role per CFG-EL-3.
- Audit: `FAMILY_ELIGIBILITY_DETERMINED` with engine version + checksum.
- Policy dependency: FIR-009 (rules/authority), FIR-003 (relationship inputs), FIR-004 (evidence). Migration: W-E.
- **Prohibited fields (mandate denial):** no entitlement percentage, no trust distribution field, no auto-conferment flag — D-2.

**T9 `family_capital_instructions`** (W-G; FIR-012/025/016)
- Ownership: Family Office instruction; **Finance OS owns all financial state**.
- Attributes (non-financial only): `id`; `tenantId`; `institutionId` (nullable ref); `purpose` (text, non-financial description); `requesterPartyId` (ref parties); `targetLegalEntityId` (notNull ref legal_entities); `policyRefs` (jsonb policy record ids); `resolutionIds` (jsonb refs resolutions); `assessmentSummary` (jsonb: engine version + input checksum + assessment result); `amountSubmitted` (numeric — **submission payload echo only**, HIGHLY_RESTRICTED, F-6; not a balance); `currencySubmitted` (text, echo); `financeRequestId` (text ref, write-once after submit, F-4); `familyStatus` (non-financial lifecycle: DRAFT|SUBMITTED|REJECTED_BY_FINANCE|WITHDRAWN|CLOSED_BY_REFERENCE — states mirror by reference, F-1); `classification` (HIGHLY_RESTRICTED); `createdAt`.
- Relationships: Instruction n..1 target entity; n..0..1 Finance request (ref, immutable); n..n policy/resolution refs.
- Lifecycle: non-financial contract only (§25 mapping subset); terminal by reference.
- Authorization: `family:capital.request` (draft) + authority per CFG-CP-1; SoD requester≠approver; step-up (HIGH_RISK class).
- Audit: `FAMILY_CAPITAL_INSTRUCTION_CREATED/SUBMITTED` with authority block + Finance ref.
- Policy dependency: FIR-012 (owner/authority/contract), FIR-025 (persistence shape), FIR-016 (profile). Migration: W-G.
- **Prohibited fields (mandate denial):** no balance, account number, commitment of record, posting, waterfall line, portfolio ref, receivable/payable — I-02/F-2.

**T10 `family_loan_instructions`** (W-G; FIR-013/026/016)
- Ownership: Family Office instruction; **Finance/legal owners own contract, receivable, disbursement, tax, postings**.
- Attributes (non-financial only): `id`; `tenantId`; `purpose`; `borrowerPartyId` (ref parties); `lenderLegalEntityId` (notNull ref legal_entities); `termsSourceDocIds` (jsonb refs — instrument/policy documents); `jurisdictionCode` (ref); `approvalResolutionIds` (jsonb); `assessmentSummary` (jsonb engine version + checksum); `financeRef` / `legalRef` (text refs, write-once); `familyStatus` (non-financial lifecycle, F-1); `classification` (HIGHLY_RESTRICTED); `createdAt`.
- Relationships: as T9 (borrower/lender refs; write-once refs).
- Lifecycle: non-financial contract only.
- Authorization: `family:loan.request` (draft) + authority per CFG-LD-1; SoD; step-up.
- Audit: `FAMILY_LOAN_INSTRUCTION_CREATED/SUBMITTED`.
- Policy dependency: FIR-013 (policy/contract), FIR-026 (shape), FIR-016 (profile). Migration: W-G.
- **Prohibited fields (mandate denial):** no interest of record, repayment posting, receivable, disbursement, impairment, tax position — I-02/F-2.

**T11 `family_policy_decision_records`** (S-1 dependent; FIR-027; contingent on canonical governance owner approval)
- Ownership: Family Office operational register; ratification acts in canonical governance.
- Purpose: persist operational `PolicyDecisionRequirement` records with owner assignment and publication.
- Attributes: `id`; `tenantId`; `domain`; `firRef` (FIR-xxx or operational ref); `decisionStatement`; `rationale`; `authorityRequired`; `raisedByUserId`; `raisedAt`; `ownerBodyRef` / `ownerUserId` (assigned per CFG-PD-1); `status` (OPEN|IN_REVIEW|RATIFIED|SCOPED_OUT|EXPIRED|SUPERSEDED); `ratificationRef` (resolution/policy/instrument id); `effectiveDate`; `classification` (INTERNAL).
- Relationships: n..0..1 ratification ref (canonical governance); 1:1 with engine `PolicyDecisionRequirement` identity where raised via engine.
- Lifecycle: standard; RESOLVED only by governance reference (W12).
- Authorization: read `family:policydecision.read` (draft); resolve = canonical governance permissions; AI refused.
- Audit: `POLICY_DECISION_RAISED/_RESOLVED`.
- Policy dependency: FIR-027 (operation + persistence decision). Migration: after S-1 ratifies operation.

### 49.3 Field-level discipline

1. Every candidate field above passed the seven-mandate at the table level; any field lacking a clear owner/purpose/source-of-truth was excluded during design (e.g., no `institutionType` enum invented beyond the ratified-scope placeholder; no `entitlementPct` duplication in T8; no balance fields in T9/T10).
2. Enum values are either existing canonical enums or vocabulary already present in the Phase 1–2 engines (LINEAGE_RELATIONSHIPS, PARTICIPATION_AXES, CONSTITUTION_DOMAINS, etc.) — no new legal-effect vocabulary is invented.
3. `POLICY-DEPENDENT TABLE` means: the table exists only if its FIR ratifies its existence; `NEW TABLE CANDIDATE` means: the table is expected but its exact shape waits on its FIRs (seven-mandate re-validated at S-2).

## 50. Exact remaining policy decisions required before implementation

**24 of 27 decisions block Phase 3 implementation.** The three RESOLVED (FIR-017/018/019) are boundaries, not grants. The exact open decisions, with the minimum ratification artifact each requires:

| # | FIR | Exact decision needed | Minimum ratification artifact |
|---|---|---|---|
| 1 | FIR-001 | What constitutes a Family Institution; who establishes/owns/governs it; canonical identity; scope model | Ratified formation policy/instrument + authorized sponsor + legal review |
| 2 | FIR-002 | Cross-tenant party membership permitted?; controls; uniqueness fate | Tenant/identity/privacy decision + legal review |
| 3 | FIR-003 | Legal effects per relationship class (descent, adoption, spouse, dependant, stepchild, guardianship, affinity, minor, incapacity, deceased, disputed) per jurisdiction | Instrument/jurisdiction-specific ratified policy or institution constitution |
| 4 | FIR-004 | Authoritative evidence types; verifier roles; dispute/correction processing | Ratified evidence/verification policy (registrar/counsel/trustee model) |
| 5 | FIR-005 | Parent-edge model: FK / temporal / none; tenant-consistency rule | Legal + data-governance decision (after FIR-004) |
| 6 | FIR-006 | Constitution proposer/electorate/ratifier/suspender/superseder authority matrix | Ratified constitutional authority matrix (legal + family authority) |
| 7 | FIR-007 | Quorum, threshold, supermajority, effective date, emergency, suspension, supersession, conflict rules | Ratified constitutional lifecycle (same authority, subject to superior authority) |
| 8 | FIR-008 | Body/role mandates; appointment/removal authority; terms; recusal; non-delegable powers — per instrument/jurisdiction | Ratified role-to-authority matrix (trustees/protectors/legal entity authority as applicable) |
| 9 | FIR-009 | Beneficiary eligibility rules per trust; trustee-authority proof form; trust-specific rules | Trustee/instrument confirmation per trust + legal review |
| 10 | FIR-010 | Beneficiary uniqueness/overlap rule per instrument | Trustee/instrument-owner decision per trust |
| 11 | FIR-011 | Delegable vs non-delegable family powers; scope/limit/expiry/revocation/emergency/segregation rules | Ratified delegation matrix with source authority |
| 12 | FIR-012 | Capital legal/economic owner; authority + thresholds; Finance hand-off contract | Legal + Finance + investment policy ratification |
| 13 | FIR-013 | Loan purposes/lender/borrower/approvals/terms/tax/accounting/legal treatment + Finance contract | Legal + tax + Finance + fiduciary ratification |
| 14 | FIR-014 | Governing jurisdiction per object class; conflict-of-laws approach; escalation path | Legal counsel ratification |
| 15 | FIR-015 | Classification/access/consent basis/retention/deletion/legal hold/sealed records/incapacity rules | Data protection/legal owner ratification (classification + retention matrix) |
| 16 | FIR-016 | Per-object audit/event/evidence/correction/retention profiles | Audit/control + data owner ratified event catalogue |
| 17 | FIR-020 | Member lifecycle states + effects (create/verify/suspend/death/dispute/archive/correct) | Ratified lifecycle/transition policy (after FIR-003..005) |
| 18 | FIR-021 | Body persistence requirement + canonical governance linkage lifecycle | Governance mandate/membership policy |
| 19 | FIR-022 | Provision/version registry requirement + linkage model | Constitution authority + governance owner decision (after FIR-006/007) |
| 20 | FIR-023 | Production permission/SoD/step-up/authority-proof matrix (from §27 draft) | Security/RBAC owner + domain authority ratified matrix |
| 21 | FIR-024 | Vault custody/access/sealed-release/succession + document-linkage integrity | Information governance + custody authority ratification |
| 22 | FIR-025 | Capital instruction persistence: field set, lifecycle, idempotency | FIR-012 + Finance contract + audit profile ratified |
| 23 | FIR-026 | Loan instruction persistence: field set, lifecycle, references | FIR-013 + Finance/legal contract + audit profile ratified |
| 24 | FIR-027 | Register operation: owners, assignment, evidence, expiry, supersession, publication | Governance operating resolution assigning accountable owners per FIR |

**Plus (merge-policy, non-schema):** PR #8's Vercel failure must be resolved or formally waived per repository policy before any Phase 3D PR merges (blocker matrix row "PR CI policy").

**Ratification sufficiency** for each row: accountable authority + jurisdiction + effective date + evidence reference + superior-instrument constraint statement (§45.2). Anything less is not ratification.

## 51. Phase 3A → 3B → 3C → 3D roadmap

```text
PHASE 3A — TECHNICAL ARCHITECTURE            [AUTHORIZED — THIS DOCUMENT]
  Deliverable: this specification (sections 1–46 + outputs 1–16)
  Gate G-3A: complete, A/B-separated, 27-decision mapped, no policy values chosen
     │
     ▼
PHASE 3B — POLICY/LEGAL RATIFICATION         [REQUIRED — external to BEYU code]
  Deliverable: ratified records for each in-scope FIR (or explicit scoping-out)
  Operation: per FIR-027 regime (once ratified); owners assigned; evidence recorded
  Gate G-3B: sufficiency test (§45.2) per FIR; allowlist entries drafted
     │
     ▼   (per ratified scope — may be incremental)
PHASE 3C — IMPLEMENTATION SPECIFICATION      [REQUIRES 3A + APPLICABLE RATIFICATION]
  Deliverable: bounded implementation spec(s): exact schema (seven-mandate re-validated),
               endpoints, permissions, audit profiles, tests (T-01…T-18 applicability),
               migration wave(s), ADRs (ADR-FIR-*, ADR-INT-*, ADR-SEC-01)
  Gate G-3C: spec approval; T-18 documentation validation of spec↔ratification alignment
     │
     ▼   (per increment)
PHASE 3D — SCHEMA / MIGRATION / API / PERMISSIONS / UI   [REQUIRES EXPLICIT IMPLEMENTATION AUTHORIZATION]
  Deliverable: waves W-A…W-H + endpoints R*/W* + production permissions + UI surfaces,
               strictly per approved spec; flags-gated; CI green (incl. PR CI policy row)
  Gate G-3D: allowlist entry per increment (required-entry format); assurance checks green
     │
     ▼
ASSURANCE & CATEGORY EXPERIENCES (S-4)
  Category read/orchestration surfaces; audit dashboards; controls testing; data quality
```

**Roadmap invariants:** 3B ratification is never performed by BEYU code, AI, or an implementer; 3C specs may cover only ratified scope; 3D ships only allowlisted increments; every gate is evidence-based (§44.2). The architecture (3A) is the stable substrate: each ratification selects a value at a CFG point and a shape already designed — no redesign.

## 52. Final status report and non-action confirmation

### 52.1 Deliverables produced (this phase)

1. ✅ Complete Phase 3A architecture specification — sections 1–46 (this document).
2. ✅ 27-decision architecture dependency matrix — §47 (seven fields per FIR).
3. ✅ Conceptual domain model — §48 (consolidated) + §6/§7.
4. ✅ Conceptual data model — §49 (entity catalog + seven-mandate detail).
5. ✅ Draft API architecture — §32 (all DESIGN ONLY — NOT IMPLEMENTATION AUTHORIZED).
6. ✅ Draft permission architecture — §27 (all new rows PROPOSED — NOT AUTHORIZED).
7. ✅ Authorization architecture — §26 (layered flow, actor classes, SoD slots, authority proof).
8. ✅ Audit/event architecture — §28/§29 (event catalogue, transactional invariants, denial audit).
9. ✅ Finance OS integration architecture — §30 (F-1…F-7, one-way contract).
10. ✅ Noelia/HIVE integration architecture — §31 (advisory interfaces + prohibitions).
11. ✅ Fail-closed architecture — §36 (FC-1 universal behavior + fail-closed points inventory).
12. ✅ Migration strategy — §40 (waves W-A…W-H; migration 0018 BLOCKED).
13. ✅ Testing strategy — §39 (T-01…T-18 + properties P-1…P-4; none added to production).
14. ✅ Implementation dependency graph — §42 (DAG + dependency rules).
15. ✅ Phase 3A → 3B → 3C → 3D roadmap — §51 + gates §44 + sequence §43.
16. ✅ Exact remaining policy decisions — §50 (24 items + merge-policy item).

### 52.2 Stop-condition report (per §0.5)

No stop condition was triggered that required halting: every apparent conflict was resolved by **flagging** (not guessing):
- Repository evidence vs architecture: no conflict found (all citations verified; Appendix B).
- Policy-defined technical invariants: none required — all invariants are structural; policy-dependent behaviors are gated (FC-1).
- Ambiguous canonical owners: none (I-04/I-05/I-06/I-13 owners are explicit in the repository).
- Unratified policy choices: none made; 24 items flagged in §50.
- Finance OS ownership: preserved by F-1…F-7 (violation would be a design defect — none exists).
- Noelia/HIVE authority: none granted; I-03/FIR-017 enforced by design.
- Tenant/entity isolation: guaranteed within tenant by construction (I-05); cross-tenant semantics flagged (FIR-002), not assumed.

`ARCHITECTURE DECISION REQUIRED` items (technical, to close at S-2, not guessed here): ADR-FIR-005 (parent-edge model selection — requires FIR-005 input), ADR-FIR-022 (confirm/revise KDD-5 — requires FIR-022 input), ADR-INT-01 (Finance reference scheme details — requires Finance owner input). These are **selections pending inputs**, recorded, not unresolved guesses.

### 52.3 Final status

```text
PHASE 3A ARCHITECTURE STATUS:
READY

PHASE 3 IMPLEMENTATION STATUS:
NOT AUTHORIZED
```

### 52.4 Explicit non-action confirmation

- ✅ **No migration 0018 created.** (No migration of any number created; none exists by that name.)
- ✅ **No schema changed.** (`src/db/schema/**` untouched; no drizzle-kit changes; no migration files.)
- ✅ **No production API created.** (`src/app/api/**` untouched; §32 is contract text only.)
- ✅ **No production permission added.** (`PERMISSIONS` in `src/lib/constants.ts` untouched; §27.2 rows are proposals only.)
- ✅ **No UI created.** (`src/app/**` untouched; §33 is design only.)
- ✅ **No Finance OS changed.** (`src/lib/finance/**`, `src/db/schema/finance.ts` untouched.)
- ✅ **No Noelia/HIVE authority changed.** (`src/lib/noelia*`, `src/lib/family/alignment.ts` untouched; boundaries preserved, not expanded.)
- ✅ **No Phase 1–2 engine changed.** (`src/lib/family/**`, `tests/family/**` untouched.)

This document is the **only** artifact added by Phase 3A. It creates no authority, no policy, no schema, no API, no permission, no UI, and no implementation obligation. The governing rule stands unchanged: EXPLICIT RATIFICATION → MAY EVENTUALLY IMPLEMENT; NO RATIFICATION → FAIL CLOSED → DO NOT IMPLEMENT.

---

# Appendix A — Marker and status vocabulary

| Marker | Used for | Normative effect |
|---|---|---|
| `TECH:` | Plane A statements | Design authorized by Phase 3A |
| `POLICY:` | Plane B slots | Unratified; FC-1 applies to dependent behavior |
| `POLICY_DEFINED` | Ratified values (FIR-017/018/019 only, as prohibitions) | Boundary enforced; not expandable |
| `POLICY DECISION REQUIRED (FIR-xxx)` | Unresolved policy | FC-1 until ratified with §45.2 evidence |
| `ARCHITECTURE DECISION REQUIRED` | Technical invariant selection pending input | Recorded ADR; not guessed |
| `DESIGN ONLY — NOT IMPLEMENTATION AUTHORIZED` | Draft endpoints (§32) | No route may be created without G-3D |
| `PROPOSED — NOT AUTHORIZED` | Draft permissions (§27.2) | No constant/role change without G-3D |
| `EXISTING CANONICAL TABLE` | Repository tables | Reused; never duplicated |
| `EXTENSION CANDIDATE` | Gated additive change | Blocked by its FIRs |
| `NEW TABLE CANDIDATE` / `POLICY-DEPENDENT TABLE` | §49.1 class B | Blocked by its FIRs |
| `BLOCKED` | Denylist/allowlist alignment | No implementation |

Status vocabulary (27-decision matrix): RESOLVED / PARTIAL / UNRESOLVED / REQUIRES LEGAL/POLICY RATIFICATION / BLOCKING PHASE 3 — as defined in the Phase 2.5 register.

# Appendix B — Repository evidence index (verified technical facts)

| Fact | Evidence (file:anchor) |
|---|---|
| Family Office = first-class, PARTIAL, HIGHLY_RESTRICTED, never separate OS | `src/lib/architecture/completeness.ts` |
| `family_members` columns + `family_members_party_uidx` (partyId unique alone) + `parent_member_id` no FK | `src/db/schema/people.ts` |
| `beneficiaries` columns; no unique constraint; `entitlementPct` numeric(9,6) | `src/db/schema/people.ts` |
| `family_vault_items` columns; vaultType set; `documentId` no FK | `src/db/schema/people.ts` |
| `parties` global MDM; `users` one GlobalUserID per party | `src/db/schema/identity.ts` |
| `delegations` shape (scope, monetaryLimit, dates, authorizedBy, revokedAt) | `src/db/schema/identity.ts` |
| `consents` (purpose, lawfulBasis, jurisdictionCode, grant/withdrawal) | `src/db/schema/identity.ts` |
| `tenants` (isolationTier default LOGICAL, parent hierarchy) | `src/db/schema/core.ts` |
| `legal_entities` (entityType 11 values, jurisdictionId, functional currency, accounting standard) | `src/db/schema/core.ts` |
| `jurisdictions` (level NATIONAL/STATE/MUNICIPAL/REGULATOR, legalSystem, effective period) | `src/db/schema/core.ts` |
| `governance_bodies` (bodyType incl. FAMILY_COUNCIL; quorumMinimum; majorityRule; reservedMatters) | `src/db/schema/governance.ts` |
| `governance_members` (seatRole; votingRights; appointment/retirement) | `src/db/schema/governance.ts` |
| `resolutions` (category set; requiredMajority; quorumMet; votes; linkedObjectType/Id; authorityPolicyId) | `src/db/schema/governance.ts` |
| `resolutionVotes` (FOR/AGAINST/ABSTAIN/RECUSED; conflictDeclared) | `src/db/schema/governance.ts` |
| `policies` (domain, jurisdictionCode, entityScope, roleScope, rules jsonb, ownerRole, approvedByResolutionId, version) | `src/db/schema/governance.ts` |
| `documents` (version, checksum, supersedes/supersededBy, jurisdictionCode, entityScope, accessPolicyId, storageUri) | `src/db/schema/platform.ts` |
| `audit_log` / `enterprise_events` / `audit_chain_heads` (hash-chained; authorityContext; policyVersion) | `src/db/schema/platform.ts` |
| `ai_decisions` (agent NOELIA, runtime HIVE, policyDecision, deniedScopes, review fields) | `src/db/schema/platform.ts` |
| `capitalRequests` (requestType set; amount/currency; status DRAFT…FUNDED) | `src/db/schema/finance.ts` |
| Finance truth tables (ledgerAccounts, journalEntries/Lines, treasuryPositions, waterfall*, tax*) | `src/db/schema/finance.ts` |
| `idempotencyRecords`, `featureFlags`, `architectureDecisions` | `src/db/schema/platform.ts` |
| Enums: classification (5 values), lifecycle (8), decisionStatus (8), decisionActivationState (9), eligibility (4), verificationStatus (4) | `src/db/schema/enums.ts` |
| Five family permissions; `family:beneficiary.manage` HIGH_RISK; FAMILY_OFFICE_PRINCIPAL HIGHLY_RESTRICTED | `src/lib/constants.ts` |
| `guarded()` (rate limit, auth, tenant scope, audit, idempotency); `requireAccess`; `can`; `filterByClearance` | `src/lib/api.ts`, `src/lib/guard.ts`, `src/lib/authz.ts` |
| `publishEventTx` transactional mutation+audit+event | `src/lib/audit.ts` |
| Engines + versions + key functions (model/institution/constitution/lineage/eligibility/capital/loan/decision-gate/alignment/policy-decisions) | `src/lib/family/*.ts` |
| `SUPERIOR_INSTRUMENTS` (9), `TRUSTEE_RESERVED_MATTERS` (8), `PARTICIPATION_AXES` (6), `FORUM_TYPES`, `GOVERNANCE_COMMITTEES`, `CONSTITUTION_DOMAINS`, `AMENDMENT_STAGES`, `DECISION_GATE_STEPS` | `src/lib/family/model.ts` |
| `NOELIA_MAY` / `NOELIA_MAY_NOT` / `assertWithinNoeliaBoundary` | `src/lib/family/alignment.ts` |
| Human-only write assertions in every engine (`assert*WriteIsHuman`) | `src/lib/family/*.ts` |
| `raisePolicyDecisionRequirement` / `resolvePolicyDecision` / `STANDING_POLICY_DECISIONS` / `findInventedPolicies` | `src/lib/family/policy-decisions.ts` |
| Self-delegation rejection; human→AI material delegation prohibited | `src/lib/governance/delegation.ts`, `src/db/schema/identity.ts` |
| Existing family UI (read-oriented, `requireAccess("family:member.read")`, tenant-scoped, force-dynamic) | `src/app/os/family/page.tsx` |
| Build tooling (scripts; drizzle/next/typescript/vitest versions) | `package.json` |

# Appendix C — Policy configuration-point register (CFG-xx)

Every CFG point is a **slot** (mechanism + consumer) with NO value. A value enters only via §45.2 ratification. Mechanisms are the four KDD-2 classes: [P] canonical policy record, [B] body configuration, [E] engine input parameter, [R] canonical reference record.

| CFG ID | Slot | Mechanism | Consumer | Governing FIR | Status |
|---|---|---|---|---|---|
| CFG-ID-1 | Consent purposes/lawful bases for member data | [R] consents | privacy gate (§35) | FIR-015 | POLICY DECISION REQUIRED |
| CFG-TN-1 | Institution scope filter root | [P]/[E] | query root (§9) | FIR-001 | POLICY DECISION REQUIRED |
| CFG-MB-1 | Member lifecycle states + effects | [E] (+lifecycleStatusEnum mapping) | lifecycle guard (§25) | FIR-020 | POLICY DECISION REQUIRED |
| CFG-MB-2 | Relationship vocabulary + effects | [P] | eligibility/lineage inputs | FIR-003 | POLICY DECISION REQUIRED |
| CFG-MB-3 | Verifier role(s) + method acceptance | [P] authority matrix | W2 gate | FIR-004/023 | POLICY DECISION REQUIRED |
| CFG-LN-1 | Evidence hierarchy per relationship/jurisdiction | [P] consumed by [E] | `assessLineageEvidence` | FIR-004 | POLICY DECISION REQUIRED |
| CFG-LN-2 | Verifier authority + dispute escalation | [P] | W2/W3 gate | FIR-004/023 | POLICY DECISION REQUIRED |
| CFG-LN-3 | Parent-edge integrity model | schema decision (additive) | W-B | FIR-005 | POLICY DECISION REQUIRED |
| CFG-CON-1 | Constitution proposer authority | [P] | W5 gate | FIR-006 | POLICY DECISION REQUIRED |
| CFG-CON-2 | Electorate definition | [E] electorate snapshot + [P] | `assessAmendment` | FIR-006 | POLICY DECISION REQUIRED |
| CFG-CON-3 | Quorum + voting threshold(s) | [E] (+[B] body fields) | `assessAmendment` | FIR-007 | POLICY DECISION REQUIRED |
| CFG-CON-4 | Ratification authority + instrument ref | [P] | activation gate | FIR-006 | POLICY DECISION REQUIRED |
| CFG-CON-5 | Amendment authority + emergency rules | [P] | amendment workflow | FIR-007 | POLICY DECISION REQUIRED |
| CFG-CON-6 | Effective-date/suspension/supersession/conflict rules | [P] | activation lifecycle | FIR-007 | POLICY DECISION REQUIRED |
| CFG-CON-7 | Constitutional jurisdictional applicability | [P] | supremacy gate | FIR-014 | POLICY DECISION REQUIRED |
| CFG-BD-1 | Body roster + mandates + role-authority matrix | [P] (+[B]) | §16 gate; participation inputs | FIR-008 | POLICY DECISION REQUIRED |
| CFG-BD-2 | Appointment/removal authority, terms, recusal, non-delegables | [P] | W6 gate | FIR-008 | POLICY DECISION REQUIRED |
| CFG-BD-3 | Quorum/majority per body | [B] (values policy-gated) | canonical voting | FIR-008 | POLICY DECISION REQUIRED |
| CFG-BD-4 | Body-membership persistence lifecycle | [P] | W-D activation | FIR-021 | POLICY DECISION REQUIRED |
| CFG-EL-1 | Eligibility rules per domain | [P] consumed by [E] | `evaluateEligibility` | FIR-003/009/014 | POLICY DECISION REQUIRED |
| CFG-EL-2 | Evidence requirements per domain | [P] | eligibility gate | FIR-004/009 | POLICY DECISION REQUIRED |
| CFG-EL-3 | Assessor/confirmation authority | [P] | R3/W-E gate | FIR-009/023 | POLICY DECISION REQUIRED |
| CFG-BF-1 | Beneficiary rules per trust | [P] | W4 gate | FIR-009 | POLICY DECISION REQUIRED |
| CFG-BF-2 | Uniqueness/overlap rule | constraint decision (W-F) | W-F activation | FIR-010 | POLICY DECISION REQUIRED |
| CFG-BF-3 | Trustee-authority proof form | [P] | W4/W2 gate | FIR-009 | POLICY DECISION REQUIRED |
| CFG-DL-1 | Delegable/non-delegable powers | [P] | delegation gate | FIR-011 | POLICY DECISION REQUIRED |
| CFG-DL-2 | Scope taxonomy/limits/revocation/emergency/segregation | [P] | delegation gate | FIR-011 | POLICY DECISION REQUIRED |
| CFG-CP-1 | Capital owner/authorities/thresholds | [P] | W7 gate | FIR-012 | POLICY DECISION REQUIRED |
| CFG-CP-2 | Finance hand-off contract (capital) | [P] + adapter config | W8 | FIR-012/016/025 | POLICY DECISION REQUIRED |
| CFG-LD-1 | Loan policy (purposes/terms/tax/accounting) | [P] | W9 gate | FIR-013 | POLICY DECISION REQUIRED |
| CFG-LD-2 | Loan hand-off contract | [P] + adapter config | W10 | FIR-013/016/026 | POLICY DECISION REQUIRED |
| CFG-JX-1 | Governing-jurisdiction mapping per object | [P] | jurisdiction gate (§11) | FIR-014 | POLICY DECISION REQUIRED |
| CFG-JX-2 | Conflict-of-laws escalation path | [P] | conflict branch | FIR-014 | POLICY DECISION REQUIRED |
| CFG-EV-1 | Evidence types/authority/workflow/correction rules | [P] | W3 + verification gate | FIR-004/016 | POLICY DECISION REQUIRED |
| CFG-EV-2 | Retention period + legal-hold rules for evidence | [R] retentionPolicies | retention job | FIR-015 | POLICY DECISION REQUIRED |
| CFG-VL-1 | Vault custody model per vault type | [P] | W11 gate | FIR-024 | POLICY DECISION REQUIRED |
| CFG-VL-2 | Sealed-release + succession + EMERGENCY access rules | [P] | vault gate | FIR-024/015 | POLICY DECISION REQUIRED |
| CFG-VL-3 | Retention/access matrix for sealed/retained records | [P] + [R] | privacy gate | FIR-015 | POLICY DECISION REQUIRED |
| CFG-GV-1 | Decision categories + authority policies per category | [P] (+[B]) | decision gate | FIR-006/008 | POLICY DECISION REQUIRED |
| CFG-EM-1 | Emergency authority (existence/holders/scope/evidence/sunset) | [P] | `assessEmergencyAuthority` | FIR-007 | POLICY DECISION REQUIRED |
| CFG-PD-1 | Register operation (owners/assignment/evidence/expiry/publication) | [P] governance operating resolution | §24 operation; W12 | FIR-027 | POLICY DECISION REQUIRED |
| CFG-PD-2 | Standing-decision treatment (ratify or scope out) | per-FIR records | S-1 backlog | per-FIR | POLICY DECISION REQUIRED |

**Completeness rule:** any future workflow that needs a policy value must reference a CFG row (or add one at S-2 with FIR mapping). A workflow with an unregistered policy need is a design defect (T-18 checks this).

# Appendix D — Architecture decision records made by this specification (KDD-xx)

| KDD | Decision (technical) | Alternatives rejected | Ratification-neutrality proof |
|---|---|---|---|
| KDD-1 | Tenant-scope default institution root; institution record optional | Institution record mandatory before any read | Reads work under any FIR-001 scope model; no FK exists pre-ratification |
| KDD-2 | Policy values in canonical policy records / body config / engine inputs / reference records | New family-owned policy tables or constants | Any ratified value is expressible via existing canonical storage; no value fixed |
| KDD-3 | Evidence = document-bound references (checksummed canonical documents) | Family-owned evidence content store | FIR-004 decides which documents/verifiers count — a value; binding is value-neutral; avoids duplicate content masters (I-13) |
| KDD-4 | Family bodies project onto canonical governance bodies/members | Parallel family governance store | I-07/I-13 prohibit parallel authority regardless of FIR-008/021 values |
| KDD-5 | Constitution text document-first; provision registry optional projection | Provision-registry-primary text store | FIR-022 may confirm or revise (ADR-FIR-022); text authority always document + resolution (I-08) |
| KDD-6 | One-way Finance hand-off adapter; reference-only mirroring | Bidirectional financial state | I-02/FIR-018 is a resolved boundary; only compliant shape (F-1…F-7) |
| KDD-7 | Single standard `POLICY_DECISION_REQUIRED` error + denial-audit event | Per-component bespoke defaults | Uniformity is technical; no value fixed; I-12 |
| KDD-8 | All endpoints via `guarded()`, tenant-scoped, human-mutation-only, idempotent | Ad-hoc auth patterns | Reuses canonical pattern; permission/scope values remain FIR-gated |

# Appendix E — Cross-reference: FIR → architecture components

| FIR | Sections | CFG points | Draft endpoints | Draft permissions | Waves | Tests | ADRs |
|---|---|---|---|---|---|---|---|
| FIR-001 | §2, §9, §48, §49(T1) | CFG-TN-1 | R11 | family:institution.read | W-A | T-01 | ADR-FIR-001 |
| FIR-002 | §8, §9, §7.2 | — | W1 | (family:member.manage re-class) | — (constraint decision) | T-01 | ADR-FIR-002 |
| FIR-003 | §12, §17 | CFG-MB-2, CFG-EL-1 | W1, W2 | family:member.propose | W-E | T-12 | — |
| FIR-004 | §13, §14 | CFG-LN-1/2, CFG-EV-1, CFG-MB-3 | W2, W3 | family:lineage.verify, family:evidence.submit | W-B | T-11 | — |
| FIR-005 | §13 | CFG-LN-3 | W2 | family:lineage.verify | W-B | T-11 | ADR-FIR-005 |
| FIR-006 | §15, §23 | CFG-CON-1/2/4, CFG-GV-1 | R5, W5 | family:constitution.propose | W-C | T-05 | — |
| FIR-007 | §15, §23, §25 | CFG-CON-3/5/6, CFG-EM-1 | W5 | — | W-C | T-05, T-14 | — |
| FIR-008 | §16, §4.1 | CFG-BD-1/2/3/4 | R6, W6 | family:forum.read/manage | W-D | T-06 | — |
| FIR-009 | §17, §18 | CFG-BF-1/3, CFG-EL-1/2/3 | R3, W4 | family:eligibility.assess, family:beneficiary.verify | W-E, W-F | T-12 | — |
| FIR-010 | §18 | CFG-BF-2 | W4 | — | W-F | T-12 | ADR-FIR-010 |
| FIR-011 | §19, §26 | CFG-DL-1/2 | — | — | — | T-13 | — |
| FIR-012 | §20, §30 | CFG-CP-1/2 | R7, W7, W8 | family:capital.request | W-G | T-07, T-15 | ADR-INT-01 |
| FIR-013 | §21, §30 | CFG-LD-1/2 | R8, W9, W10 | family:loan.request | W-G | T-07, T-15 | ADR-INT-01 |
| FIR-014 | §11 | CFG-JX-1/2, CFG-CON-7 | (jurisdiction gate on W-ends) | — | — | T-01 (scope), T-09 | ADR-FIR-014 |
| FIR-015 | §34, §35, §22 | CFG-EV-2, CFG-VL-3, CFG-ID-1 | R9 (sealed) | — | W-H | T-16 | ADR-SEC-01 |
| FIR-016 | §28, §29 | CFG-EV-1 | (audit contracts of all W) | — | — | T-10 | ADR-FIR-016 |
| FIR-020 | §12, §25 | CFG-MB-1 | W2 | family:member.manage (lifecycle part) | — | T-14 | — |
| FIR-021 | §16 | CFG-BD-4 | R6, W6 | family:forum.manage | W-D | T-06 | — |
| FIR-022 | §15 | — | R5, W5 | family:constitution.read | W-C | T-05 | ADR-FIR-022 |
| FIR-023 | §26, §27 | — | (authz of all W) | all §27.2 rows | — | T-03, T-04 | ADR-FIR-023, ADR-SEC-01 |
| FIR-024 | §22 | CFG-VL-1/2 | R9, W11 | — | W-H | T-16 | — |
| FIR-025 | §20 | CFG-CP-2 | W7, W8 | family:capital.request | W-G | T-07, T-15 | ADR-INT-01 |
| FIR-026 | §21 | CFG-LD-2 | W9, W10 | family:loan.request | W-G | T-07, T-15 | ADR-INT-01 |
| FIR-027 | §24 | CFG-PD-1/2 | R10, W12 | family:policydecision.read | — | T-09, T-18 | — |
| FIR-017 | §31, §26.2 | — | (AI boundary on all) | — | — | T-08 | ADR-INT-02 |
| FIR-018 | §30 | — | (Finance boundary on all) | — | — | T-07 | ADR-INT-01 |
| FIR-019 | §8–11, §28, §29 | — | (reuse mandate on all) | — | — | T-17 | — |

**Document control:** authored under Phase 3A authorization; baseline `da1ef20`; session branch `arena/01a03aec-beyu-os-1-0`; superseded only by a later approved architecture revision issued through the canonical governance process.
