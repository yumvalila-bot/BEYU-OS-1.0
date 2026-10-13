# NOELIA × Ollama — integration report

**Change:** incremental upgrade of the *existing* `NOELIA_AI` implementation to
add Ollama as a locally available inference provider behind the existing NOELIA
model gateway and HIVE runtime.
**Branch:** `arena/58532ec6-beyu-os-1-0` (feature branch; `main` untouched).
**Baseline commit:** `05e2fba` — `fix(health): make the post-sign-in load failure diagnosable instead of blaming permissions (#106)`.

Nothing in this increment is a production-readiness claim. Local Ollama is a
development runtime; `qwen2.5:0.5b` is a smoke-test model, not a
production-quality one.

**Companion document:** `docs/noelia/NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md` — the
PowerShell operator guide (setup, keys, statuses, diagnostics, limitations).

---

## 1. Baseline audit (Phase 0) and files inspected

No edits were made before this audit was written down.

### 1.1 Repository facts (observed on the checkout)

| Item | Observed value |
| --- | --- |
| Branch / HEAD | `arena/58532ec6-beyu-os-1-0` @ `05e2fba` |
| Package manager / runtime | `npm` (`package-lock.json`), Node `v22.22.3`, npm `10.9.8` |
| Framework | Next.js `16.3.8`, React `19.2.6`, TypeScript `5.9.3`, Zod `^3.24.1` |
| Tests | Vitest `^4.1.11` (`npm test` → `vitest run`); Playwright for browser tests |
| Database | PostgreSQL 16 + Drizzle ORM; RLS enforced with transaction-scoped tenant context |
| Lint / types / build | `npm run lint` (ESLint 9), `npm run typecheck` (`tsc --noEmit`), `npm run build` |
| Migrations | `npm run migrate` (`scripts/migrate.ts`) through `0075_noelia_authority_execution_hardening.sql` |
| CI | `.github/workflows/ci.yml` — PostgreSQL service, migrate, seed, `scripts/setup-db-role.ts`, typecheck, lint, full vitest, Playwright. **CI has no Ollama**, so every new test must stay hermetic. |

### 1.2 Files inspected (source of truth for the design)

Provider contract and gateway

* `src/lib/noelia/model-provider.ts` — `AIModelProvider`, `AIModelRequest`,
  `AIModelResponse`, `ModelExecutionRequest/Result`, `AIProviderHealth`,
  `BeyuDeterministicAnalystProvider`, `OpenAICompatibleAdapter`.
* `src/lib/noelia/model-gateway.ts` — `BeyuNoeliaModelGateway`,
  `executeRouted`, registry read, provider lookup by routed provider id.
* `src/lib/noelia/ai-platform.ts` — `BeyuNoeliaAiPlatformService.route()`:
  kill switch, ACTIVE/APPROVED/APPROVED gate, capability match, classification
  ceiling, residency guard, deterministic ordering (SELF_HOSTED/BEYU_OWNED
  first, then latency, then id).

HIVE runtime and governance

* `src/lib/noelia/hive-runtime.ts` — `resolveHiveExecutionContext`,
  `HiveRuntimeBoundary.execute` (identity/authorization before anything else).
* `src/lib/noelia/runtime.ts` — `routeAndExecuteModel`, `ask`/`brief`/`analyze`,
  prompt/output governance, evidence persistence.
* `src/lib/noelia/governance.ts` — `PromptGovernor`, `OutputGovernor`,
  `ActionRiskClassifier`, `HumanApprovalGate`.
* `src/lib/noelia/execution-control.ts`, `src/lib/noelia/human-approval.ts`,
  `src/lib/noelia/model-operations.ts`, `src/lib/noelia/resilience.ts`
  (circuit breaker), `src/lib/noelia/observability.ts` (telemetry that does not
  capture prompts or outputs).
* `src/lib/noelia/default-tools.ts` (`model.registry.read`),
  `src/lib/noelia/platform-services.ts` (AI decision evidence),
  `src/lib/noelia.ts` (facade used by the application).

Schema, config and test conventions

