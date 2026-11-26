/**
 * NOELIA — STRATEGIC SIMULATION ENGINE.
 *
 * Deterministic scenario arithmetic. This module computes; it never reads a
 * database, never posts a transaction and never mutates an institutional record.
 *
 * The single most important property: a simulation CANNOT be mistaken for a
 * record. That is enforced structurally, three ways:
 *   1. every output carries `resultClass: "SIMULATION"` (a literal type),
 *   2. the table CHECK constraint only permits 'SIMULATION',
 *   3. every rendered line is prefixed "Simulated (not a record): ".
 *
 * "Do not describe illustrative estimates as financial forecasts or verified
 * enterprise outcomes." — an ESTIMATE input stays labelled ESTIMATE throughout;
 * there is no path that upgrades it to OBSERVED.
 */

export const SCENARIO_LABELS = ["OPTIMISTIC", "BASELINE", "ADVERSE"] as const;
export type ScenarioLabel = (typeof SCENARIO_LABELS)[number];

/** Where a baseline number came from. There is no default: the caller must say. */
export type BaselineProvenance =
  | "OBSERVED" // read from an authoritative record this request
  | "RECORDED" // read from a recorded institutional figure
  | "ESTIMATE" // an assumption supplied by the requester
  | "UNAVAILABLE"; // no number exists — calculations must degrade

export type SimulationVariable = {
  key: string;
  label: string;
  /** Value per scenario. Null means "not modelled", never zero. */
  optimistic: number | null;
  baseline: number | null;
  adverse: number | null;
  unit: string;
  /** Where this variable's numbers come from. */
  provenance: BaselineProvenance;
};

export type SimulationConstraint = {
  key: string;
  description: string;
  /** Hard limits the output must respect, or the run is refused. */
  min?: number;
  max?: number;
};

export type SimulationRequest = {
  objective: string;
  scenarioKind: string;
  variables: SimulationVariable[];
  constraints?: SimulationConstraint[];
  /** Declared calculation method — must be one of the supported deterministic methods. */
  method: "LINEAR_COMBINATION" | "PROPORTIONAL_SCALING";
  baseline: Record<string, { value: number | null; provenance: BaselineProvenance; source: string | null }>;
  assumptions: string[];
  limitations?: string[];
};

export type ScenarioResult = {
  label: ScenarioLabel;
  /** Computed output keyed by objective metric. */
  outputs: Record<string, number | null>;
  /** False when any input the method needs was unavailable. */
  complete: boolean;
  /** Variables whose value was null and the effect on the result. */
  unavailableInputs: string[];
};

export type SimulationOutcome = {
  resultClass: "SIMULATION";
  objective: string;
  scenarioKind: string;
  method: SimulationRequest["method"];
  scenarios: ScenarioResult[];
  sensitivity: Array<{ variable: string; range: string; effect: string }>;
  assumptions: string[];
  limitations: string[];
  constraints: SimulationConstraint[];
  /** Worst/best delta vs baseline, for explainability. */
  spread: { metric: string; optimistic: number | null; baseline: number | null; adverse: number | null };
  confidence: number;
  /** Deterministic flag: identical inputs always produce identical output. */
  deterministic: true;
  provenanceSummary: Array<{ key: string; provenance: BaselineProvenance; source: string | null }>;
};

const round = (n: number) => Math.round(n * 100) / 100;

function scenarioValue(variable: SimulationVariable, label: ScenarioLabel): number | null {
  switch (label) {
    case "OPTIMISTIC":
      return variable.optimistic;
    case "BASELINE":
      return variable.baseline;
    case "ADVERSE":
      return variable.adverse;
  }
}

/**
 * Run a deterministic scenario set.
 *
 * Refuses (throws) rather than guesses when:
 *   • no variable is supplied,
 *   • a constraint is violated by every scenario, or
 *   • the objective is empty.
 *
 * Degrades (returns nulls + `complete: false`) rather than guessing when an
 * individual input is unavailable. Missing ≠ zero.
 */
