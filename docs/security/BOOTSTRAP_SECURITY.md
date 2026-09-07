# Bootstrap Security Model

This document is the threat-model reference for the one-time administrator
bootstrap. It enumerates the invariants, where each is enforced, and the
adversarial cases covered by tests.

---

## 1. State machine & invariants

A single control record, `admin_bootstrap_state` (id pinned to `'SINGLETON'`),
drives the lifecycle:

```
NOT_PREPARED ──prepare──▶ AVAILABLE ──begin──▶ IN_PROGRESS ──complete──▶ SEALED (terminal)
                              ▲                     │
                              └──ceremony expired ──┘
```

Database-enforced invariants (migration `0033_admin_bootstrap_state.sql`) — these
hold even against a compromised runtime role or an application-layer regression:

| Invariant | Enforcement |
| --- | --- |
| Exactly one control row can exist | `CHECK (id = 'SINGLETON')` |
| Only defined states are representable | `CHECK (status IN ('AVAILABLE','IN_PROGRESS','SEALED'))` |
| A seal must record who/when | `CHECK (status <> 'SEALED' OR (sealed_at, sealed_by_user_id, admin_user_id all NOT NULL))` |
| **Seal is terminal — no reopen** | `BEFORE UPDATE OR DELETE` trigger raises on any update of a `SEALED` row |
| **Control row cannot be deleted** | same trigger raises on `DELETE` |
| Enrollment token is unique & single-use | `UNIQUE (token_hash)`; step/status enums |

The enrollment session enums (`step IN (MFA_PENDING, MFA_VERIFIED, CONSUMED)`,
`status IN (ACTIVE, CONSUMED, EXPIRED)`) are also CHECK-constrained.

---

## 2. Authorization to enroll: the bootstrap secret

`BEYU_BOOTSTRAP_SECRET` (see `src/lib/bootstrap/secret.ts`) is the owner-held
authorization for the ceremony:

- **No default, no fallback.** If absent, the path reports "not configured" and
  refuses to proceed.
- **Minimum 32 characters.**
- **Placeholder-rejected in production:** values containing markers such as
  `change_me`, `placeholder`, `example`, `not_secret`, `todo` are refused.
- **Constant-time comparison** via HMAC folding (also neutralizes length
  leakage).
- **Never disclosed:** not logged, not echoed, not stored. Audit rows reference
  only a non-reversible truncated `bootstrapSecretFingerprint()`.

---

## 3. Threats & mitigations

| Threat | Mitigation |
| --- | --- |
| Brute-force of the bootstrap secret | Aggressive per-source + global rate limits on `/begin`; constant-time comparison; high-entropy minimum. |
| Replay of the enrollment token | Token stored hashed & single-use; ceremony marked `CONSUMED` atomically at complete. |
| Replay of a TOTP code | `mfaLastAcceptedStep` rejects an already-consumed step (±1 window). |
| CSRF on the ceremony | Token accepted **only** from an `httpOnly`, `SameSite=Strict` cookie — never body/header. |
| Race: two concurrent enrollments | Singleton row locked `FOR UPDATE` on every transition; exactly one `complete` can seal. |
| Re-opening a sealed deployment | `SEALED` is terminal at the DB layer (trigger); no update/delete possible. |
| Compromised runtime role granting itself admin | `role_assignments` writes are revoked from the runtime role (F-01); the authorization grant is written only with the admin/migration DSN at PREPARE. |
| Enumeration via status endpoint | `/status` returns only coarse lifecycle + booleans; no email, no credential state, no token validity. |
| Secret/credential leakage in errors | Invalid secret → generic `401`; weak password → `422` with reasons only; internal errors fail closed. |
| Ambient authority from the ceremony | `/complete` issues no session; the owner must log in normally afterward. |

---

## 4. Adversarial test coverage

`tests/bootstrap/` exercises the model by execution:

- `secret.test.ts` — missing/short/placeholder rejection; constant-time verify;
  fingerprint is non-reversible and stable.
- `password-policy.test.ts` — length, complexity, forbidden words, email echo.
- `enrollment.test.ts` — full service state machine: begin/verify/complete,
  wrong secret, weak password, replay, expiry, lockout, double-complete race,
  seal terminality.
- `db-invariants.test.ts` — singleton CHECK, status enum, seal-evidence CHECK,
  seal-terminal trigger (no reopen / no delete, messages match `/sealed/i` and
  `/permanent/i`), unique `token_hash`.
- `enrollment-http.test.ts` — the real HTTP surface end to end against a running
  server: status JSON, generic invalid-secret `401`, weak-password `422`,
  verify-without-cookie `409`, `httpOnly` cookie, full begin→verify→complete→
  seal, second-begin `409`, and a real login with the self-chosen credential.

---

## 5. Related documents

- [`ADMINISTRATOR_ENROLLMENT.md`](ADMINISTRATOR_ENROLLMENT.md)
- [`AUTHENTICATION_AND_MFA.md`](AUTHENTICATION_AND_MFA.md)
- [`GOVERNANCE_APPROVAL_AUTHORIZATION.md`](GOVERNANCE_APPROVAL_AUTHORIZATION.md)
- [`PRODUCTION_SECRET_CONFIGURATION.md`](PRODUCTION_SECRET_CONFIGURATION.md)
