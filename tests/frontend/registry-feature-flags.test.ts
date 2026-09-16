import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Feature-flag exposure source gate (registry gap G-1 / remediation R-1).
 *
 * The `feature_flags` registry (schema + seed) previously had no frontend
 * surface. R-1 exposes it as a READ-ONLY panel on the existing
 * `/os/registry` page under the page's existing `platform:registry.read`
 * guard and tenant context. These source gates assert the exposure exists
 * and, just as importantly, that it did not create a new authorization path
 * or a mutation surface.
 */
const ROOT = process.cwd();
const source = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const registryPage = source("src", "app", "os", "registry", "page.tsx");
const capabilityCatalogue = source("src", "app", "os", "capabilities.ts");

describe("feature flags — governed read-only exposure", () => {
  it("is queried on the registry page from the canonical schema", () => {
    expect(registryPage).toContain('featureFlags,');
    expect(registryPage).toContain("db.select().from(featureFlags)");
  });

  it("remains behind the page's existing platform:registry.read guard", () => {
    expect(registryPage).toContain('requireAccess("platform:registry.read")');
  });

  it("creates no mutation surface for flags (no insert/update/delete in the page)", () => {
    expect(registryPage).not.toContain("insert(featureFlags)");
    expect(registryPage).not.toContain("update(featureFlags)");
    expect(registryPage).not.toContain("delete(featureFlags)");
  });

  it("renders an honest empty state when no flags are registered", () => {
    expect(registryPage).toContain("No feature flags are registered in this deployment.");
  });

  it("is discoverable through the canonical capability catalogue description", () => {
    const registryEntry = capabilityCatalogue.slice(
      capabilityCatalogue.indexOf('href: "/os/registry"'),
    );
    expect(registryEntry).toContain("feature flags");
  });
});
