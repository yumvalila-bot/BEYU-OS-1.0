/**
 * ITERATION 12 — RAG / KNOWLEDGE / RETRIEVAL PROVIDER BOUNDARY
 *
 * Noelia retrieves knowledge ONLY through registered retrieval providers.
 * A provider is an authorization boundary, not a convenience: every
 * provider receives the requesting principal's scope and must apply scope,
 * classification, authority and freshness pushdown itself. Retrieved
 * content is DATA — it is never interpreted as instructions.
 *
 * Providers in this build:
 *   1. GovernedKeywordRetrievalProvider — the in-repo implementation over
 *      knowledge_sources (SQL pushdown + pure visibility gate). 🟢
 *   2. VectorRetrievalProvider — declared, NOT active. Vector/semantic
 *      retrieval requires external vector infrastructure (index, embedding
 *      model, ingestion pipeline). It is classified
 *      ⚫ REQUIRES_INFRASTRUCTURE and its retrieve() returns an explicit
 *      UNAVAILABLE state. It never fabricates semantic results.
 *
 * A retrieval is UNAVAILABLE (never a silent empty): callers must surface
 * the unavailable state instead of presenting "no results" as truth.
 */
import type { Principal } from "@/lib/authz";
import { retrieveGovernedMemory, type RetrievedMemory } from "./memory";
import type { NoeliaAuthorizedScope } from "./types";

export type RetrievalStatus = "OK" | "UNAVAILABLE";

export type RetrievalRequest = {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  question: string;
  asOf?: string;
  limit?: number;
};

export type RetrievalResult = {
  provider: string;
  status: RetrievalStatus;
  sources: RetrievedMemory[];
  /** Present when status is UNAVAILABLE; explains why, without leaking. */
  reason?: string;
  latencyMs?: number;
};

/** The retrieval contract every provider must satisfy. */
export interface KnowledgeRetrievalProvider {
  readonly id: string;
  readonly active: boolean;
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}

/**
 * The governed keyword provider: the only active retrieval implementation.
 * Scope/classification/authority/freshness are pushed into SQL; the pure
 * visibility gate re-checks every row. Content is returned as data excerpts.
 */
export class GovernedKeywordRetrievalProvider implements KnowledgeRetrievalProvider {
  readonly id = "governed-keyword-v1";
  readonly active = true;

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const started = Date.now();
    try {
      const sources = await retrieveGovernedMemory({
        principal: request.principal,
        scope: request.scope,
        question: request.question,
        asOf: request.asOf,
        limit: request.limit,
      });
      return {
        provider: this.id,
        status: "OK",
        sources,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      // Retrieval failure is UNAVAILABLE, never a fabricated empty corpus.
      return {
        provider: this.id,
        status: "UNAVAILABLE",
        sources: [],
        reason: error instanceof Error ? "retrieval failed; fail-closed" : "retrieval failed; fail-closed",
        latencyMs: Date.now() - started,
      };
    }
  }
}

/**
 * Vector/semantic retrieval adapter — declared, not active.
 *
 * Activation requirements (all external):
 *   - vector index infrastructure (e.g. pgvector or an external vector DB)
 *   - an approved embedding model registered through the model gateway
 *     (Iteration 17) with data-egress authorization
 *   - an ingestion pipeline that chunks, classifies and checksums documents
 *     BEFORE indexing (the governance controls of this module still apply)
 *   - tenant/entity/country + classification filtering pushed into the
 *     vector query (no post-hoc filtering of unauthorized content)
 *
 * Until then, retrieve() reports UNAVAILABLE. It must never return
 * fabricated or approximate semantic results.
 */
export class VectorRetrievalProvider implements KnowledgeRetrievalProvider {
  readonly id = "governed-vector-v1";
  readonly active = false;

  constructor(
    /** Infrastructure handle; null = not provisioned. */
    private readonly vectorIndex: unknown = null,
    /** Embedding model id, once ratified through the model gateway. */
    private readonly embeddingModelId: string | null = null,
  ) {}

