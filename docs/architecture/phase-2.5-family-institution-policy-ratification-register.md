# Phase 2.5 — Family Institution Policy & Authority Ratification Register

**Status:** GOVERNANCE GATE — Phase 3 is blocked. This is documentation only; it creates no authority, policy, schema, API, permission, UI, or implementation obligation.

**Baseline verified before authoring:** PR #7 is merged at `da1ef20`; PR #8 is open and contains only the Phase 2.5 contract document; no migration named `0018` exists; no Phase 3 implementation exists; no change exists under `src/lib/family` or `tests/family` since `da1ef20`; working tree was clean.

## Governing hierarchy

```text
Applicable law
        ↓
Superior legal instrument / fiduciary duty
        ↓
BEYU constitutional authority
        ↓
Family Constitution
        ↓
Family policies
        ↓
Operational procedures
```

A lower level cannot amend, override, or infer authority belonging to a higher level. An absent authoritative answer produces **POLICY DECISION REQUIRED** and fails closed.

## Status vocabulary

- **RESOLVED** — an existing canonical BEYU boundary is authoritative; this does not ratify a family-specific policy.
- **PARTIAL** — an engine or kernel primitive exists, but family-specific authority/policy is unratified.
- **UNRESOLVED** — no decision has been supplied.
- **REQUIRES LEGAL/POLICY RATIFICATION** — law, instrument, fiduciary duty, or formally ratified policy must answer it.
- **BLOCKING PHASE 3** — no persistence or write implementation may proceed for the affected object.

## Decision records

### FIR-001 — Family Institution formation and scope
**Decision ID:** FIR-001
**Domain:** Family Institution Formation and Scope
**Question:** What legally and operationally constitutes a Family Institution; who establishes, owns, and governs it; and what is its canonical identity?
**Why it matters:** Determines whether an institution record is justified and prevents a second tenant, identity, or OS.
**Current repository capability:** `tenants`, `legal_entities`, parties, documents, policies, and governance resolutions exist; no family-institution registry exists.
**Current contract position:** Proposed `family_institutions` is conditional and must be policy-defined.
**Options:** (1) tenant-scoped Family Office institutional scope; (2) legal-entity/trust-scoped scope; (3) policy-defined multi-entity scope; (4) scope out persistence.
**Recommended option:** **POLICY DECISION REQUIRED**; select only a model ratified by the governing authority and counsel.
**Authority required:** BEYU constitutional/tenant owner and authorized Family Office sponsor.
**Legal review required:** Yes.
**Finance review required:** No, unless legal ownership/capital is asserted.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks all institution-scoped writes.
**Schema impact:** Blocks a `family_institutions` table and all foreign-key cardinality decisions.
**API impact:** Blocks institution create/manage endpoints.
**Permission impact:** Blocks institution administration grants.
**Audit impact:** Formation authority, governing instrument, tenant scope, and trace must be recorded.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-002 — Person participation across Family Institutions and tenants
**Decision ID:** FIR-002
**Domain:** Formation / Tenant Isolation
**Question:** May one canonical party participate in more than one Family Institution or tenant, and what controls apply across tenants?
**Why it matters:** `family_members.party_id` is globally unique, not unique by `(tenant_id, party_id)`.
**Current repository capability:** One global party master and tenant-scoped records; `family_members` has tenant ID plus unique party ID.
**Current contract position:** Do not change uniqueness until tenancy/membership policy is ratified.
**Options:** global one-family membership; multiple memberships with a new association model; explicitly separate party records prohibited; scope multi-tenant membership out.
**Recommended option:** **POLICY DECISION REQUIRED**; retain existing constraint and fail closed meanwhile.
**Authority required:** Identity/tenant architecture owner and Family Office sponsor.
**Legal review required:** Yes, for privacy and cross-border sharing.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks cross-tenant family workflow.
**Schema impact:** Blocks alteration of `family_members.party_id` uniqueness and institution-membership relation design.
**API impact:** Blocks membership onboarding semantics.
**Permission impact:** Requires tenant/need-to-know rules.
**Audit impact:** Record membership scope and every cross-tenant access decision.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-003 — Family relationship classification
**Decision ID:** FIR-003
**Domain:** Family Membership
**Question:** What policy/legal treatment applies to biological descent, legal adoption, spouse/former spouse, dependants, stepchildren, guardianship, affinity, minors, incapacity, deceased members, and disputed relationships?
**Why it matters:** Prevents relationship labels from silently conferring participation, ownership, governance, or entitlement.
**Current repository capability:** Family model distinguishes descent/affinity; lineage and eligibility engines refuse automatic conferment.
**Current contract position:** Relationship status and participation rights are independent; jurisdiction-specific treatment is unratified.
**Options:** instrument/jurisdiction-specific policy; a ratified institution constitution; scope each class out pending counsel.
**Recommended option:** Defer each legal effect to governing instrument and law.
**Authority required:** Authorized family constitutional body.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes, particularly minors/incapacity.
**Implementation impact:** Blocks relationship-effect workflows.
**Schema impact:** Blocks hard-coded relationship enum/effect constraints beyond existing evidence-neutral storage.
**API impact:** Blocks automated membership/rights creation.
**Permission impact:** Requires verifier and restricted-read policy.
**Audit impact:** Evidence, jurisdiction, verifier, dispute state, and policy version are mandatory.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-004 — Genealogical evidence and verification
**Decision ID:** FIR-004
**Domain:** Genealogical Descent
**Question:** Which evidence is authoritative, who verifies/corrects it, and how are disputes handled?
**Why it matters:** Prevents unverified or AI-generated assertions from becoming family status.
**Current repository capability:** `assessLineageEvidence`, descent graph assessment, verification fields on `family_members`, documents, audit/event infrastructure.
**Current contract position:** Human verification only; evidence bindings/persistence are missing.
**Options:** authorized registrar/counsel/trustee verification model; multi-party review; evidence-neutral read-only registry pending policy.
**Recommended option:** Ratify evidence hierarchy, verifier roles, and dispute escalation before writes.
**Authority required:** Family governance authority and data owner.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks lineage verification writes.
**Schema impact:** Blocks evidence table/document linkage and verification FK design.
**API impact:** Blocks verify/correct/dispute endpoints.
**Permission impact:** Blocks `family:lineage.verify` proposal.
**Audit impact:** Original evidence, reviewer, rationale, correction/supersession, and trace required.
**Status:** PARTIAL — BLOCKING PHASE 3.

