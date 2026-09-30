import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../src/db";
import {
  auditLog,
  employees,
  employmentEvents,
  enterpriseEvents,
  parties,
  roleAssignments,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import type { PermissionCode } from "../../src/lib/constants";
import {
  buildRegistryGraph,
  enrollSubordinate,
  registerParty,
  reassignReportingLine,
} from "../../src/lib/admin/registry-service";
import {
  AdminGovernanceError,
  registerUser,
  transitionUserStatus,
} from "../../src/lib/admin/governance-service";

/**
 * BEYU REGISTRY — superior → subordinate enrollment & reporting lines.
 *
 * Proves the governed HCM relationship capability on top of the EXISTING
 * canonical primitives (no second engine, no duplicate identities):
 *   - enrollment composes registerParty / registerUser / registerEmployment /
 *     grantRole, each step re-authorizing itself server-side;
 *   - the enrolling superior becomes the default reporting line;
 *   - MANAGER ≠ ADMINISTRATOR — reporting lines mint no user, role or
 *     permission; role assignment obeys privileged AND clearance ceilings;
 *   - reassignment is acyclic, tenant-bounded, audited and evented.
 *
 * Authority mapping proven here (least privilege, seeded catalogue):
 *   GROUP_CEO       hcm:employee.manage + user/party register + role.grant
 *   HCM_DIRECTOR    hcm:employee.manage only (no user/role registration)
 *   PLATFORM_ADMIN  NO hcm:employee.manage (platform ≠ workforce manager)
 *   SECTOR_OPERATOR none of the above
 */

const T = { group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP") };
const ENTITY_HOLDINGS = "LEN_BEYU_HOLDINGS";
const TRACE = "TEST_SUBORDINATE_ENROLLMENT";

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

/**
 * Synthetic fixture: a superior holding exactly the four enrollment
 * capabilities at RESTRICTED clearance (as PLATFORM_ADMIN's clearance is) so
 * the clearance-ceiling rule can be proven — a HIGHLY_RESTRICTED role cannot
 * be handed down by a RESTRICTED enroller. No seeded role combines these
 * capabilities with a sub-maximal clearance, which is itself the point: the
 * catalogue is least-privilege by construction.
 */
async function restrictedEnroller(): Promise<Principal> {
  const admin = await principalFor("PLATFORM_ADMIN");
  return {
    ...admin,
    roles: [],
    permissions: new Set<PermissionCode>([
      "hcm:employee.manage",
      "identity:user.register",
      "identity:party.register",
      "identity:role.grant",
    ]),
    clearance: "RESTRICTED",
    delegatedPermissions: [],
    emergencyPermissions: [],
  };
}

const createdPartyIds: string[] = [];
const createdUserIds: string[] = [];
const createdEmployeeIds: string[] = [];
const createdAssignmentIds: string[] = [];
/**
 * Emails of partial enrollments created by refusal tests: enrollment composes
 * party → user → employment BEFORE the role step, so a ceiling/privilege
 * refusal leaves all three behind with no result object to capture their ids.
 * They are swept by email in afterAll so the shared database stays clean.
 */
const partialEnrollmentEmails: string[] = [];

async function refuse(fn: () => Promise<unknown>): Promise<AdminGovernanceError> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof AdminGovernanceError) return err;
    throw err;
  }
  throw new Error("expected a governed refusal, but the act succeeded");
}

const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

