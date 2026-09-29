# BEYU OS — Tanzania Public-Access Report

- Generated: 2026-09-29T19:48:50.488Z
- Source: seeded federation registry (0071) + documented go.tz directory baseline
- Basis: registration/verification state only. **No live connectivity, no verified access, no fabricated cost or GovESB compliance.**

## Zero-claims (evidence-gated — currently true)

| Claim | Count | Gate |
|---|---|---|
| Authorities LIVE / LIVE_VERIFIED / MONITORED | 0 | live-operation evidence required (assertLifecycleMove) |
| FREE_CONFIRMED cost records | 0 | explicit authoritative evidence only (federation_authorities_free_gate CHECK) |
| GOVESB_LIVE / GOVESB_LIVE_VERIFIED | 0 | real GovESB interface evidence required |
| Registered connectors | 0 | connectors only with real credentials + evidence (none seeded) |
| Verifications at LIVE or above | 0 | federation_verifications_evidence_gate CHECK |

## Service data classification (66 services)

PROTECTED 52, PUBLIC 14

## Service access level

NOT_CONNECTED 66

## Authority access-cost state

UNKNOWN_COST 391, PUBLIC_INFORMATION 2

## Service access-cost state

UNKNOWN_COST 62, PUBLIC_INFORMATION 4

## Interpretation

- PUBLIC rows are **public-information** registrations (classification PUBLIC / access
  level NOT_CONNECTED) — they describe what the authority publishes, not what BEYU can
  read. Nothing is connected.
- PROTECTED / UNVERIFIED classification and PROTECTED_DATA access levels mean the data
  is subject to consent, legal-basis and purpose-limitation gates before any future
  access request can be approved.
- UNKNOWN_COST is the honest default: cost is never inferred from "free website" or
  similar, and FREE_CONFIRMED requires recorded authoritative evidence.
