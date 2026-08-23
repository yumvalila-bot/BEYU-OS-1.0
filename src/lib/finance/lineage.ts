/**
 * BEYU OS — Financial data lineage (Finance OS, Phase 25).
 *
 * WHAT THIS ANSWERS. For any number the Finance OS produces: where did it come from, what was done
 * to it, and what is the weakest link in that history.
 *
 * WHY IT MATTERS MORE THAN IT SOUNDS. A derived figure is only as trustworthy as its worst input,
 * but nothing enforces that automatically — a forecast built from one observed and one assumed
 * number will happily present itself as precise. Lineage makes the degradation explicit and
 * checkable: `weakestLink()` is the mechanical answer to "can I rely on this?".
 *
 * THE RULE. A derived number NEVER becomes canonical truth. Lineage records the derivation; it
 * does not promote it. `assertNotCanonical()` makes that a testable guarantee rather than a
 * convention.
 *
 * NO TABLE, NO SECOND AUDIT TRAIL. Lineage is computed in memory and correlates to the existing
 * audit_log / enterprise_events via traceId. Persisting it would be a second record of what
 * happened, competing with the audit trail that already exists.
 */
import { checksumOf } from "@/lib/crypto";
import { combineClasses, type EpistemicClass } from "./epistemics";
import { FINANCIAL_TRUTH } from "./truth";

export const LINEAGE_VERSION = "lineage-1.0.0";

/** The stages a financial number passes through. */
export const LINEAGE_STAGE = [
  "SOURCE",
  "TRANSACTION",
  "JOURNAL",
  "LEDGER",
  "AGGREGATION",
  "REPORT",
  "FORECAST",
  "DECISION",
  "EXECUTION",
] as const;
export type LineageStage = (typeof LINEAGE_STAGE)[number];

export type LineageNode = {
  stage: LineageStage;
  /** The table, engine or external system this step drew from. */
  sourceType: string;
  sourceId: string | null;
  epistemicClass: EpistemicClass;
  /** What this step did. */
  operation: string;
  tenantId: string | null;
  legalEntityId: string | null;
  /** Correlates to audit_log.trace_id and enterprise_events.trace_id. */
  traceId: string | null;
  at: string;
};

export type Lineage = {
  /** Deterministic identity of this derivation path. */
  lineageId: string;
  nodes: LineageNode[];
  /** The class of the final figure: never stronger than its weakest input. */
  resultClass: EpistemicClass;
  weakestLink: LineageNode | null;
  /** True only when every node is POSTED or OBSERVED. */
  fullyFactual: boolean;
  /** Whether the result may be treated as canonical financial truth. Always false for derivations. */
  canonical: boolean;
  complete: boolean;
  gaps: string[];
  explanation: string[];
};

const STRENGTH: EpistemicClass[] = [
  "POSTED", "OBSERVED", "DERIVED", "FORECAST", "ASSUMPTION", "SCENARIO",
  "REFERENCE_DATA", "SYNTHETIC", "REQUIRES_AUTHORITY", "REQUIRES_POLICY",
  "GOVERNANCE_REVIEW_REQUIRED", "DATA_NOT_AVAILABLE", "DATA_CONFLICT",
];

/**
 * Builds a lineage from an ordered list of derivation steps.
 *
 * The result class is computed by `combineClasses()` — the same rule used everywhere else — so
 * lineage cannot disagree with the epistemic model about how strong a figure is.
 */
