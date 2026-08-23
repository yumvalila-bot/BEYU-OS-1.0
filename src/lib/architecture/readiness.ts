/**
 * Phase 11 — production readiness matrix.
 *
 * EXISTING PRIMITIVE: phase10 matrices + finance/governance registries.
 * GAP: those score architecture completeness, not production readiness
 * (engineering vs security vs authority vs production).
 *
 * Status is derived. A capability cannot be READY while authority is unratified
 * or a security criterion is missing. Production is READY only when architecture,
 * engineering, security AND authority are READY.
 */
import { financeOsMatrix, commonPlatformMatrix, type Phase10Status } from "./phase10";

export const READINESS = [
  "READY",
  "PARTIAL",
  "BLOCKED",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
] as const;
export type Readiness = (typeof READINESS)[number];

export type ReadinessRow = {
  capability: string;
  architecture: Readiness;
  engineering: Readiness;
  security: Readiness;
  authority: Readiness;
  production: Readiness;
};

function fromPhase10(s: Phase10Status): Readiness {
  if (s === "COMPLETE") return "READY";
  if (s === "NOT_APPLICABLE") return "BLOCKED";
  return s;
}

function productionOf(row: Omit<ReadinessRow, "capability" | "production">): Readiness {
  const dims = [row.architecture, row.engineering, row.security, row.authority];
  if (dims.includes("REQUIRES_AUTHORITY")) return "REQUIRES_AUTHORITY";
  if (dims.includes("DATA_NOT_AVAILABLE")) return "DATA_NOT_AVAILABLE";
  if (dims.includes("BLOCKED")) return "BLOCKED";
  if (dims.includes("PARTIAL")) return "PARTIAL";
  return "READY";
}

/**
 * Hand-mapped only where the Phase-10 domain name is not 1:1 with the Phase-11
 * capability list. Architecture/engineering/security come from existing
 * registries; authority is REQUIRES_AUTHORITY whenever production execution
 * is still locked (the live 16/16 PENDING, 60/60 LOCKED state).
 */
export function productionReadinessMatrix(): ReadinessRow[] {
  const platform = new Map(commonPlatformMatrix().map((r) => [r.domain, r]));
  const finance = new Map(financeOsMatrix().map((r) => [r.domain, r]));

  const row = (
    capability: string,
    archKey: { map: Map<string, { status: Phase10Status }>; key: string },
    engineering: Readiness,
    security: Readiness,
    authority: Readiness,
  ): ReadinessRow => {
    const architecture = fromPhase10(archKey.map.get(archKey.key)?.status ?? "PARTIAL");
    const base = { architecture, engineering, security, authority };
    return { capability, ...base, production: productionOf(base) };
  };

  const locked: Readiness = "REQUIRES_AUTHORITY";
  const ready: Readiness = "READY";

  return [
    row("Identity", { map: platform, key: "Identity" }, ready, ready, ready),
    row("Governance", { map: platform, key: "Workflow" }, ready, ready, locked),
    row("Authority", { map: finance, key: "CAPITAL" }, ready, ready, locked),
    row("Audit", { map: finance, key: "AUDIT" }, ready, ready, ready),
    row("Events", { map: platform, key: "Event system" }, ready, ready, ready),
    row("Lineage", { map: finance, key: "LINEAGE" }, ready, ready, ready),
    row("Workflow", { map: platform, key: "Workflow" }, ready, ready, ready),
    row("HCM", { map: platform, key: "HCM" }, ready, ready, ready),
    row("Finance", { map: finance, key: "ACCOUNTING" }, ready, ready, locked),
    row("Treasury", { map: finance, key: "TREASURY" }, ready, ready, "DATA_NOT_AVAILABLE"),
    row("FX", { map: finance, key: "ACCOUNTING" }, "PARTIAL", ready, locked),
    row("Capital", { map: finance, key: "CAPITAL" }, ready, ready, locked),
    row("Intercompany", { map: finance, key: "INTERCOMPANY" }, ready, ready, locked),
    row("Reporting", { map: finance, key: "REPORTING" }, "PARTIAL", ready, locked),
    row("Forecasting", { map: finance, key: "FORECASTING" }, ready, ready, ready),
    row("Tax", { map: finance, key: "TAX" }, ready, ready, locked),
    {
      capability: "Legal",
      architecture: "PARTIAL",
      engineering: "PARTIAL",
      security: ready,
      authority: locked,
      production: "REQUIRES_AUTHORITY",
    },
    row("Compliance", { map: finance, key: "COMPLIANCE" }, ready, ready, ready),
    row("Risk", { map: finance, key: "RISK" }, ready, ready, ready),
  ];
}

export function productionReadinessSummary(): {
  total: number;
  productionReady: string[];
  requiresAuthority: string[];
  dataNotAvailable: string[];
  partial: string[];
  blocked: string[];
} {
  const m = productionReadinessMatrix();
  return {
    total: m.length,
    productionReady: m.filter((r) => r.production === "READY").map((r) => r.capability),
    requiresAuthority: m.filter((r) => r.production === "REQUIRES_AUTHORITY").map((r) => r.capability),
    dataNotAvailable: m.filter((r) => r.production === "DATA_NOT_AVAILABLE").map((r) => r.capability),
    partial: m.filter((r) => r.production === "PARTIAL").map((r) => r.capability),
    blocked: m.filter((r) => r.production === "BLOCKED").map((r) => r.capability),
  };
}
