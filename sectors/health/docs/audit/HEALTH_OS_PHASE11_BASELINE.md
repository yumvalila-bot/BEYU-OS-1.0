# HEALTH OS — PHASE 11 BASELINE REALITY-AUDIT

**Date:** 2026-08-31 (Africa/Dar_es_Salaam)
**Branch (new):** `arena/01a0532-phase-11` (cut from `main` @ `edabc35`)
**Main HEAD:** `edabc35545027016a2554136c1efefd9a0599121` (Phase 10 merge commit)
**Baseline procedure:** fetch --all, checkout main, pull --ff-only, unshallow (clone was shallow; SHAs now resolve), install deps, full gates.

## 1. Baseline gates

| Gate                                | Result                                                       |
|-------------------------------------|--------------------------------------------------------------|
| Branch                              | `arena/01a0532-phase-11` (cut from `main`)                   |
| Working tree                        | Clean                                                         |
| `node_modules`                      | Reinstalled after container reset                             |
| Ancestry                            | Phase 10 commits `c11a556, f91ecc8, c3b3909, d5e30b7, b06a5dc` all present in `main`; merge commit `edabc35` correct |
| `tsc --noEmit`                      | PASS                                                          |
| `npm run build` (nest build)        | PASS                                                          |
| `npm test` (full, runInBand)        | **68 suites / 314 tests ALL PASS** (148s)                     |
| Migrations                          | 17 (001–017)                                                  |
| Migration fresh bootstrap           | PASS (double-apply idempotent on fresh PGlite)                |
| RLS                                 | 0 `health.*` tables without RLS                               |
| Placeholder scan (TODO/FIXME/HACK)  | Clean in non-spec production code                             |
| Secret scan (hard-coded passwords)  | Clean                                                         |
| Boot validation                     | Present (refuses default JWT secret, BYPASSRLS, wildcard CORS, insecure cookies, memory-queue-in-prod, test MFA key) |
| Existing adversarial / security     | csrf-adversarial, rate-limit-adversarial, security-adversarial, mfa.adversarial, rls-adversarial, rls-coverage-matrix, security-version.adversarial, idor-matrix, boot-validation, clinical-safety-matrix all present and green |

## 2. Phase 10 inventory preserved

| Item | Status |
|------|--------|
| Global TransactionInterceptor (APP_INTERCEPTOR) | PRESENT & wired |
| TransactionContext ALS | PRESENT |
| TransactionEnvelope (34 fields) | PRESENT |
| X-Transaction-ID / X-Request-ID headers | PRESENT |
| ClinicalSafetyGuard (APP_GUARD) + @RequiresClinicalSafety | PRESENT, wired to pharmacy/lab/radiology/ophthalmology/dialysis |
| LegalHoldGuard (APP_GUARD) + @CheckLegalHold | PRESENT, wired to supabase wildcard |
| Migration 017 (legal_holds status/scope/authority/metadata, CHECKs, indexes, RLS, upgraded triggers) | PRESENT & idempotent |
| DialysisController | PRESENT |
| Permissions `dialysis:treat`, `optical:dispense` | PRESENT |
| MfaStepUpGuard | IMPLEMENTED (file exists) but **NOT yet registered as APP_GUARD** nor applied to all FINANCIAL/ADMINISTRATIVE endpoints |
| RateLimiter + typed policies + Retry-After | PRESENT (memory backend; Redis EXTERNAL_BLOCKED) |
| Queue service (retry/backoff/jitter/DLQ/drain/idempotency) | PRESENT (memory backend; BullMQ EXTERNAL_BLOCKED) |
| ConsentService | IMPLEMENTED (purpose/scope/data-category/recipient/legal-basis) but **ConsentGuard HTTP layer MISSING** |
| Endpoint-tier classification (8 tiers) | PRESENT; matrix spec exists but **does NOT yet CI-fail for unclassified sensitive routes** |
| IDOR matrix | PARTIAL (patients 15/18 axes); not extended to every sensitive resource |
| RLS adversarial | PARTIAL (core tables + all-RLS-enabled check; not per-table 63-table systematic) |
| FHIR/HL7/DICOM/Terminology/MTUHA | Existing engines; terminology datasets/peers/PACS/MTUHA mappings EXTERNAL_BLOCKED |
| 12 external adapters | fail-closed stubs |
| Boot validation | PRESENT |
| Audit SHA-256 chain + immutable trigger | PRESENT |

## 3. Controllers and routes (baseline)

