# BEYU OS — Enterprise event contracts

Events are **immutable, versioned, traceable, authenticated, authorised, schema-controlled and
auditable**. The envelope is CloudEvents-aligned and hash-chained.

## Envelope (`platform.enterprise_events`)

| Field | Meaning |
| --- | --- |
| `id` | Immutable event identifier (`EVT_…`) |
| `sequence` | Monotonic ledger position |
| `type` | Event type (see catalogue) |
| `specVersion` / `eventVersion` / `schemaVersion` | Envelope, event and payload versions |
| `source` / `domain` / `operation` / `destinationDomain` | Emitting service and common domain contract |
| `tenantId` / `legalEntityId` / `subjectType` / `subjectId` | Tenant/entity isolation + subject binding |
| `actorUserId` / `actorType` | HUMAN · SERVICE · AI; `actorUserId` is the canonical GlobalUserID where present |
| `classification` | PUBLIC → HIGHLY_RESTRICTED (no event may leak beyond its boundary) |
| `payload` | Minimal, purpose-limited JSON |
| `traceId` / `correlationId` / `causationId` | Request trace, operation correlation and causal parent (`null` for a root event) |
| `authorityContext` / `policyVersion` | Explicit authority/capability/permission context; `null` when no authority is applicable |
| `prevHash` / `hash` / `hashVersion` | Tamper-evident chain; v2 covers the interoperability envelope |

New application events are validated by `src/lib/interoperability/contract.ts` and appended only
through `src/lib/audit.ts`. Historical v1 rows remain verifiable without being rewritten; new rows
use v2 envelope hashing. `verifyEventChain()` verifies both versions.

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
