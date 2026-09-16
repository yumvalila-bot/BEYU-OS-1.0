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

function apiPath(path: string): string {
  return relative(join(ROOT, "src/app/api/v1/agriculture"), path)
    .replace(/\/route\.ts$/, "")
    .replaceAll("\\", "/");
}

describe("repository-discovered capability completeness", () => {
  it("surfaces contracting, blockchain, government, payments and AI governance as protected iconized routes", () => {
    const ia = source("src", "app", "os", "capabilities.ts");
    const expected = [
      ["/os/contracts", "contracts:read", 'icon: "contracts"'],
      ["/os/blockchain", "blockchain:read", 'icon: "blockchain"'],
      ["/os/government-integrations", "government:integration.read", 'icon: "government"'],
      ["/os/finance/payments", "finance:payments.read", 'icon: "payments"'],
      ["/os/noelia/governance", "ai:model.registry.read", 'icon: "hive"'],
      ["/os/agriculture/capabilities", "agriculture:data.read", 'icon: "agriculture"'],
    ];
    for (const [route, permission, icon] of expected) {
      expect(ia).toContain(`href: "${route}"`);
      expect(ia).toContain(permission);
      expect(ia).toContain(icon);
      expect(source("src", "app", ...route.slice(1).split("/"), "page.tsx")).toContain("require");
    }
  });

  it("catalogues every implemented Agriculture API route without inventing a second backend", () => {
    const catalogue = source("src", "app", "os", "agriculture", "capabilities", "page.tsx");
    const routes = filesBelow(join(ROOT, "src/app/api/v1/agriculture"), "route.ts").map(apiPath);
    expect(routes).toHaveLength(90);
    for (const route of routes) expect(catalogue).toContain(`"${route}"`);
    expect(catalogue).toContain("/api/v1/agriculture/${endpoint}");
    expect(catalogue).toContain("classification");
  });

  it("partitions Foundation landing, operations and impact reads by their canonical grants", () => {
    const foundation = source("src", "app", "os", "foundation", "page.tsx");
    for (const permission of [
      "foundation:registry.read",
      "foundation:fund.read",
      "foundation:donor.read",
      "foundation:grant.read",
      "foundation:program.read",
      "foundation:compliance.read",
    ]) {
      expect(foundation).toContain(permission);
    }
    expect(foundation).toContain("visibleSections");
    expect(foundation).toContain("<Icon name={section.icon}");
    expect(foundation).toContain("capabilities.funds ? listFunds");
    expect(foundation).toContain("capabilities.donations ? listDonations");

    const operations = source("src", "app", "os", "foundation", "operations", "page.tsx");
    for (const permission of [
      "foundation:procurement.read",
      "foundation:asset.read",
      "foundation:investment.read",
      "foundation:assignment.read",
    ]) {
      expect(operations).toContain(permission);
    }
    expect(operations).toContain("capabilities.investment ? listInvestments");

    const programs = source("src", "app", "os", "foundation", "programs", "page.tsx");
    expect(programs).toContain('"foundation:program.read"');
    expect(programs).toContain('"foundation:impact.read"');
    expect(programs).toContain("mayReadImpact ? listImpactMetrics");
  });

  it("enforces sector scope-shape and classification at the shared server API guard", () => {
    const api = source("src", "lib", "api.ts");
    expect(api).toContain("permissionClassificationFloor");
    expect(api).toContain('options.permission.startsWith("agriculture:")');
    expect(api).toContain('options.permission.startsWith("foundation:")');
    expect(api).toContain('options.permission.startsWith("familyoffice:")');
    expect(api).toContain('options.permission.startsWith("blockchain:")');
    expect(api).toContain("principal.entityScope.length > 0");
    expect(api).toContain("classification ? { classification } : undefined");

    const agriculture = source("src", "lib", "agriculture", "http.ts");
    expect(agriculture).toContain("classificationsAtOrBelow(clearance)");
    expect(agriculture).toContain("isKnownClassification(classification)");
    expect(agriculture).toContain("visibleAgricultureItems(payload.items");
  });

  it("keeps newly exposed data pages tenant/entity/classification bounded", () => {
    const ownership = source("src", "app", "os", "ownership", "page.tsx");
    expect(ownership).toContain("visibleOwnershipEntityIds");
    expect(ownership).toContain("legalEntities.classification");
    expect(ownership).toContain("ownershipRecords.ownedEntityId");

    const contracts = source("src", "app", "os", "contracts", "page.tsx");
    expect(contracts).toContain("tenantScopeIds");
    expect(contracts).toContain("classificationsAtOrBelow");
    expect(contracts).toContain("contractRecords.beyuEntityId");

    const government = source("src", "app", "os", "government-integrations", "page.tsx");
    expect(government).toContain("governmentSubmissions.legalEntityId");
    expect(government).toContain("legalEntities.classification");
    expect(government).toContain("tenantScopeIds");

    const payments = source("src", "app", "os", "finance", "payments", "page.tsx");
    expect(payments).toContain('classification: "RESTRICTED"');
    expect(payments).toContain("entityScope.length > 0");

    const blockchain = source("src", "app", "os", "blockchain", "page.tsx");
    expect(blockchain).toContain("classificationsAtOrBelow");
    expect(blockchain).toContain("entityScope.length > 0");
  });
});
