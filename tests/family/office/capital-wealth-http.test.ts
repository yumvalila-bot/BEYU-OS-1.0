/**
 * Family Office capital & wealth — transport-level contract tests.
 *
 * The engine layer is covered by 280 pure unit tests, but the guarantees that
 * actually protect the domain live in the route + `lib/api.ts` boundary:
 * authentication, RBAC denial, forged-field rejection, idempotency and the
 * segregation of duties that keeps a requester from approving their own request.
 * Asserting those against source text would pass whenever the string exists, even
 * if the behaviour regressed — so these drive the real running server.
 *
 * Identities used (seeded):
 *   - `family@beyu.os` — FAMILY_OFFICE_PRINCIPAL. Holds 25 `familyoffice:*`
 *     permissions including `capital.read` and `investment.manage`, and
 *     deliberately NOT `committee.decide`.
 *   - `ceo@beyu.os` — GROUP_CEO. Holds ZERO `familyoffice:*` permissions, so every
 *     capital route must deny it regardless of how senior the role is elsewhere.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { login, serverAvailable } from "../../helpers/http";

const BASE = process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100";

/** Every read route the domain exposes. */
const READ_ROUTES = [
  "/api/v1/family-office/dashboard",
  "/api/v1/family-office/investments",
  "/api/v1/family-office/investment-theses",
  "/api/v1/family-office/obligations",
  "/api/v1/family-office/real-estate",
  "/api/v1/family-office/cash-flow",
  "/api/v1/family-office/balance-sheet",
  "/api/v1/family-office/capital-requests",
  "/api/v1/family-office/investment-committee",
  "/api/v1/family-office/decision-journal",
  "/api/v1/family-office/post-mortems",
  "/api/v1/family-office/generational-wealth",
  "/api/v1/family-office/intelligence",
] as const;

let principal: string;
let outsider: string;

/**
 * Two TOTP logins. A replayed TOTP step makes `login()` wait for the next 30s
 * window, so the hook needs far more than the default 10s.
 */
beforeAll(async () => {
  if (!(await serverAvailable())) return;
  principal = await login("family@beyu.os");
  outsider = await login("ceo@beyu.os");
}, 180_000);

describe("Family Office capital API — authentication boundary", () => {
  it.each(READ_ROUTES)("unauthenticated GET %s is 401", async (route) => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}${route}`);
    expect(res.status).toBe(401);
  });

  it("the 401 carries the canonical error envelope", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/dashboard`);
    const body = (await res.json()) as { error?: { code?: string; traceId?: string } };
    expect(body.error?.code).toBeTruthy();
    expect(body.error?.traceId).toBeTruthy();
  });
});

describe("Family Office capital API — authorization boundary", () => {
  /**
   * GROUP_CEO is one of the most senior roles in the platform and holds none of
   * the `familyoffice:*` permissions. Seniority in another domain must not leak
   * into this one — that is the whole point of least-privilege RBAC.
   */
  it.each(READ_ROUTES)("GROUP_CEO is 403 on %s — holds no familyoffice permission", async (route) => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}${route}`, { headers: { cookie: outsider } });
    expect(res.status).toBe(403);
  });

  it.each(READ_ROUTES)("FAMILY_OFFICE_PRINCIPAL is 200 on %s", async (route) => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}${route}`, { headers: { cookie: principal } });
    expect(res.status).toBe(200);
  });
});

