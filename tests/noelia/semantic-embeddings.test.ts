/**
 * NOELIA — learned semantic embeddings vs the lexical pathway.
 *
 * These tests exist because a metric was claimed and then contradicted by
 * measurement. The acceptance matrix said retrieval was semantic; the measured
 * cosine for every synonym pair was 0.00–0.07, indistinguishable from unrelated
 * pairs. Character n-grams cannot encode meaning: "fever" and "pyrexia" share no
 * substring, so their hashed vectors are orthogonal by construction.
 *
 * Each test below states the property, not the implementation. If the model is
 * retrained and a number moves, the PROPERTY assertions still have to hold.
 */
import { describe, expect, it } from "vitest";
import { embedLocal, cosineSimilarity } from "@/lib/noelia/embeddings";
import {
  SEMANTIC_EMBEDDING_DIMENSIONS,
  SEMANTIC_EMBEDDING_MODEL_ID,
  SEMANTIC_VOCAB_SIZE,
  embedSemantic,
  isSemanticWord,
  rankHybrid,
  semanticSimilarity,
  semanticTokens,
} from "@/lib/noelia/semantic-embeddings";

const sim = (a: string, b: string) => semanticSimilarity(embedSemantic(a), embedSemantic(b));

describe("semantic embeddings — the property that was previously missing", () => {
  it("scores SYNONYMS well above the lexical baseline", () => {
    // Lexical measured 0.00–0.07 for every one of these. The learned model must
    // separate them from noise; the floor is deliberately modest so a retrain
    // is not forced to hit an exact number.
    const synonyms: Array<[string, string]> = [
      ["doctor", "physician"],
      ["fever", "pyrexia"],
      ["money", "cash"],
      ["buy", "purchase"],
      ["car", "automobile"],
      ["hospital", "clinic"],
      ["approve", "ratify"],
    ];
    for (const [a, b] of synonyms) {
      const learned = sim(a, b);
      const lexical = cosineSimilarity(embedLocal(a).vector, embedLocal(b).vector);
      expect(learned, `${a}~${b} semantic should beat lexical`).toBeGreaterThan(lexical);
      expect(learned, `${a}~${b} semantic should be clearly positive`).toBeGreaterThan(0.25);
    }
  });

  it("keeps UNRELATED words far apart", () => {
    // The failure mode of a bad semantic model is collapse: everything scores
    // high and retrieval becomes arbitrary. These must stay low.
    const unrelated: Array<[string, string]> = [
      ["patient", "treasury"],
      ["fever", "engine"],
      ["console", "orbit"],
    ];
    for (const [a, b] of unrelated) {
      expect(sim(a, b), `${a}~${b} must not score like a synonym`).toBeLessThan(0.25);
    }
  });

  it("separates the synonym band from the unrelated band", () => {
    // The meaningful claim is RELATIVE separation, not an absolute number.
    const synonymMin = Math.min(sim("doctor", "physician"), sim("money", "cash"), sim("car", "automobile"));
    const unrelatedMax = Math.max(sim("patient", "treasury"), sim("fever", "engine"));
    expect(synonymMin).toBeGreaterThan(unrelatedMax);
  });

  it("PRESERVES the morphological tolerance the lexical path already had", () => {
    // The fix must not regress what worked. Morphology is still handled by the
    // lexical component of the hybrid, and by vocabulary overlap.
    const patientPair = cosineSimilarity(embedLocal("patient").vector, embedLocal("patients").vector);
    expect(patientPair).toBeGreaterThan(0.5);
  });

  it("reports provenance honestly for every input", () => {
    const known = embedSemantic("doctor physician hospital");
    expect(known.provenance).toBe("SEMANTIC");
    expect(known.coverage).toBe(1);
    expect(known.lexical).toBe(false);
    expect(known.modelId).toBe(SEMANTIC_EMBEDDING_MODEL_ID);

    const unknown = embedSemantic("zzzqqq xxyyww");
    // Must NOT claim semantic when it fell back.
    expect(unknown.provenance).toBe("LEXICAL");
    expect(unknown.coverage).toBe(0);
    expect(unknown.lexical).toBe(true);

    const mixed = embedSemantic("doctor zzzqqq");
    expect(mixed.provenance).toBe("HYBRID");
    expect(mixed.coverage).toBeGreaterThan(0);
    expect(mixed.coverage).toBeLessThan(1);
  });

  it("falls back to a byte-identical lexical embedding when nothing is known", () => {
    const text = "quantumflux wobblegate";
    const fallback = embedSemantic(text);
    const lexical = embedLocal(text);
    expect(fallback.modelId).toBe(lexical.modelId);
    expect(Array.from(fallback.vector)).toEqual(Array.from(lexical.vector));
  });

  it("returns 0 — not a plausible number — when comparing across models", () => {
    // Mixing a 64-d semantic vector with a 256-d lexical one must never produce
    // a similarity. Silently computing one is the worst failure mode for a
    // ranker: it looks like an answer.
    const semantic = embedSemantic("doctor");
    const lexical = embedLocal("doctor");
    expect(semanticSimilarity(semantic, lexical as never)).toBe(0);
  });
});

