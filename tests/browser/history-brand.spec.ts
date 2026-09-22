import "dotenv/config";
import "../setup-env";
import { test, expect } from "@playwright/test";
import { login } from "../helpers/http";

let cookie = "";
test.beforeAll(async () => {
  test.setTimeout(120_000);
  cookie = await login("ceo@beyu.os");
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies(cookie.split("; ").map(part => {
    const index = part.indexOf("=");
    return { name: part.slice(0, index), value: part.slice(index + 1), url: baseURL! };
  }));
});

test("Back and Next traverse actual application history with keyboard activation", async ({ page }) => {
  await page.goto("/os");
  // Hydrated Next navigation, not a synthetic page sequence in the component.
  await page.locator('nav[aria-label="Primary"]').getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/os\/settings$/);
  const history = page.getByRole("navigation", { name: "Page history" });
  await expect(history).toHaveCount(1);
  const back = history.getByRole("button", { name: "Back", exact: true });
  const next = history.getByRole("button", { name: "Next", exact: true });
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/os$/);
  await next.focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\/os\/settings$/);
  await back.click();
  await expect(page).toHaveURL(/\/os$/);
  await next.click();
  await expect(page).toHaveURL(/\/os\/settings$/);
});

for (const width of [375, 768, 1024, 1440]) {
  test(`shared shell fits ${width}px with intact artwork and usable history controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/os/ujenzi");
    const history = page.getByRole("navigation", { name: "Page history" });
    await expect(history).toBeVisible();
    await expect(history).toHaveCount(1);
    for (const name of ["Back", "Next"]) {
      const button = history.getByRole("button", { name, exact: true });
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await button.focus();
      expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const brand = page.getByRole("link", { name: "Ujenzi OS — BEYU OS home" }).filter({ visible: true });
    await expect(brand).toHaveCount(1);
    expect(await brand.evaluate(el => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    const image = brand.locator("img");
    await expect(image).toHaveAttribute("src", "/brand/beyu-os-logo.png");
    expect(await image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 1254)).toBe(true);
    const box = await image.boundingBox();
    expect(box!.width).toBe(box!.height);
    await page.screenshot({ path: `tmp/browser-results/shell-${width}.png`, fullPage: false });
  });
}

test("implemented shell domain labels and distinct Trust governance artwork", async ({ page }) => {
  for (const [path, name] of [["/os", "BEYU OS"], ["/os/finance", "Finance OS"], ["/os/agriculture", "Agriculture OS"], ["/os/foundation", "Foundation OS"], ["/os/ujenzi", "Ujenzi OS"], ["/os/family", "Family Office"]]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: `${name} — BEYU OS home` }).filter({ visible: true })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Page history" })).toHaveCount(1);
  }
  await expect(page.locator('img[src="/brand/beyu-family-trust-logo.png"]')).toHaveCount(1);
});

test("public surfaces and metadata resolve without an authenticated session", async ({ page, context }) => {
  await context.clearCookies();
  for (const path of ["/", "/enroll", "/not-a-real-beyu-route"]) {
    await page.goto(path);
    await expect(page.locator('img[src="/brand/beyu-os-logo.png"]').first()).toBeVisible();
  }
  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/brand\/beyu-os-logo\.png$/);
  for (const path of ["/brand/favicon.png", "/manifest.webmanifest", "/brand/beyu-app-icon-192.png"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
  }
});

test("unauthenticated deep links still redirect, including Ujenzi and Health", async ({ page, context }) => {
  await context.clearCookies();
  // The canonical Sector OS routes (including `/os/health`, which serves the
  // same governed Health OS mount as `/health/os`) must fail closed to the
  // sign-in surface on a direct unauthenticated request.
  for (const path of ["/os", "/os/finance", "/os/health", "/os/agriculture", "/os/foundation", "/os/ujenzi", "/os/family", "/os/family/protection", "/health/os"]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/");
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("navigation", { name: "Page history" })).toHaveCount(0);
  }
});

test("dark mode preserves the canonical artwork and contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/os/finance");
  await expect(page.locator("html")).toHaveClass(/dark/);
  const brand = page.getByRole("link", { name: "Finance OS — BEYU OS home" }).filter({ visible: true });
  expect(await brand.evaluate(el => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
  await expect(brand.locator("img")).toHaveAttribute("src", "/brand/beyu-os-logo.png");
  expect(await brand.locator("img").evaluate(el => getComputedStyle(el).filter)).toBe("none");
  await page.screenshot({ path: "tmp/browser-results/shell-dark.png" });
});
