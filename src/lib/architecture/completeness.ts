/**
 * BEYU OS — Enterprise architectural completeness matrix (Phase 9, §22).
 *
 * ONE machine-derived answer to "is BEYU OS complete as a canonical enterprise OS?"
 * Finance OS (`finance/domains.ts`) and Governance (`governance/maturity.ts`) already
 * have honest registries. This is the missing enterprise-wide registry — it does not
 * replace them; it composes their statuses and covers the domains they do not.
 *
 * IT CANNOT INFLATE ITSELF. Status is derived from recorded evidence and blockers.
 * A domain with a false criterion cannot be COMPLETE. An AUTHORITY blocker cannot
 * be COMPLETE. Absence is listed, never omitted.
 */
import { assessDomain, FINANCE_DOMAINS, FINANCE_PLATFORM_SERVICES } from "@/lib/finance/domains";
import { assessLayer, GOVERNANCE_LAYERS } from "@/lib/governance/maturity";

export const ARCHITECTURE_STATUS = [
  "COMPLETE",
  "PARTIAL",
  "MISSING",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
  "REQUIRES_EXTERNAL_INFRASTRUCTURE",
] as const;
export type ArchitectureStatus = (typeof ARCHITECTURE_STATUS)[number];

export type DomainEvidence = {
  model: boolean;
  engine: boolean;
  serviceBoundary: boolean;
  securityBound: boolean;
  auditBound: boolean;
  tests: boolean;
};

export type ArchitectureDomain = {
  domain: string;
  canonicalSource: string;
  module: string | null;
  evidence: DomainEvidence;
  blockers: string[];
  missingComponent: string;
  notes: string;
};

const E = (over: Partial<DomainEvidence> = {}): DomainEvidence => ({
  model: true,
  engine: true,
  serviceBoundary: true,
  securityBound: true,
  auditBound: true,
  tests: true,
  ...over,
});

const NONE: DomainEvidence = {
  model: false,
  engine: false,
  serviceBoundary: false,
  securityBound: false,
  auditBound: false,
  tests: false,
};

/**
 * Enterprise domains that are not already scored by the Finance or Governance
 * registries. Those two remain the canonical source for their own layers.
 */
