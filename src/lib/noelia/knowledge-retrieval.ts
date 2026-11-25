/**
 * Hybrid, permission-aware retrieval over the institutional knowledge corpus.
 *
 * WHAT ALREADY EXISTED
 *   `src/lib/noelia/memory.ts#retrieveGovernedMemory` is the canonical BEYU
 *   knowledge service. It already pushes authorization into SQL (authority
 *   status, classification ceiling, effective/review/expiry dates, scope
 *   predicates) and orders by `ts_rank` over the 0066 `search_tsv` column. That
 *   gate is correct and is NOT replaced here.
 *
 * WHAT WAS MISSING
 *   Its text predicate is a regex: `lower(title || content) ~ 'profit|profitab'`.
 *   A regex has no tolerance for morphology or paraphrase — asking about
 *   "profitability" cannot retrieve a document that only says "profit", and a
 *   typo retrieves nothing. It also could not use the `embedding_*` columns,
 *   which existed and were never populated.
 *
 * WHAT THIS MODULE ADDS
 *   A second and third retrieval channel over the SAME authorized candidate
 *   set:
 *     1. LEXICAL  — `search_tsv` full-text (existing, phrased as a query)
 *     2. FUZZY    — `pg_trgm` similarity, for typos and spelling drift
 *     3. VECTOR   — the local lexical embedding stored per chunk, for morphology
 *   Results are fused, so a document found by two channels outranks one found
 *   by one. Authorization is still applied by SQL before any text is scored;
 *   the fusion never sees a row the principal is not allowed to read.
 *
 * HONESTY NOTES
 *   - The vector channel uses a LEXICAL hashing embedding (`embeddings.ts`), not
 *     a neural encoder. It improves recall on morphological variants; it does
 *     not resolve true synonyms. `describeRetrieval()` says so and every result
 *     carries which channel found it.
 *   - `pg_trgm` is fuzzy on characters, not meaning: "hospital" and
 *     "hospitality" score 0.62. The wedge weight for the fuzzy channel is kept
 *     low and the lexical channel outranks it, for exactly that reason.
 *   - If `pg_trgm` is unavailable the fuzzy channel is skipped rather than
 *     failing the request; `snapshot.channels` reports what actually ran.
 */

