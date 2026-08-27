# Phase 2.5 — Family Institution Ratification-Ready Decision Matrix

**Purpose:** Policy/authority analysis only. This matrix operationalizes the 27-record Policy & Authority Ratification Register without resolving any unratified policy. It is the required gate between the approved architecture and a future, separately approved Phase 3 specification.

**Verified baseline:** PR #7 remains merged at `da1ef20`; PR #8 is open and documentation-only; `e8281bd` added the source register. The working tree was clean before this document. No migration `0018` exists and no Phase 3 code/schema/API/permission/UI/Finance/Noelia/engine change has been made.

## Common canonical rules applicable to every decision

- BEYU OS is the constitutional control plane and enterprise kernel; Family Office is a first-class BEYU OS capability; the Family Institution Model is not an OS.
- Identity (`parties`/`users`), tenants, legal entities, jurisdictions, governance, canonical delegations, authorization, audit/events, and Finance OS remain authoritative.
- Finance OS owns financial truth. A Family Office assessment or instruction never posts, disburses, books, or creates financial lineage.
- Law, court orders, trust instruments, trustee fiduciary duties, protector powers, regulatory requirements, and valid corporate documents outrank a Family Constitution; BEYU constitutional authority outranks it as well.
- Noelia/HIVE may analyze, evaluate, explain, recommend, detect conflicts, and assist an explicitly human-authorized technical workflow. It cannot approve, amend, create authority, resolve policy absence, determine legal entitlement, or bypass controls.
- If the decision-maker has not supplied authoritative policy/evidence, the outcome is **POLICY DECISION REQUIRED**. Technical convenience is not a policy answer.

## Decision reviews

--------------------------------------------------
## DECISION 01 — Family Institution formation and scope
--------------------------------------------------
**Question:** What legally and operationally constitutes a Family Institution; who establishes, owns, and governs it; and what is its canonical identity?

**Why this matters:** It controls the root scope for every future relationship and prevents an additional tenant, identity master, or separate OS.

**Current repository evidence:** `tenants`, `legal_entities`, documents, policies, governance resolutions, and parties exist; no Family Institution registry exists.

**Existing canonical rules:** Tenant and legal-entity identity are BEYU-owned; a Family Institution may not replace either.

**What is already resolved:** The layer belongs inside Family Office and may not become an OS.

**What remains unresolved:** Formation authority, institutional identity, legal/economic owner, governing body, and whether persistence is justified.

**Decision classification:** Enterprise policy; family governance policy; legal; technical implementation.

**Required authority:** BEYU constitutional/tenant owner and authorized Family Office sponsor.

**Legal review:** YES
**Finance review:** CONDITIONAL
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Tenant-scoped institutional scope. Advantage: aligns with existing isolation. Risk: may not represent a multi-entity family arrangement. Consequence: institution references one tenant.
- **OPTION B:** Legal-entity/trust-scoped scope. Advantage: clear attribution. Risk: excludes wider family governance. Consequence: references legal entity/instrument.
- **OPTION C:** Ratified multi-entity scope. Advantage: models a broader institution. Risk: cross-tenant/entity privacy and authority complexity. Consequence: requires approved association model.

**Recommended ratification question:** `Does an authorized instrument establish a Family Institution, what is its canonical scope and owner, and which BEYU tenant/legal entities may it govern or reference?`

**Required evidence/documentation:** Formation instrument, governing resolution, tenant/entity scope, jurisdiction, data classification.

**Required legal instrument, policy, resolution, or authority:** Ratified formation policy plus applicable legal/instrument review.

**Downstream implementation impact:** Blocks root table, FKs, onboarding, and all institution-scoped writes.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 02 — Person participation across Family Institutions and tenants
--------------------------------------------------
**Question:** May one canonical party participate in more than one Family Institution or tenant, and what controls apply across tenants?

**Why this matters:** `family_members.party_id` is globally unique, while the record has `tenant_id`; this is a material cardinality and isolation decision.

**Current repository evidence:** `parties` is global; `family_members` has tenant ID and `uniqueIndex(...partyId)` rather than `(tenantId, partyId)`.

**Existing canonical rules:** A person is not duplicated to solve tenant membership; access remains tenant/ABAC/classification controlled.

**What is already resolved:** One canonical party master is authoritative.

**What remains unresolved:** Global single membership versus multi-institution association, cross-tenant visibility, consent, and jurisdictional sharing.

**Decision classification:** Architectural; enterprise policy; legal; privacy/security; jurisdictional; technical implementation.

**Required authority:** Identity/tenant architecture owner and Family Office sponsor.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Retain one global family membership. Advantage: strongest duplicate prevention. Risk: cannot represent legitimate multiple institutions. Consequence: existing unique index remains.
- **OPTION B:** Allow institution-specific memberships. Advantage: accurate multi-family participation. Risk: cross-tenant privacy/authority complexity. Consequence: requires an approved association/cardinality design.
- **OPTION C:** Scope cross-tenant participation out. Advantage: least change. Risk: operational exclusions. Consequence: reject/hold such cases.

**Recommended ratification question:** `May one canonical party hold multiple institution-specific memberships, and if yes, what tenant, consent, jurisdiction, and access conditions govern each membership?`

**Required evidence/documentation:** Tenant model decision, data-sharing/consent policy, cross-border review.

**Required legal instrument, policy, resolution, or authority:** Tenant/identity policy and privacy/legal ratification.

**Downstream implementation impact:** Blocks uniqueness migration, membership model, and cross-tenant API semantics.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 03 — Family relationship classification
--------------------------------------------------
**Question:** What policy/legal treatment applies to biological descent, legal adoption, spouse/former spouse, dependants, stepchildren, guardianship, affinity, minors, incapacity, deceased members, and disputed relationships?

**Why this matters:** Family relationship, institutional membership, beneficiary status, legal entitlement, ownership, voting, and governance rights are different concepts.

**Current repository evidence:** `model.ts` distinguishes descent and affinity; eligibility engine prohibits automatic conferment and spousal inheritance of family-line rights.

**Existing canonical rules:** A relationship never automatically grants participation, governance, ownership, beneficiary entitlement, or legal authority.

**What is already resolved:** Independent participation axes and fail-closed eligibility assessments.

**What remains unresolved:** Legal effects for every relationship class, including adoption recognition, capacity, death, dispute, and jurisdictional treatment.

**Decision classification:** Family governance policy; legal; jurisdictional; privacy/security.

**Required authority:** Authorized family constitutional body, subject to law/instruments.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Instrument/jurisdiction-specific treatment. Advantage: legally precise. Risk: complex. Consequence: policy references required per case.
- **OPTION B:** Ratified family policy subject to legal override. Advantage: consistent operations. Risk: cannot contradict local law/instrument. Consequence: requires exception path.
- **OPTION C:** Scope affected relationship classes out. Advantage: conservative. Risk: incomplete registry. Consequence: no automated processing.

**Recommended ratification question:** `For each relationship class, does it create only a recorded relationship, a governed membership eligibility pathway, or no institutional effect, subject to which jurisdiction and superior instrument?`

**Required evidence/documentation:** Relationship evidence standard, applicable law, capacity/minor safeguards, dispute process.

