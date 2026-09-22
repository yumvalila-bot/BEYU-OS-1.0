/**
 * BEYU OS — VISUALIZATION PROVENANCE & EPISTEMICS (shared capability).
 *
 * Every value that reaches a renderer carries its origin and its epistemic
 * status. The status vocabulary is the CANONICAL Noelia epistemic set from
 * `@/lib/constants` — the visualization foundation does not invent a second
 * epistemics. §12: unknown values remain explicitly UNKNOWN (UNAVAILABLE);
 * they are never fabricated and never rendered as zero.
 */
import { NOELIA_EPISTEMIC_STATUS, SYSTEM_VERSION, type NoeliaEpistemicStatus } from "@/lib/constants";

export { NOELIA_EPISTEMIC_STATUS };
export type VizEpistemicStatus = NoeliaEpistemicStatus;

/** A value plus its epistemic status. UNAVAILABLE means "does not exist or is
 * not in scope" — never zero, never an empty string, never a guess. */
export type VizValue<T = number | string | null> = {
  value: T;
  status: VizEpistemicStatus;
  /** ISO timestamp of the underlying observation, when known. */
  observedAt?: string | null;
  /** Unit for quantitative values ("TZS", "mm", "kWh", "ha", "%", …). */
  unit?: string | null;
};

export function observed<T>(value: T, unit?: string | null, observedAt?: string | null): VizValue<T> {
  return { value, status: "OBSERVED", unit: unit ?? null, observedAt: observedAt ?? null };
}

export function derived<T>(value: T, unit?: string | null): VizValue<T> {
  return { value, status: "DERIVED", unit: unit ?? null, observedAt: null };
}

/** The ONLY honest representation of missing data. */
export function unavailable(): VizValue<null> {
  return { value: null, status: "UNAVAILABLE", unit: null, observedAt: null };
}

export function isUnavailable(v: VizValue<unknown>): boolean {
  return v.status === "UNAVAILABLE" || v.value === null || v.value === undefined;
}

/** Provenance of a visualization dataset: where it came from, when, and under
 * which system version. Attached to every scene manifest and export. */
export type VizProvenance = {
  /** Adapter that produced the data ("UJENZI", "AGRICULTURE", …). */
  sourceAdapter: string;
  /** System of record — the sector tables/services, never the renderer. */
  systemOfRecord: string;
  collectedAt: string;
  systemVersion: string;
  /** Dominant epistemic status across the dataset (worst-case wins). */
  epistemicStatus: VizEpistemicStatus;
};

const STATUS_SEVERITY: Record<VizEpistemicStatus, number> = {
  OBSERVED: 0,
  DERIVED: 1,
  FORECAST: 2,
  SCENARIO: 3,
  INFERENCE: 4,
  RECOMMENDATION: 5,
  PREDICTION: 6,
  UNCERTAINTY: 7,
  UNVERIFIED: 8,
  STALE: 9,
  UNAVAILABLE: 10,
  REQUIRES_HUMAN_REVIEW: 11,
};

/** Worst-case status across a set of values — a manifest is never "OBSERVED"
 * when any part of it is a forecast. */
export function dominantStatus(statuses: VizEpistemicStatus[]): VizEpistemicStatus {
  if (statuses.length === 0) return "UNAVAILABLE";
  return statuses.reduce((worst, s) => (STATUS_SEVERITY[s] > STATUS_SEVERITY[worst] ? s : worst), "OBSERVED");
}

export function buildProvenance(input: {
  sourceAdapter: string;
  systemOfRecord: string;
  statuses: VizEpistemicStatus[];
  collectedAt?: string;
}): VizProvenance {
  return {
    sourceAdapter: input.sourceAdapter,
    systemOfRecord: input.systemOfRecord,
    collectedAt: input.collectedAt ?? new Date().toISOString(),
    systemVersion: SYSTEM_VERSION,
    epistemicStatus: dominantStatus(input.statuses),
  };
}
