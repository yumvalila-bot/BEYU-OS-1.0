# NOELIA — Knowledge / RAG Architecture

**Status:** IMPLEMENTED (governed retrieval) + BLOCKED (semantic/embedding runtime)
**Evidence:** `tests/noelia/memory-security.test.ts`, `knowledge.rag.search` tool,
`knowledge.ingest` tool, HTTP smoke.

## Retrieval pipeline (implemented)

```
knowledge.rag.search (ai:noelia.query)
  → retrieveGovernedMemory (existing Phase 15 gate)
  + knowledge_sources rows
  → classification pushdown (clearance ceiling)
  → tenant/entity/country scope predicates
  → authority + effective/review/expiry window filter
  → supersession handling (SUPERSEDED excluded from current)
  → citation provenance (kind:ref per source)
```

- Retrieved content is **DATA, never SYSTEM AUTHORITY**. No prompt injection
  from retrieved content can override BEYU policy: there is no code path from
  content to policy/registry/authorization state.
- Unauthorized sources are never revealed to exist (queries are scoped
  server-side; empty result is UNAVAILABLE, not a leak).

## Knowledge ingestion (implemented, governed)

`knowledge.ingest` — HIGH risk, `ai:knowledge.ingest`, CGO approver,
DOMAIN_WRITE side effect, strict Zod input contract. Every source carries:
code, title, domain, content, sourceUri, jurisdiction, scopeType, classification,
authorityStatus (AUTHORITATIVE/UNDER_REVIEW/SUPERSEDED/DRAFT/EXPIRED/REJECTED),
effectiveFrom, reviewDate, expiresAt, supersedesCode, provenance, keywords.
Ingesting a superseding source marks the old one SUPERSEDED (never deleted);
the write is atomic with audit (`ai.noelia.knowledge.ingest`) and event
(`NOELIA_KNOWLEDGE_INGESTED`).

## Authority ranking / freshness / jurisdiction hierarchy (designed)

Provider-independent interfaces are defined (authorityStatus + effective
windows + supersession + jurisdiction fields); **embeddings, vector retrieval
and reranking are BLOCKED**: no vector infrastructure exists in the runtime,
and fabricating it "for appearance" is explicitly prohibited. When a governed
vector provider is ratified, the adapter can be added without schema change
(knowledge_sources already carries the governance envelope).

## Legal/tax retrieval discipline

`legal.knowledge` / `legal.authorityStatus`:
- FACT only when AUTHORITATIVE + effective ≤ today + review ≥ today +
  expiry ≥ today.
- Unknown citation → `REQUIRES_AUTHORITY` (fail closed).
- Jurisdiction always explicit; Noelia never presents itself as lawyer, tax
  authority, court or regulator; advice remains with counsel.
