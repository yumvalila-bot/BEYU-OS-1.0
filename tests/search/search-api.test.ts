/**
 * BEYU OS — Shared Search capability: HTTP boundary.
 *
 * Runs against the real server (skips only when BEYU_TEST_BASE_URL is unset —
 * an explicitly configured but unreachable server FAILS the suite, matching
 * the repository's HTTP/E2E convention).
 *
 * Pins the security boundary at the wire level:
 *   - 401 unauthenticated; 403 for a principal WITHOUT platform:search.read
 *     (TENANT_MEMBER) — facility permission is mandatory;
 *   - 422 for malformed / over-length queries and out-of-range paging;
 *   - 429 rate limiting (60/60 s per principal, dedicated flood identity);
 *   - 405 for every mutation verb — search is read-only (CAP_POSTING intact);
 *   - request parameters (tenantId/entityId/classification/os) are never
 *     authorization inputs: injecting them changes nothing;
 *   - success audits store a `search:` sha256 fingerprint — the raw query is
 *     never persisted;
 *   - deep links re-check authorization: without a session (or with a
 *     non-entitled session) the canonical OS page redirects/denies;
 *   - the response envelope carries governed metadata only (9 fixed keys).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { pool } from "@/db";
import { apiGet, apiGetJson, login, serverAvailable } from "../helpers/http";
import { hashPassword } from "@/lib/crypto";
import { fixedId, ID_PREFIX } from "@/lib/ids";

const available = await serverAvailable();

const RUN = `SRCH${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
const FLOOD_EMAIL = `search.flood.${RUN.toLowerCase()}@beyu.os`;
const PLAIN_EMAIL = `search.plain.${RUN.toLowerCase()}@beyu.os`;

let admin: Client;
let ujenziCookie = "";
let floodCookie = "";
let plainCookie = ""; // TENANT_MEMBER: no platform:search.read
let ujenziUserId = "";

beforeAll(async () => {
  if (!available) return;
  admin = new Client({ connectionString: process.env.BEYU_ADMIN_DATABASE_URL! });
  await admin.connect();

  // Two ephemeral identities (cleaned up in afterAll):
  //  - FLOOD: SECTOR_OPERATOR @ UJENZI — entitled, used for the 429 loop;
  //  - PLAIN: TENANT_MEMBER @ UJENZI — deliberately NOT entitled to search.
  const [ujenziTenant] = (
    await admin.query(`select id from tenants where code='BEYU-UJENZI'`)
  ).rows as { id: string }[];
  const [sectorRole] = (await admin.query(`select id from roles where code='SECTOR_OPERATOR'`)).rows as {
    id: string;
  }[];
  const [memberRole] = (await admin.query(`select id from roles where code='TENANT_MEMBER'`)).rows as {
    id: string;
  }[];
  if (!ujenziTenant || !sectorRole || !memberRole) {
    throw new Error("seed tenants/roles missing — run npm run migrate && npm run seed");
  }
  const pwHash = await hashPassword(process.env.BEYU_BOOTSTRAP_PASSWORD!);

  for (const [email, roleId] of [
    [FLOOD_EMAIL, sectorRole.id],
    [PLAIN_EMAIL, memberRole.id],
  ] as const) {
    const partyId = fixedId(ID_PREFIX.party, `SRCH_${email.split("@")[0].toUpperCase()}`);
    const userId = fixedId(ID_PREFIX.user, `SRCH_${email.split("@")[0].toUpperCase()}`);
    await admin.query(
      `insert into parties (id, type, display_name, classification, kyc_status)
       values ($1,'PERSON','Search ${email}','CONFIDENTIAL','VERIFIED')
       on conflict (id) do nothing`,
      [partyId],
    );
    await admin.query(
      `insert into users (id, party_id, email, password_hash, primary_tenant_id, status)
       values ($1,$2,$3,$4,$5,'ACTIVE')
       on conflict (id) do update set password_hash=excluded.password_hash, status='ACTIVE'`,
      [userId, partyId, email, pwHash, ujenziTenant.id],
    );
    await admin.query(
      `insert into role_assignments (id, user_id, role_id, tenant_id, effective_from, granted_by, justification)
       values ($1,$2,$3,$4,'2024-01-01','SEARCH-TEST','ephemeral search test identity')
       on conflict do nothing`,
      [fixedId(ID_PREFIX.roleAssignment, `SRCH_${email.split("@")[0].toUpperCase()}_ROLE`), userId, roleId, ujenziTenant.id],
    );
  }
  const [ujenziUser] = (await admin.query(`select id from users where email='ujenzi.ops@beyu.os'`)).rows as {
    id: string;
  }[];
  ujenziUserId = ujenziUser.id;

  ujenziCookie = await login("ujenzi.ops@beyu.os");
  floodCookie = await login(FLOOD_EMAIL);
  plainCookie = await login(PLAIN_EMAIL);
}, 180_000);

afterAll(async () => {
  if (!admin) return;
  await admin.query(`delete from role_assignments where user_id in (select id from users where email in ($1,$2))`, [FLOOD_EMAIL, PLAIN_EMAIL]).catch(() => undefined);
  await admin.query(`delete from users where email in ($1,$2)`, [FLOOD_EMAIL, PLAIN_EMAIL]).catch(() => undefined);
  await admin.query(`delete from parties where display_name like 'Search search.%'`).catch(() => undefined);
  await admin.end().catch(() => undefined);
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("shared search — HTTP boundary", () => {
  it("401: unauthenticated search is refused", async () => {
    const res = await apiGetJson("/api/v1/search?q=hello");
    expect(res.status).toBe(401);
  });

  it("403: a TENANT_MEMBER (no platform:search.read) is refused, and the denial is audited", async () => {
    const res = await apiGetJson("/api/v1/search?q=hello", { cookie: plainCookie });
    expect(res.status).toBe(403);
    const body = res.body as { error?: { code?: string } };
    expect(body.error?.code).toBe("FORBIDDEN");

    const [plainUser] = (await admin.query(`select id from users where email=$1`, [PLAIN_EMAIL])).rows as {
      id: string;
    }[];
    const denied = await admin.query(
      `select count(*)::int n from audit_log where actor_user_id=$1 and action='search.query' and outcome='DENIED'`,
      [plainUser.id],
    );
    expect(denied.rows[0].n).toBeGreaterThan(0);
  });

  it("405: every mutation verb is refused — search is read-only", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await fetch(`${baseUrlFor()}/api/v1/search`, {
        method,
        headers: { cookie: ujenziCookie, "content-type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({ q: "x" }),
      });
      expect(res.status, method).toBe(405);
    }
  });

  it("422: malformed and out-of-range parameters are refused", async () => {
    const cases = [
      "/api/v1/search?q=a", // too short
      `/api/v1/search?q=${"x".repeat(201)}`, // too long
      "/api/v1/search?q=hello&limit=0",
      "/api/v1/search?q=hello&limit=51",
      "/api/v1/search?q=hello&offset=501",
      "/api/v1/search?q=hello&os=NOPE",
      "/api/v1/search?q=hello&type=lowercase",
    ];
    for (const path of cases) {
      const res = await apiGetJson(path, { cookie: ujenziCookie });
      expect(res.status, path).toBe(422);
      const body = res.body as { error?: { code?: string } };
      expect(body.error?.code, path).toBe("VALIDATION_FAILED");
    }
  });

  it("429: the per-principal rate limit (60/60 s) is enforced", async () => {
    let first429 = -1;
    for (let i = 0; i < 61; i++) {
      const res = await apiGetJson(`/api/v1/search?q=flood${i}`, { cookie: floodCookie });
      if (res.status === 429) {
        first429 = i;
        break;
      }
      expect(res.status, `request ${i}`).toBe(200);
    }
    expect(first429).toBeGreaterThanOrEqual(0); // 429 was enforced
    expect(first429).toBeGreaterThanOrEqual(60); // exactly at the 61st request
  });

  it("200: response envelope carries governed metadata only", async () => {
    const res = await apiGetJson(`/api/v1/search?q=search&limit=5`, { cookie: ujenziCookie });
    expect(res.status).toBe(200);
    const body = res.body as {
      data: {
        results: Record<string, unknown>[];
        total: number;
        sourcesSearched: string[];
      };
      meta: { traceId: string };
    };
    expect(typeof body.meta.traceId).toBe("string");
    expect(typeof body.data.total).toBe("number");
    expect(Array.isArray(body.data.sourcesSearched)).toBe(true);
    for (const hit of body.data.results) {
      expect(Object.keys(hit).sort()).toEqual([
        "classification",
        "deepLink",
        "id",
        "os",
        "rank",
        "snippet",
        "subtitle",
        "title",
        "type",
      ]);
      expect(hit.deepLink).toMatch(/^\/os\//);
    }
  });

  it("URL parameters are never authorization inputs (tenant/entity/classification injection)", async () => {
    const baseline = await apiGetJson(`/api/v1/search?q=search`, { cookie: ujenziCookie });
    expect(baseline.status).toBe(200);
    const injected = await apiGetJson(
      `/api/v1/search?q=search&tenantId=TEN_BEYU_FOUNDATION&entityId=LEN_X&classification=PUBLIC&scope=GLOBAL&tenant_code=BEYU-FOUNDATION`,
      { cookie: ujenziCookie },
    );
    expect(injected.status).toBe(200);
    const b = baseline.body as { data: { total: number } };
    const i = injected.body as { data: { total: number } };
    expect(i.data.total).toBe(b.data.total); // identical scope, identical result set
    // The ujenzi-scoped principal never sees the foundation registry row.
    const ids = ((injected.body as { data: { results: { id: string }[] } }).data.results).map((h) => h.id);
    expect(ids).not.toContain(`FDN_SRCH_A_`);
  });

  it("audit: success records a search: fingerprint, never the raw query", async () => {
    const token = `auditfingerprint${RUN}`;
    const res = await apiGetJson(`/api/v1/search?q=${token}`, { cookie: ujenziCookie });
    expect(res.status).toBe(200);
    const rows = await admin.query(
      `select object_id from audit_log where actor_user_id=$1 and action='search.query' and outcome='SUCCESS' order by occurred_at desc limit 1`,
      [ujenziUserId],
    );
    expect(rows.rows.length).toBe(1);
    const objectId = rows.rows[0].object_id as string;
    expect(objectId).toMatch(/^search:[0-9a-f]{32}$/);
    expect(objectId).not.toContain(token);
    // Nor anywhere else in the audit record.
    const full = (
      await admin.query(
        `select coalesce(reason,'')||coalesce(object_id,'')||coalesce(object_type,'') as all_text from audit_log where actor_user_id=$1 and action='search.query' and outcome='SUCCESS' order by occurred_at desc limit 1`,
        [ujenziUserId],
      )
    ).rows[0];
    expect(full.all_text).not.toContain(token);
  });

  it("deep links re-check authorization: no session → redirect, unentitled session → redirect/denial", async () => {
    // "ujenzi" deterministically matches the operator's own tenant row and
    // legal entity (seeded, always present) — the corpus is otherwise
    // fixture-independent by design.
    const res = await apiGetJson(`/api/v1/search?q=ujenzi&limit=3`, { cookie: ujenziCookie });
    expect(res.status).toBe(200);
    const hits = (res.body as { data: { results: { deepLink: string }[] } }).data.results;
    expect(hits.length).toBeGreaterThan(0);
    const deepLink = hits[0].deepLink;

    const anon = await fetch(`${baseUrlFor()}${deepLink}`, { redirect: "manual" });
    expect([302, 303, 307, 308]).toContain(anon.status); // no data without a session

    const unentitled = await fetch(`${baseUrlFor()}${deepLink}`, {
      headers: { cookie: plainCookie },
      redirect: "manual",
    });
    // A TENANT_MEMBER (no BEYU OS grant) is routed to the launcher — the page
    // guard, not the URL, decides. Either a redirect or a denial page, never data.
    if (unentitled.status === 200) {
      const html = await unentitled.text();
      expect(html).not.toContain(`FDN_SRCH_A_`);
      expect(/Authorisation denied|launcher/i.test(html)).toBe(true);
    } else {
      expect([302, 303, 307, 308]).toContain(unentitled.status);
    }
  });

  it("401 page-level: the search page route does not exist as a separate surface", async () => {
    // Search has exactly ONE surface: the API. There is no /search page.
    const page = await apiGet(`/search?q=hello`, ujenziCookie);
    expect([404]).toContain(page.status);
  });
});

function baseUrlFor(): string {
  return process.env.BEYU_TEST_BASE_URL || "http://localhost:3100";
}
