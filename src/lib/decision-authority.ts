/**
 * BEYU OS — Authority verification engine and activation gate (Phase 6C).
 *
 * WHAT THIS IS. A policy-neutral layer that answers exactly one question:
 *
 *     "Is this governance decision authoritative and executable right now?"
 *
 * WHAT THIS IS NOT. It never decides accounting treatment. It does not know what a recognition
 * basis is, what a chart of accounts contains, or which account a transaction debits. It only
 * evaluates authority, provenance, effective dating, scope and dependencies.
 *
 * WHY IT EXISTS. Every accounting capability in BEYU OS is blocked on ratification that does not
 * exist yet. Rather than wait, this builds the rails: when a real decision arrives, it can be
 * verified and the corresponding capability activated, while every unratified capability stays
 * locked. Partial ratification is supported — P1 may activate while P6 remains locked.
 *
 * FAIL-CLOSED. Every unknown, malformed or unverifiable input resolves to a non-executable
 * verdict. `isExecutable()` returns true for exactly one verdict: ACTIVATED. There is no
 * environment variable, config flag, seed row or UI state that can bypass this.
 *
 * REUSE. Provenance semantics are the same ones `getGovernanceDecisionAuthorization()` already
 * establishes: only an APPROVED resolution authorises, and only a GOVERNED decision (one with an
 * audit-ledger trail) counts — REFERENCE_DATA, i.e. seed or hand-inserted data, never authorises.
 * This module does not re-implement that judgement; it consumes the same rule.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { governanceCapabilityRegistry, governanceDecisionRegistry, resolutions } from "@/db/schema";

/**
 * Deterministic verdicts, ordered from least to most authoritative.
 * Only ACTIVATED permits execution.
 */
export const AUTHORITY_VERDICT = [
  "NOT_FOUND",
  "INVALID",
  "PENDING",
  "APPROVED_NOT_EFFECTIVE",
  "EFFECTIVE_NOT_RATIFIED",
  "RATIFIED_NOT_READY",
  "ACTIVATION_READY",
  "ACTIVATED",
  "EXPIRED",
  "SUPERSEDED",
  "SUSPENDED",
] as const;

export type AuthorityVerdict = (typeof AUTHORITY_VERDICT)[number];

export type AuthorityCheck = {
  decisionId: string;
  verdict: AuthorityVerdict;
  /** Human-readable reason. Safe to log; contains no tenant or financial data. */
  reason: string;
  /** Individual checks, for audit and for the simulator. */
  checks: {
    identity: boolean;
    resolutionExists: boolean;
    approvingAuthority: boolean;
    decisionMaker: boolean;
    provenanceGoverned: boolean;
    statusRatified: boolean;
    effectiveDateReached: boolean;
    notExpired: boolean;
    scopePresent: boolean;
    conditionsRecorded: boolean;
    dependenciesSatisfied: boolean;
    evidencePresent: boolean;
  };
  /** Dependency decision ids that are not yet ACTIVATED. */
  unmetDependencies: string[];
};

