import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../src/lib/constants";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import { BeyuNoeliaReadService } from "../../src/lib/noelia/read-services";

/**
 * API contract & integration completeness (Iteration 14).
 *
 * Permanent regression tests that fail if any route or tool registration
 * drifts from the governed contract:
 *
 *  - every v1 route (except the auth entry points) is wrapped in `guarded`
 *    with a catalog-registered permission;
 *  - every mutation route declares rate limiting + audit + a strict Zod
 *    input schema + idempotency where it writes;
 *  - no raw `new Response(` escapes the apiOk/apiError envelope helpers;
 *  - every role grant in the ROLE catalogue references a real permission
 *    (a typo would silently grant nothing);
 *  - every Noelia tool is registered, executable, permission-registered and
 *    bound to a read-service method that actually exists (no dead dispatcher
 *    references, no declared-but-unregistered capability).
 *
 * These are source/runtime structural checks — they run without a server and
 * complement the live-HTTP semantic suite (docs/audit/http-completeness.md).
 */

const V1_DIR = join(__dirname, "../../src/app/api/v1");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const ALL_ROUTES = routeFiles(V1_DIR);
const ROUTE_SOURCES = new Map(
  ALL_ROUTES.map((f) => [f.slice(V1_DIR.length + 1).replace(/route\.ts$/, "").replace(/\/+$/, ""), readFileSync(f, "utf8")]),
);

const SRC_ROOT = join(__dirname, "../../src");

function resolveModule(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC_ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [base + ".ts", base + ".tsx", join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Does `schemaName` have a `.strict()` binding — either defined in this file or
 * imported from a contract module where it is defined strict?
 */
function bindingText(src: string, schemaName: string): string | null {
  const start = src.search(new RegExp(`\\bconst ${schemaName}\\s*=`));
  if (start === -1) return null;
  const rest = src.slice(start);
  const nextBinding = rest.slice(1).search(/\n(?:const|export|function|async function)\s/);
  return nextBinding === -1 ? rest : rest.slice(0, nextBinding + 1);
}

/**
 * Does `schemaName` have a `.strict()` binding — either defined in this file or
 * imported from a contract module where it is defined strict?
 */
function schemaIsStrict(schemaName: string, src: string, file: string): boolean {
  const local = bindingText(src, schemaName);
  if (local) return /\.strict\(\)/.test(local);
  // imported: find the module and check the definition there
  const importMatch = src.match(new RegExp(`import\\s*\\{[^}]*\\b${schemaName}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`));
  if (!importMatch) return false;
  const mod = resolveModule(importMatch[1], file);
  if (!mod) return false;
  const binding = bindingText(readFileSync(mod, "utf8"), schemaName);
  return binding ? /\.strict\(\)/.test(binding) : false;
}

/** auth/login and auth/logout are the unauthenticated entry points. */
const UNAUTHENTICATED_ROUTES = new Set(["auth/login", "auth/logout"]);

const CATALOG = new Set(Object.keys(PERMISSIONS));

describe("v1 API route contract integrity", () => {
  it("enumerates the complete route inventory (no silent route loss)", () => {
    expect(ALL_ROUTES.length).toBe(14); // 15 API routes minus /api/health (lives outside v1)
  });

  for (const [rel, src] of ROUTE_SOURCES) {
    const isUnauthenticated = UNAUTHENTICATED_ROUTES.has(rel);

    it(`${rel}: governed boundary`, () => {
      if (isUnauthenticated) {
        // login carries its own IP-bound rate limit; logout is an idempotent no-op
        if (rel === "auth/login") {
          expect(src).toContain("rateLimit(");
        }
        return;
      }
      expect(src, `${rel} must be wrapped in guarded()`).toContain("guarded(");
    });

    it(`${rel}: permission is catalog-registered`, () => {
      if (isUnauthenticated) return;
      const perms = [...src.matchAll(/permission:\s*"([a-z0-9:.-]+)"/g)].map((m) => m[1]);
      expect(perms.length, `${rel} must declare a permission`).toBeGreaterThan(0);
      for (const p of perms) {
        expect(CATALOG.has(p), `permission "${p}" in ${rel} must exist in the PERMISSIONS catalogue`).toBe(true);
      }
    });

    it(`${rel}: mutations declare rate limit + audit`, () => {
      if (isUnauthenticated) return;
      const isPost = /export async function POST/.test(src);
      if (!isPost) return;
      expect(src, `${rel} (POST) must declare a rateLimit`).toContain("rateLimit:");
      expect(src, `${rel} (POST) must declare an audit config`).toContain("audit:");
    });

    it(`${rel}: client payloads validated by a strict Zod schema`, () => {
      const file = join(V1_DIR, rel, "route.ts");
      const schemas = new Set<string>();
      for (const m of src.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*Schema)\b/g)) schemas.add(m[1]);
      if (schemas.size === 0) return; // no client payload (e.g. logout)
      for (const name of schemas) {
        expect(
          schemaIsStrict(name, src, file),
          `${rel}: schema ${name} must be .strict() (forged fields must fail loudly)`,
        ).toBe(true);
      }
    });

    it(`${rel}: idempotency on governed writes`, () => {
      const governedWrites = new Set([
        "governance/resolutions",
        "governance/resolutions/[id]/table",
        "governance/resolutions/[id]/votes",
        "governance/resolutions/[id]/decision",
        "finance/capital/[id]/governance-authorization",
      ]);
      if (governedWrites.has(rel)) {
        expect(src, `${rel} must use withIdempotency`).toContain("withIdempotency");
      }
    });

    it(`${rel}: no raw Response escaping the envelope`, () => {
      expect(src, `${rel} must respond through apiOk/apiError`).not.toContain("new Response(");
    });
  }
});

