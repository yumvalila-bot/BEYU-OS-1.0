# BEYU OS Production Supabase TLS Trust Verification

**Date:** 2026-09-11  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Current HEAD SHA:** `fb183599f7a5ee7b4937c50f93e9cf6199225343`  
**Pull Request:** #51 (MERGED into `main`)  
**Working Branch:** `arena/01a08f9d-beyu-os-1-0`  
**Classification Standard:** Facts only, labeled OBSERVED, VERIFIED, or BLOCKED.

---

## 1. Reality Audit & Repository State — OBSERVED

- **Current Branch:** `arena/01a08f9d-beyu-os-1-0` (branched from `fb183599f7a5ee7b4937c50f93e9cf6199225343` of `main`).
- **PR #51 State:** MERGED at `2026-09-10T10:43:28Z` (merge commit `fb183599f7a5ee7b4937c50f93e9cf6199225343`).
- **PR #51 Base SHA:** `6a1f25c3eb3e7bc469a2a7c47e4f20d5bc5307ac`
- **PR #51 Head SHA:** `d25ec3ed5acb0f70de8c64dda97575d1c6c68a29`
- **CI on Main (run 34467551441):** `BEYU OS CI — PostgreSQL-backed security gate` **SUCCESS** (all jobs green).
- **Release Pipeline (run 34467551447 / 34482417181):**
  - Migration validation (scratch PostgreSQL 16): **SUCCESS**
  - Production preflight (read-only): **SUCCESS**
  - Production database deploy + verify: **SUCCESS** (migrations applied, runtime role verified, schema fingerprint verified)
  - Three-way release record: **SUCCESS** (tag `db-release-fb183599-118`)
  - Runtime verification (production `/api/health`): **FAILED** (polled 12 minutes; Vercel production environment not yet updated with `sslmode=verify-full`).

---

## 2. Production Endpoint Identity (Safe Metadata) — VERIFIED

| Attribute | Value | Provenance |
| --- | --- | --- |
| Host | `aws-0-eu-west-3.pooler.supabase.com` | `.env.example`, forensic records |
| Runtime Port | `6543` (Supavisor Transaction Pooler) | `.env.example`, `scripts/tls-preflight.mts` |
| Admin Port | `5432` (Supavisor Session Pooler) | `.env.example`, `.github/workflows/db-release.yml` |
| Database | `postgres` | `.env.example` |
| Project Ref | `siyzygezdmlxbvwttrdz` | `.env.example` |
| Region | `eu-west-3` (Paris) | `.env.example` |
| Runtime Role | `beyu_runtime.siyzygezdmlxbvwttrdz` | `.env.example` |
| Required SSL Mode | `verify-full` | `src/db/tls.ts`, Supabase specification |

---

## 3. Forensic Evidence & Root Cause — VERIFIED

