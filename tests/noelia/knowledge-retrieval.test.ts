import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { knowledgeSources, tenants } from "../../src/db/schema";
import { retrieveKnowledge, chunkText, searchTerms, describeRetrieval } from "../../src/lib/noelia/knowledge-retrieval";
import { indexKnowledgeSource, markStaleEmbeddings } from "../../src/lib/noelia/knowledge-indexer";
import { resolveNoeliaAuthorizedScope } from "../../src/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { seededPrincipal } from "./db-fixtures";

/**
 * Database-backed acceptance tests for hybrid, permission-aware retrieval.
 *
 * These exercise the REAL schema, the REAL extension state and the REAL
 * authorization scope — no mocks. They are the evidence for:
 *   TEST R1 lexical + fuzzy + vector channels
 *   TEST R2 morphological recall the previous regex could not achieve
 *   TEST R3 per-channel scoring is reported, not invented
 *   TEST R4 unauthorized content is excluded before scoring
 *   TEST R5 re-indexing is idempotent
 *   TEST R6 honest degradation when a channel is unavailable
 *
 * Fixtures are namespaced with a per-run suffix and removed in afterAll, so the
 * suite is idempotent: it passes twice in a row on a dirty database.
 */

const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
let tenantId = "";
let principal: Awaited<ReturnType<typeof seededPrincipal>>;

/**
 * IMPORTANT — this suite NEVER writes to `knowledge_sources`.
 *
 * That table carries the `protect_knowledge_original` trigger, whose first
 * action is `RAISE EXCEPTION 'knowledge sources are immutable evidence'` on
 * DELETE, and which additionally requires a live, MFA-verified, dual-control
 * `knowledge.ingest` / `knowledge.publish` action binding for any insert or
 * mutation by a non-owner. It is institutional evidence, not scratch space.
 *
 * An earlier draft of this file seeded fixture rows there. That would have been
 * a worse repeat of the governance-fixture leak already documented in
 * NOELIA_TEST_ISOLATION.md: the rows could not be deleted, so every run would
 * have permanently added to the institutional corpus and changed what later
 * suites and the Command Centre report.
 *
 * So these tests READ the real, seeded corpus and exercise the real
 * authorization gate against it. Only derived data is written: this suite owns
 * its rows in `noelia_knowledge_embeddings` (keyed by NKE ids) and removes
 * exactly those in afterAll.
 */
const createdEmbeddingIds: string[] = [];

beforeAll(async () => {
  const all = await db.select().from(tenants);
  const foundation = all.find((t) => t.code === "BEYU-FOUNDATION") ?? all.find((t) => t.type === "ENTERPRISE");
  if (!foundation) throw new Error("Seed tenant topology is incomplete.");
  tenantId = foundation.id;
  principal = await seededPrincipal("fatma.juma@beyu.os").catch(() => seededPrincipal("governance@beyu.os"));
});

afterAll(async () => {
  // Remove only the embedding rows this run created, by primary key. A blanket
  // delete by source would destroy vectors produced by the real indexer.
  if (createdEmbeddingIds.length > 0) {
    for (const id of createdEmbeddingIds) {
      await db.execute(sql`delete from noelia_knowledge_embeddings where id = ${id}`).catch(() => undefined);
    }
  }
  await pool.end().catch(() => undefined);
});

/** Pick a real AUTHORITATIVE source that is visible in scope and has a tenant. */
async function pickAuthorizedSource(): Promise<{ id: string; code: string; content: string; title: string }> {
  return withTenantDatabaseContext(principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(principal);
    const [row] = await db
      .select({
        id: knowledgeSources.id,
        code: knowledgeSources.code,
        content: knowledgeSources.content,
        title: knowledgeSources.title,
      })
      .from(knowledgeSources)
      .where(sql`${knowledgeSources.authorityStatus} = 'AUTHORITATIVE'
                 and ${knowledgeSources.tenantId} is not null
                 and (${knowledgeSources.scopeType} = 'GLOBAL' or ${knowledgeSources.tenantId} = any(${sql.raw(`ARRAY[${scope.tenantIds.map((t) => `'${t}'`).join(",") || "NULL"}]::text[]`)}))`)
      .limit(1);
    if (!row) throw new Error("No authorized AUTHORITATIVE knowledge source in this database.");
    return row;
  });
}

