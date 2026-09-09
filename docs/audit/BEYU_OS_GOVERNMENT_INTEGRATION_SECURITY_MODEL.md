# BEYU OS — Government Integration Security Model

**Scope:** Government Integration Fabric (`src/lib/government`, migration
`0036_government_integration_fabric`, routes `/api/v1/government/*`).
**Date:** 2026-09-09. **Verification:** every control below is enforced in
code/database and covered by an automated test; none is documentation-only.

## 1. Architectural containment

| Control | Enforcement | Evidence |
|---------|-------------|----------|
| ONE canonical gateway; no Government OS | Fabric is a shared module inside BEYU OS; no OS-registry entry; sector code cannot import adapters or dial agency hosts directly | `tests/government/architecture-boundary.test.ts` (source scan) |
| No unofficial endpoints / scraping | The known unofficial NIDA passthrough (`.../um/load/load_nida/`) is asserted absent from the codebase | architecture-boundary test |
| Closed status catalogues | TypeScript unions mirror DB CHECK constraint lists exactly | architecture-boundary test vs `drizzle/0036` |

## 2. Authorization (default DENY)

- Two permissions only: `government:integration.read` (GROUP_CFO,
  SECTOR_OPERATOR, AUDITOR) and `government:submission.manage` (GROUP_CFO,
  SECTOR_OPERATOR). `government:submission.manage` is in
  `HIGH_RISK_PERMISSIONS` → `can()` demands satisfied MFA (step-up) before
  allowing; without MFA the decision is DENY + `requiresMfa`.
- Family principals hold neither permission (verified DENY).
- Every route passes through the standard guarded pipeline (authn → RBAC →
  audit); anonymous → 401, unauthorized → 403 (live-verified on the running
  server: 17/17 HTTP checks).

## 3. Database substrate (fail-closed at the lowest layer)

| Invariant | Mechanism |
|-----------|-----------|
| Registry is runtime-immutable | `beyu_runtime` has SELECT only on `government_agencies` (REVOKE in migration 0036 AND in `scripts/setup-db-role.ts` §4d, so the control holds regardless of role/migration ordering) |
| Interaction history never erased | No DELETE grant on `government_submissions` for `beyu_runtime` |
| No fabricated acceptance | CHECK `government_submissions_accept_needs_reference`: `ACCEPTED` requires non-null `external_reference` |
| No silent production activation | CHECK `government_agencies_prod_needs_approval`: `PRODUCTION_READY`/`LIVE` require `production_authorized_by/at` |
| Blocked rows are explainable | CHECK `government_agencies_blocked_needs_reason` |
| Tenant isolation | RLS on `government_submissions` keyed to `beyu.current_tenant_ids` / `beyu.global_scope`; runtime role is non-superuser, non-BYPASSRLS |

Adversarial verification: `tests/government/security-adversarial.test.ts`
(runtime-role RLS attacks, cross-tenant reads/writes, CHECK-violation
attempts, grant-matrix assertions) — 10/10 pass.

## 4. Submission integrity

- Durable record BEFORE any external call; idempotency key + SHA-256 payload
  digest per (tenant, agency, key). Replay with same payload → recorded answer
  (`duplicate: true`); replay with DIFFERENT payload → `DUPLICATE_SUBMISSION`
  409 (prevents idempotency-key reuse smuggling).
- Adapter timeout/unreachable → `EXTERNAL_UNAVAILABLE`, never a fabricated
  outcome. Contract-schema failures → `INVALID_PAYLOAD` 422 before any wire
  call.
- Every submission and verification is audited (action
  `government.<agency>.submit`, subject digest, actor, tenant).

## 5. Credential handling

- Registry and adapters carry env-var NAMES (`credentialRefs`) only; no value
  is stored, logged, or committed. Adapter source is scanned for credential
  literal patterns (architecture-boundary test).
- Missing credentials → adapter self-reports `EXTERNAL_BLOCKED`; the gateway
  refuses the call (`AGENCY_NOT_CALLABLE`). Values are never defaulted or
  invented.

## 6. Noelia (AI) boundary

- Structural, not policy-only: no registered Noelia tool carries
  `government:submission.manage` (asserted by test over the live registry),
  so autonomous material government action cannot be expressed, regardless of
  prompt content.
- The single government tool `government.integration.status` is read-only
  (LOW risk, side effects NONE) and reports registry truth; its findings use
  the closed `NoeliaFinding.status` vocabulary (`OBSERVED`).

## 7. Truthfulness constraints

- No seeded or reachable state claims `LIVE`, `PRODUCTION_READY` or
  `UAT_VERIFIED` for any real agency (test-asserted).
- The mock agency is `isMock=true`, status-capped at `SANDBOX_READY`, and can
  never be cited as evidence for a real integration.
- TRA/NHIF/DHIS2 are `EXTERNAL_BLOCKED` (real, documented interfaces;
  credentials not issued). NIDA/BRELA/TMDA/NSSF/WCF/OSHA/PSSSF are
  `CONTRACT_PENDING` (no verified official machine interface).

## 8. Residual risks / open items

1. TRA and NHIF contracts are implemented from discovery-grade evidence
   (community mirrors of official specs); official primary documents must be
   verified at onboarding before `CONTRACT_VERIFIED` is recorded.
2. Live-path code in adapters is intentionally unreachable until credentials
   exist; first real-environment exchange must be re-tested end to end.
3. Webhook ingestion (e.g. asynchronous government callbacks) is not yet
   built; when added it MUST verify signature, source, replay-window and
   idempotency before touching a submission row.
