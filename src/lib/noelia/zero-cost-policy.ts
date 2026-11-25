/**
 * BEYU zero-cost AI policy — the single authority for "may this model run?".
 *
 * CONSTITUTIONAL CONSTRAINT
 *   NOELIA must never incur a new financial charge. That is not a preference;
 *   it is an operational limit on the whole platform. This module is where that
 *   limit is actually enforced, and it deliberately enforces it by DENIAL:
 *   anything whose cost cannot be positively demonstrated to be zero is
 *   unavailable.
 *
 * WHY A SEPARATE MODULE
 *   The governed model gateway already decides *whether* a request may reach a
 *   runtime (registry approval, classification, jurisdiction, residency). This
 *   module answers a different and narrower question: *does executing it cost
 *   money?* Keeping the two separate means neither can silently substitute for
 *   the other — a model can be perfectly approved and still be cost-blocked.
 *
 * FAIL-CLOSED
 *   `classifyProviderCost` returns UNKNOWN for anything it cannot positively
 *   verify. UNKNOWN is not "probably fine": it is blocked. The default verdict
 *   of `evaluateZeroCost` for an unknown cost class is DENY.
 *
 * WHAT THIS MODULE CANNOT DO
 *   It cannot inspect a cloud account's billing configuration, and it does not
 *   pretend to. It classifies what BEYU has *declared and verified* about a
 *   provider and refuses to extrapolate. A provider claiming a free tier is not
 *   evidence of freedom from charge (free tiers routinely require a card and
 *   convert to paid); such a provider is classified PROHIBITED_ZERO_COST_POLICY
 *   until a human independently verifies and records the evidence.
 */

/* --------------------------------------------------------------------------
 * Cost classes. Only LOCAL_FREE is authorized without a human decision.
 * ------------------------------------------------------------------------ */

export const COST_CLASSES = [
  /** Open-weight model executed on BEYU-owned hardware. No marginal cost. */
  "LOCAL_FREE",
  /** A hosted free tier with no billing, card, credits or paid conversion.
   *  Requires explicit human authorization even when verified. */
  "FREE_HOSTED",
  /** Promotional/temporary credits, or a free window that expires. PROHIBITED. */
  "TRIAL",
  /** Billed per token/call/seat. PROHIBITED. */
  "PAID",
  /** Not established. DISABLED — never assume free. */
  "UNKNOWN",
] as const;

export type CostClass = (typeof COST_CLASSES)[number];

/** Deployment shapes the policy distinguishes. */
export const DEPLOYMENT_KINDS = ["LOCAL", "SELF_HOSTED", "REMOTE"] as const;
export type DeploymentKind = (typeof DEPLOYMENT_KINDS)[number];

/**
 * The zero-cost verdict. Note `PROHIBITED_ZERO_COST_POLICY` is a *policy*
 * outcome, distinct from a registry/approval failure — surfaces must report
 * which one blocked a model, or an operator will "fix" the wrong thing.
 */
export const ZERO_COST_VERDICTS = [
  "ALLOWED",
  "DENIED_COST_UNKNOWN",
  "DENIED_PAID",
  "DENIED_TRIAL",
  "DENIED_REMOTE_INFERENCE",
  "DENIED_HOSTED_REQUIRES_APPROVAL",
  "DENIED_MALFORMED_DECLARATION",
] as const;

export type ZeroCostVerdict = (typeof ZERO_COST_VERDICTS)[number];

export type ZeroCostDecision = {
  allowed: boolean;
  verdict: ZeroCostVerdict;
  costClass: CostClass;
  /** Stable machine key for surfaced diagnostics; never localized. */
  reason: string;
  /** Human-readable explanation. Contains no secrets. */
  explanation: string;
};

/* --------------------------------------------------------------------------
 * Declared cost metadata attached to a provider or model registry row.
 * ------------------------------------------------------------------------ */

/**
 * The declaration BEYU makes about a provider. Every field is evidence-bearing
 * and must be justified; the policy treats absent or contradictory evidence as
 * UNKNOWN rather than inferring a favourable answer.
 */
export type ProviderCostDeclaration = {
  costClass: CostClass;
  deployment: DeploymentKind;
  /** True only when the provider needs no payment instrument to operate. */
  requiresPaymentDetails: boolean;
  /** True when an account can silently begin billing (auto top-up, overage). */
  canTransitionToPaid: boolean;
  /** True when access depends on credits that expire or are promotional. */
  reliesOnTrialCredits: boolean;
  /**
   * Whether a human has independently verified the zero-cost claim. An
   * unverified FREE_HOSTED declaration is not sufficient to run.
   */
  humanVerified: boolean;
};

