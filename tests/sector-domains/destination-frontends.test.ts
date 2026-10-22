/**
 * CANONICAL DESTINATION FRONTENDS — first-class entry + destination-aware
 * sign-in for every canonical host, asserted WITHOUT a server (pure + source).
 *
 * Companion to `canonical-entry-points.test.ts` (host routing) and
 * `canonical-host-security.test.ts` (the purity/authority boundaries). This
 * suite pins what those two deliberately leave open: the FRONTEND and SIGN-IN
 * contract of each canonical destination, and the separation of
 *
 *   GLOBAL DESTINATION STATUS   (the OS itself is ACTIVE)
 *   from
 *   THIS IDENTITY'S ACCESS      (authorized / not authorized)
 *
 * Acceptance criteria, in requirement order:
 *
 *   A. Every canonical host resolves to a destination FRONTEND contract — type,
 *      registry identity, global status, headline, accent, highlights — and the
 *      contract is the ONE catalogue entry, identity-equal (no per-request
 *      authorization state is attached to a hostname).
 *   B. Destination types stay distinct: exactly four `SECTOR_OS`, one `CORE`,
 *      one `NONPROFIT`, one `CAPABILITY`, one `AI_INTERFACE`. Nothing is
 *      flattened into "OS".
 *   C. Every destination has a real sign-in route (`/sign-in`) and a real home
 *      route, both served on its own canonical host.
 *   D. Authentication is SHARED: one web login call site, one login route, one
 *      session-cookie policy, no destination-specific identity store, no second
 *      authentication implementation behind `/sign-in`.
 *   E. Sign-in is DESTINATION-AWARE: the sub-line, the accessible form name and
 *      the submit label are derived from the canonical destination, never from a
 *      query string or any client-controlled input.
 *   F. Hostname ≠ authorization: the four Sector OSs are ACTIVE while the
 *      governed denial state exists for a signed-in identity without access, and
 *      nothing in the destination contract can produce an authorized answer.
 *   G. Launcher visibility is not authority, and global status is never rendered
 *      as the user's grant (or the reverse).
 *   H. No second routing architecture, no second registry, no new OS identity,
 *      no sector-specific Noelia, no separate Vercel project, no migration.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BEYU_CONTROL_PLANE,
  CANONICAL_SURFACES,
  DESTINATION_TYPE_LABEL,
  FOUNDATION_ORGANIZATION,
  SECTOR_OPERATING_SYSTEMS,
  destinationSignInSubtitle,
} from "@/lib/operating-system-catalog";
import {
  CANONICAL_OS_HOSTS,
  destinationForResolution,
  resolveCanonicalHost,
  type CanonicalHostOptions,
} from "@/lib/canonical-hosts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");
/** Source text with comments removed: these gates assert what the CODE does. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PROD: CanonicalHostOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: false };
const resolve = (host: string) => resolveCanonicalHost(host, PROD);

/** The required matrix: host → destination → type → frontend → sign-in. */
const MATRIX = [
  { host: "beyu.co.tz", code: "BEYU", type: "CORE", registry: "BEYU_OS", home: "/os", signIn: "BEYU OS" },
  { host: "health.beyu.co.tz", code: "HEALTH", type: "SECTOR_OS", registry: "HEALTH_OS", home: "/os/health", signIn: "Health OS" },
  { host: "finance.beyu.co.tz", code: "FINANCE", type: "SECTOR_OS", registry: "FINANCE_OS", home: "/os/finance", signIn: "Finance OS" },
  { host: "agriculture.beyu.co.tz", code: "AGRICULTURE", type: "SECTOR_OS", registry: "AGRICULTURE_OS", home: "/os/agriculture", signIn: "Agriculture OS" },
  { host: "ujenzi.beyu.co.tz", code: "UJENZI", type: "SECTOR_OS", registry: "UJENZI_OS", home: "/os/ujenzi", signIn: "Ujenzi OS" },
  { host: "foundation.beyu.co.tz", code: "FOUNDATION", type: "NONPROFIT", registry: "SHARED_FOUNDATION_OPERATIONS", home: "/os/foundation", signIn: "BEYU Foundation" },
  { host: "familyoffice.beyu.co.tz", code: "FAMILY_OFFICE", type: "CAPABILITY", registry: "SHARED_FAMILY_OFFICE", home: "/os/family", signIn: "Family Office" },
  { host: "noelia.beyu.co.tz", code: "NOELIA_AI", type: "AI_INTERFACE", registry: "NOELIA_AI", home: "/os/noelia", signIn: "Noelia AI" },
] as const;

