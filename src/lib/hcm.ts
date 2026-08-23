/**
 * BEYU OS — HCM consumption service (Phase 9 / 10 / 12).
 *
 * HCM is the ONE employee/master. Sector OSs consume this service; they do not
 * hold an independent employee identity.
 *
 * THIS MODULE DOES NOT WRITE THE EMPLOYEE MASTER. Creating or mutating an
 * employee is a governed write. No HCM write capability is ratified, so every
 * mutation path returns REQUIRES_AUTHORITY and leaves the database untouched.
 *
 * Compensation is classified RESTRICTED and is stripped unless the principal's
 * clearance is a known rank at or above that ceiling.
 *
 * GlobalUserID is attached from the identity graph (users.id). Finance may
 * consume that id; it does not receive pay data through the identity graph.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees, employmentEvents, legalEntities, orgUnits, parties, positions } from "@/db/schema";
import { can, type Principal } from "./authz";
import { classificationRank, isKnownClassification } from "./constants";
import { globalUserIdsForParties, type GlobalUserID } from "./identity";
import { tenantScopeIds } from "./tenant-scope";

export const HCM_VERSION = "hcm-1.3.0";

export const EMPLOYMENT_STATUS = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[number];

export const EMPLOYMENT_EVENT_TYPE = [
  "HIRE",
  "PROMOTION",
  "TRANSFER",
  "LEAVE",
  "SUSPENSION",
  "TERMINATION",
  "REHIRE",
] as const;
export type EmploymentEventType = (typeof EMPLOYMENT_EVENT_TYPE)[number];

export const TEMPORAL_CLASS = ["CURRENT", "HISTORICAL", "FUTURE", "EXPIRED", "TERMINATED"] as const;
export type TemporalClass = (typeof TEMPORAL_CLASS)[number];

export type WorkforceRecord = {
  employeeId: string;
  employeeNo: string;
  partyId: string;
  /** Canonical login identity. Null only if the party has no user row. */
  globalUserId: GlobalUserID | null;
  displayName: string;
  tenantId: string;
  legalEntityId: string;
  legalEntityName: string;
  legalEntityTenantId: string;
  positionId: string | null;
  positionTitle: string | null;
  positionGrade: string | null;
  jobFamily: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  managerEmployeeId: string | null;
  hireDate: string;
  endDate: string | null;
  status: string;
  employmentType: string;
  countryCode: string;
  classification: string;
  temporalClass: TemporalClass;
  /** Present only when the principal's clearance is at least RESTRICTED. */
  baseSalary: string | null;
  salaryCurrency: string | null;
};

export type EmploymentHistoryRecord = {
  eventId: string;
  employeeId: string;
  employeeNo: string;
  displayName: string;
  eventType: string;
  effectiveFrom: string;
  temporalClass: "CURRENT" | "HISTORICAL" | "FUTURE";
  approvedBy: string | null;
  recordedBy: string;
};

export type PositionRecord = {
  positionId: string;
  code: string;
  title: string;
  grade: string;
  jobFamily: string | null;
  tenantId: string;
  orgUnitId: string | null;
  reportsToPositionId: string | null;
  headcountBudget: number;
  status: string;
};

export type HcmErrorCode =
  | "DENIED"
  | "NOT_FOUND"
  | "REQUIRES_AUTHORITY"
  | "INTEGRITY"
  | "AUTHORITY_CHAIN_INCOMPLETE"
  | "INVALID_LIFECYCLE_TRANSITION"
  | "DATA_NOT_AVAILABLE";

export class HcmError extends Error {
  constructor(
    readonly code: HcmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HcmError";
  }
}

function isoDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function requireIsoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HcmError("INTEGRITY", `${label} must be an ISO date (YYYY-MM-DD).`);
  }
  return value;
}

/**
 * Temporal class of the employee master row.
 *
 * Status TERMINATED is authoritative when recorded. A future hireDate is FUTURE
 * even if status is still ACTIVE — the row must not become current early.
 * A past endDate that is not TERMINATED is EXPIRED, not silently ACTIVE.
 * HISTORICAL is reserved for employment-event facts, not the live master row.
 */
export function classifyEmploymentTemporal(input: {
  status: string;
  hireDate: string;
  endDate: string | null;
  asOf: string;
}): TemporalClass {
  requireIsoDate(input.asOf, "asOf");
  requireIsoDate(input.hireDate, "hireDate");
  if (input.endDate) requireIsoDate(input.endDate, "endDate");
  if (input.status === "TERMINATED") return "TERMINATED";
  if (input.hireDate > input.asOf) return "FUTURE";
  if (input.endDate && input.endDate < input.asOf) return "EXPIRED";
  return "CURRENT";
}

