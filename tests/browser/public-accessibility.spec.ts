import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Automated checks are a regression aid, not a claim of WCAG certification.
for (const width of [320, 390, 768, 1024, 1440]) {
  for (const route of ["/", "/sign-in"]) {
    test(`${route} has no automatically detected WCAG A/AA violations at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route, { waitUntil: "networkidle" });
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}
