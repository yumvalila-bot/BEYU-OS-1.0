# RB-008: Payment Reconciliation Failure

**Severity:** P1  
**Trigger:** Reconciliation process fails or detects mismatches  
**Last Tested:** NOT_TESTED  
**Owner:** Finance Lead

## 1. Detection
- Reconciliation job failure
- Mismatch count exceeds threshold
- Settlement amount ≠ expected amount

## 2. Immediate Response
```bash
# Check reconciliation status
# SELECT * FROM payment_reconciliations 
# WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 5;

# Check mismatch details
# SELECT * FROM payment_reconciliation_mismatches 
# WHERE reconciliation_id = '{id}';

# Suspend new payment processing if critical
# UPDATE payment_policies SET enabled = false WHERE code = 'PAYMENT_PROCESSING';

# Communication
# Channel: #finance
# Message: [P1] Reconciliation failure - {mismatch_count} mismatches - investigating
```

## 3. Investigation
- Compare provider records with internal records
- Identify missing/duplicate/incorrect transactions
- Check for timing differences (cut-off issues)
- Verify exchange rates

## 4. Resolution
- Correct internal records if provider is authoritative
- Contact provider if provider records are incorrect
- Create adjustment entries for discrepancies
- Resume payment processing

## 5. Escalation
| Condition | Escalate To |
|-----------|-------------|
| >$10,000 mismatch | CFO |
| >$100,000 mismatch | CFO + CEO |
| Systematic mismatch | CFO + Audit Committee |

## References
- [RB-007: Payment Provider Outage](./RB-007-payment-provider-outage.md)
- [RB-009: Duplicate Payment Investigation](./RB-009-duplicate-payment-investigation.md)
