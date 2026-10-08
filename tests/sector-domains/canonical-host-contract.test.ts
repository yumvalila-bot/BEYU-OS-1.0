/**
 * CANONICAL HOST CONTRACT — domain contract (pure, no server, no DB).
 *
 *   beyu.co.tz              → BEYU OS control plane
 *   health.beyu.co.tz       → HEALTH_OS
 *   finance.beyu.co.tz      → FINANCE_OS
 *   agriculture.beyu.co.tz  → AGRICULTURE_OS
 *   ujenzi.beyu.co.tz       → UJENZI_OS
 *   foundation.beyu.co.tz   → FOUNDATION (the registered Foundation OS)
 *   familyoffice.beyu.co.tz → FAMILY OFFICE capability (never an OS)
 *   noelia.beyu.co.tz       → NOELIA_AI (governed AI interface, never an OS)
 *
 * Pins: the mapping is driven by the ONE catalogue; each canonical host is an
 * INDEPENDENT ENTRY POINT (never a hop through `beyu.co.tz`); resolution is
 * exact, normalised and configuration-gated; an arbitrary Host can never select
 * a destination; the proxy decision cannot loop or open-redirect; the Origin
 * check only ever refuses; navigation links stay relative until session sharing
 * is configured.
 */
import { describe, expect, it } from "vitest";
import {
  BEYU_CONTROL_PLANE,
  CANONICAL_SURFACES,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-system-catalog";
import { NOELIA_OS_CONTEXT_BY_OS_CODE } from "@/lib/os-context";
import { PERMISSIONS } from "@/lib/constants";
import {
  CANONICAL_OS_HOSTS,
  canonicalContextOf,
  canonicalDestinationHref,
  canonicalHostOptionsFromEnvironment,
  canonicalOrigin,
  decideProxyAction,
  isCanonicalBeyuHost,
  osOwningPath,
  parseCanonicalDomain,
  resolutionBase,
  resolveCanonicalHost,
  type CanonicalHostOptions,
  type ProxyRequestFacts,
} from "@/lib/canonical-hosts";

const PROD: CanonicalHostOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: false };
const DEV: CanonicalHostOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: true };
const UNCONFIGURED: CanonicalHostOptions = { canonicalDomain: null, allowLocalhost: false };

/** The canonical contract, by catalogue code and os_registry identity. */
const CONTRACT = [
  { host: "health.beyu.co.tz", kind: "SECTOR_OS", code: "HEALTH", registry: "HEALTH_OS", href: "/os/health" },
  { host: "finance.beyu.co.tz", kind: "SECTOR_OS", code: "FINANCE", registry: "FINANCE_OS", href: "/os/finance" },
  { host: "agriculture.beyu.co.tz", kind: "SECTOR_OS", code: "AGRICULTURE", registry: "AGRICULTURE_OS", href: "/os/agriculture" },
  { host: "ujenzi.beyu.co.tz", kind: "SECTOR_OS", code: "UJENZI", registry: "UJENZI_OS", href: "/os/ujenzi" },
  { host: "foundation.beyu.co.tz", kind: "SECTOR_OS", code: "FOUNDATION", registry: "FOUNDATION_OS", href: "/os/foundation" },
  { host: "familyoffice.beyu.co.tz", kind: "SURFACE", code: "FAMILY_OFFICE", registry: "SHARED_FAMILY_OFFICE", href: "/os/family" },
  { host: "noelia.beyu.co.tz", kind: "SURFACE", code: "NOELIA_AI", registry: "NOELIA_AI", href: "/os/noelia" },
] as const;

const resolve = (host: string, options: CanonicalHostOptions = PROD) => resolveCanonicalHost(host, options);
/** `SECTOR_OS:HEALTH` / `SURFACE:NOELIA_AI` / `CONTROL_PLANE` / `NEUTRAL`. */
const kindOf = (host: string, options: CanonicalHostOptions = PROD) => {
  const resolution = resolve(host, options);
  if (resolution.kind === "SECTOR_OS") return `SECTOR_OS:${resolution.os.code}`;
  if (resolution.kind === "SURFACE") return `SURFACE:${resolution.surface.code}`;
  return resolution.kind;
};

