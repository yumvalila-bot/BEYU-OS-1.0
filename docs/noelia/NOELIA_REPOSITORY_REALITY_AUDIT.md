# NOELIA — Repository Reality Audit

**Phase:** Zero (repository reconciliation)
**Branch:** `arena/d5bb7315-beyu-os-1-0`
**Base commit:** `ff1d016bad91d4fe477fd022ef11ca568565776e` (main, merge of PR #134)
**Audit date:** 2026-11-24
**Method:** Every status below was determined by reading the actual file, running the
actual suite, or querying the actual database. No status is inferred from a document
that merely claims the capability exists.

---

## 0. Baseline measured in this environment

| Item | Value | How measured |
|---|---|---|
| Repository | `yumvalila-bot/BEYU-OS-1.0` | `git remote -v` |
| Branch | `arena/d5bb7315-beyu-os-1-0`, 0 commits ahead of main at start | `git rev-list --count origin/main..HEAD` |
| Working tree | clean | `git status` |
| Open PRs | 17 (none NOELIA-specific) | `gh pr list --state open` |
| Merged NOELIA PRs | #107 (Ollama adapter) | `gh pr list --state all --search noelia` |
| Unmerged NOELIA branches | `Noelia-AI-features`, `feature/noelia-unified-intelligence-gateway`, `fix/noelia-api-integration` | `git ls-remote --heads origin` |
| Migrations | 84 files, `0000` → `0083` before this work; `0084` added | `ls drizzle/*.sql` |
| Typecheck | **PASS** (`tsc --noEmit`, 0 errors) — requires `--max-old-space-size=3072` | executed |
| Lint | **PASS** (`eslint`, targeted paths) | executed |
| Build | **PASS** (`next build`, 173 routes) — requires elevated heap | executed |
| Test suite (baseline) | **5852 passed / 3 failed / 382 skipped** of 6268 | `vitest run` |

### Baseline failures (all pre-existing, all environment/date artifacts)

| Test | Cause | NOELIA-related? |
|---|---|---|
| `tests/foundation/domain.test.ts` — FY2026 deadline status | Seeded deadline `2026-09-29` is genuinely past; "today" is 2026-11-24, so `OVERDUE` is correct and the assertion is stale | No |
| `tests/frontend/canonical-brand-appearance.test.ts` — Health SPA mark | `sectors/health/dist/index.html` is a build artifact and is not committed | No |
| `tests/sector-domains/health-entry-point-contract.test.ts` — liveness probe | Requires a separately running Health OS server | No |

**Environment gaps discovered (not product defects):** 25 additional failures appear
when `BEYU_GOVERNANCE_DATABASE_URL` is unset; setting it (as CI does) resolves all of
them. Recorded here so the next engineer does not misdiagnose them as regressions.

---

## 1. Capability inventory — what actually exists

Every row below was verified by reading the implementation.

| # | Capability | Path | Status | Evidence / notes |
|---|---|---|---|---|
| 1 | Single canonical AI identity | `src/lib/noelia/canonical-identity.ts`, `types.ts` | **EXISTS_AND_VERIFIED** | `agent` column defaults `NOELIA`, `runtime` `HIVE`; asserted by `tests/noelia/http.test.ts` |
| 2 | Governed query runtime | `src/lib/noelia/runtime.ts` (1024 lines) | **EXISTS_AND_VERIFIED** | 12 engines + `MULTI_COMPANY`; deterministic `routeEngine`; evidence persisted to `ai_decisions` |
| 3 | Tool registry with fail-closed authorization | `src/lib/noelia/tool-registry.ts` | **EXISTS_AND_VERIFIED** | Declaration→registration contract match; RBAC/ABAC/tenant/entity/country/jurisdiction/approval order; Zod in/out |
| 4 | Capability inventory | `src/lib/noelia/default-tools.ts` (1538 lines) | **EXISTS_AND_VERIFIED** | ~110 governed capabilities before this work; frozen inventory guard in `agent-surface-guard.test.ts` |
| 5 | Epistemic discipline | `src/lib/noelia/epistemics.ts` | **EXISTS_AND_VERIFIED** | 12 statuses; missing≠zero, forecast≠actual encoded |
| 6 | Executive briefing contract | `src/lib/noelia/executive.ts` | **EXISTS_AND_VERIFIED** | 20-section contract, pure synthesis |
| 7 | Governed workflows | `src/lib/noelia/workflows.ts` | **EXISTS_AND_VERIFIED** | PLAN→VALIDATE→AUTHORIZE→EXECUTE→OBSERVE→REASSESS→AUDIT; durable; maker/checker |
| 8 | Scheduler (OUTBOX, no timers) | `src/lib/noelia/scheduler-service.ts` | **EXISTS_AND_VERIFIED** | Watermark + idempotency |
| 9 | Governed memory (10 classes) | `enterprise-memory.ts`, `memory.ts` | **EXISTS_AND_VERIFIED** | Visibility gate; retention/hold/supersession |
| 10 | Knowledge/RAG fabric | `knowledge-fabric.ts`, `embeddings.ts`, `knowledge-retrieval.ts` | **EXISTS** | Digest verification and governed retrieval exist. **Updated 2026-11-24:** local embeddings are now implemented — `beyu-local-lexical-v1`, 256 dims, deterministic, in-process, `LOCAL_FREE`. Retrieval is hybrid (lexical cosine + PostgreSQL full-text + `pg_trgm`). **Limitation:** the encoder is lexical, not neural — it resolves morphology but not synonymy. `pgvector` is unavailable, so scoring is an exact scan with no ANN index. See `NOELIA_ZERO_COST_VERIFICATION.md` §6 |
| 11 | Model gateway + providers | `model-gateway.ts`, `model-provider.ts`, `ollama-provider.ts` | **EXISTS_AND_VERIFIED** | Provider states CONFIGURED/CONNECTED/VERIFIED/DEGRADED/FAILED/NOT_CONNECTED; `verifyInference()` is the only path to VERIFIED |
| 12 | HIVE runtime boundary | `hive-runtime.ts` (203 lines) | **EXISTS_AND_VERIFIED** | IDENTITY→AUTHZ→CLASSIFICATION→POLICY→KILL SWITCH→ROUTING→CONTEXT→EXECUTION→OUTPUT→OBSERVABILITY |
| 13 | AI compliance engine | `compliance-engine.ts` (1424 lines) | **EXISTS_AND_VERIFIED** | Requirements, controls, evidence, findings, corrective actions |
| 14 | Observability | `observability.ts` | **EXISTS_AND_VERIFIED** | Telemetry rows + spans |
| 15 | Human approval / actions | `actions.ts`, `human-approval.ts` | **EXISTS_AND_VERIFIED** | Request→approve→execute, approval≠authorization |
| 16 | NOELIA console UI | `src/app/os/noelia/page.tsx` + `console.tsx` | **EXISTS_AND_VERIFIED** | Server-rendered from authorized queries |
| 17 | AI governance UI | `src/app/os/noelia/governance/page.tsx` | **EXISTS_AND_VERIFIED** | |
| 18 | Hermes restricted runtime | `hermes-runtime.ts`, `hermes-config.ts` | **EXISTS_AND_VERIFIED** | Deliberately capability-limited |
| 19 | Digital twin (generic) | `src/lib/viz/digital-twin.ts` | **EXISTS_BUT_DISCONNECTED** | A well-designed 12-facet abstraction, but it is a *graphics/viz* layer. It has no institutional world-model input and no NOELIA capability reaching it |

---

## 2. Capabilities the mission described that were genuinely MISSING

These were verified absent by direct search across `src/lib` and `src/app/api`:

| Capability | Search performed | Result |
|---|---|---|
| Eight cognitive brains | `grep -rl "brain"` | **0 files** |
| Agent registry | `grep -rl "AgentRegistry\|agent_registry"` | **0 files** |
| Knowledge graph | `grep -rl "knowledge_graph"` | **0 files** |
| World model | `grep -rl "world_model"` | **0 files** |
| Intelligence Council | `grep -rl "intelligence_council\|council"` | **0 files** |
| Institutional decision memory | no table for *institutional* decisions | **MISSING** — `ai_decisions` records what NOELIA said, not what the institution decided |
| Strategic simulation engine | `scenario` exists in finance/equity analytics only | **MISSING** as a NOELIA capability |
| Golden-case evaluation harness | `noelia_ai_evaluation_runs` table exists | **EXISTS_BUT_DISCONNECTED** — table present, no harness driving it |
| Learning/correction workflow | `noelia_learning_records` did not exist | **MISSING** |

---

## 3. Duplication and duplication risks found

| Risk | Assessment |
|---|---|
| Second AI runtime | **Avoided.** `NoeliaRuntime` (query path) and `HiveRuntimeBoundary` (telemetry/execution shell) are complementary, not duplicate — the Hive boundary explicitly does not replace the runtime. Confirmed by reading both. |
| Second tool dispatch | **Avoided.** `NoeliaToolRegistry` is the only dispatch point; every domain registers through it. |
| Second model gateway | **Avoided.** One `BeyuNoeliaModelGateway`. |
| Second decision store | **Risk created by this audit.** `ai_decisions` could have been overloaded. Decision: a NEW `noelia_decision_records` table is justified because the semantics differ (institutional act vs AI evidence) — documented in the schema and in `NOELIA_INSTITUTIONAL_MEMORY.md`. |
| Graph database | **Not introduced.** `legal_entities.parent_entity_id` already carries the corporate graph; `noelia_kg_edges` adds typed edges in the same PostgreSQL instance. |

---

## 4. Security posture inherited from main (verified, not assumed)

- Runtime DB role is `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB` — re-verified after `scripts/setup-db-role.ts`.
- A separate `beyu_governance` role owns no public objects and has finite privileges.
- RLS is forced (`FORCE ROW LEVEL SECURITY`) on NOELIA tables.
- `DATABASE_TLS_TRUST_MISCONFIGURED` fails closed; loopback plaintext requires the explicit `BEYU_ALLOW_LOCAL_PLAINTEXT_DB=1` opt-in, which is ignored when `BEYU_ENV=production`.

---

## 5. What this audit changed in the plan

1. **Do not rebuild the agent framework.** The registry + workflow + approval stack
   already implements the governance the mission asks for. The eight brains are added
   as a *declaration layer over the existing registry*, not a new runtime.
2. **Do not introduce a graph database.** PostgreSQL already holds the relationships.
3. **Do not introduce external model APIs.** The Ollama adapter already exists and is
   guarded; nothing here adds a paid dependency.
4. **Do not fabricate financial values in the world model.** Finance OS reads already
   exist as capabilities; the world model references them and declares the rest
   `UNAVAILABLE`.
5. **The missing work is cognitive, not infrastructural.** Brains, world model, graph,
   decision memory, council, simulation and controlled learning are genuinely new; the
   rest is consolidation.

---

## 6. Verdict

The repository is substantially more complete than a greenfield implementation would
be. The NOELIA identity, governance boundary, tool registry, workflows, approvals,
model gateway and evidence chain are already real and tested. What was missing is the
*unified cognitive layer* the mission describes — and that is what this workstream adds
(see `NOELIA_COMPLETENESS_MATRIX.md` for the resulting state).
