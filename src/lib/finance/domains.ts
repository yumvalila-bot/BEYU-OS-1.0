/**
 * BEYU OS — Finance OS domain registry and maturity assessment (Phases 1, 26, 34, 35).
 *
 * WHAT THIS IS. The single machine-readable answer to "what does the Finance OS actually consist
 * of, and how complete is each part?" — replacing a hand-maintained table in a document that
 * drifts from the code the moment either changes.
 *
 * THE COMPLETENESS TEST IS DELIBERATELY HARSH. Phase 34 defines 16 criteria, and a domain is
 * COMPLETE only when it satisfies every applicable one. Files existing is not completeness; a
 * domain with a service but no fault injection is PARTIAL, and says so.
 *
 * IT CANNOT FLATTER ITSELF. `assessDomain()` derives status from the recorded criteria, so a
 * domain cannot be marked COMPLETE while a criterion is false. The only way to raise a status is
 * to satisfy the criterion.
 */
import type { FinanceDomain } from "./truth";

export const DOMAIN_STATUS = [
  "COMPLETE",
  "PARTIAL",
  "BLOCKED",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
  "NOT_AVAILABLE",
] as const;
export type DomainStatus = (typeof DOMAIN_STATUS)[number];

/** The 16 Phase-34 criteria. `null` means genuinely not applicable to this domain. */
export type CompletenessCriteria = {
  canonicalSource: boolean | null;
  service: boolean;
  permissionModel: boolean;
  capability: boolean;
  authorityIntegration: boolean;
  tenantIsolation: boolean;
  entityIsolation: boolean;
  provenance: boolean;
  audit: boolean;
  trace: boolean;
  temporalHandling: boolean;
  positiveTest: boolean;
  negativeTest: boolean;
  faultInjection: boolean;
  definedBlockedState: boolean;
  composes: boolean;
};

export type DomainRecord = {
  domain: FinanceDomain | "IDENTITY" | "WORKFLOW" | "LINEAGE" | "EVIDENCE";
  serviceName: string;
  module: string | null;
  criteria: CompletenessCriteria;
  /** Why the domain is not COMPLETE, when it is not. */
  blockedBy: string[];
  limitations: string[];
};

const ALL = (over: Partial<CompletenessCriteria> = {}): CompletenessCriteria => ({
  canonicalSource: true, service: true, permissionModel: true, capability: true,
  authorityIntegration: true, tenantIsolation: true, entityIsolation: true, provenance: true,
  audit: true, trace: true, temporalHandling: true, positiveTest: true, negativeTest: true,
  faultInjection: true, definedBlockedState: true, composes: true, ...over,
});

const NONE = (over: Partial<CompletenessCriteria> = {}): CompletenessCriteria => ({
  canonicalSource: false, service: false, permissionModel: false, capability: false,
  authorityIntegration: false, tenantIsolation: false, entityIsolation: false, provenance: false,
  audit: false, trace: false, temporalHandling: false, positiveTest: false, negativeTest: false,
  faultInjection: false, definedBlockedState: true, composes: false, ...over,
});

/**
 * THE REGISTRY. Every entry reflects what is actually in the repository.
 *
 * Domains with no substrate are listed with NONE criteria rather than omitted — an unlisted domain
 * looks like one nobody considered, which is worse than one honestly marked NOT_AVAILABLE.
 */
