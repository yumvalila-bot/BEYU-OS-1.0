# PHASE 10 — IDENTITY AND AUTHORIZATION

Date: 2026-09-05
Status: **VERIFIED** (real PostgreSQL 16 + live HTTP).

## GlobalUserID

Canonical `GlobalUserID` is in the root schema with `migration 0011_global_user_party_uniqueness` and identity graph in `src/lib/identity.ts`. Sector identities (Health) map through the BEYU identity bridge (`beyu_identity_bridge`, `beyu-bridge` suite).

STATUS: PASS (identity graph 12/12; identity-adversarial-http 9/9; Health `beyu-bridge` real-PG.)

## Identity context

`src/lib/tenant-scope.ts`, `identity.ts`, `authz.ts` resolve tenant/entity/country/OS/role/classification/purpose.

STATUS: PASS (abac-scope-country 5/5, abac-decision 12/12, entity-isolation 3/3, tenant-isolation 8/8, Health real-PG isolation boundaries.)

## Authentication / MFA / sessions

Live HTTP verified: login returns `MFA_REQUIRED`; `mfa.test.ts` 5/5; login-rate-limit 11/11; auth/HTTP validation pass.

STATUS: PASS

## Authorization architecture

Destiny (destination) uses RBAC+ABAC+RLS with backend-authoritative API authorization (`src/lib/authz.ts`, `guard.ts`, `authorization/*`). Source `packages/auth` is a 43-test policy engine but is a separate/unwired contract; adoption would require reconciliation and is therefore BLOCKED/DEFERRED.

STATUS: PASS for destination model; BLOCKED for wholesale shared-package adoption.

## Conclusion

Identity/authorization is **VERIFIED** in the canonical destination. No duplicate GlobalUserID was introduced.
