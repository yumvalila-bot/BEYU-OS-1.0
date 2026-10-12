/**
 * UNIFIED LOGIN + HOST-AWARE DESTINATION ROUTING — canonical contract.
 *
 * This suite certifies the typed contract in `src/lib/host-routing.ts` and the
 * behaviour it must guarantee on the real server:
 *
 *   A. The eight canonical hosts (and only they) map to their destinations.
 *   B. Normalization and fail-closed resolution — case, port, root dot,
 *      malformed, absent, look-alike, unknown label, tenant hostname, foreign
 *      host, preview host; an unconfigured apex resolves NOTHING.
 *   C. One authoritative mapping — the contract cannot drift from the catalogue
 *      or from `resolveCanonicalHost`, and the sign-in surfaces contain no host
 *      table of their own.
 *   D. The internal route registry — every destination identifier has an
 *      implemented route ON DISK, and Health's canonical route shares the one
 *      federation mount (so the canonical route and its alias cannot diverge).
 *   E. The running server — every canonical host serves the SAME canonical login
 *      page; spoofed forwarding headers cannot change the destination; unknown
 *      and malformed hosts select nothing; an unauthenticated deep link still
 *      yields no privileged content.
 *
 * The hostname selects the requested EXPERIENCE. It never selects authority: the
 * authorization facts live in the session/tenant/entity/RBAC/ABAC/policy/RLS
 * chain, which every route re-runs on every request, and are asserted by their
 * own suites (`canonical-host-http`, `destination-signin-http`,
 * `accessibility-nav-gating`, `admin-frontend-preview`, `tenant-isolation/*`).
 */
import { request as httpRequest } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOST_DESTINATION_IDENTIFIERS,
  HOST_DESTINATION_LABELS,
  destinationCatalogueEntry,
  destinationRoute,
  hostDestinationMap,
  resolveHostDestination,
  type HostDestination,
} from "../../src/lib/host-routing";
import {
  canonicalHostOptionsFromEnvironment,
  destinationForResolution,
  resolveCanonicalHost,
  type CanonicalHostOptions,
} from "../../src/lib/canonical-hosts";
import {
  CANONICAL_NON_OS_DESTINATIONS,
  DESTINATION_TYPE_LABEL,
  SECTOR_OPERATING_SYSTEMS,
} from "../../src/lib/operating-system-catalog";

const ROOT = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");

/** The production shape: the apex configured, no localhost development base. */
const PRODUCTION: CanonicalHostOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: false };

/** The contract, exactly as specified. `www` is an explicit root alias, not a row. */
const EXPECTED_CONTRACT: Record<string, HostDestination> = {
  "beyu.co.tz": "HOME",
  "health.beyu.co.tz": "HEALTH_OS",
  "finance.beyu.co.tz": "FINANCE_OS",
  "agriculture.beyu.co.tz": "AGRICULTURE_OS",
  "ujenzi.beyu.co.tz": "UJENZI_OS",
  "foundation.beyu.co.tz": "FOUNDATION",
  "familyoffice.beyu.co.tz": "FAMILY_OFFICE",
  "noelia.beyu.co.tz": "NOELIA_AI",
};

const resolved = (host: string | null, options: CanonicalHostOptions = PRODUCTION) => {
  const resolution = resolveHostDestination(host, options);
  if (resolution.status !== "resolved") {
    throw new Error(`${JSON.stringify(host)} did not resolve (${resolution.status})`);
  }
  return resolution;
};

/* ------------------------------------------------------------------ */
/* A. the canonical contract                                          */
/* ------------------------------------------------------------------ */

