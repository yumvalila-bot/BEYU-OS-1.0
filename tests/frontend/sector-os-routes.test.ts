/**
 * Canonical Sector OS routes — contract certification.
 *
 * PHASE 15 of the canonical Sector OS routing work. Pins the invariants that
 * make `/os/health`, `/os/finance`, `/os/agriculture`, `/os/ujenzi` and
 * `/os/foundation` correct on top of the EXISTING application:
 *
 *   A. Canonical route resolution — every route resolves through the ONE
 *      canonical OS registry (`src/lib/operating-system-catalog.ts`) to its
 *      registered OS identity. Nothing infers OS identity from URL text.
 *   B. Invalid route handling — no catch-all, no fallback: an unknown OS route
 *      never resolves to an unrelated Sector OS and uses the existing 404.
 *   C. Authorization — the four pre-existing Sector OS deep links keep their
 *      server-side tenant/classification guard; the Health route and its legacy
 *      alias share ONE gate; the URL is never an authorization input; a
 *      permission-less principal is denied at the control-plane boundary.
 *   D. Deep links — every canonical route answers a direct request (never a
 *      404, never a sector payload without the gate).
 *   E. Navigation — the catalogue, the capability IA and the launcher advertise
 *      exactly the canonical routes, with no Sector OS outside the registry.
 *   F. Noelia — the existing contextual appearance engine receives the correct
 *      OS context per canonical route; identity and governance are unchanged.
 *
 * Pure tests run without a server or database. HTTP tests follow the repository
 * convention (skip when no server, hard-fail when one was explicitly
 * configured — see tests/helpers/http.ts).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BEYU_CONTROL_PLANE,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-system-catalog";
import {
  NOELIA_OS_CONTEXT_BY_OS_CODE,
  noeliaOSContextForPath,
  operatingSystemForPath,
} from "@/lib/os-context";
import {
  NOELIA_ASSET_MAPPING,
  SUPPORTED_NOELIA_OS_CONTEXTS,
} from "@/lib/noelia/context-resolver";
import { NOELIA_CANONICAL_ID } from "@/lib/noelia/canonical-identity";
import { resolveNoeliaContextualAppearance } from "@/lib/noelia/appearance";
import { CAPABILITY_IA } from "@/app/os/capabilities";
import type { Principal } from "@/lib/authz";
import { checkBeyuOSAuthorization } from "@/lib/os-authorization";
import { apiGet, isDeniedPage, login, serverAvailable } from "../helpers/http";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");

/**
 * Source text with comments removed — these gates assert what the CODE does, so
 * a doc comment explaining that the module never reads the pathname must not be
 * mistaken for the module reading it (nor may a comment satisfy an assertion).
 */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const available = await serverAvailable();

/**
 * The canonical Sector OS route contract, in the CANONICAL REGISTRY ORDER
 * (`SECTOR_OPERATING_SYSTEMS`, which is also the sidebar order). Codes are
 * registry codes, never URL text.
 */
const CANONICAL_ROUTES = [
  { code: "FINANCE", name: "Finance OS", href: "/os/finance", noelia: "FINANCE_OS" },
  { code: "HEALTH", name: "Health OS", href: "/os/health", noelia: "HEALTH_OS" },
  { code: "AGRICULTURE", name: "Agriculture OS", href: "/os/agriculture", noelia: "AGRICULTURE_OS" },
  { code: "FOUNDATION", name: "Foundation OS", href: "/os/foundation", noelia: "FOUNDATION_OS" },
  { code: "UJENZI", name: "Ujenzi OS", href: "/os/ujenzi", noelia: "UJENZI_OS" },
] as const;

const sectorGroup = () => {
  const group = CAPABILITY_IA.find((entry) => entry.id === "sector");
  if (!group) throw new Error("canonical Sector OS capability group is missing");
  return group;
};

/* ------------------------------------------------------------------ */
/* A. Canonical route resolution                                       */
/* ------------------------------------------------------------------ */