export type ZeroCostPolicyConfig = {
  /** Remote inference is disabled unless an owner explicitly enables it. */
  remoteInferenceEnabled: boolean;
  /** FREE_HOSTED is disabled unless an owner explicitly authorizes it. */
  allowFreeHosted: boolean;
};

/**
 * Default posture. Every default here denies. Nothing about the default
 * configuration can incur a charge, and there is no code path that flips these
 * on without an explicit server-side environment decision.
 */
export const DEFAULT_ZERO_COST_CONFIG: ZeroCostPolicyConfig = {
  remoteInferenceEnabled: false,
  allowFreeHosted: false,
};

/**
 * Resolve policy configuration from the environment.
 *
 * Deliberately narrow: only the exact strings "1"/"true" enable a flag, so a
 * typo, an empty variable or an unexpected value leaves the safe default in
 * place. This mirrors the fail-closed convention used by ollama-config.ts.
 */
export function resolveZeroCostPolicyConfig(env: NodeJS.ProcessEnv = process.env): ZeroCostPolicyConfig {
  const truthy = (value: string | undefined) => value === "1" || value === "true";
  return {
    remoteInferenceEnabled: truthy(env.BEYU_ALLOW_REMOTE_AI_INFERENCE),
    allowFreeHosted: truthy(env.BEYU_ALLOW_FREE_HOSTED_AI),
  };
}

/* --------------------------------------------------------------------------
 * Classification
 * ------------------------------------------------------------------------ */

const COST_CLASS_SET = new Set<string>(COST_CLASSES);
const DEPLOYMENT_SET = new Set<string>(DEPLOYMENT_KINDS);

export function isCostClass(value: unknown): value is CostClass {
  return typeof value === "string" && COST_CLASS_SET.has(value);
}

export function isDeploymentKind(value: unknown): value is DeploymentKind {
  return typeof value === "string" && DEPLOYMENT_SET.has(value);
}

/**
 * Derive the authoritative cost class for a provider declaration.
 *
 * The declaration includes a `costClass` claim, but the policy does not take
 * that claim at face value — a provider labelled LOCAL_FREE that requires a
 * payment instrument, or that can transition to paid, is reclassified. A
 * self-declared class can only ever make the outcome *stricter*.
 *
 * Returns the class the policy will actually enforce.
 */
export function classifyProviderCost(declaration: Partial<ProviderCostDeclaration> | null | undefined): CostClass {
  if (!declaration) return "UNKNOWN";

  const declared = declaration.costClass;
  if (!isCostClass(declared)) return "UNKNOWN";

  // A remote/self-hosted provider is never LOCAL_FREE regardless of its label:
  // "local" means BEYU-operated hardware, which a hosted endpoint is not.
  const deployment = declaration.deployment;
  const deploymentKnown = isDeploymentKind(deployment);

  // Evidence that contradicts a free claim forces the stricter class.
  if (declaration.reliesOnTrialCredits === true) return "TRIAL";
  if (declaration.requiresPaymentDetails === true) return "PAID";
  if (declaration.canTransitionToPaid === true) return "PAID";

  // A LOCAL_FREE claim is only sustainable when the deployment really is local
  // (or explicitly self-hosted on BEYU infrastructure) and no cost signal exists.
  if (declared === "LOCAL_FREE") {
    if (!deploymentKnown) return "UNKNOWN";
    return deployment === "REMOTE" ? "UNKNOWN" : "LOCAL_FREE";
  }

  return declared;
}

/* --------------------------------------------------------------------------
 * Evaluation
 * ------------------------------------------------------------------------ */

/**
 * Decide whether executing on this provider is permitted under the zero-cost
 * policy. Pure: no database, no network, no environment reads. Callers pass the
 * resolved config so the decision is reproducible in tests.
 *
 * Ordering matters. Payment risk is evaluated before deployment shape, because
 * "it happens to be self-hosted" must never excuse a billing relationship.
 */
