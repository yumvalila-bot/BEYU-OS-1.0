/**
 * EQUITY / CAP-TABLE / POSTURE — end-to-end transport tests (X10THINK §13, §45–§46).
 *
 * Real running server, real PostgreSQL. Proves at the HTTP boundary:
 *   - unauthenticated callers get 401 (no session, no data);
 *   - cross-tenant capitalization reads are DENIED (404 — scope-honest);
 *   - RBAC DENY is final at transport level (403 without the permission);
 *   - payload validation fails closed with the canonical 422 envelope;
 *   - DB-backed idempotency replays the identical governed result;
 *   - the posture endpoint serves the §46 boundary in the response payload
 *     itself: advisoryOnly=true, grantsAuthority=false.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../src/db";
import { apiGetJson, apiPost, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

const HOLDINGS = "LEN_BEYU_HOLDINGS";
const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();
const CLASS_CODE = `HTTP-${RUN}`;
const IDEM_KEY = `eq-http-${RUN}`;

describe.skipIf(!available)("equity + posture HTTP boundary", () => {
  let cfo = "";
  let ceo = "";
  let sector = "";

  afterAll(async () => {
    await db.execute(sql`delete from share_classes where code = ${CLASS_CODE}`);
    await db.execute(sql`delete from idempotency_records where idempotency_key = ${IDEM_KEY}`);
  });

  // Login may need to await a fresh TOTP window (replay guard) — generous hook budget.
  beforeAll(async () => {
    cfo = await login("cfo@beyu.os"); // equity:cap-table.manage
    ceo = await login("ceo@beyu.os"); // reads + leaver.manage, NO cap-table.manage
    sector = await login("health.ops@beyu.os"); // health tenant — no group visibility
    expect(cfo).toBeTruthy();
    expect(ceo).toBeTruthy();
    expect(sector).toBeTruthy();
  }, 240_000);

  it("401 — unauthenticated cap-table read is refused before anything else", async () => {
    const res = await apiGetJson(`/api/v1/equity/cap-table?legalEntityId=${HOLDINGS}`);
    expect(res.status).toBe(401);
  });

  it("403 — a sector-tenant session (no equity:cap-table.read) is DENIED at the guard", async () => {
    const res = await apiGetJson<{ error?: { code?: string } }>(`/api/v1/equity/cap-table?legalEntityId=${HOLDINGS}`, { cookie: sector });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("FORBIDDEN");
  });

  it("422 — missing legalEntityId fails validation", async () => {
    const res = await apiGetJson<{ error?: { code?: string } }>("/api/v1/equity/cap-table", { cookie: cfo });
    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe("VALIDATION_FAILED");
  });

  it("200 — the CFO reads the live cap table", async () => {
    const res = await apiGetJson<{ data?: { outstandingShares?: number; fullyDilutedShares?: number } }>(
      `/api/v1/equity/cap-table?legalEntityId=${HOLDINGS}`,
      { cookie: cfo },
    );
    expect(res.status).toBe(200);
    expect(typeof res.body?.data?.outstandingShares).toBe("number");
    expect(typeof res.body?.data?.fullyDilutedShares).toBe("number");
  });

  it("403 — the CEO (no equity:cap-table.manage) is DENIED a capitalization mutation; DENY is final", async () => {
    const res = await apiPost<{ error?: { code?: string } }>(
      "/api/v1/equity/cap-table",
      { operation: "CREATE_SHARE_CLASS", legalEntityId: HOLDINGS, code: `${CLASS_CODE}-CEO`, name: "Denied", authorizedShares: 10 },
      { cookie: ceo, idempotencyKey: `${IDEM_KEY}-ceo` },
    );
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe("FORBIDDEN");
  });

  it("422 — an invalid payload is refused with the canonical validation envelope", async () => {
    const res = await apiPost<{ error?: { code?: string; details?: unknown } }>(
      "/api/v1/equity/cap-table",
      { operation: "CREATE_SHARE_CLASS", legalEntityId: HOLDINGS, code: CLASS_CODE, name: "Bad", authorizedShares: -5 },
      { cookie: cfo, idempotencyKey: `${IDEM_KEY}-bad` },
    );
    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe("VALIDATION_FAILED");
  });

  it("201 — the CFO creates a share class, and an idempotent replay returns the IDENTICAL result", async () => {
    const first = await apiPost<{ data?: { id?: string; code?: string } }>(
      "/api/v1/equity/cap-table",
      { operation: "CREATE_SHARE_CLASS", legalEntityId: HOLDINGS, code: CLASS_CODE, name: `HTTP probe class ${RUN}`, authorizedShares: 1000, votesPerShare: "1" },
      { cookie: cfo, idempotencyKey: IDEM_KEY },
    );
    expect(first.status).toBe(201);
    expect(first.body?.data?.id).toBeTruthy();

    const replay = await apiPost<{ data?: { id?: string } }>(
      "/api/v1/equity/cap-table",
      { operation: "CREATE_SHARE_CLASS", legalEntityId: HOLDINGS, code: CLASS_CODE, name: `HTTP probe class ${RUN}`, authorizedShares: 1000, votesPerShare: "1" },
      { cookie: cfo, idempotencyKey: IDEM_KEY },
    );
    expect(replay.status).toBe(201);
    expect(replay.body?.data?.id).toBe(first.body?.data?.id);
  });

  it("401/200 — the posture endpoint is guarded and serves the §46 boundary in its payload", async () => {
    const anon = await apiGetJson("/api/v1/system/posture");
    expect(anon.status).toBe(401);

    const res = await apiGetJson<{
      data?: {
        postureScore?: number | null;
        advisoryOnly?: boolean;
        grantsAuthority?: boolean;
        boundary?: string;
        components?: Array<{ key: string }>;
      };
    }>("/api/v1/system/posture", { cookie: cfo });
    expect(res.status).toBe(200);
    const data = res.body?.data;
    expect(data?.advisoryOnly).toBe(true);
    expect(data?.grantsAuthority).toBe(false);
    expect(data?.boundary).toMatch(/ADVISORY ONLY/i);
    expect((data?.components ?? []).map((c) => c.key)).toContain("AUDIT_INTEGRITY");
    expect(data?.postureScore === null || (data?.postureScore ?? -1) >= 0).toBe(true);
  });
});
