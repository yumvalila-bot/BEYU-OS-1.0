# Phase 8 — Governed cross-OS event runtime

**Status: IMPLEMENTED + LOCALLY CERTIFIED (engineering). NOT production-deployed.**
See `CURRENT_STATE.md` §7 for the live certification record and the outstanding
external blockers (X-1…X-7) that gate production.

## 1. What this is

The governed transport by which sector OSs (Health first) turn business
transactions into **immutable enterprise events** on the BEYU OS root ledger —
with **at-least-once transport** and a **structurally exactly-once business
effect**.

```
Health business transaction (e.g. billing.createInvoice)
  │  same DB transaction (transactional outbox)
  ▼
health.beyu_outbox  pending row            [sector PostgreSQL, RLS]
  │  OutboxDispatcherService — lease claim, FOR UPDATE SKIP LOCKED,
  │  real HTTP + cross-OS service token (HS256, iss HEALTH_OS, aud BEYU_OS)
  ▼
BEYU OS  POST /api/v1/internal/events       [root, service-token guarded]
  │  one transaction:
  │    1. INSERT internal_event_receipts … ON CONFLICT (idempotency_key)
  │       DO NOTHING            ← atomic exactly-once claim
  │    2. publishEventTx → enterprise_events (hash-chained v2)
  │    3. recordAuditTx → audit_log (SERVICE actor)
  ▼
201 {accepted:true, eventId}   — or —
200 {accepted:false, duplicate:true, eventId: ORIGINAL}
  │
  ▼
Downstream consequence: Finance OS consumes the governed record.
Journal posting remains a governed human action (CAP_POSTING LOCKED).
```

## 2. Components

| Component | Location | Role |
|---|---|---|
| `POST /api/v1/internal/events` | root `src/app/api/v1/internal/events/route.ts` | Governed ingestion: envelope validation, tenant/actor validation, atomic receipt-claim + event append + audit (one transaction, tenant RLS context) |
| `POST /api/v1/internal/events/status` | root `…/events/status/route.ts` | Reconciliation lookup: idempotency key → accepted/eventId/duplicateCount, or 404 `RECEIPT_NOT_FOUND` |
| `internal_event_receipts` | root migration `0019` | Exactly-once receipt ledger (idempotency key PK, event link, duplicate count); RLS tenant-isolated like `audit_log` |
| `EventOutboxService.publish()` | health `src/modules/events/event-outbox.service.ts` | Transactional outbox writer — joins the caller's business transaction (`inTx` ambient ALS join); the outbox row's actor column holds the **sector** uuid, the envelope carries the **canonical** GlobalUserID (bridged, never conflated) |
| `OutboxDispatcherService` | health `…/outbox-dispatcher.service.ts` | Lease-based claiming (`FOR UPDATE SKIP LOCKED`, per-tenant RLS context), single-attempt authenticated delivery, retry/backoff/dead-letter state machine |
| `OutboxOpsService` + controller | health `…/outbox-ops.{service,controller}.ts` | Operator-authorized replay + reconciliation (permissions `outbox:replay` / `outbox:reconcile`, admin + trustee only) |
| `health.beyu_outbox_due_tenants()` | health migration `022` | Narrow `SECURITY DEFINER` read-only enumeration of tenant ids with due event rows (no cross-tenant data reads) |
| Billing wiring | health `src/modules/billing/billing.service.ts` | `createInvoice` / `recordPayment` publish their governed finance events in the same transaction |

## 3. Delivery state machine

```
pending ──claim──► (lease) ──POST──► delivered
   ▲                                 │
   │                        retryable failure
   │ backoff = full jitter,          (401/403/429/5xx/
   │ base·2^attempt capped             timeout/network)
   └──────── failed ◄─────────────────┘
                  │
     attempt_count ≥ max  OR  permanent 4xx
     (400/404/409/413/422 — can never be accepted)
                  ▼
             dead_letter ──(authorized operator replay)──► pending
```

- **Claim** sets a lease (`next_attempt_at = now + lease`) so two dispatcher
  instances never deliver the same row; a crashed delivery lets the lease
  expire and re-delivers — harmless, because BEYU's receipt returns
  `duplicate:true` with the ORIGINAL event id.
- **Replay** (operator-only, permission-gated, mandatory reason, audited,
  attempt history preserved) requeues `dead_letter`/`failed`/`blocked` rows
  only; `delivered` rows are refused.
