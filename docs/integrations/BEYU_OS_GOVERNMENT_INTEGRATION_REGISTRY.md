# BEYU OS — Government Integration Registry

**Module:** Government Integration Fabric — a shared module INSIDE BEYU OS.
**It is NOT a separate Government OS.** BEYU OS remains the global control
plane; sector OSs (Health, Finance, Agriculture, Foundation) consume
government capabilities exclusively through this one canonical gateway
(`src/lib/government`). No sector OS may dial a government system directly —
enforced by `tests/government/architecture-boundary.test.ts`.

**Source of truth at runtime:** the `government_agencies` table (migration
`0036_government_integration_fabric`), runtime-immutable (SELECT-only for
`beyu_runtime`; status promotion requires an administrative migration/seed
path plus, for production, recorded human authorization —
`production_authorized_by/at` enforced by CHECK
`government_agencies_prod_needs_approval`). This document is the human-readable
mirror; where they disagree, the database row wins and this file must be fixed.

## Status model

`NOT_STARTED → DISCOVERY → CONTRACT_VERIFIED → SANDBOX_READY → UAT_VERIFIED →
PRODUCTION_READY → LIVE`, with fail-closed off-ramps `EXTERNAL_BLOCKED`
(interface exists, credentials/enrollment not issued), `CONTRACT_PENDING` (no
verified official machine interface), `PRODUCTION_AUTHORIZATION_PENDING`
(technically ready, human production authorization absent).

A status is NEVER advanced on mock evidence. Mock success advances only the
mock agency. `LIVE`/`PRODUCTION_READY`/`UAT_VERIFIED` require verified
exchanges with the real government environment.

## Registry — priority portfolio (as seeded, 2026-09-09)

| # | Code | Agency | Domain | Interface | Auth | Status | Blocker / next gate |
|---|------|--------|--------|-----------|------|--------|---------------------|
| 1 | `TRA_VFD` | Tanzania Revenue Authority — Virtual Fiscal Device (EFDMS) | Fiscal receipts, Z-reports, receipt verification | HTTP + signed XML (documented VFD API; registration → token → receipt/Z-report) | TRA-issued certificate + cert key; signed payloads (EFDMSSIGNATURE); time-limited bearer token | **EXTERNAL_BLOCKED** | TRA VFD onboarding: TIN, certificate + certkey issued by TRA; official spec PDF verification before CONTRACT_VERIFIED can be recorded from primary source |
| 2 | `NHIF` | National Health Insurance Fund | Member verification, e-claims (SubmitFolios), submitted-claims reconciliation | REST + JSON (verification + claims servers) | Per-facility username/password → bearer token (issued by NHIF IT) | **EXTERNAL_BLOCKED** | Facility credentials from NHIF (it@nhif.or.tz); practitioner MCT license numbers required in folios |
| 3 | `NIDA` | National Identification Authority | NIN verification (external verification authority ONLY — GlobalUserID remains the canonical BEYU identity) | No public developer contract | Formal agreement + NIDA-provisioned access | **CONTRACT_PENDING** | Formal NIDA engagement. The circulating unauthenticated BRELA passthrough endpoint is an unofficial hack and is PROHIBITED (no-scraping rule; tested) |
| 4 | `BRELA` | Business Registrations and Licensing Agency | Company/BN verification, beneficial ownership | Portal only (ORS public search); no published API/data feed | UNVERIFIED | **CONTRACT_PENDING** | Official machine interface or data-sharing agreement. Note: Zanzibar entities are under BPRA, a separate registry |
| 5 | `DHIS2` | National HMIS (DHIS2) | Aggregate health reporting (dataValueSets), metadata | REST + JSON (public, versioned DHIS2 Web API) | Basic auth / PAT against the authorized national instance | **EXTERNAL_BLOCKED** | National instance URL + credentials + org-unit assignment from MoH |
| 6 | `TMDA` | Tanzania Medicines & Medical Devices Authority | Product registration/premise licensing checks | No verified public machine interface | UNVERIFIED | **CONTRACT_PENDING** | Official interface discovery with TMDA |
| 7 | `NSSF` | National Social Security Fund | Contributions, member registration | No verified public machine interface | UNVERIFIED | **CONTRACT_PENDING** | Official interface discovery with NSSF |
| 8 | `WCF` | Workers Compensation Fund | Contributions, claims | No verified public machine interface | UNVERIFIED | **CONTRACT_PENDING** | Official interface discovery with WCF |
| 9 | `OSHA` | Occupational Safety and Health Authority | Registration, compliance certificates | No verified public machine interface | UNVERIFIED | **CONTRACT_PENDING** | Official interface discovery with OSHA |
| 10 | `PSSSF` | Public Service Social Security Fund | Contributions | No verified public machine interface | UNVERIFIED | **CONTRACT_PENDING** | Official interface discovery with PSSSF |
| — | `MOCK_GOV_SANDBOX` | Deterministic in-process sandbox | Full lifecycle exercise (ACCEPT/REJECT/TIMEOUT) | In-process | none | **SANDBOX_READY** (permanently capped; `isMock=true`, never production-capable) | n/a — exists to prove the pipeline, never as evidence for any real agency |

### Candidate agencies (registered intent, no rows seeded)

RITA, NECTA, HESLB, Immigration, TCRA, LATRA, Mining Commission, TISEZA,
TOSCI, Ministry of Agriculture, Livestock/Fisheries, land systems, TASAC, TPA,
TCAA, TAA, TRC, GPSA, LGAs and other MDAs enter as `NOT_STARTED` rows when a
sector OS raises a concrete need; each then follows the same
DISCOVER→VERIFY→IMPLEMENT→TEST→AUTHORIZE→ACTIVATE ladder.

## Submission pipeline (every material government call)

actor → GlobalUserID → tenant/entity/country/sector resolution → RBAC
(`government:submission.manage`, HIGH_RISK → MFA step-up) → ABAC/tenant scope →
registry gate (agency must be CALLABLE for its status) → durable
`government_submissions` row (idempotency key + payload digest) → adapter →
official system → response validation → status transition (`PENDING_EXTERNAL`,
`SUBMITTED`, `ACCEPTED`, `REJECTED`, `EXTERNAL_UNAVAILABLE`, `RETRY_REQUIRED`,
`RECONCILIATION_REQUIRED`, `EXTERNAL_BLOCKED`) → audit event → evidence.

Invariants (database CHECKs + tests):
- `ACCEPTED` requires a non-null `external_reference`
  (`government_submissions_accept_needs_reference`) — an acceptance without a
  government-issued reference is structurally impossible.
- `EXTERNAL_BLOCKED` registry rows must carry a `blocked_reason`.
- Submission history is never erased by the application (no DELETE grant).
- Credentials are referenced by env-var NAME only; no credential value is
  stored in the registry or repository.

## Noelia boundary

Noelia has exactly one government tool: `government.integration.status`
(read-only, LOW risk, no side effects). No Noelia tool carries
`government:submission.manage`, so autonomous material government action is
structurally unreachable, not merely policy-denied. Noelia may prepare and
analyze government work; it may never claim a submission occurred without an
adapter-confirmed `government_submissions` record.

## Runbooks

- [TRA VFD](runbooks/TRA_VFD.md)
- [NHIF](runbooks/NHIF.md)
- [DHIS2](runbooks/DHIS2.md)

Security analysis: `docs/audit/BEYU_OS_GOVERNMENT_INTEGRATION_SECURITY_MODEL.md`.
