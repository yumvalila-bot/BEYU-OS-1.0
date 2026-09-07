# RB-001: General Incident Response

**Severity:** P0-P3 (adaptive)  
**Trigger:** Any system anomaly causing user impact  
**Last Tested:** NOT_TESTED  
**Owner:** SRE On-Call

---

## 1. Detection

### Automated
- Monitoring alerts (application errors, latency spikes, error rates)
- Health check failures (`/api/health`, `/api/health/live`)
- Database connection pool exhaustion
- Payment reconciliation mismatches
- Security alerts (auth failures, RLS violations)

### Manual
- User reports
- Internal team observation
- Scheduled health reviews

---

## 2. Immediate Response (< 5 minutes)

### 2.1 Acknowledge
```bash
# Acknowledge alert in monitoring system
# [EXTERNAL_BLOCKED: Monitoring platform not provisioned]
```

### 2.2 Assess Severity
| Indicator | Severity |
|-----------|----------|
| System completely down | P0 |
| >50% users affected | P0 |
| Data loss or corruption | P0 |
| Security breach | P0 |
| Major feature broken | P1 |
| Partial degradation | P2 |
| Minor issue | P3 |

### 2.3 Initial Communication
```
Channel: #incidents (Slack/Teams)
Message: [P{severity}] {system} - {brief description} - investigating
```

---

## 3. Containment (< 15 minutes)

### 3.1 Application Issues
```bash
# Check application health
curl -s https://beyu-os-1-0.vercel.app/api/health | jq .

# Check database connectivity
# Requires BEYU_ADMIN_DATABASE_URL
npx tsx scripts/db-release.ts preflight

# Check Vercel deployment status
# [EXTERNAL_BLOCKED: Requires Vercel CLI authentication]
```

### 3.2 Database Issues
```bash
# Check migration state
npx tsx scripts/db-release.ts drift

# Check for long-running queries
# Connect as admin role:
# SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
# FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
```

### 3.3 Security Issues
```bash
# Check for suspicious activity
# [Requires log aggregation - EXTERNAL_BLOCKED]

# Lockdown suspicious accounts
# UPDATE users SET status = 'LOCKED', locked_until = now() + interval '24 hours'
# WHERE email = 'suspicious@example.com';
```

---

## 4. Investigation

### 4.1 Gather Evidence
```bash
# Application logs
# [EXTERNAL_BLOCKED: Requires log aggregation platform]

# Database logs
# [EXTERNAL_BLOCKED: Requires Supabase dashboard access]

# Recent deployments
gh run list --limit 10

# Recent migrations
# SELECT * FROM beyu_migrations ORDER BY applied_at DESC LIMIT 10;
```

### 4.2 Root Cause Analysis
1. Check recent changes (deployments, migrations, config changes)
2. Correlate with incident start time
3. Identify affected components
4. Determine blast radius

---

## 5. Resolution

### 5.1 Rollback (if deployment-related)
```bash
# Revert to previous deployment
# [EXTERNAL_BLOCKED: Requires Vercel CLI]
# vercel rollback <deployment-url>

# Revert database migration (if safe)
# See RB-006: Migration Rollback
```

### 5.2 Hotfix
```bash
# Create hotfix branch
git checkout -b hotfix/{incident-id}

# Apply fix
# ... (code changes)

# Deploy
git push origin hotfix/{incident-id}
gh pr create --title "hotfix: {description}" --base main

# Emergency merge (if P0)
# See RB-023: Emergency Change
```

### 5.3 Workaround
- Document temporary workaround
- Communicate to affected users
- Create ticket for permanent fix

---

## 6. Recovery Verification

```bash
# Verify application health
curl -s https://beyu-os-1-0.vercel.app/api/health | jq .

# Verify database health
npx tsx scripts/db-release.ts preflight

# Verify critical user flows
# [Manual testing of login, OS routing, key features]

# Monitor error rates
# [EXTERNAL_BLOCKED: Requires monitoring platform]
```

---

## 7. Communication

### 7.1 Status Updates (every 15 minutes for P0/P1)
```
Channel: #incidents
Message: [P{severity}] {system} - {status} - {next steps} - {ETA}
```

### 7.2 User Communication (if user-facing impact)
```
Channel: Status page / Email
Message: We are experiencing {issue}. Our team is investigating. 
         We expect resolution by {ETA}. We apologize for the inconvenience.
```

### 7.3 Resolution Notification
```
Channel: #incidents + affected users
Message: [RESOLVED] {system} - {root cause} - {resolution} - {duration}
```

---

## 8. Post-Incident

### 8.1 Evidence Collection
- Save all logs
- Screenshot dashboards
- Document timeline
- Record commands executed

### 8.2 Post-Mortem (within 48 hours)
- Schedule blameless post-mortem
- Invite all participants
- Document:
  - Timeline
  - Root cause
  - Contributing factors
  - Impact (users, revenue, data)
  - Action items

### 8.3 Action Items
- Create tickets for each action item
- Assign owners
- Set deadlines
- Track completion

---

## 9. Escalation

| Condition | Escalate To |
|-----------|-------------|
| No progress in 30 min (P0) | SRE Lead |
| No progress in 60 min (P0) | CTO |
| Data loss confirmed | CTO + CEO |
| Security breach | CISO + Legal |
| Financial impact | CFO |

---

## 10. Closure Criteria

- [ ] System fully operational
- [ ] All health checks passing
- [ ] Error rates at baseline
- [ ] Users notified
- [ ] Evidence collected
- [ ] Post-mortem scheduled
- [ ] Action items created
- [ ] Incident ticket closed

---

## Appendix: Common Scenarios

### Scenario A: Application Crash Loop
1. Check Vercel deployment logs
2. Identify error in logs
3. Rollback to previous deployment
4. Investigate root cause
5. Fix and redeploy

### Scenario B: Database Connection Exhaustion
1. Check connection pool size
2. Identify long-running queries
3. Kill problematic queries
4. Scale connection pool if needed
5. Investigate query performance

### Scenario C: High Error Rate
1. Identify error type (5xx, 4xx, timeout)
2. Check application logs for stack traces
3. Check database logs for query errors
4. Identify pattern (specific endpoint, user, time)
5. Apply fix or rollback

---

## References
- [RB-002: Security Incident](./RB-002-security-incident.md)
- [RB-003: Database Outage](./RB-003-database-outage.md)
- [RB-022: Production Deployment](./RB-022-production-deployment.md)
- [RB-023: Emergency Change](./RB-023-emergency-change.md)
