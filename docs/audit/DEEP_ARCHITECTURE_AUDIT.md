# BEYU OS — Deep Architectural Integrity & Connectivity Audit

**Date:** 2026-08-16
**Method:** Read-only forensic inspection of source, database, runtime and test artifacts.
**Code modified:** NONE.

---

## 1. BEYU OS Architecture Integrity Score

**52 / 100** — The kernel security infrastructure is genuine and tested. Domain capabilities are overwhelmingly **read-only display of seed data** with no mutating application logic, no lifecycle execution, and no domain-service layer.

---

## 2. Repository Health

| Gate | Status |
|------|--------|
| TypeScript | ✅ CLEAN (0 errors) |
| Production build | ✅ PASS (25 routes) |
| Tests | ✅ 37/37 PASS (5 suites) |
| Migrations | ✅ 2 versioned, applied |
| Secret scan | ✅ 0 credential literals |
| npm audit | ⚠️ 16 vulnerabilities (1 critical dev-only) |
| DB integrity | ✅ 73 tables, 107 FKs, 11 RLS, 2 triggers |

---

## 3. Domain-by-Domain Implementation Matrix

| # | Capability | Classification | UI | API | Service | Domain Logic | DB Schema | Writes | AuthZ | Tenant Scope | Audit | Tests | Notes |
|---|-----------|---------------|-----|-----|---------|-------------|-----------|--------|-------|-------------|-------|-------|-------|
| 1 | **Identity** | PARTIALLY_IMPLEMENTED | ✅ sign-in | ✅ login/logout | — | ✅ session, MFA | ✅ parties, users, sessions | ✅ session+user | ✅ | ✅ | ✅ atomic | ✅ MFA 5 tests | No user CRUD API; no enrollment API |
| 2 | **Authorization** | PARTIALLY_IMPLEMENTED | — | — | ✅ authz.ts | ✅ RBAC+ABAC | ✅ roles, permissions, role_assignments | ❌ read-only | ✅ | ✅ | ❌ | ✅ engine 8 tests | Reads TS constants, not DB role_permissions (H-01) |
| 3 | **Tenant Management** | IMPLEMENTED | ✅ org page | — | ✅ tenant-scope.ts | ✅ scope calculation | ✅ tenants | ❌ seed-only | ✅ | ✅ | ❌ | ✅ 3 tests | No tenant CRUD API |
| 4 | **Organization** | PARTIALLY_IMPLEMENTED | ✅ org page | — | — | — | ✅ legal_entities, org_units | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | No create/update entity API; org_units DEAD |
| 5 | **Ownership** | PARTIALLY_IMPLEMENTED | ✅ org page | — | — | — | ✅ ownership_records | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | No ownership change API; H-05 aggregation issue |
| 6 | **Constitution** | IMPLEMENTED | ✅ page | — | — | — | ✅ constitution_articles | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Read-only display of constitutional text; no amendment API |
| 7 | **Policy Engine** | IMPLEMENTED | ✅ constitution page | — | ✅ policy.ts | ✅ hierarchy eval | ✅ policies | ❌ seed-only | ✅ | GLOBAL | ❌ | ✅ engine 2 tests | Evaluates at runtime; no policy CRUD API |
| 8 | **Governance** | STRUCTURAL_PLACEHOLDER | ✅ page | ❌ | ❌ | ❌ | ✅ bodies, members, resolutions, votes | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | **Display only. No resolution create, vote, approve, or lifecycle API.** |
| 9 | **Strategy** | STRUCTURAL_PLACEHOLDER | ✅ dashboard | ❌ | ❌ | ❌ | ✅ strategic_objectives | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Read-only display; no OKR/KPI management |
| 10 | **Risk** | STRUCTURAL_PLACEHOLDER | ✅ assurance page | ❌ | ❌ | ❌ | ✅ risks | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only; no risk create/assess/escalate API |
| 11 | **Controls** | STRUCTURAL_PLACEHOLDER | ✅ assurance page | ❌ | ❌ | ❌ | ✅ controls | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only |
| 12 | **Compliance** | STRUCTURAL_PLACEHOLDER | ✅ assurance page | ❌ | ❌ | ❌ | ✅ obligations, assessments | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only; no assessment recording API |
| 13 | **Legal & Liability** | STRUCTURAL_PLACEHOLDER | ✅ assurance page | ❌ | ❌ | ❌ | ✅ legal_matters | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only |
| 14 | **Capital Management** | STRUCTURAL_PLACEHOLDER | ✅ capital page | ❌ | ❌ | ❌ | ✅ capital_requests | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only; no capital request submission API |
| 15 | **Treasury** | STRUCTURAL_PLACEHOLDER | ✅ capital page | ❌ | ❌ | ❌ | ✅ treasury_positions | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only |
| 16 | **Waterfall Engine** | PARTIALLY_IMPLEMENTED | ✅ page + workbench | ✅ simulate API | ✅ waterfall.ts | ✅ deterministic calc | ✅ configs, tiers, runs, lines | ❌ simulate only | ✅ | ✅ | ✅ | ✅ engine 5 tests | **No commit API. Simulations not persisted to DB.** |
| 17 | **Finance / Ledger** | STRUCTURAL_PLACEHOLDER | ❌ | ❌ | ❌ | ❌ | ✅ periods, accounts, journal_entries, lines | ❌ DEAD | — | — | — | ❌ | **Schema only. Zero readers, zero writers. No CoA, no posting, no periods.** |
| 18 | **Tax Strategy** | PARTIALLY_IMPLEMENTED | ✅ page + workbench | ✅ assess API | ✅ tax.ts | ✅ eligibility engine | ✅ tax_strategies, assessments | ❌ assess not saved | ✅ | GLOBAL(ref) | ✅ | ✅ engine 5 tests | Assessments computed but **never persisted** |
| 19 | **HCM** | STRUCTURAL_PLACEHOLDER | ✅ page | ❌ | ❌ | ❌ | ✅ positions, employees, events, requests | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only; no hire/transfer/terminate API; workforceRequests DEAD |
| 20 | **Family Office** | STRUCTURAL_PLACEHOLDER | ✅ page | ❌ | ❌ | ❌ | ✅ family_members, beneficiaries, vault_items | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only; no lineage management, no beneficiary engine API |
| 21 | **Foundation** | STRUCTURAL_PLACEHOLDER | ✅ page | ❌ | ❌ | ❌ | ✅ foundation_programs | ❌ seed-only | ✅ | ⚠️ PARTIAL | ❌ | ❌ | Hardcoded tenant code lookup; no programme CRUD |
| 22 | **Documents** | STRUCTURAL_PLACEHOLDER | ✅ page | ❌ | ❌ | ❌ | ✅ documents, retention_policies | ❌ seed-only | ✅ | ⚠️ PARTIAL | ❌ | ❌ | Display only; no upload/register/supersede API; no actual file storage |
| 23 | **Knowledge** | STRUCTURAL_PLACEHOLDER | ✅ noelia/docs pages | ❌ | — | ✅ RAG search | ✅ knowledge_sources | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Searched by Noelia; no CRUD; regex scan, no embeddings |
| 24 | **Workflow** | STRUCTURAL_PLACEHOLDER | ✅ constitution page | ❌ | ❌ | ❌ | ✅ workflows, instances, tasks | ❌ seed-only | ✅ | — | ❌ | ❌ | Schema + display only; no execution engine; workflowInstances DEAD |
| 25 | **Notifications** | STRUCTURAL_PLACEHOLDER | ✅ layout alert bar | ❌ | ❌ | ❌ | ✅ notifications | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only; no send/mark-read API |
| 26 | **Audit** | IMPLEMENTED | ✅ page | ✅ self-test | ✅ audit.ts | ✅ chain append/verify | ✅ audit_log, events, chain_heads | ✅ serialized | ✅ | ✅ | ✅ (self) | ✅ 8 tests | Production-grade; immutability triggers |
| 27 | **Noelia AI** | PARTIALLY_IMPLEMENTED | ✅ console | ✅ query API | ✅ noelia.ts | ✅ routing, RAG, policy | ✅ ai_decisions | ✅ atomic | ✅ | ✅ | ✅ atomic | ❌ | Real analysis engine with data access; no external LLM; no tool calling |
| 28 | **OS/SoT Registry** | IMPLEMENTED | ✅ registry page | ❌ | — | — | ✅ os_registry, source_of_truth | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Read-only reference; no register/retire API |
| 29 | **Integrations** | STRUCTURAL_PLACEHOLDER | ✅ registry page | ❌ | ❌ | ❌ | ✅ integrations | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Reference data display only; no actual integration execution |
| 30 | **Data Governance** | STRUCTURAL_PLACEHOLDER | ✅ registry page | ❌ | ❌ | ❌ | ✅ data_assets, metric_definitions | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Metadata display only |
| 31 | **Emergency Access** | PARTIALLY_IMPLEMENTED | ❌ | ❌ | ✅ authz.ts reads | — | ✅ emergency_access_grants | ❌ | ✅ revokedAt | ✅ | ❌ | ❌ | Schema + authz enforcement, no grant/revoke API |
| 32 | **Delegation** | UNWIRED | ❌ | ❌ | ❌ | ❌ | ✅ delegations | ❌ DEAD | — | — | — | ❌ | Schema exists, zero references |
| 33 | **Consent** | UNWIRED | ❌ | ❌ | ❌ | ❌ | ✅ consents | ❌ DEAD | — | — | — | ❌ | Schema exists, zero references |
| 34 | **Feature Flags** | UNWIRED | ❌ | ❌ | ❌ | ❌ | ✅ feature_flags | ❌ DEAD | — | — | — | ❌ | Schema + seed data, zero runtime references |
| 35 | **Regulatory Changes** | STRUCTURAL_PLACEHOLDER | ✅ documents page | ❌ | ❌ | ❌ | ✅ regulatory_changes | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Display only |
| 36 | **Anomaly Detection** | STRUCTURAL_PLACEHOLDER | ✅ assurance page | ❌ | ❌ | ❌ | ✅ anomaly_signals | ❌ seed-only | ✅ | ✅ | ❌ | ❌ | Display only; no detection engine |
| 37 | **BCP/DR** | STRUCTURAL_PLACEHOLDER | ✅ assurance page | ❌ | ❌ | ❌ | ✅ continuity_plans | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Display only |
| 38 | **Country Management** | STRUCTURAL_PLACEHOLDER | ✅ org page | ❌ | ❌ | ❌ | ✅ countries, jurisdictions | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | Reference display only |
| 39 | **Sector Registry** | IMPLEMENTED | ✅ registry page | ❌ | — | — | ✅ os_registry | ❌ seed-only | ✅ | GLOBAL | ❌ | ❌ | As designed (registration, not execution) |

