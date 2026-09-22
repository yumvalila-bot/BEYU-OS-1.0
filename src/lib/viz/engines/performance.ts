/**
 * BEYU OS — 6D ENVIRONMENT / PERFORMANCE ENGINE (shared capability, §12).
 *
 * Energy, environmental conditions, sustainability, operational performance,
 * resource efficiency, climate data and asset performance.
 *
 * Sector adapters determine which data is applicable. DATA IS NEVER
 * FABRICATED: a metric without an authorized observation is UNAVAILABLE and
 * renders as "UNKNOWN" — never zero, never an interpolated guess.
 */
import { observed, unavailable, dominantStatus, type VizEpistemicStatus, type VizValue } from "../provenance";

export const PERFORMANCE_METRIC_KINDS = [
  "ENERGY",
  "WATER",
  "ENVIRONMENTAL_CONDITION",
  "SUSTAINABILITY",
  "OPERATIONAL_PERFORMANCE",
  "RESOURCE_EFFICIENCY",
  "CLIMATE",
  "ASSET_PERFORMANCE",
] as const;
export type PerformanceMetricKind = (typeof PERFORMANCE_METRIC_KINDS)[number];

export type PerformanceSample = {
  subjectKey: string;
  kind: PerformanceMetricKind;
  code: string;
  reading: VizValue<number | string | null>;
  at: string | null;
};

export type PerformanceSeries = {
  subjectKey: string;
  kind: PerformanceMetricKind;
  code: string;
  unit: string | null;
  samples: Array<{ at: string; reading: VizValue<number | string | null> }>;
  /** Series-level honest status: worst case across samples. */
  status: VizEpistemicStatus;
};

/** Group raw samples into series with honest worst-case status. */
export function buildPerformanceSeries(samples: PerformanceSample[]): PerformanceSeries[] {
  const groups = new Map<string, PerformanceSample[]>();
  for (const s of samples) {
    const key = `${s.subjectKey}|${s.kind}|${s.code}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const [subjectKey, kind, code] = key.split("|") as [string, PerformanceMetricKind, string];
    const timed = rows
      .filter((r) => r.at && Number.isFinite(Date.parse(r.at)))
      .sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!))
      .map((r) => ({ at: r.at as string, reading: r.reading }));
    const unit = rows.find((r) => r.reading.unit)?.reading.unit ?? null;
    return {
      subjectKey,
      kind,
      code,
      unit,
      samples: timed,
      status: dominantStatus(rows.map((r) => r.reading.status)),
    };
  });
}

/** Latest known reading per metric. Missing → UNAVAILABLE (explicit unknown). */
export function latestReadings(samples: PerformanceSample[]): Array<{ subjectKey: string; code: string; reading: VizValue<number | string | null> }> {
  const byKey = new Map<string, PerformanceSample>();
  for (const s of samples) {
    const key = `${s.subjectKey}|${s.code}`;
    const prev = byKey.get(key);
    if (!prev || (s.at && prev.at && Date.parse(s.at) >= Date.parse(prev.at))) byKey.set(key, s);
  }
  return [...byKey.values()].map((s) => ({ subjectKey: s.subjectKey, code: s.code, reading: s.reading }));
}

/** Threshold breach detection for governed limits (e.g. environmental
 * compliance thresholds). A breach is DERIVED from OBSERVED readings; an
 * UNAVAILABLE reading never produces a false "compliant". */
export function thresholdBreaches(
  samples: PerformanceSample[],
  limits: Record<string, { max?: number; min?: number }>,
): Array<{ subjectKey: string; code: string; reading: VizValue<number | string | null>; breach: "ABOVE_MAX" | "BELOW_MIN" | null }> {
  return latestReadings(samples)
    .filter((r) => limits[r.code])
    .map((r) => {
      const limit = limits[r.code];
      if (r.reading.value === null || r.reading.value === undefined || r.reading.status === "UNAVAILABLE") {
        return { ...r, breach: null };
      }
      const n = Number(r.reading.value);
      if (!Number.isFinite(n)) return { ...r, breach: null };
      if (limit.max !== undefined && n > limit.max) return { ...r, breach: "ABOVE_MAX" as const };
      if (limit.min !== undefined && n < limit.min) return { ...r, breach: "BELOW_MIN" as const };
      return { ...r, breach: null };
    });
}

/** Convenience constructor adapters use for a metric with no authorized data. */
export function unknownMetric(subjectKey: string, kind: PerformanceMetricKind, code: string): PerformanceSample {
  return { subjectKey, kind, code, reading: unavailable(), at: null };
}

export function metricSample(subjectKey: string, kind: PerformanceMetricKind, code: string, value: number, unit: string, at: string): PerformanceSample {
  return { subjectKey, kind, code, reading: observed(value, unit, at), at };
}
