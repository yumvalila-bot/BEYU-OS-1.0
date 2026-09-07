# RB-009: Duplicate Payment Investigation

**Severity:** P1  
**Trigger:** Duplicate payment detected  
**Last Tested:** NOT_TESTED  
**Owner:** Finance Lead

## 1. Detection
- Reconciliation identifies duplicate
- User reports duplicate charge
- Provider notification

## 2. Immediate Response
```bash
# Identify duplicate transactions
# SELECT id, idempotency_key, amount, status, created_at 
# FROM payment_transactions 
# WHERE idempotency_key = '{key}' OR (amount = {amount} AND beneficiary = '{beneficiary}' AND created_at > now() - interval '1 hour');

# Suspend similar payments
# UPDATE payment_transactions SET status = 'SUSPENDED' 
# WHERE beneficiary = '{beneficiary}' AND status = 'PENDING';

# Communication
# Channel: #finance
# Message: [P1] Duplicate payment detected - {transaction_id} - investigating
```

## 3. Investigation
- Check idempotency key handling
- Check provider duplicate detection
- Check webhook duplicate handling
- Identify root cause (race condition, retry, manual)

## 4. Resolution
- Initiate refund for duplicate payment
- Create reversing journal entry
- Notify affected user
- Fix root cause

## 5. Prevention
- Verify idempotency key enforcement
- Verify provider duplicate detection
- Add monitoring for duplicate patterns

## References
- [RB-008: Payment Reconciliation Failure](./RB-008-payment-reconciliation-failure.md)