---

## 4. UI → API → Service → Domain → DB Connectivity

### Fully wired chains (mutation path complete):

| Chain | UI | API | Service | Domain | DB Write | Audit |
|-------|-----|-----|---------|--------|----------|-------|
| Login | ✅ sign-in | ✅ POST /auth/login | — | ✅ mfa.ts, crypto.ts | ✅ sessions, users | ✅ atomic |
| Logout | ✅ button | ✅ POST /auth/logout | — | — | ✅ sessions.revokedAt | ✅ |
| Noelia query | ✅ console | ✅ POST /ai/noelia | ✅ noelia.ts | ✅ routing, RAG, policy | ✅ ai_decisions | ✅ atomic |
| Waterfall simulate | ✅ workbench | ✅ POST /waterfall/simulate | — | ✅ waterfall.ts | ❌ NOT SAVED | ✅ standalone |
| Tax assess | ✅ workbench | ✅ POST /tax/assess | — | ✅ tax.ts | ❌ NOT SAVED | ✅ standalone |

### Chains that stop at display (no API, no write):

Organization, Ownership, Governance, Strategy, Risk, Controls, Compliance, Legal, Capital, Treasury, HCM, Family Office, Foundation, Documents, Knowledge, Workflow, Notifications, Integrations, Registry, Constitution, Regulatory Changes, Anomaly, BCP, Data Governance, Metrics — **ALL READ-ONLY DISPLAY OF SEED DATA.**

