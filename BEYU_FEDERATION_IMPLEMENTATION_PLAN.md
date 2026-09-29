# BEYU FEDERATION & TRUST — IMPLEMENTATION PLAN

**Date:** 2026-09-28 · **Branch:** `arena/01a0e972-beyu-os-1-0` · **Base:** `cd52cc6` (main)
**Precondition:** `BEYU_FEDERATION_REALITY_AUDIT.md` (Phase 0) — reality audited before this plan was written.

## 0. Governing decisions (constitutional)

1. **ONE shared BEYU OS capability** — "BEYU Federation & Trust" — extending the existing Government Integration Fabric (migration 0036). No Federation OS, no sector federation cores, no second identity/tenant/audit/event/governance system. Recorded as ADR in the seed.
2. **Inventory is data, not core code** (program rule 96). Federation core = generic jurisdiction/authority/service/connector/engine. Tanzania = a **jurisdiction profile** + authority/service/region/LGA records loaded from `src/db/federation-data/*` through the governed seed path. Future countries add profiles, never core changes.
3. **Fail-closed by invariant, not discipline.** Every "claim about external reality" is a typed status with a database CHECK: `LIVE`/`LIVE_VERIFIED` require production evidence FK + named approver + approval reference; `FREE_CONFIRMED` requires cost-evidence FK; `VERIFIED+` verification requires an evidence row; discovered data cannot skip states (lifecycle transition table enforced in engine + DB status catalogues).
4. **Extend `government_agencies`, don't duplicate it.** New `federation_authorities.legacy_agency_code` (unique, FK) links trust-plane authority records to the 11 existing fabric rows. The submission plane (`government_submissions`, `src/lib/government/`) is unchanged; live connector traffic routes through the existing gateway.
5. **Credentials: env-var NAMES only** (fabric precedent). No secret value ever enters DB, source, tests or logs.
6. **URL is never authorization.** New UI/API reuse `requireAccess` / `guarded()`; deep links re-run the full server-side chain (session → permission → classification → tenant/entity/country → RLS).
7. **Noelia observes, never approves.** No `federation:approve`/`federation:production.*` to any AI path; `noelia_action_requests` (human-executed) is the only AI interface.

## 1. Phase map (program phases → artifacts)

| Phase | Artifact(s) |
|---|---|
| P0 Reality audit | `BEYU_FEDERATION_REALITY_AUDIT.md` ✅ |
| P1 Federation schema/core | `src/db/schema/federation.ts`; `drizzle/0071_federation_trust.sql` (19 tables: jurisdictions, domains, authorities, services, datasets, schemas, connectors, credentials, agreements, legal_bases, consents, evidence, verifications, incidents, access_requests, approvals, transitions, capabilities, reconciliation runs/results); CHECK invariants; RLS; runtime-role grants; migration self-verification block |
| P2 Jurisdiction engine | `src/lib/federation/catalog.ts` (canonical state catalogues), `src/lib/federation/jurisdiction.ts` (profile model incl. GovESB requirement registry, data-residency, network requirements); TZ profile data |
| P3 Tanzania authority inventory | `src/db/federation-data/tz-{jurisdiction,domains,authorities,regions,lgas,services}.ts` — every authority class discussed in the BEYU architecture work; 26 mainland regions; LGA district baseline; per-service independent statuses |
| P4 Tanzania reconciliation | `src/lib/federation/reconciliation.ts` (MATCH/NEW/MISSING/DUPLICATE/RENAMED/MERGED/DISSOLVED/UNCERTAIN/MANUAL_REVIEW); repeatable run records; live-directory ingestion hook (blocked in this environment — documented); search-index snapshot baseline with provenance |
| P5 Cost/access classification | `catalog.ts` cost catalogue (13 states); guards (`canMarkFreeConfirmed` …); UI cost column never renders "FREE" without evidence |
| P6 Legal/consent/agreement | `federation_legal_bases` (source/reference/jurisdiction/purpose/scope/dates/reviewer/evidence), `federation_consents` (6-state machine incl. withdrawal propagation), `federation_agreements` (8 agreement types, expiry, renewal) |
| P7 Connector framework | `federation_connectors` (13 connector types), health metrics, credential lifecycle (`federation_credentials`, env-var refs only), framework abstraction in `src/lib/federation/connectors.ts`; **no live government connector implemented** (no credentials exist) — mock sandbox only, via existing gateway |
| P8 GovESB integration model | Jurisdiction-profile `govesb` block (registration, security assessment, sandbox, DR, GovNET/IPSec, DSA requirements as *requirements to verify*, not compliance claims); `GOVESB_*` states on authorities/services/connectors; no `GOVESB_LIVE*` without evidence |
| P9 Evidence/provenance | `federation_evidence` (11 evidence types, subject linkage, capture metadata, hash, expiry, status); every claim-gated state FKs evidence |
| P10 Security/RLS/RBAC/ABAC | 15 `federation:*` permissions (high-risk flag on credential.manage / approve / production.* / revoke); role grants (PLATFORM_ADMIN manage+read, CHIEF_GOVERNANCE_OFFICER approve+read, AUDITOR audit.read, CISO security read/manage via existing security permission — see plan §4); RLS on every tenant-scoped table; registry tables runtime-SELECT-only; negative + security tests |
| P11 UI/control center | `/os/federation` (overview, jurisdictions, authorities, services, connectors, datasets, schemas, agreements, legal basis, consent, credentials, verification, costs, evidence, health, incidents, audit links, coverage, pending approvals, cross-border, Noelia monitoring panel) |
| P12 Sector OS integration | Integration contract doc + OS-registry note: all four Sector OSes + Foundation consume the shared capability through `/api/v1/federation/*` + the existing government gateway; no sector federation code |
| P13 Noelia/HIVE monitoring | `src/lib/federation/monitoring.ts` — deterministic health/drift/expiry summaries Noelia can surface (read-only, existing `ai_decisions` boundary); Noelia cannot authorize |
| P14 Testing | Unit: lifecycle, cost, verification, consent, capability, transition, reconciliation, coverage. Security/negative (program §86 list). RLS integration against real PG16 (embedded). API authorization tests |
| P15 Documentation | `FEDERATION_{ARCHITECTURE,SECURITY,GOVERNANCE,DATA_MODEL,CONNECTORS,COST_MODEL,GOVESB,TANZANIA,INTERNATIONAL,OPERATIONS,RUNBOOK,INCIDENT_RESPONSE}.md` + `TANZANIA_FEDERATION_COVERAGE.md`, `TANZANIA_FEDERATION_COVERAGE_AUDIT.md`, `TANZANIA_PUBLIC_ACCESS_COVERAGE.md` (audit generated by `scripts/federation/tanzania-coverage-audit.ts`) |
| P16 PR / human gate | One coherent branch, logical commits, PR with the program's required body sections. **STOP at human-controlled promotion gate.** No production promotion, no live connector activation. |

