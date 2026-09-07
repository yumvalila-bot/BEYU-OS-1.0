# RB-013: MFA Recovery

**Severity:** P2  
**Trigger:** User cannot complete MFA (lost device, forgotten recovery codes)  
**Last Tested:** NOT_TESTED  
**Owner:** Security Lead

## 1. Verification
Before disabling MFA, verify user identity through:
- Government-issued ID (video call)
- Knowledge-based verification
- Manager approval
- HR verification

## 2. Procedure
```sql
-- Disable MFA (requires security lead authorization)
-- UPDATE users 
-- SET mfa_enrolled = false, 
--     mfa_secret_encrypted = NULL,
--     mfa_recovery_codes_hash = NULL,
--     mfa_method = NULL
-- WHERE id = '{user_id}';

-- Log the action
-- INSERT INTO audit_log (event_type, user_id, details)
-- VALUES ('MFA_RECOVERY', '{security_lead_id}', 'MFA disabled for user {user_id}');
```

## 3. Post-Recovery
- User must re-enroll MFA on next login
- Monitor account for 7 days
- Document in user's security record

## 4. Break-Glass Accounts
Break-glass accounts have separate MFA recovery procedures:
- Requires CTO + CEO authorization
- Time-limited access (24 hours)
- Full audit trail
- Immediate credential rotation after use

## References
- [RB-012: Identity Compromise](./RB-012-identity-compromise.md)
