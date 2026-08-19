# BEYU OS — Enterprise event contracts

Events are **immutable, versioned, traceable, authenticated, authorised, schema-controlled and
auditable**. The envelope is CloudEvents-aligned and hash-chained.

## Envelope (`platform.enterprise_events`)

| Field | Meaning |
| --- | --- |
| `id` | Immutable event identifier (`EVT_…`) |
| `sequence` | Monotonic ledger position |
| `type` | Event type (see catalogue) |
| `specVersion` / `schemaVersion` | Envelope and payload versions |
| `source` | Emitting service, e.g. `beyu-os/finance` |
| `tenantId` / `subjectType` / `subjectId` | Tenant isolation + subject binding |
| `actorUserId` / `actorType` | HUMAN · SERVICE · AI |
| `classification` | PUBLIC → HIGHLY_RESTRICTED (no event may leak beyond its boundary) |
| `payload` | Minimal, purpose-limited JSON |
| `traceId` | Correlates audit, logs and traces |
| `prevHash` / `hash` | Tamper-evident chain |

## Catalogue

| Type | Source | Classification | Payload |
| --- | --- | --- | --- |
| `USER_AUTHENTICATED` | identity | INTERNAL | `{ mfaSatisfied }` |
| `USER_CREATED` | identity | CONFIDENTIAL | `{ partyId, tenantId }` |
| `EMPLOYEE_CREATED` | hcm | RESTRICTED | `{ employeeNo, legalEntityId }` |
| `ENTITY_CREATED` | organization | CONFIDENTIAL | `{ entityCode, countryCode }` |
| `OWNERSHIP_CHANGED` | organization | RESTRICTED | `{ ownedEntityId, economicPct, votingPct }` |
| `BOARD_RESOLUTION_APPROVED` | governance | RESTRICTED | `{ reference, category }` |
| `POLICY_CHANGED` | governance | INTERNAL | `{ code, version }` |
| `RISK_ESCALATED` | risk | CONFIDENTIAL | `{ code, residualScore }` |
| `WATERFALL_SIMULATED` | finance | RESTRICTED | `{ scenario, gross, checksum }` |
| `WATERFALL_EXECUTED` | finance | RESTRICTED | `{ period, checksum, resolutionRef }` |
| `PAYMENT_POSTED` | finance | RESTRICTED | `{ reference, amount, currency }` |
| `TAX_STRATEGY_ASSESSED` | finance | RESTRICTED | `{ eligibility, entity }` |
| `TAX_STRATEGY_APPROVED` | finance | RESTRICTED | `{ code, resolutionRef }` |
| `BENEFICIARY_VERIFIED` | family-office | HIGHLY_RESTRICTED | `{ beneficiaryId, eligibility }` |
| `DOCUMENT_APPROVED` | documents | CONFIDENTIAL | `{ documentId, version }` |
| `AI_DECISION_RECORDED` | ai | INTERNAL | `{ engine, outputClass, confidence }` |
| `AI_DECISION_REVIEWED` | ai | INTERNAL | `{ decisionId, reviewDecision }` |

## Rules

1. No sensitive event carries more than the minimum data needed by authorised consumers.
2. Consumers must filter by tenant and classification; the publisher stamps both.
3. Replay is permitted only for idempotent consumers; financial effects are never replayed.
4. Schema changes are additive within a `schemaVersion`; breaking changes increment it and require
   an ADR.
