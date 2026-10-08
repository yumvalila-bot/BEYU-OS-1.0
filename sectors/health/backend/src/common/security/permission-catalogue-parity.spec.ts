/**
 * Permission-catalogue parity.
 *
 * Two authorities exist for one question — "what may role X do?":
 *   1. `src/common/security/permissions.ts` (ROLE_DEFINITIONS), which the
 *      PermissionsGuard consults for every request;
 *   2. `beyu_identity.role_permissions`, seeded by migrations 001 and 045 and
 *      joined at login to produce a user's explicit grants.
 *
 * If they drift, one of two bad things happens: the guard grants something the
 * catalogue never authorised, or the catalogue promises something the database
 * will not back. This spec reads the REAL seeded database (the same migrations
 * production applies) and fails on drift in either direction.
 *
 * The comparison is deliberately asymmetric on one point: a role that exists in
 * the database but not in ROLE_DEFINITIONS is reported as an unmodelled role
 * (deny-by-default at the guard is safe, but it must be a KNOWN state, not an
 * accident), while a permission present in the database and absent from the
 * `Permission` union is always a failure — the type union is the whole set of
 * strings a route is allowed to name.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../testing/test-bed";
import {
  ROLE_DEFINITIONS,
  Permission,
  RoleId,
  permissionsForRole,
} from "./permissions";

describe("permission catalogue parity (TS ROLE_DEFINITIONS ↔ seeded DB)", () => {
  let bed: TestBed;
  let dbRoleIds: string[] = [];
  let dbPermissions: string[] = [];
  let grants: Map<string, Set<string>> = new Map();

  beforeAll(async () => {
    bed = await buildTestBed();
    await bed.run(async () => {
      const roles = await (bed.conn as any).query(
        `SELECT role_id FROM beyu_identity.roles ORDER BY role_id`,
      );
      dbRoleIds = roles.map((r: any) => r.role_id);
      const perms = await (bed.conn as any).query(
        `SELECT permission_id FROM beyu_identity.permissions ORDER BY 1`,
      );
      dbPermissions = perms.map((r: any) => r.permission_id);
      const rows = await (bed.conn as any).query(
        `SELECT role_id, permission_id FROM beyu_identity.role_permissions`,
      );
      grants = new Map();
      for (const r of rows as any[]) {
        if (!grants.has(r.role_id)) grants.set(r.role_id, new Set());
        grants.get(r.role_id)!.add(r.permission_id);
      }
    });
  }, 120_000);

  const tsPermissions = new Set<string>(
    ROLE_DEFINITIONS.flatMap((r) => r.permissions as string[]),
  );

  it("every role in the canonical catalogue exists in the seeded role table", () => {
    const missing = ROLE_DEFINITIONS.map((r) => r.id).filter(
      (id) => !dbRoleIds.includes(id),
    );
    expect(missing).toEqual([]);
  });

  it("every seeded role is modelled in the canonical catalogue", () => {
    const modelled = new Set(
      ROLE_DEFINITIONS.map((r) => r.id as RoleId as string),
    );
    const unmodelled = dbRoleIds.filter((id) => !modelled.has(id));
    expect(unmodelled).toEqual([]);
  });

  it("every permission a role holds is declared in the Permission union", () => {
    const undeclared: string[] = [];
    for (const [role, set] of grants) {
      for (const p of set) {
        if (!tsPermissions.has(p) && !dbPermissions.includes(p))
          undeclared.push(`${role} → ${p}`);
      }
    }
    // A grant pointing at a permission row that does not exist would already
    // have failed the FK, so this is really the "granted but not catalogued"
    // case: the guard could never express it and no route could require it.
    expect(undeclared).toEqual([]);
  });

  it("the database does not grant a role something its catalogue forbids", () => {
    const drift: string[] = [];
    for (const def of ROLE_DEFINITIONS) {
      const allowed = new Set(def.permissions as string[]);
      for (const p of grants.get(def.id as string) ?? []) {
        if (!allowed.has(p))
          drift.push(`${def.id}: DB grants '${p}' not in catalogue`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("the catalogue does not promise a role something the database withholds", () => {
    const drift: string[] = [];
    for (const def of ROLE_DEFINITIONS) {
      const seeded = grants.get(def.id as string) ?? new Set<string>();
      for (const p of def.permissions as Permission[]) {
        if (!seeded.has(p))
          drift.push(`${def.id}: catalogue promises '${p}' not seeded`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("the least-privilege invariants of migration 045 still hold", () => {
    // Governance and oversight roles gain no clinical or financial WRITE from
    // the operational domains; if one of these fails, a permission spread was
    // widened without review.
    // Scoped to the permissions migration 045 introduced, not to every
    // `*:sign`-shaped id: `contract:sign` is a trustee governance act that
    // predates this domain, and a blanket suffix rule would flag it.
    const operationalWrites = new Set([
      "bed:allocate",
      "bed:manage",
      "flow:write",
      "careplan:write",
      "careplan:sign",
      "task:complete",
      "document:write",
      "discharge:write",
      "referral:write",
      "referral:send",
      "triage:write",
      "escalation:raise",
      "handover:write",
      "resus:document",
      "theatre:book",
      "theatre:document",
      "checklist:sign",
      "insurance:write",
      "preauth:write",
      "claim:reconcile",
      "study:import",
      "report:addendum",
      "critical:write",
      "roster:write",
      "portal:release",
      "identifier:write",
      "patient:merge",
      "telehealth:manage",
      "noelia:tool_grant",
    ]);
    const writeish = (role: string) =>
      [...(grants.get(role) ?? [])].filter((p) => operationalWrites.has(p));
    expect(writeish("trustee")).toEqual([]);
    expect(writeish("board")).toEqual([]);
    expect(writeish("moh-official")).toEqual([]);
    expect(writeish("auditor")).toEqual([]);
    // A patient may speak on their own care thread — that is what the portal is
    // for — but holds no write over any clinical, financial or identity record.
    expect(writeish("patient")).toEqual([]);
    const patientGrants = [...(grants.get("patient") ?? [])];
    expect(patientGrants).toContain("message:send");
    expect(patientGrants).toContain("portal:read_own");
    expect(
      patientGrants.filter((p) =>
        /:(write|sign|release|merge|allocate|manage)$/.test(p),
      ),
    ).toEqual([]);
    // Only three roles may change what the AI is allowed to do.
    const toolGrant = ROLE_DEFINITIONS.filter((r) =>
      (r.permissions as string[]).includes("noelia:tool_grant"),
    ).map((r) => r.id);
    expect(toolGrant.sort()).toEqual(["ai-safety-officer", "cmo", "cto"]);
  });

  it("front_desk can operate the ward but cannot write clinical content", () => {
    const fd = new Set<string>(permissionsForRole("front_desk"));
    expect(fd.has("bed:read")).toBe(true);
    expect(fd.has("referral:write")).toBe(true);
    expect(fd.has("bed:allocate")).toBe(false);
    expect(fd.has("careplan:write")).toBe(false);
    expect(fd.has("phi:write")).toBe(false);
    expect(fd.has("rx:write")).toBe(false);
    expect(fd.has("claim:reconcile")).toBe(false);
  });

  it("a capacity nurse can move a patient but cannot redraw the bed registry", () => {
    const nurse = new Set<string>(permissionsForRole("nurse"));
    expect(nurse.has("bed:allocate")).toBe(true);
    expect(nurse.has("bed:manage")).toBe(false);
    expect(nurse.has("careplan:sign")).toBe(false);
    const cno = new Set<string>(permissionsForRole("cno"));
    expect(cno.has("bed:manage")).toBe(true);
    expect(cno.has("careplan:sign")).toBe(true);
    expect(cno.has("rx:write")).toBe(false);
  });

  it("permissionsForRole returns an empty set for an unknown role", () => {
    expect(permissionsForRole("not_a_role" as RoleId)).toEqual([]);
  });
});
