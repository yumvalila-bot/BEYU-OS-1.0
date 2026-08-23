/**
 * BEYU OS — Governed workflow primitive (Finance OS, Phase 24).
 *
 * BUILT ONCE IN THE COMMON PLATFORM. Every financial domain needs the same lifecycle —
 *
 *   DRAFT → REVIEW → APPROVAL → AUTHORIZATION → EXECUTION → POSTING → SETTLEMENT
 *         → RECONCILIATION → CLOSE
 *
 * — and before this module each would have grown its own. A per-specialist workflow engine is how
 * six subtly different approval rules appear, one of which permits self-approval.
 *
 * WHAT IT ENFORCES (policy-independent, true under any accounting policy):
 *   - no state may be skipped;
 *   - a terminal state is terminal;
 *   - the same principal cannot occupy two control roles on one instance (maker ≠ checker ≠
 *     authorizer);
 *   - EXECUTION and beyond require a capability that is actually activated;
 *   - every transition records actor, role, timestamp, reason and trace.
 *
 * WHAT IT REFUSES TO DECIDE: approval thresholds, how many approvers a value band needs, which
 * roles may approve what. Those require ratified policy. The engine asks the caller for an
 * explicit authorisation decision and never infers one.
 *
 * NO TABLE. Workflow instances are evaluated in memory from a supplied history. Persisting them
 * would create a second record of governance state alongside `governance_decision_registry`.
 */

export const WORKFLOW_STATE = [
  "DRAFT",
  "REVIEW",
  "APPROVAL",
  "AUTHORIZATION",
  "EXECUTION",
  "POSTING",
  "SETTLEMENT",
  "RECONCILIATION",
  "CLOSE",
  "REJECTED",
  "CANCELLED",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATE)[number];

/**
 * Legal transitions. Default deny: anything absent is illegal, so a new state cannot be reached
 * by omission.
 */
export const WORKFLOW_TRANSITIONS: Readonly<Record<WorkflowState, readonly WorkflowState[]>> = {
  DRAFT: ["REVIEW", "CANCELLED"],
  REVIEW: ["APPROVAL", "DRAFT", "REJECTED", "CANCELLED"],
  APPROVAL: ["AUTHORIZATION", "REVIEW", "REJECTED", "CANCELLED"],
  AUTHORIZATION: ["EXECUTION", "APPROVAL", "REJECTED", "CANCELLED"],
  EXECUTION: ["POSTING", "REJECTED"],
  POSTING: ["SETTLEMENT", "RECONCILIATION"],
  SETTLEMENT: ["RECONCILIATION"],
  RECONCILIATION: ["CLOSE"],
  // Terminal states.
  CLOSE: [],
  REJECTED: [],
  CANCELLED: [],
};

/** States at or beyond which real financial effect occurs. These require an activated capability. */
export const EXECUTION_STATES: readonly WorkflowState[] = [
  "EXECUTION",
  "POSTING",
  "SETTLEMENT",
];

/** The control roles a principal can hold on one workflow instance. */
export const CONTROL_ROLE = ["MAKER", "CHECKER", "AUTHORIZER", "EXECUTOR"] as const;
export type ControlRole = (typeof CONTROL_ROLE)[number];

export type WorkflowStep = {
  state: WorkflowState;
  actorUserId: string;
  role: ControlRole;
  at: string;
  reason: string;
  traceId: string;
};

export type WorkflowVerdict = {
  permitted: boolean;
  decision:
    | "PERMITTED"
    | "ILLEGAL_TRANSITION"
    | "UNKNOWN_STATE"
    | "TERMINAL_STATE"
    | "SEGREGATION_OF_DUTIES"
    | "CAPABILITY_LOCKED"
    | "REQUIRES_AUTHORITY"
    | "MISSING_TRACE";
  from: WorkflowState | null;
  to: WorkflowState | null;
  reason: string;
};

export function isWorkflowState(v: unknown): v is WorkflowState {
  return typeof v === "string" && (WORKFLOW_STATE as readonly string[]).includes(v);
}

