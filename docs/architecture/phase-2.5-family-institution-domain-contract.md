# Phase 2.5 — BEYU Multigenerational Family Institution Architecture & Domain Contract

**Status:** DISCOVERY + ARCHITECTURE + DOMAIN CONTRACT ONLY — **NOT APPROVED FOR IMPLEMENTATION**

**Repository baseline verified:** `HEAD = da1ef20df72dd593773d8d698b90ec76f4137558` (PR #7 merge); working tree was clean before this report was added.

**Scope boundary:** `BEYU OS → BEYU Family Office → Multigenerational Family Institution Model`. The model is a cross-cutting institutional layer, not an OS, ledger, identity system, or constitutional control plane.

## Decision legend

| Classification | Meaning |
|---|---|
| **EXISTS** | Canonical primitive/implemented Phase 1–2 engine is present and must be reused. |
| **EXTEND** | Existing primitive is owner; a governed adapter, fields, or service boundary may be added later. |
| **MISSING** | No production persistence/service exists; no Phase 3 implementation is authorized by this report. |
| **CONFLICTING** | Two concepts must not be conflated; enforce the stated boundary. |
| **UNKNOWN / POLICY DECISION REQUIRED** | Authoritative policy, instrument, jurisdictional rule, or owner has not been supplied. Fail closed. |

## 1. Current repository architecture

BEYU OS already provides a constitutional control plane and enterprise kernel: global parties/users, tenants/legal entities, RBAC + ABAC + clearance + step-up authorization, governance resolutions/delegations, Finance OS, append-only hash-chained audit/events, and HIVE/Noelia. `src/lib/architecture/completeness.ts` classifies Family Office as first-class but **PARTIAL** because it has schema/UI and no write service boundary. It explicitly says Family Office is not a separate OS and is HIGHLY_RESTRICTED.

## 2. Existing Family Office architecture

| Capability | Classification | Owner / source of truth | Treatment |
|---|---|---|---|
| Registry | EXISTS | `people.family_members` → `identity.parties` | Extend only through canonical identity linkage; do not duplicate people. |
| Beneficiary registry | EXISTS | `people.beneficiaries`, legal attribution via `core.legal_entities` | Extend, never substitute for a trust instrument/trustee decision. |
| Vault index | EXISTS | `people.family_vault_items`, document/access-policy references | Leave schema untouched pending access-policy ownership decision. |
| UI | EXISTS, read-oriented | `src/app/os/family/page.tsx` | Leave untouched in this phase. |
| APIs / writes | MISSING | Must use guarded BEYU API pattern | Design only. |
| Six operating categories | UNKNOWN as persistent domains | No category-specific authoritative models found | Do not create six separate OSs/tables by default. |

## 3. Existing Phase 1–2 Family Institution engines

**EXISTS, preserve exactly:**

- `model.ts`: legal supremacy, trustee reserved matters, family-line vocabulary, participation axes, committees, policy-decision types; explicit fail-closed and AI-is-never-authority invariants.
- `institution.ts`: forums, committee mandates, meetings, accountability, conflicts; human-only governance writes.
- `constitution.ts`: provision supremacy, in-force evaluation, staged amendment assessment; human-only amendment writes.
- `lineage.ts`: bounded graph, descent determination/evidence/reconciliation; human-only lineage writes.
- `eligibility.ts`: independently evaluated participation domains; no automatic conferment/spousal inheritance.
- `capital.ts`: strategic pool, segregation, allocation and IPS assessments; non-ledger and human-only writes.
- `loan.ts`: loan documentation/lifecycle/eligibility/schedule assessments; no disbursement authority.
- `decision-gate.ts`, `alignment.ts`, `policy-decisions.ts`: fail-closed gates, Noelia limits, delegation/emergency assessment, and registered `POLICY DECISION REQUIRED` workflow.

Tests in `tests/family/` cover all of these engines. **No concrete defect was discovered.**

## 4. Existing database primitives

| Structure | Classification | Contract / treatment |
|---|---|---|
| `identity.parties`, `users` | EXISTS | One person master/GlobalUserID. `family_members.party_id` is unique: reuse as the anti-duplicate identity anchor. |
| `core.tenants`, `legal_entities` | EXISTS | Tenant isolation and legal attribution remain authoritative. |
| `family_members` | EXTEND | Reuse as family-registry projection. Current unique party constraint is global rather than `(tenant, party)`; do not alter without tenant-membership policy. Parent link lacks DB FK. Phase 3 must reconcile only with governed lineage evidence. |
| `beneficiaries` | EXTEND | Reuse as trust-specific beneficiary record. Add no duplicate “institution beneficiary” entity. Later constrain uniqueness/lifecycle only after trustee/instrument/jurisdiction policy is ratified. |
| `family_vault_items` | EXTEND | Reuse as metadata/index, not document storage, authority, or a new secrets system. |
| Governance tables/resolutions/votes | EXISTS | Canonical decision/vote lifecycle. |
| Identity delegations | EXISTS | Canonical executable delegation; family engine delegation assessment is an analytic contract, not a replacement store. |
| `platform.audit_log`, `enterprise_events` | EXISTS | Canonical audit/event provenance. |
| Finance ledger/capital/waterfall tables | EXISTS | Finance truth only. |

## 5. Existing permissions

**EXISTS:** `family:member.read/manage`, `family:beneficiary.read/manage`, `family:vault.read`; beneficiary management is high risk. `FAMILY_OFFICE_PRINCIPAL` is HIGHLY_RESTRICTED and has these grants. Finance, governance, and AI permissions are distinct.

**EXTEND:** future permissions must be object/action scoped and explicitly granted in `constants.ts`, roles, parity checks, ABAC and tenant/classification controls. Candidate names are only proposals: `family:constitution.read/propose`, `family:forum.manage`, `family:lineage.verify`, `family:eligibility.assess`, `family:capital.request`, `family:loan.request`. No permission may grant trustee, court, legal-entity, or constitutional authority.

## 6. Existing governance primitives

**EXISTS:** governance constitution/policy hierarchy, resolutions and vote lifecycle, reserved matters, authority engines/services, canonical delegations, decision activation, and family decision gate. **CONFLICTING:** a Family Council/family committee is not automatically a legal trustee, board, protector, or financial approver. **UNKNOWN:** instrument-specific quorum, eligibility, amendment threshold, emergency authority, committee mandates, and jurisdictional validity all require ratified policy.

## 7. Existing audit/event primitives

**EXISTS:** `publishEventTx`, `audit_log`, `enterprise_events`, trace IDs and hash-chain heads. Every future mutation must emit an auditable intent, authorization/authority evidence, decision/resolution reference, policy/version references, input provenance, resulting state, and Finance reference where relevant. Engines are deterministic assessments and must record version/checksum when persisted. No family-owned event log.

## 8. Identity / tenant / entity boundaries

- **Identity authority:** `parties` and `users`; a family member is a classified institutional relationship to a party, not a second person identity.
- **Tenant authority:** `tenants`; all family records must remain tenant-scoped and authorized through existing ABAC/tenancy checks.
- **Legal attribution:** `legal_entities`; trusts/foundations/holdings retain their own attribution and fiduciary authority.
- **Country/jurisdiction:** existing country/legal architecture is authoritative. Family engines cannot infer jurisdictional eligibility, adoption recognition, inheritance, tax, trust, or capacity rules.

## 9. Existing Finance OS integration

**EXISTS:** Finance OS owns ledger posting, treasury, capital requests, waterfalls, tax and financial provenance. Finance services/contracts include governance authorization patterns. **CONFLICTING:** genealogical lineage is person/descent evidence; Finance lineage/provenance is financial-record derivation. They must never share a table, identifier semantics, or authority rule.

## 10. Gaps

MISSING: persistent institution/constitution provision registry, family forum/committee membership service, evidence-document binding/service, eligibility determination registry, family capital *instruction* adapter, family loan *instruction* adapter, family-specific policy binding, read API, mutation API, authorization adapters, audit event catalogue, and integration contracts. These are proposed only—not approved schema work.

## 11. Conflicts to prevent

1. Family member ≠ account/user; party identity remains canonical.
2. Beneficiary record ≠ trustee determination/instrument entitlement.
3. Family Capital instruction ≠ financial account/ledger/asset ownership.
4. Family loan request/assessment ≠ receivable, disbursement, repayment posting or tax treatment.
5. Family constitution ≠ BEYU OS Constitution, statute, court order, trust instrument, or fiduciary duty.
6. Noelia assessment ≠ authority, vote, amendment, eligibility conferment, disbursement, or override.
7. Family governance participation ≠ ownership, beneficiary status, voting, or legal signatory authority.

## 12. Unknowns — POLICY DECISION REQUIRED

Before any write model: family/institution tenancy model; canonical family identifier/formation authority; recognized relationships/adoption and evidence standards by jurisdiction; privacy/retention/minor/capacity rules; trustee/instrument mapping; beneficiary uniqueness/effective-period rules; family constitution ratification/amendment threshold; forum electorate/quorum; delegation and emergency limits; capital pool legal/financial owner; loan tax/consumer-credit/accounting treatment; vault custody/access/recovery; each category’s operational mandate; cross-border conflict-of-laws. Register these through the existing policy-decision mechanism—never hard-code an answer.

## 13. Canonical Family Institution domain model

The canonical model is a **governed relationship and instruction layer**:

`Institutional Family` (policy-defined scope) → `FamilyMember` (party relationship, lineage evidence) → independently granted `ParticipationRights`; `Forum/Committee` (governance body) → governed `Resolution/Delegation`; `ConstitutionProvision` (subordinate policy) → `EligibilityDetermination`, `CapitalInstruction`, or `LoanInstruction` → external authoritative legal/Finance record references.

Six categories consume this layer: Business Development (opportunity/advisory only), Wealth Management (Finance-owned execution), Wealth Planning (legal/tax counsel controlled), Family Governance (forums/policies), Lifestyle Management (service coordination), Philanthropy (foundation/nonprofit legal entities). Family Constitution, Stewardship, Education, Governance, Capital, Legacy are cross-cutting concerns—not a seventh category or six new ledgers.

## 14. Entity relationship model

```text
Tenant ──< LegalEntity (trust/foundation/etc.)
Tenant ──< Party ──0..1 FamilyMember ──< lineage evidence / relationship edges
FamilyMember ──< ParticipationGrant >── Forum/Committee
FamilyMember ──< Beneficiary >── LegalEntity(TRUST)
FamilyMember ──< FamilyVaultItem (metadata only)
ConstitutionProvision ──< governed Resolution / policy decision
Forum/Committee ──< governed Resolution / Delegation
CapitalInstruction or LoanInstruction ──> Finance OS request/transaction reference
All governed mutations ──> AuditLog + EnterpriseEvent
```

All arrows to Finance are references, never a parallel balance, transaction, or financial lineage.

## 15. Authority / source-of-truth matrix

| Subject | Authoritative owner | Family layer role |
|---|---|---|
| Person identity | Identity `parties/users` | Reference only |
| Family relationship/descent evidence | `family_members` plus governed documentary evidence | Registry/projection; human verification |
| Legal entity/trust | `legal_entities` and valid legal instruments | Reference only |
| Beneficiary legal determination | Trustee/instrument/law | Record verified status/reference; never decide |
| Constitution | BEYU Constitution/policy hierarchy; family constitution only subordinate | Assess/process, never supersede |
| Family decision | Governance resolution + valid authority | Gate/associate only |
| Delegation | Canonical identity/governance delegation | Validate/consume only |
| Financial truth | Finance OS ledger and financial provenance | Instruct/reference only |
| AI output | HIVE execution / Noelia output record | Advisory only |
| Audit/event | Platform audit/event stores | Reuse only |

## 16. Lifecycle model

Proposed lifecycle contract (not a new enum): **DRAFT → EVIDENCE_PENDING → UNDER_REVIEW → GOVERNED_DECISION → EFFECTIVE / DECLINED / SUSPENDED / SUPERSEDED / ARCHIVED**. Map existing canonical document, resolution and activation enums rather than duplicating lifecycle enums. A state cannot become effective without tenant/classification checks, human actor, authoritative evidence, requisite resolution/delegation, jurisdictional applicability, and audit/event emission. Missing any input ⇒ **POLICY DECISION REQUIRED / no execution**.

## 17. Authorization / delegation model

All future endpoints must use existing `guarded()` / RBAC ∧ ABAC ∧ tenancy ∧ classification ∧ step-up gates and applicable governance authority. Separate **read**, **propose**, **verify**, **recommend**, **approve**, and **execute**. Only canonical delegations can confer delegable execution capacity; a family engine may assess a delegation but cannot create one. Service identities are bounded; AI actors are refused for conferment, approval, amendment, disbursement, override, and governance writes.

## 18. Constitutional / amendment model

BEYU OS constitutional/policy hierarchy is supreme. Family provisions are subordinate to applicable law, court order, trust instrument, trustee fiduciary duty/protector power, regulatory requirements, corporate documents, shareholder agreements, and letters of wishes as already modeled. Reuse `assessAmendment`, `checkSupremacy`, governance resolutions and decision activation. **POLICY DECISION REQUIRED:** who may propose/table/vote/ratify, quorum, effective date, jurisdiction and instrument-specific constraints. Never let a family constitutional record alter legal documents or authority by itself.

## 19. Eligibility model

Reuse lineage evidence and `evaluateEligibility`; retain six independent participation axes. Eligibility results are domain-specific and do not auto-confer beneficiary, ownership, governance, voting, attendance, or financial rights. Adopted-descendant treatment, spouses, minors/incapacity, exceptions, evidence requirements, and jurisdiction-specific outcomes remain policy decisions. Legal beneficiary determination remains trustee/instrument-owned.

## 20. Family Capital boundary

The existing capital engine is **EXISTS** as a strategic allocation assessment. A future `FamilyCapitalInstruction` may store non-financial purpose, requester party, policy/resolution evidence, target legal entity and a Finance request reference. Its owner is the Family Office workflow; its financial amount, commitment, approval, payment, positions, accounting and provenance are Finance OS-owned. It must contain no balances, postings, account numbers, waterfall allocation truth, or duplicate portfolio.

## 21. Family Loan boundary

The existing loan engine is **EXISTS** as documentation/eligibility/schedule assessment. A future `FamilyLoanInstruction` is only a governed request/assessment linked to parties, legal entity, policy, jurisdiction and Finance reference. Finance OS/legal/tax owners control contract creation, receivable/payable, disbursement, collections, impairment, reporting and postings. No family loan table may become a shadow loan book.

## 22. Finance OS boundary

Finance requests can receive family governance authorization/instruction but must independently pass Finance authorization, legal-entity mandate, accounting, treasury, tax, compliance and posting controls. Family policies cannot commit a waterfall, post a journal, move funds, change beneficial legal attribution, or bypass Finance controls. Finance financial lineage remains distinct from family genealogical lineage.

## 23. Noelia / HIVE boundary

HIVE is the governed runtime; Noelia is the unified BEYU AI identity/interface. Reuse `assertWithinNoeliaBoundary`, family human-write assertions, AI permission/approval workflow and epistemic labeling. Noelia may analyze, compare, forecast, simulate, draft, summarize, recommend and alert humans. It cannot create authority, decide eligibility, amend constitution, vote, appoint/remove trustees, determine beneficiaries, approve/disburse capital, bypass controls, or resolve POLICY DECISION REQUIRED.

## 24. Audit / provenance model

Every proposed domain record must include immutable identifiers/references, tenant, actor/actor type, purpose, classification, policy/instrument/resolution/delegation references, jurisdiction applicability, evidence document hashes/IDs, assessment engine version/input checksum, effective-period data, and audit trace ID. Audit/event records remain the authoritative mutation history. No AI-produced summary can be treated as evidence without human verification and source provenance.

## 25. Proposed schema changes (design only)

**No schema change is authorized in Phase 2.5; specifically no migration 0018.** If approved after policy decisions, prefer a minimal extension set:

| Proposed component | Authoritative owner / source | Preconditions |
|---|---|---|
| `family_institutions` policy scope/reference | Family Office; tenant + ratified formation policy | Tenant model and institutional scope ratified |
| `family_constitution_provisions` | Family Office policy registry, subordinate to governance/legal hierarchy | Amendment/ratiﬁcation policy + evidence model |
| `family_lineage_evidence` | Family Office evidence register; party/family member references | Privacy, retention, evidence policy |
| `family_participation_grants` | Family governance resolution/policy | Electorate/rights policy |
| `family_forums` / `family_committee_memberships` | Family governance; resolutions for mandate | Forum/mandate policy |
| `family_eligibility_determinations` | Family Office assessment record, not legal entitlement | Domain/jurisdiction rules |
| `family_capital_instructions` | Family Office instruction; Finance reference is financial truth | Finance contract and legal owner |
| `family_loan_instructions` | Family Office instruction; Finance/legal records authoritative | Credit/tax/accounting policy |

Do not add new party, user, beneficiary, ledger, transaction, balance, payment, financial-lineage, audit, event, delegation, resolution, country or legal-entity tables.

## 26. Proposed API surface (design only)

All APIs are `/api/v1/family/*`, guarded and tenant-scoped, with human-only mutation assertions and audit transaction. Proposed resource contracts: read/propose/verify for members and evidence; read/propose/assess for eligibility; read/propose/table/decide for constitution/forum artifacts by linking canonical governance endpoints; create/assess/submit Finance reference for capital and loan instructions. **Owners:** Family Office owns non-financial request/projection data; Governance owns resolutions; Finance owns execution/financial results; Identity owns subject identity. No endpoint directly changes a beneficiary legal entitlement, posts money, amends a legal instrument, or executes an AI decision.

## 27. Proposed permission changes (design only)

Add only after authorization policy approval and role review. Maintain explicit grants and high-risk designation for any create/verify/manage right involving lineage, eligibility, constitution, capital or loans. Read rights must enforce classification, relationship/need-to-know, tenancy, and possibly sealed-vault rules. Do not grant broad `family:*`, trustee powers, legal authority, or financial posting via family permissions.

## 28. Proposed UI surface (design only)

Family Office workspace: read-only institution dashboard; lineage/evidence review queue; policy-decision-required queue; constitution and forum pages linked to governance resolution records; eligibility explanation; capital/loan instruction pages that display Finance status by reference; audit/provenance panel. UI must not expose another ledger, decision authority control, trustee console, or Noelia autonomous approval experience.

## 29. Migration strategy

Phase 3 begins only after this contract is approved. First ratify policy decisions and map legal/jurisdiction authority. Then create a compatibility inventory and data-quality plan, introduce additive tenant-scoped tables/constraints in small reversible migrations, backfill only verified source records, validate duplicates and referential integrity, dual-read if necessary, and activate writes only after authorization/audit tests pass. Never migrate existing Phase 1–2 engine semantics; never overwrite existing beneficiary or financial records. Every migration must have rollback/read compatibility and a data classification review.

## 30. Test strategy

Retain all `tests/family/*` unchanged. Add unit tests for contract adapters and negative cases; integration tests for `guarded()` RBAC/ABAC/tenant/classification/step-up behavior; resolution/delegation linkage; append-only audit/event trace; Finance reference-only contract; jurisdiction/policy absence fail-closed behavior; duplicate party/beneficiary prevention; effective-period overlaps; concurrency/idempotency; privacy/minor/sealed-vault access; AI refusal; migration/backfill integrity. Add property tests for lineage cycles and participation-axis non-derivation. No test should fabricate a policy decision to make a flow pass.

## 31. Security / governance risks

Highly restricted genealogical data, minors/capacity, family conflict, trust confidentiality, cross-border privacy, unverified evidence, insider privilege escalation, stale delegation, duplicate identities, entitlement inflation, constitutional bypass, financial shadow books, and AI authority laundering are material risks. Mitigate with existing fail-closed authorization/audit mechanisms, evidence verification, explicit policy gates, least privilege, step-up, immutable provenance, jurisdiction checks, human accountable authority and independent Finance controls.

## 32. Items that must NOT be implemented

- No new OS/control plane/identity/tenant/entity/country/RBAC/ABAC/audit/event/ledger subsystem.
- No migration 0018 or any production migration in this phase.
- No changes to Phase 1–2 family engines absent a concrete defect.
- No financial postings, balances, payments, loan book, waterfall or duplicate Finance truth.
- No automatic beneficiary determination, lineage verification, eligibility conferment, constitutional amendment, delegation, trustee action, capital disbursement or emergency override.
- No Noelia/HIVE authority, votes, approvals, policy invention or autonomous execution.
- No bypass of legal instruments, jurisdiction, classification, governance, audit, Finance, or tenant controls.

## 33. Recommended Phase 3–8 implementation sequence

1. **Phase 3 — Policy ratification and contract acceptance:** resolve all listed POLICY DECISION REQUIRED items; nominate legal, trustee, governance, Finance and data owners.
2. **Phase 4 — Read/evidence foundation:** additive family institution/evidence/constitution projections, read APIs, classification/privacy/audit enforcement; no financial execution.
3. **Phase 5 — Governed participation and eligibility:** forum/committee and participation adapters; lineage evidence verification and eligibility assessments linked to canonical resolutions/delegations.
4. **Phase 6 — Constitution and stewardship workflows:** subordinate provision registry, amendment workflow integrated with governance resolution/activation; legal supremacy checks.
5. **Phase 7 — Capital and loan instruction adapters:** non-financial instruction lifecycle linked to Finance requests and legal entities; Finance remains sole executor/truth source.
6. **Phase 8 — Category experiences and assurance:** category-specific read/orchestration UI (Business Development, Wealth Management, Wealth Planning, Family Governance, Lifestyle, Philanthropy), audit dashboards, controls testing, data quality, and human-in-the-loop Noelia assistance.

**Approval gate:** Stop here. No Phase 3 work, PR, schema/API/permission/UI implementation, or engine change may begin until this Phase 2.5 domain contract and required policy decisions receive explicit approval.