### FIR-005 — Parent-child integrity and history
**Decision ID:** FIR-005
**Domain:** Genealogical Descent / Database Gate
**Question:** Should `family_members.parent_member_id` have an FK; must parent/child relationships be tenant-consistent; and do corrections require temporal/versioned relationship records?
**Why it matters:** Existing parent ID has no DB FK and a relationship can be disputed or historically corrected.
**Current repository capability:** In-memory graph validation; `parent_member_id` text field; no relationship history table.
**Current contract position:** Do not add FK or history model without governed evidence policy.
**Options:** strict current-state FK; separate temporal relationship/evidence record; no persistence extension; legal-record reference only.
**Recommended option:** **POLICY DECISION REQUIRED** after FIR-004; do not encode biological/legal assumptions in a single FK.
**Authority required:** Data architecture owner and family governance authority.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks lineage persistence extension.
**Schema impact:** Blocks FK, check constraints, temporal columns, and relationship tables.
**API impact:** Blocks historical correction APIs.
**Permission impact:** Requires distinct propose/verify/correct authority.
**Audit impact:** Must retain prior assertion, evidence, correction authority, and effective dates.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-006 — Family Constitution authority and electorate
**Decision ID:** FIR-006
**Domain:** Family Constitution
**Question:** Who may propose, table, vote, approve, ratify, suspend, supersede, or amend a Family Constitution?
**Why it matters:** A family constitution cannot create authority or override law, trust instruments, fiduciary duties, corporate documents, or BEYU constitutional authority.
**Current repository capability:** Family constitution engine, governance resolutions/votes/activation lifecycle, policy hierarchy.
**Current contract position:** Family Constitution is subordinate; thresholds and authorized bodies are unknown.
**Options:** instrument-defined body; ratified family electorate/committee; no constitutional persistence until ratified.
**Recommended option:** Use canonical governance mechanics only after legal/family authority ratifies the constitutional authority matrix.
**Authority required:** Authorized family constitutional body and BEYU governance owner.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** No.
**Implementation impact:** Blocks constitution and amendment workflows.
**Schema impact:** Blocks provision/version/ratification persistence.
**API impact:** Blocks constitution proposal/amend endpoints.
**Permission impact:** Blocks constitution-specific permissions.
**Audit impact:** Instrument, electorate snapshot, quorum, votes, approval, activation, effective date, and supersession required.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-007 — Constitutional lifecycle and superior-instrument conflicts
**Decision ID:** FIR-007
**Domain:** Family Constitution
**Question:** What are quorum, voting threshold, supermajority, effective date, emergency amendment, suspension, supersession, and conflict-handling rules?
**Why it matters:** Prevents constitutional bypass or retroactive/invalid policy operation.
**Current repository capability:** Amendment assessment and supremacy checks; canonical decision/document states.
**Current contract position:** Superior instrument order is represented; jurisdiction-specific precedence is not adjudicated by code.
**Options:** ratified constitution/instrument terms; jurisdiction-specific legal determination; scope emergency amendment out.
**Recommended option:** No emergency or automatic path until explicitly ratified.
**Authority required:** Same as FIR-006, subject to superior authority.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** No.
**Implementation impact:** Blocks effective family constitutional state.
**Schema impact:** Blocks version/effectivity/status fields and amendment linkage.
**API impact:** Blocks activation/suspension workflows.
**Permission impact:** Blocks amendment/activation authority mapping.
**Audit impact:** Must preserve conflict source, legal review, resolution, policy version, and effective period.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-008 — Governance bodies and fiduciary roles
**Decision ID:** FIR-008
**Domain:** Governance Bodies
**Question:** What are the appointment/removal authority, term, scope, voting, approval, delegation, conflict, recusal, and non-delegable powers of Family Council, committees, trustees, protectors, advisors, stewards, representatives, and observers?
**Why it matters:** No family role may be mistaken for trustee, protector, board, signatory, or fiduciary authority.
**Current repository capability:** Forum, committee mandate, conflict engines; governance members/resolutions; trustee-reserved matters vocabulary.
**Current contract position:** Family governance bodies are not automatically legal authority.
**Options:** instrument-specific role mapping; ratified governance charter; read-only advisory bodies.
**Recommended option:** Ratify a role-to-authority matrix per legal instrument and jurisdiction.
**Authority required:** Trustees/protectors where applicable, authorized family body, legal entity authority.
**Legal review required:** Yes.
**Finance review required:** Yes where investment/capital authority is claimed.
**Security/privacy review required:** No.
**Implementation impact:** Blocks body/membership/mandate persistence.
**Schema impact:** Blocks governance-body and membership tables.
**API impact:** Blocks appointment, voting, and mandate APIs.
**Permission impact:** Blocks role-linked grants.
**Audit impact:** Appointment instrument, term, conflicts, recusals, authority scope, and removals required.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-009 — Beneficiary eligibility versus legal entitlement
**Decision ID:** FIR-009
**Domain:** Beneficiary Eligibility
**Question:** How are eligibility, beneficiary class, contingent/successor status, effective dates, spouse/adoption/minor/deceased/disputed treatment, and trust-specific rules determined?
**Why it matters:** Family Office must not independently create legal beneficiary entitlement.
**Current repository capability:** `beneficiaries` links member to trust legal entity; eligibility engine is fail-closed; trustee reserved matters are defined.
**Current contract position:** Trustee, trust instrument, law, and legal entity remain authoritative.
**Options:** trust-by-trust instrument mapping; trustee-confirmed registry projection; no eligibility persistence.
**Recommended option:** Store only verified references/outcomes after trustee/legal authority confirms them.
**Authority required:** Trustee or legally empowered protector/body under the instrument.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks beneficiary/eligibility write flows.
**Schema impact:** Blocks beneficiary uniqueness/effective-date constraints and determination persistence.
**API impact:** Blocks beneficiary management beyond existing governed controls.
**Permission impact:** Existing `family:beneficiary.manage` cannot itself confer trustee authority.
**Audit impact:** Trust instrument, trustee authority, legal basis, effective period, evidence, and resolution reference required.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-010 — Beneficiary uniqueness and effective periods
**Decision ID:** FIR-010
**Domain:** Beneficiary Eligibility / Database Gate
**Question:** What uniqueness rule applies to beneficiary records and may overlapping effective periods/classes exist?
**Why it matters:** Prevents duplicate records while not invalidating legitimate contingent/discretionary/trust-specific arrangements.
**Current repository capability:** No relevant unique index is present on `beneficiaries`; effective dates exist.
**Current contract position:** Do not create a duplicate institution-beneficiary entity or infer a constraint.
**Options:** unique member/trust/class/current period; instrument-specific overlap rules; trustee-managed external source reference only.
**Recommended option:** **POLICY DECISION REQUIRED** per trust/instrument before a database constraint.
**Authority required:** Trustee/legal instrument owner.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks beneficiary deduplication migration.
**Schema impact:** Blocks unique/exclusion constraints and lifecycle model.
**API impact:** Blocks eligibility/entitlement mutation API.
**Permission impact:** Requires trustee-authority proof separate from permission.
**Audit impact:** Must preserve authority and effective-period basis.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-011 — Canonical delegation reuse
**Decision ID:** FIR-011
**Domain:** Delegation
**Question:** Which family powers are delegable/non-delegable; what scopes, limits, expiries, revocations, emergency controls, and segregation rules apply?
**Why it matters:** Prevents a family delegation record from creating authority or bypassing canonical controls.
**Current repository capability:** Canonical `delegations` table; family decision gate can assess delegation; human-to-AI material delegation is prohibited.
**Current contract position:** Reuse canonical infrastructure; do not create competing delegation system.
**Options:** map ratified family scopes to canonical delegation; mark powers non-delegable; scope delegation out.
**Recommended option:** Reuse canonical delegation only after each family scope is ratified.
**Authority required:** Original valid authority plus delegation authorizer.
**Legal review required:** Yes for fiduciary/trust powers.
**Finance review required:** Yes for monetary/capital scope.
**Security/privacy review required:** Yes for emergency access.
**Implementation impact:** Blocks delegation adapters.
**Schema impact:** No new delegation table; may require reference-only fields after policy.
**API impact:** No family delegation API; consume canonical service only.
**Permission impact:** No grant can convert non-delegable authority into delegable authority.
**Audit impact:** Delegator, delegate, source authority, scope, limit, dates, revocation, and review required.
**Status:** PARTIAL — BLOCKING PHASE 3.