## 2. State catalogues (canonical, mirrored in DB CHECK constraints)

- **Lifecycle (17+5):** DISCOVERED → CLASSIFIED → AUTHORITY_CONFIRMED → LEGAL_BASIS_CONFIRMED → AGREEMENT_REQUIRED → AGREEMENT_CONFIRMED → ACCESS_REQUESTED → CREDENTIALS_PROVISIONED → SANDBOX → SECURITY_TEST → INTEROPERABILITY_TEST → DATA_VALIDATION → AUTHORITY_ACCEPTANCE → PRODUCTION_APPROVAL → LIVE → LIVE_VERIFIED → MONITORED; exceptional: SUSPENDED, REVOKED, EXPIRED, DEGRADED, FAILED_VERIFICATION. Forward-only except governed exceptional moves (engine `TRANSITIONS` map; DB catalogue CHECK).
- **Verification (5):** REGISTERED, VERIFIED, SANDBOX, LIVE, LIVE_VERIFIED. Level up requires an evidence row (VERIFIED+), endpoint/test/result/environment/credential-class/schema-version fields, verified-by/at, revalidation date.
- **Cost/access (13):** PUBLIC_INFORMATION, PUBLIC_SERVICE, PUBLIC_API, AUTHORIZED_API, GOVESB, AGREEMENT_REQUIRED, PAID_ACCESS, UNKNOWN_COST, NO_PUBLIC_API, MANUAL_VERIFICATION, ACCESS_PENDING, NOT_CONNECTED, FREE_CONFIRMED (evidence-gated; **never inferred**).
- **GovESB (9):** GOVESB_NOT_REQUIRED, GOVESB_REQUIRED, GOVESB_ELIGIBLE, GOVESB_REGISTERED, GOVESB_SANDBOX, GOVESB_TESTED, GOVESB_PRODUCTION_APPROVED, GOVESB_LIVE, GOVESB_LIVE_VERIFIED, + GOVESB_UNKNOWN.
- **Capability (10):** AVAILABLE, NOT_AVAILABLE, REQUIRES_AUTHORIZATION, REQUIRES_CONSENT, REQUIRES_AGREEMENT, REQUIRES_LOCAL_ENTITY, REQUIRES_GOVERNMENT_CONNECTION, REQUIRES_HUMAN_APPROVAL, NOT_IMPLEMENTED, NOT_CERTIFIED.
- **Consent (6):** REQUESTED, GRANTED, DENIED, WITHDRAWN, EXPIRED, SUPERSEDED.
- **Reconciliation (9):** MATCH, NEW, MISSING, DUPLICATE, RENAMED, MERGED, DISSOLVED, UNCERTAIN, MANUAL_REVIEW.
- **Incident (7):** DETECTED, TRIAGED, CONTAINED, INVESTIGATING, REMEDIATED, VERIFIED, CLOSED.
- **Classification (6):** PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, PROTECTED, HIGHLY_RESTRICTED — aligned to the existing BEYU Classification vocabulary (existing tiers reused verbatim where they exist).