**Required legal instrument, policy, resolution, or authority:** Legal/family policy ratification.

**Downstream implementation impact:** Blocks hard-coded relationship effects, automated membership, and rights provisioning.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 04 — Genealogical evidence and verification
--------------------------------------------------
**Question:** Which evidence is authoritative, who verifies/corrects it, and how are disputes handled?

**Why this matters:** Unverified assertions—including AI output—must never become lineage status.

**Current repository evidence:** Lineage evidence/graph engines, family verification fields, `documents`, hash-chained audit/events exist; no evidence-binding service exists.

**Existing canonical rules:** Human-only lineage writes; deterministic evidence assessment; audit/event infrastructure is canonical.

**What is already resolved:** Noelia cannot verify or confer lineage authority.

**What remains unresolved:** Evidence hierarchy, authorized verifier, correction authority, dispute body, and admissibility by jurisdiction.

**Decision classification:** Family governance policy; legal; privacy/security; technical implementation.

**Required authority:** Family governance/data owner.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Authorized registrar/counsel verification. Advantage: clear accountability. Risk: availability/cost. Consequence: verifier identity/evidence references required.
- **OPTION B:** Multi-party governed review. Advantage: resilience. Risk: quorum/dispute policy needed. Consequence: governance linkage required.
- **OPTION C:** Read-only unverified assertions. Advantage: no conferment. Risk: limited utility. Consequence: no verified status.

**Recommended ratification question:** `Which evidence types and accountable human roles may verify, correct, or dispute each lineage assertion, and what escalation applies?`

**Required evidence/documentation:** Evidence taxonomy, verifier register, dispute/correction procedure, retention rules.

**Required legal instrument, policy, resolution, or authority:** Ratified evidence and verification policy.

**Downstream implementation impact:** Blocks evidence persistence, verification mutations, and verifier permissions.

**Status:** PARTIAL — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 05 — Parent-child integrity and history
--------------------------------------------------
**Question:** Should `family_members.parent_member_id` have an FK; must parent/child relationships be tenant-consistent; and do corrections require temporal/versioned relationship records?

**Why this matters:** A single current-state pointer cannot itself decide legal parentage, disputed history, or cross-tenant semantics.

**Current repository evidence:** Parent ID is text with no FK; lineage graph validates supplied data; no temporal relationship store exists.

**Existing canonical rules:** The engine detects graph defects but does not define legal relationship authority.

**What is already resolved:** No DB constraint has been authorized.

**What remains unresolved:** FK suitability, tenant consistency, legal versus biological parent semantics, correction/history model.

**Decision classification:** Legal; family governance policy; privacy/security; technical implementation.

**Required authority:** Data architecture owner and family governance authority.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Strict current-state FK. Advantage: referential integrity. Risk: oversimplifies contested/history relationships. Consequence: tenant/FK rules needed.
- **OPTION B:** Temporal relationship/evidence records. Advantage: preserves correction history. Risk: more sensitive data/lifecycle complexity. Consequence: new approved model required.
- **OPTION C:** No new persistence. Advantage: conservative. Risk: relies on current text field. Consequence: lineage remains assessment-only.

**Recommended ratification question:** `What relationship semantics and history must be preserved, and is an FK sufficient or must an evidence-backed temporal relationship model be used?`

**Required evidence/documentation:** Legal relationship definition, correction/dispute policy, tenant scope.

**Required legal instrument, policy, resolution, or authority:** Legal/data-governance ratification.

**Downstream implementation impact:** Blocks FK/check constraints and relationship-history design.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 06 — Family Constitution authority and electorate
--------------------------------------------------
**Question:** Who may propose, table, vote, approve, ratify, suspend, supersede, or amend a Family Constitution?

**Why this matters:** Family Constitution cannot manufacture authority or override superior sources.

**Current repository evidence:** Constitution/amendment engines; resolutions, votes, activation state, and policy hierarchy exist.

**Existing canonical rules:** Applicable law and superior instruments/fiduciary duty outrank Family Constitution; BEYU constitutional authority also outranks it.

**What is already resolved:** Canonical governance mechanics exist; AI cannot amend.

**What remains unresolved:** Proposer, electorate, competent body, quorum, voting and ratification authority.

**Decision classification:** Family governance policy; legal; fiduciary; constitutional.

**Required authority:** Authorized family constitutional body and BEYU governance owner.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** NO
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Instrument-defined body. Advantage: legal alignment. Risk: varies by instrument. Consequence: instrument mapping required.
- **OPTION B:** Ratified family electorate/body. Advantage: operational clarity. Risk: must not displace fiduciary powers. Consequence: eligibility/quorum policy required.
- **OPTION C:** No persisted constitution. Advantage: avoids false authority. Risk: no governed family policy registry. Consequence: document-only reference.

**Recommended ratification question:** `Which legally valid body and electorate hold each constitutional power, and which matters remain exclusively reserved to superior authorities?`

**Required evidence/documentation:** Constitution/instrument, authority matrix, resolution rules.

**Required legal instrument, policy, resolution, or authority:** Ratified constitutional governance policy and legal confirmation.

**Downstream implementation impact:** Blocks constitution and amendment persistence/workflows.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 07 — Constitutional lifecycle and superior-instrument conflicts
--------------------------------------------------
**Question:** What are quorum, voting threshold, supermajority, effective date, emergency amendment, suspension, supersession, and conflict-handling rules?

**Why this matters:** Prevents retroactive, invalid, or superior-instrument-conflicting family policy.

**Current repository evidence:** Amendment and supremacy assessments; decision/document lifecycle enums; activation registry.

**Existing canonical rules:** A missing ratified policy is not alignment; code does not adjudicate jurisdictional precedence.

**What is already resolved:** Superior-source boundary and no automatic emergency authority.

**What remains unresolved:** Thresholds, lifecycle actions, emergency powers, and conflict escalation.

**Decision classification:** Constitutional; legal; fiduciary; family governance policy.

**Required authority:** Same authority as Decision 06, subject to superior instruments.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** NO
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Instrument-specific thresholds/lifecycle. Advantage: legal fidelity. Risk: multiple configurations. Consequence: policy reference per constitution.
- **OPTION B:** Single ratified family framework with legal overrides. Advantage: uniformity. Risk: may not fit every trust/entity. Consequence: exceptions process.
- **OPTION C:** Emergency path prohibited. Advantage: fail-closed. Risk: slower response. Consequence: use superior lawful authorities only.

**Recommended ratification question:** `What exact lifecycle, threshold, emergency, effective-date, and superior-conflict rules govern each constitutional action?`

**Required evidence/documentation:** Ratified constitution, legal review, policy versions, escalation path.

**Required legal instrument, policy, resolution, or authority:** Legal/family constitutional ratification.

**Downstream implementation impact:** Blocks version/effectivity/suspension/supersession schema and actions.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 08 — Governance bodies and fiduciary roles
--------------------------------------------------
**Question:** What are appointment/removal authority, term, scope, voting, approval, delegation, conflict, recusal, and non-delegable powers of Council, committees, trustees, protectors, advisors, stewards, representatives, and observers?