### FIR-012 — Family Capital authority and Finance hand-off
**Decision ID:** FIR-012
**Domain:** Family Capital
**Question:** Who is legal/economic owner; who sets policy, allocation, investment, distribution, liquidity, and reporting authority; and what is the Finance OS hand-off?
**Why it matters:** A Family Capital instruction must not become a shadow ledger or override legal entity/trust/Finance authority.
**Current repository capability:** Family capital assessment engine; Finance capital, ledger, treasury, waterfall and governance authorization primitives.
**Current contract position:** Family layer is instruction/assessment only; Finance is financial truth.
**Options:** legal-entity/trust-specific capital mandate; Finance-owned request with family governance reference; scope capital instruction out.
**Recommended option:** Ratify a Finance contract and legal-owner authority matrix before any persistence.
**Authority required:** Legal owner/trustee/authorized investment body and Finance authority.
**Legal review required:** Yes.
**Finance review required:** Yes.
**Security/privacy review required:** Yes for highly restricted capital information.
**Implementation impact:** Blocks capital instruction workflow.
**Schema impact:** Blocks any family capital instruction table/reference contract.
**API impact:** Blocks Finance submission/hand-off endpoint.
**Permission impact:** Blocks `family:capital.request`; does not affect Finance execution rights.
**Audit impact:** Resolution, policy, legal owner, Finance request ID, amounts/currency classification, and resulting Finance reference required.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-013 — Family Loan policy and Finance hand-off
**Decision ID:** FIR-013
**Domain:** Family Loans
**Question:** What purposes, lender/borrower, approvals, documentation, interest, repayment, default, restructuring, tax, accounting, legal treatment, and Finance integration apply?
**Why it matters:** A family loan assessment cannot create a receivable, disbursement, tax position, or legal credit agreement.
**Current repository capability:** Family loan assessment/schedule engine; Finance ledger/treasury and legal entity primitives.
**Current contract position:** Family layer may represent instructions/assessments only; Finance/legal systems own consequences.
**Options:** approved loan policy per legal entity; external legal/Finance contract reference; scope loans out.
**Recommended option:** Require legal, tax, Finance, and fiduciary ratification before any loan instruction persistence.
**Authority required:** Lender legal entity/trustee/authorized credit body and Finance authority.
**Legal review required:** Yes.
**Finance review required:** Yes.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks loan instruction and hand-off.
**Schema impact:** Blocks instruction/reference persistence; never create a family loan ledger.
**API impact:** Blocks Finance loan submission/hand-off.
**Permission impact:** Blocks `family:loan.request`; Finance approval/execution remains separate.
**Audit impact:** Purpose, terms source, instrument, approvals, Finance/legal references, and lifecycle evidence required.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-014 — Jurisdiction and conflict-of-laws model
**Decision ID:** FIR-014
**Domain:** Jurisdiction / Conflict of Laws
**Question:** Which law governs a family institution, trust, entity, beneficiary, tax, privacy, and multi-jurisdiction conflict?
**Why it matters:** Existing countries/jurisdictions are canonical references but cannot decide legal applicability.
**Current repository capability:** `countries`, `jurisdictions`, document jurisdiction metadata, party nationality/country fields.
**Current contract position:** Family engines cannot infer jurisdictional eligibility, inheritance, adoption, capacity, tax, or trust law.
**Options:** policy selects governing jurisdiction plus legal exception process; instrument-specific mapping; scope cross-border cases out.
**Recommended option:** Legal counsel must ratify a conflict-of-laws approach and escalation path.
**Authority required:** Legal counsel and authorized governing body.
**Legal review required:** Yes.
**Finance review required:** Yes for tax/financial implications.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks jurisdiction-sensitive writes.
**Schema impact:** Blocks jurisdiction FK/cardinality requirements.
**API impact:** Blocks jurisdiction validation decisions.
**Permission impact:** May require jurisdiction-scoped access.
**Audit impact:** Applicable-law basis and legal review must be recorded.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-015 — Privacy, minors, sealed and retained family records
**Decision ID:** FIR-015
**Domain:** Privacy / Data / Minors
**Question:** What classification, access, consent/lawful basis, retention, deletion, legal hold, sealed-record, incapacity, and audit-access rules apply?
**Why it matters:** Genealogy, beneficiary status, health/capacity implications, and succession records are highly sensitive.
**Current repository capability:** Classification, consents, documents, retention policies, legal holds, vault index, RBAC/ABAC, audit.
**Current contract position:** Reuse BEYU security/privacy architecture; policy remains unratified.
**Options:** jurisdiction-specific data governance schedule; restricted read-only scope; no minor/sealed persistence until ratified.
**Recommended option:** Data protection/legal owners must ratify classification and retention matrix.
**Authority required:** Privacy/data governance owner.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks sensitive record ingestion and access.
**Schema impact:** Blocks retention/access/evidence fields and sealed-record model.
**API impact:** Blocks family record retrieval rules.
**Permission impact:** Blocks least-privilege/read scope design.
**Audit impact:** Access, disclosure, override, hold, and retention events required.
**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

