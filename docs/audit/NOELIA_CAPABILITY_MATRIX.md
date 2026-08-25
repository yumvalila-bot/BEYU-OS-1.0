# NOELIA — Capability Completeness Matrix

**Status:** IMPLEMENTED with explicit BLOCKED/REQUIRES_AUTHORITY classifications (2026-08-25)
**Gate:** 🟢 GREEN for implemented surface (evidence below); ⚪ BLOCKED items are infrastructure-bound and never fabricated.

Legend: **I** = IMPLEMENTED · **P** = PARTIALLY_IMPLEMENTED · **B** = BLOCKED · **D** = DEFERRED · **RA** = REQUIRES_AUTHORITY

| # | Capability | State | Reused from | Permission | API | Persistence | Audit/Event | Tests |
|---|---|---|---|---|---|---|---|---|
| A | Executive Intelligence (briefings, 6 horizons, what-changed, recommendations) | I | specialist engines + read-services | `ai:executive.read` | `/brief` | ai_decisions | ✓/✓ | workflow+runtime+HTTP |
| A | Board-level decision support | I | governance.resolution.query + executive | `ai:executive.read` | `/brief` | ai_decisions | ✓/✓ | runtime |
| B | Enterprise Analytics (16 types) | I | treasury/risk/fpna/forecast engines | `ai:analytics.read` | `/analyze` | ai_decisions | ✓/✓ | analytics+HTTP |
| C | Finance OS intelligence (read/analyze/explain/compare/forecast/recommend) | I | finance/* + specialist/treasury | finance:* read perms | tools | none (read-only) | ✓/✓ | workflow+HTTP |
| C | Finance autonomous mutation | RA | — | — | — | — | — | explicit denial (registry sideEffects) |
| D | HCM intelligence (headcount/org/turnover/succession signals) | I | hcm-observe + employmentEvents | `hcm:employee.read` | tools | none | ✓/✓ | workflow |
| D | HCM employment decisions | RA | — | — | — | — | — | explicit denial |
| E | Health OS integration boundary | I (boundary) / B (runtime) | integrations table | `ai:noelia.query` | `health.runtime.status` | none | ✓/✓ | health-boundary |
| E | Clinical decision support | RA | — | — | — | — | — | never fabricated |
| F | Tax intelligence | I | taxStrategies + legal-service | `finance:tax.read` | tools | none | ✓/✓ | legal/tax |
| F | Legal intelligence (FACT/AUTHORITY/INTERPRETATION/…/REQUIRES_AUTHORITY) | I | legal-service | `legal:matter.read` | tools | none | ✓/✓ | legal |
| F | Tax/legal authority positions | RA | — | — | — | — | — | unknown citation fails closed |
| G | Knowledge/RAG (classification/scope/authority/effective window/supersession) | I | knowledge_sources + retrieveGovernedMemory | `ai:noelia.query` | tools | knowledge_sources | ✓/✓ | memory-security |
| G | Semantic retrieval (embeddings/rerank) | B | — | — | — | — | — | provider-independent interface only; no fake vectors |
| H | Long-term enterprise memory (10 classes) | I | enterprise_memory table | `ai:memory.read/write` | tools | enterprise_memory | ✓/✓ | memory-integration |
| H | TEAM/LEGACY classes | D | — | — | — | — | — | canonical 10 classes implemented; TEAM/LEGACY mapped to USER/INSTITUTIONAL semantics |
| I | Agentic workflows (plan→validate→authorize→execute→observe→reassess→escalate/stop) | I | workflows+approvals+tool registry | `ai:workflow.run/approve` | /workflows/* | noelia_workflows(+steps) | ✓/✓ | workflow-integration (8) + HTTP loop |
| I | Compensate/recover | P | recordRun/step idempotent resume | — | — | — | ✓/✓ | crash-resume test |
| J | Human approval orchestration (maker/checker, role, self-approval denial) | I | approvals + actions + workflows | `ai:workflow.approve`, `ai:decision.review` | authorize routes | approvals | ✓/✓ | action-integration + workflow |
| J | Quorum / delegation / escalation chains | D | governance voting exists | — | — | — | — | covered by resolution quorum (governance) |
| K | Cross-OS intelligence (independently authorized domains) | I | per-domain tools + `can()` per domain | `ai:analytics.read` | tool | none | ✓/✓ | cross.os tool |
| K | Cross-OS aggregation across tenants | RA | — | — | — | — | — | DENY by default |
| — | Six-horizon metadata (H1–H6) | I | constants | — | /brief horizon | ai_decisions | ✓/✓ | runtime |
| — | Autonomy levels L0–L2 default, L3–L5 governed, L6 disabled | I | actions/workflows | — | — | — | ✓/✓ | action-integration |
| — | Model Gateway (registry, classification limits, jurisdiction, timeout/cost fields) | I (registry) / B (external provider) | model_registry | `ai:model.registry.read` | tool | model_registry | ✓/✓ | model-gateway |
| — | Scheduler OUTBOX→consumer→watermark→idempotency→audit | I | enterprise_events + offsets | `ai:schedule.manage` | /schedules/tick | runs+offsets | ✓/✓ | scheduler-integration (3) |
| — | Event subscriptions/replay/dead-letter | P | offsets + run-once | — | — | — | ✓/✓ | run-once + OWNER_INACTIVE dead-letter test |

## Explicit non-goals (authority boundaries — RA, never weakened)

- Noelia never posts journals, approves capital, commits waterfalls, changes
  accounting/tax policy, hires/fires/sets compensation, makes clinical
  decisions, or decides legal/tax positions.
- No self-approval; no maker/checker bypass; no client-supplied
  actor/tenant/approval; no arbitrary SQL; no unrestricted DB handle.
