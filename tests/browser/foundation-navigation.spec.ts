import { expect, test } from "@playwright/test";
import { login } from "../helpers/http";

test("authorized Foundation navigation works and unrelated user receives a non-leaking 403", async ({ browser, baseURL }) => {
  const director = await login("foundation.director@beyu.os");
  const unrelated = await login("agri.ops@beyu.os");
  try {
    for (const [cookie, allowed] of [[director, true], [unrelated, false]] as const) {
      const context = await browser.newContext();
      const [name, ...value] = cookie.split("=");
      await context.addCookies([{ name, value: value.join("="), url: baseURL!, httpOnly: true }]);
      const page = await context.newPage();
      if (allowed) {
        await page.goto("/os/foundation");
        await expect(page.getByRole("heading", { name: "Foundation Executive Dashboard" })).toBeVisible();
        await page.getByRole("link", { name: /Foundation Registry/ }).first().click();
        await expect(page.getByRole("heading", { name: "Foundation Registry" })).toBeVisible();
      } else {
        const response = await page.goto("/os/foundation/registry");
        expect(response?.status()).toBe(403);
        await expect(page.getByRole("heading", { name: "Authorisation denied" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Foundation Registry" })).toHaveCount(0);
      }
      await context.close();
    }
  } finally {
    for (const cookie of [director, unrelated]) await fetch(`${baseURL}/api/v1/auth/logout`, { method: "POST", headers: { cookie } });
  }
});
