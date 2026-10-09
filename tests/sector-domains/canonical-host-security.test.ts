/**
 * CANONICAL HOST CONTRACT — security contract (source-level, pure).
 *
 * The canonical hostnames are PRESENTATION boundaries. These gates pin that no
 * file in the change turns a hostname into authority, that every server-side
 * gate each OS already had is still there and still runs first, that the proxy
 * is a thin adapter over the tested pure decision, that the SHARED surfaces
 * (Family Office capability, NOELIA_AI) are never modelled as operating
 * systems, that no second application / registry / Noelia identity appeared,
 * and that session scope is handled by one helper on both the issue and the
 * clear side.
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

const contract = source("src", "lib", "canonical-hosts.ts");
const catalogue = source("src", "lib", "operating-system-catalog.ts");
const serverHelper = source("src", "lib", "canonical-host.ts");
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

  it("has no string-inference of a destination from host text", () => {
    const c = code(contract);
    for (const label of ["health", "finance", "agriculture", "ujenzi", "foundation", "familyoffice", "noelia"]) {
      expect(c, label).not.toMatch(new RegExp(`includes\\("${label}"\\)`));
    }
    expect(c).not.toMatch(/host(name)?\.(includes|indexOf|match)\(/);
  });

  it("derives labels from the canonical catalogue, not a parallel table", () => {
    expect(catalogue).toContain('subdomain: "health"');
    expect(catalogue).toContain('subdomain: "finance"');
    expect(catalogue).toContain('subdomain: "agriculture"');
    expect(catalogue).toContain('subdomain: "ujenzi"');
    expect(catalogue).toContain('subdomain: "foundation"');
    expect(catalogue).toContain('subdomain: "familyoffice"');
    expect(catalogue).toContain('subdomain: "noelia"');
    // The OS labels live on the OS entries; the surface labels on the SURFACES.
    expect(source("src", "lib", "canonical-hosts.ts")).toContain("SECTOR_OPERATING_SYSTEMS.filter(");
    expect(code(contract)).not.toMatch(/"[a-z]+\.beyu|\bhealth\.beyu|\bnoelia\.beyu|beyu\.co\.tz"/);
    // No hardcoded apex anywhere in the routing code (it is configuration).
    expect(code(contract)).not.toContain("beyu.co.tz");
  });

  it("keeps ONE hostname-resolution module: nothing else builds a hostname from a label", () => {
    const offenders = walk(path.join(ROOT, "src")).filter((file) => {
      const text = code(readFileSync(file, "utf8"));
      return /`\$\{[a-zA-Z.]*subdomain\}\.\$\{|\$\{.*subdomain\}\.\${\w*apex/.test(text);
    });
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe("2. the SHARED surfaces are never operating systems", () => {
  it("declares Family Office and Noelia as surfaces, outside the OS catalogue", () => {
    const c = code(catalogue);
    // No invented OS identity for either surface.
    expect(c).not.toMatch(/FAMILY_OFFICE_OS|NOELIA_OS|HEALTH_NOELIA|FINANCE_NOELIA|AGRICULTURE_NOELIA|UJENZI_NOELIA|FOUNDATION_NOELIA/);
    expect(c).toContain("SHARED_CAPABILITY");
    expect(c).toContain("GOVERNED_AI_INTERFACE");
    expect(c).toContain('code: "FAMILY_OFFICE"');
    expect(c).toContain('code: "NOELIA_AI"');
    // The OS list itself contains no shared capability: slice the declared array.
    const osList = c.slice(c.indexOf("SECTOR_OPERATING_SYSTEMS: OperatingSystemDestination[] = ["), c.indexOf("export const CANONICAL_SURFACES"));
    expect(osList).not.toMatch(/FAMILY_OFFICE|NOELIA/);
    expect(osList).toContain('code: "FOUNDATION"');
    // The single canonical AI identity is NOELIA_AI, nowhere sector-qualified.
    expect(source("src", "lib", "noelia", "canonical-identity.ts")).toContain("NOELIA_AI");
  });

  it("declares each surface's entry permission as the destination's OWN guard", () => {
    // A declared permission that drifted from the page's guard would make the
    // routing promise something the page refuses (or hide something it allows).
    const c = code(catalogue);
    expect(c).toContain('entryPermission: "family:member.read"');
    expect(c).toContain('entryPermission: "ai:noelia.query"');
    expect(code(source("src", "app", "os", "family", "page.tsx"))).toContain('requireAccess("family:member.read")');
    expect(code(source("src", "app", "os", "noelia", "page.tsx"))).toContain('requireAccess("ai:noelia.query")');
  });

  it("does not add a Noelia navigation module or a sector-specific Noelia surface", () => {
    const ia = code(source("src", "app", "os", "capabilities.ts"));
    // Exactly the pre-existing Noelia/HIVE capability entries.
    const noeliaHrefs = [...ia.matchAll(/href: "(\/os\/noelia[^"]*)"/g)].map((m) => m[1]);
    expect(noeliaHrefs).toEqual(["/os/noelia", "/os/noelia/governance"]);
    expect(ia).toContain('label: "Noelia / HIVE"');
  });
});

describe("3. the proxy is an adapter: no session, no database, no authority", () => {
  it("exists as the single Next.js proxy and delegates to the pure decision", () => {
    expect(existsSync(path.join(ROOT, "src", "middleware.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "middleware.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "proxy.ts"))).toBe(false);
    expect(proxy).toMatch(/export function proxy\(/);
    expect(code(proxy)).toContain("decideProxyAction(");
    expect(code(proxy)).toContain("canonicalHostOptionsFromEnvironment()");
    // The superseded module names are gone: ONE contract, no leftover twin.
    expect(existsSync(path.join(ROOT, "src", "lib", "sector-domains.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "lib", "sector-host.ts"))).toBe(false);
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

describe("4. every OS keeps its own server-side gate; the host can only refuse", () => {
  it("Health mount refuses a foreign OS/surface host BEFORE the federation gate and BEFORE the document", () => {
    const c = code(mount);
    const foreign = c.indexOf('isForeignOSHost(request.host, "HEALTH")');
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

  it("Agriculture, Ujenzi, Finance and Foundation refuse a foreign host after the session gate and keep their scope gates", () => {
    const agriculture = code(source("src", "app", "os", "agriculture", "layout.tsx"));
    const ujenzi = code(source("src", "app", "os", "ujenzi", "layout.tsx"));
    const finance = code(source("src", "app", "os", "finance", "layout.tsx"));
    const foundation = code(source("src", "app", "os", "foundation", "layout.tsx"));

    for (const [text, codeName] of [
      [agriculture, "AGRICULTURE"],
      [ujenzi, "UJENZI"],
      [finance, "FINANCE"],
      [foundation, "FOUNDATION"],
    ] as const) {
      const session = text.indexOf("requirePrincipal()");
      const foreign = text.indexOf(`requestIsOnForeignOSHost("${codeName}")`);
      expect(session, codeName).toBeGreaterThan(-1);
      expect(foreign, codeName).toBeGreaterThan(session);
      expect(text.slice(foreign, foreign + 120), codeName).toContain("notFound()");
    }
    // Existing tenant/classification gates are untouched.
    expect(agriculture).toContain('operatingSystemTenantInScope(\n    principal,\n    "BEYU-AGRI",');
    expect(ujenzi).toContain('operatingSystemTenantInScope(\n    principal,\n    "BEYU-UJENZI",');
    expect(foundation).toContain('operatingSystemTenantInScope(\n    principal,\n    "BEYU-FOUNDATION",');
    expect(ujenzi).toContain("principal.entityScope.length > 0");
    expect(foundation).toContain("principal.entityScope.length > 0");
    // The Finance layout grants nothing: the pages keep their own capability guard.
    expect(finance).not.toMatch(/\bcan\(|requireAccess\(/);
    expect(source("src", "app", "os", "finance", "page.tsx")).toContain('requireAccess("finance:ledger.read")');
    expect(source("src", "app", "os", "finance", "payments", "page.tsx")).toContain("requireAccess(");
  });

  it("the server helper only ever REFUSES on a mismatch and reads only the Host header", () => {
    const c = code(serverHelper);
    expect(c).toContain('h.get("host")');
    expect(c).not.toMatch(/x-forwarded|cookies\(|resolvePrincipal|from "@\/db|\bcan\(/);
    // Another OS's host refuses; a canonical SHARED-surface host refuses too (it
    // carries no OS identity), while neutral hosts and the OS's own host pass.
    expect(c).toContain("if (resolution.kind === \"SECTOR_OS\") return resolution.os.code !== code;");
    expect(c).toContain("return resolution.kind === \"SURFACE\";");
  });

  it("the control-plane shell and the OS resolver are unchanged as authorization boundaries", () => {
    const layout = code(source("src", "app", "os", "layout.tsx"));
    expect(layout).toContain("checkBeyuOSAuthorization(principal).authorized");
    expect(layout).toContain('redirect("/launcher")');
    const operatingSystems = code(source("src", "lib", "operating-systems.ts"));
    expect(operatingSystems).not.toMatch(/host|subdomain|canonical-hosts/i);
  });
});

describe("5. reaching a canonical host authorizes nothing", () => {
  /*
   * "Reaching a canonical host authorizes nothing" is a SECURITY property, and
   * it is now enforced one step further down than it used to be.
   *
   * Previously this page gated the destination redirect on the destination's
   * own resolver/permission and fell back to the control-plane routing
   * (`/launcher`) when that gate would deny — which put the generic control
   * plane on the canonical destination host. The page now routes the visitor to
   * the destination's OWN canonical route unconditionally and lets that
   * destination's complete server-side gate decide (workspace, or that
   * destination's own governed denial). Authorization therefore still never
   * comes from the hostname — it is decided by the destination route, which
   * re-runs its full gate on every request, on every host.
   */
  it("the sign-in page routes a destination host through the ONE contract, and preserves the control-plane routing", () => {
    const c = code(signIn);
    // The host is read through the one server helper; never from a query string.
    expect(c).toContain("canonicalHostForRequest()");
    expect(c).not.toMatch(/searchParams|redirect_to|returnTo|callbackUrl/i);
    // The routing decision is the canonical contract's, not an inline literal.
    const contractCall = c.indexOf("authenticatedEntryRoute(canonicalHost)");
    const destinationRedirect = c.indexOf("if (entryRoute) redirect(entryRoute);");
    expect(contractCall).toBeGreaterThan(-1);
    expect(destinationRedirect).toBeGreaterThan(contractCall);
    // No hardcoded host or route literal decides the destination here.
    expect(c).not.toMatch(/host\.includes\(|hostname\.includes\(|endsWith\("health/);
    expect(c).not.toMatch(/redirect\("\/os\/(health|finance|agriculture|ujenzi|foundation|family|noelia)"\)/);
    // The pre-existing control-plane routing is preserved for the apex/neutral
    // hosts, where `entryRoute` is null.
    expect(c).toContain("authorizedOperatingSystems(principal)");
    expect(c).toContain('if (destinations.length > 1) redirect("/launcher");');
    expect(c).toContain('if (destinations.length === 1) redirect(destinations[0].href);');
  });

  it("the destination route comes from the canonical registry — never a literal, never a second route table", () => {
    const c = code(signIn);
    // A SHARED surface and a Sector OS are both resolved by the same contract,
    // from the catalogue's own `href` (see authenticatedEntryRoute()).
    expect(c).not.toMatch(/can\(principal, "family:member\.read"\)/);
    expect(c).not.toMatch(/can\(principal, "ai:noelia\.query"\)/);
    const contract = code(source("src", "lib", "canonical-hosts.ts"));
    const fn = contract.slice(
      contract.indexOf("export function authenticatedEntryRoute"),
      contract.indexOf("export function authenticatedEntryRoute") + 700,
    );
    expect(fn).toContain("return resolution.os.href;");
    expect(fn).toContain("return resolution.surface.href;");
    // Both branches yield a root-relative route, so the page cannot be turned
    // into an open redirector by a Host header.
    expect(fn).not.toMatch(/https?:|new URL|request|header/i);
  });

  it("the post-login landing is server-computed and same-origin only", () => {
    expect(code(signIn)).toContain('landing={requestedContext ? requestedContext.href : "/os"}');
    const form = code(signInForm);
    expect(form).toContain('/^\\/(?!\\/)/.test(landing) ? landing : "/os"');
    expect(form).not.toMatch(/window\.location\.search|URLSearchParams|searchParams/);
  });

  it("no layout, page or route reads a canonical host for anything but presentation/refusal", () => {
    // A hostname may only ever be read through the ONE server helper, and the
    // helper's consumers are enumerated here: the sign-in page, the launcher
    // hrefs, the OS layouts and the Health mount. A new consumer must be a
    // deliberate, reviewed addition.
    const consumers = walk(path.join(ROOT, "src"))
      .filter((file) => /from "@\/lib\/canonical-host"/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .sort();
    expect(consumers).toEqual([
      "src/app/launcher/page.tsx",
      "src/app/os/agriculture/layout.tsx",
      "src/app/os/capability-map.tsx",
      "src/app/os/finance/layout.tsx",
      "src/app/os/foundation/layout.tsx",
      "src/app/os/health/mount.ts",
      "src/app/os/layout.tsx",
      "src/app/os/ujenzi/layout.tsx",
      "src/app/page.tsx",
    ]);
  });
});

describe("6. session scope — one helper, both sides", () => {
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

describe("7. one application, one registry, one Noelia, no duplicate identities", () => {
  it("creates no sector-specific Noelia identity and no duplicate OS identity", () => {
    const files = walk(path.join(ROOT, "src"));
    const forbidden = /HEALTH_NOELIA|FINANCE_NOELIA|AGRICULTURE_NOELIA|UJENZI_NOELIA|FAMILY_OFFICE_OS|HCM_OS|CONSTRUCTION_OS|HEALTH_PLATFORM/;
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
    expect(readdirSync(path.join(ROOT, "drizzle")).some((f) => /domain|subdomain|host/i.test(f) && f > "0074")).toBe(false);
  });

  it("documents the configuration variables without committing any value", () => {
    const env = source(".env.example");
    expect(env).toContain("BEYU_CANONICAL_DOMAIN");
    expect(env).toContain("BEYU_SESSION_COOKIE_DOMAIN");
    expect(existsSync(path.join(ROOT, ".env"))).toBe(false);
    expect(existsSync(path.join(ROOT, ".env.production"))).toBe(false);
  });
});
