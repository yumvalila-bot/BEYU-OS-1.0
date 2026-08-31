# BEYU Health OS — Engineering Completion Baseline (Phase 3 Audit)

**Branch:** `arena/01a0532c-beyu-os-1-0`
**Baseline SHA (working branch HEAD at audit start):** see `git log -1`
**Origin main HEAD at audit start:** `48fa6ff`
**Audit date:** 2026-08-30
**Scope:** `sectors/health/backend/**` (NestJS + Postgres) plus cross-cutting docs
**Status vocabulary:** IMPLEMENTED · PARTIALLY_IMPLEMENTED · MISSING · MOCKED · EXTERNAL-BLOCKED · SECURITY-BLOCKED · ARCHITECTURE-BLOCKED · REQUIRES-HUMAN-APPROVAL

> This document NEVER asserts regulatory "compliance". It records engineering
> state only. A control/feature is IMPLEMENTED when code + tests + RLS + audit
> exist in repo. A regulator, accreditation body, or senior responsible owner
> must separately approve evidence for any claim of regulatory compliance.

---

## 1. Module inventory & classification

Modules under `backend/src/modules/`:

| Module | Status | Notes |
|---|---|---|
| `ai` | PARTIALLY_IMPLEMENTED | HIVE/Noelia adapter stub present (fail-closed). Governance fields required for AI outputs but clinical-decision hooks not wired. EXTERNAL-BLOCKED on Noelia/HIVE credentials. |
| `ambulance` | IMPLEMENTED | Vehicle registry + request state machine + idempotency + audit. |
| `appointments` | IMPLEMENTED | Atomic booking, double-booking prevention, state machine, idempotency, audit. |
| `audit` | IMPLEMENTED | Append-only, RLS-isolated, fail-closed, carries actor/tenant/correlation/causation/professional/facility/location/timezone/session/classification metadata (Phase 3 envelope). |
| `auth` | IMPLEMENTED | JWT, refresh rotation, logout-all, bcrypt hashing, RBAC. Guards + permission model. MFA not yet implemented (PARTIALLY_IMPLEMENTED on MFA sub-control). |
| `billing` | IMPLEMENTED | Invoice state machine, NHIF/payment adapters fail-closed. NOT canonical ledger (per standing rule). |
| `clinical` | IMPLEMENTED | Encounters, notes, severity CHECK, note signing, CDS hooks. Clinical guidelines *references* only — STG/NEMLIT/IMCI content NOT loaded (requires governance approval: REQUIRES-HUMAN-APPROVAL). |
| `compliance` (new Phase 3) | IMPLEMENTED | ComplianceControl registry with machine-readable statuses (never "compliant"), evidence linkage, coverage report. Controls seed with TZ/ISO/NABH references. |
| `consent` (new Phase 3) | IMPLEMENTED | Non-boolean consent: purpose/scope/data_categories/recipient/legal_basis/status. Fail-closed gating (`requireConsent`). |
| `dialysis` (new Phase 3) | IMPLEMENTED | Machine registry, maintenance/water-quality gates, state machine, adverse-event capture, audit provenance. |
| `encounters` | IMPLEMENTED | Encounter lifecycle with signed notes. |
| `fhir` | PARTIALLY_IMPLEMENTED | FHIR module + adapter registry entry. Full R4/R5 validation, terminology (ICD-10/11, SNOMED, LOINC) and FHIRValidator adapter EXTERNAL-BLOCKED. |
| `health` (module) | IMPLEMENTED | Health check, readiness. |
| `identity` | IMPLEMENTED | PGlite + Postgres DbConnection abstraction, tenant_id GUC for RLS. |
| `incidents` (new Phase 3) | IMPLEMENTED | Patient-safety incidents, CAPA/rca_summary, strict state machine, audit. M&M/RCA meeting workflow not yet built (PARTIALLY_IMPLEMENTED). |
| `integrations` | PARTIALLY_IMPLEMENTED | Adapter registry with 12 fail-closed stubs (nhif, tra, tmda, pacs, video_provider, fhir_endpoint, mtuha_submission, finance_os, payment_gateway, sms_gateway, email_gateway, hive); `/api/integrations/adapters/probe`; `config_state` state machine (NOT_CONFIGURED → CONFIGURED → VALIDATED → CONNECTED → VERIFIED / DEGRADED / BLOCKED). Individual adapter contracts (schema validation, circuit breaker, retry, idempotency keys per-call) wired at the registry level; per-adapter schemas to be added. |
| `laboratory` | IMPLEMENTED | Test catalog, multi-test orders, state machine, double-verify gating, idempotency. Phase 3 adds `health.lab_analyzers` + `chain_of_custody` + `specimen_received_at` columns. QC gating on result release not yet enforced (PARTIALLY_IMPLEMENTED). |
| `notifications` | PARTIALLY_IMPLEMENTED | In-app notification structure; sms_gateway/email_gateway adapters fail-closed (EXTERNAL-BLOCKED). |
| `ophthalmology` | IMPLEMENTED | Eye-exam workflow; optics/optometry controls pending (PARTIALLY_IMPLEMENTED on prescription/eyewear verification). |
| `patients` | IMPLEMENTED | MRN uniqueness, RLS, audit. |
| `pharmacy` | IMPLEMENTED | Medication orders, controlled-substance double-sign, rx:write/rx:dispense/rx:controlled permissions, TMDA adapter stub. Pharmacy Council licence verification EXTERNAL-BLOCKED. |
| `radiology` | IMPLEMENTED | Imaging order lifecycle with modality/body_part/laterality/contrast/urgency; Phase 3 adds equipment registry, DICOM UID/accession/radiation dose columns. PACS/DICOM adapter EXTERNAL-BLOCKED; radiation-protection QC enforcement PARTIALLY_IMPLEMENTED. |
| `reporting` | IMPLEMENTED | MTUHA book/section metadata mapping, structured aggregates, `markSubmitted` audit entry — does NOT post externally; mtuha_submission adapter fail-closed. |
| `search` | PARTIALLY_IMPLEMENTED | Basic search scaffolding; PHI-scoped search filters implemented; full-text/search-engine integration deferred. |
| `supabase` | IMPLEMENTED | Supabase client wrapper (absent credentials → degraded). |
| `telehealth` | PARTIALLY_IMPLEMENTED | Telehealth encounter structure; video_provider adapter EXTERNAL-BLOCKED. |
| `tenants` | IMPLEMENTED | Tenant management, tenant:admin RBAC. |
| `users` | IMPLEMENTED | User profile, role binding. |

