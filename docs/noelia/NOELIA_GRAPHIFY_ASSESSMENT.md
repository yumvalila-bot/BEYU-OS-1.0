# Graphify — Independent Verification and Integration Decision

**Decision: DO NOT INTEGRATE (as an institutional knowledge source).**
**Status: VERIFIED, then REJECTED for the institutional graph. A narrow future use is identified and left unexecuted.**
**Verification date: 2026-11-24.**

---

## 1. Why this document exists

The NOELIA continuation brief asked for "Graphify" to be investigated and, where
appropriate, integrated into the existing BEYU Knowledge Graph and World Model. It also
required the project to be identified precisely before anything was installed:

> "Investigate the exact Graphify project, repository, package or implementation intended
> by the video before integrating it. Do not assume that a project with a similar name is
> the same tool."

That instruction is the reason this document starts with identity verification rather than
with an integration plan.

---

## 2. What Graphify actually is

Verified from the project's own publication and independent reviews:

| Property | Finding |
|---|---|
| Project | Graphify, from Graphify Labs (participant in YC Summer 2026) |
| Repository | `github.com/Graphify-Labs/graphify` |
| Distribution | PyPI package `graphifyy` (note: two `y`s — a different package name from the project name) |
| Install (per its docs) | `uv tool install graphifyy`, then `graphify install` |
| Licence | Apache 2.0 |
| Nature | A **skill for AI coding assistants**, not a library, service or database |
| Core mechanism | `tree-sitter` AST parsing across ~36–40 languages, executed **locally**, zero LLM calls for the structural pass |
| Outputs | `graph.html` (D3 visualisation), `GRAPH_REPORT.md`, `graph.json` |
| Graph semantics | Nodes = functions/classes/modules/files; edges = imports, calls, inheritance, containment |
| Edge confidence | Tagged `EXTRACTED` (present in the AST), `INFERRED` (model-deduced), `AMBIGUOUS` |
| Clustering | Leiden community detection over the code graph |
| Hosted option | `app.graphify.com` — **paid/hosted**, therefore out of scope under the zero-cost constitution |
| Optional cost | Its "Pass 3" semantic layer uses LLM subagents; that pass costs API tokens. The structural passes do not. |

### What it is *not*

Graphify is **not** an institutional knowledge graph, an entity-relationship store, a
document store, a memory system, or a graph database. It answers one question well:

> "What is the structure of this source-code repository?"

It does not model trusts, holdings, tenants, legal entities, policies, decisions, risks,
documents or their provenance. Those are the entities the BEYU institutional graph holds.

---

## 3. Why it is not integrated into the institutional Knowledge Graph

The brief's integration principle was explicit:

> "Graphify must extend the existing BEYU Knowledge Graph and World Model. It must not
> create a second institutional knowledge graph, a duplicate graph database, a duplicate
> entity registry."

Graphify cannot satisfy that, for four independent reasons. Any one of them would be
sufficient.

### 3.1 The domain is disjoint

| BEYU institutional graph (`noelia_kg_edges`) | Graphify graph (`graph.json`) |
|---|---|
| Tenants, legal entities, countries | Files, modules, packages |
| Policies, decisions, risks, objectives | Functions, classes, methods |
| Assets, projects, documents | Imports, calls, inheritance |
| Closed vocabulary `KG_RELATIONS` (13 relations) | Open code-symbol vocabulary |

There is no key by which a Graphify node (`auth_controller.py`) joins to an institutional
node (`BEYU-HEALTH`, `LEGAL_ENTITY`, `SHARED_FOUNDATION_OPERATIONS`). Merging them would
not extend the institutional graph; it would put two unrelated node types in one table and
call the result a "unified graph". That is the duplicate-registry outcome the brief
prohibits.

### 3.2 Its confidence model is stronger than ours at the edge level, which would force a migration

Graphify tags every edge `EXTRACTED` / `INFERRED` / `AMBIGUOUS`. BEYU's edges carry
`confidence` (numeric, 0–1) and a required `provenance`, but no equivalent "how was this
established" classification. Adopting Graphify's model would mean extending
`noelia_kg_edges` and backfilling a classification for every existing edge — a schema and
evidence change to the *institutional* graph undertaken to accommodate a *codebase* tool.
That is the tail wagging the dog.

### 3.3 The paid surface makes it a zero-cost liability

