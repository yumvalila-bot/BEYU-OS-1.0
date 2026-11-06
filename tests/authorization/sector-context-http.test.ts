import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminDb } from "@/db/admin";
import { farms, ujenziProjects } from "@/db/schema";
import { parties, roleAssignments, sessions as identitySessions, users } from "@/db/schema/identity";
import { auditLog } from "@/db/schema/platform";
import { hashPassword } from "@/lib/crypto";
import { decryptSecret, encryptSecret, generateTotpCode, generateTotpSecret } from "@/lib/mfa";
import {
  SESSION_TENANT_CONTEXT_ACTION,
  listSessionTenantContexts,
} from "@/lib/session-tenant-context";
import { baseUrl, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
const ROOT = baseUrl();
const PASSWORD = process.env.BEYU_BOOTSTRAP_PASSWORD;
if (!PASSWORD) throw new Error("BEYU_BOOTSTRAP_PASSWORD must be set for the isolated sector-context HTTP suite.");

const GROUP = "TEN_BEYU_GROUP";
const AGRI = "TEN_BEYU_AGRI";
const UJENZI = "TEN_BEYU_UJENZI";
const FINTECH = "TEN_BEYU_FINTECH";
const AGRI_ENTITY = "LEN_BEYU_AGRI_LTD";
const fixtureSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const USER = `USR_TEST_SECTOR_CONTEXT_${fixtureSuffix}`;
const PARTY = `PTY_TEST_SECTOR_CONTEXT_${fixtureSuffix}`;
const EMAIL = `sector-context-${fixtureSuffix}@example.test`;
const ASSIGNMENTS = {
  home: `RAS_TEST_CONTEXT_HOME_${fixtureSuffix}`,
  agri: `RAS_TEST_CONTEXT_AGRI_${fixtureSuffix}`,
  ujenzi: `RAS_TEST_CONTEXT_UJENZI_${fixtureSuffix}`,
  finance: `RAS_TEST_CONTEXT_FINANCE_${fixtureSuffix}`,
};
const AGRI_FARM = `AGR_TEST_CONTEXT_${fixtureSuffix}`;
const GROUP_FARM = `AGR_TEST_HOME_${fixtureSuffix}`;
const UJENZI_PROJECT = `UJZ_TEST_CONTEXT_${fixtureSuffix}`;
const GROUP_PROJECT = `UJZ_TEST_HOME_${fixtureSuffix}`;

let currentSessionId = "";
let sessionCookie = "";

async function login() {
  const [user] = await db.select().from(users).where(eq(users.id, USER)).limit(1);
  expect(user).toBeDefined();
  const response = await fetch(`${ROOT}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      mfaCode: generateTotpCode(decryptSecret(user!.mfaSecretEncrypted!)),
    }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  expect(cookie).toContain("beyu_os_session=");
  const [session] = await db.select().from(identitySessions)
    .where(eq(identitySessions.userId, USER))
    .orderBy(desc(identitySessions.issuedAt)).limit(1);
  currentSessionId = session.id;
  return cookie;
}

async function switchContext(cookie: string, tenantCode: string) {
  return fetch(`${ROOT}/api/v1/auth/tenant-context`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ tenantCode }),
  });
}

async function get(cookie: string, path: string) {
  return fetch(`${ROOT}${path}`, { headers: { cookie } });
}

async function getJson(cookie: string, path: string) {
  const response = await get(cookie, path);
  const envelope = await response.json() as Record<string, unknown>;
  // guarded() uses { data, meta } for successful API responses; sector list
  // routes also have legacy unwrapped payloads. Assertions must inspect the
  // actual success data, never mistake the envelope for an empty result.
  const body = envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
    ? envelope.data as Record<string, unknown>
    : envelope;
  return { response, body };
}

async function postJson(cookie: string, path: string, body: unknown) {
  return fetch(`${ROOT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

function expectDeniedPage(body: string) {
  expect(body).toContain("Authorisation denied");
  expect(body).toContain("immutable audit ledger");
}

beforeAll(async () => {
  if (!available) return;
  expect((await db.select({ id: users.id }).from(users).where(eq(users.id, USER)))).toHaveLength(0);
  const secret = generateTotpSecret();
  await adminDb.insert(parties).values({
    id: PARTY,
    type: "PERSON",
    displayName: "Disposable Sector Context Test",
    countryCode: "TZ",
    email: EMAIL,
    classification: "CONFIDENTIAL",
    status: "ACTIVE",
  });
  await adminDb.insert(users).values({
    id: USER,
    partyId: PARTY,
    email: EMAIL,
    passwordHash: hashPassword(PASSWORD),
    passwordMustChange: false,
    mfaEnrolled: true,
    mfaMethod: "TOTP",
    mfaSecretEncrypted: encryptSecret(secret),
    primaryTenantId: GROUP,
    status: "ACTIVE",
  });
  await adminDb.insert(roleAssignments).values([
    {
      id: ASSIGNMENTS.home,
      userId: USER,
      roleId: "ROL_PLATFORM_ADMIN",
      tenantId: GROUP,
      globalScope: false,
      grantedBy: "TEST/SECTOR_CONTEXT",
      justification: "Disposable non-global home-scope regression fixture only.",
      effectiveFrom: "2024-01-01",
    },
    {
      id: ASSIGNMENTS.agri,
      userId: USER,
      roleId: "ROL_SECTOR_READ_ONLY",
      tenantId: AGRI,
      globalScope: false,
      grantedBy: "TEST/SECTOR_CONTEXT",
      justification: "Disposable Agriculture read-only authorization fixture only.",
      effectiveFrom: "2024-01-01",
    },
    {
      id: ASSIGNMENTS.ujenzi,
      userId: USER,
      roleId: "ROL_SECTOR_READ_ONLY",
      tenantId: UJENZI,
      globalScope: false,
      grantedBy: "TEST/SECTOR_CONTEXT",
      justification: "Disposable Ujenzi read-only authorization fixture only.",
      effectiveFrom: "2024-01-01",
    },
    {
      id: ASSIGNMENTS.finance,
      userId: USER,
      roleId: "ROL_TENANT_MEMBER",
      tenantId: FINTECH,
      globalScope: false,
      grantedBy: "TEST/SECTOR_CONTEXT",
      justification: "Zero-capability membership negative control only.",
      effectiveFrom: "2024-01-01",
    },
  ]);
  // Unique target/home rows make a wrong-tenant empty success impossible to
  // mistake for a successful canonical bind. They are disposable fixtures,
  // not production data and are removed with the identity below.
  await adminDb.insert(farms).values([
    { id: AGRI_FARM, tenantId: AGRI, legalEntityId: AGRI_ENTITY, code: AGRI_FARM, name: "Target Agriculture fixture", countryCode: "TZ" },
    { id: GROUP_FARM, tenantId: GROUP, legalEntityId: "LEN_BEYU_HOLDINGS", code: GROUP_FARM, name: "Wrong-home Agriculture fixture", countryCode: "AE" },
  ]);
  await adminDb.insert(ujenziProjects).values([
    { id: UJENZI_PROJECT, tenantId: UJENZI, legalEntityId: "LEN_BEYU_UJENZI_LTD", code: UJENZI_PROJECT, name: "Target Ujenzi fixture", countryCode: "TZ" },
    { id: GROUP_PROJECT, tenantId: GROUP, legalEntityId: "LEN_BEYU_HOLDINGS", code: GROUP_PROJECT, name: "Wrong-home Ujenzi fixture", countryCode: "AE" },
  ]);
  sessionCookie = await login();
}, 120_000);

beforeEach(async () => {
  if (!available) return;
  await adminDb.update(identitySessions).set({
    tenantId: GROUP,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    mfaSatisfied: true,
    mfaExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
  }).where(eq(identitySessions.userId, USER));
});

afterAll(async () => {
  if (!available) return;
  await adminDb.delete(farms).where(eq(farms.id, AGRI_FARM));
  await adminDb.delete(farms).where(eq(farms.id, GROUP_FARM));
  await adminDb.delete(ujenziProjects).where(eq(ujenziProjects.id, UJENZI_PROJECT));
  await adminDb.delete(ujenziProjects).where(eq(ujenziProjects.id, GROUP_PROJECT));
  await adminDb.delete(identitySessions).where(eq(identitySessions.userId, USER));
  await adminDb.delete(roleAssignments).where(eq(roleAssignments.userId, USER));
  await adminDb.delete(users).where(eq(users.id, USER));
  await adminDb.delete(parties).where(eq(parties.id, PARTY));
});

describe.skipIf(!available)("authenticated session tenant context", () => {
  it("lists only direct effective capabilities and excludes zero-capability Finance membership", async () => {
    const choices = await listSessionTenantContexts({ userId: USER, tenantId: GROUP, tenantCode: "BEYU-GROUP" });
    expect(choices.map((choice) => choice.code)).toEqual(["BEYU-GROUP", "BEYU-AGRI", "BEYU-UJENZI"]);
    expect(choices.find((choice) => choice.code === "BEYU-GROUP")?.current).toBe(true);
    expect(choices.some((choice) => choice.code === "BEYU-FINTECH")).toBe(false);
  });

  it("denies unauthenticated and MFA-stale changes without changing the session", async () => {
    const anonymous = await switchContext("", "BEYU-AGRI");
    expect(anonymous.status).toBe(401);
    const cookie = sessionCookie;
    await adminDb.update(identitySessions).set({
      mfaSatisfied: false,
      mfaExpiresAt: new Date(Date.now() - 1),
    }).where(eq(identitySessions.id, currentSessionId));
    const stale = await switchContext(cookie, "BEYU-AGRI");
    expect(stale.status).toBe(428);
    const [session] = await adminDb.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
    expect(session.tenantId).toBe(GROUP);
    const [denial] = await adminDb.select().from(auditLog).where(and(
      eq(auditLog.action, SESSION_TENANT_CONTEXT_ACTION),
      eq(auditLog.objectId, currentSessionId),
      eq(auditLog.outcome, "DENIED"),
    )).orderBy(desc(auditLog.occurredAt)).limit(1);
    expect(denial.reason).toBe("MFA_REQUIRED");
  });

  it("rejects unknown, zero-capability and non-canonical context codes", async () => {
    const cookie = sessionCookie;
    for (const code of ["TEN_BEYU_GROUP", "BEYU-FINTECH", "UNKNOWN", "../BEYU-AGRI"]) {
      const response = await switchContext(cookie, code);
      expect(response.status).toBe(403);
    }
    const malformed = await fetch(`${ROOT}/api/v1/auth/tenant-context`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ tenantCode: "BEYU-AGRI", globalScope: true }),
    });
    expect(malformed.status).toBe(422);
    const [session] = await adminDb.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
    expect(session.tenantId).toBe(GROUP);
  });

  it("changes only the caller session and records old/new-tenant success audits", async () => {
    const cookie = sessionCookie;
    const response = await switchContext(cookie, "BEYU-AGRI");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { tenantCode: "BEYU-AGRI", changed: true },
    });
    const [session] = await adminDb.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
    expect(session.tenantId).toBe(AGRI);
    const [user] = await adminDb.select().from(users).where(eq(users.id, USER));
    expect(user.primaryTenantId).toBe(GROUP);
    const assignments = await adminDb.select().from(roleAssignments).where(eq(roleAssignments.userId, USER));
    expect(assignments).toHaveLength(4);
    expect(assignments.every((assignment) => assignment.globalScope === false && assignment.legalEntityId === null)).toBe(true);
    const audits = await adminDb.select().from(auditLog).where(and(
      eq(auditLog.action, SESSION_TENANT_CONTEXT_ACTION),
      eq(auditLog.objectId, currentSessionId),
      eq(auditLog.outcome, "SUCCESS"),
    ));
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => audit.tenantId).sort()).toEqual([AGRI, GROUP].sort());
    expect(audits.every((audit) => audit.actorUserId === USER)).toBe(true);
    expect(audits.every((audit) => typeof audit.traceId === "string" && audit.traceId.length > 0)).toBe(true);
    expect(audits.every((audit) => audit.oldValue?.tenantId === GROUP)).toBe(true);
    expect(audits.every((audit) => audit.newValue?.tenantId === AGRI)).toBe(true);

    const repeated = await switchContext(cookie, "BEYU-AGRI");
    expect(repeated.status).toBe(200);
    const [unchanged] = await adminDb.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
    expect(unchanged.tenantId).toBe(AGRI);
  });

  it("keeps the launcher reachable when the current context has zero destinations", async () => {
    const cookie = sessionCookie;
    await adminDb.update(roleAssignments).set({ effectiveTo: "2020-01-01" }).where(eq(roleAssignments.id, ASSIGNMENTS.home));
    try {
      const response = await get(cookie, "/launcher");
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("Tenant context");
      expect(body).toContain("Switch context");
      expect(body).toContain("BEYU-AGRI");
      expect(body).toContain("BEYU-UJENZI");
      expect(body).toContain("No destination is authorized in the current context");
      expect(body).not.toContain("No governed destination access");
    } finally {
      await adminDb.update(roleAssignments).set({ effectiveTo: null }).where(eq(roleAssignments.id, ASSIGNMENTS.home));
    }
  });

  it("denies expired and revoked sessions", async () => {
    const cookie = sessionCookie;
    const [original] = await db.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
    await adminDb.update(identitySessions).set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(identitySessions.id, currentSessionId));
    expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(401);
    await adminDb.update(identitySessions).set({ expiresAt: original.expiresAt })
      .where(eq(identitySessions.id, currentSessionId));
    await adminDb.update(identitySessions).set({ revokedAt: new Date() }).where(eq(identitySessions.id, currentSessionId));
    expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(401);
    await adminDb.update(identitySessions).set({ revokedAt: null }).where(eq(identitySessions.id, currentSessionId));
  });

  it("excludes expired direct grants and fails closed when the grant expires after switching", async () => {
    const cookie = sessionCookie;
    await adminDb.update(roleAssignments).set({ effectiveTo: "2020-01-01" }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    try {
      expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(403);
      const choices = await listSessionTenantContexts({ userId: USER, tenantId: GROUP, tenantCode: "BEYU-GROUP" });
      expect(choices.some((choice) => choice.code === "BEYU-AGRI")).toBe(false);
      await adminDb.update(roleAssignments).set({ effectiveTo: null }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
      expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(200);
      await adminDb.update(roleAssignments).set({ effectiveTo: "2020-01-01" }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
      const { response } = await getJson(cookie, "/api/v1/agriculture/dashboard");
      expect(response.status).toBe(403);
    } finally {
      await adminDb.update(roleAssignments).set({ effectiveTo: null }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    }
  });
});

describe.skipIf(!available)("direct destination and API authorization after context selection", () => {
  it("binds Agriculture page/API/RLS to AGRI and denies writes, wrong sector and shared capabilities", async () => {
    const cookie = sessionCookie;
    expect((await getJson(cookie, "/api/v1/agriculture/dashboard")).response.status).toBe(403);
    expectDeniedPage(await (await get(cookie, "/os/agriculture")).text());
    expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(200);

    const dashboard = await getJson(cookie, "/api/v1/agriculture/dashboard");
    expect(dashboard.response.status).toBe(200);
    expect(dashboard.body.dashboard).toMatchObject({ financeBoundary: { capPosting: "LOCKED" } });
    const farmsResult = await getJson(cookie, "/api/v1/agriculture/farms");
    expect(farmsResult.response.status).toBe(200);
    const farmItems = (farmsResult.body.farms ?? []) as Array<{ id: string; tenantId: string }>;
    expect(farmItems.some((farm) => farm.id === AGRI_FARM)).toBe(true);
    expect(farmItems.some((farm) => farm.id === GROUP_FARM)).toBe(false);
    expect(farmItems.every((farm) => farm.tenantId === AGRI)).toBe(true);
    expectDeniedPage(await (await get(cookie, "/os/ujenzi")).text());
    expect((await getJson(cookie, "/api/v1/ujenzi/dashboard")).response.status).toBe(403);
    expect((await postJson(cookie, "/api/v1/agriculture/farms", {
      name: "Forbidden write", farmType: "MIXED", countryCode: "TZ", status: "ACTIVE",
    })).status).toBe(403);
    expectDeniedPage(await (await get(cookie, "/os/family")).text());
    expectDeniedPage(await (await get(cookie, "/os/noelia")).text());
  });

  it("binds Ujenzi page/API/RLS to UJENZI and preserves read-only and Family/NOELIA boundaries", async () => {
    const cookie = sessionCookie;
    expect((await switchContext(cookie, "BEYU-UJENZI")).status).toBe(200);
    expect((await get(cookie, "/os/ujenzi")).status).toBe(200);
    const dashboard = await getJson(cookie, "/api/v1/ujenzi/dashboard");
    expect(dashboard.response.status).toBe(200);
    expect(dashboard.body.financeBoundary).toMatchObject({ capPosting: "LOCKED" });
    const projectsResult = await getJson(cookie, "/api/v1/ujenzi/projects");
    expect(projectsResult.response.status).toBe(200);
    const projectItems = (projectsResult.body.items ?? []) as Array<{ id: string; tenantId: string }>;
    expect(projectItems.some((project) => project.id === UJENZI_PROJECT)).toBe(true);
    expect(projectItems.some((project) => project.id === GROUP_PROJECT)).toBe(false);
    expect(projectItems.every((project) => project.tenantId === UJENZI)).toBe(true);
    expect((await postJson(cookie, "/api/v1/ujenzi/projects", {
      name: "Forbidden write", projectType: "BUILDING", countryCode: "TZ", status: "PLANNING",
    })).status).toBe(403);
    expectDeniedPage(await (await get(cookie, "/os/agriculture")).text());
    expect((await getJson(cookie, "/api/v1/agriculture/dashboard")).response.status).toBe(403);
    expectDeniedPage(await (await get(cookie, "/os/family")).text());
    expectDeniedPage(await (await get(cookie, "/os/noelia")).text());
  });

  it("keeps home Family/NOELIA visibility and existing Finance/admin authority unchanged", async () => {
    const cookie = sessionCookie;
    expect((await get(cookie, "/os/family")).status).toBe(200);
    expect((await get(cookie, "/os/noelia")).status).toBe(200);
    expect((await get(cookie, "/os/finance")).status).toBe(200);
    expect((await get(cookie, "/os/administration")).status).toBe(200);
    expect((await postJson(cookie, "/api/v1/finance/journal", {})).status).toBe(403);
    const [session] = await adminDb.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
    expect(session.tenantId).toBe(GROUP);
  });

  it("does not offer an entity-scoped direct grant as a tenant-wide context", async () => {
    const cookie = sessionCookie;
    await adminDb.update(roleAssignments).set({ legalEntityId: AGRI_ENTITY }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    try {
      expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(403);
      const [session] = await adminDb.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
      expect(session.tenantId).toBe(GROUP);
      const choices = await listSessionTenantContexts({ userId: USER, tenantId: GROUP, tenantCode: "BEYU-GROUP" });
      expect(choices.some((choice) => choice.code === "BEYU-AGRI")).toBe(false);
    } finally {
      await adminDb.update(roleAssignments).set({ legalEntityId: null }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    }
  });

  it("fails closed if an already-selected grant later becomes entity-scoped", async () => {
    const cookie = sessionCookie;
    expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(200);
    await adminDb.update(roleAssignments).set({ legalEntityId: AGRI_ENTITY }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    try {
      const { response, body } = await getJson(cookie, "/api/v1/agriculture/dashboard");
      expect(response.status).toBe(403);
      expect(body.error).toMatchObject({ code: "FORBIDDEN" });
      expectDeniedPage(await (await get(cookie, "/os/agriculture")).text());
    } finally {
      await adminDb.update(roleAssignments).set({ legalEntityId: null }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    }
  });

  it("does not treat a global-scope assignment as an eligible direct context grant", async () => {
    const cookie = sessionCookie;
    await adminDb.update(roleAssignments).set({ globalScope: true }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    try {
      expect((await switchContext(cookie, "BEYU-AGRI")).status).toBe(403);
      const [session] = await adminDb.select().from(identitySessions).where(eq(identitySessions.id, currentSessionId));
      expect(session.tenantId).toBe(GROUP);
    } finally {
      await adminDb.update(roleAssignments).set({ globalScope: false }).where(eq(roleAssignments.id, ASSIGNMENTS.agri));
    }
  });
});
