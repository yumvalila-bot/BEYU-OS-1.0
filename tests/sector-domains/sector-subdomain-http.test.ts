/**
 * Canonical Sector OS subdomains — HTTP boundary.
 *
 * Drives the REAL running server (production build, runtime role, real proxy)
 * with hostile and canonical `Host` values. `Host` is set with `node:http`
 * because `fetch` does not permit overriding it.
 *
 * The server MUST be started with `BEYU_CANONICAL_DOMAIN=beyu.co.tz` for the
 * routing assertions to be meaningful; when it is not, the suite asserts the
 * documented inactive state instead (and still proves the Origin check, which
 * is always active). Repository convention: skip when no server is running,
 * hard-fail when one was explicitly configured (tests/helpers/http.ts).
 */
import { request as httpRequest } from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, baseUrl, login, serverAvailable } from "../helpers/http";

const enabled = Boolean(process.env.BEYU_TEST_BASE_URL);
const routingConfigured = process.env.BEYU_TEST_CANONICAL_DOMAIN === "beyu.co.tz";

type Reply = { status: number; location?: string; body: string; setCookie: string[] };

function send(
  method: string,
  path: string,
  headers: Record<string, string>,
  payload?: string,
): Promise<Reply> {
  const url = new URL(baseUrl());
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path, method, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body,
            setCookie: ([] as string[]).concat(res.headers["set-cookie"] ?? []),
          }),
        );
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const getWithHost = (path: string, host: string, cookie?: string) =>
  send("GET", path, { host, ...(cookie ? { cookie } : {}) });

let ceoCookie: string;
let healthCookie: string;
let agriCookie: string;
let ujenziCookie: string;

beforeAll(async () => {
  if (!(await serverAvailable())) return;
  ceoCookie = await login("ceo@beyu.os");
  healthCookie = await login("health.ops@beyu.os");
  agriCookie = await login("agri.ops@beyu.os");
  ujenziCookie = await login("ujenzi.ops@beyu.os");
}, 240_000);

describe("Origin check (always active)", () => {
  it.skipIf(!enabled)("refuses an unsafe request from a foreign origin before any handler runs", async () => {
    const res = await send(
      "POST",
      "/api/v1/auth/login",
      { host: new URL(baseUrl()).host, origin: "https://evil.example", "content-type": "application/json" },
      JSON.stringify({ email: "ceo@beyu.os", password: "x".repeat(12) }),
    );
    expect(res.status).toBe(403);
    expect(res.setCookie).toEqual([]);
  });

  it.skipIf(!enabled)("passes a same-origin unsafe request through to the handler", async () => {
    const host = new URL(baseUrl()).host;
    const res = await send(
      "POST",
      "/api/v1/auth/login",
      { host, origin: `http://${host}`, "content-type": "application/json" },
      JSON.stringify({ email: "nobody@beyu.os", password: "x".repeat(12) }),
    );
    // Reached the login handler (a generic authentication failure), not the proxy.
    expect(res.status).not.toBe(403);
    expect([401, 422, 429]).toContain(res.status);
  });

  it.skipIf(!enabled)("passes a GET regardless of Origin", async () => {
    const res = await send("GET", "/api/health", { host: new URL(baseUrl()).host, origin: "https://evil.example" });
    expect(res.status).toBe(200);
  });
});

describe("canonical home on each Sector OS host", () => {
  const HOSTS = [
    ["health.beyu.co.tz", "/os/health", "Health OS"],
    ["finance.beyu.co.tz", "/os/finance", "Finance OS"],
    ["agriculture.beyu.co.tz", "/os/agriculture", "Agriculture OS"],
    ["ujenzi.beyu.co.tz", "/os/ujenzi", "Ujenzi OS"],
  ] as const;

  it.skipIf(!enabled || !routingConfigured)("unauthenticated: renders the sector sign-in (200) — never a redirect loop, never a sector payload", async () => {
    for (const [host, , name] of HOSTS) {
      const res = await getWithHost("/", host);
      expect(res.status, host).toBe(200);
      expect(res.body, host).toContain(`Sign in to ${name}`);
      expect(res.body, host).not.toContain("healthSpaHtml");
    }
    // Neutral hosts keep the control-plane sign-in copy.
    const www = await getWithHost("/", "www.beyu.co.tz");
    expect(www.status).toBe(200);
    expect(www.body).toContain("Sign in to the control plane");
  });

  it.skipIf(!enabled || !routingConfigured)("unauthenticated deep link on a sector host → 307 to the same-host sign-in (no loop)", async () => {
    for (const [host, home] of HOSTS) {
      const res = await getWithHost(home, host);
      expect(res.status, host).toBe(307);
      expect(res.location, host).toBe("/");
    }
  });

  it.skipIf(!enabled || !routingConfigured)("authenticated AND authorized → 307 to the sector home; the home then serves (200)", async () => {
    // Fixture facts (src/db/seed.ts): agri.ops / ujenzi.ops are SECTOR_OPERATORs
    // scoped to BEYU-AGRI / BEYU-UJENZI; the CEO holds Finance read. The host
    // adds nothing — these principals already resolve to these OSes on www.
    const cases: Array<[string, string, string]> = [
      ["agriculture.beyu.co.tz", "/os/agriculture", agriCookie],
      ["ujenzi.beyu.co.tz", "/os/ujenzi", ujenziCookie],
      ["finance.beyu.co.tz", "/os/finance", ceoCookie],
    ];
    for (const [host, home, cookie] of cases) {
      const root = await getWithHost("/", host, cookie);
      expect(root.status, host).toBe(307);
      expect(root.location, host).toBe(home);
      const page = await getWithHost(home, host, cookie);
      expect(page.status, `${host}${home}`).toBe(200);
    }
  });

  it.skipIf(!enabled || !routingConfigured)("authenticated but NOT authorized for that sector: the host grants nothing", async () => {
    // Health OS authorisation is an ACTIVE `beyu_identity.beyu_identity_links`
    // row (src/lib/health-os-authorization.ts). The seed creates none, so even
    // the Health operator is NOT Health-authorised here. Arriving on
    // health.beyu.co.tz must not change that: the root falls back to the
    // pre-existing routing and the Health home is refused by its own gate.
    const healthRoot = await getWithHost("/", "health.beyu.co.tz", healthCookie);
    expect(healthRoot.status).toBe(307);
    expect(healthRoot.location).not.toBe("/os/health");
    const health = await getWithHost("/os/health", "health.beyu.co.tz", healthCookie);
    expect(health.status).not.toBe(200);
    expect(health.body).not.toContain("healthSpaHtml");

    // An Agriculture principal on ujenzi.beyu.co.tz does not become a Ujenzi
    // principal: the root uses the pre-existing routing (several destinations →
    // /launcher), never the host's sector.
    const root = await getWithHost("/", "ujenzi.beyu.co.tz", agriCookie);
    expect(root.status).toBe(307);
    expect(root.location).not.toBe("/os/ujenzi");
    const ujenzi = await getWithHost("/os/ujenzi", "ujenzi.beyu.co.tz", agriCookie);
    expect(ujenzi.status === 200 ? ujenzi.body : "").not.toContain("Ujenzi OS · Projects");
    // Either the control-plane boundary redirects, or the Ujenzi layout's own
    // tenant-scope gate renders the governed denial — never the sector data.
    expect([200, 307]).toContain(ujenzi.status);
    if (ujenzi.status === 200) expect(ujenzi.body).toContain("Authorisation denied");

    // And the mirror image: a Ujenzi principal on agriculture.beyu.co.tz.
    const agri = await getWithHost("/os/agriculture", "agriculture.beyu.co.tz", ujenziCookie);
    expect([200, 307]).toContain(agri.status);
    if (agri.status === 200) expect(agri.body).toContain("Authorisation denied");
  });
});

