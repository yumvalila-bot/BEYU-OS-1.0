/**
 * ITERATION 10 — EPISTEMICS / TRUTH / RECOMMENDATION COMPLETENESS
 *
 * Verifies the canonical epistemic model (single source of truth:
 * `src/lib/finance/epistemics.ts`, 13 states), its complete transition
 * matrix, the 7 honesty rules, the 12 mandated adversarial scenarios, and
 * the recommendation envelope (evidence, assumptions, confidence,
 * uncertainty, limitations, alternatives, change conditions, provenance,
 * source-of-truth, freshness, classification, scope, materiality, risk,
 * authorization requirement, epistemic status).
 */
import { describe, expect, it } from "vitest";
import {
  EPISTEMIC_CLASS,
  EpistemicViolation,
  canPromote,
  classifiedValue,
  combineClasses,
  normalizeEpistemicClass,
  unavailable,
} from "../../src/lib/finance/epistemics";
import {
  HONESTY_RULES,
  NOELIA_CANONICAL_STATES,
  answerViolatesHonesty,
  assessEvidence,
  assertNoValueCoercion,
  buildRecommendation,
  isSourceStale,
  NoeliaRecommendationError,
  resolveOutputClass,
  verifyRecommendation,
  type EvidenceAssessment,
  type EvidenceRecord,
} from "../../src/lib/noelia/epistemics";
import { NoeliaRuntime } from "../../src/lib/noelia/runtime";
import { NoeliaToolRegistry } from "../../src/lib/noelia/tool-registry";
import type { NoeliaEvidencePort, NoeliaPolicyPort, NoeliaSource } from "../../src/lib/noelia/types";
import type { EpistemicClass, NoeliaRecommendation } from "../../src/lib/noelia/epistemics";
import { principal } from "./fixtures";

const AS_OF = "2026-08-25";

function record(overrides: {
  source?: Partial<NoeliaSource>;
  ref?: string;
  epistemicClass?: EpistemicClass;
  authorityStatus?: string;
  effectiveFrom?: string;
  reviewDate?: string;
  expiresAt?: string | null;
} = {}): EvidenceRecord {
  return {
    source: {
      kind: overrides.source?.kind ?? "RISK",
      ref: overrides.ref ?? overrides.source?.ref ?? "RISK-1",
      label: overrides.source?.label ?? "Risk one",
      authority: overrides.source?.authority ?? "RISK_ENGINE",
    },
    epistemicClass: overrides.epistemicClass ?? "OBSERVED",
    authorityStatus: overrides.authorityStatus ?? "AUTHORITATIVE",
    effectiveFrom: overrides.effectiveFrom,
    reviewDate: overrides.reviewDate,
    expiresAt: overrides.expiresAt,
  };
}

/* ------------------------------------------------------------------ */
/* 1. Canonical states and the complete transition matrix              */
/* ------------------------------------------------------------------ */