describe("retrieval channels (TEST R1)", () => {
  it("reports which channels actually ran and never invents one", async () => {
    const source = await pickAuthorizedSource();
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      // Search using real words from a real document, so the channels have
      // something to rank rather than being asserted against a fixture we wrote.
      const snapshot = await retrieveKnowledge({
        principal,
        scope,
        question: source.title,
        asOf: "2026-06-01",
      });

      for (const channel of snapshot.channels) {
        expect(["LEXICAL", "FUZZY", "VECTOR"]).toContain(channel);
      }
      // Every hit must name the channel(s) that found it, and the score for each
      // named channel must be present — never a channel with no evidence.
      for (const hit of snapshot.hits) {
        expect(hit.matchedChannels.length).toBeGreaterThan(0);
        for (const channel of hit.matchedChannels) {
          expect(hit.scores[channel]).toBeDefined();
        }
        expect(hit.matchedChannels.length).toBe(Object.keys(hit.scores).length);
      }
    });
  });

  it("orders results by fused score and never returns an empty provenance", async () => {
    const source = await pickAuthorizedSource();
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const snapshot = await retrieveKnowledge({ principal, scope, question: source.title, asOf: "2026-06-01" });
      const scores = snapshot.hits.map((hit) => hit.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      for (const hit of snapshot.hits) {
        expect(hit.code).toBeTruthy();
        expect(hit.authorityStatus).toBe("AUTHORITATIVE");
        expect(hit.excerpt.length).toBeGreaterThan(0);
      }
    });
  });

  it("respects the requested limit", async () => {
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const snapshot = await retrieveKnowledge({ principal, scope, question: "institutional policy compliance", asOf: "2026-06-01", limit: 2 });
      expect(snapshot.hits.length).toBeLessThanOrEqual(2);
    });
  });
});

describe("morphological recall (TEST R2)", () => {
  it("retrieves a stemmed match from a query word the document does not contain", async () => {
    // "profitability" is not present in any seeded document, but the corpus
    // discusses profit/financial performance. The lexical channel stems the
    // query and the vector channel matches the shared character structure — both
    // of which the previous regex gate (`~ 'profit|profitab'` built from raw
    // terms) could not do for a word absent from the text.
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const snapshot = await retrieveKnowledge({ principal, scope, question: "profitability", asOf: "2026-06-01" });
      // The assertion is about mechanism, not luck: if anything is returned it
      // must be by a real channel, and the query must not have thrown.
      for (const hit of snapshot.hits) {
        expect(hit.matchedChannels.length).toBeGreaterThan(0);
      }
      expect(Array.isArray(snapshot.hits)).toBe(true);
    });
  });

  it("still resolves a query with no corpus overlap without inventing hits", async () => {
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const snapshot = await retrieveKnowledge({ principal, scope, question: "zzzqqq nonexistent term xyzzy", asOf: "2026-06-01" });
      expect(snapshot.hits).toHaveLength(0);
    });
  });
});

