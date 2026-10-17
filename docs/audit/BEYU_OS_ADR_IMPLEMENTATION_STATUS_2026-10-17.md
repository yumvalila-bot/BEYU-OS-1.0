# BEYU OS — ADR implementation status reconciliation

**Date:** 2026-10-17
**Scope:** audit findings P0–P3 and architecture decisions D1–D7
**Compared against:** `origin/main` at `05e2fba`
**Method:** every statement below was read from the repository at that commit, not
from notes or memory. Where a claim is a negative ("no reference exists"), the
search that produced it is named.

## Why this document exists

Work on this branch started from `2bcff13`. While it was in progress, `main`
advanced by 28 commits (PRs #102, #96, #98, #104, #105, #106). Several of the
items this branch set out to implement were implemented on `main` independently,
in some cases more thoroughly than the branch's own version. Landing the branch
as it stood would have reverted that work, so each item was re-checked against
`main` before anything was committed. This file records the result.

## Already on `main` — not re-done here

### P1 · fail-closed inbound communications webhooks — CLOSED on `main`

`main` commit `a054caa` ("PR-1: fail-closed inbound communications webhooks
(C-1)", merged in PR #104 at `2c9db21`) added `src/lib/communications/
webhook-signature.ts` (319 lines). It is a superset of this branch's version:

- three schemes selected by `provider_type`, never by request content:
  `META_HMAC_SHA256`, `TWILIO_HMAC_SHA1`, `BEYU_TIMESTAMPED_HMAC_SHA256`;
- any other provider type, including every `*_SIMULATED` type, is refused with
  `SIGNATURE_SCHEME_NOT_IMPLEMENTED`;
- a signing secret may only be an environment variable *name* matching
  `/^[A-Z][A-Z0-9_]{2,63}$/`, must be at least 16 characters, and must not be
  one of a denylist of platform credentials (`DATABASE_URL`, `AUTH_SECRET`,
  `MFA_ENCRYPTION_KEY`, `BEYU_INTERNAL_SERVICE_TOKEN`, …).

The branch's own 144-line module covered only Meta and a generic scheme and had
no credential-reuse denylist. **`main`'s implementation was kept and the
branch's was discarded.**

### P3 · production dependency boundary — CLOSED on `main`

PR #102 (`04384e6`) shipped `8b72984` (root production dependency graph +
`proxy-addr`), `11c20e1` (vitest 4.1.11, removing tinypool) and `6db44b4` (Health
OS `proxy-addr` advisory), plus `docs/security/PRODUCTION_DEPENDENCY_AUDIT_
REMEDIATION.md` and `tests/security/production-dependency-boundary.test.ts`
(19 tests, passing on this tree). Nothing to add.

### D1 · four canonical Sector OSes; Foundation is not one — CLOSED on `main`

Verified at `origin/main`:

- `src/lib/operating-system-catalog.ts` documents `SECTOR_OS` as
  "constitutionally closed at four entries" and types `DestinationType` as
  `CORE | SECTOR_OS | NONPROFIT | CAPABILITY | AI_INTERFACE`.
- The four sector destinations are finance, health, agriculture and ujenzi.
- Foundation is `code: "FOUNDATION"`, `kind: "NONPROFIT_SISTER_ORGANIZATION"`,
  described as "a separate sister organization—not a Sector LLC, subsidiary,
  Sector OS, or independently invented OS-suffixed authority".
- `git grep FOUNDATION_OS origin/main -- src/` → **no matches**.
- `git grep MINING_OS origin/main -- src/` → **no matches**.
- `src/db/seed.ts` registers `SHARED_FOUNDATION_OPERATIONS` as
  `kind: "SHARED_CAPABILITY"` with the purpose "Governed nonprofit operations
  capability serving the separate BEYU Foundation sister organization; never a
  subsidiary or Sector OS."

This branch had reached the same conclusion by a different route (keeping the
`FOUNDATION_OS` registry code as `NONPROFIT_ORGANIZATION` and redirecting the
retired `foundation.<apex>` host). `main`'s route is cleaner — it removes the
OS-suffixed identity rather than reclassifying it — and it is already merged and
tested, so **the branch's D1 migration `0075` and its ~40 file edits were
discarded.**

### D2 · production migration gate — PARTIALLY on `main`; completed here

PR #104 commit `02cef5b` ("PR-5: make production migrations explicit-only
(H-9/H-11, D-6)") already removed `push` from the mutating jobs and put
`environment: Production` on `deploy`. Two gaps remained and are closed by this
PR — see below.

## Added by this PR

### P2 · MFA key material fails closed before any fallback

`src/lib/mfa.ts` on `main` computes

```ts
const raw = process.env.MFA_ENCRYPTION_KEY ?? process.env.AUTH_SECRET
  ?? "development-only-mfa-key-change-before-production";
```

and only afterwards checks whether it is production, catching the placeholder by
string match (`raw.includes("development-only")`). Production therefore *is*
already rejected — but the development literal is reachable in the production
code path, and the guard depends on its exact spelling. This PR inverts the
order: the production branch is evaluated first, a missing or empty key throws
before any fallback is considered, and the literal moves to
`DEVELOPMENT_MFA_KEY_MATERIAL`, consulted only on non-production runtimes.
`tests/security/mfa-production-fail-closed.test.ts` (5 tests) pins it.

### D2 · the remaining production-gate gaps

Two gaps found while re-verifying `main`'s workflow:

1. **`live-preflight` ran on every push to `main` while holding
   `BEYU_ADMIN_DATABASE_URL`.** An environment-scoped secret is only reachable
   from a job bound to that environment, so a job that reads production cannot
   both run on push and keep the secret environment-scoped. The job is now
   dispatch-only, restricted to `refs/heads/main`, and bound to `Production`.
   `mode=preflight` still produces the same read-only plan on demand and the
   scheduled drift report still covers unattended drift.
2. **`pvg` read `BEYU_ADMIN_DATABASE_URL` with no `environment:` binding**, so it
   required that secret to stay repository-wide. It is now bound to
   `Production`, matching every other production-reading job.

Also added: `change_reference` and `backup_reference` dispatch inputs, without
which `deploy` refuses to start; `refs/heads/main` restriction on `deploy`,
`release-record`, `runtime-verify`, `pvg` and `drift-report`; the
`Production`-environment binding on the runtime DSN diagnostic; and
`docs/deployment/PRODUCTION_ENVIRONMENT_GATE.md`.

`tests/release/db-release-dispatch-only.test.ts` previously asserted that
`live-preflight` *may* run on push. That assertion was tightened, not deleted —
it now asserts the job does not run on push, is dispatch-only and is main-only.
The comment in the test records why.

## Still open — not attempted here

| Item | Evidence at `origin/main` `05e2fba` |
| --- | --- |
| **D3** Health entry page | Not addressed by this branch. |
| **D4** Production provider inventory | Requires an authorized operator with production config access; cannot be produced from the repository alone. |
| **D5** Personal-data RLS | `tests/security/family-office-rls-isolation.test.ts` lines 172–184 still exclude `family_members` and `family_vault_items` from the "every table is RLS-enabled and carries a policy" assertion by exact name. |
| **D6** Generated SPA artifact | `src/app/health/os/spa-content.ts` is still tracked at 1,088,946 bytes. |
| **D7** Validated `next` parameter | No `next` handling exists in `src/app/page.tsx`, `src/app/sign-in/page.tsx` or `src/app/sign-in-form.tsx`; `requirePrincipal()` in `src/lib/guard.ts` still unconditionally `redirect("/")`. |

## Correction to earlier reporting

An earlier status report for this branch described commits `9766938`, `dff504e`
and `8a4c228` as landed, and `04384e6` as the branch base. The three commits do
not exist in this repository — `git cat-file -t` fails for each of them — and the
branch had **zero** commits above `2bcff13`. `04384e6` is a real commit (the
merge of PR #102, and an ancestor of `origin/main`), but it was never this
branch's base. All of that reported work existed only as uncommitted changes in
the working tree. This document, and the commit that accompanies it, reflect the
verified state instead.
