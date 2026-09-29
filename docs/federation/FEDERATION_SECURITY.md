# BEYU Federation & Trust — Security (RLS, RBAC/ABAC, invariants)

## 1. PostgreSQL RLS (final boundary)

Migration 0071 enables and **forces** RLS on all 20 federation tables:

- **Reference tables** (jurisdictions, domains, legal bases, authorities, services,
  datasets, schemas, credentials, connectors, evidence, verifications, capabilities,
  reconciliation runs/results): `FOR SELECT USING (true)`. The registry is shared
  reference data, readable inside any authenticated tenant context; the runtime role
  has **no DML** on these tables (see §2) — registry state changes only through the
  governed admin path.
- **Operational tables** (agreements, consents, access requests, transitions):
  `tenant_id = ANY(beyu_tenant_ids()) OR beyu_global_scope()`, applied as both USING
  and WITH CHECK — tenant isolation on every command, entity checks layered on top in
  the routes.
- **Incidents**: global rows (`tenant_id IS NULL`) are visible to every scoped context
  (federation-plane incidents, e.g. authority outage); tenant rows are isolated.
  INSERT/UPDATE allowed (the safe self-repair loop opens incidents), **no DELETE** —
  incident history is governance evidence.
- **Approvals**: INSERT/SELECT only. A recorded approval decision is never updated or
  erased by the runtime role.

`withTenantDatabaseContext` (canonical `src/lib/tenant-scope.ts`) sets the
`beyu.current_tenant_ids` GUC for the session; `guarded()` (API) and the page guards
run every query inside it. The runtime role is `NOSUPERUSER NOBYPASSRLS`
(`scripts/setup-db-role.ts`, re-pinned in step 4f for the federation tables).

Verified gates (local PG16, this branch):

- unscoped INSERT into a tenant-scoped table → RLS denied;
- cross-tenant SELECT/UPDATE on consents/access requests → invisible/0 rows;
- runtime-role INSERT/UPDATE on registry tables → denied by privilege;
- `federation_authorities_production_gate` / `federation_authorities_free_gate` CHECKs
  reject evidence-less promotions and FREE_CONFIRMED at the database level even if an
  application bug bypassed the engine.

## 2. Database role contract (0071 + setup-db-role 4f)

| Surface | Runtime role (`beyu_runtime`) | Admin role |
|---|---|---|
| Registry tables | SELECT only | DDL + governed mutation |
| Incidents | INSERT / UPDATE (no DELETE) | same + admin path |
| Agreements / consents / access requests / transitions | INSERT / UPDATE (no DELETE) | same |
| Approvals | INSERT / SELECT | same |

## 3. RBAC — the `federation:*` permission set

Defined in `src/lib/constants.ts` (~line 443). Read/manage split so visibility never
implies mutation authority. **HIGH_RISK (MFA step-up, session re-attestation):**
`federation:approve`, `federation:production.activate`, `federation:production.revoke`,
`federation:credential.manage`.

| Permission | Meaning |
|---|---|
| `federation:read` | Read the trust plane (jurisdictions, coverage, overview) |
| `federation:manage` | Governed admin mutation entry |
| `federation:authority.read` / `.manage` | Authority registry read / register + reconcile |
| `federation:service.read` / `.manage` | Service records |
| `federation:connector.read` / `.manage` | Connectors + health |
| `federation:credential.manage` | Credential lifecycle — **env-var references only, never secret values** |
| `federation:agreement.read` / `.manage` | Agreements (evidence-backed) |
| `federation:verification.read` / `.manage` | Verification outcomes (evidence-gated) |
| `federation:audit.read` | Monitoring, incidents, coverage reports |
| `federation:approve` | Approve/deny access requests (governed human approval) |
| `federation:production.activate` / `.revoke` | Human-gated production gate |

**No AI role holds `federation:approve` or any `federation:production.*`** (the NOELIA_AI
identity is advisory-only; it cannot authorize anything in this plane).

Role assignments (canonical, `src/lib/constants.ts`):

- `PLATFORM_ADMIN` — full federation read/manage suite (operates the plane end-to-end).
- `GROUP_CGO` — `federation:read`, `federation:approve`, `federation:audit.read`
  (the approver).
- `GROUP_CEO`, `GROUP_CFO` — `federation:read` (visibility, no mutation).

## 4. ABAC and isolation preserved

- Tenant + entity scope: every operational row carries `tenant_id` + `legal_entity_id`;
  routes resolve the entity to its tenant and check membership in
  `tenantScopeIds(principal)` before mutation (consents, access requests, transitions).
- **Classification ceiling** (`minBeyuClearanceFor`): PROTECTED data requires a
  RESTRICTED floor; a principal below the floor is denied even with an approved
  request.
- **Purpose limitation**: consent and access requests are purpose-scoped;
  `effectiveConsent` computes the effective consent per purpose.
- **Consent withdrawal propagates**: a WITHDRAWN/DENIED consent for a purpose blocks
  every dependent access (verified by `decideServiceAccess` tests).
- **Segregation of duties**: access-request approver ≠ requester (enforced in the
  decision route); production activation requires a *separate recorded approval*
  reference (execution ≠ authority).
- URL is never authorization: every route runs `guarded()` which resolves the
  principal, checks the permission (with MFA step-up for HIGH_RISK), enforces
  rate limits, and records the audit entry — the path only selects the handler.

## 5. Secret handling

- No credentials, API keys or government tokens in code, migrations or fixtures.
  `federation_credentials` stores **environment-variable references and classes**
  (SANDBOX/PRODUCTION/MOCK) plus rotation state — never values.
- No credential logging: audit/event payloads carry ids, statuses and references only.
- The zero-connector seed is deliberate: a connector row exists only when real
  credentials + evidence exist; `is_mock` must be true otherwise, and mock state is
  displayed as such.

## 6. Failure policy (fail-closed, encoded in code)

| Gap | Result |
|---|---|
| No legal basis / DRAFT / expired | deny |
| Consent required but missing / withdrawn / expired / subject mismatch | deny |
| Consent requirement UNKNOWN on PROTECTED/HIGHLY_RESTRICTED data | deny |
| Agreement required but missing / not ACTIVE / expired | deny |
| Credential required but missing / not ISSUED / expired | deny |
| Clearance below the data-class floor | deny |
| `api_status = AUTHORIZED` but verification only REGISTERED | deny |
| Production promotion without production-grade, linked, VALID, unexpired evidence | `FederationInvariantError` + CHECK |
| FREE_CONFIRMED without cost evidence | CHECK + `assertFreeConfirmed` |
| Verification level-up without an evidence row | `assertVerifiable` |
| Production activation by non-HUMAN / without permission / without approval+evidence | `assertProductionActivation` |
| Unknown jurisdiction in a transition | plan BLOCKED / shape assertion |
| Unknown authority/service/cost/GovESB fact | UNCERTAIN / UNKNOWN / UNKNOWN_COST / GOVESB_UNKNOWN — recorded, never invented |

## 7. Audit & events

- `recordAudit` entries for every governed mutation (approve/deny, open incident,
  activation, revocation, …) with trace/correlation ids and IP/user-agent.
- `FEDERATION_*` CloudEvents into the canonical event ledger (e.g.
  `federation.accessRequest.approved`, `federation.production.activated`,
  `FEDERATION_DATA_ACCESSED` / `FEDERATION_DATA_REJECTED` from the access decision
  engine).
- Event stream page and hash-chained audit ledger are the existing canonical surfaces —
  federation emits into them; it does not create parallel event systems.
