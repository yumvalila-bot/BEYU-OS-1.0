# BEYU OS — Finance OS Production Readiness Runbook & Certification

**Document Version:** 1.0.0  
**Date:** 2026-09-05  
**Author:** Principal BEYU OS Infrastructure & Site Reliability Agent  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Branch:** `arena/01a07108-beyu-os-1-0`  
**Readiness Status:** **PRODUCTION READY — PENDING LIVE DATABASE CREDENTIALS & GOVERNANCE RATIFICATION**  

---

## Executive Summary

This document establishes the operational production deployment, database provisioning, migration execution, health monitoring, disaster recovery, and go-live governance checklist for **Finance OS**.

The application runtime is architected for zero-secret build environments (such as Vercel) and enterprise-grade PostgreSQL hosting (such as Supabase Managed PostgreSQL with connection pooling).

---

## 1. Production Topology & Component Overview

```
                      +------------------------------------------+
                      |         Vercel Serverless Edge           |
                      |        Next.js 16 (Node.js 22 LTS)       |
                      +------------------------------------------+
                                           |
                                           | Pooler Port 6543 (Transaction Mode)
                                           v
                      +------------------------------------------+
                      |       Supabase Managed PostgreSQL        |
                      |          Project: siyzygezdmlxbvwttrdz   |
                      |          Region: eu-west-3 (Paris)       |
                      +------------------------------------------+
                                           ^
                                           | Session Port 5432 (DDL / Migrations)
                      +------------------------------------------+
                      |      Governed Migration CLI (CI/CD)      |
                      |          scripts/migrate.ts              |
                      +------------------------------------------+
```

### Key Architectural Invariants
1. **Build Safety:** `src/db/index.ts` and `src/db/admin.ts` employ lazy proxy connection handles, ensuring `next build` succeeds during deployment builds where runtime secrets are absent.
2. **Runtime Loudness:** If database credentials are missing or invalid at runtime, endpoints fail loudly (HTTP 503 / `DATABASE_URL is required`), preventing silent degradation.
3. **Connection Pooling:** Uses transaction-mode Supavisor pooling on port 6543 for standard API requests and session-mode pooling on port 5432 for DDL migrations.

---

## 2. Database Role Separation & Provisioning

Finance OS enforces strict privilege separation (C-02 Remediation):

### Runtime Role (`beyu_runtime`)
- **Connection String:** `DATABASE_URL` (Port 6543)
- **Privileges:** `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEROLE`, `NOCREATEDB`.
- **Row Level Security:** Bound by all RLS policies (`FORCE ROW LEVEL SECURITY`). Owns zero tables.
- **Usage:** All runtime application HTTP request handlers.

### Migration / Admin Role (`postgres`)
- **Connection String:** `BEYU_ADMIN_DATABASE_URL` (Port 5432)
- **Privileges:** Superuser / Table Owner.
- **Usage:** Used exclusively by `scripts/migrate.ts`, `src/db/seed.ts`, and `drizzle-kit`. Never used on the application request path.

### Provisioning Procedure
To provision the runtime role against a new Supabase database:
```bash
BEYU_RUNTIME_DB_PASSWORD="<secure-generated-password>" npx tsx scripts/setup-db-role.ts
```

---

## 3. Database Migration Runbook (0000 – 0022)

Migrations execute serially within an advisory transaction lock (`pg_advisory_xact_lock(hashtext('BEYU_OS_MIGRATION'))`) and record cryptographic SHA-256 drift fingerprints in `beyu_migrations`.

