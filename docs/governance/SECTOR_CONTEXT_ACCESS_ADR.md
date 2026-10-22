# ADR — Governed Sector Context and Read-Only Access Enablement

**Status:** PROPOSED — human review required; no production authorization
**Date:** 2026-10-22
**Audience:** BEYU OS engineering, identity governance, security and the separately authorized human grantor
**Target under review:** existing canonical identity `USR_PLATFORM_ADMIN` (not a display-name match)

> This ADR is a smallest-change proposal and review record. It is not a grant, approval, deployment authorization, production migration approval, or claim of authenticated production success.

## 1. Decision

Use the existing BEYU OS identity, session, RBAC/ABAC, MFA, tenant-scope, RLS and audit controls to make sector navigation and sector data authorization explicit:

1. Add one non-privileged catalogue role, `SECTOR_READ_ONLY`, with exactly the two existing permissions `agriculture:data.read` and `ujenzi:data.read`, and `RESTRICTED` clearance.
2. Add additive migration `0076_sector_read_only_context_access.sql` to mirror that role on an existing database. The migration inserts no user, tenant, membership, session or role assignment.
3. Resolve Agriculture and Ujenzi page/API requests to their canonical tenant before `can()`, handler execution and RLS context creation. A non-global principal must already occupy the canonical target context. An already-global principal may be narrowed to a derived, target-pinned principal without gaining a permission or global scope.
4. Offer a server-authorized session-context selector only for ACTIVE tenants with a direct, effective, entity-unscoped, non-global, catalogue-recognized non-zero-capability assignment. Changing context updates only the caller's existing session after MFA and stale-session checks, and appends old/new-tenant audit records atomically.

No live assignment is included. Production enablement remains a separate governance action.

## 2. Five-destination access matrix

| Destination | Navigation / presentation | Server-side authority in this proposal | Change in this branch | Current production disposition |
|---|---|---|---|---|
| **HEALTH_OS** (`/os/health`) | Existing Health destination and federation state remain visible only when the existing Health gate authorizes them. | Existing Health active-link gate plus the separate Health backend RBAC and revocation controls. No BEYU role is treated as a Health account or clinical grant. | No Health grant, role, link or backend change. | **Blocked / unproven.** The separate Health project was observed INACTIVE; the root production topology and required link relation were not established. Do not restore, register or link as a side effect of this proposal. |
| **AGRICULTURE_OS** (`/os/agriculture`) | Launcher can offer a directly authorized context; the selector itself grants nothing. | Direct exact-target `agriculture:data.read`, canonical `BEYU-AGRI` context, tenant/classification/entity/country checks and RLS. `agriculture:data.manage` and writes remain denied. | Canonical resolver, session-context workflow and two-permission role/migration. | **No live enablement.** The required production tenant and an authorized scoped grantor/topology were not established. |
| **UJENZI_OS** (`/os/ujenzi`) | Same explicit context-selection model; no hidden URL or hostname authorization. | Direct exact-target `ujenzi:data.read`, canonical `BEYU-UJENZI` context, tenant/classification/entity/country checks and RLS. Writes and `CAP_POSTING` remain denied/locked. | Same minimal resolver/context workflow and role/migration. | **No live enablement.** No production tenant, grant or topology is inferred from disposable seed data. |
| **Family Office** (`/os/family`) | Existing shared-capability navigation remains governed by its existing entry permission. | Existing `family:member.read` only where already authorized. `HIGHLY_RESTRICTED` family/beneficiary/wealth boundaries and capital/protection gates are unchanged. | No Family role or clearance grant. In particular, `FAMILY_MEMBER_VIEW` is not added to the administrator because principal-wide clearance elevation would widen unrelated Family authority. | Existing authority only; no new access claimed. |
| **NOELIA_AI / HIVE** (`/os/noelia`) | Existing governed assistant navigation remains governed by `ai:noelia.query`. | Advisory interaction only. No `ai:decision.review`, tool/action authority, self-approval, execution or `CAP_POSTING` authority is added. | No NOELIA role, permission or runtime change. | Existing advisory boundary only; no new access claimed. |

**Explicitly out of scope:** Finance OS expansion, platform-administrator elevation, global-scope conversion, wildcard privileges, new permission codes, production user/role/ACL mutation, production migration, deployment and merge.

## 3. Why this is the smallest safe change

- The role reuses existing permission codes rather than inventing a new authority vocabulary.
- Two direct assignments are preferable to a broad cross-sector or global administrator role: each assignment has its own tenant, effective window, justification and revocation path.
- A membership marker is not enough. It does not create a capability and cannot rebind a session's tenant or RLS context.
- A navigation-only change is not enough. The resolver runs before both page authorization and the API handler/RLS transaction, preventing an unrelated home tenant from being queried for a canonical sector request.
- Entity-scoped and `global_scope` assignments are not eligible for the session selector. Existing global authority is not converted into a broader assignment; where it already exists, the derived principal is pinned to one canonical sector tenant for the request.
- Family Office and NOELIA retain their existing, separate boundaries. No clearance ceiling is raised for the target administrator.

## 4. Required production approvals and evidence (not performed)

Before any identity-specific production assignment, an authorized governance record must establish:

1. The exact canonical GlobalUserID/login identity and the intended tenant/entity/country/classification scope.
2. Governed provisioning and existence of the canonical Agriculture/Ujenzi tenants and the approved Health topology; seed identifiers are not production evidence.
3. A different, properly scoped human grantor. The target administrator cannot self-grant and its non-global home-tenant authority cannot authorize grants into sector tenants.
4. Separate direct, effective, non-global, entity-unscoped role assignments with justification and MFA/step-up enforcement.
5. Health federation registration/link-once and separate Health backend authorization evidence, if Health is approved.
6. Exact-head CI, migration review, rollback plan, audit review and human merge/deployment approval.

No production success may be inferred from an anonymous redirect, a seed fixture, a catalogue row, a migration ledger entry or a green local test.

## 5. Migration and integrity review

`0076` is data-only and additive. Its snapshot carries the `0075` schema forward with a new snapshot ID and `prevId` chain; no historical snapshot was edited and no metadata-debt exception was added. The DB-free canonical integrity script was run after adding it: **0 blocking issues**; the 25 reported issues are the repository's pre-existing acknowledged historical metadata debt. This does not clear `FO-BLK-13` history or authorize a production release.

The migration intentionally contains no `INSERT` into `role_assignments`, `users`, `tenants` or `sessions`. A fresh install can run it before the constitutional seed: role-permission rows are inserted only when their existing permission rows are present, and the seed later mirrors the same catalogue with deterministic IDs and conflict no-ops.

## 6. Verification and stop condition

The accompanying isolated tests use a fresh disposable identity and direct AGRI/UJENZI fixture grants, never the target person's credentials or production data. They cover positive and negative navigation/API behavior, wrong tenant, unknown target, MFA, stale/revoked/expired sessions and grants, entity/global scope, audit, read-only writes, Family/NOELIA boundaries and unchanged Finance/admin authority.

Work stops at human review. Any production grant, tenant provisioning, Health restoration/linking, deployment, migration, merge or claim of live authenticated access requires separate explicit authorization and fresh evidence.