export const ENTERPRISE_DOMAINS: readonly ArchitectureDomain[] = [
  {
    domain: "Identity",
    canonicalSource: "identity.parties / identity.users (ONE GlobalUserID = users.id → parties.id)",
    module: "src/db/schema/identity.ts + src/lib/identity.ts + src/lib/session.ts + src/lib/authz.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "ONE party MDM, ONE GlobalUserID (users.id), sessions, roles, grants, MFA. Runtime permissions still resolve from constants.ts (H-01); role_permissions is a parity-checked mirror.",
  },
  {
    domain: "Security",
    canonicalSource: "lib/authz.ts (RBAC ∧ ABAC ∧ tenancy ∧ clearance ∧ step-up)",
    module: "src/lib/authz.ts + src/lib/guard.ts + src/lib/mfa.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "Identity never executes financially. 6C gate composes capability + authority.",
  },
  {
    domain: "HCM",
    canonicalSource: "people.employees (ONE employee/master ID, unique on party_id)",
    module: "src/db/schema/people.ts + src/lib/hcm.ts",
    evidence: E({ serviceBoundary: true }),
    blockers: [],
    missingComponent: "—",
    notes: "Workforce master + employment events + positions. Sector OSs consume; they do not hold an employee master.",
  },
  {
    domain: "Noelia / HIVE",
    canonicalSource: "platform.ai_decisions (agent = NOELIA, runtime = HIVE)",
    module: "src/lib/noelia.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "Single AI identity. Inherits principal authority; never posts, votes, or grants. Human review for material output.",
  },
  {
    domain: "Event system",
    canonicalSource: "platform.enterprise_events",
    module: "src/lib/audit.ts:publishEventTx",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "ONE event model. Append-only, hash-chained, written inside the audit transaction.",
  },
  {
    domain: "Trace system",
    canonicalSource: "audit_log.trace_id + enterprise_events.trace_id",
    module: "src/lib/audit.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "Trace id is required on specialist and governed mutations. OpenTelemetry export is not implemented.",
  },
  {
    domain: "API / service layer",
    canonicalSource: "src/app/api/v1/* via lib/api.ts guarded()",
    module: "src/lib/api.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "Canonical pipeline: authenticate → scope → RBAC → rate limit → handler → audit. No server actions mutate domain state.",
  },
  {
    domain: "Data access layer",
    canonicalSource: "src/db (Drizzle + PostgreSQL)",
    module: "src/db/index.ts + src/db/schema/*",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "ONE backend. RLS on tenant-scoped tables. drizzle-kit push is prohibited.",
  },
  {
    domain: "Configuration",
    canonicalSource: ".env (never committed) + feature_flags",
    module: ".env.example + src/lib/constants.ts",
    evidence: E({ engine: false }),
    blockers: ["ENGINEERING: no remote config service; env + flags only"],
    missingComponent: "remote configuration (not required)",
    notes: "Secrets are environment-only. Feature flags exist. Sufficient for the kernel.",
  },
  {
    domain: "Deployment",
    canonicalSource: "Next.js + PostgreSQL",
    module: null,
    evidence: NONE,
    blockers: ["INFRA: no Docker / compose / k8s manifests in-repo"],
    missingComponent: "container / orchestrator definition",
    notes: "Runtime is portable. Packaging is REQUIRES_EXTERNAL_INFRASTRUCTURE.",
  },
  {
    domain: "CI/CD",
    canonicalSource: "docs/ci/ci.yml",
    module: "docs/ci/ci.yml",
    evidence: E({ engine: false, tests: false }),
    blockers: ["INFRA: GitHub App lacks workflows permission; no Actions execution observed"],
    missingComponent: "GitHub Actions execution",
    notes: "CONFIGURATION PRESENT. EXECUTION UNVERIFIED. Do not redesign.",
  },
  {
    domain: "Observability",
    canonicalSource: "GET /api/health + GET /api/v1/system/self-test + audit ledger",
    module: "src/app/api/health/route.ts + src/app/api/v1/system/self-test/route.ts",
    evidence: E({ engine: false }),
    blockers: ["INFRA: no OpenTelemetry exporter, no metrics backend"],
    missingComponent: "OTEL / metrics backend",
    notes: "Liveness, readiness and 9-control self-test exist. Distributed tracing export does not.",
  },
  {
    domain: "Disaster recovery readiness",
    canonicalSource: "assurance.continuity_plans (RPO/RTO declared)",
    module: "src/db/schema/assurance.ts",
    evidence: E({ engine: false, serviceBoundary: false }),
    blockers: ["INFRA: plans are recorded; restore automation is not in this repository"],
    missingComponent: "PITR / failover automation",
    notes: "Three plans with RPO/RTO. A plan is not a proven restore.",
  },
  {
    domain: "Backup / recovery readiness",
    canonicalSource: "docs/operations/README.md + BCP-DATA-02",
    module: null,
    evidence: { ...NONE, model: true },
    blockers: ["INFRA: no backup job, no restore test harness in-repo"],
    missingComponent: "backup job + restore evidence",
    notes: "Documented procedure only. REQUIRES_EXTERNAL_INFRASTRUCTURE.",
  },
  {
    domain: "Compliance architecture",
    canonicalSource: "assurance.compliance_obligations + specialist/compliance",
    module: "src/lib/specialist/compliance/service.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "Six explicit states. MISSING never becomes VERIFIED. No certification is claimed.",
  },
  {
    domain: "Cross-sector integration",
    canonicalSource: "core.os_registry + core.source_of_truth",
    module: "src/db/schema/core.ts",
    evidence: E({ engine: false, serviceBoundary: false }),
    blockers: ["ENGINEERING: Sector OSs (Health, Agriculture, Mining, Foundation ops) are not built"],
    missingComponent: "Sector OS runtimes",
    notes: "Charters and SoT matrix exist. Consumption is via BEYU identity/HCM/Finance. No sector OS to integrate yet.",
  },
  {
    domain: "Domain registry",
    canonicalSource: "core.os_registry + finance/domains.ts + governance/maturity.ts + this module",
    module: "src/lib/architecture/completeness.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "THREE registries, one concern each. This one is the enterprise roll-up. Phase 10 exposes the three required matrices from the same evidence.",
  },
  {
    domain: "Workflow",
    canonicalSource: "governance.workflows + finance/workflow.ts",
    module: "src/lib/finance/workflow.ts",
    evidence: E(),
    blockers: [],
    missingComponent: "—",
    notes: "121 state pairs decided. Execution states fail closed without an activated capability.",
  },
  {
    domain: "Family Office",
    canonicalSource: "people.family_members / beneficiaries / family_vault_items",
    module: "src/db/schema/people.ts",
    evidence: E({ serviceBoundary: false }),
    blockers: [],
    missingComponent: "write API (UI + schema only)",
    notes: "First-class BEYU OS capability, never a separate OS. HIGHLY_RESTRICTED.",
  },
];