describe("A. the canonical host → destination contract", () => {
  it("declares exactly the eight canonical hosts for the configured apex", () => {
    expect(hostDestinationMap("beyu.co.tz")).toEqual(EXPECTED_CONTRACT);
  });

  it("resolves every canonical host to its identifier and its internal route", () => {
    for (const [host, destination] of Object.entries(EXPECTED_CONTRACT)) {
      const resolution = resolved(host);
      expect(resolution.destination, host).toBe(destination);
      expect(resolution.hostname, host).toBe(host);
      expect(resolution.base, host).toBe("beyu.co.tz");
      expect(resolution.route, host).toBe(destinationRoute(destination));
    }
  });

  it("keeps the apex and its explicit `www` root label on HOME — and `www` is not a ninth entry", () => {
    expect(resolved("beyu.co.tz").destination).toBe("HOME");
    expect(resolved("www.beyu.co.tz").destination).toBe("HOME");
    expect(Object.keys(hostDestinationMap("beyu.co.tz"))).toHaveLength(8);
    expect(Object.keys(hostDestinationMap("beyu.co.tz"))).not.toContain("www.beyu.co.tz");
  });

  it("keeps exactly four Sector OSs, with Foundation and Family Office as non-OS destinations", () => {
    const declared = HOST_DESTINATION_IDENTIFIERS.filter((destination) => destination.endsWith("_OS"));
    expect(declared).toEqual(["HEALTH_OS", "FINANCE_OS", "AGRICULTURE_OS", "UJENZI_OS"]);
    expect(HOST_DESTINATION_IDENTIFIERS).toContain("FOUNDATION");
    expect(HOST_DESTINATION_IDENTIFIERS).toContain("FAMILY_OFFICE");
    expect(HOST_DESTINATION_IDENTIFIERS).toContain("NOELIA_AI");
    expect(HOST_DESTINATION_IDENTIFIERS).not.toContain("FAMILY_OFFICE_OS" as HostDestination);
    expect(HOST_DESTINATION_IDENTIFIERS).not.toContain("FOUNDATION_OS" as HostDestination);

    expect(destinationCatalogueEntry("FOUNDATION").destinationType).toBe("NONPROFIT");
    expect(DESTINATION_TYPE_LABEL[destinationCatalogueEntry("FOUNDATION").destinationType]).not.toMatch(/sector/i);
    expect(destinationCatalogueEntry("FAMILY_OFFICE").destinationType).toBe("CAPABILITY");
    expect(DESTINATION_TYPE_LABEL[destinationCatalogueEntry("FAMILY_OFFICE").destinationType]).not.toMatch(/sector/i);
    expect(destinationCatalogueEntry("NOELIA_AI").destinationType).toBe("AI_INTERFACE");

    for (const identifier of ["HEALTH_OS", "FINANCE_OS", "AGRICULTURE_OS", "UJENZI_OS"] as const) {
      expect(destinationCatalogueEntry(identifier).destinationType).toBe("SECTOR_OS");
    }
    expect(SECTOR_OPERATING_SYSTEMS).toHaveLength(4);
  });

  it("is total and unique: every hosted catalogue entry has exactly one identifier and one label", () => {
    const hosted = [...SECTOR_OPERATING_SYSTEMS, ...CANONICAL_NON_OS_DESTINATIONS];
    const identifiers = hosted.map((entry) => destinationCatalogueEntry(
      EXPECTED_CONTRACT[`${entry.subdomain}.beyu.co.tz`],
    ));
    expect(identifiers.map((entry) => entry.code)).toEqual(hosted.map((entry) => entry.code));

    const labels = Object.keys(HOST_DESTINATION_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.sort()).toEqual([...hosted.map((entry) => entry.subdomain), "www"].sort());
    expect(new Set(HOST_DESTINATION_IDENTIFIERS).size).toBe(HOST_DESTINATION_IDENTIFIERS.length);
  });
});

/* ------------------------------------------------------------------ */
/* B. normalization, allowlist and fail-closed resolution             */
/* ------------------------------------------------------------------ */

