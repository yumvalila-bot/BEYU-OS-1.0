/**
 * BEYU OS — FINANCE INTELLIGENCE: metric provenance & epistemic envelope.
 *
 * ============================== WHY THIS MODULE ==============================
 *
 * A financial ratio has no meaning without the inputs it was computed from. "P/E 18.4" is
 * indistinguishable from an invented number unless the system can answer: whose earnings, which
 * period, which currency, which price, observed when, computed by which version of which rule.
 *
 * `src/lib/finance/epistemics.ts` already defines the canonical epistemic CLASS of any financial
 * datum (POSTED, OBSERVED, DERIVED, FORECAST, …). That model answers "how strong is this claim?".
 * It does not carry the per-metric lineage the intelligence layer needs. This module adds exactly
 * that — and adds nothing else. It defines no table, opens no connection and holds no policy.
 *
 * ============================= THE NO-FABRICATION CONTRACT ===================
 *
 * Every calculation in this layer returns a `MetricOutcome<T>`. There is deliberately NO code path
 * that produces a bare number. An outcome is one of:
 *
 *   VALUE           the metric was computed; its provenance is attached and complete
 *   NOT_AVAILABLE   an input is missing — the metric is ABSENT, never zero, never a guess
 *   NOT_APPLICABLE  the metric is not defined for this subject (e.g. P/E for a private company)
 *   INVALID         the metric is mathematically or economically undefined for these inputs
 *
 * The distinction between NOT_AVAILABLE and INVALID matters. A missing share price is
 * NOT_AVAILABLE; a negative-EPS company has an INVALID trailing P/E (the ratio would read as a
 * negative multiple, which is not a valuation statement). A zero-revenue company has an INVALID
 * P/S rather than an infinite one. Collapsing these into a number is how a system lies.
 *
 * `DATA_STATE` carries the seven states the programme requires. They are a projection of the
 * epistemic classes onto the vocabulary the business reads, and `epistemicClass()` states the
 * mapping so the two vocabularies can never drift into contradiction.
 */
import type { EpistemicClass } from "@/lib/finance/epistemics";

/**
 * The seven canonical data states (§5 of the programme).
 *
 * Ordered from strongest to weakest claim, then the no-claim states.
 */
export const METRIC_DATA_STATE = [
  /** Independently confirmed against an authoritative external source. */
  "VERIFIED",
  /** Deterministically computed from VERIFIED or CALCULATED inputs by this engine. */
  "CALCULATED",
  /** Modelled from incomplete or approximated inputs, with a stated confidence. */
  "ESTIMATED",
  /** A projection of the future. Never a fact about the past. */
  "FORECAST",
  /** An input is genuinely absent. Explicitly NOT zero and NOT a default. */
  "MISSING",
  /** The metric is not defined for this subject at all. */
  "NOT_APPLICABLE",
  /** The metric is defined but undefined for these inputs (÷0, negative base). */
  "INVALID",
] as const;
export type MetricDataState = (typeof METRIC_DATA_STATE)[number];

/** States that assert a usable value exists. Only these may carry `value`. */
export const VALUE_STATES: readonly MetricDataState[] = ["VERIFIED", "CALCULATED", "ESTIMATED", "FORECAST"];

/** States that must never be coerced to a number by a caller or a UI. */
export const NON_VALUE_STATES: readonly MetricDataState[] = ["MISSING", "NOT_APPLICABLE", "INVALID"];

export function isValueState(state: MetricDataState): boolean {
  return VALUE_STATES.includes(state);
}

/**
 * Map this layer's vocabulary onto the canonical epistemic classes of
 * `src/lib/finance/epistemics.ts`.
 *
 * The mapping is total and single-valued, so no metric can claim a state here that contradicts the
 * epistemic class it would carry in the Finance OS ledger/reporting layer.
 */
export function epistemicClass(state: MetricDataState): EpistemicClass {
  switch (state) {
    case "VERIFIED":
      return "OBSERVED";
    case "CALCULATED":
      return "DERIVED";
    case "ESTIMATED":
      // An estimate is a modelled input someone chose, so it is an ASSUMPTION carried as evidence
      // of work done rather than as a fact. It is never promoted to DERIVED, because DERIVED
      // asserts traceability to POSTED/OBSERVED inputs and an estimate has none.
      return "ASSUMPTION";
    case "FORECAST":
      return "FORECAST";
    case "MISSING":
      return "DATA_NOT_AVAILABLE";
    case "NOT_APPLICABLE":
      return "DATA_NOT_AVAILABLE";
    case "INVALID":
      return "DATA_CONFLICT";
    default: {
      const never: never = state;
      throw new Error(`Unhandled metric data state: ${String(never)}`);
    }
  }
}

