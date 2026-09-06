# BEYU OS 2.0 CAPABILITY MATRIX

Date: 2026-09-05
Source: `BEYU-OS-` @ `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72`
Destination: `BEYU-OS-1.0` @ `6c2ec2663c4f704fd6ca4054d0f9ddedb8fb3878`

Statuses: `IMPLEMENTED`, `PARTIAL`, `SCAFFOLD`, `STUB`, `MISSING`, `BROKEN`, `BLOCKED`, `UNKNOWN`
Decisions: `KEEP_1_0`, `KEEP_NEW`, `MERGE`, `REFACTOR`, `REIMPLEMENT`, `DEFER`, `BLOCK`

Legend for the matrix:
- `W` = Winner. `1.0` means destination implementation should be authoritative; `NEW` means source implementation should be authoritative; `MERGE` means selective adoption; `NONE` means neither.
- `Cert status` = what can be honestly certified **today** in this session. `BLOCKED` means it requires real PostgreSQL / Flutter / secrets / provider that are absent.

---

## A. Constitutional governance

| ID | Capability | 1.0 | New | Source | Dest | W | Migration Action | Security Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| GOV-01 | Constitution / governing law model | IMPLEMENTED | PARTIAL | os-registry, orgs, waterfall | constitution, reserved matters, family/institution, governance | 1.0 | KEEP_1_0 | none | none | root tests present | N/A | BLOCKED (DB suites) | `src/lib/governance`, `src/lib/family` | KEEP_1_0 |
| GOV-02 | Policy hierarchy & deny precedence | IMPLEMENTED | PARTIAL | policy-engine `packages/auth` | `src/lib/policy.ts`, `src/lib/governance-contract` | 1.0 | MERGE (adopt typed policy contract later) | none | none | root policy tests | N/A | BLOCKED (DB provenance suites) | 1.0 policy + source `policy-engine` | MERGE |
| GOV-03 | Boards / committees | IMPLEMENTED | MISSING | — | family + governance engine | 1.0 | KEEP_1_0 | none | none | gov/family tests | N/A | BLOCKED | family/office + governance tests | KEEP_1_0 |
| GOV-04 | Reserved matters | IMPLEMENTED | MISSING | — | `src/lib/governance/reserved-matters.ts` | 1.0 | KEEP_1_0 | none | none | governance tests | N/A | BLOCKED | source file | KEEP_1_0 |
| GOV-05 | Voting | IMPLEMENTED | MISSING | — | `governance-vote-*` | 1.0 | KEEP_1_0 | none | none | 8 vote suites | N/A | BLOCKED | tests/governance | KEEP_1_0 |
| GOV-06 | Resolutions / decisions / activation | IMPLEMENTED | MISSING | — | `governance-decision` + migrations 0004/0009/0010 | 1.0 | KEEP_1_0 | none | none | many | N/A | BLOCKED | tests/governance | KEEP_1_0 |
| GOV-07 | Approval authority / quorum | IMPLEMENTED | MISSING | — | `decision-authority`, `approval quorum model` | 1.0 | KEEP_1_0 | none | none | authority/http tests | N/A | BLOCKED | tests/authority | KEEP_1_0 |
| GOV-08 | Risk | IMPLEMENTED | PARTIAL | noelia risk engine | `specialist/risk`, `forecasting`, `risk service` | 1.0 | KEEP_1_0 | none | none | specialist tests | N/A | BLOCKED | tests/specialist | KEEP_1_0 |
| GOV-09 | Compliance | IMPLEMENTED | PARTIAL | compliance health module | `specialist/compliance`, health compliance | 1.0 | KEEP_1_0 | none | none | compliance tests | N/A | BLOCKED | tests | KEEP_1_0 |
| GOV-10 | Legal | PARTIAL | PARTIAL | legal-service `noelia` | `noelia/legal-service`, health legal | 1.0 | KEEP_1_0 | none | none | limited | N/A | BLOCKED | source file | KEEP_1_0 |
| GOV-11 | Business continuity | IMPLEMENTED | PARTIAL | continuity interop | `interoperability/continuity` | 1.0 | KEEP_1_0 | none | none | interop tests | N/A | BLOCKED | tests/architecture | KEEP_1_0 |
| GOV-12 | Beneficial ownership / ownership | IMPLEMENTED | PARTIAL | os-registry | `src/lib/family/*`, org graph | 1.0 | KEEP_1_0 | none | none | family tests | N/A | BLOCKED | tests/family | KEEP_1_0 |

