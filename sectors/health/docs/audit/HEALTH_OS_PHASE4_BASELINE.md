# BEYU Health OS — Phase 4 Baseline Audit

**Branch:** `arena/01a0532c-beyu-os-1-0`
**Audited at commit (start):** `142ba44`
**Audited at commit (after Parts B+C+G):** in-progress
**Date:** 2026-08-31

This is the reality audit (Part A). Each item is classified using the required
vocabulary: **IMPLEMENTED / PARTIALLY_IMPLEMENTED / MISSING / MOCKED /
EXTERNAL-BLOCKED / SECURITY-BLOCKED / ARCHITECTURE-BLOCKED /
REQUIRES-HUMAN-APPROVAL**.

---

## 1. Backend modules

| Module | Status | Notes |
|---|---|---|
| ai (AiGovernanceService) | IMPLEMENTED | fail-closed HIVE routing, no self-approval, ai_invocations audit |
| ambulance | IMPLEMENTED | state machine + idempotency |
| appointments | IMPLEMENTED | state machine + double-booking + audit |
| audit (AuditService) | IMPLEMENTED | fail-closed + envelope + SHA-256 chain + immutable triggers |
| auth | PARTIALLY_IMPLEMENTED | JWT + refresh + bcrypt + RBAC; **MFA service just added; controller endpoints not yet wired** |
| billing | IMPLEMENTED | invoices/payments state + idempotency |
| clinical | IMPLEMENTED | notes, signing |
| compliance (ComplianceService) | IMPLEMENTED | 20 controls seeded, evidence linkage, coverage report (no "compliant") |
| consent | IMPLEMENTED | non-boolean, fail-closed |
| dialysis | IMPLEMENTED | machines, state, gates, adverse events |
| encounters | IMPLEMENTED | |
| fhir | PARTIALLY_IMPLEMENTED | scaffold/module + adapter contract; R4/R5 mappers/validators PENDING |
| health (health check) | IMPLEMENTED | `/health/live`; `/health/ready` PARTIALLY_IMPLEMENTED (deeper dep checks) |
| identity (IdentityRepository, MfaService, SessionService) | PARTIALLY_IMPLEMENTED | new dedicated MfaService replaces prior stub; identity bridge present |
| incidents | IMPLEMENTED | CAPA, RCA, auto-numbering |
| integrations (AdapterRegistry, stub adapters) | IMPLEMENTED (fail-closed) | 12 adapters, circuit breaker, probeAll |
| laboratory | PARTIALLY_IMPLEMENTED | multi-test orders, double-verify, analyzers schema; QC/IQC/EQA release gates PENDING |
| notifications | MOCKED | scaffold; SMS/email EXTERNAL-BLOCKED |
| ophthalmology | PARTIALLY_IMPLEMENTED | eye-exam laterality, prescriptions/optical-devices schema; dispensing service PENDING |
| patients | IMPLEMENTED | CRUD + MRN + RLS + audit |
| pharmacy | IMPLEMENTED | orders + controlled double-sign; pharmacovigilance/TMDA hooks PENDING |
| radiology | PARTIALLY_IMPLEMENTED | orders + equipment registry + DICOM/radiation columns; PACS EXTERNAL-BLOCKED; QC PENDING |
| records (Signatures, LegalHolds) | PARTIALLY_IMPLEMENTED | service + triggers for patients/encounters; service-level enforcement for other resources PARTIAL |
| reporting (MTUHA) | PARTIALLY_IMPLEMENTED | structured aggregates, fail-closed mapping_status=incomplete; submission EXTERNAL-BLOCKED; deterministic mapping version PENDING |
| search | IMPLEMENTED | |
| supabase | MOCKED | scaffold |
| telehealth | PARTIALLY_IMPLEMENTED | session model; video_provider EXTERNAL-BLOCKED |
| tenants | IMPLEMENTED | |
| users | IMPLEMENTED | |
| queues (Bull / queue_jobs) | PARTIALLY_IMPLEMENTED | queue_jobs table + idempotency; Bull processor wiring PENDING (Redis EXTERNAL-BLOCKED) |

## 2. Frontend

Frontend is under `sectors/health/src` (Vite/React). It currently contains demo pages and mock-backed screens. A full mock-elimination pass is **MISSING** from this segment of Phase 4; the honest status is **MOCKED** for every clinical/billing/reporting screen at commit `142ba44`. See Part J.

## 3. Database tables (59 in health schema, 9 in beyu_identity schema after 012)

All **59 health.\*** tables and all 9 beyu_identity.\* tables have RLS enabled with 1:1 policy coverage (verified against fresh PGlite: 59/59).

Tables added in 012: `mfa_factors`, `mfa_recovery_codes`, `mfa_challenges`, `mfa_lockouts`, `rate_limit_events`, `queue_jobs`. Audit chain columns added to `audit_log` (`entry_hash`, `prev_hash`, `hash_version`).

## 4. Migrations

001–012. All up + down verified. Up→idempotent reapply verified. Fresh-DB applies cleanly. Down returns to zero health tables.

