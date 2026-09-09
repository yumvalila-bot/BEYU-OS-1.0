# Runbook — TRA Virtual Fiscal Device (EFDMS VFD)

**Adapter:** `src/lib/government/adapters/tra-vfd.ts`
**Registry row:** `TRA_VFD` — current status **EXTERNAL_BLOCKED**.
**Never activate without:** TRA-issued credentials, verified official spec, and
recorded production authorization (`production_authorized_by/at`).

## Interface (as discovered — verify against the official TRA VFD spec before CONTRACT_VERIFIED)

- Protocol: HTTP + XML (non-REST). Requests signed with the TRA-provided
  certificate private key (`EFDMSSIGNATURE`).
- Headers: `Content-Type: application/xml`, `Routing-Key`, `Cert-Serial`
  (base64), `Authorization: bearer <token>` (time-limited).
- TEST environment endpoints (production endpoints issued by TRA at onboarding):
  - Registration: `https://virtual.tra.go.tz/efdmsRctApi/api/vfdRegReq` (one-time; yields VFD number)
  - Token: `https://virtual.tra.go.tz/efdmsRctApi/vfdtoken`
  - Receipt/invoice: `https://virtual.tra.go.tz/efdmsRctApi/api/efdmsRctInfo`
  - Z-report: `https://virtual.tra.go.tz/efdmsRctApi/api/efdmszreport`
  - Public verification: `https://virtual.tra.go.tz/efdmsRctVerify/...`

Discovery evidence only — sourced from a community mirror of the TRA spec. The
official TRA VFD specification document MUST be obtained from TRA and verified
before the registry row may move to `CONTRACT_VERIFIED`.

## Credential references (env-var NAMES; values are never committed)

| Ref | Meaning |
|-----|---------|
| `BEYU_TRA_VFD_BASE_URL` | TRA-issued environment base URL (test vs production) |
| `BEYU_TRA_VFD_TIN` | Taxpayer TIN |
| `BEYU_TRA_VFD_CERT_KEY` | TRA-provided certkey |
| `BEYU_TRA_VFD_CERT_SERIAL` | Certificate serial (sent base64) |
| `BEYU_TRA_VFD_PRIVATE_KEY_REF` | Reference to the signing private key in the secret store (never the key itself) |

## Activation ladder

1. **Onboard with TRA:** obtain TIN registration for VFD, certificate + certkey,
   official spec document. → status `CONTRACT_VERIFIED` after the spec is
   verified against the implementation.
2. **Test environment:** set the credential refs for the TRA TEST environment;
   run the adapter registration + token + receipt round-trip; record raw
   request/response evidence in `government_submissions`. → `SANDBOX_READY`.
3. **UAT:** TRA acceptance of receipts issued from the test environment.
   → `UAT_VERIFIED`.
4. **Production authorization (HUMAN_REVIEW — hard gate):** business owner and
   TRA production go-ahead recorded in `production_authorized_by/at` (the
   database CHECK refuses `PRODUCTION_READY`/`LIVE` without it).
5. **LIVE:** production credential refs set; first live receipt reconciled and
   verified via the TRA verification portal QR path.

## Failure semantics

- Missing/incomplete credentials → adapter self-reports `EXTERNAL_BLOCKED`;
  gateway refuses submission (409 `AGENCY_NOT_CALLABLE`). Never invent values.
- TRA timeout/unreachable → submission `EXTERNAL_UNAVAILABLE` (retry with the
  same idempotency key replays, never double-issues).
- A receipt is only `ACCEPTED` with a TRA-returned reference (DB CHECK).
- Receipts pending TRA acknowledgment stay `SUBMITTED`/`RECONCILIATION_REQUIRED`
  — never optimistically `TRA_ACCEPTED`.
