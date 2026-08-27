# Phase 3 — Unratified Implementation Denylist

**Rule:** No entry below may be implemented. The three resolved architectural boundaries (FIR-017–019) are constraints, not implementation grants. Every other decision has unratified implementation scope and therefore fails closed.

| Decision ID | Current status | Unresolved question / prohibited implementation | Why prohibited | Required ratification before implementation | Potential future impact |
|---|---|---|---|---|---|
| FIR-001 | Legal/policy ratification | Family Institution formation, scope, owner, canonical identity | No root authority or scope | Formation policy/instrument, authorized sponsor, legal review | Root scope/FKs/onboarding |
| FIR-002 | Legal/policy ratification | Multi-institution/cross-tenant membership and uniqueness changes | `party_id` uniqueness cannot determine policy | Tenant/identity/privacy decision | Membership cardinality/constraints |
| FIR-003 | Legal/policy ratification | Effects of descent, adoption, spouse, dependency, capacity, death, dispute | Relationships do not imply rights | Family/legal/jurisdiction policy | Membership/eligibility behavior |
| FIR-004 | Partial | Evidence hierarchy, verifier, correction, dispute processing | Evidence authority is absent | Evidence/verification policy | Evidence links/verification writes |
| FIR-005 | Legal/policy ratification | Parent FK, tenant consistency, temporal relationship history | Technical FK cannot decide legal semantics | Legal/data-governance decision | Integrity/history model |
| FIR-006 | Legal/policy ratification | Constitution proposer/electorate/ratifier | No constitutional authority matrix | Constitution/governance/legal ratification | Constitutional workflow |
| FIR-007 | Legal/policy ratification | Thresholds, effectivity, emergency, suspension, conflicts | No lifecycle policy | Ratified constitutional lifecycle | Version/effectivity behavior |
| FIR-008 | Legal/policy ratification | Body/fiduciary role mandate and authority | Roles do not create fiduciary power | Instrument/appointment authority | Bodies/mandates/memberships |
| FIR-009 | Legal/policy ratification | Beneficiary eligibility and entitlement treatment | Registry is not trustee/legal entitlement | Trust instrument/trustee/legal confirmation | Eligibility/registry changes |
| FIR-010 | Legal/policy ratification | Beneficiary uniqueness/overlapping periods | Valid trust arrangements may overlap | Trust-specific effective-period rule | Constraints/lifecycle |
| FIR-011 | Partial | Delegable scope, limits, non-delegability, emergency rules | Canonical primitive is not family authority | Delegation matrix and source authority | Adapter/reference only |
| FIR-012 | Legal/policy ratification | Capital owner/authority/threshold/Finance hand-off | No financial/fiduciary authority inferred | Legal/Finance/investment policy | Instruction integration only |
| FIR-013 | Legal/policy ratification | Loan permission/terms/tax/accounting/Finance hand-off | Engine is not loan authority | Legal/tax/Finance/credit policy | Instruction integration only |
| FIR-014 | Legal/policy ratification | Applicable law/conflict of laws | Country fields are not legal conclusions | Legal jurisdiction model | Jurisdiction validation |
| FIR-015 | Legal/policy ratification | Lawful basis, minors, sealed access, retention | Sensitive data requires policy | Privacy/legal retention/access policy | Data/access model |
| FIR-016 | Partial | Object evidence/event/correction/retention profile | Generic audit is insufficient for material writes | Audit/data-governance matrix | Mutation audit contract |
| FIR-020 | Unresolved | Family-member lifecycle effects/transitions | Existing fields do not define authority/effect | Lifecycle/transition policy | Member mutation model |
| FIR-021 | Unresolved | Family body persistence/canonical governance link | No parallel governance authority | Governance mandate/membership policy | Body/member model |
| FIR-022 | Unresolved | Constitution provision/version persistence | Documents are not automatically authority | Constitution lifecycle/persistence decision | Version schema/workflow |
| FIR-023 | Partial | Object/action permission, SoD, step-up, authority proof | Permission cannot confer legal authority | Security/domain authorization matrix | Guard/permission work |
| FIR-024 | Unresolved | Vault/document/custody/sealed-release linkage | Vault cannot become independent secrets/document system | Custody/privacy/legal policy | Document reference/access model |
| FIR-025 | Unresolved | Capital instruction persistence/idempotency | Must not create financial truth | FIR-012 + Finance contract/audit profile | Non-financial adapter only |
| FIR-026 | Unresolved | Loan instruction persistence/lifecycle | Must not create loan book | FIR-013 + Finance/legal contract/audit profile | Non-financial adapter only |
| FIR-027 | Partial | Assignment/effectivity/publication of policy decisions | Policy absence cannot self-resolve | Governance operating resolution | Ratification workflow discipline |

## Denied by architecture regardless of future policy

Even after ratification, nothing may create a separate Family Institution OS, duplicate parties/users/tenants/legal entities/delegations/audit events, override superior instruments, create AI authority, create beneficiary entitlement without legal authority, or create Family Office financial truth.