### FIR-016 — Evidence, audit, provenance and correction contract
**Decision ID:** FIR-016
**Domain:** Audit / Evidence
**Question:** What evidence types, event names, required authority context, policy version, effective dates, correction/supersession, and retention rules apply to each family object?
**Why it matters:** Audit records must be tamper-evident and explain why a governed outcome exists.
**Current repository capability:** Documents, hash-chained `audit_log` and `enterprise_events`, trace/correlation/causation, authority context, policy version.
**Current contract position:** Reuse canonical audit/event stores; no family-owned log.
**Options:** ratified event catalogue and evidence profile per object; read-only use of existing audit until profiles exist.
**Recommended option:** Establish a minimal object-to-event/evidence matrix before mutation implementation.
**Authority required:** Audit/control owner and data owner.
**Legal review required:** Yes for retention/evidence admissibility.
**Finance review required:** Yes for Finance hand-off events.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks any material mutation.
**Schema impact:** Blocks evidence references/metadata design.
**API impact:** Blocks mutation endpoint audit contract.
**Permission impact:** Requires audit-read and sensitive-evidence access rules.
**Audit impact:** This decision defines the required audit contract.
**Status:** PARTIAL — BLOCKING PHASE 3.

### FIR-017 — Noelia/HIVE constitutional boundary
**Decision ID:** FIR-017
**Domain:** Noelia / HIVE
**Question:** May Noelia/HIVE create authority, invent policy, determine entitlement, amend instruments, appoint/remove fiduciaries, override governance/Finance, or bypass approvals/audit?
**Why it matters:** Prevents AI authority laundering.
**Current repository capability:** Noelia/HIVE governed runtime, AI audit, family human-write assertions, Noelia may-not boundary.
**Current contract position:** AI may analyze/evaluate/explain/recommend/detect conflicts/assist authorized workflows only.
**Options:** No alternative compatible with BEYU constitutional architecture.
**Recommended option:** Preserve existing prohibition; AI outputs remain advisory and attributable.
**Authority required:** Existing BEYU constitutional/security authority.
**Legal review required:** No additional family-specific review.
**Finance review required:** No additional family-specific review.
**Security/privacy review required:** Existing AI governance applies.
**Implementation impact:** Any future family AI feature must use existing governed workflow.
**Schema impact:** No new AI authority persistence.
**API impact:** No autonomous family governance API.
**Permission impact:** No AI grant may confer human/legal authority.
**Audit impact:** Material AI interaction remains auditable in `ai_decisions`, audit, and events.
**Status:** RESOLVED.

