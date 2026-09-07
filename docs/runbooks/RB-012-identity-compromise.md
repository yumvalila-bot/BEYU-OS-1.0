# RB-012: Identity Compromise

**Severity:** P0  
**Trigger:** User account suspected of being compromised  
**Last Tested:** NOT_TESTED  
**Owner:** Security Lead

## 1. Detection
- Unusual login locations/times
- Failed MFA attempts
- User reports unauthorized access
- Privilege escalation from account

## 2. Immediate Response (< 5 minutes)
```sql
-- Lock the account
-- UPDATE users SET status = 'LOCKED', locked_until = now() + interval '72 hours'
-- WHERE email = '{email}';

-- Revoke all sessions
-- DELETE FROM sessions WHERE user_id = '{user_id}';

-- Force MFA re-enrollment on next login
-- UPDATE users SET mfa_enrolled = false, mfa_secret_encrypted = NULL
-- WHERE id = '{user_id}';

-- Communication
-- Channel: #security-incidents
-- Message: [P0] Identity compromise - {email} - account locked
```

## 3. Investigation
- Review login history
- Review actions performed
- Identify data accessed
- Determine attack vector

## 4. Resolution
- Contact user through verified channel
- Force password reset
- Re-enroll MFA
- Review and revoke any unauthorized changes
- Monitor account for 30 days

## References
- [RB-002: Security Incident](./RB-002-security-incident.md)
- [RB-013: MFA Recovery](./RB-013-mfa-recovery.md)