export function runSimulation(request: SimulationRequest): SimulationOutcome {
  if (request.objective.trim().length === 0) throw new Error("A simulation requires an objective.");
  if (request.variables.length === 0) throw new Error("A simulation requires at least one variable.");

  const constraints = request.constraints ?? [];
  const scenarios: ScenarioResult[] = [];

  for (const label of SCENARIO_LABELS) {
    const outputs: Record<string, number | null> = {};
    const unavailableInputs: string[] = [];

    let total: number | null = 0;
    for (const variable of request.variables) {
      const value = scenarioValue(variable, label);
      if (value === null || !Number.isFinite(value)) {
        unavailableInputs.push(variable.key);
        total = null;
        continue;
      }
      if (total !== null) total += value;
    }

    if (request.method === "LINEAR_COMBINATION") {
      outputs.objectiveValue = total === null ? null : round(total);
    } else {
      // PROPORTIONAL_SCALING: baseline total scaled by the ratio of scenario
      // weights to baseline weights. If the baseline weight is zero the method
      // is undefined — never substituted with 1.
      const baselineWeight = request.variables.reduce(
        (acc, v) => (v.baseline === null ? acc : acc + v.baseline),
        0,
      );
      if (baselineWeight === 0 || total === null) {
        outputs.objectiveValue = null;
        if (baselineWeight === 0) unavailableInputs.push("baselineWeight");
      } else {
        const baselineObjective = Object.values(request.baseline)[0]?.value ?? null;
        outputs.objectiveValue =
          baselineObjective === null ? null : round(baselineObjective * (total / baselineWeight));
        if (baselineObjective === null) unavailableInputs.push("baselineObjective");
      }
    }

    // Constraint evaluation. A bound is checked against the computed objective;
    // a null output cannot satisfy a numeric bound, so a bounded constraint plus
    // an unavailable output means the run is incomplete, not compliant.
    let constraintViolated = false;
    const objective = outputs.objectiveValue ?? null;
    for (const constraint of constraints) {
      if (objective === null) {
        if (constraint.min !== undefined || constraint.max !== undefined) constraintViolated = true;
        continue;
      }
      if (constraint.min !== undefined && objective < constraint.min) constraintViolated = true;
      if (constraint.max !== undefined && objective > constraint.max) constraintViolated = true;
    }
    if (constraintViolated) unavailableInputs.push("constraint");

    scenarios.push({
      label,
      outputs,
      complete: unavailableInputs.length === 0,
      unavailableInputs,
    });
  }

  const baselineScenario = scenarios.find((s) => s.label === "BASELINE")!;
  const optimisticScenario = scenarios.find((s) => s.label === "OPTIMISTIC")!;
  const adverseScenario = scenarios.find((s) => s.label === "ADVERSE")!;

  const sensitivity = request.variables.map((variable) => {
    const values = [variable.optimistic, variable.baseline, variable.adverse].filter(
      (v): v is number => typeof v === "number",
    );
    const range = values.length === 0 ? "UNMODELLED" : String(round(Math.max(...values) - Math.min(...values)));
    return {
      variable: variable.key,
      range,
      effect:
        values.length === 0
          ? "No value supplied for any scenario; contributes nothing rather than a default."
          : `Objective moves by at most ${range} ${variable.unit} across the three scenarios.`,
    };
  });

  const provenanceSummary = Object.entries(request.baseline).map(([key, entry]) => ({
    key,
    provenance: entry.provenance,
    source: entry.source,
  }));

  // Confidence reflects INPUT QUALITY, not model certainty. Any ESTIMATE or
  // UNAVAILABLE input caps the score; an all-observed set still never claims 1.
  const provenances = provenanceSummary.map((p) => p.provenance);
  const hasUnavailable = provenances.includes("UNAVAILABLE") || scenarios.some((s) => !s.complete);
  const hasEstimate = provenances.includes("ESTIMATE") || request.variables.some((v) => v.provenance === "ESTIMATE");
  const confidence = hasUnavailable ? 0.15 : hasEstimate ? 0.4 : provenances.length === 0 ? 0.1 : 0.7;

  const limitations = [
    "This is a deterministic illustration computed from the stated inputs — not a financial forecast, a valuation or a verified enterprise outcome.",
    "Simulated values are never institutional records and are never posted to any ledger.",
    ...(hasUnavailable
      ? ["At least one required input was unavailable; incomplete scenarios are reported as null and are not zero-filled."]
      : []),
    ...(request.limitations ?? []),
  ];

  return {
    resultClass: "SIMULATION",
    objective: request.objective.trim(),
    scenarioKind: request.scenarioKind,
    method: request.method,
    scenarios,
    sensitivity,
    assumptions: request.assumptions,
    limitations,
    constraints,
    spread: {
      metric: "objectiveValue",
      optimistic: optimisticScenario.outputs.objectiveValue ?? null,
      baseline: baselineScenario.outputs.objectiveValue ?? null,
      adverse: adverseScenario.outputs.objectiveValue ?? null,
    },
    confidence,
    deterministic: true,
    provenanceSummary,
  };
}

/** Render a simulation for a human reader. Every line is explicitly simulated. */
export function renderSimulation(outcome: SimulationOutcome): string[] {
  const lines: string[] = [
    `Simulated (not a record): ${outcome.objective} [${outcome.scenarioKind}]`,
    `Method: ${outcome.method} · deterministic: ${outcome.deterministic} · confidence: ${outcome.confidence}`,
  ];
  for (const scenario of outcome.scenarios) {
    const value = scenario.outputs.objectiveValue;
    lines.push(
      `  ${scenario.label}: ${
        value === null
          ? `UNAVAILABLE (inputs missing: ${scenario.unavailableInputs.join(", ") || "unknown"})`
          : `${value}`
      }`,
    );
  }
  lines.push("Sensitivity:");
  for (const item of outcome.sensitivity) {
    lines.push(`  ${item.variable}: ${item.range} — ${item.effect}`);
  }
  lines.push("Limitations:");
  for (const limitation of outcome.limitations) lines.push(`  ${limitation}`);
  return lines;
}

/**
 * Structural guard: a simulation result must never be passed to a channel that
 * expects an institutional record. Callers that write evidence use this.
 */
export function assertSimulationNeverPresentedAsRecord(outcome: SimulationOutcome): void {
  if (outcome.resultClass !== "SIMULATION") {
    throw new Error("Simulation integrity: resultClass must be SIMULATION.");
  }
  if (!outcome.deterministic) {
    throw new Error("Simulation integrity: a scenario engine must be deterministic.");
  }
  for (const scenario of outcome.scenarios) {
    for (const [metric, value] of Object.entries(scenario.outputs)) {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`Simulation integrity: metric '${metric}' is not finite.`);
      }
    }
  }
}