**Why this matters:** A committee role is not automatically a trustee, protector, board, signatory, or fiduciary authority.

**Current repository evidence:** Family forum/committee/conflict engines, governance members/resolutions, trustee-reserved matters vocabulary.

**Existing canonical rules:** Trustee-reserved matters cannot be decided by family body absent valid superior authority.

**What is already resolved:** Advisory/governance concepts exist; no role automatically creates legal authority.

**What remains unresolved:** Role-specific mandate and legal/fiduciary mapping by instrument/jurisdiction.

**Decision classification:** Family governance policy; legal; fiduciary; financial.

**Required authority:** Trustees/protectors where applicable, legal-entity authority, authorized family body.

**Legal review:** YES
**Finance review:** CONDITIONAL
**Security/privacy review:** NO
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Instrument-specific role map. Advantage: respects legal sources. Risk: complex. Consequence: authoritative references per body.
- **OPTION B:** Ratified advisory charter. Advantage: clear non-fiduciary scope. Risk: limited execution. Consequence: no reserved-matter authority.
- **OPTION C:** Persist no family bodies. Advantage: no false authority. Risk: limited governance visibility. Consequence: use canonical governance only.

**Recommended ratification question:** `For each role, what authority is legally conferred, expressly advisory, non-delegable, and subject to conflict/recusal controls?`

**Required evidence/documentation:** Appointment source, term, mandate, conflict policy, legal opinion where fiduciary.

**Required legal instrument, policy, resolution, or authority:** Instrument-specific authority matrix.

**Downstream implementation impact:** Blocks body/membership/mandate records and approval mapping.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 09 — Beneficiary eligibility versus legal entitlement
--------------------------------------------------
**Question:** How are eligibility, beneficiary class, contingent/successor status, effective dates, spouse/adoption/minor/deceased/disputed treatment, and trust-specific rules determined?

**Why this matters:** A Family Office registry must never become legal beneficiary entitlement or distribution authority.

**Current repository evidence:** `beneficiaries` references family member/trust legal entity; eligibility engine is fail-closed; trustee-reserved matters defined.

**Existing canonical rules:** Trustee, trust instrument, applicable law, and legal entity remain authoritative.

**What is already resolved:** Eligibility assessment is distinct from entitlement; AI cannot determine either.

**What remains unresolved:** Each trust's entitlement and eligibility policy/effective period.

**Decision classification:** Legal; fiduciary; family governance policy; jurisdictional; privacy/security.

**Required authority:** Trustee or legally empowered protector/body under the instrument.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Trustee-confirmed projection of instrument outcome. Advantage: preserves legal authority. Risk: dependency on trustee process. Consequence: references only.
- **OPTION B:** Instrument-by-instrument eligibility rules. Advantage: precise. Risk: configuration complexity. Consequence: legal mapping required.
- **OPTION C:** No eligibility persistence. Advantage: safest. Risk: no operational view. Consequence: external reference only.

**Recommended ratification question:** `For each trust, who determines legal entitlement and what verified, non-authoritative eligibility information may Family Office record?`

**Required evidence/documentation:** Trust instrument, trustee confirmation, legal basis, effective period, dispute policy.

**Required legal instrument, policy, resolution, or authority:** Trust/legal ratification.

**Downstream implementation impact:** Blocks eligibility determination and beneficiary mutations.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 10 — Beneficiary uniqueness and effective periods
--------------------------------------------------
**Question:** What uniqueness rule applies to beneficiary records and may overlapping effective periods/classes exist?

**Why this matters:** A naïve uniqueness constraint could invalidate discretionary, contingent, successor, or trust-specific arrangements; no constraint permits duplicates.

**Current repository evidence:** `beneficiaries` has dates/classes but no matching unique index.

**Existing canonical rules:** Do not create duplicate institution-beneficiary records; registry is not entitlement.

**What is already resolved:** No general uniqueness rule is established.

**What remains unresolved:** Trust-specific overlap/duplicate/effective-period semantics.

**Decision classification:** Legal; fiduciary; jurisdictional; technical implementation.

**Required authority:** Trustee/legal instrument owner.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Unique member/trust/class/current period. Advantage: reduces duplicates. Risk: may reject valid overlaps. Consequence: needs legal confirmation.
- **OPTION B:** Instrument-specific overlap rules. Advantage: faithful. Risk: complex enforcement. Consequence: policy references required.
- **OPTION C:** External authoritative reference only. Advantage: avoids false constraint. Risk: weaker local deduplication. Consequence: no new entitlement model.

**Recommended ratification question:** `For each trust and beneficiary class, what records may coexist, what dates may overlap, and what source confirms the currently effective legal status?`

**Required evidence/documentation:** Instrument rule, trustee confirmation, effective-date model.

**Required legal instrument, policy, resolution, or authority:** Trust/legal policy ratification.

**Downstream implementation impact:** Blocks uniqueness/exclusion constraints and lifecycle persistence.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 11 — Canonical delegation reuse
--------------------------------------------------
**Question:** Which family powers are delegable/non-delegable; what scopes, limits, expiries, revocations, emergency controls, and segregation rules apply?

**Why this matters:** A family delegation cannot create authority or bypass canonical controls.

**Current repository evidence:** Canonical `delegations`; governance delegation service; family decision gate assesses delegation; AI material delegation prohibited.

**Existing canonical rules:** Reuse canonical delegation; no competing delegation table; non-delegable/legally reserved powers remain non-delegable.

**What is already resolved:** Technical delegation primitive and AI prohibition.

**What remains unresolved:** Family scope catalog, monetary limits, fiduciary non-delegability, emergency rules, maker-checker rules.

**Decision classification:** Enterprise policy; family governance policy; legal; fiduciary; financial; security.

**Required authority:** Valid original authority plus canonical delegation authorizer.

**Legal review:** CONDITIONAL
**Finance review:** CONDITIONAL
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Map ratified scopes to canonical delegation. Advantage: reuse kernel. Risk: detailed authority work. Consequence: reference canonical IDs only.
- **OPTION B:** Mark family powers non-delegable. Advantage: conservative. Risk: operational rigidity. Consequence: direct authorized action only.
- **OPTION C:** Scope delegation features out. Advantage: no ambiguity. Risk: no continuity. Consequence: no adapter.

**Recommended ratification question:** `Which precisely identified family actions are delegable by which valid authority, under what limits and duration, and which actions are categorically non-delegable?`

**Required evidence/documentation:** Delegation matrix, source authority, limits, revocation/emergency policy.

**Required legal instrument, policy, resolution, or authority:** Canonical delegation policy plus instrument review.

**Downstream implementation impact:** Blocks delegation references/adapters and approval enforcement.

**Status:** PARTIAL — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 12 — Family Capital authority and Finance hand-off
--------------------------------------------------
**Question:** Who is legal/economic owner; who sets policy, allocation, investment, distribution, liquidity, and reporting authority; and what is the Finance OS hand-off?

**Why this matters:** Family Capital governance must not create financial ownership, allocation execution, or a shadow ledger.

**Current repository evidence:** Family capital pure engine; Finance capital, ledger, treasury, waterfall, tax, and governance authorization modules.

