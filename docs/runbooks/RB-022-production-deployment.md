# RB-022: Production Deployment

**Severity:** P2  
**Trigger:** Scheduled deployment to production  
**Last Tested:** NOT_TESTED  
**Owner:** Release Manager

## 1. Pre-Deployment Checklist
- [ ] All tests passing (CI green)
- [ ] Secret scan clean
- [ ] Dependency audit clean (critical only)
- [ ] Migration validated (preflight-repo job)
- [ ] Code review approved
- [ ] No P0/P1 incidents active
- [ ] Rollback plan documented

## 2. Deployment Procedure
```bash
# 1. Merge PR to main
gh pr merge {pr_number} --merge

# 2. Monitor CI pipeline
gh run watch

# 3. Monitor Vercel deployment
# [EXTERNAL_BLOCKED: Requires Vercel dashboard access]

# 4. Verify health
curl -s https://beyu-os-1-0.vercel.app/api/health | jq .

# 5. Run smoke tests
# [Manual testing of critical flows]

# 6. Monitor error rates
# [EXTERNAL_BLOCKED: Requires monitoring platform]
```

## 3. Database Deployment
```bash
# Migrations run automatically via db-release.yml workflow
# Monitor the workflow:
gh run list --workflow="db-release.yml"

# Verify migration state:
npx tsx scripts/db-release.ts preflight
```

## 4. Rollback
See [RB-006: Migration Rollback](./RB-006-migration-rollback.md)

## References
- [RB-005: Migration Failure](./RB-005-migration-failure.md)
- [RB-023: Emergency Change](./RB-023-emergency-change.md)
