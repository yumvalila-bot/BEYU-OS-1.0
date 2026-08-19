# Architecture Decision Records

ADRs are stored in `platform.architecture_decisions` and rendered at `/os/registry`. Each records
context, decision, consequences, alternatives, security analysis, compliance analysis, rollback
plan, decider and date. ADRs are **mandatory** for major architectural decisions (Constitution
Art. 11).

| ADR | Title | Status |
| --- | --- | --- |
| 001 | BEYU OS is the single enterprise control plane | ACCEPTED |
| 002 | Family Office is a first-class BEYU OS capability, not a separate OS | ACCEPTED |
| 003 | Tax Strategy Intelligence lives inside Finance OS | ACCEPTED |
| 004 | Hash-chained append-only audit ledger | ACCEPTED |

## Architectural decision rule

Before placing any feature, answer: (1) is it enterprise-wide? (2) is it a shared capability?
(3) is it sector-specific? (4) who is the authoritative source of truth? (5) who owns the data?
(6) who owns the decision? (7) who executes the operation? (8) which OS has authority?
(9) what policies apply? (10) what jurisdiction applies? (11) what security classification applies?
(12) what audit is required? (13) what AI involvement is permitted? (14) what human approval is
required?

## Final architectural test

Does the change strengthen BEYU OS as the control plane; preserve one source of truth; preserve
authority boundaries; avoid duplication; preserve tenant isolation, security, auditability and
human accountability; support jurisdictional compliance; remain scalable and extensible; integrate
correctly with Noelia and HIVE; and preserve Sector OS boundaries? If any answer is **no**,
redesign before implementation.
