import { test, expect } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`public homepage at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const response = await page.goto("/", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Bridging Care. Building Trust." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.evaluate(async () => {
      await Promise.all(Array.from(document.images).map((image) => { image.loading = "eager"; return image.decode().catch(() => undefined); }));
    });
    expect(await page.evaluate(() => Array.from(document.images).filter((image) => !image.naturalWidth).map((image) => image.src))).toEqual([]);
    expect(await page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')).map((link) => link.getAttribute("href")!).filter((href) => href.length > 1 && !document.getElementById(href.slice(1))))).toEqual([]);
    if (viewport.width <= 950) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(nav).toBeVisible();
      await nav.getByRole("link", { name: "About BEYU" }).click();
      await expect(nav).toHaveCount(0);
    } else {
      const dropdown = page.locator(".ph-desktop-nav details").first();
      await dropdown.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(dropdown.locator("div")).toBeVisible();
    }
    const sector = page.locator(".ph-sector-card details").first();
    await sector.locator("summary").click();
    await expect(sector.locator("p")).toBeVisible();
    const ownership = page.locator(".ph-ownership details").first();
    await ownership.locator("summary").click();
    await expect(ownership.locator("p")).toBeVisible();
    for (const path of ["/os/health", "/os/finance", "/os/agriculture", "/os/ujenzi", "/os/foundation"]) {
      const entry = await page.request.get(path, { maxRedirects: 0 });
      expect(entry.status()).toBe(307);
      expect(entry.headers().location).toBe("/sign-in");
    }
    await page.getByRole("link", { name: /Sign in to BEYU/ }).last().click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.locator("#beyu-signin-email")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