* `src/db/schema/ai.ts` (`noelia_providers`, routing decisions, kill switch),
  `src/db/schema/platform.ts` (`model_registry`).
* `src/communications/types.ts` — the repository-wide accepted provider status
  vocabulary (no `ACTIVE`).
* `vitest.config.ts`, `tests/noelia/*`, `scripts/setup-db-role.ts`,
  `scripts/infra/pg16-server.mjs`, `.env.example`, `.github/workflows/ci.yml`.

### 1.3 Findings that shaped the design

1. **No Ollama integration existed** — `grep -ri ollama src tests scripts`
   returned nothing before this change.
2. **The gateway never called a real generative surface.** `executeRouted()`
   only ever invoked `provider.execute()`, and `OpenAICompatibleAdapter.execute()`
   returns `NOT_SUPPORTED`, so no configured generative runtime was reachable in
   production code. A governed generative path had to be added — without
   changing the deterministic path.
3. **The routing decision is the authority.** `executeRouted()` re-reads
   `model_registry` and requires `status=ACTIVE`, `approvalStatus=APPROVED`,
   `evaluationStatus=APPROVED`; an unknown provider id is refused. Mounting an
   adapter is therefore *not* an activation.
4. **Status vocabulary is repository-wide** and does not contain `ACTIVE`;
   `AIProviderHealth` had no status field at all.
5. **Kill switches are layered.** `route()` honours `ALL`/`AI_IDENTITY`/`TENANT`/
   `CAPABILITY`; `MODEL`/`PROVIDER`/`TASK` are enforced at the execution
   boundary. A generative runtime must therefore also be denied at the gateway.
6. **`localhost` is process-local.** Nothing in the repository implies the
   backend runs on the operator's PC, and no tunnel exists.
7. **The seeded registry contains only `MOD_NOELIA_DET`** (SELF_HOSTED,
   BEYU_CONTROLLED, HIGHLY_RESTRICTED). The router's ordering prefers it, so a
   local Ollama runtime would only ever be selected after an explicit governed
   registry change (`register` + `activate` + approval), which this change does
   **not** perform.

### 1.4 Baseline test evidence (executed before editing)

Environment: embedded PostgreSQL 16, `npm run migrate`, `npm run seed`,
`BEYU_RUNTIME_DB_PASSWORD=… npx tsx scripts/setup-db-role.ts` (CI-equivalent role
provisioning; without it the runtime-role RLS tests fail with
`permission denied`, which is an environment artefact, not a defect).

```
npx vitest run tests/noelia
Test Files  27 passed | 2 skipped (29)
     Tests  234 passed | 12 skipped (246)
```

Pre-existing failures were found and **reproduced on the untouched baseline
commit** in a separate `git worktree`, so they are explicitly not regressions:

```
# 13 files, on the working tree AND on pristine HEAD 05e2fba (identical 35 test names)
tests/tenant-domain/tenant-domain-registry.test.ts            17 failed
tests/tenant-domain/family-office-capability-domain.test.ts    5 failed
tests/admin/governance-service.test.ts                         3 failed
tests/sector-domains/canonical-host-security.test.ts           1 failed
tests/registry/subordinate-enrollment.test.ts                  1 failed
tests/noelia/phase5-platform.test.ts                           1 failed
tests/migration/*-upgrade.test.ts                              7 failed
```

Probable environmental causes: this sandbox's PostgreSQL cluster was initialised
with `server_encoding = SQL_ASCII` (CI/production use UTF8), which breaks
knowledge full-text retrieval and DNS-challenge fixtures; migration-upgrade
suites depend on CI seed/appointment history. They are recorded, not "fixed",
and no file this change touches is involved.

---

## 2. Files changed and architecture decisions

### 2.1 Added