afterAll(async () => {
  if (partialEnrollmentEmails.length > 0) {
    const partialParties = await db
      .select({ id: parties.id })
      .from(parties)
      .where(inArray(parties.email, partialEnrollmentEmails));
    const partialPartyIds = partialParties.map((r) => r.id);
    if (partialPartyIds.length > 0) {
      const strayEmployees = await db
        .select({ id: employees.id })
        .from(employees)
        .where(inArray(employees.partyId, partialPartyIds));
      if (strayEmployees.length > 0) {
        await db.delete(employmentEvents).where(inArray(employmentEvents.employeeId, strayEmployees.map((r) => r.id)));
        await db.delete(employees).where(inArray(employees.id, strayEmployees.map((r) => r.id)));
      }
      await db.delete(users).where(inArray(users.partyId, partialPartyIds));
      await db.delete(parties).where(inArray(parties.id, partialPartyIds));
    }
  }
  if (createdEmployeeIds.length > 0) {
    await db.delete(employmentEvents).where(inArray(employmentEvents.employeeId, createdEmployeeIds));
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  }
  if (createdAssignmentIds.length > 0) {
    await db.delete(roleAssignments).where(inArray(roleAssignments.id, createdAssignmentIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  if (createdPartyIds.length > 0) {
    // Partial enrollments (ceiling / privilege refusals) leave party-scoped
    // employees behind; clear their history rows before the master rows.
    const [strayEmployeeRows] = await Promise.all([
      db.select({ id: employees.id }).from(employees).where(inArray(employees.partyId, createdPartyIds)),
    ]);
    const strayIds = strayEmployeeRows.map((r) => r.id);
    if (strayIds.length > 0) {
      await db.delete(employmentEvents).where(inArray(employmentEvents.employeeId, strayIds));
      await db.delete(employees).where(inArray(employees.id, strayIds));
    }
    await db.delete(users).where(inArray(users.partyId, createdPartyIds));
    await db.delete(parties).where(inArray(parties.id, createdPartyIds));
  }
});

describe("superior → subordinate enrollment", () => {
  it("POSITIVE: an authorized superior enrolls a new person — party + employment, reporting line defaults to the enroller", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    const result = await enrollSubordinate(
      ceo,
      {
        tenantId: T.group,
        legalEntityId: ENTITY_HOLDINGS,
        countryCode: "TZ",
        hireDate: "2026-09-30",
        employeeNo: `ENR-${tag}`,
        newPerson: { displayName: `Enrolled Person ${tag}`, email: `enrolled-${tag}@beyu.os`, countryCode: "TZ" },
        reason: "Governed subordinate enrollment suite fixture.",
      },
      TRACE,
    );
    createdPartyIds.push(result.partyId);
    createdEmployeeIds.push(result.employeeId);

    expect(result.partyReused).toBe(false);
    expect(result.userCreated).toBe(false);
    expect(result.userId).toBeNull();
    expect(result.roleAssignmentId).toBeNull();
    // The enrolling superior's own employee row is the reporting line.
    expect(result.managerEmployeeId).toBe("EMP_AMANI_BEYU");

    const [employee] = await db.select().from(employees).where(eq(employees.id, result.employeeId));
    expect(employee.managerEmployeeId).toBe("EMP_AMANI_BEYU");
    expect(employee.status).toBe("ACTIVE");
    expect(employee.partyId).toBe(result.partyId);

    // Enrollment mints NO user: a party ≠ a user (family-member style person).
    const [user] = await db.select().from(users).where(eq(users.partyId, result.partyId));
    expect(user).toBeUndefined();

    const audits = await db
      .select({ action: auditLog.action, authority: auditLog.authority })
      .from(auditLog)
      .where(eq(auditLog.objectId, result.employeeId));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(["EMPLOYMENT_REGISTERED", "SUBORDINATE_ENROLLED"]),
    );
    expect(audits.every((a) => a.authority === "hcm:employee.manage")).toBe(true);
  });

  it("POSITIVE: enrollment over an ACTIVE existing user assigns ONE ceiling-checked role — never a second identity", async () => {
    const admin = await principalFor("PLATFORM_ADMIN");
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    const email = `enrolled-user-${tag}@beyu.os`;

    // Canonical user registration + governed activation (existing lifecycle).
    const registered = await registerUser(
      admin,
      {
        email,
        displayName: `Enrolled User ${tag}`,
        primaryTenantId: T.group,
        countryCode: "TZ",
        reason: "Fixture user for the role-bearing enrollment assertion.",
      },
      TRACE,
    );
    createdPartyIds.push(registered.partyId);
    createdUserIds.push(registered.userId);
    await transitionUserStatus(admin, registered.userId, "activate", "Activate the fixture for enrollment.", TRACE);

    const result = await enrollSubordinate(
      ceo,
      {
        tenantId: T.group,
        legalEntityId: ENTITY_HOLDINGS,
        countryCode: "TZ",
        hireDate: "2026-09-30",
        employeeNo: `ENR-${tag}`,
        existingPartyId: registered.partyId,
        roleCode: "TENANT_MEMBER",
        reason: "Governed enrollment reusing the party and granting the membership-marker role.",
      },
      TRACE,
    );
    createdEmployeeIds.push(result.employeeId);
    if (result.roleAssignmentId) createdAssignmentIds.push(result.roleAssignmentId);

    expect(result.partyReused).toBe(true);
    expect(result.userId).toBe(registered.userId);
    expect(result.userCreated).toBe(false);
    expect(result.roleAssignmentId).toBeTruthy();
    // CEO enrolls inside a tenant where the CEO is an employee: self-reporting.
    expect(result.managerEmployeeId).toBe("EMP_AMANI_BEYU");

    // ONE party, ONE user — enrollment duplicated nothing.
    const userRows = await db.select().from(users).where(eq(users.partyId, result.partyId));
    expect(userRows).toHaveLength(1);

    const [assignment] = await db
      .select()
      .from(roleAssignments)
      .where(eq(roleAssignments.id, result.roleAssignmentId!));
    expect(assignment.userId).toBe(result.userId);
    expect(assignment.tenantId).toBe(T.group);
  });

  it("POSITIVE: an EXISTING canonical Party is reused — enrollment never duplicates a person", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    const party = await registerParty(
      ceo,
      {
        displayName: `Existing Person ${tag}`,
        email: `existing-${tag}@beyu.os`,
        countryCode: "TZ",
        primaryTenantId: T.group,
        reason: "Pre-existing party fixture for the reuse assertion.",
      },
      TRACE,
    );
    createdPartyIds.push(party.partyId);
    const before = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, party.partyId));

    const result = await enrollSubordinate(
      ceo,
      {
        tenantId: T.group,
        legalEntityId: ENTITY_HOLDINGS,
        countryCode: "TZ",
        hireDate: "2026-09-30",
        employeeNo: `ENR-${tag}`,
        existingPartyId: party.partyId,
        reason: "Governed enrollment reusing the existing canonical party.",
      },
      TRACE,
    );
    createdEmployeeIds.push(result.employeeId);

    expect(result.partyReused).toBe(true);
    expect(result.partyId).toBe(party.partyId);
    const after = await db.select({ id: parties.id }).from(parties).where(eq(parties.id, party.partyId));
    expect(after.length).toBe(before.length);
  });

  it("REFUSES an unauthorized actor — no capability, no enrollment (fail closed)", async () => {
    const sector = await principalFor("SARA_LEMA");
    const err = await refuse(() =>
      enrollSubordinate(
        sector,
        {
          tenantId: T.group,
          legalEntityId: ENTITY_HOLDINGS,
          countryCode: "TZ",
          hireDate: "2026-09-30",
          employeeNo: `ENR-${unique()}`,
          newPerson: { displayName: "Should Never Exist", email: `never-${unique()}@beyu.os` },
          reason: "Sector operator attempting workforce enrollment.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("FORBIDDEN");
    expect(err.status).toBe(403);

    // PLATFORM_ADMIN itself holds NO hcm:employee.manage — platform
    // administration is not workforce authority.
    const admin = await principalFor("PLATFORM_ADMIN");
    const platformErr = await refuse(() =>
      enrollSubordinate(
        admin,
        {
          tenantId: T.group,
          legalEntityId: ENTITY_HOLDINGS,
          countryCode: "TZ",
          hireDate: "2026-09-30",
          employeeNo: `ENR-${unique()}`,
          newPerson: { displayName: "Should Never Exist Either", email: `never2-${unique()}@beyu.os` },
          reason: "Platform administration attempting workforce enrollment.",
        },
        TRACE,
      ),
    );
    expect(platformErr.code).toBe("FORBIDDEN");
  });

  it("REFUSES self-enrollment — an enroller cannot become their own subordinate", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const byParty = await refuse(() =>
      enrollSubordinate(
        ceo,
        {
          tenantId: T.group,
          legalEntityId: ENTITY_HOLDINGS,
          countryCode: "TZ",
          hireDate: "2026-09-30",
          employeeNo: `ENR-${unique()}`,
          existingPartyId: ceo.partyId,
          reason: "Self-enrollment attempt through the existing party.",
        },
        TRACE,
      ),
    );
    expect(byParty.code).toBe("SELF_ENROLLMENT_REFUSED");

    const byEmail = await refuse(() =>
      enrollSubordinate(
        ceo,
        {
          tenantId: T.group,
          legalEntityId: ENTITY_HOLDINGS,
          countryCode: "TZ",
          hireDate: "2026-09-30",
          employeeNo: `ENR-${unique()}`,
          newPerson: { displayName: "Self By Email", email: ceo.email },
          reason: "Self-enrollment attempt through a new person email.",
        },
        TRACE,
      ),
    );
    expect(byEmail.code).toBe("SELF_ENROLLMENT_REFUSED");
  });

  it("REFUSES ambiguous targets — exactly one of existingPartyId or newPerson", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const base = {
      tenantId: T.group,
      legalEntityId: ENTITY_HOLDINGS,
      countryCode: "TZ",
      hireDate: "2026-09-30",
      employeeNo: `ENR-${unique()}`,
      reason: "Ambiguity guard assertion.",
    };
    const neither = await refuse(() => enrollSubordinate(ceo, base, TRACE));
    expect(neither.code).toBe("ENROLLMENT_TARGET_AMBIGUOUS");
    const both = await refuse(() =>
      enrollSubordinate(
        ceo,
        { ...base, existingPartyId: ceo.partyId, newPerson: { displayName: "Both", email: `both-${unique()}@beyu.os` } },
        TRACE,
      ),
    );
    expect(both.code).toBe("ENROLLMENT_TARGET_AMBIGUOUS");
  });

  it("REFUSES a role for a party without a canonical User — roles attach to Users, never bare Parties", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    const party = await registerParty(
      ceo,
      {
        displayName: `Roleless Person ${tag}`,
        email: `roleless-${tag}@beyu.os`,
        countryCode: "TZ",
        primaryTenantId: T.group,
        reason: "Fixture: party without a user for the role-requires-user guard.",
      },
      TRACE,
    );
    createdPartyIds.push(party.partyId);
    const err = await refuse(() =>
      enrollSubordinate(
        ceo,
        {
          tenantId: T.group,
          legalEntityId: ENTITY_HOLDINGS,
          countryCode: "TZ",
          hireDate: "2026-09-30",
          employeeNo: `ENR-${tag}`,
          existingPartyId: party.partyId,
          roleCode: "TENANT_MEMBER",
          reason: "Role assignment attempted against a userless party.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("ROLE_REQUIRES_USER");
  });

  it("ENFORCES the clearance ceiling — a RESTRICTED superior cannot assign a HIGHLY_RESTRICTED role", async () => {
    const enroller = await restrictedEnroller();
    const tag = unique();
    partialEnrollmentEmails.push(`ceiling-${tag}@beyu.os`);
    const err = await refuse(() =>
      enrollSubordinate(
        enroller,
        {
          tenantId: T.group,
          legalEntityId: ENTITY_HOLDINGS,
          countryCode: "TZ",
          hireDate: "2026-09-30",
          employeeNo: `ENR-${tag}`,
          newPerson: { displayName: `Ceiling Person ${tag}`, email: `ceiling-${tag}@beyu.os` },
          createUser: true,
          roleCode: "FAMILY_MEMBER_VIEW",
          reason: "Role above the enroller's clearance ceiling.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("ROLE_CEILING_EXCEEDED");
    expect(err.status).toBe(403);

    // The refusal is recorded in the hash-chained audit ledger.
    const [denied] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "SUBORDINATE_ENROLLED"), eq(auditLog.outcome, "DENIED")))
      .orderBy(auditLog.sequence)
      .limit(1);
    expect(denied).toBeTruthy();
  });

  it("ENFORCES the privileged-role ceiling through enrollment — only PLATFORM_ADMIN grants privileged roles", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    partialEnrollmentEmails.push(`priv-${tag}@beyu.os`);
    const err = await refuse(() =>
      enrollSubordinate(
        ceo,
        {
          tenantId: T.group,
          legalEntityId: ENTITY_HOLDINGS,
          countryCode: "TZ",
          hireDate: "2026-09-30",
          employeeNo: `ENR-${tag}`,
          newPerson: { displayName: `Privilege Person ${tag}`, email: `priv-${tag}@beyu.os` },
          createUser: true,
          roleCode: "PLATFORM_ADMIN",
          reason: "CEO attempting to mint a platform administrator via enrollment.",
        },
        TRACE,
      ),
    );
    expect(err.code).toBe("PRIVILEGED_ROLE_REFUSED");
  });
});

