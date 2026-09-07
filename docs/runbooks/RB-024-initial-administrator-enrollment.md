# RB-024: Initial Administrator Enrollment

**Severity:** P1 (deployment gate)
**Trigger:** A new production deployment has no enrolled human administrator
**Last Tested:** NOT_TESTED
**Owner:** System Owner / Security Lead

This runbook is the operational checklist for the legitimate system owner to
enroll the **first** administrator through the one-time, sealed bootstrap.
Background and design rationale live in
[`../security/ADMINISTRATOR_ENROLLMENT.md`](../security/ADMINISTRATOR_ENROLLMENT.md).

> **Principle:** BEYU OS ships with no usable admin credential. Nobody — not
> Arena, not the repository, not Noelia/HIVE — ever holds a password or MFA
> secret. You establish your own, privately, exactly once.

---

## 0. Prerequisites (owner-controlled)

Provision these in the deployment secret store **before** starting. See
[`../security/PRODUCTION_SECRET_CONFIGURATION.md`](../security/PRODUCTION_SECRET_CONFIGURATION.md).

- [ ] `BEYU_ADMIN_DATABASE_URL` (admin/migration DSN)
- [ ] `DATABASE_URL` (constrained runtime DSN)
- [ ] `AUTH_SECRET`, `MFA_ENCRYPTION_KEY` (real, high-entropy)
- [ ] `BEYU_BOOTSTRAP_SECRET` — high-entropy, ≥ 32 chars (`openssl rand -base64 48`)
- [ ] `BEYU_ADMIN_EMAIL` — the email you will sign in with
- [ ] A **TOTP authenticator app** ready on your device
- [ ] A private, secure place to store recovery codes (password manager / vault)

Also required once per environment:
- [ ] Database migrated (`npm run migrate`)
- [ ] Runtime role constrained (`npx tsx scripts/setup-db-role.ts`)

---

## 1. Prepare the administrator (enrollable-only)

Runs with the admin DSN; provisions the canonical `PLATFORM_ADMIN` identity, its
governed role grant, and the `AVAILABLE` bootstrap state. **Creates no
credential and prints no secret.**

```sh
BEYU_ADMIN_DATABASE_URL="$BEYU_ADMIN_DATABASE_URL" \
BEYU_ADMIN_EMAIL="owner@example.com" \
BEYU_ENV=production \
BEYU_ALLOW_PRODUCTION_SEED=I_UNDERSTAND_THIS_IS_A_ONE_TIME_GOVERNED_BOOTSTRAP \
  npx tsx scripts/prepare-admin-bootstrap.ts
```

Expected output ends with: *"Administrator bootstrap prepared (ENROLLABLE-ONLY)."*
The script is idempotent and refuses to run once the bootstrap is `SEALED`.

---

## 2. Confirm readiness

```sh
curl -s https://<deployment>/api/v1/auth/bootstrap/status
```

Expect: `{"data":{"state":"AVAILABLE","secretConfigured":true,"enrollable":true}}`

- `secretConfigured:false` → `BEYU_BOOTSTRAP_SECRET` is missing/placeholder/too short.
- `state:"NOT_PREPARED"` → step 1 has not run.
- `state:"SEALED"` → an administrator already exists (stop; see §6).

---

## 3. Enroll (do this yourself, privately)

Open **`https://<deployment>/enroll`** in your own browser.

1. Enter the **bootstrap secret** and choose **your own password**
   (≥ 14 chars; mix of character classes; no common/product words).
2. On success you are shown, **once**:
   - a **TOTP secret / QR (otpauth URI)** — add it to your authenticator now;
   - **recovery codes** — store them in your vault now.
3. Enter the first **6-digit code** from your authenticator to verify MFA.
4. Confirm to **complete**. The bootstrap is now **SEALED** permanently.

> Do not screenshot the secret/recovery codes into shared storage. Treat them
> like root keys.

---

## 4. Verify you can sign in

Completion intentionally creates **no** session. Go to the normal sign-in page
and log in with **Identity + your password + a 6-digit MFA code**.

> If login is rejected immediately after enrollment, wait ~30 seconds: the code
> you used to verify MFA is replay-protected within its window. Use the next code.

- [ ] Login succeeds with your self-chosen credentials.
- [ ] `GET /api/v1/auth/bootstrap/status` now reports `state:"SEALED"`,
      `enrollable:false`.

---

## 5. Post-enrollment hardening

- [ ] Rotate or **unset `BEYU_BOOTSTRAP_SECRET`** — it can no longer enroll
      anyone and is not needed for operation.
- [ ] Confirm recovery codes are stored securely and are not in any log/chat.
- [ ] Review the audit trail for `administrator.activated` and `bootstrap.sealed`.

---

## 6. Failure & recovery

| Situation | Action |
| --- | --- |
| Ceremony expired (15 min TTL) mid-flow | Re-open `/enroll` and begin again; the stale session is reclaimed. |
| Wrong secret repeatedly | You are rate-limited; wait and retry with the correct value. Errors are generic by design. |
| Lost authenticator **before** completing | Begin again to get a fresh MFA secret (previous ceremony is abandoned). |
| Lost authenticator **after** sealing | This is normal MFA recovery, not bootstrap — see [RB-013: MFA Recovery](./RB-013-mfa-recovery.md). |
| `state:"SEALED"` but no one has the credential | The bootstrap cannot be reopened (terminal by DB trigger). This is an identity-compromise / recovery event — see [RB-012: Identity Compromise](./RB-012-identity-compromise.md) and RB-013. Any reset requires the admin DSN and full audit, never the runtime app. |

---

## 7. Related

- [`../security/ADMINISTRATOR_ENROLLMENT.md`](../security/ADMINISTRATOR_ENROLLMENT.md)
- [`../security/BOOTSTRAP_SECURITY.md`](../security/BOOTSTRAP_SECURITY.md)
- [`../security/AUTHENTICATION_AND_MFA.md`](../security/AUTHENTICATION_AND_MFA.md)
- [`../security/PRODUCTION_SECRET_CONFIGURATION.md`](../security/PRODUCTION_SECRET_CONFIGURATION.md)
