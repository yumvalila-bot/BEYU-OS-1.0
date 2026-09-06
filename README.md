# BEYU OS — Global Enterprise Control Plane

BEYU OS is the constitutional, governance, identity, organisational, ownership, capital, risk,
compliance, intelligence, data, workflow, integration, audit and orchestration layer of the BEYU
ecosystem. Sector OSs (Health, Finance, Agriculture, Foundation) execute specialised operations
**under** BEYU OS governance and consume shared capabilities through governed APIs, events and
policies.

## Quick start

```bash
cp .env.example .env        # then fill in DATABASE_URL and the secrets
npm ci                      # reproducible install from the committed lockfile
npm run migrate             # apply versioned migrations (scripts/migrate.ts)
npm run seed                # idempotent constitutional bootstrap
npm test                    # vitest suite (111 test files; PostgreSQL required for DB-backed suites)
npm run build && npm start  # production build
```

## Local disposable PostgreSQL 16

If no system PostgreSQL is available (e.g. the Arena sandbox where apt is
unreachable), start the in-repo embedded PostgreSQL harness (adds an
`embedded-postgres` dev dependency only; no production dependency):

```bash
npm run pg16:start   # provisions beyu_os + beyu_health + runtime roles on 127.0.0.1:5432
npm run pg16:stop
```

Then export the CI-style env (`BEYU_ADMIN_DATABASE_URL`, `BEYU_RUNTIME_DATABASE_URL`,
`BEYU_TEST_DATABASE_URL`, `BEYU_BOOTSTRAP_PASSWORD`, `AUTH_SECRET`,
`MFA_ENCRYPTION_KEY`) as documented in `.env.example` before running migrate/seed/test.

> Test-count note: the root Vitest suite is 111 test files / 2375 tests. Against a
> live PostgreSQL 16 with the app server running, this suite is fully green
> (measured 2026-09-05: **2375 pass / 0 fail / 0 skip**). Without a live
> `DATABASE_URL` the DB-backed governed-mutation suites cannot run and will
> report `DATABASE_URL is required` failures — that is environmental, not a
> product regression.

`npm run migrate` is the only supported way to apply schema changes. `drizzle-kit
push` must never be used against a shared or production database; author changes
with `npm run migrate:generate` and commit the generated migration.

Most suites require a live PostgreSQL instance — tenant isolation, audit-chain
concurrency, transaction atomicity and the governed-mutation tests assert against
real database state rather than mocks.

The end-to-end suite additionally drives the running HTTP surface (authentication,
the request-forgery guards and idempotency). It skips when no server is reachable;
to run it, start the app and point the tests at it:

```bash
npm run build && npx next start -p 3100 &
BEYU_TEST_BASE_URL=http://127.0.0.1:3100 npm test
```

Bootstrap identities (password supplied only by `BEYU_BOOTSTRAP_PASSWORD`; valid TOTP required):

| Identity | Role | Demonstrates |
| --- | --- | --- |
| `ceo@beyu.os` | Group Chief Executive | Full executive view |
| `cfo@beyu.os` | Group CFO | Finance OS authority, waterfall, tax |
| `governance@beyu.os` | Chief Governance Officer | Constitution, policy, AI review |
| `risk@beyu.os` | Chief Risk & Compliance | Risk register, compliance engine |
| `family@beyu.os` | Family Office Principal | Family governance, beneficiaries, vaults |
| `auditor@beyu.os` | Internal Auditor | Read-only assurance; mutations denied |
| `health.ops@beyu.os` | Sector OS Operator | Sector-scoped, lower clearance |

Sign in as the auditor or sector operator to see least-privilege denials, suppressed columns and
classification ceilings enforced live.

## What is implemented

- **Constitution & policy engine** — 12 articles, 8-level policy hierarchy with machine-readable
  rules; DENY is final; hierarchy conflicts are detectable.
- **Identity & access** — parties/users/sessions/roles/permissions/grants, RBAC + ABAC + tenancy +
  classification ceilings + step-up MFA + emergency access + delegation + consent.
- **Organisation & ownership** — trust → holdings → country holdings → operating companies →
  tenants; economic/voting/beneficial ownership with provenance and effective dating.