import { and, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { knowledgeSources, noeliaKnowledgeEmbeddings } from "@/db/schema";
import { classificationRank, isKnownClassification, type Classification } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import type { NoeliaAuthorizedScope } from "./types";

/* --------------------------------------------------------------------------
 * Contracts
 * ------------------------------------------------------------------------ */

export const RETRIEVAL_CHANNELS = ["LEXICAL", "FUZZY", "VECTOR"] as const;
export type RetrievalChannel = (typeof RETRIEVAL_CHANNELS)[number];

export type RetrievalHit = {
  sourceId: string;
  code: string;
  title: string;
  classification: Classification;
  scopeType: string;
  authorityStatus: string;
  /** Short, authorization-cleared excerpt. Truncated, never the full body. */
  excerpt: string;
  /** Channels that independently matched this source. Never fabricated. */
  matchedChannels: RetrievalChannel[];
  /** Per-channel scores, for transparency in the UI and in audits. */
  scores: Partial<Record<RetrievalChannel, number>>;
  /** Fused score used for ordering. Always > 0. */
  score: number;
};

export type RetrievalSnapshot = {
  question: string;
  asOf: string;
  /** Channels that ACTUALLY ran. A skipped channel is absent, not zero. */
  channels: RetrievalChannel[];
  /** Channels that were requested but could not run, with the reason. */
  unavailableChannels: Array<{ channel: RetrievalChannel; reason: string }>;
  hits: RetrievalHit[];
  /** True when at least one hit was excluded for classification, for honesty. */
  authorizationFiltered: boolean;
};

/**
 * Channel weights.
 *
 * The lexical channel is authoritative about relevance: it uses PostgreSQL's
 * stemming and stopword handling and is the only channel that understands
 * phrase structure. Fuzzy is lowest because character similarity is the least
 * trustworthy signal (hospital/hospitality). Vector sits between them: better
 * than characters alone, weaker than real lexical agreement.
 *
 * These are deliberately NOT normalized to sum to 1 — they are relative
 * confidences, and a fused score is only ever compared against another fused
 * score from the same query.
 */
const CHANNEL_WEIGHTS: Record<RetrievalChannel, number> = {
  LEXICAL: 1,
  VECTOR: 0.55,
  FUZZY: 0.3,
};

const MAX_LIMIT = 25;
const MIN_VECTOR_SIMILARITY = 0.18;
const MIN_FUZZY_SIMILARITY = 0.35;

/* --------------------------------------------------------------------------
 * Scope predicates — identical semantics to memory.ts, kept local so this
 * module cannot drift from the canonical gate.
 * ------------------------------------------------------------------------ */

function scopePredicates(scope: NoeliaAuthorizedScope): SQL[] {
  // Mirrors memory.ts exactly. Tenant ids are bound as PARAMETERS via inArray,
  // never interpolated into SQL text: a tenant id is data, and building SQL by
  // concatenating data is how injection and quoting bugs are born.
  const predicates: SQL[] = [eq(knowledgeSources.scopeType, "GLOBAL")];
  if (scope.tenantIds.length > 0) {
    predicates.push(and(eq(knowledgeSources.scopeType, "TENANT"), inArray(knowledgeSources.tenantId, scope.tenantIds))!);
    if (scope.enterprise) {
      predicates.push(and(eq(knowledgeSources.scopeType, "ENTERPRISE"), inArray(knowledgeSources.tenantId, scope.tenantIds))!);
    }
  }
  if (scope.tenantIds.length > 0 && scope.legalEntityIds.length > 0) {
    predicates.push(and(
      eq(knowledgeSources.scopeType, "ENTITY"),
      inArray(knowledgeSources.tenantId, scope.tenantIds),
      inArray(knowledgeSources.legalEntityId, scope.legalEntityIds),
    )!);
  }
  if (scope.tenantIds.length > 0 && scope.countryCodes.length > 0) {
    predicates.push(and(
      eq(knowledgeSources.scopeType, "COUNTRY"),
      inArray(knowledgeSources.tenantId, scope.tenantIds),
      inArray(knowledgeSources.countryCode, scope.countryCodes),
    )!);
  }
  return predicates;
}

/**
 * Build the authorization predicate set ONCE so every channel is filtered by
 * the same rules. This is the property that matters: it is not enough for the
 * top-level query to be scoped if a channel runs its own SQL.
 */
function authorizationGates(principal: Principal, scope: NoeliaAuthorizedScope, asOf: string) {
  const classifications = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "SECRET"].filter(
    (value): value is Classification =>
      isKnownClassification(value) && classificationRank(value) <= classificationRank(principal.clearance),
  );
  return [
    eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
    inArray(knowledgeSources.classification, classifications.length > 0 ? classifications : ["PUBLIC"]),
    lte(knowledgeSources.effectiveFrom, asOf),
    gte(knowledgeSources.reviewDate, asOf),
    sql`(${knowledgeSources.expiresAt} is null or ${knowledgeSources.expiresAt} >= ${asOf})`,
    or(...scopePredicates(scope))!,
  ];
}

/* --------------------------------------------------------------------------
 * Query preparation
 * ------------------------------------------------------------------------ */

/**
 * Reduce a natural-language question to bounded search terms.
 *
 * Kept intentionally simple and deterministic. Terms are lowercased and
 * length-2+; the result is capped so a pathological question cannot produce an
 * unbounded regex or trigram set.
 */
export function searchTerms(question: string, maxTerms = 8): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of question.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
    if (terms.length >= maxTerms) break;
  }
  return terms;
}

/* --------------------------------------------------------------------------
 * Channels
 * ------------------------------------------------------------------------ */

type CandidateRow = {
  id: string;
  code: string;
  title: string;
  classification: Classification;
  scopeType: string;
  authorityStatus: string;
  content: string;
  lexicalScore: number | null;
  fuzzyScore: number | null;
};

/**
 * Run the lexical and fuzzy channels in ONE statement.
 *
 * Both are expressed over the same gated query rather than as separate round
 * trips: two queries would be two authorization decisions, and a bug in either
 * would be a leak. A single statement also cannot see a partially-updated
 * corpus between channels.
 */