/** Provenance quality of the underlying source, independent of the calculation. */
export const SOURCE_QUALITY = ["AUDITED", "REVIEWED", "MANAGEMENT", "UNAUDITED", "ESTIMATED", "UNSPECIFIED"] as const;
export type SourceQuality = (typeof SOURCE_QUALITY)[number];

/** How an individual input entered the calculation. */
export const INPUT_KIND = [
  /** A measured or quoted figure from a named source. */
  "OBSERVED",
  /** Computed from other inputs inside this engine. */
  "DERIVED",
  /** Chosen by a human or model. Never evidence for its own correctness. */
  "ASSUMPTION",
  /** Approved policy/reference data (a tax rate, a hurdle). */
  "POLICY",
] as const;
export type InputKind = (typeof INPUT_KIND)[number];

/**
 * One input to a calculation, with its own lineage.
 *
 * `value` is stored as a string so that an exact `numeric` value returned by PostgreSQL survives
 * the trip into the engine without a lossy float round-trip. A caller that needs a number parses
 * it explicitly (`parseInputNumber`), and that parse is where a malformed figure is rejected —
 * never silently treated as zero.
 */
export type MetricInput = {
  /** Stable name used by the formula, e.g. `sharePrice`, `trailingEps`. */
  name: string;
  /** Exact decimal string, or null when the input is absent. */
  value: string | null;
  /** Unit of the value: ISO-4217 code, `SHARES`, `RATIO`, `PERCENT`, `COUNT`, `CURRENCY`. */
  unit: string;
  kind: InputKind;
  /** Where the figure came from: an internal table, a filing, a manual entry, a model. */
  source: string;
  /** When the source published/produced the figure. */
  sourceTimestamp?: string | null;
  /** The period the figure describes (e.g. `FY2025`, `TTM`, `2025-Q3`). */
  period?: string | null;
  /** ISO-4217 code when `unit` is a currency, otherwise null. */
  currency?: string | null;
};

/** Complete lineage for one computed metric (§5). */
export type MetricProvenance = {
  /** Stable metric identifier within a response, e.g. `MET-3`. */
  metricId: string;
  /** Registry code, e.g. `FIN.PE.TRAILING`. */
  metricCode: string;
  subjectType: MetricSubjectType;
  subjectId: string;
  /** Period the metric describes, or null when it is a point-in-time measure. */
  period: string | null;
  /** Reporting currency of the RESULT. Null for pure ratios. */
  currency: string | null;
  /** Data state of the result. */
  state: MetricDataState;
  /** Canonical epistemic class implied by `state`. */
  epistemic: EpistemicClass;
  /** Human-readable formula actually applied. */
  method: string;
  /** Version of the calculation rule; bumping it invalidates cached results. */
  calculationVersion: string;
  inputs: MetricInput[];
  /** Timestamp the source asserted the data was true. */
  sourceTimestamp: string | null;
  /** Timestamp this engine ran. Supplied by the caller so results stay pure/deterministic. */
  dataTimestamp: string | null;
  /** 0..1. Present for ESTIMATED/FORECAST only; null for exact states. */
  confidence: number | null;
  quality: SourceQuality;
};

export const METRIC_SUBJECT_TYPE = [
  "SECURITY",
  "COMPANY",
  "ENTITY",
  "TENANT",
  "SECTOR",
  "PORTFOLIO",
  "FUND",
  "DEAL",
  "PROJECT",
  "CONTRACT",
  "UNIT",
] as const;
export type MetricSubjectType = (typeof METRIC_SUBJECT_TYPE)[number];

/**
 * The result envelope. `value` is absent for every non-value state — TypeScript enforces this, so
 * a UI cannot render `undefined` as `0`.
 */
export type MetricOutcome<T> =
  | { kind: "VALUE"; state: Extract<MetricDataState, "VERIFIED" | "CALCULATED" | "ESTIMATED" | "FORECAST">; value: T; provenance: MetricProvenance }
  | { kind: "ABSENT"; state: Extract<MetricDataState, "MISSING" | "NOT_APPLICABLE" | "INVALID">; reason: string; provenance: MetricProvenance };

export function isValue<T>(outcome: MetricOutcome<T>): outcome is Extract<MetricOutcome<T>, { kind: "VALUE" }> {
  return outcome.kind === "VALUE";
}

/** The numeric value, or null when the metric asserts none. Never throws, never substitutes 0. */
export function valueOrNull<T>(outcome: MetricOutcome<T>): T | null {
  return outcome.kind === "VALUE" ? outcome.value : null;
}

/* ------------------------------------------------------------------ */
/* Metric id factory                                                   */
/* ------------------------------------------------------------------ */

