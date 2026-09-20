import "dotenv/config";
import "../setup-env";
import { test, expect, type BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { tasks } from "../../src/db/schema";
import { login } from "../helpers/http";
import { cleanupExecution, executionPrincipal, executionResolution } from "../helpers/governance-execution";
let secretary: string, chair: string, resolutionId: string;
async function useIdentity(context: BrowserContext, cookie: string, baseURL: string) {
  await context.clearCookies();
  await context.addCookies(cookie.split("; ").map((part) => {
    const i = part.indexOf("="); return { name: part.slice(0, i), value: part.slice(i + 1), url: baseURL };
  }));
}
test.beforeAll(async () => {
  test.setTimeout(120000); await cleanupExecution("GEXUI");
  resolutionId = await executionResolution(await executionPrincipal(), "GEXUI");
  secretary = await login("governance@beyu.os"); chair = await login("ceo@beyu.os");
});
test.afterAll(async () => { await cleanupExecution("GEXUI"); });
test("real human UI completes mandated work with a different independent verifier", async ({ page, context, baseURL }) => {
  test.setTimeout(120000);
  await useIdentity(context, secretary, baseURL!); await page.goto(`/os/governance#resolution-${resolutionId}`);
  const resolution = page.locator(`[data-resolution-id="${resolutionId}"]`);
  await expect(resolution).toBeVisible();
  await resolution.getByText("Record a mandated implementation action", { exact: true }).click();
  await resolution.getByLabel("Action title", { exact: true }).fill("Browser implementation evidence handover");
  await resolution.getByLabel("Deadline (local time)").fill("2099-01-01T12:00");
  await resolution.getByLabel("Mandate / acceptance criteria").fill("Independently verify the registered document snapshot before closure.");
  const created = page.waitForResponse((r) => r.url().endsWith(`/${resolutionId}/actions`) && r.request().method() === "POST");
  await resolution.getByRole("button", { name: "Create implementation action", exact: true }).click();
  expect((await created).status()).toBe(201);
  const [stored] = await db.select().from(tasks).where(eq(tasks.sourceResolutionId, resolutionId));
  const card = resolution.locator(`[data-action-id="${stored.id}"]`);
  await expect(card).toBeVisible();
  await card.getByLabel("Accountable user ID").fill("USR_GRACE_KILELE");
  const click = async (label: string, expected = 200) => {
    await card.getByLabel("Reason / review note").fill("Browser accountability and independent evidence review");
    const response = page.waitForResponse((r) => r.url().endsWith(`/actions/${stored.id}`) && r.request().method() === "POST");
    await card.getByRole("button", { name: label, exact: true }).click();
    expect((await response).status()).toBe(expected);
  };
  await click("Assign owner"); await expect(card).toContainText("ASSIGNED");
  await click("Start work"); await expect(card).toContainText("IN_PROGRESS");
  await click("Submit for verification", 422);
  await expect(resolution.getByRole("alert")).toContainText("evidence");
  await card.getByLabel("Evidence document ID").fill("DOC_D4");
  await click("Link evidence"); await expect(card).toContainText("snapshots (1)");
  await click("Submit for verification"); await expect(card).toContainText("COMPLETED");
  await expect(card.getByRole("button", { name: "Verify independently" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Close action" })).toHaveCount(0);
  await useIdentity(context, chair, baseURL!); await page.reload();
  await click("Verify independently"); await expect(card).toContainText("VERIFIED");
  await click("Close action"); await expect(card).toContainText("CLOSED");
  await page.reload(); await expect(card).toContainText("CLOSED");
  const [closed] = await db.select().from(tasks).where(eq(tasks.id, stored.id));
  expect(closed.completedByUserId).toBe("USR_GRACE_KILELE"); expect(closed.verifiedByUserId).toBe("USR_AMANI_BEYU"); expect(closed.closedAt).not.toBeNull();
});
