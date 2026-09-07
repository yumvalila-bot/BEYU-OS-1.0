# RB-011: CAP_POSTING Incident

**Severity:** P0  
**Trigger:** Unauthorized CAP_POSTING activation attempt or posting engine failure  
**Last Tested:** NOT_TESTED  
**Owner:** CFO + SRE Lead

---

## 1. Overview

CAP_POSTING is the governed capability that authorizes the posting engine to write journal entries to the financial ledger. It is currently **LOCKED** and must remain LOCKED until all governance ratification requirements (P1, P6, P7, P9) are legitimately satisfied.

### Critical Invariants
- CAP_POSTING must NEVER be activated without legitimate governance ratification
- Unauthorized activation attempts are security incidents
- Posting engine must fail closed if CAP_POSTING is LOCKED
- Ledger integrity must be preserved under all circumstances

---

## 2. Scenarios

### Scenario A: Unauthorized Activation Attempt
**Indicators:**
- Audit log shows `CAP_POSTING` activation attempt
- Governance capability registry mutation detected
- API call to activate without proper authorization

### Scenario B: Posting Engine Failure
**Indicators:**
- Journal entries failing to post
- Posting engine errors in application logs
- Reconciliation mismatches

### Scenario C: Accidental Activation
**Indicators:**
- CAP_POSTING status changed to ACTIVE
- Ledger entries appearing without proper governance
- Audit trail shows unintended activation

---

## 3. Immediate Response (< 5 minutes)

### 3.1 Unauthorized Activation Attempt
```bash
# Lock the account that attempted activation
# UPDATE users SET status = 'LOCKED' WHERE id = '{user_id}';

# Verify CAP_POSTING remains LOCKED
# SELECT capability_code, activation_status 
# FROM governance_capability_registry 
# WHERE capability_code = 'CAP_POSTING';
# Expected: LOCKED

# If CAP_POSTING was activated, immediately lock it
# UPDATE governance_capability_registry 
# SET activation_status = 'LOCKED', 
#     activated_at = NULL
# WHERE capability_code = 'CAP_POSTING';

# Treat as security incident
# See RB-002: Security Incident
```

### 3.2 Posting Engine Failure
```bash
# Check CAP_POSTING status
# SELECT activation_status FROM governance_capability_registry
# WHERE capability_code = 'CAP_POSTING';

# If LOCKED (expected): posting should fail closed (correct behavior)
# If ACTIVE: investigate why posting is failing

# Check journal entries pending posting
# SELECT count(*) FROM journal_entries 
# WHERE status = 'PENDING_POSTING';

# Check posting engine logs
# [EXTERNAL_BLOCKED: Requires log aggregation]
```

### 3.3 Accidental Activation
```bash
# IMMEDIATELY lock CAP_POSTING
# UPDATE governance_capability_registry 
# SET activation_status = 'LOCKED', 
#     activated_at = NULL
# WHERE capability_code = 'CAP_POSTING';

# Audit all ledger entries created during unauthorized activation
# SELECT * FROM ledger_entries 
# WHERE created_at > '{activation_time}' 
# AND created_at < '{lock_time}';

# These entries may need reversal (see Finance OS procedures)
```

---

## 4. Investigation

### 4.1 Unauthorized Activation
- Who attempted activation?
- How did they bypass authorization?
- Was CAP_POSTING actually activated?
- Were any ledger entries created?
- Is this a governance bypass vulnerability?

### 4.2 Posting Engine Failure
- Is CAP_POSTING correctly LOCKED?
- Are there configuration issues?
- Are there database connectivity issues?
- Are there validation failures?

---

## 5. Resolution