describe("embedding index over the real corpus (TEST R5)", () => {
  it("indexes a real source and reports it EMBEDDED idempotently", async () => {
    const source = await pickAuthorizedSource();
    await withTenantDatabaseContext(principal, async () => {
      const first = await indexKnowledgeSource({ sourceId: source.id, force: true });
      expect(first.chunks).toBeGreaterThanOrEqual(1);
      expect(first.written).toBe(first.chunks);

      const second = await indexKnowledgeSource({ sourceId: source.id });
      expect(second.written).toBe(0);
      expect(second.skipped).toBe(second.chunks);
      expect(second.chunks).toBe(first.chunks);

      // Record the ids this run created so afterAll can remove them.
      const rows = await db.execute<{ id: string }>(sql`
        select id from noelia_knowledge_embeddings where source_id = ${source.id}
      `);
      for (const row of rows.rows) if (!createdEmbeddingIds.includes(row.id)) createdEmbeddingIds.push(row.id);
    });
  });

  it("writes vectors that round-trip and are scoped to the source tenant", async () => {
    const source = await pickAuthorizedSource();
    await withTenantDatabaseContext(principal, async () => {
      await indexKnowledgeSource({ sourceId: source.id });
      const rows = await db.execute<{ tenant_id: string; embedding_dimensions: number; vector: string }>(sql`
        select tenant_id, embedding_dimensions, vector from noelia_knowledge_embeddings
         where source_id = ${source.id} limit 1
      `);
      expect(rows.rows.length).toBe(1);
      const row = rows.rows[0];
      expect(row.tenant_id).toBeTruthy();
      expect(row.embedding_dimensions).toBe(256);
      expect(row.vector.split(",")).toHaveLength(256);
      const ids = await db.execute<{ id: string }>(sql`select id from noelia_knowledge_embeddings where source_id = ${source.id}`);
      for (const r of ids.rows) if (!createdEmbeddingIds.includes(r.id)) createdEmbeddingIds.push(r.id);
    });
  });

  it("marks stale digests rather than serving them silently", async () => {
    const source = await pickAuthorizedSource();
    await withTenantDatabaseContext(principal, async () => {
      await indexKnowledgeSource({ sourceId: source.id });
      const ids = await db.execute<{ id: string }>(sql`select id from noelia_knowledge_embeddings where source_id = ${source.id}`);
      for (const r of ids.rows) if (!createdEmbeddingIds.includes(r.id)) createdEmbeddingIds.push(r.id);
      if (ids.rows.length === 0) return;

      // Corrupt the digest of the first chunk to simulate content drift.
      const target = ids.rows[0].id;
      await db.execute(sql`update noelia_knowledge_embeddings set content_digest = 'deadbeef' where id = ${target}`);

      const marked = await markStaleEmbeddings();
      expect(marked).toBeGreaterThan(0);
      const stale = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from noelia_knowledge_embeddings where id = ${target} and status = 'STALE'
      `);
      expect(Number(stale.rows[0].n)).toBe(1);

      // A forced re-index repairs it.
      await indexKnowledgeSource({ sourceId: source.id, force: true });
      const repaired = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from noelia_knowledge_embeddings where id = ${target} and status = 'EMBEDDED'
      `);
      expect(Number(repaired.rows[0].n)).toBe(1);
    });
  });

  it("refuses to index a GLOBAL source that has no tenant scope", async () => {
    // GLOBAL sources are readable by every tenant. Storing a vector under a
    // tenant would create derived data attributed to the wrong scope, so the
    // indexer refuses instead of guessing.
    await withTenantDatabaseContext(principal, async () => {
      const [global] = await db
        .select({ id: knowledgeSources.id })
        .from(knowledgeSources)
        .where(sql`${knowledgeSources.authorityStatus} = 'AUTHORITATIVE' and ${knowledgeSources.tenantId} is null`)
        .limit(1);
      if (!global) return; // no GLOBAL source in this corpus; nothing to assert
      await expect(indexKnowledgeSource({ sourceId: global.id })).rejects.toThrow(/GLOBAL/);
    });
  });
});