/**
 * Deterministic metric-id allocator.
 *
 * A response that reports twelve metrics must be able to refer to each of them stably, in the order
 * the engine produced them. The factory carries no state beyond an integer counter, so the same
 * inputs always produce the same ids: a test can assert `MET-7`, and a report can reference it.
 */
export function metricIdFactory(prefix = "MET", start = 1): () => string {
  let next = start;
  return () => `${prefix}-${next++}`;
}

export type SubjectRef = {
  subjectType: MetricSubjectType;
  /** Canonical identifier of the subject (entity id, security id, tenant id). Never client-supplied. */
  subjectId: string;
};

/** Shared seed every metric in one request carries. */
export type MetricSeedBase = {
  subject: SubjectRef;
  /** Timestamp this engine ran, supplied by the caller so results stay pure. */
  dataTimestamp: string | null;
  /** Allocates `metricId` values in production order. */
  nextId: () => string;
};

export function seedFor(
  base: MetricSeedBase,
  metricCode: string,
  method: string,
  inputs: MetricInput[],
  extra: {
    period?: string | null;
    currency?: string | null;
    sourceTimestamp?: string | null;
    quality?: SourceQuality;
    calculationVersion?: string | null;
  } = {},
): ProvenanceSeed {
  return {
    metricId: base.nextId(),
    metricCode,
    subjectType: base.subject.subjectType,
    subjectId: base.subject.subjectId,
    period: extra.period ?? null,
    currency: extra.currency ?? null,
    method,
    inputs,
    sourceTimestamp: extra.sourceTimestamp ?? null,
    dataTimestamp: base.dataTimestamp,
    quality: extra.quality,
    calculationVersion: extra.calculationVersion ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Construction helpers                                                */
/* ------------------------------------------------------------------ */

export const FINANCE_INTELLIGENCE_VERSION = "finance-intelligence-1.0.0";

export type ProvenanceSeed = {
  metricId: string;
  metricCode: string;
  subjectType: MetricSubjectType;
  subjectId: string;
  period?: string | null;
  currency?: string | null;
  method: string;
  inputs: MetricInput[];
  sourceTimestamp?: string | null;
  dataTimestamp?: string | null;
  quality?: SourceQuality;
  /** Engine provenance: the calculation version that produced the outcome. */
  calculationVersion?: string | null;
};

/**
 * Build a provenance record for a given state.
 *
 * `confidence` is only ever recorded for ESTIMATED/FORECAST — attaching a confidence to an exact
 * deterministic calculation would imply the arithmetic itself were uncertain.
 */
export function provenance(
  seed: ProvenanceSeed,
  state: MetricDataState,
  confidence: number | null = null,
): MetricProvenance {
  const exact = state === "VERIFIED" || state === "CALCULATED";
  if (exact && confidence !== null) {
    throw new Error(`Confidence must not be attached to an exact ${state} metric (${seed.metricCode}).`);
  }
  if ((state === "ESTIMATED" || state === "FORECAST") && confidence !== null) {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error(`Confidence for ${seed.metricCode} must be within [0,1], received ${confidence}.`);
    }
  }
  return {
    metricId: seed.metricId,
    metricCode: seed.metricCode,
    subjectType: seed.subjectType,
    subjectId: seed.subjectId,
    period: seed.period ?? null,
    currency: seed.currency ?? null,
    state,
    epistemic: epistemicClass(state),
    method: seed.method,
    calculationVersion: seed.calculationVersion ?? FINANCE_INTELLIGENCE_VERSION,
    inputs: seed.inputs,
    sourceTimestamp: seed.sourceTimestamp ?? null,
    dataTimestamp: seed.dataTimestamp ?? null,
    confidence: state === "ESTIMATED" || state === "FORECAST" ? confidence : null,
    quality: seed.quality ?? "UNSPECIFIED",
  };
}

export function calculated<T>(seed: ProvenanceSeed, value: T): MetricOutcome<T> {
  return { kind: "VALUE", state: "CALCULATED", value, provenance: provenance(seed, "CALCULATED") };
}

export function verified<T>(seed: ProvenanceSeed, value: T): MetricOutcome<T> {
  return { kind: "VALUE", state: "VERIFIED", value, provenance: provenance(seed, "VERIFIED") };
}

export function estimated<T>(seed: ProvenanceSeed, value: T, confidence: number | null = null): MetricOutcome<T> {
  return { kind: "VALUE", state: "ESTIMATED", value, provenance: provenance(seed, "ESTIMATED", confidence) };
}

export function forecasted<T>(seed: ProvenanceSeed, value: T, confidence: number | null = null): MetricOutcome<T> {
  return { kind: "VALUE", state: "FORECAST", value, provenance: provenance(seed, "FORECAST", confidence) };
}

export function missing<T>(seed: ProvenanceSeed, reason: string): MetricOutcome<T> {
  return { kind: "ABSENT", state: "MISSING", reason, provenance: provenance(seed, "MISSING") };
}

export function notApplicable<T>(seed: ProvenanceSeed, reason: string): MetricOutcome<T> {
  return { kind: "ABSENT", state: "NOT_APPLICABLE", reason, provenance: provenance(seed, "NOT_APPLICABLE") };
}

export function invalid<T>(seed: ProvenanceSeed, reason: string): MetricOutcome<T> {
  return { kind: "ABSENT", state: "INVALID", reason, provenance: provenance(seed, "INVALID") };
}

/* ------------------------------------------------------------------ */
/* Input parsing — strict, never coerced                               */
/* ------------------------------------------------------------------ */

/**
 * Parse an exact decimal input into a number, rejecting anything that is not a finite decimal.
 *
 * `null`/`""` are ABSENT (`null` return), not zero. A malformed string THROWS: silently reading
 * `"n/a"` as `0` is precisely the fabrication the whole layer exists to prevent. Callers that
 * want a non-throwing path check the input first with `hasInput`.
 */
export function parseDecimal(input: MetricInput | undefined | null): number | null {
  if (!input || input.value === null) return null;
  const raw = input.value.trim();
  if (raw === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Input '${input.name}' is not a decimal value: source '${input.source}' supplied a non-numeric figure.`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Input '${input.name}' from '${input.source}' is out of representable range.`);
  }
  return value;
}