function evidenceFailed(e: DomainEvidence): string[] {
  return (Object.entries(e) as Array<[keyof DomainEvidence, boolean]>)
    .filter(([, v]) => !v)
    .map(([k]) => k);
}

export function assessArchitectureDomain(d: ArchitectureDomain): {
  domain: string;
  status: ArchitectureStatus;
  canonicalSource: string;
  evidence: string;
  missingComponent: string;
  action: string;
} {
  const failed = evidenceFailed(d.evidence);
  let status: ArchitectureStatus;
  if (d.module === null && failed.length === Object.keys(d.evidence).length) {
    status = d.blockers.some((b) => b.startsWith("INFRA:"))
      ? "REQUIRES_EXTERNAL_INFRASTRUCTURE"
      : "MISSING";
  } else if (failed.length > 0) {
    status = d.blockers.some((b) => b.startsWith("INFRA:"))
      ? "REQUIRES_EXTERNAL_INFRASTRUCTURE"
      : "PARTIAL";
  } else if (d.blockers.some((b) => b.startsWith("AUTHORITY:"))) {
    status = "REQUIRES_AUTHORITY";
  } else if (d.blockers.some((b) => b.startsWith("DATA:"))) {
    status = "DATA_NOT_AVAILABLE";
  } else if (d.blockers.some((b) => b.startsWith("INFRA:"))) {
    status = "REQUIRES_EXTERNAL_INFRASTRUCTURE";
  } else if (d.blockers.length > 0) {
    status = "PARTIAL";
  } else {
    status = "COMPLETE";
  }

  const action =
    status === "COMPLETE"
      ? "LEAVE UNCHANGED"
      : status === "REQUIRES_AUTHORITY"
        ? "AWAIT RATIFICATION — do not invent authority"
        : status === "DATA_NOT_AVAILABLE"
          ? "AWAIT GOVERNED DATA — do not fabricate"
          : status === "REQUIRES_EXTERNAL_INFRASTRUCTURE"
            ? "REPORT ONLY — do not invent infrastructure"
            : status === "MISSING"
              ? "BUILD ONLY IF A GENUINE KERNEL PRIMITIVE"
              : "COMPLETE ONLY THE MISSING PART";

  return {
    domain: d.domain,
    status,
    canonicalSource: d.canonicalSource,
    evidence:
      failed.length === 0
        ? `All ${Object.keys(d.evidence).length} evidence criteria satisfied.`
        : `${Object.keys(d.evidence).length - failed.length}/${Object.keys(d.evidence).length} criteria; missing: ${failed.join(", ")}.`,
    missingComponent: d.missingComponent,
    action,
  };
}