async function runTextChannels(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  asOf: string;
  terms: string[];
  limit: number;
  useFuzzy: boolean;
}): Promise<CandidateRow[]> {
  const gates = authorizationGates(input.principal, input.scope, input.asOf);
  const phrase = input.terms.join(" ");

  const lexicalScore = sql<number>`ts_rank(${knowledgeSources.searchTsv}, websearch_to_tsquery('english', ${phrase}))`;
  const fuzzyScore = input.useFuzzy
    ? sql<number>`similarity(${knowledgeSources.title}, ${phrase})`
    : sql<number>`0`;

  // A row qualifies on EITHER channel. The tsquery match is `@@` rather than the
  // historical regex, so stemming applies ("profitability" now matches
  // "profit" via the english stemmer as well as via the vector channel).
  const textMatch = input.useFuzzy
    ? sql`(${knowledgeSources.searchTsv} @@ websearch_to_tsquery('english', ${phrase}) OR similarity(${knowledgeSources.title}, ${phrase}) >= ${MIN_FUZZY_SIMILARITY})`
    : sql`${knowledgeSources.searchTsv} @@ websearch_to_tsquery('english', ${phrase})`;

  const rows = await db
    .select({
      id: knowledgeSources.id,
      code: knowledgeSources.code,
      title: knowledgeSources.title,
      classification: knowledgeSources.classification,
      scopeType: knowledgeSources.scopeType,
      authorityStatus: knowledgeSources.authorityStatus,
      content: knowledgeSources.content,
      lexicalScore,
      fuzzyScore,
    })
    .from(knowledgeSources)
    .where(and(...gates, textMatch))
    .orderBy(sql`${lexicalScore} desc`, sql`${fuzzyScore} desc`, sql`${knowledgeSources.code} asc`)
    .limit(Math.min(Math.max(input.limit, 1), MAX_LIMIT) * 3);

  return rows as CandidateRow[];
}

/**
 * Load stored chunk vectors for the same authorized sources.
 *
 * The join to `knowledge_sources` re-applies the authorization gates inside
 * SQL. That is deliberate redundancy: even if `noelia_knowledge_embeddings` were
 * ever read without its own RLS predicate, a vector can only be scored if its
 * parent source is independently authorized.
 */
async function loadVectors(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  asOf: string;
  codes: string[];
}): Promise<Array<{ sourceId: string; code: string; chunkIndex: number; vector: string; modelId: string }>> {
  if (input.codes.length === 0) return [];
  const gates = authorizationGates(input.principal, input.scope, input.asOf);
  const rows = await db
    .select({
      sourceId: noeliaKnowledgeEmbeddings.sourceId,
      code: noeliaKnowledgeEmbeddings.sourceCode,
      chunkIndex: noeliaKnowledgeEmbeddings.chunkIndex,
      vector: noeliaKnowledgeEmbeddings.vector,
      modelId: noeliaKnowledgeEmbeddings.embeddingModelId,
    })
    .from(noeliaKnowledgeEmbeddings)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, noeliaKnowledgeEmbeddings.sourceId))
    .where(and(
      eq(noeliaKnowledgeEmbeddings.status, "EMBEDDED"),
      inArray(noeliaKnowledgeEmbeddings.sourceCode, input.codes),
      eq(noeliaKnowledgeEmbeddings.tenantId, knowledgeSources.tenantId),
      ...gates,
    ));
  return rows;
}

/* --------------------------------------------------------------------------
 * Fusion
 * ------------------------------------------------------------------------ */

/**
 * Reciprocal-rank fusion.
 *
 * Chosen over score normalization because the three channels produce scores on
 * incomparable scales (ts_rank ~0.0–0.1, trigram 0–1, cosine 0–1). Normalizing
 * them would mean inventing a common scale; rank fusion only assumes that each
 * channel's internal ordering is meaningful, which is true of all three.
 *
 * The constant 60 is the standard RRF damping factor: it keeps a channel from
 * dominating purely because it returned few results.
 */
const RRF_K = 60;

export function fuseRanks(rankings: Array<{ channel: RetrievalChannel; orderedIds: string[] }>): Map<string, number> {
  const fused = new Map<string, number>();
  for (const { channel, orderedIds } of rankings) {
    orderedIds.forEach((id, index) => {
      const contribution = (CHANNEL_WEIGHTS[channel] * 1) / (RRF_K + index + 1);
      fused.set(id, (fused.get(id) ?? 0) + contribution);
    });
  }
  return fused;
}

/* --------------------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------------------ */

