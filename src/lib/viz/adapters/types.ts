/**
 * BEYU OS — SECTOR VISUALIZATION ADAPTER CONTRACTS (shared capability, §17/§19).
 *
 * Adapters are the ONLY authorized path from sector data into the universal
 * dimensional model. The graphics core never couples to a sector database
 * directly, and a sector never pushes unfiltered rows at a renderer.
 *
 * GOVERNED PIPELINE PER REQUEST
 * ─────────────────────────────
 *   Identity → RBAC → ABAC → Policy → Scope → Data Authorization
 *          → Sector Adapter (THIS CONTRACT) → Visualization Model → Renderer
 *
 * ADAPTER INVARIANTS
 * ──────────────────
 *   1. READ-ONLY: an adapter has no write path. It cannot mutate sector state,
 *      post anything, or change permissions. (Finance: CAP_POSTING LOCKED.)
 *   2. SELF-AUTHORIZING: `collect()` re-checks the sector's OWN access
 *      boundary through the canonical resolver before reading a single row —
 *      the route-level viz permission is necessary but never sufficient.
 *   3. CLASSIFICATION-TAGGED: every produced object carries the source row's
 *      classification so the manifest builder filters BEFORE projection.
 *   4. HONEST: values without an authorized observation are UNAVAILABLE.
 *      Adapters never fabricate, interpolate or default data (§12).
 *   5. NO PHI: the Health adapter never exposes protected health information;
 *      patient-level data is not twin/visualization material through this
 *      layer, and the adapter fails closed without the federation link.
 */
import type { Principal } from "@/lib/authz";
import type { Classification } from "@/lib/constants";
import type { VizFeatureStatus, VizSectorCode } from "../dimensions";
import type { QuantityPoint } from "../engines/quantity";
import type { LifecycleEvent } from "../engines/lifecycle";
import type { PerformanceSample } from "../engines/performance";
import type { RiskPoint } from "../engines/risk";
import type { TimePoint } from "../engines/time";
import type { SceneObjectInput } from "../scene-model";
import type { TwinRelationship } from "../digital-twin";

export type AdapterRequest = {
  /** Optional subject filter (e.g. one Ujenzi project id). A REFERENCE only —
   * the adapter re-scopes it inside the principal's tenant; a cross-tenant id
   * simply matches nothing. */
  subjectId?: string | null;
  /** Dimensions the scene activates; adapters may skip expensive facets the
   * scene did not request (performance, §28 — never an authorization choice). */
  dimensions: string[];
  /** Bounded page size for progressive loading (§27/§28). */
  limit?: number;
};

export type AdapterDataset = {
  sector: VizSectorCode;
  /** Honest adapter status for THIS collection. */
  status: "OK" | "NOT_AVAILABLE" | "PARTIAL";
  /** Why data is absent/partial — surfaced to governed users, never to
   * unauthorized ones (the whole dataset is refused instead). */
  reason?: string;
  objects: SceneObjectInput[];
  time: TimePoint[];
  quantities: QuantityPoint[];
  performance: PerformanceSample[];
  lifecycle: LifecycleEvent[];
  risk: RiskPoint[];
  relationships: TwinRelationship[];
  /** System of record description for provenance. */
  systemOfRecord: string;
};

export type AdapterDescriptor = {
  sector: VizSectorCode;
  /** Adapter implementation status (honest, §45). */
  status: VizFeatureStatus;
  /** Dimensions the adapter can supply today. */
  suppliedDimensions: string[];
  /** Sector capabilities the adapter maps (per §17 lists). */
  mappedCapabilities: string[];
  /** What is NOT implemented — declared, not hidden. */
  notImplemented: string[];
  systemOfRecord: string;
};

export type SectorVisualizationAdapter = {
  readonly sector: VizSectorCode;
  describe(): AdapterDescriptor;
  /**
   * Collect the authorized visualization dataset for a principal.
   * MUST re-check sector access (assertSectorAccess) before reading, MUST run
   * inside the caller's tenant database context (RLS active), and MUST tag
   * every object with its source classification.
   */
  collect(principal: Principal, request: AdapterRequest): Promise<AdapterDataset>;
};

/** Shared empty dataset (fail-closed shape). */
export function emptyDataset(sector: VizSectorCode, systemOfRecord: string, reason?: string): AdapterDataset {
  return {
    sector,
    status: reason ? "NOT_AVAILABLE" : "OK",
    reason,
    objects: [],
    time: [],
    quantities: [],
    performance: [],
    lifecycle: [],
    risk: [],
    relationships: [],
    systemOfRecord,
  };
}

/** Row classification guard reused by every adapter: only known
 * classifications at-or-below the principal's clearance survive (defence in
 * depth on top of RLS + the manifest projection). */
export function rowVisible(classification: unknown, allowed: Classification[]): boolean {
  return typeof classification === "string" && allowed.includes(classification as Classification);
}
