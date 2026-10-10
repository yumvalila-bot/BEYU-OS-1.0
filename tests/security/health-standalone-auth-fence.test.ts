/**
 * Standalone Health authentication fence — static regression guard (audit C-2, decision D-3).
 *
 * The behaviour is proven by sectors/health/backend/src/modules/auth/standalone-auth.fence.spec.ts
 * (run in the Health backend suite). This file keeps the deployment surface honest from the root
 * repository: no route may reach the standalone backend, and the fence must stay wired into every
 * credential-issuing handler and into both production boot validators.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

describe("Health standalone credentials are fenced (C-2 / D-3)", () => {
  it("the sector deployment config proxies nothing to HEALTH_API_URL", () => {
    const vercel = JSON.parse(read("sectors", "health", "vercel.json")) as { rewrites: { source: string; destination: string }[] };
    expect(read("sectors", "health", "vercel.json")).not.toContain("HEALTH_API_URL");
    expect(vercel.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });

  it("the root application proxies nothing to a sector backend", () => {
    const config = read("next.config.ts");
    expect(config).not.toContain("HEALTH_API_URL");
    expect(config).not.toMatch(/async rewrites\s*\(/);
  });

  it("every credential-issuing handler calls the fence first", () => {
    const controller = read("sectors", "health", "backend", "src", "modules", "auth", "auth.controller.ts");
    for (const op of ["register", "login", "refresh", "restore"]) {
      const handler = controller.slice(controller.indexOf(`async ${op}(`));
      const firstStatements = handler.slice(0, handler.indexOf("\n  }") > 0 ? handler.indexOf("\n  }") : 800);
      expect(firstStatements, op).toContain(`assertStandaloneAuthPermitted("${op}")`);
      expect(firstStatements.indexOf("assertStandaloneAuthPermitted"), op).toBeLessThan(
        firstStatements.indexOf("this.authService."),
      );
    }
  });

  it("both production boot validators refuse the test-only flag", () => {
    const bootValidation = read("sectors", "health", "backend", "src", "common", "security", "boot-validation.ts");
    const productionGuard = read("sectors", "health", "backend", "src", "common", "config", "production-boot.guard.ts");
    expect(bootValidation).toContain("BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY");
    expect(productionGuard).toContain("BEYU_HEALTH_STANDALONE_AUTH_TEST_ONLY");
  });

  it("the fence module is strict: only the exact value 'true' lifts it, and never in production", () => {
    const fence = read("sectors", "health", "backend", "src", "modules", "auth", "standalone-auth.fence.ts");
    expect(fence).toContain('env[STANDALONE_AUTH_TEST_ONLY_ENV] === "true"');
    expect(fence).toContain('env.NODE_ENV === "production") return false');
  });
});