### FIR-018 — Finance OS financial-truth boundary
**Decision ID:** FIR-018
**Domain:** Finance OS Boundary
**Question:** May Family Office hold balances, post transactions, own loan accounting, or become financial truth?
**Why it matters:** Prevents a second ledger and inconsistent financial provenance.
**Current repository capability:** Finance ledger, treasury, capital, waterfall, tax, posting, and provenance modules.
**Current contract position:** Family Office only governs/instructs/references; Finance OS owns canonical financial records.
**Options:** No alternative compatible with canonical BEYU architecture.
**Recommended option:** Preserve Finance OS exclusivity and reference-only integration.
**Authority required:** Existing BEYU Finance architecture authority.
**Legal review required:** Applied through FIR-012/FIR-013 for legal effects.
**Finance review required:** Yes for any hand-off adapter.
**Security/privacy review required:** Existing financial classification applies.
**Implementation impact:** Family records cannot execute financial consequences.
**Schema impact:** No family balances/transactions/financial lineage.
**API impact:** Finance services remain executor.
**Permission impact:** Family permissions never imply Finance posting/execution.
**Audit impact:** Finance reference and canonical Finance audit trail required.
**Status:** RESOLVED.

### FIR-019 — Identity, legal entity, and audit canonical ownership
**Decision ID:** FIR-019
**Domain:** Canonical BEYU Boundaries
**Question:** May Family Institution create a second person identity, legal entity, tenant, delegation, or audit/event system?
**Why it matters:** Prevents architecture duplication and authority ambiguity.
**Current repository capability:** Canonical parties/users, tenants/legal entities, delegations, audit/events.
**Current contract position:** Reuse only.
**Options:** No alternative compatible with the approved architecture.
**Recommended option:** Preserve canonical BEYU ownership.
**Authority required:** Existing BEYU architecture authority.
**Legal review required:** No additional policy decision.
**Finance review required:** No.
**Security/privacy review required:** Existing controls apply.
**Implementation impact:** All future records are references/extensions, not replacement masters.
**Schema impact:** No duplicate master tables.
**API impact:** Reuse guards/services.
**Permission impact:** Reuse canonical authorization.
**Audit impact:** Reuse canonical immutable audit/event stores.
**Status:** RESOLVED.

