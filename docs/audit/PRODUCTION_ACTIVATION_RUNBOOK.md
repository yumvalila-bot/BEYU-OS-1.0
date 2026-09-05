# BEYU OS Production Activation Runbook

**Purpose:** exact safe sequence to move BEYU OS from current **NOT PRODUCTION READY** state toward production certification.  
**Last updated:** 2026-09-05 UTC  
**Current PR:** #28  
**Current remediation commit:** `7c9e2fb3fe24af5331eccd48eaedca34e745e4f7`

Do not place secrets in source, logs, chat, screenshots, commits, or artifacts. Use only GitHub Actions secrets, Vercel encrypted environment variables, and the managed database secret store.

## 0. Preconditions

- PR #28 merged only after all repository CI checks remain green.
- Production database owner available.
- Vercel project administrator available.
- GitHub repository/environment secrets administrator available.
- Supabase/PostgreSQL admin/migration DSN and runtime-role password available in secure secret manager.
- Controlled non-destructive production test identities approved.

## 1. Configure GitHub Production Database Release Secrets

Set through GitHub UI/CLI by an authorized owner; never print values:

- `BEYU_ADMIN_DATABASE_URL`: Supabase/PostgreSQL admin/migration DSN, session pooler, SSL required.
- `BEYU_RUNTIME_DB_PASSWORD`: password for constrained `beyu_runtime` role.

Verify only presence by running the database release workflow in `preflight` mode. The workflow must fail closed if either is absent.

## 2. Configure Vercel Production Runtime Secrets

Set through Vercel encrypted environment variable store for **Production** scope:

- `DATABASE_URL`: runtime role DSN, non-superuser, no bypass RLS, transaction pooler, SSL required.
- `BEYU_RUNTIME_DATABASE_URL`: same effective runtime DSN for audit/test parity where required.
- `AUTH_SECRET`: 32+ character production session/auth secret.
- `MFA_ENCRYPTION_KEY`: production MFA secret encryption key.
- Any required internal service secrets configured with 32+ random characters.
- `BEYU_ENV=production` if used by production guards.

Do not configure admin/migration DSN as a Vercel runtime variable unless a specific non-runtime migration job requires it. Application runtime must not use admin/superuser credentials.

## 3. Production Database Preflight

From GitHub Actions, run:

- `BEYU OS — database release (GitHub → Supabase)` in `preflight` mode.

Expected:

- Production DSN present.
- Database reachable.
- Migration metadata table readable.
- Pending migrations reported.
- Checksums valid.
- Destructive migration scan passes or requires explicit governed approval.

If this fails, stop. Do not deploy application as production-ready.

## 4. Production Migration Deploy

Only after preflight passes, run the same workflow in `deploy` mode from the approved source commit.

Expected:

- Apply only committed migrations through `scripts/migrate.ts`.
- Provision/constrain runtime role through `scripts/setup-db-role.ts`.
- Verify schema fingerprint against repository expected fingerprint.
- Verify RLS and runtime role attributes.
- Create release provenance record.
- Run production runtime verification.

Never use `drizzle-kit push` against production.

## 5. Vercel Production Redeploy

Redeploy the production application from the certified commit after runtime environment variables are configured.

Expected:

- Deployment succeeds.
- `/api/health/live` returns process `ALIVE`.
- `/api/health` returns database `UP`.
- Public app still loads.
- Protected unauthenticated endpoints still deny access.

## 6. Controlled Production Smoke Test

Using approved test identities and non-destructive fixtures only:

1. Login with MFA.
2. Verify session cookie/token flags.
3. Verify authorization context.
4. Verify one authorized read.
5. Verify one unauthorized read is denied.
6. Verify tenant A cannot read tenant B.
7. Verify entity/country/classification limits.
8. Verify a safe governed mutation if explicitly approved.
9. Verify audit event appended.
10. Logout and verify revoked session fails.

## 7. Finance/CAP_POSTING Decision Gate

Before production certification, decide release scope:

- If CAP_POSTING is in scope: complete governance ratification, activate the capability, and certify posting, idempotency, reversal, immutability, audit, and concurrency.
- If CAP_POSTING is not in scope: formally exclude ledger posting from production activation and ensure the UI/API remain fail-closed with HTTP 423/403 as applicable.

## 8. Flutter Release Scope

Before production certification, decide mobile scope:

- If mobile is in scope: complete MFA and Health flows, configure production API URL, run `flutter analyze`, `flutter test`, and production build in CI.
- If mobile is not in scope: formally exclude Flutter mobile from the production release and prevent distribution.

## 9. Final Zero-Trust Re-Certification

Run a fresh certification, not relying on this runbook or prior reports as proof:

- Root CI green on the final commit.
- Production DB UP.
- Production migration/schema verified.
- Auth/MFA/session certified.
- RBAC/ABAC/tenant/entity/country/classification certified.
- Governance certified.
- Finance/CAP scope certified.
- Health OS production boundary certified.
- Noelia/HIVE authorization certified.
- Audit chain certified.
- DR evidence captured.
- Deployment provenance captured.

Only then may the status be upgraded from **NOT PRODUCTION READY**.