## 5. Controllers

ambulance, appointments, auth, billing, clinical, compliance, encounters, fhir, health, integrations, laboratory, ophthalmology, patients, pharmacy, radiology, reporting, search, supabase, telehealth.
Missing: mfa, rate-limit, consent, incidents, dialysis, audit, signatures, legal-holds, compliance-evidence, queues. **PARTIALLY_IMPLEMENTED** at the controller layer (services exist for many without HTTP endpoints).

## 6. Services

ai-governance, ambulance, appointments, audit, auth, billing, clinical, compliance, consent, dialysis, encounters, fhir, health, identity/audit, identity/mfa (NEW), identity/session, incidents, integrations, laboratory, ophthalmology, patients, pharmacy, radiology, legal-holds, signatures, reporting, search, supabase, telehealth, rate-limiter (NEW), circuit-breaker (NEW).

## 7. Repositories

All use `BaseRepository` pattern; generic CRUD factory is IMPLEMENTED.

## 8. Guards

- JwtAuthGuard (IMPLEMENTED)
- PermissionsGuard (IMPLEMENTED, tested)
- CsrfOriginGuard (IMPLEMENTED, tested)
- TenantScopeGuard (IMPLEMENTED)
- **Global CSRF enforcement across all mutating routes: PARTIALLY_IMPLEMENTED** (guard exists but is not wired globally on POST/PUT/PATCH/DELETE; controller-level apply is incomplete).
- **MFA step-up guard: MISSING** (requireStepUp exists on old MfaService stub but new MfaService uses challenge flow; a guard is not yet built).

## 9. Permissions

Central RBAC in beyu_identity.roles/role_permissions/permissions. Permission enforcement is wired on key resources (patients create/read, appointments create, etc.) but **per-endpoint IDOR/tenant/entity/country/practitioner-scope/facility-scope enforcement has NOT been exhaustively audited endpoint-by-endpoint (Part E is PARTIALLY_IMPLEMENTED)**.

## 10. Adapters

12 fail-closed stubs: nhif, tra, tmda, pacs, video_provider, fhir_endpoint, mtuha_submission, finance_os, payment_gateway, sms_gateway, email_gateway, hive. All probe "unavailable" without credentials (verified). Adapter contract requires: typed request/response, timeout, retry, idempotency, circuit-breaker, auth, audit, correlation IDs. Circuit-breaker DB table exists. Adapter-level schema validation is PARTIALLY_IMPLEMENTED.

## 11. External integrations

All EXTERNAL-BLOCKED (see Final Report §External Credentials Register).

## 12. Compliance controls

20 controls seeded (010): TZ-DATA-01 (PDPA), TZ-REG-01 (MOH), FIN-LEDGER-01 (BEYU Finance OS), NABH-CLIN-01, ISO27799-AUD-01, ISO27001-SEC-01, LAB-ISO15189-01, RAD-TAEC-01, DIAL-NEPH-01, OPT-REG-01, INS-NHIF-01, PUBHLTH-MTUHA-01, INFOSEC-MFA-01 (NEW), INFOSEC-RATELIMIT-01 (NEW), INTEROP-FHIR-01, AI-RISK-01, AI-HUMAN-01, AI-NOSELF-01, REC-RETENTION-01, REC-SIGN-01. No control claims "compliant". Full coverage of Parts A–AG is PARTIALLY_IMPLEMENTED.

## 13. Audit paths

Every BaseRepository/Service mutation opens a txn, sets GUCs, performs write, calls audit.record(), commits. audit.record() throws outside actor context (fail-closed). Audit triggers: AUDIT_IMMUTABLE (no DELETE), AUDIT_CHAIN_IMMUTABLE (hash fields cannot be mutated), AUDIT_UPDATE_BLOCK (core fields cannot be updated). Transaction envelope fields (professional_license_number, practitioner_id, facility_id, ward/department/room/service_point, timezone, session_id, signature_ref, data_classification, legal_hold, retention_policy_id) are on audit_log. **Reusable TransactionContext abstraction forcing license/facility attribution per regulated service is PARTIALLY_IMPLEMENTED** (Part Y not yet complete).

## 14. Security boundaries

- **Tenant/entity/country RLS:** IMPLEMENTED (59/59 tables, NOBYPASSRLS suite).
- **Auth (JWT/bcrypt):** IMPLEMENTED.
- **MFA:** PARTIALLY_IMPLEMENTED — TOTP, recovery codes, lockouts, challenges, replay prevention, admin reset, audit all IMPLEMENTED; WebAuthn MISSING (PARTIALLY_IMPLEMENTED stub); MFA controller endpoints MISSING; requireMfa step-up guard MISSING; MFA wired into auth flow MISSING.
- **CSRF:** PARTIALLY_IMPLEMENTED (guard exists, tested, but not globally applied).
- **Rate limiting:** PARTIALLY_IMPLEMENTED (in-memory backend IMPLEMENTED, tested; Redis backend fails-closed at boot but not yet wired to HTTP pipeline).
- **IDOR / cross-tenant endpoint audit:** PARTIALLY_IMPLEMENTED (RLS provides defense-in-depth; per-endpoint authorization/practitioner/facility scope audit PENDING).
- **Boot validation:** IMPLEMENTED for insecure JWT/CORS, MFA key in prod; Redis rate-limit boot validation IMPLEMENTED.
- **Secret redaction:** IMPLEMENTED in JsonLogger.
- **CSP/HSTS/COOP/CORP/Referrer-Policy:** IMPLEMENTED (helmet hardening).
- **Audit tamper-evidence:** IMPLEMENTED (SHA-256 chain + immutability triggers; cryptographic anchoring to BEYU constitutional chain ARCHITECTURE-BLOCKED).