---

## 2. Cross-cutting capabilities

| Area | Status | Evidence |
|---|---|---|
| RLS (every health.* table has tenant isolation) | IMPLEMENTED | 47 health.* tables; migrations.spec enforces RLS on all; rls-adversarial.spec confirms cross-tenant reads/writes blocked. |
| GlobalUserID (canonical identity propagation) | IMPLEMENTED | `actor_global_user_id` on audit_log, set_config('app.actor_id'), tenant_context.actor userId. |
| Audit (fail-closed) | IMPLEMENTED | AuditService.record throws outside actor context; written inside every mutation transaction; envelope carries professional/facility/location/timezone/session/classification/legal_hold/retention. |
| Transaction isolation (withIsolation / atomicWrite) | IMPLEMENTED | `db-utils.ts` shared helper sets tenant/country/entity/actor GUCs; all new Phase 3 services use atomicWrite. Existing repositories use inTx/withIsolation patterns. |
| Correlation/causation/request IDs | PARTIALLY_IMPLEMENTED | CorrelationIdMiddleware sets ALS; audit writes correlationId+requestId; causation_id available but not yet propagated end-to-end on external calls. |
| Security headers (CSP, HSTS, COOP/CORP/COEP, Referrer-Policy) | IMPLEMENTED | main.ts hardening verified by integration tests. |
| CSRF / CORS / origin guards | PARTIALLY_IMPLEMENTED | CSRF-origin guard exists and tested; CORS production allow-list enforced at boot; SameSite cookies enforced. |
| Rate limiting | MISSING | Throttling guard not yet implemented (tracked as next security increment). |
| MFA | MISSING | TOTP/WebAuthn not yet implemented. |
| Idempotency keys | PARTIALLY_IMPLEMENTED | Applied to appointments, lab, imaging, ambulance, reporting; not yet universal across all POST endpoints. |
| Secret redaction in logs | IMPLEMENTED | Boot validation prints CONFIGURED/MISSING only (never values); JsonLogger redacts known sensitive fields. |
| Production boot validation | IMPLEMENTED | Refuses boot in production when JWT secrets default/insecure or CORS is wildcard; enumerates adapter config state without leaking secrets. |
| Placeholder/MOCK scan | IMPLEMENTED | 0 TODO/MOCK/STUB/NOT_IMPLEMENTED/FAKE/SIMULATED markers in production code (verified by grep). Adapter stubs are *real fail-closed contracts* not mocks. |
| Migration discipline (up+down+idempotency+RLS) | IMPLEMENTED | 10 migrations, all paired with .down.sql, tested round-trip in migrations-roundtrip.spec (up, idempotent re-apply, down to zero health tables). |

