# BEYU OS 1.0 — Production Root Cause Report

**Generated:** 2026-09-08 · **Base commit:** `cc621ab1e1122a36dc5e2ea6c870589cf7b1d952`
**Branch:** `arena/01a07fbc-beyu-os-1-0`

## Primary root cause — one sentence

> **No governed pipeline run has ever reached the production database, because
> the `live-preflight` job fails closed at its DSN guard before any network
> call, and the Arena token cannot dispatch a workflow to retry it — therefore
> every downstream production gate is *unreachable*, not *broken*.**

The blocker class is **GITHUB PERMISSIONS**, gated behind a **SECRET SCOPE**
question that cannot be observed from this environment.

This is explicitly **not** a `BEYU_BOOTSTRAP_SECRET` problem. Bootstrap is the
*last* link in the chain; the chain breaks at link 3 of 20.

---

## F-CORE-1 · Production database never provisioned

- **ID:** F-CORE-1 · **Severity:** P0 · **Component:** GITHUB / SUPABASE
- **Observed symptom:** `/enroll` and `/api/health` cannot be certified; deploy never runs.
- **Actual root cause:** `db-release.yml` run `34188069360` fails at `live-preflight` **step 3**, "Fail closed if the production DSN secret is not configured" — a `[ -z "$BEYU_ADMIN_DATABASE_URL" ]` test that runs *before* Node is installed. Jobs `deploy`, `release-record`, `runtime-verification` and `drift-report` are consequently **skipped**.
- **Evidence:** step-level job API for run `34188069360`; **zero** `db-live-preflight-*` or `db-deploy-verification-*` artifacts across the repository's entire artifact history.
- **Why previous checks missed it:** earlier reports inferred "database unreachable" from the sandbox's HTTP 000. In fact TCP to `aws-0-eu-west-3.pooler.supabase.com` :5432 and :6543 is **OPEN** from the sandbox — the database was never contacted by the pipeline at all, which is a different failure entirely.
- **Contributing hypothesis (unconfirmed):** `live-preflight` (line 135) declares **no** `environment:` key, so it reads only **repository-scoped** secrets. A `BEYU_ADMIN_DATABASE_URL` configured *only* at Production-environment scope would be invisible to it and fail permanently. Secret metadata returns HTTP 403, so this cannot be confirmed from here.
- **Safe autonomous fix:** none. Requires secret scope verification and a workflow dispatch.
- **Fix performed:** none.
- **Remaining operator action:** verify repository scope, then dispatch `mode=preflight`.

## F-CORE-2 · Arena cannot dispatch or inspect

- **ID:** F-CORE-2 · **Severity:** P0 · **Component:** PERMISSIONS
- **Root cause:** the Arena GitHub App token holds `contents: read` only.
- **Evidence (each recorded once, no retry loop):**
  - `GET /actions/secrets` → 403
  - `GET /environments/Production/secrets` → 403
  - `PUT /environments/Production` → 403
  - `POST /actions/workflows/349014494/dispatches` → 403
  - `POST /actions/runs/34188069360/rerun` and `/rerun-failed-jobs` → 403
- **Fix performed:** none possible; classified **BLOCKED — GITHUB PERMISSION** and all other work continued.

## F-CORE-3 · Production environment has no approval gate

- **ID:** F-CORE-3 · **Severity:** P1 · **Component:** GITHUB
- **Root cause:** environment `Production` (id `20422243779`) has `protection_rules: []`, `can_admins_bypass: true`, `deployment_branch_policy: null`.
- **Consequence:** once `live-preflight` passes, `deploy` executes production DDL **unattended** on the next push to main — its `if:` is satisfied by `github.event_name == 'push'`.
- **Fix performed:** none — modifying environment protection is an explicit human-approval boundary, and the API returns 403 regardless.

---

## F-NEW-1 · MFA production key validation was fail-open ✅ FIXED

- **ID:** F-NEW-1 · **Severity:** P1 · **Component:** CODE / MFA
- **Observed symptom:** none at runtime — a latent cryptographic weakness.
- **Actual root cause:** `src/lib/mfa.ts` `keyMaterial()` rejected **only** the literal placeholder containing `"development-only"`. Every other value was accepted in production and stretched through `sha256()` into a valid-looking AES-256 key. An empty string, a short string, an all-zero key, or the **published** Health OS fixture key `6d6661…6465 64` therefore produced a **deterministic, publicly derivable** key encrypting every TOTP secret at rest.
- **Evidence:** the Health OS service (`sectors/health/backend/src/modules/auth/mfa.service.ts:62`) already enforced `length !== 64`, all-zero, and test-key rejection. The root OS enforced **none** of these — an asymmetry between two halves of the same platform.
- **Why previous checks missed it:** prior audits confirmed the *algorithm* (AES-256-GCM, 12-byte IV, `v1:iv:tag:ct`) and the *documented requirement* (64 hex), then treated the documented requirement as enforced. It was documentation, not code.
- **Safe autonomous fix:** add fail-closed validation in production mode only.
- **Fix performed:** `keyMaterial()` now rejects, when `NODE_ENV === "production"` or `BEYU_ENV === "production"`: the development placeholder; any key under 32 characters; an all-zero key; the published Health fixture key. Error messages state the violated **rule** and never echo the value, its prefix or its length. Non-production behaviour is unchanged, so local development still works.
- **Validation:** `tests/security/mfa-key-strength.test.ts` — 8 tests. Proven to be genuine regression coverage: **5 fail against the original `mfa.ts`, 8 pass against the fixed version.**
- **Remaining operator action:** set `MFA_ENCRYPTION_KEY` to 64 lowercase hex in Vercel Production.

