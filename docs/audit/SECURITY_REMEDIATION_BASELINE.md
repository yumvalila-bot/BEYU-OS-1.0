# BEYU OS / HEALTH OS — SECURITY REMEDIATION BASELINE

_Produced during Phase 0 (Reality Audit) of the security-remediation program. Evidence-derived; no fabrication._

## Repository reality

| Item | Value |
|---|---|
| Repository | `yumvalila-bot/BEYU-OS-1.0` |
| Canonical branch | `main` |
| main HEAD (pre-remediation) | `989cd3a7bf6a91362bda68c11a5b34d236b24998` |
| Session/remediation branch | `arena/01a05ba7-beyu-os-1-0` (Arena session-fixed; substitutes for restricted `arena/health-*` names) |
| Working tree | clean |
| `.github/` directory | **ABSENT** — GitHub Actions has no discoverable workflow |
| Existing CI definition | `docs/ci/ci.yml` (root quality-gate pipeline; present but inert) |
| Remediation deliverable | `docs/ci/beyu-security.yml` (corrected, multi-job enforced gate — ready to promote to `.github/workflows/`) |

## Toolchain (this sandbox)

| Tool | Version |
|---|---|
| Node.js | v22.22.3 |
| npm | 10.9.8 |

## NestJS / GraphQL / related versions (installed, clean `npm ci`)

| Package | Installed | Declared range |
|---|---|---|
| @nestjs/common | 10.4.22 | ^10.2.8 |
| @nestjs/core | 10.4.22 | ^10.2.8 |
| @nestjs/platform-express | 10.4.22 | ^10.2.8 |
| @nestjs/testing | 10.4.22 | ^10.2.8 |
| @nestjs/config | 3.3.0 | ^3.1.1 |
| @nestjs/graphql | 12.2.2 | ^12.1.0 |
| @nestjs/apollo | 12.2.2 | ^12.1.0 |
| @nestjs/jwt | 11.0.2 | ^11.0.0 |
| @nestjs/passport | 10.0.3 | ^10.0.3 |
| @nestjs/swagger | 7.4.2 | ^7.1.8 |
| @nestjs/typeorm | 10.0.2 | ^10.0.2 |
| @nestjs/bull | 10.2.3 | ^10.1.0 |
| @nestjs/axios | 3.1.3 | ^3.1.3 |
| @nestjs/cache-manager | 2.3.0 | ^2.1.1 |
| @nestjs/cli | 10.4.9 | ^10.2.1 |
| @nestjs/schematics | 10.2.3 | ^10.0.2 |
| @apollo/server | 4.13.0 | ^4.11.0 |
| graphql | 16.14.2 | ^16.8.1 |
| express | 4.22.2 | ^4.18.2 |
| body-parser | 1.20.4 | (transitive via @nestjs/platform-express) |
| ws | 8.18.0 | (transitive via @nestjs/graphql) |
| uuid | 9.0.1 | ^9.0.0 |

No `.nvmrc`; Node is pinned in `docs/ci/ci.yml` (`node-version: 22`).

## CI state (Problem 1)

`docs/ci/ci.yml` is a well-designed root quality-gate that already encodes:
postgres-16 service for DB suites, **migration-drift assertion**, non-superuser
runtime-role provisioning + attribute assertion (`NOSUPERUSER NOBYPASSRLS
NOCREATEROLE NOCREATEDB`), production build **with** and **without** runtime
secrets (deployment parity), E2E against a live local server with
`/api/health` database-UP gating, committed-credential scans, and a
production dependency audit scoped to critical severity.

**It is not executed by GitHub Actions because it is not under `.github/workflows/`.**
Therefore security gates are not enforced. This is Problem 1.

The corrected workflow is authored as `docs/ci/beyu-security.yml`. It preserves
the root pipeline and adds Health OS hard security matrices plus a production
high/critical audit gate. It was validated locally (YAML parse OK — 4 jobs;
targeted Jest name patterns resolve to real spec files and pass: rls+mfa 30
tests, idor+endpoint+db 49 tests).

