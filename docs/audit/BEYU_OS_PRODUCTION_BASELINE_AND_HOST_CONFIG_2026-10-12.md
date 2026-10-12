# BEYU OS — production baseline, host-configuration contract and authenticated-journey matrix

**Date:** 2026-10-12 · **Baseline (main):** `9669640` · **Branch under review:** `arena/cc54151c-beyu-os-1-0`
**Companion to:** `BEYU_OS_POST_LOGIN_FAILURE_AUDIT_2026-10-12.md` (root cause of the post-sign-in failure)
**Change control:** diagnosis only. No push to `main`, no merge, no deploy, no rollback, no DNS/TLS/registrar
change, no production migration, no secret read, no production environment variable changed.

---

## 1. Production baseline (measured, not inferred)

`GET https://beyu.co.tz/api/health/identity` — the repository's own unauthenticated, information-free
release-identity endpoint — observed **2026-10-12T10:00:20Z**. The request was served from
**`https://www.beyu.co.tz`**, i.e. the apex **redirected to www** (see §5). Response body:

```json
{"ok":true,"system":"BEYU-OS/1.0.0","identity":{
  "releaseId":"REL_96696400_8736f534f090",
  "gitSha":"9669640037f69366c1e75bd051b8c2f545b8151a",
  "repository":"BEYU-OS-1.0",
  "buildId":"build-1791779189005-fitskq",
  "deploymentId":"dpl_7rG3nwA4LuqMWk5aL3n6gqhnEZo9",
  "environment":"production",
  "applicationVersion":"BEYU-OS/1.0.0",
  "runtimeVersion":"BEYU-OS/1.0.0",
  "schemaVersion":null,
  "migrationFingerprint":null,
  "latestMigration":"0047_release_approvals",
  "releaseTimestamp":"2026-10-12T04:26:29.005Z"},
 "at":"2026-10-12T10:00:20.091Z"}
```

| Fact | Value | How it was established |
| --- | --- | --- |
| Production SHA | **`9669640037f69366c1e75bd051b8c2f545b8151a`** = **main HEAD** | production's own identity endpoint |
| Production build time | 2026-10-12T04:26:29Z — **21 s after** PR #105's merge commit (`04:26:08Z`) | same endpoint; Vercel Git integration |
| Deployment id | `dpl_7rG3nwA4LuqMWk5aL3n6gqhnEZo9` (env `production`) | same endpoint |
| Production readiness | `GET /api/health` → `{"ok":true,"checks":{"database":"UP"},"latencyMs":698}` — the database is **reachable** | live |
| Production expected-migration fact | `latestMigration: "0047_release_approvals"` — a **frozen build literal**, 28 migrations stale | same endpoint; the defect fixed in PR #106 |
| Production host routing | **inert**: `https://health.beyu.co.tz/` serves the **generic control-plane** sign-in ("Sign in to the control plane"), not the Health OS entry | live fetch + differential reproduction, §4 |
| New diagnostic | `GET /api/health/schema` → the 404 "Page not found" surface — production is **not** running this branch | live |

**There is no deployment drift at the commit level: production runs exactly main HEAD.** The drift is in
the **database** and in **one environment variable**, both evidenced below.

### 1.1 Migration-apply history (why the database is behind)

Only the `db-release` **deploy** job runs `scripts/migrate.ts` against production. Every run since the
last successful one:

| Run | Event | Result | Note |
| --- | --- | --- | --- |
| `37955264218` @ `86dc7e77` | push | **success** (2026-10-09T15:55Z) | last successful apply; that revision's journal ends at **`0074_enterprise_intelligence_expansion`** |
| `38018982829` @ `5cdaf171` | push | failure | the push that shipped **0075**; deploy job failed at step 3 **"Fail closed if production secrets are not configured"** → *apply migrations* step **skipped** |
| `38025828217` @ `2c9db21b` | push | failure | `Migration validation (scratch PostgreSQL 16)` fails **at job setup** (`steps: []`, 0 steps executed, 2 s), and all six later jobs — including the deploy — are `skipped` |
| `38052360038` @ `2c9db21b` | **workflow_dispatch** | failure | the only dispatch after #104 made the mutating jobs dispatch-only; identical signature: validation job fails before any step, every later job `skipped` |
| `38157765676` @ `897ff08b` | push | failure | same pre-step signature |
| `38203769950` @ `9669640` | push | failure | same pre-step signature |