## B. Identity / AuthN / AuthZ

| ID | Capability | 1.0 | New | Source | Dest | W | Migration Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IAM-01 | GlobalUserID canonical | IMPLEMENTED | STUB | auth identity | `identity.ts`, `ids.ts`, migration 0011 uniqueness | 1.0 | KEEP_1_0 | none | none | identity tests | N/A | BLOCKED | migration 0011 | KEEP_1_0 |
| IAM-02 | Identity graph / party linking | IMPLEMENTED | PARTIAL | user repo | `src/lib/identity.ts` | 1.0 | KEEP_1_0 | none | none | identity-graph | N/A | BLOCKED | tests | KEEP_1_0 |
| IAM-03 | Authentication / sessions | IMPLEMENTED | IMPLEMENTED | auth service 43 tests | `session.ts`, `mfa.ts`, api routes | 1.0 | MERGE (adopt contract shapes later) | none | none | auth/http tests | N/A | BLOCKED | tests | MERGE |
| IAM-04 | MFA | IMPLEMENTED | PARTIAL | auth | `mfa.ts` | 1.0 | KEEP_1_0 | none | none | tests/security/mfa | N/A | BLOCKED | tests | KEEP_1_0 |
| IAM-05 | Step-up authentication | IMPLEMENTED | PARTIAL | auth | `auth-limits`, health `mfa-stepup` | 1.0 | KEEP_1_0 | none | none | health mfa-phase12 | N/A | BLOCKED | tests | KEEP_1_0 |
| IAM-06 | Token freshness / revocation / logout | IMPLEMENTED | PARTIAL | auth/tokens | session + mobile logout/me | 1.0 | KEEP_1_0 | none | none | auth/session | N/A | BLOCKED | tests | KEEP_1_0 |
| IAM-07 | RBAC | IMPLEMENTED | IMPLEMENTED | policy-engine | `authz.ts`, `guard.ts` | 1.0 | MERGE | none | none | many | N/A | BLOCKED | tests | MERGE |
| IAM-08 | ABAC | IMPLEMENTED | IMPLEMENTED | policy-engine | `abac-decision`, `abac-scope-country` | 1.0 | MERGE | none | none | abac tests | N/A | BLOCKED | tests/authorization | MERGE |
| IAM-09 | Classification ceilings | IMPLEMENTED | PARTIAL | security package | `data classification`, health vaults | 1.0 | KEEP_1_0 | none | none | security tests | N/A | BLOCKED | tests | KEEP_1_0 |
| IAM-10 | Purpose-of-use | IMPLEMENTED | IMPLEMENTED | auth/ai-governance | `noelia/scope-service`, health consent | 1.0 | KEEP_1_0 | none | none | consent/ai tests | N/A | BLOCKED | tests | KEEP_1_0 |
| IAM-11 | Delegation / emergency access | IMPLEMENTED | PARTIAL | auth/security | `guards`, health break-glass | 1.0 | KEEP_1_0 | none | none | family/security tests | N/A | BLOCKED | tests | KEEP_1_0 |
| IAM-12 | API authorization (backend authoritative) | IMPLEMENTED | IMPLEMENTED | guard | `authorization.guard`, `authz.ts` | 1.0 | KEEP_1_0 | none | none | authz/rbac | N/A | BLOCKED | tests | KEEP_1_0 |

## C. Tenancy / isolation / OS boundaries

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ISO-01 | Tenant isolation | IMPLEMENTED | IMPLEMENTED | `tenant-scope`, RLS | `tenant-scope.ts`, RLS migrations | 1.0 | KEEP_1_0 | high if broken | high | tenant-isolation, rls | N/A | **BLOCKED (no SQL)** | migration 0006/RLS | KEEP_1_0 |
| ISO-02 | Entity isolation | IMPLEMENTED | IMPLEMENTED | tenant-scope | entity RLS (employees, ledger) | 1.0 | KEEP_1_0 | high | high | entity-isolation | N/A | BLOCKED | tests/security | KEEP_1_0 |
| ISO-03 | Country isolation | IMPLEMENTED | PARTIAL | tenant-scope | abac-scope-country | 1.0 | KEEP_1_0 | high | high | abac-scope-country | N/A | BLOCKED | tests/authorization | KEEP_1_0 |
| ISO-04 | OS isolation | IMPLEMENTED | IMPLEMENTED | os-registry | os registry, os shell | 1.0 | KEEP_1_0 | high | high | registry tests | N/A | BLOCKED | tests | KEEP_1_0 |
| ISO-05 | Control-plane boundary to Sector LLC | IMPLEMENTED | IMPLEMENTED | docs claim | sector boundary design + health sector | 1.0 | KEEP_1_0 | medium | medium | architecture tests | N/A | BLOCKED | `sectors/health` | KEEP_1_0 |
| ISO-06 | No frontend privileged DB access | IMPLEMENTED | IMPLEMENTED | frontend DB guard | guard + server-only | 1.0 | KEEP_1_0 | medium | medium | build guard test | N/A | PASS | architecture/build-without-db | KEEP_1_0 |

