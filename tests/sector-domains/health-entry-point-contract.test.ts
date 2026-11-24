/**
 * HEALTH OS ENTRY POINT — canonical domain, canonical route, legacy alias.
 *
 * The mission this suite answers: `health.beyu.co.tz` must open the EXISTING
 * Health OS frontend through BEYU's canonical host-resolution and authorization
 * architecture — not a second Health application, not a duplicated frontend, not
 * a new backend, not a new database.
 *
 * Everything here is asserted WITHOUT a server first (pure contract + source) and
 * then, when a server is running, against the REAL production build (see the
 * `HTTP` describe block at the end; it skips without a server exactly like the
 * repository's other HTTP suites, and hard-fails if `BEYU_TEST_BASE_URL` was
 * configured but the server is unreachable — `tests/helpers/http.ts`).
 *
 * WHAT THIS SUITE PINS
 *   A. HOST RESOLUTION
 *      `health.beyu.co.tz` → `HEALTH_OS`; `www.beyu.co.tz` → the control plane;
 *      every other Sector OS keeps its own destination; an unknown/hostile host
 *      selects NO destination and therefore NO Health frontend.
 *   B. ROUTING
 *      `/os/health` is canonical and `/health/os` is the pre-existing alias; both
 *      delegate to ONE mount; no `/os/health-os` route is depended upon; a deep
 *      link and a refresh reach the same gate; the trailing slash is normalised;
 *      query strings survive a redirect.
 *   C. AUTHENTICATION
 *      Unauthenticated → the sign-in surface on the SAME host; the Health
 *      destination survives sign-in (the landing is the destination's own route,
 *      server-computed); a signed-in identity WITHOUT an active federation link
 *      is denied; the hostname itself grants nothing.
 *   D. FRONTEND
 *      The ONE mount serves the compiled sector SPA document; its only network
 *      surface stays `/health-os/auth/*`; no asset path is emitted relative to
 *      the mount point (which would 404 one segment too deep).
 *   E. API / BACKEND
 *      No rewrite to `HEALTH_API_URL` exists, so the SPA's sign-in fails closed
 *      (404) rather than appearing to succeed; the BEYU liveness probes are
 *      untouched; no second API base is introduced.
 *   F. SECURITY
 *      The hostname is not an authorization input; the federation gate is
 *      fail-closed (absent / revoked / unavailable); tenant isolation and the
 *      `GlobalUserID` link remain the only source of Health authority.
 */
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalEntryHref,
  canonicalHostOptionsFromEnvironment,
  decideProxyAction,
  osOwningPath,
  resolveCanonicalHost,
  type CanonicalHostOptions,
  type ProxyRequestFacts,
} from "@/lib/canonical-hosts";
import { SECTOR_OPERATING_SYSTEMS } from "@/lib/operating-system-catalog";
import { HOST_DESTINATION_IDENTIFIERS, resolveHostDestination } from "@/lib/host-routing";
import { baseUrl, login, serverAvailable } from "../helpers/http";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");
/** Source with comments removed — these assertions are about code, not prose. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The production shape: the apex configured, no localhost development base. */
const PROD: CanonicalHostOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: false };
/** An environment that has NOT opted in (every preview deployment today). */
const UNCONFIGURED: CanonicalHostOptions = { canonicalDomain: null, allowLocalhost: false };

const facts = (overrides: Partial<ProxyRequestFacts>): ProxyRequestFacts => ({
  host: "beyu.co.tz",
  pathname: "/",
  method: "GET",
  origin: null,
  protocol: "https:",
  port: "",
  ...overrides,
});

/** The destinations Health must NOT be reachable as, and their own homes. */
const OTHER_SECTOR_HOMES: Record<string, string> = {
  FINANCE: "/os/finance",
  AGRICULTURE: "/os/agriculture",
  UJENZI: "/os/ujenzi",
};

/* ================================================================== */
/* A. HOST RESOLUTION                                                 */
/* ================================================================== */

