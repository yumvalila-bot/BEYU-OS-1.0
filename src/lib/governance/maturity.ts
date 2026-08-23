/**
 * BEYU OS — Governance maturity registry (Governance Phases 23, 29).
 *
 * WHAT THIS IS. The machine-readable answer to "how complete is the governance control plane?",
 * derived from recorded evidence rather than written by hand in a document that drifts.
 *
 * IT CANNOT INFLATE ITSELF. A layer's status is DERIVED from its evidence fields — a layer with a
 * false criterion cannot be marked COMPLETE, and one with an authority blocker cannot be marked
 * COMPLETE regardless of how much code exists. Tests assert exactly that.
 *
 * IT DELIBERATELY RECORDS ABSENCE. Layers with no substrate are listed with the reason, because an
 * omitted layer looks like one nobody considered.
 */

export const GOVERNANCE_STATUS = [
  "COMPLETE",
  "PARTIAL",
  "BLOCKED",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
  "NOT_AVAILABLE",
] as const;
export type GovernanceStatus = (typeof GOVERNANCE_STATUS)[number];

export type LayerEvidence = {
  /** A model exists that represents the concept. */
  model: boolean;
  /** Logic evaluates it, not merely stores it. */
  engine: boolean;
  /** Enforced at a real call boundary. */
  enforced: boolean;
  /** Negative tests prove it denies. */
  negativeTest: boolean;
  /** Positive tests prove it permits when it should. */
  positiveTest: boolean;
  /** Fault injection proves the control is load-bearing. */
  faultInjection: boolean;
  /** Denials are specific, not generic. */
  deterministicReasons: boolean;
};

export type GovernanceLayer = {
  layer: string;
  module: string | null;
  evidence: LayerEvidence;
  /** Real records backing it, where applicable. Null when not data-dependent. */
  substrateRows: number | null;
  blockers: string[];
  notes: string;
};

const E = (over: Partial<LayerEvidence> = {}): LayerEvidence => ({
  model: true, engine: true, enforced: true, negativeTest: true,
  positiveTest: true, faultInjection: true, deterministicReasons: true, ...over,
});

const NONE: LayerEvidence = {
  model: false, engine: false, enforced: false, negativeTest: false,
  positiveTest: false, faultInjection: false, deterministicReasons: false,
};