describe("B. normalization and fail-closed resolution", () => {
  it("normalizes case, a numeric port and the single root dot before matching", () => {
    for (const raw of [
      "HEALTH.BEYU.CO.TZ",
      "Health.Beyu.Co.Tz",
      "health.beyu.co.tz.",
      "health.beyu.co.tz:443",
      "HEALTH.BEYU.CO.TZ.:8443",
      "  health.beyu.co.tz  ",
    ]) {
      const resolution = resolveHostDestination(raw, PRODUCTION);
      expect(resolution.status, raw).toBe("resolved");
      if (resolution.status === "resolved") {
        expect(resolution.destination, raw).toBe("HEALTH_OS");
        expect(resolution.hostname, raw).toBe("health.beyu.co.tz");
      }
    }
  });

  it("rejects malformed, absent, IP-literal and non-DNS Host values as invalid — never as a destination", () => {
    for (const raw of [
      "",
      "   ",
      null,
      undefined,
      "http://health.beyu.co.tz",
      "https://beyu.co.tz/",
      "health.beyu.co.tz/os/health",
      "user@health.beyu.co.tz",
      "health.beyu.co.tz:notaport",
      "he alth.beyu.co.tz",
      "health.beyu.co.tz\nX-Injected: 1",
      "health.beyu.co.tz..",
      ".health.beyu.co.tz",
      "health_beyu.co.tz",
      "héalth.beyu.co.tz",
      "*.beyu.co.tz",
      "10.0.0.7",
      // A bracketed IPv6 literal is an IP literal — never a destination, never
      // "close enough" to a canonical label.
      "[::1]",
      "health",
    ]) {
      const resolution = resolveHostDestination(raw, PRODUCTION);
      expect(resolution.status, JSON.stringify(raw)).toBe("invalid_host");
      expect("destination" in resolution, JSON.stringify(raw)).toBe(false);
    }
  });

  it("classifies every well-formed but non-allowlisted host as unknown — never a destination", () => {
    const cases: Array<[string, string]> = [
      ["evil-health.beyu.co.tz", "UNKNOWN_LABEL"],
      ["health-beyu.co.tz", "OUTSIDE_CANONICAL_APEX"],
      ["billing.beyu.co.tz", "UNKNOWN_LABEL"],
      ["admin.beyu.co.tz", "UNKNOWN_LABEL"],
      ["www.health.beyu.co.tz", "TENANT_HOSTNAME"],
      ["beyu.co.tz.evil.example", "OUTSIDE_CANONICAL_APEX"],
      ["health.beyu.co.tz.evil.example", "OUTSIDE_CANONICAL_APEX"],
      ["health.beyu.co.tz.attacker.io", "OUTSIDE_CANONICAL_APEX"],
      ["notbeyu.co.tz", "OUTSIDE_CANONICAL_APEX"],
      ["beyu-os-1-0.vercel.app", "OUTSIDE_CANONICAL_APEX"],
      ["preview-abc123.vercel.app", "OUTSIDE_CANONICAL_APEX"],
      // A governed tenant hostname is the tenant-domain registry's business, not
      // a destination frontend.
      ["mwanza.health.beyu.co.tz", "TENANT_HOSTNAME"],
      ["acme.finance.beyu.co.tz", "TENANT_HOSTNAME"],
      // Hosts of the execution environment — well formed, never destinations.
      ["localhost", "LOCAL_SCOPE"],
      ["localhost:3100", "LOCAL_SCOPE"],
      ["127.0.0.1", "LOCAL_SCOPE"],
      ["127.0.0.1:3100", "LOCAL_SCOPE"],
    ];
    for (const [host, reason] of cases) {
      const resolution = resolveHostDestination(host, PRODUCTION);
      expect(resolution.status, host).toBe("unknown_host");
      expect("destination" in resolution, host).toBe(false);
      if (resolution.status === "unknown_host") expect(resolution.reason, host).toBe(reason);
    }
  });

  it("resolves NOTHING when no canonical domain is configured — no fallback to a privileged destination", () => {
    const unconfigured: CanonicalHostOptions = { canonicalDomain: null, allowLocalhost: false };
    for (const host of [...Object.keys(EXPECTED_CONTRACT), "www.beyu.co.tz", "billing.beyu.co.tz"]) {
      const resolution = resolveHostDestination(host, unconfigured);
      expect(resolution.status, host).toBe("unknown_host");
      expect("destination" in resolution, host).toBe(false);
      if (resolution.status === "unknown_host") expect(resolution.reason, host).toBe("NO_CANONICAL_DOMAIN");
    }
    // An invalid `BEYU_CANONICAL_DOMAIN` disables resolution rather than guessing.
    const malformed = canonicalHostOptionsFromEnvironment({ BEYU_CANONICAL_DOMAIN: "not a domain" });
    expect(malformed.canonicalDomain).toBeNull();
    expect(resolveHostDestination("health.beyu.co.tz", malformed).status).toBe("unknown_host");
  });

  it("keeps the development base explicit, separate from production, and never a production destination", () => {
    const development: CanonicalHostOptions = { canonicalDomain: "beyu.co.tz", allowLocalhost: true };
    expect(resolved("health.localhost", development).destination).toBe("HEALTH_OS");
    expect(resolved("foundation.localhost", development).destination).toBe("FOUNDATION");
    // The execution host itself is not a canonical HOME: the local base is a
    // development convenience for `<label>.localhost`, never a destination.
    expect(resolveHostDestination("localhost", development).status).toBe("unknown_host");
    // The same development hosts are NOT destinations under the production policy.
    expect(resolveHostDestination("health.localhost", PRODUCTION).status).toBe("unknown_host");
    expect(resolveHostDestination("localhost", PRODUCTION).status).toBe("unknown_host");
  });
});

