/**
 * Canonical Sector OS subdomains — domain contract (pure, no server, no DB).
 *
 *   health.beyu.co.tz       → HEALTH_OS
 *   finance.beyu.co.tz      → FINANCE_OS
 *   agriculture.beyu.co.tz  → AGRICULTURE_OS
 *   ujenzi.beyu.co.tz       → UJENZI_OS
 *
 * Pins: the mapping is driven by the ONE catalogue; resolution is exact,
 * normalised and configuration-gated; an arbitrary Host can never select an OS;
 * the proxy decision cannot loop or open-redirect; the Origin check only ever
 * refuses; navigation links stay relative until session sharing is configured.
 */
import { describe, expect, it } from "vitest";
import {
  BEYU_CONTROL_PLANE,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-system-catalog";
import { NOELIA_OS_CONTEXT_BY_OS_CODE } from "@/lib/os-context";
import {
  SUBDOMAIN_SECTOR_OPERATING_SYSTEMS,
  canonicalDestinationHref,
  canonicalSectorOrigin,
  decideProxyAction,
  parseCanonicalDomain,
  resolveSectorHost,
  sectorDomainOptionsFromEnvironment,
  sectorOwningPath,
  type ProxyRequestFacts,
  type SectorDomainOptions,
} from "@/lib/sector-domains";

const PROD: SectorDomainOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: false };
const DEV: SectorDomainOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: true };
const UNCONFIGURED: SectorDomainOptions = { canonicalDomain: null, allowLocalhost: false };

/** The canonical contract, by catalogue code and os_registry code. */
const CONTRACT = [
  { host: "health.beyu.co.tz", code: "HEALTH", os: "HEALTH_OS", href: "/os/health" },
  { host: "finance.beyu.co.tz", code: "FINANCE", os: "FINANCE_OS", href: "/os/finance" },
  { host: "agriculture.beyu.co.tz", code: "AGRICULTURE", os: "AGRICULTURE_OS", href: "/os/agriculture" },
  { host: "ujenzi.beyu.co.tz", code: "UJENZI", os: "UJENZI_OS", href: "/os/ujenzi" },
] as const;

const sector = (host: string, options: SectorDomainOptions = PROD) => {
  const resolution = resolveSectorHost(host, options);
  return resolution.kind === "SECTOR" ? resolution.os.code : resolution.kind;
};

describe("A. the four canonical Sector OS subdomains", () => {
  it("maps each canonical host to its registered Sector OS and canonical home", () => {
    for (const entry of CONTRACT) {
      const resolution = resolveSectorHost(entry.host, PROD);
      expect(resolution.kind).toBe("SECTOR");
      if (resolution.kind !== "SECTOR") continue;
      expect(resolution.os.code).toBe(entry.code);
      expect(resolution.os.href).toBe(entry.href);
      expect(resolution.os.level).toBe("SECTOR_OS");
      expect(resolution.base).toBe("beyu.co.tz");
      // The Noelia OS context for that catalogue code is the canonical os_registry code.
      expect(NOELIA_OS_CONTEXT_BY_OS_CODE[resolution.os.code]).toBe(entry.os);
    }
  });

  it("declares exactly four subdomain labels, all on the catalogue, none duplicated", () => {
    expect(SUBDOMAIN_SECTOR_OPERATING_SYSTEMS.map((d) => d.subdomain)).toEqual([
      "finance",
      "health",
      "agriculture",
      "ujenzi",
    ]);
    expect(new Set(SUBDOMAIN_SECTOR_OPERATING_SYSTEMS.map((d) => d.code)).size).toBe(4);
    // Foundation OS and the control plane have no canonical subdomain; shared
    // capabilities are not in the catalogue at all.
    expect(SECTOR_OPERATING_SYSTEMS.find((d) => d.code === "FOUNDATION")?.subdomain).toBeUndefined();
    expect(BEYU_CONTROL_PLANE.subdomain).toBeUndefined();
    // The canonical routes are untouched by the subdomain contract.
    expect(SECTOR_OPERATING_SYSTEMS.map((d) => d.href)).toEqual([
      "/os/finance",
      "/os/health",
      "/os/agriculture",
      "/os/foundation",
      "/os/ujenzi",
    ]);
  });

  it("normalises case, port and the root dot before matching", () => {
    expect(sector("Health.BEYU.co.tz")).toBe("HEALTH");
    expect(sector("finance.beyu.co.tz:443")).toBe("FINANCE");
    expect(sector("agriculture.beyu.co.tz.")).toBe("AGRICULTURE");
    expect(sector("UJENZI.beyu.co.tz:8443")).toBe("UJENZI");
  });

  it("keeps the apex and www as the canonical BEYU OS root, never a sector", () => {
    expect(sector("beyu.co.tz")).toBe("CANONICAL_ROOT");
    expect(sector("www.beyu.co.tz")).toBe("CANONICAL_ROOT");
    expect(sector("WWW.beyu.co.tz:443")).toBe("CANONICAL_ROOT");
  });
});

