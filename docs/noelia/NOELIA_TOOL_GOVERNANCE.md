# NOELIA TOOL GOVERNANCE

## Principle

Every Noelia tool invocation must pass through authorization and policy
enforcement. The pipeline is:

```
Tool Registration → Input Validation → Authorization → Context Validation
  → Confirmation Requirements → Execution → Result Validation → Audit
```

## Tool Identity

Every registered tool (`RegisteredNoeliaTool`) carries:

- `name`: stable tool identifier (`string`)
- `permission`: `PermissionCode` from authorization system (`ai:memory.read`, `finance:capital.read`, etc.)
- `classification`: maximum data classification (`Classification`) the tool can access
- `risk`: `LOW` / `HIGH` (consequential actions are typically `HIGH`)
- `description`: human-readable purpose
- `metadata`: `ToolMetadata` (version, owner role, domain, side effects, idempotency, timeout, retry policy, jurisdiction restrictions, entity restrictions, approval requirements, audit requirements, input/output schemas)

## Input / Output Validation

- Tools with `metadata.inputSchema` (Zod schema) validate input before execution.
- Tools with `metadata.outputSchema` (Zod schema) validate output after execution.
- Invalid input produces `INPUT_INVALID` denial.
- Invalid output produces `OUTPUT_INVALID` denial.

## Authorization Flow

1. `principal` authorization (`can(principal, tool.permission)`): does the user have the permission?
2. `scope` authorization (`scope.entityIds`, `scope.tenantIds`, `scope.countryCodes`): does the target match the authorization scope?
3. `classification` authorization (`principal.clearance` vs. `tool.classification`): does the user's clearance cover the tool's data classification?
4. `killSwitch` check (`noeliaKillSwitch`): is any kill switch active for the tool/model/task/OS/tenant/capability/AI identity?
5. `context` validation (`requestedNoeliaTarget` vs. `scope`): does the requested context match the authorization scope?

Every denial produces a `ToolDecision` with `allowed: false`, a denial code (`ToolDenialCode`), and a reason. The decision is included in the audit record.

## Execution

- Read-only actions (`metadata.sideEffects = NONE`) may execute without confirmation.
- Audit-only actions (`metadata.sideEffects = AUDIT_ONLY`) execute with audit event generation.
- Domain-write actions (`metadata.sideEffects = DOMAIN_WRITE`) require:
  - `approvalRequirements.approverRole` (human approval role)
  - `humanOversight` level (`REQUIRED_REVIEW` or `DUAL_CONTROL` for HIGH risk / HIGHLY_RESTRICTED data)
  - `auditRequirements.event` (audit event code) + `auditRequirements.objectType`

Consequential actions include: payments, transfers, financial postings, account changes, clinical decisions, medication-related actions, data deletion, organizational changes, permission changes, legal/compliance submissions, external communications, and irreversible operations.

## Result Validation

After execution, the output is validated:

- `metadata.outputSchema` validates the output shape.
- `findings` must have `kind` in [`FACT`, `INFERENCE`, `RECOMMENDATION`] and `status` must be an `NoeliaEpistemicStatus`.
- `confidence` must be within `[0, 1]`.
- `deniedScopes` must match authorization scope.
- `recommendations` must include `humanDecisionRequired: boolean`.

Invalid results are rejected (`OUTPUT_INVALID`) and do not propagate to the response.

## Audit

Every tool invocation produces:

- `ToolDecision` (allowed/denied, reason, code)
- `AuditRecord` (if allowed) with event type (`NOELIA_TOOL_REQUESTED`, `NOELIA_TOOL_AUTHORIZED`, `NOELIA_TOOL_DENIED`, `NOELIA_TOOL_EXECUTED`)
- `AuditEvent` with `objectType`, `actor`, `action`, `result`, `timestamp`, `tenantId`, `entityId`, `traceId`
- No secrets or sensitive payloads are logged.

## Source of Truth

- Registry: `src/lib/noelia/tool-registry.ts`
- Implementation: `src/lib/noelia/default-tools.ts`, `src/lib/noelia/runtime.ts`
- Design: `docs/noelia/NOELIA_TOOL_GOVERNANCE.md` (this file)