describe("A. every canonical host resolves to its intended context", () => {
  it("maps each canonical hostname to its registered destination and canonical home", () => {
    for (const entry of CONTRACT) {
      const resolution = resolve(entry.host);
      expect(resolution.kind, entry.host).toBe(entry.kind);
      expect(canonicalContextOf(resolution)?.code, entry.host).toBe(entry.code);
      expect(canonicalContextOf(resolution)?.href, entry.host).toBe(entry.href);
      expect(resolutionBase(resolution), entry.host).toBe("beyu.co.tz");
      if (resolution.kind === "SECTOR_OS") {
        expect(resolution.os.level, entry.host).toBe("SECTOR_OS");
        // The Noelia OS context for that catalogue code is the canonical
        // os_registry code (Foundation included — it is a registered Sector OS).
        expect(NOELIA_OS_CONTEXT_BY_OS_CODE[resolution.os.code], entry.host).toBe(entry.registry);
      }
      if (resolution.kind === "SURFACE") {
        // A shared surface is NEVER an operating system.
        expect(resolution.surface.kind, entry.host).not.toBe("SECTOR_OS");
        expect(entry.code, entry.host).not.toMatch(/_OS$/);
      }
    }
  });

  it("keeps the apex and www as the canonical BEYU OS root, never a destination", () => {
    for (const host of ["beyu.co.tz", "www.beyu.co.tz", "WWW.beyu.co.tz:443"]) {
      expect(kindOf(host), host).toBe("CONTROL_PLANE");
      expect(canonicalContextOf(resolve(host))?.code, host).toBe("BEYU");
    }
  });

  it("declares exactly five OS hosts and two shared-surface hosts, none duplicated", () => {
    expect(CANONICAL_OS_HOSTS.map((d) => d.subdomain)).toEqual([
      "finance",
      "health",
      "agriculture",
      "foundation",
      "ujenzi",
    ]);
    expect(CANONICAL_OS_HOSTS.map((d) => d.code)).toEqual([
      "FINANCE",
      "HEALTH",
      "AGRICULTURE",
      "FOUNDATION",
      "UJENZI",
    ]);
    expect(CANONICAL_SURFACES.map((d) => d.subdomain)).toEqual(["familyoffice", "noelia"]);
    expect(CANONICAL_SURFACES.map((d) => d.code)).toEqual(["FAMILY_OFFICE", "NOELIA_AI"]);
    // The control plane carries no label: it IS the root.
    expect(BEYU_CONTROL_PLANE.subdomain).toBeUndefined();
    // One label, one destination — a duplicate could never be resolved deterministically.
    const labels = [...CANONICAL_OS_HOSTS, ...CANONICAL_SURFACES].map((d) => d.subdomain);
    expect(new Set(labels).size).toBe(labels.length);
    // The canonical routes are untouched by the host contract.
    expect(SECTOR_OPERATING_SYSTEMS.map((d) => d.href)).toEqual([
      "/os/finance",
      "/os/health",
      "/os/agriculture",
      "/os/foundation",
      "/os/ujenzi",
    ]);
  });

  it("normalises case, port and the root dot before matching", () => {
    expect(kindOf("Health.BEYU.co.tz")).toBe("SECTOR_OS:HEALTH");
    expect(kindOf("finance.beyu.co.tz:443")).toBe("SECTOR_OS:FINANCE");
    expect(kindOf("agriculture.beyu.co.tz.")).toBe("SECTOR_OS:AGRICULTURE");
    expect(kindOf("UJENZI.beyu.co.tz:8443")).toBe("SECTOR_OS:UJENZI");
    expect(kindOf("Foundation.beyu.co.tz.")).toBe("SECTOR_OS:FOUNDATION");
    expect(kindOf("FamilyOffice.BEYU.co.tz:443")).toBe("SURFACE:FAMILY_OFFICE");
    expect(kindOf("Noelia.beyu.co.tz")).toBe("SURFACE:NOELIA_AI");
  });
});