### FIR-020 — Existing family-member record lifecycle
**Decision ID:** FIR-020
**Domain:** Family Membership / Database Gate
**Question:** What lifecycle governs creation, verification, suspension, death, dispute, archival, and correction of `family_members`?
**Why it matters:** Existing fields cover verification and deceased date but do not define institutional lifecycle/effect.
**Current repository capability:** Generic lifecycle enum, verification status, lineage engine.
**Current contract position:** Registry is extendable but must not confer rights.
**Options:** map to generic lifecycle plus evidence state; a ratified family-specific projection; leave records read-only.
**Recommended option:** Ratify lifecycle and effect rules after FIR-003 through FIR-005.
**Authority required:** Family governance/data owner.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks write lifecycle.
**Schema impact:** Blocks lifecycle extension and transition constraints.
**API impact:** Blocks member mutations.
**Permission impact:** Requires separate propose/verify/archive rights.
**Audit impact:** Every transition needs evidence and authority context.
**Status:** UNRESOLVED — BLOCKING PHASE 3.

### FIR-021 — Governance body persistence and membership lifecycle
**Decision ID:** FIR-021
**Domain:** Governance Bodies / Database Gate
**Question:** Is persistent Family Council/committee membership required, and how is its lifecycle related to canonical governance members?
**Why it matters:** Avoids a competing governance system or accidental voting authority.
**Current repository capability:** Governance members and resolutions; family forum/committee pure models.
**Current contract position:** Proposed persistence is conditional and must link to canonical governance.
**Options:** reference canonical governance membership; policy-defined family-body projection; no persistence.
**Recommended option:** Defer until FIR-008 ratifies body roles and mandates.
**Authority required:** Family constitutional/governance authority.
**Legal review required:** Yes.
**Finance review required:** Conditional.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks body and committee persistence.
**Schema impact:** Blocks body/membership relation tables and FKs.
**API impact:** Blocks body membership actions.
**Permission impact:** Blocks forum/committee manage rights.
**Audit impact:** Appointment/removal, term, recusal, mandate and authority required.
**Status:** UNRESOLVED — BLOCKING PHASE 3.

### FIR-022 — Constitutional provision/version persistence
**Decision ID:** FIR-022
**Domain:** Family Constitution / Database Gate
**Question:** Is a persistent provision/version registry required and how does it link to documents, resolutions, activation, effective periods, suspension, and supersession?
**Why it matters:** Prevents unratified text from operating as constitutional authority.
**Current repository capability:** Document versions, governance resolutions, decision activation, family constitution engine.
**Current contract position:** Proposed conditional extension, not approved schema.
**Options:** document-first projection linked to resolutions; provision registry; scope out persistence.
**Recommended option:** Decide only after FIR-006/FIR-007; document-first is not authority without ratification.
**Authority required:** Family constitutional authority and BEYU governance owner.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** No.
**Implementation impact:** Blocks constitutional persistence.
**Schema impact:** Blocks constitution/provision/version tables and FKs.
**API impact:** Blocks constitution read/write contract.
**Permission impact:** Blocks propose/ratify/manage model.
**Audit impact:** Version checksum, authority, ratification, activation and supersession required.
**Status:** UNRESOLVED — BLOCKING PHASE 3.

### FIR-023 — Permission and separation-of-duties matrix
**Decision ID:** FIR-023
**Domain:** Authorization / Permissions
**Question:** Which existing or proposed permission is required for read, propose, verify, assess, approve, execute, and audit access, and what separation/step-up rules apply?
**Why it matters:** Existing `family:*` permissions are capabilities, not legal/trustee authority.
**Current repository capability:** Explicit permission catalogue, high-risk permissions, roles, RBAC/ABAC, clearance, tenancy, MFA, approvals.
**Current contract position:** Candidate new permissions are proposals only.
**Options:** reuse existing permissions plus object authority context; add narrowly scoped permissions after ratification; scope actions out.
**Recommended option:** Ratify object-action matrix; retain existing permissions unchanged.
**Authority required:** Security/RBAC owner and domain authority.
**Legal review required:** Yes for fiduciary/legal actions.
**Finance review required:** Yes for Finance hand-off actions.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks write API and approval controls.
**Schema impact:** No schema change until role/permission design ratified.
**API impact:** Blocks guarded endpoint contracts.
**Permission impact:** This decision defines it.
**Audit impact:** Permission, authority, step-up and denied-action audit required.
**Status:** PARTIAL — BLOCKING PHASE 3.

### FIR-024 — Family vault/document linkage
**Decision ID:** FIR-024
**Domain:** Evidence / Privacy / Database Gate
**Question:** How do `family_vault_items`, canonical documents, access policies, sealed access, succession instructions, retention, and legal holds relate?
**Why it matters:** Vault metadata must not become an unauthorized document or secrets system.
**Current repository capability:** `family_vault_items`, `documents`, access policy IDs, retention policies, legal holds.
**Current contract position:** Vault is an index/metadata structure and is left untouched pending ownership policy.
**Options:** canonical document reference with ratified vault profile; separate secure storage governed by platform; no change.
**Recommended option:** Retain current structure; require FIR-015/FIR-016 ratification before extension.
**Authority required:** Information governance and Family Office custody authority.
**Legal review required:** Yes.
**Finance review required:** No.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks evidence/document linkage writes.
**Schema impact:** Blocks document FK/access policy/retention changes.
**API impact:** Blocks vault access/change endpoints.
**Permission impact:** Blocks vault write/sealed access grants.
**Audit impact:** Every access, release, seal/unseal, and succession action required.
**Status:** UNRESOLVED — BLOCKING PHASE 3.