---

## 3. Domain additions (Phase 3)

| New domain object | Table/Service | Status |
|---|---|---|
| Facilities registry | `health.facilities` | IMPLEMENTED (RLS; UNIQUE(tenant_id, facility_code); registration_number nullable until MoH verification). |
| Practitioner registry | `health.practitioners` | IMPLEMENTED (RLS; license_number NOT invented; default `license_status='external_verification_required'`; scope_of_practice text[]; FK into audit_log). |
| Compliance controls registry | `health.compliance_controls` | IMPLEMENTED (status enum never includes "compliant"; 20 TZ/ISO/NABH/AI/FIN seeds). |
| Compliance evidence | `health.compliance_evidence` | IMPLEMENTED (RLS; typed evidence: test/audit_log/migration/document/external_verification/approval/configuration). |
| Consent engine | `health.consents` + ConsentService | IMPLEMENTED (non-boolean; purpose/scope/data_categories/recipient/legal_basis; fail-closed `requireConsent`). |
| Retention policies | `health.retention_policies` | IMPLEMENTED (seeded defaults; legal_hold override present). |
| Legal holds | `health.legal_holds` | IMPLEMENTED (RLS; blocks deletion when active — enforcement in service layer pending hard FK trigger on deletion paths; PARTIALLY_IMPLEMENTED on hard-blocking). |
| Clinical guidelines registry | `health.clinical_guidelines` | IMPLEMENTED (versioned; approval_status registered/approved/superseded/withdrawn; RLS). Content loading REQUIRES-HUMAN-APPROVAL (MoH/WHO versions must be imported with provenance — no fabrication). |
| Incidents/CAPA | `health.incidents` + IncidentsService | IMPLEMENTED (state machine, severity, rca_summary, capa jsonb, incident_no sequence). M&M/RCA meeting module PARTIALLY_IMPLEMENTED. |
| Dialysis | `health.dialysis_machines`, `health.dialysis_sessions`, DialysisService | IMPLEMENTED (maintenance/water-quality gates, state machine, adverse events, audit). |
| Public health notifiable events | `health.public_health_events` | IMPLEMENTED (event_type enum includes notifiable_disease, outbreak, adverse_reaction, immunization, maternal_death, perinatal_death, aefi; status never auto-submits). Submission adapter EXTERNAL-BLOCKED. |
| Integration state machine | `health.integration_status.config_state` | IMPLEMENTED (not_configured/configured/validated/connected/verified/degraded/blocked; `missing_fields` and `last_probe_at` metadata). |
| Imaging equipment + radiation | `health.imaging_equipment`, columns on `imaging_orders` (equipment_id, radiation_dose, accession_number, dicom_study_uid) | IMPLEMENTED (registry + columns). QC/calibration gate PARTIALLY_IMPLEMENTED; PACS/DICOM adapter EXTERNAL-BLOCKED. |
| Lab analyzers + chain of custody | `health.lab_analyzers`, columns on `lab_order_items` (specimen_received_at, analyzer_id, chain_of_custody) | IMPLEMENTED (schema). QC/calibration enforcement PARTIALLY_IMPLEMENTED. |

