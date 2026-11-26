# Tiny neural inference — a real, offline inference proof

This directory exists to answer one question honestly:

> Has NOELIA's inference path ever actually run a model?

Before this, the answer was **no**. The Ollama adapter was thoroughly tested
against HTTP doubles, and an opt-in live smoke suite existed
(`tests/noelia/ollama-live-smoke.live.ts`), but nothing had ever executed a real
forward pass. An HTTP mock is not inference, and a test that *could* run is not
evidence that it *did*.

## Why this is trained, not downloaded

Every route to a real model weight is closed in the environment where this was
verified:

| Host | Purpose | Reachable |
| --- | --- | --- |
| `huggingface.co` | GGUF / safetensors weights | ❌ blocked |
| `registry.ollama.ai` | `ollama pull` | ❌ blocked |
| `media.githubusercontent.com` | Git-LFS payloads | ❌ blocked |
| `raw.githubusercontent.com` | raw file download | ❌ blocked |
| `cdn.playwright.dev` | browser binaries | ❌ blocked |
| `github.com` (git / API) | source only | ✅ but **every reachable `.gguf` is a Git-LFS pointer** |

A 491 MB `qwen2.5-0.5b-instruct-q4_k_m.gguf` was located and its blob content
inspected: **183 base64 characters** — a pointer, not weights. So the model is
**trained from scratch instead**, in 4.6 seconds, on CPU, with no dependencies.

## What it proves — and what it does not

**Proves.** The adapter's complete inference path against a live HTTP runtime:

- `/api/tags` discovery and model-installed detection
- `/api/chat` request construction, response parsing, usage accounting
- model identity preservation
- a governed generation reaching `COMPLETED` with `inferenceCount: 1`
- `FAILED` for an unreachable endpoint, `DEGRADED` for a reachable endpoint with a
  missing model — the two failure modes distinguished, not collapsed
- endpoint-scope classification (`LOCAL_PROCESS`) and loopback enforcement

**Does not prove.** Answer quality. A 96-token vocabulary and ~2,300 parameters
is a mechanism test. It produces real token predictions from real weights; it
does not produce institutional intelligence. That distinction is recorded in
`docs/noelia/NOELIA_ACCEPTANCE_MATRIX.md` and is never blurred.

## Reproduce

```bash
cd scripts/noelia/tiny-inference
python3 train_tiny_model.py                 # ~4.6s, writes noelia-tiny-model.json
python3 ollama_tiny_server.py --port 11434  # serves /api/tags and /api/chat
```

Then point the adapter at it:

```bash
NOELIA_MODEL_PROVIDER=OLLAMA \
NOELIA_OLLAMA_BASE_URL=http://127.0.0.1:11434 \
NOELIA_OLLAMA_MODEL=noelia-tiny-neural:mechanism-test \
npx tsx scripts/noelia/tiny-inference/verify-live-inference.ts
```

Measured output:

```
config valid: true | enabled: true | scope: LOCAL_PROCESS
HEALTH: CONNECTED | reachable: true
VERIFY: VERIFIED | ok: true
  evidence: probe:reachable | probe:model-installed | endpoint-scope:LOCAL_PROCESS
          | runtime-kind:LOCAL_LOOPBACK | verify:inference-completed
          | verify:attempts:1 | verify:response-chars:41
GOVERNED RUN: COMPLETED | generative: true | inferenceCount: 1
UNAVAILABLE ENDPOINT: FAILED | reachable: false
MISSING MODEL: DEGRADED | detail: OLLAMA_MODEL_NOT_INSTALLED ...
```

## With a real Ollama

Nothing here is required to use a real runtime — this is a proof harness, not a
replacement. For production-shaped verification, install Ollama and a small
model, then run the opt-in live suite:

```bash
ollama pull qwen2.5:0.5b          # ~400 MB, fits 4 GB RAM, CPU-only
NOELIA_OLLAMA_LIVE_TEST=1 \
npx vitest run --config vitest.live.config.ts tests/noelia/ollama-live-smoke.live.ts
```

The adapter does not know or care whether the runtime serving it is Ollama or
this harness — it speaks the same contract. That is precisely why the round-trip
above is meaningful evidence about the adapter.

## Resource footprint

| Item | Measured |
| --- | --- |
| Training | 4.6 s, single core |
| Artifact | 84 KB JSON |
| Vocab / embedding | 96 tokens / 16 dims |
| Inference | single-digit ms per token, CPU only |
| Peak RAM | < 100 MB |

This is deliberately inside the 4 GB / no-GPU constraint the mission specifies.
No large model weights are downloaded, and none are required.
