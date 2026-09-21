import "dotenv/config";
import "../setup-env";
import { test,expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceMembers,roleAssignments,resolutions } from "../../src/db/schema";
import { membershipFixture,membershipBallot,cleanupMembership } from "../helpers/membership";
import { login } from "../helpers/http";
let f:Awaited<ReturnType<typeof membershipFixture>>;
test.beforeAll(async()=>{await cleanupMembership("MEMBER_BROWSER");f=await membershipFixture("MEMBER_BROWSER");});
test.afterAll(()=>cleanupMembership("MEMBER_BROWSER"));
test("superior suspension removes live authority; independent reinstatement and personal resignation preserve history",async({page,context,baseURL})=>{
 test.setTimeout(300000);
 const member=f.members.find(m=>m.partyId===f.candidate.partyId)!;
 const panel=page.locator(`[data-membership-body="${f.childId}"]`),card=panel.locator(`[data-membership-id="${member.id}"]`);
 async function identity(email:string){const cookie=await login(email);await context.clearCookies();await context.addCookies(cookie.split("; ").map(s=>{const i=s.indexOf("=");return{name:s.slice(0,i),value:s.slice(i+1),url:baseURL!};}));await page.goto("/os/governance");await panel.locator("summary").click();}
 async function propose(command:string){await card.getByLabel("Membership action").selectOption(command);await card.getByLabel("Membership instrument document ID").fill("DOC_D4");await card.getByLabel("Membership change rationale").fill("Preserve original membership evidence while enforcing current human authority");const pending=page.waitForResponse(r=>r.url().endsWith(`/members/${member.id}/changes`)&&r.request().method()==="POST");await card.getByRole("button",{name:"Record membership request"}).click();const r=await pending;expect(r.status()).toBe(201);return (await r.json()).data.id as string;}
 await identity(f.chair.email);const suspended=await propose("SUSPEND"),resolutionId=await membershipBallot(suspended,f);
 await expect(card.getByRole("heading")).toContainText("ACTIVE");
 await identity(f.secretary.email);const change=card.locator(`[data-membership-change="${suspended}"]`);
 await change.getByLabel("Approved membership-specific RESERVED_MATTER resolution ID").fill(resolutionId);await change.getByLabel("Independent membership review note").fill("Independently apply this superior-authorized suspension");
 const grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));await db.update(roleAssignments).set({effectiveTo:"2000-01-01"}).where(eq(roleAssignments.userId,f.secretary.userId));let key:string|null=null;
 try{const pending=page.waitForResponse(r=>r.url().endsWith(`/membership-changes/${suspended}`)&&r.request().method()==="POST");await change.getByRole("button",{name:"Apply independent membership decision"}).click();const denial=await pending;expect(denial.status()).toBe(403);key=await denial.request().headerValue("idempotency-key");}finally{for(const g of grants)await db.update(roleAssignments).set({effectiveTo:g.effectiveTo}).where(eq(roleAssignments.id,g.id));}
 const pending=page.waitForResponse(r=>r.url().endsWith(`/membership-changes/${suspended}`)&&r.request().method()==="POST");await change.getByRole("button",{name:"Apply independent membership decision"}).click();const applied=await pending;expect(applied.status()).toBe(200);expect(await applied.request().headerValue("idempotency-key")).toBe(key);await expect(card.getByRole("heading")).toContainText("SUSPENDED");
 const draftId="RES_MEMBER_BROWSER_LIVE";await db.insert(resolutions).values({id:draftId,reference:draftId,tenantId:f.chair.tenantId,bodyId:f.childId,title:"Current presiding authority proof",category:"POLICY",summary:"Fixture",rationale:"Fixture",dataBasis:"Fixture",consequences:"No powers granted",proposedBy:f.candidate.userId,status:"DRAFT",classification:"PUBLIC"});
 await identity(f.candidate.email);
 const denied=await page.request.post(`/api/v1/governance/resolutions/${draftId}/table`,{data:{},headers:{"idempotency-key":crypto.randomUUID()}});expect(denied.status()).toBe(403);
 const other=f.members.find(m=>m.id!==member.id)!;expect((await page.request.post(`/api/v1/governance/bodies/${f.childId}/members/${other.id}/changes`,{data:{command:"RESIGN",expectedRevision:0,documentId:"DOC_D4",rationale:"Cannot resign on behalf of another human member"},headers:{"idempotency-key":crypto.randomUUID()}})).status()).toBe(403);
 await identity(f.chair.email);const restored=await propose("REINSTATE"),restoreDecision=await membershipBallot(restored,f);
 await identity(f.secretary.email);const reinstate=card.locator(`[data-membership-change="${restored}"]`);await reinstate.getByLabel("Approved membership-specific RESERVED_MATTER resolution ID").fill(restoreDecision);await reinstate.getByLabel("Independent membership review note").fill("Restore eligibility only within the original unchanged term");await reinstate.getByRole("button",{name:"Apply independent membership decision"}).click();await expect(card.getByRole("heading")).toContainText("ACTIVE");
 await identity(f.candidate.email);await propose("RESIGN");await expect(card.getByRole("heading")).toContainText("RESIGNED");await expect(card).toContainText("SUSPEND · APPLIED");await expect(card).toContainText("REINSTATE · APPLIED");await expect(card).toContainText("RESIGN · APPLIED");
 await page.reload();await panel.locator("summary").click();await expect(card.getByRole("heading")).toContainText("RESIGNED");
 expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id,member.id)))[0]).toEqual({...member,lifecycleStatus:"RESIGNED",lifecycleRevision:3});
});