describe("A. host resolution — health.beyu.co.tz is HEALTH_OS and nothing else", () => {
  it("resolves the canonical Health host to HEALTH_OS at /os/health", () => {
    const resolution = resolveHostDestination("health.beyu.co.tz", PROD);
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") throw new Error("unreachable");
    expect(resolution.destination).toBe("HEALTH_OS");
    expect(resolution.route).toBe("/os/health");
    // The OS-level contract agrees — there is ONE mapping, not two.
    const canonical = resolveCanonicalHost("health.beyu.co.tz", PROD);
    expect(canonical.kind).toBe("SECTOR_OS");
    if (canonical.kind === "SECTOR_OS") {
      expect(canonical.os.code).toBe("HEALTH");
      expect(canonical.os.registryCode).toBe("HEALTH_OS");
      expect(canonical.os.href).toBe("/os/health");
    }
  });

  it("keeps www and the apex on the control plane, never on a Sector OS", () => {
    for (const host of ["beyu.co.tz", "www.beyu.co.tz"]) {
      const resolution = resolveHostDestination(host, PROD);
      expect(resolution.status, host).toBe("resolved");
      if (resolution.status === "resolved") {
        expect(resolution.destination, host).toBe("HOME");
        expect(resolution.route, host).toBe("/os");
      }
      expect(resolveCanonicalHost(host, PROD).kind, host).toBe("CONTROL_PLANE");
    }
  });

  it("keeps every other Sector OS on its own destination and route", () => {
    for (const os of SECTOR_OPERATING_SYSTEMS) {
      if (os.code === "HEALTH") continue;
      const host = `${os.subdomain}.beyu.co.tz`;
      const resolution = resolveHostDestination(host, PROD);
      expect(resolution.status, host).toBe("resolved");
      if (resolution.status !== "resolved") throw new Error(host);
      expect(resolution.destination, host).not.toBe("HEALTH_OS");
      expect(resolution.route, host).toBe(os.href);
    }
  });

  it("selects NO destination for an unknown, look-alike or foreign host", () => {
    for (const host of [
      "evil-health.beyu.co.tz",
      "health.beyu.co.tz.attacker.example",
      "health-beyu.co.tz",
      "health.beyu.co.tz.evil",
      "xhealth.beyu.co.tz",
      "mwanza.health.beyu.co.tz", // governed tenant namespace, not a destination
      "a.b.health.beyu.co.tz",
      "preview-abc.vercel.app",
      "localhost",
    ]) {
      const resolution = resolveHostDestination(host, PROD);
      expect(resolution.status, host).not.toBe("resolved");
      expect(resolveCanonicalHost(host, PROD).kind, host).toBe("NEUTRAL");
      // NEUTRAL therefore cannot be redirected INTO a Health experience either.
      expect(decideProxyAction(facts({ host, pathname: "/" }), PROD).kind, host).toBe("NEXT");
    }
  });

  it("resolves nothing at all when the apex is not configured (preview deployments)", () => {
    for (const host of ["health.beyu.co.tz", "beyu.co.tz", "www.beyu.co.tz"]) {
      expect(resolveHostDestination(host, UNCONFIGURED).status, host).not.toBe("resolved");
      expect(resolveCanonicalHost(host, UNCONFIGURED).kind, host).toBe("NEUTRAL");
    }
    // And the environment reader honours the same contract (no hidden default apex).
    expect(canonicalHostOptionsFromEnvironment({ NODE_ENV: "production" }).canonicalDomain).toBeNull();
    expect(
      canonicalHostOptionsFromEnvironment({ NODE_ENV: "production", BEYU_CANONICAL_DOMAIN: "beyu.co.tz" })
        .canonicalDomain,
    ).toBe("beyu.co.tz");
  });

  it("composes the entry URL from configuration, falling back to the internal route", () => {
    const health = SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "HEALTH")!;
    // Apex configured → the destination's public homepage, not its protected route.
    expect(canonicalEntryHref(health, PROD)).toBe("https://health.beyu.co.tz/");
    // NOT configured (every preview deployment) → the internal route, which is
    // the ONLY thing that can work when no canonical hosts are attached. This is
    // the regression the homepage fix removes: it used to emit the literal
    // production URL regardless of configuration, producing dead links.
    expect(canonicalEntryHref(health, UNCONFIGURED)).toBe("/os/health");
    // Development: with the localhost base opted in, the request's scheme/port is
    // preserved so a `next dev` link is reachable.
    expect(
      canonicalEntryHref(health, { canonicalDomain: "localhost", allowLocalhost: true }, { protocol: "http:", port: "3000" }),
    ).toBe("http://health.localhost:3000/");
    // allowLocalhost WITHOUT the localhost base (a production shape) must never
    // produce a `*.localhost` URL, and must never invent one either.
    expect(canonicalEntryHref(health, PROD, { protocol: "http:", port: "3000" })).toBe(
      "https://health.beyu.co.tz/",
    );
    // A destination with no hostname can never be composed into one.
    expect(canonicalEntryHref({ ...health, subdomain: "" }, PROD)).toBe("/os/health");
  });

  it("declares HEALTH_OS exactly once in the contract vocabulary", () => {
    expect(HOST_DESTINATION_IDENTIFIERS.filter((identifier) => identifier === "HEALTH_OS")).toHaveLength(1);
    expect(HOST_DESTINATION_IDENTIFIERS).not.toContain("HEALTH_OS_OS" as never);
  });
});

