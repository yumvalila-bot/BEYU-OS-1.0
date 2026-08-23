/**
 * Phase 10 — canonical identity graph.
 *
 * Proves PERSON ≠ USER ≠ EMPLOYEE, ONE GlobalUserID per party, tenant fail-closed,
 * and that the constants.ts / role_permissions catalogues have not drifted.
 */
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fixedId, ID_PREFIX } from "@/lib/ids";
import {
  IDENTITY_VERSION,
  assertPermissionCatalogParity,
  assertSingleGlobalUser,
  resolveByEmployeeId,
  resolveByGlobalUserId,
  resolveByPartyId,
} from "@/lib/identity";

describe("identity graph", () => {
  it("versions are pinned", () => {
    expect(IDENTITY_VERSION).toBe("identity-graph-1.0.0");
  });

  it("POSITIVE: employee → party → GlobalUserID → tenant → entity", async () => {
    const g = await resolveByEmployeeId(fixedId(ID_PREFIX.employee, "ASHA_NDULU"));
    expect(g.decision).toBe("RESOLVED");
    expect(g.partyId).toBe(fixedId(ID_PREFIX.party, "ASHA_NDULU"));
    expect(g.globalUserId).toBe(fixedId(ID_PREFIX.user, "ASHA_NDULU"));
    expect(g.employeeId).toBe(fixedId(ID_PREFIX.employee, "ASHA_NDULU"));
    expect(g.legalEntityId).toBeTruthy();
    expect(g.tenantId).toBeTruthy();
  });

  it("POSITIVE: a user without an employee is still a GlobalUserID", async () => {
    const g = await resolveByGlobalUserId(fixedId(ID_PREFIX.user, "NEEMA_BEYU"));
    expect(g.decision).toBe("RESOLVED");
    expect(g.globalUserId).toBe(fixedId(ID_PREFIX.user, "NEEMA_BEYU"));
    expect(g.employeeId).toBeNull();
    expect(g.reason).toMatch(/no workforce record/);
  });

  it("the same party resolves identically from every key", async () => {
    const party = fixedId(ID_PREFIX.party, "DAUDI_MOSHI");
    const a = await resolveByPartyId(party);
    const b = await resolveByGlobalUserId(fixedId(ID_PREFIX.user, "DAUDI_MOSHI"));
    const c = await resolveByEmployeeId(fixedId(ID_PREFIX.employee, "DAUDI_MOSHI"));
    expect(a.globalUserId).toBe(b.globalUserId);
    expect(b.globalUserId).toBe(c.globalUserId);
    expect(a.employeeId).toBe(c.employeeId);
  });

  it("NEGATIVE: a missing identity is NOT_FOUND, never invented", async () => {
    expect((await resolveByEmployeeId("EMP_NOPE")).decision).toBe("NOT_FOUND");
    expect((await resolveByGlobalUserId("USR_NOPE")).decision).toBe("NOT_FOUND");
    expect((await resolveByPartyId("PTY_NOPE")).decision).toBe("NOT_FOUND");
  });

  it("NEGATIVE: a tenant mismatch is non-enumerating", async () => {
    const g = await resolveByEmployeeId(fixedId(ID_PREFIX.employee, "ASHA_NDULU"), "TEN_BEYU_HEALTH");
    expect(g.decision).toBe("TENANT_SCOPE_MISMATCH");
    expect(g.globalUserId).toBeNull();
    expect(g.employeeId).toBeNull();
  });

  it("FI: two GlobalUserIDs for one party MUST throw", () => {
    expect(() => assertSingleGlobalUser(["USR_A", "USR_B"], "PTY_X")).toThrow(/ONE GlobalUserID/);
    expect(() => assertSingleGlobalUser(["USR_A", "USR_A"], "PTY_X")).not.toThrow();
    expect(() => assertSingleGlobalUser(["USR_A"], "PTY_X")).not.toThrow();
  });

  it("live data has exactly one login per employee party", async () => {
    const rows = await db.select({ partyId: users.partyId, id: users.id }).from(users);
    const byParty = new Map<string, string[]>();
    for (const r of rows) {
      const list = byParty.get(r.partyId) ?? [];
      list.push(r.id);
      byParty.set(r.partyId, list);
    }
    for (const [partyId, ids] of byParty) {
      expect(() => assertSingleGlobalUser(ids, partyId)).not.toThrow();
    }
  });
});

describe("permission catalogue parity (H-01 still open)", () => {
  it("the seeded role_permissions mirror matches ROLES", async () => {
    const r = await assertPermissionCatalogParity();
    expect(r.ok).toBe(true);
    expect(r.drifts).toEqual([]);
  });

  it("does not switch the runtime source — authz still reads constants", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../src/lib/authz.ts", import.meta.url), "utf8"),
    );
    expect(src).toMatch(/ROLES\[code\]\?\.permissions/);
    expect(src).not.toMatch(/from\(rolePermissions\)/);
  });
});

describe("identity substrate is unchanged by resolution", () => {
  it("does not create users, parties or employees", async () => {
    const before = await db.select({ id: users.id }).from(users);
    await resolveByPartyId(fixedId(ID_PREFIX.party, "AMANI_BEYU"));
    const after = await db.select({ id: users.id }).from(users);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
  });
});
