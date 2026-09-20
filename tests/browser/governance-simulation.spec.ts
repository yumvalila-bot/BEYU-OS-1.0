import "dotenv/config";
import "../setup-env";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { resolutions, resolutionVotes } from "../../src/db/schema";
import { executionPrincipal } from "../helpers/governance-execution";
import { login } from "../helpers/http";
test("preflight UI cannot cast ballots or produce authority", async ({ page, context, baseURL }) => {
 test.setTimeout(120000);
 const id = `RES_SIM_BROWSER_${randomUUID().slice(0, 8)}`, p = await executionPrincipal(), cookie = await login("ceo@beyu.os");
 await db.insert(resolutions).values({ id, reference: id, tenantId: p.tenantId, bodyId: "GOV_GROUP_BOARD", title: id, category: "POLICY", summary: "UI read-only preflight", rationale: "test", dataBasis: "test", consequences: "test", proposedBy: p.userId, requiredMajority: "SIMPLE", status: "TABLED", classification: "RESTRICTED" });
 try {
  await context.addCookies(cookie.split("; ").map((s) => { const i = s.indexOf("="); return { name: s.slice(0, i), value: s.slice(i+1), url: baseURL! }; }));
  await page.goto("/os/governance"); const panel = page.getByTestId(`simulation-${id}`);
  await panel.locator("summary").click(); await expect(panel.getByText("Hypothetical only. This cannot grant authority, cast votes, approve, execute or close work.")).toBeVisible();
  const response = page.waitForResponse((r) => r.url().endsWith(`/resolutions/${id}/simulation`) && r.request().method() === "POST");
  await panel.getByRole("button", { name: "Run read-only preflight" }).click(); expect((await response).status()).toBe(200);
  await expect(panel.getByText("SIMULATION ONLY — NO AUTHORITY OR APPROVAL GRANTED")).toBeVisible();
  await panel.getByText("Observed checks and limitations").click();
  await expect(panel.getByText(/independent country grants, delegation instruments and full approval chains are not certified/)).toBeVisible();
  expect(await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, id))).toHaveLength(0);
  expect((await db.select().from(resolutions).where(eq(resolutions.id, id)))[0].status).toBe("TABLED");
 } finally { await db.delete(resolutionVotes).where(eq(resolutionVotes.resolutionId, id)); await db.delete(resolutions).where(eq(resolutions.id, id)); }
});
