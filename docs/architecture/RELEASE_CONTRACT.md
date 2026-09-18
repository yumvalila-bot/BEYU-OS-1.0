# BEYU OS — Governed release contract (P1)

**Status:** normative. This documents the *target* release lifecycle and the four
governed transitions it hinges on. It claims **nothing** about traffic control:
the query-layer reality as of P1 is that Blue-Green and Canary do not exist yet,
and the repository has no production deploy credentials — see "Current reality"
below. Later phases implement the missing pieces without changing the deployment
topology.

## The lifecycle

```
DESIGN → BUILD → TEST → DEPLOY GREEN → PVG → CANARY → PROGRESSIVE PROMOTION
  → FINAL PVG → VERIFIED → RETIRE OLD RELEASE → CONTRACT DATABASE
```

## The four governed verbs

A release's state is described by exactly four verbs, distinct and independently
evidenced:

- **DEPLOY** — an immutable artifact (git SHA → buildId) is made available in an
  environment. Platform "Ready" proves only this.
- **VERIFY** — the Production Verification Gate (PVG) proves the deployed
  artifact *is the artifact that was tested* and passes its mandatory checks
  (deployment status, expected vs runtime SHA, release identity, environment,
  health, database connectivity, TLS, critical APIs, authentication, RBAC, ABAC,
  tenant/entity/country isolation, RLS, audit, event processing, critical
  workflows). Failing a mandatory check must not be turned into PASS.
- **PROMOTE** — traffic is shifted toward the verified release in governed,
  audited, reversible stages (the P6 canary stages, with PVG + telemetry at each
  stage: 0% → 1% → 5% → 25% → 50% → 100%). A failed canary stage returns
  traffic to the stable release.
- **ROLLBACK** — a failed release is progressively rolled back to a stable,
  already-proven release (application redeploy/`git revert`; database forward-fix
  only). A rollback is itself evidence and is always allowed to be triggered by
  a verification failure.

## Distinct statuses

`DEPLOYED` and `VERIFIED` and `PROMOTED` are **not** the same state, and none of
them may be reached implicitly by another:

```
DEPLOYED ≠ VERIFIED ≠ PROMOTED
```

## State vocabulary (non-ratified, ordered)

The PVG (P4) will carry this governed vocabulary. It is listed here as the
programme's release notation, not as an implemented subsystem:

| State | Meaning |
| --- | --- |
| `BUILD` | artifact produced |
| `TESTED` | repository/CI checks green |
| `APPROVED` | approved for deployment (governance, not automatic) |
| `DEPLOYING` | deployment in progress |
| `DEPLOYED` | artifact in the target environment, unverified |
| `VERIFYING` | PVG running |
| `VERIFIED` | PVG passed for the current stage |
| `FAILED` | a mandatory check failed |
| `ROLLED_BACK` | returned to the stable release |

## Expansion / contraction (database)

`EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT` is the hard database
invariant for every schema evolution: the currently deployed release stays
compatible with the expanded schema until that release is retired. Catalogue and
enforce migration classification in P2 (ADDITIVE vs CONTRACTING, dual-write
where genuinely required) without moving away from `npm run migrate` as the only
runner.

## Current reality (so nothing is mis-claimed)

- This repository carries **no** production deploy credentials. Production
  application deploy is performed by the Vercel Git integration on `main`, and
  the governed `scripts/deploy.sh` stops at its authorization boundary (exit
  non-zero) when credentials are absent. Production deploy/rollback therefore
  remains a human-governed platform action. The BLUE/GREEN traffic-switch and
  CANARY stage transitions are **declared, not implemented**, in this contract
  (they are P5–P7).
- The Production Verification Gate is **composed of existing checks**
  (`scripts/certify-production.mts`) plus the P3 runtime identity, and P4 makes
  it governed and stage-aware. No release state may be inferred from a platform
  "Ready" verdict.
- No percentage is exposed or acted upon in P1.

## What P1 does NOT do (explicitly)

- No canary percentages, no traffic splitting, no load-balancer changes.
- No Blue-Green traffic switch, no automatic production promotion, no production
  rollback automation, no destructive database contraction.