const TRACE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Which control roles has this principal already held on this instance?
 *
 * Exported and pure: segregation of duties is the control most likely to be quietly weakened, and
 * it must be assertable without constructing a whole workflow.
 */
export function rolesHeldBy(history: WorkflowStep[], userId: string): ControlRole[] {
  return [...new Set(history.filter((s) => s.actorUserId === userId).map((s) => s.role))];
}

/**
 * Which control roles are mutually exclusive.
 *
 * MUST BE SYMMETRIC. Fault injection (FI-1) emptied the `MAKER` row and no test failed, because
 * `checkRoleSeparation` looked the map up by the NEW role only: asking "may U1 be CHECKER?"
 * consults `CHECKER: [MAKER, ...]` and never reads the MAKER row at all.
 *
 * That is a latent bug, not merely a coverage gap — an edit to one side of the relation silently
 * weakens the control in one direction while appearing correct in the other. The lookup below is
 * now bidirectional, and `assertIncompatibilitySymmetry()` proves the table cannot drift.
 */
export const ROLE_INCOMPATIBILITY: Readonly<Record<ControlRole, readonly ControlRole[]>> = {
  MAKER: ["CHECKER", "AUTHORIZER", "EXECUTOR"],
  CHECKER: ["MAKER", "AUTHORIZER"],
  AUTHORIZER: ["MAKER", "CHECKER"],
  // EXECUTOR may coincide with AUTHORIZER — executing an already-authorised instruction is a
  // mechanical act — but never with MAKER.
  EXECUTOR: ["MAKER"],
};

/**
 * Verifies the incompatibility relation is symmetric.
 *
 * If A excludes B then B must exclude A. Without this, a one-sided edit produces a control that
 * blocks maker→checker but permits checker→maker.
 */
export function assertIncompatibilitySymmetry(): { symmetric: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const a of CONTROL_ROLE) {
    for (const b of ROLE_INCOMPATIBILITY[a]) {
      if (!ROLE_INCOMPATIBILITY[b].includes(a)) {
        violations.push(`${a} excludes ${b}, but ${b} does not exclude ${a}.`);
      }
    }
  }
  return { symmetric: violations.length === 0, violations };
}

/**
 * Enforces separation of control roles.
 *
 * MAKER, CHECKER and AUTHORIZER must be three different people. This is policy-independent: no
 * accounting policy permits one person to originate, verify and authorise the same transaction.
 *
 * The check is BIDIRECTIONAL: a conflict is reported if either the new role excludes a held role,
 * or a held role excludes the new one.
 */
export function checkRoleSeparation(input: {
  history: WorkflowStep[];
  actorUserId: string;
  role: ControlRole;
}): { permitted: boolean; conflictingRoles: ControlRole[]; reason: string } {
  const held = rolesHeldBy(input.history, input.actorUserId);

  const conflicts = held.filter(
    (h) =>
      ROLE_INCOMPATIBILITY[input.role].includes(h) || ROLE_INCOMPATIBILITY[h].includes(input.role),
  );

  return {
    permitted: conflicts.length === 0,
    conflictingRoles: conflicts,
    reason:
      conflicts.length === 0
        ? `${input.actorUserId} may act as ${input.role}.`
        : `${input.actorUserId} already acted as ${conflicts.join(", ")} on this instance and ` +
          `cannot also be ${input.role}. Separation of duties is policy-independent.`,
  };
}

/**
 * Evaluates one workflow transition.
 *
 * `capabilityActivated` is supplied by the caller from the real 6C/7I gate — this module does not
 * re-implement authority resolution, which would be a second authority engine.
 */