describe("B. an arbitrary Host can never select a destination", () => {
  it("does not resolve anything when no canonical domain is configured", () => {
    for (const entry of CONTRACT) expect(kindOf(entry.host, UNCONFIGURED), entry.host).toBe("NEUTRAL");
    expect(kindOf("www.beyu.co.tz", UNCONFIGURED)).toBe("NEUTRAL");
    expect(isCanonicalBeyuHost("health.beyu.co.tz", UNCONFIGURED)).toBe(false);
  });

  it("rejects look-alike, suffix, prefix and nested hostnames", () => {
    for (const hostile of [
      "health.beyu.co.tz.attacker.example", // suffix attack
      "attacker-health.beyu.co.tz", // prefix label
      "healthx.beyu.co.tz",
      "xhealth.beyu.co.tz",
      "health-beyu.co.tz",
      "health.beyu.co.tz.evil", // extra label
      "health.beyu.com", // wrong apex
      "health.beyuos.co.tz", // the legacy tenant-domain namespace is not the production apex
      "mwanza.health.beyu.co.tz", // a tenant hostname belongs to the governed tenant-domain registry
      "a.b.health.beyu.co.tz",
      "unknown.beyu.co.tz", // unknown subdomain
      "hcm.beyu.co.tz",
      "governance.beyu.co.tz",
      // Near-misses of the two shared surfaces.
      "family-office.beyu.co.tz",
      "familyofficex.beyu.co.tz",
      "x.familyoffice.beyu.co.tz",
      "familyoffice.beyu.co.tz.evil",
      "familyoffice.beyuos.co.tz",
      "noelia.beyu.co.tz.evil",
      "noelia-ai.beyu.co.tz",
      "noelias.beyu.co.tz",
      "x.noelia.beyu.co.tz",
      "noelia.beyu.com",
      // And of Foundation.
      "foundationx.beyu.co.tz",
      "foundations.beyu.co.tz",
      "x.foundation.beyu.co.tz",
      "foundation.beyu.co.tz.evil",
      "foundation.beyuos.co.tz",
    ]) {
      expect(kindOf(hostile), hostile).toBe("NEUTRAL");
    }
  });

  it("rejects malformed, IP-literal, absent and injected Host values", () => {
    for (const hostile of [
      null,
      undefined,
      "",
      " ",
      "https://health.beyu.co.tz",
      "health.beyu.co.tz/os/finance",
      "user@health.beyu.co.tz",
      "health.beyu.co.tz\r\nX-Injected: 1",
      "health.beyu.co.tz%00",
      "*.beyu.co.tz",
      "health_1.beyu.co.tz",
      "héalth.beyu.co.tz",
      "216.198.79.1",
      "[::1]",
      "127.0.0.1:3000",
      "health",
      "noelia",
      "health.beyu.co.tz..",
    ]) {
      expect(kindOf(hostile as string), String(hostile)).toBe("NEUTRAL");
    }
  });

  it("treats preview and platform hosts as neutral — never a destination, never an error", () => {
    for (const host of ["beyu-os.vercel.app", "beyu-os-git-main-team.vercel.app", "localhost", "localhost:3000"]) {
      expect(kindOf(host)).toBe("NEUTRAL");
      expect(kindOf(host, DEV)).toBe("NEUTRAL");
    }
  });

  it("permits <label>.localhost ONLY outside production", () => {
    expect(kindOf("health.localhost:3000", DEV)).toBe("SECTOR_OS:HEALTH");
    expect(kindOf("foundation.localhost", DEV)).toBe("SECTOR_OS:FOUNDATION");
    expect(kindOf("familyoffice.localhost:3000", DEV)).toBe("SURFACE:FAMILY_OFFICE");
    expect(kindOf("noelia.localhost", DEV)).toBe("SURFACE:NOELIA_AI");
    expect(kindOf("finance.localhost", DEV)).toBe("SECTOR_OS:FINANCE");
    expect(kindOf("health.localhost:3000", PROD)).toBe("NEUTRAL");
    expect(kindOf("noelia.localhost", PROD)).toBe("NEUTRAL");
    expect(kindOf("x.health.localhost", DEV)).toBe("NEUTRAL");
    expect(kindOf("www.localhost", DEV)).toBe("CONTROL_PLANE");
  });

  it("reads configuration strictly: an invalid canonical domain disables resolution", () => {
    expect(parseCanonicalDomain("beyu.co.tz")).toBe("beyu.co.tz");
    expect(parseCanonicalDomain(" BEYU.co.tz. ")).toBe("beyu.co.tz");
    for (const bad of [undefined, "", "localhost", "127.0.0.1", "https://beyu.co.tz", "beyu", "*.beyu.co.tz"]) {
      expect(parseCanonicalDomain(bad), String(bad)).toBeNull();
    }
    expect(canonicalHostOptionsFromEnvironment({})).toEqual({ canonicalDomain: null, allowLocalhost: true });
    expect(canonicalHostOptionsFromEnvironment({ NODE_ENV: "production", BEYU_CANONICAL_DOMAIN: "beyu.co.tz" })).toEqual({
      canonicalDomain: "beyu.co.tz",
      allowLocalhost: false,
    });
  });
});

