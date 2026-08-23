import type { DomainCode } from "./domains";

export const CONTINUITY_MODES = ["LOCAL_ATOMIC", "MULTI_STEP_GOVERNED", "EVENTUAL", "SIMULATION"] as const;
export type ContinuityMode = (typeof CONTINUITY_MODES)[number];

export const CONTINUITY_DECISIONS = [
  "LOCAL_RETRY_SAFE",
  "IDEMPOTENT_RETRY_REQUIRED",
  "FAIL_CLOSED",
  "DEGRADE_SAFELY",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
] as const;
export type ContinuityDecision = (typeof CONTINUITY_DECISIONS)[number];

export type ServiceContinuity = {
  service: string;
  domain: DomainCode;
  dependencies: string[];
  mode: ContinuityMode;
  recovery: string;
  failureMode: string;
  degradationMode: string;
  rtoClass: "REQUIRES_AUTHORITY" | "DATA_NOT_AVAILABLE";
  rpoClass: "REQUIRES_AUTHORITY" | "DATA_NOT_AVAILABLE";
  auditRequirement: string;
  authorityRequirement: string;
};

/**
 * Continuity inventory. No numeric RTO/RPO is invented: the schema's plans are
 * data requiring live verification, while this registry records the safe
 * engineering behavior of each existing boundary.
 */
export const SERVICE_CONTINUITY: readonly ServiceContinuity[] = [
  {
    service: "identity.session",
    domain: "IDENTITY",
    dependencies: ["PostgreSQL", "MFA key material"],
    mode: "LOCAL_ATOMIC",
    recovery: "retry only after database outcome is known; session token is hash-backed",
    failureMode: "reject authentication or session resolution",
    degradationMode: "no anonymous fallback",
    rtoClass: "DATA_NOT_AVAILABLE",
    rpoClass: "REQUIRES_AUTHORITY",
    auditRequirement: "authentication denial/success is audited",
    authorityRequirement: "active identity and role assignment",
  },
  {
    service: "governance.mutation",
    domain: "GOVERNANCE",
    dependencies: ["identity", "policy", "authority", "PostgreSQL", "audit/event chain"],
    mode: "MULTI_STEP_GOVERNED",
    recovery: "idempotency key and transaction rollback; re-read state before retry",
    failureMode: "rollback resolution/vote/decision when evidence append fails",
    degradationMode: "safe refusal; no partial governance transition",
    rtoClass: "REQUIRES_AUTHORITY",
    rpoClass: "REQUIRES_AUTHORITY",
    auditRequirement: "audit and event must commit with the governance transition",
    authorityRequirement: "common governance permission and body authority",
  },
  {
    service: "finance.posting",
    domain: "FINANCE",
    dependencies: ["authority gate", "Finance ledger", "PostgreSQL", "audit/event chain"],
    mode: "LOCAL_ATOMIC",
    recovery: "idempotency and one transaction around entry, lines, audit and event",
    failureMode: "no journal survives a failed control/evidence append",
    degradationMode: "no posting when authority/data is unavailable",
    rtoClass: "REQUIRES_AUTHORITY",
    rpoClass: "REQUIRES_AUTHORITY",
    auditRequirement: "full financial mutation provenance",
    authorityRequirement: "P1–P11-dependent capability activation",
  },
  {
    service: "finance.analysis",
    domain: "FINANCE",
    dependencies: ["Finance observations", "common scope", "audit/event chain"],
    mode: "SIMULATION",
    recovery: "repeat read/analysis with a new trace; do not replay a mutation",
    failureMode: "return DATA_NOT_AVAILABLE or REQUIRES_AUTHORITY",
    degradationMode: "advisory output only; no financial write",
    rtoClass: "DATA_NOT_AVAILABLE",
    rpoClass: "DATA_NOT_AVAILABLE",
    auditRequirement: "analysis trace and epistemic class",
    authorityRequirement: "read permission; no execution authority",
  },
  {
    service: "tax.assessment",
    domain: "TAX",
    dependencies: ["Finance/entity facts", "tax strategy source", "policy", "audit/event chain"],
    mode: "MULTI_STEP_GOVERNED",
    recovery: "idempotent observation replay; never create liability on retry",
    failureMode: "fail closed to human review or unavailable",
    degradationMode: "candidate strategy only, no accounting/tax mutation",
    rtoClass: "REQUIRES_AUTHORITY",
    rpoClass: "DATA_NOT_AVAILABLE",
    auditRequirement: "strategy, facts, output class and trace",
    authorityRequirement: "tax governance and human review for material reliance",
  },
  {
    service: "ai.noelia",
    domain: "AI",
    dependencies: ["identity", "policy", "tenant/entity scope", "knowledge", "audit/event chain"],
    mode: "SIMULATION",
    recovery: "repeat analysis with a new request trace; no side-effect replay",
    failureMode: "do not return an authoritative action when a dependency is unavailable",
    degradationMode: "uncertainty/human review, never self-authorization",
    rtoClass: "DATA_NOT_AVAILABLE",
    rpoClass: "DATA_NOT_AVAILABLE",
    auditRequirement: "ai_decisions plus audit/event evidence",
    authorityRequirement: "inherits human principal; no AI authority",
  },
  {
    service: "sector.consumer",
    domain: "HEALTH",
    dependencies: ["BEYU OS identity", "HCM", "Finance", "enterprise event fabric"],
    mode: "EVENTUAL",
    recovery: "consumer must use idempotent event handling and preserve causation",
    failureMode: "reject or quarantine uncorrelatable/unscoped message",
    degradationMode: "no local employee, governance or financial shadow master",
    rtoClass: "DATA_NOT_AVAILABLE",
    rpoClass: "DATA_NOT_AVAILABLE",
    auditRequirement: "common event envelope at the Sector boundary",
    authorityRequirement: "BEYU OS registration and common authority",
  },
];

