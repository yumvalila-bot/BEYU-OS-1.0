# Phase 1 — Architecture gap analysis (fresh, 2026-09-03)

Evidence gathered this session by direct inspection (greps, route enumeration, DB
queries, CI logs) — not from prior reports. Status legend per the program taxonomy.

| # | Area | Current state (verified) | Risk | Recommendation | Implementable now? | External dependency? | Priority | Verification method |
|---|---|---|---|---|---|---|---|---|
| A | Duplicate implementations | No duplicate platform kernels; single BEYU OS root + one sector (health) | Low | None | — | — | — | Route/table enumeration |
| B | Obsolete implementations | Legacy Supabase proxy RETIRED (P0, 2026-09-02): controllers/services/views deleted; `database.config.ts` documents retirement; no `SUPABASE_*` variable read | Low | Keep retired | — | — | — | grep `supabase` in active code |
| C | Dead code | `sectors/health/backend/src/modules/users/user.repository.ts` — unreferenced by any module/spec, self-described Supabase-backable stub; stale comment in `legal-hold.guard.ts` referencing the deleted SupabaseController | Low (confusion/attack-surface misreading) | Remove dead module; fix stale comment | YES | No | P3 | grep references + full suite |
| D | Competing identity systems | NONE competing: canonical root identity (`users`, GlobalUserID `USR_…`) + sector identity (`beyu_identity.users`, uuid) linked 1:1 via `beyu_identity_links` (link-once, both directions unique) — bridged by design, never conflated | Low | None | — | — | — | Bridge schema + federation tests |
| E | Competing authorization paths | Local RBAC fallback (low-risk, permission-gated) + BEYU governance decide (high-risk, fail-closed) — documented dual-track, not duplication | Low | None | — | — | — | beyu-integration specs |
| F | Duplicate event models | `health.finance_events` (staging) + `health.beyu_outbox` (transport) + root `enterprise_events` (authority) — distinct roles; staging table is legacy-simple but harmless and consumed only for record | Low | Document roles (done in PHASE8 doc); consider migrating `finance_events` consumers to outbox events later | Later | No | P3 | Migration inventory |
| G | Duplicate audit models | Root `audit_log` + `enterprise_events` (hash-chained, v2) and sector `health.audit_log` (hash-chained) — layered by design; root anchoring documented as architecture-gated | Low | None now | — | — | — | Chain-integrity specs |
| H | Duplicate financial models | Root finance (capital/tax/waterfall) authoritative; health billing is sector-source only (events flow one way) | Low | None | — | — | — | Event chain tests |
| I | Legacy Supabase proxy paths | Zero active code paths; only comments remain (B, C) | Low | Cleanup comments (C) | YES | No | P3 | grep |
| J | Legacy service-auth paths | Single canonical service-token model (HS256, iss/aud/exp/jti) shared by root verifier and health signer; no raw-secret auth accepted | Low | None | — | — | — | token-matrix.spec (expired/wrong-iss/wrong-aud/forged) |
| K | Inconsistent tenant context | Root: ALS `withDatabaseRlsContext` (SET LOCAL); health: ALS `tenantCtx` + `withIsolation` — each consistent within its OS; cross-OS events carry tenantCode resolved to canonical tenant | Low | None | — | — | — | RLS matrix specs both sides |
| L | Entity/country propagation | Propagated through outbox rows (entity_code, country_code) and interoperability envelope; root events record tenant+legalEntity | Low | None | — | — | — | Envelope schema |
| M | Client-side authorization assumptions | None found: all root routes server-guarded; health global guards (JwtAuthGuard, CSRF, MFA, ClinicalSafety, Permissions) | Low | None | — | — | — | Route inventory + guard specs |
| N | Unsafe direct database access | Runtime role NOSUPERUSER/NOBYPASSRLS; RLS 21 tables/21 policies, 11 FORCE; `beyu_outbox_due_tenants()` narrow SECURITY DEFINER (tenant ids only) | Low | None | — | — | — | Role/RLS queries this session |
| O | Routes bypassing governance | All 32 root routes enumerated: internal (service-token), v1 (auth-guarded), health (public probes); no bypass route found | Low | None | — | — | — | Route enumeration |
| P | Services bypassing event infrastructure | Sync-inline adapters (governance/hcm/finance/tax/noelia) use CircuitBreaker + writeOutbox accounting — documented dual-track vs governed `beyu.events` dispatcher; billing is fully on the governed path | Medium (dual-track complexity) | Document (done); migrate adapters to dispatcher over time | Later | No | P2 | Adapter specs |
| Q | Missing transactional boundaries | Billing chain proven atomic (same-transaction outbox + rollback test); `finance_events` staging also in-tx; dispatcher state changes are per-row by design | Low | None | — | — | — | Rollback test + integration chain |
| R | Missing idempotency | Outbox idempotency_key UNIQUE; billing createInvoice/recordPayment honor input idempotency keys; root receipts claim exactly-once | Low | None | — | — | — | Duplicate-delivery tests |
| S | Missing replay protection | Replay is operator-only (permission + reason + audit); re-delivery idempotent at root; unauthorized replay refused (tested) | Low | None | — | — | — | outbox-ops.spec |
| T | Missing observability | **NO metrics anywhere** (no prom-client/OTEL, no /metrics, no outbox/DLQ counters) — structured logs + correlation IDs exist; readiness includes DB/migrations/config/adapters but NOT dispatcher state | **High (operational blindness for the event runtime)** | Add outbox/dispatcher metrics + readiness reporting (Phase 16/17) | **YES** | No | **P1** | New metrics endpoint + tests |
| U | Missing DR controls | No backup/restore drill tooling exercised; production PITR inaccessible | Medium | Local restore-verification procedure; production drill EXTERNAL_BLOCKED | Partial | Supabase access | P2 | db-release artifacts |
| V | Weak error classification | Dispatcher classifies permanent vs retryable; adapters classify EXTERNAL_BLOCKED vs failure; guardedInternal maps error codes | Low | None | — | — | — | Dispatcher/adapters specs |
| W | Unsafe secrets handling | `.env` gitignored; no secrets committed (CI secret scan green); service token never logged | Low | None | — | — | — | Secret scan gate |
| X | Production configuration drift | Production runtime DB DOWN (X-3) — cannot assess production config; CI drift gate (scratch DB, fingerprint, no-op re-run, generate-empty) green at `404852f` | Medium | Blocked on X-1..X-3 | No | Vercel/Supabase creds | **P0 (external)** | db-release workflow |
| Y | Inconsistent environment contracts | Root boot validation + health `production-boot.guard.ts` + CI drift gate enforce contracts; new events env documented | Low | None | — | — | — | boot-validation specs |
| Z | Undocumented dependencies | Phase 8 doc covers events; three-way deployment doc covers topology; observability gap documented here | Low | Keep docs current with changes | YES | No | P3 | Docs review |

## Priority actions selected for this session

1. **P1 — Phase 16/17 observability** (T): outbox/dispatcher operational metrics +
   dispatcher state in readiness (implementable, no external dependency).
2. **P3 — dead code + stale comments** (C/I): remove unreferenced `modules/users`
   stub; fix the `legal-hold.guard.ts` stale reference.
3. **P0 external** (X): production drift cannot be assessed while X-1..X-3 remain —
   honestly EXTERNAL_BLOCKED; CI-side drift gates stay enforced.

Everything else: verified adequate or already documented; no changes without an
engineering reason (Phase 24 discipline).
