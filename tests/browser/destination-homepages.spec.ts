import { expect, test } from "@playwright/test";

// Run against a nonproduction server with the matching canonical domain configured.
// Host is an HTTP routing input, not an authentication or authorization grant.
const destinations = [
  ["health", "Health OS"],
  ["finance", "Finance OS"],
  ["agriculture", "Agriculture OS"],
  ["ujenzi", "Ujenzi OS"],
  ["foundation", "Foundation"],
  ["familyoffice", "Family Office"],
  ["noelia", "NOELIA"],
] as const;
const domain = process.env.BEYU_TEST_CANONICAL_DOMAIN;
const port = new URL(process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100").port;
const hostFor = (label: string) => `${label ? `${label}.` : ""}${domain}${port ? `:${port}` : ""}`;
const widths = [320, 360, 390, 430, 480, 768, 1024, 1280, 1440, 1920];

test.describe("anonymous destination homepages", () => {
  test.skip(!domain, "Set BEYU_TEST_CANONICAL_DOMAIN to match the nonproduction server");
  for (const [host, name] of destinations) {
    test(`${host}: content, sign-in and responsive layouts`, async ({ page }) => {
      await page.setExtraHTTPHeaders({ Host: hostFor(host) });
      await page.goto("/");
      await expect(page.locator("#dest-title")).toContainText(name, { ignoreCase: true });
      await expect(page.getByRole("link", { name: /sign in/i }).first()).toHaveAttribute("href", "/sign-in");
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(page.locator("footer")).toBeVisible();
      for (const width of widths) {
        for (const height of [Math.max(width * 2, 640), Math.max(Math.floor(width * 0.56), 320)]) {
          await page.setViewportSize({ width, height });
          const dimensions = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            scroll: document.documentElement.scrollWidth,
          }));
          expect(dimensions.scroll, `${host} ${width}x${height}`).toBeLessThanOrEqual(dimensions.viewport);
          await expect(page.locator("#dest-title")).toBeVisible();
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const menu = page.locator(".beyu-mobile-nav summary");
      await expect(menu).toBeVisible();
      await menu.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".beyu-mobile-nav nav")).toBeVisible();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator('a[href="#dest-main"]')).toHaveCount(1);
      await page.goto("/sign-in");
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator("#dest-title")).toHaveCount(0);
    });
  }

  test("central homepage remains distinct; lookalike host cannot select a destination", async ({ page }) => {
    await page.setExtraHTTPHeaders({ Host: hostFor("") });
    await page.goto("/");
    await expect(page.locator(".beyu-home-shell")).toBeVisible();
    await expect(page.locator("#dest-title")).toHaveCount(0);
    await page.setExtraHTTPHeaders({ Host: `health.${domain}.attacker.example` });
    await page.goto("/");
    await expect(page.locator("#dest-title")).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
