# BEYU OS — Security architecture

Principles: **zero trust · defence in depth · least privilege · secure by default · privacy by
design · security by design.**

## Identity & access

- Immutable prefixed identifiers for every party, user, service, AI agent and device.
- Lifecycle: CREATE → VERIFY → ACTIVATE → MODIFY → SUSPEND → REVOKE → DEACTIVATE → ARCHIVE.
- Passwords: scrypt with a per-user 128-bit salt (`scrypt$salt$digest`), constant-time comparison,
  lockout after five failures for fifteen minutes, uniform failure responses.
- Sessions: server-side records, SHA-256 token hashes (raw token never persisted), 12-hour TTL,
  revocation, IP/UA/device-trust/risk-score attributes, HttpOnly + SameSite=Lax + Secure cookies.
- MFA: enrolment flag and step-up enforcement — every high-risk capability requires
  `mfaSatisfied`, otherwise HTTP 428.
- Emergency access: time-boxed, permission-scoped, approved, logged, post-reviewed.
- Delegation: recorded human→human with scope, monetary limit and expiry. Delegation of material
  authority to AI is constitutionally prohibited.

## Authorization model

Both must pass (defence in depth):

1. **RBAC** — capability granted through an effective-dated role assignment inside the tenant chain.
2. **ABAC** — classification ceiling vs. clearance, tenant identity, legal-entity data scope,
   high-risk step-up, session risk.
3. **Policy engine** — constitutional → transaction-level rules; any DENY is final; obligations
   (approval / human review) are surfaced to the caller.

Classification tiers: `PUBLIC < INTERNAL < CONFIDENTIAL < RESTRICTED < HIGHLY_RESTRICTED`.
Family, beneficiary and clinical data default to the highest tiers.

## Tenant isolation

Every request resolves IDENTITY → TENANT → ENTITY → ROLE → PERMISSION → DATA SCOPE. Queries are
tenant-filtered at the data layer; `can()` rejects cross-tenant context; role grants only apply
within the tenant ancestry chain. Cross-tenant access requires an explicit, recorded grant.

## Application security

- All input validated with Zod schemas before reaching the domain layer.
- Parameterised SQL only through Drizzle — no dynamic string SQL, no unvalidated identifiers.
- Per-principal, per-capability rate limiting; `Idempotency-Key` support on mutating finance APIs.
- Structured, non-leaking errors with a correlating trace id.
- Secrets are referenced (`vault://…`), never stored in the database, never logged, never returned.
- Audit denials are recorded with reason, actor, IP and user agent.

## Deployment controls (target production posture)

Encryption in transit (TLS 1.2+) and at rest (KMS-managed keys with per-tenant key derivation for
HIGHLY_RESTRICTED data); WAF and API gateway in front of the application; network segmentation
between the control plane, Sector OSs and data stores; secrets in a managed vault with rotation;
SAST, DAST, dependency, container and IaC scanning in CI; periodic penetration testing;
protected, immutable backups.

## Continuous assurance

`GET /api/v1/system/self-test` executes live control tests (audit-chain integrity, policy hierarchy
consistency, tenant isolation, classification ceiling, financial determinism, tax blocking and
jurisdiction gating, AI authority boundary, referential integrity). `npx vitest run` executes 21
deterministic unit/contract tests for the critical business rules.

## Non-claims

BEYU OS **does not** claim certification against ISO 27001, SOC 2, GDPR or any other framework.
Frameworks are modelled as configurable obligations with explicit assessment states
(`COMPLIANT`, `NON_COMPLIANT`, `PARTIALLY_COMPLIANT`, `NOT_ASSESSED`, `NOT_APPLICABLE`,
`REQUIRES_HUMAN_REVIEW`). Compliance is never inferred or fabricated.
