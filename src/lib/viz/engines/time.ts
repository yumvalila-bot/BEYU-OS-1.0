/**
 * BEYU OS — 4D TIME ENGINE (shared capability, §10).
 *
 * ONE temporal model over the EXISTING event-driven architecture: timelines
 * are built from governed enterprise events and sector time-anchored records
 * supplied by adapters. This engine does NOT create a parallel event system —
 * it consumes `enterprise_events` (canonical, hash-chained) and sector records
 * (schedules, diaries, cycles) through adapter reads.
 *
 * Deterministic and pure: no DB access here, so the same inputs always produce
 * the same timeline (auditability + testability).
 */
import { observed, unavailable, type VizValue } from "../provenance";

export type TimePoint = {
  /** ISO 8601 anchor. */
  at: string;
  label: string;
  /** Provenance of the anchor: an event type or record kind. */
  source: string;
  /** Whether this is an OBSERVED occurrence or a PLANNED/FORECAST state. */
  kind: "OCCURRED" | "PLANNED" | "FORECAST";
  /** Opaque reference to the underlying governed record/event. */
  ref: string;
};

export type TimeSeries = {
  /** Stable state key (e.g. an object id) whose states evolve. */
  subjectKey: string;
  points: TimePoint[];
};

export type TimeWindow = { from: string | null; to: string | null };

export type TimeCursor = {
  at: string;
  /** Playback window the cursor lives in. */
  window: TimeWindow;
};

/** Parse an ISO anchor defensively; malformed anchors sort last, never crash. */
function ts(at: string): number {
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** Build one ordered timeline from mixed governed sources. */
export function buildTimeline(points: TimePoint[]): TimePoint[] {
  return [...points].sort((a, b) => ts(a.at) - ts(b.at));
}

/** Apply a time filter (§10). Null bounds are open. */
export function filterWindow(points: TimePoint[], window: TimeWindow): TimePoint[] {
  return points.filter((p) => {
    const t = ts(p.at);
    if (t === Number.MAX_SAFE_INTEGER) return false; // malformed anchors never render
    if (window.from && t < ts(window.from)) return false;
    if (window.to && t > ts(window.to)) return false;
    return true;
  });
}

/**
 * Resolve the state of a subject at a time: the latest point at-or-before `at`.
 * A subject with no point at-or-before the cursor has NO state — returned as
 * explicitly UNAVAILABLE, never back-filled from the future and never invented.
 */
export function stateAt<T>(series: Array<{ at: string; state: T }>, at: string): VizValue<T | null> {
  const cursor = ts(at);
  let best: { at: string; state: T } | null = null;
  for (const entry of series) {
    const t = ts(entry.at);
    if (t > cursor) continue;
    if (!best || t >= ts(best.at)) best = entry;
  }
  if (!best) return unavailable();
  return observed(best.state, null, best.at);
}

/** Playback frames: evenly spaced cursor positions across the timeline. */
export function playbackFrames(points: TimePoint[], frameCount: number): string[] {
  if (points.length === 0 || frameCount <= 0) return [];
  const sorted = buildTimeline(points).filter((p) => Number.isFinite(Date.parse(p.at)));
  if (sorted.length === 0) return [];
  if (sorted.length === 1) return [sorted[0].at];
  const start = ts(sorted[0].at);
  const end = ts(sorted[sorted.length - 1].at);
  const frames: string[] = [];
  const steps = Math.min(frameCount, sorted.length);
  for (let i = 0; i < steps; i += 1) {
    const t = start + ((end - start) * i) / (steps - 1);
    frames.push(new Date(t).toISOString());
  }
  return frames;
}

/** Separate observed history from planned/forecast futures (§10: historical
 * states vs future states must never be visually conflated). */
export function splitObservedPlanned(points: TimePoint[]): { history: TimePoint[]; planned: TimePoint[] } {
  const history = buildTimeline(points.filter((p) => p.kind === "OCCURRED"));
  const planned = buildTimeline(points.filter((p) => p.kind !== "OCCURRED"));
  return { history, planned };
}

/**
 * Map a governed enterprise-event type to the dimensions it refreshes.
 * Consumed by clients to decide a governed refresh after an event-driven
 * change (§24). Unknown events refresh nothing — no speculative invalidation.
 */
export const TIME_ANCHORED_EVENT_HINTS: Readonly<Record<string, string[]>> = Object.freeze({
  PROJECT_CREATED: ["2D", "4D"],
  PROJECT_HANDED_OVER: ["4D", "7D"],
  SITE_PROGRESS_RECORDED: ["4D", "7D"],
  BOQ_APPROVED: ["5D"],
  PURCHASE_ORDER_APPROVED: ["5D"],
  PAYMENT_CERTIFIED: ["5D"],
  HARVEST_RECORDED: ["4D", "5D"],
  ASSET_STATUS_CHANGED: ["7D"],
  WORK_PACKAGE_UPDATED: ["4D", "7D"],
  SCHEDULE_CHANGED: ["4D"],
  RISK_CREATED: ["8D"],
  RISK_UPDATED: ["8D"],
  INSPECTION_RECORDED: ["8D", "7D"],
  COMPLIANCE_CHANGED: ["8D"],
  NCR_CREATED: ["8D"],
  NCR_CLOSED: ["8D"],
  HSE_INCIDENT_RECORDED: ["8D"],
  FINANCIAL_STATE_CHANGED: ["5D"],
  HEALTH_FACILITY_CHANGED: ["7D"],
  AGRICULTURAL_ASSET_CHANGED: ["7D"],
});
