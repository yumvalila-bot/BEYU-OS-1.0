# Secrets Remediation & Rotation — BEYU Health OS

> **Status (Phase 1E, 2026-08-30):** Git history purge **COMPLETE (VERIFIED)**.
> Credential **rotation NOT VERIFIED** and live production infrastructure
> **BLOCKED**. Working tree, reachable history, and remote refs are clean of the
> compromised material; the compromised credentials themselves remain un-rotated
> and must be rotated by the owner before any production use.
> **Verified at Phase 1E:**
> - Working tree / `HEAD` tree: clean — no secret values present.
> - Reachable Git history (`main` + `arena/...`): **clean** — the raw database
>   password literal in `docs/BEYU_HEALTH_OS_AUDIT_AND_GAP_MATRIX.md` was replaced
>   with `<REDACTED>` (commits formerly `7f69400`/`b9023b1`/`f3d2898`).
> - `origin/main` was rewritten: the four credential files and the contaminated
>   base commit `69883d6` are no longer referenced; `main`/`arena/...`/`HEAD` now
>   point to `ab5047e`.
> - **Still REQUIRED (owner):** rotate the compromised credentials.

## What was found
During the Phase 0 audit, live production credentials were committed to the repository (all since purged):

| File (was tracked) | Credential exposed |
|---|---|
| `.env` | Postgres/Supabase `DATABASE_URL` containing a plaintext database password |
| `.env.local` | Supabase URL + publishable (anon) key for the project |
| `NEXT_PUBLIC_SUPABASE_URL=httpssiyzy.txt` | Supabase URL + key (stray credential dump) |
| `VITE_SUPABASE_URL=httpstxcqhrhmredi.txt` | Supabase URL + key (stray credential dump) |
| `docs/BEYU_HEALTH_OS_AUDIT_AND_GAP_MATRIX.md` (historical versions) | raw database **password string** was reproduced in the audit-matrix document (present in commits `7f69400`, `b9023b1`, `f3d2898`) |

A plaintext **database password** and Supabase keys being in a public repository means they must be treated as **compromised**.

## What was done
1. Added a repository root **`.gitignore`** that excludes `.env*`, `.txt` credential dumps, `node_modules/`, `dist/`, logs, and tooling artifacts.
2. Removed the four secret files from the working tree.
3. **Rewrote git history** (`git filter-branch` + prune) to strip those files from every commit on branch `arena/01a05116-health-os-1-0`, then force-pushed the cleaned branch to `origin`.
4. Verified: `git ls-tree -r --name-only HEAD` contains **no** `.env`, `.env.local`, or credential `.txt` files.
5. Kept `.env.example` (placeholders only — safe to commit).

## ⚠️ REQUIRED OWNER ACTIONS — please do these now
1. **Rotate the Supabase database password** (Project Settings → Database → Reset password) and **regenerate the Supabase API keys** (anon + any service keys) for both referenced projects. Treat all previously committed values as compromised regardless of current DNS resolution. (History purge is DONE; rotation is still required.)
2. **Check GitHub secret scanning / Dependabot** alerts for this repo and mark resolved once keys are rotated and history is purged. If GitHub still flags the old blobs, request GitHub Support to purge the unreachable packfile blobs from the rewritten commits.
3. **Re-provision a safe `.env`** for local development using the NEW credentials only, and never commit it. Provide secrets via a secret manager or CI secret store in deployment (see `docs/DEPLOYMENT_GUIDE.md`).
4. **Set `NODE_ENV=production`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and an explicit `CORS_ORIGIN`** allow-list. The backend now fails closed at boot in production when these are missing or default (`backend/src/main.ts`).
5. **Connect Vercel** to this repository and configure production/preview environment variables with the new credentials only; deploy `main`.

## Forward policy (non-negotiable)
- Never commit `.env`, `.env.*`, or any file containing credentials, tokens, or connection strings.
- Use `.env.example` with placeholders for documentation.
- Secrets must live in a secret manager / CI secret store / vault.
- Rotate any credential that is ever committed, even "temporarily".

---

## Phase 1E resolution (2026-08-30)

- **Git history purge: COMPLETE (VERIFIED).** `git-filter-repo` redacted the raw
  database password in `docs/BEYU_HEALTH_OS_AUDIT_AND_GAP_MATRIX.md` to
  `<REDACTED>` and the contaminated base commit `69883d6` (with the four
  credential files) is no longer referenced. `main` and
  `arena/01a05116-health-os-1-0` now point to `ab5047e`; local object DB pruned.
  Reachable-history secret scan: `NOT FOUND`.
- **Credential rotation: NOT VERIFIED / BLOCKED** — no Supabase administration
  access; all previously exposed credentials remain compromised and must be
  rotated by the owner before any production connection.
- **Live database / RLS / authn / authz / MFA / Vercel / deployment: BLOCKED**
  (no infrastructure/credentials/provider in this environment).
- **Regression:** backend 61/10, frontend 14 — green after the rewrite.
- Production gate remains **`BLOCKED`**. See `docs/PHASE_1E_PRODUCTION_VERIFICATION.md`.
