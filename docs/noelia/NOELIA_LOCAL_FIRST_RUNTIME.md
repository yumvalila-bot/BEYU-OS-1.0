# NOELIA — Local-First Intelligence Runtime

**Status:** IMPLEMENTED, with an explicitly measured capability gap
**Implementation:** `src/lib/noelia/model-gateway.ts`, `model-provider.ts`, `ollama-provider.ts`, `noelia-provider.ts`
**Related:** `NOELIA_OLLAMA_INTEGRATION_REPORT.md` (adapter detail), `NOELIA_OLLAMA_LOCAL_DEVELOPMENT.md` (operator guide)

---

## 1. The zero-cost constraint, and how it is honoured

The mission forbids paid LLM APIs, paid model hosting, paid embedding services, vector databases
and paid research APIs, and forbids a paid fallback without explicit owner approval.

Verified against the repository:

| Constraint | Evidence |
|---|---|
| No paid LLM SDK | `package.json` contains no OpenAI/Anthropic/Cohere/Bedrock/Vertex client |
| No cloud inference | The only provider is the local Ollama adapter |
| No paid vector DB | No Pinecone/Weaviate/Qdrant/Chroma dependency; no external vector store |
| No paid embeddings | No embedding vendor; `embedding_status` columns exist but nothing computes vendor vectors |
| No paid research API | No research vendor client |

If a future change adds one of these, it becomes a visible dependency and a visible code change —
it cannot happen silently.

---

## 2. The one provider

`ollama-provider.ts` targets a local Ollama daemon (default `http://127.0.0.1:11434`).

Configuration is `OLLAMA_BASE_URL` + `OLLAMA_MODEL`. Nothing else is required and no key is
sent anywhere.

---

## 3. Provider state machine — truthful by construction

```
NOT_CONNECTED
     │ base URL set
     ▼
CONFIGURED  ──── host reachable? ────► CONNECTED
     │                                    │ verifyInference() round-trips a real completion
     │                                    ▼
     └──── unreachable ────► FAILED   VERIFIED
                                          │ partial capability / slow / model missing
                                          ▼
                                       DEGRADED
```

**CONFIGURED ≠ VERIFIED.** This distinction is the single most important honesty property of the
runtime, and it exists because "we set an env var" is routinely reported as "the AI works".

- `CONFIGURED` — a base URL is present. Nothing has been proven.
- `CONNECTED` — the host answered a health request.
- `VERIFIED` — `verifyInference()` produced a valid completion **and** the response validated.
  This is the only transition into VERIFIED.
- `DEGRADED` — reachable but limited (model missing, timeout, low throughput).
- `FAILED` — was reachable, now is not.
- `NOT_CONNECTED` — no configuration at all.
- `SIMULATED` — explicitly declared test/demo posture.

No code path promotes CONFIGURED to VERIFIED without an actual inference. Tests assert this.

---

## 4. Degraded mode — announced, never hidden

When Ollama is unavailable the system does **not** stop and does **not** substitute a paid API.
It falls back to the **deterministic analyst**: the existing analytical engines plus governed
retrieval produce an evidence-based answer.

The response says so:

```json
{
  "provider": "DETERMINISTIC_ANALYST",
  "providerState": "DEGRADED",
  "degradedReason": "Local model host unreachable at 127.0.0.1:11434",
  ...
}
```

Consequences, stated plainly:

- The answer is structured, sourced and useful — it is not a stub.
- It is **not** a language-model answer and is never presented as one.
- The Command Centre Model Centre shows the real state.

---

## 5. Local embeddings — honest gap

`knowledge_sources.embedding_status` and related columns exist from earlier schema work, but
**no embedding model is wired**. Retrieval today is governed keyword + structured memory lookup.

Why this is stated rather than quietly implied:

- "Vector search" would be a false claim; there is no vector index.
- A paid embedding API is forbidden, so the correct path is a local embedding model — which is
  future work, not present capability.
- The retrieval that *does* exist is stronger than it sounds: authorization filtering happens in
  SQL before text reaches a prompt, which is the property that actually matters for leakage.

---

## 6. Performance envelope (measured, not assumed)

| Operation | Observed |
|---|---|
| Registry construction | Sub-millisecond |
| Cognitive capability (read-only, scoped) | Tens of milliseconds against local PostgreSQL |
| HTTP round trip (`/cognitive/*`) | ~50–150 ms warm on this machine |
| Full production build | ~41 s with a 3 GB heap |

A local 7B-class model on CPU is the dominant latency when it is used; that is a hardware
property, not a defect, and it is surfaced as state rather than hidden behind a spinner.

---

## 7. What is NOT claimed

| Not claimed | Reality |
|---|---|
| GPU acceleration | Not configured; CPU inference |
| Multi-vendor model routing | One local provider |
| Automatic model download | Operator runs `ollama pull`; the app never fetches weights |
| Offline embedding | Not implemented |
| Guaranteed sub-second LLM answers | No; latency depends on the host |