| File | Purpose |
| --- | --- |
| `src/lib/noelia/ollama-config.ts` | single validated configuration resolver: env keys, ranges, loopback/allowlist endpoint rules, no credentials in URLs, no wildcards; invalid ⇒ fail closed with zero calls |
| `src/lib/noelia/ollama-provider.ts` | the Ollama adapter (`BeyuOllamaProvider`): status derivation, governed generation, bounded I/O, aborts, bounded retries, stable error codes |
| `tests/noelia/ollama-fixtures.ts` | hermetic doubles: recording HTTP client, JSON/streaming/oversized responses, refusing client |
| `tests/noelia/ollama-provider.test.ts` | 32 unit tests: configuration, status transitions, request mapping, failure modes, no-leak |
| `tests/noelia/ollama-http-integration.test.ts` | 5 tests over a real loopback HTTP server through the default `fetch` client |
| `tests/noelia/ollama-gateway.test.ts` | 18 governed gateway/HIVE tests against PostgreSQL (rollback-scoped registrations) |
| `tests/noelia/ollama-live-smoke.test.ts` | opt-in live test (`NOELIA_OLLAMA_LIVE_TEST=1`), skipped by default |
| `scripts/noelia/ollama-smoke.ps1` | PowerShell availability/models/API/tests/diagnostics script |
| `docs/noelia/NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md` | operator guide (PowerShell-first) |
| `docs/noelia/NOELIA_OLLAMA_INTEGRATION_REPORT.md` | this document |

### 2.2 Modified

| File | Change |
| --- | --- |
| `src/lib/noelia/model-provider.ts` | additive: `AI_PROVIDER_STATUSES`, `AIProviderStatus`, `AIProviderStatusReport`, optional `status` on `AIProviderHealth`, optional `providerStatus()` on the interface |
| `src/lib/noelia/model-gateway.ts` | additive: default provider set (Ollama mounted only when explicitly selected), `executeGoverned()` + `executeRouted()` delegating, generative kill-switch guard, generative classification re-check, registry-identity mapping, status-aware `listProviders()` |
| `src/lib/noelia/runtime.ts` | governed system policy constant; the human's own request offered to the gateway; `modelExecutionStatus` / `modelOutput` attribution |
| `src/lib/noelia/types.ts` | additive optional `modelOutput` on `NoeliaAnswer` |
| `.env.example` | documented the seven Ollama variables (all commented out) and the loopback/egress rules |

No dependency was added, upgraded or removed. No authentication, authorization,
RBAC/ABAC, RLS, tenant/entity/country/classification boundary, consent, audit,
approval gate, kill switch or fail-closed behaviour was weakened or bypassed.

### 2.3 Architecture decisions

| Decision | Rationale |
| --- | --- |
| Adapter implements the **existing** `AIModelProvider` contract; no second registry, no parallel NOELIA identity | Repository rule; the registry + routing decision stay the only authority |
| Mounted only when `NOELIA_MODEL_PROVIDER=OLLAMA` | Off by default; the deterministic analyst stays the safe default |
| Generative execution is a **separate** gateway method; `executeRouted()` delegates with no prompt | Existing deployments and all existing tests keep identical behaviour |
| Only the requesting human's own request plus a fixed policy string are sent | Data minimisation; no retrieved enterprise data leaves the boundary in this increment |
| Classification ceiling enforced in the adapter **and** re-checked in the gateway, before any byte leaves the process | Defence in depth; denial means **zero** network calls |
| Kill switch enforced on the generative path over `MODEL`/`PROVIDER`/`CAPABILITY`/`TASK`/`ALL` | A switched-off runtime must never be called; uses the established blocking semantics |
| `modelId` in the result is the **governed registry identity**; the runtime's reported tag is kept as `metadata.runtimeModelId` | Auditable: a runtime answering with a different artifact is visible, never silently accepted |
| Bounded retries (`502/503/504` + connection resets only, ≤ `NOELIA_OLLAMA_MAX_ATTEMPTS`), hard abort timeout, prompt cap, 1 MiB response cap | Bounded resources on a ~4 GB machine; retries can never mask a policy failure |
| Stable machine error codes only (`OLLAMA_HTTP_ERROR_503`, …); upstream bodies, paths and prompts are never surfaced | Information-disclosure control, asserted by tests |
| Model text returned only as `modelOutput` (`untrusted: true`, `outputClass: "INFERENCE"`, provenance, usage) and never written into the AI decision evidence row | Provenance without promoting model text to authority |
| No streaming, no embeddings, no tool calls | Smallest safe increment; the contract allows an explicit `NOT_SUPPORTED` |
| Endpoint validated once; non-loopback hosts require an exact allowlist entry; config is server-side only | SSRF prevention; the endpoint can never be request-supplied |