- **Capture Source:** Read-only, credential-free GitHub Actions workflow (`tls-trust-evidence.yml`, run against the live Supabase pooler from Node 22.23.2 and Node 24.20.0 with OpenSSL 3.5.7).
- **Served Chain (Identical across ports 6543 and 5432, Node 22 and 24):**
  1. **Leaf (Depth 0):** Subject `CN=*.pooler.supabase.com`, SAN `DNS:*.pooler.supabase.com, DNS:*.pooler.supabase.co`, Issuer `CN=Supabase Intermediate 2021 CA`, Validity 2025-03-12 → 2030-03-11, SHA-256 `03709ca44d1b06e4504da0a83b6ca065761edc704cd5634bcc3894fd5c7b3248`.
  2. **Intermediate (Depth 1):** Subject `CN=Supabase Intermediate 2021 CA`, Issuer `CN=Supabase Root 2021 CA`, Validity 2023-10-24 → 2033-10-21, SHA-256 `303b0a59bbc8d77e967fbed20b3fe68ec5d7d391c3081ece9936efceef0a55ea`.
  3. **Root (Depth 2):** Subject `CN=Supabase Root 2021 CA`, Issuer `CN=Supabase Root 2021 CA` (Self-Signed, `SKI == AKI`), Validity 2021-04-28 → 2031-04-26, Serial `6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6`, SHA-256 `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
- **Node Trust Store Result:** `inNodeBundledCAStore = false` for all three certificates. Supabase uses a private CA hierarchy that is not part of the Mozilla NSS root program.
- **Root Cause:** When connecting to the Supabase pooler without explicit CA configuration, Node's TLS engine fails verification with OpenSSL error #19 (`SELF_SIGNED_CERT_IN_CHAIN`).

---

## 4. Authoritative CA Material & Equality Proof — VERIFIED

- **First-Party Provenance:** Sourced from Supabase's official CLI repository (`supabase/cli`), where the Go embed file `apps/cli-go/internal/gen/types/templates/prod-ca-2021.crt` and TypeScript template `apps/cli/src/commands/gen/types/templates/prod-ca-2021.ts` agree byte-for-byte.
- **Pinned Trust Anchors:**
  1. `prod-ca-2021`: SHA-256 DER `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`
  2. `prod-ca-2025`: SHA-256 DER `5f9b77951a7aa1303f9b58eea9bfa89e358cfdc15f9786ff10d4930a722c9ae2`
- **Equality Result:** `served root SHA-256 == pinned prod-ca-2021 SHA-256` (**EXACT MATCH**).
- **Handshake Verification Result:** Strict handshake (`rejectUnauthorized: true`, hostname check enabled) with pinned Supabase anchors **SUCCEEDS** (TLSv1.3, `TLS_AES_256_GCM_SHA384`, authorized: true, hostname check: OK).

---

## 5. Driver Trap Mitigation (`pg@8.20.0`) — VERIFIED

- **Empirical Hazard:** In `pg@8.20.0` / `pg-connection-string@2.14.0`, `pg/lib/connection-parameters.js` executes:
  ```js
  config = Object.assign({}, config, parse(config.connectionString))
  ```
  `parse(connectionString)` sets `ssl = {}` whenever `sslmode` is present in the DSN, which **silently overwrites and discards** any explicitly supplied `ssl: { ca: [...] }`.
- **Mitigation:** `src/db/tls.ts` validates that the DSN contains `sslmode=verify-full`, but deletes the `sslmode` query parameter from the `connectionString` handed to `pg`, supplying the verified `{ rejectUnauthorized: true, ca: [...] }` configuration directly.
- **Scope of Mitigation:** Applied across the entire codebase:
  - Runtime pool: `src/db/index.ts`
  - Admin pool: `src/db/admin.ts`
  - Migrations: `scripts/migrate.ts`
  - Role setup: `scripts/setup-db-role.ts`
  - Release pipeline: `scripts/db-release.ts`
  - Production certification: `scripts/certify-production.mts`
  - Preflight: `scripts/tls-preflight.mts`

---

## 6. Implementation & Architecture Hardening — VERIFIED

1. **Embedded CA Anchors (`src/db/supabase-ca.ts`):** Trust anchors are embedded directly in source code as string constants, eliminating the runtime risk of bundlers omitting `.crt` files. Unit tests enforce byte-for-byte identity between `config/tls/supabase/*.crt` and `src/db/supabase-ca.ts`.
2. **Deterministic Fail-Closed TLS Module (`src/db/tls.ts`):**
   - Enforces `rejectUnauthorized: true` (hardcoded).
   - Preserves Node default `checkServerIdentity` against `servername` (DSN host).
   - Rejects IP-literal hosts, unapproved CAs, missing CAs, malformed PEMs, and insecure SSL modes (`disable`, `no-verify`, `allow`, `prefer`, `verify-ca`, `uselibpqcompat`).
   - Rejects `NODE_TLS_REJECT_UNAUTHORIZED != 1`.
   - Restricts plaintext loopback to non-production environments with explicit `BEYU_ALLOW_LOCAL_PLAINTEXT_DB=1` opt-in.
3. **Diagnostic Sanitization (`src/lib/db-health.ts`):** Distinguishes `DATABASE_TLS_TRUST_MISCONFIGURED` from peer-side `DATABASE_TLS_FAILURE`. Never leaks credentials, DSNs, or sensitive connection parameters.
4. **Preflight Tool (`scripts/tls-preflight.mts`):** 12-stage fail-closed check. Distinguishes PASS, FAIL, and BLOCKED (e.g. sandbox network isolation vs security violation).

---

## 7. Verification Test Matrix — ALL PASS

| Suite | Status | Details |
| --- | --- | --- |
| TypeScript (`tsc --noEmit`) | **PASS** | Clean (0 errors) |
| ESLint (`eslint .`) | **PASS** | Clean (0 errors) |
| TLS Trust Security Tests (`database-tls-trust.test.ts`) | **PASS** | 47/47 passing tests |
| Full Repository Vitest Suite | **PASS** | 156 passed files, 0 failed, 3060 passed tests, 170 skipped |
| Secret Leak Scan (`scripts/scan-secrets.mjs`) | **PASS** | 1629 files scanned, 0 secrets found |
| Production Build (`next build`) | **PASS** | CA material traced into `.next/server/chunks/` |
| Production-Style Startup (`next start`) | **PASS** | Local `/api/health` returns HTTP 200 `{"ok":true,"checks":{"database":"UP"}}` |
| Preflight Negative Cases | **PASS** | `sslmode=require` → FAIL (exit 1); `NODE_TLS_REJECT_UNAUTHORIZED=0` → FAIL (exit 1) |

---

## 8. Final Status & Remaining External Gate

**STATUS: BLOCKED — HUMAN / VERCEL ENVIRONMENT CONFIGURATION REQUIRED**

### Completed & Audited in Codebase:
- PR #51 is merged into `main`.
- Working branch `arena/01a08f9d-beyu-os-1-0` is hardened and fully verified.
- Pinned CA trust, fail-closed TLS policy, pg parameter trap defense, and health classification are fully implemented and tested.
- Production build packaging embeds CA trust anchors server-side.

### External Operational Action Required to Complete Recovery:
1. In the **Vercel Dashboard** for project `beyu-os-1-0`:
   - Update `DATABASE_URL` and `BEYU_RUNTIME_DATABASE_URL` (Production and Preview environments) to include `sslmode=verify-full&pgbouncer=true`.
   - Ensure `BEYU_ALLOW_LOCAL_PLAINTEXT_DB` is **not** set in any Vercel environment.
2. In **GitHub Repository Secrets**:
   - Ensure `BEYU_ADMIN_DATABASE_URL` uses `sslmode=verify-full`.
3. Trigger a production deployment on Vercel from commit `fb183599f7a5ee7b4937c50f93e9cf6199225343`.
4. Once deployed, verify `GET https://beyu-os-1-0.vercel.app/api/health` returns **HTTP 200** with `{"ok":true,"checks":{"database":"UP"}}`.