  async retrieve(_request: RetrievalRequest): Promise<RetrievalResult> {
    if (!this.vectorIndex || !this.embeddingModelId) {
      return {
        provider: this.id,
        status: "UNAVAILABLE",
        sources: [],
        reason:
          "Vector retrieval requires external infrastructure (vector index + " +
          "ratified embedding model). Classified REQUIRES_INFRASTRUCTURE; " +
          "no semantic results are fabricated.",
      };
    }
    // An active vector provider must push scope/classification into the
    // vector query. A placeholder that fabricates results is a governance
    // violation, so the implementation is deliberately absent.
    throw new Error("VectorRetrievalProvider is declared but has no authorized implementation.");
  }
}

export type RagProviderSet = {
  providers: KnowledgeRetrievalProvider[];
  activeProviders: KnowledgeRetrievalProvider[];
  unavailableProviders: KnowledgeRetrievalProvider[];
};

/** The registered provider set for the current deployment. */
export function createRagProviders(
  options: { vectorIndex?: unknown; embeddingModelId?: string | null } = {},
): RagProviderSet {
  const providers: KnowledgeRetrievalProvider[] = [
    new GovernedKeywordRetrievalProvider(),
    new VectorRetrievalProvider(options.vectorIndex ?? null, options.embeddingModelId ?? null),
  ];
  return {
    providers,
    activeProviders: providers.filter((p) => p.active),
    unavailableProviders: providers.filter((p) => !p.active),
  };
}

export type CitationCheck = {
  ok: boolean;
  violations: Array<{
    code: "SOURCE_NOT_RETRIEVED" | "SOURCE_MISSING_PROVENANCE" | "CITATION_EMPTY";
    source: string;
  }>;
};

/**
 * Citation integrity: every source an answer presents must be one that was
 * actually retrieved, and must carry provenance. A fabricated or mismatched
 * citation is a violation, not a warning.
 */
export function verifyCitations(
  presented: Array<{ kind: string; ref: string; authority: string }>,
  retrieved: Array<{ kind: string; ref: string }>,
): CitationCheck {
  const retrievedKeys = new Set(retrieved.map((s) => `${s.kind}:${s.ref}`));
  const violations: CitationCheck["violations"] = [];
  for (const source of presented) {
    const key = `${source.kind}:${source.ref}`;
    if (!retrievedKeys.has(key)) {
      violations.push({ code: "SOURCE_NOT_RETRIEVED", source: key });
    }
    if (!source.ref || !source.authority) {
      violations.push({ code: "SOURCE_MISSING_PROVENANCE", source: key || "(empty)" });
    }
  }
  if (presented.length === 0 && retrieved.length > 0) {
    // Citing nothing while sources were retrieved is allowed (the answer may
    // rely on findings only); citing nothing while nothing was retrieved is
    // checked at the epistemic layer (absence of evidence).
  }
  return { ok: violations.length === 0, violations };
}

/**
 * Fails closed: all providers unavailable ⇒ an explicit UNAVAILABLE result.
 * Never merges into a silent empty corpus.
 */
export async function retrieveThroughProviders(
  set: RagProviderSet,
  request: RetrievalRequest,
): Promise<{ status: RetrievalStatus; sources: RetrievedMemory[]; results: RetrievalResult[] }> {
  const results: RetrievalResult[] = [];
  const merged = new Map<string, RetrievedMemory>();
  for (const provider of set.providers) {
    const result = await provider.retrieve(request);
    results.push(result);
    if (result.status === "OK") {
      for (const source of result.sources) {
        merged.set(`${source.source.kind}:${source.source.ref}`, source);
      }
    }
  }
  const anyAvailable = results.some((r) => r.status === "OK");
  return {
    status: anyAvailable ? "OK" : "UNAVAILABLE",
    sources: [...merged.values()],
    results,
  };
}
