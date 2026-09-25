/**
 * Governed BEYU Admin Frontend Preview — mandated authorization proofs.
 *
 * The current BEYU administrator (the bootstrap-bound canonical
 * PLATFORM_ADMIN identity) must be able to preview and develop the six
 * canonical frontend surfaces — Health OS, Finance OS, Agriculture OS,
 * Ujenzi OS, Foundation OS and the Family Office capability surface —
 * WITHOUT weakening any existing authorization boundary. This suite pins
 * the 14 mandated proofs:
 *
 *   1.  Unauthenticated users cannot access any of the six surfaces.
 *   2.  Unauthorized authenticated users cannot access any surface.
 *   3.  The current authorized BEYU admin can preview all six surfaces.
 *   4.  Preview access does not grant additional database permissions
 *       (read-only grants only; no emergency/delegation grants exist).
 *   5.  Preview access does not bypass RLS / the classification ceiling
 *       (the admin's RESTRICTED ceiling still hides HIGHLY_RESTRICTED data).
 *   6.  Preview access does not bypass tenant isolation.
 *   7.  Preview access does not bypass entity/country authorization.
 *   8.  Client-side URL manipulation cannot elevate privileges.
 *   9.  Service-role credentials never reach the browser.
 *   10. Existing deep-link authorization remains enforced.
 *   11. Shared capabilities remain canonical (one implementation each).
 *   12. Family Office does not become FAMILY_OFFICE_OS.
 *   13. Tax remains a shared capability.
 *   14. HCM remains a shared capability.
 *
 * Pure and source-gate tests run without a server; DB tests run against the
 * canonical test database; HTTP tests follow the repository convention
 * (skip when no server, hard-fail when one was explicitly configured).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  adminBootstrapState,
  familyMembers,
  tenants,
  users,
} from "@/db/schema";
import { fixedId, ID_PREFIX } from "@/lib/ids";
import {
  activeDelegatedPermissions,
  activeEmergencyPermissions,
  can,
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "@/lib/authz";
import { ADMIN_DELEGATABLE_PERMISSIONS } from "@/lib/admin/delegation";
import { HIGH_RISK_PERMISSIONS, PERMISSIONS, ROLES } from "@/lib/constants";
import {
  BEYU_CONTROL_PLANE,
  FINANCE_OS_READ_PERMISSIONS,
  FOUNDATION_OS_READ_PERMISSIONS,
  SECTOR_OPERATING_SYSTEMS,
  UJENZI_OS_READ_PERMISSIONS,
} from "@/lib/operating-systems";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { CAPABILITY_IA } from "@/app/os/capabilities";
import { NOELIA_CANONICAL_ID } from "@/lib/noelia/canonical-identity";
import { apiGet, isDeniedPage, login, serverAvailable } from "../helpers/http";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");

/**
 * Source text with comments removed — these gates assert what the CODE does,
 * so a doc comment explaining a module never reads the URL must not be
 * mistaken for the module reading it (nor may a comment satisfy an
 * assertion).
 */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const available = await serverAvailable();

/**
 * The six canonical frontend surfaces. Five are Sector OSs in the canonical
 * registry; the sixth is the Family Office capability/domain surface (a BEYU
 * capability — never an OS).
 */
const SIX_SURFACES = [
  { name: "Health OS", href: "/os/health" },
  { name: "Finance OS", href: "/os/finance" },
  { name: "Agriculture OS", href: "/os/agriculture" },
  { name: "Ujenzi OS", href: "/os/ujenzi" },
  { name: "Foundation OS", href: "/os/foundation" },
  { name: "Family Office", href: "/os/family" },
] as const;

/** The one canonical BEYU administrator identity (fixed GlobalUserID). */
const CANONICAL_ADMIN_USER_ID = fixedId(ID_PREFIX.user, "PLATFORM_ADMIN");

/**
 * Cached logins: one HTTP login per identity per run. Re-logging in as the
 * same identity inside one 30 s TOTP window yields the same one-time code and
 * is rejected as a replay (the helper then waits 31 s); a cached session
 * cookie is a valid server session for the whole run.
 */
const sessions = new Map<string, Promise<string>>();
function loginOnce(email: string): Promise<string> {
  let pending = sessions.get(email);
  if (!pending) {
    pending = login(email);
    sessions.set(email, pending);
  }
  return pending;
}