**Existing canonical rules:** Finance OS owns financial truth; legal entities retain attribution; human-only family capital writes.

**What is already resolved:** Family layer can only assess/instruct/reference; Finance remains executor/truth.

**What remains unresolved:** Owner, valid policy/authority, thresholds, investment/distribution powers, Finance interface.

**Decision classification:** Financial; legal; fiduciary; tax; family governance policy; technical implementation.

**Required authority:** Legal owner/trustee/authorized investment body and Finance authority.

**Legal review:** YES
**Finance review:** YES
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Legal-entity/trust-specific mandate. Advantage: attribution fidelity. Risk: multiple contracts. Consequence: per-owner references.
- **OPTION B:** Finance request with family authorization reference. Advantage: clear execution boundary. Risk: no independent family execution. Consequence: Finance owns request/result.
- **OPTION C:** Scope Family Capital instructions out. Advantage: no ledger risk. Risk: no workflow. Consequence: assessment only.

**Recommended ratification question:** `For each capital pool, who owns it legally/economically, which body may authorize an instruction, and what Finance OS request/result contract proves execution?`

**Required evidence/documentation:** Legal ownership/instrument, investment policy, thresholds, Finance contract, audit profile.

**Required legal instrument, policy, resolution, or authority:** Legal/Finance/fiduciary ratification.

**Downstream implementation impact:** Blocks capital instruction record, hand-off, permissions, and tests.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 13 — Family Loan policy and Finance hand-off
--------------------------------------------------
**Question:** What purposes, lender/borrower, approvals, documentation, interest, repayment, default, restructuring, tax, accounting, legal treatment, and Finance integration apply?

**Why this matters:** A modeled schedule cannot create a credit agreement, receivable, payment, tax treatment, or accounting result.

**Current repository evidence:** Family loan assessment engine; Finance ledger/treasury and legal entity primitives.

**Existing canonical rules:** Family layer may assess/instruct only; Finance/legal systems own consequences.

**What is already resolved:** No shadow loan ledger or autonomous disbursement.

**What remains unresolved:** Whether loans are permitted and all legal/financial terms.

**Decision classification:** Financial; legal; tax; fiduciary; family governance policy; technical implementation.

**Required authority:** Lender legal owner/trustee/authorized credit body and Finance authority.

**Legal review:** YES
**Finance review:** YES
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Ratified legal-entity loan policy. Advantage: enforceable authority. Risk: jurisdiction/tax complexity. Consequence: Finance/legal references required.
- **OPTION B:** Case-by-case legal/Finance approval. Advantage: conservative. Risk: no scalable policy. Consequence: no automatic eligibility.
- **OPTION C:** Loans prohibited/scoped out. Advantage: eliminates credit risk. Risk: no family-loan workflow. Consequence: engine remains pure assessment only.

**Recommended ratification question:** `Are family loans permitted for this legal owner and jurisdiction, and if so, what legally approved policy and Finance OS contract govern every financial consequence?`

**Required evidence/documentation:** Credit policy, lender authority, contract template/legal review, tax/accounting treatment, Finance integration contract.

**Required legal instrument, policy, resolution, or authority:** Legal/tax/Finance/fiduciary ratification.

**Downstream implementation impact:** Blocks loan instruction persistence, hand-off, and all execution paths.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 14 — Jurisdiction and conflict-of-laws model
--------------------------------------------------
**Question:** Which law governs a family institution, trust, entity, beneficiary, tax, privacy, and multi-jurisdiction conflict?

**Why this matters:** Country codes and jurisdictions are references, not legal conclusions.

**Current repository evidence:** `countries`, `jurisdictions`, party country/nationality, document jurisdiction metadata exist.

**Existing canonical rules:** Engines do not infer adoption, inheritance, trust, capacity, tax, or privacy law.

**What is already resolved:** Jurisdiction must be authoritative and auditable, not guessed.

**What remains unresolved:** Governing law, applicable law per object, conflicts, and escalation.

**Decision classification:** Legal; jurisdictional; tax; privacy/security; financial.

**Required authority:** Legal counsel and authorized governing body.

**Legal review:** YES
**Finance review:** CONDITIONAL
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Single governing jurisdiction with legal exceptions. Advantage: simple default. Risk: may be invalid. Consequence: legal confirmation required.
- **OPTION B:** Object/instrument-specific jurisdiction. Advantage: accurate. Risk: complex. Consequence: multiple jurisdiction references.
- **OPTION C:** Scope cross-border cases out. Advantage: conservative. Risk: operational limitation. Consequence: fail closed on multi-jurisdiction cases.

**Recommended ratification question:** `For each object class and cross-border case, which governing/applicable law controls and who provides the conflict-of-laws determination?`

**Required evidence/documentation:** Legal opinion/policy, jurisdiction mapping, exception/escalation procedure.

**Required legal instrument, policy, resolution, or authority:** Legal ratification.

**Downstream implementation impact:** Blocks jurisdiction fields/validation and affected workflows.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 15 — Privacy, minors, sealed and retained family records
--------------------------------------------------
**Question:** What classification, access, consent/lawful basis, retention, deletion, legal hold, sealed-record, incapacity, and audit-access rules apply?

**Why this matters:** Genealogy, beneficiary and capacity data are highly sensitive.

**Current repository evidence:** Classification, consents, documents, retention policies, legal hold, vault metadata, RBAC/ABAC, audit exist.

**Existing canonical rules:** Existing BEYU privacy/security primitives are authoritative; Family Office is highly restricted.

**What is already resolved:** No new privacy/security subsystem is allowed.

**What remains unresolved:** Family-specific lawful basis, retention, sealed access, minor/capacity, and disclosure policy.

**Decision classification:** Privacy/security; legal; jurisdictional; family governance policy.

**Required authority:** Privacy/data governance owner.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Jurisdiction-specific retention/access schedule. Advantage: legal fit. Risk: complex. Consequence: policy references per record.
- **OPTION B:** Restricted read-only initial scope. Advantage: lower risk. Risk: limited operations. Consequence: no sensitive writes.
- **OPTION C:** Exclude minors/sealed records. Advantage: conservative. Risk: incomplete institution view. Consequence: explicit fail-closed handling.

**Recommended ratification question:** `What lawful basis, classification, retention, access, sealed-record, and minor/incapacity safeguards govern each family information class in each applicable jurisdiction?`

**Required evidence/documentation:** Data inventory, DPIA/privacy review, retention schedule, access matrix.

**Required legal instrument, policy, resolution, or authority:** Privacy/legal ratification.

**Downstream implementation impact:** Blocks sensitive persistence, APIs, access policy, and audit views.

**Status:** REQUIRES LEGAL/POLICY RATIFICATION — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 16 — Evidence, audit, provenance and correction contract
--------------------------------------------------
**Question:** What evidence types, event names, authority context, policy version, effective dates, correction/supersession, and retention rules apply to each family object?

**Why this matters:** Material state must be reconstructable without creating a second audit/event ledger.

**Current repository evidence:** `documents`, hash-chained audit/event stores, trace/correlation/causation, authority context and policy version fields exist.