## D. Events / federation

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EVT-01 | Governed event envelope (id/type/version/actor/trace/classification/hash) | PARTIAL | IMPLEMENTED | `packages/events` | internal event receipts, interoperab. | NEW | **MERGE / REFACTOR** | low | low | source 18 tests + dest internal | N/A | PASS (unit-level) | source package | MERGE |
| EVT-02 | Versioned event contracts | PARTIAL | IMPLEMENTED | `packages/events` | `idempotency.ts`, internal | NEW | MERGE | low | low | source tests | N/A | PASS | source | MERGE |
| EVT-03 | Outbox / receipts / dispatcher | IMPLEMENTED | IMPLEMENTED | health outbox | `internal events`, receipts | 1.0 | KEEP_1_0 | medium | medium | internal tests | N/A | BLOCKED | tests/internal | KEEP_1_0 |
| EVT-04 | Federation API registry | IMPLEMENTED | IMPLEMENTED | os-registry | os registry | 1.0 | KEEP_1_0 | medium | medium | registry tests | N/A | BLOCKED | tests | KEEP_1_0 |
| EVT-05 | Sector event outbox / integration | IMPLEMENTED | PARTIAL | health event outbox | health events module | 1.0 | KEEP_1_0 | medium | medium | health events | N/A | BLOCKED | health tests | KEEP_1_0 |

## E. Organization / people / knowledge

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ORG-01 | Organization hierarchy | IMPLEMENTED | IMPLEMENTED | organizations 149 suite | org graph/identity | 1.0 | KEEP_1_0 | medium | medium | many | N/A | BLOCKED | tests | KEEP_1_0 |
| ORG-02 | Ownership / beneficial ownership | IMPLEMENTED | MISSING | — | family/ownership | 1.0 | KEEP_1_0 | medium | medium | family tests | N/A | BLOCKED | tests | KEEP_1_0 |
| ORG-03 | HCM / workforce | IMPLEMENTED | PARTIAL | workforce health | `hcm.ts` | 1.0 | KEEP_1_0 | medium | medium | hcm tests | N/A | BLOCKED | tests/hcm | KEEP_1_0 |
| ORG-04 | Documents / knowledge | IMPLEMENTED | IMPLEMENTED | health docs | documents + noelia memory | 1.0 | KEEP_1_0 | medium | medium | noelia memory | N/A | BLOCKED | tests | KEEP_1_0 |
| ORG-05 | Data governance / metrics / registries | IMPLEMENTED | PARTIAL | reporting | metrics/registry | 1.0 | KEEP_1_0 | low | low | specialist/reporting | N/A | BLOCKED | tests | KEEP_1_0 |

