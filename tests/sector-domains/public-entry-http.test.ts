/** These tests require the caller's isolated, seeded test DB and running server. */
import { request as httpRequest } from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { baseUrl, login, serverAvailable } from "../helpers/http";

const configured = Boolean(process.env.BEYU_TEST_BASE_URL) && process.env.BEYU_TEST_CANONICAL_DOMAIN === "beyu.co.tz";
function get(path: string, host: string, cookie?: string) {
  const base = new URL(baseUrl());
  return new Promise<{ status: number; location?: string; body: string }>((resolve, reject) => {
    const req = httpRequest({ hostname: base.hostname, port: base.port, path, headers: { host, ...(cookie ? { cookie } : {}) } }, (res) => {
      let body = ""; res.setEncoding("utf8"); res.on("data", (part) => { body += part; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body }));
    });
    req.on("error", reject); req.end();
  });
}

describe.skipIf(!configured)("canonical entry against a real server and isolated PostgreSQL", () => {
  let cookie: string;
  beforeAll(async () => {
    expect(await serverAvailable()).toBe(true);
    cookie = await login("cfo@beyu.os");
  }, 120_000);

  it.each([["health", "HEALTH"], ["finance", "FINANCE"], ["agriculture", "AGRICULTURE"], ["ujenzi", "UJENZI"], ["foundation", "FOUNDATION"], ["familyoffice", "FAMILY_OFFICE"], ["noelia", "NOELIA_AI"]])(
    "redirects unauthenticated %s requests centrally without transferring a cookie", async (host, code) => {
      for (const path of ["/", "/sign-in"]) {
        const res = await get(path, `${host}.beyu.co.tz`);
        expect(res.status).toBe(307);
        expect(res.location).toBe(`https://www.beyu.co.tz/sign-in?destination=${code}`);
      }
    },
  );

  it("revalidates an allowed destination and stays on www without a shared cookie", async () => {
    const res = await get("/sign-in?destination=FINANCE", "www.beyu.co.tz", cookie);
    expect(res.status).toBe(307);
    expect(res.location).toBe("/os/finance");
  });

  it("refuses and audits a destination absent from the live grants", async () => {
    const before = await db.select().from(auditLog).where(and(eq(auditLog.action, "identity.destination.entry"), eq(auditLog.objectId, "HEALTH")));
    const res = await get("/sign-in?destination=HEALTH", "www.beyu.co.tz", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toContain("You are signed in, but you are not authorized");
    const after = await db.select().from(auditLog).where(and(eq(auditLog.action, "identity.destination.entry"), eq(auditLog.objectId, "HEALTH")));
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.at(-1)?.outcome).toBe("DENIED");
  });

  it("ignores an external return value and does not redirect to it", async () => {
    const res = await get("/sign-in?destination=https%3A%2F%2Fevil.test", "www.beyu.co.tz", cookie);
    expect(res.location ?? "").not.toContain("evil.test");
    expect(res.location).toMatch(/^\/(?!\/)/);
  });

  it("revokes the session on logout; a stolen old cookie no longer enters", async () => {
    const logout = await fetch(`${baseUrl()}/api/v1/auth/logout`, { method: "POST", headers: { cookie } });
    expect(logout.status).toBe(200);
    const res = await get("/launcher", "www.beyu.co.tz", cookie);
    expect(res.status).toBe(307);
    expect(res.location).toBe("/sign-in");
  });
});