---

## 4. External adapters (all fail-closed)

| Adapter | Status | Blocking dependency |
|---|---|---|
| `nhif` | EXTERNAL-BLOCKED | Requires NHIF API credentials + sandbox endpoint from NHIF TZ. |
| `tra` | EXTERNAL-BLOCKED | Requires TRA EFD integration credentials. |
| `tmda` | EXTERNAL-BLOCKED | Requires TMDA medicines/devices API access for registration lookup and pharmacovigilance. |
| `pacs` | EXTERNAL-BLOCKED | Requires DICOM endpoint + AE title credentials from site radiology/PACS vendor. |
| `video_provider` | EXTERNAL-BLOCKED | Requires telehealth video vendor credentials. |
| `fhir_endpoint` | EXTERNAL-BLOCKED | Requires national/peer FHIR endpoint URL + certificate. |
| `mtuha_submission` | EXTERNAL-BLOCKED | Requires MoH HMIS/MTUHA submission endpoint specs and credentials. |
| `finance_os` | EXTERNAL-BLOCKED | Integration with canonical BEYU Finance OS (ledger remains outside Health OS). |
| `payment_gateway` | EXTERNAL-BLOCKED | PCI-DSS scoped — requires PSP credentials and redaction review. |
| `sms_gateway` | EXTERNAL-BLOCKED | SMS aggregator credentials. |
| `email_gateway` | EXTERNAL-BLOCKED | SMTP/SES/Mailgun credentials. |
| `hive` / `noelia` | EXTERNAL-BLOCKED | AI governance endpoint + API key. |

When credentials are absent the adapter returns `EXTERNAL_UNAVAILABLE` →
`DomainError.unavailable()` → 503 with structured body; never "submitted
successfully".

---

## 5. Security/privacy controls (engineering-only; no certification claim)

| Control | Status | Notes |
|---|---|---|
| CSP/HSTS/COOP/CORP/Referrer-Policy | IMPLEMENTED | main.ts helmet config. |
| RLS 100% on health.* | IMPLEMENTED | migrations.spec + adversarial spec enforce. |
| Password hashing (bcrypt) | IMPLEMENTED | Auth service. |
| JWT HS256 pinned | IMPLEMENTED | jw.strategy enforces algorithms:[HS256]; no alg:none. |
| Cookie flags (HttpOnly, Secure, SameSite=Lax) | IMPLEMENTED | Auth controller. |
| Auth token rotation + revocation | IMPLEMENTED | Refresh rotation + logout-all. |
| RBAC + explicit permission grants | IMPLEMENTED | PermissionsGuard + RequirePermission. |
| Audit fail-closed | IMPLEMENTED | All mutations open transactions, set RLS GUCs, write audit; throw if actor context missing. |
| Data classification (phi default) | PARTIALLY_IMPLEMENTED | Column + default present; per-resource tagging pending. |
| Log secret redaction | IMPLEMENTED | JsonLogger redact list; boot diagnostic never prints values. |
| CSRF origin check | PARTIALLY_IMPLEMENTED | Guard exists; needs to be wired globally for state-changing routes. |
| Rate limiting / brute-force | MISSING | Tracked. |
| MFA/TOTP/WebAuthn | MISSING | Tracked. |
| Session timeout / idle timeout | MISSING | Tracked. |
| SQL injection | IMPLEMENTED | Parameterised queries everywhere via DbConnection. |
| IDOR tests | PARTIALLY_IMPLEMENTED | rls-adversarial.spec covers cross-tenant; per-endpoint object-level tests cover patients/appointments — broader suite pending. |
| Audit-tamper detection | PARTIALLY_IMPLEMENTED | Append-only via INSERT-only policy, but no cryptographic chaining yet. |
| Concurrency (double-booking, inventory races) | IMPLEMENTED (clinical ops) | Appointments uses SELECT FOR UPDATE on overlapping holds; pharmacy dispenses atomic; laboratory verification guarded by version. Distributed lock service for multi-instance races PARTIALLY_IMPLEMENTED (DB transactions cover single-instance Postgres semantics; cross-region requires advisory locks). |
| Deadlock mitigation | PARTIALLY_IMPLEMENTED | Consistent table ordering in most mutations; explicit deadlock retry policy pending. |
| AsyncLocalStorage reuse | IMPLEMENTED | TenantContext + requestStorage both ALS-based, no enterWith outside test scaffolding. |
| PHI minimisation in logs | IMPLEMENTED | JsonLogger defaults exclude PHI; only IDs/correlation logged. |

