# NOELIA — RESTRICTED Hermes agent runtime (design, limits, verification)

**Status:** implemented and hermetically tested; **NOT enabled in any environment**
and **NOT wired into NOELIA routing** by this change. Nothing here is production
approved, and no live Hermes execution has been performed from the coding
environment.

Companion documents:

* `docs/noelia/NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md` — local Ollama + cloud posture.
* `docs/noelia/NOELIA_OLLAMA_INTEGRATION_REPORT.md` — audit, evidence, limitations.

---

## 1. What Hermes is, and why it is not a model provider

Hermes is **Nous Research's `hermes-agent` CLI**: an *agent* runtime whose whole
purpose is to run tools (terminal, filesystem, web, MCP servers). NOELIA's model
gateway speaks `AIModelProvider`: one request in, model text out, no execution
authority. The two are different concerns, so the integration is deliberately
**not** an `AIModelProvider`:

| Concern | Ollama adapter (PR #107) | Hermes runtime (this change) |
| --- | --- | --- |
| Contract | `AIModelProvider` (`run`, `health`, `providerStatus`) | own `execute()` on a dedicated runtime class |
| Mounted in the model gateway | yes, when explicitly configured | **no — never** |
| Reachable by NOELIA routing | only via a governed registry row + routing decision | **no route path exists** |
| Can execute anything | no (no tool surface at all) | no in this increment (every toolset disabled) |
| Output | untrusted inference text | untrusted prose, `actionExecuted: false` |

Source: `src/lib/noelia/hermes-config.ts`, `src/lib/noelia/hermes-runtime.ts`,
tests: `tests/noelia/hermes-runtime.test.ts`,
`tests/noelia/agent-surface-guard.test.ts`.

---

## 2. The restricted posture (what is actually enforced)

Enforced **before any process is created** (a test asserts zero spawns):

1. `NOELIA_HERMES_ENABLED` must be exactly `1`. Default: disabled.
2. The configuration must be entirely valid. One invalid value disables the
   runtime: nothing is partially configured.
3. A **declared toolset allowlist blocks execution**. Agent tool use requires a
   governed capability dispatch plus an accountable approval path that does not
   exist for agents yet, so this increment refuses instead of running with tools.
4. Classification ceiling (`NOELIA_HERMES_MAX_CLASSIFICATION`, default
   `INTERNAL`) is checked before the process starts.
5. Empty or oversized prompts are refused (`NOELIA_HERMES_MAX_PROMPT_CHARS`,
   default 4 000).

Enforced **at the process boundary**:

| Control | Implementation |
| --- | --- |
| No shell | `spawn(file, args, { shell: false })` — always |
| Fixed argv | `--query <prompt> --disabled-toolsets all --max-turns n [--model m]`; the prompt is exactly ONE element, so `;`, `&&`, backticks, `$(…)` and quotes are inert data |
| Tools | `--disabled-toolsets all` on every query; no `--enabled-toolsets` is ever emitted; no YOLO/auto-approval flag exists in the code |
| Environment | explicit allowlist (`PATH`, `HOME`, temp dirs, locale) + `HERMES_NONINTERACTIVE=1`, `NO_COLOR=1`. **No** `DATABASE_URL`, **no** API key, **no** `NOELIA_*` configuration, **no** CI token is inherited |
| Executable | bare command name or absolute path; shell syntax, quoting, whitespace, globs and `..` are rejected |
| Output | stdout bounded by `NOELIA_HERMES_MAX_OUTPUT_BYTES` (default 64 KiB); stderr is **measured only** and never returned |
| Time | `NOELIA_HERMES_TIMEOUT_MS` (default 120 s) with process-group termination (`SIGTERM`, then `SIGKILL`); on Windows `taskkill /T /F` by PID |
| Turns | `NOELIA_HERMES_MAX_TURNS`, default 1, hard cap 2 — no unbounded agent loop |
| Errors | stable codes only: `HERMES_RUNTIME_DISABLED`, `HERMES_RUNTIME_CONFIGURATION_INVALID`, `HERMES_AGENT_TOOLSETS_NOT_SUPPORTED`, `HERMES_CLASSIFICATION_LIMIT_EXCEEDED`, `HERMES_PROMPT_SIZE_LIMIT_EXCEEDED`, `HERMES_REQUEST_INVALID`, `HERMES_AGENT_CLI_UNAVAILABLE`, `HERMES_AGENT_EXIT_<code>`, `HERMES_AGENT_TIMEOUT`, `HERMES_AGENT_OUTPUT_LIMIT_EXCEEDED`, `HERMES_AGENT_EMPTY_OUTPUT`. Raw stderr, prompts, paths and environment contents are never returned |

Authorization is unchanged and independent of the model: every protected tool in
BEYU OS still passes HIVE authorization through the governed tool registry
(`risk.register.query`, `finance.*`, `knowledge.*`, …). Hermes adds **no** tool to
that registry — `tests/noelia/agent-surface-guard.test.ts` freezes the inventory
and rejects any name matching `shell|exec|sql|db_query|agent|hermes|filesystem`.

**Consequence of the current restrictions:** Hermes adds no capability that the
model gateway does not already have. It is *infrastructure placed behind the
gate*, ready for a future governed agent capability, not a new authority. That is
the intended outcome of "smallest complete safe change".

---

## 3. What is NOT possible (by construction, not by policy)

* No arbitrary shell execution, no `--yolo`, no auto-approval mode.
* No unrestricted filesystem, database, browser, messaging or MCP access.
* No generic OS-action tool and no `noelia_db_query` tool exists anywhere.
* No tool invocation can be authorized *by model output*: the agent's prose is
  returned as `{ untrusted: true, outputClass: "INFERENCE", actionExecuted:
  false, toolAuthority: "NONE" }`, and there is no code path from `execute()` to
  the tool registry.
* Agent prose can never be read as an action receipt. Reporting that an OS action
  completed requires the governed tool registry to have executed it and returned
  a verifiable result.
* Hermes cannot register, activate, approve or route itself; it has no registry
  write path and is not mentioned in routing.

---

## 4. Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `NOELIA_HERMES_ENABLED` | unset (off) | must be `1` to enable |
| `NOELIA_HERMES_EXECUTABLE` | `hermes-agent` | bare CLI name (from PATH) or absolute path |
| `NOELIA_HERMES_MODEL` | unset | optional model id, passed as one argument |
| `NOELIA_HERMES_TIMEOUT_MS` | `120000` | `1000`–`600000` |
| `NOELIA_HERMES_MAX_OUTPUT_BYTES` | `65536` | `1024`–`1048576` |
| `NOELIA_HERMES_MAX_PROMPT_CHARS` | `4000` | `1`–`8000` |
| `NOELIA_HERMES_MAX_TURNS` | `1` | `1`–`2` |
| `NOELIA_HERMES_MAX_CLASSIFICATION` | `INTERNAL` | highest classification accepted |
| `NOELIA_HERMES_ALLOWED_TOOLSETS` | empty | **leave empty**; non-empty blocks execution |

Status vocabulary is the repository's accepted one: `NOT_CONNECTED` (disabled or
invalid), `CONFIGURED` (valid, unproven), `VERIFIED` (a real `--version` probe
answered with a recognisable version), `FAILED`/`DEGRADED` on probe failure.
Never `ACTIVE`.

