# Foundation OS — remediation and reality findings (2026-11-23)

## Scope of this change

This change is a focused remediation of the compliance in-app notification path. It does **not** certify the complete Foundation OS or production readiness.

### Remediated in this change

- The reminder idempotency log and canonical `notifications` inbox row are now written in one database transaction. A failed inbox insert can no longer leave a success-shaped log entry that suppresses future delivery attempts.
- An existing `FAILED` notification record is retried on a later sweep; records already handed to the canonical notification queue (`SENT`) are treated as duplicates. Transaction-scoped advisory locking serializes creation/retry by tenant and idempotency key; the unique database index remains the final integrity guard.
- Failed in-app enqueue attempts are durably recorded when the database is reachable, and the sweep result reports a trace identifier rather than returning raw database/provider error text.
- Added a database-backed regression test that seeds a failed delivery, verifies the sweep retries it into the canonical queue once, and verifies a repeated sweep does not create a second notification.

### Existing capabilities found and reused

The repository already contains a Foundation operations implementation under `src/lib/foundation/`, a Drizzle schema, migrations `0035` and `0069`, guarded `/api/v1/foundation/*` routes, responsive Foundation pages, and dedicated Foundation domain/security tests. Existing ownership boundaries document reuse of canonical BEYU identity, authorization, HCM, Finance, audit/event facilities, HIVE, and Noelia. This remediation keeps those boundaries; it does not introduce a second identity, worker master, ledger, or AI runtime.

## Verification performed

- `npx eslint src/lib/foundation/compliance.ts tests/foundation/domain.test.ts` — passed.
- Focused TypeScript check of `src/lib/foundation/compliance.ts` and `tests/foundation/domain.test.ts` (with project compiler settings) — passed.
- `npx vitest run tests/foundation/engines.test.ts` — 27 passed.
- `npm audit --omit=dev --audit-level=high` — **failed**: installed Zod 3.x is affected by GHSA-mrhx-c7xc-m3w5; npm reports the direct fix is Zod 4.6.7, a major-version upgrade not included in this focused patch.
- Full repository typecheck did not finish within the available command window under the repository-wide type graph. The initial default-heap run exhausted the Node heap; the later larger-heap attempt remained active beyond the tool window and was stopped. A focused TypeScript check passed instead.
- The database-backed regression test was added but could not be executed locally: the repository's embedded PostgreSQL harness exits during `initdb` because the sandbox image lacks `libpq.so.5`. No production data or schema was modified to work around this.

## Production database evidence (read-only inspection)

The connected Supabase project `yumvalila-bot's Project` in `eu-west-3` was active and healthy for database, REST, Auth, and Storage at inspection time. The database reported PostgreSQL 17.6 and 464 public tables. Read-only catalog inspection found 24 tables whose names begin `foundation`; each inspected table had RLS enabled and one policy. This is a partial prefix-based inventory, not proof of every Foundation-related table or policy behavior.

The application's `public.beyu_migrations` ledger contains repository migration `0075_noelia_authority_execution_hardening` as its latest applied version. A direct query for repository migrations `0076` through `0083` returned no rows. The current checkout contains migrations through `0083_public_content`. This is a production schema/migration alignment blocker requiring an authorized migration plan and evidence; **no live migration was executed**.

The Supabase platform migration list separately reports timestamped migrations through 2026-11-11. That platform list does not establish that the repository's `beyu_migrations` sequence `0076`–`0083` has been applied.

## Remaining major gaps and blockers

- The canonical Foundation target scope in `src/lib/foundation/target-scope.ts` resolves the fixed tenant code `BEYU-FOUNDATION`. That is appropriate for BEYU Foundation operations but does not, by itself, demonstrate SaaS leasing by arbitrary organizations, multiple foundation tenants, or the organization/entity/jurisdiction resolver described in the broader product mandate. A secure, explicitly provisioned tenant-to-Foundation capability registry and authorization design are needed before claiming external SaaS tenancy.
- The full database-backed test suite, RLS behavior tests, API tests, production build, and CI were not run in this sandbox. The PostgreSQL harness prerequisite is unavailable here.
- Production migration alignment, provider-backed out-of-band notification delivery, deployment configuration, operational monitoring, backups, and rollback behavior were not verified by this change.
- The dependency audit reports one high-severity production dependency advisory. Upgrade and compatibility verification remain open.

## Certification

**NOT PRODUCTION READY / NOT COMPLETE.** This change addresses one notification idempotency and retry failure mode only. The broader Foundation OS mandate requires further implementation, a production migration reconciliation, complete integration/security test evidence, CI, and operational verification before any higher readiness classification.
