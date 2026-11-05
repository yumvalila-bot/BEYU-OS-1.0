import { expect, test } from "@playwright/test";

// These sizes cover the requested portrait and landscape CSS viewports. They
// do not replace real-device, browser-zoom, safe-area or screen-reader review.
const viewports = [
  [320, 568], [360, 800], [390, 844], [430, 932], [600, 960],
  [768, 1024], [1024, 768], [1280, 720], [1366, 1024], [1440, 900],
  [1536, 864], [1920, 1080], [2560, 1440], [3840, 2160], [844, 390],
] as const;
for (const [width, height] of viewports) {
  for (const route of ["/", "/sign-in"]) {
    test(`${route} fits ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      if (route === "/") {
        await expect(page.getByRole("heading", { name: "Bridging Care. Building Trust." })).toBeVisible();
        await expect(page.getByRole("link", { name: /Sign in to BEYU/ }).last()).toBeVisible();
      } else {
        await expect(page.locator("#beyu-signin-email")).toBeVisible();
        await expect(page.locator("#beyu-signin-password")).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}