### Capabilities with UI but no API:

All 15 OS pages except dashboard (which aggregates). Zero pages have create/update/delete capabilities.

### APIs with no UI consumer:

Self-test (`GET /system/self-test`) — invoked by the audit page's client-side `SelfTestPanel` component. ✅ consumed.

---

## 5. Security Coverage Matrix

| Control | Status | Evidence |
|---------|--------|----------|
| Authentication (password) | ✅ scrypt, lockout, timing equalization | Verified |
| MFA (TOTP) | ✅ encrypted secrets, replay prevention, lockout | 5 tests, live probes |
| Session security | ✅ HttpOnly, SameSite, expiry, revocation | Verified |
| RBAC | ✅ role grants, 48 permissions | 8 engine tests |
| ABAC | ✅ classification ceilings, entity scope, step-up | Verified |
| Tenant isolation (app) | ✅ `tenantScopeIds()` on all data pages | 3 tests, live probes |
| Tenant isolation (DB) | ✅ RLS on 11 tables | DB verified |
| Audit integrity | ✅ serialized, hash-chained, immutable triggers | 8 tests, live self-test |
| Security headers | ✅ CSP, XFO, XCTO, RP, PP | curl verified |
| Secret management | ✅ env-only, no literals, .env.example | grep scan clean |
| Rate limiting | ⚠️ in-process Map | Functional but not durable |
| Credential rotation | ⚠️ passwordMustChange set, no enforcement endpoint | Flag only |