**Existing canonical rules:** Canonical audit/event stores are append-only and authoritative.

**What is already resolved:** No family-owned event system; every material write must be audited.

**What remains unresolved:** Object-specific evidence profile, event catalogue, and correction/retention contract.

**Decision classification:** Enterprise policy; legal; privacy/security; financial; technical implementation.

**Required authority:** Audit/control owner and domain data owner.

**Legal review:** CONDITIONAL
**Finance review:** CONDITIONAL
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Ratified per-object event/evidence matrix. Advantage: complete provenance. Risk: preparation cost. Consequence: clear API/migration tests.
- **OPTION B:** Restricted read-only scope. Advantage: no mutation risk. Risk: no workflow. Consequence: defer write event catalogue.
- **OPTION C:** Reuse generic audit without profile. Advantage: fastest. Risk: insufficient governance evidence. Consequence: not acceptable for material writes.

**Recommended ratification question:** `For each proposed family object/action, which evidence, event, actor, authority, policy version, effective period, retention, and correction data are mandatory?`

**Required evidence/documentation:** Object-to-event matrix, evidence taxonomy, audit retention rules.

**Required legal instrument, policy, resolution, or authority:** Audit/data-governance approval.

**Downstream implementation impact:** Blocks material mutations and event payload contract.

**Status:** PARTIAL — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 17 — Noelia/HIVE constitutional boundary
--------------------------------------------------
**Question:** May Noelia/HIVE create authority, invent policy, determine entitlement, amend instruments, appoint/remove fiduciaries, override governance/Finance, or bypass approvals/audit?

**Why this matters:** Prevents AI authority laundering.

**Current repository evidence:** Noelia/HIVE runtime/audit, family human-write assertions, and `NOELIA_MAY_NOT` boundary exist.

**Existing canonical rules:** Noelia may analyze/evaluate/explain/recommend/alert and assist authorized workflow; it may not approve, amend, create authority, or bypass controls.

**What is already resolved:** All prohibited actions are prohibited; AI cannot resolve `POLICY DECISION REQUIRED`.

**What remains unresolved:** None for the boundary; any future tool must separately satisfy human authorization and audit.

**Decision classification:** Architectural; enterprise policy; security.

**Required authority:** Existing BEYU constitutional/security authority.

**Legal review:** NO
**Finance review:** NO
**Security/privacy review:** CONDITIONAL
**Phase 3 blocker:** NO

**Possible options:**
- **OPTION A:** Preserve existing boundary. Advantage: canonical safety. Risk: none beyond operational limits. Consequence: AI stays advisory.
- **OPTION B:** No compatible alternative. Advantage: n/a. Risk: any expansion would conflict with architecture. Consequence: prohibited.

**Recommended ratification question:** `Confirm that Noelia/HIVE remains advisory and human-authorized only, with no constitutional, fiduciary, beneficiary, financial-truth, or policy authority.`

**Required evidence/documentation:** Existing policy/boundary references and AI workflow audit record.

**Required legal instrument, policy, resolution, or authority:** Existing BEYU authority; no family-specific change.

**Downstream implementation impact:** Future features must invoke existing governed AI controls.

**Status:** RESOLVED.

--------------------------------------------------
## DECISION 18 — Finance OS financial-truth boundary
--------------------------------------------------
**Question:** May Family Office hold balances, post transactions, own loan accounting, or become financial truth?

**Why this matters:** Prevents a second ledger and divergent financial provenance.

**Current repository evidence:** Finance ledger, posting, treasury, capital, waterfall, tax, contract, and lineage modules exist.

**Existing canonical rules:** Family Office only governs/instructs/references; Finance OS holds canonical records and consequences.

**What is already resolved:** Family Office cannot become ledger, payment, receivable, waterfall, or financial-provenance owner.

**What remains unresolved:** Only the legal/Finance hand-off terms in Decisions 12–13.

**Decision classification:** Architectural; financial; enterprise policy.

**Required authority:** Existing BEYU Finance architecture authority.

**Legal review:** CONDITIONAL
**Finance review:** YES
**Security/privacy review:** CONDITIONAL
**Phase 3 blocker:** NO for boundary; YES for specific hand-offs.

**Possible options:**
- **OPTION A:** Preserve Finance-only truth. Advantage: canonical consistency. Risk: none. Consequence: reference-only family data.
- **OPTION B:** No compatible family-ledger option. Advantage: n/a. Risk: architecture conflict. Consequence: prohibited.

**Recommended ratification question:** `Confirm that every capital/loan/distribution financial consequence is created, authorized, and recorded only in Finance OS, with Family Office retaining at most a governed reference.`

**Required evidence/documentation:** Finance contract for any future adapter.

**Required legal instrument, policy, resolution, or authority:** Existing boundary plus future Finance approval.

**Downstream implementation impact:** Prohibits financial tables/endpoints in Family Office.

**Status:** RESOLVED.

--------------------------------------------------
## DECISION 19 — Identity, legal entity, and audit canonical ownership
--------------------------------------------------
**Question:** May Family Institution create a second person identity, legal entity, tenant, delegation, or audit/event system?

**Why this matters:** Duplicate masters cause conflicting authority and provenance.

**Current repository evidence:** Canonical parties/users, tenants/legal entities, delegations, documents/audit/events exist.

**Existing canonical rules:** Family model explicitly defers identity, constitutional authority, fiduciary authority, and financial truth to canonical systems.

**What is already resolved:** No duplicate master subsystem is allowed.

**What remains unresolved:** None; object-specific references still need policy.

**Decision classification:** Architectural; enterprise policy; security.

**Required authority:** Existing BEYU architecture authority.

**Legal review:** NO
**Finance review:** NO
**Security/privacy review:** CONDITIONAL
**Phase 3 blocker:** NO

**Possible options:**
- **OPTION A:** Reuse canonical owners. Advantage: coherent control plane. Risk: integration discipline required. Consequence: reference/FK approach only.
- **OPTION B:** No compatible duplicate-master option. Advantage: n/a. Risk: architecture conflict. Consequence: prohibited.

**Recommended ratification question:** `Confirm that all future Family Institution persistence references canonical BEYU identity, tenant, legal-entity, delegation, document, audit, and event primitives rather than duplicating them.`

**Required evidence/documentation:** Architecture contract and integration review.

**Required legal instrument, policy, resolution, or authority:** Existing BEYU architecture authority.

**Downstream implementation impact:** Prohibits duplicate master tables/services.

**Status:** RESOLVED.

--------------------------------------------------
## DECISION 20 — Existing family-member record lifecycle
--------------------------------------------------
**Question:** What lifecycle governs creation, verification, suspension, death, dispute, archival, and correction of `family_members`?

**Why this matters:** Existing verification/deceased fields do not define institutional status/effect.

**Current repository evidence:** Generic lifecycle enum, verification status, deceased date, lineage engine.

**Existing canonical rules:** Membership is not rights or entitlement; verification must be human/evidence governed.

**What is already resolved:** Generic lifecycle vocabulary is reusable.

**What remains unresolved:** Transition authority, legal effects, dispute/death/archive behavior.

**Decision classification:** Family governance policy; legal; privacy/security; technical implementation.