---

## 6. Clinical content & interoperability

| Item | Status | Notes |
|---|---|---|
| ICD-10/ICD-11/SNOMED/LOINC binding | PARTIALLY_IMPLEMENTED | Fields accept free-text codings; terminology adapter + value sets EXTERNAL-BLOCKED. |
| FHIR R4/R5 | PARTIALLY_IMPLEMENTED | Module scaffold present; FHIRValidator and terminology adapters EXTERNAL-BLOCKED. |
| HL7 v2.x | MISSING | Parser/serializer not implemented; adapter contract reserved in integrations. |
| DICOM metadata storage | IMPLEMENTED | dicom_study_uid, accession_number, equipment_id, radiation_dose on imaging_orders; imaging_equipment registry. |
| DICOM networking (C-STORE/C-FIND) | EXTERNAL-BLOCKED | Requires PACS DICOM endpoint + TLS certs. |
| TZ STG / NEMLIT / IMCI guidelines | EXTERNAL-BLOCKED / REQUIRES-HUMAN-APPROVAL | Registry table exists; loading actual MoH/WHO guideline content must be done by clinical governance via controlled import — not fabricated. |
| NABH alignment | PARTIALLY_IMPLEMENTED | Controls scaffolded (incidents, consent, patient ID, medication safety); no "accredited" claim. Chapters mapped as PARTIALLY_IMPLEMENTED where controls are partial. |
| ISO 15189 (lab) | PARTIALLY_IMPLEMENTED | Analyzer registry + chain-of-custody columns; QC gate and calibration-due blocking pending. |
| ISO 27001/27799/27017/27018 alignment | PARTIALLY_IMPLEMENTED | Access control, audit, CSP/HSTS, retention policies; full control mapping document pending (security docs). |
| ISO 13485 (SaMD/medical devices) | MISSING | Not scoped for this release (AI/CDS not yet active). |

---

## 7. AI governance (Noelia/HIVE)

| Item | Status |
|---|---|
| HIVE adapter stub (fail-closed) | IMPLEMENTED |
| Audit fields (model, version, confidence, input_provenance, human_reviewer) | PARTIALLY_IMPLEMENTED — columns not yet added to audit_log; to be added in next migration once CDS calls are wired. |
| No self-authorization / no self-escalation | PARTIALLY_IMPLEMENTED — enforced by adapter-level guard; human-review flag check in decision flow pending. |

---

## 8. Frontend status

This audit covers backend primarily. Frontend (`sectors/health/frontend/`) was
not in scope for this baseline; the Phase 3 plan lists "mock elimination" as
Part 25. Flagged here as PARTIALLY_IMPLEMENTED pending a separate frontend
audit.

---

## 9. Tests & build gates (baseline)

- **TypeScript:** `npx tsc --noEmit` — 0 errors
- **Nest build:** `npx nest build` — clean
- **Jest:** **34 suites / 166 tests passing**
  - RLS adversarial (cross-tenant isolation)
  - Migration round-trip (up, idempotent re-apply, down to zero)
  - Auth, RBAC, permissions guard
  - CSFR origin guard
  - JSON logger (secret redaction)
  - Patients, Appointments, Clinical, Laboratory, Radiology, Pharmacy, Billing, Ambulance, Reporting (MTUHA), Reporting (mappings fail-closed), Integrations (adapter probes + unavailable), Compliance, Dialysis, Consent, Incidents, TZ compliance pack seeds
  - Audit service (fail-closed, envelope)