## Dependency audit state (Problem 2)

`npm audit` (all deps): `{ low:3, moderate:25, high:15, critical:0, total:43 }`
`npm audit --omit=dev` (production): `{ moderate:19, high:5, critical:0, total:24 }`

### Production high-severity vulnerabilities (the two known chains)

| Package | Severity | Advisories (themes) | Fix | Breaking? |
|---|---|---|---|---|
| @nestjs/platform-express | high | — (rolls up body-parser/multer) | `@nestjs/platform-express@12.0.1` | **major** |
| body-parser (via platform-express) | high | DoS when invalid limit disables size enforcement (GHSA-v422-hmwv-36x6) | via platform-express@12 | major |
| multer (via platform-express) | high | multiple DoS (incomplete cleanup, resource exhaustion, uncontrolled recursion, nested field names) | via platform-express@12 | major |
| @nestjs/graphql | high | — (rolls up ws/lodash) | `@nestjs/graphql@14.0.0` | **major** |
| ws (via @nestjs/graphql) | high | uninitialized memory disclosure; memory-exhaustion DoS | via graphql@14 | major |
| lodash (via @nestjs/graphql) | high | code injection via `_.template`; prototype pollution via `_.unset`/`_.omit` | via graphql@14 | major |
| js-yaml (via @nestjs/swagger) | high | prototype pollution in merge; quadratic-complexity DoS | `@nestjs/swagger@12.0.1` | **major** |

Goal for Phase 2: **0 unresolved high-severity and 0 unresolved critical runtime
vulnerabilities**, via a coherent NestJS 12 / GraphQL 14 (+ Swagger 12) upgrade
— no overrides used to conceal chains.

## Current engineering baseline (pre-change, from verification)

- Health OS backend: **74 suites / 348 tests PASS** (`npm test`)
- Health OS typecheck: PASS; build: PASS
- Frontend: typecheck PASS, build PASS, 3 files/14 tests PASS
- Root BEYU OS kernel: typecheck/build/lint PASS; **vitest suite EXTERNAL_BLOCKED** (requires live `DATABASE_URL` PostgreSQL; the workflow provisions a postgres:16 service for it)
- RLS: verified fail-closed (15-pt × 63 tables, non-owner role)
- Endpoint security: 95/95 PASS, 0 implementable GAPs
- Migration 018 (global-reference fail-closed RLS): PRESENT_AND_VERIFIED
- External integrations: EXTERNAL_BLOCKED where not provisioned; no fabricated PASS

## Token/permission findings (Phases 1A/1B + delivery)

The available GitHub token (`arena-ai-coding-agent[bot]`) reports
`permissions: {admin:false, maintain:false, push:false, triage:false, pull:false}`:

1. **Branch protection (Phase 1B):** `GET/PUT .git/branches/main/protection`
   → `403 Resource not accessible by integration`. **BRANCH_PROTECTION =
   EXTERNAL_BLOCKED** (cannot be configured or even read with this token).
2. **Workflow delivery (Phase 1):** pushing **any** ref whose history contains a
   `.github/workflows/*.yml` file is refused —
   `refusing to allow a GitHub App to create or update workflow
   '.github/workflows/beyu-security.yml' without 'workflows' permission`
   (confirmed on two distinct branch names; affects all commits in the push,
   not just the tip). Consequence:
   - the workflow cannot be pushed → no CI PR → GitHub Actions execution cannot
     be observed.
   - **CI_ENFORCEMENT = UNVERIFIED** (Phase 1A) — not fabricated.

## Gated downstream phases

Mandated order is **CI → dependency upgrade → regression → root-DB verification
→ PR review → merge → production provisioning**. Because Phase 1 cannot be pushed
or proven operational in this environment, Phases 2–7 cannot legitimately reach
completion without elevated credentials (`workflows` scope for the App token, and
a real `GITHUB_TOKEN`/App with Actions:write). The NestJS 12 remediation is
fully specified (targets and chains above) and ready to execute on an unblocked
actor, then re-gate via the enforced workflow.