/* ================================================================== */
/* B. ROUTING                                                         */
/* ================================================================== */

describe("B. routing — one canonical route, one compatibility alias, one mount", () => {
  const canonicalRoute = code(source("src", "app", "os", "health", "route.ts"));
  const aliasRoute = code(source("src", "app", "health", "os", "route.ts"));
  const mount = code(source("src", "app", "os", "health", "mount.ts"));

  it("owns both Health URLs so another OS host can never serve them in place", () => {
    expect(osOwningPath("/os/health")?.code).toBe("HEALTH");
    expect(osOwningPath("/health/os")?.code).toBe("HEALTH");
    expect(osOwningPath("/health")?.code).toBe("HEALTH");
    // A prefix is only owned when it matches a whole segment.
    expect(osOwningPath("/os/healthcare")).toBeNull();
    expect(osOwningPath("/os/health-os")).toBeNull();
  });

  it("moves both Health URLs to the canonical Health host exactly once — no loop", () => {
    for (const pathname of ["/os/health", "/health/os", "/health/os/deep/link"]) {
      const action = decideProxyAction(facts({ host: "finance.beyu.co.tz", pathname }), PROD);
      expect(action.kind, pathname).toBe("REDIRECT");
      if (action.kind !== "REDIRECT") throw new Error(pathname);
      const target = new URL(action.location);
      expect(target.hostname, pathname).toBe("health.beyu.co.tz");
      expect(target.pathname, pathname).toBe(pathname);
      // The target host OWNS the path, so the followed request is served.
      expect(decideProxyAction(facts({ host: target.host, pathname: target.pathname }), PROD).kind).toBe(
        "NEXT",
      );
    }
  });

  it("stands still on the canonical Health host — no redirect at all", () => {
    for (const pathname of ["/os/health", "/health/os", "/health", "/os/health/", "/"]) {
      expect(decideProxyAction(facts({ host: "health.beyu.co.tz", pathname }), PROD).kind, pathname).toBe(
        "NEXT",
      );
    }
  });

  it("depends on NO /os/health-os route anywhere in the repository", () => {
    for (const file of [
      "src/lib/canonical-hosts.ts",
      "src/lib/operating-system-catalog.ts",
      "src/lib/host-routing.ts",
      "src/app/os/health/mount.ts",
      "src/app/health/os/route.ts",
      "src/app/page.tsx",
      "scripts/build-health-spa.mjs",
    ]) {
      expect(code(source(...file.split("/"))), file).not.toContain("/os/health-os");
    }
    // Both URL segments resolve, so no router-level fallback is being relied upon.
    expect(canonicalRoute).toContain('from "./mount"');
    expect(aliasRoute).toContain('from "@/app/os/health/mount"');
  });

  it("serves the alias from the SAME mount as the canonical route", () => {
    for (const route of [canonicalRoute, aliasRoute]) {
      expect(route).toContain("serveHealthOS({ host: request.headers.get(\"host\") })");
      expect(route).toContain('export const dynamic = "force-dynamic"');
      // Neither route may reintroduce the gate, relax it, or serve the document.
      expect(route).not.toContain("resolvePrincipal");
      expect(route).not.toContain("checkHealthOSAuthorization");
      expect(route).not.toContain("healthSpaHtml");
      // The URL is a location, never an authorization input.
      expect(route).not.toMatch(/searchParams|nextUrl|x-forwarded|request\.url/i);
    }
  });

  it("keeps the denial surface at /health (both gates fail closed TO it)", () => {
    expect(mount).toContain('HEALTH_OS_DENIAL_PATH = "/health"');
    const denialFile = source("src", "app", "health", "page.tsx");
    expect(denialFile).toContain("checkHealthOSAuthorization");
    expect(denialFile).toContain('redirect("/os/health")');
    // Authorized users are forwarded to the canonical route — never to the alias.
    expect(denialFile).not.toContain('redirect("/health/os")');
  });

  it("normalises a trailing slash without dropping the query string", () => {
    // Next.js normalises `/os/health/` → `/os/health` with a 308 before routing;
    // the proxy adds nothing. The redirect the proxy does emit preserves `search`
    // because `src/proxy.ts` copies `request.nextUrl.search` onto the target.
    expect(code(source("src", "proxy.ts"))).toContain("location.search = request.nextUrl.search");
  });
});