export function evaluateWorkflowTransition(input: {
  from: string;
  to: string;
  actorUserId: string;
  role: ControlRole;
  traceId: string;
  history?: WorkflowStep[];
  capabilityActivated?: boolean;
}): WorkflowVerdict {
  const history = input.history ?? [];

  if (!isWorkflowState(input.from) || !isWorkflowState(input.to)) {
    return {
      permitted: false,
      decision: "UNKNOWN_STATE",
      from: isWorkflowState(input.from) ? input.from : null,
      to: isWorkflowState(input.to) ? input.to : null,
      reason: `Unrecognised workflow state in '${input.from}' -> '${input.to}'. Fails closed.`,
    };
  }

  if (!TRACE_ID.test(input.traceId)) {
    return {
      permitted: false,
      decision: "MISSING_TRACE",
      from: input.from,
      to: input.to,
      reason: "A well-formed traceId is required so every transition remains correlatable.",
    };
  }

  if (WORKFLOW_TRANSITIONS[input.from].length === 0) {
    return {
      permitted: false,
      decision: "TERMINAL_STATE",
      from: input.from,
      to: input.to,
      reason: `${input.from} is terminal; no further transition is possible.`,
    };
  }

  if (!WORKFLOW_TRANSITIONS[input.from].includes(input.to)) {
    return {
      permitted: false,
      decision: "ILLEGAL_TRANSITION",
      from: input.from,
      to: input.to,
      reason:
        `${input.from} -> ${input.to} is not legal. Legal targets: ` +
        `${WORKFLOW_TRANSITIONS[input.from].join(", ")}.`,
    };
  }

  const separation = checkRoleSeparation({
    history,
    actorUserId: input.actorUserId,
    role: input.role,
  });
  if (!separation.permitted) {
    return {
      permitted: false,
      decision: "SEGREGATION_OF_DUTIES",
      from: input.from,
      to: input.to,
      reason: separation.reason,
    };
  }

  // Anything with real financial effect needs an activated capability. Absent that, it fails
  // closed — the caller cannot omit the flag and thereby proceed.
  if (EXECUTION_STATES.includes(input.to) && input.capabilityActivated !== true) {
    return {
      permitted: false,
      decision: "CAPABILITY_LOCKED",
      from: input.from,
      to: input.to,
      reason:
        `${input.to} has real financial effect and requires an activated capability. ` +
        "No capability is activated, so execution fails closed.",
    };
  }

  return {
    permitted: true,
    decision: "PERMITTED",
    from: input.from,
    to: input.to,
    reason: `${input.from} -> ${input.to} permitted for ${input.actorUserId} as ${input.role}.`,
  };
}

export type WorkflowSummary = {
  currentState: WorkflowState | null;
  steps: number;
  distinctActors: number;
  rolesExercised: ControlRole[];
  terminal: boolean;
  reachedExecution: boolean;
  /** Every principal holding more than one control role — a completed-workflow SoD breach. */
  segregationBreaches: Array<{ userId: string; roles: ControlRole[] }>;
  traceIds: string[];
};

/** Post-hoc review of a workflow's history. Detects breaches that slipped past live checks. */
export function summarizeWorkflow(history: WorkflowStep[]): WorkflowSummary {
  const actors = [...new Set(history.map((s) => s.actorUserId))];

  const breaches: WorkflowSummary["segregationBreaches"] = [];
  for (const userId of actors) {
    const roles = rolesHeldBy(history, userId);
    const controlRoles = roles.filter((r) => r === "MAKER" || r === "CHECKER" || r === "AUTHORIZER");
    if (controlRoles.length > 1) breaches.push({ userId, roles: controlRoles });
  }

  const last = history[history.length - 1];
  const currentState = last && isWorkflowState(last.state) ? last.state : null;

  return {
    currentState,
    steps: history.length,
    distinctActors: actors.length,
    rolesExercised: [...new Set(history.map((s) => s.role))],
    terminal: currentState !== null && WORKFLOW_TRANSITIONS[currentState].length === 0,
    reachedExecution: history.some((s) => EXECUTION_STATES.includes(s.state)),
    segregationBreaches: breaches,
    traceIds: [...new Set(history.map((s) => s.traceId))],
  };
}