describe("B. an arbitrary Host can never select an OS", () => {
  it("does not resolve anything when no canonical domain is configured", () => {
    for (const entry of CONTRACT) expect(sector(entry.host, UNCONFIGURED)).toBe("NEUTRAL");
    expect(sector("www.beyu.co.tz", UNCONFIGURED)).toBe("NEUTRAL");
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
      "foundation.beyu.co.tz", // Foundation has no canonical subdomain
      "familyoffice.beyu.co.tz", // a shared capability is not an OS
      "hcm.beyu.co.tz",
      "noelia.beyu.co.tz",
    ]) {
      expect(sector(hostile), hostile).toBe("NEUTRAL");
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
      "health.beyu.co.tz..",
    ]) {
      expect(sector(hostile as string), String(hostile)).toBe("NEUTRAL");
    }
  });

  it("treats preview and platform hosts as neutral — never a sector, never an error", () => {
    for (const host of ["beyu-os.vercel.app", "beyu-os-git-main-team.vercel.app", "localhost", "localhost:3000"]) {
      expect(sector(host)).toBe("NEUTRAL");
      expect(sector(host, DEV)).toBe("NEUTRAL");
    }
  });

  it("permits <label>.localhost ONLY outside production", () => {
    expect(sector("health.localhost:3000", DEV)).toBe("HEALTH");
    expect(sector("finance.localhost", DEV)).toBe("FINANCE");
    expect(sector("health.localhost:3000", PROD)).toBe("NEUTRAL");
    expect(sector("x.health.localhost", DEV)).toBe("NEUTRAL");
    expect(sector("www.localhost", DEV)).toBe("CANONICAL_ROOT");
  });

  it("reads configuration strictly: an invalid canonical domain disables resolution", () => {
    expect(parseCanonicalDomain("beyu.co.tz")).toBe("beyu.co.tz");
    expect(parseCanonicalDomain(" BEYU.co.tz. ")).toBe("beyu.co.tz");
    for (const bad of [undefined, "", "localhost", "127.0.0.1", "https://beyu.co.tz", "beyu", "*.beyu.co.tz"]) {
      expect(parseCanonicalDomain(bad), String(bad)).toBeNull();
    }
    expect(sectorDomainOptionsFromEnvironment({})).toEqual({ canonicalDomain: null, allowLocalhost: true });
    expect(sectorDomainOptionsFromEnvironment({ NODE_ENV: "production", BEYU_CANONICAL_DOMAIN: "beyu.co.tz" })).toEqual({
      canonicalDomain: "beyu.co.tz",
      allowLocalhost: false,
    });
  });
});

