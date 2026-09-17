# UJENZI OS — Security Model

**Status:** IMPLEMENTED and VERIFIED. RLS is the final boundary for every Ujenzi table and is
proven by an adversarial runtime-role suite, not by inspection.

## 1. Authorization chain (single engine)

Ujenzi adds **zero** new authorization machinery. Every request traverses the canonical BEYU OS
chain:

```
GlobalUserID → session → RBAC + ABAC → OS scope → tenant → entity → country
  → classification ceiling → capability → policy → RLS → operation
```

- **URLs are never authorization.** Deep links and direct API calls re-authenticate and
  re-authorize server-side on every request (`guarded()` + service-layer re-assertions).
- **No parallel Ujenzi authorization engine exists** — no separate policy store, no separate
  session handling, no Ujenzi-specific middleware chain.

## 2. Permissions and grants

Only two new permission codes (canonical `src/lib/constants.ts`):

- `ujenzi:data.read` — read Ujenzi operational records
- `ujenzi:data.manage` — create/amend Ujenzi operational records

Grants follow the existing role model: sector operators manage; GROUP_CEO has read-only
oversight (POST as CEO → 403, verified live); roles without the grant (e.g. HCM director) get
403 (verified live); a SECTOR_OPERATOR of *agriculture* is refused writes into Ujenzi
(OS-scope check) and sees an empty, RLS-bounded list on reads (verified live).

## 3. Row Level Security — the absolute final boundary

Migration `0043_ujenzi_os.sql`, applied and recorded:

- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on **all 23** `ujenzi_%` tables.
- Exactly **one policy per table**: `ujenzi_tenant_isolation USING
  (tenant_id = ANY (beyu_tenant_ids())) WITH CHECK (tenant_id = ANY (beyu_tenant_ids()))` —
  the same canonical context function every other tenant-owned BEYU table uses.
- The application connects as `beyu_runtime` (NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE —
  attributes asserted in tests), so RLS cannot be bypassed by the app role.

### Adversarial evidence — `tests/security/ujenzi-rls-isolation.test.ts` (11 tests, green)

Connecting as the runtime role with a forged/legitimate context, against tenants
`TEN_BEYU_UJENZI` vs `TEN_BEYU_HEALTH`:

| Attack | Expected | Result |
|---|---|---|
| Role attributes superuser/bypassrls/createrole | all false | PASS (asserted) |
| RLS enabled + forced on all 23 tables, exactly 1 policy, qual contains `beyu_tenant_ids()` | true | PASS (asserted) |
| Cross-tenant SELECT (ujenzi tenant reading health tenant rows) | 0 rows | PASS |
| Cross-tenant SELECT (reverse direction) | 0 rows | PASS |
| Cross-tenant UPDATE | 0 rows affected | PASS |
| Cross-tenant DELETE | 0 rows affected | PASS |
| INSERT with forged foreign `tenant_id` | rejected by WITH CHECK | PASS |
| CHECK constraint: invalid project status | rejected | PASS |
| CHECK constraint: invalid cost kind | rejected | PASS |
| Aggregate isolation (count/sum across tenants) | only own-tenant totals | PASS |
| Empty or invalid tenant context | 0 rows (fail-safe) | PASS |
| Child-table inheritance (BOQ items under a hidden BOQ; attach to foreign BOQ) | hidden / rejected | PASS |

## 4. Classification ceiling (ABAC)

Every Ujenzi table carries `classification`; list endpoints filter rows to the caller's ceiling
(`visibleUjenziItems`, `src/lib/ujenzi/http.ts`). A malformed or missing classification is
treated as **not visible** — never silently downgraded.

## 5. Construction finance boundary

- Ujenzi manages budgets, estimates, BOQ, commitments, forecasts and valuations.
- **Canonical financial truth stays in BEYU Finance OS.** There is no Ujenzi GL, no treasury
  function, no accounting mutation, no second ledger.
- Payment certification produces `CERTIFIED_PENDING_FINANCE_INTEGRATION` records and a
  `PAYMENT_CERTIFIED` event — nothing more. `CAP_POSTING` remains LOCKED fail-closed;
  `requireCapability('CAP_POSTING')` is never bypassed and never called from Ujenzi.
- The dashboard exposes a `financeBoundary` object stating the boundary explicitly (verified
  live over HTTP).

## 6. Audit and events

Every governed mutation runs through the canonical `withAuditTransaction`: the domain write,
its `audit_log` row, and its hash-chained `enterprise_events` append commit atomically or not
at all. There is no Ujenzi-specific audit table, no second event bus, and no unaudited write
path (service functions refuse to write without an actor, or bypass audit only in explicit
seed/test paths).

## 7. Noelia (single AI identity)

One governed tool: `ujenzi.operations.observe` — permission `ujenzi:data.read`, LOW risk class,
read-only, no side effects, fully audited, executed inside the caller's tenant context
(`withTenantDatabaseContext`). Noelia cannot self-authorize, cannot post finance, cannot
approve anything, and no deterministic code is presented as generative AI (no provider is
configured in this environment; the tool is a governed data reader, labeled as such).

## 8. Secrets and operational safety

- No secrets are committed. CI/local values in this programme are non-secret placeholders
  (`ci_*`), and the runtime DB role password used locally is a CI fixture, not a production
  credential.
- No destructive operations: migration 0043 is purely additive; no existing table, policy,
  role, or migration was altered.
- Rate limits: 120 reads/min and 60 writes/min per route through `guarded()`.
