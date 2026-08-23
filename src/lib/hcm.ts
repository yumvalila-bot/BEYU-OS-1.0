/**
 * BEYU OS — HCM consumption service (Phase 9).
 *
 * HCM is the ONE employee/master. Sector OSs consume this service; they do not
 * hold an independent employee identity. This module is READ-ONLY: creating or
 * mutating an employee is a governed write that does not exist yet and must not
 * be invented here.
 *
 * Compensation is classified RESTRICTED and is stripped unless the principal's
 * clearance meets that ceiling — matching the existing HCM page.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees, legalEntities, parties, positions } from "@/db/schema";
import { can, filterByClearance, type Principal } from "./authz";
import { classificationRank } from "./constants";
import { tenantScopeIds } from "./tenant-scope";

export const HCM_VERSION = "hcm-1.0.0";

export type WorkforceRecord = {
  employeeId: string;
  employeeNo: string;
  partyId: string;
  displayName: string;
  tenantId: string;
  legalEntityId: string;
  legalEntityName: string;
  positionTitle: string | null;
  hireDate: string;
  status: string;
  employmentType: string;
  countryCode: string;
  classification: string;
  /** Present only when the principal's clearance is at least RESTRICTED. */
  baseSalary: string | null;
  salaryCurrency: string | null;
};

export class HcmError extends Error {
  constructor(
    readonly code: "DENIED" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "HcmError";
  }
}

/**
 * Canonical workforce read. Tenant-scoped, clearance-filtered, compensation-gated.
 * Never returns an employee the principal cannot see.
 */
export async function listWorkforce(principal: Principal): Promise<{
  records: WorkforceRecord[];
  suppressedCompensation: boolean;
  source: "people.employees";
}> {
  const decision = can(principal, "hcm:employee.read");
  if (!decision.allowed) {
    throw new HcmError("DENIED", decision.reason);
  }

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
      positionTitle: positions.title,
      hireDate: employees.hireDate,
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
    .where(inArray(employees.tenantId, scope))
    .orderBy(employees.employeeNo);

  const visible = filterByClearance(principal, rows);
  const showPay = classificationRank(principal.clearance) >= classificationRank("RESTRICTED");

  return {
    source: "people.employees",
    suppressedCompensation: !showPay,
    records: visible.map((r) => ({
      employeeId: r.employeeId,
      employeeNo: r.employeeNo,
      partyId: r.partyId,
      displayName: r.displayName,
      tenantId: r.tenantId,
      legalEntityId: r.legalEntityId,
      legalEntityName: r.legalEntityName,
      positionTitle: r.positionTitle,
      hireDate: r.hireDate,
      status: r.status,
      employmentType: r.employmentType,
      countryCode: r.countryCode,
      classification: r.classification,
      baseSalary: showPay ? r.baseSalary : null,
      salaryCurrency: showPay ? r.salaryCurrency : null,
    })),
  };
}
