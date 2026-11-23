import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const domain = process.env.BEYU_TEST_CANONICAL_DOMAIN;
const base = new URL(process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100");
const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
const destinations = ["", "health", "finance", "agriculture", "ujenzi", "foundation", "familyoffice", "noelia"];

test.describe("public homepage automated accessibility", () => {
  test.skip(!domain, "Set BEYU_TEST_CANONICAL_DOMAIN for the local canonical-host server");
  test.beforeAll(() => { if (!loopback) throw new Error("Accessibility tests require a loopback server"); });
  for (const label of destinations) {
    test(`${label || "central"}: WCAG automated checks`, async ({ page }) => {
      const host = `${label ? `${label}.` : ""}${domain}${base.port ? `:${base.port}` : ""}`;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base.protocol}//${host}/`);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((n) => n.target) }))).toEqual([]);
    });
  }
});
