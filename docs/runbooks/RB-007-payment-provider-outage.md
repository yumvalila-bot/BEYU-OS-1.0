# RB-007: Payment Provider Outage

**Severity:** P1  
**Trigger:** External payment provider unreachable or returning errors  
**Last Tested:** NOT_TESTED  
**Owner:** Finance Lead + SRE

---

## 1. Detection
- Payment webhook delivery failures
- Payment API timeouts/errors
- Provider status page alerts
- Reconciliation mismatches

## 2. Immediate Response
```bash
# Check provider status page
# [Provider-specific URLs]

# Check payment transaction status
# SELECT status, count(*) FROM payment_transactions 
# WHERE created_at > now() - interval '1 hour' GROUP BY status;

# Enable queue-based retry (payments are idempotent)
# Payment transactions remain in PENDING status until provider recovers

# Communication
# Channel: #incidents + #finance
# Message: [P1] Payment provider {name} outage - payments queued for retry
```

## 3. Containment
- Payments are queued with idempotency keys (safe to retry)
- No duplicate payments will be created
- Users see "payment processing" status
- Manual payment processing suspended

## 4. Resolution
- Monitor provider status page
- When provider recovers, queued payments process automatically
- Verify reconciliation after recovery

## 5. Fallback
- If provider outage > 4 hours, consider activating backup provider
- **EXTERNAL_BLOCKED:** Backup provider integration not yet implemented
- Requires CFO authorization

## 6. Real Provider Status
**STATUS: NOT_INTEGRATED**  
No real payment provider is currently integrated. The payment subsystem uses a mock provider for testing. Real provider integration requires:
- Provider account and credentials
- API integration testing
- Regulatory compliance (BoT licensing)
- Production environment setup

---

## References
- [RB-008: Payment Reconciliation Failure](./RB-008-payment-reconciliation-failure.md)
- [RB-009: Duplicate Payment Investigation](./RB-009-duplicate-payment-investigation.md)