---

## 3. Configuration keys and PowerShell setup

Exact keys (all documented, all commented out in `.env.example`):

| Variable | Default | Accepted |
| --- | --- | --- |
| `NOELIA_MODEL_PROVIDER` | unset (deterministic analyst) | `DETERMINISTIC` \| `OLLAMA` |
| `NOELIA_OLLAMA_BASE_URL` | `http://localhost:11434` | absolute `http(s)` URL, no credentials, no query/fragment |
| `NOELIA_OLLAMA_MODEL` | `qwen2.5:0.5b` | any Ollama model tag |
| `NOELIA_OLLAMA_TIMEOUT_MS` | `60000` | `1000`–`600000` |
| `NOELIA_OLLAMA_MAX_ATTEMPTS` | `2` | `1`–`3` |
| `NOELIA_OLLAMA_MAX_CLASSIFICATION` | `INTERNAL` | `PUBLIC` … `HIGHLY_RESTRICTED` |
| `NOELIA_OLLAMA_ALLOWED_HOSTS` | empty | exact comma-separated hosts, no wildcards |

Safe setup, PowerShell (session-only variables; never write a `.env`, never
create a tunnel, never expose port 11434):

```powershell
ollama --version
ollama list
ollama pull qwen2.5:0.5b          # only if missing (~397 MB)
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 30

$env:NOELIA_MODEL_PROVIDER      = "OLLAMA"
$env:NOELIA_OLLAMA_BASE_URL     = "http://127.0.0.1:11434"
$env:NOELIA_OLLAMA_MODEL        = "qwen2.5:0.5b"
$env:NOELIA_OLLAMA_TIMEOUT_MS   = "60000"
$env:NOELIA_OLLAMA_MAX_ATTEMPTS = "2"

pwsh -File scripts/noelia/ollama-smoke.ps1        # availability → models → API → tests → live smoke
Remove-Item Env:NOELIA_MODEL_PROVIDER, Env:NOELIA_OLLAMA_BASE_URL, Env:NOELIA_OLLAMA_MODEL,
            Env:NOELIA_OLLAMA_TIMEOUT_MS, Env:NOELIA_OLLAMA_MAX_ATTEMPTS -ErrorAction SilentlyContinue
```

`scripts/noelia/ollama-smoke.ps1` is read-only with respect to the machine: it
never edits Ollama configuration, never opens a firewall port, never creates a
tunnel, sets session environment variables only, prints no secret (Ollama has
none), and exits non-zero when a check fails. It was syntax-validated in this
sandbox with a PowerShell grammar parser (PowerShell itself is not installable
here): `0` parse errors after the function-body fix. It has **not** been executed
on a Windows host from this sandbox.

---

## 4. Tests run, with commands and actual results

All commands were executed from the repository root.

```
# Focused (hermetic; no Ollama, no privileged DB work)
npx vitest run tests/noelia/ollama-provider.test.ts tests/noelia/ollama-http-integration.test.ts tests/noelia/ollama-gateway.test.ts
 → Test Files  3 passed (3)      Tests  55 passed (55)      Duration 6.39s
   ├ tests/noelia/ollama-http-integration.test.ts  (5 tests) 4070ms
   ├ tests/noelia/ollama-gateway.test.ts           (18 tests) 199ms
   └ tests/noelia/ollama-provider.test.ts          (32 tests) 43ms

# NOELIA suite
npx vitest run tests/noelia
 → Test Files  1 failed | 29 passed | 3 skipped (33)
   Tests       1 failed | 288 passed | 16 skipped (305)
   (the single failure is the pre-existing phase5-platform SQL_ASCII case, reproduced on the baseline commit)

# Full suite (repository-wide)
npx vitest run
 → Test Files  13 failed | 295 passed | 41 skipped (349)
   Tests       35 failed | 5295 passed | 369 skipped | 31 todo (5730)
   (all 13 failing files reproduce identically on pristine HEAD 05e2fba)

# Type checking (the default heap OOMs on a 3.9 GB machine — pre-existing environment limit)
NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit
 → exit 0, no output

# Lint
npm run lint
 → 0 errors, 1 warning  (@next/next/no-img-element in src/components/noelia-cross-os-visual.tsx — pre-existing)

# Production build (same heap note)
NODE_OPTIONS=--max-old-space-size=3072 npm run build
 → exit 0; "✓ Compiled successfully"; TypeScript passed; "✓ Generating static pages (170/170)"
```

