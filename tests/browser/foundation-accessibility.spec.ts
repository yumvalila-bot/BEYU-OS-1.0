import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "../helpers/http";

let director: string;
let unrelated: string;
test.beforeAll(async () => {
  director = await login("foundation.director@beyu.os");
  unrelated = await login("agri.ops@beyu.os");
});
test.afterAll(async () => {
  const base = process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100";
  for (const cookie of [director, unrelated]) {
    if (cookie) await fetch(`${base}/api/v1/auth/logout`, { method: "POST", headers: { cookie } }).catch(() => undefined);
  }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const scenario of [
    { name: "Foundation dashboard", heading: "Foundation Executive Dashboard", path: "/os/foundation", actor: "director" as const },
    { name: "Foundation registry", heading: "Foundation Registry", path: "/os/foundation/registry", actor: "director" as const },
    { name: "launcher", heading: "Select a governed destination", path: "/launcher", actor: "unrelated" as const },
    { name: "Foundation denial", heading: "Authorisation denied", path: "/os/foundation", actor: "unrelated" as const },
    { name: "registry denial", heading: "Authorisation denied", path: "/os/foundation/registry", actor: "unrelated" as const },
  ]) {
    test(`${scenario.name} at ${width}px has no automated WCAG A/AA violations`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const cookie = scenario.actor === "director" ? director : unrelated;
      const [name, ...value] = cookie.split("=");
      await context.addCookies([{ name, value: value.join("="), url: baseURL!, httpOnly: true }]);
      await page.goto(scenario.path, { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { name: scenario.heading })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

for (const scenario of [
  { path: "/os/foundation", heading: "Foundation Executive Dashboard" },
  { path: "/os/foundation/registry", heading: "Foundation Registry" },
]) {
  test(`Foundation heading and panel kicker follow an explicit dark theme on ${scenario.path}`, async ({ page, context, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("beyu.device.theme", "dark"));
    const [name, ...value] = director.split("=");
    await context.addCookies([{ name, value: value.join("="), url: baseURL!, httpOnly: true }]);
    await page.goto(scenario.path, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: scenario.heading })).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
    const kickers = page.locator(".beyu-kicker.text-\\[var\\(--beyu-panel-gold-ink\\)\\]");
    expect(await kickers.count()).toBeGreaterThan(1);
    for (const kicker of await kickers.all()) {
      await expect(kicker).toHaveCSS("color", "rgb(239, 217, 143)");
    }
  });
}
