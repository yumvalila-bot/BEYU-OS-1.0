import "dotenv/config";
import "../setup-env";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { documents, governanceAppointments, governanceMembers, roleAssignments } from "../../src/db/schema";
import { nominateMember, commandAppointment } from "../../src/lib/governance/appointment-service";
import { login } from "../helpers/http";
import { appointmentFixture, appointmentInput, appointmentBallot, cleanupAppointments, asAppointmentActor as as } from "../helpers/appointments";
let f: Awaited<ReturnType<typeof appointmentFixture>>;
const prefix = "APPT_BROWSER_DENIAL", ctx = { traceId: "APPOINTMENT_BROWSER_DENIAL" };
test.beforeAll(async () => { await cleanupAppointments(prefix); f = await appointmentFixture(prefix); });
test.afterAll(() => cleanupAppointments(prefix));
async function identity(page: Page, context: BrowserContext, baseURL: string, email: string) {
 const cookie = await login(email); await context.clearCookies();
 await context.addCookies(cookie.split("; ").map((s) => { const i = s.indexOf("="); return { name: s.slice(0, i), value: s.slice(i + 1), url: baseURL }; }));
 await page.goto("/os/governance");
}
async function prepared(activate: boolean) {
 const a = await as(f.chair, () => nominateMember(f.chair, f.bodyId, appointmentInput(f.candidate.userId), ctx));
 const resolutionId = await appointmentBallot(a.id, f.chair);
 if (activate) {
  await as(f.secretary, () => commandAppointment(f.secretary, f.bodyId, a.id, { command: "APPROVE", expectedRevision: 1, resolutionId, note: "Independent browser fixture review" }, ctx));
  await as(f.candidate, () => commandAppointment(f.candidate, f.bodyId, a.id, { command: "ACCEPT", expectedRevision: 2, note: "Human nominee consents to bounded term" }, ctx));
 }
 return { a, resolutionId };
}
for (const command of ["APPROVE", "ACTIVATE"] as const) {
 for (const denial of ["expired", "revoked", "wrong entity", "wrong country"] as const) {
  test(`${command}: backend rejects ${denial} authority after the form was rendered`, async ({ page, context, baseURL }) => {
   const { a, resolutionId } = await prepared(command === "ACTIVATE");
   await identity(page, context, baseURL!, f.secretary.email);
   const panel = page.locator(`[data-appointment-body="${f.bodyId}"]`); await panel.locator("summary").click();
   const card = panel.locator(`[data-appointment-id="${a.id}"]`);
   await card.getByLabel("Appointment review / consent note").fill("Recheck fresh backend authority, never trust the rendered form");
   if (command === "APPROVE") await card.getByLabel("Approved nomination-specific APPOINTMENT resolution ID").fill(resolutionId);
   const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
   const [doc] = await db.select().from(documents).where(eq(documents.id, a.documentId));
   if (denial === "revoked") await db.delete(roleAssignments).where(eq(roleAssignments.userId, f.secretary.userId));
   else if (denial === "wrong country") await db.update(documents).set({ jurisdictionCode: "ZZ" }).where(eq(documents.id, doc.id));
   else await db.update(roleAssignments).set(denial === "expired" ? { effectiveTo: "2000-01-01" } : { legalEntityId: "LEN_BEYU_FAMILY_TRUST" }).where(eq(roleAssignments.userId, f.secretary.userId));
   try {
    const response = page.waitForResponse((r) => r.url().endsWith(`/appointments/${a.id}`) && r.request().method() === "POST");
    await card.getByRole("button", { name: command === "APPROVE" ? "Record independent appointment approval" : "Activate canonical membership" }).click();
    const result = await response;
    expect(denial === "wrong country" ? [422] : [403, 404]).toContain(result.status());
    await expect(panel.getByRole("status")).not.toHaveText("Recorded; server state refreshed.");
    const [persisted] = await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.id));
    expect(persisted.status).toBe(command === "APPROVE" ? "NOMINATED" : "ACCEPTED");
    expect(persisted.memberId).toBeNull();
    expect(await db.select().from(governanceMembers).where(eq(governanceMembers.partyId, f.candidate.partyId!))).toHaveLength(0);
   } finally {
    if (denial === "revoked") await db.insert(roleAssignments).values(grants);
    else for (const g of grants) await db.update(roleAssignments).set({ effectiveTo: g.effectiveTo, legalEntityId: g.legalEntityId }).where(eq(roleAssignments.id, g.id));
    await db.update(documents).set({ jurisdictionCode: doc.jurisdictionCode }).where(eq(documents.id, doc.id));
   }
   await page.reload(); await panel.locator("summary").click(); await expect(card).toContainText(command === "APPROVE" ? "NOMINATED" : "ACCEPTED");
  });
 }
}
test("a non-presider cannot nominate even by bypassing hidden controls", async ({ page, context, baseURL }) => {
 await identity(page, context, baseURL!, f.candidate.email);
 const panel = page.locator(`[data-appointment-body="${f.bodyId}"]`); await panel.locator("summary").click();
 await expect(panel.getByRole("button", { name: "Nominate a body member" })).toHaveCount(0);
 const result = await page.evaluate(async ({ url, body }) => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) }); return response.status;
 }, { url: `/api/v1/governance/bodies/${f.bodyId}/appointments`, body: appointmentInput(f.chair.userId) });
 expect(result).toBe(403);
});
test("non-nominee cannot consent through a forged browser request", async ({ page, context, baseURL }) => {
 const { a, resolutionId } = await prepared(false);
 await as(f.secretary, () => commandAppointment(f.secretary, f.bodyId, a.id, { command: "APPROVE", expectedRevision: 1, resolutionId, note: "Independent review before nominee acceptance" }, ctx));
 await identity(page, context, baseURL!, f.secretary.email);
 const panel = page.locator(`[data-appointment-body="${f.bodyId}"]`); await panel.locator("summary").click();
 const card = panel.locator(`[data-appointment-id="${a.id}"]`);
 await expect(card.getByRole("button", { name: "Accept appointment terms" })).toHaveCount(0);
 const result = await page.evaluate(async (url) => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ command: "ACCEPT", expectedRevision: 2, note: "Attempt to accept for another human" }) }); return response.status;
 }, `/api/v1/governance/bodies/${f.bodyId}/appointments/${a.id}`);
 expect(result).toBe(403);
 await page.reload(); await panel.locator("summary").click(); await expect(card).toContainText("APPROVED");
 expect((await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, a.id)))[0].acceptedAt).toBeNull();
});
