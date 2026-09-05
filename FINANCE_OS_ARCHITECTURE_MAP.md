# BEYU OS — Finance OS Architecture Map

**Document Version:** 1.0.0  
**Date:** 2026-09-05  
**Author:** Principal BEYU OS Finance OS Engineering & Architecture Agent  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Branch:** `arena/01a07108-beyu-os-1-0`  

---

## 1. Architectural Role & Boundary

Finance OS is the authoritative **Financial Sector OS** within BEYU OS. It is responsible for all financial consequences across the enterprise: general ledger, chart of accounts, double-entry bookkeeping, treasury, capital management, waterfall distribution, tax intelligence, and statutory reporting.

```
                              +------------------------------------------+
                              |                 BEYU OS                  |
                              |         Enterprise Control Plane         |
                              +------------------------------------------+
                                                   |
                   +-------------------------------+-------------------------------+
                   |                               |                               |
                   v                               v                               v
      +-------------------------+     +-------------------------+     +-------------------------+
      |       Finance OS        |     |        Health OS        |     |     Future Sector OS    |
      |   Financial Substrate   |     |    Clinical Substrate   |     |  (Agriculture, etc.)    |
      +-------------------------+     +-------------------------+     +-------------------------+
```

### Canonical Multi-Dimensional Boundary Hierarchy

$$\text{BEYU OS} \longrightarrow \text{Finance OS} \longrightarrow \text{Country} \longrightarrow \text{Entity} \longrightarrow \text{Tenant} \longrightarrow \text{Authorized Principal}$$

1. **BEYU OS (Control Plane):** The constitutional root authority (Constitution Articles 1–12, GlobalUserID, central policy engine).
2. **Finance OS (Sector OS):** Authoritative domain for financial truth, double-entry accounting, and capital rules.
3. **Country (`countries.code`):** Sovereign jurisdiction (e.g., `TZ`, `KE`, `AE`, `GB`, `MU`) defining statutory frameworks and currency defaults.
4. **Legal Entity (`legal_entities.id`):** Corporate entity with functional currency, IFRS accounting standard, and ownership linkage.
5. **Tenant (`tenants.id`):** Data isolation boundary enforcing PostgreSQL Row Level Security (`FORCE ROW LEVEL SECURITY`).
6. **Authorized Principal (`users.id` / `Principal`):** Authenticated GlobalUserID bearing cryptographic session, clearance ceiling, and role permissions.

---

## 2. Unidirectional Layer Flow

Finance OS enforces a strict, non-bypassable unidirectional execution architecture:

```
+-----------------------------------------------------------------------------------------------+
| 1. INTELLIGENCE LAYER                                                                         |
|    - Noelia AI Analyst / HIVE Runtime                                                         |
|    - Specialist Engines (Treasury, Tax Intelligence, FP&A, Risk, Audit Intel)                 |
|    - Read-only queries, simulation, anomaly detection, draft preparation                      |
|    - CANNOT: mutate ledger, approve governance, grant authority, bypass RLS                  |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
| 2. GOVERNANCE & POLICY LAYER                                                                  |
|    - Constitution Articles & Policy Hierarchy (`policies`, `constitution_articles`)          |
|    - Governance Bodies, Resolutions & Member Voting (`governance_bodies`, `resolutions`)      |
|    - Decision Authority Registry (`governance_decision_registry`) — P1..P11                   |
|    - Capability Registry (`governance_capability_registry`) — CAP_POSTING, CAP_WATERFALL_COMMIT|
|    - Maker/Checker Segregation of Duties (`approvals`)                                        |
+-----------------------------------------------------------------------------------------------+
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
| 3. EXECUTION & MUTATION LAYER                                                                 |
|    - Posting Engine (`src/lib/finance/posting-engine.ts`)                                     |
|    - Immutable Double-Entry Ledger (`journal_entries`, `journal_lines`)                       |
|    - Deferred Balance Constraint Triggers (`beyu_journal_balanced`)                           |
|    - Immutability Protection Triggers (`beyu_journal_entry_immutable`)                        |
|    - Cryptographic SHA-256 Audit Log (`audit_log`, `audit_chain_heads`)                       |
|    - CloudEvents Interoperability Stream (`enterprise_events`)                                |
+-----------------------------------------------------------------------------------------------+
```