**Required authority:** Family governance/data owner.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Map to generic lifecycle with evidence policy. Advantage: reuse. Risk: may not capture legal nuance. Consequence: ratified transition map required.
- **OPTION B:** Family-specific projection lifecycle. Advantage: expressive. Risk: duplicate semantics. Consequence: only if justified.
- **OPTION C:** Read-only registry. Advantage: minimal risk. Risk: no corrections. Consequence: defer writes.

**Recommended ratification question:** `Which accountable authority may transition a family-member record through each lifecycle state, with what evidence and without conferring unrelated rights?`

**Required evidence/documentation:** Lifecycle/transition matrix, dispute/death/correction policy.

**Required legal instrument, policy, resolution, or authority:** Family data-governance policy.

**Downstream implementation impact:** Blocks member write/lifecycle design.

**Status:** UNRESOLVED — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 21 — Governance body persistence and membership lifecycle
--------------------------------------------------
**Question:** Is persistent Family Council/committee membership required, and how is its lifecycle related to canonical governance members?

**Why this matters:** A parallel member table can accidentally create voting or fiduciary authority.

**Current repository evidence:** Canonical governance members/resolutions; family forum/committee pure models.

**Existing canonical rules:** Governance authority is canonical; family bodies do not automatically decide reserved matters.

**What is already resolved:** A competing governance system is prohibited.

**What remains unresolved:** Need for persistence, relationship to canonical memberships, appointments/terms/recusal.

**Decision classification:** Architectural; family governance policy; legal; fiduciary; technical implementation.

**Required authority:** Family constitutional/governance authority.

**Legal review:** YES
**Finance review:** CONDITIONAL
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Reference canonical governance memberships. Advantage: no duplication. Risk: may lack family mandate metadata. Consequence: adapter only.
- **OPTION B:** Policy-defined family-body projection. Advantage: captures mandate/term. Risk: authority confusion. Consequence: explicit non-authority linkage required.
- **OPTION C:** No persistence. Advantage: conservative. Risk: no operational roster. Consequence: document/resolution reference.

**Recommended ratification question:** `Is a family-body projection necessary, and how is every appointment, term, mandate, recusal, and voting right tied to—not substituted for—canonical governance authority?`

**Required evidence/documentation:** Governance charter, appointment authority, mandate, canonical-member linkage.

**Required legal instrument, policy, resolution, or authority:** Governance/fiduciary ratification.

**Downstream implementation impact:** Blocks body/membership schema/API/permissions.

**Status:** UNRESOLVED — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 22 — Constitutional provision/version persistence
--------------------------------------------------
**Question:** Is a persistent provision/version registry required and how does it link to documents, resolutions, activation, effective periods, suspension, and supersession?

**Why this matters:** Text without validated ratification must not become constitutional authority.

**Current repository evidence:** Documents include version/authority status; resolutions/activation exist; constitution engine evaluates provisions.

**Existing canonical rules:** Document approval differs from activation/execution authority; superior sources outrank family text.

**What is already resolved:** Existing governance/document lifecycles should be reused where semantically fit.

**What remains unresolved:** Whether a registry is necessary and exact canonical mapping.

**Decision classification:** Constitutional; legal; family governance policy; technical implementation.

**Required authority:** Family constitutional authority and BEYU governance owner.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** NO
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Document-first projection linked to canonical resolution/activation. Advantage: maximal reuse. Risk: provision granularity may be insufficient. Consequence: no independent authority.
- **OPTION B:** Provision/version registry. Advantage: granular assessment. Risk: new lifecycle complexity. Consequence: only after Decisions 06–07.
- **OPTION C:** No persistence. Advantage: avoid false authority. Risk: engine consumes supplied documents only. Consequence: manual references.

**Recommended ratification question:** `Is granular provision persistence required, and which document, resolution, activation, effective-date, and supersession references make a provision authoritative?`

**Required evidence/documentation:** Ratified constitution, versioning/effectivity policy, legal review.

**Required legal instrument, policy, resolution, or authority:** Constitutional governance ratification.

**Downstream implementation impact:** Blocks constitution/version schema and workflow.

**Status:** UNRESOLVED — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 23 — Permission and separation-of-duties matrix
--------------------------------------------------
**Question:** Which existing or proposed permission is required for read, propose, verify, assess, approve, execute, and audit access, and what separation/step-up rules apply?

**Why this matters:** Permission capability alone cannot prove trustee, legal, or constitutional authority.

**Current repository evidence:** Explicit `PERMISSIONS`, high-risk grants, roles, RBAC/ABAC, tenancy, clearance, MFA, approval chain.

**Existing canonical rules:** Existing Family permissions are distinct; Finance/Governance permissions remain distinct; fail closed.

**What is already resolved:** Reuse explicit least-privilege authorization model, not wildcard grants.

**What remains unresolved:** Object/action matrix, role grants, SoD, MFA, classification, legal-authority evidence requirements.

**Decision classification:** Enterprise policy; security/privacy; family governance policy; legal; financial; technical implementation.

**Required authority:** Security/RBAC owner and relevant domain authority.

**Legal review:** CONDITIONAL
**Finance review:** CONDITIONAL
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Reuse existing permissions plus authority context. Advantage: minimal expansion. Risk: insufficient granularity. Consequence: detailed guard matrix.
- **OPTION B:** Add narrowly scoped permissions after ratification. Advantage: explicit boundaries. Risk: role drift. Consequence: constants/roles/parity review later.
- **OPTION C:** Read-only scope. Advantage: no new grants. Risk: no operations. Consequence: defer writes.

**Recommended ratification question:** `For every family object/action, which capability, authority proof, tenant/entity/jurisdiction scope, classification, SoD, and step-up condition is mandatory?`

**Required evidence/documentation:** Object-action authorization matrix, role review, threat model.

**Required legal instrument, policy, resolution, or authority:** Security/domain authority ratification.

**Downstream implementation impact:** Blocks guarded API and permission work.

**Status:** PARTIAL — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 24 — Family vault/document linkage
--------------------------------------------------
**Question:** How do `family_vault_items`, canonical documents, access policies, sealed access, succession instructions, retention, and legal holds relate?

**Why this matters:** Vault metadata must not become an unauthorized document or secrets system.

**Current repository evidence:** Vault item metadata; canonical documents, retention policy, legal hold, classification/access-policy references.

**Existing canonical rules:** Vault is metadata/index only; documents/security controls remain canonical.

**What is already resolved:** No independent vault storage/authority system.

**What remains unresolved:** Custody, sealed release, succession, document linkage, retention/access policy.

**Decision classification:** Privacy/security; legal; family governance policy; technical implementation.

**Required authority:** Information governance and Family Office custody authority.

**Legal review:** YES
**Finance review:** NO
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Canonical document reference with vault profile. Advantage: reuse. Risk: access complexity. Consequence: document/access policy linkage.
- **OPTION B:** No changes; vault index only. Advantage: conservative. Risk: limited evidence workflow. Consequence: defer writes.
- **OPTION C:** Separate secure store. Advantage: specialized custody. Risk: new subsystem conflict. Consequence: prohibited absent platform approval.

