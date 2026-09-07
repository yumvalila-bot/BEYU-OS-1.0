# Administrator Enrollment (Secure One-Time Bootstrap)

BEYU OS ships with **no usable administrator credential**. There is no default
password, no shared password, and no hidden or backdoor account. The first
human administrator establishes **their own** password and MFA privately through
a one-time, owner-controlled enrollment ceremony, after which the bootstrap path
is **permanently sealed**.

This document describes the enrollment path end to end. For the step-by-step
operational checklist, see [`../runbooks/RB-024-initial-administrator-enrollment.md`](../runbooks/RB-024-initial-administrator-enrollment.md).

---

## 1. Design goals

| Goal | How it is met |
| --- | --- |
| No hard-coded / default / shared credentials in production | The canonical `PLATFORM_ADMIN` user is provisioned **enrollable-only** with an unusable random password hash and no MFA. It cannot be logged into until the owner enrolls. |
| Owner sets their own password + MFA privately | The ceremony accepts a password chosen by the owner and generates a fresh TOTP secret + recovery codes returned **once**, over the owner's own session. |
| One-time only | A singleton `admin_bootstrap_state` row transitions `AVAILABLE → IN_PROGRESS → SEALED`. `SEALED` is terminal, enforced by a database trigger. |
| Replay resistant | The enrollment token is single-use (hashed at rest); the TOTP verification is replay-protected via `mfaLastAcceptedStep`. |
| CSRF resistant | The enrollment token lives only in an `httpOnly`, `SameSite=Strict` cookie; it is never accepted from the request body or a header. |
| Race resistant | Every transition locks the singleton state row `FOR UPDATE`; exactly one ceremony can succeed even under concurrent begins/completes. |
| No secret disclosure | The bootstrap secret is compared in constant time and never logged, echoed, or persisted in plaintext. MFA secrets are encrypted at rest; recovery codes are hashed. |
| Preserves the canonical identity model | The administrator **is** the canonical `parties` / `users` record (`GlobalUserID = users.id`). Authorization is a governed `role_assignments` grant. No competing identity model is introduced. |

---

## 2. The two halves: authorization vs. authentication

The initial administrator is deliberately split into two independently
provisioned halves so that **no single actor (including Arena, this repository,
Noelia, or HIVE) ever holds a usable credential**:

1. **Authorization (who may be admin)** — the canonical `PLATFORM_ADMIN` party,
   user, and the governed `PLATFORM_ADMIN` `role_assignments` grant. These are
   written at *PREPARE* time by `scripts/prepare-admin-bootstrap.ts` using the
   **admin/migration DSN**, because the runtime DB role is forbidden from
   writing `role_assignments` (control **F-01**). The user is left in an
   **enrollable-only** state (unusable password, no MFA).

2. **Authentication (proving you are that admin)** — the password and MFA the
   owner sets during the ceremony. Provisioning knows none of this.

`PLATFORM_ADMIN` is an **operations** administrator role: it holds no finance or
governance authority. It cannot unilaterally approve resolutions, move capital,
or bypass governance — those remain behind separate roles and approval flows.

---

## 3. The ceremony

All endpoints are under `/api/v1/auth/bootstrap`. The owner-facing page is
`/enroll`.

### `GET /status`
Unauthenticated readiness probe. Returns only the coarse lifecycle
(`NOT_PREPARED | AVAILABLE | IN_PROGRESS | SEALED`), whether a bootstrap secret
is configured, and whether a fresh enrollment can start. It reveals no email, no
credential state, and cannot be used to enumerate whether a token is valid.

### `POST /begin`  → `201`
Body: `{ bootstrapSecret, password }`.
- Verifies the owner-controlled `BEYU_BOOTSTRAP_SECRET` in constant time.
- Enforces the administrator password policy (see
  [`AUTHENTICATION_AND_MFA.md`](AUTHENTICATION_AND_MFA.md)).
- Generates a fresh TOTP secret + recovery codes, returned **once** in the
  response body for the owner to capture.
- Sets the raw enrollment token as an `httpOnly`, `SameSite=Strict`,
  `Secure` (in production) cookie. Only the SHA-256 hash of the token is stored.
- Transitions the singleton to `IN_PROGRESS`.

Failure responses are deliberately coarse: an invalid secret returns a generic
`401` that is indistinguishable from other authorization failures. A weak
password returns `422` with policy reasons (but never the password).

### `POST /verify-mfa`  → `200`
Body: `{ code }`. The token is read **only** from the cookie. The owner proves
possession of the authenticator by entering the first 6-digit code. Replay-
protected; locked after repeated failures.

### `POST /complete`  → `200`
No body. Atomically:
- activates the canonical administrator with the established password + verified
  MFA (`passwordMustChange = false`),
- marks the ceremony `CONSUMED`,
- **seals** the bootstrap (`SEALED`, terminal).

It deliberately does **not** create a login session. The owner must sign in
through the normal login page (Identity + Password + 6-digit MFA), proving the
credential works end to end. The ceremony therefore grants no ambient authority.

---

## 4. What is stored, and how

| Data | At rest |
| --- | --- |
| Enrollment token | SHA-256 hash only (`admin_enrollment_sessions.token_hash`, unique) |
| Chosen password | scrypt hash (`password_hash`), staged on the session then copied to the user; plaintext never stored |
| TOTP secret | AES-256-GCM encrypted (`mfa_secret_encrypted`) |
| Recovery codes | Hashed (`mfa_recovery_codes_hash`), shown once |
| Bootstrap secret | Environment only; never in DB, Git, logs, or API responses |

Every transition writes a hash-chained audit event with
`authority = BOOTSTRAP_SECRET/<fingerprint>`, where the fingerprint is a
non-reversible truncated HMAC used only to correlate a single enrollment — it
cannot recover or brute-force the secret.

---

## 5. Dev/test vs. production

- **Dev / test:** `npm run seed` provisions the demo identities (sharing a
  `BEYU_BOOTSTRAP_PASSWORD` for the test suite) and leaves the singleton
  `AVAILABLE`. The demo `admin@beyu.os` login stays intact so the existing test
  suite is unaffected. The seed is also **idempotent and self-repairing**: it
  restores the canonical credential state for the seed identities on every run,
  so a suite that intentionally mutates an identity (e.g. the enrollment E2E
  test) can be reset with a single `npm run seed`.
- **Production:** run `scripts/prepare-admin-bootstrap.ts` to provision the
  administrator **enrollable-only** (no shared password), then have the owner
  complete the ceremony. No credential is ever created or printed by the script.

---

## 6. Related documents

- [`AUTHENTICATION_AND_MFA.md`](AUTHENTICATION_AND_MFA.md)
- [`BOOTSTRAP_SECURITY.md`](BOOTSTRAP_SECURITY.md)
- [`GOVERNANCE_APPROVAL_AUTHORIZATION.md`](GOVERNANCE_APPROVAL_AUTHORIZATION.md)
- [`PRODUCTION_SECRET_CONFIGURATION.md`](PRODUCTION_SECRET_CONFIGURATION.md)
- [`../runbooks/RB-024-initial-administrator-enrollment.md`](../runbooks/RB-024-initial-administrator-enrollment.md)
