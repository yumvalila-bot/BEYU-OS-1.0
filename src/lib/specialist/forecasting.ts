/**
 * BEYU OS — Forecasting Intelligence specialist (Phase 7B, Priority 1).
 *
 * Produces forward-looking projections from observed history. It is ANALYTICAL and READ-ONLY with
 * respect to financial truth: it can never post a journal entry, and it holds no accounting
 * opinion.
 *
 * WHY THIS IS SAFE TO BUILD WITHOUT RATIFICATION. A forecast is a statement about what MIGHT
 * happen. It is not a measurement, a recognition event, or an instruction. None of P1-P11 is
 * required to project a series of observed numbers forward — that is arithmetic over history,
 * not accounting policy.
 *
 * WHERE ACCOUNTING POLICY WOULD BE NEEDED, IT IS DECLARED, NOT GUESSED. A forecast whose
 * interpretation depends on an unratified decision is returned with an explicit qualifier
 * (`PENDING_POLICY` / `REQUIRES_AUTHORITY`) and the blocking decision ids, rather than silently
 * assuming a treatment. Specifically:
 *   - forecasting a LEDGER balance requires a chart of accounts (P6) and recognition basis (P1);
 *   - forecasting across currencies requires the FX decision (P4).
 * Neither is assumed here.
 *
 * DETERMINISM. Every method is a pure function of (observations, horizon, parameters). The same
 * inputs and the same `version` always produce the same output, so a forecast can be replayed and
 * independently checked — a requirement for anything that may later inform a governed decision.
 */
import { SpecialistError, runSpecialist, type SpecialistContext, type SpecialistResult } from "./platform";

export const FORECASTING_VERSION = "forecast-1.0.0";

/** A single observed historical data point. Supplied by the caller from a governed source. */
export type Observation = {
  /** ISO date (YYYY-MM-DD) of the period the observation belongs to. */
  periodDate: string;
  /** Observed value in minor units of `currency`, as a decimal string. */
  value: string;
  currency: string;
  /** Where this observation came from, for provenance. */
  sourceType: string;
  sourceId: string;
};

export type ForecastMethod = "NAIVE_LAST" | "MOVING_AVERAGE" | "LINEAR_TREND";

export type ForecastRequest = {
  seriesCode: string;
  observations: Observation[];
  /** Number of future periods to project. */
  horizon: number;
  method: ForecastMethod;
  /** Named scenario. "BASELINE" is conventional; any label is permitted. */
  scenario?: string;
  /** Explicit assumptions the caller is making. Recorded verbatim in provenance. */
  assumptions?: string[];
  /** Window for MOVING_AVERAGE. Ignored by other methods. */
  window?: number;
};

export type ForecastPoint = {
  /** 1-based index into the future, relative to the last observation. */
  step: number;
  value: string;
  /** Symmetric uncertainty band derived from historical dispersion. */
  lowerBound: string;
  upperBound: string;
};

export type ForecastOutput = {
  seriesCode: string;
  method: ForecastMethod;
  scenario: string;
  currency: string;
  horizon: number;
  observationCount: number;
  points: ForecastPoint[];
  /** 0-1. Derived from sample size and dispersion; never asserted as a probability of truth. */
  confidence: number;
};