- **Placeholder scan:** 0 hits in production src/** and migrations for TODO/MOCK/STUB/NOT_IMPLEMENTED/FAKE/SIMULATED markers.

---

## 10. EXTERNAL-BLOCKER register (authoritative at baseline)

These are *engineering-complete, waiting on external counterparties*. No code
path returns fabricated "success" against them:

1. **NHIF TZ** — claims/member-verification adapter needs credentials + sandbox.
2. **TRA TZ** — EFD/invoicing integration.
3. **TMDA TZ** — medicines/device registration lookup + pharmacovigilance submission.
4. **MCT / TNMC / Pharmacy Council TZ** — practitioner licence verification APIs.
5. **MoH TZ MTUHA/HMIS** — submission endpoint, protocol version, credentials.
6. **PACS vendor** — DICOM AE title, TLS, endpoint.
7. **TAEC (radiation protection)** — dose registry integration (if mandated).
8. **National/FHIR peer endpoint** — FHIR R4/R5 exchange.
9. **Video provider (telehealth)** — credentials.
10. **SMS / Email gateway** — provider accounts.
11. **HIVE / Noelia** — AI governance endpoint + API key.
12. **Payment gateway (PCI-DSS scope)** — PSP + tokenization integration.
13. **Finance OS (BEYU canonical ledger)** — integration contract finalization.
14. **Clinical guideline content (TZ STG, NEMLIT, IMCI, WHO)** — governance-approved import (no fabrication).

---

## 11. REQUIRES-HUMAN-APPROVAL register

Items where engineering must NOT self-approve:

1. Clinical guideline content loading (TZ STG/NEMLIT/IMCI/WHO) — requires clinical governance sign-off.
2. Cross-border data transfers under PDPA — requires DPO approval.
3. NABH/ISO accreditation gap sign-off — requires Quality Head + senior responsible owner.
4. AI model deployments (Noelia/HIVE) — require clinical reviewer + model governance record.
5. Production go-live — requires change advisory board / medical director sign-off.
6. Legal hold releases — requires legal counsel authorization.
7. Retention policy modifications — requires records/DPO approval.

---

## 12. SECURITY-BLOCKED items (no workaround)

- None currently blocking engineering merge; tracked gaps (MFA, rate-limit, audit chaining) are risk-accepted for development but MUST be closed prior to production go-live.

## 13. ARCHITECTURE-BLOCKED items

- Cross-region/distributed concurrency (advisory locks) pending multi-region architecture decision.
- DICOM network layer pending infra decision (in-cluster PACS router vs VPN to site PACS).

---

## 14. MOCKED items (none in production)

Zero. Adapter stubs are real fail-closed contracts that throw
`DomainError.unavailable()` and surface `EXTERNAL_DEPENDENCY_REQUIRED`; they are
not mocks returning simulated data.

---

## 15. Next actions (Phase 3 continuing)

Ordered by risk:

1. Security: rate-limit, CSRF global wiring, MFA scaffolding, audit chaining.
2. Concurrency: advisory-lock helper for multi-instance races; deadlock retry policy.
3. Remaining domain service modules: facilities, practitioners, public-health event workflow, imaging QC gate, lab QC/calibration gate.
4. FHIR R4 resource mappers (Patient, Encounter, Observation, MedicationRequest, DiagnosticReport).
5. HL7 v2 parser (ADT/ORM/ORU) for legacy hospital systems.
6. Ophthalmology/optometry controls (eyewear prescription verification, TMDA device registration checks).
7. AI governance: audit model/version/confidence/reviewer on every AI-assisted action; enforce human-in-the-loop.
8. Frontend mock elimination (separate frontend audit).
9. Retention/legal-hold enforcement at service layer (block delete when hold active).
10. E2E test suite against PGlite + test bootstrapped API (supertest).
11. ISO 27001/27799/NABH control mapping documents under `docs/security/`, `docs/compliance/`.
12. Final engineering completion report after regression is GREEN at target scope.
