# NOELIA Model Supply Chain

Date: 2026-09-06

This document records the model supply-chain evidence that actually exists. It
does not invent checksums, provenance, approvals or external artifacts.

## Registered model inventory

| Model ID | Model | Version | Provider | Kind | Deployment | Residency | Lifecycle | Approval | Evaluation |
|---|---|---|---|---|---|---|---|---|---|
| `MOD_NOELIA_DET` | `beyu-hive-deterministic-analyst` | `2026.09` | `PROV_NOELIA_DET` | `DETERMINISTIC_ANALYST` | `SELF_HOSTED` | `BEYU_CONTROLLED` | `ACTIVE` | `APPROVED` | `APPROVED` |

The deterministic analyst is BEYU-internal controlled-plane code. Its origin is
recorded in `noelia_model_provenance` as `BEYU_INTERNAL` / publisher
`BEYU OS Noelia HIVE`, transformation `NONE`, and verification `PARTIAL` (it is
built from repository source, so no external artifact checksum applies).

## Provenance & artifacts

- `noelia_model_provenance` — origin, publisher, family, artifact identity,
  checksum, license, deployment, transformation, base/lineage, verification
  status.
- `noelia_model_artifacts` — non-secret artifact URI + checksum + verification
  time. No credentials are ever stored.
- `verifyArtifactDigest` rejects a checksum mismatch and empty checksums.

## Governance chains

- Every model and provider lifecycle transition is append-only in
  `noelia_model_lifecycle_events` / `noelia_provider_lifecycle_events`.
- A model is executable only when its lifecycle is `ACTIVE` AND the registry row
  is `ACTIVE`/`APPROVED`/`APPROVED`.

## External providers

No external provider is registered, activated or used. There is no real
generative model runtime in this environment, so
`REAL_GENERATIVE_INFERENCE = BLOCKED_BY_ENVIRONMENT`.

## Retirement

Retirement keeps historical audit references and stops new routing; it is
recorded as a lifecycle event, never a deletion.