/** THE REGISTRY. Every entry reflects what is actually in the repository. */
export const GOVERNANCE_LAYERS: readonly GovernanceLayer[] = [
  {
    layer: "Constitution",
    module: "src/db/schema/governance.ts + constitution_articles",
    evidence: E({ engine: false, faultInjection: false }),
    substrateRows: 12,
    blockers: ["ENGINE: articles are stored and referenced but not evaluated as constraints"],
    notes: "12 articles exist and policies reference them. No engine enforces article hierarchy.",
  },
  {
    layer: "Authority",
    module: "src/lib/authority/{model,engines,service}.ts",
    evidence: E(),
    substrateRows: 16,
    blockers: ["AUTHORITY: 16/16 decisions PENDING; nothing ratified"],
    notes: "Three-part evaluation (exists/effective/permits) with tenant, entity and principal scope.",
  },
  {
    layer: "Policy",
    module: "src/lib/policy.ts + policies",
    evidence: E(),
    substrateRows: 5,
    blockers: ["DATA: 5/5 policies have no approving resolution (C-1)"],
    notes: "Policy evaluation works; every live policy is unprovenanced.",
  },
  {
    layer: "Policy versioning",
    module: "src/lib/authority/engines.ts:computePolicyVersion",
    evidence: E(),
    substrateRows: 5,
    blockers: [],
    notes: "Dual checksum makes silent substitution of the same code+version detectable.",
  },
  {
    layer: "Decision registry",
    module: "src/lib/decision-authority.ts",
    evidence: E(),
    substrateRows: 16,
    blockers: ["AUTHORITY: all decisions PENDING"],
    notes: "11 verdicts, 12 per-decision checks; empty requiredDecisions is a defect, not a pass.",
  },
  {
    layer: "Resolution registry",
    module: "src/lib/governance-vote-service.ts",
    evidence: E(),
    substrateRows: 4,
    blockers: ["AUTHORITY: 2 APPROVED, 1 TABLED, 1 DRAFT — none ratified"],
    notes: "Quorum and majority enforced by a pure engine; ties are DEADLOCKED, never broken.",
  },
  {
    layer: "Reserved matters",
    module: "src/lib/governance/reserved-matters.ts",
    evidence: E(),
    substrateRows: 14,
    blockers: [],
    notes:
      "14 ratified matters across 6 bodies, now parsed and enforced. Detects miscategorisation " +
      "and routing to a non-competent body.",
  },
  {
    layer: "Delegation",
    module: "src/lib/governance/delegation.ts",
    evidence: E(),
    substrateRows: 0,
    blockers: ["DATA: delegations table is empty; no principal holds delegated authority"],
    notes: "A delegation can never exceed the issuer's own authority. Non-delegable powers refused.",
  },
  {
    layer: "Segregation of duties",
    module: "src/lib/finance/workflow.ts",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes: "Bidirectional incompatibility with a symmetry assertion, after FI-1 found the one-sided lookup.",
  },
  {
    layer: "Workflow",
    module: "src/lib/finance/workflow.ts",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes: "All 121 state pairs decided; execution states fail closed without an activated capability.",
  },
  {
    layer: "Exceptions",
    module: "src/lib/governance/exceptions.ts",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes:
      "An exception never modifies its policy and expires automatically. Emergency overrides are " +
      "capped and refused on repeat.",
  },
  {
    layer: "Escalation",
    module: "src/lib/governance/delegation.ts:determineEscalation",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes: "Deterministic states, ordered by fundamentality. Never auto-approves.",
  },
  {
    layer: "Temporal governance",
    module: "src/lib/authority/engines.ts",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes: "Inclusive bounds; terminal states outrank the effective window.",
  },
  {
    layer: "Conflict detection",
    module: "src/lib/authority/engines.ts:detectPolicyConflicts",
    evidence: E(),
    substrateRows: 5,
    blockers: [],
    notes: "9 conflict codes; no winner field exists, so precedence cannot be quietly added.",
  },
  {
    layer: "Provenance",
    module: "src/lib/authority/service.ts",
    evidence: E(),
    substrateRows: 5,
    blockers: ["DATA: C-1 — 5/5 policies unprovenanced"],
    notes: "Detected and quantified; repair requires ratification, not code.",
  },
  {
    layer: "Lineage",
    module: "src/lib/finance/lineage.ts",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes: "canonical is structurally false; a derivation can never become authority.",
  },
  {
    layer: "Domain registry",
    module: "src/lib/finance/domains.ts",
    evidence: E(),
    substrateRows: 20,
    blockers: [],
    notes: "20 services; status derived from 16 criteria and cannot self-flatter.",
  },
  {
    layer: "Cross-OS governance",
    module: "src/lib/specialist/platform.ts:runSpecialist",
    evidence: E({ faultInjection: false }),
    substrateRows: 60,
    blockers: ["ENGINEERING: only Finance specialists are wired; no sector OS exists yet"],
    notes: "One enforcement order for every specialist. Sector OSs are not yet built.",
  },
  {
    layer: "Capability binding",
    module: "src/lib/authority/service.ts:checkScopedCapability",
    evidence: E(),
    substrateRows: 60,
    blockers: ["AUTHORITY: 60/60 LOCKED"],
    notes: "Composes the 6C gate rather than replacing it.",
  },
  {
    layer: "Permission binding",
    module: "src/lib/authz.ts",
    evidence: E(),
    substrateRows: 160,
    blockers: [],
    notes: "48 permissions, 160 role grants. Wildcards do not match a required permission.",
  },
  {
    layer: "Tenant scope",
    module: "src/lib/tenant-scope.ts",
    evidence: E(),
    substrateRows: 6,
    blockers: [],
    notes: "Selective RLS is the canonical model; cross-tenant reads are non-enumerating.",
  },
  {
    layer: "Entity scope",
    module: "src/lib/specialist/platform.ts",
    evidence: E(),
    substrateRows: 8,
    blockers: ["DATA: 3 treasury positions carry a cross-tenant attribution defect"],
    notes: "Detected and reported, never repaired — it is governance-owned evidence.",
  },
  {
    layer: "Audit",
    module: "src/lib/audit.ts",
    evidence: E(),
    substrateRows: 0,
    blockers: [],
    notes: "Append-only; UPDATE and TRUNCATE blocked by triggers.",
  },
  {
    layer: "Event",
    module: "src/lib/audit.ts:publishEventTx",
    evidence: E(),
    substrateRows: 0,
    blockers: [],
    notes: "Single event system; no post-commit publication.",
  },
  {
    layer: "Trace",
    module: "src/lib/audit.ts",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes: "7G fix regression-locked: audit and event trace_id correlate to the operation.",
  },
  {
    layer: "Simulation",
    module: "src/lib/authority/engines.ts:simulateRatification",
    evidence: E(),
    substrateRows: null,
    blockers: [],
    notes: "mutatedState is structurally false; output says ELIGIBLE, never ACTIVATED.",
  },
  {
    layer: "Execution readiness",
    module: "src/lib/finance/contract.ts:financeGate",
    evidence: E(),
    substrateRows: 60,
    blockers: ["AUTHORITY: no capability passes the gate today"],
    notes: "13-stage pipeline; every stage returns a specific denial.",
  },
  {
    layer: "Reversibility",
    module: "src/lib/finance/posting-engine.ts",
    evidence: E({ positiveTest: false, faultInjection: false }),
    substrateRows: 0,
    blockers: ["DATA: 0 journal entries, so reversal cannot be exercised against real data"],
    notes: "Reversal is implemented; correction is by reversal, never by mutation.",
  },
  {
    layer: "Historical immutability",
    module: "drizzle/0005 + 0008 triggers",
    evidence: E(),
    substrateRows: 9,
    blockers: [],
    notes: "9 triggers, 0 disabled. Row-level triggers do not fire for TRUNCATE, so TRUNCATE is blocked separately.",
  },
];

