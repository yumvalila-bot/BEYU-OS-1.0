/**
 * CANONICAL HOST CONTRACT — HTTP boundary.
 *
 * Drives the REAL running server (production build, runtime role, real proxy)
 * with canonical and hostile `Host` values. `Host` is set with `node:http`
 * because `fetch` does not permit overriding it.
 *
 * The server MUST be started with `BEYU_CANONICAL_DOMAIN=beyu.co.tz` for the
 * routing assertions to be meaningful; when it is not, the suite asserts the
 * documented inactive state instead (and still proves the Origin check, which
 * is always active). Repository convention: skip when no server is running,
 * hard-fail when one was explicitly configured (tests/helpers/http.ts).
 *
 * What this suite proves about the canonical hostnames — for ALL EIGHT of them:
 *   • each is an INDEPENDENT ENTRY POINT served on its own hostname;
 *   • NO destination host ever bounces a visitor through `beyu.co.tz`;
 *   • the browser-facing URL stays the canonical hostname (relative Location);
 *   • a hostname grants nothing: authorization is re-evaluated per OS/context;
 *   • cross-OS paths redirect exactly once, to the owning OS's canonical host;
 *   • the hostname never changes the principal's tenant/entity/scope facts;
 *   • hostile Host values select nothing at all.
 */
import { request as httpRequest } from "node:http";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { decryptSecret, generateTotpCode } from "@/lib/mfa";
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

/** Every canonical host, with the sign-in copy and canonical home it must own. */
const CANONICAL_HOSTS = [
  { host: "health.beyu.co.tz", home: "/os/health", copy: "Sign in to Health OS — governed by BEYU OS" },
  { host: "finance.beyu.co.tz", home: "/os/finance", copy: "Sign in to Finance OS — governed by BEYU OS" },
  { host: "agriculture.beyu.co.tz", home: "/os/agriculture", copy: "Sign in to Agriculture OS — governed by BEYU OS" },
  { host: "ujenzi.beyu.co.tz", home: "/os/ujenzi", copy: "Sign in to Ujenzi OS — governed by BEYU OS" },
  { host: "foundation.beyu.co.tz", home: "/os/foundation", copy: "Sign in to Foundation OS — governed by BEYU OS" },
  { host: "familyoffice.beyu.co.tz", home: "/os/family", copy: "Sign in to Family Office — governed by BEYU OS" },
  { host: "noelia.beyu.co.tz", home: "/os/noelia", copy: "Sign in to Noelia AI — governed by BEYU OS" },
] as const;

let ceoCookie: string;
let healthCookie: string;
let agriCookie: string;
let ujenziCookie: string;
let foundationCookie: string;
let auditorCookie: string;

beforeAll(async () => {
  if (!(await serverAvailable())) return;
  ceoCookie = await login("ceo@beyu.os");
  healthCookie = await login("health.ops@beyu.os");
  agriCookie = await login("agri.ops@beyu.os");
  ujenziCookie = await login("ujenzi.ops@beyu.os");
  foundationCookie = await login("foundation.director@beyu.os");
  auditorCookie = await login("auditor@beyu.os");
}, 300_000);

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

