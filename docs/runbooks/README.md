# BEYU OS — Runbooks

## RB-01 · Bootstrap a fresh environment

```bash
npm ci                        # reproducible install from the committed lockfile
npm run migrate               # apply versioned migrations (scripts/migrate.ts)
npm run seed                  # idempotent constitutional bootstrap
curl -s localhost:3000/api/health
```
`npm run migrate` is the only supported schema-application path in every
environment. `drizzle-kit push` is prohibited outside a disposable local database.
Bootstrap identities are created only when `BEYU_BOOTSTRAP_PASSWORD` is supplied. The seed prints no credentials and refuses production execution without the governed one-time bootstrap override. Rotate or disable bootstrap identities before any production use.

## RB-02 · Verify audit-ledger integrity

```bash
curl -s -b cookiejar localhost:3000/api/v1/system/self-test | jq '.data.results[0]'
```
`CTL-AUD-001` re-hashes the chain. If it reports `BROKEN`:
1. Freeze writes (disable mutating feature flags).
2. Identify `brokenAt` and export the surrounding records.
3. Compare against the last verified backup; treat as a security incident.
4. Re-anchor only with board-recorded authorisation and a genesis event.

## RB-03 · Point-in-time restore (BCP-DATA-02)

1. Snapshot the current cluster (never overwrite the incident state).
2. Provision a shadow cluster and restore to the target timestamp.
3. Run RB-02 against the shadow cluster.
4. Reconcile financial control totals: `sum(debit) = sum(credit)` per entity and period; waterfall
   run `allocated + residual = gross` for every committed run.
5. Cut over; record an audit entry, notify governance, open a post-event review task.

## RB-04 · Emergency (break-glass) access

1. Authorised approver creates an `emergency_access_grants` row: user, permission codes, reason,
   approver, expiry (maximum 4 hours).
2. Notifications are raised to the Chief Governance Officer and Platform Admin.
3. All actions taken under the grant are audited with `authority = EMERGENCY`.
4. Post-event review is mandatory within 5 working days; record the outcome on the grant.

## RB-05 · Regulatory change adoption

1. Change detected → `platform.regulatory_changes` (`DETECTED`).
2. Owner performs an impact assessment (`UNDER_ASSESSMENT`).
3. Governance body approves a policy amendment by resolution.
4. Policy is versioned and effective-dated; the previous version becomes `SUPERSEDED`.
5. The change record is linked to the adopting resolution.
An external legal source never becomes binding BEYU policy automatically.

## RB-06 · Waterfall period execution

1. Confirm the configuration is `ACTIVE` and linked to an approved resolution.
2. Simulate the period at `/os/waterfall`; review formulas, warnings and checksum.
3. Obtain the governance approval named by the policy engine (`ENT-FIN-003`).
4. Commit; the run is stored with checksum, engine version, explanation and resolution reference.
5. Reconcile against treasury movements; never overwrite a committed run — issue a reversal.

## RB-07 · Suspected credential compromise

1. Revoke all sessions for the identity (`sessions.revokedAt`).
2. Set the user `status = SUSPENDED`; force a password reset and MFA re-enrolment.
3. Review the audit ledger filtered by `actorUserId` for the exposure window.
4. Raise an anomaly signal and, if personal data is implicated, trigger breach management.

## RB-08 · Disaster-recovery drill (local, engineering-certified)

The repository's DR doctrine: **schema authority is the migration ledger in
Git** — a database is reconstructable from migrations alone. The drill proves
it end to end against a real PostgreSQL engine:

```bash
BEYU_ADMIN_DATABASE_URL=<admin url> npx tsx scripts/dr-drill.ts
```

Phases: snapshot source (fingerprint, RLS inventory, governed chains, counts)
→ reconstruct a scratch database from NOTHING but the repository migrations
(spawns the real `npm run migrate` runner) → verify fingerprint parity →
restore all data table-by-table in FK-dependency rounds (with json/jsonb and
date value coercion) → validate row-count parity, identical RLS table set,
enterprise-event hash-chain integrity (parity with source), audit chain heads,
service-principal registry → destroy the scratch database. Exit contract 0/1/2
(pass / validation failed / could not run).

This drill runs in CI on every push (root database gate). It certifies the
LOCAL procedure and repository self-sufficiency.

**NOT production restore certification:** production backup/PITR on Supabase,
RTO/RPO measurement against production infrastructure, and a restore drill on
production credentials remain **EXTERNAL_BLOCKED** (blockers X-1 admin
credentials, X-6 drill on production). For the production procedure see
`supabase-production-database.md`.
