# NOELIA — RAG / Knowledge / Retrieval Completeness (Iteration 12)

**Status: 🟢 IMPLEMENTED / VERIFIED (keyword provider) · ⚫ REQUIRES_INFRASTRUCTURE (vector/semantic)**
**Provider boundary:** `src/lib/noelia/rag-provider.ts` (this iteration).
**Keyword implementation:** `src/lib/noelia/memory.ts` (governed SQL pushdown + pure gate).
**Tests:** `tests/noelia/rag.test.ts` (12), plus the Iteration 10/11 memory suites.

---

## 1. Retrieval contract

```
KnowledgeRetrievalProvider
  id: string
  active: boolean
  retrieve(request: { principal, scope, question, asOf?, limit? })
      → { provider, status: "OK" | "UNAVAILABLE", sources: RetrievedMemory[], reason?, latencyMs? }
```

- **UNAVAILABLE is a first-class state.** A retrieval failure or an
  unprovisioned provider reports UNAVAILABLE with a reason. It is never
  merged into a silent empty corpus: `retrieveThroughProviders` returns
  `status: "UNAVAILABLE"` when no provider returned OK, and the knowledge
  tool surfaces that explicitly ("Knowledge retrieval is currently
  unavailable; no answer is asserted.") with a lowered confidence.
  **Unavailable is not negative.**

## 2. Registered providers

| Provider | State | Notes |
|----------|-------|-------|
| `governed-keyword-v1` | 🟢 active | In-repo, deterministic; scope/classification/authority/freshness pushed into SQL over `knowledge_sources`; pure visibility gate as defence in depth; excerpts returned as DATA. |
| `governed-vector-v1` | ⚫ declared, inactive | Semantic/vector retrieval. `retrieve()` returns UNAVAILABLE with the activation reason. It **never fabricates semantic results**; an active implementation must push tenant/entity/country + classification into the vector query (no post-hoc filtering). |

## 3. Audit checklist (per the Iteration 12 mandate)

| Concern | Where enforced |
|---------|----------------|
| Knowledge ingestion | `upsertMemorySource` (Iteration 11): validation, provenance, checksum, versioning, audit+event |
| Document identity | `code` (unique index) + `id` |
| Source provenance | `provenance` required; `created_by/updated_by`; `content_checksum`; sources carry kind/ref/label/authority/epistemicClass/window |
| Classification | write-time ceiling (no escalation) + read-time clearance pushdown |
| Authorization | write: RBAC + tenant subtree (Iteration 11); read: tool permission `ai:noelia.query` + scope |
| Indexing | SQL indexes on scope/entity/country/status; vector index = external (⚫) |
| Retrieval | provider set; fail-closed unavailable state |
| Citation | `verifyCitations` — every presented source must be retrieved and provenance-complete; violations: SOURCE_NOT_RETRIEVED, SOURCE_MISSING_PROVENANCE |
| Freshness | validity window (effectiveFrom/reviewDate/expiresAt) in SQL + gate |
| Source authority | `authorityStatus = AUTHORITATIVE` required; non-authoritative never retrieved |
| Versioning | `version` + checksum on every mutation; idempotent replay |
| Deletion | decommission only (no hard delete); decommissioned never retrieved |
| Tenant isolation | RLS policy + SET LOCAL + SQL pushdown + pure gate (4 layers) |
| Retrieval ranking | deterministic keyword term match (terms > 3 chars, top 8); vector ranking = external (⚫) |
| Semantic retrieval boundary | provider declared inactive; UNAVAILABLE; activation requirements documented |

## 4. "Knowledge cannot bypass Noelia governance"

- The knowledge tool is the ONLY retrieval path in the HIVE runtime; it
  invokes the provider set, which is the only code that touches
  `knowledge_sources` for reads.
- No provider receives a DB handle or query builder beyond its governed
  service; scope, clearance, authority and window are applied before rows
  enter the working set.
- Retrieved content is DATA: excerpts travel in `metadata`, never in
  instruction channels; the runtime's headline/narrative are deterministic
  templates (tested against prompt injection — §5).

## 5. Adversarial coverage (12 tests)

| Attack | Result |
|--------|--------|
| Unauthorized retrieval (no `ai:noelia.query`) | tool denied → `deniedScopes`, zero sources |
| Stale knowledge (past review window) | excluded from retrieval |
| Malicious document (non-authoritative, imperative content) | never retrieved |
| **Prompt injection inside an authoritative document** | retrieved as data only; injection text does not enter headline/narrative/findings; answer never FACT |
| Cross-tenant retrieval | blocked at provider boundary (RLS + pushdown) |
| Source mismatch (citing a never-retrieved source) | `SOURCE_NOT_RETRIEVED` violation |
| Citation mismatch (missing provenance) | `SOURCE_MISSING_PROVENANCE` violation |
| Unavailable retrieval (vector-only set) | explicit `UNAVAILABLE`, zero sources, no silent empty |
| Availability contrast (keyword provider) | `OK` with governed sources |
| Policy × classification interaction (finding) | CONST-AI-001 r4 now conditional on the clearance bound (was firing unconditionally) — RESTRICTED principal: INFERENCE; HIGHLY_RESTRICTED principal: REQUIRES_HUMAN_REVIEW |

## 6. Findings & fixes this iteration

1. **Policy classification bound:** `BeyuNoeliaPolicyService` evaluated
   `ai:noelia.query` with an undefined classification, making CONST-AI-001's
   HIGHLY_RESTRICTED human-review rule fire unconditionally (fail-safe but
   semantically wrong — it flattened every answer to
   REQUIRES_HUMAN_REVIEW and destroyed the FACT/INFERENCE/UNCERTAINTY
   distinctions Iteration 10 built). Fixed: the evaluation now passes the
   principal's clearance as the data-classification bound (caller-provided
   classification still wins). Regression test added.
2. **Retrieval had no unavailable state:** a failing retrieval would have
   surfaced as "no sources". Now the provider boundary distinguishes OK /
   UNAVAILABLE and the tool surfaces the unavailable state explicitly.

## 7. Vector infrastructure — activation requirements (⚫ REQUIRES_INFRASTRUCTURE)

See `noelia-external-dependency-matrix.json` → `vector-retrieval-infra`.
Summary: external vector index (pgvector or external DB), a model-gateway
ratified embedding model with data-egress authorization, a pre-index
ingestion pipeline (chunk/classify/checksum), and vector-side scoping
(tenant/entity/country + classification pushed into the query). Until all
four exist, `governed-vector-v1` reports UNAVAILABLE.