### Tenant scope gaps:

| Page | Issue | Risk |
|------|-------|------|
| `constitution` | Reads constitutionArticles, policies, workflows globally | LOW — these are enterprise-wide governance reference data |
| `documents` | documents tenant-scoped; knowledgeSources, retentionPolicies, regulatoryChanges global | LOW — reference/governance data |
| `foundation` | Hardcoded `tenants.code='BEYU-FOUNDATION'` and `legalEntities.code='BEYU-FDN'` bypass scope | MEDIUM — works but not enforced by principal |
| `tax` | `legalEntities` fetched without scope (passed to workbench dropdown) | MEDIUM — sector operator could see entity names outside their scope |
| `noelia` | knowledgeSources, osRegistry queried globally | LOW — enterprise reference data |
| `registry` | All 6 queries global | LOW — enterprise governance metadata |

---

## 6. Governance Coverage

| Capability | Status |
|------------|--------|
| Constitutional articles | ✅ Defined, displayed, referenced by policies |
| Policy hierarchy | ✅ 8-level with machine-readable rules, evaluated at runtime |
| Policy enforcement | ✅ in waterfall, tax, Noelia, capital page |
| Governance bodies | ✅ Schema + seed, displayed with members and reserved matters |
| Resolution lifecycle | ❌ **NO LIFECYCLE EXECUTION** — no propose, vote, approve, reject API |
| Approval chains | ❌ Schema exists, **never created at runtime** |
| Workflow execution | ❌ Schema exists, **workflowInstances never created** |
| Quorum calculation | ❌ Seeded literal values only, never computed |
| Voting | ❌ resolutionVotes schema exists, **zero references outside schema/seed** |
| Delegation | ❌ DEAD — schema, zero app references |
| Segregation of duties | ⚠️ `separationGroup` column exists, never enforced |

