# BEYU OS — Security Policy

## Reporting Vulnerabilities

Report security vulnerabilities to **security@beyu.os** (or the designated security contact).
Do not open public issues for security vulnerabilities.

## Security Architecture

- **Zero Trust**: every request resolves identity → tenant → role → permission → data scope.
- **RBAC + ABAC**: capability grants + classification ceilings + tenant isolation + step-up MFA.
- **TOTP MFA**: standards-compliant, encrypted secrets, replay prevention, lockout.
- **Tenant Isolation**: application-layer scope + PostgreSQL Row-Level Security on 11 tables.
- **Audit Integrity**: hash-chained append-only ledger, serialized append, immutability triggers.
- **Atomic Operations**: domain mutations and audit records share a database transaction.
- **Security Headers**: CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy.
- **No Secrets in Source**: `.env` excluded from VCS; `.env.example` provided without values.

## Supported Versions

Only the latest release on `main` receives security updates.

## Disclosure Policy

Confirmed vulnerabilities are remediated before public disclosure.
Critical findings receive a fix within 72 hours of confirmation.