The "fails before any step executes" signature is the repository-level runner condition also described in
PR #106 §3 (it affects jobs unrelated to this change, on `main` as well); those runs therefore never
reached a migration attempt at all. The decisive evidence remains `38018982829`, whose deploy job ran
normally and failed **closed** at the secrets guard, skipping the apply step.

**Conclusion: no production migration has been applied since `86dc7e77` (journal 0074).** 0075 — whose
column `role_assignments.global_scope` the production artifact reads on every authenticated request —
has never reached production. Combined with §1 (production = `9669640`, which contains that read), this
closes the root-cause chain from the *production* side. The one link that cannot be observed from here
is the production database itself; it is inferred from the pipeline history above, which is the only
path that applies migrations.

---

## 2. Configuration contract (code evidence, exhaustively searched)

Every read/write/validation/default/test/doc reference to the two variables was enumerated.

### `BEYU_CANONICAL_DOMAIN`

| Aspect | Finding |
| --- | --- |
| Consumers (code) | `src/lib/canonical-hosts.ts:143` (`canonicalHostOptionsFromEnvironment`), `src/lib/session-cookie.ts:58,69` |
| Nature | **runtime** `process.env` read on each request path that resolves a host — not a `NEXT_PUBLIC_*` value, not inlined at build time |
| Required? | **Required for the canonical destination experiences.** Without it `resolveCanonicalHost()` returns `NEUTRAL` for **every** host (`src/lib/canonical-hosts.ts:33`, `src/proxy.ts:26`), so no host selects a destination and the proxy's cross-OS redirect / foreign-Foundation rules never fire |
| Absent | fail-safe: every host = NEUTRAL = the control-plane experience; nothing is granted, nothing breaks |
| Malformed (e.g. `"not a domain"`) | resolution **disabled**, never guessed — asserted by `tests/sector-domains/unified-host-routing.test.ts:232` |
| Documented value | `beyu.co.tz` — `.env.example:213`, `docs/architecture/SECTOR_OS_SUBDOMAINS.md:83,276`, and CI's own server (`ci.yml:511`) |
| Stale build embedding | **not possible**: it is a runtime read, so a redeploy is not required for a *change* to take effect on a new instance, but the value must exist in the Production scope of the environment for the instance to see it |
| Security weight | **presentation only** — selecting a destination grants nothing; every destination re-runs its own gate, and `docs/architecture/SECTOR_OS_SUBDOMAINS.md:216` states the cookie rule separately |

### `BEYU_SESSION_COOKIE_DOMAIN`

| Aspect | Finding |
| --- | --- |
| Consumers | `src/lib/session-cookie.ts:58,69` only |
| Required? | **No.** It is the opt-in for cross-host SSO |
| Effect when absent (measured, §3) | cookie is host-only: `beyu_os_session=<opaque>; Path=/; Expires=…; Secure; HttpOnly; SameSite=lax` — **no `Domain`** |
| Effect when set | applied **only** if it equals `BEYU_CANONICAL_DOMAIN` exactly *and* the request host is that apex or a subdomain; a `*.vercel.app`/`localhost` request never receives a domain-scoped cookie; `Secure` is then forced |
| Recommendation | **Do not set it** unless cross-host single sign-on is an explicit, reviewed decision: it broadens a session credential to every canonical subdomain. Absence is not a defect, and the master prompt's instruction not to broaden the cookie stands |

**No source of stale embedded value exists for either variable** (both are runtime reads; neither is
`NEXT_PUBLIC_`). The only build-time identity value in this area is `latestMigration`, which *was* a
frozen literal — now derived from the journal in PR #106, and demonstrated stale in production (§1).

---

## 3. Differential reproduction — the production configuration, reproduced locally

The same production build was served twice, differing **only** in that one variable
(`next start`, `NODE_ENV=production`):

| Host | `:3101` — `BEYU_CANONICAL_DOMAIN` **unset** | `:3100` — `BEYU_CANONICAL_DOMAIN=beyu.co.tz` | **Production** (live fetch) |
| --- | --- | --- | --- |
| `beyu.co.tz` | Sign in to the control plane | Sign in to the control plane | — |
| `www.beyu.co.tz` | Sign in to the control plane | Sign in to the control plane | (apex 308s here) |
| `health.beyu.co.tz` | **Sign in to the control plane** | **Sign in to Health OS — governed by BEYU OS** | **Sign in to the control plane** |
| `finance.beyu.co.tz` | Sign in to the control plane | Sign in to Finance OS — governed by BEYU OS | — |

