/**
 * BEYU OS — HCM observation, single-record consumption, quality and
 * authority-blocked write chain (HCM-1).
 *
 * NOT A SECOND EMPLOYEE MASTER. Reads go through listWorkforce().
 * Writes evaluate and refuse. Empty scope is DATA_NOT_AVAILABLE, never 0.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { orgUnits } from "@/db/schema";
import { can, type Principal } from "./authz";
import {
  HcmError,
  HcmIntegrityError,
  assertEffectiveDates,
  assertManagerAcyclic,
  listEmploymentHistory,
  listEstablishment,
  listWorkforce,
  recordEmploymentChange,
  type EmploymentHistoryRecord,
  type TemporalClass,
  type WorkforceRecord,
} from "./hcm";
import { tenantScopeIds } from "./tenant-scope";

function inEntityScope(principal: Principal, legalEntityId: string): boolean {
  return principal.entityScope.length === 0 || principal.entityScope.includes(legalEntityId);
}

/**
 * Single-employee consumption. Out-of-scope and missing ids are both NOT_FOUND
 * so a forged id is not an existence oracle.
 */
export async function getEmployee(
  principal: Principal,
  employeeId: string,
  options: { asOf?: string } = {},
): Promise<{ employee: WorkforceRecord; source: "people.employees"; asOf: string }> {
  if (!employeeId || employeeId.length < 4) {
    throw new HcmError("NOT_FOUND", "Employee was not found.");
  }
  const workforce = await listWorkforce(principal, options);
  const employee = workforce.records.find((r) => r.employeeId === employeeId);
  if (!employee) {
    throw new HcmError("NOT_FOUND", "Employee was not found.");
  }
  return { employee, source: "people.employees", asOf: workforce.asOf };
}

/** Time-bound employment view derived from the master + events. Not a second master. */
export async function getEmployment(
  principal: Principal,
  employeeId: string,
  options: { asOf?: string } = {},
): Promise<{
  employeeId: string;
  legalEntityId: string;
  status: string;
  hireDate: string;
  endDate: string | null;
  temporalClass: TemporalClass;
  history: EmploymentHistoryRecord[];
  source: "people.employees + people.employment_events";
}> {
  const { employee, asOf } = await getEmployee(principal, employeeId, options);
  const history = (await listEmploymentHistory(principal, { asOf })).filter((e) => e.employeeId === employeeId);
  return {
    employeeId: employee.employeeId,
    legalEntityId: employee.legalEntityId,
    status: employee.status,
    hireDate: employee.hireDate,
    endDate: employee.endDate,
    temporalClass: employee.temporalClass,
    history,
    source: "people.employees + people.employment_events",
  };
}

export type OrganizationRecord = {
  orgUnitId: string;
  code: string;
  name: string;
  unitType: string;
  parentUnitId: string | null;
  legalEntityId: string;
  tenantId: string;
  status: string;
};

export function assertOrgAcyclic(rows: Array<{ id: string; parentUnitId: string | null }>): void {
  const byId = new Map(rows.map((r) => [r.id, r.parentUnitId]));
  for (const start of byId.keys()) {
    const seen = new Set<string>();
    let current: string | null = start;
    while (current) {
      if (seen.has(current)) {
        throw new HcmIntegrityError("CIRCULAR_ORG", `Organization hierarchy cycles at ${current}.`);
      }
      seen.add(current);
      current = byId.get(current) ?? null;
    }
  }
}

export async function listOrganizations(principal: Principal): Promise<{
  records: OrganizationRecord[];
  basis: "OBSERVED" | "DATA_NOT_AVAILABLE";
  source: "core.org_units";
}> {
  const decision = can(principal, "hcm:employee.read");
  if (!decision.allowed) {
    throw new HcmError("DENIED", decision.reason);
  }
  const scope = await tenantScopeIds(principal);
  const rows = await db.select().from(orgUnits).where(inArray(orgUnits.tenantId, scope)).orderBy(orgUnits.code);
  assertOrgAcyclic(rows.map((r) => ({ id: r.id, parentUnitId: r.parentUnitId })));
  const scoped = rows.filter((r) => inEntityScope(principal, r.legalEntityId));
  return {
    source: "core.org_units",
    basis: scoped.length === 0 ? "DATA_NOT_AVAILABLE" : "OBSERVED",
    records: scoped.map((r) => ({
      orgUnitId: r.id,
      code: r.code,
      name: r.name,
      unitType: r.unitType,
      parentUnitId: r.parentUnitId,
      legalEntityId: r.legalEntityId,
      tenantId: r.tenantId,
      status: r.status,
    })),
  };
}