export type ContinuityFailure =
  | "SERVICE_RESTART"
  | "PROCESS_CRASH"
  | "NETWORK_TIMEOUT"
  | "DUPLICATE_REQUEST"
  | "DUPLICATE_EVENT"
  | "CONSUMER_RESTART"
  | "AUTHORITY_UNAVAILABLE"
  | "IDENTITY_UNAVAILABLE"
  | "AUDIT_UNAVAILABLE"
  | "MALFORMED_DEPENDENCY";

export type ContinuitySimulation = {
  classification: "SIMULATION";
  service: string;
  failure: ContinuityFailure;
  decision: ContinuityDecision;
  mutatesProductionState: false;
  preservesAuthority: boolean;
  preservesTrace: boolean;
  explanation: string[];
};

/** Safe, pure continuity simulation. It never reads or writes production state. */
export function simulateContinuityFailure(
  service: string,
  failure: ContinuityFailure,
): ContinuitySimulation {
  const definition = SERVICE_CONTINUITY.find((candidate) => candidate.service === service);
  if (!definition) {
    return {
      classification: "SIMULATION",
      service,
      failure,
      decision: "DATA_NOT_AVAILABLE",
      mutatesProductionState: false,
      preservesAuthority: false,
      preservesTrace: false,
      explanation: ["The service is not registered in the common continuity inventory.", "No recovery behavior is inferred."],
    };
  }

  const safeRefusal = new Set<ContinuityFailure>([
    "AUTHORITY_UNAVAILABLE",
    "IDENTITY_UNAVAILABLE",
    "AUDIT_UNAVAILABLE",
    "MALFORMED_DEPENDENCY",
  ]);
  const duplicate = failure === "DUPLICATE_REQUEST" || failure === "DUPLICATE_EVENT";
  const decision: ContinuityDecision = safeRefusal.has(failure)
    ? "FAIL_CLOSED"
    : duplicate && definition.mode === "LOCAL_ATOMIC"
      ? "IDEMPOTENT_RETRY_REQUIRED"
      : definition.mode === "SIMULATION"
        ? "DEGRADE_SAFELY"
        : "IDEMPOTENT_RETRY_REQUIRED";

  return {
    classification: "SIMULATION",
    service,
    failure,
    decision,
    mutatesProductionState: false,
    preservesAuthority: decision !== "DEGRADE_SAFELY" || definition.authorityRequirement.includes("no execution"),
    preservesTrace: true,
    explanation: [
      `${service} is classified ${definition.mode}; no production operation is executed.`,
      `Failure ${failure} resolves to ${decision}.`,
      "A retry must retain the original correlation/causation context and must not invent authority.",
    ],
  };
}

export function continuityInventory(): ServiceContinuity[] {
  return SERVICE_CONTINUITY.map((service) => ({
    ...service,
    dependencies: [...service.dependencies],
  }));
}
