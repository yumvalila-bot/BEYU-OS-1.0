# RB-004: Database Corruption

**Severity:** P0  
**Trigger:** Data integrity violations, constraint failures, or checksum errors  
**Last Tested:** NOT_TESTED  
**Owner:** DBA + SRE Lead

---

## 1. Detection

### Indicators
- Checksum verification failures
- Constraint violations (foreign keys, unique, check)
- Audit chain integrity failures (hash chain broken)
- Ledger integrity violations (double-entry mismatch)
- Index corruption errors
- Unexpected NULL in NOT NULL columns
- Data type mismatches

---

## 2. Immediate Response (< 5 minutes)

```bash
# Stop application writes (enable read-only mode)
# [Requires Vercel environment variable: BEYU_READ_ONLY=true + redeploy]

# Assess corruption scope
# Run integrity checks:
# - Audit chain: SELECT * FROM audit_log WHERE prev_hash != expected_hash
# - Ledger: SELECT * FROM ledger_entries WHERE debit_total != credit_total
# - Foreign keys: Check orphaned records

# Initial communication
# Channel: #incidents
# Message: [P0] Database corruption detected - scope: {tables/rows} - writes suspended
```

---

## 3. Diagnosis

### 3.1 Identify Corruption Type
| Type | Detection | Impact |
|------|-----------|--------|
| Audit chain break | Hash mismatch | Audit integrity compromised |
| Ledger mismatch | Debit ≠ Credit | Financial integrity compromised |
| Foreign key orphan | Missing parent | Referential integrity broken |
| Index corruption | Query errors | Query performance/failures |
| Data type mismatch | Cast errors | Application errors |

### 3.2 Determine Root Cause
- Hardware failure (disk, memory)
- PostgreSQL bug
- Application bug (race condition, incorrect transaction)
- Migration error
- Manual intervention

---

## 4. Resolution

### 4.1 Audit Chain Corruption
```sql
-- Identify broken chain
SELECT id, prev_hash, hash, created_at
FROM audit_log
WHERE prev_hash IS NOT NULL
AND prev_hash != (SELECT hash FROM audit_log a2 WHERE a2.id = audit_log.prev_id)
ORDER BY created_at;

-- If chain is broken, DO NOT attempt to repair hashes
-- Instead: document the break, preserve evidence, restore from backup
-- See RB-020: Disaster Recovery
```

### 4.2 Ledger Integrity Corruption
```sql
-- Identify mismatched entries
SELECT id, journal_entry_id, debit_total, credit_total
FROM ledger_entries
WHERE debit_total != credit_total;

-- DO NOT attempt manual correction without CFO authorization
-- Create reversing entries if needed (Finance OS procedure)
```

### 4.3 Restore from Backup
```bash
# Identify last known good backup
# [EXTERNAL_BLOCKED: Requires Supabase backup access]

# Restore to scratch database
# [EXTERNAL_BLOCKED: Requires Supabase restore capability]

# Validate restored data
# Run all integrity checks

# If valid, promote restored database
# [EXTERNAL_BLOCKED: Requires Supabase failover capability]
```

---

## 5. Recovery Verification

```bash
# Run all integrity checks
# - Audit chain integrity
# - Ledger integrity
# - Foreign key integrity
# - RLS policy integrity
# - Schema fingerprint

# Compare with pre-corruption state
# Verify no data loss (or document data loss)

# Re-enable writes
# [Remove BEYU_READ_ONLY environment variable + redeploy]

# Monitor for recurrence
```

---

## 6. Post-Incident
- Root cause analysis
- Implement preventive controls
- Increase integrity check frequency
- Review backup strategy

---

## References
- [RB-003: Database Outage](./RB-003-database-outage.md)
- [RB-020: Disaster Recovery](./RB-020-disaster-recovery.md)