describe("C. path ownership (which OS a route belongs to)", () => {
  it("owns exactly the canonical OS routes, their nested paths and the declared Health aliases", () => {
    for (const entry of CONTRACT.filter((e) => e.kind === "SECTOR_OS")) {
      expect(osOwningPath(entry.href)?.code, entry.href).toBe(entry.code);
      expect(osOwningPath(`${entry.href}/nested/deep`)?.code).toBe(entry.code);
    }
    expect(osOwningPath("/health")?.code).toBe("HEALTH");
    expect(osOwningPath("/health/os")?.code).toBe("HEALTH");
  });

  it("owns nothing else: control plane, launcher, shared surfaces, capabilities, API", () => {
    for (const path of [
      "/",
      "/os",
      "/launcher",
      "/enroll",
      "/os/family",
      "/os/family/capital",
      "/os/noelia",
      "/os/noelia/governance",
      "/os/hcm",
      "/os/administration",
      "/os/healthcare", // prefix must match a whole segment
      "/os/financeX",
      "/api/v1/finance/ledger",
      "/api/v1/health/identity",
      "/api/health",
      "/health-os/auth/login",
      null,
      undefined,
    ]) {
      expect(osOwningPath(path), String(path)).toBeNull();
    }
  });
});

const facts = (over: Partial<ProxyRequestFacts>): ProxyRequestFacts => ({
  host: "health.beyu.co.tz",
  pathname: "/",
  method: "GET",
  origin: null,
  protocol: "https:",
  port: "",
  ...over,
});

