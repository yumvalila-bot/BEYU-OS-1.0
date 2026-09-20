import "dotenv/config";
import "../setup-env";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { resolutions, resolutionVotes } from "../../src/db/schema";
import { apiPost, login } from "../helpers/http";

let cookie: string;
let id: string;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  cookie = await login("governance@beyu.os");
  const result = await apiPost<{ data: { id: string } }>("/api/v1/governance/resolutions", {
    bodyId: "GOV_GROUP_BOARD", title: "Browser self-recusal verification", category: "OTHER",
    summary: "Browser evidence for an actual governed recusal mutation.",
    rationale: "Verify browser interaction and independently inspect persisted state.",
    dataBasis: "Disposable integration fixture", consequences: "No business execution", classification: "RESTRICTED",
  }, { cookie });
  expect(result.status).toBe(201); id = result.body.data.id;
  expect((await apiPost(`/api/v1/governance/resolutions/${id}/table`, {}, { cookie })).status).toBe(200);
});
test.afterAll(async () => {
  if (!id) return;
  await db.delete(resolutionVotes).where(eq(resolutionVotes.resolutionId, id));
  await db.delete(resolutions).where(eq(resolutions.id, id));
});

test("self-recusal is persisted, audited and enforced beyond the UI", async ({ page, context, baseURL }) => {
  await context.addCookies(cookie.split("; ").map((part) => {
    const index = part.indexOf("=");
    return { name: part.slice(0, index), value: part.slice(index + 1), url: baseURL! };
  }));
  await page.goto("/os/governance");
  const card = page.locator(`[data-resolution-id="${id}"]`);
  await expect(card).toBeVisible();
  await card.getByLabel("Conflict / recusal reason (recorded in the audit trail)").fill("Related-party interest identified during browser verification");
  const response = page.waitForResponse((r) => r.url().endsWith(`/${id}/recusal`) && r.request().method() === "POST");
  await card.getByRole("button", { name: "Declare conflict and recuse myself" }).click();
  expect((await response).status()).toBe(201);
  await expect(card.getByText("Your recorded vote:")).toContainText("RECUSED");
  await expect(card.getByRole("button", { name: "For", exact: true })).toHaveCount(0);
  const [record] = await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, id));
  expect(record.vote).toBe("RECUSED"); expect(record.conflictDeclared).toBe(true);
  const direct = await page.request.post(`/api/v1/governance/resolutions/${id}/votes`, { data: { vote: "FOR" } });
  expect(direct.status()).toBe(403);
  await page.reload();
  await expect(card.getByText("Your recorded vote:")).toContainText("RECUSED");
});