/** The single verdict that permits execution. */
export function isExecutable(verdict: AuthorityVerdict): boolean {
  return verdict === "ACTIVATED";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyChecks(): AuthorityCheck["checks"] {
  return {
    identity: false,
    resolutionExists: false,
    approvingAuthority: false,
    decisionMaker: false,
    provenanceGoverned: false,
    statusRatified: false,
    effectiveDateReached: false,
    notExpired: false,
    scopePresent: false,
    conditionsRecorded: false,
    dependenciesSatisfied: false,
    evidencePresent: false,
  };
}

/**
 * Verifies a single decision against the registry and the governance record.
 *
 * Deliberately verifies rather than trusts: a registry row claiming `status = 'ACTIVATED'` is not
 * believed unless the cited resolution actually exists, is APPROVED, and carries GOVERNED
 * provenance. A forged or seeded row therefore cannot confer authority.
 */
export async function verifyDecisionAuthority(decisionId: string): Promise<AuthorityCheck> {
  const checks = emptyChecks();
  const base = { decisionId, checks, unmetDependencies: [] as string[] };

  if (typeof decisionId !== "string" || decisionId.trim() === "") {
    return { ...base, verdict: "INVALID", reason: "Decision id is missing or malformed." };
  }

  const [row] = await db
    .select()
    .from(governanceDecisionRegistry)
    .where(eq(governanceDecisionRegistry.decisionId, decisionId))
    .limit(1);

  if (!row) {
    return { ...base, verdict: "NOT_FOUND", reason: `No registry entry for ${decisionId}.` };
  }
  checks.identity = true;

  // Terminal authority states short-circuit: they can never be executable.
  if (row.status === "SUSPENDED") {
    return { ...base, verdict: "SUSPENDED", reason: `${decisionId} is suspended.` };
  }
  if (row.status === "SUPERSEDED" || row.status === "RETIRED") {
    return {
      ...base,
      verdict: "SUPERSEDED",
      reason: `${decisionId} is ${row.status.toLowerCase()} and cannot authorise execution.`,
    };
  }

  // --- Provenance. The registry row is NOT trusted; the governance record is consulted. ---
  let resolutionApproved = false;
  if (row.resolutionId) {
    const [res] = await db
      .select({ id: resolutions.id, status: resolutions.status })
      .from(resolutions)
      .where(eq(resolutions.id, row.resolutionId))
      .limit(1);
    checks.resolutionExists = Boolean(res);
    resolutionApproved = res?.status === "APPROVED";
  }

  // Seeded/reference data must never authorise. Mirrors getGovernanceDecisionAuthorization().
  checks.provenanceGoverned = row.provenance === "GOVERNED";
  checks.approvingAuthority = Boolean(row.approvingBody);
  checks.decisionMaker = Boolean(row.decisionMaker);
  checks.scopePresent = row.scope !== null && row.scope !== undefined;
  checks.conditionsRecorded = row.conditions !== null;
  checks.evidencePresent = Boolean(row.evidence);

  // --- Effective dating. Absent dates are treated as NOT effective (fail-closed). ---
  const now = today();
  checks.effectiveDateReached = Boolean(row.effectiveFrom) && String(row.effectiveFrom) <= now;
  checks.notExpired = !row.effectiveTo || String(row.effectiveTo) >= now;

  if (!checks.notExpired) {
    return { ...base, verdict: "EXPIRED", reason: `${decisionId} authority expired on ${row.effectiveTo}.` };
  }

  // --- Dependencies must all be ACTIVATED. ---
  const deps = Array.isArray(row.dependencies) ? row.dependencies : [];
  if (deps.length > 0) {
    const depRows = await db
      .select({
        decisionId: governanceDecisionRegistry.decisionId,
        activationStatus: governanceDecisionRegistry.activationStatus,
      })
      .from(governanceDecisionRegistry)
      .where(inArray(governanceDecisionRegistry.decisionId, deps));

    const activated = new Set(
      depRows.filter((d) => d.activationStatus === "ACTIVATED").map((d) => d.decisionId),
    );
    base.unmetDependencies = deps.filter((d) => !activated.has(d));
  }
  checks.dependenciesSatisfied = base.unmetDependencies.length === 0;

  // --- Ladder. Each rung requires everything below it. ---
  if (row.status === "PENDING") {
    return { ...base, verdict: "PENDING", reason: `${decisionId} has not been decided.` };
  }

  const genuinelyApproved = resolutionApproved && checks.provenanceGoverned;
  if (!genuinelyApproved) {
    return {
      ...base,
      verdict: "PENDING",
      reason:
        `${decisionId} claims ${row.status} but has no APPROVED resolution with GOVERNED ` +
        `provenance; seeded or unverified records do not confer authority.`,
    };
  }

  if (!checks.effectiveDateReached) {
    return {
      ...base,
      verdict: "APPROVED_NOT_EFFECTIVE",
      reason: `${decisionId} is approved but its effective date has not been reached.`,
    };
  }

  checks.statusRatified = row.status === "RATIFIED" || row.status === "ACTIVATION_READY" || row.status === "ACTIVATED";
  if (!checks.statusRatified) {
    return {
      ...base,
      verdict: "EFFECTIVE_NOT_RATIFIED",
      reason: `${decisionId} is effective but has not been ratified.`,
    };
  }

  if (!checks.dependenciesSatisfied) {
    return {
      ...base,
      verdict: "RATIFIED_NOT_READY",
      reason: `${decisionId} is ratified but depends on ${base.unmetDependencies.join(", ")}.`,
    };
  }

  if (row.activationStatus !== "ACTIVATED" || row.status !== "ACTIVATED") {
    return {
      ...base,
      verdict: "ACTIVATION_READY",
      reason: `${decisionId} satisfies every authority condition but has not been explicitly activated.`,
    };
  }

  return { ...base, verdict: "ACTIVATED", reason: `${decisionId} is activated and executable.` };
}

export type CapabilityGateResult = {
  capabilityCode: string;
  executable: boolean;
  reason: string;
  /** Per-decision verdicts, so a caller can report precisely what is missing. */
  decisions: AuthorityCheck[];
  blockedBy: string[];
};

/**
 * THE ACTIVATION GATE.
 *
 * Every policy-dependent capability must pass through here. A capability is executable only when
 * it exists in the registry, is itself marked ACTIVATED, and EVERY decision it requires
 * independently verifies as ACTIVATED.
 *
 * Fail-closed by construction: an unknown capability, an empty requirement list, a locked row or
 * any single unmet decision all produce `executable: false`.
 */
export async function checkCapabilityActivation(capabilityCode: string): Promise<CapabilityGateResult> {
  const base = { capabilityCode, decisions: [] as AuthorityCheck[], blockedBy: [] as string[] };

  const [cap] = await db
    .select()
    .from(governanceCapabilityRegistry)
    .where(eq(governanceCapabilityRegistry.capabilityCode, capabilityCode))
    .limit(1);

  if (!cap) {
    return { ...base, executable: false, reason: `Unknown capability ${capabilityCode}; denied by default.` };
  }

  const required = Array.isArray(cap.requiredDecisions) ? cap.requiredDecisions : [];
  if (required.length === 0) {
    // A capability with no stated authority requirement is a registry defect, not a free pass.
    return {
      ...base,
      executable: false,
      reason: `${capabilityCode} declares no required decisions; refusing to treat that as authorisation.`,
    };
  }

  const decisions: AuthorityCheck[] = [];
  for (const decisionId of required) decisions.push(await verifyDecisionAuthority(decisionId));

  const blockedBy = decisions.filter((d) => !isExecutable(d.verdict)).map((d) => d.decisionId);

  if (blockedBy.length > 0) {
    return {
      ...base,
      decisions,
      blockedBy,
      executable: false,
      reason: `${capabilityCode} is locked pending ${blockedBy.join(", ")}.`,
    };
  }

  if (cap.activationStatus !== "ACTIVATED") {
    return {
      ...base,
      decisions,
      executable: false,
      reason: `${capabilityCode} has satisfied authority but has not been explicitly activated.`,
    };
  }

  return { ...base, decisions, executable: true, reason: `${capabilityCode} is activated.` };
}

/**
 * Guard for use by any future accounting module. Throws unless the capability is genuinely
 * executable, so a module cannot accidentally proceed by ignoring a boolean.
 */
export async function requireCapability(capabilityCode: string): Promise<void> {
  const result = await checkCapabilityActivation(capabilityCode);
  if (!result.executable) {
    throw new CapabilityLockedError(result.reason, capabilityCode, result.blockedBy);
  }
}

export class CapabilityLockedError extends Error {
  readonly code = "CAPABILITY_LOCKED";
  constructor(
    message: string,
    readonly capabilityCode: string,
    readonly blockedBy: string[],
  ) {
    super(message);
    this.name = "CapabilityLockedError";
  }
}

/**
 * SIMULATOR (§10). Answers "what would become executable if these decisions were ratified?"
 * without writing anything. Used for planning and for proving the gate's behaviour under
 * hypothetical authority. It never mutates state and never activates anything.
 */
export async function simulateActivation(hypotheticallyActivated: string[]): Promise<
  Array<{ capabilityCode: string; wouldBeReady: boolean; stillBlockedBy: string[] }>
> {
  const activatedSet = new Set(hypotheticallyActivated);
  const caps = await db.select().from(governanceCapabilityRegistry);

  return caps
    .map((cap) => {
      const required = Array.isArray(cap.requiredDecisions) ? cap.requiredDecisions : [];
      const stillBlockedBy = required.filter((d) => !activatedSet.has(d));
      return {
        capabilityCode: cap.capabilityCode,
        wouldBeReady: required.length > 0 && stillBlockedBy.length === 0,
        stillBlockedBy,
      };
    })
    .sort((a, b) => a.capabilityCode.localeCompare(b.capabilityCode));
}

/** Read-only registry view for reporting. */
export async function listDecisionRegistry() {
  return db
    .select()
    .from(governanceDecisionRegistry)
    .orderBy(governanceDecisionRegistry.decisionId);
}

/** Capabilities that are currently locked. Fail-closed reporting for operators. */
export async function listLockedCapabilities() {
  return db
    .select()
    .from(governanceCapabilityRegistry)
    .where(and(eq(governanceCapabilityRegistry.activationStatus, "LOCKED")))
    .orderBy(governanceCapabilityRegistry.capabilityCode);
}