Behaviour explicitly covered by the new tests:

* **Mapping** — request id, system + user message, `stream: false`, model tag,
  options, usage (`prompt_eval_count`/`eval_count`), finish reason.
* **Configuration** — defaults, ranges, invalid values, credentials in URL,
  non-loopback host without an allowlist entry ⇒ `NOT_CONNECTED`, no call.
* **Transport failures** — connection refused, timeout/abort, malformed JSON,
  unexpected shape (`done: false`, missing/empty content), non-2xx status,
  oversized streaming body, response cap.
* **Retries** — only `502/503/504` and connection resets, bounded by
  `NOELIA_OLLAMA_MAX_ATTEMPTS`; never on validation or policy failures.
* **Status transitions** — `NOT_CONNECTED` → `CONFIGURED` (configuration alone,
  no call) → `CONNECTED` (real `GET /api/tags` + model present) →
  `VERIFIED` (real `/api/chat` round-trip); `DEGRADED` when the model is missing
  or inference fails after a successful connectivity check; `FAILED` otherwise.
* **Governance before inference** — a principal without `ai:noelia.query` and a
  prompt-injection attempt are denied by the HIVE boundary before the router,
  with a recording HTTP client proving zero runtime calls; registry
  approval/activation gates and provider activation are enforced; kill switches
  (`ALL`, `PROVIDER`, `MODEL`, `CAPABILITY`) stop routing/execution; a
  classification above the runtime ceiling is denied before egress; a
  remote/non-BEYU-controlled runtime cannot carry `RESTRICTED` data.
* **No substitution / no leakage** — a runtime failure is `FAIL_CLOSED` with no
  fallback provider or model; the governed prompt does not appear in execution
  metadata or telemetry; no cross-tenant content reaches the runtime.
* **Deterministic regression** — the default runtime, its provider id and its
  `NOT_SUPPORTED` generative capability are unchanged.

---

## 5. Was the Ollama smoke test genuinely run?

**Partly — and this is stated plainly.**

* **Run in this sandbox:** the opt-in live suite
  (`tests/noelia/ollama-live-smoke.test.ts`) was executed with
  `NOELIA_OLLAMA_LIVE_TEST=1` against an Ollama-compatible **loopback mock**
  endpoint (a local HTTP server implementing the documented Ollama wire
  protocol). It reported `CONNECTED` → `VERIFIED` → `COMPLETED` and `FAILED` for
  an unreachable endpoint: 4/4 tests passed. That proves the adapter's HTTP path,
  status ladder and abort behaviour — it does **not** prove a real Ollama run.
* **Not run in this sandbox:** a real `ollama` binary. The runtime/installer is
  not available in this environment, so nothing here may claim real inference
  against a real model.
* **Run by you, on your machine (your own evidence, not reproduced here):**
  `POST http://localhost:11434/api/chat` with `qwen2.5:0.5b` and `stream=false`
  returned exactly `NOELIA LOCAL API TEST PASSED`.
* **The reproducible path for you** is `scripts/noelia/ollama-smoke.ps1`
  (steps 3, 4 and 7 hit your local runtime and assert `CONNECTED`/`VERIFIED`);
  its output is the evidence to attach to review. Until that is run in the target
  runtime, the honest status there is at most `CONFIGURED`.

---

