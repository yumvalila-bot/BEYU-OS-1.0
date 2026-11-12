# Health clinical resource authorization — policy and endpoint coverage inventory

**Status:** Initial security design and inventory. This document does not claim that every route is already wired to the policy. Route-by-route enforcement and integration tests remain release gates.

## Non-negotiable boundary

A successful BEYU sign-in or a valid BEYU-to-Health identity assertion establishes a canonical identity hand-off only. It does not grant clinical access. Health must resolve the local account, tenant membership, professional authority, patient/resource relationship, facility assignment and current session from Health-local records on every protected request.

No caller-supplied body, query, header, or token claim may establish a trusted patient relationship, facility assignment, professional licence/scope, consent, legal basis, classification clearance, or second-reviewer identity.

## Request authorization policy

For every protected request, evaluate in order and fail closed:

1. **Health-local session:** verify signature, issuer, audience, expiry, active session `jti`, local account status and current security version. Logout and logout-all must invalidate subsequent access-token requests.
2. **Identity and tenant:** resolve the canonical BEYU identity link and Health-local user/membership. Require an active membership in the selected tenant. Tenant switching is not an authorization grant.
3. **Resource ownership:** resolve the requested resource from the Health database and derive its patient, tenant, facility and classification from persisted relationships. Do not authorize from a caller-supplied patient ID alone.
4. **Facility assignment:** verify the actor's current assignment and privilege at the resource's facility. Reject cross-facility access unless a separately governed and audited policy explicitly permits it.
5. **Professional authority:** for clinical acts, verify active professional registration, licence, licensing authority, scope of practice and facility privileges for the exact action. Administrative roles do not acquire clinical privileges.
6. **Purpose and lawful basis:** require a controlled purpose-of-use value mapped to the action and data category. Resolve legal basis server-side. Consent, treatment, payment, legal obligation, vital interest and public task are distinct bases; do not treat every active legal-basis record as consent.
7. **Consent:** where consent is the required basis, check status, effective-from, effective-until, patient, purpose, data category, scope and recipient. Withdrawal or expiry must take effect immediately.
8. **Classification and minimization:** compare resource classification with actor clearance and purpose. Return only the minimum necessary fields; mask or deny sensitive categories when policy requires.
9. **Audit:** record actor, tenant, facility, resource/patient reference, purpose, legal basis, classification, session, decision and denial reason. Do not place clinical payloads or unnecessary PHI in audit logs.
10. **Transactional integrity:** re-check authorization-sensitive relationships within the mutation transaction to avoid time-of-check/time-of-use races. List/search endpoints must filter in SQL under tenant/facility/actor scope rather than fetch broad result sets and filter in memory.

## Domain coverage inventory

| Domain / module family | Required resource checks |
|---|---|
| Patient records and search | Patient relationship, tenant, facility, purpose, classification, minimum necessary fields; SQL-scoped list/search |
| Encounters, observations, problems, allergies and medications | Patient-to-encounter relationship, care-team relationship, facility and purpose; draft/read/update permissions separated |
| Clinical notes and records | Authoring professional scope, patient relationship, classification; signing and amendment are separate privileged actions |
| Prescriptions and pharmacy dispensing | Authorized prescriber, prescription-to-patient relationship, pharmacist authority, validity, quantity and controlled-drug/dual-control rules |
| Laboratory orders and results | Ordering authority, specimen/patient linkage, verifier identity, result classification, release and critical-result escalation |
| Imaging, radiology and diagnostics | Patient/order linkage, facility/equipment privilege, interpreting professional scope, report verification and release |
| Theatre, dialysis, ophthalmology and procedures | Procedure-specific professional scope, facility privilege, patient identity, equipment/service checks and consent/legal basis |
| Referrals and telehealth | Origin/destination facility relationship, patient relationship, minimum necessary disclosure, session purpose and consent/legal basis |
| Emergency and ambulance | Emergency purpose, patient match, facility/dispatch authority, time-bounded break-glass where applicable and post-event audit |
| Hospital administration and operations | Explicit operational permissions; no blanket access to clinical records by virtue of administrative role |
| Insurance, payer, billing and claims | Claim-to-patient relationship, payment purpose, payer entitlement and minimum necessary disclosure; no unrestricted clinical-record access |
| FHIR, integrations and reporting | Same resource policy as direct APIs; service identity, purpose, tenant, patient and classification checked at the integration boundary |

## Break-glass

Emergency access must be a distinct, time-bounded, reasoned and permission-gated workflow. It must capture the emergency basis, actor, patient, resources accessed, facility, start/end time and post-event review. It must not silently bypass tenant isolation, professional scope, classification, or unrelated access restrictions.

## Required adversarial verification

- Cross-tenant, cross-facility and unrelated-patient reads/writes are denied.
- Caller-supplied patient, facility, tenant, professional, purpose, consent, classification and second-reviewer fields cannot elevate authority.
- Inactive/expired professional registration, scope or facility privilege is denied.
- Consent absent, withdrawn, expired, not-yet-effective, wrong-purpose, wrong-category, wrong-scope or wrong-recipient is denied when consent is required.
- Alternative legal bases are separately validated and audited.
- List/search queries never return unauthorized resources.
- Revoked local session `jti`, replayed assertion `jti`, stale security version, inactive identity link and inactive membership are denied.
- Authorization is revalidated in mutations to cover TOCTOU races.
- Break-glass is constrained and audited.

## Release gate

This inventory is a design and coverage baseline. It must not be represented as complete enforcement until the implementation adds explicit resource resolvers/policy metadata to every in-scope route, verifies SQL-level filtering and passes the adversarial PostgreSQL-backed suite.