export function evaluateZeroCost(
  declaration: Partial<ProviderCostDeclaration> | null | undefined,
  config: ZeroCostPolicyConfig = DEFAULT_ZERO_COST_CONFIG,
): ZeroCostDecision {
  if (!declaration) {
    return deny("UNKNOWN", "DENIED_COST_UNKNOWN", "NO_DECLARATION", "No cost declaration is recorded, so cost is unverified. Unverified cost is treated as billable.");
  }

  const costClass = classifyProviderCost(declaration);

  if (costClass === "UNKNOWN") {
    return deny(costClass, "DENIED_COST_UNKNOWN", "COST_UNVERIFIED", "The provider's cost cannot be positively established as zero. Unverified cost is treated as billable.");
  }

  if (costClass === "PAID") {
    return deny(costClass, "DENIED_PAID", "PAID_PROVIDER", "The provider is billed, requires a payment instrument, or can begin billing automatically. Paid inference is prohibited.");
  }

  if (costClass === "TRIAL") {
    return deny(costClass, "DENIED_TRIAL", "TRIAL_CREDITS", "The provider depends on promotional or expiring credits. Trial credits are prohibited: they expire and convert to paid.");
  }

  // NOTE: there is deliberately no "missing deployment" branch here.
  // `classifyProviderCost` already folds an unrecorded deployment into UNKNOWN
  // for a LOCAL_FREE claim, so it arrives at DENIED_COST_UNKNOWN above. That is
  // the more honest verdict: it sends the operator to verify the provider,
  // rather than suggesting they fix a form field.

  if (declaration.deployment === "REMOTE") {
    if (!config.remoteInferenceEnabled) {
      return deny(costClass, "DENIED_REMOTE_INFERENCE", "REMOTE_DISABLED", "Remote AI inference is disabled by policy. Only local execution is authorized.");
    }
    // Even with remote inference enabled, a remote provider must be a verified
    // zero-cost hosted service AND explicitly authorized.
    if (costClass === "FREE_HOSTED") {
      if (!declaration.humanVerified) {
        return deny(costClass, "DENIED_HOSTED_REQUIRES_APPROVAL", "HOSTED_UNVERIFIED", "A hosted free tier is not evidence of zero cost: free tiers commonly require a card and convert to paid. It stays disabled until a human independently verifies the claim.");
      }
      if (!config.allowFreeHosted) {
        return deny(costClass, "DENIED_HOSTED_REQUIRES_APPROVAL", "HOSTED_DISABLED", "Hosted AI is disabled by policy. Only local execution is authorized unless the owner explicitly enables verified hosted use.");
      }
      return allow(costClass, "Hosted provider is independently verified as zero cost and explicitly authorized.");
    }
  }

  // FREE_HOSTED declared on a non-remote deployment is contradictory; treat the
  // safest reading.
  if (costClass === "FREE_HOSTED") {
    if (!declaration.humanVerified || !config.allowFreeHosted) {
      return deny(costClass, "DENIED_HOSTED_REQUIRES_APPROVAL", "HOSTED_DISABLED", "Hosted AI is disabled by policy. Only local execution is authorized unless the owner explicitly enables verified hosted use.");
    }
  }

  return allow(costClass, "Execution is local (or self-hosted on BEYU infrastructure) and no paid, trial or automatic-charge signal is recorded.");
}

function allow(costClass: CostClass, explanation: string): ZeroCostDecision {
  return { allowed: true, verdict: "ALLOWED", costClass, reason: "ZERO_COST_SATISFIED", explanation };
}

function deny(costClass: CostClass, verdict: ZeroCostVerdict, reason: string, explanation: string): ZeroCostDecision {
  return { allowed: false, verdict, costClass, reason, explanation };
}

/* --------------------------------------------------------------------------
 * Evidence: what BEYU has actually verified, and what it has not.
 * ------------------------------------------------------------------------ */

/**
 * Inspectable statement of the policy's real coverage.
 *
 * `accountBillingVerified` is hard-coded false and is not configurable. This
 * application cannot inspect a cloud account's billing configuration, so it
 * must not claim that account-level cost is zero. Any surface that renders
 * "zero cost" must render this limitation alongside it.
 */
export const ZERO_COST_ATTESTATION = {
  authorizedNewSpendUsd: 0,
  paidApiCalls: 0,
  paidSubscriptions: 0,
  trialCreditsUsed: 0,
  billingActivations: 0,
  paidEmbeddingServices: 0,
  paidVectorOrGraphServices: 0,
  paidAgentServices: 0,
  paidBrowserServices: 0,
  newPaidDependencies: 0,
  automaticPaidFallbacks: 0,
  /**
   * Account-level billing cannot be certified from inside this application.
   * Existing infrastructure cost is therefore NOT INSPECTED, not "zero".
   */
  accountBillingVerified: false as const,
  existingInfrastructureCostStatus: "NOT_INSPECTED" as const,
};