## 6. Provider status and evidence

Statuses use only the repository's accepted vocabulary — never `ACTIVE` (that is
registry activation, a governance action, not connectivity).

| Status | Evidence required | Evidence available now |
| --- | --- | --- |
| `NOT_CONNECTED` | not selected, unconfigured or invalid configuration | asserted by unit + gateway tests (zero calls) |
| `CONFIGURED` | valid configuration only | asserted by unit tests (no network call) |
| `CONNECTED` | real `GET /api/tags` **and** the configured model installed | hermetic HTTP + loopback-mock evidence |
| `VERIFIED` | real `/api/chat` round-trip through `verifyInference()` | hermetic HTTP + loopback-mock evidence; **no real-Ollama evidence in this sandbox** |
| `DEGRADED` | reachable but model missing / inference failed after connectivity | asserted by unit tests |
| `FAILED` | connectivity or inference check failed | asserted by unit + integration tests |
| `SIMULATED` | explicit test double only; the production adapter never reports it | reserved |

Gateway-level governance evidence (asserted in `tests/noelia/ollama-gateway.test.ts`):
mounting requires explicit configuration; configuration alone never yields
`CONNECTED`; a non-`SELECTED` route, an unregistered provider, an unapproved
model, a missing model row, a kill switch, a ceiling breach or a missing
permission all produce zero runtime calls; the deterministic runtime remains the
default; no fallback occurs on failure.

---

## 7. Limitations

1. **Local machine vs a deployed backend.** `http://localhost:11434` is loopback
   of the process making the call. On Vercel (or any remote host) it is *that*
   server, not a PC, so a deployed BEYU backend cannot reach Ollama on a personal
   machine. This was **not** worked around: no port exposure, no port-forwarding,
   no public tunnel, no firewall change. Options that would need separate threat
   modelling, authorization, data-egress review and human approval are listed in
   the operator guide and are **not implemented**.
2. **Development runtime only.** `qwen2.5:0.5b` (~397 MB) is the locally suitable
   smoke-test model on ~3.9 GB RAM. `gpt-oss:latest` (~13 GB) cannot run there and
   was not attempted. Model quality is not claimed.
3. **Not the production default.** Ollama is mounted only via explicit governed
   configuration; the deterministic in-boundary analyst remains the default, and
   no external provider (OpenAI, Anthropic or any other) is used as a fallback.
4. **Only the requesting human's own request is sent.** Feeding retrieved
   enterprise data to a model needs a separate data-governance review.
5. **Streaming, embeddings and tool calling are `NOT_SUPPORTED`** for this
   adapter by design.
6. **Circuit breaker and rate limiting** are not re-implemented in the adapter;
   the existing resilience guard and HTTP gates remain the mechanisms and are
   unchanged.
7. **`typecheck` / `build` need `--max-old-space-size=3072`** on a ~4 GB machine;
   CI runners are unaffected. The PowerShell script and guide were syntax-checked
   here but not executed on Windows.

---

## 7a. Round 2 (same branch, same PR): cloud posture, agent runtime, disclosure fix

The operator asked for a further engineering round on the same branch and PR:
complete the local Ollama work, evaluate optional Ollama Cloud inference, add a
**restricted** Hermes agent runtime, and preserve every governance boundary.

### Audit findings this round

* **`origin/main` has not advanced.** It is still `05e2fba`, the PR base, so no
  reconciliation with a newer `main` was required. The PR also has no review
  comments or change requests pending; the only comment is a Vercel bot notice.
* **CI already fails on `main`** at the *same* pre-existing point this PR hits:
  the "Assert no test suite was silently skipped for want of a server" step
  (run `38264464251`, on `05e2fba`). The 369 skipped tests are a repository-wide
  baseline, not a regression from this work. The other new CI result (Vercel
  preview, secret scan, migration validation, Health OS gates) is green.