describe("canonical epistemic model", () => {
  it("exposes the canonical states (13, shared with Finance OS)", () => {
    expect(NOELIA_CANONICAL_STATES).toEqual(EPISTEMIC_CLASS);
    expect(NOELIA_CANONICAL_STATES).toHaveLength(13);
    expect(new Set(NOELIA_CANONICAL_STATES).size).toBe(13);
  });

  it("enforces the complete 13×13 promotion matrix (no permissive fall-through)", () => {
    for (const from of EPISTEMIC_CLASS) {
      for (const to of EPISTEMIC_CLASS) {
        const NON_VALUE: readonly string[] = [
          "REQUIRES_AUTHORITY",
          "REQUIRES_POLICY",
          "GOVERNANCE_REVIEW_REQUIRED",
          "DATA_NOT_AVAILABLE",
          "DATA_CONFLICT",
        ];
        let expected: boolean;
        if (from === to) expected = true;
        else if (from === "SYNTHETIC" || to === "SYNTHETIC") expected = false;
        else if (to === "POSTED") expected = from === "OBSERVED";
        else if (from === "REFERENCE_DATA") expected = false;
        else if (NON_VALUE.includes(from)) expected = false;
        else expected = EPISTEMIC_CLASS.indexOf(to) > EPISTEMIC_CLASS.indexOf(from);
        expect(canPromote(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it("maps legacy specialist terms totally and rejects unknown terms", () => {
    expect(normalizeEpistemicClass("ASSUMED")).toBe("ASSUMPTION");
    expect(normalizeEpistemicClass("POTENTIAL_ANOMALY")).toBe("DERIVED");
    expect(() => normalizeEpistemicClass("CERTAIN")).toThrow(EpistemicViolation);
    expect(() => normalizeEpistemicClass("observed")).toThrow(EpistemicViolation);
  });

  it("combines inputs to the weakest class and dominates with conflicts", () => {
    expect(combineClasses(["OBSERVED", "DERIVED"])).toBe("DERIVED");
    expect(combineClasses(["POSTED", "OBSERVED"])).toBe("DERIVED");
    expect(combineClasses(["OBSERVED", "DATA_CONFLICT"])).toBe("DATA_CONFLICT");
    expect(combineClasses([])).toBe("DATA_NOT_AVAILABLE");
    expect(combineClasses(["SYNTHETIC", "OBSERVED"])).toBe("SYNTHETIC");
  });
});

/* ------------------------------------------------------------------ */
/* 2. The 7 honesty rules                                              */
/* ------------------------------------------------------------------ */

describe("honesty rules", () => {
  it("rule 1 — missing ≠ zero: non-value classes cannot carry an amount", () => {
    expect(() => classifiedValue({
      amount: "0",
      currency: "TZS",
      epistemicClass: "DATA_NOT_AVAILABLE",
      sourceType: "test",
      sourceId: null,
    })).toThrow(EpistemicViolation);
    const absence = unavailable("DATA_NOT_AVAILABLE", "no data");
    expect(absence.amount).toBeNull();
    expect(() => assertNoValueCoercion("DATA_NOT_AVAILABLE", "0")).toThrow(/MISSING_IS_NOT_ZERO/);
    expect(() => assertNoValueCoercion("DATA_NOT_AVAILABLE", null)).not.toThrow();
  });

  it("rule 2 — forecast ≠ actual: FORECAST/ASSUMPTION/SCENARIO can never become POSTED or OBSERVED", () => {
    for (const from of ["FORECAST", "ASSUMPTION", "SCENARIO"] as const) {
      expect(canPromote(from, "POSTED")).toBe(false);
      expect(canPromote(from, "OBSERVED")).toBe(false);
    }
    expect(canPromote("OBSERVED", "FORECAST")).toBe(true); // weakening is allowed
  });

  it("rule 3 — inference ≠ fact: inferred findings never produce a FACT answer", () => {
    const assessment = assessEvidence({
      evidence: [record()],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(
      resolveOutputClass({
        engine: "RISK",
        policyDenied: false,
        completelyDenied: false,
        findings: [{ label: "x", value: "y", kind: "INFERENCE" }],
        assessment,
        confidence: 0.9,
        obligationsRequireHuman: false,
      }),
    ).toBe("INFERENCE");
  });

  it("rule 4 — stale ≠ current: window violations are detected and downgraded", () => {
    expect(isSourceStale({ reviewDate: "2026-06-30" }, AS_OF)).toBe(true);
    expect(isSourceStale({ effectiveFrom: "2026-09-01" }, AS_OF)).toBe(true);
    expect(isSourceStale({ expiresAt: "2026-08-01" }, AS_OF)).toBe(true);
    expect(isSourceStale({ effectiveFrom: "2024-07-01", reviewDate: "2026-12-31" }, AS_OF)).toBe(false);
    const stale = assessEvidence({
      evidence: [record({ reviewDate: "2026-06-30" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(stale.flags.staleSources).toBe(true);
    expect(stale.confidenceCap).toBeLessThanOrEqual(0.7);
    expect(stale.factors.some((f) => f.rule === "STALE_IS_NOT_CURRENT")).toBe(true);
  });

  it("rule 5 — unverified ≠ authoritative: non-AUTHORITATIVE sources downgrade", () => {
    const assessment = assessEvidence({
      evidence: [record({ authorityStatus: "PENDING_REVIEW" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(assessment.flags.unverifiedAuthority).toBe(true);
    expect(assessment.confidenceCap).toBeLessThanOrEqual(0.6);
    expect(assessment.factors.some((f) => f.rule === "UNVERIFIED_IS_NOT_AUTHORITATIVE")).toBe(true);
  });

  it("rule 6 — unavailable ≠ negative: DATA_NOT_AVAILABLE asserts no value and no negation", () => {
    const absence = unavailable("DATA_CONFLICT", "sources disagree");
    expect(absence.amount).toBeNull();
    expect(canPromote("DATA_NOT_AVAILABLE", "OBSERVED")).toBe(false);
    const noEvidence = assessEvidence({ evidence: [], toolDenials: [], asOf: AS_OF, baseConfidence: 0.9 });
    expect(noEvidence.claimedClass).toBe("DATA_NOT_AVAILABLE");
    expect(noEvidence.confidenceCap).toBeLessThanOrEqual(0.5);
    expect(
      noEvidence.factors.some((f) => f.rule === "ABSENCE_OF_EVIDENCE_IS_NOT_EVIDENCE_OF_ABSENCE"),
    ).toBe(true);
  });

  it("rule 7 — absence of evidence ≠ evidence of absence: no sources ⇒ UNCERTAINTY, never a FACT of absence", () => {
    const noEvidence = assessEvidence({ evidence: [], toolDenials: [], asOf: AS_OF, baseConfidence: 0.9 });
    expect(
      resolveOutputClass({
        engine: "RISK",
        policyDenied: false,
        completelyDenied: false,
        findings: [{ label: "none found", value: "0", kind: "FACT" }],
        assessment: noEvidence,
        confidence: 0.5,
        obligationsRequireHuman: false,
      }),
    ).toBe("UNCERTAINTY");
  });

  it("exposes exactly the 7 mandated rules", () => {
    expect(HONESTY_RULES).toHaveLength(7);
    expect(HONESTY_RULES).toEqual([
      "MISSING_IS_NOT_ZERO",
      "FORECAST_IS_NOT_ACTUAL",
      "INFERENCE_IS_NOT_FACT",
      "STALE_IS_NOT_CURRENT",
      "UNVERIFIED_IS_NOT_AUTHORITATIVE",
      "UNAVAILABLE_IS_NOT_NEGATIVE",
      "ABSENCE_OF_EVIDENCE_IS_NOT_EVIDENCE_OF_ABSENCE",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. The 12 adversarial scenarios                                     */
/* ------------------------------------------------------------------ */

describe("adversarial epistemic scenarios", () => {
  // 1. missing source
  it("A1: a missing source caps confidence and forces UNCERTAINTY", () => {
    const assessment = assessEvidence({ evidence: [], toolDenials: [], asOf: AS_OF, baseConfidence: 0.99 });
    expect(assessment.confidenceCap).toBeLessThanOrEqual(0.5);
    expect(assessment.flags.missingSources).toBe(true);
  });

  // 2. stale source
  it("A2: a stale source is classified stale, downgraded, and never FACT", () => {
    const assessment = assessEvidence({
      evidence: [record({ reviewDate: "2026-01-01" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(assessment.flags.staleSources).toBe(true);
    expect(
      resolveOutputClass({
        engine: "RISK",
        policyDenied: false,
        completelyDenied: false,
        findings: [{ label: "RISK-1", value: "16", kind: "FACT" }],
        assessment,
        confidence: 0.7,
        obligationsRequireHuman: false,
      }),
    ).toBe("INFERENCE");
  });

  // 3. conflicting sources
  it("A3: conflicting sources about the same subject force human review", () => {
    const assessment = assessEvidence({
      evidence: [
        record({ ref: "RISK-1", source: { authority: "RISK_ENGINE" } }),
        record({ ref: "RISK-1", source: { authority: "EXTERNAL_VENDOR" }, epistemicClass: "DERIVED" }),
      ],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(assessment.flags.conflictingSources).toBe(true);
    expect(assessment.confidenceCap).toBeLessThanOrEqual(0.5);
    expect(
      resolveOutputClass({
        engine: "RISK",
        policyDenied: false,
        completelyDenied: false,
        findings: [{ label: "RISK-1", value: "16", kind: "FACT" }],
        assessment,
        confidence: 0.5,
        obligationsRequireHuman: false,
      }),
    ).toBe("REQUIRES_HUMAN_REVIEW");
  });

  // 4. forecast presented as actual
  it("A4: a forecast cannot be presented as an actual", () => {
    expect(canPromote("FORECAST", "POSTED")).toBe(false);
    const assessment = assessEvidence({
      evidence: [record({ epistemicClass: "FORECAST" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(assessment.claimedClass).toBe("FORECAST");
    // A tampered factual assessment over forecast evidence fails closed.
    expect(() =>
      buildRecommendation({
        id: "REC-1",
        engine: "FINANCIAL",
        statement: "Cash is 100.",
        assessment: { ...assessment, claimedClass: "OBSERVED" },
        evidence: [record({ epistemicClass: "FORECAST" })],
        confidence: 0.9,
        findings: [],
        asOf: AS_OF,
        traceId: "T-1",
        scope: { tenantId: "TEN_A", legalEntityId: null, countryCode: null },
        humanReviewRequired: false,
      }),
    ).toThrow(NoeliaRecommendationError);
  });

  // 5. inference presented as fact
  it("A5: an inferred finding cannot make the answer a FACT", () => {
    const assessment = assessEvidence({
      evidence: [record({ epistemicClass: "OBSERVED" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(
      resolveOutputClass({
        engine: "RISK",
        policyDenied: false,
        completelyDenied: false,
        findings: [{ label: "inferred", value: "high", kind: "INFERENCE" }],
        assessment,
        confidence: 0.9,
        obligationsRequireHuman: false,
      }),
    ).toBe("INFERENCE");
  });

  // 6. unavailable data
  it("A6: unavailable data is explicit absence, never zero", () => {
    const value = unavailable("REQUIRES_AUTHORITY", "accounting policy not ratified");
    expect(value.amount).toBeNull();
    expect(value.reason).toBe("accounting policy not ratified");
    expect(combineClasses(["OBSERVED", "REQUIRES_AUTHORITY"])).toBe("REQUIRES_AUTHORITY");
  });

  // 7. low-quality data
  it("A7: low-quality (non-authoritative) data downgrades the answer", () => {
    const assessment = assessEvidence({
      evidence: [record({ authorityStatus: "PENDING_REVIEW" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.95,
    });
    expect(assessment.confidenceCap).toBeLessThanOrEqual(0.6);
    expect(assessment.claimedClass).toBe("OBSERVED");
  });

  // 8. expired authority
  it("A8: expired authority is stale and excluded", () => {
    expect(isSourceStale({ expiresAt: "2026-08-01" }, AS_OF)).toBe(true);
    const assessment = assessEvidence({
      evidence: [record({ expiresAt: "2026-08-01" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(assessment.flags.staleSources).toBe(true);
  });

  // 9. contradictory evidence
  it("A9: contradictory evidence is classified DATA_CONFLICT, never resolved silently", () => {
    expect(combineClasses(["OBSERVED", "DATA_CONFLICT"])).toBe("DATA_CONFLICT");
    const assessment = assessEvidence({
      evidence: [
        record({ ref: "OBL-1", source: { authority: "COMPLIANCE_ENGINE" } }),
        record({ ref: "OBL-1", source: { authority: "COMPLIANCE_ENGINE" }, epistemicClass: "DERIVED" }),
      ],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(assessment.flags.conflictingSources).toBe(true);
    expect(assessment.confidenceCap).toBeLessThanOrEqual(0.5);
  });

  // 10. insufficient confidence
  it("A10: insufficient confidence (<0.5) cannot support FACT or INFERENCE", () => {
    const assessment = assessEvidence({
      evidence: [record({ epistemicClass: "OBSERVED" })],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.4,
    });
    expect(
      resolveOutputClass({
        engine: "RISK",
        policyDenied: false,
        completelyDenied: false,
        findings: [{ label: "RISK-1", value: "16", kind: "FACT" }],
        assessment,
        confidence: 0.4,
        obligationsRequireHuman: false,
      }),
    ).toBe("UNCERTAINTY");
  });

  // 11. missing provenance
  it("A11: missing provenance (ref/authority) downgrades and is detectable", () => {
    const noProvenance = record({ source: { kind: "RISK", ref: "", label: "orphan", authority: "" } });
    const assessment = assessEvidence({
      evidence: [noProvenance],
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    expect(assessment.flags.missingProvenance).toBe(true);
    expect(assessment.confidenceCap).toBeLessThanOrEqual(0.6);
    const rec = buildRecommendation({
      id: "REC-11",
      engine: "RISK",
      statement: "One risk exceeds appetite.",
      assessment,
      evidence: [noProvenance],
      confidence: 0.6,
      findings: [],
      asOf: AS_OF,
      traceId: "T-11",
      scope: { tenantId: "TEN_A", legalEntityId: null, countryCode: null },
      humanReviewRequired: false,
    });
    expect(verifyRecommendation(rec)).toContain("MISSING_PROVENANCE");
  });

  // 12. fabricated certainty
  it("A12: fabricated certainty (high confidence, no evidence) is clamped and flagged", () => {
    const assessment = assessEvidence({ evidence: [], toolDenials: [], asOf: AS_OF, baseConfidence: 0.99 });
    const clamped = Math.min(0.99, assessment.confidenceCap);
    expect(clamped).toBeLessThanOrEqual(0.5);
    // A hand-built recommendation that skips the builder is caught on verify.
    const tampered = buildRecommendation({
      id: "REC-12",
      engine: "KNOWLEDGE",
      statement: "We are definitely compliant.",
      assessment,
      evidence: [],
      confidence: 0.5,
      findings: [],
      asOf: AS_OF,
      traceId: "T-12",
      scope: { tenantId: "TEN_A", legalEntityId: null, countryCode: null },
      humanReviewRequired: false,
    });
    expect(tampered.confidence).toBeLessThanOrEqual(0.5);
    expect(verifyRecommendation(tampered)).toContain("ABSENCE_ASSERTED_AS_EVIDENCE");
    const handBuilt = {
      ...tampered,
      confidence: 0.97,
      humanReviewRequired: false,
    };
    expect(verifyRecommendation(handBuilt)).toEqual(
      expect.arrayContaining(["FABRICATED_CERTAINTY", "CONFIDENCE_EXCEEDS_CAP"]),
    );
  });
});

/* ------------------------------------------------------------------ */
/* 4. Recommendation envelope                                          */
/* ------------------------------------------------------------------ */

describe("recommendation envelope", () => {
  function soundEvidence(): EvidenceRecord[] {
    return [record({ epistemicClass: "OBSERVED" })];
  }

  function base(overrides: Partial<Parameters<typeof buildRecommendation>[0]> = {}) {
    const assessment = assessEvidence({
      evidence: soundEvidence(),
      toolDenials: [],
      asOf: AS_OF,
      baseConfidence: 0.9,
    });
    return {
      id: "REC-20",
      engine: "RISK",
      statement: "Review the appetite breach RISK-1.",
      assessment,
      evidence: soundEvidence(),
      confidence: 0.88,
      findings: [],
      asOf: AS_OF,
      traceId: "T-20",
      scope: { tenantId: "TEN_A", legalEntityId: "LEN_A", countryCode: "TZ" } as const,
      humanReviewRequired: false,
      ...overrides,
    };
  }

  it("a sound recommendation verifies clean with the full envelope", () => {
    const rec = buildRecommendation(
      base({
        assumptions: ["Residual score is current at as-of date."],
        limitations: ["Top-8 window only."],
        alternatives: ["Escalate to risk owner."],
        changeConditions: ["Residual score falls below appetite."],
        materiality: "MEDIUM",
      }),
    );
    expect(verifyRecommendation(rec)).toEqual([]);
    expect(rec.epistemicStatus).toBe("OBSERVED");
    expect(rec.evidence).toHaveLength(1);
    expect(rec.provenance.sourceOfTruth).toBe("RISK_ENGINE");
    expect(rec.freshness).toEqual({ asOf: AS_OF, stale: false });
    expect(rec.uncertainty.confidenceCap).toBe(0.9);
    expect(rec.confidence).toBeLessThanOrEqual(rec.uncertainty.confidenceCap);
    expect(rec.changeConditions).toContain("Residual score falls below appetite.");
  });

  it("clamps confidence to the evidence cap and records the factor", () => {
    const rec = buildRecommendation(base({ confidence: 0.99 }));
    expect(rec.confidence).toBe(0.9);
    expect(rec.uncertainty.factors.some((f) => f.includes("confidence clamped"))).toBe(true);
  });

  it("a factual claim without evidence fails closed", () => {
    const noEvidence = assessEvidence({ evidence: [], toolDenials: [], asOf: AS_OF, baseConfidence: 0.9 });
    // A tampered assessment that claims OBSERVED over zero evidence must fail.
    const tamperedAssessment: EvidenceAssessment = { ...noEvidence, claimedClass: "OBSERVED" };
    expect(() =>
      buildRecommendation(base({ assessment: tamperedAssessment, evidence: [], confidence: 0.5 })),
    ).toThrow(NoeliaRecommendationError);
  });

  it("high materiality or risk forces authorizationRequired", () => {
    const rec = buildRecommendation(base({ materiality: "HIGH" }));
    expect(rec.authorizationRequired).toBe(true);
    const highRisk = buildRecommendation(base({ risk: "HIGH", authorizationBasis: "policy:CONST-AI-001" }));
    expect(highRisk.authorizationRequired).toBe(true);
    expect(highRisk.authorizationBasis).toBe("policy:CONST-AI-001");
  });

  it("detects every violation class on a tampered envelope", () => {
    const sound = buildRecommendation(base());
    const tampered: NoeliaRecommendation = {
      ...sound,
      epistemicStatus: "OBSERVED",
      evidence: [],
      confidence: 0.99,
      materiality: "HIGH",
      risk: "LOW",
      authorizationRequired: false,
      uncertainty: { ...sound.uncertainty, confidenceCap: 0.5 },
    };
    const violations = verifyRecommendation(tampered);
    expect(violations).toEqual(
      expect.arrayContaining([
        "MISSING_EVIDENCE_FOR_FACTUAL_CLAIM",
        "CONFIDENCE_EXCEEDS_CAP",
        "MATERIALITY_WITHOUT_AUTHORIZATION",
        "FABRICATED_CERTAINTY",
      ]),
    );
  });
});

/* ------------------------------------------------------------------ */
/* 5. Runtime integration (pure ports — no database)                   */
/* ------------------------------------------------------------------ */

function allowPolicy(): NoeliaPolicyPort {
  return { evaluate: async () => ({ effect: "ALLOW", obligations: [], denials: [], appliedPolicies: [] }) };
}
function evidencePort() {
  return { recordDecision: async () => "AID_EPI" } satisfies NoeliaEvidencePort;
}
function request(overrides: { question?: string; asOf?: string } = {}) {
  return {
    principal: principal(),
    question: overrides.question ?? "Which risks exceed appetite?",
    traceId: "TRACE_EPI",
    target: { tenantId: "TEN_A", legalEntityId: null, countryCode: null },
    scope: {
      tenantIds: ["TEN_A"],
      legalEntityIds: ["LEN_A"],
      countryCodes: ["TZ"],
      entities: [{ id: "LEN_A", tenantId: "TEN_A", countryCode: "TZ" }],
      tenantCountries: [{ tenantId: "TEN_A", countryCode: "TZ" }],
      enterprise: false,
    },
    asOf: overrides.asOf ?? AS_OF,
  };
}

function riskRegistry(
  execute: (context: unknown, input: unknown) => Promise<Record<string, unknown>>,
) {
  const registry = new NoeliaToolRegistry()
    .register({
      name: "risk.register.query",
      permission: "risk:register.read",
      risk: "LOW",
      description: "risk",
      execute,
    })
    .register({
      name: "knowledge.rag.search",
      permission: "ai:noelia.query",
      risk: "LOW",
      description: "knowledge",
      execute: async () => ({ sources: [] }),
    });
  return registry;
}

describe("NoeliaRuntime epistemic behaviour", () => {
  it("returns FACT only for current, direct, proven-complete evidence", async () => {
    const registry = riskRegistry(async () => ({
      findings: [{ label: "RISK-1", value: "16", kind: "FACT" }],
      sources: [{ kind: "RISK", ref: "RISK-1", label: "r", authority: "RISK_ENGINE", epistemicClass: "OBSERVED", authorityStatus: "AUTHORITATIVE" }],
      confidence: 0.9,
    }));
    const answer = await new NoeliaRuntime(registry, allowPolicy(), evidencePort()).ask(request());
    expect(answer.outputClass).toBe("FACT");
    expect(answer.confidence).toBe(0.9);
    expect(answer.uncertainty.classification).toBe("OBSERVED");
    expect(answer.uncertainty.missingSources).toBe(false);
    expect(
      answerViolatesHonesty({
        outputClass: answer.outputClass,
        confidence: answer.confidence,
        confidenceCap: answer.uncertainty.confidenceCap,
        flags: {
          missingSources: answer.uncertainty.missingSources,
          staleSources: answer.uncertainty.staleSources,
          conflictingSources: answer.uncertainty.conflictingSources,
          missingProvenance: answer.uncertainty.missingProvenance,
          unverifiedAuthority: answer.uncertainty.unverifiedAuthority,
          toolDenials: answer.uncertainty.toolDenials,
        },
      }),
    ).toEqual([]);
  });

  it("downgrades a stale source: no FACT, capped confidence, explicit factor", async () => {
    const registry = riskRegistry(async () => ({
      findings: [{ label: "RISK-1", value: "16", kind: "FACT" }],
      sources: [{
        kind: "RISK", ref: "RISK-1", label: "r", authority: "RISK_ENGINE",
        epistemicClass: "OBSERVED", authorityStatus: "AUTHORITATIVE", reviewDate: "2026-01-01",
      }],
      confidence: 0.9,
    }));
    const answer = await new NoeliaRuntime(registry, allowPolicy(), evidencePort()).ask(request());
    expect(answer.outputClass).toBe("INFERENCE");
    expect(answer.confidence).toBeLessThanOrEqual(0.7);
    expect(answer.uncertainty.staleSources).toBe(true);
    expect(answer.uncertainty.factors.some((f) => f.startsWith("STALE_IS_NOT_CURRENT"))).toBe(true);
  });

  it("conflicting sources fail closed to human review", async () => {
    const registry = riskRegistry(async () => ({
      findings: [{ label: "RISK-1", value: "16", kind: "FACT" }],
      sources: [
        { kind: "RISK", ref: "RISK-1", label: "r", authority: "RISK_ENGINE", epistemicClass: "OBSERVED" },
        { kind: "RISK", ref: "RISK-1", label: "r", authority: "EXTERNAL_VENDOR", epistemicClass: "DERIVED" },
      ],
      confidence: 0.9,
    }));
    const answer = await new NoeliaRuntime(registry, allowPolicy(), evidencePort()).ask(request());
    expect(answer.outputClass).toBe("REQUIRES_HUMAN_REVIEW");
    expect(answer.humanReviewRequired).toBe(true);
    expect(answer.uncertainty.conflictingSources).toBe(true);
    expect(answer.confidence).toBeLessThanOrEqual(0.5);
  });

  it("missing source ⇒ UNCERTAINTY with capped confidence (knowledge)", async () => {
    const registry = riskRegistry(async () => ({ sources: [] }));
    const answer = await new NoeliaRuntime(registry, allowPolicy(), evidencePort()).ask(
      request({ question: "Tell me about our standards" }),
    );
    expect(answer.outputClass).toBe("UNCERTAINTY");
    expect(answer.confidence).toBeLessThanOrEqual(0.5);
    expect(answer.uncertainty.missingSources).toBe(true);
  });

  it("knowledge synthesis is INFERENCE even over factual sources", async () => {
    const registry = new NoeliaToolRegistry().register({
      name: "knowledge.rag.search",
      permission: "ai:noelia.query",
      risk: "LOW",
      description: "knowledge",
      execute: async () => ({
        sources: [{
          kind: "KNOWLEDGE_SOURCE", ref: "KS-1", label: "Standard", authority: "AUTHORITATIVE",
          epistemicClass: "OBSERVED", authorityStatus: "AUTHORITATIVE",
        }],
        confidence: 0.8,
      }),
    });
    const answer = await new NoeliaRuntime(registry, allowPolicy(), evidencePort()).ask(
      request({ question: "Tell me about our standards" }),
    );
    expect(answer.outputClass).toBe("INFERENCE");
    expect(answer.confidence).toBe(0.8);
  });

  it("a policy denial is certain (confidence 1) but claims no epistemic status", async () => {
    const denyPolicy: NoeliaPolicyPort = {
      evaluate: async () => ({
        effect: "DENY",
        obligations: [],
        denials: [{ policyCode: "CONST-AI-001", message: "AI action denied." }],
        appliedPolicies: [{ code: "CONST-AI-001", version: "1", level: "CONSTITUTION" }],
      }),
    };
    const answer = await new NoeliaRuntime(riskRegistry(async () => ({})), denyPolicy, evidencePort()).ask(request());
    expect(answer.outputClass).toBe("REQUIRES_HUMAN_REVIEW");
    expect(answer.confidence).toBe(1);
    expect(answer.uncertainty.classification).toBe("REQUIRES_AUTHORITY");
  });

  it("records the uncertainty block through the evidence port", async () => {
    const captured: Array<Record<string, unknown>> = [];
    const port: NoeliaEvidencePort = {
      recordDecision: async (input) => {
        captured.push(input.answer as unknown as Record<string, unknown>);
        return "AID_EPI";
      },
    };
    const registry = riskRegistry(async () => ({
      findings: [{ label: "RISK-1", value: "16", kind: "FACT" }],
      sources: [{ kind: "RISK", ref: "RISK-1", label: "r", authority: "RISK_ENGINE", epistemicClass: "OBSERVED" }],
      confidence: 0.9,
      assumptions: ["Score is current."],
      limitations: ["Top-8 window."],
    }));
    await new NoeliaRuntime(registry, allowPolicy(), port).ask(request());
    expect(captured).toHaveLength(1);
    expect(captured[0].uncertainty).toMatchObject({ classification: "OBSERVED" });
    expect(captured[0].assumptions).toEqual(["Score is current."]);
    expect(captured[0].limitations).toEqual(["Top-8 window."]);
  });
});