/* ------------------------------------------------------------------ */
/* C. one authoritative mapping — no drift, no second table            */
/* ------------------------------------------------------------------ */

describe("C. one authoritative host mapping, consumed by the sign-in surfaces", () => {
  it("agrees with the canonical contract for every host under every policy", () => {
    const policies: CanonicalHostOptions[] = [
      PRODUCTION,
      { canonicalDomain: "beyu.co.tz", allowLocalhost: true },
      { canonicalDomain: null, allowLocalhost: false },
    ];
    const hosts = [
      ...Object.keys(EXPECTED_CONTRACT),
      "www.beyu.co.tz",
      "billing.beyu.co.tz",
      "mwanza.health.beyu.co.tz",
      "health.beyu.co.tz.evil.example",
      "localhost",
      "health.localhost",
      "notbeyu.co.tz",
      "",
      null,
    ];
    for (const options of policies) {
      for (const host of hosts) {
        const typed = resolveHostDestination(host, options);
        const pure = resolveCanonicalHost(host, options);
        const destination = destinationForResolution(pure);
        if (typed.status === "resolved") {
          expect(destination, `${host}`).not.toBeNull();
          if (!destination) throw new Error(`${host}: contract resolved but no destination frontend exists`);
          expect(typed.destination, `${host}`).toBe(
            destination.hostKind === "CONTROL_PLANE" ? "HOME" : identifierOf(destination.context.code),
          );
          expect(typed.route, `${host}`).toBe(destination.context.href);
        } else {
          expect(destination, `${host}`).toBeNull();
        }
      }
    }
  });

  it("keeps no host table in the sign-in surfaces: they consume the one resolver", () => {
    const codeOf = (segments: readonly string[]) =>
      source(...segments)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const surfaces = [
      ["src", "app", "page.tsx"],
      ["src", "app", "sign-in", "page.tsx"],
      ["src", "app", "governed-sign-in.tsx"],
      ["src", "app", "sign-in-form.tsx"],
      ["src", "app", "login-surface.tsx"],
      ["src", "app", "forgot-password", "page.tsx"],
      ["src", "app", "launcher", "page.tsx"],
    ] as const;
    for (const segments of surfaces) {
      const code = codeOf(segments);
      for (const host of Object.keys(EXPECTED_CONTRACT)) {
        expect(code, `${segments.join("/")} must not carry its own host table`).not.toContain(host);
      }
      expect(code, `${segments.join("/")}`).not.toMatch(/endsWith\(["'`]beyu\.co\.tz/);
    }
    // The entry page resolves the request host through the ONE server helper…
    expect(source("src", "app", "page.tsx")).toContain("canonicalHostForRequest()");
    // …and the proxy decides routing through the ONE pure contract.
    expect(source("src", "proxy.ts")).toContain("decideProxyAction(");
    expect(source("src", "lib", "canonical-host.ts")).toContain("resolveCanonicalHost(");
  });
});

/* ------------------------------------------------------------------ */
/* D. the internal destination registry                               */
/* ------------------------------------------------------------------ */

describe("D. the internal route registry — every destination has an implemented route", () => {
  const routeFile = (route: string): string[][] => {
    const segments = route.replace(/^\//, "").split("/");
    return [
      ["src", "app", ...segments, "page.tsx"],
      ["src", "app", ...segments, "route.ts"],
    ];
  };

  it("maps every identifier to the catalogue href and to a route that exists on disk", () => {
    for (const destination of HOST_DESTINATION_IDENTIFIERS) {
      const route = destinationRoute(destination);
      expect(route.startsWith("/"), destination).toBe(true);
      expect(route, destination).toBe(destinationCatalogueEntry(destination).href);
      const candidates = routeFile(route);
      expect(
        candidates.some((candidate) => existsSync(path.join(ROOT, ...candidate))),
        `${destination} → ${route} has no page.tsx or route.ts`,
      ).toBe(true);
    }
  });

  it("serves the canonical Health route from the ONE federation mount, shared with its alias", () => {
    const canonical = source("src", "app", "os", "health", "route.ts");
    const legacyAlias = source("src", "app", "health", "os", "route.ts");
    const mount = source("src", "app", "os", "health", "mount.ts");
    expect(canonical).toContain('from "./mount"');
    expect(legacyAlias).toContain("os/health/mount");
    expect(mount).toContain("checkHealthOSAuthorization(");
    // The canonical route adds no authorization logic of its own.
    expect(canonical).not.toMatch(/checkHealthOSAuthorization|can\(/);
  });
});

/* ------------------------------------------------------------------ */
/* E. the running server                                              */
/* ------------------------------------------------------------------ */

const enabled =
  Boolean(process.env.BEYU_TEST_BASE_URL) && process.env.BEYU_TEST_CANONICAL_DOMAIN === "beyu.co.tz";

type Reply = { status: number; location?: string; body: string };

function send(method: string, requestPath: string, headers: Record<string, string>): Promise<Reply> {
  const url = new URL(process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100");
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path: requestPath, method, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const get = (host: string, requestPath = "/", extra: Record<string, string> = {}) =>
  send("GET", requestPath, { host, ...extra });

const text = (body: string) => body.replace(/<!--[^>]{0,8}-->/g, "");

describe("E. the running server", () => {
  it.skipIf(!enabled)(
    "serves the SAME canonical login page on all eight hosts, with the host's own context",
    async () => {
      for (const [host, destination] of Object.entries(EXPECTED_CONTRACT)) {
        const reply = await get(host);
        expect(reply.status, host).toBe(200);
        const body = text(reply.body);
        // ONE login experience: the same real form and the same reference surface.
        expect(body, host).toContain('id="beyu-signin-email"');
        expect(body, host).toContain('id="beyu-signin-password"');
        expect(body, host).toContain("Log in to access your account");
        expect(body, host).toContain("/brand/beyu-os-logo.png");
        // Host-aware CONTEXT, derived server-side — never a second login page.
        const context = destinationCatalogueEntry(destination).name;
        if (destination === "HOME") {
          expect(body, host).toContain("Sign in to the control plane");
        } else {
          expect(body, host).toContain(`Sign in to ${context} — governed by BEYU OS`);
        }
        // No cross-destination bleed: another destination's sign-in copy is absent.
        for (const [otherHost, otherDestination] of Object.entries(EXPECTED_CONTRACT)) {
          if (otherDestination === destination || otherDestination === "HOME") continue;
          expect(body, `${host} must not advertise ${otherHost}`).not.toContain(
            `Sign in to ${destinationCatalogueEntry(otherDestination).name} — governed by BEYU OS`,
          );
        }
      }
    },
    180_000,
  );

  it.skipIf(!enabled)(
    "ignores spoofed forwarding headers: the destination comes from the trusted Host boundary only",
    async () => {
      const spoofs: Array<Record<string, string>> = [
        { "x-forwarded-host": "health.beyu.co.tz" },
        { "x-forwarded-host": "health.beyu.co.tz, beyu.co.tz" },
        { forwarded: "host=health.beyu.co.tz;proto=https" },
        { "x-original-host": "health.beyu.co.tz" },
        { "x-forwarded-server": "health.beyu.co.tz" },
        { "x-host": "health.beyu.co.tz" },
      ];
      for (const spoof of spoofs) {
        const onApex = text((await get("beyu.co.tz", "/", spoof)).body);
        expect(onApex, JSON.stringify(spoof)).toContain("Sign in to the control plane");
        expect(onApex, JSON.stringify(spoof)).not.toContain("Sign in to Health OS");
      }
      // …and a spoofed header cannot turn an unknown host into a destination either.
      const unknown = text((await get("billing.beyu.co.tz", "/", { "x-forwarded-host": "finance.beyu.co.tz" })).body);
      expect(unknown).toContain("Sign in to the control plane");
      expect(unknown).not.toContain("Sign in to Finance OS");
    },
    120_000,
  );

  it.skipIf(!enabled)(
    "selects no destination for unknown and malformed hosts, and no cross-destination content",
    async () => {
      for (const host of [
        "billing.beyu.co.tz",
        "evil-health.beyu.co.tz",
        "health.beyu.co.tz.evil.example",
        "beyu-os-1-0.vercel.app",
        "mwanza.health.beyu.co.tz",
        "health.beyu.co.tz/evil",
      ]) {
        const reply = await get(host);
        expect([200, 307], host).toContain(reply.status);
        const body = text(reply.body);
        expect(body, host).not.toContain("Sign in to Health OS");
        expect(body, host).not.toContain("Sign in to Finance OS");
        expect(body, host).not.toMatch(/id="beyu-destination-signin-title"/);
      }
    },
    120_000,
  );

  it.skipIf(!enabled)(
    "still serves no privileged content to an unauthenticated deep link on an owning host",
    async () => {
      for (const [host, route] of [
        ["finance.beyu.co.tz", "/os/finance"],
        ["health.beyu.co.tz", "/os/health"],
        ["foundation.beyu.co.tz", "/os/foundation"],
      ] as const) {
        const reply = await get(host, route);
        expect([200, 307], `${host}${route}`).toContain(reply.status);
        expect(reply.body, `${host}${route}`).not.toContain('id="beyu-main"');
      }
    },
    120_000,
  );
});

/** Catalogue code → contract identifier, for the drift assertion (test-side only). */
function identifierOf(code: string): HostDestination {
  const entry = [...SECTOR_OPERATING_SYSTEMS, ...CANONICAL_NON_OS_DESTINATIONS].find(
    (candidate) => candidate.code === code,
  );
  if (!entry) return code === "BEYU" ? "HOME" : (code as HostDestination);
  return EXPECTED_CONTRACT[`${entry.subdomain}.beyu.co.tz`];
}