### FIR-025 — Family Capital instruction persistence
**Decision ID:** FIR-025
**Domain:** Family Capital / Database Gate
**Question:** Is a persistent non-financial instruction record justified; which references, lifecycle, legal-owner, Finance-request, and idempotency fields are required?
**Why it matters:** The wrong model creates duplicate financial truth.
**Current repository capability:** Capital assessment engine and Finance capital/governance services; no instruction persistence.
**Current contract position:** Proposed only after Finance/legal hand-off is ratified.
**Options:** reference-only governance resolution; non-financial instruction adapter; scope out.
**Recommended option:** Do not persist until FIR-012 and FIR-016 are ratified.
**Authority required:** Family capital authority, legal owner, Finance owner.
**Legal review required:** Yes.
**Finance review required:** Yes.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks capital adapter.
**Schema impact:** Blocks instruction table/index/FK design.
**API impact:** Blocks Finance hand-off API.
**Permission impact:** Blocks request permission.
**Audit impact:** Requires resolution, policy, legal entity, Finance ID, status and provenance.
**Status:** UNRESOLVED — BLOCKING PHASE 3.

### FIR-026 — Family Loan instruction persistence
**Decision ID:** FIR-026
**Domain:** Family Loans / Database Gate
**Question:** Is a persistent non-financial loan instruction justified; which legal/Finance references and lifecycle fields are required?
**Why it matters:** Prevents creation of a second loan book.
**Current repository capability:** Loan assessment engine; Finance/legal primitives; no instruction persistence.
**Current contract position:** Proposed only after legal/tax/Finance policy.
**Options:** reference-only legal/Finance workflow; non-financial instruction adapter; scope out.
**Recommended option:** Do not persist until FIR-013 and FIR-016 are ratified.
**Authority required:** Lender legal owner, trustee/credit authority, Finance owner.
**Legal review required:** Yes.
**Finance review required:** Yes.
**Security/privacy review required:** Yes.
**Implementation impact:** Blocks loan adapter.
**Schema impact:** Blocks instruction table/index/FK design.
**API impact:** Blocks loan hand-off API.
**Permission impact:** Blocks request permission.
**Audit impact:** Requires terms source, approvals, legal/Finance references and full provenance.
**Status:** UNRESOLVED — BLOCKING PHASE 3.

### FIR-027 — Explicit family policy-decision register operation
**Decision ID:** FIR-027
**Domain:** Policy Governance
**Question:** How are the unresolved decisions in this register submitted, assigned, evidenced, ratified, expired, superseded, and published to implementers?
**Why it matters:** `POLICY DECISION REQUIRED` must be actionable but cannot be silently resolved by code or AI.
**Current repository capability:** Family `policy-decisions.ts`, governance resolutions, documents, audit/events.
**Current contract position:** Existing policy-decision mechanism is canonical for recording absence; formal institutional owners are not assigned.
**Options:** use existing policy-decision register linked to canonical resolutions/documents; manual governance register; scope out affected feature.
**Recommended option:** Assign each FIR record to named accountable owner/body through canonical governance before implementation.
**Authority required:** BEYU governance owner and Family Office sponsor.
**Legal review required:** Where a record says legal.
**Finance review required:** Where a record says Finance.
**Security/privacy review required:** Where a record says security/privacy.
**Implementation impact:** Blocks closure of all unresolved records.
**Schema impact:** No new registry required unless canonical governance owner approves one.
**API impact:** No policy-resolution endpoint beyond canonical governance.
**Permission impact:** Existing governance permissions remain authoritative.
**Audit impact:** Ratification decision, evidence, authority and effective date required.
**Status:** PARTIAL — BLOCKING PHASE 3.

## Database-specific gate register

