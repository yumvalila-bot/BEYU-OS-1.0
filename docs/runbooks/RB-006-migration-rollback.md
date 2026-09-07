# RB-006: Migration Rollback

**Severity:** P1  
**Trigger:** Migration causes application failure or data corruption  
**Last Tested:** NOT_TESTED  
**Owner:** DBA + Release Manager

---

## 1. Overview

BEYU OS migrations are designed to be forward-only where possible. Some migrations are intentionally irreversible for safety (e.g., F-01 governance hardening). Rollback should be a last resort.

---

## 2. Pre-Rollback Assessment

### 2.1 Can the issue be fixed forward?
- Can a new migration fix the problem?
- Is the issue in the application code, not the schema?
- Can the application be rolled back instead?

### 2.2 Is rollback safe?
- Does the migration have a down migration?
- Will rollback cause data loss?
- Will rollback break foreign keys?
- Is the migration intentionally irreversible?

---

## 3. Rollback Procedure

### 3.1 Application Rollback (preferred)
```bash
# Revert to previous Vercel deployment
# [EXTERNAL_BLOCKED: Requires Vercel CLI]
# vercel rollback <deployment-url>

# This keeps the database schema but reverts application code
```

### 3.2 Database Rollback (if necessary)
```sql
-- Identify the migration to rollback
-- SELECT * FROM beyu_migrations ORDER BY applied_at DESC LIMIT 5;

-- Execute the down migration SQL manually
-- [Specific SQL depends on the migration]

-- Remove the migration record
-- DELETE FROM beyu_migrations WHERE id = '{migration_id}';

-- Verify schema state
-- npx tsx scripts/db-release.ts drift
```

### 3.3 Point-in-Time Recovery (last resort)
```bash
# Restore from backup taken before migration
# [EXTERNAL_BLOCKED: Requires Supabase PITR]

# This causes data loss for all changes since backup
# Requires CFO/CTO authorization
```

---

## 4. Intentionally Irreversible Migrations

The following migrations must NEVER be rolled back:

| Migration | Reason |
|-----------|--------|
| 0030_f01_database_governance_hardening | Governance tables must remain protected |
| 0021_financial_ledger_rls | Ledger RLS must remain enabled |
| 0005_ledger_integrity_invariants | Ledger integrity must be preserved |

For these migrations, fix forward with a new migration.

---

## 5. Recovery Verification

```bash
# Verify schema state
npx tsx scripts/db-release.ts preflight

# Verify application functionality
npm test

# Verify data integrity
# Run integrity checks

# Monitor for issues
```

---

## References
- [RB-005: Migration Failure](./RB-005-migration-failure.md)
- [RB-020: Disaster Recovery](./RB-020-disaster-recovery.md)