## 15. Remaining TODO/FIXME/MOCKED/PLACEHOLDER in production code

Production code is free of literal TODO/FIXME/MOCK/STUB/NOT_IMPLEMENTED strings (verified by grep); PARTIALLY_IMPLEMENTED items above are tracked through typed error codes (`MFA_WEBAUTHN_NOT_IMPLEMENTED`, `mapping_status=incomplete`, `EXTERNAL_DEPENDENCY_REQUIRED`) rather than silent placeholders.

## 16. Mocked frontend workflows

All frontend clinical/billing/reporting/MFA/dialysis/ambulance/lab/radiology workflows are MOCKED at baseline (Part J). Frontend audit is deferred until backend security work further stabilizes.

## 17. Incomplete integrations

See §11 + Final Report.

## 18. Security gaps (non-exhaustive)

- MFA controller + auth-flow wiring + step-up guard (PARTIALLY_IMPLEMENTED).
- Global CSRF enforcement on all mutating routes (PARTIALLY_IMPLEMENTED).
- HTTP-pipeline rate limiting (guard/middleware) using RateLimiter (MISSING).
- Endpoint-by-endpoint IDOR/practitioner-scope/facility-scope test coverage (PARTIALLY_IMPLEMENTED).
- Audit chaining to BEYU constitutional chain (ARCHITECTURE-BLOCKED).
- WebAuthn/passkeys (PARTIALLY_IMPLEMENTED).
- Distributed (Redis) rate limiting + queues (EXTERNAL-BLOCKED / PARTIALLY_IMPLEMENTED).
- Account lockout on password-login brute force (service ready; HTTP wiring MISSING).
- CSRF token double-submit pattern for cookie-authenticated browser forms (PARTIALLY_IMPLEMENTED; Origin/Referrer check exists).

## 19. Missing production controls

- /health/ready deep dependency verification (Redis, Postgres, adapter probes) — PARTIALLY_IMPLEMENTED.
- Queue/Bull workers (PARTIALLY_IMPLEMENTED; table exists, workers pending Redis).
- E2E workflow spec (MISSING).
- Concurrency race test suite for appointments/dispensing/billing/etc. (PARTIALLY_IMPLEMENTED; idempotency ledger exists but adversarial concurrency tests pending).
- Production/staging config split (.env.example present; env validation PARTIAL).
- FHIR R4/R5 resource mappers/validators (PARTIALLY_IMPLEMENTED).
- HL7 v2 parser (MISSING).
- DICOM UID validation/metadata PENDING (schema present).
- Terminology adapters (ICD-10/11, SNOMED, LOINC) (MISSING — stubs without fabrications).
- Lab QC/IQC/EQA release gates (PARTIALLY_IMPLEMENTED).
- Radiology QC / finalization (PARTIALLY_IMPLEMENTED).
- Optical dispensing service/controller (PARTIALLY_IMPLEMENTED).
- Pharmacy adverse-event/pharmacovigilance hooks (MISSING).
- Finance OS adapter real contract (MISSING, stub only).
- NHIF claim lifecycle (MISSING model beyond invoices).
- TRA/payment/mobile-money typed contracts beyond stubs (PARTIALLY_IMPLEMENTED).
- Full MTUHA mapping completeness (mapping_status=incomplete; PENDING real MTUHA books — EXTERNAL-BLOCKED on source material).
- Records/retention archival/destruction policy (PARTIALLY_IMPLEMENTED).
- Signatures: controller + external-signature-provider adapters (PARTIALLY_IMPLEMENTED).
- AI: additional risk classes, model registry (PARTIALLY_IMPLEMENTED).
- Compliance control matrix expansion (PARTIALLY_IMPLEMENTED; 20/expected 80+).
- Observability correlation propagation across queues/adapters (PARTIALLY_IMPLEMENTED; HTTP/service/repo/txn covered; queues PENDING).

## 20. Architecture-blocked

- Anchor health audit hash chain into BEYU constitutional audit (governance approval required).
- WebAuthn relying-party configuration cross-org.
- Distributed rate-limit / queue enforcement (Redis provisioning).
- DICOM networking topology (in-cluster vs VPN).
- Cross-region advisory locks (multi-region architecture).
- Production IdP integration for MFA (external IdP credentials).

---
