/**
 * BEYU OS — UNIVERSAL DIMENSION REGISTRY (shared capability).
 *
 * ONE shared BEYU Universal Dimensional Graphics, Visualization, Simulation,
 * Digital Twin & Future XR Foundation. This module is its constitutional core:
 * the canonical dimension model 1D → 8D plus the governed 9D+ extension
 * mechanism and the XD extensible umbrella.
 *
 * WHAT THIS IS NOT
 * ────────────────
 *   • NOT a new operating system. The canonical Sector OS set remains
 *     Health OS, Finance OS, Agriculture OS and Ujenzi OS (plus Foundation OS).
 *     There is no "BIM OS", "GIS OS", "Digital Twin OS", "Graphics OS" or
 *     "XR OS" — those are capabilities inside this shared foundation.
 *   • NOT an authorization layer. Dimensions are metadata; every activation
 *     still travels Identity → RBAC → ABAC → Policy → Scope → Sector Adapter
 *     → Visualization Model → Renderer (see ./authorization.ts).
 *   • NOT literal physics. 1D..XD are BEYU visualization/simulation/data
 *     dimensions, not spatial dimensions of the universe.
 *
 * EXTENSIBILITY INVARIANT
 * ───────────────────────
 * Adding a dimension NEVER requires a database redesign: canonical dimensions
 * 1D–8D and the XD umbrella live in this module; domain dimensions 9D+ are
 * governed `viz_dimension_extensions` rows (tenant-scoped, RLS-bound, audited)
 * merged by `resolveDimensionRegistry()`. An extension can never shadow,
 * redefine or retire a canonical dimension.
 *
 * HONESTY INVARIANT (§16/§45 of the founding directive)
 * ──────────────────────────────────────────────────────
 * Every dimension and capability carries an explicit lifecycle state —
 * AVAILABLE, EXPERIMENTAL, PLANNED or NOT_IMPLEMENTED — reflecting the ACTUAL
 * repository state. Future functionality is never documented as operational.
 */
import type { PermissionCode } from "@/lib/constants";

/** Feature-status vocabulary shared by every viz subsystem (§45). */
export const VIZ_FEATURE_STATUS = [
  "IMPLEMENTED",
  "PARTIALLY_IMPLEMENTED",
  "EXPERIMENTAL",
  "PLANNED",
  "NOT_IMPLEMENTED",
] as const;
export type VizFeatureStatus = (typeof VIZ_FEATURE_STATUS)[number];

/** Dimension lifecycle states (§16). A dimension is metadata, so its states
 * describe availability of the dimension inside the shared foundation. */
export const DIMENSION_LIFECYCLE_STATES = [
  "AVAILABLE",
  "EXPERIMENTAL",
  "PLANNED",
  "NOT_IMPLEMENTED",
  "RETIRED",
] as const;
export type DimensionLifecycleState = (typeof DIMENSION_LIFECYCLE_STATES)[number];

/** Canonical dimension identifiers. 9D+ extension codes are derived (see
 * `parseDimensionCode`); XD is the extensible umbrella. */
export const CANONICAL_DIMENSION_IDS = ["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D", "XD"] as const;
export type CanonicalDimensionId = (typeof CANONICAL_DIMENSION_IDS)[number];

/** Sector OS codes this shared capability serves. UJENZI IS A SECTOR OS —
 * it appears here as an equal consumer, never as the owner of the graphics
 * foundation, and the foundation is never a Ujenzi subsystem. */
export const VIZ_SECTOR_CODES = ["BEYU", "HEALTH", "FINANCE", "AGRICULTURE", "UJENZI", "FOUNDATION"] as const;
export type VizSectorCode = (typeof VIZ_SECTOR_CODES)[number];

