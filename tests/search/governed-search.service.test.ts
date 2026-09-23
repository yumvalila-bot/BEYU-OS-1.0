/**
 * BEYU OS — Shared Search capability: governed execution (service level).
 *
 * Drives `runGovernedSearch` inside the canonical transaction-scoped tenant
 * context (the same stack the HTTP boundary uses) with REAL principals and a
 * real PostgreSQL, and pins the governed contract:
 *
 *   AUTHORIZATION
 *     A. same-tenant authorized results are visible
 *     B. cross-tenant results are invisible
 *     C. entity-scoped principal: entity-bound sources filtered to the scope,
 *        entity-key-less sources REFUSED (fail-closed, never widened)
 *     D. classification above the ceiling is invisible (per source)
 *     E. per-source permission narrowing (no source permission → no results,
 *        facility permission alone grants nothing)
 *     F. unknown clearance fails closed (empty result set)
 *     G. knowledge: existing Noelia governance boundary (window, classification,
 *        entity scope) — Search does not expand Noelia authority
 *   CORRECTNESS
 *     H. name/title, description, exact-identifier and multi-type/multi-OS search
 *     I. relevance ordering, pagination (limit/offset + per-source cap)
 *     J. empty result; bounded parse (malformed / over-length queries)
 *   INDEX MAINTENANCE (trigger)
 *     K. INSERT creates the vector; UPDATE of a searchable field refreshes it;
 *        UPDATE of an unrelated field leaves it intact; DELETE removes it;
 *        pre-existing (seeded) rows are backfilled
 *   SECURITY
 *     L. snippets never expose non-surface fields (knowledge CONTENT matched but
 *        never rendered; document internals absent)
 *     M. the service is read-only (no audit/ledger side effects, no grants)
 *
 * Fixtures are inserted with the privileged admin role (the same convention as
 * the Foundation target-scope attack fixtures) and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import {
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "@/lib/authz";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { fixedId, ID_PREFIX } from "@/lib/ids";
import { type PermissionCode } from "@/lib/constants";
import { runGovernedSearch, type GovernedSearchResult } from "@/lib/search/service";
import { parseSearchQuery } from "@/lib/search/query";

const RUN = `SRCH${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

const T = {
  ujenzi: fixedId(ID_PREFIX.tenant, "BEYU_UJENZI"),
  foundation: fixedId(ID_PREFIX.tenant, "BEYU_FOUNDATION"),
  group: fixedId(ID_PREFIX.tenant, "BEYU_GROUP"),
};

// Fixture ids (deterministic within the run; unique across runs).
const F = {
  leA: `LEN_SRCH_A_${RUN}`,
  leB: `LEN_SRCH_B_${RUN}`,
  docA: `DOC_SRCH_A_${RUN}`,
  docARestricted: `DOC_SRCH_AR_${RUN}`,
  docB: `DOC_SRCH_B_${RUN}`,
  resGroup: `RES_SRCH_G_${RUN}`,
  resGroupHR: `RES_SRCH_GHR_${RUN}`,
  projA: `UJZP_SRCH_A_${RUN}`,
  projB: `UJZP_SRCH_B_${RUN}`,
  projCRestricted: `UJZP_SRCH_CR_${RUN}`,
  boqA: `UJZB_SRCH_A_${RUN}`,
  farmA: `FARM_SRCH_A_${RUN}`,
  farmB: `FARM_SRCH_B_${RUN}`,
  agProjA: `AGP_SRCH_A_${RUN}`,
  fdnA: `FDN_SRCH_A_${RUN}`,
  ksGlobal: `KS_SRCH_GLOBAL_${RUN}`,
  ksExpired: `KS_SRCH_EXPIRED_${RUN}`,
  ksHR: `KS_SRCH_HR_${RUN}`,
  ksEntity: `KS_SRCH_ENTITY_${RUN}`,
};

let admin: Client;

async function principalFor(email: string, overrides: Partial<Principal> = {}): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) throw new Error(`seed user ${email} missing — run npm run seed`);
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  };
}

async function search(principal: Principal, q: string, extra: Record<string, string> = {}): Promise<GovernedSearchResult> {
  return withTenantDatabaseContext(principal, async () => {
    const parsed = parseSearchQuery(new URLSearchParams({ q, ...extra }));
    if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.details)}`);
    return runGovernedSearch(principal, parsed.value);
  });
}

const ids = (r: GovernedSearchResult, type?: string) =>
  r.results.filter((x) => (type ? x.type === type : true)).map((x) => x.id);

beforeAll(async () => {
  admin = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL! });
  await admin.connect();
  // Clean any stale fixtures from a crashed prior run.
  await admin.query(`delete from ujenzi_boqs where id like $1`, [`UJZB_SRCH_%_${RUN}`]);
  await admin.query(`delete from ujenzi_projects where id like $1`, [`UJZP_SRCH_%_${RUN}`]);
  await admin.query(`delete from agriculture_projects where id like $1`, [`AGP_SRCH_%_${RUN}`]);
  await admin.query(`delete from agriculture_farms where id like $1`, [`FARM_SRCH_%_${RUN}`]);
  await admin.query(`delete from foundations where id like $1`, [`FDN_SRCH_%_${RUN}`]);
  await admin.query(`delete from knowledge_sources where id like $1`, [`KS_SRCH_%_${RUN}`]);
  await admin.query(`delete from resolutions where id like $1`, [`RES_SRCH_%_${RUN}`]);
  await admin.query(`delete from documents where id like $1`, [`DOC_SRCH_%_${RUN}`]);
  await admin.query(`delete from legal_entities where id like $1`, [`LEN_SRCH_%_${RUN}`]);

  await admin.query(
    `insert into legal_entities (id, tenant_id, code, legal_name, entity_type, country_code, effective_from, classification)
     values ($1,$2,'SRCH-A-${RUN}','Search Ujenzi Alpha Ltd ${RUN}','OPERATING_COMPANY','TZ','2024-01-01','INTERNAL'),
            ($3,$2,'SRCH-B-${RUN}','Search Ujenzi Beta Ltd ${RUN}','OPERATING_COMPANY','TZ','2024-01-01','INTERNAL')`,
    [F.leA, T.ujenzi, F.leB],
  );
  await admin.query(
    `insert into documents (id, tenant_id, file_name, file_type, category, description, version, source, uploaded_by, checksum, storage_uri, retention_code, classification)
     values ($1,$2,'search-alpha-manual.pdf','pdf','MANUAL','Alpha handbook for governed search ${RUN}','1','SEED','seed',$6,'mem://srch-a','RET-STD','CONFIDENTIAL'),
            ($3,$2,'search-alpha-restricted-deed.pdf','pdf','DEED','Restricted deed for search fixture ${RUN}','1','SEED','seed',$7,'mem://srch-ar','RET-STD','RESTRICTED'),
            ($4,$5,'search-foundation-charter.pdf','pdf','CHARTER','Foundation charter for search fixture ${RUN}','1','SEED','seed',$8,'mem://srch-b','RET-STD','CONFIDENTIAL')`,
    [F.docA, T.ujenzi, F.docARestricted, F.docB, T.foundation, "a".repeat(64), "b".repeat(64), "c".repeat(64)],
  );
  await admin.query(
    `insert into resolutions (id, tenant_id, body_id, reference, title, category, summary, rationale, data_basis, consequences, proposed_by, status, classification)
     values ($1,$2,'GOV_GROUP_BOARD','RES-SRCH-G-${RUN}','Search governance resolution ${RUN}','OTHER','Governance fixture for search ${RUN}','fixture','fixture','fixture','seed','APPROVED','CONFIDENTIAL'),
            ($3,$2,'GOV_GROUP_BOARD','RES-SRCH-GHR-${RUN}','Search highly restricted resolution ${RUN}','OTHER','HR fixture for search ${RUN}','fixture','fixture','fixture','seed','APPROVED','HIGHLY_RESTRICTED')`,
    [F.resGroup, T.group, F.resGroupHR],
  );
  await admin.query(
    `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, client, status, classification)
     values ($1,$2,$3,'SRCH-BR-1-${RUN}','Search Alpha Bridge ${RUN}','TZ','Alpha Client','PLANNED','CONFIDENTIAL'),
            ($4,$2,$5,'SRCH-BR-2-${RUN}','Search Beta Bridge ${RUN}','TZ','Beta Client','PLANNED','INTERNAL'),
            ($6,$2,$3,'SRCH-BR-3-${RUN}','Search Gamma Bridge ${RUN}','TZ','Gamma Client','PLANNED','RESTRICTED')`,
    [F.projA, T.ujenzi, F.leA, F.projB, F.leB, F.projCRestricted],
  );
  await admin.query(
    `insert into ujenzi_boqs (id, tenant_id, project_id, version, status, currency, notes, classification)
     values ($1,$2,$3,1,'DRAFT','TZS','search boq fixture notes ${RUN}','CONFIDENTIAL')`,
    [F.boqA, T.ujenzi, F.projA],
  );
  await admin.query(
    `insert into agriculture_farms (id, tenant_id, legal_entity_id, code, name, country_code, status, classification)
     values ($1,$2,$3,'SRCH-FARM-A-${RUN}','Search Alpha Farm ${RUN}','TZ','ACTIVE','INTERNAL'),
            ($4,$2,$5,'SRCH-FARM-B-${RUN}','Search Beta Farm ${RUN}','TZ','ACTIVE','CONFIDENTIAL')`,
    [F.farmA, T.ujenzi, F.leA, F.farmB, F.leB],
  );
  await admin.query(
    `insert into agriculture_projects (id, tenant_id, legal_entity_id, code, name, status, classification)
     values ($1,$2,$3,'SRCH-AGP-1-${RUN}','Search Alpha AgProject ${RUN}','ACTIVE','INTERNAL')`,
    [F.agProjA, T.ujenzi, F.leA],
  );
  await admin.query(
    `insert into foundations (id, tenant_id, code, legal_name, legal_vehicle, country_code, status, classification)
     values ($1,$2,'SRCH-FDN-1-${RUN}','Search Foundation Alpha ${RUN}','FOUNDATION','TZ','PROPOSED','CONFIDENTIAL')`,
    [F.fdnA, T.foundation],
  );
  const krows = [
    { id: F.ksGlobal, code: `KS-G-${RUN}`, title: "Search Global Knowledge Fixture", scope: "GLOBAL", classification: "INTERNAL", reviewDate: "2027-01-01", extra: "zebraquest" },
    { id: F.ksExpired, code: `KS-E-${RUN}`, title: "Search Expired Knowledge Fixture", scope: "GLOBAL", classification: "INTERNAL", reviewDate: "2025-01-01", extra: "quasarwind" },
    { id: F.ksHR, code: `KS-HR-${RUN}`, title: "Search Restricted Knowledge Fixture", scope: "GLOBAL", classification: "HIGHLY_RESTRICTED", reviewDate: "2027-01-01", extra: "nebulate" },
    { id: F.ksEntity, code: `KS-EN-${RUN}`, title: "Search Entity Knowledge Fixture", scope: "ENTITY", classification: "INTERNAL", reviewDate: "2027-01-01", extra: "vortexa" },
  ];
  for (const k of krows) {
    if (k.scope === "ENTITY") {
      await admin.query(
        `insert into knowledge_sources (id, code, title, domain, owner_role, provenance, scope_type, tenant_id, legal_entity_id, classification, effective_from, review_date, content, keywords)
         values ($1,$2,$3,'SEARCH','PLATFORM_ADMIN','search fixture','ENTITY',$4,$5,$6,'2024-01-01',$7,$8,'{"search":"fixture"}')`,
        [k.id, k.code, k.title, T.ujenzi, F.leA, k.classification, k.reviewDate, `Governed knowledge fixture containing token ${k.extra} for search tests.`],
      );
    } else {
      await admin.query(
        `insert into knowledge_sources (id, code, title, domain, owner_role, provenance, scope_type, classification, effective_from, review_date, content, keywords)
         values ($1,$2,$3,'SEARCH','PLATFORM_ADMIN','search fixture','GLOBAL',$4,'2024-01-01',$5,$6,'{"search":"fixture"}')`,
        [k.id, k.code, k.title, k.classification, k.reviewDate, `Governed knowledge fixture containing token ${k.extra} for search tests.`],
      );
    }
  }
}, 60_000);

afterAll(async () => {
  if (!admin) return;
  await admin.query(`delete from ujenzi_boqs where id like $1`, [`UJZB_SRCH_%_${RUN}`]);
  await admin.query(`delete from ujenzi_projects where id like $1`, [`UJZP_SRCH_%_${RUN}`]);
  await admin.query(`delete from agriculture_projects where id like $1`, [`AGP_SRCH_%_${RUN}`]);
  await admin.query(`delete from agriculture_farms where id like $1`, [`FARM_SRCH_%_${RUN}`]);
  await admin.query(`delete from foundations where id like $1`, [`FDN_SRCH_%_${RUN}`]);
  await admin.query(`delete from knowledge_sources where id like $1`, [`KS_SRCH_%_${RUN}`]);
  await admin.query(`delete from resolutions where id like $1`, [`RES_SRCH_%_${RUN}`]);
  await admin.query(`delete from documents where id like $1`, [`DOC_SRCH_%_${RUN}`]);
  await admin.query(`delete from legal_entities where id like $1`, [`LEN_SRCH_%_${RUN}`]);
  await admin.end();
});

describe("Shared Search — authorization", () => {
  it("A. same-tenant authorized results are visible (ujenzi operator)", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const r = await search(p, "search");
    expect(ids(r, "UJENZI_PROJECT")).toContain(F.projA);
    expect(ids(r, "UJENZI_PROJECT")).toContain(F.projB);
    expect(ids(r, "UJENZI_BOQ")).toContain(F.boqA);
    expect(ids(r, "LEGAL_ENTITY")).toContain(F.leA);
    expect(ids(r, "LEGAL_ENTITY")).toContain(F.leB);
    expect(ids(r, "DOCUMENT")).toContain(F.docA);
    expect(ids(r, "AGRICULTURE_FARM")).toContain(F.farmA);
    expect(ids(r, "AGRICULTURE_FARM")).toContain(F.farmB);
    expect(ids(r, "AGRICULTURE_PROJECT")).toContain(F.agProjA);
    expect(ids(r, "KNOWLEDGE")).toContain(F.ksGlobal);
    expect(ids(r, "KNOWLEDGE")).toContain(F.ksEntity);
    // The tenant registry is searchable too (query matching its name).
    const t = await search(p, "ujenzi");
    expect(ids(t, "TENANT")).toContain(T.ujenzi);
    // …and only the tenant within this principal's scope.
    expect(ids(t, "TENANT")).not.toContain(T.foundation);
  });

  it("B. cross-tenant results are invisible", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const r = await search(p, "search");
    // Tenant-FOUNDATION rows must not appear for a UJENZI-scoped principal.
    expect(ids(r, "DOCUMENT")).not.toContain(F.docB);
    expect(ids(r, "FOUNDATION")).not.toContain(F.fdnA);
    // Even when the query matches the foreign tenant's name, its row is
    // outside this principal's tenant scope.
    const t = await search(p, "foundation");
    expect(ids(t, "TENANT")).not.toContain(T.foundation);
    // Group-tenant governance rows are outside the tenant scope too.
    expect(ids(r, "GOVERNANCE_RESOLUTION")).not.toContain(F.resGroup);
    // And the full result set must not name any other tenant's records at all.
    for (const hit of r.results) {
      expect(hit.id).not.toMatch(new RegExp(`^${F.docB}|^${F.fdnA}`));
    }
  });

  it("B2. the foundation principal sees the foundation registry row (same-tenant positive control)", async () => {
    const p = await principalFor("foundation.director@beyu.os");
    const r = await search(p, "search");
    expect(ids(r, "FOUNDATION")).toContain(F.fdnA);
  });

  it("C. entity-scoped principal: entity-bound sources filtered, key-less sources refused", async () => {
    const base = await principalFor("ujenzi.ops@beyu.os");
    const p = { ...base, entityScope: [F.leB] };
    const r = await search(p, "search");
    // Entity-bound sources: only entity-B rows.
    expect(ids(r, "UJENZI_PROJECT")).toEqual([F.projB]);
    expect(ids(r, "AGRICULTURE_FARM")).toEqual([F.farmB]);
    expect(ids(r, "LEGAL_ENTITY")).toEqual([F.leB]);
    // The BOQ belongs to an entity-A project → filtered out.
    expect(ids(r, "UJENZI_BOQ")).not.toContain(F.boqA);
    // Entity-key-less sources are REFUSED, not widened (fail-closed).
    expect(r.sourcesSearched).not.toContain("TENANT");
    expect(r.sourcesSearched).not.toContain("DOCUMENT");
    expect(ids(r, "DOCUMENT")).toEqual([]);
    // Global knowledge stays visible (scope GLOBAL); entity-scoped knowledge
    // for entity A is not visible to an entity-B scope.
    expect(ids(r, "KNOWLEDGE")).toContain(F.ksGlobal);
    expect(ids(r, "KNOWLEDGE")).not.toContain(F.ksEntity);
  });

  it("D. classification above the ceiling is invisible (ujenzi=CONFIDENTIAL)", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const r = await search(p, "search");
    expect(ids(r, "DOCUMENT")).not.toContain(F.docARestricted); // RESTRICTED
    expect(ids(r, "UJENZI_PROJECT")).not.toContain(F.projCRestricted); // RESTRICTED
    expect(ids(r, "KNOWLEDGE")).not.toContain(F.ksHR); // HIGHLY_RESTRICTED
    for (const hit of r.results) {
      expect(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]).toContain(hit.classification);
    }
  });

  it("D2. the group CEO (HIGHLY_RESTRICTED) sees the above-ceiling rows", async () => {
    const p = await principalFor("ceo@beyu.os");
    const r = await search(p, "search");
    expect(ids(r, "DOCUMENT")).toContain(F.docARestricted);
    expect(ids(r, "UJENZI_PROJECT")).toContain(F.projCRestricted);
    expect(ids(r, "KNOWLEDGE")).toContain(F.ksHR);
    expect(ids(r, "GOVERNANCE_RESOLUTION")).toContain(F.resGroupHR);
  });

  it("E. facility permission alone grants nothing: a principal without a source read gets no results from that source", async () => {
    // ujenzi.ops holds platform:search.read but NOT foundation:registry.read
    // and NOT governance:resolution.read: those sources are simply not searched.
    const p = await principalFor("ujenzi.ops@beyu.os");
    const r = await search(p, "search");
    expect(r.sourcesSearched).not.toContain("FOUNDATION");
    expect(r.sourcesSearched).not.toContain("GOVERNANCE_RESOLUTION");
    expect(ids(r, "FOUNDATION")).toEqual([]);
    expect(ids(r, "GOVERNANCE_RESOLUTION")).toEqual([]);
    // A principal with NEITHER the facility nor any source read (TENANT_MEMBER
    // shape) has nothing to search — the service finds no eligible source.
    const bare = { ...p, permissions: new Set<PermissionCode>(), roles: ["TENANT_MEMBER"] };
    const r2 = await search(bare, "search");
    expect(r2.sourcesSearched).toEqual([]);
    expect(r2.results).toEqual([]);
  });

  it("F. unknown clearance fails closed to an empty result set", async () => {
    const p = { ...(await principalFor("ujenzi.ops@beyu.os")), clearance: "SUSAN_CLEARANCE" as never };
    const r = await search(p, "search");
    expect(r.results).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.sourcesSearched).toEqual([]);
  });

  it("G. knowledge respects the existing Noelia governance boundary (window + ceiling + scope)", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const r = await search(p, "search");
    // Expired review window: matched by nothing — never returned.
    expect(ids(r, "KNOWLEDGE")).not.toContain(F.ksExpired);
    // Ceiling: HIGHLY_RESTRICTED hidden at CONFIDENTIAL.
    expect(ids(r, "KNOWLEDGE")).not.toContain(F.ksHR);
    // Entity-scoped knowledge for an out-of-scope entity is not returned.
    const scoped = { ...p, entityScope: [F.leB] };
    const r2 = await search(scoped, "search");
    expect(ids(r2, "KNOWLEDGE")).not.toContain(F.ksEntity);
    // The expired row must not match even when queried by its unique token.
    const r3 = await search(p, "quasarwind");
    expect(ids(r3, "KNOWLEDGE")).not.toContain(F.ksExpired);
  });
});

describe("Shared Search — correctness", () => {
  it("H. name/title, description and exact-identifier search", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const byTitle = await search(p, "Search Alpha Bridge");
    expect(ids(byTitle, "UJENZI_PROJECT")).toContain(F.projA);
    const byDescription = await search(p, "Alpha handbook");
    expect(ids(byDescription, "DOCUMENT")).toContain(F.docA);
    const byCode = await search(p, `SRCH-BR-2-${RUN}`);
    expect(ids(byCode, "UJENZI_PROJECT")).toContain(F.projB);
  });

  it("H2. one query spans multiple resource types across multiple OSes", async () => {
    const p = await principalFor("ceo@beyu.os");
    const r = await search(p, "search");
    const osSeen = new Set(r.results.map((x) => x.os));
    expect(osSeen.has("BEYU")).toBe(true);
    expect(osSeen.has("UJENZI")).toBe(true);
    expect(osSeen.has("AGRICULTURE")).toBe(true);
    expect(osSeen.has("FOUNDATION")).toBe(true);
    const typesSeen = new Set(r.results.map((x) => x.type));
    expect(typesSeen.size).toBeGreaterThanOrEqual(6);
  });

  it("I. relevance ordering: higher-ranked row first", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const id1 = `UJZP_RANK1_${RUN}`;
    const id2 = `UJZP_RANK2_${RUN}`;
    await admin.query(
      `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, status, classification)
       values ($1,$2,$3,'RANK-1-${RUN}','Rankone Zephyr ${RUN}','TZ','PLANNED','INTERNAL'),
              ($4,$2,$3,'RANK-2-${RUN}','Zephyr Ranktwo ${RUN} zephyr','TZ','PLANNED','INTERNAL')`,
      [id1, T.ujenzi, F.leA, id2],
    );
    try {
      const r = await search(p, "zephyr");
      const idx1 = ids(r, "UJENZI_PROJECT").indexOf(id1);
      const idx2 = ids(r, "UJENZI_PROJECT").indexOf(id2);
      expect(idx1).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeLessThan(idx1); // the zephyr-zephyr row ranks higher
    } finally {
      await admin.query(`delete from ujenzi_projects where id in ($1,$2)`, [id1, id2]);
    }
  });

  it("I2. pagination: limit/offset + honest per-source-capped total", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const created: string[] = [];
    for (let i = 0; i < 30; i++) {
      const id = `UJZP_PAG_${RUN}_${i}`;
      created.push(id);
      await admin.query(
        `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, status, classification)
         values ($1,$2,$3,'PAGINEX-${RUN}-${i}','Paginex Tower ${i} ${RUN}','TZ','PLANNED','INTERNAL')`,
        [id, T.ujenzi, F.leA],
      );
    }
    try {
      const page1 = await search(p, "paginex", { limit: "10", offset: "0" });
      expect(page1.results.filter((x) => x.type === "UJENZI_PROJECT")).toHaveLength(10);
      const page2 = await search(p, "paginex", { limit: "10", offset: "10" });
      expect(page2.results.filter((x) => x.type === "UJENZI_PROJECT")).toHaveLength(10);
      const page3 = await search(p, "paginex", { limit: "10", offset: "20" });
      const projPage3 = page3.results.filter((x) => x.type === "UJENZI_PROJECT");
      expect(projPage3).toHaveLength(5); // 25 per-source cap, not 30
      expect(page1.total).toBeLessThanOrEqual(25);
      // No overlap between pages.
      const s1 = new Set(ids(page1));
      for (const id of ids(page3)) expect(s1.has(id)).toBe(false);
    } finally {
      await admin.query(
        `delete from ujenzi_projects where id = any($1::text[])`,
        [created],
      );
    }
  });

  it("J. empty result and bounded parsing (malformed / over-length queries)", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const r = await search(p, "zqxwvnotatoken");
    expect(r.results).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.sourcesSearched.length).toBeGreaterThan(0); // sources WERE searched

    expect(parseSearchQuery(new URLSearchParams({ q: "a" })).ok).toBe(false);
    expect(parseSearchQuery(new URLSearchParams({ q: "x".repeat(201) })).ok).toBe(false);
    expect(parseSearchQuery(new URLSearchParams({ q: "x".repeat(200) })).ok).toBe(true);
    expect(parseSearchQuery(new URLSearchParams({ q: "hello", limit: "0" })).ok).toBe(false);
    expect(parseSearchQuery(new URLSearchParams({ q: "hello", limit: "51" })).ok).toBe(false);
    expect(parseSearchQuery(new URLSearchParams({ q: "hello", offset: "501" })).ok).toBe(false);
    expect(parseSearchQuery(new URLSearchParams({ q: "hello", os: "NOPE" })).ok).toBe(false);
    expect(parseSearchQuery(new URLSearchParams({ q: "hello", type: "lowercase" })).ok).toBe(false);
    // Pathological FTS operator input degrades to a normal query, never an error.
    const pathological = '"quoted AND (unbalanced OR *"';
    expect(parseSearchQuery(new URLSearchParams({ q: pathological })).ok).toBe(true);
  });
});

describe("Shared Search — index maintenance (0066 trigger)", () => {
  it("K. INSERT creates a searchable vector; UPDATE refreshes; unrelated UPDATE is intact; DELETE removes", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const id = `UJZP_MAINT_${RUN}`;
    await admin.query(
      `insert into ujenzi_projects (id, tenant_id, legal_entity_id, code, name, country_code, status, classification)
       values ($1,$2,$3,'MAINT-1-${RUN}','Maintenwick Tower ${RUN}','TZ','PLANNED','INTERNAL')`,
      [id, T.ujenzi, F.leA],
    );
    try {
      const inserted = await search(p, "maintenwick");
      expect(ids(inserted, "UJENZI_PROJECT")).toContain(id);

      const before = (await admin.query(`select search_tsv::text v from ujenzi_projects where id=$1`, [id])).rows[0].v;
      // Searchable-field update → vector refreshed.
      await admin.query(`update ujenzi_projects set name='Zorblatt Tower ${RUN}' where id=$1`, [id]);
      const afterRename = (await admin.query(`select search_tsv::text v from ujenzi_projects where id=$1`, [id])).rows[0].v;
      expect(afterRename).not.toBe(before);
      const oldGone = await search(p, "maintenwick");
      expect(ids(oldGone, "UJENZI_PROJECT")).not.toContain(id);
      const newFound = await search(p, "zorblatt");
      expect(ids(newFound, "UJENZI_PROJECT")).toContain(id);

      // Unrelated-field update → vector byte-identical.
      await admin.query(`update ujenzi_projects set contract_ref='CR-MAINT-${RUN}' where id=$1`, [id]);
      const afterUnrelated = (await admin.query(`select search_tsv::text v from ujenzi_projects where id=$1`, [id])).rows[0].v;
      expect(afterUnrelated).toBe(afterRename);
      const stillFound = await search(p, "zorblatt");
      expect(ids(stillFound, "UJENZI_PROJECT")).toContain(id);
    } finally {
      await admin.query(`delete from ujenzi_projects where id=$1`, [id]);
    }
    const gone = await search(p, "zorblatt");
    expect(ids(gone, "UJENZI_PROJECT")).not.toContain(id);
  });

  it("K2. pre-existing (seeded) rows are backfilled and searchable", async () => {
    // Seed tenants predate 0066; the backfill UPDATE made them searchable.
    const p = await principalFor("ceo@beyu.os");
    const r = await search(p, "tanzania");
    expect(ids(r, "TENANT")).toContain(fixedId(ID_PREFIX.tenant, "BEYU_TZ"));
  });
});

describe("Shared Search — security surface", () => {
  it("L. knowledge content is matched for findability but NEVER rendered in results", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    // Query by a token that exists ONLY in the knowledge content column.
    const r = await search(p, "zebraquest");
    const k = r.results.find((x) => x.type === "KNOWLEDGE" && x.id === F.ksGlobal);
    expect(k, "content-token search must find the knowledge row").toBeTruthy();
    // But no rendered field may expose the content.
    for (const hit of r.results) {
      expect(`${hit.title} ${hit.subtitle ?? ""} ${hit.snippet ?? ""}`).not.toContain("zebraquest");
    }
    // The result payload carries no raw-record fields at all.
    for (const hit of r.results) {
      expect(Object.keys(hit).sort()).toEqual(
        ["classification", "deepLink", "id", "os", "rank", "snippet", "subtitle", "title", "type"],
      );
    }
  });

  it("L2. document snippets never expose non-surface fields (checksum/storage_uri)", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const r = await search(p, "Alpha handbook");
    const d = r.results.find((x) => x.id === F.docA);
    expect(d).toBeTruthy();
    if (!d) throw new Error("document fixture missing from results");
    const rendered = `${d.title} ${d.subtitle ?? ""} ${d.snippet ?? ""}`;
    expect(rendered).not.toContain("mem://srch-a"); // storage_uri
    expect(rendered).not.toContain("RET-STD"); // retention_code
  });

  it("M. the service is read-only: no audit/ledger side effects, no new grants", async () => {
    const p = await principalFor("ujenzi.ops@beyu.os");
    const before = (await admin.query(`select count(*)::int n from audit_log`)).rows[0].n;
    const r = await search(p, "search");
    const after = (await admin.query(`select count(*)::int n from audit_log`)).rows[0].n;
    expect(after).toBe(before); // no writes at all
    expect(r.results.length).toBeGreaterThan(0);
    // Search grants nothing: the principal's permissions are exactly what the
    // role granted — no search-adjacent capability appears out of nowhere.
    for (const perm of p.permissions) {
      expect(perm.startsWith("finance:posting")).toBe(false);
    }
    expect(r.results.every((h) => typeof h.deepLink === "string" && h.deepLink.startsWith("/os/"))).toBe(true);
  });
});
