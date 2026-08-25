# NOELIA — Governed Enterprise Intelligence Architecture

**Status:** IMPLEMENTED (2026-08-25) · **Scope:** architecture of the expanded Noelia implementation
**Evidence:** `tests/noelia/*` (10 suites), HTTP smoke suite, full regression 1600/1600 PASS

---

## 1. Boundary (immutable)

```
AUTHENTICATION → PRINCIPAL → RBAC → ABAC → TENANT → ENTITY → COUNTRY
  → CLASSIFICATION → POLICY → SOURCE/CAPABILITY AUTHORIZATION
  → TOOL REGISTRATION → APPROVAL → EXECUTION → AUDIT → EVENT EVIDENCE
```

Noelia has **intelligence authority, never business/legal/governance authority**.
Every layer of the boundary above is enforced by BEYU OS services (`authz.ts`,
`policy.ts`, `tenant-scope.ts`, `audit.ts`, `interoperability/contract.ts`),
never by Noelia code. Noelia receives no unrestricted database handle, executes
no arbitrary SQL, and every capability invocation passes through
`NoeliaToolRegistry.authorize()` (fail-closed).

## 2. Runtime pipeline

```
REQUEST → INTENT (deterministic routing) → PRINCIPAL → SCOPE (resolveNoeliaAuthorizedScope)
  → POLICY (evaluatePolicy, deny-final) → SOURCE PLAN (registered tool list per engine)
  → TOOL REGISTRY (RBAC/ABAC/tenant/entity/country/jurisdiction/approval gates)
  → BEYU SERVICES (canonical context-aware db via AsyncLocalStorage)
  → SPECIALIST ENGINES (treasury/risk/fpna/forecast reused, never duplicated)
  → SYNTHESIS (epistemic classification) → EVIDENCE (ai_decisions + audit + event, atomic)
  → RESPONSE (decisionId, traceId, outputClass, confidence, deniedScopes)
```

## 3. Components

| Component | File | Responsibility |
|---|---|---|
| Facade | `src/lib/noelia.ts` | `askNoelia`, `briefNoelia`, `analyzeNoelia`, `runScheduledBriefing` |
| Runtime | `src/lib/noelia/runtime.ts` | `ask` / `brief` / `analyze`; engine→tool-plan execution |
| Intent routing | `src/lib/noelia/runtime.ts` `routeEngine` | deterministic keyword→engine (12 engines) |
| Contracts | `src/lib/noelia/types.ts` | `NoeliaAnswer`, `NoeliaExecutiveBriefing`, `NoeliaRecommendation`, `NoeliaMetricView`, `ToolMetadata`, `NoeliaAuthorizedScope`, 16 analysis types |
| Tool registry | `src/lib/noelia/tool-registry.ts` | declaration/registration contract match; fail-closed authorize order; Zod input/output; governed timeout |
| Default registry | `src/lib/noelia/default-tools.ts` | ~30 governed capabilities (stableId `cap-<domain>-<tool>`) |
| Epistemics | `src/lib/noelia/epistemics.ts` | canonical 12-status mapping, `metric()`, `explainableConfidence()`, `detectAnomalies()`, `classifyTrend()` |
| Executive | `src/lib/noelia/executive.ts` | pure `synthesizeExecutiveBriefing` (20-section contract) |
| Analytics | `src/lib/noelia/analytics-service.ts` | 16 analysis types over canonical specialist engines |
| Finance read | `src/lib/noelia/read-services.ts` | treasury/capital/waterfall/risk/compliance/governance/tax/workforce/knowledge |
| Workforce | `src/lib/noelia/workforce-service.ts` | observe/organization/quality/turnover/succession signals |
| Legal | `src/lib/noelia/legal-service.ts` | knowledge/authorityStatus/matters; unknown authority fails closed |
| Health boundary | `src/lib/noelia/health-boundary.ts` | UNAVAILABLE unless a real Health OS integration is registered |
| Memory | `src/lib/noelia/enterprise-memory.ts` + `memory.ts` | 10 memory classes; visibility gate `decideMemoryClassVisibility` |
| Model gateway | `src/lib/noelia/model-gateway.ts` | registry-only until providers ratified; deterministic HIVE analyst |
| Workflows | `src/lib/noelia/workflows.ts` | PLAN→VALIDATE→AUTHORIZE→EXECUTE→OBSERVE→REASSESS→CONTINUE/ESCALATE/STOP→AUDIT |
| Scheduler | `src/lib/noelia/scheduler-service.ts` | OUTBOX→CONSUMER→watermark→idempotency→audit; no in-process timers |
| Actions | `src/lib/noelia/actions.ts` | request/approve/execute governed action (Phase 15, preserved) |
| Policy/evidence | `src/lib/noelia/platform-services.ts` | `evaluatePolicy` adapter; atomic decision+audit+event |
| Scope | `src/lib/noelia/scope-service.ts` | finite tenant/entity/country resolution |