export type DimensionDefinition = {
  /** Stable dimension identifier ("1D".."8D", "XD", or a governed 9D+ code). */
  id: string;
  /** Canonical name. */
  name: string;
  description: string;
  /** Registry-model version of this definition (bumped on semantic change). */
  version: string;
  /** Ordinal for combination ordering (canonical 1..8; extensions ≥ 9). */
  order: number;
  /** What the shared foundation can do with this dimension today. */
  capabilities: string[];
  /** Data the dimension needs; adapters decide applicability per sector. */
  dataRequirements: string[];
  /** Rendering requirements (renderer kinds that can express the dimension). */
  renderingRequirements: string[];
  /** Minimum permission set to ACTIVATE the dimension in a governed scene.
   * Sector data access is additionally re-checked by the sector adapter;
   * no dimension ever widens a sector permission. */
  permissions: PermissionCode[];
  /** Sector applicability ("*" = every current and future Sector OS). */
  sectorApplicability: VizSectorCode[] | "*";
  /** Actual repository state — never aspirational. */
  lifecycleState: DimensionLifecycleState;
  /** Honest implementation status of the dimension machinery. */
  status: VizFeatureStatus;
  provenance: { origin: "CANONICAL" | "EXTENSION"; definedBy: string };
  /** Audit actions recorded when the dimension is activated/extended. */
  auditRequirements: string[];
};

/**
 * The canonical 1D → 8D model (§4). These definitions are the single source
 * of truth consumed by the API, the workspace UI, the adapters and Noelia.
 */
