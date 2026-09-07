# Production Secret Configuration

The secrets below must be provisioned in the deployment platform's secret store
(e.g. Vercel environment variables) **before** the initial administrator can be
enrolled. None of them has a default, and none may be committed to source
control.

---

## 1. Required secrets

| Variable | Purpose | Constraints |
| --- | --- | --- |
| `BEYU_BOOTSTRAP_SECRET` | Authorizes the one-time administrator enrollment ceremony. | ≥ 32 chars, high entropy. No default. Placeholder-like values rejected in production. Rotate/unset after sealing. |
| `AUTH_SECRET` | Session token / auth signing. | Random 32+ chars. A dev/placeholder value is refused at runtime. |
| `MFA_ENCRYPTION_KEY` | AES-256-GCM key for MFA secrets at rest. | Random 32+ chars. A dev/placeholder key throws in production. |
| `BEYU_ADMIN_DATABASE_URL` | Admin/migration DSN (superuser). Used by migrations and the PREPARE script only. | Never exposed to the runtime app. |
| `DATABASE_URL` | Runtime DSN (constrained `beyu_runtime` role). | Cannot write governance tables / `role_assignments` (F-01). |

### PREPARE-time only

| Variable | Purpose |
| --- | --- |
| `BEYU_ADMIN_EMAIL` | Email the owner will sign in with; bound to the canonical `PLATFORM_ADMIN` identity. |
| `BEYU_ENV=production` | Enables production guards. |
| `BEYU_ALLOW_PRODUCTION_SEED=I_UNDERSTAND_THIS_IS_A_ONE_TIME_GOVERNED_BOOTSTRAP` | One-time consent flag for the governed production bootstrap. |

### Optional

| Variable | Purpose |
| --- | --- |
| `BEYU_TRUST_PROXY=true` | Trust `X-Forwarded-For` only behind a trusted ingress proxy (C-07). Leave unset otherwise. |

---

## 2. Generating strong values

```sh
# Bootstrap secret (and any other high-entropy secret)
openssl rand -base64 48
```

Store the value directly in the secret manager. Do not paste it into
`.env` files that might be committed, into chat, or into logs.

---

## 3. Handling `BEYU_BOOTSTRAP_SECRET` lifecycle

1. **Set** it (high-entropy) in production before enrollment.
2. **Verify** readiness: `GET /api/v1/auth/bootstrap/status` should report
   `secretConfigured: true` and `enrollable: true` after PREPARE.
3. After the owner completes enrollment the bootstrap is **SEALED** and the
   secret can no longer enroll anyone.
4. **Rotate or unset** the secret post-seal. It is not needed for normal
   operation; removing it reduces the attack surface.

---

## 4. What must never happen

- ❌ Committing any real secret value to Git (the CI runs secret scans).
- ❌ Printing a password, MFA secret, or recovery code to logs or the console.
- ❌ Reusing the dev/test `BEYU_BOOTSTRAP_PASSWORD` as a production login.
- ❌ Sharing the bootstrap secret with any AI system (Noelia/HIVE) or storing it
  in application data.

---

## 5. Related documents

- [`ADMINISTRATOR_ENROLLMENT.md`](ADMINISTRATOR_ENROLLMENT.md)
- [`BOOTSTRAP_SECURITY.md`](BOOTSTRAP_SECURITY.md)
- [`../runbooks/RB-024-initial-administrator-enrollment.md`](../runbooks/RB-024-initial-administrator-enrollment.md)