/** Roll-up of Finance OS domains, mapped onto the Phase-9 status vocabulary. */
export function financeRollup(): Array<{
  domain: string;
  status: ArchitectureStatus;
  canonicalSource: string;
  evidence: string;
  missingComponent: string;
  action: string;
}> {
  return [...FINANCE_DOMAINS, ...FINANCE_PLATFORM_SERVICES].map((r) => {
    const a = assessDomain(r);
    const status: ArchitectureStatus =
      a.status === "NOT_AVAILABLE"
        ? "MISSING"
        : a.status === "BLOCKED"
          ? "PARTIAL"
          : (a.status as ArchitectureStatus);
    return {
      domain: `Finance OS / ${a.domain}`,
      status,
      canonicalSource: r.module ?? "(none)",
      evidence: a.reason,
      missingComponent: a.failedCriteria.join(", ") || r.blockedBy[0] || "—",
      action:
        status === "COMPLETE"
          ? "LEAVE UNCHANGED"
          : status === "REQUIRES_AUTHORITY"
            ? "AWAIT RATIFICATION — do not invent authority"
            : status === "DATA_NOT_AVAILABLE"
              ? "AWAIT GOVERNED DATA — do not fabricate"
              : status === "MISSING"
                ? "NOT_AVAILABLE — do not stub"
                : "COMPLETE ONLY THE MISSING PART",
    };
  });
}

/** Roll-up of the governance control-plane layers. */
export function governanceRollup(): Array<{
  domain: string;
  status: ArchitectureStatus;
  canonicalSource: string;
  evidence: string;
  missingComponent: string;
  action: string;
}> {
  return GOVERNANCE_LAYERS.map((l) => {
    const a = assessLayer(l);
    const status: ArchitectureStatus =
      a.status === "NOT_AVAILABLE"
        ? "MISSING"
        : a.status === "BLOCKED"
          ? "PARTIAL"
          : (a.status as ArchitectureStatus);
    return {
      domain: `Governance / ${a.layer}`,
      status,
      canonicalSource: l.module ?? "(none)",
      evidence: a.evidenceSummary,
      missingComponent: a.missing.join(", ") || a.blocker || "—",
      action:
        status === "COMPLETE"
          ? "LEAVE UNCHANGED"
          : status === "REQUIRES_AUTHORITY"
            ? "AWAIT RATIFICATION — do not invent authority"
            : status === "DATA_NOT_AVAILABLE"
              ? "AWAIT GOVERNED DATA — do not fabricate"
              : "COMPLETE ONLY THE MISSING PART",
    };
  });
}

export function architectureMatrix(): Array<ReturnType<typeof assessArchitectureDomain>> {
  const enterprise = ENTERPRISE_DOMAINS.map(assessArchitectureDomain);
  return [...enterprise, ...financeRollup(), ...governanceRollup()].sort((a, b) =>
    a.domain.localeCompare(b.domain),
  );
}

export function architectureSummary(): {
  total: number;
  byStatus: Record<ArchitectureStatus, number>;
  complete: string[];
  partial: string[];
  missing: string[];
  requiresAuthority: string[];
  dataNotAvailable: string[];
  requiresExternalInfrastructure: string[];
} {
  const m = architectureMatrix();
  const byStatus = {
    COMPLETE: 0,
    PARTIAL: 0,
    MISSING: 0,
    REQUIRES_AUTHORITY: 0,
    DATA_NOT_AVAILABLE: 0,
    REQUIRES_EXTERNAL_INFRASTRUCTURE: 0,
  } as Record<ArchitectureStatus, number>;
  for (const x of m) byStatus[x.status] += 1;
  return {
    total: m.length,
    byStatus,
    complete: m.filter((x) => x.status === "COMPLETE").map((x) => x.domain),
    partial: m.filter((x) => x.status === "PARTIAL").map((x) => x.domain),
    missing: m.filter((x) => x.status === "MISSING").map((x) => x.domain),
    requiresAuthority: m.filter((x) => x.status === "REQUIRES_AUTHORITY").map((x) => x.domain),
    dataNotAvailable: m.filter((x) => x.status === "DATA_NOT_AVAILABLE").map((x) => x.domain),
    requiresExternalInfrastructure: m
      .filter((x) => x.status === "REQUIRES_EXTERNAL_INFRASTRUCTURE")
      .map((x) => x.domain),
  };
}