### 5.1 Restore CAP_POSTING to LOCKED
```sql
-- Verify governance capability registry is protected (F-01)
SELECT has_table_privilege('beyu_runtime', 'public.governance_capability_registry', 'UPDATE');
-- Expected: false

-- If runtime role has UPDATE privilege, revoke it (F-01 remediation)
REVOKE UPDATE ON governance_capability_registry FROM beyu_runtime;

-- Ensure CAP_POSTING is LOCKED
UPDATE governance_capability_registry 
SET activation_status = 'LOCKED', activated_at = NULL
WHERE capability_code = 'CAP_POSTING';
```

### 5.2 Reverse Unauthorized Ledger Entries
```sql
-- Identify unauthorized entries
SELECT je.id, je.journal_date, je.description
FROM journal_entries je
WHERE je.posted_at BETWEEN '{unauthorized_activation}' AND '{lock_time}'
AND je.status = 'POSTED';

-- Create reversing entries (Finance OS procedure)
-- [Requires CFO authorization]
```

### 5.3 Patch Governance Bypass
- Identify how bypass occurred
- Fix vulnerability
- Add additional controls
- Test fix

---

## 6. Recovery Verification

```bash
# Verify CAP_POSTING is LOCKED
# SELECT activation_status FROM governance_capability_registry
# WHERE capability_code = 'CAP_POSTING';
# Expected: LOCKED

# Verify runtime role cannot mutate governance tables
# SELECT has_table_privilege('beyu_runtime', 'public.governance_capability_registry', 'UPDATE');
# Expected: false

# Verify posting engine fails closed
# Attempt to post a journal entry (should fail with "CAP_POSTING LOCKED")

# Verify ledger integrity
# Run ledger integrity checks (Finance OS procedures)

# Verify audit trail
# All activation attempts must be in audit_log
```

---

## 7. Communication

### Internal
```
Channel: #incidents + #finance
Message: [P0] CAP_POSTING incident - {type} - {status}
Participants: CFO, CTO, Security Lead, Finance Lead
```

### External (if financial impact)
- Notify auditors
- Notify regulators (if required)
- Notify affected parties

---

## 8. Post-Incident

### 8.1 Root Cause Analysis
- How was governance bypassed?
- Why did controls fail?
- What additional controls are needed?

### 8.2 Governance Review
- Review all governance capabilities
- Verify all are correctly LOCKED/ACTIVE
- Strengthen controls

### 8.3 Audit Trail Review
- Verify all activation attempts are logged
- Verify logs are tamper-evident
- Verify audit chain integrity

---

## 9. Escalation

| Condition | Escalate To |
|-----------|-------------|
| CAP_POSTING activated without authorization | CFO + CTO (immediate) |
| Ledger entries created during unauthorized activation | CFO + Audit Committee |
| Governance bypass vulnerability | CISO + CTO |
| Financial impact | CFO + CEO + Board |

---

## 10. Closure Criteria

- [ ] CAP_POSTING verified LOCKED
- [ ] Runtime role cannot mutate governance tables
- [ ] Unauthorized ledger entries reversed (if any)
- [ ] Governance bypass patched (if applicable)
- [ ] Audit trail verified complete
- [ ] Ledger integrity verified
- [ ] Post-mortem complete
- [ ] Governance review complete
- [ ] Incident ticket closed

---

## 11. Governance Ratification Requirements

CAP_POSTING can only be activated when ALL of the following are legitimately satisfied:

- **P1:** Accounting policy ratified
- **P6:** [Specific policy - see governance documentation]
- **P7:** [Specific policy - see governance documentation]
- **P9:** [Specific policy - see governance documentation]

**Current Status:** NOT RATIFIED  
**Activation Status:** LOCKED  
**Implementation Status:** NOT_IMPLEMENTED

---

## References
- [RB-002: Security Incident](./RB-002-security-incident.md)
- [RB-010: Finance Close](./RB-010-finance-close.md)
- CAP_POSTING Audit Report (root: CAP_POSTING_AUDIT_REPORT.md)
- Accounting Governance Ratification Report (root: ACCOUNTING_GOVERNANCE_RATIFICATION_REPORT.md)
