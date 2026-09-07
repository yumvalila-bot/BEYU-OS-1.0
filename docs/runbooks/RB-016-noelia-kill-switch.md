# RB-016: Noelia Kill Switch

**Severity:** P0 (activation)  
**Trigger:** AI system behaving unsafely or outside governance boundaries  
**Last Tested:** NOT_TESTED  
**Owner:** AI Lead (any authorized operator can activate)

## 1. Activation
```bash
# Immediate kill switch activation
# Set environment variable: NOELIA_KILL_SWITCH=active
# Or use the API:
# POST /api/v1/ai/noelia/kill-switch
# Authorization: Bearer {admin_token}
# Body: { "action": "activate", "reason": "{reason}" }
```

## 2. Effects
- All AI workflows suspended
- All pending AI decisions cancelled
- Model provider calls blocked
- RAG retrieval disabled
- Tool execution blocked

## 3. Verification
```bash
# Verify kill switch is active
# SELECT value FROM system_config WHERE key = 'NOELIA_KILL_SWITCH';
# Expected: active

# Verify no AI workflows running
# SELECT count(*) FROM noelia_workflows WHERE status = 'RUNNING';
# Expected: 0
```

## 4. Deactivation
Requires:
- Root cause identified and fixed
- AI Lead authorization
- Verification tests passing
- Audit trail entry

## References
- [RB-015: AI Incident](./RB-015-ai-incident.md)