describe("A. canonical Sector OS route resolution", () => {
  it("declares exactly the five canonical Sector OS routes, beneath /os", () => {
    expect(SECTOR_OPERATING_SYSTEMS.map(({ code, name, href }) => ({ code, name, href }))).toEqual(
      CANONICAL_ROUTES.map(({ code, name, href }) => ({ code, name, href })),
    );
    expect(BEYU_CONTROL_PLANE.href).toBe("/os");
    // Every Sector OS route lives in the canonical /os namespace.
    for (const route of CANONICAL_ROUTES) {
      expect(route.href.startsWith("/os/")).toBe(true);
      expect(route.href.slice(4)).toBe(route.href.slice(4).toLowerCase());
    }
  });

  it("resolves each route to its registered OS identity, including nested paths", () => {
    for (const route of CANONICAL_ROUTES) {
      expect(operatingSystemForPath(route.href).code).toBe(route.code);
      expect(operatingSystemForPath(route.href).name).toBe(route.name);
      expect(operatingSystemForPath(`${route.href}/nested`).code).toBe(route.code);
    }
    // The control plane, and anything that is not a declared sector route.
    expect(operatingSystemForPath("/os").code).toBe("BEYU");
    expect(operatingSystemForPath("/os/unknown").code).toBe("BEYU");
    expect(operatingSystemForPath(null).code).toBe("BEYU");
  });

  it("keeps one registry: the sidebar IA cannot drift from the catalogue", () => {
    expect(
      sectorGroup().items.map(({ label, href }) => ({ label, href })),
    ).toEqual(CANONICAL_ROUTES.map(({ name, href }) => ({ label: name, href })));
  });

  it("mounts a real route for every canonical Sector OS route", () => {
    for (const route of CANONICAL_ROUTES) {
      const segment = path.join(ROOT, "src", "app", route.href.slice(1));
      const entries = readdirSync(segment);
      expect(
        entries.includes("page.tsx") || entries.includes("route.ts"),
        `${route.href} must be served by a page or route handler`,
      ).toBe(true);
    }
  });

  it("keeps Ujenzi ONE Sector OS with its capabilities inside it", () => {
    const ujenzi = source("src", "app", "os", "ujenzi", "sections.tsx");
    for (const capability of ["BOQ", "HSE"]) {
      expect(ujenzi, `Ujenzi capability ${capability} must stay inside Ujenzi OS`).toContain(
        capability,
      );
    }
    // No capability was promoted to an operating system of its own.
    for (const forbidden of [
      "Engineering OS",
      "BIM OS",
      "GIS OS",
      "Digital Twin OS",
      "Twin OS",
      "Noelia OS",
      "HIVE OS",
    ]) {
      expect(source("src", "app", "os", "capabilities.ts")).not.toContain(forbidden);
      expect(source("src", "lib", "operating-system-catalog.ts")).not.toContain(forbidden);
    }
  });
});

/* ------------------------------------------------------------------ */
/* B. Invalid route handling                                           */
/* ------------------------------------------------------------------ */

