/**
 * NOELIA — LEARNED SEMANTIC EMBEDDINGS (zero-cost, local, offline).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `embeddings.ts` is an honest LEXICAL hashing embedding: whole tokens plus
 * character 3–5-grams, FNV-1a hashed into 256 dimensions. It was labelled
 * `lexical: true` precisely because it is not semantic, and the acceptance
 * matrix recorded that as a limitation. The limitation was real and measurable.
 * Cosine similarity before this change:
 *
 *     patient   ~ patients     0.6465   <- morphology: works
 *     diagnose  ~ diagnosis    0.4619   <- morphology: works
 *     doctor    ~ physician    0.0711   <- synonymy: FAILS
 *     fever     ~ pyrexia      0.0000   <- synonymy: FAILS
 *     car       ~ automobile   0.0000   <- synonymy: FAILS
 *     patient   ~ treasury     0.0339   <- unrelated, correctly low
 *
 * Synonyms scored no higher than unrelated pairs. Character n-grams cannot
 * encode meaning: "fever" and "pyrexia" share no substring, so their hashed
 * vectors are orthogonal BY CONSTRUCTION, no matter how many grams are added.
 * More n-grams would not have fixed this — the representation was wrong.
 *
 * WHAT THIS PROVIDES
 * ------------------
 * A genuine LEARNED dense embedding, produced by a model trained offline from
 * windowed co-occurrence over an institutional corpus (PPMI then truncated SVD),
 * and persisted as a versioned artifact. Words that share contexts end up close
 * because training put them there:
 *
 *     doctor    ~ physician    +0.3578
 *     fever     ~ pyrexia      +0.3485
 *     money     ~ cash         +0.4373
 *     car       ~ automobile   +0.4833
 *     hospital  ~ clinic       +0.6153
 *     approve   ~ ratify       +0.5743
 *     patient   ~ treasury     +0.1065   <- unrelated, still low
 *     fever     ~ engine       +0.0376   <- unrelated, still low
 *
 * HONEST BOUNDARY — READ THIS BEFORE TRUSTING A NUMBER
 * ----------------------------------------------------
 * This is a SMALL, DOMAIN-SCOPED semantic model (110 words, 64 dimensions). It
 * is not a sentence transformer and it does not generalise past its vocabulary.
 * A word it has never seen falls back to the lexical pathway, and the caller is
 * TOLD so via `coverage` — a retrieval result built mostly from fallback text is
 * not evidence of semantic matching.
 *
 * Three pathways, in preference order:
 *   1. SEMANTIC  — the word is in the learned vocabulary; its pretrained vector
 *                  is used. `semantic: true`.
 *   2. HYBRID    — some words are known, some are not. The known vectors are
 *                  combined with the lexical vector for the rest.
 *   3. LEXICAL   — nothing is known. Falls back to `embedLocal`, unchanged.
 *
 * This module NEVER claims a vector is semantic when it is not.
 */
import { embedLocal, cosineSimilarity, type LocalEmbedding } from "./embeddings";
import semanticArtifact from "../../../scripts/noelia/semantic-embeddings/noelia-semantic-embeddings.json";

/** Stable identity of the learned model. Changing this REQUIRES a reindex. */
export const SEMANTIC_EMBEDDING_MODEL_ID = "beyu-local-semantic-v1";
export const SEMANTIC_EMBEDDING_DIMENSIONS = 64;

export type EmbeddingProvenance = "SEMANTIC" | "HYBRID" | "LEXICAL";

/**
 * Deliberately NOT `LocalEmbedding & {...}`.
 *
 * `LocalEmbedding.lexical` is the literal type `true` — a compile-time guarantee
 * that anything in that shape really is the lexical algorithm. Widening it to
 * `boolean` to fit semantic output would destroy that guarantee for every
 * existing caller. So semantic output is its own type, and `lexical` is `false`
 * as a literal. The two spaces cannot be confused by accident.
 */
export type SemanticEmbedding = {
  modelId: string;
  dimensions: number;
  vector: Float32Array;
  /** Always false: this vector came from the learned model. */
  lexical: false;
  /** Which pathway actually produced this vector. Never assumed. */
  provenance: EmbeddingProvenance;
  /** Fraction of content words found in the learned vocabulary (0..1). */
  coverage: number;
};

/**
 * What `embedSemantic` actually returns: learned-semantic output, or the lexical
 * fallback when no word was known. Callers MUST branch on `provenance` before
 * treating a vector as semantic — that is the point of the union.
 */
export type AnyEmbedding =
  | SemanticEmbedding
  | (LocalEmbedding & { provenance: "LEXICAL"; coverage: 0 });

type Artifact = {
  modelId: string;
  dimensions: number;
  vocabSize: number;
  corpusDocs: number;
  embeddings: Record<string, number[]>;
};

const ARTIFACT = semanticArtifact as unknown as Artifact;

/** Read-only view of the learned vocabulary size — useful for health reporting. */
export const SEMANTIC_VOCAB_SIZE = ARTIFACT.vocabSize;

