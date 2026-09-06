# BEYU OS 2.0 SECURITY MODEL

Date: 2026-09-05
This is the **current + target security model**. No security code was changed in this session. The destination remains authoritative until a DB-backed security re-run proves parity.

---

## 1. Security layering

1. **Authentication** — GlobalUserID, passwords + MFA, sessions, mobile login/me/logout, service principals for sector federation.
2. **Authorization** — RBAC + ABAC, policy engine, deny precedence, classification ceiling, purpose-of-use, delegation, emergency access/break-glass.
3. **Tenancy / entity / country / OS isolation** — tenant scope, RLS, search_path pinning (Health migration 0024), fail-closed global reference (Health migration 0018).
4. **Audit** — append-only hash chain, audit triggers, concurrency-safe chain tips, actor attribution, DB-level integrity constraints.
5. **AI governance** — Noelia identity → authorization → context → tenant → data permission → retrieval → reasoning → safety → human approval → action → audit. AI never bypasses authorization.
6. **Transport and secrets** — JWT/session validation, secret handling via env (documented `.env.example` only; no real secrets committed), no debug credentials observed.

---

## 2. Current verification status (measured)

| Layer | Status in this session |
|---|---|
| Typecheck / lint / build | PASS |
| Non-DB unit suites | PASS (1109 root + 488 Health backend + 14 Health frontend) |
| MFA / step-up | test files present; **DB-backed verification BLOCKED** |
| RBAC/ABAC | test files present; some PASS, some BLOCKED |
| RLS isolation | **BLOCKED** — requires real PostgreSQL |
| Entity/country/OS isolation | **BLOCKED** — requires real PostgreSQL |
| Audit chain integrity | **BLOCKED** — requires real PostgreSQL for concurrency/atomicity |
| Ledger immutability | **BLOCKED** — requires real PostgreSQL |
| CAP_POSTING authorization | **BLOCKED** — requires real PostgreSQL |
| AI authorization/purpose | partial tests; real provider BLOCKED |
| Committed-secret scan | CI gate exists; not executed locally |

---

## 3. Security invariants preserved (and guaranteed not weakened by this session)

- P0 guards: no data loss, no unauthorized access, no ledger corruption, no CAP_POSTING bypass, no audit tampering, no tenant isolation failure, no auth bypass, no privilege escalation.
- No finance/ledger/audit/RLS source code was modified in this session.
- No destructive migration was applied.
- No secret value was created or committed.
- No test assertion was weakened; no failing test was deleted.

---

## 4. Adversarial scope (target — must be run with real PostgreSQL)

Cross-tenant, cross-entity, cross-country, cross-OS access; role/permission escalation; stale token usage; MFA bypass; direct DB access; audit tampering; ledger mutation; CAP_POSTING bypass; AI authorization bypass; classification bypass; emergency-access abuse; delegation abuse.

Result in this session: **NOT EXECUTED in full** because the suites require PostgreSQL. The existing destination adversarial suites are intact and will run in a PostgreSQL-provisioned environment.

---

## 5. Target shared security package

Recommended (from source `packages/security`, adapted before wiring):

- `crypto` — SHA-256 chain hashing, HMAC, salt/password hashing.
- `tokens` — JWT/session token validation, freshness/rotation.
- `audit-chain` — append-only chain primitives, tamper detection.

These must be reconciled with destination `src/lib/audit.ts`, `src/lib/crypto.ts`, `src/lib/session.ts` before any swap.

---

## 6. Conclusion

Security posture: **preserved**, not changed. Verification: **BLOCKED** for DB-backed guarantees. Release certification: **NOT CERTIFIED**.