## F. Finance

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIN-01 | Finance OS | IMPLEMENTED | MISSING | — | `src/lib/finance/*` | 1.0 | **KEEP_1_0** | high if touched | high | 20+ finance suites | N/A | BLOCKED (DB) | tests/finance | KEEP_1_0 |
| FIN-02 | Double-entry accounting | IMPLEMENTED | MISSING | — | posting-engine + migrations 0005 | 1.0 | KEEP_1_0 | high | high | ledger tests | N/A | BLOCKED | tests/finance | KEEP_1_0 |
| FIN-03 | Immutable ledger | IMPLEMENTED | MISSING | — | migration 0005/0006 | 1.0 | KEEP_1_0 | high | high | ledger-integrity | N/A | BLOCKED | tests | KEEP_1_0 |
| FIN-04 | CAP_POSTING | IMPLEMENTED | MISSING | — | capital-governance + posting | 1.0 | **KEEP_1_0** | high | high | capital-governance tests | N/A | BLOCKED | tests/finance | KEEP_1_0 |
| FIN-05 | Posting authorization | IMPLEMENTED | MISSING | — | authority/decision | 1.0 | KEEP_1_0 | high | high | authority tests | N/A | BLOCKED | tests | KEEP_1_0 |
| FIN-06 | Waterfall | IMPLEMENTED | IMPLEMENTED | `waterfall.engine` 149 suite | `waterfall.ts` | 1.0 | **MERGE after test comparison** | high money | high | both water. suites | N/A | BLOCKED | source engine + dest | MERGE |
| FIN-07 | Treasury / capital allocation | IMPLEMENTED | PARTIAL | waterfall | `capital-governance`, treasury | 1.0 | KEEP_1_0 | high | high | finance tests | N/A | BLOCKED | tests | KEEP_1_0 |
| FIN-08 | Reconciliation | IMPLEMENTED | MISSING | — | `reconciliation.ts` | 1.0 | KEEP_1_0 | high | high | finance | N/A | BLOCKED | tests | KEEP_1_0 |
| FIN-09 | Tax intelligence | IMPLEMENTED | PARTIAL | tax doc claims | `tax.ts`, specialist/tax | 1.0 | KEEP_1_0 | high | high | specialist | N/A | BLOCKED | tests | KEEP_1_0 |
| FIN-10 | Integer minor units / determinism | IMPLEMENTED | MISSING | — | finance contract | 1.0 | KEEP_1_0 | high | high | finance tests | N/A | BLOCKED | tests | KEEP_1_0 |

## G. Family Office

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FO-01 | Lineage | IMPLEMENTED | MISSING | — | `family/lineage` | 1.0 | KEEP_1_0 | high | high | lineage tests | N/A | BLOCKED | tests/family | KEEP_1_0 |
| FO-02 | Beneficiary eligibility | IMPLEMENTED | MISSING | — | `family/eligibility` | 1.0 | KEEP_1_0 | high | high | eligibility tests | N/A | BLOCKED | tests/family | KEEP_1_0 |
| FO-03 | Restricted vaults | IMPLEMENTED | MISSING | — | family capital | 1.0 | KEEP_1_0 | high | high | family tests | N/A | BLOCKED | tests | KEEP_1_0 |
| FO-04 | Succession controls | IMPLEMENTED | MISSING | — | family/constitution, decision-gate | 1.0 | KEEP_1_0 | high | high | family tests | N/A | BLOCKED | tests | KEEP_1_0 |

## H. Noelia / HIVE / AI

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AI-01 | Noelia canonical identity | IMPLEMENTED | IMPLEMENTED | noelia module | noelia runtime | 1.0 | KEEP_1_0 | medium | medium | noelia tests | N/A | BLOCKED | tests/noelia | KEEP_1_0 |
| AI-02 | HIVE runtime / orchestrator | PARTIAL | DEFERRED/STUB | ai-governance | noelia/workflows/scheduler | 1.0 | KEEP_1_0 | medium | medium | scheduler tests | N/A | BLOCKED | tests | KEEP_1_0 |
| AI-03 | AI authZ/purpose/tenant envelope | IMPLEMENTED | IMPLEMENTED | auth/ai-governance | scope-service, health ai | 1.0 | KEEP_1_0 | high | high | ai/consent tests | N/A | BLOCKED | tests | KEEP_1_0 |
| AI-04 | Source grounding / RAG | PARTIAL | PARTIAL | health types | memory/enterprise-memory | 1.0 | KEEP_1_0 | medium | medium | memory tests | N/A | BLOCKED | tests | KEEP_1_0 |
| AI-05 | Human approval gate | IMPLEMENTED | IMPLEMENTED | AI recommendations | noelia workflows + health AI | 1.0 | KEEP_1_0 | high | high | noelia action tests | N/A | BLOCKED | tests | KEEP_1_0 |
| AI-06 | Real provider runtime | STUB/BLOCKED | STUB/BLOCKED | stubbed provider | stubbed/absent provider | NONE | **BLOCK** | high | high | no tests | N/A | BLOCKED | no provider configured | BLOCK |