### Migration Sequence:
1. `0000_kernel_v1_baseline.sql` — Baseline schema
2. `0001_kernel_gate1_hardening.sql` — RLS core helpers
3. `0002_governed_idempotency.sql` — Idempotency schema
4. `0003_governance_voting.sql` — Voting extensions
5. `0004_governance_decision.sql` — Decision framework
6. `0005_ledger_integrity_invariants.sql` — Balance trigger, immutability trigger
7. `0006_journal_scope_integrity.sql` — Scope triggers
8. `0007_policy_provenance_integrity.sql` — Policy foreign keys
9. `0008_audit_truncate_and_policy_window_integrity.sql` — TRUNCATE protections
10. `0009_governance_provenance_referential_integrity.sql` — Decision registry FKs
11. `0010_governance_decision_registry.sql` — Pre-ratification decision registry
12. `0011_global_user_party_uniqueness.sql` — GlobalUserID uniqueness
13. `0012_enterprise_interoperability_envelope.sql` — Interoperability schema
14. `0013_audit_hash_version.sql` — Audit versioning
15. `0014_noelia_governance_boundary.sql` — AI boundaries
16. `0015_noelia_intelligence_expansion.sql` — Model gateway
17. `0016_noelia_scheduler_offsets.sql` — Outbox offsets
18. `0017_approval_quorum_model_metadata.sql` — Quorum metadata
19. `0018_employees_rls_entity_scope.sql` — HCM workforce RLS
20. `0019_internal_event_receipts.sql` — Cross-OS idempotent receipts
21. `0020_service_principals.sql` — Service token revocation
22. `0021_financial_ledger_rls.sql` — Financial ledger RLS
23. `0022_chart_of_accounts_tenant_uniqueness.sql` — Tenant-scoped CoA code uniqueness

### Executing Migrations:
```bash
npm run migrate
```

---

## 4. Production Environment Variables

| Variable | Requirement | Description |
|---|---|---|
| `DATABASE_URL` | Required (Runtime) | Transaction pooler DSN for `beyu_runtime` on port 6543. |
| `BEYU_RUNTIME_DATABASE_URL` | Required (Audit Test) | Identical to `DATABASE_URL`. |
| `BEYU_ADMIN_DATABASE_URL` | Required (Migration/Seed) | Session pooler DSN for admin/superuser on port 5432. |
| `AUTH_SECRET` | Required (Min 32 chars) | Cryptographic key for session token signing and verification. |
| `MFA_ENCRYPTION_KEY` | Required (Min 32 chars) | AES-256-GCM key for encrypting user TOTP secrets. |
| `BEYU_BOOTSTRAP_PASSWORD` | Required (Bootstrap only) | Seed password (min 14 chars) for initial user setup. |
| `NODE_ENV` | Optional | Set to `production`. |
| `BEYU_ENV` | Optional | Set to `production`. |

---

## 5. Health Checks & Observability

### Endpoints:
- `GET /api/health` — Returns comprehensive system health, database connectivity status, and version metadata.
- `GET /api/health/live` — Lightweight liveness probe returning HTTP 200 `{"status": "ok"}`.

### Self-Test Automation:
- `POST /api/v1/system/self-test` — Runs in-process diagnostic checks against identity, policy, and ledger read paths without mutating data.

---

## 6. Disaster Recovery & Emergency Procedures

### Emergency Capability Lock
In the event of a suspected accounting anomaly or security incident, `CAP_POSTING` can be locked immediately without code deployment:
```sql
UPDATE governance_capability_registry
   SET activation_status = 'LOCKED'
 WHERE capability_code = 'CAP_POSTING';
```

### Emergency Identity Break-Glass
Emergency access is logged and audited through `emergency_access_grants` with mandatory `post_review_by` sign-off.

---

## 7. Production Go-Live Governance Checklist

Before activating live financial postings:

- [ ] Supabase PostgreSQL provisioned in Paris (`eu-west-3`) with SSL enabled.
- [ ] Runtime role `beyu_runtime` configured with `NOSUPERUSER` and `NOBYPASSRLS`.
- [ ] Migrations `0000` through `0022` applied cleanly via `npm run migrate`.
- [ ] Constitutional seed executed with governed `BEYU_BOOTSTRAP_PASSWORD`.
- [ ] Automated certification script passes: `npm run certify`.
- [ ] Group CFO and ARB ratify Decision **P1** (Accounting Recognition Basis).
- [ ] Group CFO ratifies Decision **P6** (Chart of Accounts Coding Standard).
- [ ] Group CFO ratifies Decision **P7** (Fiscal Calendar & Period Policy).
- [ ] Group CFO and ARB ratify Decision **P9** (Capital Drawdown Accounting).
- [ ] Governance resolutions for P1, P6, P7, P9 are recorded with `GOVERNED` audit provenance in `resolutions`.
- [ ] Capability `CAP_POSTING` transitioned to `ACTIVATED` via governed decision activation gate.