## 4. Persistence (additive, Drizzle, RLS-aware)

Migration `0015_noelia_intelligence_expansion.sql` (+ `0016_noelia_scheduler_offsets.sql`):

| Table | Purpose | RLS |
|---|---|---|
| `enterprise_memory` | governed long-term memory (10 classes, scope/retention/hold/supersession) | tenant policy + shape CHECK |
| `model_registry` | approved models/providers (provider/model/version unique) | global config (no tenant data) |
| `noelia_schedules` | schedule DATA (never execution) | tenant policy |
| `noelia_schedule_runs` | run-once evidence per (schedule, scheduled_for) | subselect tenant policy |
| `noelia_scheduler_offsets` | consumer watermark for the OUTBOX | tenant policy |
| `noelia_workflows` | durable workflow state + plan + budget | tenant policy |
| `noelia_workflow_steps` | per-step policyDecision/denialCode/output/observations/auditRef | subselect tenant policy |

No `drizzle-kit push`; all migrations numbered, deterministic, checksummed by
`scripts/migrate.ts`, applied 0000→0016 on a fresh install.

## 5. API surface (all `guarded()`)

| Route | Permission | Purpose |
|---|---|---|
| `POST /api/v1/ai/noelia` | `ai:noelia.query` | governed query (Phase 15) |
| `POST /api/v1/ai/noelia/brief` | `ai:executive.read` | executive briefing (20-section contract) |
| `POST /api/v1/ai/noelia/analyze` | `ai:analytics.read` | 16 analysis types |
| `POST/GET /api/v1/ai/noelia/workflows[/:id]` | `ai:workflow.run` | plan/read |
| `POST …/workflows/:id/validate` | `ai:workflow.run` | capability validation |
| `POST …/workflows/:id/authorize` | `ai:workflow.approve` | maker/checker authorization |
| `POST …/workflows/:id/execute` | `ai:workflow.run` | bounded execution (re-checks authorization) |
| `POST …/workflows/:id/cancel` | `ai:workflow.run` | governed cancellation |
| `POST/GET /api/v1/ai/noelia/schedules` | `ai:schedule.manage` | schedule DATA CRUD/read |
| `POST …/schedules/tick` | `ai:schedule.manage` | OUTBOX emit + consume (no timers) |
| `POST …/schedules/:id/status` | `ai:schedule.manage` | suspend/cancel/reactivate |

Every handler: strict Zod (`.strict()`), server-derived identity/authority,
rate limit, sanitized errors, trace/correlation ids, audit, idempotency
(`withIdempotency`, IN_FLIGHT crash-safe).

## 6. Executive output contract (section 20)

decisionId, engine, analysisType, horizon, headline, summary, findings,
sources, metrics, assumptions, uncertainty, limitations, confidence,
observedFacts/derivedConclusions, forecasts, scenarios, recommendations
(rationale/evidence/assumptions/uncertainty/limitations/confidence/provenance/
whatWouldChange/risks/alternatives/humanDecisionRequired), whatIsMissing,
requiresHumanDecision, deteriorating, improving, managementAttentionRequired,
deniedSources, deniedScopes, toolsUsed, policyDecision, humanReviewRequired,
traceId, correlationId, latencyMs.

## 7. Epistemic discipline

Missing ≠ zero; forecast ≠ actual; inference ≠ fact; stale ≠ current;
unverified ≠ authoritative; unknown legal/tax authority fails closed
(`REQUIRES_AUTHORITY`); health data is never fabricated; approval records are
never authority by existence.
