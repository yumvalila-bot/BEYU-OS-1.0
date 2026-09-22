/**
 * BEYU OS — DIGITAL TWIN ABSTRAINCTION LAYER (shared capability, §18).
 *
 * ONE generic, domain-neutral digital-twin model. A twin projects:
 *   Identity · State · Relationships · Geometry · Location · Time · Events ·
 *   Measurements · Lifecycle · Risk · Provenance · Permissions
 *
 * Sector OS adapters determine domain semantics:
 *   • UJENZI  — construction/BIM entities, sites, assets (Ujenzi OS remains a
 *               full Sector OS; the twin layer is shared infrastructure it
 *               consumes, never a "Digital Twin OS" and never a Ujenzi
 *               subsystem owned by the graphics foundation);
 *   • HEALTH  — facilities and medical equipment (no PHI: patient data is
 *               NEVER twin material through this layer);
 *   • AGRICULTURE — farms, fields, machinery, irrigation, infrastructure;
 *   • FINANCE — authorized financial/organizational structures (READ-governed;
 *               CAP_POSTING remains LOCKED — a twin never posts);
 *   • FOUNDATION — structures and program assets within its own governance.
 *
 * GEOMETRY IS OPTIONAL: never assume every entity has geometry. A twin can be
 * spatial, non-spatial, relational, temporal, financial, operational or
 * organizational. Absent facets are explicitly null/UNAVAILABLE — never
 * fabricated.
 *
 * STATE IS LIVE: persisted twin rows (viz_digital_twins) are REGISTRATION +
 * identity binding only. The projected state below is always re-derived from
 * governed adapter reads at request time, so a twin can never serve stale or
 * unauthorized state from its own storage.
 */
import type { Classification } from "@/lib/constants";
import type { VizSectorCode } from "./dimensions";
import type { LifecycleProjection } from "./engines/lifecycle";
import type { RiskPosture } from "./engines/risk";
import type { VizEpistemicStatus, VizProvenance, VizValue } from "./provenance";
import type { SceneGeometry } from "./scene-model";

export const TWIN_FACETS = [
  "IDENTITY",
  "STATE",
  "RELATIONSHIPS",
  "GEOMETRY",
  "LOCATION",
  "TIME",
  "EVENTS",
  "MEASUREMENTS",
  "LIFECYCLE",
  "RISK",
  "PROVENANCE",
  "PERMISSIONS",
] as const;
export type TwinFacet = (typeof TWIN_FACETS)[number];

export type TwinIdentity = {
  /** Stable twin key: `${sector}:${subjectType}:${subjectId}` — the deep-link
   * identity. It is a REFERENCE, never authorization (§21): every access
   * re-resolves tenant/scope/classification server-side. */
  twinKey: string;
  sector: VizSectorCode;
  subjectType: string;
  subjectId: string;
  tenantId: string;
  legalEntityId: string | null;
  countryCode: string | null;
  name: string;
};

export type TwinStateValue = {
  code: string;
  reading: VizValue<unknown>;
};

export type TwinRelationship = {
  /** Twin key or subject ref of the related entity. */
  to: string;
  relation: string;
  status: VizEpistemicStatus;
};

export type TwinMeasurement = {
  code: string;
  reading: VizValue<number | string | null>;
  at: string | null;
};

export type TwinTimeFacet = {
  registeredAt: string | null;
  lastObservedAt: string | null;
  /** Recent governed event references (enterprise_events) — refs only; the
   * event payload is re-fetched through authorized audit/event APIs. */
  recentEventRefs: string[];
};

export type DigitalTwin = {
  identity: TwinIdentity;
  /** Facets this twin actually carries. Absent facets are NOT listed and are
   * rendered as "not applicable" — never as empty/fabricated data. */
  facets: TwinFacet[];
  state: TwinStateValue[];
  relationships: TwinRelationship[];
  /** Optional — spatial twins only. */
  geometry: SceneGeometry | null;
  location: { crs: string; latitude: number | null; longitude: number | null } | null;
  time: TwinTimeFacet;
  measurements: TwinMeasurement[];
  lifecycle: LifecycleProjection | null;
  risk: RiskPosture | null;
  provenance: VizProvenance;
  /** Permission facet: the classification ceiling of the twin's data and the
   * permissions a principal needs. Display metadata — enforcement lives in
   * authorization.ts, api.ts (guarded) and PostgreSQL RLS. */
  permissions: {
    classification: Classification;
    requiredPermissions: string[];
  };
};

/** Persisted registration row shape (viz_digital_twins). */
export type TwinRegistration = {
  id: string;
  tenantId: string;
  twinKey: string;
  sector: VizSectorCode;
  subjectType: string;
  subjectId: string;
  legalEntityId: string | null;
  name: string;
  status: "REGISTERED" | "ARCHIVED";
  classification: Classification;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

/** Compose the canonical twin key. Deterministic and injective per subject. */
export function twinKey(sector: VizSectorCode, subjectType: string, subjectId: string): string {
  return `${sector}:${subjectType}:${subjectId}`;
}

export function parseTwinKey(key: string): { sector: VizSectorCode; subjectType: string; subjectId: string } | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null;
  const [sector, subjectType, subjectId] = parts as [string, string, string];
  if (!sector || !subjectType || !subjectId) return null;
  return { sector: sector.toUpperCase() as VizSectorCode, subjectType, subjectId };
}

/** Derive the facet list from what the projection actually carries — honesty
 * by construction: a facet is listed only when data exists. */
export function facetsPresent(twin: Omit<DigitalTwin, "facets">): TwinFacet[] {
  const facets: TwinFacet[] = ["IDENTITY", "PROVENANCE", "PERMISSIONS"];
  if (twin.state.length > 0) facets.push("STATE");
  if (twin.relationships.length > 0) facets.push("RELATIONSHIPS");
  if (twin.geometry) facets.push("GEOMETRY");
  if (twin.location && (twin.location.latitude !== null || twin.location.longitude !== null)) facets.push("LOCATION");
  if (twin.time.lastObservedAt || twin.time.recentEventRefs.length > 0) facets.push("TIME");
  if (twin.time.recentEventRefs.length > 0) facets.push("EVENTS");
  if (twin.measurements.length > 0) facets.push("MEASUREMENTS");
  if (twin.lifecycle) facets.push("LIFECYCLE");
  if (twin.risk) facets.push("RISK");
  return facets;
}

/** Accessible text summary of a twin (§26) — the non-visual equivalent. */
export function twinAccessibleText(twin: DigitalTwin): string {
  const parts = [
    `${twin.identity.name} — ${twin.identity.sector} digital twin (${twin.identity.subjectType}).`,
    `Lifecycle: ${twin.lifecycle?.currentStage.value ?? "UNKNOWN"}.`,
    twin.risk ? `Open risk points: ${twin.risk.open}; worst open severity: ${twin.risk.worstOpen.value ?? "UNKNOWN"}.` : "Risk posture: not in authorized scope.",
    twin.location?.latitude !== null && twin.location?.latitude !== undefined
      ? `Located at ${twin.location.latitude}, ${twin.location.longitude} (${twin.location.crs}).`
      : "Non-spatial twin (no governed geometry).",
    `Data status: ${twin.provenance.epistemicStatus} via ${twin.provenance.sourceAdapter} at ${twin.provenance.collectedAt}.`,
  ];
  return parts.join(" ");
}