describe("D. proxy decision — routing", () => {
  it("B — a canonical host is served IN PLACE: no hop through the BEYU landing UI", () => {
    for (const entry of CONTRACT) {
      for (const pathname of ["/", entry.href, `${entry.href}/deep`, "/launcher", "/os", "/os/family", "/os/noelia", "/api/v1/authorization/context"]) {
        const action = decideProxyAction(facts({ host: entry.host, pathname }), PROD);
        expect(action.kind, `${entry.host}${pathname}`).toBe("NEXT");
      }
    }
    // And the apex never redirects its own visitors anywhere either.
    for (const pathname of ["/", "/os", "/os/health", "/os/finance", "/os/foundation", "/launcher"]) {
      expect(decideProxyAction(facts({ host: "www.beyu.co.tz", pathname }), PROD).kind, pathname).toBe("NEXT");
    }
  });

  it("redirects a path owned by ANOTHER OS to that OS's canonical host — same path, https, no port", () => {
    const action = decideProxyAction(facts({ host: "health.beyu.co.tz", pathname: "/os/finance/payments" }), PROD);
    expect(action).toMatchObject({ kind: "REDIRECT", status: 307, location: "https://finance.beyu.co.tz/os/finance/payments" });
    const legacy = decideProxyAction(facts({ host: "finance.beyu.co.tz", pathname: "/health/os" }), PROD);
    expect(legacy).toMatchObject({ kind: "REDIRECT", location: "https://health.beyu.co.tz/health/os" });
    const ujenzi = decideProxyAction(facts({ host: "agriculture.beyu.co.tz", pathname: "/os/ujenzi" }), PROD);
    expect(ujenzi).toMatchObject({ kind: "REDIRECT", location: "https://ujenzi.beyu.co.tz/os/ujenzi" });
    // Foundation is an independently addressable OS: its route belongs on its host.
    const foundation = decideProxyAction(facts({ host: "health.beyu.co.tz", pathname: "/os/foundation" }), PROD);
    expect(foundation).toMatchObject({ kind: "REDIRECT", location: "https://foundation.beyu.co.tz/os/foundation" });
    // And the shared-surface hosts are not OS hosts: an OS route is redirected away.
    const fromCapability = decideProxyAction(facts({ host: "familyoffice.beyu.co.tz", pathname: "/os/finance" }), PROD);
    expect(fromCapability).toMatchObject({ kind: "REDIRECT", location: "https://finance.beyu.co.tz/os/finance" });
    const fromNoelia = decideProxyAction(facts({ host: "noelia.beyu.co.tz", pathname: "/os/ujenzi/projects" }), PROD);
    expect(fromNoelia).toMatchObject({ kind: "REDIRECT", location: "https://ujenzi.beyu.co.tz/os/ujenzi/projects" });
  });

  it("never redirects the control plane, launcher, shared surfaces, capabilities or the API", () => {
    for (const host of ["health.beyu.co.tz", "foundation.beyu.co.tz", "familyoffice.beyu.co.tz", "noelia.beyu.co.tz"]) {
      for (const pathname of ["/", "/os", "/launcher", "/enroll", "/os/family", "/os/noelia", "/os/hcm", "/api/v1/authorization/context"]) {
        expect(decideProxyAction(facts({ host, pathname }), PROD).kind, `${host}${pathname}`).toBe("NEXT");
      }
    }
  });

  it("I — never loops: every redirected request is served in place on the target host", () => {
    const hosts = [...CONTRACT.map((entry) => entry.host), "www.beyu.co.tz"];
    const paths = [...CONTRACT.map((entry) => entry.href), "/os/finance/ledger", "/health/os", "/os/family", "/os/noelia"];
    for (const host of hosts) {
      for (const pathname of paths) {
        let current = facts({ host, pathname });
        let hops = 0;
        let last = "";
        for (;;) {
          const action = decideProxyAction(current, PROD);
          if (action.kind !== "REDIRECT") {
            expect(action.kind, `${host}${pathname}`).toBe("NEXT");
            break;
          }
          hops += 1;
          expect(hops, `${host}${pathname}`).toBeLessThanOrEqual(1);
          last = action.location;
          const url = new URL(action.location);
          current = facts({ host: url.host, pathname: url.pathname });
        }
        // The redirect fires exactly when the path belongs to an OS other than
        // the one this canonical host serves; the apex and every neutral host
        // never redirect, and no path is redirected twice.
        const owner = osOwningPath(pathname);
        const hostResolution = resolve(host, PROD);
        const shouldRedirect =
          owner !== null &&
          (hostResolution.kind === "SURFACE" ||
            (hostResolution.kind === "SECTOR_OS" && hostResolution.os.code !== owner.code));
        expect(hops, `${host}${pathname}`).toBe(shouldRedirect ? 1 : 0);
        if (shouldRedirect) expect(last).toBe(`https://${owner!.subdomain}.beyu.co.tz${pathname}`);
      }
    }
  });

  it("never redirects on the apex, a preview host, localhost or an unconfigured deployment", () => {
    for (const host of ["www.beyu.co.tz", "beyu.co.tz", "beyu-os.vercel.app", "localhost:3000", "127.0.0.1:3100"]) {
      for (const pathname of ["/os/health", "/os/finance", "/os/agriculture", "/os/ujenzi", "/os/foundation", "/health/os"]) {
        expect(decideProxyAction(facts({ host, pathname }), PROD).kind, `${host}${pathname}`).toBe("NEXT");
      }
    }
    expect(decideProxyAction(facts({ host: "health.beyu.co.tz", pathname: "/os/finance" }), UNCONFIGURED).kind).toBe("NEXT");
    expect(decideProxyAction(facts({ host: "noelia.beyu.co.tz", pathname: "/os/finance" }), UNCONFIGURED).kind).toBe("NEXT");
  });

  it("builds the redirect target from the catalogue and configuration, never from the request", () => {
    // A hostile Host that happens to normalise to a destination host still yields
    // a target composed only of <label>.<apex>; nothing from the input survives.
    const action = decideProxyAction(
      facts({ host: "HEALTH.beyu.co.tz:443", pathname: "/os/ujenzi/projects/123" }),
      PROD,
    );
    expect(action).toMatchObject({ kind: "REDIRECT", location: "https://ujenzi.beyu.co.tz/os/ujenzi/projects/123" });
    expect(canonicalOrigin(CANONICAL_OS_HOSTS[1], "beyu.co.tz")).toBe("https://health.beyu.co.tz");
    expect(canonicalOrigin(CANONICAL_SURFACES[1], "beyu.co.tz")).toBe("https://noelia.beyu.co.tz");
  });

  it("preserves scheme and port only for the development localhost base", () => {
    const dev = decideProxyAction(
      facts({ host: "health.localhost:3000", pathname: "/os/finance", protocol: "http:", port: "3000" }),
      DEV,
    );
    expect(dev).toMatchObject({ kind: "REDIRECT", location: "http://finance.localhost:3000/os/finance" });
    // The production apex is always https even if the incoming facts say otherwise.
    const prod = decideProxyAction(
      facts({ host: "health.beyu.co.tz", pathname: "/os/finance", protocol: "http:", port: "8080" }),
      PROD,
    );
    expect(prod).toMatchObject({ kind: "REDIRECT", location: "https://finance.beyu.co.tz/os/finance" });
  });
});