## 3. DB invariants (fail-closed, enforced by CHECK/FK in 0071)

1. `federation_authorities.lifecycle_status IN (PRODUCTION_APPROVAL, LIVE, LIVE_VERIFIED)` ⇒ `production_evidence_id NOT NULL AND approved_by NOT NULL AND approval_reference NOT NULL`.
2. `federation_authorities.access_cost_status = FREE_CONFIRMED` ⇒ `cost_evidence_id NOT NULL`.
3. `federation_verifications.level IN (VERIFIED, SANDBOX, LIVE, LIVE_VERIFIED)` ⇒ `evidence_id NOT NULL` (evidence row itself must be VALID, re-checked in engine).
4. Unique authority code per jurisdiction; unique legacy link (no double-identity with 0036 registry); evidence FKs cannot be orphaned (FK + ON DELETE RESTRICT).
5. `federation_access_requests.status = APPROVED` ⇒ a `federation_approvals` row by a distinct approver exists (engine-enforced + DB CHECK on approval FK).
6. Credentials: `status IN (ISSUED, ROTATION_REQUIRED)` carries env-var refs only; no secret column exists in the schema (by construction).
7. Registry tables: FORCE RLS + runtime role SELECT-only (0036 pattern); tenant tables: tenant + entity (+ classification) scope, no DELETE on audit-shaped rows.

## 4. RBAC (new permissions; high-risk ⇒ MFA step-up)

`federation:read`, `federation:manage`, `federation:authority.read`, `federation:authority.manage`, `federation:service.read`, `federation:service.manage`, `federation:connector.read`, `federation:connector.manage`, `federation:credential.manage` (HIGH), `federation:agreement.read`, `federation:agreement.manage`, `federation:verification.read`, `federation:verification.manage`, `federation:audit.read`, `federation:approve` (HIGH), `federation:production.activate` (HIGH), `federation:production.revoke` (HIGH).

Grants: PLATFORM_ADMIN (read/manage/approve), CHIEF_GOVERNANCE_OFFICER (read/approve/audit), CHIEF_SECURITY_OFFICER/CISO analogue (read/connector.manage/credential.manage/audit — exact existing role code verified in constants.ts), AUDITOR (audit.read), GROUP_CFO + SECTOR role family (read only). **No AI role receives any grant.**

## 5. Testing strategy (program §85–86)

- **Unit (vitest, no DB):** lifecycle transitions (all legal + sampled illegal), cost guards, verification gates, consent machine + withdrawal propagation, capability negotiation (TZ→KE cross-border case), jurisdiction transition planning, reconciliation engine (all 9 states), coverage audit math.
- **Negative (program §86, 1:1 list):** unverified authority cannot become LIVE; discovered API cannot become LIVE; public website cannot become authorized API; unknown cost cannot become FREE; expired agreement/credential/revoked credential/revoked authority block access; missing legal basis/consent block; unauthorized tenant/entity/country/user blocked; invalid schema/provenance rejected; production activation without approval blocked; CAP_POSTING still locked.
- **RLS integration (real PG16, embedded-postgres):** migrate 0071 against real engine, then same-tenant/different-tenant, same-entity/different-entity, authorized/unauthorized user, admin, revoked user scenarios against `federation_consents`, `federation_access_requests`, `federation_agreements`, `federation_transitions`; registry tables readable but runtime-unwritable.
- **API:** guarded() behavior for federation routes (permission + classification + audit) via existing test helpers.

## 6. Seed honesty rules

- Every seeded authority: `record_status=REGISTERED`, `verification_status=REGISTERED`, `lifecycle_status=DISCOVERED|CLASSIFIED`, `api_status=UNVERIFIED` (or NONE_PUBLISHED where the 0036 row already says so and is cross-linked), `access_cost_status=UNKNOWN_COST` unless a cited public fact justifies `PUBLIC_INFORMATION`, `govesb_status=GOVESB_UNKNOWN` unless cross-linked row already records GovESB facts, `NOT_CONNECTED` implied (no connector exists).
- `official_website` only where high-confidence; otherwise `null` with `directory_source` referencing the official directory + provenance tag.
- Regions: 26 mainland (documented baseline + search-index corroboration) + 5 Zanzibar regions marked `UNCERTAIN (federal)`.
- LGAs: district baseline per region, each row `reconciliation_state=PENDING_RECONCILIATION`; count-mismatch (126 vs current public enumerations) surfaced in the coverage audit as MANUAL_REVIEW — never silently "reconciled".

## 7. Delivery order (this session)

1. ✅ P0 audit → 2. catalog + jurisdiction engine → 3. schema TS → 4. migration 0071 → 5. engines (lifecycle/guards/capability/reconciliation/coverage/transitions/monitoring) → 6. permissions/roles → 7. data files + seed wiring → 8. API routes → 9. UI → 10. tests (run: typecheck, lint, vitest, embedded-PG migrate+RLS) → 11. coverage audit script + reports → 12. docs → 13. commits + PR → **STOP at human gate.**