- **Governance engine** — boards, committees, family council, trustees, reserved matters, quorum,
  votes, resolutions with rationale, data basis, authority and consequences.
- **Risk · compliance · legal · continuity** — appetite-based risk register, control library,
  jurisdiction-aware obligations with six explicit compliance states, legal matters, anomaly
  intelligence, RPO/RTO plans with test evidence.
- **Finance OS** — treasury, capital pipeline with policy-computed approval authority, immutable
  double-entry model, and a deterministic, explainable **waterfall engine** (integer minor units,
  checksum, per-line formulas, shortfall escalation).
- **Tax Strategy Intelligence** — jurisdiction-gated eligibility engine distinguishing legal
  planning, lawful avoidance and aggressive/uncertain positions, hard-blocking unlawful evasion.
- **HCM** — one employee master, positions, immutable employment events, clearance-gated pay data.
- **Family Office** — lineage verification, beneficiary eligibility, six vault types, family
  governance — all HIGHLY_RESTRICTED, inside BEYU OS (never a separate OS).
- **Documents & knowledge** — full attachment registry (version, checksum, provenance, authority,
  supersession, retention, legal hold) and knowledge governance with review windows.
- **Audit & events** — hash-chained append-only ledgers with live integrity verification.
- **Noelia AI on HIVE** — single AI identity, permission-inheriting, policy-gated, source-citing,
  output-classified, fully audited, with mandatory human review for material matters.
- **Registries** — OS registry, source-of-truth matrix, ADRs, integrations, data assets, metric
  definitions, feature flags, regulatory change watch.

## BEYU OS 2.0 migration status (evidence-based)

The DB-backed verification gates were **recovered and executed** against a fresh
PostgreSQL 16: root regression is **2375/2375 pass**; Health backend real-PG
security is **89/89 pass**; PGlite layer is **488 pass / 15 skip**; Health
frontend is **14/14 pass**. The migration/release program is still **NOT
certified** because the mandatory Flutter SDK, real AI provider and production
deployment gates remain blocked. The evidence and honest capability decisions
are in:

- `docs/migration/PHASE_00_REALITY_AUDIT.md`
- `docs/migration/PHASE_01_SOURCE_BASELINE.md`
- `docs/migration/PHASE_02_DESTINATION_BASELINE.md`
- `docs/migration/PHASE_03_CAPABILITY_MATRIX.md`
- `docs/migration/PHASE_04_INFRASTRUCTURE_RECOVERY.md`
- `docs/migration/PHASE_05_DATABASE_VERIFICATION.md`
- `docs/migration/PHASE_06_SECURITY_VERIFICATION.md`
- `docs/migration/PHASE_07_FINANCE_VERIFICATION.md`
- `docs/migration/PHASE_08_HEALTH_VERIFICATION.md`
- `docs/migration/PHASE_09_ARCHITECTURE_FUSION.md`
- `docs/migration/PHASE_10_IDENTITY_AND_AUTHORIZATION.md`
- `docs/migration/PHASE_11_AI_GOVERNANCE.md`
- `docs/migration/PHASE_12_APPLICATION_FUSION.md`
- `docs/migration/PHASE_13_FLUTTER_VERIFICATION.md`
- `docs/migration/PHASE_14_DEPLOYMENT_VERIFICATION.md`
- `docs/migration/PHASE_15_FINAL_REGRESSION.md`
- `docs/migration/register.json`
- `docs/migration/BEYU_OS_2_0_FINAL_CERTIFICATION.md`

Reproducible facts and the embedded-PG harness are in `scripts/infra/pg16-server.mjs`
and `scripts/migration/capture-reality.mjs`.

## Documentation

`docs/constitution` · `docs/architecture` · `docs/domain-model` · `docs/security` ·
`docs/compliance` · `docs/api` · `docs/events` · `docs/ai` · `docs/operations` · `docs/runbooks` ·
`docs/adr`

## Guarantees and non-claims

Financial history is never overwritten; corrections are reversals. AI never bypasses authorisation
and never takes material decisions. National rules are never generalised across jurisdictions. No
certification against any framework is claimed — compliance is evidenced, never asserted.