/** Parses a decimal string into integer minor units. Rejects anything ambiguous. */
function toMinor(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw new SpecialistError("RULE_VIOLATION", `Observation '${value}' is not a valid amount.`);
  }
  const [whole, frac = ""] = value.split(".");
  const negative = whole.startsWith("-");
  const magnitude = Number(`${whole.replace("-", "")}${frac.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(magnitude)) {
    throw new SpecialistError("RULE_VIOLATION", `Observation '${value}' exceeds the safe range.`);
  }
  return negative ? -magnitude : magnitude;
}

function fromMinor(minor: number): string {
  const rounded = Math.round(minor);
  const negative = rounded < 0;
  const s = Math.abs(rounded).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/**
 * Pure projection. Exported so it can be unit-tested and replayed without any database, principal
 * or authority — the deterministic core of the specialist.
 */
export function project(request: ForecastRequest): ForecastOutput {
  const { observations, horizon, method } = request;

  if (!Array.isArray(observations) || observations.length === 0) {
    throw new SpecialistError("RULE_VIOLATION", "At least one observation is required.");
  }
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 120) {
    throw new SpecialistError("RULE_VIOLATION", "Horizon must be an integer between 1 and 120.");
  }

  const currencies = new Set(observations.map((o) => o.currency));
  if (currencies.size > 1) {
    // Mixing currencies would require the FX decision (P4), which is unratified.
    throw new SpecialistError(
      "RULE_VIOLATION",
      "Observations span multiple currencies; cross-currency forecasting requires the FX decision (P4).",
    );
  }
  const currency = observations[0].currency;
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new SpecialistError("RULE_VIOLATION", "Currency must be a three-letter ISO code.");
  }

  // Chronological order is required for trend and recency methods to be meaningful.
  const sorted = [...observations].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  for (const o of sorted) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.periodDate)) {
      throw new SpecialistError("RULE_VIOLATION", `Observation date '${o.periodDate}' is not an ISO date.`);
    }
  }
  const values = sorted.map((o) => toMinor(o.value));

  let projector: (step: number) => number;
  switch (method) {
    case "NAIVE_LAST": {
      const last = values[values.length - 1];
      projector = () => last;
      break;
    }
    case "MOVING_AVERAGE": {
      const window = request.window ?? Math.min(3, values.length);
      if (!Number.isInteger(window) || window < 1 || window > values.length) {
        throw new SpecialistError("RULE_VIOLATION", "Window must be between 1 and the observation count.");
      }
      const slice = values.slice(-window);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      projector = () => mean;
      break;
    }
    case "LINEAR_TREND": {
      if (values.length < 2) {
        throw new SpecialistError("RULE_VIOLATION", "LINEAR_TREND requires at least two observations.");
      }
      // Ordinary least squares on (index, value).
      const n = values.length;
      const meanX = (n - 1) / 2;
      const meanY = values.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i += 1) {
        num += (i - meanX) * (values[i] - meanY);
        den += (i - meanX) ** 2;
      }
      const slope = den === 0 ? 0 : num / den;
      const intercept = meanY - slope * meanX;
      projector = (step) => intercept + slope * (n - 1 + step);
      break;
    }
    default:
      throw new SpecialistError("RULE_VIOLATION", `Unknown forecast method '${method}'.`);
  }

  // Dispersion drives the uncertainty band. With a single observation there is no dispersion
  // evidence, so the band is widened rather than falsely reported as certain.
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
      : Math.abs(mean) ** 2;
  const stdDev = Math.sqrt(variance);

  const points: ForecastPoint[] = [];
  for (let step = 1; step <= horizon; step += 1) {
    const value = projector(step);
    // Uncertainty grows with distance from observed data.
    const spread = stdDev * Math.sqrt(step);
    points.push({
      step,
      value: fromMinor(value),
      lowerBound: fromMinor(value - spread),
      upperBound: fromMinor(value + spread),
    });
  }

  // Confidence rises with sample size and falls with relative dispersion. Deliberately simple and
  // explainable rather than a black box.
  const relativeDispersion = mean === 0 ? 1 : Math.min(1, stdDev / Math.abs(mean));
  const sampleFactor = Math.min(1, values.length / 12);
  const confidence = Number((Math.max(0.05, sampleFactor * (1 - relativeDispersion))).toFixed(2));

  return {
    seriesCode: request.seriesCode,
    method,
    scenario: request.scenario ?? "BASELINE",
    currency,
    horizon,
    observationCount: values.length,
    points,
    confidence,
  };
}

/**
 * Governed forecast. Runs through the canonical specialist pattern, so RBAC, tenant isolation,
 * entity scope, provenance and audit emission are enforced identically to every other specialist.
 *
 * No capability is declared: forecasting writes nothing to financial truth, so gating it would be
 * security theatre. What IS declared is the accounting dependency — any forecast that a caller
 * might mistake for an accounting figure is qualified below.
 */
export async function forecast(
  context: SpecialistContext,
  request: ForecastRequest,
): Promise<SpecialistResult<ForecastOutput>> {
  return runSpecialist<ForecastOutput>(
    {
      specialist: "FORECASTING",
      operation: "PROJECT_SERIES",
      kind: "ANALYSIS",
      permission: "finance:ledger.read",
      version: FORECASTING_VERSION,
      riskClass: "LOW",
    },
    context,
    async () => {
      const output = project(request);

      const explanation = [
        `Method ${output.method} applied to ${output.observationCount} observation(s) in ${output.currency}.`,
        `Projected ${output.horizon} period(s) forward; uncertainty widens with sqrt(step) from observed dispersion.`,
        `Confidence ${output.confidence} derives from sample size and relative dispersion only.`,
        "This is a projection of observed history. It is not a measurement, a recognition event, or an instruction.",
      ];

      return {
        data: output,
        explanation,
        provenance: {
          sources: request.observations.map((o) => ({ type: o.sourceType, id: o.sourceId })),
          assumptions: [
            ...(request.assumptions ?? []),
            "Historical pattern continues over the forecast horizon.",
            "No accounting recognition basis is assumed (P1 unratified).",
          ],
          // A forecast expressed against ledger accounts would depend on these.
          blockedBy: ["P1", "P6"],
        },
      };
    },
  );
}