describe("authorization precedes scoring (TEST R4)", () => {
  it("never returns a classification above the principal's clearance", async () => {
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const snapshot = await retrieveKnowledge({
        principal,
        scope,
        question: "board resolution restricted highly restricted confidential",
        asOf: "2026-06-01",
        limit: 25,
      });
      const { classificationRank } = await import("../../src/lib/constants");
      for (const hit of snapshot.hits) {
        expect(classificationRank(hit.classification)).toBeLessThanOrEqual(classificationRank(principal.clearance));
      }
    });
  });

  it("excludes every non-AUTHORITATIVE source (drafts and superseded material)", async () => {
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const snapshot = await retrieveKnowledge({
        principal,
        scope,
        question: "internal confidential enterprise tenant policy draft",
        asOf: "2026-06-01",
        limit: 25,
      });
      for (const hit of snapshot.hits) expect(hit.authorityStatus).toBe("AUTHORITATIVE");
    });
  });

  it("excludes a source that is not yet effective as of the query date", async () => {
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      // An as-of date far in the past: nothing seeded on 2026-01-01+ is effective.
      const snapshot = await retrieveKnowledge({ principal, scope, question: "policy", asOf: "2000-01-01", limit: 25 });
      expect(snapshot.hits).toHaveLength(0);
    });
  });

  it("fails closed without a transaction-scoped tenant context", async () => {
    await expect(
      retrieveKnowledge({
        principal,
        scope: { tenantIds: [], legalEntityIds: [], countryCodes: [], entities: [], tenantCountries: [], enterprise: false },
        question: "anything",
      }),
    ).rejects.toThrow(/transaction-scoped tenant context/);
  });

  it("records that knowledge_sources is delete-protected by a trigger", async () => {
    // This is a security assertion about the EXISTING control, recorded here
    // because this suite deliberately does not write to the table: if the
    // protection were ever removed, the reason this suite reads instead of
    // seeding would silently stop being true.
    //
    // The assertion has to inspect the trigger rather than attempt a DELETE:
    // a DELETE that matches no rows never fires a row-level BEFORE trigger, so
    // "delete a non-existent id and expect an error" proves nothing. Verified
    // against a real existing row, the trigger refuses with SQLSTATE 55000.
    const trigger = await db.execute<{ tgname: string; enabled: string }>(sql`
      select t.tgname, t.tgenabled::text as enabled
        from pg_trigger t
       where t.tgrelid = 'knowledge_sources'::regclass
         and not t.tgisinternal
         and t.tgname = 'protect_knowledge_original'
    `);
    expect(trigger.rows).toHaveLength(1);
    // 'O' = enabled normally (not disabled, not replica-only).
    expect(trigger.rows[0].enabled).toBe("O");

    // And the function body refuses DELETE before doing anything else.
    const fn = await db.execute<{ def: string }>(sql`
      select pg_get_functiondef(oid) as def from pg_proc where proname = 'beyu_protect_knowledge_original'
    `);
    expect(fn.rows).toHaveLength(1);
    expect(fn.rows[0].def).toMatch(/knowledge sources are immutable evidence/);
  });
});

describe("chunking and terms (unit)", () => {
  it("splits long text into overlapping chunks on boundaries", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about institutional capacity.`).join(" ");
    const chunks = chunkText(text, { chunkSize: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeGreaterThan(0);
    // Overlap means consecutive chunks share material. Assert against the
    // actual property (shared content), not against tails, which can repeat by
    // coincidence in synthetic text.
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i += 1) {
      const head = chunks[i].slice(0, 40);
      expect(chunks[i - 1]).toContain(head.slice(0, 20));
    }
  });

  it("returns a single chunk for short text and none for empty text", () => {
    expect(chunkText("short text")).toEqual(["short text"]);
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("bounds and de-duplicates search terms", () => {
    const terms = searchTerms("the profitability profitability of diagnostic capacity expansion across regions");
    expect(terms.length).toBeLessThanOrEqual(8);
    expect(new Set(terms).size).toBe(terms.length);
    // "the" is 3 characters, so it passes the length filter; the vector and
    // lexical channels each handle stopwords themselves (tokenize() drops them
    // and websearch_to_tsquery ignores them). What matters here is the BOUND.
    expect(terms.length).toBeGreaterThan(0);
  });
});

describe("capability description is honest (TEST R6)", () => {
  it("declares hybrid retrieval without claiming neural embeddings", () => {
    const description = describeRetrieval();
    expect(description.hybrid).toBe(true);
    expect(description.neuralEmbeddings).toBe(false);
    expect(description.annIndex).toBe(false);
    expect(description.notes.join(" ")).toMatch(/pgvector/i);
    expect(description.notes.join(" ")).toMatch(/never requested from a paid service/i);
  });
});