**Recommended ratification question:** `What custody, document linkage, access, sealed-release, succession, retention, and legal-hold authority governs each vault item class?`

**Required evidence/documentation:** Custody/access policy, retention/legal-hold mapping, succession authority.

**Required legal instrument, policy, resolution, or authority:** Information governance/legal ratification.

**Downstream implementation impact:** Blocks vault/document extension and access workflows.

**Status:** UNRESOLVED — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 25 — Family Capital instruction persistence
--------------------------------------------------
**Question:** Is a persistent non-financial instruction record justified; which references, lifecycle, legal-owner, Finance-request, and idempotency fields are required?

**Why this matters:** The wrong record becomes duplicate capital/financial truth.

**Current repository evidence:** Capital engine and Finance services exist; no instruction persistence.

**Existing canonical rules:** Family layer references Finance only; no balances, accounts, postings, or financial lineage.

**What is already resolved:** Financial truth boundary.

**What remains unresolved:** Need for record, lifecycle, idempotency, and Finance interface after Decision 12.

**Decision classification:** Financial; legal; technical implementation; audit.

**Required authority:** Family capital authority, legal owner, Finance owner.

**Legal review:** YES
**Finance review:** YES
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Reference-only resolution/Finance request. Advantage: no new record. Risk: limited family workflow state. Consequence: no table.
- **OPTION B:** Non-financial instruction adapter. Advantage: governed orchestration. Risk: shadow-ledger risk. Consequence: strict Finance references/idempotency required.
- **OPTION C:** Scope out. Advantage: conservative. Risk: no workflow. Consequence: engine only.

**Recommended ratification question:** `After capital authority and Finance hand-off are ratified, is a non-financial instruction record necessary and which mandatory references prevent it from becoming financial truth?`

**Required evidence/documentation:** Finance contract, legal-owner authorization, audit/event profile.

**Required legal instrument, policy, resolution, or authority:** Decision 12 ratification plus Finance approval.

**Downstream implementation impact:** Blocks table/index/FKs/API/permission design.

**Status:** UNRESOLVED — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 26 — Family Loan instruction persistence
--------------------------------------------------
**Question:** Is a persistent non-financial loan instruction justified; which legal/Finance references and lifecycle fields are required?

**Why this matters:** The wrong record becomes a second loan book.

**Current repository evidence:** Loan engine and Finance/legal primitives exist; no instruction persistence.

**Existing canonical rules:** Family layer cannot create receivable/payable, disbursement, repayment, impairment, tax, or accounting truth.

**What is already resolved:** Finance/legal ownership of consequences.

**What remains unresolved:** Need for instruction record after loan policy, legal/tax and Finance contract.

**Decision classification:** Financial; legal; tax; fiduciary; technical implementation; audit.

**Required authority:** Lender legal owner, trustee/credit authority, Finance owner.

**Legal review:** YES
**Finance review:** YES
**Security/privacy review:** YES
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Reference-only legal/Finance workflow. Advantage: no duplicate ledger. Risk: limited Family Office state. Consequence: no instruction table.
- **OPTION B:** Non-financial instruction adapter. Advantage: documented governance path. Risk: false credit authority. Consequence: strict legal/Finance references.
- **OPTION C:** Scope out loans. Advantage: eliminates risk. Risk: no feature. Consequence: engine remains assessment only.

**Recommended ratification question:** `After loan permission/terms and Finance/legal treatment are ratified, is a non-financial instruction record necessary and which references/lifecycle states prevent a shadow loan book?`

**Required evidence/documentation:** Loan policy, lender authority, legal/tax review, Finance contract, audit profile.

**Required legal instrument, policy, resolution, or authority:** Decision 13 ratification plus legal/Finance approval.

**Downstream implementation impact:** Blocks table/index/FKs/API/permission design.

**Status:** UNRESOLVED — BLOCKING PHASE 3.

--------------------------------------------------
## DECISION 27 — Explicit family policy-decision register operation
--------------------------------------------------
**Question:** How are unresolved decisions submitted, assigned, evidenced, ratified, expired, superseded, and published to implementers?

**Why this matters:** `POLICY DECISION REQUIRED` must result in accountable governance, not code defaults or AI resolution.

**Current repository evidence:** Family `policy-decisions.ts`, governance resolutions, documents, audit/events exist.

**Existing canonical rules:** Existing governance/policy primitives remain canonical; Noelia cannot resolve policy absence.

**What is already resolved:** A mechanism to record policy absence exists.

**What remains unresolved:** Named accountable owners, service levels, ratification/effectivity process, and publication process for this register.

**Decision classification:** Enterprise policy; family governance policy; legal; technical implementation.

**Required authority:** BEYU governance owner and Family Office sponsor.

**Legal review:** CONDITIONAL
**Finance review:** CONDITIONAL
**Security/privacy review:** CONDITIONAL
**Phase 3 blocker:** YES

**Possible options:**
- **OPTION A:** Canonical policy-decision register linked to resolutions/documents. Advantage: reuse. Risk: requires governance discipline. Consequence: no new subsystem.
- **OPTION B:** Manual controlled register. Advantage: immediate governance process. Risk: integration/provenance gaps. Consequence: must still link to canonical decisions.
- **OPTION C:** Scope dependent features out. Advantage: fail closed. Risk: delays all scoped features. Consequence: no implementation.

**Recommended ratification question:** `Which accountable body owns each FIR decision, how is its ratification evidenced/effective/superseded, and how does implementation receive only the current authoritative answer?`

**Required evidence/documentation:** Decision-owner assignment, resolution template, effective-date/publication process.

**Required legal instrument, policy, resolution, or authority:** Canonical governance policy resolution.

**Downstream implementation impact:** Blocks formal closure of every unresolved record.

**Status:** PARTIAL — BLOCKING PHASE 3.

## Consolidated matrices

### 1. Decision Status Matrix

