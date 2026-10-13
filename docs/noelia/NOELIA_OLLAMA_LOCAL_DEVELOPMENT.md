# NOELIA — local Ollama runtime (Windows PowerShell)

**Status of this document:** operator guide for the governed Ollama adapter added
to the existing NOELIA model gateway. It describes *local development* only. It
makes no claim about production readiness, and it does not change any BEYU OS
governance boundary.

> **Nothing here activates a provider.** Mounting the adapter requires one
> environment variable, and execution additionally requires a provider + model
> registered, activated and APPROVED in the governed registry
> (`noelia_providers`, `model_registry`) and selected by the routing decision.
> The deterministic in-boundary BEYU analyst stays the default runtime.

---

## 1. What this is

| Concept | Where it lives | Notes |
| --- | --- | --- |
| Provider-neutral contract | `src/lib/noelia/model-provider.ts` | unchanged, extended additively with the accepted status vocabulary |
| Ollama adapter | `src/lib/noelia/ollama-provider.ts` | implements `AIModelProvider`; server-side only |
| Configuration + validation | `src/lib/noelia/ollama-config.ts` | single resolution point; fail-closed |
| Gateway mounting + governed execution | `src/lib/noelia/model-gateway.ts` | routing decision remains authoritative |
| HIVE runtime integration | `src/lib/noelia/runtime.ts` | generative text is returned only as labelled, untrusted inference |
| Tests | `tests/noelia/ollama-*.test.ts` | hermetic by default, live test opt-in |
| PowerShell script | `scripts/noelia/ollama-smoke.ps1` | availability, models, API, tests, diagnostics |

**Never** put an Ollama call in browser/client code, and never expose port
`11434` to a network or create a tunnel to it. The adapter is reached only from
the trusted server-side process, and only at a validated `http`/`https`
endpoint.

---

## 2. Quick start (copy-paste, PowerShell)

Run everything from the repository root.

```powershell
# 0. Repository dependencies (once)
npm ci

# 1. Is Ollama installed and running?
ollama --version
ollama list

# 2. Is the development model present? (about 397 MB)
ollama list | Select-String "qwen2.5:0.5b"
# Only if it is missing:
ollama pull qwen2.5:0.5b

# 3. Is the local API answering?
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 30

# 4. Session environment variables for BEYU (this PowerShell window only)
$env:NOELIA_MODEL_PROVIDER      = "OLLAMA"
$env:NOELIA_OLLAMA_BASE_URL     = "http://127.0.0.1:11434"
$env:NOELIA_OLLAMA_MODEL        = "qwen2.5:0.5b"
$env:NOELIA_OLLAMA_TIMEOUT_MS   = "60000"
$env:NOELIA_OLLAMA_MAX_ATTEMPTS = "2"

# 5. Hermetic tests (no Ollama needed)
npx vitest run tests/noelia/ollama-provider.test.ts tests/noelia/ollama-http-integration.test.ts tests/noelia/ollama-gateway.test.ts

# 6. Optional LIVE smoke test (real inference against your Ollama)
$env:NOELIA_OLLAMA_LIVE_TEST = "1"
npx vitest run tests/noelia/ollama-live-smoke.test.ts
Remove-Item Env:NOELIA_OLLAMA_LIVE_TEST
```

### One command for the whole thing

```powershell
pwsh -File scripts/noelia/ollama-smoke.ps1
# Windows PowerShell 5.1 (no pwsh):
powershell -ExecutionPolicy Bypass -File scripts/noelia/ollama-smoke.ps1
```

Useful switches:

```powershell
pwsh -File scripts/noelia/ollama-smoke.ps1 -Model "qwen2.5:0.5b" -TimeoutSec 300
pwsh -File scripts/noelia/ollama-smoke.ps1 -SkipTests       # runtime checks only
pwsh -File scripts/noelia/ollama-smoke.ps1 -BaseUrl "http://127.0.0.1:11500"
```

The script is read-only with respect to your machine: it never changes Ollama
configuration, never opens a firewall port, never creates a tunnel, and never
prints a secret (there is no Ollama credential — the endpoint is configuration).

### Clearing the variables when you are done

```powershell
Remove-Item Env:NOELIA_MODEL_PROVIDER, Env:NOELIA_OLLAMA_BASE_URL, Env:NOELIA_OLLAMA_MODEL,
            Env:NOELIA_OLLAMA_TIMEOUT_MS, Env:NOELIA_OLLAMA_MAX_ATTEMPTS,
            Env:NOELIA_OLLAMA_MAX_CLASSIFICATION, Env:NOELIA_OLLAMA_ALLOWED_HOSTS -ErrorAction SilentlyContinue
```