| Gate | Decision record | Current finding | Migration 0018 disposition |
|---|---|---|---|
| `family_members.party_id` uniqueness | FIR-002 | Global uniqueness conflicts with undecided cross-tenant semantics. | Blocked. |
| Cross-tenant family membership | FIR-002 | Policy, privacy and access model absent. | Blocked. |
| `parent_member_id` FK/integrity | FIR-005 | No FK; relationship meaning/history undecided. | Blocked. |
| Parent/child history | FIR-005 | No temporal model. | Blocked. |
| Beneficiary uniqueness | FIR-010 | Cannot infer instrument-specific duplicate rule. | Blocked. |
| Beneficiary effective periods | FIR-009, FIR-010 | Dates exist but entitlement semantics unratified. | Blocked. |
| Jurisdiction requirements | FIR-014 | Canonical references exist; applicability policy absent. | Blocked. |
| Constitutional version persistence | FIR-006, FIR-007, FIR-022 | Engine exists; authoritative persistence design absent. | Blocked. |
| Governance body persistence | FIR-008, FIR-021 | Cannot create alternate governance authority. | Blocked. |
| Amendment persistence | FIR-006, FIR-007, FIR-022 | Ratification/effectivity/supremacy rules absent. | Blocked. |
| Delegation reuse | FIR-011 | Canonical delegation exists; family scope rules absent. | Blocked. |
| Audit/event persistence | FIR-016 | Canonical stores exist; object event/evidence profiles absent. | Blocked. |
| Evidence/document linkage | FIR-004, FIR-016, FIR-024 | Document/evidence/privacy ownership incomplete. | Blocked. |
| Capital instruction persistence | FIR-012, FIR-025 | Finance/legal hand-off not ratified. | Blocked. |
| Loan instruction persistence | FIR-013, FIR-026 | Legal/tax/Finance hand-off not ratified. | Blocked. |

## Phase 3 blocker matrix

| Blocker | Decision required | Owner | Legal required | Phase 3 impact | Status |
|---|---|---|---|---|---|
| Institution identity and scope | FIR-001 | Tenant/constitutional owner + Family Office sponsor | Yes | No root scope or FK model | Blocking |
| Multi-tenant membership | FIR-002 | Identity/tenant owner | Yes | No member uniqueness migration | Blocking |
| Relationship legal effects | FIR-003 | Family authority | Yes | No membership/rights automation | Blocking |
| Lineage evidence/history | FIR-004, FIR-005 | Data owner + family authority | Yes | No lineage persistence/writes | Blocking |
| Constitution/amendments | FIR-006, FIR-007, FIR-022 | Family constitutional body + governance | Yes | No constitutional persistence | Blocking |
| Governance bodies/fiduciaries | FIR-008, FIR-021 | Trustee/family/legal entity authority | Yes | No body membership/authority | Blocking |
| Beneficiary rules | FIR-009, FIR-010 | Trustee/legal instrument owner | Yes | No beneficiary/eligibility changes | Blocking |
| Delegation scopes | FIR-011 | Valid authority + governance | Conditional | No delegation adapter | Blocking |
| Capital authority/Finance hand-off | FIR-012, FIR-025 | Legal owner + Finance | Yes | No capital instruction model | Blocking |
| Loan authority/Finance hand-off | FIR-013, FIR-026 | Legal owner + Finance | Yes | No loan instruction model | Blocking |
| Conflict of laws | FIR-014 | Legal counsel | Yes | No jurisdiction-sensitive writes | Blocking |
| Privacy/evidence/vault | FIR-015, FIR-016, FIR-024 | Privacy/audit/data owner | Yes | No sensitive data or evidence model | Blocking |
| Permission/SoD matrix | FIR-023 | Security/RBAC owner | Conditional | No guarded write design | Blocking |
| Ratification operation | FIR-027 | Governance owner | Conditional | No controlled closure of blockers | Blocking |
| PR CI policy | Repository owner | Repository policy | No | PR #8 must not merge until failure is addressed/waived | Blocking merge, not schema design |

## Phase 3 entry criteria

Phase 3 may begin **only** when all of the following are evidenced through the canonical governance/document/audit process:

1. Phase 2.5 architecture contract is explicitly approved.
2. Every blocker above is ratified, or the affected feature is expressly scoped out of Phase 3.
3. Applicable legal decisions are documented, including trust/fiduciary, beneficiary, family-law, tax, privacy, and conflict-of-laws advice where marked required.
4. Family Institution identity, tenant scope, cross-tenant party membership, and data-sharing semantics are ratified.
5. Family membership, evidence, dispute, correction, and relationship-history authority are ratified.
6. Authority matrix for Family Council, committees, trustees, protectors, advisors, stewards, representatives, and observers is ratified.
7. Beneficiary eligibility, legal entitlement separation, effective period, trust-specific and jurisdiction-specific rules are ratified.
8. Family Constitution amendment, electorate, quorum, threshold, ratification, activation, suspension, supersession, and superior-instrument conflict rules are ratified.
9. Jurisdiction and privacy/retention/sealed-record rules are ratified.
10. Family Capital and Family Loan legal/Finance hand-off contracts are ratified, including confirmation that Finance OS owns all financial consequences.
11. Object/action permission, separation-of-duties, classification, tenant, step-up, delegation, and audit-event matrices are ratified.
12. The migration design has a reviewed evidence/document linkage and canonical audit/event contract.
13. PR/repository CI policy has resolved or formally waived the current Vercel failure for PR #8.
14. A separate, explicitly approved Phase 3 specification exists. Only then may migration 0018 be designed; it is not authorized by this register.

## Explicit non-implementation confirmation

This register does **not** authorize and has not performed: migration 0018, any schema change, source-code change, API, permission, UI, Finance OS, Noelia/HIVE, or Phase 1–2 engine modification. It creates no new OS boundary and does not resolve any legal or policy matter by default.