/** Employment events are facts. Past facts are HISTORICAL; they are not rewritten as CURRENT. */
export function classifyEmploymentEventTemporal(
  effectiveFrom: string,
  asOf: string,
): "CURRENT" | "HISTORICAL" | "FUTURE" {
  requireIsoDate(effectiveFrom, "effectiveFrom");
  requireIsoDate(asOf, "asOf");
  if (effectiveFrom > asOf) return "FUTURE";
  if (effectiveFrom < asOf) return "HISTORICAL";
  return "CURRENT";
}

/**
 * Structural employment-status transitions implied by the existing schema
 * comments. This is not labour law and not a second workflow engine.
 *
 * Unknown statuses fail closed. TERMINATED → ACTIVE requires REHIRE.
 * PROMOTION / TRANSFER do not change employment status.
 */
export const EMPLOYMENT_TRANSITIONS: Readonly<Record<EmploymentStatus, readonly EmploymentStatus[]>> = {
  ACTIVE: ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"],
  ON_LEAVE: ["ACTIVE", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: ["ACTIVE"],
};

export function isEmploymentStatus(v: unknown): v is EmploymentStatus {
  return typeof v === "string" && (EMPLOYMENT_STATUS as readonly string[]).includes(v);
}

export function isEmploymentEventType(v: unknown): v is EmploymentEventType {
  return typeof v === "string" && (EMPLOYMENT_EVENT_TYPE as readonly string[]).includes(v);
}

export type EmploymentTransitionVerdict = {
  permitted: boolean;
  decision: "PERMITTED" | "UNKNOWN_STATE" | "ILLEGAL_TRANSITION" | "REQUIRES_REHIRE";
  from: EmploymentStatus | null;
  to: EmploymentStatus | null;
  reason: string;
};

export function evaluateEmploymentTransition(input: {
  from: string;
  to: string;
  eventType: string;
}): EmploymentTransitionVerdict {
  if (!isEmploymentStatus(input.from) || !isEmploymentStatus(input.to) || !isEmploymentEventType(input.eventType)) {
    return {
      permitted: false,
      decision: "UNKNOWN_STATE",
      from: isEmploymentStatus(input.from) ? input.from : null,
      to: isEmploymentStatus(input.to) ? input.to : null,
      reason: `Unrecognised employment state or event '${input.from}' -${input.eventType}-> '${input.to}'. Fails closed.`,
    };
  }
  if (input.from === "TERMINATED" && input.to === "ACTIVE" && input.eventType !== "REHIRE") {
    return {
      permitted: false,
      decision: "REQUIRES_REHIRE",
      from: input.from,
      to: input.to,
      reason: "TERMINATED → ACTIVE is only structural via REHIRE. This is not a legal rehire rule.",
    };
  }
  if (!EMPLOYMENT_TRANSITIONS[input.from].includes(input.to)) {
    return {
      permitted: false,
      decision: "ILLEGAL_TRANSITION",
      from: input.from,
      to: input.to,
      reason: `${input.from} → ${input.to} is not a structural employment transition.`,
    };
  }
  return {
    permitted: true,
    decision: "PERMITTED",
    from: input.from,
    to: input.to,
    reason: `${input.from} -${input.eventType}-> ${input.to} is structurally admissible.`,
  };
}

export type LifecycleMutationResult = {
  decision: "REQUIRES_AUTHORITY" | "DENIED" | "ILLEGAL_TRANSITION";
  mutated: false;
  reason: string;
};

/**
 * The smallest governed lifecycle mechanism: evaluate, then refuse to write.
 * No HCM write capability is ratified. This function must never insert.
 */
export function recordEmploymentChange(
  principal: Principal,
  input: { from: string; to: string; eventType: string },
): LifecycleMutationResult {
  const rbac = can(principal, "hcm:employee.manage");
  if (!rbac.allowed) {
    return { decision: "DENIED", mutated: false, reason: rbac.reason };
  }
  const transition = evaluateEmploymentTransition(input);
  if (!transition.permitted) {
    return { decision: "ILLEGAL_TRANSITION", mutated: false, reason: transition.reason };
  }
  return {
    decision: "REQUIRES_AUTHORITY",
    mutated: false,
    reason:
      "Employment mutation is a governed write. No ratified HCM write capability exists, so the master is unchanged.",
  };
}

export class HcmIntegrityError extends Error {
  constructor(
    readonly code: "CIRCULAR_MANAGER" | "CIRCULAR_ORG" | "CROSS_SCOPE_MANAGER" | "SELF_MANAGER" | "INVALID_DATES",
    message: string,
  ) {
    super(message);
    this.name = "HcmIntegrityError";
  }
}

export function assertEffectiveDates(hireDate: string, endDate: string | null): void {
  requireIsoDate(hireDate, "hireDate");
  if (endDate) {
    requireIsoDate(endDate, "endDate");
    if (endDate < hireDate) {
      throw new HcmIntegrityError("INVALID_DATES", "endDate must not precede hireDate.");
    }
  }
}

export function assertManagerNotSelf(employeeId: string, managerEmployeeId: string | null): void {
  if (managerEmployeeId && managerEmployeeId === employeeId) {
    throw new HcmIntegrityError("SELF_MANAGER", `Employee ${employeeId} cannot manage themselves.`);
  }
}

/**
 * Manager edges must stay inside the same tenant and legal entity.
 * A manager who crosses either boundary is a second, unofficial org chart.
 */
export function assertManagerSameScope(
  employee: { id: string; tenantId: string; legalEntityId: string },
  manager: { id: string; tenantId: string; legalEntityId: string } | null,
): void {
  if (!manager) return;
  assertManagerNotSelf(employee.id, manager.id);
  if (employee.tenantId !== manager.tenantId || employee.legalEntityId !== manager.legalEntityId) {
    throw new HcmIntegrityError(
      "CROSS_SCOPE_MANAGER",
      `Manager ${manager.id} is outside employee ${employee.id} tenant/entity scope.`,
    );
  }
}

/** Cycle detection on the manager graph. Exported so a later write path cannot drop it. */
export function assertManagerAcyclic(rows: Array<{ id: string; managerEmployeeId: string | null }>): void {
  const byId = new Map(rows.map((r) => [r.id, r.managerEmployeeId]));
  for (const start of byId.keys()) {
    const seen = new Set<string>();
    let current: string | null = start;
    while (current) {
      if (seen.has(current)) {
        throw new HcmIntegrityError("CIRCULAR_MANAGER", `Manager hierarchy cycles at ${current}.`);
      }
      seen.add(current);
      current = byId.get(current) ?? null;
    }
  }
}

function compensationVisible(principal: Principal): boolean {
  return (
    isKnownClassification(principal.clearance) &&
    classificationRank(principal.clearance) >= classificationRank("RESTRICTED")
  );
}

/**
 * Identity/staffing fields vs pay.
 *
 * employees.classification is RESTRICTED because the stored row includes pay.
 * Applying filterByClearance to the whole row made Sector-OS consumption
 * vacuous: SECTOR_OPERATOR is CONFIDENTIAL, so they saw zero workforce even
 * with hcm:employee.read. Compensation stays RESTRICTED; identity is visible
 * once RBAC + tenant + entity pass, except HIGHLY_RESTRICTED rows and
 * unknown clearance (fail closed).
 */
function workforceIdentityVisible(principal: Principal, classification: string): boolean {
  if (!isKnownClassification(principal.clearance)) return false;
  if (classification === "HIGHLY_RESTRICTED") {
    return classificationRank(principal.clearance) >= classificationRank("HIGHLY_RESTRICTED");
  }
  return true;
}

function inEntityScope(principal: Principal, legalEntityId: string): boolean {
  return principal.entityScope.length === 0 || principal.entityScope.includes(legalEntityId);
}

/**
 * Canonical workforce read. The employing legal entity's tenant must be inside
 * the principal's tenant scope; the employee row may be held at the enterprise
 * tenant for shared HCM, but a mismatched/foreign employing entity is never
 * admitted. Entity scope, clearance and compensation gates are then applied.
 * Never returns an employee the principal cannot see.
 */
export async function listWorkforce(
  principal: Principal,
  options: { asOf?: string } = {},
): Promise<{
  records: WorkforceRecord[];
  suppressedCompensation: boolean;
  source: "people.employees";
  asOf: string;
}> {
  const decision = can(principal, "hcm:employee.read");
  if (!decision.allowed) {
    throw new HcmError("DENIED", decision.reason);
  }

  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  requireIsoDate(asOf, "asOf");

  const scope = await tenantScopeIds(principal);
  const rows = await db
    .select({
      employeeId: employees.id,
      employeeNo: employees.employeeNo,
      partyId: employees.partyId,
      displayName: parties.displayName,
      tenantId: employees.tenantId,
      legalEntityId: employees.legalEntityId,
      legalEntityName: legalEntities.legalName,
      legalEntityTenantId: legalEntities.tenantId,
      positionId: positions.id,
      positionTitle: positions.title,
      positionGrade: positions.grade,
      jobFamily: positions.jobFamily,
      orgUnitId: orgUnits.id,
      orgUnitName: orgUnits.name,
      managerEmployeeId: employees.managerEmployeeId,
      hireDate: employees.hireDate,
      endDate: employees.endDate,
      status: employees.status,
      employmentType: employees.employmentType,
      countryCode: employees.countryCode,
      classification: employees.classification,
      baseSalary: employees.baseSalary,
      salaryCurrency: employees.salaryCurrency,
    })
    .from(employees)
    .innerJoin(parties, eq(parties.id, employees.partyId))
    .innerJoin(legalEntities, eq(legalEntities.id, employees.legalEntityId))
    .leftJoin(positions, eq(positions.id, employees.positionId))
    .leftJoin(orgUnits, eq(orgUnits.id, positions.orgUnitId))
    .where(inArray(legalEntities.tenantId, scope))
    .orderBy(employees.employeeNo);

  const scoped = rows.filter((r) => inEntityScope(principal, r.legalEntityId));
  const visible = scoped.filter((r) => workforceIdentityVisible(principal, r.classification));
  const showPay = compensationVisible(principal);
  const logins = await globalUserIdsForParties(visible.map((r) => r.partyId));

  return {
    source: "people.employees",
    suppressedCompensation: !showPay,
    asOf,
    records: visible.map((r) => {
      const hireDate = isoDay(r.hireDate) ?? "";
      const endDate = isoDay(r.endDate);
      return {
        employeeId: r.employeeId,
        employeeNo: r.employeeNo,
        partyId: r.partyId,
        globalUserId: logins.get(r.partyId) ?? null,
        displayName: r.displayName,
        tenantId: r.tenantId,
        legalEntityId: r.legalEntityId,
        legalEntityName: r.legalEntityName,
        legalEntityTenantId: r.legalEntityTenantId,
        positionId: r.positionId,
        positionTitle: r.positionTitle,
        positionGrade: r.positionGrade,
        jobFamily: r.jobFamily,
        orgUnitId: r.orgUnitId,
        orgUnitName: r.orgUnitName,
        managerEmployeeId: r.managerEmployeeId,
        hireDate,
        endDate,
        status: r.status,
        employmentType: r.employmentType,
        countryCode: r.countryCode,
        classification: r.classification,
        temporalClass: classifyEmploymentTemporal({
          status: r.status,
          hireDate,
          endDate,
          asOf,
        }),
        baseSalary: showPay ? r.baseSalary : null,
        salaryCurrency: showPay ? r.salaryCurrency : null,
      };
    }),
  };
}

/** Employment events for employees the principal can already see. Not a second API. */
export async function listEmploymentHistory(
  principal: Principal,
  options: { asOf?: string } = {},
): Promise<EmploymentHistoryRecord[]> {
  const workforce = await listWorkforce(principal, options);
  if (workforce.records.length === 0) return [];
  const byId = new Map(workforce.records.map((r) => [r.employeeId, r]));
  const rows = await db
    .select()
    .from(employmentEvents)
    .where(inArray(employmentEvents.employeeId, [...byId.keys()]))
    .orderBy(employmentEvents.effectiveFrom);

  return rows.map((e) => {
    const emp = byId.get(e.employeeId);
    const effectiveFrom = isoDay(e.effectiveFrom) ?? "";
    return {
      eventId: e.id,
      employeeId: e.employeeId,
      employeeNo: emp?.employeeNo ?? e.employeeId,
      displayName: emp?.displayName ?? e.employeeId,
      eventType: e.eventType,
      effectiveFrom,
      temporalClass: classifyEmploymentEventTemporal(effectiveFrom, workforce.asOf),
      approvedBy: e.approvedBy,
      recordedBy: e.recordedBy,
    };
  });
}

/** Budgeted establishment inside the principal's tenant scope. */
export async function listEstablishment(principal: Principal): Promise<PositionRecord[]> {
  const decision = can(principal, "hcm:employee.read");
  if (!decision.allowed) {
    throw new HcmError("DENIED", decision.reason);
  }
  const scope = await tenantScopeIds(principal);
  const rows = await db.select().from(positions).where(inArray(positions.tenantId, scope)).orderBy(positions.code);
  return rows.map((p) => ({
    positionId: p.id,
    code: p.code,
    title: p.title,
    grade: p.grade,
    jobFamily: p.jobFamily,
    tenantId: p.tenantId,
    orgUnitId: p.orgUnitId,
    reportsToPositionId: p.reportsToPositionId,
    headcountBudget: p.headcountBudget,
    status: p.status,
  }));
}