Session variables disappear when the window closes. Do **not** use
`[Environment]::SetEnvironmentVariable(..., "Machine")` for local experiments,
and never commit a `.env` file (`.env` is gitignored).

---

## 3. Configuration keys

| Variable | Default | Accepted | Purpose |
| --- | --- | --- | --- |
| `NOELIA_MODEL_PROVIDER` | unset (deterministic analyst) | `DETERMINISTIC` \| `OLLAMA` | mounts the Ollama adapter |
| `NOELIA_OLLAMA_BASE_URL` | `http://localhost:11434` | absolute `http://` or `https://` URL, no credentials, no query/fragment | runtime endpoint |
| `NOELIA_OLLAMA_MODEL` | `qwen2.5:0.5b` | Ollama model tag | model requested from the runtime |
| `NOELIA_OLLAMA_TIMEOUT_MS` | `60000` | `1000`–`600000` | hard per-attempt timeout (abort) |
| `NOELIA_OLLAMA_MAX_ATTEMPTS` | `2` | `1`–`3` | bounded attempts; retries only on `502/503/504` and connection resets |
| `NOELIA_OLLAMA_MAX_CLASSIFICATION` | `INTERNAL` | `PUBLIC`…`HIGHLY_RESTRICTED` | highest data classification allowed to leave the process |
| `NOELIA_OLLAMA_ALLOWED_HOSTS` | empty | exact comma-separated hosts, no wildcards | required before a **non-loopback** endpoint is accepted |

An invalid value never falls back to a permissive default: the adapter reports
`NOT_CONNECTED` and refuses to call anything. There is **no** API key, token or
password for Ollama; do not invent one and do not commit one.

Endpoint rules that are enforced (see `src/lib/noelia/ollama-config.ts`):

* only `http:`/`https:`; credentials in the URL are rejected;
* `localhost`, `127.0.0.0/8` and `::1` are treated as loopback of the backend
  process;
* any other host must be named exactly in `NOELIA_OLLAMA_ALLOWED_HOSTS` — no
  wildcards — so a misconfiguration cannot turn the adapter into a proxy for an
  arbitrary internal host;
* the endpoint comes from server-side configuration only: it is never taken
  from a request, a prompt, a database row or a user-supplied URL.

---

## 4. Provider status: what is proven, and by what

The adapter reports only the repository's accepted statuses — never `ACTIVE`
(that is registry activation, a governance action, not connectivity):

| Status | Reached when | Evidence |
| --- | --- | --- |
| `NOT_CONNECTED` | not selected, unconfigured or invalid | configuration evidence; **no network call** |
| `CONFIGURED` | configuration valid | nothing has been proven yet (**no network call**) |
| `CONNECTED` | `GET /api/tags` succeeded **and** the configured model is installed | real HTTP round-trip |
| `VERIFIED` | `verifyInference()` completed a real `/api/chat` round-trip | real inference response, shape-validated |
| `DEGRADED` | reachable, but the configured model is missing — or connectivity held while inference failed | real HTTP round-trip |
| `FAILED` | connectivity or inference check failed (refused/timeout/HTTP error/not an Ollama endpoint) | real failure |
| `SIMULATED` | reserved for explicit test doubles; the production adapter never reports it | — |

`configuration alone must never prove connectivity` — this is asserted by tests.
`health()` performs the connectivity check; `verifyInference()` performs the
inference check. Both are explicit calls; nothing is cached across processes.

---

## 5. Data, tenancy and egress boundaries

* Only the **requesting human's own request** is offered to the model in this
  increment, plus a fixed control-plane policy string. No retrieved enterprise
  data, no knowledge documents and no other tenant's data are sent.
* The classification ceiling is checked **before any byte leaves the process**,
  and re-checked in the gateway (defence in depth). Above the ceiling the
  request is `DENIED` and **no network call happens**.
* Prompts, responses and retrieved content are never written to telemetry by the
  adapter; errors carry stable codes such as `OLLAMA_HTTP_ERROR_503`, never the
  upstream body, a filesystem path or a prompt.
* Model output is treated as untrusted data: it is returned only as
  `modelOutput` with `untrusted: true`, `outputClass: "INFERENCE"` and explicit
  provenance. It never becomes policy, an authorization, a tool call, a
  finding, a source, or the answer narrative, and it is not written into the AI
  decision evidence row.