* **Hermes is Nous Research's `hermes-agent` CLI** (verified from the vendor
  documentation): one-shot runner `hermes-agent --query "…"`, `--version`,
  `--model`, `--max-turns`, `--enabled-toolsets`/`--disabled-toolsets`,
  `--list-tools`, `HERMES_NONINTERACTIVE`, native Windows install to
  `%LOCALAPPDATA%\hermes`. **No `hermes` binary exists in this coding
  environment** (`which hermes ollama` → nothing), and the only "hermes" entries
  in the repository are the unrelated `hermes-parser` dev dependency.
* **Ollama Cloud is `https://ollama.com/api` + `Authorization: Bearer`, with the
  same request body** as the local API minus the `:cloud` CLI suffix, and pricing
  is **per-token with monthly credits** — so a cloud call is a cost surface that
  must be opt-in, credential-gated and never automatic.
* **Real defect found and fixed (pre-existing, not introduced here):** the HIVE
  runtime copied `metadata.runtime` / `metadata.endpointScope` from an adapter
  **verbatim** into the provenance of a governed answer. A buggy or hostile
  adapter could therefore reflect a prompt, a path or a credential fragment into
  an answer a human reads. Provenance is now clamped to a closed vocabulary
  (`GOVERNED_RUNTIME_LABELS`, `ENDPOINT_SCOPE_LABELS`, `RUNTIME_KIND_LABELS` in
  `runtime.ts`), with an end-to-end test using a deliberately hostile adapter.

### What changed this round

| File | Change |
| --- | --- |
| `src/lib/noelia/ollama-config.ts` | endpoint-KIND rules: loopback must be `http:` and must have **no** key; non-loopback must be `https:` + exactly allowlisted; the Ollama Cloud host additionally requires `NOELIA_OLLAMA_CLOUD_OPT_IN=1` and a plausible `NOELIA_OLLAMA_API_KEY`. New `runtimeKind` / `cloudMode` / `credentialRequired`. A credential is **never** stored on the configuration object (`readOllamaCredential` is the only reader) |
| `src/lib/noelia/ollama-provider.ts` | injectable `env`; `headersFor()` attaches the bearer token **only** to an authorised non-loopback request; `runtimeKind`/`cloudMode` in metadata; cloud endpoints are `EXTERNAL`/`CONFIGURED_REMOTE_HOST`, never `BEYU_CONTROLLED`; documented 402/429 terminal-with-no-fallback behaviour |
| `src/lib/noelia/runtime.ts` | `safeProvenanceLabel()` clamping + closed provenance vocabularies (the disclosure fix) |
| `src/lib/noelia/types.ts` | optional `runtimeKind` on `modelOutput.provenance` |
| `src/lib/noelia/hermes-config.ts` *(new)* | fail-closed, opt-in configuration for the restricted agent runtime |
| `src/lib/noelia/hermes-runtime.ts` *(new)* | the restricted runtime: fixed argv, `shell:false`, allowlisted child env, bounded output/time/bytes/turns, every toolset disabled, sanitized errors, prose that can never be an action receipt |
| `tests/noelia/ollama-cloud-guardrails.test.ts` *(new, 16)* | cloud disabled by default, opt-in/allowlist/https/key rules, credential placement, `402/429/401` terminal with no fallback, classification blocked before egress — **mock only, no network** |
| `tests/noelia/hermes-runtime.test.ts` *(new, 22)* | config + argv + env + spawn-refusal + failure modes + no-authority assertions — **mocked runner, no agent process** |
| `tests/noelia/provenance-disclosure.test.ts` *(new, 2)* | end-to-end HIVE `ask()` with a hostile adapter and with the real adapter |
| `tests/noelia/agent-surface-guard.test.ts` *(new, 5)* | freezes the 73-tool governed inventory; forbids shell/SQL/agent tool names; asserts the Hermes runtime exposes no provider surface and no tool authority |
| `.env.example` | documented the cloud keys and the nine Hermes keys (all commented out) |
| `scripts/noelia/ollama-smoke.ps1` | `-CheckHermes` (version probe + hermetic suite, no agent query) and `-CheckCloud` (a **non-inference** model listing, opt-in only) |
| `docs/noelia/NOELIA_HERMES_RESTRICTED_RUNTIME.md` *(new)* | design, enforced limits, operator verification, rollback |
| `docs/noelia/NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md` | cloud/posture section, new keys, new switches, provenance note |