## I. Health OS

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HLTH-01 | Health sector boundary | IMPLEMENTED | IMPLEMENTED | `services/beyu-health-api` | `sectors/health` | 1.0 | **KEEP_1_0** | medium | medium | 488 + 14 tests | N/A | BLOCKED | health backend/frontend | KEEP_1_0 |
| HLTH-02 | Patient longitudinal record | IMPLEMENTED | IMPLEMENTED | patient module | patients/records | 1.0 | KEEP_1_0 | high | high | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-03 | Clinical / encounters / vitals | IMPLEMENTED | IMPLEMENTED | clinical module | clinical/encounters/records | 1.0 | KEEP_1_0 | high | high | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-04 | Scheduling | IMPLEMENTED | IMPLEMENTED | appointment | appointments | 1.0 | KEEP_1_0 | high | high | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-05 | Triage | IMPLEMENTED | IMPLEMENTED | triage | health (service coverage) | 1.0 | KEEP_1_0 | high | high | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-06 | Inpatient | IMPLEMENTED | IMPLEMENTED | inpatient | health | 1.0 | KEEP_1_0 | high | high | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-07 | Pharmacy | IMPLEMENTED | IMPLEMENTED | pharmacy | pharmacy | 1.0 | KEEP_1_0 | high | high | pharmacy tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-08 | Inventory | IMPLEMENTED | IMPLEMENTED | inventory | pharmacy/inventory | 1.0 | KEEP_1_0 | high | high | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-09 | Laboratory | IMPLEMENTED | IMPLEMENTED | laboratory | laboratory | 1.0 | KEEP_1_0 | high | high | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-10 | Radiology | IMPLEMENTED | IMPLEMENTED | radiology | radiology | 1.0 | KEEP_1_0 | high | high | radiology tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-11 | Ophthalmology | IMPLEMENTED | IMPLEMENTED | ophthalmology | ophthalmology | 1.0 | KEEP_1_0 | high | high | ophthalmology tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-12 | Dialysis | IMPLEMENTED | MISSING | — | dialysis | 1.0 | KEEP_1_0 | high | high | dialysis tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-13 | Billing | IMPLEMENTED | IMPLEMENTED | billing | billing | 1.0 | KEEP_1_0 | high | high | billing tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-14 | Insurance | IMPLEMENTED | IMPLEMENTED | insurance | billing/insurance | 1.0 | KEEP_1_0 | medium | medium | health suites | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-15 | Ambulance | IMPLEMENTED | IMPLEMENTED | ambulance | ambulance | 1.0 | KEEP_1_0 | medium | medium | ambulance tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-16 | Telemedicine | IMPLEMENTED | IMPLEMENTED | telemedicine | telehealth | 1.0 | KEEP_1_0 | medium | medium | telehealth tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-17 | MTUHA / TZ regulatory | IMPLEMENTED | PARTIAL | compliance | mtuha + compliance + reporting | 1.0 | KEEP_1_0 | medium | medium | mtuha/compliance | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-18 | FHIR | IMPLEMENTED | PARTIAL | health-types | `fhir` module | 1.0 | KEEP_1_0 | high | high | fhir tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-19 | HL7v2 / DICOM / terminology | IMPLEMENTED | PARTIAL | integration configs | `interop`, terminology | 1.0 | KEEP_1_0 | high | high | interop/terminology | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-20 | Health AI governance | IMPLEMENTED | IMPLEMENTED | ai module/governance | ai + noelia health boundary | 1.0 | KEEP_1_0 | high | high | ai-governance tests | N/A | BLOCKED | tests | KEEP_1_0 |
| HLTH-21 | Health web | IMPLEMENTED | IMPLEMENTED | health web | health frontend | 1.0 (dest is Vite/React) | KEEP_1_0 | low | low | 14 tests | N/A | BLOCKED | sectors/health | KEEP_1_0 |
| HLTH-22 | Health mobile | SCAFFOLD | SCAFFOLD | pubspec only | — | NONE | **BLOCK/DEFER** | low | low | none | N/A | BLOCKED | only pubspec | BLOCK |

## J. Unified application / mobile / infra

