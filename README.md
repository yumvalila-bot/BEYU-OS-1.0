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
npm test                    # 58 tests across 6 suites (PostgreSQL required)
npm run build && npm start  # production build
```

`npm run migrate` is the only supported way to apply schema changes. `drizzle-kit
push` must never be used against a shared or production database; author changes
with `npm run migrate:generate` and commit the generated migration.

Most suites require a live PostgreSQL instance — tenant isolation, audit-chain
concurrency, transaction atomicity and the governed-mutation tests assert against
real database state rather than mocks.

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

## Documentation

`docs/constitution` · `docs/architecture` · `docs/domain-model` · `docs/security` ·
`docs/compliance` · `docs/api` · `docs/events` · `docs/ai` · `docs/operations` · `docs/runbooks` ·
`docs/adr`

## Guarantees and non-claims

Financial history is never overwritten; corrections are reversals. AI never bypasses authorisation
and never takes material decisions. National rules are never generalised across jurisdictions. No
certification against any framework is claimed — compliance is evidenced, never asserted.