Production's observable behaviour is **identical to the unset build**. This converts the earlier
dashboard observation ("no `BEYU_CANONICAL_DOMAIN` entry in the environment list") into
**runtime-confirmed evidence**, which is exactly the standard the master prompt set for touching either
variable.

---

## 4. Apex → www (HTTP 308) — consistency verdict: **consistent; do not change**

Observed live (the identity fetch in §1 was served from `www` after following the apex redirect).

| Check | Finding | Verdict |
| --- | --- | --- |
| Destination classification | apex and `www` both resolve `CONTROL_PLANE` → **HOME** (`src/lib/canonical-hosts.ts`), so the redirect keeps the user in HOME | consistent |
| Method/body/path preservation | 308 preserves method and body (unlike 301/302), so deep links (`/launcher`, `/os/...`) and POSTs survive | consistent |
| Cookie/session | the session cookie is **host-only** in production (measured, §3); after the apex always redirects, the browser's document origin is `www`, so the cookie set on `www` is always sent back to `www` — no session loss | consistent |
| Cross-destination SSO | not provided by default (host-only), so the redirect neither breaks nor silently enables sharing a session with `finance`/`health`/… | consistent |
| Origin fence interaction | a POST that traverses the redirect carries `Origin: https://beyu.co.tz` onto host `www`. **With** the variable set, the canonical-peer rule permits it (observed: **422** = fence passed, authorization ran). **With the variable unset — production today — it is refused with a bare 403** (observed) | **latent inconsistency, caused by the missing variable, not by the redirect** |
| Reachability of that case from the UI | all application fetches are **relative** (`sign-in-form.tsx` posts to `/api/v1/auth/login`), so the document origin is `www` and the foreign-Origin branch never triggers from BEYU's own UI; server-to-server callers send no `Origin` and pass | narrow |
| Decision | **leave the redirect as is** (explicitly instructed by the master prompt). Setting `BEYU_CANONICAL_DOMAIN` removes the inconsistency as a side effect, because it re-enables the canonical-peer rule that already exists and is already tested | no change |

---

## 5. Authenticated-journey matrix (Phase 4)

Executed with raw HTTP against the same production build, on **both** configurations, using sandbox
synthetic identities (`cfo@beyu.os`, `admin@beyu.os`) with real TOTP sessions. Every row was observed;
none is inferred. Verdicts: the "*unset*" column is the production-equivalent configuration.

| # | Test | Route / host | Role | Configured (:3100) | Unset (:3101) — production-equivalent | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| A | signed-out direct visit, 9 hosts | `/` on each canonical host | anonymous | each destination shows **its own** sign-in; control plane for apex/www; **no protected data** in the HTML | every host shows the **generic control-plane** sign-in; still no protected data | **PASS** (A: destination copy only in the configured build; that is the config gap, §3) |
| B | entitled sign-in → destination loads | `finance.beyu.co.tz/` → `/os/finance`; `familyoffice…`; `noelia…` | cfo / family / admin | **307 → the destination's own route, 200** | 307 → `/os/...` also served (host selection is inert, the route still works) | **PASS** (screenshots 17–22, `inventory.json`) |
| C | signed-in, not entitled | `health.beyu.co.tz/`, `ujenzi.beyu.co.tz/`, `/os/ujenzi` | cfo | explicit **"You are signed in, but you are not authorized for …"**; in-shell "Authorisation denied — required capability" | denial copy is reached only via the in-shell route (the destination host never claims a destination) | **PASS** (screenshots 11, 12, 23, 24) |
| D | deep link, **no session** | `/os/health`, `/os/finance`, `/os/foundation`, `/os/noelia`, `/os` | anonymous | **307 → `/`**, never 200, never 5xx, **no protected data** | identical | **PASS** |
| E | spoofed forwarded host | `Host: beyu.co.tz` + `X-Forwarded-Host: finance.beyu.co.tz` / `evil.example.com`, `X-Forwarded-Proto: https` | anonymous | stays **control plane** — no destination selected | identical | **PASS** |
| F | expired/revoked session | `/os` with a forged cookie | forged | **307 → `/`** (never a 500) and the sign-in surface carries **"Your previous BEYU session has expired or was signed out…"** | identical | **PASS** |
| G | server/API authority independent of the UI | `POST /api/v1/system/release/approvals`, `GET /api/v1/system/posture` | cfo vs admin | cfo **403 RBAC/ABAC** (audited) · admin **422** validation only · granted read **200** · foreign `Origin` **403** | identical (`403` for cfo; `422` for admin) | **PASS** |
| H | apex/www redirect + session | apex → www; login on `www` | cfo | cookie `Path=/; Secure; HttpOnly; SameSite=lax`, **no `Domain`**; session on `www` works; `/` with a session → 307 `/launcher` | identical | **PASS** (§4) |
| — | cross-OS path on a foreign host | `/os/finance` on `health.beyu.co.tz` | cfo | **307 → `https://finance.beyu.co.tz/os/finance`** (target from the catalogue + config, never from the request) | **200 served in place** (proxy inert) | **INFO** — the configured build behaves as documented; the difference is the config gap |

