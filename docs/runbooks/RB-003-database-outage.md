# RB-003: Database Outage

**Severity:** P0  
**Trigger:** Production PostgreSQL unreachable or unresponsive  
**Last Tested:** NOT_TESTED  
**Owner:** SRE On-Call + DBA

---

## 1. Detection

### Automated
- Health check failure (`/api/health` returns `database: "DOWN"`)
- Application error rate spike (database connection errors)
- Supabase dashboard alerts
- Connection pool exhaustion

### Manual
- User reports (application slow/unavailable)
- Internal team observation

---

## 2. Immediate Response (< 5 minutes)

### 2.1 Verify Outage
```bash
# Check application health
curl -s https://beyu-os-1-0.vercel.app/api/health | jq .

# Check database connectivity (if admin DSN available)
# BEYU_ADMIN_DATABASE_URL=<dsn> npx tsx scripts/db-release.ts preflight

# Check Supabase status
# [EXTERNAL_BLOCKED: Requires Supabase dashboard access]
# https://status.supabase.com/
```

### 2.2 Initial Communication
```
Channel: #incidents
Message: [P0] Database outage - investigating - all systems dependent on database affected
```

---

## 3. Diagnosis

### 3.1 Determine Scope
| Scenario | Indicators | Action |
|----------|-----------|--------|
| Supabase outage | All connections fail | Check Supabase status page |
| Network issue | Intermittent failures | Check Vercel → Supabase connectivity |
| Connection pool exhaustion | Timeouts, not connection refused | Scale pool, kill long queries |
| Database corruption | Query errors, constraint violations | See RB-004 |
| Migration failure | Errors after deployment | See RB-005 |

### 3.2 Supabase-Specific Diagnostics
```bash
# Check Supabase project status
# [EXTERNAL_BLOCKED: Requires Supabase management API token]

# Check Supavisor pooler status
# Transaction pooler (port 6543) vs Session pooler (port 5432)
# Try connecting to session pooler if transaction pooler fails
```

---

## 4. Containment

### 4.1 Application Degradation
```bash
# Enable maintenance mode (if available)
# [Requires Vercel environment variable update + redeploy]

# Display user-friendly error page
# Application should catch database errors and show retry UI
```

### 4.2 Connection Pool Management
```bash
# If connection pool exhaustion:
# 1. Identify long-running queries
# SELECT pid, now() - query_start AS duration, query, state
# FROM pg_stat_activity
# WHERE state = 'active' AND duration > interval '5 minutes'
# ORDER BY duration DESC;

# 2. Terminate problematic queries
# SELECT pg_terminate_backend(pid);

# 3. Scale connection pool (Supabase dashboard)
# [EXTERNAL_BLOCKED: Requires Supabase dashboard access]
```

---

## 5. Resolution

### 5.1 Supabase Outage
- Monitor Supabase status page
- Wait for Supabase to resolve
- Prepare for failover (if multi-region configured)
- **EXTERNAL_BLOCKED:** Multi-region failover requires Supabase Enterprise plan

### 5.2 Network Issue
```bash
# Check Vercel → Supabase connectivity
# [EXTERNAL_BLOCKED: Requires Vercel SSH/debug access]

# Try alternative Supabase endpoints
# Direct connection vs pooler
# IPv4 vs IPv6
```

### 5.3 Connection Pool Exhaustion
```bash
# Kill long-running queries (see 4.2)
# Scale pool size in Supabase dashboard
# Deploy application with increased pool size
```

### 5.4 Application Restart (last resort)
```bash
# Restart Vercel deployment
# [EXTERNAL_BLOCKED: Requires Vercel CLI]
# vercel redeploy <deployment-url>
```

---

## 6. Recovery Verification

```bash
# Verify database connectivity
curl -s https://beyu-os-1-0.vercel.app/api/health | jq .

# Verify schema state
npx tsx scripts/db-release.ts preflight

# Verify data integrity
# [Run critical data validation queries]

# Monitor error rates
# [EXTERNAL_BLOCKED: Requires monitoring platform]

# Test critical user flows
# Login, OS routing, key operations
```

---

## 7. Communication

### Status Updates (every 15 minutes)
```
Channel: #incidents
Message: [P0] Database outage - {status} - {ETA if known}
```

### User Communication
```
Channel: Status page
Message: We are experiencing a database outage affecting all services.
         Our team is working to restore service.
         Estimated recovery: {ETA or "unknown"}
```

---

## 8. Post-Incident

### 8.1 Root Cause Analysis
- Was it Supabase infrastructure?
- Was it our query performance?
- Was it connection pool exhaustion?
- Was it a migration issue?

### 8.2 Prevention
- Implement read replicas for read-heavy workloads
- Implement connection pool monitoring
- Implement query performance monitoring
- Consider multi-region failover

---

## 9. Escalation

| Condition | Escalate To |
|-----------|-------------|
| No progress in 30 min | SRE Lead |
| Supabase confirmed outage | CTO (vendor escalation) |
| Data loss suspected | CTO + CEO |
| >1 hour outage | CEO |

---

## 10. Closure Criteria

- [ ] Database fully operational
- [ ] All health checks passing
- [ ] Error rates at baseline
- [ ] Data integrity verified
- [ ] Users notified
- [ ] Root cause identified
- [ ] Prevention plan created
- [ ] Incident ticket closed

---

## References
- [RB-004: Database Corruption](./RB-004-database-corruption.md)
- [RB-005: Migration Failure](./RB-005-migration-failure.md)
- [RB-020: Disaster Recovery](./RB-020-disaster-recovery.md)
