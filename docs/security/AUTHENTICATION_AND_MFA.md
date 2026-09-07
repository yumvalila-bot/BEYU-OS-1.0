# Authentication & MFA

BEYU OS authenticates humans with three factors of evidence at login:
**identity (email) + password + TOTP MFA**. This document describes the
credential primitives and the policy applied to the highest-value credential in
the system — the initial administrator.

---

## 1. Password storage

Passwords are hashed with **scrypt** and a per-credential random salt
(`src/lib/crypto.ts`). The stored form is `scrypt$<salt>$<digest>`; plaintext is
never stored, logged, or returned. Verification is constant-time via the scrypt
comparison. `password_algo` records the algorithm to allow future rotation.

An account can be placed in an **enrollable-only** state by writing a
well-formed but *unusable* scrypt record whose digest is random and derived from
no known password. `verifyPassword()` can never succeed against it, so the
account is login-disabled until a real password is set through enrollment.

---

## 2. Administrator password policy

Enforced server-side by `src/lib/bootstrap/password-policy.ts` during
enrollment (and available for future governed rotation):

- **Length:** minimum 14, maximum 200 characters.
- **Complexity:** at least three of {lowercase, uppercase, digit, symbol}.
- **No common/product words:** rejects `password`, `admin`, `beyu`, `changeme`,
  `qwerty`, and similar trivially-guessed patterns (fail-closed on the exact
  defaults the security requirements prohibit).
- **No identity echo:** the password may not contain the account email/local
  part.

The policy returns only a boolean decision and **generic reasons** — never the
submitted password. Owners are directed to use a password manager; the embedded
list is a fail-closed guard, not a breach corpus.

---

## 3. MFA (TOTP)

MFA uses **TOTP** (`src/lib/mfa.ts`): SHA-1, 6 digits, 30-second period —
compatible with standard authenticator apps.

- **Secret at rest:** AES-256-GCM encrypted (`encryptSecret`). In production the
  encryption key must be a real `MFA_ENCRYPTION_KEY`; a dev/placeholder key
  throws.
- **Replay protection:** `verifyTotp` accepts a ±1 step window and records the
  last accepted step (`mfaLastAcceptedStep`). A code from an already-consumed
  step is rejected as a replay. (Consequently, immediately after enrollment
  consumes a step, a login code from the *same* 30-second window is correctly
  rejected — wait for the next window.)
- **Recovery codes:** generated at enrollment, returned **once**, stored only as
  hashes (`hashRecoveryCode`).
- **Lockout:** repeated MFA failures lock verification for a cooldown window,
  both during enrollment and at login.

---

## 4. Sessions

Successful login issues a session (`src/lib/session.ts`) stored as a SHA-256
hash of the session token in the `beyu_os_session` `httpOnly` cookie
(`SESSION_TTL_HOURS = 12`). High-risk actions require a fresh MFA step-up within
`MFA_STEP_UP_WINDOW_MS` (15 minutes).

The enrollment ceremony deliberately issues **no** session on completion; the
owner authenticates through the normal login path afterward.

---

## 5. Login lockout & abuse resistance

- Failed password attempts increment `failed_attempts`; exceeding the threshold
  sets `locked_until` (a temporary `423 ACCOUNT_LOCKED`).
- MFA failures track `mfa_failed_attempts` / `mfa_locked_until` independently.
- Login is rate-limited per account and per source; forwarding headers are only
  trusted when `BEYU_TRUST_PROXY=true` (control C-07).

> Operational note: because lockout is stateful, running the HTTP test suite
> repeatedly against a shared database can leave an account temporarily locked or
> mutated. `npm run seed` resets seed identities to a known-good, unlocked state.

---

## 6. Related documents

- [`ADMINISTRATOR_ENROLLMENT.md`](ADMINISTRATOR_ENROLLMENT.md)
- [`BOOTSTRAP_SECURITY.md`](BOOTSTRAP_SECURITY.md)
- [`PRODUCTION_SECRET_CONFIGURATION.md`](PRODUCTION_SECRET_CONFIGURATION.md)
