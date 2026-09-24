# FOUNDATION OS — GAP REGISTER

Baseline: commit `cd2274891e21f8883a471a64e5fb7d280c3753f3` (2026-09-23), branch `main`.
Format follows the repository's existing register convention
(`GAP_REGISTER.md`, `FINANCE_OS_ENGINEERING_GAP_REGISTER.md`,
`docs/UJENZI_OS_GAP_REGISTER.md`).

Severity: **P0** constitutional/security/data-isolation · **P1** major
production capability · **P2** important incomplete functionality ·
**P3** enhancement/documentation.

Status values: `OPEN` · `REMEDIATED` (code landed) · `VERIFIED` (tests prove
behavior) · `EXTERNAL-BLOCKED` · `INTENTIONALLY-DEFERRED` (scoped out with
reason).

---

## Audit method

Statuses below are evidence-based, not source-grep claims. Each substrate was
checked on a **live, freshly migrated PostgreSQL 16 database** (`npm run migrate`
from an empty cluster, then `npm run seed`), not from reading migration files:

- RLS presence read directly from `pg_class.relrowsecurity` and `pg_policies`
- runtime-role privileges read from `information_schema.role_table_grants`
- behaviour probed as the real non-superuser `beyu_runtime`
  (`NOSUPERUSER NOBYPASSRLS`), under controlled `beyu.current_tenant_ids`
  contexts, with `foundations` (RLS-bound) as the in-probe control

Foundation OS was audited as an already-implemented domain, not assumed
incomplete. The substrates below were confirmed to exist and be wired end to
end (database → migration → service → API → authorization → RLS → audit →
event → UI → test).

---

## P0 — constitutional / security / isolation

### FDN-G01 — `foundation_programs` had no Row Level Security (the only Foundation substrate without it)

- **Domain:** Data isolation / RLS / Zero trust
- **Severity:** P0
- **Current state (before):** MISSING
- **Evidence (measured on a live migrated database):**
  - `pg_class.relrowsecurity = false` and `pg_policies` count `0` for
    `foundation_programs`, while all 39 tables created by
    `drizzle/0035_foundation_os.sql` had `relrowsecurity = true` and exactly 1
    policy each.
  - Cross-tenant read as `beyu_runtime` (non-superuser, `rolbypassrls=false`):

    | Tenant context | `foundation_programs` (gap) | `foundations` (control) |
    | --- | --- | --- |
    | `TEN_BEYU_FOUNDATION` | 3 | 1 |
    | `TEN_BEYU_TZ` | **3** | 0 |
    | `TEN_FOREIGN_XYZ` | **3** | 0 |
    | `""` (empty) | **3** | 0 |

  - Root cause: `foundation_programs` is created by
    `drizzle/0000_kernel_v1_baseline.sql` (before the RLS hardening wave), and
    migration 0035's RLS block enumerated **only the 39 tables it created**, so
    the kernel-era program table was never covered.
  - No supporting `tenant_id` index: only `foundation_programs_pkey` existed,
    whereas every 0035 sibling carries a `*_tenant_idx`.
- **Missing behavior:** the canonical `beyu_tenant_ids()` isolation policy on
  `foundation_programs`, enforced by the database independently of any
  application `WHERE` clause.
- **Security impact:** the defence-in-depth guarantee every other Foundation
  substrate has was absent. A single missing `tenantId` predicate in any future
  Foundation query (list, report, knowledge graph, a Noelia tool handler, or a
  migration-written raw statement) would have become a cross-tenant disclosure
  with no database backstop. The application layer filtered on `tenant_id`
  today, so this was not a live API-level leak — it was a silent loss of the
  boundary.
- **Remediation:** `drizzle/0069_foundation_programs_rls.sql`
  - `ALTER TABLE foundation_programs ENABLE ROW LEVEL SECURITY`
  - `DROP POLICY IF EXISTS` + `CREATE POLICY foundation_programs_tenant_isolation
    USING (tenant_id = ANY (beyu_tenant_ids()))
    WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))` — byte-for-byte the
    predicate 0035 applied to the 39 siblings
  - `CREATE INDEX IF NOT EXISTS foundation_programs_tenant_idx`
  - conditional runtime-role `GRANT SELECT, INSERT, UPDATE, DELETE` (fresh
    installs apply migrations *before* `scripts/setup-db-role.ts`)
  - a `DO $$` verification block that `RAISE EXCEPTION`s if the policy or index
    is absent — the migration fails closed
  - `FORCE ROW LEVEL SECURITY` deliberately omitted: all 39 siblings omit it and
    `src/db/seed.ts` inserts through the admin connection with no tenant GUC
