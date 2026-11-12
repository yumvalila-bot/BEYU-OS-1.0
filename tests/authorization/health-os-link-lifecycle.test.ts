/**
 * Health identity authority regression.
 *
 * BEYU must not connect to or query Health's private identity schema. Health
 * owns link lifecycle, local accounts, tenant mapping and membership; BEYU
 * issues a signed assertion and Health verifies it locally.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkHealthOSAuthorization } from "@/lib/health-os-authorization";

describe("BEYU no longer authorizes Health by cross-database lookup", () => {
  it("legacy compatibility helper fails closed and never claims a local grant", async () => {
    await expect(checkHealthOSAuthorization("BEYU-USER-1")).resolves.toEqual({
      authorized: false,
      reason: "AUTHORIZATION_SERVICE_UNAVAILABLE",
    });
  });

  it("contains no database table definition or query path to the Health schema", () => {
    const src = readFileSync(join(process.cwd(), "src", "lib", "health-os-authorization.ts"), "utf8");
    expect(src).not.toMatch(/@\/db|drizzle-orm|pgSchema|beyu_identity_links|select\(/);
  });

  it("issues a signed BEYU assertion through a same-origin server endpoint", () => {
    const route = readFileSync(
      join(process.cwd(), "src", "app", "api", "v1", "health", "authorization-assertion", "route.ts"),
      "utf8",
    );
    expect(route).toContain("resolvePrincipal()");
    expect(route).toContain("signHealthAuthorizationAssertion(principal)");
    expect(route).toContain('request.headers.get("origin")');
    expect(route).toContain("Cache-Control");
  });
});
