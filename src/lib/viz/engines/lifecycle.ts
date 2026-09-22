/**
 * BEYU OS — 7D LIFECYCLE / OPERATIONS ENGINE (shared capability, §13).
 *
 * Asset lifecycle, maintenance, operations, service history, replacement
 * planning, operational status, inspections, commissioning and
 * decommissioning — projected from EXISTING sector statuses. The engine never
 * mutates sector state; it reads the canonical status vocabulary each sector
 * already owns (Ujenzi UJENZI_STATUS, agriculture statuses, equipment service
 * records, punch/handover items) and maps it onto ONE neutral lifecycle rail
 * so every Sector OS can present lifecycle the same way.
 */
import { derived, observed, unavailable, type VizValue } from "../provenance";

/** The neutral lifecycle rail. Sector statuses map INTO it; the mapping is
 * declarative data, so a new sector status never requires engine changes. */
export const LIFECYCLE_STAGES = [
  "PLANNED",
  "ACTIVE",
  "UNDER_MAINTENANCE",
  "SUSPENDED",
  "COMMISSIONING",
  "COMPLETED",
  "HANDED_OVER",
  "DECOMMISSIONED",
  "ARCHIVED",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export type LifecycleEvent = {
  subjectKey: string;
  stage: LifecycleStage;
  at: string | null;
  /** Sector status that produced this stage (provenance). */
  sourceStatus: string;
  source: string;
};

/**
 * Declarative sector-status → lifecycle-stage mapping. UNKNOWN statuses map to
 * no stage (fail-closed): an unmapped status is never guessed into a stage.
 */
export const LIFECYCLE_STAGE_MAP: Readonly<Record<string, LifecycleStage>> = Object.freeze({
  // Ujenzi OS (projects, phases, certificates, punch)
  PLANNED: "PLANNED",
  ACTIVE: "ACTIVE",
  IN_PROGRESS: "ACTIVE",
  COMPLETED: "COMPLETED",
  HANDED_OVER: "HANDED_OVER",
  ARCHIVED: "ARCHIVED",
  DRAFT: "PLANNED",
  CERTIFIED: "COMPLETED",
  SUPERSEDED: "ARCHIVED",
  OPEN: "ACTIVE",
  VERIFIED: "COMPLETED",
  CLOSED: "COMPLETED",
  // Agriculture OS (cycles, work orders, equipment)
  PREPARING: "PLANNED",
  GROWING: "ACTIVE",
  HARVESTED: "COMPLETED",
  DORMANT: "SUSPENDED",
  SERVICED: "UNDER_MAINTENANCE",
  IN_SERVICE: "UNDER_MAINTENANCE",
  OUT_OF_SERVICE: "SUSPENDED",
  RETIRED: "DECOMMISSIONED",
  // Generic operations
  SUSPENDED: "SUSPENDED",
  UNDER_MAINTENANCE: "UNDER_MAINTENANCE",
  COMMISSIONING: "COMMISSIONING",
  DECOMMISSIONED: "DECOMMISSIONED",
});

export function mapStatusToStage(status: string | null | undefined): LifecycleStage | null {
  if (!status) return null;
  return LIFECYCLE_STAGE_MAP[status.trim().toUpperCase()] ?? null;
}

export type LifecycleProjection = {
  subjectKey: string;
  /** Current stage — UNAVAILABLE when no governed record maps to one. */
  currentStage: VizValue<LifecycleStage | null>;
  /** Ordered stage history (7D rail). */
  history: LifecycleEvent[];
  /** Maintenance/inspection markers derived from sector records. */
  maintenance: Array<{ at: string | null; kind: string; label: string }>;
};

/** Project one subject's lifecycle from its governed events. */
export function projectLifecycle(subjectKey: string, events: LifecycleEvent[], maintenance: LifecycleProjection["maintenance"] = []): LifecycleProjection {
  const mapped = events.filter((e) => LIFECYCLE_STAGES.includes(e.stage));
  const timed = mapped
    .filter((e) => e.at && Number.isFinite(Date.parse(e.at)))
    .sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
  const latest = timed.length > 0 ? timed[timed.length - 1] : mapped.length > 0 ? mapped[mapped.length - 1] : null;
  return {
    subjectKey,
    currentStage: latest ? observed(latest.stage, null, latest.at) : unavailable(),
    history: mapped,
    maintenance,
  };
}

/** Replacement-planning hint: age of the current ACTIVE stage vs a governed
 * horizon. Without an anchor or horizon the answer is UNAVAILABLE — the engine
 * never invents a replacement date. */
export function replacementPlanningHint(current: LifecycleProjection, horizonDays: number | null): VizValue<string | null> {
  const anchor = current.history.find((e) => e.at)?.at ?? null;
  if (!anchor || !horizonDays || horizonDays <= 0) return unavailable();
  const dueAt = new Date(Date.parse(anchor) + horizonDays * 86_400_000).toISOString().slice(0, 10);
  return derived(`Review for replacement planning by ${dueAt} (horizon ${horizonDays}d from ${anchor.slice(0, 10)}).`);
}

/** Percentage-complete projection for progress-bearing sector records
 * (Ujenzi phases carry progress_pct; others derive from stage position). */
export function stageProgress(stage: LifecycleStage | null): VizValue<number | null> {
  if (!stage) return unavailable();
  const idx = LIFECYCLE_STAGES.indexOf(stage);
  if (idx < 0) return unavailable();
  return derived(Math.round((idx / (LIFECYCLE_STAGES.length - 1)) * 100), "%");
}
