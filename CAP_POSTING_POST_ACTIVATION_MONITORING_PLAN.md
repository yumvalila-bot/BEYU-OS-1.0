# CAP_POSTING — POST-ACTIVATION MONITORING PLAN

**Scope:** Continuous governance of `CAP_POSTING` once it ever becomes `ACTIVE` (standing plan — prepared now while `CAP_POSTING = LOCKED` so activation is not improvised)  
**Date:** 2026-09-05 (UTC)  
**Branch:** `arena/01a070bf-beyu-os-1-0` at `87b2dfb` (PR #25) atop `a7321a3` (`origin/main`)  
**Capability:** `CAP_POSTING` — governed journal posting (`finance:ledger.post`) → immutable ledger → audit ledger  
**Status:** `CAP_POSTING = LOCKED` — this plan is **not yet operative**; it will become operative the moment the §27 activation procedure attests `CAP_POSTING = ACTIVE`  
**Owner:** Group CFO (Finance execution) + Chief Governance Officer (governance & audit) + Internal Audit (effectiveness) — joint accountability per Arts.5/8/11  
**Classification:** `RESTRICTED` — do not store activation evidence outside the append-only `audit_log` / `event_ledger` beyond the fields listed in §27 attestation (timestamp, authority, policy version, resolution id, deployment version)

---

## 1. Principle

Once active, `CAP_POSTING` stays *continuously* governed — every posting re-enforces the full §13 pipeline (identity → `GlobalUserID` → authz context → RBAC → ABAC → tenant → entity → country → `CAP_POSTING` + P1/P6/P7/P9 → SoD/approval → idempotency → immutable journal/ledger → audit). No gate is cached or skipped. Noelia/HIVE may assist monitoring but **may not override, bypass, or create authority**.

*Emergency lock is always available (§29) without deleting ledger or audit history; future posting authority is blocked, posted transactions remain immutable.*

---

## 2. Real-time metrics (per-journal + aggregated)

Every posting is already audited via `recordAuditTx` + `publishEventTx` in the posting transaction — the metrics below are aggregations over that immutable trail, surfaced in `CAPCapitalProductionProofConfig` (proof config `CAPCapitalProductionProofConfig` family).

| Metric | Source | Aggregation | Owner | Alert |
|--------|--------|-------------|-------|-------|
| `posting_count` | `journalEntries` + `audit_log action=finance.ledger.post` | 1h/24h/7d rolling | Finance OS | Step-change reviewed (no auto-threshold without ratified policy — see §7) |
| `posting_rejected_count` | `audit_log` with `PostingError CAPABILITY_LOCKED / DENIED / RULE_VIOLATION` | same | same | Any spike goes to §7 triage (could be auth regression or attacker probing) |
| `posting_rejected_CAPABILITY_LOCKED` | `CapabilityLockedError blockedBy` | — | Governance | Non-zero after activation means a new decision expired/was suspended — escalate |
| `authorization_failure_count` | `authz can()==false` + `verifyDecisionAuthority` non-`ACTIVATED` | per `principal`/tenant/entity | Security | Per-user spike → identity review |
| `SoD_violation_attempts` | `journalEntries.approved_by == posted_by` where P9 forbids self-approval | per entity | CFO / Risk | **Any 1 is material — page CGO immediately** |
| `duplicate_attempts` | `idempotencyKey` collision → `CONFLICT` | per entity | Finance | Spike suggests client bug or replay |
| `period_violation_attempts` | `RULE_VIOLATION` “closed to postings” / `DATA_NOT_AVAILABLE` no covering period | per legal entity + period | CFO | Trend indicates upstream period-creation failure |
| `unauthorized_attempts` | `DENIED` on `finance:ledger.post` + tenant/entity hopping `NOT_FOUND` | per tenant/entity/country | Security + Internal Audit | Correlate with `login-rate-limit` signals |
| `ledger_anomaly_score` | `reconciliation treasury−ledger` + `finance-os-rails` `trialBalance` provenance envelope + `ledger-integrity` deferred trigger failures (should be 0) | daily `finance.reporting` | Internal Audit | Any deferred-trigger firing → freeze & investigate |
| `AI_generated_recommendation_rate` | `noelia/runtime` `ENGINE_TOOLS` invocations with engine `FINANCIAL` vs posted amount | daily | CGO | Drift → `family/alignment.ts` alignment check |
| `system error_rate / latency` | `api/v1/system/self-test` + `health/live` | 5m p95 | Platform | Triggers runbook §5 §29 consideration |
| `transaction_failure_rate` | `db.transaction` rollback count (entry+lines+audit+event not atomically committed) | 1h | Platform | Any non-zero must be 0-recovery |

All metrics are **sourced from truth tables** (`journalEntries/journalLines/audit_log/event_ledger`) under the governed transaction-local tenant RLS — *not* from application counters that could be spoofed.

---

## 3. Dashboards & reports

| Report | Frequency | Consumer | Content | Ratified policy reference |
|--------|-----------|----------|---------|---------------------------|
| **Posting volume & outcome** | real-time dashboard + hourly digest | Group CFO dashboard | counts above, top `blockedBy` decision, period coverage `OPEN` vs rejected | P1/P7 |
| **SoD & approval integrity** | real-time alert stream + daily sign-off | CGO + Risk & Audit Committee | every maker/checker pair, `delegations` usage, any self-approval attempt | P9 |
| **Reconciliation** | daily `treasury vs ledger` + weekly Z-closure | Internal Audit | `CAPCapitalProductionProofConfig` proof family (`reconciliation` tool) | P1/P6 |
| **Trial balance / statement** | daily `trialBalance` (nullTotals envelope when empty) + monthly IFRS statements | CFO + Board | `finance/reporting` with policy-version header | P1/P6/P7 |
| **AI assist vs authority** | weekly | CGO + Board | Noelia recommendations vs human-approved postings; any `assertWithinNoeliaBoundary` trigger | family/alignment |
| **Access review** | weekly | Security | `finance:ledger.post` holders, `roleAssignments`, `tenantAncestry`, stale `validUntil` sweep | RBAC register |

Reports are inherently **tenant → entity → country scoped** (FORCE RLS) — a viewer sees exactly their authorized scope.

---

## 4. Alerts & thresholds

Because **no thresholds are ratified in this repo** (amounts on `capitalRequests` are `numeric 18,2` data, not policy), threshold *behaviour* is described without inventing numbers:

| Alert | Fires when (logic only) | Channel | Who must ack | SLA |
|-------|--------------------------|---------|--------------|-----|
| **Critical — SoD violation attempt** | `posted_by == approved_by` where ratified P9 forbids | Pager + `audit_log` + CGO inbox | CGO | immediate (lock posting if P9=tamper) |
| **Critical — CAP_POSTING non-executable after activation** | `checkCapabilityActivation` returns `executable:false` post-activation (expired `effectiveTo`, `SUSPENDED`, quorum lost) | Pager | CGO + CFO | immediate (see §29) |
| **High — rejected-posting surge** | rolling count step-change above prior-baseline envelope | on-call finance | CFO delegate | 4h triage |
| **High — period violation surge** | `STRUCTURALLY_CLOSED` (CLOSED/LOCKED) → `RULE_VIOLATION` rate step | on-call finance + CFO | CFO | same-day |
| **Medium — duplicate storm** | `idempotencyKey` collision rate step | on-call platform | Platform + Finance | next business day |
| **Medium — reconciliation breach** | `treasury 11.783M snapshot` vs `journalEntries` truth divergence beyond policy basis | daily report | CFO + Internal Audit | next business day |

When P9 threshold-based approval is ratified (Option D), the alert for “above-threshold missing checker” becomes material — at that point the numeric threshold *from the ratified policy* replaces the descriptive placeholder above, and `CAPCapitalProductionProofConfig.proof.threshold` is configured from that same value.

---

## 5. Operational runbooks (while active)

| Situation | Action | Lock? |
|-----------|--------|-------|
| Normal posting | API → `postJournal` → governed pipeline §13 → immutable ledger — monitored above | no |
| New financial period needed | `finance:period.manage` holder (Finance role) creates `financialPeriods` with Board fiscal-year; non-overlap + ordered enforcement handles collisions — `DATA_CONFLICT` with no winner (`FI-15`) | no |
| New account needed | `finance:coa.manage` holder creates `ledgerAccounts` under ratified numbering scheme — out-of-scheme rejected | no |
| Self-approval attempt | `DENIED` by SoD gate + audit-recorded | no, but alert §4 + human review |
| `CAP_POSTING` expiry/suspension | Any `effectiveTo < today` or `status=SUSPENDED` → immediately `executable:false`; see §29 | **auto-LOCKED** — no new posts |
| Suspected auth compromise | `revokedAt` on `emergencyAccessGrants` / `validUntil` expiry + `security_version` rotation → next request `EXPIRED`/`SUSPENDED` | no (per-principal) |
| Platform incident (PG down, `health/live` failing, `transaction_failure_rate > 0`) | Stop accepting new journal POSTs at the API edge (return `503`/`500` + `Retry-After`), **do not bypass the gate to “help”**; queue is governed — no shadow ledger | no |

---

## 6. Governance rhythm

| Review | Cadence | Participants | Input | Outcome |
|--------|---------|--------------|-------|---------|
| **Posting governance review** | weekly | Group CFO + CGO | dashboards §3, metrics §2, `HUMAN_RATIFICATION_QUEUE` Q3–Q6 | Confirms ratified policy still correctly enforced; closes any detected alignment drift |
| **Assurance review** | monthly (quarterly to Board) | Internal Audit → Risk & Audit Committee (Art.8) + External auditor | `CAP_POSTING` truth trail vs policy `version` + `CTL-FIN-002` re-test (`NOT_EFFECTIVE → RESTATED automation/note`) + F-2 closure | Attests `CTL-FIN-002` effectiveness against the real posting gate (not the declaration) |
| **Policy effectiveness** | per `policies.effective_to` / `governanceDecisionRegistry.effective_to` or annual | Group Board | `P1/P6/P7/P9` vs actual postings (sample) | Re-ratify, amend, or `SUSPENDED` via governed path |
| **Emergency-lock drill** | quarterly | Platform + CGO (as `APPROVED`+`GOVERNED` drill resolution) | §29 procedure | Proves `LOCKED` without ledger loss |

---

## 7. Noelia/HIVE in monitoring (may assist, may not override)

* **May:** analyze §2 metrics, forecast posting volumes, simulate “what if P9 threshold were X”, surface anomalies, draft period-open recommendations, explain reversals, prepare `§3c` wording templates for human approval.
* **May not:** approve a posting, grant `CAP_POSTING`, bypass SoD/RLS, write `journalEntries` directly, invent a rate (seeded `11.783M` → three conflicting implied rates remain **correctly refused** as `fx never implied`), or self-authorize. Every monitoring suggestion is labelled with its provenance (`GOVERNED` human decision vs `RECOMMENDATION`) and collapses to `UNKNOWN` when the referenced policy domain is absent — `family/alignment` is the enforcement layer (`absent policy is not alignment`).

---

## 8. Revocation & emergency lock (§29 — standing)

*Trigger:* CGO or Group Board (presiding `CHAIR`/`SECRETARY` + `governance:resolution.approve`) OR `effectiveTo`/`validUntil` expiry (automatic) OR platform incident decision by on-call with CGO attestation.

*Procedure (canonical, governed):* one governed transaction → `governance_capability_registry CAP_POSTING activation_status=LOCKED` (and where policy suspended: `governance_decision_registry {status,activation_status}=SUSPENDED`), with `decidedByMemberId`, `audit_log` (hash-chained, non-truncatable `0008`), `event_ledger` — then re-verification that `checkCapabilityActivation` is `executable:false` *and* that posted history remains unchanged (`journalEntries` count, `audit_log` immutability, no `journal_entries` rewrites).

*Does NOT:* delete ledger history, delete audit history, rewrite transactions, or weaken triggers/RLS — future authority alone is blocked.

---

## 9. Readiness proof before this plan becomes operative

This plan's pre-condition is documented in `CAP_POSTING_TECHNICAL_ACTIVATION_CERTIFICATION.md` Gates D–I:

* Gates A–C genuinely `RATIFIED` (`GOVERNED`+`APPROVED` per-decision rows + formal resolution with explicit `CAP_POSTING activation AUTHORIZED` at `<effective date>` in `<scope>`)
* Gates D–H genuinely `PASS` against **live** PostgreSQL (CI `postgres:16` + Supabase staging `eu-west-3` poolers, `psql`/`pg_isready` reachable, `flutter analyze/test/build` with real SDK) — not this sandbox's `BLOCKED` stubs
* §27 steps 1–15 post-activation verification genuine `PASS` (unauthorized=DENIED, authorized=POSTED, bypass-impossible, audited)

Until then, postings stay `0`, `CAP_POSTING` stays `LOCKED`, and this plan is the governed answer to “what will you monitor when it ever becomes active” — not permission to activate.

---

*Owner:* Group CFO + Chief Governance Officer + Internal Audit — joint accountability.  
*Date:* 2026-09-05 (UTC) · `87b2dfb` → this plan atop `a7321a3` · `CAP_POSTING = LOCKED` — plan is standing.  
*Classification:* Standing operating procedure — **does not create accounting policy and does not grant activation.**

*END*