describe("role catalogue integrity", () => {
  it("every permission granted by any role exists in the PERMISSIONS catalogue", () => {
    const src = readFileSync(join(__dirname, "../../src/lib/constants.ts"), "utf8");
    const granted = new Set([...src.matchAll(/"([a-z0-9]+:[a-z0-9.\-]+)"/g)].map((m) => m[1]));
    const missing = [...granted].filter((p) => !CATALOG.has(p));
    expect(missing, `grants not in catalogue: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("Noelia tool registration integrity", () => {
  it("every declared tool is registered and permission-registered", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const tools = registry.list();
    expect(tools.length).toBe(9);
    for (const tool of tools) {
      expect(tool.registered, `${tool.name} must be registered`).toBe(true);
      expect(CATALOG.has(tool.permission), `${tool.name} permission "${tool.permission}" must be catalog-registered`).toBe(true);
    }
  });

  it("every registration block binds an execute handler (no handler-less declaration)", () => {
    const src = readFileSync(join(__dirname, "../../src/lib/noelia/default-tools.ts"), "utf8");
    const registrations = (src.match(/registry\.register\(\{/g) ?? []).length;
    const executes = (src.match(/execute:\s*\(context/g) ?? []).length;
    expect(registrations).toBe(9);
    expect(executes, "each registry.register block must bind an execute handler").toBe(registrations);
  });

  it("no declared-but-unregistered capability: planner-visible tools are exactly the registered set", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const unregistered = registry.list().filter((t) => !t.registered);
    expect(unregistered.map((t) => t.name)).toEqual([]);
  });

  it("every tool is bound to an existing read-service method (no dead dispatcher)", () => {
    const services = new BeyuNoeliaReadService();
    const bound = [
      "treasury",
      "capitalPipeline",
      "latestWaterfall",
      "riskRegister",
      "compliance",
      "governance",
      "tax",
      "workforce",
      "knowledge",
    ] as const;
    for (const method of bound) {
      expect(typeof (services as unknown as Record<string, unknown>)[method], `BeyuNoeliaReadService.${method} must exist`).toBe("function");
    }
  });

  it("re-registration with a drifted declaration is rejected (single source of truth)", () => {
    const registry = createDefaultNoeliaToolRegistry();
    const first = registry.list()[0];
    const drifted = first.classification === "RESTRICTED" ? undefined : "RESTRICTED";
    expect(() =>
      registry.register({
        name: first.name,
        permission: first.permission,
        risk: first.risk,
        classification: drifted,
        description: "drifted re-registration",
        execute: () => {
          throw new Error("unreachable");
        },
      }),
    ).toThrow(/does not match its declaration/);
  });
});
