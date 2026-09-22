/**
 * Health OS SPA mount — governed, fail-closed, no second shell.
 *
 * Source-level contract for the integration that mounts the EXISTING Health OS
 * implementation (`sectors/health` single-file SPA) inside the BEYU
 * authenticated boundary. These tests are pure (no database, no server) and pin
 * the security-relevant properties of the wiring:
 *
 *   - the mount re-runs the full BEYU gate (session + federation link);
 *   - every failure path fails closed (307 to `/` or back to `/health`);
 *   - the canonical Sector OS route `/os/health` and the pre-existing mount URL
 *     `/health/os` delegate to that ONE gate — neither may carry its own
 *     relaxed copy, and the URL itself is never an authorization input;
 *   - the `/health` page keeps its gate, its truthful denial copy and now
 *     redirects authorized users to the canonical route;
 *   - the sector API is reachable only under a dedicated namespace and only
 *     when explicitly configured (no build-time default target);
 *   - the BEYU liveness/readiness probes are untouched.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) =>
  readFileSync(path.join(ROOT, ...parts), "utf8");

/**
 * Source text with comments removed.
 *
 * These gates assert what the CODE does. A doc comment explaining that the
 * module never reads the pathname must not be mistaken for the module reading
 * it (and, equally, a comment can never satisfy an assertion about behaviour).
 */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The one governed mount: gates + the compiled sector SPA document. */
const mount = source("src", "app", "os", "health", "mount.ts");
const canonicalRoute = source("src", "app", "os", "health", "route.ts");
const legacyRoute = source("src", "app", "health", "os", "route.ts");

describe("Health OS SPA mount (governed, fail-closed, no second shell)", () => {
  it("serves the compiled sector SPA from the single governed mount", () => {
    expect(mount).toContain("healthSpaHtml");
    expect(mount).toContain("text/html; charset=utf-8");
    // Session-bearing, authorization-scoped content must not be cached.
    expect(mount).toContain("no-store");
  });

  it("re-runs the full BEYU gate at the mount (a deep link cannot bypass it)", () => {
    // Both gates, in order, before the bundle is ever served.
    expect(mount).toContain("resolvePrincipal");
    expect(mount).toContain("checkHealthOSAuthorization");
    const gateIndex = Math.min(
      mount.indexOf("resolvePrincipal"),
      mount.indexOf("checkHealthOSAuthorization"),
    );
    expect(mount.indexOf("healthSpaHtml") > gateIndex).toBe(true);
    // Unauthenticated → back to the sign-in surface; unauthorized/unavailable
    // → back to the truthful /health denial pages (307, no error page).
    expect(mount).toMatch(/status: 307/);
    expect(mount).toContain('HEALTH_OS_DENIAL_PATH = "/health"');
  });

  it("treats the URL as a location, never as an authorization input", () => {
    // No pathname/header/search-param branch anywhere in the gate: Health OS
    // authority comes only from the session and the federation link. The one
    // request fact the mount may consider is the untrusted Host, and it can only
    // ever cause a refusal (asserted below), never a grant.
    expect(code(mount)).not.toMatch(/pathname|searchParams|request\.headers|x-forwarded/i);
    expect(code(mount)).toContain("resolveRequestHostname");
    expect(code(mount)).toContain("hostnameDenialResponse");
    // A refusal happens BEFORE the sector document is produced, and the document
    // is never conditioned on the host.
    expect(code(mount).indexOf("hostnameDenialResponse")).toBeLessThan(
      code(mount).indexOf("new NextResponse(healthSpaHtml"),
    );
  });

  it("mounts the canonical Sector OS route and the legacy alias on that one gate", () => {
    // Canonical route: `/os/health` (the registry's Health OS href).
    expect(canonicalRoute).toContain('from "./mount"');
    expect(canonicalRoute).toContain('serveHealthOS({ host: request.headers.get("host") })');
    expect(canonicalRoute).toContain('export const dynamic = "force-dynamic"');
    // Pre-existing mount URL retained as a compatibility alias — same handler,
    // never a second implementation.
    expect(legacyRoute).toContain('from "@/app/os/health/mount"');
    expect(legacyRoute).toContain('serveHealthOS({ host: request.headers.get("host") })');
    expect(legacyRoute).toContain('export const dynamic = "force-dynamic"');
    // The ONLY request fact a route may hand the mount is the untrusted Host, and
    // it exists solely so the governed tenant-domain gate can REFUSE. No path,
    // query, cookie, IP or forwarded header may reach the gate.
    for (const route of [canonicalRoute, legacyRoute]) {
      expect(route).not.toMatch(/searchParams|nextUrl|x-forwarded|x-real-ip|request\.url/i);
    }
    // Neither route may reintroduce gate logic of its own.
    for (const route of [canonicalRoute, legacyRoute]) {
      expect(route).not.toContain("resolvePrincipal");
      expect(route).not.toContain("checkHealthOSAuthorization");
      expect(route).not.toContain("healthSpaHtml");
    }
  });

  it("keeps the /health page gate and its truthful denial copy intact", () => {
    const page = source("src", "app", "health", "page.tsx");
    expect(page).toContain("resolvePrincipal");
    expect(page).toContain("checkHealthOSAuthorization");
    expect(page).toContain("This availability state does not prove");
    expect(page).toContain('name={unavailable ? "health" : "security"}');
    // The placeholder is gone: authorized users reach the real implementation
    // at its canonical route.
    expect(page).not.toContain("Coming Soon");
    expect(page).toContain('redirect("/os/health")');
  });

  it("proxies the sector API only under a dedicated namespace and only when configured", () => {
    const config = source("next.config.ts");
    expect(config).toContain("HEALTH_API_URL");
    expect(config).toContain("/health-os/auth/:path*");
    // No hardcoded default target anywhere in the proxy configuration.
    expect(config).not.toContain("http://localhost:3000");
  });

  it("builds the sector SPA with the same-origin base and a non-committed artifact", () => {
    const script = source("scripts", "build-health-spa.mjs");
    expect(script).toContain("VITE_API_BASE_URL");
    expect(script).toContain("/health-os");
    // The artifact module must document that generated content is not committed.
    expect(script).toContain("do not commit");

    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toContain("build-health-spa.mjs");
    expect(pkg.scripts.build).toContain("next build");
    expect(pkg.scripts["build:health-spa"]).toBe("node scripts/build-health-spa.mjs");
  });

  it("mounts the SPA document behind the artifact module (placeholder resolvable)", () => {
    const artifact = source("src", "app", "health", "os", "spa-content.ts");
    expect(artifact).toContain("export const healthSpaHtml");
  });

  it("leaves the BEYU liveness/readiness probes untouched", () => {
    const probe = source("src", "app", "api", "health", "route.ts");
    expect(probe).toContain('checks: { database: "UP" }');
    expect(probe).toContain("byte-stable");
    const live = source("src", "app", "api", "health", "live", "route.ts");
    expect(live).toContain('checks: { process: "ALIVE" }');
  });
});
