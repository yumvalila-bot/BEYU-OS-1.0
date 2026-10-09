/**
 * CANONICAL ENTRY POINTS — the user-experience contract for the eight canonical
 * hostnames, asserted WITHOUT a server (pure + source-level).
 *
 * The acceptance criteria this suite pins, in the order the architecture states
 * them:
 *
 *   A. Hostname resolution — each canonical host resolves to its intended
 *      context, and every context's home is a REAL route under `src/app`.
 *   B/C. Direct access — a canonical host is served in place; nothing hops
 *      through the BEYU landing UI, and the sign-in landing is that context's
 *      own route.
 *   C/G. Security — the host selects a CONTEXT and never grants access: the
 *      routing decision carries no authority, and the destination's own
 *      server-side gate still runs.
 *   D. Tenant isolation — the host carries no tenant/entity/country; the OS
 *      layouts keep re-running the canonical tenant-scope resolver.
 *   E. Deep-link security — a deep link on a canonical host is authorized by
 *      the route, server-side, exactly as on `www`.
 *   F/G. OS switching — authorized users can move between OS domains with no
 *      login loop (canonical hrefs), and an unauthorized user gains nothing.
 *   H. URL preservation — the browser-facing hostname stays canonical: the
 *      sign-in branch redirects RELATIVELY and no destination host is bounced
 *      to `beyu.co.tz`.
 *   I. No routing loop — every redirect target is the host that OWNS the path,
 *      so the follow-up request is served, never redirected again.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BEYU_CONTROL_PLANE, CANONICAL_SURFACES, SECTOR_OPERATING_SYSTEMS } from "@/lib/operating-system-catalog";
import {
  CANONICAL_OS_HOSTS,
  authenticatedEntryRoute,
  canonicalContextOf,
  decideProxyAction,
  osOwningPath,
  resolveCanonicalHost,
  type CanonicalHostOptions,
  type ProxyRequestFacts,
} from "@/lib/canonical-hosts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PROD: CanonicalHostOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: false };

/** The eight canonical entry points: apex + five OS hosts + two surface hosts. */
const ENTRY_POINTS = [
  { host: "beyu.co.tz", home: "/os", label: "BEYU OS" },
  { host: "www.beyu.co.tz", home: "/os", label: "BEYU OS" },
  ...CANONICAL_OS_HOSTS.map((os) => ({ host: `${os.subdomain}.beyu.co.tz`, home: os.href, label: os.name })),
  ...CANONICAL_SURFACES.map((surface) => ({ host: `${surface.subdomain}.beyu.co.tz`, home: surface.href, label: surface.name })),
] as const;

const facts = (over: Partial<ProxyRequestFacts>): ProxyRequestFacts => ({
  host: "health.beyu.co.tz",
  pathname: "/",
  method: "GET",
  origin: null,
  protocol: "https:",
  port: "",
  ...over,
});

describe("A. every canonical entry point exists and is REAL", () => {
  it("resolves each canonical hostname to its intended context", () => {
    // Nine hostnames, eight distinct entry experiences: the apex and `www` are
    // the SAME canonical BEYU OS experience (documented, and asserted below).
    expect(ENTRY_POINTS).toHaveLength(9);
    expect(new Set(ENTRY_POINTS.map((entry) => entry.home)).size).toBe(8);
    for (const entry of ENTRY_POINTS) {
      const resolution = resolveCanonicalHost(entry.host, PROD);
      expect(resolution.kind, entry.host).not.toBe("NEUTRAL");
      const context = canonicalContextOf(resolution);
      expect(context?.href, entry.host).toBe(entry.home);
    }
  });

  it("every context's home is served by a route file in the ONE application", () => {
    for (const entry of ENTRY_POINTS) {
      const dir = path.join(ROOT, "src", "app", entry.home.slice(1));
      const hasRoute =
        existsSync(path.join(dir, "page.tsx")) ||
        existsSync(path.join(dir, "route.ts")) ||
        existsSync(path.join(dir, "route.tsx"));
      expect(hasRoute, `${entry.host} → ${entry.home} (${dir})`).toBe(true);
    }
    // The root IS the apex experience (sign-in) — no second landing application.
    expect(existsSync(path.join(ROOT, "src", "app", "page.tsx"))).toBe(true);
  });

  it("every OS home keeps a server-side gate file of its own", () => {
    for (const entry of [
      { file: ["src", "app", "os", "health", "mount.ts"], gate: "checkHealthOSAuthorization(" },
      { file: ["src", "app", "os", "finance", "layout.tsx"], gate: "requestIsOnForeignOSHost(" },
      { file: ["src", "app", "os", "agriculture", "layout.tsx"], gate: "operatingSystemTenantInScope(" },
      { file: ["src", "app", "os", "ujenzi", "layout.tsx"], gate: "operatingSystemTenantInScope(" },
      { file: ["src", "app", "os", "foundation", "layout.tsx"], gate: "operatingSystemTenantInScope(" },
    ] as const) {
      expect(code(source(...entry.file)), entry.file.join("/")).toContain(entry.gate);
    }
    // And the two shared surfaces keep the guards their catalogue entries declare.
    expect(code(source("src", "app", "os", "family", "page.tsx"))).toContain('requireAccess("family:member.read")');
    expect(code(source("src", "app", "os", "noelia", "page.tsx"))).toContain('requireAccess("ai:noelia.query")');
  });
});

