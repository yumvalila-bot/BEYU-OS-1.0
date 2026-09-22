/**
 * BEYU OS — SCENE MODEL (shared capability).
 *
 * The domain-neutral scene model every Sector OS adapter produces and every
 * renderer consumes. A scene is a governed composition of dimension-activated
 * layers over adapter-supplied objects.
 *
 * LEAK-PREVENTION INVARIANT (§22)
 * ───────────────────────────────
 * `buildSceneManifest()` is the ONLY projection that may cross to a client.
 * It is an ALLOWLIST projection, never a blacklist: exactly the fields the
 * renderer needs are copied, everything else — internal ids of unauthorized
 * rows, tenant keys, classification of hidden rows, raw DB columns, tooltips
 * built from unfiltered data — is structurally absent from the manifest.
 * Unauthorized rows are filtered BEFORE projection, so hidden data never
 * reaches the client merely because it is visually hidden.
 *
 * The renderer is never an authorization boundary: the manifest arrives fully
 * governed (Identity → RBAC → ABAC → Policy → Scope → Adapter → Model), and
 * the renderer only decides HOW to draw it (see ./renderers.ts).
 */
import { classificationRank, type Classification } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import type { VizSectorCode } from "./dimensions";
import { buildProvenance, type VizEpistemicStatus, type VizProvenance, type VizValue } from "./provenance";

/** Layer kinds map onto renderer capabilities; they are not renderers. */
export const SCENE_LAYER_KINDS = [
  "TABLE",
  "CHART",
  "MAP",
  "DIAGRAM",
  "TIMELINE",
  "SPATIAL",
  "METRIC_RAIL",
  "RISK_OVERLAY",
] as const;
export type SceneLayerKind = (typeof SCENE_LAYER_KINDS)[number];

export type SceneLayer = {
  id: string;
  /** Dimension this layer expresses ("1D".."8D", extension code or "XD"). */
  dimensionId: string;
  kind: SceneLayerKind;
  label: string;
  visible: boolean;
};

/** Spatial placement — OPTIONAL. Never assume every object has geometry
 * (§18): a twin/object can be spatial, non-spatial, relational, temporal,
 * financial, operational or organizational. */
export type SceneGeometry = {
  /** Explicit CRS; unlocated objects carry no geometry at all. */
  crs: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Simple projected polygon/point set in scene units (2D/3D foundation). */
  points?: Array<[number, number, number?]>;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
};

/** A governed scene object BEFORE manifest projection. Adapters produce these;
 * they still carry classification and internal references. */
export type SceneObjectInput = {
  id: string;
  label: string;
  layerId: string;
  classification: Classification;
  geometry?: SceneGeometry | null;
  /** Dimension-keyed values (e.g. { "5D": cost, "6D": energy }). */
  dimensionValues: Record<string, VizValue<unknown>>;
  /** Non-visual representation — mandatory (§26): critical information is
   * never available only through graphics. */
  accessibleText: string;
  /** Time anchor for 4D (ISO date/datetime), when the object has one. */
  timeAnchor?: string | null;
  /** Sector record reference used server-side (never leaked verbatim unless
   * the allowlist includes it — the manifest exposes `ref`, an opaque stable
   * key, not raw table internals). */
  sourceRef?: string;
  status?: string | null;
};

/** The client-safe object shape — an exact allowlist. */
export type SceneManifestObject = {
  id: string;
  label: string;
  layerId: string;
  accessibleText: string;
  geometry: SceneGeometry | null;
  values: Record<string, { value: unknown; status: VizEpistemicStatus; unit: string | null }>;
  timeAnchor: string | null;
  status: string | null;
};

export type SceneManifest = {
  sceneId: string | null;
  name: string;
  sector: VizSectorCode;
  dimensions: string[];
  layers: SceneLayer[];
  objects: SceneManifestObject[];
  /** Accessible table equivalent — always present, never optional (§26). */
  accessibleTable: { columns: string[]; rows: string[][] };
  /** Honest count of objects filtered out by classification. The COUNT is
   * disclosed (so a viewer knows the picture is partial); the rows are not. */
  withheldByClassification: number;
  provenance: VizProvenance;
  generatedAt: string;
  /** Reduced-motion / low-bandwidth hints resolved server-side. */
  presentation: { reducedMotion: boolean; lowBandwidth: boolean; maxObjects: number };
};

