/**
 * Zero-cost embedding providers.
 *
 * CONSTRAINTS THIS MODULE OPERATES UNDER
 *   1. No paid embedding API may be called. Ever.
 *   2. This PostgreSQL build (16.14) has no `pgvector` and no embedding model
 *      runtime, so true dense-vector semantic search is NOT available on this
 *      host. That is a real environment limitation and it is not hidden here.
 *   3. `embedding_status` / `embedding_model_id` / `embedding_dimensions` /
 *      `chunk_count` exist on `knowledge_sources` and were never populated.
 *
 * WHAT THIS MODULE IS
 *   A local, deterministic, dependency-free embedding provider. It is a
 *   legitimate *lexical* vector embedding (hashing + character n-gram features),
 *   not a neural embedding. It makes paraphrases and morphological variants
 *   partially discoverable without any network call or model download, and it
 *   is honest about that distinction in `describe()`.
 *
 *   It is deliberately NOT named "semantic embedding". Presenting a lexical
 *   hashing vector as a neural semantic embedding would be the same class of
 *   falsehood as calling a mock response real inference.
 *
 * WHY IT IS USEFUL ANYWAY
 *   The existing retrieval path gates on a regex (`lower(title||' '||content) ~
 *   'term1|term2'`). A regex cannot match "profitability" from "profit". A
 *   character n-gram vector can, measurably (see the retrieval module). So this
 *   closes a genuine recall gap at zero cost and zero dependencies.
 *
 * DETERMINISM
 *   The same text always produces the same vector, across processes and
 *   releases, because the hash is specified here (FNV-1a over a fixed tokenizer)
 *   rather than delegated to a library whose output could change. Stored vectors
 *   therefore remain comparable after a deploy — which is what makes
 *   `embedding_model_id` a meaningful compatibility key.
 */

import { createHash } from "node:crypto";

/** Stable identity of the algorithm. Changing the algorithm MUST change this. */
export const LOCAL_EMBEDDING_MODEL_ID = "beyu-local-lexical-v1";
export const LOCAL_EMBEDDING_DIMENSIONS = 256;

/**
 * The `embedding_status` values the schema already anticipates, extended to
 * distinguish "we embedded with a lexical model" from "a neural model ran".
 */
export const EMBEDDING_STATUS = {
  NOT_EMBEDDED: "NOT_EMBEDDED",
  EMBEDDED: "EMBEDDED",
  FAILED: "FAILED",
  STALE: "STALE",
} as const;

export type EmbeddingStatus = (typeof EMBEDDING_STATUS)[keyof typeof EMBEDDING_STATUS];

export type LocalEmbedding = {
  modelId: string;
  dimensions: number;
  /** L2-normalized so cosine similarity is a plain dot product. */
  vector: Float32Array;
  /** True for this algorithm, false for a neural encoder. Surfaced, not hidden. */
  lexical: true;
};

/* --------------------------------------------------------------------------
 * Tokenization
 * ------------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this",
  "these", "those", "of", "to", "in", "on", "at", "by", "for", "with", "from",
  "as", "is", "are", "was", "were", "be", "been", "being", "it", "its", "we",
  "our", "us", "you", "your", "they", "their", "he", "she", "his", "her",
  "will", "would", "should", "could", "can", "may", "might", "must", "do",
  "does", "did", "have", "has", "had", "not", "no", "so", "such", "which",
  "who", "whom", "what", "when", "where", "why", "how", "any", "all", "some",
]);

/**
 * Lowercase, strip punctuation, drop stopwords, keep 2+ character tokens.
 * Digits are retained: "2026" and "FY2026" are meaningful institutional terms.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/**
 * Character n-grams within a word (not across word boundaries).
 *
 * This is the mechanism that makes morphological variants collide:
 * "profit" -> p, pr, pro, prof, profi, profit, r, ro, ..., and
 * "profitability" -> ... "profit", "rofita", ... sharing the "profit" prefix
 * grams. It is also why false friends like hospital/hospitality score highly —
 * a limitation the retrieval module compensates for with a lexical channel
 * rather than by pretending the vector is semantic.
 */
function ngrams(token: string, min = 3, max = 5): string[] {
  const grams: string[] = [];
  const padded = `^${token}$`;
  for (let n = min; n <= max; n += 1) {
    for (let i = 0; i + n <= padded.length; i += 1) grams.push(padded.slice(i, i + n));
  }
  return grams;
}

/* --------------------------------------------------------------------------
 * Hashing
 * ------------------------------------------------------------------------ */

/**
 * FNV-1a over UTF-8 bytes. Chosen because it is fully specified in ~10 lines,
 * so the embedding survives a library upgrade unchanged. `createHash` is NOT
 * used for the vector because we need a cheap 32-bit value per feature, not a
 * cryptographic digest; a cryptographic hash is used only for the stable
 * `contentDigest` identity below.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/* --------------------------------------------------------------------------
 * Embedding
 * ------------------------------------------------------------------------ */

