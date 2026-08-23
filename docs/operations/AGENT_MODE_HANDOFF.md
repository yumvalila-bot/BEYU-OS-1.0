# BEYU OS — Agent Mode Handoff

## Contract for Continuous Development

Agent Mode inherits a verified kernel baseline. The following rules are constitutional and
non-negotiable.

### MUST

- Inspect before modifying
- Preserve working functionality and canonical architecture
- Maintain ONE GlobalUserID — never create competing identity models
- Maintain tenant isolation via `tenantScopeIds()` and RLS
- Maintain audit atomicity: `withAuditTransaction()` or `recordAuditTx()`
- Use versioned migrations (`npm run migrate:generate` + `npm run migrate`)
- Keep HCM, Family Office and Tax Intelligence inside their canonical locations
- Keep Noelia as the single AI identity operating under BEYU OS governance
- Run tests before merging (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`)
- Document architectural changes with ADRs
- Search for credential literals before committing

### MUST NOT

- Create a separate HCM OS, Family Office OS or Tax OS
- Create a competing Finance truth layer
- Give AI unrestricted database access or governance bypass
- Use `drizzle-kit push` in production
- Commit real secrets, credentials or private keys
- Bypass tenant isolation, authorization or audit
- Fabricate test results, compliance states or security evidence

### Branch Strategy

The repository currently uses a **trunk-based** model: `main` is the only
long-lived branch, and work merges into it via pull request once CI is green.

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready, CI-green, tagged releases. The only long-lived branch. |
| `feature/*` | New capabilities |
| `fix/*` | Bug fixes |
| `security/*` | Security remediations (expedited review) |
| `migration/*` | Schema changes |

A `develop` integration branch is **not** in use. Earlier revisions of this
document described one; it never existed in the repository. Introduce it only as a
deliberate, documented change.

### Development Cycle

```
# implement on your working branch
npm run typecheck
npm run lint
npm test
npm run build
# PR → CI (.github/workflows/ci.yml) → review → merge → release
```

### Priority Queue (post-handoff)

1. **H-01**: Migrate permission source of truth to DB (`role_permissions` as runtime authority)
2. **H-02**: Implement ledger write endpoints (journal posting with maker/checker)
3. **H-03**: Implement governance resolution lifecycle API
4. **Finance OS hardening**: period closing, reconciliation, consolidation
5. **Governance execution**: quorum calculation, voting, approval workflows
6. **Health OS domain model**: EHR, encounters, clinical workflows (Sector OS, consuming BEYU OS)
7. **OpenTelemetry integration** (H-09)
8. **Redis-backed rate limiting** (H-08)
9. **Dependency vulnerability remediation** (H-11)

### Architecture Verification Checklist (run before every release)

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] `npm test` — 155 tests across 11 suites, all pass (requires PostgreSQL)
- [ ] `npm run migrate` then `npm run migrate:generate` — no drift detected
- [ ] `npm run build` — production build succeeds
- [ ] Live self-test (`GET /api/v1/system/self-test`) — 9/9 controls PASS
- [ ] No credential literals: `grep -rl "BeyuOS\|api_key.*=\|BEGIN PRIVATE" src/ tests/` → 0
- [ ] Tenant isolation: sector operator cannot enumerate group topology
- [ ] MFA: 000000 → 401, valid TOTP → 200, replay → 401
- [ ] Audit chain: `verifyAuditChain()` → verified, 0 duplicate parents, head matched