describe("superior / subordinate reporting lines", () => {
  it("POSITIVE: reassigns a reporting line with MANAGER_CHANGE history, audit and EMPLOYMENT_CHANGED event", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    const enrolled = await enrollSubordinate(
      ceo,
      {
        tenantId: T.group,
        legalEntityId: ENTITY_HOLDINGS,
        countryCode: "TZ",
        hireDate: "2026-09-30",
        employeeNo: `ENR-${tag}`,
        newPerson: { displayName: `Reassign Person ${tag}`, email: `reassign-${tag}@beyu.os` },
        reason: "Fixture employee for the reporting-line suite.",
      },
      TRACE,
    );
    createdPartyIds.push(enrolled.partyId);
    createdEmployeeIds.push(enrolled.employeeId);
    expect(enrolled.managerEmployeeId).toBe("EMP_AMANI_BEYU");

    const reassigned = await reassignReportingLine(
      ceo,
      {
        employeeId: enrolled.employeeId,
        managerEmployeeId: "EMP_DAUDI_MOSHI",
        reason: "Governed reporting-line reassignment to a same-entity manager.",
      },
      TRACE,
    );
    expect(reassigned.managerEmployeeId).toBe("EMP_DAUDI_MOSHI");

    const [employee] = await db.select().from(employees).where(eq(employees.id, enrolled.employeeId));
    expect(employee.managerEmployeeId).toBe("EMP_DAUDI_MOSHI");

    const [event] = await db
      .select()
      .from(employmentEvents)
      .where(
        and(eq(employmentEvents.employeeId, enrolled.employeeId), eq(employmentEvents.eventType, "MANAGER_CHANGE")),
      );
    expect(event).toBeTruthy();
    expect((event.details as Record<string, unknown>).newManagerEmployeeId).toBe("EMP_DAUDI_MOSHI");

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, enrolled.employeeId), eq(auditLog.action, "EMPLOYMENT_MANAGER_CHANGED")));
    expect(audits).toHaveLength(1);
    expect((audits[0].newValue as Record<string, unknown>).managerEmployeeId).toBe("EMP_DAUDI_MOSHI");

    const [enterprise] = await db
      .select()
      .from(enterpriseEvents)
      .where(and(eq(enterpriseEvents.type, "EMPLOYMENT_CHANGED"), eq(enterpriseEvents.subjectId, enrolled.employeeId)));
    expect(enterprise).toBeTruthy();
    expect(enterprise.classification).toBe("RESTRICTED");

    // Clearing the line is equally governed.
    const cleared = await reassignReportingLine(
      ceo,
      { employeeId: enrolled.employeeId, managerEmployeeId: null, reason: "Reporting line removed under governance." },
      TRACE,
    );
    expect(cleared.managerEmployeeId).toBeNull();
  });

  it("REFUSES cycles, self-management, cross-tenant managers, terminated employees and no-ops", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    const a = await enrollSubordinate(
      ceo,
      {
        tenantId: T.group,
        legalEntityId: ENTITY_HOLDINGS,
        countryCode: "TZ",
        hireDate: "2026-09-30",
        employeeNo: `ENR-A-${tag}`,
        newPerson: { displayName: `Cycle A ${tag}`, email: `cycle-a-${tag}@beyu.os` },
        reason: "Cycle-guard fixture A.",
      },
      TRACE,
    );
    const b = await enrollSubordinate(
      ceo,
      {
        tenantId: T.group,
        legalEntityId: ENTITY_HOLDINGS,
        countryCode: "TZ",
        hireDate: "2026-09-30",
        employeeNo: `ENR-B-${tag}`,
        newPerson: { displayName: `Cycle B ${tag}`, email: `cycle-b-${tag}@beyu.os` },
        reason: "Cycle-guard fixture B.",
      },
      TRACE,
    );
    createdPartyIds.push(a.partyId, b.partyId);
    createdEmployeeIds.push(a.employeeId, b.employeeId);

    // A reports to the CEO, so making the CEO report to A must be refused.
    const cycle = await refuse(() =>
      reassignReportingLine(
        ceo,
        { employeeId: "EMP_AMANI_BEYU", managerEmployeeId: a.employeeId, reason: "Attempted reporting cycle." },
        TRACE,
      ),
    );
    expect(cycle.code).toBe("REPORTING_CYCLE_REFUSED");

    const self = await refuse(() =>
      reassignReportingLine(
        ceo,
        { employeeId: b.employeeId, managerEmployeeId: b.employeeId, reason: "Attempted self-management." },
        TRACE,
      ),
    );
    expect(self.code).toBe("SELF_MANAGEMENT_REFUSED");

    // Cross-tenant manager (foundation employee) is refused — isolation holds.
    const crossTenant = await refuse(() =>
      reassignReportingLine(
        ceo,
        { employeeId: b.employeeId, managerEmployeeId: "EMP_FATMA_JUMA", reason: "Attempted cross-tenant manager." },
        TRACE,
      ),
    );
    expect(crossTenant.code).toBe("MANAGER_OUT_OF_SCOPE");

    // Same-tenant but cross-ENTITY manager is refused by the same canonical
    // invariant — a manager edge must never cross either boundary.
    const crossEntity = await refuse(() =>
      reassignReportingLine(
        ceo,
        { employeeId: b.employeeId, managerEmployeeId: "EMP_ASHA_NDULU", reason: "Attempted cross-entity manager." },
        TRACE,
      ),
    );
    expect(crossEntity.code).toBe("MANAGER_OUT_OF_SCOPE");

    // Identical reassignment is a controlled no-op refusal.
    const noop = await refuse(() =>
      reassignReportingLine(
        ceo,
        { employeeId: a.employeeId, managerEmployeeId: "EMP_AMANI_BEYU", reason: "Identical reassignment attempt." },
        TRACE,
      ),
    );
    expect(noop.code).toBe("MANAGER_UNCHANGED");

    // Terminated employment refuses reporting-line governance.
    await db.update(employees).set({ status: "TERMINATED" }).where(eq(employees.id, b.employeeId));
    const terminated = await refuse(() =>
      reassignReportingLine(
        ceo,
        { employeeId: b.employeeId, managerEmployeeId: null, reason: "Attempted change on terminated employment." },
        TRACE,
      ),
    );
    expect(terminated.code).toBe("EMPLOYEE_NOT_ACTIVE");

    // An actor without the capability cannot touch reporting lines.
    const sector = await principalFor("SARA_LEMA");
    const forbidden = await refuse(() =>
      reassignReportingLine(
        sector,
        { employeeId: a.employeeId, managerEmployeeId: null, reason: "Sector operator attempting a reassignment." },
        TRACE,
      ),
    );
    expect(forbidden.code).toBe("FORBIDDEN");
  });
});