export const FINANCE_DOMAINS: readonly DomainRecord[] = [
  {
    domain: "ACCOUNTING",
    serviceName: "finance.journal",
    module: "src/lib/finance/posting-engine.ts",
    criteria: ALL(),
    blockedBy: ["AUTHORITY: CAP_POSTING locked (P1, P6, P7, P9 unratified)"],
    limitations: ["Fully implemented and cannot execute. 0 journal entries exist."],
  },
  {
    domain: "LEDGER",
    serviceName: "finance.ledger",
    module: "src/lib/finance/posting-engine.ts",
    criteria: ALL(),
    blockedBy: ["DATA: 0 ledger accounts", "AUTHORITY: chart of accounts requires P1"],
    limitations: ["Balances are DERIVED and never stored, so no second truth can drift."],
  },
  {
    domain: "CLOSE",
    serviceName: "finance.period",
    module: "src/lib/finance/period.ts",
    criteria: ALL({ canonicalSource: true }),
    blockedBy: ["DATA: 0 financial periods", "AUTHORITY: close policy unratified (P1)"],
    limitations: [
      "Full lifecycle with all 49 state pairs decided; FINAL is terminal.",
      "Which pre-close conditions are mandatory is a policy question the engine refuses to answer.",
    ],
  },
  {
    domain: "TREASURY",
    serviceName: "finance.treasury",
    module: "src/lib/specialist/treasury/service.ts",
    criteria: ALL(),
    blockedBy: ["DATA: single as_of date; 3 attribution conflicts"],
    limitations: ["5 positions at one date — no time series, so no trend or liquidity forecast."],
  },
  {
    domain: "FPNA",
    serviceName: "finance.fpna",
    module: "src/lib/specialist/fpna/service.ts",
    criteria: ALL({ canonicalSource: null }),
    blockedBy: ["DATA: no budget substrate", "DATA: empty ledger means no actuals"],
    limitations: ["Operates on ledger actuals; there are none."],
  },
  {
    domain: "FORECASTING",
    serviceName: "finance.forecast",
    module: "src/lib/specialist/forecast/service.ts",
    criteria: ALL({ canonicalSource: null }),
    blockedBy: ["DATA: insufficient history"],
    limitations: ["Forecasts are never persisted, so none can overwrite an actual."],
  },
  {
    domain: "RISK",
    serviceName: "finance.risk",
    module: "src/lib/specialist/risk/service.ts",
    criteria: ALL(),
    blockedBy: [],
    limitations: ["Analytical only; never mutates ledger, treasury or capital."],
  },
  {
    domain: "COMPLIANCE",
    serviceName: "finance.compliance",
    module: "src/lib/specialist/compliance/service.ts",
    criteria: ALL(),
    blockedBy: [],
    limitations: ["Missing evidence stays missing; MISSING never becomes VERIFIED."],
  },
  {
    domain: "AUDIT",
    serviceName: "finance.audit",
    module: "src/lib/specialist/audit/service.ts",
    criteria: ALL(),
    blockedBy: [],
    limitations: ["Append-only, trigger-protected against UPDATE and TRUNCATE."],
  },
  {
    domain: "TAX",
    serviceName: "finance.tax",
    module: "src/lib/specialist/tax-intelligence.ts",
    criteria: ALL({ canonicalSource: true }),
    blockedBy: ["AUTHORITY: no tax rate, treatment or basis may be computed (P8/TGC)"],
    limitations: ["Strategy records only. Tax strategy is never a tax liability."],
  },
  {
    domain: "CAPITAL",
    serviceName: "finance.capital",
    module: "src/lib/capital-governance-service.ts",
    criteria: ALL(),
    blockedBy: ["AUTHORITY: IC-2025-021 is TABLED; allocation locked"],
    limitations: ["REQUEST/RECOMMENDATION/APPROVAL/ALLOCATION/COMMITMENT/DISBURSEMENT stay distinct."],
  },
  {
    domain: "INTERCOMPANY",
    serviceName: "finance.intercompany",
    module: "src/lib/finance/intercompany.ts",
    criteria: ALL(),
    blockedBy: ["AUTHORITY: transfer pricing and elimination unratified (P1)"],
    limitations: [
      "Ownership is read from legal_entities and never inferred from financial records.",
      "Cross-tenant movement requires explicit governance authority.",
    ],
  },
  {
    domain: "CONSOLIDATION",
    serviceName: "finance.consolidation",
    module: "src/lib/finance/intercompany.ts",
    criteria: ALL({ canonicalSource: null }),
    blockedBy: ["AUTHORITY: consolidation and elimination policy unratified (P1)", "DATA: no ownership percentages"],
    limitations: [
      "Scope is structural only. Control, significant influence and minority interests are not assessed.",
      "assessEliminations() always eliminates zero, by design.",
    ],
  },
  {
    domain: "REPORTING",
    serviceName: "finance.reporting",
    module: "src/lib/finance/reporting.ts",
    criteria: ALL({ canonicalSource: null }),
    blockedBy: ["AUTHORITY: account classification unratified (P1)", "DATA: empty ledger"],
    limitations: [
      "Trial balance is policy-independent and works; statements return structure only.",
      "Empty ledger yields null totals, never 0.00.",
    ],
  },
  {
    domain: "AR",
    serviceName: "finance.ar",
    module: null,
    criteria: NONE(),
    blockedBy: ["DATA: no receivables substrate", "AUTHORITY: revenue recognition unratified (P1)"],
    limitations: ["No AR tables exist. Reported NOT_AVAILABLE rather than stubbed."],
  },
  {
    domain: "AP",
    serviceName: "finance.ap",
    module: null,
    criteria: NONE(),
    blockedBy: ["DATA: no payables substrate"],
    limitations: ["No AP tables exist."],
  },
  {
    domain: "FIXED_ASSETS",
    serviceName: "finance.assets",
    module: null,
    criteria: NONE(),
    blockedBy: ["DATA: no asset register", "AUTHORITY: depreciation and impairment unratified (P1)"],
    limitations: ["Depreciation method, useful life and impairment are accounting judgements."],
  },
  {
    domain: "INVENTORY",
    serviceName: "finance.inventory",
    module: null,
    criteria: NONE(),
    blockedBy: ["DATA: no inventory substrate", "AUTHORITY: valuation basis unratified (P1)"],
    limitations: ["No inventory tables exist."],
  },
];