export const CANONICAL_DIMENSIONS: readonly DimensionDefinition[] = Object.freeze([
  {
    id: "1D",
    name: "Information",
    description: "Linear information: series, records, indicators, textual and tabular facts rendered as governed lists, tables and single-axis series.",
    version: "1.0.0",
    order: 1,
    capabilities: ["linear series", "tabular projection", "indicator rails", "accessible text rendering"],
    dataRequirements: ["authorized scalar or tabular records from a sector adapter"],
    renderingRequirements: ["HTML_TABLE", "SVG_2D"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "AVAILABLE",
    status: "IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: ["scene access is audited by the guarded() API boundary"],
  },
  {
    id: "2D",
    name: "Flat graphics",
    description: "Interface, plans, charts, maps, diagrams, schematics, workflows and organizational structures on a two-dimensional surface.",
    version: "1.0.0",
    order: 2,
    capabilities: ["dashboards", "charts", "maps", "diagrams", "plans", "schematics", "workflows", "org structures", "financial visualizations", "health-service coverage maps", "agricultural field maps", "construction drawings"],
    dataRequirements: ["authorized records with 2D-projectable attributes (category, value, coordinates or relationship edges)"],
    renderingRequirements: ["SVG_2D", "CANVAS_2D", "HTML_TABLE"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "AVAILABLE",
    status: "IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: ["scene access is audited by the guarded() API boundary"],
  },
  {
    id: "3D",
    name: "Spatial",
    description: "Spatial objects, geometry and environments: buildings, facilities, medical environments, agricultural environments, network structures, infrastructure, equipment, assets and digital-twin entities.",
    version: "1.0.0",
    order: 3,
    capabilities: ["deterministic planar/isometric projection of governed scene objects (foundation renderer)", "spatial coordinate handling with explicit CRS", "object inspection", "2D fallback when 3D is unavailable"],
    dataRequirements: ["authorized records with spatial attributes (coordinates, bounds or geometry references); geometry is OPTIONAL — never assumed"],
    renderingRequirements: ["SVG_2D projection (foundation)", "WEBGL_3D (planned abstraction; no renderer dependency is bundled)"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "EXPERIMENTAL",
    status: "PARTIALLY_IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: ["scene access is audited by the guarded() API boundary"],
  },
  {
    id: "4D",
    name: "Time",
    description: "Time, motion and sequence: timestamps, timelines, playback, historical states, future (planned) states, event-driven changes, simulation states and time filters.",
    version: "1.0.0",
    order: 4,
    capabilities: ["timeline construction from governed events/records", "state-at-time resolution", "playback windows", "time filters", "historical vs planned-state separation"],
    dataRequirements: ["authorized time-anchored records (enterprise events, schedules, diaries, cycles) from a sector adapter"],
    renderingRequirements: ["TIMELINE", "SVG_2D", "HTML_TABLE"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "AVAILABLE",
    status: "IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: ["scene access is audited by the guarded() API boundary"],
  },
  {
    id: "5D",
    name: "Quantity / Cost / Resource",
    description: "Quantities, resources, budgets, costs, schedules and financial relationships — visualized through authorized READ paths only.",
    version: "1.0.0",
    order: 5,
    capabilities: ["quantity/cost aggregation by kind (ESTIMATE/BUDGET/COMMITTED/ACTUAL/FORECAST)", "resource allocation views", "budget vs actual comparison", "currency-explicit rendering"],
    dataRequirements: ["authorized quantity/cost/resource records from a sector adapter"],
    renderingRequirements: ["CHART", "SVG_2D", "HTML_TABLE"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "AVAILABLE",
    status: "IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: [
      "scene access is audited by the guarded() API boundary",
      "FINANCE BOUNDARY: visualization NEVER creates authorization to post. CAP_POSTING remains LOCKED; no viz code path may write journals, alter ledger balances or bypass Finance approvals/RLS.",
    ],
  },
  {
    id: "6D",
    name: "Environment / Performance",
    description: "Energy, environmental conditions, sustainability, operational performance, resource efficiency, system performance, climate data and asset performance.",
    version: "1.0.0",
    order: 6,
    capabilities: ["metric rails with explicit epistemic status", "environmental condition series", "asset/equipment performance views", "unknown values remain explicitly UNKNOWN — never fabricated, never zero"],
    dataRequirements: ["authorized environment/performance metrics from a sector adapter (e.g. agriculture env-metrics/weather, ujenzi equipment)"],
    renderingRequirements: ["CHART", "SVG_2D", "HTML_TABLE"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "AVAILABLE",
    status: "IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: ["scene access is audited by the guarded() API boundary"],
  },
  {
    id: "7D",
    name: "Lifecycle / Operations",
    description: "Asset lifecycle, maintenance, operations, service history, lifecycle state, replacement planning, operational status, inspections, commissioning and decommissioning.",
    version: "1.0.0",
    order: 7,
    capabilities: ["canonical lifecycle projection from sector statuses", "maintenance/inspection rails", "commissioning & handover state (Ujenzi), equipment service (Agriculture), operational status (Health/Finance assets)"],
    dataRequirements: ["authorized lifecycle-bearing records from a sector adapter"],
    renderingRequirements: ["TIMELINE", "SVG_2D", "HTML_TABLE"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "AVAILABLE",
    status: "IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: ["scene access is audited by the guarded() API boundary"],
  },
  {
    id: "8D",
    name: "Safety / Risk / Compliance",
    description: "Hazards, risks, safety status, compliance state, inspection findings, incidents, controls, mitigations, risk relationships and compliance evidence.",
    version: "1.0.0",
    order: 8,
    capabilities: ["risk overlays with severity", "hazard/incident markers", "NCR & inspection-finding views", "compliance evidence indicators"],
    dataRequirements: ["authorized safety/risk/compliance records from a sector adapter (ujenzi HSE/NCR, agriculture hazards, risk register where granted)"],
    renderingRequirements: ["SVG_2D", "CHART", "HTML_TABLE"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "AVAILABLE",
    status: "IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: [
      "scene access is audited by the guarded() API boundary",
      "8D data remains governed by RBAC, ABAC, policy, tenant/entity/country scope, classification ceilings, RLS and audit — a risk overlay never widens a sector read permission.",
    ],
  },
  {
    id: "XD",
    name: "Extensible multi-dimensional intelligence",
    description:
      "The extensible umbrella for future combinations: multi-dimension compositions, digital twins, simulations, AI-assisted visualization, immersive interfaces (AR/VR/MR/XR), spatial computing, real-time streams and event-driven state changes. XD is an ARCHITECTURAL EXTENSION POINT — composition semantics are defined; immersive runtime is not bundled.",
    version: "1.0.0",
    order: 99,
    capabilities: ["dimension composition (any combination of activated dimensions)", "digital-twin binding", "event-driven refresh signals", "XR adapter contract (fail-closed; no XR runtime exists)"],
    dataRequirements: ["whatever the composed dimensions require, through their adapters"],
    renderingRequirements: ["resolved per composition (see ./renderers.ts); XR renderers are NOT_IMPLEMENTED"],
    permissions: ["viz:scene.read"],
    sectorApplicability: "*",
    lifecycleState: "PLANNED",
    status: "PARTIALLY_IMPLEMENTED",
    provenance: { origin: "CANONICAL", definedBy: "src/lib/viz/dimensions.ts" },
    auditRequirements: ["every composed activation is audited through the same guarded() boundary"],
  },
] as const);

/** ─────────────────────────── code parsing ─────────────────────────── */

const EXTENSION_CODE = /^(9|[1-9][0-9]+)D(?:_[A-Z0-9]+)*$/;

/**
 * Parse and validate a dimension code.
 *
 * Canonical codes are "1D".."8D" and "XD". Extension codes are ordinals ≥ 9
 * with an optional domain suffix, e.g. "9D", "9D_DOMAIN_INTELLIGENCE",
 * "10D_ADVANCED_SIMULATION", "12D_ORG_ECOSYSTEM". Suffixes keep extensions
 * unique without inventing a second numbering scheme.
 */
export function parseDimensionCode(code: string): { ok: true; order: number; canonical: boolean } | { ok: false; reason: string } {
  const trimmed = code.trim().toUpperCase();
  if (trimmed === "XD") return { ok: true, order: 99, canonical: true };
  const canonical = CANONICAL_DIMENSION_IDS.find((c) => c === trimmed && c !== "XD");
  if (canonical) return { ok: true, order: Number(canonical.slice(0, -1)), canonical: true };
  if (!EXTENSION_CODE.test(trimmed)) {
    return { ok: false, reason: `Dimension code '${code}' is not canonical (1D..8D, XD) and not a valid 9D+ extension code (e.g. 9D, 10D_SIMULATION).` };
  }
  const ordinal = Number(trimmed.slice(0, trimmed.indexOf("D")));
  if (ordinal < 9) return { ok: false, reason: `Extension ordinals start at 9; '${code}' collides with the canonical model.` };
  if (ordinal > 999) return { ok: false, reason: `Extension ordinal ${ordinal} exceeds the governed maximum (999).` };
  return { ok: true, order: ordinal, canonical: false };
}

/** ──────────────────────── governed extensions (9D+) ──────────────────────── */

/** Persisted shape of a governed 9D+ extension (viz_dimension_extensions). */
export type DimensionExtensionRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string;
  capabilities: string[];
  dataRequirements: string[];
  renderingRequirements: string[];
  requiredPermissions: PermissionCode[];
  sectorApplicability: VizSectorCode[] | "*";
  lifecycleState: DimensionLifecycleState;
  provenance: { registeredBy: string; rationale: string; registeredAt: string };
  classification: string;
};

/**
 * Validate a proposed extension BEFORE persistence. Fail-closed rules:
 *  • the code must be a valid 9D+ extension code (never canonical, never XD);
 *  • an extension can never lower a permission requirement below the base
 *    scene-read permission, and it can never name a posting permission —
 *    a dimension extension is metadata, not financial authority;
 *  • lifecycleState must be a known state.
 */
export function validateDimensionExtension(input: {
  code: string;
  name: string;
  description: string;
  lifecycleState: string;
  requiredPermissions?: string[];
}): { ok: true; code: string } | { ok: false; reason: string } {
  const parsed = parseDimensionCode(input.code);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  if (parsed.canonical) {
    return { ok: false, reason: `'${input.code}' is a canonical dimension. Extensions live at 9D+ and can never shadow, redefine or retire a canonical dimension.` };
  }
  if (!input.name.trim() || !input.description.trim()) {
    return { ok: false, reason: "An extension requires a canonical name and a description." };
  }
  if (!(DIMENSION_LIFECYCLE_STATES as readonly string[]).includes(input.lifecycleState)) {
    return { ok: false, reason: `Unknown lifecycle state '${input.lifecycleState}'.` };
  }
  for (const permission of input.requiredPermissions ?? []) {
    if (permission === "finance:ledger.post" || permission === "finance:payments.authorize" || permission === "finance:settlement.manage") {
      return { ok: false, reason: `A dimension extension can never carry financial posting authority ('${permission}'). CAP_POSTING remains LOCKED.` };
    }
  }
  return { ok: true, code: input.code.trim().toUpperCase() };
}

/** Lift a persisted extension row into a DimensionDefinition. */
export function extensionToDefinition(row: DimensionExtensionRecord): DimensionDefinition {
  const parsed = parseDimensionCode(row.code);
  return {
    id: row.code,
    name: row.name,
    description: row.description,
    version: "1.0.0",
    order: parsed.ok ? parsed.order : 900,
    capabilities: row.capabilities,
    dataRequirements: row.dataRequirements,
    renderingRequirements: row.renderingRequirements,
    permissions: ["viz:scene.read", ...row.requiredPermissions],
    sectorApplicability: row.sectorApplicability,
    lifecycleState: row.lifecycleState,
    status: row.lifecycleState === "AVAILABLE" ? "IMPLEMENTED" : row.lifecycleState === "EXPERIMENTAL" ? "EXPERIMENTAL" : "PLANNED",
    provenance: { origin: "EXTENSION", definedBy: `viz_dimension_extensions:${row.id}` },
    auditRequirements: ["extension registration is audited (VIZ_DIMENSION_REGISTERED)", "activation is audited through the guarded() API boundary"],
  };
}

/** ─────────────────────────── registry resolution ─────────────────────────── */

export type DimensionRegistry = {
  /** Canonical 1D..8D + XD, then governed extensions, ordered by ordinal. */
  dimensions: DimensionDefinition[];
  canonicalCount: number;
  extensionCount: number;
};

/**
 * Merge canonical dimensions with governed tenant extensions. Extensions are
 * validated again at merge time (defence in depth: a tampered row cannot
 * shadow a canonical dimension), then ordered after the canonical 1D..8D and
 * before XD.
 */
export function resolveDimensionRegistry(extensions: DimensionExtensionRecord[]): DimensionRegistry {
  const canonicalIds = new Set(CANONICAL_DIMENSIONS.map((d) => d.id));
  const seen = new Set<string>();
  const merged: DimensionDefinition[] = [];
  for (const row of extensions) {
    const code = row.code.trim().toUpperCase();
    if (canonicalIds.has(code) || seen.has(code)) continue; // never shadow, never duplicate
    if (!validateDimensionExtension(row).ok) continue; // fail closed on malformed rows
    seen.add(code);
    merged.push(extensionToDefinition({ ...row, code }));
  }
  const canonical = CANONICAL_DIMENSIONS.filter((d) => d.id !== "XD");
  const xd = CANONICAL_DIMENSIONS.find((d) => d.id === "XD");
  const dimensions = [...canonical, ...merged.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))];
  if (xd) dimensions.push(xd);
  return { dimensions, canonicalCount: CANONICAL_DIMENSIONS.length, extensionCount: merged.length };
}

/** ─────────────────────────── combinations (§4) ─────────────────────────── */

/**
 * Normalize a requested dimension combination ("2D", "2D+3D", "3D+4D+5D",
 * "3D+4D+5D+6D+7D+8D", "9D+", "XD", …). Unknown codes are REJECTED, never
 * silently dropped: a scene must never claim a dimension the registry does
 * not know. The result is de-duplicated and ordered by dimension ordinal.
 */
export function normalizeCombination(
  requested: readonly string[],
  registry: DimensionRegistry,
): { ok: true; dimensions: DimensionDefinition[] } | { ok: false; reason: string } {
  const byId = new Map(registry.dimensions.map((d) => [d.id, d]));
  const picked: DimensionDefinition[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const id = raw.trim().toUpperCase();
    if (id === "9D+" || id === "XD+") {
      // Umbrella request: every extension dimension at or above 9D.
      for (const d of registry.dimensions) {
        if (d.order >= 9 && d.id !== "XD" && !seen.has(d.id)) {
          seen.add(d.id);
          picked.push(d);
        }
      }
      continue;
    }
    const definition = byId.get(id);
    if (!definition) return { ok: false, reason: `Unknown dimension '${raw}'. The registry is the only source of dimensions; unknown codes are rejected, never assumed.` };
    if (seen.has(id)) continue;
    seen.add(id);
    picked.push(definition);
  }
  if (picked.length === 0) return { ok: false, reason: "A visualization must activate at least one dimension." };
  picked.sort((a, b) => a.order - b.order);
  return { ok: true, dimensions: picked };
}

/** Whether a definition applies to a sector OS (or the control plane). */
export function dimensionAppliesToSector(definition: DimensionDefinition, sector: VizSectorCode): boolean {
  return definition.sectorApplicability === "*" || definition.sectorApplicability.includes(sector);
}

/** Dimensions usable by a sector, given the resolved registry. */
export function dimensionsForSector(registry: DimensionRegistry, sector: VizSectorCode): DimensionDefinition[] {
  return registry.dimensions.filter((d) => dimensionAppliesToSector(d, sector));
}