const DESTINATION_HOSTS = MATRIX.filter((entry) => entry.host !== "beyu.co.tz");

describe("A. every canonical host resolves to a destination FRONTEND contract", () => {
  it("maps each host to its registry identity, class, home and sign-in name", () => {
    for (const entry of MATRIX) {
      const destination = destinationForResolution(resolve(entry.host));
      expect(destination, entry.host).not.toBeNull();
      expect(destination?.context.code, entry.host).toBe(entry.code);
      expect(destination?.context.registryCode, entry.host).toBe(entry.registry);
      expect(destination?.context.destinationType, entry.host).toBe(entry.type);
      expect(destination?.context.href, entry.host).toBe(entry.home);
      expect(destination?.context.name, entry.host).toBe(entry.signIn);
    }
  });

  it("declares every canonical destination ACTIVE, matching the constitutional charter seed", () => {
    for (const entry of MATRIX) {
      expect(destinationForResolution(resolve(entry.host))?.context.status, entry.host).toBe("ACTIVE");
    }
    // And the catalogue mirrors `os_registry.lifecycle` from src/db/seed.ts —
    // nothing was flipped to make a destination look live.
    const seed = source("src", "db", "seed.ts");
    for (const registry of ["BEYU_OS", "HEALTH_OS", "FINANCE_OS", "AGRICULTURE_OS", "UJENZI_OS", "SHARED_FOUNDATION_OPERATIONS"]) {
      expect(seed, registry).toContain(`code: "${registry}"`);
    }
    // The only non-ACTIVE charter row stays out of the canonical catalogue: it
    // has no host, no frontend and no entry point.
    expect(seed).toContain('code: "SHARED_MINING_GOVERNANCE"');
    expect(seed).toMatch(/SHARED_MINING_GOVERNANCE[\s\S]{0,1200}lifecycle: "DRAFT"/);
    const catalogue = source("src", "lib", "operating-system-catalog.ts");
    expect(catalogue).not.toContain("MINING_OS");
    for (const destination of [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS, FOUNDATION_ORGANIZATION, ...CANONICAL_SURFACES]) {
      expect(destination.status, destination.code).toBe("ACTIVE");
    }
  });

  it("attaches NO per-request authorization state to a hostname (the contract is the catalogue entry itself)", () => {
    for (const entry of MATRIX) {
      const destination = destinationForResolution(resolve(entry.host));
      const registered =
        entry.type === "CAPABILITY" || entry.type === "AI_INTERFACE"
          ? CANONICAL_SURFACES.find((surface) => surface.code === entry.code)
          : entry.type === "NONPROFIT"
            ? FOUNDATION_ORGANIZATION
            : entry.type === "CORE"
              ? BEYU_CONTROL_PLANE
              : SECTOR_OPERATING_SYSTEMS.find((os) => os.code === entry.code);
      // Identity-equal: the frontend contract IS the registered catalogue entry,
      // so a hostname cannot carry a grant, a scope or a decision with it.
      expect(destination?.context, entry.host).toBe(registered);
      expect(Object.keys(destination ?? {}), entry.host).toEqual(["hostKind", "context", "signInSubtitle"]);
    }
  });

  it("gives every destination presentation facts its own frontend can render", () => {
    for (const entry of MATRIX) {
      const context = destinationForResolution(resolve(entry.host))?.context;
      expect(context?.headline.length, entry.host).toBeGreaterThan(20);
      expect(context?.accent, entry.host).toMatch(/^#[0-9a-f]{6}$/i);
      expect(context?.highlights.length, entry.host).toBe(3);
      const label = context ? DESTINATION_TYPE_LABEL[context.destinationType] : null;
      expect(label, entry.host).toBeTruthy();
    }
  });

  it("selects NO destination frontend for a hostile, unknown or unconfigured host", () => {
    for (const host of [
      "evil-health.beyu.co.tz",
      "health.beyu.co.tz.attacker.example",
      "x.health.beyu.co.tz",
      "unknown.beyu.co.tz",
      "family-office.beyu.co.tz",
      "noelias.beyu.co.tz",
      "foundationx.beyu.co.tz",
      "mwanza.health.beyu.co.tz",
      "beyu-os-1-0.vercel.app",
      "127.0.0.1",
      "",
      "not a host",
    ]) {
      expect(destinationForResolution(resolve(host)), host).toBeNull();
    }
    // An unconfigured apex resolves nothing at all — the documented inactive state.
    const unconfigured = { canonicalDomain: null, allowLocalhost: false };
    for (const entry of MATRIX) {
      expect(destinationForResolution(resolveCanonicalHost(entry.host, unconfigured)), entry.host).toBeNull();
    }
  });
});

describe("B. destination types stay distinct and are never flattened into 'OS'", () => {
  it("declares exactly four Sector OSs, one core, one nonprofit, one capability, one AI interface", () => {
    const all = [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS, FOUNDATION_ORGANIZATION, ...CANONICAL_SURFACES];
    const byType = (type: string) => all.filter((destination) => destination.destinationType === type).map((d) => d.code);
    expect(byType("CORE")).toEqual(["BEYU"]);
    expect(byType("SECTOR_OS").sort()).toEqual(["AGRICULTURE", "FINANCE", "HEALTH", "UJENZI"]);
    expect(byType("NONPROFIT")).toEqual(["FOUNDATION"]);
    expect(byType("CAPABILITY")).toEqual(["FAMILY_OFFICE"]);
    expect(byType("AI_INTERFACE")).toEqual(["NOELIA_AI"]);
    expect(all).toHaveLength(8);
  });

  it("keeps Foundation a nonprofit sister organization without inventing an OS identity", () => {
    const foundation = FOUNDATION_ORGANIZATION;
    expect(foundation.destinationType).toBe("NONPROFIT");
    expect(DESTINATION_TYPE_LABEL.NONPROFIT).toBe("Nonprofit sister organization");
    expect(foundation.level).toBe("SISTER_ORGANIZATION");
    expect(foundation.kind).toBe("NONPROFIT_SISTER_ORGANIZATION");
    expect(foundation.registryCode).toBe("SHARED_FOUNDATION_OPERATIONS");
    expect(source("src", "lib", "noelia", "canonical-identity.ts")).not.toContain("FOUNDATION_NOELIA");
  });

  it("keeps Family Office a capability and Noelia the single governed AI identity", () => {
    const family = CANONICAL_SURFACES.find((surface) => surface.code === "FAMILY_OFFICE")!;
    const noelia = CANONICAL_SURFACES.find((surface) => surface.code === "NOELIA_AI")!;
    expect(family.destinationType).toBe("CAPABILITY");
    expect(family.kind).toBe("SHARED_CAPABILITY");
    expect(noelia.destinationType).toBe("AI_INTERFACE");
    expect(noelia.kind).toBe("GOVERNED_AI_INTERFACE");
    // Neither surface nor Foundation is an OS; the list stays closed at four.
    expect(SECTOR_OPERATING_SYSTEMS.map((os) => os.code)).toEqual([
      "FINANCE",
      "HEALTH",
      "AGRICULTURE",
      "UJENZI",
    ]);
    expect(CANONICAL_OS_HOSTS.map((os) => os.subdomain)).toEqual([
      "finance",
      "health",
      "agriculture",
      "ujenzi",
    ]);
  });

  it("states the activation boundary: an ACTIVE OS does not activate its capabilities", () => {
    const ujenzi = SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "UJENZI")!;
    const finance = SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "FINANCE")!;
    expect(ujenzi.status).toBe("ACTIVE");
    expect(ujenzi.highlights.join(" ")).toMatch(/BIM|calculations|government links/);
    expect(finance.status).toBe("ACTIVE");
    expect(finance.highlights.join(" ")).toContain("CAP_POSTING");
    // And the documentation says so explicitly.
    const doc = source("docs", "architecture", "CANONICAL_DESTINATION_FRONTENDS.md");
    expect(doc).toContain("Individual capabilities remain independently governed");
    expect(doc).toContain("NOT_CERTIFIED");
  });
});

