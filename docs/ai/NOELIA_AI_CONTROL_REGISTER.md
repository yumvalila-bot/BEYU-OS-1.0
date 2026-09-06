# NOELIA AI Control Register

Date: 2026-09-06

This register is machine-readable in `src/lib/noelia/compliance.ts`. Every row
references source code, database control, a test and evidence. Statuses are
honest; nothing is presented as certification.

| Control ID | Requirement | Status | Risk | Evidence/Tests | Assessment |
|---|---|---|---|---|---|
| NOELIA-AI-CTRL-001 | Provider-independent model abstraction | IMPLEMENTED | LOW | `tests/noelia/provider-contract.test.ts` | INTERNAL |
| NOELIA-AI-CTRL-002 | No fabricated credentials/endpoints | IMPLEMENTED | HIGH | `tests/noelia/provider-contract.test.ts` | INTERNAL |
| NOELIA-AI-CTRL-003 | Real generative inference honest status | BLOCKED | MEDIUM | `tests/noelia/provider-contract.test.ts`, `runtime-governed-model.test.ts` | EXTERNAL |
| NOELIA-AI-CTRL-004 | Model lifecycle append-only and governed | IMPLEMENTED | MEDIUM | `tests/noelia/model-lifecycle.test.ts` | INTERNAL |
| NOELIA-AI-CTRL-005 | Provider lifecycle supplier onboarding | IMPLEMENTED | MEDIUM | `tests/noelia/model-lifecycle.test.ts` | INTERNAL |
| NOELIA-AI-CTRL-006 | Model provenance / supply chain | IMPLEMENTED | MEDIUM | `tests/noelia/model-lifecycle.test.ts` | EXTERNAL |
| NOELIA-AI-CTRL-007 | Prompt governance / injection prevention | IMPLEMENTED | HIGH | `tests/noelia/governance.test.ts`, `adversarial-ai-security.test.ts` | EXTERNAL |
| NOELIA-AI-CTRL-008 | Output governance, output untrusted | IMPLEMENTED | HIGH | `tests/noelia/governance.test.ts` | EXTERNAL |
| NOELIA-AI-CTRL-009 | High-risk action human oversight | IMPLEMENTED | HIGH | `tests/noelia/governance.test.ts` | EXTERNAL |
| NOELIA-AI-CTRL-010 | Tenant isolation verified (runtime role) | VERIFIED | CRITICAL | `tests/noelia/ai-platform.test.ts`, `adversarial-ai-security.test.ts` | EXTERNAL |
| NOELIA-AI-CTRL-011 | Cross-OS AI authorization boundary | VERIFIED | CRITICAL | `tests/noelia/adversarial-ai-security.test.ts` | EXTERNAL |
| NOELIA-AI-CTRL-012 | Model routing deterministic/fail-closed | IMPLEMENTED | HIGH | `tests/noelia/ai-platform.test.ts`, `runtime-governed-model.test.ts` | INTERNAL |
| NOELIA-AI-CTRL-013 | Replay protection / idempotency | IMPLEMENTED | MEDIUM | `tests/noelia/ai-platform.test.ts` | INTERNAL |
| NOELIA-AI-CTRL-014 | AI decision attribution / audit | IMPLEMENTED | MEDIUM | `tests/noelia/runtime-governed-model.test.ts` | INTERNAL |

## Status semantics

- **IMPLEMENTED** — code/schema exists and is wired into the governed path.
- **VERIFIED** — the property is proven by a real database/test assertion.
- **BLOCKED** — the capability requires a real runtime/credential not present.
- **PARTIALLY_IMPLEMENTED** — the evidence exists but full conformity requires
  external analysis.
- **EXTERNAL_ASSESSMENT_REQUIRED** — independent assessment is still required.
