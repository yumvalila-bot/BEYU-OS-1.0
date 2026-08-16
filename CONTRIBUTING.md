# Contributing to BEYU OS

## Architectural Rules (non-negotiable)

1. **One GlobalUserID** — never create competing identity models.
2. **Tenant isolation** — every query must use the canonical `tenantScopeIds()` helper.
3. **Audit atomicity** — domain mutations and audit records share a transaction.
4. **HCM is inside BEYU OS** — never a separate HCM OS.
5. **Family Office is inside BEYU OS** — never a separate Family Office OS.
6. **Tax Intelligence is inside Finance OS** — never a separate Tax OS.
7. **Noelia is the single AI identity** — AI never bypasses authorization.
8. **Migrations only** — never use `drizzle-kit push` for production schema changes.
9. **No secrets in source** — all credentials come from environment variables.

## Development Workflow

```bash
git checkout -b feature/your-feature develop
npm install
cp .env.example .env  # fill in local values
npx tsx scripts/migrate.ts
BEYU_BOOTSTRAP_PASSWORD=your-local-pw npx tsx src/db/seed.ts
npm run dev
npx vitest run
npm run build
```

## Pull Request Requirements

- [ ] TypeScript clean (`npx tsc --noEmit`)
- [ ] Tests pass (`npx vitest run`)
- [ ] Production build passes (`npm run build`)
- [ ] No credential literals in source
- [ ] Tenant-scoped queries use `tenantScopeIds()`
- [ ] Domain mutations use `withAuditTransaction()` or `recordAuditTx()`
- [ ] New schema changes have a migration file
- [ ] Architecture changes have an ADR