describe("E. proxy decision — Origin check (CSRF hardening, refusal only)", () => {
  it("passes safe methods regardless of Origin", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(decideProxyAction(facts({ method, origin: "https://evil.example" }), PROD).kind).toBe("NEXT");
    }
  });

  it("passes unsafe methods without an Origin (webhooks, mobile API, server-to-server)", () => {
    for (const host of ["www.beyu.co.tz", "health.beyu.co.tz", "noelia.beyu.co.tz", "beyu-os.vercel.app", "127.0.0.1:3100"]) {
      expect(decideProxyAction(facts({ host, method: "POST", pathname: "/api/v1/payments/webhook/x" }), PROD).kind).toBe("NEXT");
    }
  });

  it("passes same-origin unsafe requests, including ports and IP literals", () => {
    const cases: Array<[string, string]> = [
      ["www.beyu.co.tz", "https://www.beyu.co.tz"],
      ["health.beyu.co.tz", "https://health.beyu.co.tz"],
      ["familyoffice.beyu.co.tz", "https://familyoffice.beyu.co.tz"],
      ["noelia.beyu.co.tz", "https://noelia.beyu.co.tz"],
      ["beyu-os.vercel.app", "https://beyu-os.vercel.app"],
      ["localhost:3000", "http://localhost:3000"],
      ["127.0.0.1:3100", "http://127.0.0.1:3100"],
      ["10.0.0.5:3000", "http://10.0.0.5:3000"],
      ["[::1]:3000", "http://[::1]:3000"],
      ["WWW.beyu.co.tz:443", "https://www.beyu.co.tz"],
    ];
    for (const [host, origin] of cases) {
      expect(decideProxyAction(facts({ host, origin, method: "POST", pathname: "/api/v1/auth/login" }), PROD).kind, `${host} ← ${origin}`).toBe("NEXT");
    }
  });

  it("permits unsafe requests between canonical BEYU hosts only", () => {
    expect(decideProxyAction(facts({ host: "health.beyu.co.tz", origin: "https://www.beyu.co.tz", method: "POST" }), PROD).kind).toBe("NEXT");
    expect(decideProxyAction(facts({ host: "www.beyu.co.tz", origin: "https://finance.beyu.co.tz", method: "POST" }), PROD).kind).toBe("NEXT");
    expect(decideProxyAction(facts({ host: "noelia.beyu.co.tz", origin: "https://foundation.beyu.co.tz", method: "POST" }), PROD).kind).toBe("NEXT");
    // A preview/unknown request host never accepts a cross-host origin, canonical or not.
    expect(decideProxyAction(facts({ host: "beyu-os.vercel.app", origin: "https://www.beyu.co.tz", method: "POST" }), PROD).kind).toBe("FORBIDDEN");
    // Unconfigured deployments have no canonical peers.
    expect(decideProxyAction(facts({ host: "health.beyu.co.tz", origin: "https://www.beyu.co.tz", method: "POST" }), UNCONFIGURED).kind).toBe("FORBIDDEN");
  });

  it("refuses unsafe requests from foreign, look-alike, null and malformed origins", () => {
    for (const origin of [
      "https://evil.example",
      "https://health.beyu.co.tz.evil.example",
      "https://evil-health.beyu.co.tz",
      "https://unknown.beyu.co.tz",
      "https://family-office.beyu.co.tz",
      "https://beyu.co.tz.evil",
      "null",
      "garbage",
      "https://",
    ]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(decideProxyAction(facts({ host: "www.beyu.co.tz", origin, method }), PROD), `${method} ${origin}`).toEqual({
          kind: "FORBIDDEN",
          reason: "ORIGIN_MISMATCH",
        });
      }
    }
  });
});

