/**
 * Governed tenant domains — HTTP boundary.
 *
 * Drives the REAL running server (runtime role + real `guarded()` boundary) and
 * the REAL canonical Health OS route:
 *
 *   • unauthenticated → 401 on the administrative surface, 307 on the OS route;
 *   • authenticated without the capability → 403;
 *   • a governed tenant hostname grants NOTHING by itself: with a valid session
 *     but no Health federation the OS route still redirects to the denial
 *     surface, exactly as on the OS base domain;
 *   • a Host value inside a registered OS namespace that no governed row proves
 *     is a uniform 404 — never a fallback tenant;
 *   • a Host value that only CONTAINS a governed hostname, or is malformed, is
 *     refused (404) rather than served under a widened identity;
 *   • the deployment platform's own host is untouched (identical behaviour to the
 *     pre-existing route).
 *
 * `Host` is set with `node:http` because `fetch` does not permit overriding it —
 * the point of the suite is to send hostile Host values, not merely hostile URLs.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";
import { eq, like } from "drizzle-orm";
import { adminDb } from "../../src/db/admin";
import { tenantDomains } from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { apiGetJson, apiPost, baseUrl, login, serverAvailable } from "../helpers/http";

const HEALTH = fixedId(ID_PREFIX.tenant, "BEYU_HEALTH");
const REASON = "HTTP suite: governed tenant-domain boundary assertions.";

const enabled = Boolean(process.env.BEYU_TEST_BASE_URL);

let adminCookie: string;
let ceoCookie: string;
let sectorCookie: string;
let fixtureDomainId: string;

/** GET a path with an explicit (attacker-controlled) Host header. */
function getWithHost(path: string, host: string, cookie?: string): Promise<{ status: number; location?: string; body: string }> {
  const url = new URL(baseUrl());
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path,
        method: "GET",
        headers: { host, ...(cookie ? { cookie } : {}) },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, location: res.headers.location, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

beforeAll(async () => {
  await serverAvailable();
  adminCookie = await login("admin@beyu.os");
  ceoCookie = await login("ceo@beyu.os");
  sectorCookie = await login("health.ops@beyu.os");
}, 180_000);

afterAll(async () => {
  await adminDb.delete(tenantDomains).where(like(tenantDomains.hostname, "testdom-http%"));
});

describe("administrative surface", () => {
  it.skipIf(!enabled)("fails closed: unauthenticated is 401 on every tenant-domain route", async () => {
    const res = await apiGetJson("/api/v1/admin/tenant-domains");
    expect(res.status).toBe(401);
    const post = await apiPost("/api/v1/admin/tenant-domains", {
      tenantId: HEALTH,
      os: "HEALTH_OS",
      domainType: "TENANT_SUBDOMAIN",
      label: "nope",
      reason: REASON,
    });
    expect(post.status).toBe(401);
    for (const route of ["/api/v1/admin/tenant-domains/X/verify", "/api/v1/admin/tenant-domains/X/status"]) {
      expect((await apiPost(route, { action: "activate", reason: REASON })).status).toBe(401);
    }
  });

  it.skipIf(!enabled)("fails closed: a sector operator without the capability is 403", async () => {
    const res = await apiPost(
      "/api/v1/admin/tenant-domains",
      { tenantId: HEALTH, os: "HEALTH_OS", domainType: "TENANT_SUBDOMAIN", label: "nope", reason: REASON },
      { cookie: sectorCookie },
    );
    expect(res.status).toBe(403);
    expect((await apiGetJson("/api/v1/admin/tenant-domains", { cookie: sectorCookie })).status).toBe(403);
  });

  it.skipIf(!enabled)("registers a hostname for an existing tenant and refuses to fake verification", async () => {
    const created = await apiPost<{ data?: { domainId?: string; hostname?: string; status?: string; verificationState?: string } }>(
      "/api/v1/admin/tenant-domains",
      {
        tenantId: HEALTH,
        os: "HEALTH_OS",
        domainType: "TENANT_SUBDOMAIN",
        label: "testdom-http",
        reason: REASON,
      },
      { cookie: ceoCookie },
    );
    expect(created.status).toBe(201);
    expect(created.body.data?.hostname).toBe("testdom-http.health.beyuos.co.tz");
    expect(created.body.data?.status).toBe("CREATED");
    expect(created.body.data?.verificationState).toBe("UNVERIFIED");
    fixtureDomainId = created.body.data?.domainId ?? "";

    // A domain is never created for a tenant outside the actor's scope, and the
    // OS base domain is not registerable at runtime.
    const wrongOs = await apiPost(
      "/api/v1/admin/tenant-domains",
      { tenantId: HEALTH, os: "MINING_OS", domainType: "TENANT_SUBDOMAIN", label: "mining", reason: REASON },
      { cookie: ceoCookie },
    );
    expect(wrongOs.status).toBe(422);

    // Verification is a REAL DNS lookup: nothing is published, so it must fail
    // closed and the domain must stay unreachable.
    const verify = await apiPost(
      `/api/v1/admin/tenant-domains/${fixtureDomainId}/verify`,
      { reason: REASON },
      { cookie: ceoCookie },
    );
    expect([422, 502, 503]).toContain(verify.status);
    // The refusal explains itself but NEVER leaks the challenge value or a hash:
    // the challenge is a live verification secret until it is consumed.
    const verifyBody = JSON.stringify(verify.body);
    expect(verifyBody).not.toMatch(/[0-9a-f]{32,}/i);
    expect(verifyBody).not.toContain("beyu-domain-verification=");

    // …and it cannot be activated on the strength of a registration alone.
    const activate = await apiPost(
      `/api/v1/admin/tenant-domains/${fixtureDomainId}/status`,
      { action: "activate", reason: REASON },
      { cookie: ceoCookie },
    );
    expect(activate.status).toBe(409);

    // The listing is scoped and shows the governed row.
    const listed = await apiGetJson<{ data?: Array<{ hostname: string }> }>("/api/v1/admin/tenant-domains", {
      cookie: adminCookie,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data?.some((row) => row.hostname === "testdom-http.health.beyuos.co.tz")).toBe(true);
  });

  it.skipIf(!enabled)("keeps the OS base row constitutional (never runtime-managed)", async () => {
    const res = await apiPost(
      "/api/v1/admin/tenant-domains/TDM_HEALTH_OS_BASE/status",
      { action: "suspend", reason: REASON },
      { cookie: adminCookie },
    );
    expect(res.status).toBe(422);
  });
});

describe("Health OS route under hostile Host values", () => {
  it.skipIf(!enabled)("does not let a hostname substitute for the session gate", async () => {
    for (const host of [
      "testdom-http.health.beyuos.co.tz",
      "health.beyuos.co.tz",
      "localhost",
      "beyu-os-1-0.vercel.app",
    ]) {
      const res = await getWithHost("/os/health", host);
      expect(res.status, host).toBe(307);
      expect(res.location, host).toBe("/");
    }
  });

  it.skipIf(!enabled)("refuses an unproven name inside the governed namespace with a uniform 404", async () => {
    for (const host of [
      "testdom-http.health.beyuos.co.tz",
      "not-registered.health.beyuos.co.tz",
      "mwanza.health.beyuos.co.tz",
    ]) {
      const res = await getWithHost("/os/health", host, adminCookie);
      expect(res.status, host).toBe(404);
      expect(res.body, host).toBe("Not Found");
    }
  });

  it.skipIf(!enabled)("never treats a host that merely CONTAINS a governed hostname as that tenant", async () => {
    // Suffix confusion: the name ENDS with the governed namespace, so it is
    // classified as an unproven name inside the namespace → uniform 404.
    const suffix = await getWithHost(
      "/os/health",
      "evil.example.com.testdom-http.health.beyuos.co.tz",
      adminCookie,
    );
    expect(suffix.status).toBe(404);
    expect(suffix.body).toBe("Not Found");

    // A name that merely carries a governed name as a prefix/embedded label is NOT
    // a tenant-domain claim at all: it resolves to no tenant and the pre-existing
    // gates decide. The invariant that matters is that a hostname never GRANTS a
    // tenant response — never a 200, never a tenant document.
    for (const host of [
      "testdom-http.health.beyuos.co.tz.evil.example.com",
      "evil-testdom-http.health.beyuos.co.tz.evil.example.com",
    ]) {
      const res = await getWithHost("/os/health", host, adminCookie);
      expect(res.status, host).not.toBe(200);
      expect(res.body, host).not.toContain("BEYU Health OS");
    }
  });

  it.skipIf(!enabled)("refuses unclassifiable and non-tenant Host values outright", async () => {
    for (const host of [
      "testdom-http.health.beyuos.co.tz@evil.example.com",
      "http://testdom-http.health.beyuos.co.tz/",
      "testdom-http.health.beyuos.co.tz:not-a-port",
      "10.0.0.5",
      "health",
      "*.health.beyuos.co.tz",
    ]) {
      const res = await getWithHost("/os/health", host, adminCookie);
      expect(res.status, host).toBe(404);
    }
  });

  it.skipIf(!enabled)("leaves the deployment and OS base hosts on the pre-existing path", async () => {
    for (const host of ["beyu-os-1-0.vercel.app", "health.beyuos.co.tz", "localhost", "127.0.0.1:3100"]) {
      const res = await getWithHost("/os/health", host, adminCookie);
      // Session is valid, Health federation is unavailable in this harness: the
      // second gate refuses to the denial surface — unchanged behaviour, and the
      // hostname neither widened nor narrowed anything.
      expect(res.status, host).toBe(307);
      expect(res.location, host).toBe("/health");
    }
  });

  it.skipIf(!enabled)("keeps the legacy alias and the canonical route identical", async () => {
    for (const path of ["/os/health", "/health/os"]) {
      const unknown = await getWithHost(path, "not-registered.health.beyuos.co.tz", adminCookie);
      const base = await getWithHost(path, "health.beyuos.co.tz", adminCookie);
      expect(unknown.status, path).toBe(404);
      expect(base.status, path).toBe(307);
    }
  });

  it.skipIf(!enabled)("does not disturb the canonical OS routes", async () => {
    const list = await apiGetJson<{ data?: Record<string, { route: string }> }>("/api/v1/admin/tenants", { cookie: adminCookie });
    expect([200, 403]).toContain(list.status);
    // Deep links remain reachable (they redirect to sign-in when unauthenticated).
    for (const path of ["/os", "/os/finance", "/os/agriculture", "/os/ujenzi", "/os/foundation"]) {
      const res = await getWithHost(path, "beyu-os-1-0.vercel.app");
      expect([200, 307, 308], path).toContain(res.status);
    }
  });
});
