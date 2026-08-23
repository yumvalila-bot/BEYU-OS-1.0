/**
 * Phase 10 maturity matrices.
 *
 * EXISTING PRIMITIVE: architecture/completeness.ts + finance/domains.ts.
 * GAP: Phase 10 asked for three named matrices in a stricter status vocabulary.
 * This module maps those registries. It does not score anything by hand.
 */
import { assessDomain, FINANCE_DOMAINS, FINANCE_PLATFORM_SERVICES } from "@/lib/finance/domains";
import {
  assessArchitectureDomain,
  ENTERPRISE_DOMAINS,
  type ArchitectureStatus,
} from "./completeness";

export const PHASE10_STATUS = [
  "COMPLETE",
  "PARTIAL",
  "BLOCKED",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
  "NOT_APPLICABLE",
] as const;
export type Phase10Status = (typeof PHASE10_STATUS)[number];

export type Phase10Row = {
  domain: string;
  status: Phase10Status;
  existingPrimitive: string;
  remainingGap: string;
};

function toPhase10(status: ArchitectureStatus): Phase10Status {
  if (status === "MISSING") return "NOT_APPLICABLE";
  if (status === "REQUIRES_EXTERNAL_INFRASTRUCTURE") return "BLOCKED";
  return status as Phase10Status;
}

export function commonPlatformMatrix(): Phase10Row[] {
  return ENTERPRISE_DOMAINS.map((d) => {
    const a = assessArchitectureDomain(d);
    return {
      domain: d.domain,
      status: toPhase10(a.status),
      existingPrimitive: d.module ?? "(none)",
      remainingGap: a.status === "COMPLETE" ? "—" : a.missingComponent,
    };
  }).sort((a, b) => a.domain.localeCompare(b.domain));
}

export function financeOsMatrix(): Phase10Row[] {
  return [...FINANCE_DOMAINS, ...FINANCE_PLATFORM_SERVICES]
    .map((r) => {
      const a = assessDomain(r);
      const status: Phase10Status =
        a.status === "NOT_AVAILABLE"
          ? "NOT_APPLICABLE"
          : a.status === "BLOCKED"
            ? "BLOCKED"
            : (a.status as Phase10Status);
      return {
        domain: a.domain,
        status,
        existingPrimitive: r.module ?? "(none)",
        remainingGap: a.status === "COMPLETE" ? "—" : r.blockedBy[0] ?? a.failedCriteria.join(", ") ?? "—",
      };
    })
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

export const CROSS_DOMAIN_CONTRACTS: readonly Phase10Row[] = [
  {
    domain: "Identity ↔ Governance",
    status: "COMPLETE",
    existingPrimitive: "proposeResolution + resolvePrincipal + can()",
    remainingGap: "—",
  },
  {
    domain: "Identity ↔ HCM",
    status: "COMPLETE",
    existingPrimitive: "lib/identity.ts + people.employees.party_id unique",
    remainingGap: "—",
  },
  {
    domain: "Identity ↔ Finance",
    status: "COMPLETE",
    existingPrimitive: "postJournal / financeGate consume Principal; no finance user table",
    remainingGap: "—",
  },
  {
    domain: "Governance ↔ Finance",
    status: "COMPLETE",
    existingPrimitive: "checkScopedCapability + financeGate + capital governance authorization",
    remainingGap: "Authority unratified (16/16 PENDING) — not a missing link",
  },
  {
    domain: "Finance ↔ Tax",
    status: "REQUIRES_AUTHORITY",
    existingPrimitive: "specialist/tax-intelligence.ts (candidates only, liability structurally null)",
    remainingGap: "P3 / CAP_VAT locked; no rate invented",
  },
  {
    domain: "Finance ↔ Legal",
    status: "PARTIAL",
    existingPrimitive: "assurance.legal_matters (schema + UI)",
    remainingGap: "No legal consumption service; interpretation must not be invented",
  },
  {
    domain: "Finance ↔ Treasury",
    status: "DATA_NOT_AVAILABLE",
    existingPrimitive: "specialist/treasury + treasury_positions",
    remainingGap: "Observations only; 3 attribution conflicts unrepaired (governance-owned)",
  },
  {
    domain: "Finance ↔ Risk",
    status: "COMPLETE",
    existingPrimitive: "specialist/risk (analytical; cannot write ledger)",
    remainingGap: "—",
  },
  {
    domain: "Finance ↔ Compliance",
    status: "COMPLETE",
    existingPrimitive: "specialist/compliance (MISSING never becomes VERIFIED)",
    remainingGap: "—",
  },
  {
    domain: "Finance ↔ Audit",
    status: "COMPLETE",
    existingPrimitive: "recordAuditTx + specialist/audit (read-only on ledgers)",
    remainingGap: "—",
  },
  {
    domain: "Finance ↔ Intelligence",
    status: "COMPLETE",
    existingPrimitive: "runSpecialist + Noelia inherits principal; never posts",
    remainingGap: "—",
  },
];

export function crossDomainMatrix(): Phase10Row[] {
  return [...CROSS_DOMAIN_CONTRACTS].sort((a, b) => a.domain.localeCompare(b.domain));
}