describe("F. navigation hrefs (OS switching without a login loop)", () => {
  const dest = (code: string) => SECTOR_OPERATING_SYSTEMS.find((d) => d.code === code)!;
  const surface = (code: string) => CANONICAL_SURFACES.find((d) => d.code === code)!;
  const onRoot = resolve("www.beyu.co.tz", PROD);
  const onHealth = resolve("health.beyu.co.tz", PROD);
  const onNoelia = resolve("noelia.beyu.co.tz", PROD);
  const onPreview = resolve("beyu-os.vercel.app", PROD);
  const onDevHost = resolve("health.localhost", DEV);

  it("stays relative unless the session is shared across the canonical apex", () => {
    for (const current of [onRoot, onHealth, onNoelia, onPreview]) {
      expect(canonicalDestinationHref(dest("HEALTH"), { current, options: PROD, sharedSession: false })).toBe("/os/health");
      expect(canonicalDestinationHref(surface("FAMILY_OFFICE"), { current, options: PROD, sharedSession: false })).toBe("/os/family");
    }
    expect(canonicalDestinationHref(dest("HEALTH"), { current: onRoot, options: UNCONFIGURED, sharedSession: true })).toBe("/os/health");
  });

  it("renders the canonical absolute URL from any canonical host when sharing is configured", () => {
    for (const current of [onRoot, onHealth, onNoelia]) {
      expect(canonicalDestinationHref(dest("HEALTH"), { current, options: PROD, sharedSession: true })).toBe("https://health.beyu.co.tz/os/health");
      expect(canonicalDestinationHref(dest("FINANCE"), { current, options: PROD, sharedSession: true })).toBe("https://finance.beyu.co.tz/os/finance");
      expect(canonicalDestinationHref(dest("FOUNDATION"), { current, options: PROD, sharedSession: true })).toBe("https://foundation.beyu.co.tz/os/foundation");
      expect(canonicalDestinationHref(surface("FAMILY_OFFICE"), { current, options: PROD, sharedSession: true })).toBe("https://familyoffice.beyu.co.tz/os/family");
      expect(canonicalDestinationHref(surface("NOELIA_AI"), { current, options: PROD, sharedSession: true })).toBe("https://noelia.beyu.co.tz/os/noelia");
    }
    // Never from a preview/neutral host (the cookie would not travel), and never
    // from the development `*.localhost` base (it must not render a prod URL).
    expect(canonicalDestinationHref(dest("HEALTH"), { current: onPreview, options: PROD, sharedSession: true })).toBe("/os/health");
    expect(canonicalDestinationHref(dest("HEALTH"), { current: onDevHost, options: DEV, sharedSession: true })).toBe("/os/health");
    // Destinations without a canonical host keep their route.
    expect(canonicalDestinationHref(BEYU_CONTROL_PLANE, { current: onRoot, options: PROD, sharedSession: true })).toBe("/os");
  });

  it("G — switching is only advertised when the destination's own gate can be reached", () => {
    // The href generator carries NO authorization input: it renders a URL only.
    const href = canonicalDestinationHref(dest("FINANCE"), { current: onHealth, options: PROD, sharedSession: true });
    expect(href).toBe("https://finance.beyu.co.tz/os/finance");
    // Reaching that host re-runs FINANCE's own gate: the host resolution itself
    // grants nothing and the proxy decision for the Finance home on the Finance
    // host is a plain NEXT (served by the route, whose guard decides).
    expect(decideProxyAction(facts({ host: "finance.beyu.co.tz", pathname: "/os/finance" }), PROD).kind).toBe("NEXT");
    // A user without Finance grants gets the same routing and a governed denial
    // from the route's own guard (see the HTTP suite) — never access.
    expect(kindOf("finance.beyu.co.tz")).toBe("SECTOR_OS:FINANCE");
  });
});