The hosted product at `app.graphify.com` is a commercial offering, and the semantic pass
consumes LLM tokens. Under the zero-cost constitution, a tool whose documented workflow
includes a billable path is a standing risk: one `graphify` invocation in a networked
environment with an API key present would incur a charge. The structural passes are free
and local, but the tool as shipped does not enforce that boundary for us.

### 3.4 It would be a dependency introduced for a documentation benefit

The only thing Graphify would give BEYU *today* is a better architecture map for
contributors and coding agents. That is genuinely useful and it is not worth a new
third-party Python toolchain (`uv`, tree-sitter grammar wheels) inside a
Next.js/TypeScript repository whose CI does not run Python.

---

## 4. What BEYU already has in this space

The capability Graphify offers is not missing; it is present in a form that fits the
repository.

| Need | BEYU's existing answer |
|---|---|
| Navigate the repository by structure | `AGENTS.md` (added in this workstream) documents the layering, canonical rules and where things live, in the form every agent reads first |
| Institutional entity graph | `noelia_kg_edges` + `knowledge-graph.ts` (bounded traversal, tenant-scoped, provenance-bearing) |
| Code dependency questions | `tsc` itself, plus the repository's own module boundaries |
| Confidence-tagged relationships | Already present as `confidence` + `provenance` on every institutional edge |

A structural code map is a **documentation** artifact. It belongs in `AGENTS.md` and in the
`docs/` tree, maintained by people and reviewed in pull requests, not generated by a tool
that then needs its own upgrade path.

---

## 5. The narrow use that was identified and deliberately not executed

Graphify *would* be a reasonable fit for one thing: generating an architecture map of this
repository as a **development-time, out-of-repository** artifact — run by a contributor on
their own machine, output committed to `docs/`, tool not added to `package.json`, not run
in CI, not reachable from NOELIA.

That was left unexecuted because:

1. It cannot be run in this environment: the sandbox has no `uv`/Python toolchain for it,
   and installing one to produce a documentation artifact would be a new dependency with no
   runtime benefit.
2. The brief's fallback is explicit — *"If Graphify cannot be verified as free, compatible
   and safe, do not integrate it. Use the existing Knowledge Graph implementation. Document
   the decision."*
3. The value is speculative until a contributor actually wants it.

If a contributor does want it, the correct form is recorded here so nobody has to
re-litigate it:

```
# Contributor machine only. Never in CI, never a runtime dependency.
uv tool install graphifyy
cd /path/to/BEYU-OS-1.0
graphify .                      # produces graphify-out/{graph.html,GRAPH_REPORT.md,graph.json}
# Commit ONLY GRAPH_REPORT.md (or a link to it) under docs/architecture/.
# graph.json and graph.html are build artifacts: do not commit them.
```

Constraints that would still apply if anyone does this: no hosted endpoint, no API key in
the environment, structural passes only, and the output is documentation — never an input
to NOELIA.

---

## 6. What was actually built instead

The retrieval and knowledge work in this workstream closes the same underlying need —
"find the right material without reading everything" — inside the institutional domain,
using only PostgreSQL:

- `src/lib/noelia/embeddings.ts` — deterministic local lexical embedding (no model download,
  no network, `LOCAL_FREE`).
- `src/lib/noelia/knowledge-retrieval.ts` — hybrid lexical + fuzzy (`pg_trgm`) + vector
  retrieval over the authorized corpus, with per-channel scoring reported.
- `src/lib/noelia/knowledge-indexer.ts` — chunk-level indexing with digest-based staleness.
- Migration `0086` — `noelia_knowledge_embeddings`, FORCE RLS, tenant-scoped, plus the
  `pg_trgm` extension and trigram index.

That is `pg_trgm` + `tsvector` + an exact cosine scan: standard PostgreSQL contrib, zero
cost, zero new dependencies, no new service.

---

## 7. Verdict

| Question from the brief | Answer |
|---|---|
| Exact project identified? | Yes — Graphify Labs, `Graphify-Labs/graphify`, Apache 2.0 |
| Genuinely free? | The local structural passes: **yes**. The hosted product and the semantic pass: **no** (billable). |
| Can it run locally? | Yes, with Python/`uv` — not present in this environment. |
| Compatible with the existing graph? | **No** — disjoint node domain, incompatible edge semantics. |
| Integrated? | **No**, and deliberately not. |
| Existing Knowledge Graph preserved? | Yes — untouched. |
| Decision documented? | This document. |

**Rejection is the honest outcome here, not a failure to deliver.** Installing a codebase
mapping tool into an institutional knowledge graph would have produced a duplicate registry
with an unrelated node vocabulary — the exact failure mode the brief rules out.