---

## 7. Audit Coverage

| Audited action | Mechanism |
|----------------|-----------|
| Login success | ✅ atomic (within login transaction) |
| Login failure | ✅ standalone recordAudit |
| MFA failure | ✅ standalone recordAudit |
| Noelia query | ✅ atomic (ai_decisions + audit + event in one tx) |
| Waterfall simulate | ✅ standalone recordAudit + publishEvent |
| Tax assess | ✅ standalone recordAudit + publishEvent |
| Logout | ✅ standalone recordAudit |
| **All other domain operations** | ❌ **NONE — no mutating domain operations exist** |

---

## 8. AI / Noelia / HIVE Status

| Aspect | Status | Detail |
|--------|--------|--------|
| Single identity | ✅ | Noelia is the only AI agent; HIVE is the runtime label |
| Permission-inheriting | ✅ | `can(principal, ENGINE_PERMISSION[engine])` checked per engine |
| Policy-gated | ✅ | `evaluatePolicy()` with `aiInitiated: true` denies ownership/beneficiary/ledger changes |
| Tenant-aware | ✅ | All domain queries use `principal.tenantId` |
| Auditable | ✅ | Every query → `ai_decisions` record + audit + event (atomic transaction) |
| Source-citing | ✅ | Retrieved knowledge sources returned with authority status |
| Output classification | ✅ | FACT/INFERENCE/RECOMMENDATION/PREDICTION/UNCERTAINTY/REQUIRES_HUMAN_REVIEW |
| Confidence-scored | ✅ | Numeric confidence, capped when sources absent |
| Human review flagged | ✅ | `humanReviewRequired` set by policy and engine |
| **External LLM connection** | ❌ | Deterministic analyst — no actual LLM/API call |
| **Tool execution** | ❌ | Tools are labels (`toolsUsed.push("finance.treasury.aggregate")`), not actual tool calls |
| **RAG quality** | ⚠️ | Unindexed regex `~` scan; no embeddings, no ranking |
| **Human review workflow** | ❌ | Flag set but no review/dispose endpoint exists |

**Noelia is a genuine governed analysis engine, not a mock**, but it performs deterministic SQL aggregation and labelling rather than LLM-driven reasoning.

---

## 9. Domain Ownership Recommendations (DO NOT MOVE YET)

| Engine/Module | Current Location | Recommended Owner | Notes |
|---------------|-----------------|-------------------|-------|
| `audit.ts` | src/lib/ | BEYU OS Kernel | ✅ correct |
| `authz.ts` | src/lib/ | BEYU OS Kernel | ✅ correct |
| `policy.ts` | src/lib/ | BEYU OS Kernel (Governance) | ✅ correct |
| `session.ts`, `mfa.ts`, `crypto.ts` | src/lib/ | BEYU OS Kernel (Identity) | ✅ correct |
| `tenant-scope.ts` | src/lib/ | BEYU OS Kernel | ✅ correct |
| `waterfall.ts` | src/lib/ | Finance OS domain | ✅ correct — Finance OS is a BEYU OS domain |
| `tax.ts` | src/lib/ | Finance OS domain (Tax Intelligence) | ✅ correct — Tax inside Finance |
| `noelia.ts` | src/lib/ | AI/HIVE Intelligence Layer | ✅ correct |
| `api.ts`, `guard.ts` | src/lib/ | BEYU OS Kernel (Platform) | ✅ correct |
| `ids.ts`, `constants.ts` | src/lib/ | BEYU OS Kernel (Platform) | ✅ correct |

All current placements are architecturally correct per canonical BEYU OS.

---

## 10. Orphaned Components

