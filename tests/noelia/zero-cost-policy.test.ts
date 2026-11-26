/**
 * Zero-cost AI policy — unit contract.
 *
 * This suite exists because the zero-cost constraint is the highest-priority
 * operational requirement of the NOELIA programme, and a constraint that is
 * only documented is a constraint that will be violated by the first person
 * who needs a model to work.
 *
 * The tests are written adversarially: most of them assert that something is
 * REFUSED. A policy suite that mostly asserts success proves nothing.
 */
import { describe, expect, it } from "vitest";
import {
  COST_CLASSES,
  DEFAULT_ZERO_COST_CONFIG,
  ZERO_COST_ATTESTATION,
  classifyProviderCost,
  evaluateZeroCost,
  isCostClass,
  isDeploymentKind,
  resolveZeroCostPolicyConfig,
  type ProviderCostDeclaration,
} from "@/lib/noelia/zero-cost-policy";

/** A declaration that should be allowed: local, free, no billing relationship. */
function localFree(overrides: Partial<ProviderCostDeclaration> = {}): ProviderCostDeclaration {
  return {
    costClass: "LOCAL_FREE",
    deployment: "LOCAL",
    requiresPaymentDetails: false,
    canTransitionToPaid: false,
    reliesOnTrialCredits: false,
    humanVerified: true,
    ...overrides,
  };
}

