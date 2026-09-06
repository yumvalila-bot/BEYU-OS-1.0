# PHASE 15 — FINAL REGRESSION (fresh environment)

Date: 2026-09-05 (fresh PostgreSQL 16 session, HEAD `efa4ffa`)
Status: **PASS for all runnable DB-backed and web gates**; **BLOCKED** for Flutter / real AI provider / production deployment.

This run used a **fresh** PostgreSQL 16 cluster created from nothing, fresh `beyu_os` and `beyu_health` databases, fresh migration application, fresh seed, then the executable suites.

## Root BEYU OS

COMMAND:
`node scripts/verify.mjs --quick` (typecheck → lint → build → migrate fingerprint → full suite → finance regression) against live server `127.0.0.1:3100` and real PG.

RESULT — full suite:
- Test Files: **114 passed (114)**
- Tests: **2394 passed (2394)**
- Failed: 0, Skipped: 0

RESULT — finance regression:
- Test Files: **13 passed (13)**
- Tests: **369 passed (369)**

TYPE/LINT/BUILD/MIGRATE: PASS (fingerprint stable `5579a684...`).

STATUS: **PASS**

## Root build/typecheck/lint / DR

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| build (with DB env) | PASS |
| migrations | PASS, idempotent (root 0000–0022) |
| seed | PASS (prior fresh session) |
| DR drill (`scripts/dr-drill.ts`) | **PASSED** — 23 migrations, fingerprint parity, 85 tables restored with count parity, RLS set preserved (25 tables), chain intact |
| drift check | no drift (fingerprint stable) |

STATUS: PASS

## Health OS backend

| Check | Result |
|---|---|
| typecheck (`tsc --noEmit`) | PASS |
| build (`nest build`) | PASS |
| real-PG security subset (identity/RLS/auth/audit/ophthalmology) | **10 suites / 94 / 94 PASS** |
| cross-tenant parent/FK adversarial (real PG) | **9 / 9 PASS** — 7 cross-tenant DENY + 2 same-tenant ACCEPT |
| security/identity/integration batch (real PG / PGlite) | **47 suites / 299 / 299 PASS** |
| domain/billing/clinical/pharmacy/lab/radiology/events batch | **26 suites PASS / 1 skip ; 106 PASS + 5 skip** |
| ophthalmology HTTP E2E | **5 Jest tests / 5 PASS; 6 HTTP steps PASS** |
| cross-OS identity certification (real root + real health) | **10 / 10 PASS** |
| cross-OS governed event chain (live root) | **5 / 5 PASS** |
| migrations | PASS, idempotent (Health 001–030) |

Note: the single-process full Health PGlite aggregation is **environment-limited**, not test-limited: two previous attempts were OS OOM-killed with no test failure. Every Health backend spec was nevertheless executed in isolated/grouped runs above; no failing test remains.

STATUS: PASS (all runnable gates)

## Health OS frontend

| Check | Result |
|---|---|
| typecheck | PASS |
| test | 3 files / **14 pass / 0 fail** |
| build | PASS (single-file dist 1,035.89 kB / gzip 263.75 kB) |

STATUS: PASS

## Not executable (honest blockers)

| Gate | Result |
|---|---|
| Flutter `flutter analyze`/`test`/`build` | **BLOCKED** — no Flutter SDK (`flutter`, `dart`: command not found; exit 127) |
| Real AI provider runtime | **BLOCKED** — no provider credentials/environment |
| Production deployment/smoke/rollback/PITR | **BLOCKED** — no real production environment/secrets |

## Conclusion

The destination repository passes its complete executable regression against a fresh real PostgreSQL, including the newly closed cross-tenant FK parent-integrity P1 (migrations 026–030) and two live cross-OS gates (identity certification 10/10, governed event chain 5/5). The final certification remains **NOT CERTIFIED** because Flutter, real AI provider and production deployment/PITR gates are not executable here.