| ID | Capability | 1.0 | New | Source | Dest | W | Action | Sec Risk | Data Risk | Test Cov | Regression | Cert | Evidence | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| APP-01 | One auth boundary / GlobalUserID | IMPLEMENTED | PARTIAL | auth | identity/session | 1.0 | KEEP_1_0 | medium | medium | auth tests | N/A | BLOCKED | tests | KEEP_1_0 |
| APP-02 | OS selection / entitlement resolver | IMPLEMENTED | PARTIAL | os-registry | launcher/os shell | 1.0 | KEEP_1_0 | medium | medium | registry/launcher | N/A | BLOCKED | tests | KEEP_1_0 |
| APP-03 | Unified app architecture | PARTIAL | IMPLEMENTED | monorepo | root Next + sector | NEW | **REFACTOR / MERGE** into `apps/services/packages` | low | low | builds | N/A | PARTIAL | source tree | REFACTOR |
| APP-04 | Flutter mobile | IMPLEMENTED | SCAFFOLD | pubspec only | real Dart | 1.0 | KEEP_1_0 | medium | medium | **no Flutter SDK → BLOCKED** | N/A | BLOCKED | `mobile/flutter` | KEEP_1_0 |
| APP-05 | Offline-first / sync / conflict | PARTIAL | SCAFFOLD | README claim | mobile client + secure storage | 1.0 | KEEP_1_0 | medium | medium | none | N/A | BLOCKED | mobile/flutter | KEEP_1_0 |
| APP-06 | Shared packages boundaries | MISSING | IMPLEMENTED | numerous | none | NEW | **REFACTOR / ADOPT** | low | low | source shared tests | N/A | PARTIAL | `packages/*` | REFACTOR |
| APP-07 | CI/CD | IMPLEMENTED | MISSING | none | `.github/workflows` | 1.0 | KEEP_1_0 | low | low | CI config | N/A | BLOCKED | .github | KEEP_1_0 |
| APP-08 | Observability | PARTIAL | PARTIAL | logging/health | health/logging + root | 1.0 | KEEP_1_0 | low | low | health logging | N/A | BLOCKED | tests | KEEP_1_0 |
| APP-09 | Deployment infra (Docker/K8s/Terraform/Vercel/Supabase) | PARTIAL | PARTIAL | infra configs | health Docker/compose | 1.0 | MERGE (adopt infra configs under review) | medium | medium | none | N/A | BLOCKED | infra dirs | MERGE |
| APP-10 | Production readiness | BLOCKED | BLOCKED | none (no secrets) | none (no secrets) | NONE | **BLOCK** | high | high | none | N/A | BLOCKED | no real secrets/env | BLOCK |
| APP-11 | DB architecture per OS boundary | PARTIAL | IMPLEMENTED | separate DB URLs | sector schema + root schema | NEW | MERGE/REFACTOR | medium | medium | migrations | N/A | BLOCKED | source & dest schemas | MERGE |
| APP-12 | RLS + tenant/entity/country/OS isolation | IMPLEMENTED | IMPLEMENTED | tenant-scope/RLS | RLS migrations | 1.0 | KEEP_1_0 | high | high | adversarial suites | N/A | BLOCKED (DB) | tests/security | KEEP_1_0 |
| APP-13 | Audit chain integrity | IMPLEMENTED | IMPLEMENTED | security pkg / audit | audit hash chain | 1.0 | KEEP_1_0 | high | high | audit concurrency/atomic | N/A | BLOCKED (DB) | tests/security | KEEP_1_0 |
| APP-14 | Adversarial security suite | IMPLEMENTED (requires DB) | PARTIAL | some e2e | many suites | 1.0 | KEEP_1_0 | high | high | many | N/A | BLOCKED | tests/security | KEEP_1_0 |
| APP-15 | Final certification | BLOCKED | BLOCKED | — | — | NONE | **BLOCK** | high | high | — | N/A | NOT CERTIFIED | real-PG/Flutter/secrets absent | BLOCK |

---

## Summary of migration decisions

- **KEEP_1_0 (authoritative)**: governance, finance/CAP_POSTING, family office, Health OS, Flutter, CI/CD, security/RLS/audit.
- **KEEP_NEW / REFACTOR / MERGE (adopt source architectural pattern)**: monorepo `apps/services/packages` layout, shared contract packages (`types`, `health-types`, `events`, `auth`, `security`, `health-api-client`), event envelope contract.
- **BLOCK**: full physical migration, mobile build, real AI provider, production deployment, final certification — requires PostgreSQL, Flutter SDK, real secrets/provider, and a DB-backed regression run.

## Honest certification statement

This matrix is **evidence-based documentation**. No capability is marked `CERTIFIED` until its DB-backed tests and/or real runtime behavior have been re-executed in a PostgreSQL-provisioned environment. In this session the only certification that can be issued is:

```
NOT CERTIFIED
```
