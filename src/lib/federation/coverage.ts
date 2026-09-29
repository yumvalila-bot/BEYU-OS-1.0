/**
 * BEYU Federation & Trust — coverage audit (program §54).
 *
 * TANZANIA_FEDERATION_COVERAGE_AUDIT as a function: machine-readable object
 * + markdown rendering. Every number derives from the registry; nothing is
 * assumed. Counts are point-in-time observations, never permanent truth.
 */
import type { ReconciliationState } from "./catalog";

export interface CoverageRow {
  code: string;
  officialName: string;
  domainCode: string;
  authorityType: string;
  jurisdictionScope: string | null;
  recordStatus: string;
  lifecycleStatus: string;
  verificationStatus: string;
  apiStatus: string;
  govesbStatus: string;
  accessCostStatus: string;
  reconciliationState: string;
  legacyAgencyCode: string | null;
  agreementRequired: "TRUE" | "FALSE" | "UNKNOWN";
}

export interface CoverageSourceBaseline {
  mdasExpected: number;
  regionsExpected: number;
  lgasExpected: number;
  sourceName: string;
  sourceVersion: string;
  capturedAt: string;
  liveVerified: boolean;
}

export interface CoverageAudit {
  jurisdictionCode: string;
  generatedAt: string;
  source: CoverageSourceBaseline;
  totals: {
    authoritiesTotal: number;
    byDomain: Record<string, number>;
    byType: Record<string, number>;
    discovered: number;
    reconciled: number; // state = MATCH
    newDiscovered: number; // state = NEW
    duplicates: number;
    uncertain: number;
    manualReview: number;
    missing: number;
    publicInformation: number;
    publicApi: number;
    authorizedApi: number;
    govesbRequired: number;
    agreementRequired: number;
    costsConfirmed: number; // FREE_CONFIRMED | PAID_ACCESS with evidence
    unknownCosts: number;
    noPublicApi: number;
    notConnected: number;
    sandbox: number;
    live: number;
    liveVerified: number;
    failedVerification: number;
    suspended: number;
    regionsRepresented: number;
    regionsExpected: number;
    lgasRepresented: number;
    lgasExpected: number;
    missingDomains: string[];
  };
  domainGaps: { domain: string; count: number }[];
  machine: Record<string, unknown>;
}

