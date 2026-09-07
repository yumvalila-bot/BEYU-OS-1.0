# RB-014: Tenant Isolation Incident

**Severity:** P0  
**Trigger:** Cross-tenant data access detected  
**Last Tested:** NOT_TESTED  
**Owner:** Security Lead + CTO

## 1. Detection
- RLS violation in database logs
- User reports seeing another tenant's data
- Audit log shows cross-tenant access
- Security test failure

## 2. Immediate Response (< 5 minutes)
```bash
# Identify affected tenants
# Check RLS policies and tenant context

# Suspend affected users (if malicious)
# UPDATE users SET status = 'LOCKED' WHERE id IN ('{user_ids}');

# Communication
# Channel: #security-incidents
# Message: [P0] Tenant isolation breach - {tenant_a} → {tenant_b} - investigating
```

## 3. Investigation
- How was isolation bypassed?
- What data was accessed?
- Was it read or write access?
- How long was the breach active?
- How many users/records affected?

## 4. Resolution
- Fix the isolation bypass vulnerability
- Verify RLS policies are correct
- Run tenant isolation test suite
- Notify affected tenants (if data accessed)
- Document in security incident report

## 5. Verification
```bash
# Run tenant isolation tests
npx vitest run tests/tenant-isolation/
npx vitest run tests/security/rls-isolation.test.ts

# Verify RLS policies
# SELECT * FROM pg_policies WHERE schemaname = 'public';
```

## References
- [RB-002: Security Incident](./RB-002-security-incident.md)