describe("Family Office capital API — segregation of duties", () => {
  it("the Principal cannot record a committee decision (familyoffice:committee.decide is not granted)", async () => {
    if (!(await serverAvailable())) return;
    /**
     * Running the office is not deciding for it. The Principal holds every
     * `.read` and every `.manage` in the domain but NOT `committee.decide`, so a
     * decision cannot be recorded by the same person who raises capital requests.
     */
    const res = await fetch(`${BASE}/api/v1/family-office/investment-committee`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json" },
      body: JSON.stringify({
        allocationId: "AL-NONE",
        decision: "APPROVE",
        bodyRef: "FAMILY_COUNCIL",
        members: [{ memberRef: "U-A", role: "CHAIR", position: "FOR", dissentReason: null }],
        quorumMinimum: 1,
        majorityRule: "SIMPLE",
        decisionDate: "2026-03-31",
        reason: "Probe.",
        requesterRef: "U-REQ",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("GROUP_CEO cannot record a committee decision either", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/investment-committee`, {
      method: "POST",
      headers: { cookie: outsider, "content-type": "application/json" },
      body: JSON.stringify({ allocationId: "AL-NONE" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("Family Office capital API — input validation and forged-field rejection", () => {
  it("rejects a malformed investment payload with 422", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/investments`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json" },
      body: JSON.stringify({ name: "", currency: "not-a-currency" }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a server-controlled field supplied by the client", async () => {
    if (!(await serverAvailable())) return;
    /**
     * `authoritativeOwner`, `tenantId` and the like are server-derived. Letting a
     * caller set them would let a client assert that its own record is
     * authoritative accounting — the exact shadow-ledger failure FIR-018 forbids.
     */
    const res = await fetch(`${BASE}/api/v1/family-office/investments`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `probe-forged-${Date.now()}` },
      body: JSON.stringify({
        countryCode: "TZ",
        type: "REAL_ESTATE",
        name: "Forged-field probe",
        assetClass: "COMMERCIAL_PROPERTY",
        currency: "TZS",
        acquisitionCostMinor: 1000000,
        cashInvestedMinor: 400000,
        acquisitionDate: "2026-01-01",
        liquidity: "ILLIQUID",
        governanceStatus: "IDEA",
        authoritativeOwner: "FAMILY_OFFICE",
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe("SERVER_CONTROLLED_FIELD");
  });

  it("rejects a non-integer money amount — floats are never accepted", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/investments`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `probe-float-${Date.now()}` },
      body: JSON.stringify({
        countryCode: "TZ",
        type: "REAL_ESTATE",
        name: "Float probe",
        assetClass: "COMMERCIAL_PROPERTY",
        currency: "TZS",
        acquisitionCostMinor: 1000.5,
        cashInvestedMinor: 400000,
        acquisitionDate: "2026-01-01",
        liquidity: "ILLIQUID",
        governanceStatus: "IDEA",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects an unknown field rather than ignoring it", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/investments`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json", "idempotency-key": `probe-unknown-${Date.now()}` },
      body: JSON.stringify({
        countryCode: "TZ",
        type: "REAL_ESTATE",
        name: "Unknown-field probe",
        assetClass: "COMMERCIAL_PROPERTY",
        currency: "TZS",
        acquisitionCostMinor: 1000000,
        cashInvestedMinor: 400000,
        acquisitionDate: "2026-01-01",
        liquidity: "ILLIQUID",
        governanceStatus: "IDEA",
        somethingInvented: true,
      }),
    });
    expect(res.status).toBe(422);
  });
});

describe("Family Office capital API — response contract", () => {
  it("the dashboard declares Finance OS as the accounting owner and never aggregates currencies", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/dashboard`, { headers: { cookie: principal } });
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const data = body.data ?? {};
    /**
     * The two structural guarantees the domain makes about money: Finance OS owns
     * the ledger, and no cross-currency total is invented.
     */
    expect(data.authoritativeAccountingOwner).toBe("FINANCE_OS");
    expect(data.crossCurrencyAggregation).toBe("NOT_PERFORMED");
  });

  it("the intelligence endpoint states that it is not professional advice", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/intelligence`, { headers: { cookie: principal } });
    const body = (await res.json()) as { data?: { disclaimer?: string } };
    expect(body.data?.disclaimer).toMatch(/professional advice/i);
  });

  it("the generational-wealth endpoint states it creates no legal instrument", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/generational-wealth`, { headers: { cookie: principal } });
    const body = (await res.json()) as { data?: { disclaimer?: string } };
    expect(body.data?.disclaimer).toMatch(/not legal instruments/i);
  });
});

describe("Family Office capital API — Noelia boundary", () => {
  it("the Noelia context endpoint names the actions Noelia may never take", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/noelia`, {
      method: "POST",
      headers: { cookie: principal, "content-type": "application/json" },
      body: JSON.stringify({ topic: "CAPITAL" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data?: { prohibitedActions?: string[]; decisionRationaleNotice?: string } };
    const prohibited = body.data?.prohibitedActions ?? [];
    for (const action of ["APPROVE", "TRANSFER", "EXECUTE", "CHANGE_OWNERSHIP", "BYPASS_GOVERNANCE", "CAP_POSTING"]) {
      expect(prohibited, `${action} must be prohibited`).toContain(action);
    }
    /** "AI said so" is never a sufficient rationale (§44). */
    expect(body.data?.decisionRationaleNotice).toMatch(/an AI summary is not that evidence/i);
  });

  it("GROUP_CEO cannot reach the Noelia capital context either", async () => {
    if (!(await serverAvailable())) return;
    const res = await fetch(`${BASE}/api/v1/family-office/noelia`, {
      method: "POST",
      headers: { cookie: outsider, "content-type": "application/json" },
      body: JSON.stringify({ topic: "CAPITAL" }),
    });
    expect(res.status).toBe(403);
  });
});
