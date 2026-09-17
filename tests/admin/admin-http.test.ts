import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db";
import { parties, roleAssignments, sessions, tenants, users } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { apiGetJson, apiPost, login, serverAvailable } from "../helpers/http";

/**
 * Administrative governance — HTTP boundary.
 *
 * Drives the REAL running server: the canonical `guarded()` wrapper
 * (authentication → authorization → validation → rate limit → audit) is
 * exercised end-to-end. The fail-closed contract: unauthenticated → 401,
 * unauthorized → 403, governed refusals → specific error codes. The service
 * layer and security matrix are covered by their own suites.
 *
 * Sessions are established ONCE in beforeAll (repo convention — the TOTP
 * replay guard would otherwise stall repeat logins inside one 30s window).
 */

const T = {
  group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP"),
  tz: fixedId(ID_PREFIX.tenant, "BEYU_TZ"),
  health: fixedId(ID_PREFIX.tenant, "BEYU_HEALTH"),
};

type ApiEnvelope = { data?: Record<string, unknown>; error?: { code?: string; message?: string; details?: unknown } };

const createdUserIds: string[] = [];
const createdPartyIds: string[] = [];
const createdTenantIds: string[] = [];

let adminCookie: string;
let ceoCookie: string;
let sectorCookie: string;
let auditorCookie: string;

beforeAll(async () => {
  await serverAvailable();
  adminCookie = await login("admin@beyu.os");
  ceoCookie = await login("ceo@beyu.os");
  sectorCookie = await login("health.ops@beyu.os");
  auditorCookie = await login("auditor@beyu.os");
}, 120_000);

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(roleAssignments).where(eq(roleAssignments.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  for (const id of createdPartyIds) {
    await db.delete(parties).where(eq(parties.id, id));
  }
  for (const id of createdTenantIds) {
    await db.delete(tenants).where(eq(tenants.id, id));
  }
});

