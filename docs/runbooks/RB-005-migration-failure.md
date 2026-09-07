# RB-005: Migration Failure

**Severity:** P1  
**Trigger:** `scripts/migrate.ts` fails or migration produces unexpected schema  
**Last Tested:** NOT_TESTED  
**Owner:** DBA + Release Manager

---

## 1. Detection

### Indicators
- `npx tsx scripts/migrate.ts` exits non-zero
- Schema fingerprint mismatch after migration
- CI/CD pipeline failure on migration step
- `db-release.ts preflight` reports pending migrations or drift

---

## 2. Immediate Response

```bash
# Check which migration failed
npx tsx scripts/db-release.ts drift

# Check database state
# SELECT * FROM beyu_migrations ORDER BY applied_at DESC LIMIT 5;

# DO NOT attempt to re-run migration without understanding the failure
# Migrations are transactional — a failed migration should be rolled back
```

---

## 3. Diagnosis

### 3.1 Common Failure Modes
| Failure | Cause | Resolution |
|---------|-------|-----------|
| Syntax error | Invalid SQL | Fix SQL, regenerate migration |
| Lock timeout | Concurrent DDL | Wait, retry |
| Permission denied | Role misconfiguration | Fix role grants |
| Duplicate object | Migration already partially applied | Manual cleanup |
| Data constraint | Existing data violates new constraint | Data migration first |

### 3.2 Analyze Error
```bash
# Read full error output
# Identify specific SQL statement that failed
# Check if migration is idempotent
```

---

## 4. Resolution

### 4.1 Fix and Re-run
```bash
# Fix the migration SQL
# Test locally against scratch database
# Commit fix
# Re-run migration
npx tsx scripts/migrate.ts
```

### 4.2 Manual Cleanup (if partial application)
```sql
-- Identify what was applied
-- SELECT * FROM beyu_migrations WHERE id = '{migration_id}';

-- Manually reverse partial changes
-- [Specific SQL depends on migration content]

-- Remove migration record (if partially recorded)
-- DELETE FROM beyu_migrations WHERE id = '{migration_id}';

-- Re-run migration
```

### 4.3 Skip Migration (last resort, requires CTO approval)
```sql
-- ONLY if migration is truly idempotent and safe to skip
-- INSERT INTO beyu_migrations (id, hash, applied_at)
-- VALUES ('{migration_id}', '{hash}', now());
```

---

## 5. Recovery Verification

```bash
# Verify all migrations applied
npx tsx scripts/db-release.ts preflight

# Verify schema fingerprint
npx tsx scripts/db-release.ts drift

# Run tests
npm test

# Verify application functionality
```

---

## References
- [RB-006: Migration Rollback](./RB-006-migration-rollback.md)
- [RB-022: Production Deployment](./RB-022-production-deployment.md)
