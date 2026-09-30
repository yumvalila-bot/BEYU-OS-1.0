import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  auditLog,
  employees,
  employmentEvents,
  families,
  familyMembers,
  legalEntities,
  orgUnits,
  ownershipRecords,
  parties,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import {
  registerEmployment,
  registerLegalEntity as registerEntity,
  registerOrgUnit,
  registerOwnership,
  registerParty,
} from "../../src/lib/admin/registry-service";
import { AdminGovernanceError } from "../../src/lib/admin/governance-service";

/**
 * BEYU REGISTRY — duplicate prevention with a controlled conflict workflow.
 *
 * NEVER a silent merge and NEVER a silent second identity: every duplicate
 * path refuses with a specific 409 code naming the existing record, appends a
 * DENIED audit refusal, and inserts nothing.
 */

const T = { group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP") };
const TRACE = "TEST_REGISTRY_DUPLICATE_CONFLICT";

async function principalFor(userKey: string): Promise<Principal> {
  const userId = fixedId(ID_PREFIX.user, userKey);
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error(`seed user ${userKey} missing — run npm run seed`);
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roleCodes = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: "BEYU-GROUP",
    tenantType: "ENTERPRISE",
    roles: roleCodes,
    permissions: permissionsForRoles(roleCodes),
    clearance: clearanceForRoles(roleCodes),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
    delegatedPermissions: [],
  };
}

async function refuse(fn: () => Promise<unknown>): Promise<AdminGovernanceError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AdminGovernanceError) return err;
    throw err;
  }
  throw new Error("expected a governed refusal, but the act succeeded");
}

const createdPartyIds: string[] = [];
const createdFamilyIds: string[] = [];
const createdEntityIds: string[] = [];
const createdUnitIds: string[] = [];
const createdOwnershipIds: string[] = [];
const createdEmployeeIds: string[] = [];

afterAll(async () => {
  if (createdEmployeeIds.length > 0) {
    await db.delete(employmentEvents).where(inArray(employmentEvents.employeeId, createdEmployeeIds));
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  }
  if (createdOwnershipIds.length > 0) {
    await db.delete(ownershipRecords).where(inArray(ownershipRecords.id, createdOwnershipIds));
  }
  if (createdUnitIds.length > 0) {
    await db.delete(orgUnits).where(inArray(orgUnits.id, createdUnitIds));
  }
  if (createdEntityIds.length > 0) {
    await db.delete(legalEntities).where(inArray(legalEntities.id, createdEntityIds));
  }
  if (createdFamilyIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.familyId, createdFamilyIds));
    await db.delete(families).where(inArray(families.id, createdFamilyIds));
  }
  if (createdPartyIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.partyId, createdPartyIds));
    await db.delete(employees).where(inArray(employees.partyId, createdPartyIds));
    await db.delete(parties).where(inArray(parties.id, createdPartyIds));
  }
});

async function deniedAuditCount(reasonPrefix: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(
      sql`${auditLog.outcome} = 'DENIED' AND ${auditLog.action} = 'PARTY_REGISTERED' AND ${auditLog.reason} LIKE ${reasonPrefix + "%"}`,
    );
  return Number(n);
}

