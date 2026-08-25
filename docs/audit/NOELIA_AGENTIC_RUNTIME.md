# NOELIA — Agentic Workflow Runtime & Human Approval Orchestration

**Status:** IMPLEMENTED (2026-08-25) · Evidence: `tests/noelia/workflow-integration.test.ts`
(8 tests), HTTP full-loop smoke (plan→validate→authorize→execute→COMPLETED; self-authorize 403).

## Lifecycle (section 15)

```
PLAN → VALIDATE → AUTHORIZE → EXECUTE → OBSERVE → REASSESS → CONTINUE/ESCALATE/STOP → AUDIT
```

| Phase | Implementation | Authority gate |
|---|---|---|
| PLAN | `BeyuNoeliaWorkflowService.create` — persists workflow + PENDING steps, audited; nothing executes | `ai:workflow.run` + tenant scope |
| VALIDATE | `validate` — every step resolved against the registry; denied steps → STOPPED with per-step denialCode | registry authorize per step |
| AUTHORIZE | `authorize` — approval row; requester can never self-authorize; `ai:workflow.approve` | maker/checker |
| EXECUTE | `execute` — re-checks authorization (approval row must be APPROVED by a separate human); steps run through registry; each step commits individually | registry invoke (fresh authorize) |
| OBSERVE | per-step output + observations persisted | — |
| REASSESS | humanReviewRequired output → ESCALATED; cancellationRequested → STOPPED; timeout → TIMED_OUT | — |
| AUDIT | every transition and step audited (workflowAudit); steps carry policyDecision, denialCode, auditRef | immutable audit |

## Properties

- **Durable**: workflow + steps persist; crash between steps leaves committed
  steps COMPLETED and uncommitted PENDING.
- **Recoverable/idempotent**: re-execution of an AUTHORIZED or crashed-RUNNING
  workflow resumes (RESUMED for committed steps); a COMPLETED workflow
  requires fresh authorization — approval is never authority by existence.
- **Bounded**: maxSteps (1–12), timeoutMs (1–300s), budget recorded; loops
  cannot run away.
- **Cancellable**: cancellationRequested flag; execution stops at the next
  step boundary; remaining steps SKIPPED.
- **Maker/checker**: requester ≠ approver enforced in `authorize` and
  re-checked in `execute` (approval row decision + approverUserId).
- **Traceable**: traceId/correlationId/causationId on the workflow; per-step
  traceId + audit evidence.

## Human approval orchestration (section J)

- Noelia can REQUEST (requestNoeliaAction), PREPARE, EXPLAIN, ROUTE, WAIT,
  RECORD — never SELF-APPROVE/SELF-DELEGATE/SELF-ELEVATE/SELF-BYPASS.
- Approval levels: risk-based HIGH tool gate (approverRole + separate human);
  workflow-level authorization; action-request approvals (Phase 15).
- Amount/classification/entity/country/jurisdiction gates: enforced by the
  tool registry metadata (approvalRequirements, jurisdictionRestrictions,
  entityRestrictions) and by RBAC roles.
- Quorum: governance resolutions retain their own quorum machinery
  (governance-vote-service) — untouched.
- **Approval ≠ execution**: executeApprovedNoeliaAction and workflow execute
  both re-run `registry.invoke`, which re-checks RBAC/ABAC/scope/approval.

## Autonomy levels (section XVIII)

- L0 Observe / L1 Analyze / L2 Recommend — default, unrestricted.
- L3 Prepare / L4 Request Approval / L5 Execute Approved Action — governed
  workflow/action controls.
- L6 Autonomous Execution — DISABLED; no configuration flag can activate it
  (no code path exists).