describe("default posture denies", () => {
  it("has no path to spend by default", () => {
    expect(DEFAULT_ZERO_COST_CONFIG.remoteInferenceEnabled).toBe(false);
    expect(DEFAULT_ZERO_COST_CONFIG.allowFreeHosted).toBe(false);
  });

  it("denies a provider with no cost declaration at all", () => {
    const decision = evaluateZeroCost(null);
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_COST_UNKNOWN");
    expect(decision.reason).toBe("NO_DECLARATION");
  });

  it("denies an explicitly UNKNOWN cost class rather than assuming free", () => {
    const decision = evaluateZeroCost(localFree({ costClass: "UNKNOWN" }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_COST_UNKNOWN");
  });

  it("denies a cost class that is not in the governed set", () => {
    const decision = evaluateZeroCost(localFree({ costClass: "CHEAP" as never }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_COST_UNKNOWN");
  });
});

describe("paid and trial providers are prohibited", () => {
  it("denies a PAID provider", () => {
    const decision = evaluateZeroCost(localFree({ costClass: "PAID" }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_PAID");
  });

  it("denies a TRIAL provider even when it is currently free to use", () => {
    const decision = evaluateZeroCost(localFree({ costClass: "TRIAL" }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_TRIAL");
    // The reason must explain WHY, or an operator will retry it tomorrow.
    expect(decision.explanation).toMatch(/expire|promotional/i);
  });

  it("denies a provider that needs payment details even when it is labelled LOCAL_FREE", () => {
    const decision = evaluateZeroCost(localFree({ requiresPaymentDetails: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_PAID");
  });

  it("denies a provider that can transition to paid even when labelled LOCAL_FREE", () => {
    const decision = evaluateZeroCost(localFree({ canTransitionToPaid: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_PAID");
  });

  it("denies a provider relying on trial credits even when labelled LOCAL_FREE", () => {
    const decision = evaluateZeroCost(localFree({ reliesOnTrialCredits: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_TRIAL");
  });

  it("cannot be lifted by enabling every policy flag", () => {
    const permissive = { remoteInferenceEnabled: true, allowFreeHosted: true };
    const decision = evaluateZeroCost(localFree({ costClass: "PAID" }), permissive);
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_PAID");
  });
});

describe("remote inference is disabled by default", () => {
  it("denies a remote provider while remote inference is off", () => {
    const decision = evaluateZeroCost(
      localFree({ costClass: "FREE_HOSTED", deployment: "REMOTE" }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_REMOTE_INFERENCE");
  });

  it("denies an unverified hosted free tier even when remote inference is enabled", () => {
    const decision = evaluateZeroCost(
      localFree({ costClass: "FREE_HOSTED", deployment: "REMOTE", humanVerified: false }),
      { remoteInferenceEnabled: true, allowFreeHosted: true },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_HOSTED_REQUIRES_APPROVAL");
    expect(decision.reason).toBe("HOSTED_UNVERIFIED");
  });

  it("denies a verified hosted tier when hosted use is not authorized", () => {
    const decision = evaluateZeroCost(
      localFree({ costClass: "FREE_HOSTED", deployment: "REMOTE", humanVerified: true }),
      { remoteInferenceEnabled: true, allowFreeHosted: false },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_HOSTED_REQUIRES_APPROVAL");
    expect(decision.reason).toBe("HOSTED_DISABLED");
  });

  it("allows a verified, authorized hosted tier only when BOTH flags are set", () => {
    const decision = evaluateZeroCost(
      localFree({ costClass: "FREE_HOSTED", deployment: "REMOTE", humanVerified: true }),
      { remoteInferenceEnabled: true, allowFreeHosted: true },
    );
    expect(decision.allowed).toBe(true);
    expect(decision.verdict).toBe("ALLOWED");
  });
});

describe("local execution is permitted", () => {
  it("allows a local free model", () => {
    const decision = evaluateZeroCost(localFree());
    expect(decision.allowed).toBe(true);
    expect(decision.costClass).toBe("LOCAL_FREE");
  });

  it("allows a self-hosted free model (BEYU's own hardware)", () => {
    const decision = evaluateZeroCost(localFree({ deployment: "SELF_HOSTED" }));
    expect(decision.allowed).toBe(true);
  });

  it("denies a LOCAL_FREE claim with no recorded deployment shape, AS UNKNOWN cost", () => {
    // Deliberate: a free claim with no deployment shape cannot be confirmed, so
    // the honest verdict is "cost unknown", not "malformed input". The two
    // differ because UNKNOWN maps to "go verify the provider", while a
    // malformed-declaration verdict would suggest fixing the form. The form is
    // not the problem — the missing evidence is.
    const decision = evaluateZeroCost(localFree({ deployment: undefined as never }));
    expect(decision.allowed).toBe(false);
    expect(decision.verdict).toBe("DENIED_COST_UNKNOWN");
    expect(decision.costClass).toBe("UNKNOWN");
  });
});

describe("classification cannot be talked upward by the declaration", () => {
  it("refuses to call a remote provider LOCAL_FREE", () => {
    const costClass = classifyProviderCost(localFree({ deployment: "REMOTE" }));
    expect(costClass).not.toBe("LOCAL_FREE");
    expect(costClass).toBe("UNKNOWN");
  });

  it("keeps LOCAL_FREE for a genuinely local deployment", () => {
    expect(classifyProviderCost(localFree())).toBe("LOCAL_FREE");
  });

  it("returns UNKNOWN for a missing declaration", () => {
    expect(classifyProviderCost(null)).toBe("UNKNOWN");
    expect(classifyProviderCost(undefined)).toBe("UNKNOWN");
  });

  it("has no cost class outside the governed set", () => {
    for (const costClass of COST_CLASSES) expect(isCostClass(costClass)).toBe(true);
    expect(isCostClass("FREE_TIER_MAYBE")).toBe(false);
    expect(isDeploymentKind("CLOUD")).toBe(false);
  });
});

describe("configuration is fail-closed", () => {
  it("treats any unexpected value as off", () => {
    expect(resolveZeroCostPolicyConfig({} as NodeJS.ProcessEnv)).toEqual(DEFAULT_ZERO_COST_CONFIG);
    expect(resolveZeroCostPolicyConfig({ BEYU_ALLOW_REMOTE_AI_INFERENCE: "yes" } as never).remoteInferenceEnabled).toBe(false);
    expect(resolveZeroCostPolicyConfig({ BEYU_ALLOW_REMOTE_AI_INFERENCE: "" } as never).remoteInferenceEnabled).toBe(false);
    expect(resolveZeroCostPolicyConfig({ BEYU_ALLOW_FREE_HOSTED_AI: "TRUE " } as never).allowFreeHosted).toBe(false);
  });

  it("accepts only the two explicit enable tokens", () => {
    expect(resolveZeroCostPolicyConfig({ BEYU_ALLOW_REMOTE_AI_INFERENCE: "1" } as never).remoteInferenceEnabled).toBe(true);
    expect(resolveZeroCostPolicyConfig({ BEYU_ALLOW_FREE_HOSTED_AI: "true" } as never).allowFreeHosted).toBe(true);
  });
});

describe("attestation states what cannot be verified", () => {
  it("records zero new spend", () => {
    expect(ZERO_COST_ATTESTATION.authorizedNewSpendUsd).toBe(0);
    expect(ZERO_COST_ATTESTATION.paidApiCalls).toBe(0);
    expect(ZERO_COST_ATTESTATION.trialCreditsUsed).toBe(0);
    expect(ZERO_COST_ATTESTATION.automaticPaidFallbacks).toBe(0);
  });

  it("does NOT claim to have verified account-level billing", () => {
    // This is the honesty assertion. The application cannot inspect a cloud
    // account's billing configuration, so it must not assert that cost is zero
    // at the account level. If this ever flips to true, it must be because a
    // real verification step was added — not because the claim was convenient.
    expect(ZERO_COST_ATTESTATION.accountBillingVerified).toBe(false);
    expect(ZERO_COST_ATTESTATION.existingInfrastructureCostStatus).toBe("NOT_INSPECTED");
  });
});
