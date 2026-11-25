/**
 * Local lexical embedding — unit contract.
 *
 * The point of these tests is not that the embedding is good. It is that the
 * embedding is HONEST: deterministic, bounded, safe on degenerate input, and
 * explicit about the difference between lexical overlap and meaning. Several
 * assertions here specifically document the algorithm's weaknesses so they
 * cannot later be presented as strengths.
 */
import { describe, expect, it } from "vitest";
import {
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL_ID,
  cosineSimilarity,
  decodeVector,
  describeLocalEmbedding,
  embedLocal,
  embeddingContentDigest,
  encodeVector,
  tokenize,
} from "@/lib/noelia/embeddings";

describe("shape and identity", () => {
  it("produces the declared dimension count", () => {
    const embedding = embedLocal("institutional capacity planning");
    expect(embedding.dimensions).toBe(LOCAL_EMBEDDING_DIMENSIONS);
    expect(embedding.vector).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
    expect(embedding.modelId).toBe(LOCAL_EMBEDDING_MODEL_ID);
  });

  it("declares itself lexical rather than neural", () => {
    expect(embedLocal("anything").lexical).toBe(true);
  });

  it("is never a zero vector for indexable text", () => {
    const vector = embedLocal("hospital diagnostic capacity").vector;
    expect(Array.from(vector).some((value) => value !== 0)).toBe(true);
  });
});

describe("determinism", () => {
  it("returns byte-identical vectors for identical text", () => {
    const a = embedLocal("BEYU Foundation annual return FY2026");
    const b = embedLocal("BEYU Foundation annual return FY2026");
    expect(Array.from(a.vector)).toEqual(Array.from(b.vector));
  });

  it("is order-independent within the same token multiset", () => {
    // Hashing is additive, so word order does not change the vector. This is
    // stated as a LIMITATION, not a feature: it is why the lexical channel still
    // exists for phrase-sensitive ordering.
    const a = embedLocal("annual return foundation").vector;
    const b = embedLocal("foundation annual return").vector;
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });
});

describe("normalization and similarity bounds", () => {
  const vector = embedLocal("profitability of the diagnostic unit").vector;

  it("is L2-normalized", () => {
    const norm = Math.sqrt(Array.from(vector).reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("has self-similarity of 1", () => {
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 6);
  });

  it("stays within [0,1]", () => {
    const other = embedLocal("hospitality training").vector;
    const score = cosineSimilarity(vector, other);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("returns 0 for mismatched lengths rather than a wrong number", () => {
    const short = new Float32Array(8);
    expect(cosineSimilarity(vector, short)).toBe(0);
  });

  it("returns 0 when either vector is zero", () => {
    const zero = new Float32Array(LOCAL_EMBEDDING_DIMENSIONS);
    expect(cosineSimilarity(vector, zero)).toBe(0);
    expect(cosineSimilarity(zero, zero)).toBe(0);
  });
});

describe("morphological recall (what this actually buys)", () => {
  const sim = (a: string, b: string) => cosineSimilarity(embedLocal(a).vector, embedLocal(b).vector);

  it("relates a stem to its derivations", () => {
    // These pairs are exactly what the previous regex gate could not match.
    expect(sim("profitability", "profit")).toBeGreaterThan(0.3);
    expect(sim("diagnostics", "diagnostic")).toBeGreaterThan(0.5);
    expect(sim("expanding capacity", "expansion of capacity")).toBeGreaterThan(0.4);
  });

  it("ranks a related phrase above an unrelated one", () => {
    const related = sim("outpatient capacity expansion", "expand the outpatient department");
    const unrelated = sim("outpatient capacity expansion", "agricultural fertiliser subsidy");
    expect(related).toBeGreaterThan(unrelated);
  });
});

describe("documented weaknesses", () => {
  const sim = (a: string, b: string) => cosineSimilarity(embedLocal(a).vector, embedLocal(b).vector);

  it("still prefers a genuinely related phrase over a false friend", () => {
    // "hospital" vs "hospitality" is the classic character-overlap trap.
    const related = sim("hospital", "hospital bed capacity");
    const falseFriend = sim("hospital", "hospitality training");
    expect(related).toBeGreaterThan(falseFriend);
  });

  it("cannot resolve synonyms with no shared characters", () => {
    // This assertion exists to record the limitation. If a future change makes
    // this pass, the algorithm is no longer lexical and the model id must change.
    const score = sim("staff", "personnel");
    expect(score).toBeLessThan(0.2);
  });
});

describe("degenerate input", () => {
  it("handles empty text without throwing", () => {
    const embedding = embedLocal("");
    expect(embedding.vector).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
    expect(Array.from(embedding.vector).every((value) => value === 0)).toBe(true);
  });

  it("handles punctuation and whitespace only", () => {
    expect(() => embedLocal("   ,,, ;; ---  ")).not.toThrow();
    expect(Array.from(embedLocal("---").vector).every((value) => value === 0)).toBe(true);
  });

  it("handles non-latin text without throwing", () => {
    const embedding = embedLocal("شاملة الصحة التشخيص");
    expect(embedding.vector).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
    expect(Array.from(embedding.vector).some((value) => value !== 0)).toBe(true);
  });

  it("drops stopwords so they do not create spurious similarity", () => {
    expect(tokenize("the and of to in")).toEqual([]);
    expect(tokenize("The Hospital and the Clinic")).toEqual(["hospital", "clinic"]);
  });
});

describe("persistence encoding", () => {
  it("round-trips within float32 precision", () => {
    const original = embedLocal("BEYU Health OS diagnostic capacity expansion").vector;
    const decoded = decodeVector(encodeVector(original));
    expect(decoded).not.toBeNull();
    let maxError = 0;
    for (let i = 0; i < original.length; i += 1) maxError = Math.max(maxError, Math.abs(original[i] - decoded![i]));
    expect(maxError).toBeLessThan(1e-6);
  });

  it("returns null for a wrong dimension count instead of a truncated vector", () => {
    expect(decodeVector("1,2,3")).toBeNull();
  });

  it("returns null for non-numeric content", () => {
    const bad = new Array(LOCAL_EMBEDDING_DIMENSIONS).fill("0");
    bad[5] = "not-a-number";
    expect(decodeVector(bad.join(","))).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(decodeVector("")).toBeNull();
  });
});

describe("content digest", () => {
  it("is stable and sensitive to a single character", () => {
    const a = embeddingContentDigest("annual return");
    expect(a).toBe(embeddingContentDigest("annual return"));
    expect(a).not.toBe(embeddingContentDigest("annual returN"));
    expect(a).toHaveLength(64);
  });
});

describe("capability description is honest", () => {
  it("states that it is lexical, non-neural, local and free", () => {
    const description = describeLocalEmbedding();
    expect(description.kind).toBe("LEXICAL");
    expect(description.neural).toBe(false);
    expect(description.requiresNetwork).toBe(false);
    expect(description.requiresModelDownload).toBe(false);
    expect(description.costClass).toBe("LOCAL_FREE");
  });

  it("publishes its limitations rather than hiding them", () => {
    const { limitations } = describeLocalEmbedding();
    expect(limitations.length).toBeGreaterThanOrEqual(3);
    expect(limitations.join(" ")).toMatch(/synonym/i);
    expect(limitations.join(" ")).toMatch(/pgvector/i);
  });
});
