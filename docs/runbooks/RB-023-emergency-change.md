# RB-023: Emergency Change

**Severity:** P0 (bypasses normal process)  
**Trigger:** Critical production issue requiring immediate code change  
**Last Tested:** NOT_TESTED  
**Owner:** SRE Lead + CTO

## 1. Authorization
Emergency changes require:
- SRE Lead approval
- CTO approval
- Documented justification
- Post-change review within 24 hours

## 2. Procedure
```bash
# 1. Create emergency branch
git checkout -b emergency/{incident-id}

# 2. Apply minimal fix
# (smallest change that resolves the issue)

# 3. Run tests locally
npm test

# 4. Push and create PR
git push origin emergency/{incident-id}
gh pr create --title "EMERGENCY: {description}" --base main

# 5. Get emergency approval
# CTO must approve with comment "EMERGENCY APPROVED"

# 6. Merge
gh pr merge --merge

# 7. Monitor deployment
gh run watch

# 8. Verify fix
curl -s https://beyu-os-1-0.vercel.app/api/health | jq .
```

## 3. Post-Change Review (within 24 hours)
- Was the change minimal?
- Was the change correct?
- Were tests added?
- Is a follow-up needed?
- Update runbooks if needed

## 4. Restrictions
- NO database schema changes (unless absolutely necessary)
- NO governance table mutations
- NO security control weakening
- MUST be reversible

## References
- [RB-022: Production Deployment](./RB-022-production-deployment.md)
- [RB-001: General Incident Response](./RB-001-incident-response.md)
