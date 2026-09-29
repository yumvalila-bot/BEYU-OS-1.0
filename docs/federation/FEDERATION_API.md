# BEYU Federation & Trust — Governed API reference

Base: `/api/v1/federation`. Every route runs through the canonical `guarded()` chain:
principal resolution → RBAC permission (+ MFA step-up for HIGH_RISK) → rate limit →
tenant GUC context (RLS) → handler → audit. URL path is never authorization.

Conventions:

- All reads are RLS-scoped: the registry plane is shared reference data; operational
  reads (consents, access requests) are tenant-isolated by `beyu_tenant_ids()`.
- Errors are the canonical envelope `{ error, message, traceId }` with 400/401/403/404/
  409/428 statuses. `428 MFA_REQUIRED` is the HIGH_RISK step-up challenge.
- Bodies are zod-validated; enums are validated against the catalogue (unknown value →
  400, fail-closed).
- No route accepts or logs credentials. Evidence references are ids, not contents.

## Overview

| Route | Method | Permission | Purpose |
|---|---|---|---|
| `/` | GET | `federation:read` | Posture summary: registry counts, state distributions, honest zero-claims |
| `/jurisdictions` | GET | `federation:read` | Jurisdiction profiles (TZ + future blocs/countries) |
| `/jurisdictions/[code]` | GET | `federation:read` | Profile detail: kind, status, data residency, integration regime, cross-border interfaces, capabilities |
| `/authorities` | GET | `federation:authority.read` | Authority registry; filters `jurisdiction`, `domain`, `scope`, `q`, `verification`, `api`, `govesb`, `cost`, `recon`; pagination + count |
| `/authorities/[code]` | GET | `federation:authority.read` | Authority detail + its services + its evidence (404 for unknown code+jurisdiction) |
| `/services` | GET | `federation:service.read` | Service records joined to authorities; filters `authorityCode`, `jurisdiction`, `classification`, `accessLevel`, `q` |
| `/capabilities` | GET | `federation:read` | Destination capability rows for a jurisdiction (404 if the profile is unknown) |
| `/evidence` | GET | `federation:read` | Evidence/provenance rows; filters `subjectType`, `subjectId`, `status` |
| `/connectors` | GET | `federation:connector.read` | Connectors + health; enum-validated filters; `isMock` honesty note |
| `/consents` | GET | `federation:read` | Tenant-scoped consent rows (status filter enum-validated) |
| `/consents` | POST | `federation:manage` | Create a consent as **REQUESTED** (canonical party subject check, tenant/entity scope check) |
| `/access-requests` | GET | `federation:read` | Tenant-scoped access requests joined to authority/service |
| `/access-requests` | POST | `federation:manage` | Submit an access request (SUBMITTED; authority/service/legal-basis code resolution; entity scope check) |
| `/access-requests/[id]/decision` | POST | `federation:approve` (HIGH_RISK) | Approve/deny: SoD requester≠approver, 404 cross-tenant, only SUBMITTED/IN_REVIEW, inserts final `federation_approvals` row, audit + event |
| `/incidents` | GET | `federation:audit.read` | Federation-plane incidents (global rows visible to all scoped contexts) |
| `/incidents` | POST | `federation:manage` | Open a DETECTED incident (non-authorizing) |
| `/monitoring` | GET | `federation:audit.read` | Noelia/HIVE read-only monitoring report (deterministic findings, `aiBoundary` note) |
| `/coverage` | GET | `federation:audit.read` | Coverage audit vs the documented directory baseline; `format=markdown` for the rendered report |
| `/transitions` | GET | `federation:read` | Recorded jurisdiction transition plans (tenant-scoped) |
| `/transitions` | POST | `federation:manage` | Propose a transition: both profiles must exist, `negotiateCapabilities` + `assertTransitionShape`, persists PROPOSED or BLOCKED (blockers recorded) |
| `/production/activate/[id]` | POST | `federation:production.activate` (HIGH_RISK) | Human-gated activation: `assertProductionActivation` + `assertLifecycleMove` → PRODUCTION_APPROVAL with evidence/approval linkage |
| `/production/revoke/[id]` | POST | `federation:production.revoke` (HIGH_RISK) | Human-gated suspension → SUSPENDED with a recorded reason |

`[id]` for the production routes is the authority code (`?jurisdiction=`, default TZ).

## Guarantees

- **No endpoint can create a LIVE / LIVE_VERIFIED / FREE_CONFIRMED / GOVESB_LIVE
  state** — those are evidence-gated in the engine and in 0071 CHECK constraints; the
  production routes stop at PRODUCTION_APPROVAL / SUSPENDED.
- **Consents are created REQUESTED only** — GRANTED is recorded by the governed
  consent flow with a grant timestamp (0071 CHECK), never by an API caller.
- **Approvals are final** — `federation_approvals` rows are INSERT/SELECT for the
  runtime role.
- **Rate limits** on every route (stricter for mutations and HIGH_RISK actions).
- **Audit + events** on every mutation; access decisions emit
  `FEDERATION_DATA_ACCESSED` / `FEDERATION_DATA_REJECTED` into the canonical ledger.
