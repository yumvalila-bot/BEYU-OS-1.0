import {
  EPISTEMIC_STATUS_LABELS,
  type NoeliaEpistemicStatus,
} from "@/lib/constants";
import type { NoeliaMetricView, NoeliaToolOutput } from "./types";

/**
 * Canonical analytics epistemics (section 8 of the Noelia capability target).
 *
 * Every analytical result must identify its epistemic status. These helpers
 * map the specialist engines' basis vocabularies onto the canonical status
 * catalogue and enforce the "never lie" rules:
 *
 *   missing ≠ zero            → UNAVAILABLE
 *   forecast ≠ actual         → FORECAST
 *   scenario ≠ fact           → SCENARIO
 *   inference ≠ observation   → INFERENCE
 *   stale ≠ current           → STALE
 *   unverified ≠ authoritative → UNVERIFIED
 */

/** Legacy specialist bases → canonical Noelia epistemics. */
const BASIS_TO_STATUS: Record<string, NoeliaEpistemicStatus> = {
  OBSERVED: "OBSERVED",
  POSTED: "OBSERVED",
  DERIVED: "DERIVED",
  FORECAST: "FORECAST",
  SCENARIO: "SCENARIO",
  ASSUMPTION: "INFERENCE",
  ASSUMED: "INFERENCE",
  PREDICTION: "PREDICTION",
  DATA_NOT_AVAILABLE: "UNAVAILABLE",
  DATA_CONFLICT: "UNCERTAINTY",
  UNVERIFIED: "UNVERIFIED",
  STALE: "STALE",
  REQUIRES_HUMAN_REVIEW: "REQUIRES_HUMAN_REVIEW",
  REQUIRES_AUTHORITY: "REQUIRES_HUMAN_REVIEW",
  REQUIRES_POLICY: "REQUIRES_HUMAN_REVIEW",
  REQUIRES_SPECIALIST_REVIEW: "REQUIRES_HUMAN_REVIEW",
  GOVERNANCE_REVIEW_REQUIRED: "REQUIRES_HUMAN_REVIEW",
  SIMULATION_ONLY: "SCENARIO",
  LOCKED: "UNAVAILABLE",
  PENDING_POLICY: "REQUIRES_HUMAN_REVIEW",
  AUTHORITATIVE: "OBSERVED",
  POTENTIAL_ANOMALY: "INFERENCE",
};

/** Map any engine/result basis string onto the canonical catalogue. */
export function canonicalStatus(basis: string | null | undefined): NoeliaEpistemicStatus {
  if (!basis) return "UNCERTAINTY";
  const direct = BASIS_TO_STATUS[basis.toUpperCase()];
  if (direct) return direct;
  return "INFERENCE";
}

export function statusLabel(status: NoeliaEpistemicStatus): string {
  return EPISTEMIC_STATUS_LABELS[status];
}

/** A metric view with explicit epistemic status. */
export function metric(input: {
  code: string;
  label: string;
  value: string;
  status: NoeliaEpistemicStatus;
  confidence?: number | null;
  source?: string | null;
  period?: string | null;
  trend?: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
}): NoeliaMetricView {
  return {
    code: input.code,
    label: input.label,
    value: input.value,
    status: input.status,
    confidence: input.confidence ?? null,
    source: input.source ?? null,
    period: input.period ?? null,
    trend: input.trend ?? "UNKNOWN",
  };
}

/**
 * Confidence is explainable and source-aware: never a bare maximum. This
 * combines the number of independent authoritative sources, the strongest
 * observed basis and per-tool confidence into a single 0-1 score with a
 * plain-language reason.
 */
export function explainableConfidence(input: {
  toolOutputs: NoeliaToolOutput[];
  hasSources: boolean;
}): { confidence: number; reason: string } {
  const { toolOutputs, hasSources } = input;
  if (toolOutputs.length === 0) {
    return { confidence: 0.2, reason: "No capability produced evidence." };
  }
  const confidences = toolOutputs
    .map((output) => output.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (confidences.length === 0) {
    return { confidence: hasSources ? 0.5 : 0.25, reason: "Evidence exists but no engine declared confidence." };
  }
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const strongest = Math.max(...confidences);
  // Mean anchors the score; strong sources pull it up; absence of sources caps it.
  const score = Math.min(0.97, Math.max(0.1, mean * 0.7 + strongest * 0.3)) * (hasSources ? 1 : 0.85);
  return {
    confidence: Math.round(score * 1000) / 1000,
    reason: `Mean engine confidence ${mean.toFixed(2)} blended with strongest ${strongest.toFixed(2)} across ${toolOutputs.length} capability output(s).`,
  };
}

/** Simple deterministic trend classification over ordered numeric samples. */
export function classifyTrend(samples: number[]): "UP" | "DOWN" | "FLAT" | "UNKNOWN" {
  if (samples.length < 2) return "UNKNOWN";
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return "UNKNOWN";
  const delta = last - first;
  const span = Math.max(Math.abs(first), Math.abs(last), 1);
  if (Math.abs(delta) / span < 0.02) return "FLAT";
  return delta > 0 ? "UP" : "DOWN";
}

/**
 * Deterministic z-score anomaly flagging over numeric samples.
 * Returns indices whose absolute z-score exceeds the threshold.
 */
export function detectAnomalies(samples: Array<{ index: number; value: number }>, zThreshold = 2.0): number[] {
  const values = samples.map((s) => s.value).filter((v) => Number.isFinite(v));
  if (values.length < 4) return [];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return [];
  return samples
    .filter((s) => Number.isFinite(s.value) && Math.abs((s.value - mean) / stddev) > zThreshold)
    .map((s) => s.index);
}
