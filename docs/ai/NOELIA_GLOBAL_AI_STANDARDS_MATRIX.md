# NOELIA Global AI Standards Matrix

Date: 2026-09-06

This matrix maps the implemented Noelia controls to applicable frameworks. It is
an **alignment** document, not a certificate. The source of truth is the
machine-readable matrix in `src/lib/noelia/compliance.ts`.

| Framework | Applicability | BEYU Control | Implementation | Status | External Assessment |
|---|---|---|---|---|---|
| EU AI Act | Exact applicability requires a legal assessment; Noelia is not automatically classified high-risk. | 001, 012, 014 | AI identity, model/provider inventory, routing, attribution | PARTIAL | REQUIRED |
| ISO/IEC 42001 | Relevant once an AI management system is formally established. | 001-009, 012-014 | Lifecycle, provenance, governance, audit | PARTIAL | REQUIRED |
| NIST AI RMF | Risk-management alignment model. | 001-012 | GOVERN/MAP/MEASURE/MANAGE controls, AI risk register | PARTIAL | REQUIRED |
| NIST GenAI Profile | Not fully assessed; generative inference is blocked by environment. | 003, 007, 008 | Prompt/output governance for any future generative runtime | PARTIAL | REQUIRED |
| ISO/IEC 23894 | AI risk management. | 004-006 | Risk register, lifecycle/provenance risk status | PARTIAL | REQUIRED |
| ISO/IEC 27001 | Information security where AI processes data. | 010, 011, 013 | Runtime-role RLS, cross-OS authz, replay protection | PARTIAL | REQUIRED |
| ISO/IEC 27701 | Privacy; not yet assessed. | EVIDENCE_REQUIRED | No completed privacy impact assessment for AI | EVIDENCE_REQUIRED | REQUIRED |
| ISO/IEC 22989 | AI terminology consistency. | 001, 003 | DETERMINISTIC_ANALYST / GENERATIVE_MODEL distinctions | IMPLEMENTED | NOT_REQUIRED |
| ISO/IEC 23053 | AI/ML framework concepts. | 001-003, 012 | Provider-neutral model abstraction | IMPLEMENTED | NOT_REQUIRED |

## Honest status

- EU_AI_ACT_READINESS = PARTIAL
- ISO_42001_READINESS = PARTIAL
- NIST_AI_RMF_ALIGNMENT = PARTIAL
- INTERNATIONAL_STANDARDS_READINESS = PARTIAL
- EXTERNAL_ASSESSMENT_STATUS = NOT_STARTED
- ACTUAL_CERTIFICATION_STATUS = NOT_CERTIFIED
