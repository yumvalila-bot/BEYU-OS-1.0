# BEYU Federation & Trust — Tanzania GovESB posture

GovESB (Government Enterprise Service Bus) is Tanzania's integration fabric. This
capability models GovESB **explicitly and honestly**: as requirements to verify, never
as fabricated compliance.

## 1. The core rule

The system **never claims "GovESB connected"** (or `GOVESB_LIVE` /
`GOVESB_LIVE_VERIFIED`) without actual interface evidence. GovESB status is an
independent dimension on `federation_authorities` and `federation_connectors`,
changed only by recorded evidence, and `GOVESB_LIVE` / `GOVESB_LIVE_VERIFIED` are
evidence-gated (`GOVESB_EVIDENCE_GATED`).

## 2. The GovESB ladder

`GOVESB_STATUS` (independent of connectivity and of cost):

| Status | Meaning |
|---|---|
| `GOVESB_UNKNOWN` | No authoritative statement recorded — the default; never guessed |
| `GOVESB_NOT_REQUIRED` | The service is delivered outside GovESB (evidence-backed) |
| `GOVESB_REQUIRED` | The interface must go through GovESB; not yet engaged |
| `GOVESB_ELIGIBLE` | Eligibility confirmed for a GovESB integration |
| `GOVESB_REGISTERED` | Registered on GovESB (recorded reference) |
| `GOVESB_SANDBOX` | Sandbox/onboarding environment in use |
| `GOVESB_TESTED` | Tested against the GovESB environment (evidence) |
| `GOVESB_PRODUCTION_APPROVED` | Production approval recorded (evidence) |
| `GOVESB_LIVE` | Live on GovESB — **evidence-gated** |
| `GOVESB_LIVE_VERIFIED` | Live and independently verified — **evidence-gated** |

Every step up requires a matching evidence row (who/when/what/result), and the
strongest two states additionally require the evidence to be VALID, unexpired and
linked to the exact record. A `GOVESB_REQUIRED` authority (e.g. NIDA in the seed) is a
**requirement to verify**, not a claim.

## 3. What the seed records (Tanzania)

- The Tanzania jurisdiction profile declares its integration regime and records GovESB
  as the relevant cross-government fabric.
- Authorities are seeded at their honest default: most are `GOVESB_UNKNOWN` (no
  authoritative statement yet); where the program established that an interface is
  expected to run through GovESB, the record is `GOVESB_REQUIRED`.
- **Zero** authorities are `GOVESB_LIVE` or `GOVESB_LIVE_VERIFIED`, and there are
  **zero registered connectors** — no real credentials or interface evidence exist in
  this environment, so none are invented.
- The coverage and public-access reports state the GovESB distribution explicitly and
  repeat the zero-claim.

## 4. Why this is the correct posture

1. **No fabricated compliance.** Claiming GovESB connection without an interface,
   credential and test would be a false claim about a government system.
2. **Independent dimension.** GovESB status is not derived from `api_status`,
   `lifecycle_status` or `access_cost_status`; each moves on its own evidence.
3. **Fail-closed.** Absence of a statement is `GOVESB_UNKNOWN`, and the access
   decision engine treats a GOVESB-relevant service without a confirmed posture as not
   connectable.
4. **Portable.** The ladder is jurisdiction-generic; a future jurisdiction declares its
   own integration fabric (or none) via its profile, and the same evidence rules apply.

## 5. Path to a real GovESB state

1. A governed authority records the requirement (`GOVESB_REQUIRED`) with a source.
2. Eligibility/registration evidence is captured → `GOVESB_ELIGIBLE` / `GOVESB_REGISTERED`.
3. Sandbox + test evidence → `GOVESB_SANDBOX` / `GOVESB_TESTED`.
4. Production approval evidence → `GOVESB_PRODUCTION_APPROVED`.
5. A **real** connector with real credentials (env-var references, never values) plus
   live evidence → `GOVESB_LIVE`; independent verification → `GOVESB_LIVE_VERIFIED`.

Each step is a human-governed, evidence-backed mutation; none can be skipped, and the
CHECK constraints reject an unsupported promotion even if an application bug tried.
