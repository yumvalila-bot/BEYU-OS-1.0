import "dotenv/config";
import "../setup-env";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceMembers, resolutions } from "../../src/db/schema";
import { claimIdempotencyKey, releaseIdempotencyKey, type IdempotencyOutcome } from "../../src/lib/idempotency";
import { ProposeResolutionSchema } from "../../src/lib/governance-contract";
import { nominateMember } from "../../src/lib/governance/appointment-service";
import { createBodyCharter } from "../../src/lib/governance/charter-service";
import { proposeBodyEstablishment } from "../../src/lib/governance/establishment-service";
import { login } from "../helpers/http";
import { appointmentInput } from "../helpers/appointments";
import { charterFixtureRules } from "../helpers/charters";
import { establishmentFixture, establishmentInput, cleanupEstablishments, asEstablishmentActor as as } from "../helpers/establishments";
const prefix = "PROPOSAL_LINK_BROWSER", ctx = { traceId: "PROPOSAL_LINK_BROWSER" };
let f: Awaited<ReturnType<typeof establishmentFixture>>;
const ids: Record<string, string> = {};
const fixtureClaims: Extract<IdempotencyOutcome, { kind: "PROCEED" }>[] = [];
test.afterEach(async () => { while (fixtureClaims.length) await releaseIdempotencyKey(fixtureClaims.pop()!); });
test.beforeAll(async () => {
 await cleanupEstablishments(prefix); f = await establishmentFixture(prefix);
 ids.GOVERNANCE_APPOINTMENT = (await as(f.chair, () => nominateMember(f.chair, f.bodyId, appointmentInput(f.candidate.userId), ctx))).id;
 ids.GOVERNANCE_CHARTER = (await as(f.chair, () => createBodyCharter(f.chair, f.bodyId, { documentId: "DOC_D4", purpose: "A new draft charter for proposal-link browser verification", rules: charterFixtureRules }, ctx))).id;
 ids.GOVERNANCE_BODY_ESTABLISHMENT = (await as(f.chair, () => proposeBodyEstablishment(f.chair, f.bodyId, establishmentInput(), ctx))).id;
});
test.afterAll(() => cleanupEstablishments(prefix));
for (const [type, category] of [["GOVERNANCE_APPOINTMENT", "APPOINTMENT"], ["GOVERNANCE_CHARTER", "POLICY"], ["GOVERNANCE_BODY_ESTABLISHMENT", "RESERVED_MATTER"]]) {
 test(`browser authors the exact ${type} link and recovers a lost response without duplicate proposals`, async ({ page, context, baseURL }) => {
  test.setTimeout(120000);
  const cookie = await login(f.chair.email);
  await context.addCookies(cookie.split("; ").map((s) => { const i = s.indexOf("="); return { name: s.slice(0,i), value: s.slice(i+1), url: baseURL! }; }));
  await page.goto("/os/governance");
  const form = page.locator("[data-resolution-proposal]"); await form.getByRole("button", { name: "New proposal" }).click();
  await form.getByLabel("Governance body", { exact: true }).selectOption(f.bodyId);
  await form.getByLabel("Category", { exact: true }).selectOption(category);
  await form.getByLabel("Linked governance record", { exact: true }).selectOption(type);
  await form.getByLabel("Linked governance record ID", { exact: true }).fill(ids[type]);
  await form.getByLabel("Title", { exact: true }).fill(`Review exact ${type} evidence`);
  await form.getByLabel("Summary — what is being decided", { exact: true }).fill("Decide the precise linked record through the existing governed resolution chain");
  await form.getByLabel("Rationale — why", { exact: true }).fill("Independent voting and subsequent authority checks remain mandatory");
  await form.getByLabel("Data basis — on which data", { exact: true }).fill("The exact immutable governance record and supporting instrument");
  await form.getByLabel("Consequences", { exact: true }).fill("A draft link grants no membership or execution authority");
  let drop = true, committedId = ""; const keys: string[] = [];
  let held: Extract<IdempotencyOutcome, { kind: "PROCEED" }> | undefined;
  await page.route("**/api/v1/governance/resolutions", async (route) => {
   keys.push(route.request().headers()["idempotency-key"]);
   if (keys.length === 1) {
    // Fixture-only claim, before any domain mutation: exercise the real API's
    // IN_FLIGHT response twice. Never auto-release a potentially committed claim.
    const claim = await claimIdempotencyKey(f.chair, "governance.resolutions.propose", keys[0], ProposeResolutionSchema.parse(route.request().postDataJSON()));
    expect(claim.kind).toBe("PROCEED");
    if (claim.kind !== "PROCEED") throw new Error("Expected an isolated fixture claim");
    held = claim; fixtureClaims.push(claim);
   }
   if (keys.length <= 2) { await route.continue(); return; }
   if (drop) {
    drop = false; const response = await route.fetch(); expect(response.status()).toBe(201);
    committedId = (await response.json()).data.id;
    await route.abort("failed"); // The server committed; the browser did not receive it.
   } else await route.continue();
  });
  for (let attempt = 0; attempt < 2; attempt++) {
   const blocked = page.waitForResponse((r) => r.url().endsWith("/api/v1/governance/resolutions") && r.request().method() === "POST");
   await form.getByRole("button", { name: "Propose resolution", exact: true }).click();
   const result = await blocked;
   expect(result.status(), `in-flight attempt ${attempt + 1}; distinct retry keys: ${new Set(keys).size}`).toBe(409);
   expect((await result.json()).error.code).toBe("REQUEST_IN_PROGRESS");
   await expect(form).toContainText("An identical request is currently being processed.");
  }
  expect(keys[1]).toBe(keys[0]);
  expect(await db.select().from(resolutions).where(eq(resolutions.linkedObjectId, ids[type]))).toHaveLength(0);
  // This isolated fixture claim demonstrably made no domain mutation. Releasing
  // it is test setup, not a runtime/operator-reconciliation shortcut.
  if (!held) throw new Error("Fixture claim was not captured");
  await releaseIdempotencyKey(held);
  fixtureClaims.splice(fixtureClaims.indexOf(held), 1);
  await form.getByRole("button", { name: "Propose resolution", exact: true }).click();
  await expect(form).toContainText("Response unconfirmed. Retry unchanged to recover safely.");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/v1/governance/resolutions") && r.request().method() === "POST");
  await form.getByRole("button", { name: "Propose resolution", exact: true }).click();
  const recovered = await response; expect(recovered.status()).toBe(201); expect((await recovered.json()).data.id).toBe(committedId);
  expect(keys).toHaveLength(4); expect(keys[0]).toBeTruthy(); expect(new Set(keys).size).toBe(1);
  const records = await db.select().from(resolutions).where(eq(resolutions.linkedObjectId, ids[type]));
  expect(records).toHaveLength(1); expect(records[0]).toMatchObject({ id: committedId, bodyId: f.bodyId, linkedObjectType: type, linkedObjectId: ids[type], category, status: "DRAFT", quorumMet: false, votesFor: 0 });
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.partyId, f.candidate.partyId!))).toHaveLength(0);
  await page.reload(); await expect(page.getByText(records[0].reference, { exact: true })).toBeVisible();
 });
}