- Controllers: 21
- HTTP routes: 95 (@Get/@Post/@Put/@Patch/@Delete across all `src/modules/*/*.controller.ts`)
- Global APP_GUARDs (in `app.module.ts`):
  1. `JwtAuthGuard` (authentication + @Public() allow-list)
  2. `CsrfDoubleSubmitGuard`
  3. `ClinicalSafetyGuard`
  4. `LegalHoldGuard`
  5. `PermissionsGuard`
- Global APP_INTERCEPTOR: `TransactionInterceptor`
- Not yet registered as global: `MfaStepUpGuard` (applied only where explicitly `@UseGuards`'d today — not present in app.module)
- Not yet existing: `ConsentGuard`

## 4. Priority work list (P0 → P3)

P0 (Security / authorization / clinical safety / isolation / audit / governance):
1. Register MfaStepUpGuard as APP_GUARD; apply @RequiresMfaStepUp to all FINANCIAL, ADMINISTRATIVE, AI_HIGH_RISK, credential-management, destructive, and high-risk clinical endpoints.
2. Build ConsentGuard + @RequiresConsent(purpose, dataCategory) for PHI disclosure endpoints; adversarial tests.
3. Endpoint security registry: classify every route; CI-fail spec that rejects unclassified/mis-controlled routes.
4. Expand IDOR adversarial matrix to all sensitive resources with 18+ axes; produce `coverage/idor-matrix.json`.
5. Expand RLS adversarial to every `health.*` table systematically; produce `coverage/rls-adversarial-matrix.json`; NOBYPASSRLS remains EXTERNAL_BLOCKED.
6. Audit adversarial hardening (missing-actor/missing-GlobalUserID/missing-facility/missing-licence/audit-write-failure rollback).

P1 (Transaction integrity / concurrency / E2E / queue / rate-limit / integration contracts / records):
7. Concurrency adversarial suite (double-booking, double-dispense, lab/radiology verify races, dialysis machine acquisition, billing idempotency, MFA replay, session rotation, security_version bump, outbox dedup, audit chain, legal-hold release).
8. TransactionEnvelope propagation HTTP→service→DB→audit→outbox→queue→adapter; envelope status wiring on guard outcomes.
9. Wire rate-limit policies to every classified endpoint (login/register/MFA/password/appointments/prescriptions/lab/billing/AI/admin/exports/bulk).
10. Queue hardening (poison detection, DLQ routing, cancellation, metrics, outbox forwarder spec).
11. E2E supertest expansion to cover the full 26-stage workflow where internally possible (externals assert BLOCKED).
12. Retention policy / records governance (destruction scheduler stub, legal-hold-gated archival).

P2 (Compliance / performance / evidence):
13. Adapter state machine (NOT_CONFIGURED/CONFIGURED/VALIDATED/CONNECTED/VERIFIED/DEGRADED/BLOCKED).
14. Governance/HCM boundary hardening (deny cannot be overridden locally).
15. FHIR/HL7/DICOM contract completion (R4/R5 validation, HL7 malformed rejection, DICOM UID/study).
16. MTUHA reporting contract (submission state machine, missingMappings, BLOCKED).
17. Compliance control matrix expansion (TZ Cybercrimes/ETA/Public-Health/TMDA/NHIF/lab/radiology/dialysis/optical; NABH/ISO 27001/27799/27017/27018/15189/PCI-DSS engineering-control mappings).
18. npm audit refresh + per-vuln triage.
19. Performance observations (PGlite local, clearly labelled non-production).
20. Final Phase 11 engineering report + `coverage/health-os-engineering-final-status.json`.

P3 (External — BLOCKED pending real infrastructure; contracts built, fail-closed only):
Redis, production Postgres, HCM/Gov/Finance/Tax/HIVE live endpoints, NHIF/TRA/TMDA/MCT/TAEC/MSD/GoT, payment/MNO/SMS/email/video, PACS/DICOM networking, FHIR/HL7 peers, terminology datasets, MTUHA mappings+submission, WebAuthn RP, DNS/TLS/WAF/hosting. None will be fabricated.

## 5. Methodology

- Atomic commits, one Wave at a time.
- After each Wave: tsc, targeted tests, full regression (`npm test --runInBand --forceExit`), migration idempotency check.
- No test weakening; no deleting/skipping failing tests; no status upgrade without evidence.
- Eight-state classification throughout.
- Deployment NOT ATTEMPTED; no credentials/infrastructure provisioning; no fabrication.
- Push at end of session (or when explicitly authorized to merge); main merge only if instructed.