---

## 3. Epistemic Classification Framework

To eliminate the laundering of projections or assumptions into accounting truth, Finance OS classifies every financial datum into one of 13 epistemic classes:

```
[ POSTED ]  <--- Immutable, double-entry ledger truth committed through postJournal()
    |
[ OBSERVED ] <--- Measured external facts (bank statement balance, verified contract)
    |
[ DERIVED ]  <--- Deterministic calculations from POSTED/OBSERVED inputs (Trial Balance)
    |
[ FORECAST ] <--- Model projections (Never accounting truth; cannot overwrite actuals)
    |
[ SCENARIO ] <--- What-if simulations (Waterfall scenario runs)
    |
[ ASSUMPTION ] <--- Parameterized assumptions (Expected IRR, growth rate)
    |
[ REFERENCE_DATA ] <--- Seed or configuration data (CoA definitions, country codes)
    |
[ REQUIRES_AUTHORITY ] <--- Structure defined, but content blocked on human governance (P1-P11)
    |
[ DATA_NOT_AVAILABLE ] <--- Honest absence of data (Empty ledger balance = null, never 0.00)
    |
[ DATA_CONFLICT ] <--- Conflicting data detected across sources (Mismatched attribution)
    |
[ SYNTHETIC ] <--- Test/mock data (STRICTLY PROHIBITED in production financial runs)
```

### Inviolable Epistemic Rules
1. **No Downward Laundering:** A `FORECAST`, `SCENARIO`, or `ASSUMPTION` can NEVER be promoted to `POSTED` or `OBSERVED`.
2. **Zero Fabrication:** An empty ledger is `DATA_NOT_AVAILABLE`; totals are `null`, never `0.00`.
3. **Synthetic Firewall:** `assertNotSynthetic()` immediately throws if synthetic data is introduced into production calculations.

---

## 4. Database Schema & Data Models

### Financial Ledger Schema (`src/db/schema/finance.ts`)

```
+--------------------------------------------------------------------------------+
| ledger_accounts                                                                |
| ------------------------------------------------------------------------------ |
| id (PK)                 : text                                                 |
| tenant_id (FK)          : text -> tenants.id                                   |
| code                    : text                                                 |
| name                    : text                                                 |
| account_type            : text (ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE)|
| ifrs_category           : text                                                 |
| parent_account_id       : text                                                 |
| active                  : boolean                                              |
| UNIQUE INDEX            : (tenant_id, code) [Migration 0022]                   |
| RLS POLICY              : tenant_id = ANY(beyu_tenant_ids()) [Migration 0021]  |
+--------------------------------------------------------------------------------+
                                       |
                                       | 1:N
                                       v
+--------------------------------------------------------------------------------+
| journal_lines                                                                  |
| ------------------------------------------------------------------------------ |
| id (PK)                 : text                                                 |
| entry_id (FK)           : text -> journal_entries.id                           |
| account_id (FK)         : text -> ledger_accounts.id                           |
| debit                   : numeric(18,2)                                        |
| credit                  : numeric(18,2)                                        |
| memo                    : text                                                 |
| cost_centre             : text                                                 |
| CHECK CONSTRAINT        : (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)|
| CONSTRAINT TRIGGER      : beyu_journal_balanced (deferred commit check)        |
| TRIGGER                 : beyu_journal_line_immutable (rejects UPDATE/DELETE)  |
| TRIGGER                 : beyu_journal_line_scope (entry.tenant == account.tenant)|
+--------------------------------------------------------------------------------+
                                       ^
                                       | N:1
+--------------------------------------------------------------------------------+
| journal_entries                                                                |
| ------------------------------------------------------------------------------ |
| id (PK)                 : text                                                 |
| tenant_id (FK)          : text -> tenants.id                                   |
| legal_entity_id (FK)    : text -> legal_entities.id                            |
| period_id (FK)          : text -> financial_periods.id (nullable)              |
| reference               : text (UNIQUE)                                        |
| description             : text                                                 |
| currency                : text (ISO 3-letter)                                  |
| fx_rate                 : numeric(18,8)                                        |
| posted_by               : text                                                 |
| approved_by             : text                                                 |
| posted_at               : timestamptz                                          |
| reversal_of_id          : text                                                 |
| idempotency_key         : text                                                 |
| source                  : text                                                 |
| TRIGGER                 : beyu_journal_entry_immutable (rejects UPDATE/DELETE) |
| TRIGGER                 : beyu_assert_journal_entry_scope (entity == period.entity)|
| RLS POLICY              : tenant_id AND legal_entity_id within canonical scope |
+--------------------------------------------------------------------------------+
                                       |
                                       | N:1
                                       v
+--------------------------------------------------------------------------------+
| financial_periods                                                              |
| ------------------------------------------------------------------------------ |
| id (PK)                 : text                                                 |
| legal_entity_id (FK)    : text -> legal_entities.id                            |
| code                    : text                                                 |
| starts_on               : date                                                 |
| ends_on                 : date                                                 |
| status                  : text (OPEN | IN_PROGRESS | SOFT_CLOSE | CLOSED | FINAL)|
| closed_by               : text                                                 |
| closed_at               : timestamptz                                          |
| CHECK CONSTRAINT        : ends_on >= starts_on                                 |
| EXCLUDE CONSTRAINT      : GIST non-overlapping daterange per legal_entity_id    |
| UNIQUE INDEX            : (legal_entity_id, code)                              |
| RLS POLICY              : scoped through legal_entities tenant scope           |
+--------------------------------------------------------------------------------+
```