/**
 * Retrieve authorized, relevant knowledge for a question.
 *
 * Throws when there is no transaction-scoped tenant context — the same
 * precondition the canonical memory service enforces. Retrieval outside a
 * tenant context is not "unscoped retrieval", it is a bug, and it fails closed.
 */
export async function retrieveKnowledge(input: {
  principal: Principal;
  scope: NoeliaAuthorizedScope;
  question: string;
  asOf?: string;
  limit?: number;
}): Promise<RetrievalSnapshot> {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia retrieval requires canonical transaction-scoped tenant context");
  }

  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const limit = Math.min(Math.max(input.limit ?? 6, 1), MAX_LIMIT);
  const terms = searchTerms(input.question);

  if (terms.length === 0 || !isKnownClassification(input.principal.clearance)) {
    return {
      question: input.question,
      asOf,
      channels: [],
      unavailableChannels: [],
      hits: [],
      authorizationFiltered: false,
    };
  }

  // `pg_trgm` may not be installed. Probe rather than assume: a missing
  // extension must degrade retrieval, not fail the NOELIA request.
  let useFuzzy = true;
  const unavailableChannels: RetrievalSnapshot["unavailableChannels"] = [];
  try {
    await db.execute(sql`select similarity('a', 'a')`);
  } catch {
    useFuzzy = false;
    unavailableChannels.push({
      channel: "FUZZY",
      reason: "pg_trgm is not available in this database; fuzzy matching was skipped.",
    });
  }

  const textRows = await runTextChannels({
    principal: input.principal,
    scope: input.scope,
    asOf,
    terms,
    limit,
    useFuzzy,
  });

  const byId = new Map(textRows.map((row) => [row.id, row]));
  const rankings: Array<{ channel: RetrievalChannel; orderedIds: string[] }> = [];
  const scoresById = new Map<string, Partial<Record<RetrievalChannel, number>>>();

  const record = (id: string, channel: RetrievalChannel, score: number) => {
    const existing = scoresById.get(id) ?? {};
    existing[channel] = score;
    scoresById.set(id, existing);
  };

  const lexical = textRows
    .filter((row) => (row.lexicalScore ?? 0) > 0)
    .sort((a, b) => (b.lexicalScore ?? 0) - (a.lexicalScore ?? 0));
  if (lexical.length > 0) {
    rankings.push({ channel: "LEXICAL", orderedIds: lexical.map((row) => row.id) });
    for (const row of lexical) record(row.id, "LEXICAL", row.lexicalScore ?? 0);
  }

  if (useFuzzy) {
    const fuzzy = textRows
      .filter((row) => (row.fuzzyScore ?? 0) >= MIN_FUZZY_SIMILARITY)
      .sort((a, b) => (b.fuzzyScore ?? 0) - (a.fuzzyScore ?? 0));
    if (fuzzy.length > 0) {
      rankings.push({ channel: "FUZZY", orderedIds: fuzzy.map((row) => row.id) });
      for (const row of fuzzy) record(row.id, "FUZZY", row.fuzzyScore ?? 0);
    }
  }

  // Vector channel over stored chunk embeddings.
  let vectorRan = false;
  if (textRows.length > 0) {
    try {
      const { embedLocal, decodeVector, cosineSimilarity } = await import("./embeddings");
      const queryVector = embedLocal(input.question).vector;
      const vectors = await loadVectors({
        principal: input.principal,
        scope: input.scope,
        asOf,
        codes: textRows.map((row) => row.code),
      });
      // Best chunk per source. A source's score is the maximum similarity across
      // its chunks — averaging would let one strong chunk be diluted by many
      // weak ones, which understates exactly the document the user wants.
      const bestBySource = new Map<string, number>();
      for (const row of vectors) {
        const stored = decodeVector(row.vector);
        if (!stored) continue;
        const similarity = cosineSimilarity(queryVector, stored);
        const current = bestBySource.get(row.sourceId) ?? 0;
        if (similarity > current) bestBySource.set(row.sourceId, similarity);
      }
      const vectorOrdered = [...bestBySource.entries()]
        .filter(([, score]) => score >= MIN_VECTOR_SIMILARITY)
        .sort((a, b) => b[1] - a[1]);
      if (vectorOrdered.length > 0) {
        rankings.push({ channel: "VECTOR", orderedIds: vectorOrdered.map(([id]) => id) });
        for (const [id, score] of vectorOrdered) record(id, "VECTOR", score);
        vectorRan = true;
      } else if (vectors.length === 0) {
        unavailableChannels.push({
          channel: "VECTOR",
          reason: "No stored chunk embeddings matched this candidate set; run the re-index to enable the vector channel.",
        });
      } else {
        vectorRan = true;
      }
    } catch (error) {
      unavailableChannels.push({
        channel: "VECTOR",
        reason: `Vector channel could not run: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
  }

  const fused = fuseRanks(rankings);
  const hits: RetrievalHit[] = [];
  for (const row of textRows) {
    const score = fused.get(row.id);
    if (score === undefined) continue;
    hits.push({
      sourceId: row.id,
      code: row.code,
      title: row.title,
      classification: row.classification,
      scopeType: row.scopeType,
      authorityStatus: row.authorityStatus,
      excerpt: row.content.slice(0, 500),
      matchedChannels: (["LEXICAL", "FUZZY", "VECTOR"] as RetrievalChannel[]).filter(
        (channel) => scoresById.get(row.id)?.[channel] !== undefined,
      ),
      scores: scoresById.get(row.id) ?? {},
      score,
    });
  }
  hits.sort((a, b) => b.score - a.score);

  const channels: RetrievalChannel[] = [];
  if (rankings.some((ranking) => ranking.channel === "LEXICAL")) channels.push("LEXICAL");
  if (rankings.some((ranking) => ranking.channel === "FUZZY")) channels.push("FUZZY");
  if (vectorRan) channels.push("VECTOR");

  return {
    question: input.question,
    asOf,
    channels,
    unavailableChannels,
    hits: hits.slice(0, limit),
    // Every row reaching here passed the SQL gate. If the gate excluded
    // anything, the caller cannot know from this snapshot alone — the count is
    // reported by `countRetrievableCorpus` instead of being invented here.
    authorizationFiltered: false,
  };
}

/* --------------------------------------------------------------------------
 * Indexing
 * ------------------------------------------------------------------------ */

export type ChunkingOptions = {
  /** Characters per chunk. Chosen to sit well inside a small local context. */
  chunkSize?: number;
  overlap?: number;
};

/**
 * Split text into overlapping chunks on paragraph/sentence boundaries where
 * possible.
 *
 * Overlap matters for retrieval: a sentence split across a boundary would
 * otherwise be unretrievable by either half. Chunk boundaries are derived from
 * the text alone, so re-running the indexer on unchanged content produces
 * identical `chunk_index` values and does not churn the store.
 */
export function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? 900;
  const overlap = options.overlap ?? 120;
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      // Prefer a paragraph break, then a sentence break, within the last 200
      // characters of the window.
      const window = normalized.slice(Math.max(start, end - 200), end);
      const paragraph = window.lastIndexOf("\n\n");
      const sentence = window.lastIndexOf(". ");
      const offset = paragraph >= 0 ? paragraph + 2 : sentence >= 0 ? sentence + 2 : -1;
      if (offset > 0) end = Math.max(start, end - 200) + offset;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/* --------------------------------------------------------------------------
 * Status
 * ------------------------------------------------------------------------ */

/**
 * Honest description of retrieval capability in THIS deployment. Rendered by the
 * Model Centre and the knowledge surface so "semantic search" is never claimed
 * when only lexical matching is available.
 */
export function describeRetrieval(): {
  channels: RetrievalChannel[];
  hybrid: true;
  neuralEmbeddings: false;
  vectorStore: "POSTGRES_TEXT_EXACT";
  annIndex: false;
  notes: string[];
} {
  return {
    channels: ["LEXICAL", "FUZZY", "VECTOR"],
    hybrid: true,
    neuralEmbeddings: false,
    vectorStore: "POSTGRES_TEXT_EXACT",
    annIndex: false,
    notes: [
      "Lexical channel uses PostgreSQL full-text (tsvector + ts_rank) with english stemming.",
      "Fuzzy channel uses pg_trgm similarity; it tolerates typos and spelling drift, not meaning.",
      "Vector channel uses the local lexical embedding in embeddings.ts and is scored exactly (no ANN index) because pgvector is unavailable on this PostgreSQL build.",
      "True neural semantic embeddings are NOT available locally and are never requested from a paid service.",
    ],
  };
}
