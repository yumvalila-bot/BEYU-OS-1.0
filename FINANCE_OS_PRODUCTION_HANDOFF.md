# BEYU OS — Finance OS Production Handoff & Operational Runbook

**Document Version:** 1.0.0  
**Date:** 2026-09-05  
**Author:** Principal BEYU OS Finance OS Engineering & Security Agent  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Branch:** `arena/01a07108-beyu-os-1-0`  

---

## 1. Handoff Audience & Objectives

This document serves as the authoritative operational runbook for transitioning **BEYU Finance OS** from **ENGINEERING COMPLETE** into live production operation.

**Key Stakeholders:**
- **Chief Financial Officer (CFO) & Audit Committee:** Governance resolutions, CoA sign-off, policy ratification.
- **DevOps & Platform Engineering:** Migration execution, database connection pooling, secrets management.
- **Lead Financial Controllers:** Period lifecycle, accounting closures, ledger monitoring.
- **Internal / External Statutory Auditors:** Cryptographic hash verification, audit logs, SAF-T compliance exports.

---

## 2. Step-by-Step Production Activation Runbook

### Phase 1: Database Migration Deployment
1. Verify database credentials and connection strings with SSL enabled:
   ```bash
   export DATABASE_URL="postgresql://beyu_app:<PASSWORD>@<PROD_PG_HOST>:5432/beyu_os?sslmode=require"
   ```
2. Run database migrations to apply all schema definitions and constraint triggers (including migration 0022):
   ```bash
   npm run db:migrate
   ```
3. Verify installed triggers and constraints:
   ```sql
   SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE 'beyu_%';
   ```
   *Expected output:* `beyu_assert_journal_balanced`, `beyu_reject_journal_mutation`, `beyu_journal_line_scope`, and `beyu_assert_journal_entry_scope` all enabled.

---

### Phase 2: Policy Parameter Loading (P1 through P11)
Upon formal execution of governance resolutions, load the ratified policy parameters into the tenant configuration store:

1. **Policy P1 (Accounting Basis):** Set `accounting_basis: 'IFRS'` and fiscal year end in tenant profile.
2. **Policy P6 (Chart of Accounts):** Seed the tenant Chart of Accounts using `seedTenantChartOfAccounts(tenantId, ratifiedHierarchy)`.
3. **Policy P7 (FX Rate Feed):** Register the production central bank API key (e.g. Bank of Tanzania rate provider) in `src/lib/finance/fx-engine.ts`.
4. **Policy P9 (Intercompany Rules):** Configure approved intercompany settlement entity pairs in `intercompany_entities`.
5. **Policies P4, P8, P10, P11:** Inject capitalization thresholds, expense limits, tax schedules, and statutory payroll withholding formulas.

---

### Phase 3: Activating `CAP_POSTING`
Once Phase 1 and Phase 2 prerequisites are satisfied and the CFO Sign-Off Resolution is signed:

1. Transition the capability flag from `LOCKED` to `ACTIVE`:
   ```sql
   UPDATE tenant_capabilities 
   SET status = 'ACTIVE', activated_at = NOW(), activated_by = '<CFO_USER_ID>'
   WHERE capability_name = 'CAP_POSTING' AND tenant_id = '<TENANT_ID>';
   ```
2. Verify live posting via API health check:
   ```bash
   curl -X POST https://api.beyuos.com/api/v1/finance/journal \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '{"description": "Genesis Opening Entry", "lines": [...]}'
   ```
3. Confirm HTTP `201 Created` response.

---

## 3. Monitoring, Invariant Checking & Alerting Runbook

### 3.1 Continuous Invariant Verification Query
Run periodically via automated cron job to verify mathematical ledger integrity across all tenants:

```sql
-- Invariant: Every posted journal entry must balance perfectly (Debits = Credits)
SELECT 
  entry_id, 
  tenant_id, 
  SUM(debit_minor_units) AS total_debit, 
  SUM(credit_minor_units) AS total_credit
FROM journal_lines
GROUP BY entry_id, tenant_id
HAVING SUM(debit_minor_units) != SUM(credit_minor_units);
```
*Expected output: Exactly 0 rows.*

### 3.2 Audit Log Immutability Verification
Execute SHA-256 block chain verification across journal entries:
```bash
npm run finance:verify-chain -- --tenant=<TENANT_ID>
```
*Expected output: `CHAIN_VALID (0 broken links, 0 mutated hashes)`.*

---

## 4. Disaster Recovery & Emergency Procedures

### 4.1 Emergency Posting Kill Switch (Fail-Closed)
In the event of an undetected policy breach or regulatory stop-order:
```sql
UPDATE tenant_capabilities 
SET status = 'LOCKED', locked_at = NOW(), locked_by = '<INCIDENT_COMMANDER>'
WHERE capability_name = 'CAP_POSTING';
```
*Result:* All future `POST /api/v1/finance/journal` calls immediately fail-closed with HTTP 423 Locked.

### 4.2 Handling Erroneous Journal Entries
Because journal entries are strictly immutable (DB triggers reject `UPDATE` and `DELETE`), correcting an error requires posting an authoritative **Reversal Entry**:
1. Post reversing journal with swapped debits and credits referencing `reverses_entry_id = '<ORIGINAL_ENTRY_ID>'`.
2. Post correct replacement entry referencing `replaces_entry_id = '<ORIGINAL_ENTRY_ID>'`.

---

## 5. Formal Production Handoff Sign-Off

This completes the engineering lifecycle of BEYU Finance OS. All systems, schemas, APIs, UIs, and engines are production-ready, frozen, and placed under formal governance handoff.
