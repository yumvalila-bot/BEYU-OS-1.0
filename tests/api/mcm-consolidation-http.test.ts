/**
 * MULTI_COMPANY_MANAGEMENT — the consolidation boundary, over real HTTP.
 *
 * Proves at the transport layer what the service layer claims:
 *
 *   1. an unauthenticated caller gets 401 and no data;
 *   2. a session without the permission gets 403 at the guard — before any of the
 *      engine's own reasoning runs;
 *   3. **a caller cannot supply an FX rate.** The prepare body is `.strict()`, so
 *      `fxRate` — and any plausible alternative name — is rejected with the canonical
 *      422 rather than ignored. This is the single most important assertion in the
 *      file: a consolidation figure the caller can scale is a figure the caller made up;
 *   4. a run that cannot be honestly computed comes back as a governed 409 with a
 *      message naming what is missing, not a 500 and not a run full of zeros;
 *   5. review of an unknown run is 404, and the read side still answers.
 *
 * The refusals asserted here are the engine's real ones on the seeded database: with
 * no company profile marking any entity as consolidated, and no financial period for
 * the far-future code used below, there is nothing to consolidate, and the honest
 * answer is a refusal. `tests/mcm/consolidation.test.ts` covers the case where a run
 * IS written; this file covers the transport around all of it.
 *
 * Skipped when no server is running (BEYU_TEST_BASE_URL), like the other HTTP suites.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { consolidationRuns } from "../../src/db/schema";
import { apiGetJson, apiPatch, apiPost, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
const RUN = `H${Date.now().toString(36).toUpperCase().slice(-6)}`;
const PERIOD_YEAR = 2040 + (Date.now() % 400);
const BODY = {
  code: `CON-HTTP-${RUN}`,
  periodCode: `${PERIOD_YEAR}-11`,
  reportingCurrency: "TZS",
  asOf: `${PERIOD_YEAR}-11-30`,
  reason: "HTTP boundary contract test; asserts no financial consequence.",
};

describe.skipIf(!available)("MCM consolidation HTTP boundary", () => {
  let cfo = "";
  let governance = "";
  let sector = "";

  beforeAll(async () => {
    cfo = await login("cfo@beyu.os"); // mcm:consolidation.prepare + .review
    governance = await login("governance@beyu.os"); // mcm:consolidation.read only
    sector = await login("health.ops@beyu.os"); // a sector tenant, no group consolidation rights
    expect(cfo).toBeTruthy();
    expect(governance).toBeTruthy();
    expect(sector).toBeTruthy();
  }, 240_000);

  afterAll(async () => {
    // Nothing below should have written a run, and an `afterAll` that assumes that
    // is how a suite starts lying about its own cleanliness. This is the belt.
    const pattern = `CON-HTTP-${RUN}%`;
    await db.execute(sql`delete from consolidation_adjustments where run_id in (select id from consolidation_runs where code like ${pattern})`);
    await db.execute(sql`delete from consolidation_entities where run_id in (select id from consolidation_runs where code like ${pattern})`);
    await db.execute(sql`delete from consolidation_runs where code like ${pattern}`);
  });

  it("401 — an unauthenticated preparation is refused before anything else", async () => {
    const res = await apiPost("/api/v1/mcm/consolidation", BODY);
    expect(res.status).toBe(401);
  });

  it("403 — a sector-tenant session cannot prepare a group consolidation", async () => {
    const res = await apiPost<{ error?: { code?: string } }>(`/api/v1/mcm/consolidation?run=${RUN}`, BODY, { cookie: sector });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("FORBIDDEN");
  });

  it("403 — a reader of consolidation cannot review it; the two authorities are separate", async () => {
    const res = await apiPatch<{ error?: { code?: string } }>(`/api/v1/mcm/consolidation?review=${RUN}`, {
      runId: "CONR_does_not_exist_at_all",
      decision: "REVIEWED",
      note: "Governance officer attempting a review they are not authorised to perform.",
    }, { cookie: governance });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("FORBIDDEN");
  });

  it("422 — an FX rate in the request body is rejected, not honoured and not ignored", async () => {
    // ONE post here, on purpose. `mcm:consolidation.prepare` is rate-limited at 6 per
    // minute and that control is the point of the route, so this suite does not
    // hammer it; `tests/mcm/consolidation.test.ts` asserts the schema rejects every
    // plausible rate-carrying key directly, without a request per variant.
    const res = await apiPost<{ error?: { code?: string } }>(`/api/v1/mcm/consolidation?smuggle=${RUN}`, {
      ...BODY,
      fxRate: "2500",
      rateSet: [{ base: "TZS", quote: "USD", rate: "0.0004" }],
    }, { cookie: cfo });
    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe("VALIDATION_FAILED");
  });

  it("422 — a run code that could not be stored safely is refused at the boundary", async () => {
    const res = await apiPost<{ error?: { code?: string } }>(`/api/v1/mcm/consolidation?badcode=${RUN}`, { ...BODY, code: "lower case with spaces" }, { cookie: cfo });
    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe("VALIDATION_FAILED");
  });

  it("409 — a consolidation that cannot be honestly computed is refused with its reason", async () => {
    const res = await apiPost<{ error?: { code?: string; message?: string } }>(`/api/v1/mcm/consolidation?refuse=${RUN}`, BODY, { cookie: cfo });
    expect(res.status).toBe(409);
    expect(["NO_CONSOLIDATED_ENTITIES", "NO_PERIODS_FOR_PERIOD_CODE"]).toContain(res.body?.error?.code);
    // The refusal explains itself in terms a reader can act on, rather than
    // returning an empty run.
    expect(String(res.body?.error?.message)).toMatch(/consolidat|financial period/i);
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(consolidationRuns)
      .where(eq(consolidationRuns.code, BODY.code));
    expect(Number(row.n), "a refusal must not leave a run row behind").toBe(0);
  });

  it("404 — reviewing a run that does not exist says so", async () => {
    const res = await apiPatch<{ error?: { code?: string } }>(`/api/v1/mcm/consolidation?id=${RUN}`, {
      runId: "CONR_not_a_run_anywhere",
      decision: "REVIEWED",
      note: "Boundary test against a run id that exists nowhere.",
    }, { cookie: cfo });
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe("RUN_NOT_FOUND");
  });

  it("200 — the read side still answers, and says so when it is empty", async () => {
    const res = await apiGetJson<{ data?: { consolidation?: { runs?: unknown[]; restrictedReason?: string | null } } }>(
      "/api/v1/mcm/consolidation",
      { cookie: cfo },
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.data?.consolidation?.runs)).toBe(true);
  });
});
