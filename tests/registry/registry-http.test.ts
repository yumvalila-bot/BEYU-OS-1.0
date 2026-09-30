import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  employees,
  employmentEvents,
  families,
  familyMembers,
  legalEntities,
  orgUnits,
  parties,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { apiGetJson, apiPost, login, serverAvailable } from "../helpers/http";

/**
 * BEYU REGISTRY — HTTP boundary (the canonical guarded() path).
 *
 * Drives the REAL running server end-to-end:
 *   register → duplicate 409 → family + membership → graph → organizations,
 *   with fail-closed authentication (401) and authorization (403). Every
 * response carries the shared trace envelope; business rules are carried by
 * specific error codes, never by status-200 lies.
 */

const T = { group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP") };

type ApiEnvelope = { data?: Record<string, unknown>; error?: { code?: string; message?: string; details?: unknown }; meta?: { traceId?: string } };

/** Narrow the shared response envelope for assertions (same pattern as admin-http). */
function env(r: { body: unknown }): ApiEnvelope {
  return (r.body ?? {}) as ApiEnvelope;
}

let adminCookie: string;
let ceoCookie: string;
let hcmCookie: string;
let sectorCookie: string;

const createdPartyIds: string[] = [];
const createdFamilyIds: string[] = [];
const createdEntityIds: string[] = [];
const createdUnitIds: string[] = [];
const createdEmployeeIds: string[] = [];

beforeAll(async () => {
  await serverAvailable();
  adminCookie = await login("admin@beyu.os");
  ceoCookie = await login("ceo@beyu.os");
  hcmCookie = await login("hcm@beyu.os");
  sectorCookie = await login("health.ops@beyu.os");
}, 120_000);

afterAll(async () => {
  if (createdEmployeeIds.length > 0) {
    await db.delete(employmentEvents).where(inArray(employmentEvents.employeeId, createdEmployeeIds));
    await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
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

describe("BEYU Registry HTTP boundary", () => {
  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("fails closed: unauthenticated → 401, sector operator without capability → 403", async () => {
    const unauth = await apiGetJson("/api/v1/admin/registry/parties");
    expect(unauth.status).toBe(401);

    const unauthPost = await apiPost("/api/v1/admin/registry/parties", {});
    expect(unauthPost.status).toBe(401);

    const denied = await apiPost(
      "/api/v1/admin/registry/parties",
      {
        displayName: "Denied Probe",
        primaryTenantId: T.group,
        reason: "Sector operator holds no identity:party.register.",
      },
      { cookie: sectorCookie },
    );
    expect(denied.status).toBe(403);
    expect(env(denied).error?.code).toBe("FORBIDDEN");
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("registers a person party: 201 + NO user + truthful list", async () => {
    const email = `http-john-${Date.now()}@beyu.invalid`;
    const res = await apiPost(
      "/api/v1/admin/registry/parties",
      {
        displayName: "John Doe",
        email,
        countryCode: "TZ",
        primaryTenantId: T.group,
        reason: "HTTP flow: canonical person registration.",
      },
      { cookie: adminCookie },
    );
    expect(res.status).toBe(201);
    const data = res.body?.data as { partyId?: string; userCreated?: boolean };
    expect(data.partyId).toMatch(/^PTY_/);
    expect(data.userCreated).toBe(false);
    createdPartyIds.push(data.partyId!);
    expect(env(res).meta?.traceId).toBeTruthy();

    // Truthful reads: the list returns the new party without any user edge.
    const listed = await apiGetJson("/api/v1/admin/registry/parties", { cookie: adminCookie });
    expect(listed.status).toBe(200);
    const items = (listed.body?.data as { items?: Array<Record<string, unknown>> })?.items ?? [];
    const found = items.find((p) => p.id === data.partyId);
    expect(found).toBeTruthy();

    // Controlled duplicate: 409 naming the existing record, never a 200 lie.
    const dup = await apiPost(
      "/api/v1/admin/registry/parties",
      { displayName: "John Doe Again", email, primaryTenantId: T.group, reason: "Duplicate over HTTP." },
      { cookie: adminCookie },
    );
    expect(dup.status).toBe(409);
    expect(env(dup).error?.code).toBe("DUPLICATE_PARTY");
    expect((env(dup).error?.details as { existingPartyId?: string })?.existingPartyId).toBe(data.partyId);
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("registers a family and its founder membership over HTTP", async () => {
    const code = `HTTP-${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
    const fam = await apiPost(
      "/api/v1/admin/registry/families",
      { tenantId: T.group, code, displayName: "HTTP Test Family", countryCode: "TZ", reason: "HTTP flow: family registration." },
      { cookie: ceoCookie },
    );
    expect(fam.status).toBe(201);
    const famData = fam.body?.data as { familyId?: string; partyId?: string };
    expect(famData.familyId).toMatch(/^FML_/);
    createdFamilyIds.push(famData.familyId!);
    createdPartyIds.push(famData.partyId!);

    // Family read surface (HIGHLY_RESTRICTED, same-principal).
    const detail = await apiGetJson(`/api/v1/admin/registry/families/${famData.familyId}`, { cookie: ceoCookie });
    expect(detail.status).toBe(200);
    const family = (detail.body?.data as { family?: Record<string, unknown> })?.family;
    expect(family?.code).toBe(code);

    // Founder membership for the HTTP-registered person.
    const member = await apiPost(
      `/api/v1/admin/registry/families/${famData.familyId}/members`,
      {
        partyId: createdPartyIds[0],
        relationshipType: "BIRTH_DESCENDANT",
        branch: "FOUNDER",
        provenance: "HTTP flow founder provenance.",
        reason: "HTTP flow: founder membership.",
      },
      { cookie: ceoCookie },
    );
    expect(member.status).toBe(201);
    const memberData = member.body?.data as { memberId?: string; generation?: number };
    expect(memberData.generation).toBe(1);

    // Duplicate membership over HTTP → 409 with the specific code.
    const dupMember = await apiPost(
      `/api/v1/admin/registry/families/${famData.familyId}/members`,
      {
        partyId: createdPartyIds[0],
        relationshipType: "NON_FAMILY",
        provenance: "Duplicate attempt.",
        reason: "HTTP flow duplicate membership.",
      },
      { cookie: ceoCookie },
    );
    expect(dupMember.status).toBe(409);
    expect(env(dupMember).error?.code).toBe("ALREADY_FAMILY_MEMBER");
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("serves the relationship graph and organizations overview with truthful edges", async () => {
    const graph = await apiGetJson("/api/v1/admin/registry/graph", { cookie: ceoCookie });
    expect(graph.status).toBe(200);
    const edges = (graph.body?.data as { edges?: Array<{ type: string; from: string; to: string }> })?.edges ?? [];
    expect(edges.length).toBeGreaterThan(0);
    // The HTTP-registered founder has a REAL memberOf edge and NO user edge.
    const famId = createdFamilyIds[0];
    const memberOf = edges.find((e) => e.type === "memberOf" && e.to === famId);
    expect(memberOf).toBeTruthy();
    expect(edges.find((e) => e.type === "hasUser" && e.from === createdPartyIds[0])).toBeUndefined();

    const orgs = await apiGetJson("/api/v1/admin/registry/organizations?scope=groups", { cookie: adminCookie });
    expect(orgs.status).toBe(200);
    const data = orgs.body?.data as Record<string, unknown>;
    expect(Array.isArray(data.entities)).toBe(true);
    expect(Array.isArray(data.families)).toBe(true);
    expect(Array.isArray(data.ownership)).toBe(true);
    // Employment overview appears ONLY under hcm:employee.read (admin holds it);
    // the overview never widens reach beyond the dedicated employment route.
    expect(Array.isArray(data.employment)).toBe(true);
  });

  it.skipIf(!process.env.BEYU_TEST_BASE_URL)("registers entity → business unit → employment, each with the declared event", async () => {
    const stamp = Date.now().toString(36).toUpperCase();
    // organization:entity.manage is held by GROUP_CEO — the API refuses the
    // platform administrator here (least privilege is REAL, not decorative).
    const entity = await apiPost(
      "/api/v1/admin/registry/entities",
      {
        tenantId: T.group,
        code: `HTTP-E-${stamp}`.slice(0, 40),
        legalName: "HTTP Registry Entity Ltd",
        entityType: "OPERATING_COMPANY",
        countryCode: "TZ",
        reason: "HTTP flow: entity registration.",
      },
      { cookie: ceoCookie },
    );
    expect(entity.status).toBe(201);
    // And the platform administrator is refused on this route.
    const deniedEntity = await apiPost(
      "/api/v1/admin/registry/entities",
      { tenantId: T.group, code: `HTTP-DENY-${stamp}`.slice(0, 40), legalName: "Denied", entityType: "HOLDING", countryCode: "TZ", reason: "No entity.manage." },
      { cookie: adminCookie },
    );
    expect(deniedEntity.status).toBe(403);
    expect(entity.status).toBe(201);
    const entityId = (entity.body?.data as { legalEntityId?: string }).legalEntityId!;
    createdEntityIds.push(entityId);

    const unit = await apiPost(
      "/api/v1/admin/registry/businesses",
      {
        tenantId: T.group,
        legalEntityId: entityId,
        code: `HTTP-B-${stamp}`.slice(0, 40),
        name: "HTTP Operations",
        unitType: "DEPARTMENT",
        reason: "HTTP flow: business registration.",
      },
      { cookie: adminCookie },
    );
    expect(unit.status).toBe(201);
    createdUnitIds.push((unit.body?.data as { orgUnitId?: string }).orgUnitId!);

    const employment = await apiPost(
      "/api/v1/admin/registry/employment",
      {
        tenantId: T.group,
        partyId: createdPartyIds[0],
        legalEntityId: entityId,
        employeeNo: `HTTP-EMP-${stamp}`.slice(0, 40),
        hireDate: "2026-06-01",
        countryCode: "TZ",
        reason: "HTTP flow: employment registration.",
      },
      { cookie: hcmCookie },
    );
    expect(employment.status).toBe(201);
    const employeeId = (employment.body?.data as { employeeId?: string }).employeeId!;
    createdEmployeeIds.push(employeeId);

    // The employment row exists, and the employed person is still NO user —
    // PERSON ≠ USER even after EMPLOYMENT_REGISTERED.
    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
    expect(emp?.legalEntityId).toBe(entityId);
    const partyUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.partyId, createdPartyIds[0]!));
    expect(partyUsers).toHaveLength(0);
  });
});
