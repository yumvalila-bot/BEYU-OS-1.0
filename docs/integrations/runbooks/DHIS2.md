# Runbook — DHIS2 (National HMIS aggregate reporting)

**Adapter:** `src/lib/government/adapters/dhis2.ts`
**Registry row:** `DHIS2` — current status **EXTERNAL_BLOCKED**.
**Consumer:** Health OS only, through the Government Integration Fabric.

## Interface

DHIS2 has a public, versioned, well-documented Web API (REST + JSON) —
https://docs.dhis2.org. The API contract itself is public; what is blocked is
authorized access to the NATIONAL instance:

- Base: `<national-instance>/api/<version>/...`
- Aggregate reporting: `POST /api/dataValueSets` (dataSet, orgUnit, period,
  dataValues), import summary returned synchronously.
- Metadata (data elements, org units, data sets): `GET /api/metadata`-family.
- Auth: basic auth or Personal Access Token issued by the instance
  administrator (Ministry of Health).

The generic contract is verified from official DHIS2 documentation; the
national instance's version, org-unit tree and dataset assignments must be
confirmed at onboarding.

## Credential references (env-var NAMES; values never committed)

| Ref | Meaning |
|-----|---------|
| `BEYU_DHIS2_BASE_URL` | Authorized national instance URL |
| `BEYU_DHIS2_USERNAME_REF` | Secret-store reference to the reporting account |
| `BEYU_DHIS2_PAT_REF` | Secret-store reference to the personal access token |
| `BEYU_DHIS2_ORG_UNIT` | Assigned organisation unit UID |

## Activation ladder

1. MoH grants instance access + org-unit/dataset assignment → credentials set.
2. Round-trip against the instance's `/api/system/info` and a test
   dataValueSet in the sandbox/training instance → `SANDBOX_READY`.
3. MoH verification of submitted aggregates → `UAT_VERIFIED`.
4. **Production authorization (HUMAN_REVIEW):** recorded in
   `production_authorized_by/at`.
5. LIVE: import summaries are validated on every push; conflicts/import errors
   → `REJECTED` or `RECONCILIATION_REQUIRED`, never silently dropped.

## Failure semantics

- Missing instance URL/credentials → `EXTERNAL_BLOCKED` (fail-closed).
- Import summary `status != OK` → the submission is NOT `ACCEPTED`; conflicts
  recorded in `last_error_code` + raw response retained as evidence.
- Facility data flows only for the tenant's own org units (tenant scope +
  RLS on `government_submissions`).
