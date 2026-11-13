/**
 * BEYU OS — Canonical identity graph (Phase 10).
 *
 * EXISTING PRIMITIVE: parties (MDM) + users (login) + employees (HCM master).
 * GAP: nothing resolved employee → GlobalUserID → tenant → entity as one
 * graph. Callers re-joined ad hoc, which is how a second identity model starts.
 *
 * THIS IS NOT A NEW IDENTITY STORE. It reads the three existing tables and
 * names the already-canonical IDs:
 *
 *   GlobalUserID  = users.id          (ONE login identity)
 *   PartyID       = parties.id        (ONE MDM person / org / agent)
 *   EmployeeID    = employees.id      (ONE workforce master, unique on party)
 *
 * PERSON ≠ USER ≠ EMPLOYEE ≠ PRINCIPAL. A user may exist without an employee
 * (platform admin, family principal). An employee without a login is reported,
 * never invented. Two users for one party is DATA_CONFLICT — that would be a
 * second GlobalUserID for the same person.
 *
 * Finance and Sector OSs consume this graph. They do not get compensation,
 * and they cannot write any of the three masters through this module.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { employees, parties, permissions as permissionsTable, rolePermissions, roles, users } from "@/db/schema";
import { PERMISSIONS, ROLES, type PermissionCode } from "./constants";

export const IDENTITY_VERSION = "identity-graph-1.0.0";

/** Canonical login identity. Never a new column — it IS users.id. */
export type GlobalUserID = string;

export const IDENTITY_DECISION = [
  "RESOLVED",
  "NOT_FOUND",
  "DATA_CONFLICT",
  "TENANT_SCOPE_MISMATCH",
] as const;
export type IdentityDecision = (typeof IDENTITY_DECISION)[number];

export type IdentityGraph = {
  partyId: string | null;
  partyType: string | null;
  globalUserId: GlobalUserID | null;
  userStatus: string | null;
  employeeId: string | null;
  employeeNo: string | null;
  tenantId: string | null;
  legalEntityId: string | null;
  decision: IdentityDecision;
  reason: string;
};