describe("semantic embeddings — storage and versioning contracts", () => {
  it("declares a stable model id and dimension", () => {
    expect(SEMANTIC_EMBEDDING_MODEL_ID).toBe("beyu-local-semantic-v1");
    expect(SEMANTIC_EMBEDDING_DIMENSIONS).toBe(64);
    const e = embedSemantic("doctor");
    expect(e.dimensions).toBe(SEMANTIC_EMBEDDING_DIMENSIONS);
    expect(e.vector.length).toBe(SEMANTIC_EMBEDDING_DIMENSIONS);
  });

  it("produces L2-normalized vectors so similarity is a dot product", () => {
    const e = embedSemantic("doctor physician hospital");
    let norm = 0;
    for (let i = 0; i < e.vector.length; i += 1) norm += e.vector[i] * e.vector[i];
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it("is deterministic — the same text always embeds identically", () => {
    const a = embedSemantic("fever pyrexia patient");
    const b = embedSemantic("fever pyrexia patient");
    expect(Array.from(a.vector)).toEqual(Array.from(b.vector));
  });

  it("exposes a non-trivial learned vocabulary", () => {
    expect(SEMANTIC_VOCAB_SIZE).toBeGreaterThan(50);
    expect(isSemanticWord("doctor")).toBe(true);
    expect(isSemanticWord("treasury")).toBe(true);
    expect(isSemanticWord("definitelynotaword")).toBe(false);
  });

  it("tokenises the same way the trainer did", () => {
    // Punctuation is STRIPPED, not treated as a separator: "Doctor's" becomes
    // "doctors". That is deliberate — the trainer did the same, so a possessive
    // or hyphenated form lands on a real vocabulary entry instead of vanishing.
    expect(semanticTokens("The Doctor's FEVER, again!")).toEqual(["the", "doctors", "fever", "again"]);
    expect(semanticTokens("")).toEqual([]);
    expect(semanticTokens("   ")).toEqual([]);
    // Single characters are dropped; identifiers keep their digits.
    expect(semanticTokens("a b TB-2026-0041")).toEqual(["tb20260041"]);
  });

  it("handles empty and whitespace-only input without throwing", () => {
    expect(() => embedSemantic("")).not.toThrow();
    expect(() => embedSemantic("   ")).not.toThrow();
    expect(embedSemantic("").provenance).toBe("LEXICAL");
  });
});

describe("hybrid retrieval", () => {
  const docs = [
    { id: "D1", text: "the physician examined the febrile child" },
    { id: "D2", text: "the treasury forecast was approved by the board" },
    { id: "D3", text: "the automobile engine requires maintenance" },
    { id: "D4", text: "a doctor reviewed the pyrexia case" },
  ];

  it("ranks a semantic match above an unrelated document", () => {
    const hits = rankHybrid("doctor fever", docs);
    const top = hits[0];
    expect(["D1", "D4"]).toContain(top.item.id);
    const unrelated = hits.find((h) => h.item.id === "D3")!;
    expect(top.score).toBeGreaterThan(unrelated.score);
  });

  it("retrieves a document sharing NO query token, via learned synonymy", () => {
    // "pyrexia" appears only in D4; the query says "fever". A lexical ranker
    // scores this at zero. This is the whole point of the change.
    const hits = rankHybrid("fever", docs);
    const d4 = hits.find((h) => h.item.id === "D4")!;
    expect(d4.semanticScore).toBeGreaterThan(0);
    const d3 = hits.find((h) => h.item.id === "D3")!;
    expect(d4.score).toBeGreaterThan(d3.score);
  });

  it("is deterministic and breaks ties by id, never by input order", () => {
    const forward = rankHybrid("doctor", docs).map((h) => h.item.id);
    const reversed = rankHybrid("doctor", [...docs].reverse()).map((h) => h.item.id);
    expect(forward).toEqual(reversed);
  });

  it("returns an empty result for an empty corpus rather than throwing", () => {
    expect(rankHybrid("anything", [])).toEqual([]);
  });

  it("keeps lexical weight, so an exact rare identifier still matches", () => {
    // A pure semantic model is weakest on rare tokens. Lexical carries them.
    const withId = [
      { id: "A", text: "case TB-2026-0041 patient record" },
      { id: "B", text: "unrelated administrative bulletin" },
    ];
    const hits = rankHybrid("TB-2026-0041", withId);
    expect(hits[0].item.id).toBe("A");
  });

  it("exposes both components so a ranker decision is inspectable", () => {
    const hit = rankHybrid("doctor fever", docs)[0];
    expect(typeof hit.semanticScore).toBe("number");
    expect(typeof hit.lexicalScore).toBe("number");
    expect(hit.score).toBeGreaterThanOrEqual(Math.max(hit.semanticScore, hit.lexicalScore) * 0.7 - 1e-9);
  });
});