/* ------------------------------------------------------------------ */
/* 1+3. Admin identity resolution and preview capability               */
/* ------------------------------------------------------------------ */

describe("the current BEYU admin identity and the preview capability", () => {
  it("the canonical admin is the bootstrap-bound identity (not an email address)", async () => {
    const [state] = await db
      .select({ adminUserId: adminBootstrapState.adminUserId })
      .from(adminBootstrapState)
      .where(eq(adminBootstrapState.id, "SINGLETON"))
      .limit(1);
    expect(state, "bootstrap state row must exist in the seeded database").toBeTruthy();
    expect(state?.adminUserId).toBe(CANONICAL_ADMIN_USER_ID);
    // The bound identity is a real user with the PLATFORM_ADMIN grant.
    const [user] = await db.select().from(users).where(eq(users.id, CANONICAL_ADMIN_USER_ID)).limit(1);
    expect(user).toBeTruthy();
    const grants = await loadGrants(CANONICAL_ADMIN_USER_ID, user?.primaryTenantId ?? "");
    expect(new Set(grants.map((g) => g.code))).toContain("PLATFORM_ADMIN");
  });

  it("the preview capability is held by exactly one role: the canonical admin's", () => {
    const holders = Object.entries(ROLES).filter(
      ([, role]) => role.permissions.includes("platform:frontend.preview"),
    );
    expect(holders.map(([code]) => code)).toEqual(["PLATFORM_ADMIN"]);
  });

  it("the preview capability is catalogued, not high-risk and not delegable", () => {
    expect(PERMISSIONS).toHaveProperty("platform:frontend.preview");
    // Presentation capability: it is never a step-up-gated high-risk act and
    // it is outside the closed delegable set, so it cannot be delegated away
    // from the canonical administrator.
    expect(HIGH_RISK_PERMISSIONS as readonly string[]).not.toContain("platform:frontend.preview");
    expect(ADMIN_DELEGATABLE_PERMISSIONS as readonly string[]).not.toContain("platform:frontend.preview");
  });

  it("a principal without the role holds the preview capability nowhere", () => {
    const permissionless: Principal = {
      userId: "USR_TEST",
      partyId: "PTY_TEST",
      email: "test@beyu.os",
      displayName: "Test Principal",
      tenantId: "TEN_TEST",
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: ["TENANT_MEMBER"],
      permissions: permissionsForRoles(["TENANT_MEMBER"]),
      clearance: clearanceForRoles(["TENANT_MEMBER"]),
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "SES_TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    expect(can(permissionless, "platform:frontend.preview").allowed).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 3+4. The admin's preview grants: every surface's READ side, nothing  */
/* more — read-only by construction                                     */
/* ------------------------------------------------------------------ */

describe("the preview grants are the read side of the six surfaces only", () => {
  const adminPermissions = ROLES.PLATFORM_ADMIN.permissions;

  it("covers the full read side of Finance OS", () => {
    for (const permission of FINANCE_OS_READ_PERMISSIONS) {
      expect(adminPermissions, `Finance OS read side missing ${permission}`).toContain(permission);
    }
  });

  it("covers the read side of Agriculture, Ujenzi, Foundation and Family Office", () => {
    for (const permission of UJENZI_OS_READ_PERMISSIONS) {
      expect(adminPermissions).toContain(permission);
    }
    expect(adminPermissions).toContain("agriculture:data.read");
    for (const permission of FOUNDATION_OS_READ_PERMISSIONS) {
      expect(adminPermissions, `Foundation read side missing ${permission}`).toContain(permission);
    }
    for (const permission of [
      "family:member.read",
      "family:beneficiary.read",
      "family:vault.read",
      "familyoffice:capital.read",
      "familyoffice:protection.read",
    ]) {
      expect(adminPermissions, `Family Office read side missing ${permission}`).toContain(permission);
    }
    // Noelia is the single governed AI identity shared by every surface.
    expect(adminPermissions).toContain("ai:noelia.query");
  });

  it("holds NO write/manage/post/approve capability of any of the six surfaces", () => {
    const namespaces = ["finance:", "agriculture:", "ujenzi:", "foundation:", "family:", "familyoffice:"];
    const writeSide = (Object.keys(PERMISSIONS) as string[]).filter(
      (code) =>
        namespaces.some((ns) => code.startsWith(ns)) && !code.endsWith(".read"),
    );
    expect(writeSide.length).toBeGreaterThan(0); // sanity: the catalogue has a write side
    const heldWrite = writeSide.filter((code) =>
      (adminPermissions as readonly string[]).includes(code),
    );
    expect(heldWrite, "preview access must add no write capability").toEqual([]);
  });

  it("cannot post, approve or commit anything through the preview (CAP_POSTING stays LOCKED)", async () => {
    const [user] = await db.select().from(users).where(eq(users.id, CANONICAL_ADMIN_USER_ID)).limit(1);
    const grants = await loadGrants(CANONICAL_ADMIN_USER_ID, user?.primaryTenantId ?? "");
    const principal: Principal = {
      userId: CANONICAL_ADMIN_USER_ID,
      partyId: user?.partyId ?? "PTY_TEST",
      email: user?.email ?? "admin@beyu.os",
      displayName: "Canonical Admin",
      tenantId: user?.primaryTenantId ?? "TEN_TEST",
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: [...new Set(grants.map((g) => g.code))],
      permissions: permissionsForRoles([...new Set(grants.map((g) => g.code))]),
      clearance: clearanceForRoles([...new Set(grants.map((g) => g.code))]),
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "SES_TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    expect(can(principal, "finance:ledger.post").allowed).toBe(false);
    expect(can(principal, "finance:waterfall.commit").allowed).toBe(false);
    expect(can(principal, "foundation:grant.approve").allowed).toBe(false);
  });

  it("the database holds no emergency or delegation grants for the admin (nothing added behind the role)", async () => {
    expect(await activeEmergencyPermissions(CANONICAL_ADMIN_USER_ID, fixedId(ID_PREFIX.tenant, "BEYU_GROUP"))).toEqual([]);
    expect(await activeDelegatedPermissions(CANONICAL_ADMIN_USER_ID)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 1+2+10. The six surfaces re-run server-side authorization on every   */
/* entry; unauthenticated and unauthorized principals stay out          */
/* ------------------------------------------------------------------ */

describe("the six surfaces keep their server-side entry guards", () => {
  it("every surface entry point re-resolves the principal before any content", () => {
    // Health OS: the ONE governed mount (session + federation gate) serves the
    // canonical route and its legacy alias.
    const mount = source("src", "app", "os", "health", "mount.ts");
    const gateIndex = Math.min(mount.indexOf("resolvePrincipal"), mount.indexOf("checkHealthOSAuthorization"));
    expect(gateIndex).toBeGreaterThan(-1);
    expect(mount.indexOf("healthSpaHtml") > gateIndex).toBe(true);

    // Finance OS: the page's own ledger capability gate.
    expect(source("src", "app", "os", "finance", "page.tsx")).toContain('requireAccess("finance:ledger.read")');
    // Agriculture / Ujenzi / Foundation: the canonical Sector OS tenant scope
    // guard in the layout + the page capability gate.
    for (const sector of ["agriculture", "ujenzi", "foundation"]) {
      expect(source("src", "app", "os", sector, "layout.tsx")).toContain("operatingSystemTenantInScope");
      expect(source("src", "app", "os", sector, "layout.tsx")).toContain("requirePrincipal");
    }
    expect(source("src", "app", "os", "agriculture", "page.tsx")).toContain('requireAccess("agriculture:data.read")');
    expect(source("src", "app", "os", "ujenzi", "page.tsx")).toContain('requireAccess("ujenzi:data.read")');
    // Family Office: the capability surface's own gate.
    expect(source("src", "app", "os", "family", "page.tsx")).toContain('requireAccess("family:member.read")');
    // The control-plane layout itself refuses principals with no grant.
    expect(source("src", "app", "os", "layout.tsx")).toContain("checkBeyuOSAuthorization");
  });

  it("no surface entry point reads URL search params for authorization", () => {
    const entryFiles = [
      source("src", "app", "os", "health", "mount.ts"),
      source("src", "app", "os", "health", "route.ts"),
      source("src", "app", "os", "finance", "page.tsx"),
      source("src", "app", "os", "agriculture", "layout.tsx"),
      source("src", "app", "os", "agriculture", "page.tsx"),
      source("src", "app", "os", "ujenzi", "layout.tsx"),
      source("src", "app", "os", "ujenzi", "page.tsx"),
      source("src", "app", "os", "foundation", "layout.tsx"),
      source("src", "app", "os", "family", "page.tsx"),
    ];
    for (const text of entryFiles) {
      expect(code(text)).not.toMatch(/searchParams|useSearchParams|URLSearchParams|request\.url/i);
    }
  });

  it.skipIf(!available)(
    "an unauthenticated request to any of the six surfaces never reaches sector content",
    async () => {
      for (const surface of SIX_SURFACES) {
        const res = await apiGet(surface.href, null);
        expect([307, 200], `${surface.href} unauthenticated`).toContain(res.status);
        // The OS shell must never render for an anonymous request.
        expect(res.html, `${surface.href} must not leak the OS shell`).not.toContain('id="beyu-main"');
        expect(res.html, `${surface.href} must resolve to sign-in or the truthful denial`
        ).toMatch(/BEYU OS|Sign in|sign in|Health OS access denied|Health OS authorization unavailable/i);
      }
    },
    180_000,
  );

  it.skipIf(!available)(
    "an unauthorized authenticated user cannot open any surface — including by typing the URL",
    async () => {
      // HCM_DIRECTOR holds no sector grant: the direct URLs must produce the
      // governed denial, never the module.
      const hcm = await loginOnce("hcm@beyu.os");
      for (const surface of SIX_SURFACES.filter((s) => s.name !== "Health OS")) {
        const res = await apiGet(surface.href, hcm);
        expect(res.status, `${surface.href}`).toBe(200);
        expect(isDeniedPage(res.html), `${surface.href} must render the governed denial panel`).toBe(true);
      }
      // Health fails closed to the truthful federation state page.
      const health = await apiGet("/os/health", hcm);
      expect(health.status).toBe(200);
      expect(health.html).toMatch(/Health OS (access denied|authorization unavailable)/i);
    },
    300_000,
  );

  it.skipIf(!available)(
    "client-side URL manipulation (?admin=true, ?preview=true, ?role=..., ?tenant=...) cannot elevate privileges",
    async () => {
      const hcm = await loginOnce("hcm@beyu.os");
      const poisoned = [
        "/os/ujenzi?admin=true&preview=true&role=admin&tenant=TEN_BEYU_AGRI",
        "/os/finance?role=admin&bypass-auth=true",
        "/os/foundation?tenant=TEN_BEYU_GROUP&role=GROUP_CEO",
        "/os/family?admin=true",
      ];
      for (const url of poisoned) {
        const res = await apiGet(url, hcm);
        expect(res.status, url).toBe(200);
        expect(isDeniedPage(res.html), `${url} must stay denied`).toBe(true);
      }
    },
    300_000,
  );
});

/* ------------------------------------------------------------------ */
/* 3. The current admin previews all six surfaces                       */
/* ------------------------------------------------------------------ */

describe("the current BEYU admin previews all six frontend surfaces", () => {
  it("the launcher advertises the six surfaces to the preview holder only", () => {
    const launcher = source("src", "app", "launcher", "page.tsx");
    // The section is gated by the governed capability, never by a URL input.
    expect(code(launcher)).toContain('can(principal, "platform:frontend.preview")');
    // Sector surfaces come from the canonical registry; the sixth surface is
    // the existing canonical Family Office capability route.
    expect(launcher).toContain("SECTOR_OPERATING_SYSTEMS");
    expect(launcher).toContain('href: "/os/family"');
    expect(launcher).toContain("The six canonical frontend surfaces");
    expect(launcher).toContain("BEYU Admin — Frontend Preview");
  });

  it.skipIf(!available)(
    "the admin's OS shell renders the Frontend Preview marker",
    async () => {
      const admin = await loginOnce("admin@beyu.os");
      const shell = await apiGet("/os", admin);
      expect(shell.status).toBe(200);
      expect(shell.html).toContain("BEYU Admin — Frontend Preview");
    },
    120_000,
  );

  it.skipIf(!available)(
    "the admin's launcher lists all six surfaces with their governed state",
    async () => {
      const admin = await loginOnce("admin@beyu.os");
      const launcher = await apiGet("/launcher", admin);
      expect(launcher.status).toBe(200);
      expect(launcher.html).toContain("BEYU Admin — Frontend Preview");
      for (const surface of SIX_SURFACES) {
        expect(launcher.html, `launcher must list ${surface.name}`).toContain(surface.href);
      }
    },
    120_000,
  );

  it.skipIf(!available)(
    "an ordinary user's launcher and shell never show the preview section or marker",
    async () => {
      const hcm = await loginOnce("hcm@beyu.os");
      const launcher = await apiGet("/launcher", hcm);
      expect(launcher.status).toBe(200);
      expect(launcher.html).not.toContain("The six canonical frontend surfaces");
      const shell = await apiGet("/os", hcm);
      expect(shell.status).toBe(200);
      expect(shell.html).not.toContain("BEYU Admin — Frontend Preview");
    },
    120_000,
  );

  it.skipIf(!available)(
    "the admin opens the actual frontend of every governed surface (never the denial panel)",
    async () => {
      const admin = await loginOnce("admin@beyu.os");
      const governed: Array<[string, RegExp]> = [
        ["/os/finance", /Finance OS/i],
        ["/os/agriculture", /Agriculture OS/i],
        ["/os/ujenzi", /Ujenzi/i],
        ["/os/foundation", /Foundation/i],
        ["/os/family", /Family/i],
      ];
      for (const [href, content] of governed) {
        const res = await apiGet(href, admin);
        expect(res.status, href).toBe(200);
        expect(isDeniedPage(res.html), `${href} must not render the denial panel for the admin`).toBe(false);
        expect(res.html, `${href} must render the actual surface`).toMatch(content);
      }
      // Health OS: the canonical federation state. Without the sector
      // federation service the mount fails closed to the truthful /health
      // state surface; with it, the sector SPA is served. Either way the
      // admin never sees sign-in, an error page or another OS's payload.
      const health = await apiGet("/os/health", admin);
      expect(health.status).toBe(200);
      expect(health.html).toMatch(/Health OS/i);
      expect(isDeniedPage(health.html)).toBe(false);
      expect(health.html).not.toContain('id="beyu-main"');
    },
    420_000,
  );
});

/* ------------------------------------------------------------------ */
/* 5+6+7. The preview does not widen any data boundary                  */
/* ------------------------------------------------------------------ */

describe("preview access does not widen the data boundaries", () => {
  it("the classification ceiling still hides HIGHLY_RESTRICTED family data from the admin", async () => {
    const [user] = await db.select().from(users).where(eq(users.id, CANONICAL_ADMIN_USER_ID)).limit(1);
    const grants = await loadGrants(CANONICAL_ADMIN_USER_ID, user?.primaryTenantId ?? "");
    const roleCodes = [...new Set(grants.map((g) => g.code))];
    const adminPrincipal: Principal = {
      userId: CANONICAL_ADMIN_USER_ID,
      partyId: user?.partyId ?? "PTY_TEST",
      email: user?.email ?? "admin@beyu.os",
      displayName: "Canonical Admin",
      tenantId: user?.primaryTenantId ?? "TEN_TEST",
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: roleCodes,
      permissions: permissionsForRoles(roleCodes),
      clearance: clearanceForRoles(roleCodes),
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "SES_TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    // The seeded family registry is HIGHLY_RESTRICTED by schema default and
    // the admin's role ceiling is RESTRICTED: the Family Office frontend the
    // admin previews must therefore show the canonical empty state, never the
    // family data.
    expect(classificationsAtOrBelow(adminPrincipal.clearance)).not.toContain("HIGHLY_RESTRICTED");
    const scope = await tenantScopeIds(adminPrincipal);
    const visibleToAdmin = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          inArray(familyMembers.tenantId, scope),
          inArray(familyMembers.classification, classificationsAtOrBelow(adminPrincipal.clearance)),
        ),
      );
    expect(visibleToAdmin, "the RESTRICTED-cleared admin must see no HIGHLY_RESTRICTED family rows").toEqual([]);

    // A HIGHLY_RESTRICTED principal with the same grant DOES see the rows —
    // proving the difference is the ceiling, not a broken preview.
    const [ceo] = await db.select().from(users).where(eq(users.email, "ceo@beyu.os")).limit(1);
    const ceoGrants = await loadGrants(ceo.id, ceo.primaryTenantId);
    const ceoCodes = [...new Set(ceoGrants.map((g) => g.code))];
    const ceoPrincipal: Principal = {
      userId: ceo.id,
      partyId: ceo.partyId,
      email: ceo.email,
      displayName: "CEO",
      tenantId: ceo.primaryTenantId,
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: ceoCodes,
      permissions: permissionsForRoles(ceoCodes),
      clearance: clearanceForRoles(ceoCodes),
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "SES_TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    const visibleToCeo = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          inArray(familyMembers.tenantId, scope),
          inArray(familyMembers.classification, classificationsAtOrBelow(ceoPrincipal.clearance)),
        ),
      );
    expect(visibleToCeo.length, "the seeded family registry exists for a cleared principal").toBeGreaterThan(0);
  });

  it("tenant isolation: the admin's resolved scope is the canonical enterprise subtree, applied to every preview query", async () => {
    const [user] = await db.select().from(users).where(eq(users.id, CANONICAL_ADMIN_USER_ID)).limit(1);
    const grants = await loadGrants(CANONICAL_ADMIN_USER_ID, user?.primaryTenantId ?? "");
    const roleCodes = [...new Set(grants.map((g) => g.code))];
    const adminPrincipal: Principal = {
      userId: CANONICAL_ADMIN_USER_ID,
      partyId: user?.partyId ?? "PTY_TEST",
      email: user?.email ?? "admin@beyu.os",
      displayName: "Canonical Admin",
      tenantId: user?.primaryTenantId ?? "TEN_TEST",
      tenantCode: "BEYU-GROUP",
      tenantType: "ENTERPRISE",
      roles: roleCodes,
      permissions: permissionsForRoles(roleCodes),
      clearance: clearanceForRoles(roleCodes),
      entityScope: [],
      mfaSatisfied: true,
      sessionId: "SES_TEST",
      riskScore: 0,
      emergencyPermissions: [],
    };
    const scope = await tenantScopeIds(adminPrincipal);
    const tenantIds = new Set(
      (await db.select({ id: tenants.id }).from(tenants)).map((t) => t.id),
    );
    // Every tenant in the preview scope exists; the sector tenants the
    // surfaces preview are inside it, and no outside tenant can be.
    for (const code of ["BEYU-GROUP", "BEYU-TZ", "BEYU-AGRI", "BEYU-FOUNDATION", "BEYU-UJENZI"]) {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.code, code)).limit(1);
      expect(scope, `tenant ${code} must be inside the admin's preview scope`).toContain(tenant.id);
      expect(tenantIds.has(tenant.id)).toBe(true);
    }
    // And every preview page runs its reads inside the transaction-local RLS
    // context — the same boundary a non-admin gets.
    for (const file of [
      source("src", "app", "os", "finance", "page.tsx"),
      source("src", "app", "os", "agriculture", "page.tsx"),
      source("src", "app", "os", "ujenzi", "page.tsx"),
      source("src", "app", "os", "foundation", "page.tsx"),
      source("src", "app", "os", "family", "page.tsx"),
    ]) {
      expect(file).toContain("withTenantDatabaseContext");
    }
  });

  it("entity/country authorization: entity-scoped grants are still refused by the Sector OS surfaces", () => {
    // Ujenzi and Foundation refuse entity-scoped principals at the layout
    // boundary; Agriculture does it at the page boundary (its layout delegates
    // tenant/classification scoping to operatingSystemTenantInScope).
    const ujenziLayout = code(source("src", "app", "os", "ujenzi", "layout.tsx"));
    expect(ujenziLayout, "ujenzi layout must keep the entity-scope refusal").toMatch(
      /entityScope\.length\s*>\s*0/,
    );
    const foundationLayout = code(source("src", "app", "os", "foundation", "layout.tsx"));
    expect(foundationLayout, "foundation layout must keep the entity-scope refusal").toMatch(
      /entityScope\.length\s*>\s*0/,
    );
    const agriculturePage = code(source("src", "app", "os", "agriculture", "page.tsx"));
    expect(agriculturePage, "agriculture page must keep the entity-scope refusal").toMatch(
      /entityScope\.length\s*>\s*0/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* 9. Service-role credentials never reach the browser                  */
/* ------------------------------------------------------------------ */

describe("service-role credentials never reach the browser", () => {
  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
    }
  }

  it("no frontend file (pages, layouts, components) imports the admin database handle", () => {
    const appFiles = [...walk(path.join(ROOT, "src", "app"))];
    const offenders = appFiles.filter((file) =>
      code(readFileSync(file, "utf8")).includes('from "@/db/admin"'),
    );
    expect(offenders).toEqual([]);
  });

  it("the admin preview surface reads no service-role or admin-DNS credential for the browser", () => {
    const layout = code(source("src", "app", "os", "layout.tsx"));
    const launcher = code(source("src", "app", "launcher", "page.tsx"));
    for (const text of [layout, launcher]) {
      expect(text).not.toMatch(/BEYU_ADMIN_DATABASE_URL|service[-_ ]?role|createAdminClient|supabase/i);
    }
    // The marker is computed server-side from the sealed bootstrap binding +
    // the governed capability — never from a cookie, URL or client state.
    expect(layout).toContain('adminBootstrapState');
    expect(layout).toContain('can(principal, "platform:frontend.preview")');
  });
});

/* ------------------------------------------------------------------ */
/* 11+12+13+14. Canonical structure: one OS, five Sector/Foundation     */
/* surfaces, one Family Office capability, shared Tax/HCM               */
/* ------------------------------------------------------------------ */

describe("the canonical structure is preserved", () => {
  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
    }
  }

  it("exactly ONE control plane + FIVE Sector OSs; no Family Office OS", () => {
    expect(BEYU_CONTROL_PLANE.code).toBe("BEYU");
    expect(SECTOR_OPERATING_SYSTEMS.map((os) => os.code)).toEqual([
      "FINANCE",
      "HEALTH",
      "AGRICULTURE",
      "FOUNDATION",
      "UJENZI",
    ]);
    expect(SECTOR_OPERATING_SYSTEMS.map((os) => os.code)).not.toContain("FAMILY_OFFICE");
  });

  it("no FAMILY_OFFICE_OS / TAX_OS / HCM_OS exists anywhere in the source tree", () => {
    for (const file of walk(path.join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not invent a new OS`).not.toMatch(/FAMILY_OFFICE_OS|TAX_OS|HCM_OS/);
    }
  });

  it("Family Office remains a capability surface (one canonical route inside the control plane)", () => {
    const group = CAPABILITY_IA.find((g) => g.id === "shared");
    const familyItem = group?.items.find((item) => item.href === "/os/family");
    expect(familyItem, "the Family Office capability must stay in the shared group").toBeTruthy();
    expect(familyItem?.label).toBe("Family Office");
    // Never advertised as a Sector OS.
    expect(CAPABILITY_IA.find((g) => g.id === "sector")?.items.map((i) => i.href)).not.toContain("/os/family");
    // And the page itself declares its own nature.
    expect(source("src", "app", "os", "family", "page.tsx")).toContain("never a separate OS");
  });

  it("Tax remains a shared capability (Finance OS tax surface + Foundation tax, no Tax OS)", () => {
    const financeDomains = CAPABILITY_IA.find((g) => g.id === "finance-domains");
    expect(financeDomains?.items.find((i) => i.href === "/os/tax")?.label).toBe("Tax Governance");
    expect(PERMISSIONS).toHaveProperty("finance:tax.read");
    expect(PERMISSIONS).toHaveProperty("foundation:tax.read");
  });

  it("HCM remains a shared capability (one canonical route, no HCM OS)", () => {
    const shared = CAPABILITY_IA.find((g) => g.id === "shared");
    expect(shared?.items.find((i) => i.href === "/os/hcm")?.label).toBe("HCM");
    expect(PERMISSIONS).toHaveProperty("hcm:employee.read");
  });
});

/* ------------------------------------------------------------------ */
/* Noelia — one canonical identity, one canonical asset                 */
/* ------------------------------------------------------------------ */

describe("Noelia stays one governed identity on every surface", () => {
  it("the canonical identity is NOELIA_AI and the canonical asset /NOELIA.png exists", () => {
    expect(NOELIA_CANONICAL_ID.canonical_id).toBe("NOELIA_AI");
    expect(existsSync(path.join(ROOT, "public", "NOELIA.png"))).toBe(true);
  });

  it("the OS shell resolves Noelia's query right from the existing governed grant", () => {
    const layout = source("src", "app", "os", "layout.tsx");
    expect(layout).toContain('can(principal, "ai:noelia.query")');
    expect(layout).toContain("NoeliaShellForOS");
    // No sector-specific Noelia identities were created.
    for (const file of [
      source("src", "app", "os", "layout.tsx"),
      source("src", "app", "launcher", "page.tsx"),
    ]) {
      expect(code(file)).not.toMatch(/NOELIA_FINANCE|NOELIA_HEALTH|NOELIA_AGRICULTURE|NOELIA_UJENZI|NOELIA_FOUNDATION|NOELIA_FAMILY/);
    }
  });
});
