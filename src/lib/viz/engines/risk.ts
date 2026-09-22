/**
 * BEYU OS — 8D SAFETY / RISK / COMPLIANCE ENGINE (shared capability, §14).
 *
 * Hazards, risks, safety status, compliance state, inspection findings,
 * incidents, controls, mitigations and compliance evidence — projected as
 * governed overlays.
 *
 * GOVERNANCE INVARIANT: everything this engine renders remains subject to
 * RBAC, ABAC, policy, tenant isolation, entity scope, country scope,
 * classification ceilings, RLS and audit. The engine is pure projection: it
 * holds no data of its own and widens no permission. A principal without the
 * sector read grant never receives the records this engine projects, because
 * the ADAPTER refuses before collection (see ../adapters/*).
 */
import { derived, observed, unavailable, type VizValue } from "../provenance";

export const RISK_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_POINT_KINDS = [
  "HAZARD",
  "INCIDENT",
  "NEAR_MISS",
  "NCR",
  "INSPECTION_FINDING",
  "COMPLIANCE_STATE",
  "RISK_REGISTER_ENTRY",
  "CONTROL",
  "MITIGATION",
] as const;
export type RiskPointKind = (typeof RISK_POINT_KINDS)[number];

export type RiskPoint = {
  subjectKey: string;
  kind: RiskPointKind;
  severity: VizValue<RiskSeverity | null>;
  label: string;
  at: string | null;
  /** Open/closed state — from the sector record, never inferred. */
  state: "OPEN" | "CLOSED" | "UNKNOWN";
  /** Optional located marker (hazard pinned to a site/field). */
  locationRef?: string | null;
  /** Compliance evidence reference (document id) when governed access exists. */
  evidenceRef?: string | null;
};

const SEVERITY_ORDER: Record<RiskSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/** Map sector severity vocabularies onto the neutral 8D severity scale.
 * Unknown vocabularies map to null — never guessed upward or downward. */
export const SEVERITY_MAP: Readonly<Record<string, RiskSeverity>> = Object.freeze({
  LOW: "LOW",
  MINOR: "LOW",
  NEAR_MISS: "LOW",
  MEDIUM: "MEDIUM",
  MODERATE: "MEDIUM",
  MAJOR: "HIGH",
  HIGH: "HIGH",
  SERIOUS: "HIGH",
  CRITICAL: "CRITICAL",
  SEVERE: "CRITICAL",
  FATALITY: "CRITICAL",
});

export function mapSeverity(raw: string | null | undefined): VizValue<RiskSeverity | null> {
  if (!raw) return unavailable();
  const mapped = SEVERITY_MAP[raw.trim().toUpperCase()];
  return mapped ? observed(mapped) : unavailable();
}

/** Aggregate posture per subject: worst OPEN severity + counts. A subject with
 * no authorized risk records has NO posture (UNAVAILABLE) — that is different
 * from "no risks" and must never render as a green all-clear. */
export type RiskPosture = {
  subjectKey: string;
  worstOpen: VizValue<RiskSeverity | null>;
  open: number;
  closed: number;
  unknownState: number;
};

export function riskPosture(points: RiskPoint[]): RiskPosture[] {
  const subjects = [...new Set(points.map((p) => p.subjectKey))];
  return subjects.map((subjectKey) => {
    const rows = points.filter((p) => p.subjectKey === subjectKey);
    const open = rows.filter((p) => p.state === "OPEN");
    let worst: RiskSeverity | null = null;
    let worstAt: string | null = null;
    for (const p of open) {
      const sev = p.severity.value;
      if (sev && (worst === null || SEVERITY_ORDER[sev] > SEVERITY_ORDER[worst])) {
        worst = sev;
        worstAt = p.at;
      }
    }
    return {
      subjectKey,
      worstOpen: worst ? observed(worst, null, worstAt) : rows.length === 0 ? unavailable() : derived(null),
      open: open.length,
      closed: rows.filter((p) => p.state === "CLOSED").length,
      unknownState: rows.filter((p) => p.state === "UNKNOWN").length,
    };
  });
}

/** Compliance-state rollup: obligations/inspections in COMPLIANT /
 * NON_COMPLIANT / UNKNOWN. UNKNOWN never counts as compliant (§14: compliance
 * evidence must be explicit). */
export function complianceRollup(points: RiskPoint[]): { compliant: number; nonCompliant: number; unknown: number } {
  const relevant = points.filter((p) => p.kind === "COMPLIANCE_STATE" || p.kind === "INSPECTION_FINDING");
  let compliant = 0;
  let nonCompliant = 0;
  let unknown = 0;
  for (const p of relevant) {
    if (p.state === "CLOSED" && p.severity.value === null) compliant += 1;
    else if (p.state === "OPEN" && p.severity.value !== null) nonCompliant += 1;
    else unknown += 1;
  }
  return { compliant, nonCompliant, unknown };
}

/** Risk relationships for diagram overlays (hazard → control → mitigation).
 * Edges are supplied by adapters from governed records; this engine only
 * validates shape and drops malformed edges (fail-closed). */
export type RiskEdge = { from: string; to: string; relation: "MITIGATED_BY" | "CONTROLLED_BY" | "ESCALATES_TO" | "EVIDENCED_BY" };

export function validRiskEdges(edges: RiskEdge[], knownKeys: Set<string>): RiskEdge[] {
  return edges.filter((e) => knownKeys.has(e.from) && knownKeys.has(e.to) && e.from !== e.to);
}