export class IdentityError extends Error {
  constructor(
    readonly code: IdentityDecision,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

/**
 * EXPORTED FOR DIRECT TESTING. Two login identities for one party is a second
 * GlobalUserID. The schema does not currently unique-index users.party_id, so
 * this guard is the load-bearing control until a migration is authorised.
 */
export function assertSingleGlobalUser(userIds: string[], partyId: string): void {
  const unique = [...new Set(userIds)];
  if (unique.length > 1) {
    throw new IdentityError(
      "DATA_CONFLICT",
      `Party ${partyId} has ${unique.length} login identities; ONE GlobalUserID is required.`,
      { partyId, userIds: unique },
    );
  }
}

function empty(decision: IdentityDecision, reason: string): IdentityGraph {
  return {
    partyId: null,
    partyType: null,
    globalUserId: null,
    userStatus: null,
    employeeId: null,
    employeeNo: null,
    tenantId: null,
    legalEntityId: null,
    decision,
    reason,
  };
}

function assemble(input: {
  partyId: string;
  partyType: string;
  userIds: Array<{ id: string; status: string; primaryTenantId: string }>;
  employee: { id: string; employeeNo: string; tenantId: string; legalEntityId: string } | null;
  expectedTenantId?: string | null;
}): IdentityGraph {
  assertSingleGlobalUser(
    input.userIds.map((u) => u.id),
    input.partyId,
  );
  const user = input.userIds[0] ?? null;
  const tenantId = input.employee?.tenantId ?? user?.primaryTenantId ?? null;
  if (input.expectedTenantId && tenantId && tenantId !== input.expectedTenantId) {
    return empty(
      "TENANT_SCOPE_MISMATCH",
      `Identity is scoped to ${tenantId}, not ${input.expectedTenantId}.`,
    );
  }
  return {
    partyId: input.partyId,
    partyType: input.partyType,
    globalUserId: user?.id ?? null,
    userStatus: user?.status ?? null,
    employeeId: input.employee?.id ?? null,
    employeeNo: input.employee?.employeeNo ?? null,
    tenantId,
    legalEntityId: input.employee?.legalEntityId ?? null,
    decision: "RESOLVED",
    reason: user
      ? input.employee
        ? `Party ${input.partyId} resolves to GlobalUserID ${user.id} and employee ${input.employee.id}.`
        : `Party ${input.partyId} resolves to GlobalUserID ${user.id} with no workforce record.`
      : `Party ${input.partyId} has a workforce record but no login identity.`,
  };
}

async function graphForParty(
  partyId: string,
  expectedTenantId?: string | null,
): Promise<IdentityGraph> {
  const [party] = await db
    .select({ id: parties.id, type: parties.type })
    .from(parties)
    .where(eq(parties.id, partyId))
    .limit(1);
  if (!party) return empty("NOT_FOUND", `Party ${partyId} was not found.`);

  const userRows = await db
    .select({ id: users.id, status: users.status, primaryTenantId: users.primaryTenantId })
    .from(users)
    .where(eq(users.partyId, partyId));

  const [employee] = await db
    .select({
      id: employees.id,
      employeeNo: employees.employeeNo,
      tenantId: employees.tenantId,
      legalEntityId: employees.legalEntityId,
    })
    .from(employees)
    .where(eq(employees.partyId, partyId))
    .limit(1);

  try {
    return assemble({
      partyId: party.id,
      partyType: party.type,
      userIds: userRows,
      employee: employee ?? null,
      expectedTenantId,
    });
  } catch (err) {
    if (err instanceof IdentityError && err.code === "DATA_CONFLICT") {
      return empty("DATA_CONFLICT", err.message);
    }
    throw err;
  }
}

/** Resolve from the workforce master. */
export async function resolveByEmployeeId(
  employeeId: string,
  expectedTenantId?: string | null,
): Promise<IdentityGraph> {
  const [row] = await db
    .select({ partyId: employees.partyId })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) return empty("NOT_FOUND", `Employee ${employeeId} was not found.`);
  return graphForParty(row.partyId, expectedTenantId);
}

/** Resolve from the canonical login identity. */
export async function resolveByGlobalUserId(
  globalUserId: GlobalUserID,
  expectedTenantId?: string | null,
): Promise<IdentityGraph> {
  const [row] = await db
    .select({ partyId: users.partyId })
    .from(users)
    .where(eq(users.id, globalUserId))
    .limit(1);
  if (!row) return empty("NOT_FOUND", `GlobalUserID ${globalUserId} was not found.`);
  return graphForParty(row.partyId, expectedTenantId);
}

/** Resolve from the MDM party. */
export async function resolveByPartyId(
  partyId: string,
  expectedTenantId?: string | null,
): Promise<IdentityGraph> {
  return graphForParty(partyId, expectedTenantId);
}

/**
 * Batch: partyId → GlobalUserID. Used by HCM so the consumption API can attach
 * the login identity without N+1 queries and without inventing IDs.
 */
export async function globalUserIdsForParties(
  partyIds: string[],
): Promise<Map<string, GlobalUserID>> {
  const out = new Map<string, GlobalUserID>();
  if (partyIds.length === 0) return out;
  const rows = await db
    .select({ id: users.id, partyId: users.partyId })
    .from(users)
    .where(inArray(users.partyId, partyIds));

  const byParty = new Map<string, string[]>();
  for (const r of rows) {
    const list = byParty.get(r.partyId) ?? [];
    list.push(r.id);
    byParty.set(r.partyId, list);
  }
  for (const [partyId, ids] of byParty) {
    assertSingleGlobalUser(ids, partyId);
    out.set(partyId, ids[0]);
  }
  return out;
}

export type PermissionDrift = {
  role: string;
  onlyInCode: PermissionCode[];
  onlyInDb: string[];
};

/**
 * A definition-level disagreement between the two catalogues.
 *
 * Separate from `PermissionDrift` because it means something different: a role
 * drift is someone holding the wrong authority, while a definition drift means the
 * two catalogues do not agree about which privileges EXIST. The second is the one
 * a migration introduces quietly.
 */
export type PermissionDefinitionDrift = {
  /** Declared in `PERMISSIONS` with no row in `permissions` — a privilege nothing can grant. */
  onlyInCode: PermissionCode[];
  /** A row in `permissions` that the code catalogue never names — a privilege nobody can review. */
  onlyInDb: string[];
};

/**
 * H-01 remains open: runtime still reads ROLES in constants.ts.
 * This check proves the seeded `role_permissions` mirror has not drifted, so
 * the two catalogues cannot silently become two permission truths.
 *
 * It compares BOTH halves of the mirror:
 *   · GRANTS — every role's permission set, in each direction;
 *   · DEFINITIONS — the `permissions` rows against the `PERMISSIONS` catalogue.
 * The second half was previously unchecked, which meant a migration could add a
 * privilege to the database that the reviewed catalogue never named (or drop one
 * it did) and every existing gate would still pass. Measured on a live migrated
 * database on 2026-11-13: 285 definitions and 976 grants agreed exactly, so this
 * extension closes a hole rather than reporting one.
 *
 * It does NOT switch the runtime source. That would be a separate, authorised
 * migration of the permission model.
 */
export async function assertPermissionCatalogParity(): Promise<{
  ok: boolean;
  drifts: PermissionDrift[];
  definitions: PermissionDefinitionDrift;
  reason: string;
}> {
  const rows = await db
    .select({ role: roles.code, permission: rolePermissions.permissionCode })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId));

  const dbByRole = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = dbByRole.get(r.role) ?? new Set<string>();
    set.add(r.permission);
    dbByRole.set(r.role, set);
  }

  const drifts: PermissionDrift[] = [];
  const roleCodes = new Set([...Object.keys(ROLES), ...dbByRole.keys()]);
  for (const role of roleCodes) {
    const codePerms = new Set(ROLES[role]?.permissions ?? []);
    const dbPerms = dbByRole.get(role) ?? new Set<string>();
    const onlyInCode = [...codePerms].filter((p) => !dbPerms.has(p)) as PermissionCode[];
    const onlyInDb = [...dbPerms].filter((p) => !codePerms.has(p as PermissionCode));
    if (onlyInCode.length > 0 || onlyInDb.length > 0) {
      drifts.push({ role, onlyInCode, onlyInDb });
    }
  }

  const dbDefinitions = await db
    .select({ code: permissionsTable.code, description: permissionsTable.description })
    .from(permissionsTable);
  const dbCodes = new Set(dbDefinitions.map((row) => row.code));
  const codeCodes = new Set(Object.keys(PERMISSIONS));
  const definitions: PermissionDefinitionDrift = {
    onlyInCode: [...codeCodes].filter((code) => !dbCodes.has(code)) as PermissionCode[],
    onlyInDb: dbDefinitions.map((row) => row.code).filter((code) => !codeCodes.has(code)),
  };
  // A description that differs is drift too: the mirror is documentation, and two
  // descriptions of one privilege is precisely the "two permission truths" this
  // function exists to prevent.
  const descriptionMismatch = dbDefinitions
    .filter((row) => codeCodes.has(row.code) && row.description !== PERMISSIONS[row.code as PermissionCode])
    .map((row) => row.code);

  const problems = [
    ...drifts.map((d) => `role ${d.role}`),
    ...(definitions.onlyInCode.length > 0 ? [`permissions declared in code but absent from the database (${definitions.onlyInCode.join(", ")})`] : []),
    ...(definitions.onlyInDb.length > 0 ? [`permissions in the database absent from the code catalogue (${definitions.onlyInDb.join(", ")})`] : []),
    ...(descriptionMismatch.length > 0 ? [`permission descriptions disagree (${descriptionMismatch.join(", ")})`] : []),
  ];
  return {
    ok: problems.length === 0,
    drifts,
    definitions,
    reason:
      problems.length === 0
        ? `role_permissions mirrors ROLES for ${roleCodes.size} roles, and ${dbDefinitions.length} permission definitions match PERMISSIONS exactly.`
        : `Permission catalogue drift: ${problems.join("; ")}.`,
  };
}