### Deliberate non-goals (documented, not silently skipped)

* **No Ollama Cloud inference path is implemented or verified.** Guardrails are
  implemented and tested; the call itself is not, because zero-spend eligibility,
  quota and pricing are provider-controlled and cannot be established from this
  environment without risking a charge. Stop condition honoured.
* **Hermes is not wired into NOELIA routing**, executes no tools, and is not an
  `AIModelProvider`. Enabling agent tools or exposing Hermes through a governed
  capability requires an authorization + approval design that does not exist yet;
  this increment deliberately stops at the safely testable boundary.
* **No new dependency** was added. `spawn`, `URL`, `AbortController` and `fetch`
  are all Node built-ins already in use.
* **Pre-existing observation, not changed here:** the `ai.model.route` tool is
  declared with a non-`NONE` side effect and no `approvalRequirements`. It is
  unchanged by this work, and changing tool metadata is a governance decision
  that belongs to its owner, not to a provider-integration PR.

### Evidence (round 2, executed)

```
npx vitest run tests/noelia
 → 1 failed | 33 passed | 3 skipped (37 files) · 1 failed | 333 passed | 16 skipped (350 tests)
   (the single failure is the pre-existing phase5-platform SQL_ASCII case)

npx vitest run tests/noelia/ollama-cloud-guardrails.test.ts tests/noelia/hermes-runtime.test.ts                 tests/noelia/provenance-disclosure.test.ts tests/noelia/agent-surface-guard.test.ts
 → 4 files passed · 45 tests passed

NODE_OPTIONS=--max-old-space-size=3072 npx tsc --noEmit   → exit 0
npm run lint                                              → 0 errors
PowerShell grammar parse of scripts/noelia/ollama-smoke.ps1 → 0 parse errors
```

---

## 8. Branch and pull request

* Branch: `arena/58532ec6-beyu-os-1-0` (feature branch created from `main` @ `05e2fba`).
* Pull request: **https://github.com/yumvalila-bot/BEYU-OS-1.0/pull/107**
  (`NOELIA: governed, opt-in Ollama inference runtime adapter`).
* **No PR was merged, no auto-merge was enabled, and no deploy was run.** The
  change stops at the human review gate.
* `main` was not pushed to, force-pushed, or modified in any way; `origin/main`
  still points at `05e2fba`.

---

## 9. Unresolved blockers

1. **No real-Ollama execution in this sandbox** (binary not installable here):
   the live suite's real-runtime run remains with the operator on Windows.
2. **The local runtime is not reachable by the routing decision** without a
   governed registry change (register + activate an approved provider/model).
   This change deliberately does not perform that write; a local dev DB that
   already has `MOD_NOELIA_DET` active will keep selecting the deterministic
   analyst until someone with authority changes the registry.
3. **Pre-existing repository failures** (§1.4, 35 tests in 13 files, reproduced on
   the baseline commit). They are unrelated to this change and were not silenced
   or modified.
4. **Sandbox PostgreSQL uses `SQL_ASCII`**, which is the probable cause of some of
   those failures; production/CI use UTF8 and are unaffected.
5. **Approval to proceed beyond the review gate** (merge, deploy, production
   migration) — out of scope for this increment.

---

## 10. Explicit statements

* `main` was **not** modified: no commit landed on it, no push to it, no force-push,
  no history rewrite, no branch deletion.
* **No auto-merge** was enabled, requested or performed; the change stops at the
  human review gate.
* **No production deployment** was performed or triggered.
* **No production migration** was run, authored or applied; no migration file was
  added or changed by this work.
* **No production or governance setting** was modified; no approval was bypassed;
  the deterministic provider remains the safe default; Ollama becomes reachable
  only through explicit governed configuration.
* **No secrets** were requested, printed, committed or added to tests, logs,
  prompts or PR text; Ollama has no credential, and the endpoint is configuration.
* **No unsupported production-readiness claim** is made anywhere in this work.
