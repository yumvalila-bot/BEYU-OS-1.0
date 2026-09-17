# UJENZI OS — Production Readiness

**Bottom line:** UJENZI OS is repository-VERIFIED: type-check clean, lint clean, production
build clean, full unit/integration suite green (3,538 passed), full suite with a live
production server green (3,728 passed), RLS adversarial suite green, Ujenzi HTTP suite green.
What remains before real production is exclusively **human-controlled** (secrets, hosting,
DNS, legal/financial authority) — listed in §5.

## 1. Verification matrix (all executed in this programme)

| Gate | Command / suite | Result |
|---|---|---|
| Type safety | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors (1 pre-existing warning in `noelia-cross-os-visual.tsx`, main branch) |
| Production build | `npm run build` | green; 14 `/os/ujenzi*` routes in output |
| Migration | `npm run migrate` (embedded PG 16.14) | 0043 applied + recorded; idempotent re-run OK; 44 applied total |
| Runtime role | `scripts/setup-db-role.ts` | `beyu_runtime` NOSUPERUSER/NOBYPASSRLS/NOCREATEROLE (asserted in tests) |
| Seed | `npm run seed` | tenant BEYU-UJENZI, entity BEYU-UJZ, operator user, `UJENZI_OS` registry ACTIVE |
| Domain suite | `tests/ujenzi/os.test.ts` | 22/22 green |
| RLS adversarial | `tests/security/ujenzi-rls-isolation.test.ts` | 11/11 green |
| HTTP (live `next start`) | `tests/ujenzi/http.test.ts` | 11/11 green |
| Control-plane IA | `tests/frontend/control-plane-ia.test.ts` | green (five Sector OSs) |
| Full suite (no server) | `npm test` | 3,538 passed / 0 failed / 218 skipped (198 files) |
| Full suite (live server) | `npm test` with `BEYU_TEST_BASE_URL` | 3,728 passed / 0 failed / 28 skipped (198 files) |

Test-isolation conventions honored: Ujenzi suites clean their own rows FK-ordered, never
truncate the append-only event/audit ledgers, and leave ledger growth to the sanctioned
`ledger-reset` helper used by main-branch suites.

## 2. Repository-controlled deployment posture

- **Migrations:** additive only; safe to run ahead of deploy; no data migration risk (new
  tables start empty).
- **Rollback:** application rollback is safe (Ujenzi routes/pages are new); migration rollback
  is not needed and not provided (append-only convention).
- **CI:** `.github/workflows/ci.yml` already runs migrate → drift → DR drill → role → seed →
  build (×2, second without secrets) → `next start` E2E. Ujenzi is covered by the same steps;
  no CI changes were required by this programme.

## 3. Known pre-existing issues (NOT introduced by Ujenzi; not fixed here)

1. **drizzle-kit `generate` is broken on main** — the 0038/0039 snapshot collision
   (`[0038_snapshot.json, 0039_snapshot.json] … collision`) makes `drizzle-kit generate` fail
   while **exiting 0**, so the CI drift-check step is currently vacuous. Hand-written
   migrations (0040–0043 convention) are the working path. Fixing the snapshot chain is a
   main-branch maintenance task outside this programme's scope.
2. **`tests/specialist/audit-intel.test.ts` "POSITIVE … zero withheld" is a timing-sensitive
   suite** in full parallel runs: `loadEvents()` performs a COUNT then a SELECT
   (non-atomic), while nine main-branch suites call `resetAuditLedgers()` which TRUNCATEs the
   global `enterprise_events` mid-run, and concurrent suites append HIGHLY_RESTRICTED events
   to TEN_BEYU_GROUP. The suite passed in isolation and in 2 of 3 full runs in this
   programme; the failure is a pre-existing shared-DB race, not a Ujenzi regression (Ujenzi
   writes only INTERNAL-classification events in TEN_BEYU_UJENZI and never truncates).

## 4. Risk register (Ujenzi-specific)

| Risk | Status |
|---|---|
| RLS bypass via app role | Mitigated + tested (runtime role attributes asserted; forced RLS; adversarial suite) |
| Cross-sector data leakage | Mitigated + tested (agriculture operator sees 200-with-zero-rows; OS-scope write denial) |
| Second finance truth | Structurally prevented (no posting path; CAP_POSTING never requested; certificates terminal at CERTIFIED_PENDING_FINANCE_INTEGRATION) |
| Unaudited mutation | Structurally prevented (withAuditTransaction on every governed write) |
| Fabricated KPIs in UI | Prevented (dashboard aggregates real tables; explicit unavailable states) |

## 5. HUMAN_REQUIRED / EXTERNAL-BLOCKED (production boundary)

| ID | Need | Human action |
|---|---|---|
| EX-1 | Production `DATABASE_URL` (Supabase/PG) with a provisioned least-privilege runtime role | Supply secret via hosting secret store; run `scripts/setup-db-role.ts` against production; never commit |
| EX-2 | `AUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `BEYU_BOOTSTRAP_PASSWORD` production values | Supply via secret manager; rotate the bootstrap password after first-admin enrollment |
| EX-3 | Hosting deploy (Vercel or equivalent) + custom DNS | Configure project, env vars, domain in the provider dashboards |
| EX-4 | Legal/financial authority to operate BEYU Construction Ltd as a real tenant (contracts, certification sign-off authority) | Board/financial officer decision; enroll real operators; define real certification authority mapping |
| EX-5 | Noelia generative provider (optional) | If/when an AI provider is contracted, configure via existing Noelia model-runtime settings; no code pretends a provider exists today |
| EX-6 | drizzle snapshot chain repair (main-branch maintenance) | Reconcile 0038/0039 snapshots so `drizzle-kit generate`/drift checks become meaningful again |

## 6. Go-live checklist (in order)

1. Provision production DB → run `npm run migrate` → verify 44 applied.
2. Run `scripts/setup-db-role.ts`; verify role attributes.
3. Set production secrets (EX-1/EX-2); deploy (EX-3).
4. Run `npm run seed` with production bootstrap values; complete the first-admin enrollment
   ceremony; rotate the bootstrap password.
5. Enroll real BEYU-UJZ operators (EX-4) with `SECTOR_OPERATOR` + Ujenzi grants.
6. Enter real projects/contracts through the governed API/pages; Finance OS integration for
   certified payments is a separate, human-approved programme (EX-4).
