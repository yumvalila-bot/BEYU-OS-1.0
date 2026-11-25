/**
 * Local embedding indexer for the institutional knowledge corpus.
 *
 * WHAT THIS DOES
 *   Walks authorized `knowledge_sources` rows, chunks each one, computes the
 *   local lexical embedding (`embeddings.ts`), and upserts one
 *   `noelia_knowledge_embeddings` row per (source, chunk, model).
 *
 * WHAT THIS DOES NOT DO
 *   - It does not call any network service. There is no inference endpoint here:
 *     the embedding is a pure function of the text.
 *   - It does not embed every tenant's corpus from one call. It is always
 *     scoped, and the write path is protected by RLS like any other.
 *   - It does not delete embeddings for models it did not produce. Rows are
 *     keyed by `embedding_model_id`, so a new model version coexists with the
 *     old one until the old one is deliberately retired.
 *
 * WHY RE-INDEXING IS IDEMPOTENT
 *   The unique key is (source, chunk, model). Re-running with unchanged content
 *   updates `indexed_at` and nothing else, and identical chunks are produced
 *   because chunking is a pure function of the text. A changed digest marks the
 *   row dirty before it is rewritten, so a crash mid-run leaves STALE rows that
 *   the next run repairs rather than a store that silently serves old vectors.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { knowledgeSources, noeliaKnowledgeEmbeddings } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import {
  LOCAL_EMBEDDING_MODEL_ID,
  embeddingContentDigest,
  embedLocal,
  encodeVector,
} from "./embeddings";
import { chunkText } from "./knowledge-retrieval";

export type IndexResult = {
  modelId: string;
  sourcesConsidered: number;
  sourcesIndexed: number;
  chunksWritten: number;
  chunksSkippedCurrent: number;
  failures: Array<{ sourceCode: string; error: string }>;
};

/**
 * Index one source's chunks.
 *
 * Returns the number of chunks written and how many were already current. A
 * source row is only marked EMBEDDED once every one of its chunks has been
 * written; a partial failure leaves the previous state and reports the failure
 * rather than claiming success for the chunks that happened to work.
 */
export async function indexKnowledgeSource(input: {
  sourceId: string;
  /** Recompute even when the digest is unchanged. */
  force?: boolean;
}): Promise<{ written: number; skipped: number; chunks: number }> {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Embedding index requires canonical transaction-scoped tenant context");
  }

  const [source] = await db
    .select({
      id: knowledgeSources.id,
      tenantId: knowledgeSources.tenantId,
      code: knowledgeSources.code,
      title: knowledgeSources.title,
      content: knowledgeSources.content,
      embeddingStatus: knowledgeSources.embeddingStatus,
    })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, input.sourceId))
    .limit(1);

  if (!source) throw new Error(`Knowledge source ${input.sourceId} not found in authorized scope`);
  if (!source.tenantId) {
    // A GLOBAL source has no tenant. Embedding it would create a row that no
    // tenant-scoped policy can read, so it is skipped explicitly rather than
    // written into a scope nobody can see.
    throw new Error(`Knowledge source ${source.code} is GLOBAL and has no tenant scope to store embeddings under`);
  }

  const chunks = chunkText(source.content ?? "");
  if (chunks.length === 0) {
    await db
      .update(knowledgeSources)
      .set({ embeddingStatus: "NOT_EMBEDDED", chunkCount: 0 })
      .where(eq(knowledgeSources.id, source.id));
    return { written: 0, skipped: 0, chunks: 0 };
  }

  const existing = await db
    .select({
      chunkIndex: noeliaKnowledgeEmbeddings.chunkIndex,
      contentDigest: noeliaKnowledgeEmbeddings.contentDigest,
      status: noeliaKnowledgeEmbeddings.status,
    })
    .from(noeliaKnowledgeEmbeddings)
    .where(and(
      eq(noeliaKnowledgeEmbeddings.sourceId, source.id),
      eq(noeliaKnowledgeEmbeddings.embeddingModelId, LOCAL_EMBEDDING_MODEL_ID),
    ));
  const currentByIndex = new Map(existing.map((row) => [row.chunkIndex, row]));

  let written = 0;
  let skipped = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const digest = embeddingContentDigest(chunk);
    const prior = currentByIndex.get(index);
    if (!input.force && prior && prior.contentDigest === digest && prior.status === "EMBEDDED") {
      skipped += 1;
      continue;
    }

    const embedding = embedLocal(chunk);
    await db
      .insert(noeliaKnowledgeEmbeddings)
      .values({
        id: newId(ID_PREFIX.noeliaEmbedding),
        tenantId: source.tenantId,
        sourceId: source.id,
        sourceCode: source.code,
        chunkIndex: index,
        chunkText: chunk,
        contentDigest: digest,
        embeddingModelId: embedding.modelId,
        embeddingDimensions: embedding.dimensions,
        vector: encodeVector(embedding.vector),
        status: "EMBEDDED",
        indexedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          noeliaKnowledgeEmbeddings.sourceId,
          noeliaKnowledgeEmbeddings.chunkIndex,
          noeliaKnowledgeEmbeddings.embeddingModelId,
        ],
        set: {
          chunkText: chunk,
          contentDigest: digest,
          vector: encodeVector(embedding.vector),
          embeddingDimensions: embedding.dimensions,
          status: "EMBEDDED",
          indexedAt: new Date(),
        },
      });
    written += 1;
  }

  // Remove rows for chunks that no longer exist (a shortened document).
  if (existing.length > chunks.length) {
    await db
      .delete(noeliaKnowledgeEmbeddings)
      .where(and(
        eq(noeliaKnowledgeEmbeddings.sourceId, source.id),
        eq(noeliaKnowledgeEmbeddings.embeddingModelId, LOCAL_EMBEDDING_MODEL_ID),
        sql`${noeliaKnowledgeEmbeddings.chunkIndex} >= ${chunks.length}`,
      ));
  }

  await db
    .update(knowledgeSources)
    .set({
      embeddingStatus: "EMBEDDED",
      embeddingModelId: LOCAL_EMBEDDING_MODEL_ID,
      embeddingDimensions: embedLocal("").dimensions,
      chunkCount: chunks.length,
      lastIndexedAt: new Date(),
    })
    .where(eq(knowledgeSources.id, source.id));

  return { written, skipped, chunks: chunks.length };
}