| Component | Type | Issue |
|-----------|------|-------|
| `filterByClearance()` | Export in authz.ts | Defined, never called anywhere |
| `auditTrailFor()` | Export in audit.ts | Defined, never called |
| `assertSameTenant()` | Export in tenant-scope.ts | Defined, never called |
| `tenantPredicate()` | Export in tenant-scope.ts | Defined, never called |
| `createSession()` | Export in session.ts | Defined, **imported by no file** (login builds session inline) |

---

## 11. Duplicated Components

| Component | Issue |
|-----------|-------|
| `createSession()` in session.ts | Login handler builds the session directly instead of calling this; duplicate session-creation logic |
| Permission authority | `ROLES` TS constant is runtime authority; `role_permissions` DB table is seeded but never read — two sources exist, only one is live (H-01) |

---

## 12. Broken Components

None found — all TypeScript compiles, all tests pass, all pages render.

---

## 13. Unwired Components (schema exists, zero app references)

| Table | Status |
|-------|--------|
| `role_permissions` | DEAD — seeded, never read by authz |
| `delegations` | DEAD — seeded never, zero references |
| `consents` | DEAD — zero references |
| `org_units` | DEAD — zero references |
| `entity_appointments` | DEAD — zero references |
| `resolution_votes` | DEAD — zero references |
| `workflow_instances` | DEAD — zero references |
| `workforce_requests` | DEAD — zero references |
| `financial_periods` | DEAD — zero references |
| `ledger_accounts` | DEAD — zero references |
| `journal_entries` | DEAD — zero references |
| `journal_lines` | DEAD — zero references |
| `tax_strategy_assessments` | DEAD — zero references |
| `feature_flags` | DEAD — seeded, zero runtime references |
| `audit_chain_heads` | DEAD in app code — but used via raw SQL in audit.ts |

**15 tables with zero application-code references** (excludes schema definitions and seed).

---

## 14. Missing Components (no schema, no service, no API)

| Canonical Capability | Status |
|---------------------|--------|
| User registration / enrollment API | MISSING |
| Password change / rotation API | MISSING |
| MFA enrollment API (self-service) | MISSING |
| Role grant/revoke API | MISSING |
| Resolution propose/vote/approve API | MISSING |
| Approval request/decide API | MISSING |
| Workflow start/advance/complete API | MISSING |
| Journal posting API | MISSING |
| Period close API | MISSING |
| Capital request submit API | MISSING |
| Waterfall commit API | MISSING |
| Tax assessment save API | MISSING |
| Employee create/update API | MISSING |
| Family member manage API | MISSING |
| Beneficiary eligibility API | MISSING |
| Document upload/register API | MISSING |
| Notification send/read API | MISSING |
| Risk create/assess API | MISSING |
| Compliance assessment record API | MISSING |
| Emergency access grant/revoke API | MISSING |
| AI decision review/dispose API | MISSING |
| Integration execution | MISSING |
| Feature flag evaluation | MISSING |

---

## 15. False-Completeness Risks

| Risk | Severity | Detail |
|------|----------|--------|
| **15 pages display seed data as if it were operational** | HIGH | Every OS page reads and renders seed data. There is no create/update/delete capability for any domain object. A user could mistake seed data for a functioning system. |
| **Waterfall "runs" are seed artefacts** | MEDIUM | The committed waterfall run was created by the seed script, not by the simulate→commit lifecycle. |
| **Tax "assessments" are not saved** | MEDIUM | The assess API computes eligibility but never writes to `tax_strategy_assessments`. |
| **Governance resolutions have no lifecycle** | HIGH | Resolutions appear with status APPROVED/TABLED/DRAFT but were seeded in those states; no API transitions them. |
| **HCM employee records are seed-only** | MEDIUM | The "one employee master" appears complete but cannot be created, modified, or terminated through the application. |

---

## 16–19. Defect Classification

### CRITICAL (0)

None. All prior critical findings (C-01–C-06) are remediated and verified.

### HIGH (5)

