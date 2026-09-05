# BEYU OS 2.0 DATA CONTRACTS

Date: 2026-09-05
This document describes **current data contracts** in the destination and the **recommended canonical contracts** for BEYU OS 2.0. No contract has been re-wired in this session; the existing contracts remain authoritative and untouched.

---

## 1. Canonical identity contract (current destination)

`GlobalUserID` is canonical. The root schema has `global_user_party_uniqueness` (Drizzle migration `0011`) and the identity graph in `src/lib/identity.ts`.

Identity context resolved by the control plane (see `src/lib/tenant-scope.ts`, `src/lib/identity.ts`, `src/lib/authz.ts`):

| field | source |
|---|---|
| `global_user_id` | canonical party id |
| `country_id` | tenant/entity scope |
| `entity_id` | holding/sector entity scope |
| `sector_id` | sector OS scope |
| `os_id` | OS registry id |
| `tenant_id` | tenant scope |
| `facility_id` | health facility scope |
| `role` | RBAC role |
| `permissions` | RBAC + ABAC permission set |
| `classification_ceiling` | data classification ceiling |
| `purpose_of_use` | purpose-of-use for AI/records access |

Sector IDs (including Health) are projections and must map deterministically to `GlobalUserID`.

---

## 2. Governed event envelope (recommended canonical)

Current destination has internal event receipts (`drizzle 0019_internal_event_receipts.sql`), interoperability envelope (`0012_enterprise_interoperability_envelope.sql`), idempotency, and an internal events route. Source `packages/events` defines a stronger typed envelope. Recommended canonical fields:

```
event_id
event_type
event_version
aggregate_id
actor_id
global_user_id
country_id
entity_id
sector_id
os_id
tenant_id
correlation_id
causation_id
timestamp
classification
payload
integrity_hash
```

These must be aligned before downstream adoption; the current destination runtime already carries most tenant/entity/country context in its envelope.

---

## 3. Finance / accounting data contracts (protected)

Current destination (authoritative, do not weaken):

- Integer minor-unit money (no floats for monetary values).
- Double-entry: debits = credits enforced by ledger constraints (Drizzle migration `0005_ledger_integrity_invariants.sql`).
- Immutable posted entries: UPDATE/DELETE restricted (`ledger-integrity` test).
- Journal scope integrity per entity/tenant (`0006_journal_scope_integrity.sql`).
- Chart-of-account tenant uniqueness (`0022_chart_of_accounts_tenant_uniqueness.sql`).
- RLS on financial ledger (`0021_financial_ledger_rls.sql`).
- CAP_POSTING: policy evaluation → authority → approval → posting → ledger effect → audit → reconciliation → failure handling → atomicity.

Any migration must preserve exactly these invariants.

---

## 4. Health sector data contracts

Current destination Health OS (`sectors/health/backend`) is authoritative:

- 24 SQL migrations (`001`–`024`).
- Modules spanning patient, clinical, encounters, records, appointments, pharmacy, laboratory, radiology, ophthalmology, dialysis, billing, insurance, ambulance, telehealth, compliance, MTUHA, reporting, notifications, tenancy, identity, auth, audit, AI, events, incidents, FHIR, interop (HL7v2/DICOM), terminology, search, consent.
- Sector DB is isolated from control plane DB; federation uses authenticated API/events + service principals (`beyu_service_principal`, `outbox_dispatcher`).

Source Health API (`services/beyu-health-api`) uses a different schema (11 migrations + Prisma) and should NOT replace the destination schema.

---

## 5. Data isolation architecture

| Layer | Destination | Source |
|---|---|---|
| Control-plane DB | root Drizzle schema + RLS | `beyu-api` migrations + RLS |
| Health DB | `sectors/health/backend` migrations + RLS | `beyu-health-api` migrations + Prisma |
| Cross-OS DB coupling | none (API/event + service principal) | none (API/event) |
| Privileged DB access | admin role only in CI/migrations | admin role only |

---

## 6. Contract adoption plan (not yet executed)

1. Diff destination `src/lib/authz.ts` + `src/lib/identity.ts` vs source `packages/auth` / `packages/types`; produce a typed canonical contract.
2. Diff destination internal event envelope vs source `packages/events`; produce `packages/events`.
3. Diff destination Health entity model vs source `packages/health-types`; produce `packages/health-types` that references destination entities, without changing DB schema.
4. Produce `packages/finance-types` from destination `src/lib/finance/*` (source has none).
5. After all diff products are reviewed, wire the shared packages into the runtime in a parity-proven commit.

**Undertaken in this session:** none of the above re-wiring. Decisions are recorded as BLOCKED pending DB-backed regression execution.