describe("relationship graph — reporting lines", () => {
  it("emits reportsTo edges for visible reporting lines and hides them without hcm:employee.read", async () => {
    const ceo = await principalFor("AMANI_BEYU");
    const tag = unique();
    const enrolled = await enrollSubordinate(
      ceo,
      {
        tenantId: T.group,
        legalEntityId: ENTITY_HOLDINGS,
        countryCode: "TZ",
        hireDate: "2026-09-30",
        employeeNo: `ENR-G-${tag}`,
        newPerson: { displayName: `Graph Person ${tag}`, email: `graph-${tag}@beyu.os` },
        reason: "Fixture for the reporting-line graph assertion.",
      },
      TRACE,
    );
    createdPartyIds.push(enrolled.partyId);
    createdEmployeeIds.push(enrolled.employeeId);

    const graph = await buildRegistryGraph(ceo);
    const reporting = graph.edges.find(
      (e) => e.type === "reportsTo" && e.from === enrolled.partyId && e.to === ceo.partyId,
    );
    expect(reporting).toBeTruthy();

    // FAMILY_OFFICE_PRINCIPAL holds family:member.read but NO hcm:employee.read:
    // employment and reporting edges must not exist for that principal.
    const viewer = await principalFor("NEEMA_BEYU");
    const viewerGraph = await buildRegistryGraph(viewer);
    expect(viewerGraph.edges.some((e) => e.type === "reportsTo")).toBe(false);
    expect(viewerGraph.edges.some((e) => e.type === "personWorksFor")).toBe(false);
  });
});