export type WorkforceObservation = {
  basis: "OBSERVED" | "DATA_NOT_AVAILABLE";
  asOf: string;
  headcount: number | null;
  active: number | null;
  byEntity: Array<{ legalEntityId: string; name: string; n: number; active: number }>;
  byStatus: Array<{ status: string; n: number }>;
  byTemporal: Array<{ temporalClass: TemporalClass; n: number }>;
  occupancy: Array<{
    positionId: string;
    title: string;
    budget: number;
    occupied: number;
    vacancy: number;
  }> | null;
  occupancyBasis: "OBSERVED" | "DATA_NOT_AVAILABLE";
  managerSpanBasis: "OBSERVED" | "DATA_NOT_AVAILABLE";
  explanation: string[];
};

export async function observeWorkforce(
  principal: Principal,
  options: { asOf?: string } = {},
): Promise<WorkforceObservation> {
  const workforce = await listWorkforce(principal, options);
  const positions = await listEstablishment(principal);
  if (workforce.records.length === 0) {
    return {
      basis: "DATA_NOT_AVAILABLE",
      asOf: workforce.asOf,
      headcount: null,
      active: null,
      byEntity: [],
      byStatus: [],
      byTemporal: [],
      occupancy: null,
      occupancyBasis: "DATA_NOT_AVAILABLE",
      managerSpanBasis: "DATA_NOT_AVAILABLE",
      explanation: [
        "An empty authorised scope is DATA_NOT_AVAILABLE, not a headcount of zero.",
        "Missing workforce is never converted into an actual.",
      ],
    };
  }

  const byEntityMap = new Map<string, { legalEntityId: string; name: string; n: number; active: number }>();
  const byStatusMap = new Map<string, number>();
  const byTemporalMap = new Map<TemporalClass, number>();
  let active = 0;
  for (const r of workforce.records) {
    const bucket = byEntityMap.get(r.legalEntityId) ?? {
      legalEntityId: r.legalEntityId,
      name: r.legalEntityName,
      n: 0,
      active: 0,
    };
    bucket.n += 1;
    if (r.status === "ACTIVE") {
      bucket.active += 1;
      active += 1;
    }
    byEntityMap.set(r.legalEntityId, bucket);
    byStatusMap.set(r.status, (byStatusMap.get(r.status) ?? 0) + 1);
    byTemporalMap.set(r.temporalClass, (byTemporalMap.get(r.temporalClass) ?? 0) + 1);
  }

  const occupancy =
    positions.length === 0
      ? null
      : positions.map((p) => {
          const occupied = workforce.records.filter((r) => r.positionId === p.positionId).length;
          return {
            positionId: p.positionId,
            title: p.title,
            budget: p.headcountBudget,
            occupied,
            vacancy: Math.max(0, p.headcountBudget - occupied),
          };
        });

  const hasManagerEdge = workforce.records.some((r) => r.managerEmployeeId);
  return {
    basis: "OBSERVED",
    asOf: workforce.asOf,
    headcount: workforce.records.length,
    active,
    byEntity: [...byEntityMap.values()].sort((a, b) => a.legalEntityId.localeCompare(b.legalEntityId)),
    byStatus: [...byStatusMap.entries()].map(([status, n]) => ({ status, n })),
    byTemporal: [...byTemporalMap.entries()].map(([temporalClass, n]) => ({ temporalClass, n })),
    occupancy,
    occupancyBasis: occupancy ? "OBSERVED" : "DATA_NOT_AVAILABLE",
    managerSpanBasis: hasManagerEdge ? "OBSERVED" : "DATA_NOT_AVAILABLE",
    explanation: [
      `${workforce.records.length} employee master record(s) observed at ${workforce.asOf}.`,
      hasManagerEdge
        ? "Manager span is computed from employee.manager_employee_id."
        : "Manager span is DATA_NOT_AVAILABLE: no employee-level manager edges are populated.",
      "No turnover rate, target ratio or compensation benchmark is invented.",
    ],
  };
}

export type WorkforceQualityFinding = {
  code: string;
  basis: "DATA_QUALITY_ERROR" | "DATA_CONFLICT" | "DATA_NOT_AVAILABLE";
  detail: string;
  advisoryOnly: true;
};