describe("cross-sector paths on a sector host", () => {
  it.skipIf(!enabled || !routingConfigured)("redirect once to the canonical host of the sector that owns the path (https, same path)", async () => {
    const cases: Array<[string, string, string]> = [
      ["health.beyu.co.tz", "/os/finance", "https://finance.beyu.co.tz/os/finance"],
      ["finance.beyu.co.tz", "/os/health", "https://health.beyu.co.tz/os/health"],
      ["finance.beyu.co.tz", "/health/os", "https://health.beyu.co.tz/health/os"],
      ["agriculture.beyu.co.tz", "/os/ujenzi/projects", "https://ujenzi.beyu.co.tz/os/ujenzi/projects"],
      ["ujenzi.beyu.co.tz", "/os/agriculture?x=1", "https://agriculture.beyu.co.tz/os/agriculture?x=1"],
    ];
    for (const [host, path, location] of cases) {
      const res = await getWithHost(path, host, ceoCookie);
      expect(res.status, `${host}${path}`).toBe(307);
      expect(res.location, `${host}${path}`).toBe(location);
    }
  });

  it.skipIf(!enabled || !routingConfigured)("never redirect control-plane, launcher, Foundation, shared-capability or API paths", async () => {
    for (const path of ["/os", "/launcher", "/os/foundation", "/os/family", "/api/v1/authorization/context"]) {
      const res = await getWithHost(path, "health.beyu.co.tz", ceoCookie);
      expect(res.status, path).not.toBe(307);
      expect(res.location ?? "", path).not.toMatch(/^https:\/\//);
    }
  });

  it.skipIf(!enabled || !routingConfigured)("existing routes on www and on the platform host are untouched", async () => {
    for (const path of ["/os/finance", "/os/agriculture", "/os/ujenzi"]) {
      const www = await getWithHost(path, "www.beyu.co.tz", ceoCookie);
      expect(www.status, `www ${path}`).toBe(200);
      const platform = await apiGet(path, ceoCookie);
      expect(platform.status, `platform ${path}`).toBe(200);
    }
    const health = await getWithHost("/os/health", "www.beyu.co.tz", healthCookie);
    expect([200, 307]).toContain(health.status); // 200 SPA, or 307 /health when federation is not linked locally
  });
});

describe("hostile Host values", () => {
  it.skipIf(!enabled || !routingConfigured)("look-alike and unknown hosts select no sector and leak nothing", async () => {
    for (const host of [
      "health.beyu.co.tz.evil.example",
      "evil-health.beyu.co.tz",
      "unknown.beyu.co.tz",
      "foundation.beyu.co.tz",
      "familyoffice.beyu.co.tz",
    ]) {
      const res = await getWithHost("/", host);
      expect(res.status, host).toBe(200);
      expect(res.body, host).toContain("Sign in to the control plane");
      const cross = await getWithHost("/os/finance", host, ceoCookie);
      expect(cross.status, host).toBe(200); // served in place, no redirect
    }
  });

  it.skipIf(!enabled || !routingConfigured)("a Sector OS surface is refused (404) on another sector's canonical host even when the proxy is reached directly", async () => {
    // The proxy redirects these first; the server-side refusal is proven by the
    // pure/source suites. Here we assert the observable contract: never a 200
    // with the other sector's content.
    const res = await getWithHost("/os/health", "finance.beyu.co.tz", healthCookie);
    expect(res.status).not.toBe(200);
  });
});
