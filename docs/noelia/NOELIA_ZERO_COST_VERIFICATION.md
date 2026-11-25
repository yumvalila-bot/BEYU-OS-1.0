# NOELIA Zero-Cost Verification

**Policy status: ENFORCED IN CODE AND IN THE DATABASE.**
**Account-level billing status: NOT INSPECTED — and therefore not claimed to be zero.**
**New authorized spend in this workstream: USD $0.00.**

---

## 1. The constraint and how it is met

The NOELIA programme operates under an absolute zero-cost constraint: development must not
incur a new financial charge of any kind. That is easy to write down and easy to violate, so
this document records *where the constraint is enforced*, *what was actually executed*, and
*what could not be verified*.

The distinction that matters:

| Claim | Status |
|---|---|
| "No paid service was called during this workstream." | **Verified** — see §3 |
| "The platform cannot call a paid AI service." | **Verified** — enforced at two layers, §2 |
| "BEYU's total cloud bill is zero." | **NOT VERIFIED** — the application cannot inspect account billing. Not claimed. |

---

## 2. Where the constraint is enforced

### 2.1 Layer 1 — the policy module (pure decision)

`src/lib/noelia/zero-cost-policy.ts`

Five cost classes: `LOCAL_FREE`, `FREE_HOSTED`, `TRIAL`, `PAID`, `UNKNOWN`. Only `LOCAL_FREE`
is authorized without a human decision. Every other class is denied, and so is anything the
policy cannot classify.

The important design property is that a declaration can only make the outcome **stricter**,
never more permissive. A provider labelled `LOCAL_FREE` that requires a payment instrument,
can transition to paid automatically, or relies on expiring credits is reclassified as
`PAID` or `TRIAL` regardless of its label.

Defaults, from `DEFAULT_ZERO_COST_CONFIG`:

```
remoteInferenceEnabled  = false
allowFreeHosted         = false
```

These can only be enabled by the exact environment values `1` or `true`. An empty string, a
typo, `"TRUE "` or `"yes"` all leave the safe default in place.

### 2.2 Layer 2 — the gateway (execution refusal)

`src/lib/noelia/model-gateway.ts`, "Zero-cost gate"

The gate runs *after* registry approval and *before* any runtime call. It is deliberately a
separate check from approval, because "may this model be used?" and "does using it cost
money?" are different questions with different evidence.

A refusal returns `status: BLOCKED` with `blockedBy: "ZERO_COST_POLICY"` and the verdict
verbatim, so an operator can tell "this model is paid" apart from "nobody has verified what
this model costs". Those need different fixes.

### 2.3 Layer 3 — the database (constitutional invariant)

Migration `0086`, constraint `model_registry_zero_cost_executable_check`:

```
NOT (approval_status = 'APPROVED' AND status = 'ACTIVE' AND cost_class IN ('PAID','TRIAL'))
```

Verified behaviour (each in its own transaction, rolled back). Note that the constraint
governs rows that are **executable** — `approval_status = 'APPROVED' AND status = 'ACTIVE'` —
so the probe must set `approval_status`, or the gate correctly will not fire:

```
APPROVED + ACTIVE + PAID         => BLOCKED (SQLSTATE 23514)
APPROVED + ACTIVE + TRIAL        => BLOCKED (SQLSTATE 23514)
APPROVED + ACTIVE + UNKNOWN      => ACCEPTED at the DB, REFUSED by the gateway
APPROVED + ACTIVE + LOCAL_FREE   => ACCEPTED at the DB and permitted
APPROVED + ACTIVE + FREE_HOSTED  => ACCEPTED at the DB, REFUSED by the gateway (remote off)
```

An earlier version of this document reported all four classes as "blocked" because the probe
omitted `approval_status`, so every insert failed on a `NOT NULL` column (23502) and was
misread as a policy rejection. The constraint was never broken; the *test* was. This is
recorded rather than silently corrected because a probe that fails for the wrong reason is the
most common way a security attestation becomes false.

**Why the database constraint is narrower than the gateway.** A registry is an inventory. If
it refused to record a paid model at all, it would be impossible to report one, refuse it in
the Model Centre, or keep the evidence that it was assessed and declined. So the database
forbids the two positively-prohibited classes, and the gateway refuses *any* unverified
execution. Two layers, each doing what it can do soundly.

---

## 3. What was actually executed

| Action | Count | Evidence |
|---|---|---|
| Paid AI API calls | 0 | No paid provider SDK is a dependency; no API key is configured; remote inference is disabled by default |
| Model subscriptions | 0 | `package.json` diff adds no subscription or hosted-AI dependency |
| Trial credits used | 0 | None obtained, none configured |
| Billing activations | 0 | No account, card or billing configuration was touched |
| Paid embedding services | 0 | Embeddings are computed in-process by `embeddings.ts`; no network call exists in that module |
| Paid vector/graph services | 0 | Vector storage is a `text` column in the existing PostgreSQL; no external store |
| Paid agent/browser services | 0 | No browser-automation service introduced; Playwright remains unavailable and reported as such |
| New paid dependencies | 0 | See §4 |
| Automatic paid fallbacks | 0 | None written; the gateway fails closed rather than falling back |
| Unauthorized external AI transmissions | 0 | No inference endpoint capable of transmitting was reachable (§5) |

---

## 4. Dependencies

No runtime dependency was added. The workstream uses only what the repository already had:

| Capability | Mechanism | New dependency? |
|---|---|---|
| Embedding generation | FNV-1a hash over character n-grams, in `embeddings.ts` | No — `node:crypto` only, already imported elsewhere |
| Vector storage | `text` column, exact cosine scan | No |
| Fuzzy matching | `pg_trgm` (PostgreSQL contrib) | No — a server extension, not a package |
| Full-text search | `tsvector` / `ts_rank` (already present via 0066) | No |
| Chunking | Plain TypeScript | No |