**Verifier note (honesty about method).** The automated probe flagged `finance.beyu.co.tz` as
"protected data present". Manual inspection shows this is a **false positive of the harness**: the only
match is the literal `CAP_POSTING`, which appears three times in the destination's **public sign-in
copy** ("CAP_POSTING stays separately governed—an ACTIVE Finance OS does not enable posting"). The
markers `General Ledger`, `Chart of Accounts`, `journal entries` and `DATA_NOT_AVAILABLE` occur **zero**
times on that page. No protected data is disclosed; the detector's marker set was too broad.

---

## 6. Screenshot artifact metadata (Phase 5)

`docs/audit/evidence/2026-10-12-post-login-failure/inventory.json` now records, per capture:
`file`, `url`, `viewport`, `role`, `scenario`, `httpStatus`, `pageTitle`, `visibleText`,
`errorBoundaryScreen`, **`capturedAtUtc`**, **`testedCommit`**, `capturedBuild` and `runtime`.

* Capture window: **2026-10-12T08:58:46Z → 09:02:20Z** (41 captures).
* `testedCommit` = `128bea3`; the captured build is **code-identical** to `b5c4430`
  (`git diff --stat b5c4430..128bea3` = one docs file, 290 insertions, **zero code changes**).
* The failure screen ("could not load this view") is **absent in 41/41** captures.
* PNG file mtimes in the artifact directory were normalised to the recorded capture times so the
  artifact is internally consistent.
* Screenshots are **visual verification only** and do not replace the automated security/RLS suites.

---

## 7. What must change in production, and what must not

**Human-run plan (no step is executed by this audit).**

1. **Apply migration 0075 through the governed database-release path** — the actual fix for the
   post-sign-in failure. Today the `deploy` job fails closed at *"Fail closed if production secrets are
   not configured"*; that is an operator action on the repository/Vercel environment, and the secrets
   themselves must never be handled through this workflow.
2. **Add `BEYU_CANONICAL_DOMAIN=beyu.co.tz` to the Production environment scope** so the canonical
   destination hosts select their destinations (§2–§3). Runtime read ⇒ takes effect on the next
   deployment/instance; no code change, no build-time embedding. **Do not** add
   `BEYU_SESSION_COOKIE_DOMAIN` unless cross-host SSO is separately decided (§2).
3. **Verify**: `GET /api/health/schema` → `CURRENT`; `https://health.beyu.co.tz/` → "Sign in to Health
   OS"; sign in as a synthetic account and confirm the destination loads; confirm
   `https://beyu.co.tz/api/health/identity` reports the real journal head rather than `0047_…`.
4. Ordering: (1) before (2) is preferred (fix the outage, then widen routing), but neither is unsafe
   alone — with the database unmigrated, every authenticated request fails regardless of host
   resolution, and with the variable unset no destination frontend can be reached on its own subdomain.

**Must not change:** the apex→www 308 (§4), the host-only cookie default, MFA/CSRF/audit/RLS, the
`CAP_POSTING` lock, and any production secret value.

---

## 8. Confirmation

Production was **read only**, through public unauthenticated endpoints, plus one public JSON response.
No credential was used, no secret was viewed, no environment variable, DNS record, deployment,
migration or production database was modified.