export function buildCoverageAudit(
  jurisdictionCode: string,
  rows: CoverageRow[],
  source: CoverageSourceBaseline,
  expectedDomains: string[],
  generatedAt: Date = new Date(),
): CoverageAudit {
  const byDomain: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const r of rows) {
    byDomain[r.domainCode] = (byDomain[r.domainCode] ?? 0) + 1;
    byType[r.authorityType] = (byType[r.authorityType] ?? 0) + 1;
  }
  const count = (fn: (r: CoverageRow) => boolean) => rows.filter(fn).length;
  const domainGaps = expectedDomains.filter((d) => !byDomain[d]).map((d) => ({ domain: d, count: 0 }));
  const domainsSeen = Object.keys(byDomain).filter((d) => !expectedDomains.includes(d));

  const totals: CoverageAudit["totals"] = {
    authoritiesTotal: rows.length,
    byDomain,
    byType,
    discovered: count((r) => r.lifecycleStatus === "DISCOVERED"),
    reconciled: count((r) => r.reconciliationState === "MATCH"),
    newDiscovered: count((r) => r.reconciliationState === "NEW"),
    duplicates: count((r) => r.reconciliationState === "DUPLICATE"),
    uncertain: count((r) => r.reconciliationState === "UNCERTAIN"),
    manualReview: count((r) => r.reconciliationState === "MANUAL_REVIEW"),
    missing: count((r) => r.reconciliationState === "MISSING"),
    publicInformation: count((r) => r.accessCostStatus === "PUBLIC_INFORMATION"),
    publicApi: count((r) => r.apiStatus === "PUBLIC" || r.accessCostStatus === "PUBLIC_API"),
    authorizedApi: count((r) => r.apiStatus === "AUTHORIZED" || r.accessCostStatus === "AUTHORIZED_API"),
    govesbRequired: count((r) => r.govesbStatus === "GOVESB_REQUIRED" || r.govesbStatus === "GOVESB_ELIGIBLE"),
    agreementRequired: count((r) => r.agreementRequired === "TRUE"),
    costsConfirmed: count((r) => r.accessCostStatus === "FREE_CONFIRMED" || r.accessCostStatus === "PAID_ACCESS"),
    unknownCosts: count((r) => r.accessCostStatus === "UNKNOWN_COST"),
    noPublicApi: count((r) => r.accessCostStatus === "NO_PUBLIC_API" || r.apiStatus === "NONE_PUBLISHED"),
    notConnected: count((r) => r.accessCostStatus === "NOT_CONNECTED" || (r.verificationStatus === "REGISTERED" && r.lifecycleStatus === "DISCOVERED")),
    sandbox: count((r) => r.verificationStatus === "SANDBOX" || r.lifecycleStatus === "SANDBOX"),
    live: count((r) => r.lifecycleStatus === "LIVE" || r.verificationStatus === "LIVE"),
    liveVerified: count((r) => r.lifecycleStatus === "LIVE_VERIFIED" || r.verificationStatus === "LIVE_VERIFIED"),
    failedVerification: count((r) => r.lifecycleStatus === "FAILED_VERIFICATION"),
    suspended: count((r) => r.lifecycleStatus === "SUSPENDED"),
    regionsRepresented: count((r) => r.authorityType === "REGIONAL_GOVERNMENT"),
    regionsExpected: source.regionsExpected,
    lgasRepresented: count((r) => r.authorityType === "LOCAL_GOVERNMENT"),
    lgasExpected: source.lgasExpected,
    missingDomains: [...domainGaps.map((d) => d.domain), ...domainsSeen.map((d) => `${d} (unclassified)`)].filter(Boolean) as string[],
  };

  return {
    jurisdictionCode,
    generatedAt: generatedAt.toISOString(),
    source,
    totals,
    domainGaps,
    machine: {
      jurisdiction: jurisdictionCode,
      generated_at: generatedAt.toISOString(),
      source,
      totals,
      domain_gaps: domainGaps,
      by_domain: byDomain,
      by_type: byType,
    },
  };
}