`pg_trgm` deserves a note: it is a PostgreSQL **contrib** extension that ships with the
PostgreSQL distribution. It is not a paid service, requires no account, and makes no network
call. It was verified `installed_version = 1.6` after migration 0086.

One deviation worth recording honestly: during validation I ran `npx prettier --check`, which
caused npx to download Prettier temporarily. Prettier is not in this repository (no config, not
in `package.json`), so the check was meaningless and its output was disregarded. It is a
developer-tool download into an ephemeral cache, not a service subscription, but it is
mentioned here because "we downloaded a package" is exactly the kind of small fact that a
zero-cost attestation should not quietly omit.

---

## 5. Local inference: NOT VERIFIED, with the exact blocker

The brief asked for real local inference to be demonstrated, or for the blocker to be stated
precisely. It could not be demonstrated here:

```
$ which ollama
NOT INSTALLED

$ curl -m 3 http://127.0.0.1:11434/api/tags
NO RESPONSE
```

Environment constraints, measured:

| Resource | Available | Note |
|---|---|---|
| RAM | 3.88 GB total, ~2 GB available | Matches the documented Windows constraint (3.88 GB) |
| CPU | 2 cores | No GPU; Intel HD-class integrated graphics |
| Disk | 21 GB total, 18 GB free | Enough for a small quantized model, not for a large one |

**Consequence, stated plainly:** no model-generated text was produced by any NOELIA path in
this environment. Every NOELIA answer in testing came from
`BeyuDeterministicAnalystProvider`, which is a governed deterministic code path and does not
claim to be a language model. The `BeyuOllamaProvider` adapter exists, is tested against
injected HTTP doubles, and reports `NOT_CONNECTED` — which is the truthful status. It is not
reported as `VERIFIED`.

Model answer *quality* is therefore **unproven in this environment**. That is a limitation,
not a result.

---

## 6. Local embeddings: VERIFIED, with an honest description

The brief asked to "close the reported gap in local embeddings". A gap existed: the
`embedding_*` columns on `knowledge_sources` were declared and never populated, and retrieval
gated on a regular expression.

What now exists is a **local, deterministic, lexical embedding** — not a neural encoder. The
distinction is load-bearing and is stated in the module, in `describeLocalEmbedding()`, and in
the acceptance matrix:

| Property | Verified value |
|---|---|
| Model id | `beyu-local-lexical-v1` |
| Dimensions | 256 |
| Requires model download | No |
| Requires network | No |
| Cost class | `LOCAL_FREE` |
| Deterministic across processes | Yes (FNV-1a is fully specified in-module) |
| L2-normalized | Yes (verified to 1e-5) |
| Encode/decode round-trip error | < 1e-6 (float32 precision) |
| Zero-vector on empty input | Yes, and it scores 0 against everything |

Measured similarity behaviour:

```
profitability      vs profit                  0.460   <- morphological recall
diagnostics        vs diagnostic              0.680
expanding capacity vs expansion of capacity   0.676
hospital           vs hospital bed capacity   0.829   <- correct preference
hospital           vs hospitality training    0.552   <- false friend, ranked lower
staff              vs personnel               < 0.20  <- true synonyms NOT resolved
```

That last line is the limitation, recorded as a test so it cannot later be presented as
solved. `pgvector` is **not available** on this PostgreSQL build (verified: no extension file
on disk, only `pg_trgm` in `pg_available_extensions`), so there is no ANN index. Scoring is an
exact cosine scan over the candidate set, which is correct and does not scale — stated in
`describeRetrieval()`.

---

## 7. What is NOT verified, and is not claimed

1. **Account-level billing.** This application cannot inspect a cloud account's billing
   configuration, payment methods, or whether a provider has an active paid plan. The
   attestation therefore carries `accountBillingVerified: false` and
   `existingInfrastructureCostStatus: "NOT_INSPECTED"`, and those values are asserted in
   `tests/noelia/zero-cost-policy.test.ts` precisely so they cannot be flipped to `true` for
   convenience.
2. **Existing infrastructure cost.** The repository contains no billing configuration, so any
   statement about what BEYU currently pays for hosting, database or CI would be a guess.
3. **Hosted free tiers.** No provider was registered as `FREE_HOSTED`. None was verified. None
   is enabled.
4. **Generative answer quality.** No model ran (§5).

---

## 8. Attestation

```
TOTAL NEW AUTHORIZED COST: USD $0.00

PAID AI API CALLS: 0
PAID MODEL SUBSCRIPTIONS: 0
TRIAL CREDITS USED: 0
BILLING ACTIVATIONS: 0
PAID EMBEDDING SERVICES: 0
PAID VECTOR OR GRAPH SERVICES: 0
PAID AGENT SERVICES: 0
PAID BROWSER SERVICES: 0
NEW PAID DEPENDENCIES: 0
AUTOMATIC PAID FALLBACKS: 0
UNAUTHORIZED EXTERNAL AI TRANSMISSIONS: 0

LOCAL INFERENCE:  NOT VERIFIED — no Ollama runtime and no model in this environment
LOCAL EMBEDDINGS: VERIFIED — lexical, deterministic, in-process, no network
ZERO-COST CONFIGURATION: VERIFIED — enforced in policy, gateway and database

EXISTING INFRASTRUCTURE COSTS: NOT INSPECTED — account billing is not reachable
from the application; no claim of zero account-level cost is made
```

The last line is the one that matters for honesty. "No new charge was incurred by this work" is
a statement I can support with evidence. "BEYU pays nothing" is not, and is not made.
