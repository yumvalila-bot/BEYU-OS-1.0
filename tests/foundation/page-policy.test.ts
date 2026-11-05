import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOUNDATION_PAGE_REQUIREMENTS, foundationPageRequirements } from "@/lib/foundation/page-policy";

describe("Foundation preflight catalogue parity", () => {
  it("covers every existing Foundation page and no unknown child paths", () => {
    const root = join(process.cwd(), "src/app/os/foundation");
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    const pages = dirs.filter((d) => { try { readFileSync(join(root, d.name, "page.tsx")); return true; } catch { return false; } }).map((d) => d.name).sort();
    expect(Object.keys(FOUNDATION_PAGE_REQUIREMENTS).sort()).toEqual(pages);
    expect(foundationPageRequirements("/os/foundation/not-a-page")).toBeNull();
    expect(foundationPageRequirements("/os/foundation")?.length).toBeGreaterThan(13);
  });
  it("matches each simple page's independent permission and classification guard", () => {
    const root = join(process.cwd(), "src/app/os/foundation");
    for (const [route, rules] of Object.entries(FOUNDATION_PAGE_REQUIREMENTS)) {
      if (["programs", "operations"].includes(route)) continue;
      const source = readFileSync(join(root, route, "page.tsx"), "utf8");
      expect(rules).toHaveLength(1);
      expect(source, route).toContain(`requireAccess("${rules[0].permission}"`);
      expect(source, route).toContain(`classification: "${rules[0].classification}"`);
    }
  });
  it("matches each compound page's individual independent capability checks", () => {
    for (const route of ["programs", "operations"]) {
      const source = readFileSync(join(process.cwd(), "src/app/os/foundation", route, "page.tsx"), "utf8");
      for (const { permission, classification } of FOUNDATION_PAGE_REQUIREMENTS[route]) {
        if (route === "programs") {
          expect(source, route).toContain(`"${permission}", { classification: "${classification}" }`);
        } else {
          expect(source, route).toContain(`"${permission}", "${classification}"`);
        }
      }
    }
  });
});
