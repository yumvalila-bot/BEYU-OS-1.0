# RB-010: Finance Close

**Severity:** P2  
**Trigger:** Scheduled period close or manual close request  
**Last Tested:** NOT_TESTED  
**Owner:** CFO

## 1. Overview
Finance close locks a financial period to prevent retroactive journal entries. This is a governed operation requiring CFO authorization.

## 2. Pre-Close Checklist
- [ ] All transactions for the period are recorded
- [ ] Reconciliation is complete and balanced
- [ ] All adjustments are posted
- [ ] Trial balance is correct
- [ ] Financial reports are generated
- [ ] CAP_POSTING status verified (must be LOCKED or legitimately ACTIVE)

## 3. Close Procedure
```sql
-- Verify no pending journal entries
-- SELECT count(*) FROM journal_entries 
-- WHERE period_id = '{period}' AND status = 'PENDING_POSTING';
-- Expected: 0

-- Close the period (CFO authorization required)
-- INSERT INTO financial_periods (id, code, start_date, end_date, status)
-- VALUES ('{id}', '{code}', '{start}', '{end}', 'CLOSED')
-- ON CONFLICT (code) DO UPDATE SET status = 'CLOSED', closed_at = now(), closed_by = '{cfo_user_id}';

-- Verify close
-- SELECT * FROM financial_periods WHERE code = '{code}';
```

## 4. Post-Close
- Generate financial statements
- Archive period data
- Notify stakeholders

## 5. Reopening a Closed Period
Reopening requires:
- CFO + CEO authorization
- Documented justification
- Audit trail
- Reversing entries for any changes

## References
- [RB-011: CAP_POSTING Incident](./RB-011-cap-posting-incident.md)
