# BEYU Health OS — Phase 5 Baseline (Part 0)

**Branch:** `arena/01a0532c-beyu-os-1-0`
**Baseline start SHA:** `218f7fb` (Phase 4 interim report)
**Date:** 2026-08-31

This baseline is produced by inspecting the tree, running scans, and running
all gates. Items use the eight-state vocabulary:

**IMPLEMENTED / PARTIALLY_IMPLEMENTED / MISSING / MOCKED / EXTERNAL-BLOCKED /
SECURITY-BLOCKED / ARCHITECTURE-BLOCKED / REQUIRES-HUMAN-APPROVAL**.

## Verified gates at baseline (after Phase 4 segment)

- TypeScript `tsc --noEmit`: PASS (0 errors).
- Nest build: PASS.
- Jest: 37 suites / 181 tests PASS.
- RLS: 59/59 health.\* tables, 1:1 policies.
- Migrations 001–012 up/idempotent/down verified.
- MFA primitives (TOTP/recovery/lockouts/challenges): IMPLEMENTED.
- RateLimiter in-memory backend IMPLEMENTED; Redis fail-closed boot IMPLEMENTED.
- Audit SHA-256 chain IMPLEMENTED; immutability triggers PRESENT.
- Placeholder scan (TODO/FIXME/MOCK/STUB/FAKE/DEMO/SIMULATED/NOT_IMPLEMENTED in production source): 0 hits.
- No production deployment performed.

## Placeholder/scan results

`grep -rnE "TODO|FIXME|MOCK|MOCK_DATA|DEMO|STUB|NOT_IMPLEMENTED|TEMPORARY|FAKE|SIMULATED" src --include=*.ts` after excluding `.spec.ts` files returns 0 matches in production code. Adapter stubs are legitimate fail-closed contracts, not mocks.

## Module-by-module status (at start of Phase 5)

| Area | Status |
|---|---|
| ai (AiGovernanceService) | IMPLEMENTED |
| ambulance | IMPLEMENTED |
| appointments | IMPLEMENTED |
| audit (AuditService) | IMPLEMENTED |
| auth (JWT/bcrypt/RBAC) | PARTIALLY_IMPLEMENTED (no MFA HTTP wiring yet; no login brute-force wiring) |
| billing | IMPLEMENTED |
| clinical | IMPLEMENTED |
| compliance | IMPLEMENTED (20 controls) |
| consent | IMPLEMENTED (non-boolean, fail-closed) |
| csrf guard (Origin/Referer) | IMPLEMENTED; global wiring PARTIALLY_IMPLEMENTED |
| dialysis | IMPLEMENTED |
| encounters | IMPLEMENTED |
| fhir | PARTIALLY_IMPLEMENTED (scaffold; R4/R5 mappers MISSING) |
| identity (repo + sessions + legacy MFA stub) | IMPLEMENTED |
| incidents | IMPLEMENTED |
| integrations (12 fail-closed adapters) | IMPLEMENTED fail-closed; per-adapter schema validators PARTIALLY_IMPLEMENTED |
| laboratory | PARTIALLY_IMPLEMENTED (QC/IQC/EQA release gates MISSING) |
| notifications | MOCKED; SMS/email EXTERNAL-BLOCKED |
| ophthalmology/optical | PARTIALLY_IMPLEMENTED (schema PRESENT; dispensing service PENDING) |
| patients | IMPLEMENTED |
| permissions/permissions guard | IMPLEMENTED |
| pharmacy | IMPLEMENTED; pharmacovigilance hooks PARTIALLY_IMPLEMENTED; TMDA EXTERNAL-BLOCKED |
| queue_jobs table | PARTIALLY_IMPLEMENTED; Bull workers MISSING (Redis EXTERNAL-BLOCKED) |
| radiology | PARTIALLY_IMPLEMENTED (schema PRESENT; PACS EXTERNAL-BLOCKED; QC PENDING) |
| rate limiter | PARTIALLY_IMPLEMENTED (in-memory IMPLEMENTED; HTTP middleware wiring MISSING; Redis EXTERNAL-BLOCKED) |
| records (Signatures, LegalHolds) | PARTIALLY_IMPLEMENTED |
| reporting/MTUHA | PARTIALLY_IMPLEMENTED (fail-closed mapping_status=incomplete PRESENT; deterministic mapping completeness PENDING; submission EXTERNAL-BLOCKED) |
| search | IMPLEMENTED |
| supabase | MOCKED |
| telehealth | PARTIALLY_IMPLEMENTED; video_provider EXTERNAL-BLOCKED |
| tenants | IMPLEMENTED |
| users | IMPLEMENTED |
| transaction envelope | PARTIALLY_IMPLEMENTED (columns PRESENT; reusable TransactionContext PENDING) |
| frontend | MOCKED (Part J) |
| HL7 v2 parser | MISSING |
| DICOM UID/metadata validator | PARTIALLY_IMPLEMENTED (schema columns PRESENT; validator MISSING; PACS EXTERNAL-BLOCKED) |
| Terminology adapters (ICD-10/11, SNOMED, LOINC) | MISSING (contract scaffold absent; dataset EXTERNAL-BLOCKED) |
| E2E workflow | MISSING |
| /health/live + /health/ready | PARTIALLY_IMPLEMENTED (deep dependency probes MISSING) |
| Configuration separation (dev/test/staging/prod) | PARTIALLY_IMPLEMENTED (.env.example present; per-env modules MISSING) |
| Production cookie flags (Secure, HttpOnly, SameSite) | PARTIALLY_IMPLEMENTED (refresh-token cookie flag validation boot check PARTIAL) |
| NABH alignment matrix | PARTIALLY_IMPLEMENTED (NABH-CLIN-01 seeded; full matrix MISSING) |
| TZ compliance matrix | PARTIALLY_IMPLEMENTED (20 controls; 80+ expected for full Part 16) |

## Security-boundary status

| Boundary | Status |
|---|---|
| RLS (tenant/entity/country) | IMPLEMENTED (59/59) |
| JWT + bcrypt + refresh rotation | IMPLEMENTED |
| MFA TOTP/recovery/lockouts/challenges | PARTIALLY_IMPLEMENTED (service IMPLEMENTED; HTTP wiring MISSING at baseline) |
| CSRF Origin/Referer guard | PARTIALLY_IMPLEMENTED (guard exists; not globally wired) |
| Rate limiting | PARTIALLY_IMPLEMENTED (in-memory only; HTTP middleware MISSING; Redis EXTERNAL-BLOCKED) |
| Account lockout (password login) | MISSING (mfa_lockouts covers MFA; password lockout needs login_failures wiring) |
| IDOR/practitioner/facility scope endpoint audit | PARTIALLY_IMPLEMENTED (RLS is defense-in-depth; per-endpoint tests MISSING) |
| Audit fail-closed + immutability + hash chain | IMPLEMENTED |
| Legal hold triggers (patients/encounters) | IMPLEMENTED |
| Boot secret/CORS validation | IMPLEMENTED |
| Secret redaction in logs | IMPLEMENTED |
| CSP/HSTS/COOP/CORP | IMPLEMENTED |
| Session security_version invalidation | MISSING (column added in 013) |
| Production Redis fail-closed boot | PARTIALLY_IMPLEMENTED (rate limiter fails closed; queue workers pending) |