/**
 * Derives a layer's status. A layer CANNOT be COMPLETE while any evidence criterion is false or an
 * AUTHORITY/ENGINE blocker exists.
 */
export function assessLayer(l: GovernanceLayer): {
  layer: string;
  status: GovernanceStatus;
  satisfied: number;
  total: number;
  missing: string[];
  blocker: string | null;
  evidenceSummary: string;
} {
  const entries = Object.entries(l.evidence) as Array<[keyof LayerEvidence, boolean]>;
  const missing = entries.filter(([, v]) => !v).map(([k]) => k);
  const satisfied = entries.length - missing.length;

  let status: GovernanceStatus;
  if (l.module === null) {
    status = "NOT_AVAILABLE";
  } else if (missing.length > 0) {
    status = "PARTIAL";
  } else if (l.blockers.some((b) => b.startsWith("AUTHORITY:"))) {
    status = "REQUIRES_AUTHORITY";
  } else if (l.blockers.some((b) => b.startsWith("DATA:"))) {
    status = "DATA_NOT_AVAILABLE";
  } else if (l.blockers.length > 0) {
    status = "PARTIAL";
  } else {
    status = "COMPLETE";
  }

  return {
    layer: l.layer,
    status,
    satisfied,
    total: entries.length,
    missing,
    blocker: l.blockers[0] ?? null,
    evidenceSummary:
      status === "COMPLETE"
        ? `All ${entries.length} evidence criteria satisfied, no blockers.`
        : missing.length > 0
          ? `${satisfied}/${entries.length} criteria; missing: ${missing.join(", ")}.`
          : `${satisfied}/${entries.length} criteria satisfied but blocked: ${l.blockers.join("; ")}`,
  };
}

export function governanceMatrix(): Array<ReturnType<typeof assessLayer>> {
  return GOVERNANCE_LAYERS.map(assessLayer).sort((a, b) => a.layer.localeCompare(b.layer));
}

export function governanceSummary(): {
  total: number;
  byStatus: Record<GovernanceStatus, number>;
  complete: string[];
  partial: string[];
  requiresAuthority: string[];
  dataNotAvailable: string[];
} {
  const m = governanceMatrix();
  const byStatus = {
    COMPLETE: 0, PARTIAL: 0, BLOCKED: 0, REQUIRES_AUTHORITY: 0,
    DATA_NOT_AVAILABLE: 0, NOT_AVAILABLE: 0,
  } as Record<GovernanceStatus, number>;
  for (const x of m) byStatus[x.status] += 1;

  return {
    total: m.length,
    byStatus,
    complete: m.filter((x) => x.status === "COMPLETE").map((x) => x.layer),
    partial: m.filter((x) => x.status === "PARTIAL").map((x) => x.layer),
    requiresAuthority: m.filter((x) => x.status === "REQUIRES_AUTHORITY").map((x) => x.layer),
    dataNotAvailable: m.filter((x) => x.status === "DATA_NOT_AVAILABLE").map((x) => x.layer),
  };
}