---

## 5. API Topology

All Finance OS endpoints reside under `/api/v1/finance/` and enforce:
1. `guarded()` wrapper resolving token, session, clearance, and role permissions.
2. `withTenantDatabaseContext()` establishing connection-local PostgreSQL session GUCs.
3. `withIdempotency()` protecting all mutating operations against replays and network retries.
4. Transactional audit logging (`recordAuditTx`) and CloudEvents publishing (`publishEventTx`).

```
/api/v1/finance/
├── accounts          [GET]   List Chart of Accounts (tenant-scoped)
├── journal           [GET]   List posted journal entries with line details
│                     [POST]  Post double-entry journal (FAIL-CLOSED on CAP_POSTING)
├── periods           [GET]   List periods & verify open/closed posting dates
├── reconciliation    [GET]   Reconcile treasury to ledger & scan data quality
├── reports           [GET]   Generate Trial Balance, BS, P&L, Cash Flow skeletons
├── capital/
│   └── [id]/governance-authorization [POST] Transition capital request with resolution
├── waterfall/
│   └── simulate      [POST]  Deterministic waterfall cashflow distribution simulation
└── tax/
    └── assess        [POST]  Jurisdiction-gated statutory tax strategy assessment
```

---

## 6. Frontend & Mobile Topologies

### Web Application Architecture (`src/app/os/`)
- Built on Next.js 16 with React 19 Server Components.
- Dynamic server-rendered pages (`force-dynamic`).
- UI state reflects strictly server-resolved truth; never computes entitlements or balances on client.
- **Finance OS Routes:**
  - `/os/finance`: Central GL, CoA, Period, and Reconciliation Console.
  - `/os/capital`: Capital Requests, Liquidity & Governance Approval Workbench.
  - `/os/waterfall`: Tiered Cashflow Waterfall Simulation & Configuration.
  - `/os/tax`: Tax Strategy Intelligence & Assessment Engine.

### Mobile Architecture (`mobile/flutter/lib/`)
- Built on Flutter 3.2+ with Provider state management and Dio HTTP client.
- Zero client-side financial mutations; all actions dispatch to authenticated server endpoints.
- Secure storage for authentication tokens via `FlutterSecureStorage`.
- **Finance OS Mobile Screen (`FinanceOSScreen`):** Displays financial context, CAP_POSTING lock status, capital commitments, treasury positions, waterfall summaries, and data isolation notices.