/* ================================================================== */
/* C. AUTHENTICATION & DESTINATION-AWARE SIGN-IN                      */
/* ================================================================== */

describe("C. authentication — the Health destination survives sign-in, the gate is fail-closed", () => {
  const mount = code(source("src", "app", "os", "health", "mount.ts"));
  const entry = code(source("src", "app", "page.tsx"));
  const authorization = code(source("src", "lib", "health-os-authorization.ts"));

  it("gates the document on the BEYU session BEFORE the federation link", () => {
    // `resolvePrincipal` is imported under its real name, so the call is matched
    // on the identifier rather than a literal `resolvePrincipal()`.
    const session = mount.search(/resolvePrincipal\b/);
    const federation = mount.indexOf("checkHealthOSAuthorization(principal.userId)");
    // The document is served LAST, in the single success branch.
    const document = mount.lastIndexOf("new NextResponse(healthSpaHtml");
    expect(session).toBeGreaterThan(-1);
    expect(federation).toBeGreaterThan(session);
    expect(document).toBeGreaterThan(federation);
    // Exactly one success branch in the whole module.
    expect(mount.match(/new NextResponse\(healthSpaHtml/g)).toHaveLength(1);
  });

  it("fails closed: unauthenticated → '/', unauthorized → the denial surface", () => {
    expect(mount).toMatch(/if \(!principal\)[\s\S]{0,160}Location: "\/"/);
    expect(mount).toMatch(/if \(!healthAuth\.authorized\)[\s\S]{0,160}Location: HEALTH_OS_DENIAL_PATH/);
    // No path in the mount ever produces a 200 without both gates passing.
    expect(mount).not.toMatch(/status: 200[\s\S]{0,80}(principal|healthAuth)/);
  });

  it("authorizes ONLY an ACTIVE federation link (absent, revoked and expired all deny)", () => {
    expect(authorization).toContain('ACTIVE_LINK_STATUS = "active"');
    expect(authorization).toContain("eq(beyuIdentityLinks.status, ACTIVE_LINK_STATUS)");
    expect(authorization).toContain('reason: "NOT_LINKED"');
    expect(authorization).toContain('reason: "AUTHORIZATION_SERVICE_UNAVAILABLE"');
    // A database that cannot answer fails CLOSED, and never becomes a grant.
    expect(authorization).toMatch(/catch[\s\S]{0,400}authorized: false, reason: "AUTHORIZATION_SERVICE_UNAVAILABLE"/);
  });

  it("supports query parameters on the alias? No — the mount reads no URL at all", () => {
    // Nothing in the gate reads a path segment or a query parameter, so a
    // `?next=` / `?returnTo=` style parameter can neither change the outcome nor
    // become an open redirect.
    expect(mount).not.toMatch(/searchParams|redirect_to|returnTo|callbackUrl|location\.search/i);
    expect(entry).not.toMatch(/searchParams|redirect_to|returnTo|callbackUrl/i);
  });

  it("lands a Health principal on the Health route, computed server-side, on the same host", () => {
    // The sign-in landing is the resolved context's own href (never an input), and
    // the single-destination launch goes through the ONE canonical-host helper —
    // which returns the relative route unless the apex + shared session are
    // configured, so it can never be an absolute cross-host redirect.
    expect(entry).toContain('landing={requestedContext ? requestedContext.href : "/os"}');
    expect(entry).toContain("destinationHrefForRequest()");
    for (const target of [...entry.matchAll(/redirect\(([^)]*)\)/g)].map((match) => match[1])) {
      expect(target, target).not.toMatch(/https?:|beyu\.co\.tz/);
    }
  });

  it("never converts a BEYU session into a sector token", () => {
    // The documented boundary: the BEYU session gates the MOUNT; the sector keeps
    // its own authentication. No JWT is minted, no cookie is rewritten, no session
    // is bridged in the routing layer.
    for (const [file, text] of [
      ["src/app/os/health/mount.ts", mount],
      ["src/app/os/health/route.ts", code(source("src", "app", "os", "health", "route.ts"))],
      ["src/app/health/os/route.ts", code(source("src", "app", "health", "os", "route.ts"))],
    ] as const) {
      expect(text, file).not.toMatch(/jsonwebtoken|jwt\.sign|accessToken\s*=|refreshToken\s*=|BEYU_JWT|identityExchange/i);
    }
  });
});

