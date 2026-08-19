# BEYU OS — Production Handoff

## Repository Structure

```
src/
├── app/              # Next.js App Router (pages + API routes)
│   ├── api/          # Versioned API surface (/api/v1/*)
│   ├── os/           # 15 enterprise control-plane pages
│   └── sign-in-form  # Authentication UI
├── db/
│   ├── schema/       # 8 Drizzle schema modules (enums, core, identity, governance, assurance, finance, people, platform)
│   ├── seed.ts       # Idempotent constitutional bootstrap
│   └── index.ts      # DB connection
├── lib/              # Framework-free domain engines
│   ├── audit.ts      # Serialized hash-chained audit/event ledger
│   ├── authz.ts      # RBAC + ABAC + tenancy + step-up MFA
│   ├── mfa.ts        # Standards-compliant TOTP
│   ├── policy.ts     # 8-level policy hierarchy engine
│   ├── waterfall.ts  # Deterministic cashflow distribution
│   ├── tax.ts        # Jurisdiction-gated tax eligibility
│   ├── noelia.ts     # Governed AI pipeline (single identity)
│   ├── tenant-scope.ts # Canonical tenant-scope abstraction
│   ├── session.ts    # Session lifecycle
│   ├── crypto.ts     # Password hashing, checksums, stable serialization
│   └── api.ts        # Governed API surface (rate limit, idempotency, error envelope)
└── components/       # Canonical BEYU visual identity

drizzle/              # Versioned SQL migrations
scripts/              # Migration runner, evidence runner
tests/                # 5 suites, 37 tests
docs/                 # Architecture, constitution, security, API, events, AI, operations, runbooks, ADR, compliance, remediation
```

## Security Model

| Layer | Mechanism |
|-------|-----------|
| Authentication | scrypt passwords + TOTP MFA (AES-256-GCM encrypted secrets, replay prevention) |
| Authorization | RBAC (role grants) ∧ ABAC (classification ceiling, tenant, entity, step-up) ∧ Policy engine |
| Tenant isolation | Application `tenantScopeIds()` + PostgreSQL RLS on 11 tables |
| Audit integrity | Serialized append (`SELECT FOR UPDATE`), hash-chained, unique prev_hash, immutability triggers |
| API security | Rate limiting, Zod validation, structured errors (no leakage), security headers (CSP, XFO, XCTO) |
| Secrets | Environment variables only; `.env` excluded from VCS; encrypted MFA secrets at rest |

## Database

- PostgreSQL via Drizzle ORM. ~73 tables, 107 foreign keys, 2 CHECK constraints, 11 RLS-enabled tables.
- Migrations: `scripts/migrate.ts` (advisory-locked, checksummed, metadata table).
- **Never use `drizzle-kit push` in production.** Always generate a new migration file.

## Deployment

1. `npm ci`
2. `npx tsx scripts/migrate.ts` (applies pending migrations with advisory lock)
3. `BEYU_BOOTSTRAP_PASSWORD=... npx tsx src/db/seed.ts` (one-time constitutional bootstrap; refuses production without explicit override)
4. `npm run build && npm start`

## Known Limitations (documented, not hidden)

| ID | Item | Status | Review |
|----|------|--------|--------|
| H-01 | Permission model reads TS constants at runtime; DB `role_permissions` table seeded but not queried | DEFERRED | v1.1 |
| H-02 | Financial ledger schema exists with constraints but no writer endpoints | DEFERRED | Finance OS gate |
| H-03 | Governance resolution lifecycle displayed but not executed via API | DEFERRED | Governance gate |
| H-05 | Ownership beneficial look-through sum can exceed 100% (by design: separate from direct) | ACCEPTED | v1.1 |
| H-08 | Rate limiting is in-process Map (single replica) | ACCEPTED | Multi-replica gate |
| H-09 | Observability via structured audit ledger; no OpenTelemetry yet | ACCEPTED | Infrastructure gate |
| H-11 | 16 npm vulnerabilities (1 critical vitest dev-only, 7 high transitive) | ACCEPTED | Dependency review |

## Architecture Decisions

See `docs/adr/README.md` and the `architecture_decisions` table (4 recorded ADRs).
