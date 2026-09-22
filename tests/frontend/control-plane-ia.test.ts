/**
 * BEYU OS constitutional control-plane information architecture.
 *
 * Pure tests: no database or running server is required. HTTP deep-link and
 * role tests live in integration.test.ts and accessibility-nav-gating.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CAPABILITY_IA, visible } from "@/app/os/capabilities";
import type { Principal } from "@/lib/authz";
import type { PermissionCode } from "@/lib/constants";
import {
  BEYU_CONTROL_PLANE,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-systems";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const source = (...parts: string[]) =>
  readFileSync(path.join(ROOT, ...parts), "utf8");

function principal(...permissions: PermissionCode[]): Principal {
  return {
    userId: "usr-test",
    partyId: "pty-test",
    email: "test@beyu.invalid",
    displayName: "Test Principal",
    tenantId: "ten-test",
    tenantCode: "TEST",
    tenantType: "GROUP",
    roles: ["TEST_ROLE"],
    permissions: new Set(permissions),
    clearance: "HIGHLY_RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "ses-test",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

const group = (id: string) => {
  const result = CAPABILITY_IA.find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing capability group ${id}`);
  return result;
};

describe("canonical constitutional hierarchy", () => {
  it("exposes the three required top-level groups in order", () => {
    expect(
      CAPABILITY_IA.slice(0, 3).map(({ id, title }) => ({ id, title })),
    ).toEqual([
      { id: "executive", title: "Executive" },
      { id: "shared", title: "Shared capabilities" },
      { id: "sector", title: "Sector operating systems" },
    ]);
  });

  it("exposes exactly the required Executive control surfaces", () => {
    expect(
      group("executive").items.map(({ label, href }) => ({ label, href })),
    ).toEqual([
      { label: "Executive Control Centre", href: "/os" },
      { label: "OS & Source-of-Truth Registry", href: "/os/registry" },
      { label: "Organisation & Ownership", href: "/os/organization-ownership" },
    ]);
  });

  it("models every shared domain as a capability, not as an OS", () => {
    expect(group("shared").items.map((item) => item.label)).toEqual([
      "Identity & Access",
      "Organisation",
      "Ownership",
      "Governance",
      "Risk & Compliance",
      "HCM",
      "Documents & Knowledge",
      "Audit & Events",
      "Registries",
      // Shared Universal Dimensional Graphics capability — a capability entry,
      // deliberately NOT labelled an OS (the assertion below still forbids " OS").
      "Dimensional Graphics & Twins",
      "Family Office",
      "Noelia / HIVE",
    ]);
    expect(
      group("shared").items.every((item) => !item.label.endsWith(" OS")),
    ).toBe(true);
  });

  it("models exactly five Sector OSs beneath BEYU OS", () => {
    const expected = [
      { label: "Finance OS", href: "/os/finance" },
      // Health OS is a Sector OS like every other one: its canonical route
      // lives inside the /os namespace. /health remains the denial/availability
      // surface and re-checks the same federation gate.
      { label: "Health OS", href: "/os/health" },
      { label: "Agriculture OS", href: "/os/agriculture" },
      { label: "Foundation OS", href: "/os/foundation" },
      { label: "Ujenzi OS", href: "/os/ujenzi" },
    ];
    expect(
      group("sector").items.map(({ label, href }) => ({ label, href })),
    ).toEqual(expected);
    expect(
      SECTOR_OPERATING_SYSTEMS.map(({ name: label, href }) => ({
        label,
        href,
      })),
    ).toEqual(expected);
    expect(BEYU_CONTROL_PLANE.level).toBe("CONTROL_PLANE");
    expect(
      SECTOR_OPERATING_SYSTEMS.every(
        (destination) => destination.level === "SECTOR_OS",
      ),
    ).toBe(true);
  });

  it("exposes a visible Gear-labelled Settings destination in its own System group", () => {
    expect(group("system").title).toBe("System");
    expect(group("system").items).toEqual([
      expect.objectContaining({
        label: "Settings",
        href: "/os/settings",
        icon: "settings",
        visibility: { kind: "open" },
      }),
    ]);
    expect(visible(principal(), group("system").items[0]!)).toBe(true);
  });

  /**
   * Administration (governed user & tenant capability) — a FIRST-CLASS shared
   * capability of BEYU OS, NOT an "Admin OS". The group sits AFTER the pinned
   * executive/shared/sector groups and BEFORE System. Every entry is
   * permission-gated (never "open"), carries a semantic icon, and no label
   * ends in "OS": this is capability, not a new operating system.
   */
  it("exposes the Administration governance capability as its own group between sector and system", () => {
    expect(
      CAPABILITY_IA.slice(0, 4).map(({ id }) => id),
    ).toEqual(["executive", "shared", "sector", "administration"]);
    // Secondary domain groups (shared-workspaces, finance-domains, …) follow the
    // System group; what matters architecturally is that Administration sits
    // immediately BEFORE System in the canonical order.
    const systemIndex = CAPABILITY_IA.findIndex((g) => g.id === "system");
    expect(systemIndex).toBeGreaterThan(0);
    expect(CAPABILITY_IA.findIndex((g) => g.id === "administration")).toBe(systemIndex - 1);
    expect(group("administration").title).toBe("Administration");
    expect(
      group("administration").items.map(({ label, href }) => ({ label, href })),
    ).toEqual([
      { label: "Users & Identities", href: "/os/administration" },
      { label: "Tenants", href: "/os/administration/tenants" },
      { label: "Memberships", href: "/os/administration/memberships" },
      { label: "Roles & Capabilities", href: "/os/administration/roles" },
      { label: "Authority Delegations", href: "/os/administration/delegations" },
      { label: "Administrative Audit", href: "/os/administration/audit" },
    ]);
    expect(
      group("administration").items.every(
        (item) =>
          item.visibility.kind === "permission" &&
          !item.label.endsWith(" OS"),
      ),
    ).toBe(true);
    // The delegation surface must be gated by the high-risk delegation
    // capability itself — never open, never a weaker read permission.
    expect(
      group("administration").items.find((item) => item.href === "/os/administration/delegations")
        ?.visibility,
    ).toEqual({ kind: "permission", permission: "identity:delegation.manage" });
  });

  it("has one route per catalogue entry and a semantic icon for every entry", () => {
    const items = CAPABILITY_IA.flatMap((entry) => entry.items);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    for (const item of items) {
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.description.trim().length).toBeGreaterThan(0);
      expect(item.icon.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("permission-conscious discovery", () => {
  it("uses any-of visibility for aggregate destinations without treating it as authority", () => {
    const organisationOnly = principal("organization:entity.read");
    const capTableOnly = principal("equity:cap-table.read");
    const riskOnly = principal("risk:register.read");
    const complianceOnly = principal("compliance:obligation.read");
    const eventOnly = principal("audit:event.read");

    const organisationOwnership = group("executive").items.find(
      (item) => item.href === "/os/organization-ownership",
    )!;
    const ownership = group("shared").items.find(
      (item) => item.href === "/os/ownership",
    )!;
    const assurance = group("shared").items.find(
      (item) => item.href === "/os/assurance",
    )!;
    const registries = group("shared").items.find(
      (item) => item.href === "/os/registries",
    )!;

    expect(visible(organisationOnly, organisationOwnership)).toBe(true);
    expect(visible(organisationOnly, ownership)).toBe(false);
    expect(visible(capTableOnly, organisationOwnership)).toBe(true);
    expect(visible(capTableOnly, ownership)).toBe(true);
    expect(visible(riskOnly, assurance)).toBe(true);
    expect(visible(complianceOnly, assurance)).toBe(true);
    expect(visible(eventOnly, registries)).toBe(true);
  });

  it("keeps Health federation out of local permission inference", () => {
    const health = group("sector").items.find(
      (item) => item.href === "/os/health",
    )!;
    expect(visible(principal(), health)).toBe(false);
  });
});

describe("deep-link and data-boundary regression pins", () => {
  it("rechecks BEYU OS authorization in the server layout", () => {
    const layout = source("src", "app", "os", "layout.tsx");
    expect(layout).toContain("checkBeyuOSAuthorization(principal)");
    expect(layout).toContain('redirect("/launcher")');
    expect(layout).toContain("DesktopNavigation");
    expect(layout).toContain("ResponsiveNavigation");
  });

  it("keeps Settings protected, truthful and delegated to existing governed destinations", () => {
    const settings = source("src", "app", "os", "settings", "page.tsx");
    expect(settings).toContain("requirePrincipal()");
    expect(settings).toContain("BeyuOsLogo");
    expect(settings).toContain("DevicePreferences");
    expect(settings).toContain("administrationFor(principal)");
    expect(settings).toContain("can(principal, destination.permission)");
    expect(settings).not.toMatch(/db\.|insert\(|update\(|delete\(/);

    const preferences = source("src", "components", "device-preferences.tsx");
    expect(preferences).toContain("stored only in this browser");
    expect(preferences).toContain("window.localStorage");
    expect(preferences).toContain("never become authorization inputs");
    expect(preferences).not.toMatch(/@\/lib\/(authz|guard)|@\/db/);
  });

  it("partitions Risk, Compliance, Legal and Event reads before querying", () => {
    const assurance = source("src", "app", "os", "assurance", "page.tsx");
    expect(assurance).toContain('can(principal, "risk:register.read")');
    expect(assurance).toContain('can(principal, "compliance:obligation.read")');
    expect(assurance).toContain('can(principal, "legal:matter.read")');
    expect(assurance).toMatch(/const riskRows = canRisk \?/);
    expect(assurance).toMatch(/const obligationRows = canCompliance/);
    expect(assurance).toMatch(/const legalRows = canLegal \?/);
    expect(assurance).toContain("hasGlobalGovernanceScope(principal)");
    expect(assurance).toContain(
      "canRisk && !entityScoped && globalGovernanceScope",
    );

    const audit = source("src", "app", "os", "audit", "page.tsx");
    expect(audit).toContain('can(access.principal, "audit:event.read")');
    expect(audit).toMatch(/canReadEvents\s*\?\s*db/);
    expect(audit).toMatch(
      /enterpriseEvents\.legalEntityId,\s*access\.principal\.entityScope/,
    );
    expect(audit).toContain(
      "enterpriseEvents.classification, allowedClassifications",
    );
    expect(audit).toContain(
      "audit rows have no entity key; tenant-wide read refused",
    );
    expect(audit).toContain(
      "AI decision rows have no entity key; tenant-wide read refused",
    );
    expect(audit).toContain(
      "global control substrates and is not offered under an entity-scoped grant",
    );
    expect(audit).toContain("canRunGlobalAssurance = global && !entityScoped");
    expect(audit).toContain(
      "canRunGlobalAssurance ? verifyAuditChain() : Promise.resolve(null)",
    );

    const events = source("src", "app", "os", "events", "page.tsx");
    expect(events).toMatch(
      /enterpriseEvents\.legalEntityId,\s*access\.principal\.entityScope/,
    );
    expect(events).toContain(
      "enterpriseEvents.classification, allowedClassifications",
    );
    expect(events).toContain(".where(scopeFilter)");
  });

  it("partitions highly restricted Family Office reads by grant, entity and clearance", () => {
    const family = source("src", "app", "os", "family", "page.tsx");
    expect(family).toContain('can(access.principal, "family:vault.read")');
    expect(family).toContain('can(access.principal, "family:beneficiary.read")');
    expect(family).toContain('can(access.principal, "governance:resolution.read")');
    expect(family).toContain("inArray(familyMembers.classification, allowedClassifications)");
    expect(family).toContain("inArray(beneficiaries.trustEntityId, access.principal.entityScope)");
    expect(family).toContain("canVault && !entityScoped");
    expect(family).toContain("vault items were not queried");
  });

  it("discovers capitalization through Equity without enumerating the Organisation directory", () => {
    const ownership = source("src", "app", "os", "ownership", "page.tsx");
    expect(ownership).toContain("selectDistinct({ legalEntityId: shareClasses.legalEntityId })");
    expect(ownership).toContain('can(principal, "organization:entity.read")');
    expect(ownership).toContain("canReadEntityDirectory && referencedEntityIds.length > 0");
    expect(ownership).toContain('classification: "RESTRICTED"');

    const equity = source("src", "lib", "equity", "service.ts");
    expect(equity).toContain("requiredCapTableClassification");
    expect(equity).toContain("No holder,");
    expect(equity).toContain("const classification = await requiredCapTableClassification");
  });

  it("bounds Documents, Governance, Identity, Security and Noelia discovery at source", () => {
    const documents = source("src", "app", "os", "documents", "page.tsx");
    expect(documents).toContain("inArray(documents.entityScope, entityCodes)");
    expect(documents).toContain("inArray(documents.classification, allowedClassifications)");
    expect(documents).toContain('eq(knowledgeSources.scopeType, "ENTITY")');
    expect(documents).toContain('eq(knowledgeSources.scopeType, "COUNTRY")');
    expect(documents).toContain("retentionPolicies.jurisdictionCode, countryCodes");
    expect(documents).toContain("regulatoryChanges.jurisdictionCode, countryCodes");

    const governance = source("src", "app", "os", "governance", "page.tsx");
    expect(governance).toContain("inArray(resolutions.bodyId, bodyIds)");
    expect(governance).toContain("inArray(resolutions.classification, allowedClassifications)");
    expect(governance).toContain('can(access.principal, "governance:policy.read")');

    const identity = source("src", "app", "os", "identity", "page.tsx");
    expect(identity).toContain("inArray(roleAssignments.legalEntityId, access.principal.entityScope)");
    expect(identity).toContain("inArray(sessions.userId, scopedUserIds)");
    expect(identity).toContain("entityScoped\n          ? Promise.resolve([])");

    const security = source("src", "app", "os", "security", "page.tsx");
    expect(security).toContain("inArray(sessions.userId, scopedUserIds)");
    expect(security).toContain("Session token hashes, IP addresses and user");
    expect(security).not.toMatch(/tokenHash:\s*sessions\.tokenHash/);
    expect(security).toContain("entityScoped ? Promise.resolve([]) : db.select().from(servicePrincipals)");

    const noelia = source("src", "app", "os", "noelia", "page.tsx");
    expect(noelia).toContain("eq(aiDecisions.userId, access.principal.userId)");
    expect(noelia).not.toMatch(/input:\s*aiDecisions\.input|output:\s*aiDecisions\.output/);
    const noeliaScope = source("src", "lib", "noelia", "scope-service.ts");
    expect(noeliaScope).toContain("inArray(legalEntities.classification, allowedClassifications)");
    expect(noeliaScope).toContain("inArray(legalEntities.id, principal.entityScope)");
  });

  it("bounds executive and Finance summaries by entity and classification before loading payloads", () => {
    const executive = source("src", "app", "os", "page.tsx");
    expect(executive).toContain("treasuryPredicate");
    expect(executive).toContain("capitalPredicate");
    expect(executive).toContain("riskPredicate");
    expect(executive).toContain("employeePredicate");
    expect(executive).toContain("complianceObligationIds");
    expect(executive).toContain("governanceBodyIds");
    expect(executive).toContain("waterfallConfigIds");
    expect(executive).toContain("caps.dashboard && !entityScoped");
    expect(executive).toContain("caps.aiReview && !entityScoped");
    expect(executive).toContain("source rows have no legal-entity key; tenant-wide read refused");

    const finance = source("src", "app", "os", "finance", "page.tsx");
    expect(finance).toContain("treasuryPredicate");
    expect(finance).toContain("inArray(journalEntries.legalEntityId, entityIds)");
    expect(finance).toContain("inArray(treasuryPositions.classification, allowedClassifications)");
    expect(finance).toContain("canTreasury && completeCurrentTenantEntityClearance");
    expect(finance).toContain("globalGovernanceScope && !entityScoped");
    expect(finance).toContain("Tenant-wide reporting was refused");
  });

  it("keeps focused Finance, HCM, workflow and Sector OS reads inside proven scope", () => {
    const capital = source("src", "app", "os", "capital", "page.tsx");
    expect(capital).toContain("canTreasury\n      ? db.select().from(treasuryPositions).where(treasuryPredicate)");
    expect(capital).toContain("inArray(capitalRequests.legalEntityId, entityIds)");
    expect(capital).toContain("inArray(resolutions.bodyId, bodyIds)");

    const waterfall = source("src", "app", "os", "waterfall", "page.tsx");
    expect(waterfall).toContain("inArray(waterfallConfigs.legalEntityId, entityIds)");
    expect(waterfall).toContain("inArray(waterfallTiers.configId, configIds)");
    expect(waterfall).toContain("inArray(waterfallRuns.configId, configIds)");

    const tax = source("src", "app", "os", "tax", "page.tsx");
    expect(tax).toContain("inArray(taxStrategies.jurisdictionCode, countryCodes)");
    expect(tax).toContain("inArray(legalEntities.classification, allowedClassifications)");

    const hcm = source("src", "lib", "hcm.ts");
    expect(hcm).toContain("inArray(employees.legalEntityId, principal.entityScope)");
    expect(hcm).toContain('sql<string | null>`null`.as("base_salary")');
    expect(hcm).toContain("inArray(orgUnits.legalEntityId, principal.entityScope)");

    const workflow = source("src", "app", "os", "workflow", "page.tsx");
    expect(workflow).toContain("eq(noeliaWorkflows.requestedBy, principal.userId)");
    expect(workflow).toContain("caps.enterprise && !entityScoped");
    expect(workflow).toContain("caps.hive && !entityScoped");

    for (const familyRoute of [
      source("src", "app", "os", "family", "capital", "page.tsx"),
      source("src", "app", "os", "family", "protection", "page.tsx"),
      source("src", "app", "os", "family", "protection", "[policyId]", "page.tsx"),
    ]) {
      expect(familyRoute).toContain('classification: "HIGHLY_RESTRICTED"');
      expect(familyRoute).toContain("entityScope.length > 0");
    }

    const agriculture = source("src", "app", "os", "agriculture", "page.tsx");
    expect(agriculture).toContain("inArray(farms.classification, allowedClassifications)");
    expect(agriculture).toContain("entityScope.length > 0");
    const foundation = source("src", "app", "os", "foundation", "layout.tsx");
    expect(foundation).toContain("entityScope.length > 0");
    expect(foundation).toContain("tenant-wide reads are refused");
  });

  it("filters shell and full-stream notifications by recipient and clearance", () => {
    for (const notificationSurface of [
      source("src", "app", "os", "layout.tsx"),
      source("src", "app", "os", "notifications", "page.tsx"),
    ]) {
      expect(notificationSurface).toContain("allowedClassifications");
      expect(notificationSurface).toContain(
        "notifications.userId, principal.userId",
      );
      expect(notificationSurface).toContain(
        "notifications.role, principal.roles",
      );
      expect(notificationSurface).toContain(
        "notifications.tenantId, principal.tenantId",
      );
    }
  });

  it("surfaces the existing database activation registry without adding a write path", () => {
    const registry = source("src", "app", "os", "registry", "page.tsx");
    expect(registry).toContain("governanceCapabilityRegistry");
    expect(registry).toContain("CAP_POSTING");
    expect(registry).toContain("This surface cannot change");
    expect(registry).not.toMatch(/insert\(|update\(|delete\(/);
  });

  it("fails Health federation closed with a truthful availability state and sanitized logging", () => {
    const authorization = source("src", "lib", "health-os-authorization.ts");
    expect(authorization).toContain("AUTHORIZATION_SERVICE_UNAVAILABLE");
    expect(authorization).toContain("access is failing closed");
    expect(authorization).not.toContain(
      'console.warn("Health OS authorization check failed:", error)',
    );

    const health = source("src", "app", "health", "page.tsx");
    expect(health).toContain("This availability state does not prove");
    expect(health).toContain('name={unavailable ? "health" : "security"}');
  });

  it("implements persistent desktop navigation and an explicit accessible responsive drawer", () => {
    const navigation = source("src", "app", "os", "os-navigation.tsx");
    expect(navigation).toContain("hidden h-screen");
    expect(navigation).toContain("xl:sticky");
    expect(navigation).toContain("xl:hidden");
    expect(navigation).toContain('role="dialog"');
    expect(navigation).toContain('aria-modal="true"');
    expect(navigation).toContain('aria-label="Open BEYU OS navigation"');
    expect(navigation).toContain('event.key === "Escape"');
    expect(navigation).toContain("Bridging Care. Building Trust.");
    expect(navigation).not.toMatch(/onMouseEnter|onMouseOver/);
  });
});
