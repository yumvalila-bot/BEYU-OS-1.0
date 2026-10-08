/**
 * Canonical Sector OS subdomains — security contract (source-level, pure).
 *
 * The subdomains are PRESENTATION boundaries. These gates pin that no file in
 * the change turns a hostname into authority, that every server-side gate the
 * four Sector OSs already had is still there and still runs first, that the
 * proxy is a thin adapter over the tested pure decision, that no second
 * application / registry / Noelia identity appeared, and that session scope
 * is handled by one helper on both the issue and the clear side.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");
/** Source with comments removed — assertions are about code, not prose. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const contract = source("src", "lib", "sector-domains.ts");
const serverHelper = source("src", "lib", "sector-host.ts");
const proxy = source("src", "proxy.ts");
const cookie = source("src", "lib", "session-cookie.ts");
const mount = source("src", "app", "os", "health", "mount.ts");
const signIn = source("src", "app", "page.tsx");
const signInForm = source("src", "app", "sign-in-form.tsx");
const login = source("src", "app", "api", "v1", "auth", "login", "route.ts");
const logout = source("src", "app", "api", "v1", "auth", "logout", "route.ts");

describe("1. the hostname contract is pure and reuses the one normaliser", () => {
  it("imports no database, session, authorization or framework module", () => {
    const c = code(contract);
    expect(c).not.toMatch(/from "@\/db|from "\.\/db|drizzle-orm|next\/server|next\/headers|next\/navigation/);
    expect(c).not.toMatch(/from "\.\/authz"|from "\.\/session"|from "\.\/guard"|from "\.\/policy"|\bcan\(|Principal/);
    expect(c).toContain('from "./tenant-domain/hostname"');
    expect(c).toContain("normalizeHostname(");
    expect(c).toContain('from "./operating-system-catalog"');
  });

  it("has no string-inference of an OS from host text", () => {
    const c = code(contract);
    expect(c).not.toMatch(/includes\("health"\)|includes\("finance"\)|includes\("agriculture"\)|includes\("ujenzi"\)/);
    expect(c).not.toMatch(/host(name)?\.(includes|indexOf|match)\(/);
  });

  it("derives labels from the canonical catalogue, not a parallel table", () => {
    const catalogue = source("src", "lib", "operating-system-catalog.ts");
    expect(catalogue).toContain('subdomain: "health"');
    expect(catalogue).toContain('subdomain: "finance"');
    expect(catalogue).toContain('subdomain: "agriculture"');
    expect(catalogue).toContain('subdomain: "ujenzi"');
    expect(catalogue.match(/subdomain: "/g)?.length).toBe(4);
    expect(code(contract)).toContain("SECTOR_OPERATING_SYSTEMS.filter(");
    expect(code(contract)).not.toMatch(/"health\.beyu|"finance\.beyu|"agriculture\.beyu|"ujenzi\.beyu|beyu\.co\.tz"/);
  });
});

describe("2. the proxy is an adapter: no session, no database, no authority", () => {
  it("exists as the single Next.js proxy and delegates to the pure decision", () => {
    expect(existsSync(path.join(ROOT, "src", "middleware.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "middleware.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "proxy.ts"))).toBe(false);
    expect(proxy).toMatch(/export function proxy\(/);
    expect(code(proxy)).toContain("decideProxyAction(");
    expect(code(proxy)).toContain("sectorDomainOptionsFromEnvironment()");
  });

  it("reads no cookie and touches no session, database or authorization module", () => {
    const c = code(proxy);
    expect(c).not.toMatch(/cookies|beyu_os_session|SESSION_COOKIE|resolvePrincipal|from "@\/db|drizzle|authz|guard|policy/);
    // Redirect targets come from the decision (catalogue + configuration); only
    // the query string of the incoming URL is carried over.
    expect(c).not.toMatch(/x-forwarded-host|searchParams\.get\(/);
    expect(c).toContain("new URL(action.location)");
  });

  it("emits no CORS header and no wildcard origin", () => {
    expect(code(proxy)).not.toMatch(/Access-Control-Allow|"\*"/);
    expect(code(contract)).not.toMatch(/Access-Control-Allow/);
    const next = source("next.config.ts");
    expect(next).not.toMatch(/Access-Control-Allow-Origin/);
  });

  it("does not proxy static assets", () => {
    expect(proxy).toContain("_next/static");
    expect(proxy).toContain("_next/image");
  });
});

describe("3. every Sector OS keeps its own server-side gate; the host can only refuse", () => {
  it("Health mount refuses a foreign sector host BEFORE the federation gate and BEFORE the document", () => {
    const c = code(mount);
    const foreign = c.indexOf('isForeignSectorHost(request.host, "HEALTH")');
    expect(foreign).toBeGreaterThan(-1);
    expect(foreign).toBeGreaterThan(c.indexOf("resolvePrincipal()"));
    expect(foreign).toBeLessThan(c.indexOf("checkHealthOSAuthorization("));
    expect(foreign).toBeLessThan(c.indexOf("new NextResponse(healthSpaHtml"));
    // The refusal is the uniform, information-free 404 — never a redirect.
    expect(c.slice(foreign, foreign + 200)).toContain("hostnameDenialResponse()");
    // Pre-existing gates are intact.
    expect(c).toContain("resolveRequestHostname(principal, request.host)");
    expect(c).toContain('resolutionBelongsToNamespace(tenantDomain, "HEALTH_OS")');
    expect(c).toContain("checkHealthOSAuthorization(principal.userId)");
    // The mount still never reads the pathname, search params or raw headers.
    expect(c).not.toMatch(/pathname|searchParams|request\.headers|x-forwarded/i);
  });

  it("Agriculture, Ujenzi and Finance refuse a foreign sector host after the session gate and keep their scope gates", () => {
    const agriculture = code(source("src", "app", "os", "agriculture", "layout.tsx"));
    const ujenzi = code(source("src", "app", "os", "ujenzi", "layout.tsx"));
    const finance = code(source("src", "app", "os", "finance", "layout.tsx"));

    for (const [text, codeName] of [
      [agriculture, "AGRICULTURE"],
      [ujenzi, "UJENZI"],
      [finance, "FINANCE"],
    ] as const) {
      const session = text.indexOf("requirePrincipal()");
      const foreign = text.indexOf(`requestIsOnForeignSectorHost("${codeName}")`);
      expect(session, codeName).toBeGreaterThan(-1);
      expect(foreign, codeName).toBeGreaterThan(session);
      expect(text.slice(foreign, foreign + 120), codeName).toContain("notFound()");
    }
    // Existing tenant/classification gates are untouched.
    expect(agriculture).toContain('operatingSystemTenantInScope(\n    principal,\n    "BEYU-AGRI",');
    expect(ujenzi).toContain('operatingSystemTenantInScope(\n    principal,\n    "BEYU-UJENZI",');
    expect(ujenzi).toContain("principal.entityScope.length > 0");
    // The Finance layout grants nothing: the pages keep their own capability guard.
    expect(finance).not.toMatch(/\bcan\(|requireAccess\(/);
    expect(source("src", "app", "os", "finance", "page.tsx")).toContain('requireAccess("finance:ledger.read")');
    expect(source("src", "app", "os", "finance", "payments", "page.tsx")).toContain("requireAccess(");
  });

  it("the server helper only ever REFUSES on a mismatch and reads only the Host header", () => {
    const c = code(serverHelper);
    expect(c).toContain('h.get("host")');
    expect(c).not.toMatch(/x-forwarded|cookies\(|resolvePrincipal|from "@\/db|\bcan\(/);
    expect(c).toContain('resolution.kind === "SECTOR" && resolution.os.code !== code');
  });

  it("the control-plane shell and the OS resolver are unchanged as authorization boundaries", () => {
    const layout = code(source("src", "app", "os", "layout.tsx"));
    expect(layout).toContain("checkBeyuOSAuthorization(principal).authorized");
    expect(layout).toContain('redirect("/launcher")');
    const operatingSystems = code(source("src", "lib", "operating-systems.ts"));
    expect(operatingSystems).not.toMatch(/host|subdomain|sector-domains/i);
  });
});

describe("4. reaching a subdomain authorizes nothing", () => {
  it("the sign-in page redirects to the sector home only through authorizedOperatingSystems()", () => {
    const c = code(signIn);
    const resolver = c.indexOf("authorizedOperatingSystems(principal)");
    const sectorRedirect = c.indexOf("destinations.some((destination) => destination.code === sector.code)");
    expect(resolver).toBeGreaterThan(-1);
    expect(sectorRedirect).toBeGreaterThan(resolver);
    // The existing routing is preserved after the sector branch.
    expect(c).toContain('if (destinations.length > 1) redirect("/launcher");');
    expect(c).toContain("if (destinations.length === 1) redirect(destinations[0].href);");
    // Host is read through the one server helper; never from a query string.
    expect(c).toContain("sectorHostForRequest()");
    expect(c).not.toMatch(/searchParams|redirect_to|returnTo|callbackUrl/i);
  });

  it("the post-login landing is server-computed and same-origin only", () => {
    expect(code(signIn)).toContain('landing={sector ? sector.href : "/os"}');
    const form = code(signInForm);
    expect(form).toContain('/^\\/(?!\\/)/.test(landing) ? landing : "/os"');
    expect(form).not.toMatch(/window\.location\.search|URLSearchParams|searchParams/);
  });
});

describe("5. session scope — one helper, both sides", () => {
  it("login sets the cookie through the helper with the request host; logout clears every variant", () => {
    expect(code(login)).toContain('sessionCookieAttributes(h.get("host"))');
    expect(code(login)).not.toMatch(/sameSite:|httpOnly:|secure:/);
    expect(code(logout)).toContain('sessionCookieClearTargets(h.get("host"))');
    expect(code(logout)).toContain("jar.delete(target)");
  });

  it("the helper keeps httpOnly + lax, forces Secure with a domain, and requires cookie domain == canonical domain", () => {
    const c = code(cookie);
    expect(c).toContain("httpOnly: true");
    expect(c).toContain('sameSite: "lax"');
    expect(c).toContain("secure: domain !== undefined || productionMode(env)");
    expect(c).toContain("canonical !== configured) return undefined");
    expect(c).not.toMatch(/sameSite:\s*"none"/);
  });

  it("no other module sets or deletes the session cookie", () => {
    const offenders = walk(path.join(ROOT, "src")).filter((file) => {
      const text = code(readFileSync(file, "utf8"));
      const rel = path.relative(ROOT, file);
      if (rel.endsWith("auth/login/route.ts") || rel.endsWith("auth/logout/route.ts")) return false;
      return /jar\.set\(SESSION_COOKIE|\.delete\(SESSION_COOKIE|set\("beyu_os_session"/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

describe("6. one application, one registry, one Noelia", () => {
  it("creates no sector-specific Noelia identity and no duplicate OS identity", () => {
    const files = walk(path.join(ROOT, "src"));
    const forbidden = /HEALTH_NOELIA|FINANCE_NOELIA|AGRICULTURE_NOELIA|UJENZI_NOELIA|FAMILY_OFFICE_OS|HCM_OS/;
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
    expect(source("src", "lib", "noelia", "canonical-identity.ts")).toContain("NOELIA_AI");
  });

  it("adds no second Next.js application, vercel project file or migration", () => {
    expect(existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
    for (const dir of ["apps", "packages", "health-app", "finance-app", "agriculture-app", "ujenzi-app"]) {
      expect(existsSync(path.join(ROOT, dir)), dir).toBe(false);
    }
    const journal = JSON.parse(source("drizzle", "meta", "_journal.json")) as { entries: Array<{ tag: string }> };
    expect(journal.entries.at(-1)?.tag).toBe("0074_enterprise_intelligence_expansion");
    expect(readdirSync(path.join(ROOT, "drizzle")).some((f) => /domain|subdomain/i.test(f) && f > "0074")).toBe(false);
  });

  it("documents the two configuration variables without committing any value", () => {
    const env = source(".env.example");
    expect(env).toContain("BEYU_CANONICAL_DOMAIN");
    expect(env).toContain("BEYU_SESSION_COOKIE_DOMAIN");
    expect(existsSync(path.join(ROOT, ".env"))).toBe(false);
    expect(existsSync(path.join(ROOT, ".env.production"))).toBe(false);
  });
});
