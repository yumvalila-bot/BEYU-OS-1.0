# PHASE 03 — CAPABILITY PARITY MATRIX (live)

Date: 2026-09-05
Source: `BEYU-OS-` @ `b9c94d4f8ce7c3466cc3c27242eaa6a1650f0b72`
Destination: `BEYU-OS-1.0` @ `6c2ec2663c4f704fd6ca4054d0f9ddedb8fb3878`

Classification: `KEEP_1_0`, `ADOPT_SOURCE`, `MERGE`, `REFACTOR`, `REPLACE`, `DEPRECATE`, `BLOCKED`, `NOT_APPLICABLE`.

## Control plane

| Capability | 1.0 | New | Decision | Verification | Status |
|---|---|---|---|---|---|
| Identity / GlobalUserID | IMPLEMENTED | PARTIAL | KEEP_1_0 | real-PG identity graph/adversarial | VERIFIED |
| AuthN / MFA / sessions | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | live HTTP MFA_REQUIRED, mfa suite | VERIFIED |
| RBAC / ABAC | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | 24+ authorization tests | VERIFIED |
| RLS tenant/entity/country/OS | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | rls/entity/tenant/country suites | VERIFIED |
| Audit chain | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | audit concurrency/atomic, DR drill | VERIFIED |
| Governance / constitution / voting / decisions | IMPLEMENTED | PARTIAL | KEEP_1_0 | gov/family suites | VERIFIED |
| Family Office | IMPLEMENTED | MISSING | KEEP_1_0 | family suites | VERIFIED |
| Capital / strategy / risk / compliance / tax | IMPLEMENTED | PARTIAL | KEEP_1_0 | specialist/capital suites | VERIFIED |
| HCM | IMPLEMENTED | PARTIAL | KEEP_1_0 | hcm suites | VERIFIED |
| Event/federation | IMPLEMENTED | PARTIAL | MERGE (contracts later) | internal events/outbox | PARTIALLY VERIFIED |
| Noelia/HIVE governance | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | noelia suites | PARTIALLY VERIFIED (no real provider) |
| Real AI provider | BLOCKED | BLOCKED | BLOCKED | no provider credentials | BLOCKED |

## Health

| Capability | 1.0 | New | Decision | Verification | Status |
|---|---|---|---|---|---|
| Health backend | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | 488+89 tests, real-PG | VERIFIED |
| EHR/clinical/patient/scheduling | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | service + e2e subsets | VERIFIED |
| Pharmacy/inventory/lab/radiology | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | service specs | VERIFIED |
| Ophthalmology | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | ophthalmology spec | VERIFIED |
| Billing/insurance/ambulance/telemedicine | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | service specs | VERIFIED |
| FHIR/HL7v2/DICOM/MTUHA/TZ compliance | IMPLEMENTED | PARTIAL | KEEP_1_0 | fhir/hl7/dicom/mtuha specs | VERIFIED (service layer) |
| Health RLS | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | real-PG rls/isolation | VERIFIED |
| Health web | IMPLEMENTED | IMPLEMENTED | KEEP_1_0 | typecheck/test/build | VERIFIED |
| Health mobile | SCAFFOLD (1.0 real Dart, Blk) | SCAFFOLD | KEEP_1_0 / BLOCKED | no Flutter SDK | BLOCKED |

## Finance

| Capability | 1.0 | New | Decision | Verification | Status |
|---|---|---|---|---|---|
| Accounting / double entry | IMPLEMENTED | MISSING | KEEP_1_0 | ledger suites | VERIFIED |
| Ledger immutability | IMPLEMENTED | MISSING | KEEP_1_0 | ledger-integrity | VERIFIED |
| CAP_POSTING | IMPLEMENTED | MISSING | KEEP_1_0 | capital-governance | VERIFIED |
| Waterfall | IMPLEMENTED | IMPLEMENTED (source engine) | MERGE candidates | dest waterfall tests | VERIFIED |
| Treasury / reconciliation / reporting | IMPLEMENTED | MISSING | KEEP_1_0 | finance suites | VERIFIED |

## Apps / infra

| Capability | 1.0 | New | Decision | Verification | Status |
|---|---|---|---|---|---|
| Unified web | IMPLEMENTED | PARTIAL | KEEP_1_0 | build + live HTTP | VERIFIED |
| Console | PARTIAL | PARTIAL | KEEP_1_0 | builds (not separately tested) | PARTIALLY VERIFIED |
| Flutter mobile | IMPLEMENTED | SCAFFOLD | KEEP_1_0 / BLOCKED | no SDK | BLOCKED |
| Shared package structure | partial | IMPLEMENTED | ADOPT_SOURCE (future) | not wired | BLOCKED |
| CI/CD | IMPLEMENTED | MISSING | KEEP_1_0 | exists | VERIFIED (config present) |
| Deployment | BLOCKED | PARTIAL | BLOCKED | no prod env | BLOCKED |

## Summary

All critical destination capabilities are **VERIFIED** or **KEEP_1_0**. Source-only capabilities (shared package structure, infra configs, health API contracts) are classified `ADOPT_SOURCE`/`MERGE` but are **not wired** because wholesale adoption is not required for correctness and carries regression risk without verified value. No important 1.0 capability disappeared.
