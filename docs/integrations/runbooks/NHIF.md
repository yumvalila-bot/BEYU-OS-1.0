# Runbook — NHIF (National Health Insurance Fund) e-Claims

**Adapter:** `src/lib/government/adapters/nhif.ts`
**Registry row:** `NHIF` — current status **EXTERNAL_BLOCKED**.
**Consumer:** Health OS only, through the Government Integration Fabric.
**Tenancy rule:** each facility uses ONLY its own NHIF credentials; the fabric
never shares one facility's authority across tenants.

## Interface (as discovered — verify with NHIF before CONTRACT_VERIFIED)

- Protocol: REST + JSON, bearer token.
- Token: `https://verification.nhif.or.tz/nhifservice/Token/` (per-facility
  username/password → time-limited bearer).
- Member verification / referral / pre-approval: under
  `https://verification.nhif.or.tz/nhifservice/breeze/verification/...`.
- Claims submission: `POST https://verification.nhif.or.tz/claimsserver/api/v1/Claims/SubmitFolios`.
- Reconciliation: `GET .../claimsServer/api/v1/claims/getSubmittedClaims?FacilityCode=&ClaimYear=&ClaimMonth=`.
- Folios require practitioner MCT license numbers.

Discovery evidence from community documentation of the NHIF e-claims API;
official confirmation from NHIF IT (it@nhif.or.tz) is required before the
registry row moves to `CONTRACT_VERIFIED`.

## Credential references (env-var NAMES; values never committed)

| Ref | Meaning |
|-----|---------|
| `BEYU_NHIF_BASE_URL` | NHIF environment base URL |
| `BEYU_NHIF_FACILITY_CODE` | Facility code issued by NHIF |
| `BEYU_NHIF_USERNAME_REF` | Secret-store reference to the facility username |
| `BEYU_NHIF_PASSWORD_REF` | Secret-store reference to the facility password |

## Activation ladder

1. Facility applies to NHIF for e-claims credentials; obtain official API
   confirmation → `CONTRACT_VERIFIED`.
2. Test-facility credentials configured; verification + folio submission
   round-trip evidenced in `government_submissions` → `SANDBOX_READY`.
3. NHIF UAT sign-off on submitted folios → `UAT_VERIFIED`.
4. **Production authorization (HUMAN_REVIEW):** recorded in
   `production_authorized_by/at` (DB CHECK enforced).
5. LIVE: monthly reconciliation via `getSubmittedClaims` is mandatory — every
   `SUBMITTED` folio must reach `ACCEPTED`/`REJECTED` from NHIF data, never
   assumed.

## Failure semantics

- No facility credentials → `EXTERNAL_BLOCKED`, gateway refuses (fail-closed).
- A claim is `ACCEPTED` only with an NHIF reference (DB CHECK).
- Noelia may PREPARE claim folios but can never submit them (no tool holds
  `government:submission.manage`) and must never state "claim submitted"
  without an adapter-confirmed submission record.
