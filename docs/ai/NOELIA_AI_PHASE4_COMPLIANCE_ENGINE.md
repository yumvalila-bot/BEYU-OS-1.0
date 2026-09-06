# Noelia AI Global Compliance, Conformity, Assurance, Evidence & Continuous Governance Engine

Phase 4 builds on the verified Phase 3 provider-independent AI platform (schema
`0023`–`0025`) without restarting Phases 1–3. It adds **migration `0026`** and
a **governance engine** in `src/lib/noelia/compliance-engine.ts`.

## Principle: governance is evidence, not authority

The engine records what exists, what is applicable, what evidence supports a
control and whether an external readiness state has been reached. It never:

- converts `BLOCKED` or `ENVIRONMENT_LIMITED` into `PASS`,
- fabricates providers, models, certificates, assessors or evidence,
- claims compliance without a current `VERIFIED` evidence record,
- self-declares `CERTIFIED`.

Technical implementation/verification (Phase 1–3) is kept separate from
governance/regulatory readiness/assessment/certification (Phase 4). The Phase 3
fail-closed and no-fabrication rules remain in force.

## Schema (migration 0026)

| Table | Purpose |
|---|---|
| `noelia_ai_requirements` | Requirement registry (EU AI Act / ISO 42001 / NIST AI RMF / ISO 23894 / ISO 27001 / ISO 27701 / ISO 22989 / ISO 23053 / OTHER). |
| `noelia_applicability_assessments` | Requirement ⇄ subject applicability with `LEGAL_REVIEW_REQUIRED` when legally ambiguous. |
| `noelia_controls` | DB-backed control registry (mirrors the immutable Phase 3 static register). |
| `noelia_requirement_controls` | Requirement → control mapping with evidence-backed effectiveness. |
| `noelia_evidence` | Tamper-evident evidence registry (SHA-256 artifact hash). |
| `noelia_impact_assessments` | AI impact assessment (safety, rights, data protection, oversight). |
| `noelia_risk_treatments` | Risk treatment with evidence-backed verification. |
| `noelia_internal_audits` | Internal audit program. |
| `noelia_findings` | Audit findings. |
| `noelia_corrective_actions` | CAPA. |
| `noelia_exceptions` | Control exceptions / risk acceptance. |
| `noelia_management_reviews` | Management review. |
| `noelia_regulatory_changes` | Regulatory change management. |
| `noelia_monitoring_indicators` | Continuous monitoring indicators. |
| `noelia_certification_readiness` | Certification readiness state machine. |
| `noelia_assessor_packages` | Evidence bundle for external assessors. |

All tenant-scoped tables enable + force RLS through the canonical
`beyu_tenant_ids()` / `beyu_global_scope()` helpers. Global governance tables
remain application-permission gated by `ai:compliance.*`.

## Governing rules

1. **Evidence hashing** — `computeEvidenceHash()` builds a canonical SHA-256
   over the evidence governance fingerprint. `verifyEvidenceIntegrity()`
   recomputes and compares; any mutation to the fingerprinted fields is
   reported as invalid.
2. **Current evidence** — `isEvidenceCurrent()` returns true only for
   `VERIFIED`, non-expired records. `EXPIRED`, `DRAFT`, `REJECTED`, `OBSOLETE`
   never support an `EFFECTIVE` rating.
3. **Effectiveness** — `evaluateControlEffectiveness()` is fail-closed: an
   `EFFECTIVE` verdict requires a current verified evidence record; otherwise
   the mapping stays `NOT_EVIDENCED`.
4. **Applicability** — an `UNDETERMINED` or `legallyAmbiguous` assessment is
   stored as `LEGAL_REVIEW_REQUIRED` and cannot be confirmed without an
   explicit legal review result.
5. **Certification** — `transitionCertificationReadiness()` enforces the state
   machine. `CERTIFIED` is reachable only from
   `EXTERNAL_ASSESSMENT_COMPLETE` **and** requires a `VERIFIED`,
   non-expired `EXTERNAL_CERTIFICATE` evidence record with a real external
   assessor.
6. **Cross-OS enforcement** — every service mutation calls
   `requirePermission(principal, "ai:compliance.*")`; possession of an
   enterprise/OS role does not grant compliance write/audit/certification
   authority.

## API

- `GET /api/v1/ai/noelia/compliance` — honest compliance dashboard.
- `POST /api/v1/ai/noelia/compliance/actions` — governed actions
  (`register.requirement`, `assess.applicability`, `register.evidence`,
  `verify.evidence`, `transition.readiness`,
  `generate.assessor-package`, ...).

## Test evidence

- `tests/noelia/compliance-engine.test.ts` — 8 tests (evidence tampering,
  legal review, certification guard, expired certificate, effectiveness,
  cross-OS permission, dashboard honesty).
- `tests/noelia/adversarial-ai-security.test.ts` — declares runtime-role RLS
  isolation for `noelia_evidence`.