/** Additional platform-level services that are not accounting domains. */
export const FINANCE_PLATFORM_SERVICES: readonly DomainRecord[] = [
  {
    domain: "WORKFLOW",
    serviceName: "finance.workflow",
    module: "src/lib/finance/workflow.ts",
    criteria: ALL({ canonicalSource: null }),
    blockedBy: [],
    limitations: [
      "Separation of duties is enforced; approval thresholds require ratified policy.",
      "Execution states require an activated capability and fail closed without one.",
    ],
  },
  {
    domain: "LINEAGE",
    serviceName: "finance.lineage",
    module: "src/lib/finance/lineage.ts",
    criteria: ALL({ canonicalSource: null }),
    blockedBy: [],
    limitations: ["A derived figure is never canonical, however factual its inputs."],
  },
];

/**
 * Derives a domain's status from its criteria. A domain cannot be marked COMPLETE while any
 * applicable criterion is false.
 */
export function assessDomain(record: DomainRecord): {
  domain: string;
  status: DomainStatus;
  satisfied: number;
  applicable: number;
  failedCriteria: string[];
  reason: string;
} {
  const entries = Object.entries(record.criteria) as Array<[keyof CompletenessCriteria, boolean | null]>;
  const applicable = entries.filter(([, v]) => v !== null);
  const failed = applicable.filter(([, v]) => v === false).map(([k]) => k);
  const satisfied = applicable.length - failed.length;

  let status: DomainStatus;
  if (record.module === null) {
    status = "NOT_AVAILABLE";
  } else if (failed.length > 0) {
    status = "PARTIAL";
  } else if (record.blockedBy.some((b) => b.startsWith("AUTHORITY:"))) {
    status = "REQUIRES_AUTHORITY";
  } else if (record.blockedBy.some((b) => b.startsWith("DATA:"))) {
    status = "DATA_NOT_AVAILABLE";
  } else {
    status = "COMPLETE";
  }

  return {
    domain: record.domain,
    status,
    satisfied,
    applicable: applicable.length,
    failedCriteria: failed,
    reason:
      status === "COMPLETE"
        ? `All ${applicable.length} applicable criteria satisfied and nothing blocks it.`
        : status === "NOT_AVAILABLE"
          ? `No module exists. ${record.blockedBy.join("; ")}`
          : status === "PARTIAL"
            ? `${satisfied}/${applicable.length} criteria satisfied. Missing: ${failed.join(", ")}.`
            : `${satisfied}/${applicable.length} criteria satisfied, but blocked: ${record.blockedBy.join("; ")}`,
  };
}

/** The full maturity matrix. */
export function maturityMatrix(): Array<ReturnType<typeof assessDomain>> {
  return [...FINANCE_DOMAINS, ...FINANCE_PLATFORM_SERVICES]
    .map(assessDomain)
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Aggregate counts. Never a single score that hides a blocked domain. */
export function maturitySummary(): {
  total: number;
  byStatus: Record<DomainStatus, number>;
  fullyComplete: string[];
  notAvailable: string[];
  blockedByAuthority: string[];
  blockedByData: string[];
} {
  const matrix = maturityMatrix();
  const byStatus = {
    COMPLETE: 0, PARTIAL: 0, BLOCKED: 0, REQUIRES_AUTHORITY: 0,
    DATA_NOT_AVAILABLE: 0, NOT_AVAILABLE: 0,
  } as Record<DomainStatus, number>;
  for (const m of matrix) byStatus[m.status] += 1;

  return {
    total: matrix.length,
    byStatus,
    fullyComplete: matrix.filter((m) => m.status === "COMPLETE").map((m) => m.domain),
    notAvailable: matrix.filter((m) => m.status === "NOT_AVAILABLE").map((m) => m.domain),
    blockedByAuthority: matrix.filter((m) => m.status === "REQUIRES_AUTHORITY").map((m) => m.domain),
    blockedByData: matrix.filter((m) => m.status === "DATA_NOT_AVAILABLE").map((m) => m.domain),
  };
}

/** The Phase-26 service-contract surface, derived from the registry rather than hand-listed. */
export function serviceContract(): Array<{ service: string; module: string | null; status: DomainStatus }> {
  return [...FINANCE_DOMAINS, ...FINANCE_PLATFORM_SERVICES]
    .map((r) => ({ service: r.serviceName, module: r.module, status: assessDomain(r).status }))
    .sort((a, b) => a.service.localeCompare(b.service));
}
