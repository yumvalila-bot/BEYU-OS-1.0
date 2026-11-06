import "dotenv/config";
import "../setup-env";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { decryptSecret, generateTotpCode } from "@/lib/mfa";

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`shared sign-in fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/sign-in");
    await expect(page.locator("#beyu-signin-email")).toBeVisible();
    await expect(page.locator("#beyu-signin-password")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
  });
}

test("shared form requests MFA when blank, then uses real TOTP and server-side landing", async ({ page }) => {
  test.setTimeout(90_000);
  const password = process.env.BEYU_BOOTSTRAP_PASSWORD;
  if (!password) throw new Error("Seeded isolated test credentials are required");
  const [user] = await db.select().from(users).where(eq(users.email, "auditor@beyu.os")).limit(1);
  if (!user?.mfaSecretEncrypted) throw new Error("Seeded MFA identity is required");
  await page.goto("/sign-in");
  await page.locator("#beyu-signin-email").fill(user.email);
  await page.locator("#beyu-signin-password").fill(password);
  const first = page.waitForResponse((response) => response.url().endsWith("/api/v1/auth/login"));
  await page.getByRole("button", { name: "Enter BEYU OS" }).click();
  expect((await first).status()).toBe(428);
  // Another suite may have consumed the current TOTP step. Respect replay
  // protection and retry only after a new step, rather than weakening it.
  let status = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator("#beyu-signin-mfa").fill(generateTotpCode(decryptSecret(user.mfaSecretEncrypted), Date.now()));
    const response = page.waitForResponse((result) => result.url().endsWith("/api/v1/auth/login"));
    await page.getByRole("button", { name: "Enter BEYU OS" }).click();
    status = (await response).status();
    if (status === 200) break;
    if (attempt === 0) await page.waitForTimeout(31_000);
  }
  expect(status).toBe(200);
  await expect(page).not.toHaveURL(/\/sign-in/);
  expect(new URL(page.url()).pathname).toMatch(/^\/(launcher|os)/);
});