---

## 5. Operator verification (Windows PowerShell, optional)

The coding environment has **no** `hermes` installation, so the live checks below
were **not** performed here. Run them only if you want to enable the runtime;
each step is read-only.

```powershell
# 1. Is the CLI installed, and what version? (no query, no tools)
hermes-agent --version
hermes --version            # the full CLI, if you installed the agent package

# 2. What does the non-interactive runner support? (authoritative answer,
#    not documentation: read the help of YOUR installed version)
hermes-agent --help
hermes-agent --list-tools   # what the tool surface WOULD be

# 3. Restricted runtime check without executing a query
pwsh -File scripts/noelia/ollama-smoke.ps1 -CheckHermes -SkipTests

# 4. Hermetic suites (no Hermes process, no network)
npx vitest run tests/noelia/hermes-runtime.test.ts tests/noelia/agent-surface-guard.test.ts
```

If the installed CLI's `--help` shows different flag names than
`--query`, `--disabled-toolsets`, `--max-turns` or `--model`, **do not guess**:
the adapter must be updated to the verified syntax first (the flag contract is
version-pinned in `buildHermesInvocation`), and the change re-reviewed.

An **enabled** runtime is not an authorized one: wiring Hermes into a NOELIA
workflow additionally requires a governed capability declaration, an HIVE
authorization path, an approval requirement for anything with side effects, and a
reviewed change — none of which this increment performs.

---

## 6. Rollback / disable

```powershell
Remove-Item Env:NOELIA_HERMES_ENABLED, Env:NOELIA_HERMES_EXECUTABLE, Env:NOELIA_HERMES_MODEL,
            Env:NOELIA_HERMES_TIMEOUT_MS, Env:NOELIA_HERMES_MAX_OUTPUT_BYTES,
            Env:NOELIA_HERMES_MAX_PROMPT_CHARS, Env:NOELIA_HERMES_MAX_TURNS,
            Env:NOELIA_HERMES_MAX_CLASSIFICATION, Env:NOELIA_HERMES_ALLOWED_TOOLSETS `
            -ErrorAction SilentlyContinue
```

Disabling requires no migration, no deployment and no data change: the runtime
is inert when the flag is absent, and nothing else in BEYU OS depends on it.
