/**
 * Foundation API target-scope enforcement — source-level endpoint audit.
 *
 * A green behavioural suite only proves the endpoints that were EXERCISED. This
 * audit walks the repository and proves the boundary is structural:
 *
 *   1. every Foundation API route is behind the canonical `guarded()` boundary
 *      with a declared `foundation:*` capability,
 *   2. every exported route handler is actually wrapped (no handler can be added
 *      beside the wrapper),
 *   3. the guard itself resolves the canonical Foundation target scope for
 *      `foundation:*` permissions, so a new endpoint inherits the boundary,
 *   4. no Foundation route or domain module derives a tenant/scope from client
 *      input,
 *   5. Foundation domain services no longer scope queries by the principal's
 *      broad tenant subtree or by the principal's own tenant, and
 *   6. the UI deep-link protection is still present and unchanged in intent.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const source = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

function filesBelow(root: string, name: string): string[] {
  const output: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry === name) output.push(path);
    }
  };
  walk(root);
  return output;
}

const foundationRoutes = filesBelow(join(ROOT, "src/app/api/v1/foundation"), "route.ts");
const rel = (path: string) => relative(ROOT, path).replaceAll("\\", "/");

const foundationDomainModules = readdirSync(join(ROOT, "src/lib/foundation"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `src/lib/foundation/${name}`);

describe("Foundation API target-scope structure", () => {
  it("covers every Foundation route file in the repository", () => {
    // Guard against the audit silently passing on an empty or moved directory.
    // 39 route files cover every Foundation dataset: formation, structure,
    // governance, tax, compliance, donors, funds, grants, programs, projects,
    // beneficiaries, procurement, assets, investments, safeguarding, impact,
    // workforce assignments and reporting.
    expect(foundationRoutes.length).toBeGreaterThanOrEqual(39);
  });

  it("places every Foundation route behind guarded() with a declared foundation capability", () => {
    for (const path of foundationRoutes) {
      const file = rel(path);
      const text = source(...file.split("/"));
      expect(text, `${file} must use the canonical guarded() boundary`).toContain("return guarded(");
      expect(text, `${file} must reference a foundation:* capability`).toMatch(/"foundation:[a-z.]+"/);
      // Every guarded() option block declares its capability: either a literal
      // foundation capability, or a variable (`permission`) whose only values are
      // foundation capabilities — the pattern `/reports` uses for its type map.
      for (const match of text.matchAll(/permission:\s*([^,\n]+)/g)) {
        const value = match[1].trim();
        expect(
          value.startsWith('"foundation:') || /^[A-Za-z_$][\w$]*$/.test(value),
          `${file}: permission '${value}' must be a foundation capability or a foundation-only variable`,
        ).toBe(true);
      }
      for (const literal of text.matchAll(/"permission:\s*["']?([a-z]+:[a-z.]+)"/g)) {
        expect(literal[1].startsWith("foundation:"), `${file}: non-Foundation capability ${literal[1]}`).toBe(true);
      }
      // One `guarded(` per exported handler: a handler added outside the wrapper
      // (e.g. returning NextResponse.json directly) would fail here.
      const handlers = (text.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? []).length;
      const guarded = (text.match(/return guarded\(/g) ?? []).length;
      expect(guarded, `${file}: ${handlers} handler(s) but ${guarded} guarded() call(s)`).toBe(handlers);
      expect(handlers, `${file} must export at least one handler`).toBeGreaterThan(0);
    }
  });

  it("enforces the canonical Foundation target scope inside the guard for every foundation:* permission", () => {
    const api = source("src", "lib", "api.ts");
    expect(api).toContain('import { foundationTargetScopeDenial } from "./foundation/target-scope"');
    expect(api).toContain('options.permission.startsWith("foundation:")');
    expect(api).toContain("await foundationTargetScopeDenial(principal)");
    // The denial must be part of the same audited denial branch as RBAC/ABAC.
    expect(api).toMatch(/scopeReason \|\| sectorTargetReason \|\| !decision\.allowed/);
  });

  it("resolves the Foundation boundary from the canonical Sector OS resolver, not a second model", () => {
    const targetScope = source("src", "lib", "foundation", "target-scope.ts");
    expect(targetScope).toContain('from "@/lib/operating-systems"');
    expect(targetScope).toContain("resolveOperatingSystemTenant");
    expect(targetScope).toContain('FOUNDATION_TARGET_TENANT_CODE = "BEYU-FOUNDATION"');
    // No client input can enter the resolver: it takes the principal only.
    expect(targetScope).toMatch(/resolveFoundationTargetScope\(\s*principal: Principal,?\s*\)/);
    const operatingSystems = source("src", "lib", "operating-systems.ts");
    expect(operatingSystems).toContain("export async function operatingSystemTenantInScope");
    expect(operatingSystems).toContain("export async function resolveOperatingSystemTenant");
  });

  it("never sources a tenant or scope from client input in Foundation routes", () => {
    // The route layer is the client boundary. Query/body parameters may select
    // WHICH record is requested (`type`, `foundationId`, ids in the path), but no
    // Foundation route may read a tenant or scope from the request: the scope is
    // resolved from the authenticated principal by guarded() and the domain
    // services. (Domain modules legitimately carry an internal `tenantId` inside
    // their own audit/event input types; those values are derived from
    // authorised rows, never from the request.)
    const forbidden = [
      'searchParams.get("tenantId")',
      'searchParams.get("tenant")',
      'params.get("tenantId")',
      'nextUrl.searchParams.get("tenantId")',
      'headers.get("x-tenant',
      "body.tenantId",
      "payload.tenantId",
      "request.tenantId",
    ];
    for (const file of foundationRoutes.map(rel)) {
      const text = source(...file.split("/"));
      for (const pattern of forbidden) {
        expect(text.includes(pattern), `${file} must not derive scope from client input (${pattern})`).toBe(false);
      }
    }
  });

  it("constrains Foundation domain queries to the resolved target scope", () => {
    for (const file of foundationDomainModules) {
      // target-scope.ts states the boundary itself; finance-bridge.ts surfaces
      // FINANCE-owned rows and is asserted separately below. Every other module
      // — including the Foundation AI surface (noelia-service.ts) — must scope
      // Foundation rows by the resolved target, never by the tenant subtree or
      // the caller's own tenant.
      if (file.endsWith("target-scope.ts") || file.endsWith("finance-bridge.ts")) {
        continue;
      }
      const text = source(...file.split("/"));
      // The principal's broad tenant subtree and the principal's own tenant are
      // no longer Foundation read/write scope.
      expect(text.includes("tenantScopeIds("), `${file} must not scope Foundation rows by the tenant subtree`).toBe(
        false,
      );
      expect(text.includes("principal.tenantId"), `${file} must not use the caller's tenant as Foundation scope`).toBe(
        false,
      );
    }
    const service = source("src", "lib", "foundation", "service.ts");
    expect(service).toContain("export async function foundationTargetTenantId");
    expect(service).toContain("export async function foundationScopeIds");
    expect(service).toContain('throw new FoundationError("FORBIDDEN", resolution.reason)');
  });

  it("keeps the documented cross-domain Finance exception explicit and gated", () => {
    // finance-bridge surfaces FINANCE-owned capital requests and journal entries.
    // Its rows stay inside the principal's resolved tenant scope, but only after
    // the canonical Foundation target gate has passed.
    const bridge = source("src", "lib", "foundation", "finance-bridge.ts");
    expect(bridge).toContain("await foundationTargetTenantId(principal)");
    expect(bridge).toContain("await foundationTargetTenantId(ctx.principal)");
    // Foundation-owned fund rows use the resolved target scope...
    expect(bridge).toContain("await foundationScopeIds(principal)");
    // ...while the FINANCE-owned capital requests / journal entries keep the
    // principal's resolved tenant scope, and are only reachable after the gate.
    expect(bridge.split("tenantScopeIds(").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("enforces the canonical Foundation target scope on the Foundation page boundary too", () => {
    // The page boundary is the second caller of the SAME boundary: requireAccess
    // refuses a foundation:* page when the canonical Foundation target cannot be
    // placed, before the page loads a single Foundation row.
    const guard = source("src", "lib", "guard.ts");
    expect(guard).toContain('import { foundationTargetScopeDenial } from "./foundation/target-scope"');
    expect(guard).toContain('permission.startsWith("foundation:")');
    expect(guard).toContain("await foundationTargetScopeDenial(principal)");
    expect(guard).toContain("if (reason) return { principal, allowed: false, reason }");
  });

  it("holds the Foundation AI surface to the same canonical target scope", () => {
    // /api/v1/ai/noelia/* exposes Foundation aggregates through registered
    // foundation:* tools, so it reads Foundation rows and is held to the same
    // boundary: it must resolve the canonical target and refuse outright (no
    // rows, no aggregates) when the boundary cannot place the principal.
    const service = source("src", "lib", "foundation", "noelia-service.ts");
    expect(service).toContain('import { resolveFoundationTargetScope } from "./target-scope"');
    expect(service).toContain("async function authorizedFoundationTenant(");
    // Every data-reading tool refuses before it queries...
    expect(service.split("if (!tenantId) return { findings: [] };").length - 1).toBeGreaterThanOrEqual(4);
    // ...and every Foundation table read is pinned to the resolved target tenant.
    expect(service.split("eq(").length - 1).toBeGreaterThanOrEqual(6);
    expect(service.includes("context.scope.tenantIds")).toBe(false);
  });

  it("leaves the Foundation UI deep-link protection in place and unchanged", () => {
    const layout = source("src", "app", "os", "foundation", "layout.tsx");
    expect(layout).toContain("operatingSystemTenantInScope");
    expect(layout).toContain('"BEYU-FOUNDATION"');
    expect(layout).toContain("entityScope.length > 0");
    expect(layout).toContain("tenant-wide reads are refused");
    expect(layout).toContain("requirePrincipal()");
  });
});