/** Hard cap on manifest objects — progressive loading / low-bandwidth safety
 * (§27/§28). Large datasets paginate through the API instead of shipping one
 * unbounded payload; the cap is a server-side constant, not client config. */
export const MANIFEST_OBJECT_LIMIT = 500;
export const LOW_BANDWIDTH_OBJECT_LIMIT = 120;

function projectObject(object: SceneObjectInput): SceneManifestObject {
  const values: SceneManifestObject["values"] = {};
  for (const [dimensionId, v] of Object.entries(object.dimensionValues)) {
    // Allowlist: value/status/unit only. No reasons, no internal refs, no
    // classification — the classification decision was already made server-side.
    values[dimensionId] = { value: v.value ?? null, status: v.status, unit: v.unit ?? null };
  }
  return {
    id: object.id,
    label: object.label,
    layerId: object.layerId,
    accessibleText: object.accessibleText,
    geometry: object.geometry ?? null,
    values,
    timeAnchor: object.timeAnchor ?? null,
    status: object.status ?? null,
  };
}

/**
 * Build the ONLY client-safe projection of a scene.
 *
 * Order of operations is load-bearing:
 *   1. classification filter (rows above the principal's clearance are
 *      dropped BEFORE anything else — they never influence aggregates either);
 *   2. object cap (progressive/low-bandwidth presentation);
 *   3. allowlist projection;
 *   4. accessible-table construction from the PROJECTED rows (so the table can
 *      never disclose more than the graphics);
 *   5. provenance stamping.
 */
export function buildSceneManifest(input: {
  sceneId: string | null;
  name: string;
  sector: VizSectorCode;
  dimensions: string[];
  layers: SceneLayer[];
  objects: SceneObjectInput[];
  principal: Pick<Principal, "clearance">;
  sourceAdapter: string;
  systemOfRecord: string;
  presentation?: { reducedMotion?: boolean; lowBandwidth?: boolean };
}): SceneManifest {
  const clearanceRank = classificationRank(input.principal.clearance);
  const authorized = input.objects.filter((o) => classificationRank(o.classification) <= clearanceRank);
  const withheld = input.objects.length - authorized.length;

  const lowBandwidth = input.presentation?.lowBandwidth === true;
  const cap = lowBandwidth ? LOW_BANDWIDTH_OBJECT_LIMIT : MANIFEST_OBJECT_LIMIT;
  const capped = authorized.slice(0, cap);

  const objects = capped.map(projectObject);

  const valueColumns = input.dimensions.filter((d) => d !== "XD");
  const columns = ["Object", "Layer", ...valueColumns, "Time", "Status", "Description"];
  const rows = objects.map((o) => [
    o.label,
    input.layers.find((l) => l.id === o.layerId)?.label ?? o.layerId,
    ...valueColumns.map((d) => {
      const v = o.values[d];
      if (!v || v.value === null || v.value === undefined) return "UNKNOWN";
      return v.unit ? `${String(v.value)} ${v.unit}` : String(v.value);
    }),
    o.timeAnchor ?? "—",
    o.status ?? "—",
    o.accessibleText,
  ]);

  const statuses = objects.flatMap((o) => Object.values(o.values).map((v) => v.status));

  return {
    sceneId: input.sceneId,
    name: input.name,
    sector: input.sector,
    dimensions: input.dimensions,
    layers: input.layers.map((l) => ({ ...l })),
    objects,
    accessibleTable: { columns, rows },
    withheldByClassification: withheld,
    provenance: buildProvenance({
      sourceAdapter: input.sourceAdapter,
      systemOfRecord: input.systemOfRecord,
      statuses,
    }),
    generatedAt: new Date().toISOString(),
    presentation: {
      reducedMotion: input.presentation?.reducedMotion === true,
      lowBandwidth,
      maxObjects: cap,
    },
  };
}

/** Scene configuration as persisted (viz_scenes). */
export type VizSceneConfig = {
  id: string;
  tenantId: string;
  legalEntityId: string | null;
  name: string;
  sector: VizSectorCode;
  /** Optional subject binding (e.g. an Ujenzi project id) — a REFERENCE only;
   * deep links re-authorize against the subject through the adapter (§21). */
  subjectType: string | null;
  subjectId: string | null;
  dimensions: string[];
  layers: SceneLayer[];
  config: Record<string, unknown>;
  status: "ACTIVE" | "ARCHIVED";
  classification: Classification;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