export async function assessWorkforceQuality(principal: Principal): Promise<{
  findings: WorkforceQualityFinding[];
  scanned: number;
  source: "people.employees";
}> {
  const workforce = await listWorkforce(principal);
  const findings: WorkforceQualityFinding[] = [];
  const byNo = new Map<string, string[]>();
  const byParty = new Map<string, string[]>();
  const managerRows = workforce.records.map((r) => ({ id: r.employeeId, managerEmployeeId: r.managerEmployeeId }));

  for (const r of workforce.records) {
    byNo.set(r.employeeNo, [...(byNo.get(r.employeeNo) ?? []), r.employeeId]);
    byParty.set(r.partyId, [...(byParty.get(r.partyId) ?? []), r.employeeId]);
    try {
      assertEffectiveDates(r.hireDate, r.endDate);
    } catch (err) {
      if (err instanceof HcmIntegrityError) {
        findings.push({
          code: "INVALID_DATES",
          basis: "DATA_QUALITY_ERROR",
          detail: `${r.employeeId}: ${err.message}`,
          advisoryOnly: true,
        });
      }
    }
    if (!r.globalUserId) {
      findings.push({
        code: "EMPLOYEE_WITHOUT_LOGIN",
        basis: "DATA_NOT_AVAILABLE",
        detail: `${r.employeeId} has no GlobalUserID. A user is not invented.`,
        advisoryOnly: true,
      });
    }
  }

  for (const [no, ids] of byNo) {
    if (ids.length > 1) {
      findings.push({
        code: "DUPLICATE_EMPLOYEE_NO",
        basis: "DATA_CONFLICT",
        detail: `employee_no ${no} maps to ${ids.join(", ")}.`,
        advisoryOnly: true,
      });
    }
  }
  for (const [partyId, ids] of byParty) {
    if (ids.length > 1) {
      findings.push({
        code: "DUPLICATE_PARTY_EMPLOYEE",
        basis: "DATA_CONFLICT",
        detail: `party ${partyId} has ${ids.length} employee masters.`,
        advisoryOnly: true,
      });
    }
  }

  try {
    assertManagerAcyclic(managerRows);
  } catch (err) {
    if (err instanceof HcmIntegrityError) {
      findings.push({
        code: "CIRCULAR_MANAGER",
        basis: "DATA_QUALITY_ERROR",
        detail: err.message,
        advisoryOnly: true,
      });
    }
  }

  return { findings, scanned: workforce.records.length, source: "people.employees" };
}

export type HcmWriteStage = { stage: string; passed: boolean; detail: string };

/**
 * Governed HCM write chain. Reuses can() + the structural transition table.
 * Does not fork the Finance workflow engine. Always mutated: false.
 */
export function proposeEmploymentChange(
  principal: Principal | null,
  input: { from: string; to: string; eventType: string },
): {
  classification: "SIMULATION";
  decision: "AUTHORITY_CHAIN_INCOMPLETE" | "DENIED" | "INVALID_LIFECYCLE_TRANSITION";
  mutated: false;
  stages: HcmWriteStage[];
  reason: string;
} {
  const stages: HcmWriteStage[] = [];
  if (!principal) {
    return {
      classification: "SIMULATION",
      decision: "DENIED",
      mutated: false,
      stages: [{ stage: "PRINCIPAL", passed: false, detail: "Missing principal." }],
      reason: "Missing principal; execution cannot be attributed.",
    };
  }
  stages.push({ stage: "PRINCIPAL", passed: true, detail: `Principal ${principal.userId}.` });

  const result = recordEmploymentChange(principal, input);
  if (result.decision === "DENIED") {
    stages.push({ stage: "PERMISSION", passed: false, detail: result.reason });
    return { classification: "SIMULATION", decision: "DENIED", mutated: false, stages, reason: result.reason };
  }
  stages.push({ stage: "PERMISSION", passed: true, detail: "hcm:employee.manage." });

  if (result.decision === "ILLEGAL_TRANSITION") {
    stages.push({ stage: "TRANSITION", passed: false, detail: result.reason });
    return {
      classification: "SIMULATION",
      decision: "INVALID_LIFECYCLE_TRANSITION",
      mutated: false,
      stages,
      reason: result.reason,
    };
  }
  stages.push({ stage: "TRANSITION", passed: true, detail: result.reason });
  stages.push({
    stage: "AUTHORITY",
    passed: false,
    detail: "No ratified HCM write capability. AUTHORITY_CHAIN_INCOMPLETE.",
  });
  return {
    classification: "SIMULATION",
    decision: "AUTHORITY_CHAIN_INCOMPLETE",
    mutated: false,
    stages,
    reason: result.reason,
  };
}