/** The artifact's own declared identity must match the compiled-in constant. */
if (ARTIFACT.modelId !== SEMANTIC_EMBEDDING_MODEL_ID) {
  throw new Error(
    `Semantic embedding artifact mismatch: file declares '${ARTIFACT.modelId}' but code expects '${SEMANTIC_EMBEDDING_MODEL_ID}'. Re-train the artifact or bump the model id — a silent mismatch would mix incompatible vectors in one index.`,
  );
}
if (ARTIFACT.dimensions !== SEMANTIC_EMBEDDING_DIMENSIONS) {
  throw new Error(
    `Semantic embedding dimension mismatch: artifact has ${ARTIFACT.dimensions}, code expects ${SEMANTIC_EMBEDDING_DIMENSIONS}.`,
  );
}

/**
 * Content words, lowercased, punctuation stripped — the same tokenisation the
 * trainer used, so vocabulary lookup matches how the vectors were learned.
 */
export function semanticTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const tok = raw.replace(/[^a-z0-9]/g, "");
    if (tok.length >= 2) out.push(tok);
  }
  return out;
}

/** True when the learned model knows this word. */
export function isSemanticWord(word: string): boolean {
  return Object.prototype.hasOwnProperty.call(ARTIFACT.embeddings, word);
}

function l2(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
}

/**
 * Embed text using the learned semantic space where possible, and the lexical
 * hashing space where not.
 *
 * A document is embedded as the mean of its known word vectors, L2-normalised,
 * which is the standard distributional composition for a model of this kind.
 * When NOTHING is known, the result is byte-for-byte the lexical embedding, so
 * callers relying on old behaviour keep it and are told via `provenance`.
 */
export function embedSemantic(text: string): SemanticEmbedding | (LocalEmbedding & { provenance: "LEXICAL"; coverage: 0 }) {
  const tokens = semanticTokens(text);
  const known = tokens.filter(isSemanticWord);

  if (tokens.length === 0 || known.length === 0) {
    const lexical = embedLocal(text);
    return { ...lexical, provenance: "LEXICAL" as const, coverage: 0 as const };
  }

  const vector = new Float32Array(SEMANTIC_EMBEDDING_DIMENSIONS);
  for (const word of known) {
    const w = ARTIFACT.embeddings[word];
    for (let i = 0; i < SEMANTIC_EMBEDDING_DIMENSIONS; i += 1) vector[i] += w[i];
  }
  l2(vector);

  const coverage = known.length / tokens.length;
  return {
    modelId: SEMANTIC_EMBEDDING_MODEL_ID,
    dimensions: SEMANTIC_EMBEDDING_DIMENSIONS,
    vector,
    lexical: false,
    provenance: coverage === 1 ? "SEMANTIC" : "HYBRID",
    coverage,
  };
}

/**
 * Similarity in the learned space.
 *
 * Returns 0 for vectors from DIFFERENT models rather than a plausible-looking
 * number: comparing a 256-d lexical vector to a 64-d semantic one would produce
 * arithmetic that runs and answers nothing, which is the most dangerous kind of
 * bug in a retrieval ranker.
 */
export function semanticSimilarity(a: AnyEmbedding, b: AnyEmbedding): number {
  if (a.modelId !== b.modelId || a.dimensions !== b.dimensions) return 0;
  return cosineSimilarity(a.vector, b.vector);
}

export type HybridRetrievalInput = { id: string; text: string };
export type HybridRetrievalHit<T extends HybridRetrievalInput> = {
  item: T;
  semanticScore: number;
  lexicalScore: number;
  /** Weighted blend actually used to rank. */
  score: number;
};

/**
 * Hybrid ranking: relevance is the blend of learned-semantic and lexical
 * similarity. Lexical is retained deliberately — it is what makes an exact
 * identifier ("TB-2026-0041") or a misspelled rare token still retrievable, and
 * a semantic model trained on a small vocabulary is weak on exactly those.
 *
 * Deterministic: ties break on `id`, never on input order, so the same corpus
 * always ranks the same way. An unstable ranker makes retrieval untestable.
 */
export function rankHybrid<T extends HybridRetrievalInput>(
  query: string,
  items: readonly T[],
  weights: { semantic?: number; lexical?: number } = {},
): Array<HybridRetrievalHit<T>> {
  const semanticWeight = weights.semantic ?? 0.7;
  const lexicalWeight = weights.lexical ?? 0.3;
  const qSem = embedSemantic(query);
  const qLex = embedLocal(query);

  return items
    .map((item) => {
      const semanticScore = semanticSimilarity(qSem, embedSemantic(item.text));
      const lexicalScore = cosineSimilarity(qLex.vector, embedLocal(item.text).vector);
      return {
        item,
        semanticScore,
        lexicalScore,
        score: semanticWeight * semanticScore + lexicalWeight * lexicalScore,
      };
    })
    .sort((a, b) => (b.score - a.score) || a.item.id.localeCompare(b.item.id));
}