describe("BEYU Registry — controlled duplicate/conflict workflow", () => {
  it("a duplicate email is a 409 conflict naming the existing Party — never a second identity", async () => {
    const actor = await principalFor("PLATFORM_ADMIN");
    const email = `dup-${Date.now()}@beyu.invalid`;

    const first = await registerParty(
      actor,
      { displayName: "Duplicate Probe", email, primaryTenantId: T.group, reason: "First controlled person registration." },
      TRACE,
    );
    createdPartyIds.push(first.partyId);

    const auditBefore = await deniedAuditCount("DUPLICATE_PARTY_EMAIL");

    const err = await refuse(() =>
      registerParty(
        actor,
        { displayName: "Duplicate Probe Again", email, primaryTenantId: T.group, reason: "Duplicate attempt must be refused." },
        TRACE,
      ),
    );
    expect(err.code).toBe("DUPLICATE_PARTY");
    expect(err.status).toBe(409);
    expect((err.details as { existingPartyId?: string })?.existingPartyId).toBe(first.partyId);

    // Exactly ONE party carries this email — no silent second identity.
    const rows = await db
      .select({ id: parties.id })
      .from(parties)
      .where(sql`lower(${parties.email}) = ${email}`);
    expect(rows).toHaveLength(1);

    // The refusal itself is audited (DENIED), fail-open only on the ledger write.
    const auditAfter = await deniedAuditCount("DUPLICATE_PARTY_EMAIL");
    expect(auditAfter).toBeGreaterThan(auditBefore);
  });

  it("name + birth date duplicates are surfaced as candidates, not merged", async () => {
    const actor = await principalFor("PLATFORM_ADMIN");
    const birth = "1990-04-12";
    const name = `Birth Dup ${Date.now().toString(36)}`;
    const first = await registerParty(
      actor,
      { displayName: name, birthDate: birth, primaryTenantId: T.group, reason: "Person registration with birth date." },
      TRACE,
    );
    createdPartyIds.push(first.partyId);

    const err = await refuse(() =>
      registerParty(
        actor,
        { displayName: name, birthDate: birth, primaryTenantId: T.group, reason: "Same name and birth date attempt." },
        TRACE,
      ),
    );
    expect(err.code).toBe("DUPLICATE_PARTY");
    expect(err.status).toBe(409);
    const details = err.details as { conflictType?: string; candidates?: Array<{ id: string }> };
    expect(details.conflictType).toBe("DUPLICATE_NAME_BIRTHDATE");
    expect(details.candidates?.some((c) => c.id === first.partyId)).toBe(true);
  });

  it("entity code and registration-number duplicates are controlled conflicts", async () => {
    const actor = await principalFor("AMANI_BEYU"); // organization:entity.manage = GROUP_CEO
    const code = `DUP-${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
    const regNo = `REG-${Date.now().toString(36).toUpperCase()}`;
    const first = await registerEntity(
      actor,
      {
        tenantId: T.group,
        code,
        legalName: "Duplicate Probe Holdings",
        entityType: "HOLDING",
        countryCode: "TZ",
        registrationNumber: regNo,
        reason: "First governed entity registration.",
      },
      TRACE,
    );
    createdEntityIds.push(first.legalEntityId);

    const dupCode = await refuse(() =>
      registerEntity(
        actor,
        {
          tenantId: T.group,
          code,
          legalName: "Duplicate Code Attempt",
          entityType: "SUBSIDIARY",
          countryCode: "TZ",
          reason: "Duplicate entity code attempt.",
        },
        TRACE,
      ),
    );
    expect(dupCode.code).toBe("ENTITY_CODE_EXISTS");
    expect(dupCode.status).toBe(409);

    const dupReg = await refuse(() =>
      registerEntity(
        actor,
        {
          tenantId: T.group,
          code: `${code}-B`.slice(0, 40),
          legalName: "Duplicate Registration Attempt",
          entityType: "SUBSIDIARY",
          countryCode: "TZ",
          registrationNumber: regNo,
          reason: "Duplicate registration number attempt.",
        },
        TRACE,
      ),
    );
    expect(dupReg.code).toBe("REGISTRATION_NUMBER_EXISTS");
    expect(dupReg.status).toBe(409);
  });

  it("business unit codes are unique — duplicates refuse with the existing unit named", async () => {
    const actor = await principalFor("PLATFORM_ADMIN");
    const [entityId] = createdEntityIds;
    const code = `BIZ-${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
    const first = await registerOrgUnit(
      actor,
      { tenantId: T.group, legalEntityId: entityId!, code, name: "Duplicate Probe Unit", unitType: "DIVISION", reason: "First governed business registration." },
      TRACE,
    );
    createdUnitIds.push(first.orgUnitId);

    const err = await refuse(() =>
      registerOrgUnit(
        actor,
        { tenantId: T.group, legalEntityId: entityId!, code, name: "Duplicate Unit", unitType: "TEAM", reason: "Duplicate business code attempt." },
        TRACE,
      ),
    );
    expect(err.code).toBe("BUSINESS_CODE_EXISTS");
    expect(err.status).toBe(409);
    expect((err.details as { existingUnitId?: string })?.existingUnitId).toBe(first.orgUnitId);
  });

  it("overlapping ownership refuses; a later non-overlapping period succeeds — history is never overwritten", async () => {
    const actor = await principalFor("AMANI_BEYU"); // ownership.manage = GROUP_CEO (MFA satisfied)
    const owner = createdPartyIds[0]!;
    const owned = createdEntityIds[0]!;

    const first = await registerOwnership(
      actor,
      {
        tenantId: T.group,
        ownedEntityId: owned,
        ownerPartyId: owner,
        ownershipType: "DIRECT",
        economicPct: 40,
        votingPct: 40,
        effectiveFrom: "2024-01-01",
        effectiveTo: "2026-12-31",
        provenance: "Share certificate DUP-A.",
        reason: "First governed ownership record.",
      },
      TRACE,
    );
    createdOwnershipIds.push(first.ownershipId);

    const overlap = await refuse(() =>
      registerOwnership(
        actor,
        {
          tenantId: T.group,
          ownedEntityId: owned,
          ownerPartyId: owner,
          ownershipType: "DIRECT",
          economicPct: 50,
          votingPct: 50,
          effectiveFrom: "2026-06-01",
          provenance: "Overlapping transfer attempt.",
          reason: "Overlapping period must be refused.",
        },
        TRACE,
      ),
    );
    expect(overlap.code).toBe("OWNERSHIP_EXISTS");
    expect(overlap.status).toBe(409);

    const next = await registerOwnership(
      actor,
      {
        tenantId: T.group,
        ownedEntityId: owned,
        ownerPartyId: owner,
        ownershipType: "DIRECT",
        economicPct: 50,
        votingPct: 50,
        effectiveFrom: "2027-01-01",
        provenance: "Share certificate DUP-B.",
        reason: "Successor period after the closed one.",
      },
      TRACE,
    );
    createdOwnershipIds.push(next.ownershipId);
    expect(next.ownershipId).not.toBe(first.ownershipId);
  });

  it("employment duplicates refuse for both the person and the employee number", async () => {
    const actor = await principalFor("ASHA_NDULU"); // hcm:employee.manage
    const admin = await principalFor("PLATFORM_ADMIN"); // identity:party.register
    const [entityId] = createdEntityIds;
    const person = await registerParty(
      admin,
      { displayName: "Employment Probe", primaryTenantId: T.group, reason: "Person for governed employment registration." },
      TRACE,
    );
    createdPartyIds.push(person.partyId);
    const employeeNo = `EMP-DUP-${Date.now().toString(36).toUpperCase()}`.slice(0, 40);

    const first = await registerEmployment(
      actor,
      {
        tenantId: T.group,
        partyId: person.partyId,
        legalEntityId: entityId!,
        employeeNo,
        hireDate: "2026-01-05",
        countryCode: "TZ",
        reason: "First governed employment registration.",
      },
      TRACE,
    );
    createdEmployeeIds.push(first.employeeId);

    // The HIRE event exists — employee + event are one atomic act.
    const [hireEvent] = await db
      .select()
      .from(employmentEvents)
      .where(eq(employmentEvents.employeeId, first.employeeId));
    expect(hireEvent?.eventType).toBe("HIRE");

    const dupPerson = await refuse(() =>
      registerEmployment(
        actor,
        {
          tenantId: T.group,
          partyId: person.partyId,
          legalEntityId: entityId!,
          employeeNo: `${employeeNo}-2`.slice(0, 40),
          hireDate: "2026-02-01",
          countryCode: "TZ",
          reason: "Same person attempt.",
        },
        TRACE,
      ),
    );
    expect(dupPerson.code).toBe("EMPLOYMENT_EXISTS");
    expect(dupPerson.status).toBe(409);

    const other = await registerParty(
      admin,
      { displayName: "Employment Probe Two", primaryTenantId: T.group, reason: "Second person for employee-number conflict." },
      TRACE,
    );
    createdPartyIds.push(other.partyId);
    const dupNo = await refuse(() =>
      registerEmployment(
        actor,
        {
          tenantId: T.group,
          partyId: other.partyId,
          legalEntityId: entityId!,
          employeeNo,
          hireDate: "2026-03-01",
          countryCode: "TZ",
          reason: "Same employee number attempt.",
        },
        TRACE,
      ),
    );
    expect(dupNo.code).toBe("EMPLOYEE_NO_EXISTS");
    expect(dupNo.status).toBe(409);
  });
});