## F-NEW-2 · Database tooling leaked infrastructure topology ✅ FIXED

- **ID:** F-NEW-2 · **Severity:** P1 · **Component:** CI / CODE
- **Observed symptom:** none yet — the leak requires a connection failure *after* the DSN guard passes, which has never occurred because the guard has always failed first. This would have fired on the operator's **very next** preflight attempt.
- **Actual root cause:** `scripts/db-release.ts:120`, `scripts/migrate.ts:130` and `scripts/setup-db-role.ts:233` serialised `String(e)` directly into stdout — and, for db-release, into the uploaded `db-live-preflight-<run_id>` / `db-deploy-verification-<run_id>` artifacts.
- **Evidence (empirical, this session):** a real `pg` connection failure yields
  `Error: getaddrinfo ENOTFOUND db.example-host.supabase.co` — **LEAKS HOSTNAME: true**, LEAKS PASSWORD: false.
  GitHub Actions masks a registered secret only on an **exact** string match; a driver error reproduces a *fragment* of the DSN, not the DSN itself. The production hostname and Supabase project ref would appear **unmasked** in a public-by-default log and in a downloadable artifact.
- **Why previous checks missed it:** prior audits verified that no step *echoes* the secret variable and that no artifact *serialises* the DSN field. Both were true. The leak was in the **error path**, which had never executed.
- **Safe autonomous fix:** redact at the boundary while preserving diagnostic value.
- **Fix performed:** new `scripts/lib/sanitize-error.ts` maps a driver error to a fixed vocabulary of failure classes (`DNS_RESOLUTION_FAILED`, `CONNECTION_REFUSED`, `CONNECTION_TIMEOUT`, `TLS_FAILURE`, `AUTHENTICATION_FAILED`, `HBA_REJECTED`, `PERMISSION_DENIED`, …) plus the SQLSTATE, which is a public PostgreSQL constant. Unrecognised errors collapse to `UNCLASSIFIED_DATABASE_ERROR` — deliberately opaque, since an unmodelled message may embed connection detail. No caller-supplied text is ever passed through. Wired into all three scripts.
- **Validation:** `tests/security/db-tooling-error-redaction.test.ts` — 9 tests asserting that hostname, username, password, DSN, project ref, port and IP never survive sanitisation, and that the failure class and SQLSTATE are preserved.
- **Operator benefit:** the next preflight will report e.g. `AUTHENTICATION_FAILED (SQLSTATE 28P01)` — more actionable than a raw stack trace, and safe to paste into an issue.

---

## Non-findings — explicitly cleared

| Candidate | Verdict |
|---|---|
| `BEYU_BOOTSTRAP_SECRET` missing | **NOT the blocker.** Bootstrap is link 12 of 20; the chain breaks at link 3. |
| Vercel deployment broken | **NO.** Deployment `6320808378` (sha `cc621ab`) is `success`. |
| Production application DOWN | **NO — UNVERIFIED.** Sandbox egress to `*.vercel.app` fails at TLS ClientHello. DNS resolves, TCP :443 connects. This is a sandbox restriction, never an outage. |
| Supabase unreachable | **NO.** TCP :5432 and :6543 are OPEN from the sandbox. |
| Migration drift | **NO.** 36/36 applied, fingerprint `c07b19e76b286fe9f1a7cb2dfa40fb75`, `pending`/`unexpected`/`modified` all empty. |
| Agriculture gates #9/#12 failing | **NO — stale.** Recorded against sha `0eaa71de` under a 44-policy schema; current main is 174 policies and both gates pass at CI tier. |
| Secrets in git history | **NO.** 284 commits across 40 branches scanned; zero credential hits. |
| Test-suite failures | **NO — harness artefact.** Mis-setting `BEYU_TEST_DATABASE_URL` to the runtime role produces hundreds of spurious RLS failures. At CI parity: 2583 passed, 0 failed. |

---

## Blocker classification

| Class | Findings |
|---|---|
| **PERMISSIONS** | F-CORE-2 (primary) |
| **GITHUB** | F-CORE-1, F-CORE-3 |
| **CODE** | F-NEW-1, F-NEW-2 — **both fixed** |
| **NETWORK** (sandbox only) | production HTTP unverifiable |
| **SDK** | Flutter/Dart absent |
| **EXTERNAL DEPLOYMENT** | Health OS |
| **HUMAN APPROVAL** | bootstrap sealing, environment reviewers |

**Every CODE-class blocker is now closed.** What remains is permissions,
external access and human-controlled activation.