- **Repository-controllable:** YES · **External dependency:** NO
- **Verification:**
  - post-apply probe: foreign and empty contexts return **0** rows, owner context
    still returns 3, control table unchanged
  - `tests/security/foundation-rls-isolation.test.ts` (12 tests): structural
    coverage of all 40 substrates + cross-tenant read, `WITH CHECK` insert
    refusal, cross-tenant update refusal, cross-tenant delete no-op, join
    traversal, `SET LOCAL` transaction non-leakage
  - the suite was proven **red without the fix**: disabling the policy and RLS
    makes 11 of 12 assertions fail, then re-applying 0069 through the canonical
    `npm run migrate` runner returns it to 12/12 green (idempotent — identical
    `fingerprintAfter` on re-apply)
  - migration gates: `scripts/migration/integrity.ts` PASSED (0069 registered in
    `KNOWN_METADATA_DEBT`, journal entry present, no snapshot fabricated),
    `scripts/migration/expand-contract.ts` PASSED (0069 classified `EXPAND`,
    70 migrations · 69 EXPAND · 1 CONTRACT), `schema-drift` gate PASSED
- **Status:** VERIFIED

### FDN-G02 — pinned migration-count gates required a coordinated update

- **Domain:** Release / CI gates
- **Severity:** P3 (consequence of FDN-G01, not an independent defect)
- **Current state:** REMEDIATED
- **Detail:** adding a migration trips four self-maintaining gates that pin the
  inventory. All were updated in the repo's established per-migration
  convention rather than relaxed:
  - `.github/workflows/ci.yml` step labels `0000-0068` → `0000-0069`
    (`tests/architecture/p1-migration-labels.test.ts` derives the range from
    the folder and requires the label to match)
  - `tests/release/expand-contract.test.ts` exact-inventory assertion `69` →
    `70`, **plus** a new `verifyP2MigrationIntegrity(69).ok === false` assertion
    so the previous baseline is now rejected
  - five `beyu_migrations` ledger pins (`tests/specialist/{audit-intel,compliance,forecast,risk,treasury}.test.ts`)
    `69` → `70`, each with the conventional `+ 0069:` attribution line
  - `KNOWN_METADATA_DEBT.missingSnapshot` += `"0069"` with a documented
    justification (journal entry present, no snapshot fabricated — identical to
    the 0063–0068 precedent)
- **Status:** VERIFIED (all five suites green)

---

## Observed and intentionally deferred (outside Foundation OS scope)

The audit also surfaced schema tables with no RLS. **None is a Foundation OS
substrate**, so none was changed here — rule: do not refactor unrelated systems
while delivering Foundation OS. They are recorded so the observation is not
lost; each should be raised with its owning domain.

| Table | Owning domain | Observed | Foundation impact |
| --- | --- | --- | --- |
| `beneficiaries` | Family Trust / Family Office (`src/db/schema/people.ts`) — the TRUST beneficiary register, `HIGHLY_RESTRICTED` default | `relrowsecurity = false`; readable by `beyu_runtime` (2 seeded rows) | **None.** Foundation OS uses `foundation_beneficiaries`, which is RLS-bound. |
| `emergency_access_grants` | Identity / break-glass (`src/db/schema/identity.ts`) | `relrowsecurity = false`; 0 rows present | None — not reachable from Foundation routes. |
| `family_vault_items` | Family Office | `relrowsecurity = false`; readable (5 rows) | None. |
| `notifications` | Kernel notifications | `relrowsecurity = false`; readable (11 rows) | None — Foundation has its own `foundation_notification_log`, RLS-bound. |
| `consents` | Kernel | `relrowsecurity = false`; 0 rows present | None. |

Foundation OS scope covers `foundation_*`, `formation_cases`, `structure_*`,
`donors`, `donations`, `donation_pledges`, `funds`, `fund_restrictions`,
`fund_allocations`, `grants`, `grantees`, `grant_milestones`,
`grant_disbursements`, `procurements`, `beneficiary_services`,
`safeguarding_cases` — **all 40 are RLS-bound and verified**.

**Status:** INTENTIONALLY-DEFERRED (non-Foundation substrates; documented, not
silently fixed, not silently ignored).

---

## Closed

| ID | Gap | Severity | Status |
| --- | --- | --- | --- |
| FDN-G01 | `foundation_programs` RLS + tenant index | P0 | VERIFIED |
| FDN-G02 | pinned migration-count gates | P3 | VERIFIED |

**Open Foundation OS gaps: 0.**