- **Reconciliation** compares the outbox ledger with BEYU receipts and
  classifies: consistent / accepted-not-recorded (repairable, needs
  `outbox:replay` too) / delivered-without-acceptance (CRITICAL — surfaced,
  never auto-repaired) / undelivered backlog / unknown (BEYU unreachable —
  no repair, no guessing).

## 4. Security model

- Transport: same Phase 7 cross-OS service-token contract (HS256,
  `iss=HEALTH_OS`, `aud=BEYU_OS`, ≤60 s TTL, `BEYU_INTERNAL_SERVICE_TOKEN`
  shared secret on the root). No token / expired / wrong issuer → 401/403.
- Unconfigured root secret → 503 `INTERNAL_AUTH_NOT_CONFIGURED` (fail-closed).
- Root side: tenant resolved and validated (404/409); a claimed human actor
  must exist as a canonical identity (422 `ACTOR_NOT_FOUND`) — no shadow
  actors; envelope `.strict()` (422 on unknown fields); payload ≤128 KiB (413).
- The enterprise event is appended under the tenant's transaction-local RLS
  context; `enterprise_events` is FORCE RLS with 20 policies.
- Replay is never automatic and never client-triggerable.

## 5. Configuration (health backend)

| Variable | Default | Meaning |
|---|---|---|
| `BEYU_EVENTS_ENDPOINT` | unset | Root base URL; unset → dispatcher disabled, outbox accumulates, reconciliation surfaces backlog (no fabricated delivery) |
| `BEYU_EVENTS_TOKEN` | unset | Shared secret for the service token |
| `BEYU_EVENTS_TENANT_CODE` | `BEYU_IDENTITY_TENANT_CODE` → `BEYU-HEALTH` | Canonical tenant code |
| `BEYU_EVENTS_MAX_ATTEMPTS` | 8 | Dead-letter threshold |
| `BEYU_EVENTS_BACKOFF_BASE_MS` / `_CAP_MS` | 1000 / 300000 | Full-jitter exponential backoff bounds |
| `BEYU_EVENTS_LEASE_MS` | 60000 | Claim lease |
| `BEYU_EVENTS_TIMEOUT_MS` | 8000 | Per-attempt HTTP timeout |
| `BEYU_EVENTS_BATCH` | 20 | Rows per tenant per cycle |
| `BEYU_EVENTS_DISPATCH_INTERVAL_MS` | 5000 (0 = off) | Background cycle; tests call `dispatchDueBatch()` explicitly |

## 6. Exactly-once reasoning (why duplicates are harmless)

The receipt claim (`INSERT … ON CONFLICT DO NOTHING`) and the enterprise event
append happen in **one root transaction**. Outcomes:

| Scenario | Result |
|---|---|
| First delivery | claim wins → event appended → receipt linked → 201 |
| Duplicate/replay/lease-expired re-delivery | claim loses → `duplicate_count++` → 200 with the ORIGINAL `eventId`, no new event |
| Crash between claim and commit | whole transaction rolls back (receipt + event) → next delivery is a clean first delivery |
| Crash after commit, response lost | next delivery is a duplicate → dispatcher marks delivered on `duplicate:true` |

## 7. Certification

| Suite | Scope | Result |
|---|---|---|
| root `tests/internal/events-internal.test.ts` (16) | ingestion exactly-once, hash-chain integrity, fail-closed, validation, status | PASS |
| health `outbox-dispatcher.spec.ts` (9) | transactional atomicity (rollback leaves no row), state machine, leases, per-tenant + NULL-tenant delivery | PASS |
| health `outbox-ops.spec.ts` (9) | operator authorization, replay semantics, reconciliation classification (fake BEYU with real receipt semantics) | PASS |
| health `events.integration.spec.ts` (5, env-gated live) | **full chain against the real root server + real PostgreSQL**: billing tx → outbox → HTTP → root receipt/enterprise event/audit asserted directly in root PG; crash-redelivery exactly-once; reconciliation consistent | PASS locally (see CURRENT_STATE §7) |

Constitutional boundary: this runtime **records** governed events and grants no
authority. `CAP_POSTING` remains `LOCKED` in the governance capability
registry — Finance journal posting stays a governed human action. The finance
chain is therefore honestly **PARTIALLY_IMPLEMENTED**: billing → governed
enterprise event → Finance consequence is complete and certified; automated
posting is deliberately out of scope and not fabricated.
