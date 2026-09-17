import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DELEGATABLE_PERMISSIONS,
  HIGH_RISK_PERMISSIONS,
  PERMISSIONS,
  ROLES,
} from "../../src/lib/constants";
import { CAPABILITY_IA } from "../../src/app/os/capabilities";

/**
 * ADMINISTRATIVE GOVERNANCE — ARCHITECTURAL INVARIANTS.
 *
 * Source-level pins proving the capability obeys the constitutional rules
 * that cannot be proven by execution alone: the frontend is never the
 * authority, every admin route is behind the canonical guard, no second
 * authorization engine exists, and the catalogue invariants hold.
 */

function source(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

function walk(dir: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("catalogue invariants of the administrative capability", () => {
  it("the three destructive/delegating permissions are HIGH-RISK with MFA step-up", () => {
    for (const code of ["identity:user.remove", "organization:tenant.remove", "identity:delegation.manage"]) {
      expect(HIGH_RISK_PERMISSIONS).toContain(code);
      expect(PERMISSIONS).toHaveProperty(code);
    }
  });

  it("the delegation capability is structurally non-delegable (chains have depth one)", () => {
    expect(ADMIN_DELEGATABLE_PERMISSIONS).not.toContain("identity:delegation.manage");
  });

  it("removal and delegation authorities are confined to the platform administrator", () => {
    for (const [code, role] of Object.entries(ROLES)) {
      for (const dangerous of ["identity:user.remove", "organization:tenant.remove", "identity:delegation.manage"] as const) {
        if (code !== "PLATFORM_ADMIN") {
          expect(role.permissions, `${code} must not hold ${dangerous}`).not.toContain(dangerous);
        }
      }
    }
    expect(ROLES.PLATFORM_ADMIN.permissions).toContain("identity:user.remove");
    expect(ROLES.PLATFORM_ADMIN.permissions).toContain("organization:tenant.remove");
    expect(ROLES.PLATFORM_ADMIN.permissions).toContain("identity:delegation.manage");
  });

  it("TENANT_MEMBER is a zero-capability membership marker, not authority", () => {
    expect(ROLES.TENANT_MEMBER.permissions).toEqual([]);
    expect(ROLES.TENANT_MEMBER.privileged).toBe(false);
  });
});

describe("API boundary — every admin route is behind the canonical guard", () => {
  const routes = walk("src/app/api/v1/admin");

  it("admin API routes exist", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it("every admin route uses guarded() with an explicit permission and action", () => {
    for (const file of routes) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("export async function")) continue;
      expect(text, `${file} must use guarded()`).toMatch(/guarded\(/);
      expect(text, `${file} must declare an action`).toMatch(/action:\s*"/);
    }
  });

  it("no admin route authorizes on a raw role string (the forbidden pattern)", () => {
    for (const file of routes) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must never authorize on role strings`).not.toMatch(
        /role\s*===\s*["'](admin|ADMIN|PLATFORM_ADMIN)["']/,
      );
      expect(text, `${file} must not import the privileged admin boundary`).not.toMatch(
        /from\s+["']@\/db\/admin["']/,
      );
      expect(text, `${file} must not write to the database`).not.toMatch(/\.(insert|update|delete)\(/);
    }
  });

  it("no admin route nor service bypasses RLS with an unrestricted client", () => {
    const service = source("src", "lib", "admin", "governance-service.ts");
    const delegation = source("src", "lib", "admin", "delegation.ts");
    for (const text of [service, delegation]) {
      expect(text).not.toMatch(/supabase|createAdminClient|service[-_]role/i);
    }
    // The ONLY privileged handle is the governed admin boundary, used solely
    // for role_assignments writes (F-01) — assert it is imported from there.
    expect(service).toMatch(/import\s*\{[^}]*adminDb[^}]*\}\s*from\s*["']@\/db\/admin["']/);
  });
});

describe("UI boundary — the frontend is never the authority", () => {
  const pages = [
    "src/app/os/administration/page.tsx",
    "src/app/os/administration/tenants/page.tsx",
    "src/app/os/administration/memberships/page.tsx",
    "src/app/os/administration/roles/page.tsx",
    "src/app/os/administration/delegations/page.tsx",
    "src/app/os/administration/audit/page.tsx",
  ];

  it("every administration page re-authorizes on deep link via requireAccess", () => {
    for (const page of pages) {
      const text = source(...page.split("/"));
      expect(text, `${page} must guard with requireAccess`).toMatch(/requireAccess\(/);
    }
  });

  it("administration pages NEVER write to the database (reads only; mutations go through the guarded API)", () => {
    for (const page of pages) {
      const text = source(...page.split("/"));
      expect(text, `${page} must not write`).not.toMatch(/\.(insert|update|delete)\(/);
    }
  });

  it("client action components only POST to the guarded API and refresh from the server", () => {
    const actions = [
      "src/app/os/administration/user-actions.tsx",
      "src/app/os/administration/tenant-actions.tsx",
      "src/app/os/administration/governance-actions.tsx",
    ];
    for (const file of actions) {
      const text = source(...file.split("/"));
      expect(text).toMatch(/["`]\/api\/v1\/admin\//);
      expect(text).toMatch(/fetch\(/);
      expect(text).toMatch(/router\.refresh\(\)/);
      // No optimistic local state appends: the server re-read is the truth.
      expect(text).not.toMatch(/localStorage/);
    }
  });

  it("the Settings page still never writes to the database", () => {
    const settings = source("src", "app", "os", "settings", "page.tsx");
    expect(settings).not.toMatch(/insert\(|update\(|delete\(/);
  });
});

describe("navigation invariants", () => {
  it("the Administration group is permission-gated, never open", () => {
    const group = CAPABILITY_IA.find((g) => g.id === "administration");
    expect(group).toBeTruthy();
    for (const item of group!.items) {
      expect(item.visibility.kind).toBe("permission");
      expect(item.label.endsWith(" OS")).toBe(false);
    }
  });
});