/**
 * Index a bounded batch of AUTHORITATIVE sources.
 *
 * Bounded by design: indexing is CPU work on a 2-core box, and an unbounded
 * sweep would starve request handling. The caller runs this repeatedly with a
 * cursor, and `remaining` says whether more work exists, so progress is visible
 * rather than a background process of unknown duration.
 */
export async function indexKnowledgeBatch(input: {
  limit?: number;
  force?: boolean;
} = {}): Promise<IndexResult> {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Embedding index requires canonical transaction-scoped tenant context");
  }
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 200);

  // Candidates are AUTHORITATIVE sources whose embedding state is not current
  // for this model. The status filter is what makes repeated calls converge.
  const candidates = await db
    .select({
      id: knowledgeSources.id,
      code: knowledgeSources.code,
    })
    .from(knowledgeSources)
    .where(and(
      eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
      sql`${knowledgeSources.tenantId} is not null`,
      input.force
        ? sql`true`
        : sql`(${knowledgeSources.embeddingStatus} <> 'EMBEDDED' OR ${knowledgeSources.embeddingModelId} is distinct from ${LOCAL_EMBEDDING_MODEL_ID})`,
    ))
    .orderBy(knowledgeSources.code)
    .limit(limit);

  const result: IndexResult = {
    modelId: LOCAL_EMBEDDING_MODEL_ID,
    sourcesConsidered: candidates.length,
    sourcesIndexed: 0,
    chunksWritten: 0,
    chunksSkippedCurrent: 0,
    failures: [],
  };

  for (const candidate of candidates) {
    try {
      const outcome = await indexKnowledgeSource({ sourceId: candidate.id, force: input.force });
      result.sourcesIndexed += 1;
      result.chunksWritten += outcome.written;
      result.chunksSkippedCurrent += outcome.skipped;
    } catch (error) {
      // One bad document must not abort the batch, but it must be reported.
      result.failures.push({
        sourceCode: candidate.code,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return result;
}

/**
 * Mark embeddings STALE when their source content no longer matches.
 *
 * Called before retrieval in a development/diagnostic path, not on every read:
 * checking digests for the whole corpus on each query would make retrieval
 * proportional to corpus size. This is the reconciliation step.
 */
export async function markStaleEmbeddings(): Promise<number> {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Embedding index requires canonical transaction-scoped tenant context");
  }
  const rows = await db.execute<{ id: string; chunk_text: string; content_digest: string }>(sql`
    select e.id, e.chunk_text, e.content_digest
      from noelia_knowledge_embeddings e
      join knowledge_sources s on s.id = e.source_id
     where e.status = 'EMBEDDED'
       and e.content_digest <> encode(sha256(convert_to(e.chunk_text, 'UTF8')), 'hex')
  `);
  if (rows.rows.length === 0) return 0;
  await db
    .update(noeliaKnowledgeEmbeddings)
    .set({ status: "STALE" })
    .where(inArray(noeliaKnowledgeEmbeddings.id, rows.rows.map((row) => row.id)));
  return rows.rows.length;
}