| ID | Finding | Impact |
|----|---------|--------|
| **H-01** | Permission dual source of truth (TS constants vs DB `role_permissions`) | Authorization decisions are explainable but not DB-backed; migration risk |
| **H-NEW-1** | **Tax page exposes all `legalEntities` to any authenticated user** regardless of tenant scope | Sector operator sees entity names outside their scope |
| **H-NEW-2** | **Foundation page bypasses tenant scope** via hardcoded `tenants.code='BEYU-FOUNDATION'` | Any authenticated user sees foundation data regardless of role/scope |
| **H-NEW-3** | **No domain write API exists for any business object** | The system cannot operate — it can only display seed data |
| **H-NEW-4** | **Waterfall simulations and tax assessments are ephemeral** — computed but never persisted | No reproducibility record; checksum is returned but not stored |

### MEDIUM (8)

| ID | Finding |
|----|---------|
| M-01 | 15 DB tables with zero application references (wasted schema surface) |
| M-02 | 5 orphaned function exports never called |
| M-03 | `createSession()` in session.ts is dead code (login builds session inline) |
| M-04 | No user CRUD, enrollment, or password-change API |
| M-05 | No AI decision review/dispose endpoint (humanReviewRequired flag set but no workflow) |
| M-06 | Noelia RAG uses unindexed regex scan — no embeddings, no ranking |
| M-07 | In-process rate limiting (Map) — not durable across restarts or replicas |
| M-08 | No governance execution lifecycle (propose → vote → approve) |

### LOW (6)

| ID | Finding |
|----|---------|
| L-01 | `constitution`, `registry`, `noelia`, `documents` pages read global reference tables without explicit tenant scope annotation |
| L-02 | No pagination on any list query |
| L-03 | Dark mode CSS variables declared but no toggle |
| L-04 | Self-referencing FK columns (`parentEntityId`, `parentUnitId`, etc.) not declared as foreign keys to Drizzle |
| L-05 | npm audit: 16 vulnerabilities (1 critical dev-only vitest, 7 high transitive) |
| L-06 | No structured logger (console.error only) |

---

## 20. Recommended Implementation Sequence

**Do not implement all of these simultaneously. Strict priority order:**

### Phase 1 — Close remaining HIGH findings

1. **H-NEW-1/H-NEW-2**: Apply `tenantScopeIds` to tax and foundation pages (15-minute fix each)
2. **H-NEW-4**: Persist waterfall simulation runs and tax assessment results to their existing DB tables
3. **H-NEW-3**: Implement the first domain write API — **governance resolution propose** — as the pattern for all future writes (demonstrates: validation → authorization → tenant scope → policy check → domain write → audit → event, atomically)
4. **H-01**: Migrate permission authority to DB `role_permissions` at runtime

### Phase 2 — Governance execution (unblocks all other domains)

5. Resolution vote API
6. Resolution approve/reject API with quorum calculation
7. Approval request/decide API (maker/checker)
8. Workflow start/advance API

### Phase 3 — Finance OS hardening

9. Chart of accounts management
10. Journal posting API with maker/checker and debit=credit enforcement
11. Period close API
12. Waterfall commit API (requires governance resolution)
13. Tax assessment persistence

### Phase 4 — HCM and identity lifecycle

14. Employee create/onboard API
15. Employment event recording
16. User enrollment and password change
17. MFA self-service enrollment

### Phase 5 — Remaining domains

18. Risk register CRUD
19. Compliance assessment recording
20. Document upload and registration
21. Family member and beneficiary management
22. Emergency access grant/revoke
23. AI decision review/dispose

### Phase 6 — Platform hardening

24. Wire feature flags to runtime
25. Wire delegation to authorization
26. Wire consent to data access
27. Notification send/mark-read
28. Structured logging (OpenTelemetry)
29. Redis-backed rate limiting

---

**END OF AUDIT. NO CODE WAS MODIFIED. The repository is unchanged from its pre-audit state.**