* Inference cannot execute privileged tools: the adapter cannot call tools at
  all, and the tool registry / human-approval gates are unchanged.

### Where the data is actually processed

* Loopback endpoint → the model runs on **the machine that runs the backend
  process**. Application logs and network configuration still matter.
* A non-loopback endpoint (explicitly allowlisted) → data leaves the process
  and travels to that host. Register such a runtime in the governed registry
  with the matching `data_residency`; the router refuses to send data above
  `INTERNAL` to a runtime that is not marked `BEYU_CONTROLLED`.

---

## 6. Local machine vs a deployed BEYU backend (important)

`http://localhost:11434` means **loopback of the process making the call**.

| BEYU backend runs on | Ollama on your Windows PC is reachable? |
| --- | --- |
| Your Windows PC (`npm run dev`) | **Yes** — same machine |
| Vercel / any remote host | **No.** `localhost` there is *that* server, not your PC |

Do **not** fix this by exposing port 11434, port-forwarding, or creating a public
tunnel. Those options weaken security and are out of scope. Options that would
require separate threat modelling, authorization, data-egress review and human
approval (not implemented here):

1. BEYU-controlled self-hosted inference inside a protected network;
2. a secured private connector (for example a governed private link) with
   authentication, TLS, network policy and monitoring;
3. a suitable hosted inference provider, onboarded through the existing
   governed provider registration and approval workflow.

No external provider (OpenAI, Anthropic or any other) is called as a fallback:
those integrations need their own explicit configuration, accounts and review.

---

## 7. Troubleshooting

| Symptom | Status observed | Diagnosis and fix |
| --- | --- | --- |
| `ollama --version` not found | — | Install Ollama from <https://ollama.com/download> (do not fetch it from this repo). |
| `Get "http://127.0.0.1:11434/api/tags": connection refused` | `FAILED` | Ollama is not running (start the app, or `ollama serve`), or the endpoint/port is wrong. Check `Get-NetTCPConnection -LocalPort 11434 -ErrorAction SilentlyContinue`. |
| Test fails with `OLLAMA_TIMEOUT` | `FAILED` | Increase `NOELIA_OLLAMA_TIMEOUT_MS` or `-TimeoutSec`. A small model still needs seconds; the first load after start is the slowest. |
| Test fails with `OLLAMA_MODEL_NOT_INSTALLED` / `DEGRADED` | `DEGRADED` | `ollama pull <model>` — the endpoint answers but the configured model is not installed. |
| `model requires more system memory` / allocation failure | `FAILED` | The model is too large for this machine. `gpt-oss:latest` (~13 GB) cannot run on ~4 GB RAM. Use `qwen2.5:0.5b` (~397 MB). |
| `OLLAMA_HTTP_ERROR_404` | `FAILED` | Wrong model name or an endpoint that is not Ollama. Re-check `NOELIA_OLLAMA_MODEL` and the base URL. |
| `OLLAMA_RUNTIME_CONFIGURATION_INVALID` | `NOT_CONNECTED` | One of the configuration rules in section 3 is violated; the adapter reports the reason (for example a non-allowlisted host) instead of calling out. |
| `OLLAMA_CLASSIFICATION_LIMIT_EXCEEDED` | unchanged | The request classification is above `NOELIA_OLLAMA_MAX_CLASSIFICATION`. That is intended; raise it only as a governance decision. |
| Responses are slow | — | Expected on CPU-only hardware (Intel HD Graphics 610 has no usable acceleration here). Lower `num_predict`/prompt size, or accept the latency. |

Diagnostic commands that do not reveal any secret:

```powershell
Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 30 |
  Select-Object -ExpandProperty models | Select-Object name, size
```

---

## 8. Enabling, disabling and rolling back

* **Enable:** set `NOELIA_MODEL_PROVIDER=OLLAMA` and register + activate an
  approved provider/model in the governed registry (a governance action, with
  authority — this document does not perform it).
* **Disable:** unset `NOELIA_MODEL_PROVIDER` (or set it to `DETERMINISTIC`).
  Execution returns to the deterministic analyst. Nothing else changes.
* **Emergency stop:** use the existing kill switch. A `PROVIDER`, `MODEL`,
  `CAPABILITY`, `TASK` or `ALL` switch that matches stops the generative call
  before any request leaves the process.
* No migration, deployment or production setting is changed by any step above.