| ID | Decision | Status | Authority | Legal | Finance | Security | Phase 3 Blocker |
|---|---|---|---|---|---|---|---|
| 01 | Formation and scope | Legal/policy ratification | Tenant/Family Office | Yes | Conditional | Yes | Yes |
| 02 | Multi-institution/tenant participation | Legal/policy ratification | Identity/tenant | Yes | No | Yes | Yes |
| 03 | Relationship classification | Legal/policy ratification | Family constitutional body | Yes | No | Yes | Yes |
| 04 | Lineage evidence/verification | Partial | Family/data owner | Yes | No | Yes | Yes |
| 05 | Parent-child integrity/history | Legal/policy ratification | Data/family authority | Yes | No | Yes | Yes |
| 06 | Constitution authority/electorate | Legal/policy ratification | Family/governance | Yes | No | No | Yes |
| 07 | Constitutional lifecycle/conflicts | Legal/policy ratification | Family/governance | Yes | No | No | Yes |
| 08 | Bodies/fiduciary roles | Legal/policy ratification | Trustees/family/entity | Yes | Conditional | No | Yes |
| 09 | Eligibility vs entitlement | Legal/policy ratification | Trustee/instrument authority | Yes | No | Yes | Yes |
| 10 | Beneficiary uniqueness/periods | Legal/policy ratification | Trustee/instrument authority | Yes | No | Yes | Yes |
| 11 | Delegation reuse | Partial | Valid authority/governance | Conditional | Conditional | Yes | Yes |
| 12 | Capital authority/Finance hand-off | Legal/policy ratification | Legal owner/Finance | Yes | Yes | Yes | Yes |
| 13 | Loan policy/Finance hand-off | Legal/policy ratification | Legal owner/Finance | Yes | Yes | Yes | Yes |
| 14 | Jurisdiction/conflict of laws | Legal/policy ratification | Legal counsel/governing body | Yes | Conditional | Yes | Yes |
| 15 | Privacy/minors/sealed/retention | Legal/policy ratification | Privacy/data governance | Yes | No | Yes | Yes |
| 16 | Audit/evidence/provenance | Partial | Audit/data owner | Conditional | Conditional | Yes | Yes |
| 17 | Noelia/HIVE boundary | Resolved | BEYU constitutional/security | No | No | Conditional | No |
| 18 | Finance truth boundary | Resolved | BEYU Finance authority | Conditional | Yes | Conditional | Conditional |
| 19 | Canonical ownership | Resolved | BEYU architecture | No | No | Conditional | No |
| 20 | Family-member lifecycle | Unresolved | Family/data owner | Yes | No | Yes | Yes |
| 21 | Governance body persistence | Unresolved | Family/governance | Yes | Conditional | Yes | Yes |
| 22 | Constitution version persistence | Unresolved | Family/governance | Yes | No | No | Yes |
| 23 | Permissions/SoD matrix | Partial | Security/domain authority | Conditional | Conditional | Yes | Yes |
| 24 | Vault/document linkage | Unresolved | Information governance/custody | Yes | No | Yes | Yes |
| 25 | Capital instruction persistence | Unresolved | Capital/legal/Finance | Yes | Yes | Yes | Yes |
| 26 | Loan instruction persistence | Unresolved | Lender/legal/Finance | Yes | Yes | Yes | Yes |
| 27 | Policy-register operation | Partial | BEYU governance/Family Office | Conditional | Conditional | Conditional | Yes |

### 2. Ratification Matrix

| ID | Exact decision required | Decision-maker | Required instrument | Deadline/gate |
|---|---|---|---|---|
| 01–02 | Institution identity/scope and multi-tenant membership | Tenant/identity authority + Family sponsor | Formation/tenant/privacy policy | Before root/member schema |
| 03–05,20 | Relationship effects, evidence, history, lifecycle | Family authority + legal/data owner | Relationship/evidence/dispute policy | Before member changes |
| 06–07,22 | Constitution authority/lifecycle/persistence | Family constitutional body + governance | Ratified constitution/resolution/legal review | Before constitutional storage |
| 08,21 | Bodies, fiduciaries, memberships | Trustees/entity/family authority | Mandate/appointment authority matrix | Before body storage |
| 09–10 | Beneficiary rules/uniqueness | Trustee/instrument owner | Trust instrument confirmation | Before beneficiary changes |
| 11 | Delegable powers | Valid authority + governance | Delegation matrix | Before delegation adapter |
| 12–13,25–26 | Capital/loan policy and persistence | Legal owner + Finance + counsel | Finance/legal hand-off contract | Before instruction storage |
| 14–15,24 | Jurisdiction/privacy/vault treatment | Legal/privacy/custody owner | Legal/privacy/retention policy | Before sensitive data writes |
| 16,23,27 | Audit, permissions, ratification operation | Audit/security/governance owners | Object-action/event/decision matrices | Before any mutation |

### 3. Phase 3 Blocker Matrix

| Group | Blocking decisions | Gate |
|---|---|---|
| Identity | 01, 02, 19 | Canonical identity remains reused; formation and membership cardinality ratified. |
| Tenancy | 01, 02, 05, 14 | Tenant and cross-tenant/jurisdiction semantics ratified. |
| Family relationships | 03, 04, 05, 20 | Evidence, legal effects, history, dispute and lifecycle rules ratified. |
| Constitution | 06, 07, 22 | Authority, thresholds, conflict/lifecycle/version rules ratified. |
| Governance | 08, 21 | Mandates and canonical governance linkage ratified. |
| Beneficiaries | 09, 10 | Trustee/instrument-confirmed eligibility/effective-period rules ratified. |
| Trustees/Fiduciaries | 06–10, 12–13 | Reserved authority mapping ratified. |
| Delegation | 11 | Canonical-scope/non-delegable matrix ratified. |
| Jurisdiction | 03, 05, 09–10, 14–15 | Applicable/conflict law determination ratified. |
| Privacy | 02–05, 09–10, 14–16, 24 | Lawful basis, retention, sealed/minor access ratified. |
| Family Capital | 12, 25 | Owner/authority/Finance hand-off ratified. |
| Family Loans | 13, 26 | Permitted policy/legal/tax/Finance contract ratified. |
| Finance OS | 12–13, 25–26 | Finance remains truth; exact integration approved. |
| Permissions | 23 | Object-action/SoD/step-up matrix ratified. |
| Audit | 16, 27 | Event/evidence and ratification audit contract ratified. |
| AI/Noelia | 17 | Not a blocker; boundary is resolved and immutable. |

### 4. Decision Dependency Graph

```text
01 Formation/scope ─┬─> 02 Tenant/multi-institution membership ─> 20 Member lifecycle
                    │                                           └> 05 Parent/child integrity
                    └─> 14 Jurisdiction ─> 15 Privacy/retention ─> 24 Vault/document linkage
03 Relationship policy ─> 04 Evidence/verification ─> 05 Relationship history ─> 20 lifecycle
06 Constitutional authority ─> 07 lifecycle/conflicts ─> 22 provision/version persistence
06 + 07 + 08 governance/fiduciary roles ─> 21 body persistence
03 + 06 + 08 + 14 ─> 09 beneficiary eligibility ─> 10 uniqueness/effective periods
08 + 11 delegation + 23 permission/SoD ─> all governed mutation designs
12 Capital authority + 16 audit profile + 23 permissions ─> 25 capital instruction persistence
13 Loan policy + 16 audit profile + 23 permissions ─> 26 loan instruction persistence
16 audit/evidence + 27 ratification operation ─> every write contract
17 Noelia boundary and 18 Finance boundary and 19 canonical ownership constrain every branch
All applicable blockers resolved or explicitly scoped out ─> separate Phase 3 specification ─> migration 0018 design (not creation)
```

## Phase 3 readiness test

- **Total decisions:** 27
- **RESOLVED:** 3
- **PARTIAL:** 5
- **UNRESOLVED:** 6
- **REQUIRES LEGAL/POLICY RATIFICATION:** 13
- **BLOCKING PHASE 3:** 24

### Is Phase 3 ready to begin?

**NO — POLICY RATIFICATION REQUIRED.**

Phase 3 may begin only after every blocking decision is formally resolved or explicitly scoped out by the authorized authority; the resulting decisions are evidenced through canonical governance/documents/audit; and a distinct Phase 3 specification is approved. This matrix makes no policy selection and performs no production implementation.