export function hasInput(inputs: readonly MetricInput[], name: string): boolean {
  const found = inputs.find((i) => i.name === name);
  return Boolean(found && found.value !== null && found.value.trim() !== "");
}

export function inputFor(inputs: readonly MetricInput[], name: string): MetricInput | null {
  return inputs.find((i) => i.name === name) ?? null;
}

/**
 * Names of the required inputs that are absent. Returns them in declaration order so the
 * NOT_AVAILABLE reason reads deterministically (and is therefore testable).
 */
export function missingInputs(inputs: readonly MetricInput[], required: readonly string[]): string[] {
  return required.filter((name) => !hasInput(inputs, name));
}

/* ------------------------------------------------------------------ */
/* Currency discipline                                                 */
/* ------------------------------------------------------------------ */

/**
 * Assert that every currency-bearing input shares one currency.
 *
 * NEVER silently mix currencies (§4A). The engine has no FX rate of its own: converting requires a
 * governed rate with provenance, and inventing one would fabricate a valuation. A mismatch is an
 * INVALID result, not a converted one.
 */
export function currencyMismatch(inputs: readonly MetricInput[]): string | null {
  const currencies = new Set<string>();
  for (const input of inputs) {
    if (input.currency && input.value !== null && input.value.trim() !== "") currencies.add(input.currency.toUpperCase());
  }
  if (currencies.size <= 1) return null;
  return `Inputs are denominated in more than one currency (${[...currencies].sort().join(", ")}). Convert with a governed FX rate carrying provenance before calculating.`;
}

/** The single currency shared by the given inputs, or null when none/ambiguous. */
export function commonCurrency(inputs: readonly MetricInput[]): string | null {
  const currencies = new Set<string>();
  for (const input of inputs) {
    if (input.currency) currencies.add(input.currency.toUpperCase());
  }
  return currencies.size === 1 ? [...currencies][0] : null;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Render an outcome for a UI or report WITHOUT implying certainty that does not exist.
 *
 * A non-value state renders its state name, never a dash that a reader could mistake for zero and
 * never a number. This is the single place the "label actual/forecast/estimate/missing" rule of
 * §37 is implemented, so no dashboard can invent its own convention.
 */
export function renderOutcome<T>(outcome: MetricOutcome<T>, format: (value: T) => string): string {
  if (outcome.kind === "VALUE") {
    const suffix =
      outcome.state === "VERIFIED" ? "" : outcome.state === "CALCULATED" ? "" : outcome.state === "ESTIMATED" ? " (estimate)" : " (forecast)";
    return `${format(outcome.value)}${suffix}`;
  }
  switch (outcome.state) {
    case "MISSING":
      return "MISSING";
    case "NOT_APPLICABLE":
      return "NOT APPLICABLE";
    case "INVALID":
      return "NOT AVAILABLE";
    default:
      // Unreachable: the ABSENT variant carries exactly the three states above. Returning the
      // conservative label rather than throwing keeps a report renderable if a future state is
      // added without updating this function — a missing label is a worse failure than a coarse one.
      return "NOT AVAILABLE";
  }
}