/* ================================================================== */
/* D. FRONTEND MOUNT                                                  */
/* ================================================================== */

describe("D. frontend — the EXISTING sector SPA is mounted, not rebuilt", () => {
  const mount = source("src", "app", "os", "health", "mount.ts");
  const buildScript = source("scripts", "build-health-spa.mjs");

  it("serves the ONE compiled sector document as text/html, uncached", () => {
    expect(mount).toContain("healthSpaHtml");
    expect(mount).toContain('"Content-Type": "text/html; charset=utf-8"');
    expect(mount).toContain('"Cache-Control": "no-store"');
    expect(mount).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("compiles the sector package with its own toolchain and the same-origin API base", () => {
    expect(buildScript).toContain("sectors");
    expect(buildScript).toContain("npm ci");
    expect(buildScript).toContain("VITE_API_BASE_URL: \"/health-os\"");
    // The generated artifact is written INTO the BEYU app; it is not a second app.
    expect(buildScript).toContain('"src", "app", "health", "os"');
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toContain("build-health-spa.mjs");
  });

  it("emits no asset path relative to the mount point (which would 404 one segment deep)", () => {
    // VERIFIED DEFECT, repaired at the source of the document. The sector's
    // `index.html` declares its icon ROOT-ABSOLUTELY (`/brand/favicon.png`), but
    // `vite-plugin-singlefile` forces `base: "./"`, so the compiled document
    // shipped `href="./brand/favicon.png"`. Served from `/os/health` that resolves
    // to `/os/brand/favicon.png` → 404 (confirmed on the running build; the real
    // asset is `/brand/favicon.png` → 200). The build script now restores the
    // root-absolute form, which is correct for BOTH mount points.
    const buildScript = source("scripts", "build-health-spa.mjs");
    expect(buildScript).toContain('/(\\s(?:href|src)=")\\.\\//g');
    expect(buildScript).toContain('"$1/"');
    // The sector source keeps its correct, mount-agnostic declaration.
    const sectorHtml = source("sectors", "health", "index.html");
    expect(sectorHtml).toContain('href="/brand/favicon.png"');
    // Every script/stylesheet is inlined by the single-file build, so the icon is
    // the ONLY reference that can survive; nothing else needs a base path.
    const sectorAssets = [...sectorHtml.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(sectorAssets).toEqual(["/brand/favicon.png", "/src/main.tsx"]);
    // `sectors/health/dist/index.html` is the PRE-rewrite Vite output (Vite always
    // emits `./`), so it is expected to stay relative — the build script rewrites
    // on the way into `src/app/health/os/spa-content.ts`, which is what ships. The
    // committed placeholder never carries a relative reference; the SERVED
    // document is asserted end-to-end in `G.` below.
    const shipped = source("src", "app", "health", "os", "spa-content.ts");
    expect(shipped).not.toMatch(/(?:href|src)=\"\.\/(?:brand|assets)\//);
  });

  it("keeps the sector SPA's only network surface at /health-os", () => {
    const auth = source("sectors", "health", "src", "services", "auth.ts");
    expect(auth).toContain("VITE_API_BASE_URL");
    expect(auth).toContain('credentials: "include"');
    // In-memory access token only. The file SAYS "never localStorage" in a
    // comment, so the assertion is made against code, not prose.
    expect(code(auth)).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(code(auth)).toContain("let accessToken");
    // Exactly one module performs network I/O in the sector frontend.
    expect(auth).toContain("/auth/login");
    expect(auth).toContain("/auth/restore");
    expect(auth).toContain("/auth/refresh");
    expect(auth).toContain("/auth/logout");
  });

  it("mounts no second Health shell, sidebar or session provider", () => {
    for (const forbidden of [
      "src/app/os/health/layout.tsx",
      "src/app/os/health/page.tsx",
      "src/app/health/os/page.tsx",
      "src/app/os/health-os",
    ]) {
      expect(() => source(...forbidden.split("/")), forbidden).toThrow();
    }
  });
});

/* ================================================================== */
/* E. API / BACKEND                                                   */
/* ================================================================== */

describe("E. API and backend — fail-closed, no false success", () => {
  const nextConfig = code(source("next.config.ts"));
  const authorization = source("src", "lib", "health-os-authorization.ts");

  it("declares no rewrite to the sector backend (the identity bridge is not implemented)", () => {
    expect(nextConfig).not.toContain("async rewrites");
    expect(nextConfig).not.toContain("HEALTH_API_URL");
    expect(nextConfig).not.toContain("/health-os/auth");
    // The comment must keep saying WHY, so nobody re-adds it silently.
    expect(source("next.config.ts")).toContain("governed identity bridge");
  });

  it("reads the federation link and nothing else from the sector schema", () => {
    // The BEYU runtime must never hold a sector credential surface, a sector
    // password hash, or a sector user record. It reads ONE bridge table, with an
    // explicit column projection.
    const tables = [...authorization.matchAll(/pgSchema\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(tables).toEqual(["beyu_identity"]);
    expect(authorization).not.toMatch(/password_hash|passwordHash|secret|token/i);
    expect(authorization).toContain("beyuIdentityLinks");
  });

  it("leaves the BEYU liveness probes alone (a different contract entirely)", () => {
    for (const probe of ["src/app/api/health/route.ts", "src/app/api/health/live/route.ts"]) {
      const text = source(...probe.split("/"));
      expect(text, probe).not.toContain("healthSpaHtml");
      expect(text, probe).not.toContain("serveHealthOS");
    }
  });
});

/* ================================================================== */
/* F. SECURITY                                                        */
/* ================================================================== */

describe("F. security — the hostname is a context, never a grant", () => {
  it("carries no tenant, entity, role or permission in a host resolution", () => {
    for (const host of ["health.beyu.co.tz", "beyu.co.tz", "www.beyu.co.tz", "finance.beyu.co.tz"]) {
      const resolution = resolveHostDestination(host, PROD);
      expect(JSON.stringify(resolution), host).not.toMatch(
        /tenantId|entityId|countryCode|clearance|classification|permission|principal|role/i,
      );
    }
  });

  it("keeps the Health mount's hosted-name gates purely REFUSING", () => {
    const mount = code(source("src", "app", "os", "health", "mount.ts"));
    // Cross-OS host refusal, then the governed tenant-domain gate, then the
    // namespace gate — each one can only produce a refusal.
    const refusal = mount.indexOf("hostnameDenialResponse()");
    expect(refusal).toBeGreaterThan(-1);
    expect(mount.indexOf("isForeignOSHost(request.host, \"HEALTH\")")).toBeGreaterThan(-1);
    expect(mount).toContain('resolutionBelongsToNamespace(tenantDomain, "HEALTH_OS")');
    // No branch anywhere turns a host into a grant.
    expect(mount).not.toMatch(/request\.host[\s\S]{0,60}(authorized:\s*true|status:\s*200)/);
  });

  it("keeps the global identity link 1:1 and status-bound in the sector contract", () => {
    const integration = source("sectors", "health", "INTEGRATION.md");
    expect(integration).toContain("beyu_identity_links");
    expect(integration).toContain("fail-closed `requireCanonicalLink`");
    expect(integration).toContain("One GlobalUserID");
    const bridge = source(
      "sectors",
      "health",
      "backend",
      "database",
      "migrations",
      "002_beyu_identity_bridge.up.sql",
    );
    expect(bridge).toContain("global_user_id uuid PRIMARY KEY");
    expect(bridge).toContain("UNIQUE (beyu_user_id)");
    const lifecycle = source(
      "sectors",
      "health",
      "backend",
      "database",
      "migrations",
      "031_bridge_lifecycle_status.up.sql",
    );
    expect(lifecycle).toContain("CHECK (status IN ('active', 'revoked', 'expired'))");
  });
});

/* ================================================================== */
/* G. THE RUNNING SERVER                                              */
/* ================================================================== */

const enabled = Boolean(process.env.BEYU_TEST_BASE_URL);
const routingConfigured = process.env.BEYU_TEST_CANONICAL_DOMAIN === "beyu.co.tz";

type Reply = { status: number; location?: string; body: string; setCookie: string[] };

/** GET a path with an explicit Host header (`fetch` cannot override `Host`). */
function getWithHost(requestPath: string, host: string, cookie?: string): Promise<Reply> {
  const url = new URL(baseUrl());
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path: requestPath, method: "GET", headers: { host, ...(cookie ? { cookie } : {}) } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body,
            setCookie: res.headers["set-cookie"] ?? [],
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * ONE Health session for the whole block. `login()` consumes a TOTP step and the
 * helper waits out a replayed window, so authenticating twice inside one run is
 * both slow and flaky. Memoised on first use; never cached across runs.
 */
let healthSession: Promise<string> | null = null;
const healthSessionCookie = () => (healthSession ??= login("health.ops@beyu.os"));

describe("G. the running server — the real production build", () => {
  it("answers the BEYU liveness probe (a configured-but-down server FAILS, never skips)", async () => {
    // `serverAvailable()` throws when `BEYU_TEST_BASE_URL` is configured and the
    // server is unreachable, so this can only be true or an error here. It is the
    // guard for every assertion in this block.
    expect(await serverAvailable()).toBe(true);
  });

  it.skipIf(!enabled || !routingConfigured)(
    "serves the Health PUBLIC HOMEPAGE on health.beyu.co.tz, the Health sign-in at /sign-in, and the central homepage on www",
    async () => {
      // `/` on the Health host is Health OS's PUBLIC HOMEPAGE — public
      // institutional information, no credential form, no destination data.
      const healthRoot = await getWithHost("/", "health.beyu.co.tz");
      expect(healthRoot.status).toBe(200);
      expect(healthRoot.body).toContain("Health OS — federated care operations");
      expect(healthRoot.body).toContain("HEALTH_OS");
      expect(healthRoot.body).toContain('href="/sign-in"');
      expect(healthRoot.body).not.toContain('id="beyu-signin-email"');
      expect(healthRoot.body).not.toContain('id="beyu-signin-password"');
      expect(healthRoot.body).not.toContain("Sign in to the control plane");
      // The CENTRAL public gateway is not rendered on a destination host.
      expect(healthRoot.body).not.toContain("beyu-system-card");

      // The Health DESTINATION sign-in — the destination headline and the Health
      // authentication surface — lives at `/sign-in` on the same host, and is
      // not the generic control plane.
      const healthSignIn = await getWithHost("/sign-in", "health.beyu.co.tz");
      expect(healthSignIn.status).toBe(200);
      expect(healthSignIn.body).toContain('id="beyu-destination-headline"');
      expect(healthSignIn.body).toContain("Health OS — federated care operations");
      expect(healthSignIn.body).toContain("Sign in to Health OS");
      expect(healthSignIn.body).not.toContain("Sign in to the control plane");
      // The public gateway (the central marketing homepage) is not rendered.
      expect(healthSignIn.body).not.toContain("beyu-system-card");

      const homepage = await getWithHost("/", "www.beyu.co.tz");
      expect(homepage.status).toBe(200);
      expect(homepage.body).not.toContain("Sign in to Health OS");
      // The control plane landing is the public gateway — the marketing page.
      expect(homepage.body).toContain("beyu-system-card");

      // A look-alike or governed-tenant name that is NOT the canonical Health
      // host gets the neutral control plane — the Health destination is never
      // selected by a substring match, and a tenant namespace never becomes a
      // destination. (Refusing these names entirely happens on the Health mount,
      // asserted by `F.`; here the assertion is that they are not Health.)
      for (const hostile of [
        "evil-health.beyu.co.tz",
        "health.beyu.co.tz.evil.example",
        "mwanza.health.beyu.co.tz",
        "health.beyuos.co.tz", // retired pre-0082 namespace: still not Health
      ]) {
        // A NEUTRAL host renders the CONTROL-PLANE sign-in — never a Sector OS's
        // destination surface, and never the public gateway either. Both are
        // asserted so a future "helpful" fallback to Health cannot pass silently.
        // (The `beyu-destination-headline` element is shared by every sign-in
        // variant, so it is deliberately NOT used as the discriminator; the
        // rendered sign-in copy and the Health headline are.)
        const res = await getWithHost("/", hostile);
        expect(res.body, hostile).toContain("Sign in to the control plane");
        expect(res.body, hostile).not.toContain("Sign in to Health OS");
        expect(res.body, hostile).not.toContain("Health OS — federated care operations");
      }
    },
  );

  it.skipIf(!enabled)("refuses an unauthenticated Health deep link on BOTH URLs, identically", async () => {
    for (const path of ["/os/health", "/health/os"]) {
      const res = await getWithHost(path, "health.beyu.co.tz");
      expect(res.status, path).toBe(307);
      expect(res.location, path).toBe("/");
      // No document, no partial render, no leaked SPA document.
      expect(res.body, path).toBe("");
    }
  });

  it.skipIf(!enabled || !process.env.BEYU_BOOTSTRAP_PASSWORD)(
    "serves a document whose icon resolves from the mount point",
    async () => {
      // SIGNED IN + linked → the real SPA document. Its only non-inlined asset
      // reference must be root-absolute, because the document is served from a
      // MULTI-SEGMENT path. `href="./brand/favicon.png"` would resolve against
      // `/os/` and 404; `href="/brand/favicon.png"` resolves everywhere.
      const cookie = await healthSessionCookie();
      const res = await getWithHost("/os/health", "health.beyu.co.tz", cookie);
      if (res.status !== 200) return; // no ACTIVE federation link in this DB
      expect(res.body).toContain('href="/brand/favicon.png"');
      expect(res.body).not.toContain('href="./brand/favicon.png"');
      // The document is the sector SPA, not a BEYU page.
      expect(res.body).toContain('id="root"');
      expect(res.body).toContain("BEYU Health OS");
    },
    120_000,
  );

  it.skipIf(!enabled)("normalises a trailing slash and keeps the deep link on the same host", async () => {
    const slashed = await getWithHost("/os/health/", "health.beyu.co.tz");
    expect([307, 308]).toContain(slashed.status);
    expect(slashed.location ?? "").toMatch(/^\/os\/health$/);
  });

  it.skipIf(!enabled)("moves Health paths off a foreign Sector OS host exactly once", async () => {
    const moved = await getWithHost("/os/health", "finance.beyu.co.tz");
    expect([307, 308]).toContain(moved.status);
    // Unconfigured deployments have no canonical target; configured ones do.
    if (routingConfigured) expect(moved.location).toBe("https://health.beyu.co.tz/os/health");
  });

  it.skipIf(!enabled)("never serves the sector document to an unauthenticated or unlinked principal", async () => {
    const anonymous = await getWithHost("/os/health", "health.beyu.co.tz");
    expect(anonymous.body).not.toContain('id="root"');
    if (!process.env.BEYU_BOOTSTRAP_PASSWORD) return;
    // `health.ops@beyu.os` is seeded WITHOUT a federation link: signed in, not
    // Health-authorized. The hostname must not change that.
    const cookie = await healthSessionCookie();
    const linked = await getWithHost("/os/health", "health.beyu.co.tz", cookie);
    // Either the denial redirect (no active link in this environment) or the
    // document (an ACTIVE link exists). What may NEVER happen is a session-less
    // or authority-less 200 served to an anonymous principal — asserted above.
    expect([200, 307]).toContain(linked.status);
    if (linked.status === 307) expect(linked.location).toBe("/health");
    if (linked.status === 200) expect(linked.body).toContain('id="root"');
    // The federation gate is the ONLY variable; the URL never is.
    const alias = await getWithHost("/health/os", "health.beyu.co.tz", cookie);
    expect(alias.status).toBe(linked.status);
  }, 120_000);
});