describe("C. every destination has a real sign-in route and a real home", () => {
  it("serves /sign-in from ONE route module in the ONE application", () => {
    expect(existsSync(path.join(ROOT, "src", "app", "sign-in", "page.tsx"))).toBe(true);
    // NO route-level Suspense boundary on the entry routes: one would commit the
    // HTTP 200 before the page runs and degrade the server-side 307 to the
    // destination home into a client-side navigation (see governed-sign-in.tsx).
    expect(existsSync(path.join(ROOT, "src", "app", "sign-in", "loading.tsx"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "app", "loading.tsx"))).toBe(false);
    // A route, not a rewrite target: no second application, no dynamic segment.
    expect(existsSync(path.join(ROOT, "src", "app", "sign-in", "[destination]"))).toBe(false);
  });

  it("keeps every destination home a real route file", () => {
    for (const entry of MATRIX) {
      const dir = path.join(ROOT, "src", "app", entry.home.slice(1));
      const served =
        existsSync(path.join(dir, "page.tsx")) ||
        existsSync(path.join(dir, "route.ts")) ||
        existsSync(path.join(dir, "route.tsx"));
      expect(served, `${entry.host} → ${entry.home}`).toBe(true);
    }
  });

  it("renders the destination frontend and the governed denial from ONE shared component", () => {
    const shared = source("src", "app", "governed-sign-in.tsx");
    expect(shared).toContain("export function GovernedSignIn(");
    expect(shared).toContain("export function DestinationDenied(");
    expect(shared).not.toContain("export function GovernedLoading(");
    // Shared BEYU identity on every destination surface — the authoritative mark,
    // never a per-destination redraw.
    expect(shared).toContain("BeyuOsLogo");
    expect(shared).not.toMatch(/family-trust-logo|BEYU_FAMILY_TRUST_ASSETS/);
    expect(shared).not.toMatch(/(?:function|class) (?:FinanceLogo|HealthLogo|AgricultureLogo|UjenziLogo|FoundationLogo|FamilyOfficeLogo)\b/);

    const page = code(source("src", "app", "page.tsx"));
    expect(page).toContain("<GovernedSignIn");
    expect(page).toContain("<DestinationDenied");
    expect(page).toContain("destinationForResolution(canonicalHost)");
  });

  it("gives the governed denial the two facts it must never conflate", () => {
    const shared = source("src", "app", "governed-sign-in.tsx");
    expect(shared).toContain("You are signed in, but you are not authorized for");
    expect(shared).toContain("Destination status");
    expect(shared).toContain("Your access");
    expect(shared).toContain("Not authorized");
    // It exposes no destination data and no admin control.
    expect(shared).not.toMatch(/href="\/os\/administration|href="\/api\//);
  });
});

describe("D. authentication is SHARED — one identity, one session, one login", () => {
  it("has exactly ONE web sign-in call site posting to the ONE login route", () => {
    const form = code(source("src", "app", "sign-in-form.tsx"));
    expect(form).toContain('fetch("/api/v1/auth/login"');
    // No destination-specific login route was created.
    const authRoutes = readdirSync(path.join(ROOT, "src", "app", "api", "v1", "auth"));
    expect(authRoutes.filter((entry) => /health|finance|agriculture|ujenzi|foundation|family|noelia/i.test(entry))).toEqual([]);
  });

  it("keeps the destination OUT of the credential path: presentation props only", () => {
    const form = code(source("src", "app", "sign-in-form.tsx"));
    // The destination reaches the form as a display name; the POST body is still
    // exactly email + password + MFA code.
    expect(form).toContain("destinationName");
    expect(form).toMatch(/body: JSON\.stringify\(\{ email, password, mfaCode \}\)/);
    // The form never resolves a host or a destination itself, and never reads
    // the URL or any other client-controlled input.
    expect(form).not.toMatch(/window\.location|URLSearchParams|searchParams|subdomain|location\.host/);
  });

  it("creates no destination-specific identity store, session authority or auth middleware", () => {
    const schema = readdirSync(path.join(ROOT, "src", "db", "schema"))
      .map((file) => source("src", "db", "schema", file))
      .join("\n");
    for (const table of [
      "health_users",
      "finance_users",
      "agriculture_users",
      "ujenzi_users",
      "foundation_users",
      "familyoffice_users",
      "noelia_users",
      "health_sessions",
      "finance_sessions",
      "destination_sessions",
    ]) {
      expect(schema, table).not.toContain(`"${table}"`);
    }
    // One session-cookie policy module, one proxy, no second middleware.
    expect(existsSync(path.join(ROOT, "src", "middleware.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "middleware.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "lib", "session-cookie.ts"))).toBe(true);
  });

  it("makes /sign-in the SAME implementation as / — no second sign-in to drift", () => {
    const signIn = code(source("src", "app", "sign-in", "page.tsx"));
    expect(signIn).toContain('import CanonicalSignInPage from "../page"');
    expect(signIn).toContain("export default CanonicalSignInPage");
    expect(signIn).toContain('export const dynamic = "force-dynamic"');
    // It re-implements nothing: no second session resolution, no second login
    // call, no second host resolution, no second authorization opinion.
    expect(signIn).not.toMatch(/resolvePrincipal|fetch\(|canonicalHostForRequest|authorizedOperatingSystems|requireAccess/);
  });
});

describe("E. sign-in is destination-aware, derived from the host only", () => {
  it("produces the ONE canonical sub-line per destination", () => {
    for (const entry of MATRIX) {
      const destination = destinationForResolution(resolve(entry.host))!;
      expect(destination.signInSubtitle, entry.host).toBe(`Sign in to ${entry.signIn} — governed by BEYU OS`);
      expect(destinationSignInSubtitle(destination.context), entry.host).toBe(destination.signInSubtitle);
    }
  });

  it("titles the form and the submit action for the destination, defaulting to BEYU OS", () => {
    const form = code(source("src", "app", "sign-in-form.tsx"));
    expect(form).toContain('aria-label={`Sign in to ${destinationName}`}');
    expect(form).toContain("`Enter ${destinationName}`");
    expect(form).toContain('destinationName = "BEYU OS"');
  });

  it("keeps the authentication LOADING state inside the shared form, not in a route boundary", () => {
    const form = code(source("src", "app", "sign-in-form.tsx"));
    expect(form).toContain("aria-busy={busy}");
    expect(form).toContain('busy ? "Authenticating…"');
    expect(form).toContain('role="alert"');
    expect(form).toContain('aria-live="assertive"');
    // And the expired-session state is announced politely, not as a form error.
    expect(form).toContain('role="status"');
    expect(form).toContain("sessionExpired");
  });

  it("computes the post-auth landing SERVER-SIDE from the canonical contract", () => {
    const page = code(source("src", "app", "page.tsx"));
    expect(page).toContain("canonicalHostForRequest()");
    expect(page).toContain('landing={requestedContext ? requestedContext.href : "/os"}');
    // The landing is never an input: no query string, no callback parameter.
    expect(page).not.toMatch(/searchParams|redirect_to|returnTo|callbackUrl|next=|continue=/i);
    // And it is never the apex: the browser stays on the canonical hostname.
    for (const target of [...page.matchAll(/redirect\(([^)]*)\)/g)].map((match) => match[1])) {
      expect(target, target).not.toMatch(/https?:|beyu\.co\.tz/);
    }
  });

  it("lands a signed-in visitor on the destination home, not on the launcher path", () => {
    for (const entry of DESTINATION_HOSTS) {
      expect(entry.home, entry.host).not.toBe("/launcher");
      expect(entry.home.startsWith("/os/"), entry.host).toBe(true);
    }
    // The canonical hostname remains the canonical frontend address: no
    // destination home is expressed as an apex URL anywhere in the frontend.
    const page = source("src", "app", "page.tsx");
    const shared = source("src", "app", "governed-sign-in.tsx");
    expect(page).not.toContain("beyu.co.tz/os/");
    expect(shared).not.toContain("beyu.co.tz/os/");
  });
});

describe("F. hostname is not authentication and not authorization", () => {
  it("keeps the destination frontend a presentation decision the proxy still never makes alone", () => {
    const proxy = code(source("src", "proxy.ts"));
    expect(proxy).toContain("decideProxyAction(");
    expect(proxy).not.toMatch(/cookies|SESSION_COOKIE|resolvePrincipal|from "@\/db|drizzle|authz|guard|policy/);
  });

  it("answers destination access only through the PRE-EXISTING server-side resolvers", () => {
    const page = code(source("src", "app", "page.tsx"));
    const resolver = page.indexOf("authorizedGovernedDestinations(principal)");
    const sectorGate = page.indexOf("destinations.some((destination) => destination.code === canonicalHost.os.code)");
    const surfaceGate = page.indexOf("can(principal, canonicalHost.surface.entryPermission).allowed");
    expect(resolver).toBeGreaterThan(-1);
    expect(sectorGate).toBeGreaterThan(resolver);
    expect(surfaceGate).toBeGreaterThan(-1);
    // The declared guard comes from the catalogue — never a repeated literal.
    expect(page).not.toMatch(/can\(principal, "family:member\.read"\)/);
    expect(page).not.toMatch(/can\(principal, "ai:noelia\.query"\)/);
  });

  it("denies on the destination host instead of silently redirecting to another OS", () => {
    const page = code(source("src", "app", "page.tsx"));
    // The denial is rendered BEFORE the pre-existing control-plane routing, so a
    // signed-in visitor on a destination host is never bounced to `/launcher` or
    // to whichever other OS they do hold.
    const denial = page.indexOf("<DestinationDenied");
    const launcher = page.indexOf('redirect("/launcher")');
    const single = page.indexOf("redirect(destinations[0].href)");
    expect(denial).toBeGreaterThan(-1);
    expect(launcher).toBeGreaterThan(-1);
    expect(single).toBeGreaterThan(-1);
    expect(denial).toBeLessThan(launcher);
    expect(denial).toBeLessThan(single);
    // The control-plane routing itself is preserved for the apex and NEUTRAL hosts.
    expect(page).toContain('if (destinations.length > 1) redirect("/launcher");');
    expect(page).toContain('if (destinations.length === 1) redirect(destinations[0].href);');
  });

  it("leaves every deep-link gate exactly where it was", () => {
    for (const [file, gate] of [
      [["src", "app", "os", "health", "mount.ts"], "checkHealthOSAuthorization("],
      [["src", "app", "os", "finance", "layout.tsx"], 'requestIsOnForeignOSHost("FINANCE")'],
      [["src", "app", "os", "agriculture", "layout.tsx"], "governedTenantInScope("],
      [["src", "app", "os", "ujenzi", "layout.tsx"], "governedTenantInScope("],
      [["src", "app", "os", "foundation", "layout.tsx"], "governedTenantInScope("],
      [["src", "app", "os", "layout.tsx"], "checkBeyuOSAuthorization(principal).authorized"],
      [["src", "app", "os", "layout.tsx"], "withTenantDatabaseContext(principal"],
    ] as const) {
      expect(code(source(...file)), file.join("/")).toContain(gate);
    }
    expect(code(source("src", "app", "os", "family", "page.tsx"))).toContain('requireAccess("family:member.read")');
    expect(code(source("src", "app", "os", "noelia", "page.tsx"))).toContain('requireAccess("ai:noelia.query")');
  });
});

describe("G. launcher visibility is not authority; status is not a grant", () => {
  it("renders global status and this identity's access as two separate facts", () => {
    const launcher = source("src", "app", "launcher", "page.tsx");
    expect(launcher).toContain("{destination.status}");
    expect(launcher).toContain('"ACCESS: AUTHORISED" : "ACCESS: NOT IN CURRENT GRANT"');
    expect(launcher).toContain("DESTINATION_TYPE_LABEL[destination.destinationType]");
    expect(launcher).toContain("{destination.registryCode}");
    // Access is still resolved server-side by the canonical resolver.
    expect(code(launcher)).toContain("authorizedGovernedDestinations(principal)");
    expect(code(launcher)).toContain("destinationHrefForRequest()");
    // Global status is never derived from the user's grant.
    expect(launcher).not.toMatch(/status:\s*authorized|status=\{authorized/);
  });

  it("never uses user authorization as the global activation state", () => {
    const catalogue = source("src", "lib", "operating-system-catalog.ts");
    // `status` is a literal on the registry entry — not computed per request.
    for (const entry of [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS, FOUNDATION_ORGANIZATION, ...CANONICAL_SURFACES]) {
      expect(catalogue).toContain(`registryCode: "${entry.registryCode}"`);
      expect(catalogue).toMatch(new RegExp(`registryCode: "${entry.registryCode}"[\\s\\S]{0,400}status: "ACTIVE"`));
    }
    expect(code(catalogue)).not.toMatch(/status:\s*[a-z]/);
  });
});

describe("H. one application, one registry, one routing architecture", () => {
  it("adds no second registry, no second router, no separate deployment", () => {
    expect(existsSync(path.join(ROOT, "src", "lib", "sector-domains.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "lib", "sector-host.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src", "lib", "destination-registry.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
    for (const dir of ["apps", "packages", "health-app", "finance-app", "agriculture-app", "ujenzi-app", "noelia-app"]) {
      expect(existsSync(path.join(ROOT, dir)), dir).toBe(false);
    }
  });

  it("adds no migration and leaves the journal at its canonical head", () => {
    const journal = JSON.parse(source("drizzle", "meta", "_journal.json")) as { entries: Array<{ tag: string }> };
    expect(journal.entries.at(-1)?.tag).toBe("0076_sector_read_only_context_access");
    expect(readdirSync(path.join(ROOT, "drizzle")).some((file) => /destination|frontend|sign-?in|host|subdomain/i.test(file) && file > "0074")).toBe(false);
  });

  it("keeps ONE hostname-resolution module and one catalogue of destinations", () => {
    // Nothing outside the contract builds a hostname from a catalogue label.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && /`\$\{[a-zA-Z.]*subdomain\}\.\$\{/.test(code(readFileSync(full, "utf8")))) {
          offenders.push(path.relative(ROOT, full));
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
    // Every destination fact the new surfaces render comes from the catalogue.
    const shared = code(source("src", "app", "governed-sign-in.tsx"));
    expect(shared).toContain("DESTINATION_TYPE_LABEL");
    expect(shared).toContain("destination.signInSubtitle");
  });

  it("documents the canonical host map with the required table", () => {
    const doc = source("docs", "architecture", "CANONICAL_DESTINATION_FRONTENDS.md");
    expect(doc).toContain("| Host | Destination | Type | Frontend | Sign-in | Global status |");
    for (const entry of MATRIX) {
      expect(doc, entry.host).toContain(entry.host);
      expect(doc, entry.registry).toContain(entry.registry);
    }
    expect(doc).toContain("SAME VERCEL DEPLOYMENT");
    expect(doc).toContain("human-controlled");
  });
});