describe("G. shared surfaces — a capability and a governed AI interface, never an OS", () => {
  it("declares their own canonical labels, registry identities and declared guards", () => {
    expect(CANONICAL_SURFACES.map((s) => [s.subdomain, s.code, s.kind, s.href, s.entryPermission])).toEqual([
      ["familyoffice", "FAMILY_OFFICE", "SHARED_CAPABILITY", "/os/family", "family:member.read"],
      ["noelia", "NOELIA_AI", "GOVERNED_AI_INTERFACE", "/os/noelia", "ai:noelia.query"],
    ]);
    // The declared guard is a real permission of the canonical vocabulary.
    for (const surface of CANONICAL_SURFACES) {
      expect(Object.keys(PERMISSIONS)).toContain(surface.entryPermission);
    }
  });

  it("keeps both out of the OS catalogue, the OS host set and the Noelia OS-context vocabulary", () => {
    const osCodes = SECTOR_OPERATING_SYSTEMS.map((os) => os.code);
    const osLabels = CANONICAL_OS_HOSTS.map((os) => os.subdomain);
    for (const surface of CANONICAL_SURFACES) {
      expect(osCodes).not.toContain(surface.code);
      expect(osLabels).not.toContain(surface.subdomain);
      // No invented *_OS identity for either surface.
      expect(surface.code).not.toMatch(/_OS$/);
      expect(Object.keys(NOELIA_OS_CONTEXT_BY_OS_CODE)).not.toContain(surface.code);
    }
    // FOUNDATION keeps its registered OS identity — no rename, no new code.
    expect(osCodes).toEqual(["FINANCE", "HEALTH", "AGRICULTURE", "FOUNDATION", "UJENZI"]);
    expect(NOELIA_OS_CONTEXT_BY_OS_CODE.FOUNDATION).toBe("FOUNDATION_OS");
  });
});

describe("H. tenant isolation is not a hostname fact", () => {
  it("a resolution carries no tenant, entity, country, classification or permission", () => {
    for (const entry of [...CONTRACT, { host: "beyu.co.tz" }, { host: "unknown.beyu.co.tz" }]) {
      const resolution = resolve(entry.host);
      const keys = Object.keys(resolution).sort();
      if (resolution.kind === "SECTOR_OS" || resolution.kind === "SURFACE") {
        expect(keys, entry.host).toEqual(["base", "hostname", "kind", resolution.kind === "SECTOR_OS" ? "os" : "surface"]);
      } else if (resolution.kind === "CONTROL_PLANE") {
        expect(keys, entry.host).toEqual(["base", "hostname", "kind"]);
      } else {
        expect(keys, entry.host).toEqual(["hostname", "kind"]);
      }
      // Nothing tenant-shaped may appear anywhere in the value.
      expect(JSON.stringify(resolution), entry.host).not.toMatch(/\b(tenant|entity|country|clearance|classification|permission|principal)/i);
    }
  });

  it("selecting a destination selects no tenant: the same OS host serves every tenant the principal may act in", () => {
    // The catalogue entry returned is the registered one — identity-equal for
    // every host that resolves to it, and per-host tenant data does not exist.
    expect(canonicalContextOf(resolve("agriculture.beyu.co.tz"))).toBe(
      SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "AGRICULTURE"),
    );
    expect(canonicalContextOf(resolve("agriculture.beyu.co.tz"))).toBe(
      canonicalContextOf(resolve("AGRICULTURE.beyu.co.tz:443")),
    );
    // Tenant/entity/country scoping stays where it already was: the OS layouts
    // re-run `operatingSystemTenantInScope` on every request (pinned by the
    // source-level security suite), and the tenant-domain registry owns tenant
    // hostnames.
    expect(osOwningPath("/os/agriculture")?.href).toBe("/os/agriculture");
  });
});