/**
 * Generate a deterministic 256-dimensional lexical vector.
 *
 * Features: whole tokens (weight 1.0) and character 3–5-grams (weight 0.35).
 * Whole tokens carry the identity; n-grams carry the morphological tolerance.
 * The n-gram weight is deliberately well below 1.0 so that an exact token match
 * always outranks a mere character overlap.
 *
 * The result is L2-normalized. An empty/degenerate input returns a zero vector
 * of the right dimension rather than throwing, so a document with no indexable
 * text still stores a well-formed row and is excluded by the retrieval filter
 * (its norm is 0) instead of breaking ingestion.
 */
export function embedLocal(text: string): LocalEmbedding {
  const vector = new Float32Array(LOCAL_EMBEDDING_DIMENSIONS);
  const tokens = tokenize(text);

  const add = (feature: string, weight: number) => {
    const index = fnv1a(feature) % LOCAL_EMBEDDING_DIMENSIONS;
    // Signed hashing reduces the systematic collision bias of unsigned
    // accumulation: two unrelated features are as likely to cancel as add.
    const sign = (fnv1a(`${feature}#sign`) & 1) === 0 ? 1 : -1;
    vector[index] += sign * weight;
  };

  for (const token of tokens) {
    add(`w:${token}`, 1);
    for (const gram of ngrams(token)) add(`g:${gram}`, 0.35);
  }

  // L2 normalize.
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;

  return {
    modelId: LOCAL_EMBEDDING_MODEL_ID,
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    vector,
    lexical: true,
  };
}

/**
 * Cosine similarity of two equal-length vectors. Both are assumed normalized,
 * so this is a dot product; the norms are still checked so a stored corrupt
 * vector produces 0 (no match) rather than a nonsense score above 1.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  const score = dot / denom;
  // Guard against tiny FP overshoot so a caller can trust [0,1].
  return Math.min(1, Math.max(0, score));
}

/* --------------------------------------------------------------------------
 * Persistence encoding
 * ------------------------------------------------------------------------ */

/**
 * Encode a vector for storage in a `text` column.
 *
 * Float32 is rendered with 7 significant digits, which fully round-trips a
 * float32 without the bulk of a decimal expansion. This keeps the column
 * human-inspectable and avoids introducing a binary/blob format or a
 * vector-specific dependency that this PostgreSQL build cannot provide.
 */
export function encodeVector(vector: Float32Array): string {
  return Array.from(vector, (value) => Number(value.toPrecision(7)).toString()).join(",");
}

/**
 * Decode a stored vector. Returns null on any structural problem so callers can
 * mark the row STALE rather than silently scoring it as a non-match.
 */
export function decodeVector(encoded: string, expectedDimensions = LOCAL_EMBEDDING_DIMENSIONS): Float32Array | null {
  if (!encoded) return null;
  const parts = encoded.split(",");
  if (parts.length !== expectedDimensions) return null;
  const vector = new Float32Array(expectedDimensions);
  for (let i = 0; i < parts.length; i += 1) {
    const value = Number(parts[i]);
    if (!Number.isFinite(value)) return null;
    vector[i] = value;
  }
  return vector;
}

/**
 * Stable digest of the source text, used to decide whether a stored vector is
 * still current. A changed digest means the vector must be recomputed;
 * comparing vectors directly would not detect a re-extraction that leaves the
 * numbers coincidentally similar.
 */
export function embeddingContentDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Honest description of what this provider is and is not. Every surface that
 * reports embedding state should render this rather than a bare "embedded".
 */
export function describeLocalEmbedding(): {
  modelId: string;
  dimensions: number;
  kind: "LEXICAL";
  neural: false;
  requiresModelDownload: false;
  requiresNetwork: false;
  costClass: "LOCAL_FREE";
  limitations: string[];
} {
  return {
    modelId: LOCAL_EMBEDDING_MODEL_ID,
    dimensions: LOCAL_EMBEDDING_DIMENSIONS,
    kind: "LEXICAL",
    neural: false,
    requiresModelDownload: false,
    requiresNetwork: false,
    costClass: "LOCAL_FREE",
    limitations: [
      "This is a lexical hashing embedding, not a neural encoder. It captures morphology and shared character structure, not meaning.",
      "It cannot resolve true synonyms with no shared characters (e.g. 'staff' vs 'personnel').",
      "False friends can score highly (e.g. 'hospital' vs 'hospitality'). Retrieval combines it with a lexical channel to compensate.",
      "pgvector is unavailable on this PostgreSQL build, so approximate nearest-neighbour indexing is not used; scoring is exact over the candidate set.",
    ],
  };
}
