# BEYU Federation & Trust — Production readiness & human approvals

## Status: IMPLEMENTED, TESTED, AUDITED, DOCUMENTED — HUMAN_REVIEW_REQUIRED

This is the final state the mandate requires: **not** promoted, merged to protected
main, or connected to any live government system. Production promotion, protected-main
merge and live-connector activation all stop at the human gate.

## What is done

- **Core capability** (one shared BEYU OS capability, migration `0071`): 20 tables,
  engine modules (`src/lib/federation/`), catalogue with all state ladders and the
  lifecycle transition table.
- **Tanzania profile + full inventory** as data (`src/db/federation-data/`): 393
  authorities (183 national, 31 regional incl. 5 Zanzibar federal-interface, 177 local,
  2 international), 66 services, 80 domains, 20 legal bases, 15 capabilities, 1
  jurisdiction. All in fail-closed states.
- **DB contract**: RLS on all 20 tables (forced), CHECK gates on the two strongest
  claims, and the runtime role privilege split (registry SELECT-only; operational
  INSERT/UPDATE, no DELETE; approvals INSERT/SELECT). Re-pinned in `setup-db-role` step
  4f.
- **RBAC/ABAC**: the `federation:*` permission set with read/manage split;
  `federation:approve` and `federation:production.*` are HIGH_RISK (MFA step-up); no AI
  role holds approve/production; SoD (requester ≠ approver); tenant/entity isolation +
  classification ceilings + purpose limitation preserved.
- **Governed API** (`/api/v1/federation/*`): 17 routes, all through `guarded()`.
- **UI** (`/os/federation`): explicit status display with the "status is never
  connectivity" posture, independent state dimensions, honest zero-claims.
- **Tests**: deterministic engine contract tests (`tests/federation/engine.test.ts`,
  50 tests) plus the DB-backed gate verifications (RLS isolation, CHECK gates,
  runtime-role privileges).
- **Audits/reports**: `scripts/federation/tanzania-coverage-audit.ts` →
  `docs/federation/tanzania-coverage-report.md` and
  `docs/federation/tanzania-public-access-report.md`.

## Honest current posture (verified, zero-claims)

| Fact | Value |
|---|---|
| Authorities LIVE / LIVE_VERIFIED / MONITORED | **0** |
| FREE_CONFIRMED cost records | **0** |
| GOVESB_LIVE / GOVESB_LIVE_VERIFIED | **0** |
| Registered connectors | **0** (no real credentials exist) |
| Verifications at LIVE or above | **0** |
| Seeded lifecycle state | CLASSIFIED (registration/verification stage) |

The registry is a **complete registration/verification record** of the Tanzania
authority landscape, not a connectivity claim. Nothing is connected, live, verified,
free or GovESB-compliant — and the reports say so.

## Known limitations / open items (deliberate, not defects)

1. **Directory baseline is documented, not live-fetched.** The 325 MDA / 26 regions /
   126 LGAs baseline could not be fetched from the live go.tz directory in the build
   environment (no outbound connectivity to that host). Name-level reconciliation
   against the current official extract is **PENDING**; count-level deltas are recorded
   as `MANUAL_REVIEW`. The registry count (393) differs from the 325 baseline because it
   includes parent ministries with statutory agencies listed individually, regional and
   local authorities, and international bodies — this is expected and documented, but a
   name-level official extract is required to close it.
2. **LGA baseline conflict.** Public sources disagree on the district count (126
   documented vs 158–184 by year/Zanzibar treatment). The seed is best-effort with
   placeholder rows for unconfirmed district compositions, all flagged
   `PENDING_RECONCILIATION`.
3. **No live government connector** exists by design. Real connectors require real
   credentials, authorization and evidence — none exist in this environment, so none
   are created.
4. **Zanzibar** is modeled as 5 federal-interface regional authorities; jurisdiction
   over Zanzibar administration is **not** claimed by the mainland registry.

## Human approval requirements (the gate)

The following are explicitly **not** performed and require human action:

1. **Production promotion** of any authority/service (activation to PRODUCTION_APPROVAL
   and beyond) — `federation:production.activate`, a HIGH_RISK human act requiring a
   recorded approval reference + production evidence.
2. **Protected main merge** of this branch — review this PR first.
3. **Live government connector activation** — provisioning real credentials and
   enabling a connector, which requires the governed credential path and real evidence.
4. **Real credential handling / rotation** in production environments.
5. **Confirmation of the directory baseline** against a live official extract and the
   LGA count, to move the reconciliation from `MANUAL_REVIEW` to `MATCH`.

## How to run the verification locally

```bash
node scripts/infra/pg16-server.mjs start --port 55432
export BEYU_ADMIN_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:55432/beyu_os"
export DATABASE_URL="$BEYU_ADMIN_DATABASE_URL"
export BEYU_RUNTIME_DB_PASSWORD="ephemeral_beyu_runtime_password_not_secret"
export BEYU_BOOTSTRAP_PASSWORD="ci_bootstrap_password_not_a_secret"
npm run migrate
./node_modules/.bin/tsx scripts/setup-db-role.ts
npm run seed
./node_modules/.bin/tsx scripts/federation/tanzania-coverage-audit.ts
./node_modules/.bin/vitest run tests/federation
```

(The passwords above are the same ephemeral literals used by CI; they are not
production secrets.)