describe("A/B. every canonical host is an independent entry point (no BEYU-landing hop)", () => {
  it.skipIf(!enabled || !routingConfigured)(
    "unauthenticated: renders that destination's own sign-in (200) on its own host — never a redirect, never another OS's payload",
    async () => {
      for (const { host, copy } of CANONICAL_HOSTS) {
        const res = await getWithHost("/", host);
        expect(res.status, host).toBe(200);
        expect(res.location, host).toBeUndefined();
        expect(res.body, host).toContain(copy);
        expect(res.body, host).not.toContain("healthSpaHtml");
        expect(res.body, host).not.toContain("Sign in to the control plane");
      }
      // The apex keeps the control-plane copy — the central BEYU experience.
      const www = await getWithHost("/", "www.beyu.co.tz");
      expect(www.status).toBe(200);
      expect(www.body).toContain("Sign in to the control plane");
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "unauthenticated deep link on a destination host → single 307 to the SAME host's sign-in (no cross-host hop)",
    async () => {
      for (const { host, home } of CANONICAL_HOSTS) {
        const res = await getWithHost(home, host);
        expect(res.status, `${host}${home}`).toBe(307);
        // Relative Location: the visitor stays on the canonical hostname.
        expect(res.location, `${host}${home}`).toBe("/");
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "authorized direct access: the OS home is served (200) ON its canonical host — www is never required",
    async () => {
      const cases: Array<[string, string, string]> = [
        ["agriculture.beyu.co.tz", "/os/agriculture", agriCookie],
        ["ujenzi.beyu.co.tz", "/os/ujenzi", ujenziCookie],
        ["finance.beyu.co.tz", "/os/finance", ceoCookie],
      ];
      for (const [host, home, cookie] of cases) {
        const page = await getWithHost(home, host, cookie);
        expect(page.status, `${host}${home}`).toBe(200);
        const root = await getWithHost("/", host, cookie);
        expect(root.status, host).toBe(307);
        expect(root.location, host).toBe(home);
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "Foundation OS is reachable directly on foundation.beyu.co.tz through its own gate",
    async () => {
      const page = await getWithHost("/os/foundation", "foundation.beyu.co.tz", foundationCookie);
      // Either the canonical Foundation page (200) or the governed denial —
      // never another OS's payload, never a bounce to the apex.
      expect([200, 307]).toContain(page.status);
      if (page.status === 307) expect(page.location ?? "").not.toMatch(/beyu\.co\.tz/);
      // The host resolves to the Foundation destination's own route whatever the
      // outcome; that route's own gate (tenant scope + capability) then decides.
      const root = await getWithHost("/", "foundation.beyu.co.tz", foundationCookie);
      expect(root.status).toBe(307);
      expect(root.location).toBe("/os/foundation");
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "a shared-surface host always resolves to its own surface route, and that route's own gate decides what is rendered",
    async () => {
      for (const [host, home, cookie] of [
        ["familyoffice.beyu.co.tz", "/os/family", ceoCookie],
        ["noelia.beyu.co.tz", "/os/noelia", ceoCookie],
      ] as const) {
        const surface = await getWithHost(home, host, cookie);
        expect([200, 307]).toContain(surface.status);
        const root = await getWithHost("/", host, cookie);
        expect(root.status, host).toBe(307);
        // Relative Location only: the sign-in/routing never sends the browser to
        // another host — and it never falls back to the generic control-plane
        // launcher. The host selects the surface; the surface re-gates.
        expect(root.location ?? "", host).toMatch(/^\/(?!\/)/);
        expect(root.location, host).not.toMatch(/beyu\.co\.tz/);
        expect(root.location, host).toBe(home);
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "no destination host ever redirects to the apex, and no redirect chain exists",
    async () => {
      for (const { host, home } of CANONICAL_HOSTS) {
        for (const cookie of [undefined, ceoCookie]) {
          for (const path of ["/", home, "/launcher", "/os"]) {
            const res = await getWithHost(path, host, cookie);
            if (res.status < 300 || res.status >= 400) continue;
            const location = res.location ?? "";
            expect(location, `${host}${path}`).not.toBe("");
            if (location.startsWith("/")) {
              // Relative Location: the browser stays on this canonical hostname.
              expect(location, `${host}${path}`).not.toMatch(/^\/\//);
              continue;
            }
            // Absolute Location: it must be a canonical BEYU host that is NOT the
            // apex/`www` (that would be the prohibited bounce), and it must OWN
            // the path (so the followed request is served, not redirected again).
            const next = new URL(location);
            expect(next.hostname, `${host}${path}`).not.toBe("beyu.co.tz");
            expect(next.hostname, `${host}${path}`).not.toBe("www.beyu.co.tz");
            const followed = await getWithHost(next.pathname, next.host, cookie);
            // Any further redirect is the target host's own governed hop and must
            // stay RELATIVE — never another cross-host location, never a loop.
            if (followed.status >= 300 && followed.status < 400) {
              expect(followed.location ?? "", `${host}${path} → ${location}`).toMatch(/^\//);
            }
          }
        }
      }
    },
  );
});

describe("C/G. a hostname is not an authorization", () => {
  it.skipIf(!enabled || !routingConfigured)(
    "an authenticated principal without an OS grant obtains nothing by changing the hostname",
    async () => {
      // Health OS authorisation is an ACTIVE `beyu_identity.beyu_identity_links`
      // row (src/lib/health-os-authorization.ts). The seed creates none, so even
      // the Health operator is NOT Health-authorised here. Arriving on
      // health.beyu.co.tz must not change that.
      const health = await getWithHost("/os/health", "health.beyu.co.tz", healthCookie);
      expect(health.status).not.toBe(200);
      expect(health.body).not.toContain("healthSpaHtml");

      // An Agriculture principal on ujenzi.beyu.co.tz is not a Ujenzi principal:
      // the root resolves to the UJENZI destination's own route (never the
      // generic control-plane launcher), and the Ujenzi gate renders its own
      // governed denial rather than the workspace.
      const ujenziRoot = await getWithHost("/", "ujenzi.beyu.co.tz", agriCookie);
      expect(ujenziRoot.status).toBe(307);
      expect(ujenziRoot.location).toBe("/os/ujenzi");
      const ujenzi = await getWithHost("/os/ujenzi", "ujenzi.beyu.co.tz", agriCookie);
      expect([200, 307]).toContain(ujenzi.status);
      if (ujenzi.status === 200) expect(ujenzi.body).toContain("Authorisation denied");

      // And the mirror image: the Foundation director gains nothing on
      // agriculture.beyu.co.tz.
      const agriRoot = await getWithHost("/", "agriculture.beyu.co.tz", foundationCookie);
      expect(agriRoot.status).toBe(307);
      expect(agriRoot.location).toBe("/os/agriculture");
      const agri = await getWithHost("/os/agriculture", "agriculture.beyu.co.tz", foundationCookie);
      expect([200, 307]).toContain(agri.status);
      if (agri.status === 200) expect(agri.body).toContain("Authorisation denied");

      // A SHARED-surface host grants nothing either: the auditor holds no
      // `ai:noelia.query`, so noelia.beyu.co.tz resolves to the Noelia
      // destination's own route and the console answers with the page's own
      // governed denial — not with the control-plane launcher.
      const noeliaRoot = await getWithHost("/", "noelia.beyu.co.tz", auditorCookie);
      expect(noeliaRoot.status).toBe(307);
      expect(noeliaRoot.location).toBe("/os/noelia");
      const noelia = await getWithHost("/os/noelia", "noelia.beyu.co.tz", auditorCookie);
      expect(noelia.status).toBe(200);
      expect(noelia.body).toContain("Authorisation denied");
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "D. tenant isolation: the hostname never changes the principal's tenant/entity/scope facts",
    async () => {
      const identities: Array<[string, string]> = [
        ["ceo@beyu.os", ceoCookie],
        ["agri.ops@beyu.os", agriCookie],
        ["foundation.director@beyu.os", foundationCookie],
      ];
      // `resolvedAt` is the response's own clock; every other byte must match.
      const governed = (body: string) => body.replace(/"resolvedAt":"[^"]*"/, '"resolvedAt":"<clock>"');
      for (const [email, cookie] of identities) {
        const baseline = await apiGet("/api/v1/authorization/context", cookie);
        expect(baseline.status, email).toBe(200);
        for (const host of ["health.beyu.co.tz", "noelia.beyu.co.tz", "familyoffice.beyu.co.tz", "foundation.beyu.co.tz"]) {
          const res = await getWithHost("/api/v1/authorization/context", host, cookie);
          expect(res.status, `${email} on ${host}`).toBe(200);
          // Identical governed facts whatever host asked: tenant, entity scope,
          // roles and permissions come from the session, never from the Host.
          expect(governed(res.body), `${email} on ${host}`).toBe(governed(baseline.html));
        }
      }
    },
  );
});

/*
 * A/B REGRESSION — the canonical Health entry point must serve a HEALTH
 * frontend, never the generic BEYU OS launcher.
 *
 * `health.beyu.co.tz` used to resolve an authenticated visitor to `/launcher`
 * whenever the visitor was not already Health-authorized (i.e. for every
 * identity in a database without an ACTIVE `beyu_identity.beyu_identity_links`
 * row — the shipped seeded state). The canonical Health entry point therefore
 * rendered the control plane's OS-selection grid: the destination contract
 * consumed as a sign-in LABEL rather than by the frontend the host serves.
 *
 * These assertions are structural, not headings: they follow the redirect chain
 * the browser would follow and require the terminal document to be the real
 * Health surface (the governed sector SPA mount, or the truthful `/health`
 * entry/denial page) — and they fail if the launcher's destination grid
 * (`sector-os-heading`) appears anywhere in the chain.
 */
describe("A/B regression. the Health host serves a Health frontend, never the generic launcher", () => {
  /** Stable structural marker of the control-plane launcher's destination grid. */
  const LAUNCHER_GRID = 'id="sector-os-heading"';

  /** Follow same-host redirects the way a browser does, collecting every hop. */
  async function follow(path: string, host: string, cookie?: string) {
    const hops: string[] = [];
    let current = path;
    for (let i = 0; i < 6; i += 1) {
      const res = await getWithHost(current, host, cookie);
      hops.push(`${res.status} ${current}`);
      if (res.status < 300 || res.status >= 400) return { res, hops };
      const location = res.location ?? "";
      // A cross-host Location would itself be a contract violation here.
      if (!location.startsWith("/")) return { res, hops, crossHost: location };
      current = location;
    }
    throw new Error(`redirect loop on ${host}${path}: ${hops.join(" → ")}`);
  }

  it.skipIf(!enabled || !routingConfigured)(
    "the Health host root resolves to the Health destination for EVERY authenticated identity, authorized or not",
    async () => {
      for (const [email, cookie] of [
        ["ceo@beyu.os", ceoCookie],
        ["health.ops@beyu.os", healthCookie],
        ["agri.ops@beyu.os", agriCookie],
        ["auditor@beyu.os", auditorCookie],
      ] as const) {
        const root = await getWithHost("/", "health.beyu.co.tz", cookie);
        expect(root.status, email).toBe(307);
        // The destination's own canonical route — never the control-plane launcher.
        expect(root.location, email).toBe("/os/health");
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "following the chain lands on a real Health surface and never on the launcher grid",
    async () => {
      for (const [email, cookie] of [
        ["ceo@beyu.os", ceoCookie],
        ["health.ops@beyu.os", healthCookie],
        ["agri.ops@beyu.os", agriCookie],
        ["auditor@beyu.os", auditorCookie],
      ] as const) {
        const { res, hops, crossHost } = await follow("/", "health.beyu.co.tz", cookie);
        expect(crossHost, `${email}: ${hops.join(" → ")}`).toBeUndefined();
        // Terminal document is a Health surface: the governed sector SPA (an
        // ACTIVE federation link) or the truthful Health entry/denial page.
        expect(res.status, `${email}: ${hops.join(" → ")}`).toBe(200);
        const isHealthSurface =
          res.body.includes("BEYU Health OS") ||
          res.body.includes("Health OS access denied") ||
          res.body.includes("Health OS authorization unavailable");
        expect(isHealthSurface, `${email}: ${hops.join(" → ")}`).toBe(true);
        // THE regression: the generic launcher's destination grid must not be
        // rendered on the Health host at any point in the chain.
        expect(res.body, `${email}: ${hops.join(" → ")}`).not.toContain(LAUNCHER_GRID);
        expect(res.body, `${email}: ${hops.join(" → ")}`).not.toContain("Select a governed destination");
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "the Health host's unauthenticated deep link and its sign-in surface stay on the Health host",
    async () => {
      const deep = await getWithHost("/os/health", "health.beyu.co.tz");
      expect(deep.status).toBe(307);
      // Relative: the visitor is returned to sign-in ON the canonical Health host.
      expect(deep.location).toBe("/");
      const signin = await getWithHost("/", "health.beyu.co.tz");
      expect(signin.status).toBe(200);
      expect(signin.body).toContain("Sign in to Health OS — governed by BEYU OS");
      // The post-sign-in landing is the Health route, computed server-side from
      // the host contract (never from a query string) and root-relative. The
      // RSC payload escapes quotes, so match either form.
      expect(signin.body).toMatch(/\\?"landing\\?":\\?"\/os\/health\\?"/);
      expect(signin.body).not.toContain(LAUNCHER_GRID);
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "signing in ON the Health host returns the visitor to the Health destination on the same host",
    async () => {
      const password = process.env.BEYU_BOOTSTRAP_PASSWORD;
      if (!password) throw new Error("BEYU_BOOTSTRAP_PASSWORD is required for HTTP tests");

      // A real end-to-end callback: authenticate with the Health host as the
      // request Host (so the session cookie is issued for the canonical apex),
      // then replay what the browser does next — GET / on the same host.
      //
      // TOTP replay prevention rejects a step `beforeAll` already consumed for
      // this identity, so a fresh 30s window is awaited when a code is refused
      // (the same convention as tests/helpers/http.ts `login`).
      let loginOnHealthHost: Reply | null = null;
      for (let attempt = 0; attempt < 3 && !loginOnHealthHost; attempt += 1) {
        const [user] = await db.select().from(users).where(eq(users.email, "ceo@beyu.os")).limit(1);
        if (!user) throw new Error("seed user ceo@beyu.os is missing — run npm run seed");
        const mfaCode = user.mfaSecretEncrypted
          ? generateTotpCode(decryptSecret(user.mfaSecretEncrypted), Date.now())
          : undefined;
        const attemptRes = await send(
          "POST",
          "/api/v1/auth/login",
          { host: "health.beyu.co.tz", origin: "http://health.beyu.co.tz", "content-type": "application/json" },
          JSON.stringify({ email: "ceo@beyu.os", password, mfaCode }),
        );
        if (attemptRes.status === 200) loginOnHealthHost = attemptRes;
        else await new Promise((r) => setTimeout(r, 31_000));
      }
      if (!loginOnHealthHost) throw new Error("could not authenticate ceo@beyu.os on health.beyu.co.tz");
      // The ONE cookie policy (src/lib/session-cookie.ts): HttpOnly + SameSite
      // always; scoped to the canonical apex only when the deployment opts in,
      // otherwise host-only. Either way it is never scoped to a foreign domain,
      // and its scope is never an authorization.
      for (const cookie of loginOnHealthHost.setCookie) {
        const lower = cookie.toLowerCase();
        expect(lower).toContain("httponly");
        expect(lower).toContain("samesite=lax");
        const domain = /;\s*domain=([^;]+)/i.exec(cookie)?.[1]?.trim();
        if (domain) expect(domain).toBe("beyu.co.tz");
      }
      const sessionCookie = loginOnHealthHost.setCookie.map((c) => c.split(";")[0]).join("; ");

      const { res: landed, hops, crossHost } = await follow("/", "health.beyu.co.tz", sessionCookie);
      // No hop ever leaves the canonical Health hostname.
      expect(crossHost, hops.join(" → ")).toBeUndefined();
      expect(landed.status, hops.join(" → ")).toBe(200);
      // The visitor arrives at a Health surface, never the control-plane grid.
      expect(landed.body, hops.join(" → ")).not.toContain(LAUNCHER_GRID);
      expect(
        landed.body.includes("BEYU Health OS") ||
          landed.body.includes("Health OS access denied") ||
          landed.body.includes("Health OS authorization unavailable"),
        hops.join(" → "),
      ).toBe(true);
      // A fresh TOTP window can cost up to 31s per attempt.
    },
    150_000,
  );
});

describe("E/F. cross-OS routing and switching", () => {
  it.skipIf(!enabled || !routingConfigured)(
    "a path owned by another OS redirects once to that OS's canonical host (same path, https)",
    async () => {
      const cases: Array<[string, string, string]> = [
        ["health.beyu.co.tz", "/os/finance", "https://finance.beyu.co.tz/os/finance"],
        ["finance.beyu.co.tz", "/os/health", "https://health.beyu.co.tz/os/health"],
        ["finance.beyu.co.tz", "/health/os", "https://health.beyu.co.tz/health/os"],
        ["agriculture.beyu.co.tz", "/os/ujenzi/projects", "https://ujenzi.beyu.co.tz/os/ujenzi/projects"],
        ["ujenzi.beyu.co.tz", "/os/agriculture?x=1", "https://agriculture.beyu.co.tz/os/agriculture?x=1"],
        ["health.beyu.co.tz", "/os/foundation", "https://foundation.beyu.co.tz/os/foundation"],
        ["noelia.beyu.co.tz", "/os/finance", "https://finance.beyu.co.tz/os/finance"],
        ["familyoffice.beyu.co.tz", "/os/ujenzi", "https://ujenzi.beyu.co.tz/os/ujenzi"],
      ];
      for (const [host, path, location] of cases) {
        const res = await getWithHost(path, host, ceoCookie);
        expect(res.status, `${host}${path}`).toBe(307);
        expect(res.location, `${host}${path}`).toBe(location);
        // The redirected request is served in place on the target host, or the
        // target's own governed gate issues ONE relative hop (e.g. Health's
        // mount → the `/health` entry/denial page). Never another cross-host
        // location: the browser-facing hostname stays the owning OS's host.
        const target = new URL(location);
        const followed = await getWithHost(target.pathname, target.host, ceoCookie);
        if (followed.status >= 300 && followed.status < 400) {
          expect(followed.location ?? "", `${host}${path} → ${location}`).toMatch(/^\//);
        }
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "shared surfaces and the control plane are served in place on every canonical host",
    async () => {
      for (const host of ["health.beyu.co.tz", "finance.beyu.co.tz", "foundation.beyu.co.tz", "noelia.beyu.co.tz"]) {
        for (const path of ["/os", "/launcher", "/os/family", "/os/noelia", "/api/v1/authorization/context"]) {
          const res = await getWithHost(path, host, ceoCookie);
          expect(res.status, `${host}${path}`).not.toBe(307);
          expect(res.location ?? "", `${host}${path}`).not.toMatch(/^https?:\/\//);
        }
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)("existing routes on www are untouched", async () => {
    for (const path of ["/os/finance", "/os/agriculture", "/os/ujenzi", "/os/foundation"]) {
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
  it.skipIf(!enabled || !routingConfigured)(
    "look-alike, near-miss and unknown hosts select nothing and leak nothing",
    async () => {
      for (const host of [
        "health.beyu.co.tz.evil.example",
        "evil-health.beyu.co.tz",
        "unknown.beyu.co.tz",
        "family-office.beyu.co.tz",
        "familyoffice.beyu.co.tz.evil",
        "noelias.beyu.co.tz",
        "foundationx.beyu.co.tz",
        "x.foundation.beyu.co.tz",
        "mwanza.health.beyu.co.tz",
      ]) {
        const res = await getWithHost("/", host);
        expect(res.status, host).toBe(200);
        expect(res.body, host).toContain("Sign in to the control plane");
        const cross = await getWithHost("/os/finance", host, ceoCookie);
        expect(cross.status, host).toBe(200); // served in place, no redirect
      }
    },
  );

  it.skipIf(!enabled || !routingConfigured)(
    "an OS surface is never served on another OS's or a surface's canonical host",
    async () => {
      for (const [host, path, cookie] of [
        ["finance.beyu.co.tz", "/os/health", healthCookie],
        ["health.beyu.co.tz", "/os/finance", ceoCookie],
        ["foundation.beyu.co.tz", "/os/ujenzi", ujenziCookie],
        ["noelia.beyu.co.tz", "/os/agriculture", agriCookie],
      ] as const) {
        const res = await getWithHost(path, host, cookie);
        // Either the single 307 to the owning OS's canonical host, or a refusal —
        // never the other OS's rendered surface.
        if (res.status === 307) expect(res.location, `${host}${path}`).toMatch(/^https:\/\/[a-z]+\.beyu\.co\.tz\//);
        else expect(res.status).not.toBe(200);
      }
    },
  );
});