describe("administrative governance HTTP boundary", () => {
  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("fails closed: unauthenticated requests are 401 on every admin route", async () => {
    const getRoutes = [
      "/api/v1/admin/users",
      "/api/v1/admin/tenants",
      "/api/v1/admin/memberships",
      "/api/v1/admin/roles",
      "/api/v1/admin/delegations",
      "/api/v1/admin/audit",
    ];
    for (const route of getRoutes) {
      const res = await apiGetJson(route);
      expect(res.status, `GET ${route} must be 401 unauthenticated`).toBe(401);
    }
    // Mutation routes must equally refuse unauthenticated POSTs (the audit
    // route is read-only; an unsupported verb is a 405 before any handler).
    for (const route of getRoutes.filter((r) => r !== "/api/v1/admin/audit")) {
      const post = await apiPost(route, {});
      expect(post.status, `POST ${route} must be 401 unauthenticated`).toBe(401);
    }
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("fails closed: a sector operator without the capability is 403", async () => {
    const res = await apiPost("/api/v1/admin/users", {
      email: `denied-${Date.now()}@beyu.os`,
      displayName: "Denied Identity",
      primaryTenantId: T.health,
      reason: "Sector operator without identity:user.register.",
    }, { cookie: sectorCookie });
    expect(res.status).toBe(403);
    const listed = await apiGetJson("/api/v1/admin/users", { cookie: sectorCookie });
    expect(listed.status).toBe(403); // SECTOR_OPERATOR holds no identity:user.read either
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("the platform administrator registers, activates and suspends a user through the governed API", async () => {
    const email = `http-admin-${Date.now()}@beyu.os`;
    const registered = await apiPost("/api/v1/admin/users", {
      email,
      displayName: "HTTP Admin Suite Identity",
      countryCode: "TZ",
      primaryTenantId: T.tz,
      reason: "HTTP boundary suite: register a governed identity.",
    }, { cookie: adminCookie });
    expect(registered.status).toBe(201);
    const body = registered.body as ApiEnvelope;
    const userId = body.data?.userId as string | undefined;
    expect(userId).toBeTruthy();
    if (!userId) throw new Error("register response missing userId");
    createdUserIds.push(userId);
    // The response must never carry a credential.
    expect(JSON.stringify(registered.body)).not.toMatch(/password|secret|token/i);

    const activated = await apiPost(`/api/v1/admin/users/${userId}/status`, {
      action: "activate",
      reason: "Credential procedure completed out of band.",
    }, { cookie: adminCookie });
    expect(activated.status).toBe(200);
    expect((activated.body as ApiEnvelope).data?.status).toBe("ACTIVE");

    const suspended = await apiPost(`/api/v1/admin/users/${userId}/status`, {
      action: "suspend",
      reason: "HTTP suite suspension check.",
    }, { cookie: adminCookie });
    expect(suspended.status).toBe(200);
    expect((suspended.body as ApiEnvelope).data?.status).toBe("SUSPENDED");

    const partyId = await db
      .select({ partyId: users.partyId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    createdPartyIds.push(partyId[0]!.partyId);
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("the GROUP_CEO may register users but NOT remove them and NOT delegate authority", async () => {
    const email = `http-ceo-${Date.now()}@beyu.os`;
    const registered = await apiPost("/api/v1/admin/users", {
      email,
      displayName: "CEO Registered Identity",
      primaryTenantId: T.group,
      reason: "Chief Executive registering a governed identity.",
    }, { cookie: ceoCookie });
    expect(registered.status).toBe(201);
    const userId = (registered.body as ApiEnvelope).data?.userId as string;
    expect(userId).toBeTruthy();
    if (!userId) throw new Error("register response missing userId");
    createdUserIds.push(userId);
    const [row] = await db.select({ partyId: users.partyId }).from(users).where(eq(users.id, userId));
    createdPartyIds.push(row.partyId);

    const removed = await apiPost(`/api/v1/admin/users/${userId}/remove`, {
      reason: "CEO attempting the removal act.",
    }, { cookie: ceoCookie });
    expect(removed.status).toBe(403); // identity:user.remove is PLATFORM_ADMIN-only

    const delegation = await apiPost("/api/v1/admin/delegations", {
      delegateeUserId: userId,
      permissions: ["identity:user.suspend"],
      scopeTenantIds: [T.tz],
      effectiveTo: new Date(Date.now() + 86_400_000).toISOString(),
      reason: "CEO attempting to delegate authority.",
    }, { cookie: ceoCookie });
    expect(delegation.status).toBe(403); // identity:delegation.manage is PLATFORM_ADMIN-only

    // The CEO CAN suspend (identity:user.suspend).
    const activated = await apiPost(`/api/v1/admin/users/${userId}/status`, {
      action: "activate",
      reason: "CEO activation before suspension test.",
    }, { cookie: ceoCookie });
    expect(activated.status).toBe(200);
    const suspended = await apiPost(`/api/v1/admin/users/${userId}/status`, {
      action: "suspend",
      reason: "CEO suspension of the registered identity.",
    }, { cookie: ceoCookie });
    expect(suspended.status).toBe(200);
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("the audit route lists administrative actions within scope", async () => {
    const res = await apiGetJson("/api/v1/admin/audit?limit=50", { cookie: adminCookie });
    expect(res.status).toBe(200);
    const body = res.body as { data?: { actions?: string[]; records?: Array<{ action: string }> } };
    expect(body.data?.actions).toContain("USER_REGISTERED");
    expect(body.data?.records?.some((r) => r.action === "USER_REGISTERED")).toBe(true);
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("tenant registration through the API with validation refusal", async () => {
    const code = `BEYU-HTTP-${Date.now() % 100000}`;
    const registered = await apiPost("/api/v1/admin/tenants", {
      code,
      name: "HTTP Suite Tenant",
      type: "SECTOR",
      parentTenantId: T.tz,
      countryCode: "TZ",
      reason: "HTTP boundary suite tenant registration.",
    }, { cookie: adminCookie });
    expect(registered.status).toBe(201);
    const tenantId = (registered.body as ApiEnvelope).data?.tenantId as string;
    expect(tenantId).toBeTruthy();
    createdTenantIds.push(tenantId);

    const duplicate = await apiPost("/api/v1/admin/tenants", {
      code,
      name: "Duplicate",
      type: "SECTOR",
      parentTenantId: T.tz,
      reason: "Duplicate tenant code attempt.",
    }, { cookie: adminCookie });
    expect(duplicate.status).toBe(409);

    const removed = await apiPost(`/api/v1/admin/tenants/${tenantId}/remove`, {
      reason: "Suite cleanup removal.",
    }, { cookie: adminCookie });
    // CREATED tenant with no users/entities: removal succeeds (terminal REVOKED).
    expect(removed.status).toBe(200);
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("an auditor may read the administrative audit trail but cannot mutate", async () => {
    const audit = await apiGetJson("/api/v1/admin/audit?limit=10", { cookie: auditorCookie });
    expect(audit.status).toBe(200);
    const register = await apiPost("/api/v1/admin/users", {
      email: `auditor-denied-${Date.now()}@beyu.os`,
      displayName: "Auditor Denied",
      primaryTenantId: T.group,
      reason: "Auditors cannot register identities.",
    }, { cookie: auditorCookie });
    expect(register.status).toBe(403);
  });
});
