# NOELIA — Production Readiness

**Date:** 2026-08-25 · **Gate: ⚪ BLOCKED** (production credentials/runtime unavailable)

## 1. Verified locally (real runtime evidence)

| Link | Status | Evidence |
|---|---|---|
| GitHub → Arena branch | ✅ PASS | `arena/01a035aa-beyu-os-1-0` pushed; tree clean |
| Next.js production build | ✅ PASS | `next build` clean; `next start` serving :3100 |
| PostgreSQL (local 18.4) | ✅ PASS | migrations 0000–0017 applied, seed complete |
| Authentication | ✅ PASS | login + MFA flow exercised by HTTP suites |
| Authorization (RBAC/ABAC) | ✅ PASS | 403s proven (CFO workflow, self-approve) |
| Noelia | ✅ PASS | 1620/1620 tests, live HTTP smoke 12/12 |
| HIVE | ✅ PASS | deterministic internal analyst; external providers DENY |
| Audit | ✅ PASS | hash chain v2; atomic decision+audit+event |
| Events | ✅ PASS | OUTBOX→consumer with watermark |
| Scheduler | ✅ PASS | run-once, dead-letter, replay-safe |
| Workflow | ✅ PASS | full PLAN→…→COMPLETE over HTTP; quorum/expiry gates proven |
| Production HTTP | ✅ PASS (local prod server) | same build artifact as `next build` |

## 2. Blocked (credentials/access unavailable)

- **Vercel project deployment** — no Vercel token/project access in this
  sandbox; project `beyu-os-1-0` has never been deployed from this branch.
- **Supabase production database** — no production project credentials; local
  PostgreSQL stands in for schema/migration/RLS validation only.
- **Production secrets** — never printed, never committed; `.env` is
  gitignored and local-only.

## 3. What production validation will exercise when unblocked

1. `vercel deploy` from `arena/01a035aa-beyu-os-1-0`.
2. Supabase project: run `npm run migrate` against the production pool
   (migrations 0000–0017, checksum-verified) and `npm run seed`.
3. Confirm the app DB role is **non-superuser** so RLS policies
   (`beyu_tenant_ids()` GUC) are actually enforced — the local dev role is a
   superuser (bypasses RLS); the RLS probe test (`beyu_rls_probe`) proves the
   policies enforce isolation for non-superuser roles.
4. Production HTTP chain: health → login+MFA → brief → analyze → workflow
   (plan/validate/authorize/execute) → schedule (create/tick) → audit query.
5. Confirm no secrets leak in logs; error responses sanitized.

## 4. Honesty statement

Local GREEN is **not** production GREEN. This document records the production
gate as ⚪ BLOCKED until the real deployed chain is exercised. No claim in
`NOELIA_*` docs asserts production GREEN.
