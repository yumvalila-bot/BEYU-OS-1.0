import "dotenv/config";
import "../setup-env";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { login } from "../helpers/http";

/**
 * BEYU REGISTRY — subordinate enrollment & reporting lines in the browser.
 *
 * Proves the transport-level truth the vitest HTTP suite asserts, from a real
 * browser context: UI visibility is NEVER authorization. The enrollment panel
 * renders for workforce managers only, and every enrollment / reporting-line
 * mutation is re-authorized by the server — a family-office principal staring
 * at the console still gets a governed 403, and an anonymous context a 401.
 */

async function identity(page: Page, context: BrowserContext, baseURL: string, email: string) {
  const cookie = await login(email);
  await context.clearCookies();
  await context.addCookies(
    cookie.split("; ").map((s) => {
      const i = s.indexOf("=");
      return { name: s.slice(0, i), value: s.slice(i + 1), url: baseURL };
    }),
  );
  await page.goto("/os/registration");
}

const enrollmentPayload = {
  tenantId: "TEN_BEYU_GROUP",
  legalEntityId: "LEN_BEYU_HOLDINGS",
  countryCode: "TZ",
  hireDate: "2026-09-30",
  employeeNo: "BROWSER-ENR-001",
  newPerson: { displayName: "Browser Enrollment Probe", email: "browser-enr-probe@beyu.os" },
  reason: "Browser suite: proving the server re-authorizes enrollment.",
};

test("unauthenticated enrollment and reporting-line mutations fail closed with 401", async ({ page }) => {
  const post = await page.request.post("/api/v1/admin/registry/enrollment", { data: enrollmentPayload });
  expect(post.status()).toBe(401);
  const patch = await page.request.patch("/api/v1/admin/registry/employment/EMP_AMANI_BEYU/manager", {
    data: { managerEmployeeId: null, reason: "Browser suite: unauthenticated reassignment." },
  });
  expect(patch.status()).toBe(401);
});

test("a principal without workforce capability is refused by the server — UI is never authorization", async ({ page, context, baseURL }) => {
  await identity(page, context, baseURL!, "family@beyu.os");

  const post = await page.request.post("/api/v1/admin/registry/enrollment", { data: enrollmentPayload });
  expect(post.status()).toBe(403);
  expect(((await post.json()) as { error?: { code?: string } }).error?.code).toBe("FORBIDDEN");

  const patch = await page.request.patch("/api/v1/admin/registry/employment/EMP_AMANI_BEYU/manager", {
    data: { managerEmployeeId: null, reason: "Browser suite: unauthorized reassignment." },
  });
  expect(patch.status()).toBe(403);

  // The console itself renders (identity:user.read) but exposes NO enrollment
  // panel to a principal without hcm:employee.manage — visibility tracks
  // capability, and even that is not authorization.
  await expect(page.locator("h1")).toContainText("Canonical registration console");
  await expect(page.getByText("Enroll a subordinate (superior → subordinate)")).toHaveCount(0);
});

test("the workforce manager sees the enrollment panel, and the server still re-authorizes invalid input", async ({ page, context, baseURL }) => {
  await identity(page, context, baseURL!, "ceo@beyu.os");

  await expect(page.getByText("Enroll a subordinate (superior → subordinate)")).toBeVisible();
  await expect(page.getByText("Reassign a reporting line")).toBeVisible();

  // Even an authorized session receives the schema refusal — the server, not
  // the rendered form, decides what is acceptable.
  const invalid = await page.request.post("/api/v1/admin/registry/enrollment", {
    data: { ...enrollmentPayload, employeeNo: "" },
  });
  expect(invalid.status()).toBe(422);
});
