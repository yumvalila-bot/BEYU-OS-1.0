import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, ne } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { countries, knowledgeSources, legalEntities, tenants } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { retrieveGovernedMemory } from "../../src/lib/noelia/memory";
import { resolveNoeliaAuthorizedScope } from "../../src/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { seededPrincipal } from "./db-fixtures";

const CODES = [
  "NOELIA_TEST_GLOBAL",
  "NOELIA_TEST_ENTERPRISE",
  "NOELIA_TEST_HEALTH",
  "NOELIA_TEST_OTHER_TENANT",
  "NOELIA_TEST_ENTITY",
  "NOELIA_TEST_COUNTRY",
  "NOELIA_TEST_CLASSIFIED",
];
const KEYWORD = "noeliaprobealpha";

let enterpriseTenantId = "";
let healthTenantId = "";
let otherTenantId = "";
let healthEntityId = "";
let otherEntityId = "";
let healthCountry = "";
let otherCountry = "";

async function cleanup() {
  await db.delete(knowledgeSources).where(inArray(knowledgeSources.code, CODES));
}

beforeAll(async () => {
  await cleanup();
  const allTenants = await db.select().from(tenants);
  const enterprise = allTenants.find((tenant) => tenant.type === "ENTERPRISE");
  const health = allTenants.find((tenant) => tenant.code === "BEYU-HEALTH");
  const other = allTenants.find((tenant) => tenant.id !== health?.id && tenant.type !== "ENTERPRISE");
  if (!enterprise || !health || !other) throw new Error("Seed tenant topology is incomplete.");
  enterpriseTenantId = enterprise.id;
  healthTenantId = health.id;
  otherTenantId = other.id;

  const [healthEntity] = await db.select().from(legalEntities).where(eq(legalEntities.tenantId, healthTenantId)).limit(1);
  const [otherEntity] = await db.select().from(legalEntities).where(ne(legalEntities.tenantId, healthTenantId)).limit(1);
  if (!healthEntity || !otherEntity) throw new Error("Seed entity topology is incomplete.");
  healthEntityId = healthEntity.id;
  otherEntityId = otherEntity.id;
  healthCountry = healthEntity.countryCode;
  const countryRows = await db.select({ code: countries.code }).from(countries).where(ne(countries.code, healthCountry)).limit(1);
  if (!countryRows[0]) throw new Error("A second seeded country is required.");
  otherCountry = countryRows[0].code;

  const common = {
    title: "Noelia scoped retrieval probe",
    domain: "TEST",
    ownerRole: "CHIEF_GOVERNANCE_OFFICER",
    version: "1.0.0",
    authorityStatus: "AUTHORITATIVE" as const,
    provenance: "Noelia regression test",
    effectiveFrom: "2026-01-01",
    reviewDate: "2027-12-31",
    content: `${KEYWORD} governed memory content`,
    keywords: [KEYWORD],
  };
  await db.insert(knowledgeSources).values([
    { ...common, id: fixedId(ID_PREFIX.knowledge, CODES[0]), code: CODES[0], scopeType: "GLOBAL", classification: "INTERNAL" },
    { ...common, id: fixedId(ID_PREFIX.knowledge, CODES[1]), code: CODES[1], scopeType: "ENTERPRISE", tenantId: enterpriseTenantId, classification: "INTERNAL" },
    { ...common, id: fixedId(ID_PREFIX.knowledge, CODES[2]), code: CODES[2], scopeType: "TENANT", tenantId: healthTenantId, classification: "CONFIDENTIAL" },
    { ...common, id: fixedId(ID_PREFIX.knowledge, CODES[3]), code: CODES[3], scopeType: "TENANT", tenantId: otherTenantId, classification: "CONFIDENTIAL" },
    { ...common, id: fixedId(ID_PREFIX.knowledge, CODES[4]), code: CODES[4], scopeType: "ENTITY", tenantId: otherEntity.tenantId, legalEntityId: otherEntityId, classification: "CONFIDENTIAL" },
    { ...common, id: fixedId(ID_PREFIX.knowledge, CODES[5]), code: CODES[5], scopeType: "COUNTRY", tenantId: healthTenantId, countryCode: otherCountry, classification: "CONFIDENTIAL" },
    { ...common, id: fixedId(ID_PREFIX.knowledge, CODES[6]), code: CODES[6], scopeType: "TENANT", tenantId: healthTenantId, classification: "HIGHLY_RESTRICTED" },
  ]);
});

afterAll(async () => {
  await cleanup();
  await pool.end();
});

async function retrieve(email: string, mutate?: (principal: Awaited<ReturnType<typeof seededPrincipal>>) => void) {
  const principal = await seededPrincipal(email);
  mutate?.(principal);
  return withTenantDatabaseContext(principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(principal);
    return retrieveGovernedMemory({ principal, scope, question: KEYWORD, asOf: "2026-08-23", limit: 20 });
  });
}

function refs(rows: Awaited<ReturnType<typeof retrieve>>) {
  return rows.map((row) => row.source.ref);
}

describe("Noelia memory integration with live PostgreSQL", () => {
  it("Tenant A -> Tenant B is DENY at query level", async () => {
    const rows = refs(await retrieve("health.ops@beyu.os"));
    expect(rows).toContain("NOELIA_TEST_HEALTH");
    expect(rows).not.toContain("NOELIA_TEST_OTHER_TENANT");
  });

  it("authorized global scope is ALLOW while enterprise memory is not global", async () => {
    const sectorRows = refs(await retrieve("health.ops@beyu.os"));
    expect(sectorRows).toContain("NOELIA_TEST_GLOBAL");
    expect(sectorRows).not.toContain("NOELIA_TEST_ENTERPRISE");

    const enterpriseRows = refs(await retrieve("governance@beyu.os"));
    expect(enterpriseRows).toContain("NOELIA_TEST_GLOBAL");
    expect(enterpriseRows).toContain("NOELIA_TEST_ENTERPRISE");
  });

  it("unauthorized entity memory is DENY even for an enterprise principal", async () => {
    const rows = refs(await retrieve("governance@beyu.os", (principal) => {
      principal.entityScope = [healthEntityId];
    }));
    expect(rows).not.toContain("NOELIA_TEST_ENTITY");
  });

  it("unauthorized country and above-clearance memory are DENY", async () => {
    const rows = refs(await retrieve("health.ops@beyu.os"));
    expect(healthCountry).not.toBe(otherCountry);
    expect(rows).not.toContain("NOELIA_TEST_COUNTRY");
    expect(rows).not.toContain("NOELIA_TEST_CLASSIFIED");
  });
});