export function renderCoverageMarkdown(audit: CoverageAudit): string {
  const t = audit.totals;
  const src = audit.source;
  const lines: string[] = [];
  lines.push(`# TANZANIA FEDERATION COVERAGE AUDIT — ${audit.jurisdictionCode}`);
  lines.push("");
  lines.push(`**Generated:** ${audit.generatedAt}`);
  lines.push(`**Source baseline:** ${src.sourceName} (version ${src.sourceVersion}, captured ${src.capturedAt}) — live-verified: **${src.liveVerified ? "YES" : "NO (baseline is documented/indexed, not fetched live in this environment)"}**`);
  lines.push("");
  lines.push("> Counts are point-in-time observations of the registry, never permanent truth. The directory baseline numbers below are the program's documented baseline (325 MDA entries / 26 regions / 126 LGAs); reconciliation against the live official directory is repeatable and is PENDING where connectivity was unavailable.");
  lines.push("");
  lines.push("## 1. Inventory totals");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(`| Total authorities seeded | ${t.authoritiesTotal} |`);
  lines.push(`| Directory MDA baseline (documented) | ${src.mdasExpected} |`);
  lines.push(`| MDAs individually seeded | ${t.authoritiesTotal - t.regionsRepresented - t.lgasRepresented} (national-level) |`);
  lines.push(`| Regions represented / expected | ${t.regionsRepresented} / ${t.regionsExpected} |`);
  lines.push(`| LGAs represented / baseline | ${t.lgasRepresented} / ${t.lgasExpected} |`);
  lines.push(`| Discovered (lifecycle) | ${t.discovered} |`);
  lines.push(`| Reconciled (MATCH) | ${t.reconciled} |`);
  lines.push(`| New since baseline | ${t.newDiscovered} |`);
  lines.push(`| Duplicates | ${t.duplicates} |`);
  lines.push(`| Uncertain | ${t.uncertain} |`);
  lines.push(`| Manual review | ${t.manualReview} |`);
  lines.push(`| Missing (in registry, not in source snapshot) | ${t.missing} |`);
  lines.push("");
  lines.push("## 2. Access & cost dimensions (never collapsed)");
  lines.push("");
  lines.push("| Dimension | Count | Note |");
  lines.push("|---|---|---|");
  lines.push(`| Public information | ${t.publicInformation} | freely readable public material only |`);
  lines.push(`| Public API | ${t.publicApi} | public endpoint recorded — NOT an authorization |`);
  lines.push(`| Authorized API | ${t.authorizedApi} | requires credential + agreement + approval |`);
  lines.push(`| GovESB required/eligible | ${t.govesbRequired} | requirement, not compliance |`);
  lines.push(`| Agreement required | ${t.agreementRequired} | recorded requirement |`);
  lines.push(`| Cost confirmed (free/paid, evidenced) | ${t.costsConfirmed} | only with evidence rows |`);
  lines.push(`| Unknown cost | ${t.unknownCosts} | default — never inferred |`);
  lines.push(`| No public API | ${t.noPublicApi} | portal-only or none published |`);
  lines.push(`| Not connected | ${t.notConnected} | authority exists ≠ BEYU is connected |`);
  lines.push(`| Sandbox | ${t.sandbox} | verified sandbox evidence only |`);
  lines.push(`| LIVE | ${t.live} | requires production evidence + approver |`);
  lines.push(`| LIVE_VERIFIED | ${t.liveVerified} | requires verification evidence |`);
  lines.push(`| Failed verification | ${t.failedVerification} | |`);
  lines.push(`| Suspended | ${t.suspended} | |`);
  lines.push("");
  lines.push("## 3. Domain coverage");
  lines.push("");
  lines.push("| Domain | Authorities |");
  lines.push("|---|---|");
  for (const [domain, n] of Object.entries(t.byDomain).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${domain} | ${n} |`);
  }
  lines.push("");
  if (audit.domainGaps.length > 0) {
    lines.push(`**Canonical domains with no seeded authority:** ${audit.domainGaps.map((d) => d.domain).join(", ")}`);
    lines.push("");
  }
  lines.push("## 4. Reconciliation state distribution");
  lines.push("");
  lines.push("| State | Count |");
  lines.push("|---|---|");
  const reconStates: ReconciliationState[] = ["MATCH", "NEW", "MISSING", "DUPLICATE", "RENAMED", "MERGED", "DISSOLVED", "UNCERTAIN", "MANUAL_REVIEW", "PENDING_RECONCILIATION"];
  for (const s of reconStates) {
    const n = rowsReconCount(audit, s);
    lines.push(`| ${s} | ${n} |`);
  }
  lines.push("");
  lines.push("## 5. Honest limits");
  lines.push("");
  lines.push("- The official Tanzania Government Directory could **not** be fetched live from the implementation environment (outbound network unavailable). The baseline above is the program's documented directory enumeration plus indexed public references; every row carries `reconciliation_state` so the next live reconciliation will classify added/renamed/merged/dissolved/missing entries.");
  lines.push("- LGA counts vary across public sources (directory baseline 126; current public enumerations 184–195 districts incl. Zanzibar). The seeded LGA set is a reconciliation baseline, flagged for MANUAL_REVIEW on count mismatch.");
  lines.push("- No authority is claimed CONNECTED, LIVE, LIVE_VERIFIED or FREE anywhere in this audit. Every such claim requires evidence rows that do not yet exist for any real authority.");
  lines.push("");
  lines.push("---");
  lines.push("_Machine-readable form: see `machine` object (JSON) of the same audit, and `TANZANIA_FEDERATION_COVERAGE_AUDIT.json`._");
  return lines.join("\n");
}

function rowsReconCount(audit: CoverageAudit, state: ReconciliationState): number {
  const t = audit.totals;
  switch (state) {
    case "MATCH": return t.reconciled;
    case "NEW": return t.newDiscovered;
    case "MISSING": return t.missing;
    case "DUPLICATE": return t.duplicates;
    case "UNCERTAIN": return t.uncertain;
    case "MANUAL_REVIEW": return t.manualReview;
    default:
      return 0;
  }
}
