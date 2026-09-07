# RB-015: AI Incident

**Severity:** P1  
**Trigger:** Noelia/HIVE AI system malfunction, unsafe output, or governance violation  
**Last Tested:** NOT_TESTED  
**Owner:** AI Lead

## 1. Scenarios
- Unsafe/harmful AI output
- Governance boundary violation (AI acting outside authorized scope)
- Model provider outage
- RAG data contamination
- Prompt injection attack
- AI decision audit failure

## 2. Immediate Response
```bash
# Activate kill switch (see RB-016)
# Set AI_KILL_SWITCH=active in environment

# Suspend AI workflows
# UPDATE noelia_workflows SET status = 'SUSPENDED' WHERE status = 'ACTIVE';

# Communication
# Channel: #incidents + #ai
# Message: [P1] AI incident - {type} - kill switch activated
```

## 3. Investigation
- Review AI decision audit trail
- Identify affected workflows/decisions
- Determine root cause
- Assess impact

## 4. Resolution
- Fix root cause
- Verify governance boundaries
- Test with adversarial inputs
- Resume AI operations

## 5. Real Inference Status
**STATUS: ENVIRONMENT_LIMITED**  
Real generative inference requires actual model provider credentials and infrastructure. Current implementation uses mock/stub providers.

## References
- [RB-016: Noelia Kill Switch](./RB-016-noelia-kill-switch.md)
- [RB-017: RAG Data Incident](./RB-017-rag-data-incident.md)
