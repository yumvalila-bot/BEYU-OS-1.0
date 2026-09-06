# NOELIA AI System Card

Version: `noelia.phase3` — 2026-09-06

This is an internal system card. It is not an independent conformity assessment
and it does not claim any certification.

## Purpose

Noelia is BEYU OS's enterprise AI identity/intelligence layer. It is a
**control plane** capability that produces governed intelligence and evidence. It
does not own Finance, Health, Agriculture or any Sector OS authority.

## Architecture

```
BEYU OS Control Plane (authority)
        │
 NOELIA AI (identity / intelligence)
        │
 HIVE runtime (governance boundary)
        │
 MODEL ROUTER → MODEL GATEWAY → AIModelProvider
        │
   BEYU OWNED / SELF-HOSTED / OPEN-WEIGHT / EXTERNAL
        │
      REAL MODEL
        │
   OUTPUT GOVERNANCE → TOOL GOVERNANCE → HUMAN APPROVAL → AUDIT
```

## AI Identity

- `NOELIA` is an `ENTERPRISE_AI` identity, stored in `noelia_ai_identity`.
- Effective authority is always the intersection of a requesting human's grants
  and the governed AI policy. NOELIA has no autonomous authority.

## Models / Providers

- `model_registry`: lifecycle, capability, deployment, residency, approval,
  evaluation, security, risk and lifecycle status metadata.
- `noelia_providers`: provider registry (BEYU_OWNED / SELF_HOSTED / OPEN_WEIGHT /
  EXTERNAL). External providers are optional suppliers.
- `AIModelProvider.ts`: provider-neutral contract with `generate`, `execute`,
  `stream`, `embed`, `health`, `capabilities`, `metadata`.
- The only real provider currently on the registry is the
  `beyu-hive-deterministic-analyst` runtime, classified `DETERMINISTIC_ANALYST`.
  This is *not* a generative model.

## Data

- Data classification is `PUBLIC / INTERNAL / CONFIDENTIAL / RESTRICTED /
  HIGHLY_RESTRICTED`.
- Routing and residency enforcement fail closed on external/non-BEYU-controlled
  providers for restricted data.
- Model output is untrusted. No body of retrieved, external, or model content
  can alter authorization, policy, tenancy, entity, country, OS or permissions.

## Authorization

- AI authorization (`ai:noelia.query`, `ai:analytics.read`, `ai:executive.read`)
  is checked before routing.
- DB-level tenant isolation is enforced by RLS on tenant-scoped AI tables and is
  proven through the non-BYPASSRLS runtime role.

## Risks / Limitations

- **REAL generative inference is BLOCKED by environment**: there is no real
  BEYU-owned/self-hosted/approved external runtime with endpoint and credential
  in this environment.
- The deterministic analyst performs control-plane validation, governance tests
  and non-generative intelligence. It is not evidence of generative inference.
- Independent security/AI assurance and conformity assessment have not occurred.

## Human Oversight

- HIGH/CRITICAL actions require `REQUIRED_REVIEW` or `DUAL_CONTROL`.
- A model-generated tool call is a REQUESTED ACTION, never an AUTHORIZED ACTION.

## Monitoring / Incidents / Kill Switch

- `noelia_incidents` lifecycle: OPEN → CONTAINED → RESOLVED → CLOSED.
- `noelia_kill_switch` scopes: ALL, MODEL, PROVIDER, TOOL, OS, TENANT,
  CAPABILITY, AI_IDENTITY. Activation is fail-closed and never bypassed.

## Certification Status

- ACTUAL_CERTIFICATION_STATUS: **NOT_CERTIFIED**
- EXTERNAL_ASSESSMENT_STATUS: **NOT_STARTED**
