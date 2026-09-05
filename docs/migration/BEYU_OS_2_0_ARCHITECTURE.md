# BEYU OS 2.0 ARCHITECTURE

Date: 2026-09-05
Document describes **actual current implementation** plus the **recommended target** that Phase 4–6 should establish. Nothing here is a claim of completed migration; see final certification.

---

## 1. Current physical architecture (measured)

### 1.1 Destination (`BEYU-OS-1.0`)

```
BEYU-OS-1.0/
├── src/                          # Next.js control plane (single decision)
│   ├── app/                      # UI + /api/v1 routes
│   ├── lib/                      # domain engines (identity, authz, audit, family, finance,
│   │                             #   governance, noelia, specialist, interoperability)
│   └── db/                       # Drizzle schema + seed + pool
├── drizzle/                      # root PostgreSQL migrations 0000-0022 + RLS
├── sectors/health/               # self-contained Health OS sector
│   ├── backend/                  # NestJS + TypeORM backend (24 migrations)
│   └── src/                      # Vite/React frontend
├── mobile/flutter/               # real Flutter client
├── tests/                        # root vitest suite (111 files)
├── scripts/
├── docs/
└── .github/workflows/            # real-PostgreSQL CI gates
```

Strengths: mature control plane, protected Finance/ledger, protected Family Office, deep Health OS, real Flutter client, real CI.
Gap: no shared package layer; root control plane and Health sector have duplicated auth/authorization/contract concepts; source repo already demonstrates how this could be unified.

### 1.2 Source (`BEYU-OS-`)

```
BEYU-OS-/
├── apps/           beyu-web, beyu-health-web, beyu-console, beyu-health-mobile (scaffold)
├── services/       beyu-api, beyu-health-api
├── packages/       types, config, events, auth, security, health-types, health-api-client
├── infra/          docker, kubernetes, terraform, supabase, vercel
└── docs/           claims only
```

Strengths: clean package boundaries, shared contracts, NestJS control plane.
Gap: no finance, no family office, thin Health OS tests, no mobile, no CI.

---

## 2. Recommended BEYU OS 2.0 target (not yet implemented)

The target is the **package boundary + contract layer** from the source, **applied to the destination's mature implementations**:

```
BEYU-OS-1.0/
├── apps/                      (UI; move root Next app here as beyu-app/web after parity proof)
├── services/                  (beyu-api control plane, beyu-health-api, beyu-finance-api later)
├── packages/                  (auth, security, config, events, types, health-types, finance-types, shared)
├── sectors/health/            (KEEP mature Health OS as the authoritative Health sector)
├── infra/
├── docs/
├── tests/
└── scripts/
```

Constraints (apply always):
- **No destructive move.** A file moves only after its dependency graph, its test suite, and its DB-backed behavior are proven.
- **Control plane boundary.** Control plane owns identity/org/governance/policy/capital/risk/compliance/audit/federation/AI governance; sector OS owns patient/clinical/pharmacy/lab/radiology/ophthalmology/billing/insurance/ambulance/telemedicine.
- **One canonical GlobalUserID.** Sector identities are projections referencing `GlobalUserID`.
- **Backend authorization authoritative.** UI never grants authority.
- **No direct frontend-to-DB coupling**; no privileged DB access from web/mobile.

---

## 3. Control-plane vs sector boundary (recommended contract)

```
BEYU FAMILY TRUST
      ↓
BEYU HOLDINGS LTD
      ↓
COUNTRY HOLDING COMPANIES
      ↓
SECTOR OPERATING COMPANIES
      ↓
SECTOR OS (Health / Finance / Agriculture)
```

BEYU OS (control plane) exposes:
- AuthN/AuthZ contract (GlobalUserID + context + permissions + classification + purpose)
- Organization/ownership/governance/policy contract
- Capital allocation/risk/compliance/audit contract
- OS registry + federation contract
- AI governance contract

Sector OS exposes:
- domain-specific REST/events
- local projections that deterministically map to GlobalUserID

Communication is via authenticated API + governed events, never uncontrolled direct DB coupling.

---

## 4. Recommended shared contracts (Phase 5–7)

1. `packages/types` — global IDs, org, OS registry, waterfall (from source, adapted to destination types).
2. `packages/auth` — RBAC/ABAC policy engine + GlobalUserID context (source already has this; destination has equivalent logic in `src/lib/authz.ts` — a merge contract is required).
3. `packages/security` — token/crypto/audit-chain primitives (source).
4. `packages/events` — governed event envelope (source event envelope aligns with destination internal events/receipts).
5. `packages/health-types` — Health domain types (source, but must be reconciled with destination Health entities before adoption).
6. `packages/health-api-client` — typed Health API client.
7. `packages/finance-types` — to be created from destination `src/lib/finance/*` (does not exist in source).

---

## 5. What is NOT yet migrated

| Phase | Status |
|---|---|
| Phase 0 reality audit | DONE (evidence in this folder) |
| Phase 1 1.0 baseline | DONE for non-DB; DB-backed BLOCKED |
| Phase 2 new baseline | DONE |
| Phase 3 capability matrix | DONE |
| Phase 4 target architecture | DOCUMENTED only; **BLOCKED** on DB-backed parity proof |
| Phase 5–7 contracts/packages | **BLOCKED** — would touch mature security/finance/audit code without DB verification |
| Phase 8 Health migration | not needed; **KEEP_1_0** mature Health |
| Phase 9 unified app | **BLOCKED** (would require moving root app under `apps/`) |
| Phase 10 Flutter | **BLOCKED** (no Flutter SDK) |
| Phase 11–13 finance/governance/family | **KEEP_1_0**, no change made |
| Phase 14 Noelia/HIVE | **KEEP_1_0**; real provider BLOCKED |
| Phase 15 infra/deployment | **BLOCKED** (no secrets/real deployment) |
| Phase 16–19 regression/adversarial/prod/certification | **BLOCKED** for DB-backed and mobile/prod gates |

---

## 6. Decision record

- The migration is **NOT completed**.
- The repository should not be physically restructured until the root and Health DB-backed suites can run in a PostgreSQL-provisioned CI/sandbox and the move is proven parity-safe.
- Any change to finance/ledger/CAP_POSTING/RLS/audit is a hard STOP condition.