export function buildLineage(nodes: LineageNode[]): Lineage {
  if (nodes.length === 0) {
    return {
      lineageId: checksumOf([]),
      nodes: [],
      resultClass: "DATA_NOT_AVAILABLE",
      weakestLink: null,
      fullyFactual: false,
      canonical: false,
      complete: false,
      gaps: ["NO_LINEAGE_RECORDED"],
      explanation: [
        "No lineage was recorded. A figure with no traceable source cannot be relied upon, and is " +
          "reported as DATA_NOT_AVAILABLE rather than accepted at face value.",
      ],
    };
  }

  const classes = nodes.map((n) => n.epistemicClass);
  const resultClass = combineClasses(classes);

  let weakest = nodes[0];
  for (const n of nodes) {
    if (STRENGTH.indexOf(n.epistemicClass) > STRENGTH.indexOf(weakest.epistemicClass)) weakest = n;
  }

  const gaps: string[] = [];
  for (const n of nodes) {
    if (n.traceId === null) gaps.push(`${n.stage}:${n.sourceType} has no traceId`);
    if (n.sourceId === null && n.stage !== "AGGREGATION" && n.stage !== "REPORT") {
      gaps.push(`${n.stage}:${n.sourceType} has no sourceId`);
    }
  }

  const fullyFactual = classes.every((c) => c === "POSTED" || c === "OBSERVED");

  return {
    lineageId: checksumOf(
      nodes.map((n) => [n.stage, n.sourceType, n.sourceId, n.epistemicClass, n.operation]),
    ),
    nodes,
    resultClass,
    weakestLink: weakest,
    fullyFactual,
    // A derivation is never canonical, however factual its inputs. Canonical truth is what the
    // registry names as a sole-writer table, not what a computation produced.
    canonical: false,
    complete: gaps.length === 0,
    gaps,
    explanation: [
      `${nodes.length} step(s): ${nodes.map((n) => n.stage).join(" -> ")}.`,
      `Result class ${resultClass}; the weakest input is ${weakest.epistemicClass} at ` +
        `${weakest.stage} (${weakest.sourceType}).`,
      fullyFactual
        ? "Every input is POSTED or OBSERVED, so the derivation rests entirely on fact."
        : "At least one input is not factual, so the result must not be presented as measured truth.",
      "A derived figure is never canonical financial truth, regardless of input quality.",
      ...(gaps.length > 0 ? [`Lineage gaps: ${gaps.join("; ")}.`] : []),
    ],
  };
}

/**
 * Guarantees a lineage result is not being treated as canonical.
 *
 * Exists so the rule is enforced by a call rather than by reviewer vigilance.
 */
export function assertNotCanonical(lineage: Lineage, context: string): void {
  if (lineage.canonical) {
    throw new Error(
      `${context}: a derived figure was marked canonical. Canonical truth is defined by the ` +
        "truth registry's sole-writer tables, never by a computation.",
    );
  }
}

/** Is `sourceType` a registered canonical source? Default deny for unknown sources. */
export function isCanonicalSource(sourceType: string): boolean {
  return FINANCIAL_TRUTH.some(
    (r) => r.canonicalTable !== null && r.canonicalTable.split(" + ").includes(sourceType),
  );
}

/**
 * Verifies a lineage begins at a canonical source.
 *
 * A chain rooted in something the truth registry does not recognise is unverifiable: the figure
 * may be perfectly correct, but the system cannot demonstrate it.
 */
export function verifyLineageRoot(lineage: Lineage): {
  rooted: boolean;
  rootSource: string | null;
  reason: string;
} {
  const root = lineage.nodes[0];
  if (!root) {
    return { rooted: false, rootSource: null, reason: "Empty lineage has no root." };
  }
  const rooted = isCanonicalSource(root.sourceType);
  return {
    rooted,
    rootSource: root.sourceType,
    reason: rooted
      ? `Lineage is rooted in the canonical source ${root.sourceType}.`
      : `Lineage begins at '${root.sourceType}', which is not a registered canonical source. The ` +
        "figure cannot be traced to financial truth and must not be presented as authoritative.",
  };
}

/** Convenience constructor keeping node shape consistent across call sites. */
export function node(
  stage: LineageStage,
  sourceType: string,
  epistemicClass: EpistemicClass,
  operation: string,
  over: Partial<LineageNode> = {},
): LineageNode {
  return {
    stage,
    sourceType,
    sourceId: null,
    epistemicClass,
    operation,
    tenantId: null,
    legalEntityId: null,
    traceId: null,
    at: new Date().toISOString(),
    ...over,
  };
}

/**
 * Detects a lineage that crosses a tenant boundary.
 *
 * Aggregating another tenant's figures into a result is exactly the laundering path the
 * attribution controls exist to prevent, and it is invisible unless the whole chain is inspected.
 */
export function detectCrossTenantLineage(lineage: Lineage): {
  crossTenant: boolean;
  tenants: string[];
  reason: string;
} {
  const tenants = [...new Set(lineage.nodes.map((n) => n.tenantId).filter((t): t is string => t !== null))];
  return {
    crossTenant: tenants.length > 1,
    tenants: tenants.sort(),
    reason:
      tenants.length > 1
        ? `This derivation draws on ${tenants.length} tenants (${tenants.join(", ")}). Aggregating ` +
          "across tenants requires governed authority; the result is not a single tenant's truth."
        : `All steps belong to ${tenants[0] ?? "(no tenant recorded)"}.`,
  };
}
