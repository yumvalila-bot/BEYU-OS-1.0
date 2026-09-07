# RB-018: Health OS Outage

**Severity:** P1  
**Trigger:** Health OS backend unreachable or clinical workflows failing  
**Last Tested:** NOT_TESTED  
**Owner:** Health OS Lead + SRE

## 1. Detection
- Health OS health check failure
- Clinical workflow failures
- BEYU OS → Health OS integration errors
- User reports (clinical staff)

## 2. Immediate Response
```bash
# Check Health OS health
# curl -s {health_os_url}/health | jq .

# Check BEYU OS → Health OS integration
# Check outbox queue for pending events

# Communication
# Channel: #incidents + #health-os
# Message: [P1] Health OS outage - {scope} - investigating
```

## 3. Containment
- Activate manual clinical procedures (paper-based)
- Notify clinical staff
- Queue non-urgent operations

## 4. Resolution
- Restore Health OS backend
- Process queued events
- Verify data consistency
- Resume normal operations

## 5. Clinical Safety
**CRITICAL:** Patient safety is paramount. If Health OS outage affects patient care:
- Escalate to P0 immediately
- Activate manual clinical procedures
- Notify hospital administration
- Document all manual interventions for later reconciliation

## References
- [RB-001: General Incident Response](./RB-001-incident-response.md)