describe("B/C. direct access — no BEYU landing hop, no host-granted authority", () => {
  it("every canonical host is served in place at its root and at its own home", () => {
    for (const entry of ENTRY_POINTS) {
      for (const pathname of ["/", entry.home]) {
        expect(decideProxyAction(facts({ host: entry.host, pathname }), PROD).kind, `${entry.host}${pathname}`).toBe("NEXT");
      }
    }
  });

  /*
   * THE DEFECT THIS BLOCK EXISTS TO PREVENT FROM RETURNING
   *
   * `health.beyu.co.tz` used to resolve an authenticated visitor to the GENERIC
   * BEYU OS launcher whenever they were not already authorized for Health — the
   * canonical Health entry point rendering the control plane's OS-selection grid
   * instead of a Health surface. The destination contract was consumed as a
   * label and an already-authorized fast-path, not by the frontend the host is
   * supposed to serve. These tests pin the corrected contract: a canonical
   * destination host always resolves to that destination's own route, whether
   * or not the visitor is authorized for it, and only the control plane and
   * neutral hosts fall back to the control-plane routing.
   */
  it("an authenticated request on a destination host resolves to THAT destination's own route — never the launcher", () => {
    for (const entry of ENTRY_POINTS) {
      const resolution = resolveCanonicalHost(entry.host, PROD);
      const route = authenticatedEntryRoute(resolution);
      if (entry.home === "/os") {
        // The apex/`www` IS the control plane: it keeps the pre-existing
        // control-plane routing (launcher, or the single authorised destination).
        expect(route, entry.host).toBeNull();
        continue;
      }
      expect(route, entry.host).toBe(entry.home);
      // The launcher is the control plane's OS-selection surface. It is never
      // the answer for a canonical destination host — that is the regression.
      expect(route, entry.host).not.toBe("/launcher");
    }
  });

  it("no destination host selects the generic launcher for ANY of the eight destinations", () => {
    const destinations = [BEYU_CONTROL_PLANE, ...SECTOR_OPERATING_SYSTEMS, ...CANONICAL_SURFACES];
    expect(destinations).toHaveLength(8);
    for (const entry of ENTRY_POINTS) {
      const route = authenticatedEntryRoute(resolveCanonicalHost(entry.host, PROD));
      if (route === null) continue; // control plane: routing decided elsewhere
      // The selected route is always a REAL destination route of the ONE app.
      expect(route).toMatch(/^\/(?!\/)/);
      expect(destinations.some((destination) => destination.href === route), `${entry.host} → ${route}`).toBe(true);
      expect(route).not.toBe("/launcher");
    }
  });

  it("a hostile or unknown host selects no destination, so the control-plane routing still applies", () => {
    for (const host of [
      "health.beyu.co.tz.evil.example",
      "evil-health.beyu.co.tz",
      "unknown.beyu.co.tz",
      "family-office.beyu.co.tz",
      "x.foundation.beyu.co.tz",
      "mwanza.health.beyu.co.tz",
      "127.0.0.1",
      "localhost",
      null,
    ]) {
      expect(authenticatedEntryRoute(resolveCanonicalHost(host, PROD)), String(host)).toBeNull();
    }
  });

  it("Health resolves to the REAL Health OS route, not to a Health-labelled launcher", () => {
    const route = authenticatedEntryRoute(resolveCanonicalHost("health.beyu.co.tz", PROD));
    expect(route).toBe("/os/health");
    // `/os/health` is the governed mount that serves the compiled sector SPA
    // (and 307s to the truthful `/health` denial page when the federation gate
    // fails closed) — asserted against the file system, not against a heading.
    expect(existsSync(path.join(ROOT, "src", "app", "os", "health", "route.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src", "app", "os", "health", "mount.ts"))).toBe(true);
    const mount = code(source("src", "app", "os", "health", "mount.ts"));
    expect(mount).toContain("healthSpaHtml");
    expect(mount).toContain("checkHealthOSAuthorization");
    // The routing page consumes the contract rather than inlining a host check.
    const page = code(source("src", "app", "page.tsx"));
    expect(page).toContain("authenticatedEntryRoute(canonicalHost)");
    expect(page).toContain("if (entryRoute) redirect(entryRoute)");
    expect(page).not.toMatch(/host\.includes\(|hostname\.includes\(|beyu\.co\.tz/);
  });

  it("the sign-in landing is the resolved context's route, computed server-side", () => {
    const c = code(source("src", "app", "page.tsx"));
    expect(c).toContain("canonicalHostForRequest()");
    expect(c).toContain("landing={requestedContext ? requestedContext.href : \"/os\"}");
    // Landing is derived from the trusted host contract only — never from input.
    expect(c).not.toMatch(/searchParams|redirect_to|returnTo|callbackUrl/i);
  });

  it("the routing decision carries no authority: a hostname cannot grant an OS", () => {
    for (const entry of ENTRY_POINTS) {
      const resolution = resolveCanonicalHost(entry.host, PROD);
      const serialized = JSON.stringify(resolution);
      expect(serialized, entry.host).not.toMatch(/\b(allowed|granted|authorized|permission|role|clearance)\b/i);
      if (resolution.kind === "SECTOR_OS" || resolution.kind === "SURFACE") {
        // The resolved object is the canonical catalogue entry itself — no
        // per-request authorization state is attached to a hostname.
        expect(resolution.kind === "SECTOR_OS" ? resolution.os : resolution.surface).toBe(
          resolution.kind === "SECTOR_OS"
            ? SECTOR_OPERATING_SYSTEMS.find((os) => os.code === resolution.os.code)
            : CANONICAL_SURFACES.find((surface) => surface.code === resolution.surface.code),
        );
      }
    }
  });
});

describe("D/E. tenant isolation and deep-link security are unchanged by the host", () => {
  it("the OS layouts keep the canonical tenant-scope gate on every request", () => {
    for (const [file, tenantCode, permission] of [
      [["src", "app", "os", "agriculture", "layout.tsx"], "BEYU-AGRI", "agriculture:data.read"],
      [["src", "app", "os", "ujenzi", "layout.tsx"], "BEYU-UJENZI", "ujenzi:data.read"],
      [["src", "app", "os", "foundation", "layout.tsx"], "BEYU-FOUNDATION", "foundation:registry.read"],
    ] as const) {
      const c = code(source(...file));
      expect(c, tenantCode).toContain(`"${tenantCode}"`);
      expect(c, tenantCode).toContain(`capability="${permission}"`);
    }
  });

  it("a deep link on a canonical host runs the same server-side gate as on www", () => {
    // The gate lives in the route/layout, not in the proxy: the proxy decision
    // for a deep link on its own canonical host is a plain NEXT, and the route
    // then runs session → tenant → permission → RLS exactly as on `www`.
    for (const entry of ENTRY_POINTS) {
      expect(decideProxyAction(facts({ host: entry.host, pathname: `${entry.home}/anything` }), PROD).kind).toBe("NEXT");
    }
    // Nothing in the host contract reads a session, principal or database.
    const contract = code(source("src", "lib", "canonical-hosts.ts"));
    expect(contract).not.toMatch(/resolvePrincipal|requireAccess|from "@\/db|drizzle|Principal/);
  });
});

describe("F/G. switching between OS domains", () => {
  it("the sidebar/launcher/capability map render canonical hosts through the ONE helper", () => {
    for (const file of [
      ["src", "app", "os", "layout.tsx"],
      ["src", "app", "launcher", "page.tsx"],
      ["src", "app", "os", "capability-map.tsx"],
    ] as const) {
      const c = code(source(...file));
      expect(c, file.join("/")).toContain("destinationHrefForRequest()");
      // Never a hand-built URL: the host comes from the contract, not from a template here.
      expect(c, file.join("/")).not.toMatch(/https:\/\/\$\{|\.beyu\.co\.tz/);
    }
  });

  it("an OS switch is a link, and the target re-runs its own authorization", () => {
    // No per-OS session machinery exists: switching cannot create a login loop
    // because there is nothing to re-authenticate against.
    const layout = code(source("src", "app", "os", "layout.tsx"));
    expect(layout).toContain("authorizedOperatingSystems(principal)");
    expect(layout).toContain("checkBeyuOSAuthorization(principal).authorized");
    const nav = code(source("src", "app", "os", "os-navigation.tsx"));
    expect(nav).toContain('href="/launcher"');
    expect(nav).toContain("Switch operating system");
  });

  it("the shared surfaces are not OS switches: they are entered as capabilities", () => {
    for (const surface of CANONICAL_SURFACES) {
      expect(surface.href.startsWith("/os/")).toBe(true);
      expect(osOwningPath(surface.href)).toBeNull();
      expect(SECTOR_OPERATING_SYSTEMS.map((os) => os.href)).not.toContain(surface.href);
      expect(BEYU_CONTROL_PLANE.href).not.toBe(surface.href);
    }
  });
});

describe("H/I. URL preservation and the absence of routing loops", () => {
  it("nothing on a canonical host redirects to the apex", () => {
    for (const entry of ENTRY_POINTS) {
      for (const pathname of ["/", entry.home, "/launcher", "/os", "/enroll"]) {
        const action = decideProxyAction(facts({ host: entry.host, pathname }), PROD);
        if (action.kind === "REDIRECT") {
          const target = new URL(action.location);
          expect(target.hostname, `${entry.host}${pathname}`).not.toBe("beyu.co.tz");
          expect(target.hostname, `${entry.host}${pathname}`).not.toBe("www.beyu.co.tz");
        }
      }
    }
  });

  it("the sign-in branch redirects relatively on every host", () => {
    const c = code(source("src", "app", "page.tsx"));
    const redirects = [...c.matchAll(/redirect\(([^)]*)\)/g)].map((m) => m[1]);
    expect(redirects.length).toBeGreaterThan(0);
    for (const target of redirects) {
      // Either a route literal/derived path or the launcher — never an absolute URL.
      expect(target, target).not.toMatch(/https?:|beyu\.co\.tz/);
    }
  });

  it("every redirect target owns the path, so the follow-up request is served", () => {
    for (const from of ENTRY_POINTS) {
      for (const to of ENTRY_POINTS) {
        const action = decideProxyAction(facts({ host: from.host, pathname: to.home }), PROD);
        if (action.kind !== "REDIRECT") continue;
        const target = new URL(action.location);
        const owner = osOwningPath(target.pathname);
        expect(owner?.subdomain, `${from.host} → ${to.home}`).toBe(target.hostname.split(".")[0]);
        // The target host serves its own path — one hop, no loop.
        expect(decideProxyAction(facts({ host: target.host, pathname: target.pathname }), PROD).kind).toBe("NEXT");
      }
    }
  });

  it("the apex is never part of a redirect pair", () => {
    for (const pathname of ["/", "/os", "/os/health", "/os/finance", "/os/foundation", "/os/family", "/os/noelia"]) {
      expect(decideProxyAction(facts({ host: "www.beyu.co.tz", pathname }), PROD).kind, pathname).toBe("NEXT");
      expect(decideProxyAction(facts({ host: "beyu.co.tz", pathname }), PROD).kind, pathname).toBe("NEXT");
    }
  });
});
