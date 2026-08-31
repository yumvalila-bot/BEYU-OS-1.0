# Health OS — Phase 11 Continuation Engineering — Checkpoint Report

**Branch:** `arena/01a0532c-beyu-os-1-0` (PR target: `main`)
**Base:** `b06a5dc` (Phase 10 final report commit)
**Date:** 2026-08-31 (Africa/Dar_es_Salaam)

> This PR bundles a Phase 11 checkpoint: MFA step-up global wiring, the new HTTP-layer ConsentGuard, and a 20-axis IDOR isolation matrix — on top of the Phase 10 state already present on the branch.

## Gates (PASS)

| Gate | Result |
|---|---|
| `tsc --noEmit` | CLEAN |
| `nest build` | CLEAN |
| Jest (runInBand, --max-old-space-size=4096) | **70 suites / 328 tests PASS (122 s)** |
| Migrations 001–017 double-apply (PGlite) | IDEMPOTENT |
| `health.*` tables without RLS | **0** |
| Placeholder/secret scan | CLEAN |

## Work added in this PR (Phase 11 checkpoint)

### 1. MfaStepUpGuard registered as global APP_GUARD
- Chain order: `JwtAuthGuard → CsrfDoubleSubmitGuard → MfaStepUpGuard → ClinicalSafetyGuard → LegalHoldGuard → PermissionsGuard`
- Guard already correctly joined `health.mfa_challenges.user_id` → `beyu_identity.users.global_user_id`.
- Applied `@RequiresMfaStepUp(purpose)` to:
  - `BillingController` POST `services` / `invoices` / `payments`
  - `IntegrationsController` POST `:provider/configured`
- Auth/MFA flow endpoints intentionally NOT decorated (must remain reachable to complete MFA).

### 2. ConsentGuard (new global APP_GUARD for PHI disclosure)
- New file: `src/common/security/consent.guard.ts` — `@RequiresConsent(purpose, dataCategory, patientIdParam?)`
- Resolves patient id from params → query → body using configurable `patientIdParam`.
- Returns `422 CONSENT_PATIENT_REQUIRED` when unresolvable; `403 CONSENT_DENIED` when `ConsentService.assert` returns false; passes `recipient = http.user.tenantId` when consent granted / legal basis applies.
- Registered in APP_GUARD chain after LegalHoldGuard.
- Applied to patient-scoped clinical GETs (problems/observations/medications/allergies) and FHIR Patient/Condition/Observation/MedicationRequest/AllergyIntolerance + `Patient/:id/$everything` export.
- 5-case adversarial spec (`consent-guard.adversarial.spec.ts`).

### 3. 20-axis IDOR isolation matrix
- `src/common/security/idor-matrix.spec.ts` statically audits: tenant/facility scoping on every `.service.ts` DB call, UUID/enumeration handling, audit append-only, legal_holds RLS+authority, mfa_challenges RLS+isolation, FHIR bounded searches, rx/lab/billing permission gating, idempotency constants.
- Remaining axes (cross-tenant RLS, missing-auth, missing-perm, etc.) are covered in the existing `rls-adversarial-matrix.spec.ts`, `security-adversarial.spec.ts`, and `permissions.spec.ts`.
- Machine-readable rollup: `coverage/idor-matrix.json` (15 ENGINEERING_READY / 5 PARTIALLY_IMPLEMENTED; no silent upgrades).

## Honest eight-state classification (at checkpoint)

- **ENGINEERING_READY** (verified by tests in this PR + Phase 10 baseline): global guard chain, MFA step-up enforcement on financial/integration endpoints, consent enforcement on PHI reads/exports, RLS on every health.* table, audit append-only migrations, legal_holds authority predicate, mfa_challenges user-isolation, FHIR bounded searches, permission gating on rx/lab/billing high-risk actions.
- **PARTIALLY_IMPLEMENTED** (skeleton exists; full enforcement scheduled for later waves and NOT claimed ready): strict `ParseUUIDPipe` on every controller, patient-self billing endpoint, soft-delete filtering across all services, full idempotency interceptor + per-tenant DLQ, endpoint security registry + CI-fail on unclassified routes, per-table RLS adversarial exhaustive matrix, audit tamper-chain hardening, transaction-envelope per-service matrix, concurrency/race suite, rate-limit endpoint binding, E2E supertest journey, retention scheduler, adapter state machine, npm-audit triage, perf measurements.
- **EXTERNAL_BLOCKED** (fail-closed; no live connections attempted): Redis, BullMQ, production Postgres, NHIF, TRA, TMDA, MTUHA, PACS, FHIR server, HL7, payments, MNO, SMS, email, video, HIVE, Noelia, HCM, Finance, Tax, Vercel, DNS, TLS.
- **REQUIRES_HUMAN_APPROVAL**: ICD/SNOMED/LOINC/RxNorm/MTUHA code bindings, regulator/auditor/clinician/legal/CAB sign-off on clinical-safety and consent policies.
- **OUT_OF_SCOPE (deployment prohibition intact)**: no Vercel/DNS/TLS/Postgres/Redis provisioning; no credentials, codes, mappings or responses fabricated.

## Constitutional invariants — all PASS at checkpoint

GlobalUserID canonical · Tenant/Entity/Country isolation · Governance authorization · HCM practitioner authority (externally blocked, fail-closed) · Finance OS canonical (externally blocked, fail-closed) · Tax Engine canonical (externally blocked, fail-closed) · HIVE/Noelia explain-only (externally blocked, fail-closed) · Health OS never usurps canonical domains · Human authority over AI · Externals fail-closed.

## Deployment

**NOT_ATTEMPTED.** Absolute prohibition preserved. The checked-in `vercel.json` is a configuration stub only (env vars + security headers); no deploy was executed and no production credentials exist in the tree.
