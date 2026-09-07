# Governance, Approval & Authorization

This document explains how the initial administrator bootstrap fits within — and
never bypasses — the BEYU OS authorization and governance model.

---

## 1. Canonical identity model (unchanged)

- **`GlobalUserID = users.id`.** Every human is one canonical `users` record
  backed by a `parties` record. The bootstrap administrator is exactly this — no
  parallel or shadow identity is created.
- **RBAC + ABAC** (`src/lib/authz.ts`, `can()`) gate every action by role
  permissions and attribute scope (tenant / entity / country / clearance).
- **Tenant, entity, and country isolation** are enforced at the database via RLS
  and in the authorization layer; the bootstrap changes none of this.

---

## 2. Authorization vs. authentication (separation of duties)

The initial administrator is provisioned in two independent halves:

1. **Authorization** — the governed `PLATFORM_ADMIN` `role_assignments` grant,
   written **only** with the admin/migration DSN at PREPARE time
   (`scripts/prepare-admin-bootstrap.ts`). The runtime role is forbidden from
   writing `role_assignments` (control **F-01**, enforced by
   `scripts/setup-db-role.ts`), so the enrollment ceremony — which runs as the
   runtime role — can never grant itself or anyone else a role.

2. **Authentication** — the password + MFA the owner sets during the ceremony.

This separation means completing the ceremony proves *possession of the owner's
chosen credentials*; it does not, and cannot, mint new authority.

---

## 3. `PLATFORM_ADMIN` is an operations role, not a super-admin

`PLATFORM_ADMIN` (see `src/lib/constants.ts`) holds **operations**
administration permissions only. It explicitly does **not** carry finance or
governance authority:

- It cannot unilaterally approve board/governance resolutions.
- It cannot move capital or write to the accounting ledger.
- High-risk permissions and governance approvals remain behind their own roles
  and multi-party approval flows.

The bootstrap therefore cannot be used as a shortcut to financial or
governance power.

---

## 4. Governed, hash-chained audit

Every bootstrap transition writes a hash-chained audit event
(`src/lib/audit.ts`) with an explicit `authority`:

| Action | Outcome | Authority |
| --- | --- | --- |
| `bootstrap.authorization` (bad secret) | `DENIED` | — |
| `bootstrap.enrollment.started` | `SUCCESS` | `BOOTSTRAP_SECRET/<fingerprint>` |
| `bootstrap.mfa.verify` (failure) | `DENIED` | — |
| `bootstrap.mfa.enrollment.completed` | `SUCCESS` | — |
| `administrator.activated` | `SUCCESS` | `BOOTSTRAP_SECRET/<fingerprint>` |
| `bootstrap.sealed` | `SUCCESS` | — |

The fingerprint is a non-reversible truncated HMAC used solely to correlate a
single enrollment to one configured secret; it cannot recover the secret.

---

## 5. Noelia / HIVE boundaries (unchanged)

The bootstrap introduces no AI-accessible path to credentials or authority.
Noelia and HIVE remain non-human `parties` (AI agent / service account) with
their existing boundaries. No AI system holds the bootstrap secret, the owner's
password, the MFA secret, or the recovery codes — these exist only in the
owner's possession and in encrypted/hashed form at rest.

---

## 6. Related documents

- [`ADMINISTRATOR_ENROLLMENT.md`](ADMINISTRATOR_ENROLLMENT.md)
- [`BOOTSTRAP_SECURITY.md`](BOOTSTRAP_SECURITY.md)
- [`AUTHENTICATION_AND_MFA.md`](AUTHENTICATION_AND_MFA.md)
