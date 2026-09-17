/**
 * Health OS SPA mount — governed, fail-closed, no second shell.
 *
 * Source-level contract for the integration that mounts the EXISTING Health OS
 * implementation (`sectors/health` single-file SPA) at `/health/os` inside the
 * BEYU authenticated shell. These tests are pure (no database, no server) and
 * pin the security-relevant properties of the wiring:
 *
 *   - the mount route re-runs the full BEYU gate (session + federation link);
 *   - every failure path fails closed (307 to `/` or back to `/health`);
 *   - the `/health` page keeps its gate and truthful denial copy;
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

describe("Health OS SPA mount (governed, fail-closed, no second shell)", () => {
  it("serves the compiled sector SPA from a dedicated dynamic route", () => {
    const route = source("src", "app", "health", "os", "route.ts");
    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain("healthSpaHtml");
    expect(route).toContain("text/html; charset=utf-8");
    // Session-bearing, authorization-scoped content must not be cached.
    expect(route).toContain("no-store");
  });

  it("re-runs the full BEYU gate at the mount (deep link cannot bypass /health)", () => {
    const route = source("src", "app", "health", "os", "route.ts");
    // Both gates, in order, before the bundle is ever served.
    expect(route).toContain("resolvePrincipal");
    expect(route).toContain("checkHealthOSAuthorization");
    const gateIndex = Math.min(
      route.indexOf("resolvePrincipal"),
      route.indexOf("checkHealthOSAuthorization"),
    );
    expect(route.indexOf("healthSpaHtml") > gateIndex).toBe(true);
    // Unauthenticated → back to the sign-in surface; unauthorized/unavailable
    // → back to the truthful /health denial pages (307, no error page).
    expect(route).toMatch(/status: 307/);
    expect(route).toContain('Location: "/health"');
  });

  it("keeps the /health page gate and its truthful denial copy intact", () => {
    const page = source("src", "app", "health", "page.tsx");
    expect(page).toContain("resolvePrincipal");
    expect(page).toContain("checkHealthOSAuthorization");
    expect(page).toContain("This availability state does not prove");
    expect(page).toContain('name={unavailable ? "health" : "security"}');
    // The placeholder is gone: authorized users reach the real implementation.
    expect(page).not.toContain("Coming Soon");
    expect(page).toContain('redirect("/health/os")');
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
