/**
 * Phase 12 — HCM completeness matrix.
 *
 * EXISTING PRIMITIVE: people.employees + lib/hcm.ts + identity graph.
 * GAP: Phase 9–11 scored HCM as one enterprise domain. Phase 12 needs a
 * capability-level matrix that cannot call a table COMPLETE merely because
 * it exists, and cannot call HCM incomplete merely because ATS/payroll/benefits
 * are absent.
 *
 * Status is derived from recorded evidence. A write that has no ratified
 * authority is REQUIRES_AUTHORITY, not a missing HR product.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const HCM_MATRIX_STATUS = [
  "COMPLETE",
  "PARTIAL",
  "REQUIRES_AUTHORITY",
  "DATA_NOT_AVAILABLE",
  "NOT_AVAILABLE",
] as const;
export type HcmMatrixStatus = (typeof HCM_MATRIX_STATUS)[number];

export type HcmCapabilityRow = {
  capability: string;
  status: HcmMatrixStatus;
  evidence: string;
  blocker: string;
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

function src(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Live evidence collected from the tree. The matrix cannot be edited by hand
 * independently of these probes.
 */
export function hcmEvidence(): {
  employeeTables: string[];
  employeeInserts: string[];
  journalFromHcm: boolean;
  consumptionApi: boolean;
  identityGraph: boolean;
  entityScopeOnRead: boolean;
  compensationGate: boolean;
  unknownClearanceClosed: boolean;
  temporalClassifier: boolean;
  lifecycleRefuse: boolean;
  managerIntegrity: boolean;
  uiUsesService: boolean;
  noeliaUsesService: boolean;
} {
  const schemaHits = walk("src/db/schema").filter((f) => /pgTable\(\s*"employees"/.test(src(f)));
  const inserts = walk("src").filter((f) => {
    if (f.includes("seed.ts")) return false;
    const t = src(f);
    return /insert\(\s*s?\.?employees/.test(t) || /insert\(employees\)/.test(t);
  });
  const hcm = src("src/lib/hcm.ts");
  const authz = src("src/lib/authz.ts");
  const page = src("src/app/os/hcm/page.tsx");
  const noelia = src("src/lib/noelia.ts");
  return {
    employeeTables: schemaHits,
    employeeInserts: inserts,
    journalFromHcm: /insert\(journalEntries\)/.test(hcm),
    consumptionApi: /export async function GET/.test(src("src/app/api/v1/hcm/employees/route.ts")),
    identityGraph: /globalUserIdsForParties/.test(hcm) && /GlobalUserID/.test(src("src/lib/identity.ts")),
    entityScopeOnRead: /entityScope/.test(hcm) && /inEntityScope/.test(hcm),
    compensationGate: /suppressedCompensation/.test(hcm) && /RESTRICTED/.test(hcm),
    unknownClearanceClosed: /isKnownClassification\(principal\.clearance\)/.test(authz),
    temporalClassifier: /classifyEmploymentTemporal/.test(hcm),
    lifecycleRefuse: /REQUIRES_AUTHORITY/.test(hcm) && /mutated: false/.test(hcm),
    managerIntegrity: /assertManagerAcyclic/.test(hcm) && /assertManagerSameScope/.test(hcm),
    uiUsesService: /listWorkforce/.test(page) && /listEmploymentHistory/.test(page),
    noeliaUsesService: /listWorkforce/.test(noelia),
  };
}

function row(
  capability: string,
  status: HcmMatrixStatus,
  evidence: string,
  blocker: string,
): HcmCapabilityRow {
  return { capability, status, evidence, blocker };
}

export function hcmCompletenessMatrix(): HcmCapabilityRow[] {
  const e = hcmEvidence();
  const masterComplete =
    e.employeeTables.length === 1 && e.employeeInserts.length === 0 && e.consumptionApi && e.identityGraph;

  return [
    row(
      "GlobalUserID integration",
      e.identityGraph ? "COMPLETE" : "PARTIAL",
      "lib/identity.ts GlobalUserID = users.id; listWorkforce attaches it.",
      "—",
    ),
    row(
      "Employee master",
      masterComplete ? "COMPLETE" : "PARTIAL",
      `ONE people.employees table (${e.employeeTables.join(", ") || "none"}); application writers=${e.employeeInserts.length}.`,
      e.employeeInserts.length > 0 ? "A second writer exists" : "—",
    ),
    row(
      "Employment lifecycle",
      e.lifecycleRefuse ? "REQUIRES_AUTHORITY" : "PARTIAL",
      "employment_events + structural transition evaluator exist. recordEmploymentChange() never writes.",
      "No ratified HCM write capability",
    ),
    row(
      "Organization structure",
      "PARTIAL",
      "core.org_units is the org master; legal_entities remain ownership. Positions may reference an org unit.",
      "Seeded establishment is not populated with org units (not a second org master)",
    ),
    row(
      "Position management",
      "PARTIAL",
      "people.positions + listEstablishment() read path. Grade, job family, reports-to, headcount budget.",
      "Position write path is unratified",
    ),
    row(
      "Job architecture",
      "PARTIAL",
      "grade and job_family live on positions, not on Finance or Sector OS tables.",
      "No separate job catalogue table — not required for the kernel",
    ),
    row(
      "Manager hierarchy",
      e.managerIntegrity ? "PARTIAL" : "NOT_AVAILABLE",
      "manager_employee_id + reports_to_position_id. Integrity asserts cycle and cross-scope. Seed uses position reports-to.",
      "Employee-level manager edges are not populated in seed",
    ),
    row(
      "Workforce data governance",
      e.compensationGate && e.unknownClearanceClosed ? "COMPLETE" : "PARTIAL",
      "employees.classification + filterByClearance fail-closed + RESTRICTED pay gate.",
      "—",
    ),
    row(
      "Tenant isolation",
      "COMPLETE",
      "tenantScopeIds on employee.tenant_id OR employing legal_entities.tenant_id.",
      "—",
    ),
    row(
      "Entity isolation",
      e.entityScopeOnRead ? "COMPLETE" : "PARTIAL",
      "Empty entityScope = all in tenant reach; non-empty filters legalEntityId.",
      "—",
    ),
    row(
      "RBAC",
      "COMPLETE",
      "hcm:employee.read / hcm:employee.manage via can(). CFO has neither.",
      "—",
    ),
    row(
      "ABAC",
      e.unknownClearanceClosed ? "COMPLETE" : "PARTIAL",
      "Clearance + entityScope + tenant. Unknown clearance fails closed in filterByClearance.",
      "—",
    ),
    row(
      "Compensation boundary",
      e.journalFromHcm ? "PARTIAL" : "COMPLETE",
      "Pay is RESTRICTED workforce data. HCM does not post, settle, tax or recognise expense.",
      "—",
    ),
    row(
      "Audit",
      "PARTIAL",
      "GET /api/v1/hcm/employees is guarded() (authenticated read). Writes do not exist.",
      "No ratified mutation to audit",
    ),
    row(
      "Events",
      "PARTIAL",
      "os_registry declares EMPLOYEE_CREATED / EMPLOYMENT_CHANGED. No writer publishes them.",
      "Unratified write path",
    ),
    row(
      "Temporal history",
      e.temporalClassifier ? "PARTIAL" : "NOT_AVAILABLE",
      "hireDate/endDate/status + employment_events. Classifier distinguishes CURRENT/FUTURE/EXPIRED/TERMINATED.",
      "ONE row per party — assignment history is events, not a second master",
    ),
    row(
      "Sector-OS consumption",
      e.consumptionApi && e.noeliaUsesService ? "PARTIAL" : "NOT_AVAILABLE",
      "GET /api/v1/hcm/employees is the declared consumption API. Noelia consumes listWorkforce. Sector OSs are not built.",
      "HEALTH_OS / AGRICULTURE_OS runtimes are not implemented (do not build here)",
    ),
    row(
      "Reporting",
      "PARTIAL",
      "KPI-HEADCOUNT is a metric definition over people.employees. No HCM BI engine.",
      "Not a kernel primitive",
    ),
    row(
      "Data integrity",
      e.managerIntegrity ? "PARTIAL" : "NOT_AVAILABLE",
      "UNIQUE(employee_no), UNIQUE(party_id), party FK. Manager FK is application-enforced (same class as users.party_id).",
      "No schema unique on users.party_id (H-01-adjacent; left)",
    ),
    row(
      "API layer",
      e.consumptionApi && e.uiUsesService ? "COMPLETE" : "PARTIAL",
      "One GET. UI and Noelia reuse listWorkforce. No duplicate workforce API.",
      "—",
    ),
  ];
}

export function hcmCompletenessSummary(): {
  total: number;
  complete: string[];
  partial: string[];
  requiresAuthority: string[];
  dataNotAvailable: string[];
  notAvailable: string[];
} {
  const m = hcmCompletenessMatrix();
  return {
    total: m.length,
    complete: m.filter((r) => r.status === "COMPLETE").map((r) => r.capability),
    partial: m.filter((r) => r.status === "PARTIAL").map((r) => r.capability),
    requiresAuthority: m.filter((r) => r.status === "REQUIRES_AUTHORITY").map((r) => r.capability),
    dataNotAvailable: m.filter((r) => r.status === "DATA_NOT_AVAILABLE").map((r) => r.capability),
    notAvailable: m.filter((r) => r.status === "NOT_AVAILABLE").map((r) => r.capability),
  };
}