describe("B. invalid OS routes fail safely", () => {
  it("has no catch-all route under /os that could swallow an unknown OS", () => {
    const entries = readdirSync(path.join(ROOT, "src", "app", "os"), { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.includes("[") && entry.includes("]"));
    // Dynamic segments exist for known identifiers (e.g. projects/[id]) but a
    // catch-all would let /os/<anything> render a page it does not own.
    expect(entries.filter((entry) => entry.includes("..."))).toEqual([]);
  });

  it("keeps the existing not-found convention for unknown OS routes", () => {
    const notFound = source("src", "app", "not-found.tsx");
    expect(notFound).toContain("Page not found");
    expect(notFound).toContain('href="/"');
    expect(readdirSync(path.join(ROOT, "src", "app", "os"))).not.toContain("unknown");
  });

  it("never falls back to a Sector OS for an unknown OS route", () => {
    const unknown = operatingSystemForPath("/os/unknown");
    expect(unknown.level).toBe("CONTROL_PLANE");
    expect(unknown.code).toBe("BEYU");
    expect(SECTOR_OPERATING_SYSTEMS.map(({ code }) => code)).not.toContain(unknown.code);
  });

  it.skipIf(!available)("serves the existing 404 for /os/unknown over HTTP", async () => {
    const res = await apiGet("/os/unknown", null);
    expect(res.status).toBe(404);
    for (const route of CANONICAL_ROUTES) {
      expect(res.html, `${route.name} content must not leak through a fallback`).not.toContain(
        route.name,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* C. Authorization                                                    */
/* ------------------------------------------------------------------ */

describe("C. the URL is never an authorization boundary", () => {
  const mount = source("src", "app", "os", "health", "mount.ts");
  const canonicalHealthRoute = source("src", "app", "os", "health", "route.ts");

  it("gates the canonical Health route before any sector document is served", () => {
    const gateIndex = Math.min(
      mount.indexOf("resolvePrincipal"),
      mount.indexOf("checkHealthOSAuthorization"),
    );
    expect(gateIndex).toBeGreaterThan(-1);
    expect(mount.indexOf("healthSpaHtml") > gateIndex).toBe(true);
  });

  it("contains no pathname-based authorization anywhere on the canonical Health route", () => {
    // The forbidden pattern: `if (pathname.includes("/health")) then allow`.
    for (const text of [code(mount), code(canonicalHealthRoute)]) {
      expect(text).not.toMatch(/pathname|includes\("\/health"\)|searchParams/);
      expect(text).not.toMatch(/from "@\/lib\/authz"|\bcan\(principal/);
    }
  });

  it("keeps the four pre-existing Sector OS deep links on their own server guards", () => {
    // Agriculture, Ujenzi and Foundation gate the CANONICAL TENANT of the
    // sector inside the principal's tenant/classification scope; Finance gates
    // the ledger capability. A URL alone proves nothing.
    expect(source("src", "app", "os", "agriculture", "layout.tsx")).toContain(
      "operatingSystemTenantInScope",
    );
    expect(source("src", "app", "os", "ujenzi", "layout.tsx")).toContain(
      "operatingSystemTenantInScope",
    );
    expect(source("src", "app", "os", "foundation", "layout.tsx")).toContain(
      "operatingSystemTenantInScope",
    );
    expect(source("src", "app", "os", "finance", "page.tsx")).toContain(
      'requireAccess("finance:ledger.read")',
    );
  });

  it("denies the control plane to a principal with no capability, whatever the URL", () => {
    const permissionless: Principal = {
      userId: "USR_TEST",
      partyId: "PTY_TEST",
      email: "test@beyu.os",
      displayName: "Test Principal",
      tenantId: "TEN_TEST",
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: [],
      permissions: new Set(),
      clearance: "INTERNAL",
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "SES_TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    expect(checkBeyuOSAuthorization(permissionless).authorized).toBe(false);
  });

  it.skipIf(!available)("an unauthenticated deep link to a canonical route gets sign-in", async () => {
    for (const route of CANONICAL_ROUTES) {
      const res = await apiGet(route.href, null);
      expect([307, 200]).toContain(res.status);
      if (res.status === 200) {
        // Redirects are followed by the harness: the destination must be the
        // sign-in surface (or the truthful Health denial page), never the
        // sector's authorized content.
        expect(res.html).toMatch(/BEYU OS|Sign in|Welcome|access denied|authorization/i);
      }
      expect(res.html).not.toContain('id="beyu-main"');
    }
  }, 120_000);

  it.skipIf(!available)(
    "a principal without the sector grant cannot gain it by typing the URL",
    async () => {
      // The HCM director holds no construction or finance-authority grant; the
      // direct URL must produce the governed denial, not the module.
      const hcm = await login("hcm@beyu.os");
      const denied = await apiGet("/os/ujenzi", hcm);
      expect(denied.status).toBe(200);
      expect(isDeniedPage(denied.html)).toBe(true);
      expect(denied.html).toMatch(/ujenzi:data\.read/);
    },
    240_000,
  );
});

/* ------------------------------------------------------------------ */
/* D. Deep links                                                       */
/* ------------------------------------------------------------------ */

describe("D. canonical deep links resolve directly", () => {
  it.skipIf(!available)("every canonical route answers a direct request (never 404)", async () => {
    const ceo = await login("ceo@beyu.os");
    for (const route of CANONICAL_ROUTES) {
      const res = await apiGet(route.href, ceo);
      expect(res.status, `${route.href} must resolve`).toBe(200);
      expect(res.html.length).toBeGreaterThan(0);
    }
  }, 240_000);

  it.skipIf(!available)("the canonical Health route and its legacy alias share one mount", async () => {
    const canonical = await apiGet("/os/health", null);
    const legacy = await apiGet("/health/os", null);
    expect([307, 200]).toContain(canonical.status);
    expect([307, 200]).toContain(legacy.status);
    expect(canonical.html).toBe(legacy.html);
  }, 120_000);
});

/* ------------------------------------------------------------------ */
/* E. Navigation                                                       */
/* ------------------------------------------------------------------ */

describe("E. navigation advertises only canonical OS routes", () => {
  it("routes every Sector OS navigation entry to its canonical route", () => {
    const hrefs = sectorGroup().items.map(({ href }) => href);
    expect(hrefs).toEqual(CANONICAL_ROUTES.map(({ href }) => href));
    for (const href of hrefs) {
      expect(SECTOR_OPERATING_SYSTEMS.some((destination) => destination.href === href)).toBe(true);
    }
  });

  it("keeps the launcher driven by the same registry and resolver", () => {
    const launcher = source("src", "app", "launcher", "page.tsx");
    expect(launcher).toContain("SECTOR_OPERATING_SYSTEMS");
    expect(launcher).toContain("authorizedOperatingSystems");
    // No hard-coded OS list of its own.
    expect(launcher).not.toMatch(/\/os\/(finance|health|agriculture|ujenzi|foundation)"/);
  });

  it("keeps the operating-surface label catalogue-driven", () => {
    const brand = source("src", "app", "os", "os-brand.tsx");
    expect(brand).toContain("SECTOR_OPERATING_SYSTEMS");
    expect(brand).not.toMatch(/\/os\/(finance|health|agriculture|ujenzi|foundation)"/);
  });
});

/* ------------------------------------------------------------------ */
/* F. Noelia                                                           */
/* ------------------------------------------------------------------ */

describe("F. Noelia receives the correct OS context", () => {
  it("resolves the canonical Noelia OS context from the registry code, not URL text", () => {
    expect(noeliaOSContextForPath("/os")).toBe("BEYU_OS");
    expect(noeliaOSContextForPath("/os/health")).toBe("HEALTH_OS");
    expect(noeliaOSContextForPath("/os/finance")).toBe("FINANCE_OS");
    expect(noeliaOSContextForPath("/os/agriculture")).toBe("AGRICULTURE_OS");
    expect(noeliaOSContextForPath("/os/ujenzi")).toBe("UJENZI_OS");
    expect(noeliaOSContextForPath("/os/foundation")).toBe("FOUNDATION_OS");
    // Nested routes keep their sector context; unknown routes stay on BEYU OS.
    expect(noeliaOSContextForPath("/os/ujenzi/projects")).toBe("UJENZI_OS");
    expect(noeliaOSContextForPath("/os/unknown")).toBe("BEYU_OS");
    expect(Object.keys(NOELIA_OS_CONTEXT_BY_OS_CODE)).toHaveLength(6);
  });

  it("feeds the existing appearance engine a supported context for every sector with a manifestation", () => {
    for (const route of CANONICAL_ROUTES) {
      const appearance = resolveNoeliaContextualAppearance(noeliaOSContextForPath(route.href));
      // Identity is invariant; only the manifestation changes.
      expect(appearance.identityId).toBe(NOELIA_CANONICAL_ID.canonical_id);
      expect(appearance.status).not.toBe("DENIED");
      if (route.code === "FOUNDATION") {
        // Foundation is a canonical Sector OS with NO registered Noelia
        // manifestation: the engine normalizes that context to BEYU_OS and
        // serves the canonical BEYU OS manifestation rather than a fabricated
        // Foundation asset.
        expect(NOELIA_ASSET_MAPPING.FOUNDATION_OS).toBeUndefined();
        expect(appearance.osContext).toBe("BEYU_OS");
        expect(appearance.assetPath).toBe(NOELIA_ASSET_MAPPING.BEYU_OS.path);
        expect(appearance.status).toBe("AUTHORITATIVE");
      } else {
        expect(appearance.osContext).toBe(route.noelia);
        expect(SUPPORTED_NOELIA_OS_CONTEXTS).toContain(appearance.osContext);
      }
    }
  });

  it("binds the shell to the active route without adding a second Noelia", () => {
    const bridge = source("src", "app", "os", "noelia-shell-for-os.tsx");
    expect(bridge).toContain("usePathname");
    expect(bridge).toContain("noeliaOSContextForPath");
    expect(bridge).toContain("NoeliaShell");
    // Presentation only — the bridge grants nothing.
    expect(bridge).not.toMatch(/from "@\/lib\/authz"|from "@\/db"|requireAccess|\bcan\(principal/);
    // The layout keeps passing the server-resolved governed facts.
    const layout = source("src", "app", "os", "layout.tsx");
    expect(layout).toContain("NoeliaShellForOS");
    expect(layout).toContain("ai:noelia.query");
    expect(layout).toContain("noeliaProviderModeFromEnvironment");
    // Still exactly one Noelia route surface and no "Noelia OS".
    expect(source("src", "app", "os", "capabilities.ts")).not.toContain("Noelia OS");
  });
});