describe("C. path ownership (which sector a route belongs to)", () => {
  it("owns exactly the canonical routes, their nested paths and the declared Health aliases", () => {
    for (const entry of CONTRACT) {
      expect(sectorOwningPath(entry.href)?.code).toBe(entry.code);
      expect(sectorOwningPath(`${entry.href}/nested/deep`)?.code).toBe(entry.code);
    }
    expect(sectorOwningPath("/health")?.code).toBe("HEALTH");
    expect(sectorOwningPath("/health/os")?.code).toBe("HEALTH");
  });

  it("owns nothing else: control plane, launcher, shared capabilities, Foundation, API", () => {
    for (const path of [
      "/",
      "/os",
      "/launcher",
      "/enroll",
      "/os/foundation",
      "/os/family",
      "/os/hcm",
      "/os/noelia",
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
      expect(sectorOwningPath(path), String(path)).toBeNull();
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
  it("serves the canonical home, the launcher, the control plane and the API in place on a sector host", () => {
    for (const pathname of ["/", "/os/health", "/os/health/anything", "/health", "/health/os", "/launcher", "/os", "/os/foundation", "/os/family", "/api/v1/health/identity", "/api/v1/finance/ledger"]) {
      const action = decideProxyAction(facts({ pathname }), PROD);
      expect(action.kind, pathname).toBe("NEXT");
    }
  });

  it("redirects a path owned by ANOTHER sector to that sector's canonical host — same path, https, no port", () => {
    const action = decideProxyAction(facts({ host: "health.beyu.co.tz", pathname: "/os/finance/payments" }), PROD);
    expect(action).toMatchObject({ kind: "REDIRECT", status: 307, location: "https://finance.beyu.co.tz/os/finance/payments" });
    const legacy = decideProxyAction(facts({ host: "finance.beyu.co.tz", pathname: "/health/os" }), PROD);
    expect(legacy).toMatchObject({ kind: "REDIRECT", location: "https://health.beyu.co.tz/health/os" });
    const ujenzi = decideProxyAction(facts({ host: "agriculture.beyu.co.tz", pathname: "/os/ujenzi" }), PROD);
    expect(ujenzi).toMatchObject({ kind: "REDIRECT", location: "https://ujenzi.beyu.co.tz/os/ujenzi" });
  });

  it("never loops: the redirected request is served in place", () => {
    for (const from of CONTRACT) {
      for (const to of CONTRACT) {
        let current = facts({ host: from.host, pathname: to.href });
        let hops = 0;
        for (;;) {
          const action = decideProxyAction(current, PROD);
          if (action.kind !== "REDIRECT") {
            expect(action.kind).toBe("NEXT");
            break;
          }
          hops += 1;
          expect(hops, `${from.host}${to.href}`).toBeLessThanOrEqual(1);
          const url = new URL(action.location);
          current = facts({ host: url.host, pathname: url.pathname });
        }
        expect(hops).toBe(from.code === to.code ? 0 : 1);
      }
    }
  });

  it("never redirects on www, the apex, a preview host, localhost or an unconfigured deployment", () => {
    for (const host of ["www.beyu.co.tz", "beyu.co.tz", "beyu-os.vercel.app", "localhost:3000", "127.0.0.1:3100"]) {
      for (const pathname of ["/os/health", "/os/finance", "/os/agriculture", "/os/ujenzi", "/health/os"]) {
        expect(decideProxyAction(facts({ host, pathname }), PROD).kind, `${host}${pathname}`).toBe("NEXT");
      }
    }
    expect(decideProxyAction(facts({ host: "health.beyu.co.tz", pathname: "/os/finance" }), UNCONFIGURED).kind).toBe("NEXT");
  });

  it("builds the redirect target from the catalogue and configuration, never from the request", () => {
    // A hostile Host that happens to normalise to a sector host still yields a
    // target composed only of <label>.<apex>; nothing from the input survives.
    const action = decideProxyAction(
      facts({ host: "HEALTH.beyu.co.tz:443", pathname: "/os/ujenzi/projects/123" }),
      PROD,
    );
    expect(action).toMatchObject({ kind: "REDIRECT", location: "https://ujenzi.beyu.co.tz/os/ujenzi/projects/123" });
    expect(canonicalSectorOrigin(SUBDOMAIN_SECTOR_OPERATING_SYSTEMS[1], "beyu.co.tz")).toBe("https://health.beyu.co.tz");
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
    for (const host of ["www.beyu.co.tz", "health.beyu.co.tz", "beyu-os.vercel.app", "127.0.0.1:3100"]) {
      expect(decideProxyAction(facts({ host, method: "POST", pathname: "/api/v1/payments/webhook/x" }), PROD).kind).toBe("NEXT");
    }
  });

  it("passes same-origin unsafe requests, including ports and IP literals", () => {
    const cases: Array<[string, string]> = [
      ["www.beyu.co.tz", "https://www.beyu.co.tz"],
      ["health.beyu.co.tz", "https://health.beyu.co.tz"],
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

describe("F. navigation hrefs", () => {
  const dest = (code: string) => SECTOR_OPERATING_SYSTEMS.find((d) => d.code === code)!;
  const onRoot = resolveSectorHost("www.beyu.co.tz", PROD);
  const onHealth = resolveSectorHost("health.beyu.co.tz", PROD);
  const onPreview = resolveSectorHost("beyu-os.vercel.app", PROD);

  it("stays relative unless the session is shared across the canonical apex", () => {
    for (const current of [onRoot, onHealth, onPreview]) {
      expect(canonicalDestinationHref(dest("HEALTH"), { current, options: PROD, sharedSession: false })).toBe("/os/health");
    }
    expect(canonicalDestinationHref(dest("HEALTH"), { current: onRoot, options: UNCONFIGURED, sharedSession: true })).toBe("/os/health");
  });

  it("renders the canonical subdomain URL from a canonical host when sharing is configured", () => {
    expect(canonicalDestinationHref(dest("HEALTH"), { current: onRoot, options: PROD, sharedSession: true })).toBe("https://health.beyu.co.tz/os/health");
    expect(canonicalDestinationHref(dest("UJENZI"), { current: onHealth, options: PROD, sharedSession: true })).toBe("https://ujenzi.beyu.co.tz/os/ujenzi");
    // Never from a preview/neutral host (the cookie would not travel).
    expect(canonicalDestinationHref(dest("HEALTH"), { current: onPreview, options: PROD, sharedSession: true })).toBe("/os/health");
    // Destinations without a subdomain keep their route.
    expect(canonicalDestinationHref(dest("FOUNDATION"), { current: onRoot, options: PROD, sharedSession: true })).toBe("/os/foundation");
    expect(canonicalDestinationHref(BEYU_CONTROL_PLANE, { current: onRoot, options: PROD, sharedSession: true })).toBe("/os");
  });
});
