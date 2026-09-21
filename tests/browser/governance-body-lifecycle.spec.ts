import "dotenv/config";
import "../setup-env";
import { test,expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies,governanceMembers,roleAssignments } from "../../src/db/schema";
import { bodyLifecycleFixture,bodyChangeBallot,cleanupBodyLifecycle } from "../helpers/body-lifecycle";
import { login } from "../helpers/http";
let f:Awaited<ReturnType<typeof bodyLifecycleFixture>>;
test.beforeAll(async()=>{await cleanupBodyLifecycle("BODY_LIFE_BROWSER");f=await bodyLifecycleFixture("BODY_LIFE_BROWSER");});
test.afterAll(()=>cleanupBodyLifecycle("BODY_LIFE_BROWSER"));
test("independent superior suspension, resumption, dissolution and archival retain canonical history",async({page,context,baseURL})=>{
 test.setTimeout(300000);
 const panel=page.locator(`[data-body-lifecycle="${f.childId}"]`);
 async function identity(email:string){const cookie=await login(email);await context.clearCookies();await context.addCookies(cookie.split("; ").map(s=>{const i=s.indexOf("=");return{name:s.slice(0,i),value:s.slice(i+1),url:baseURL!};}));await page.goto("/os/governance");await panel.locator("summary").click();}
 await identity(f.candidate.email);
 expect((await page.request.post(`/api/v1/governance/bodies/${f.childId}/lifecycle-changes`,{data:{command:"SUSPEND",expectedRevision:0,documentId:"DOC_D4",rationale:"Child authority cannot authorize its own cessation"},headers:{"idempotency-key":crypto.randomUUID()}})).status()).toBe(403);
 for(const command of ["SUSPEND","RESUME","DISSOLVE","ARCHIVE"]){
  await identity(f.chair.email);await panel.getByLabel("Body lifecycle action").selectOption(command);await panel.getByLabel("Body lifecycle instrument document ID").fill("DOC_D4");await panel.getByLabel("Body lifecycle rationale").fill("An exact superior decision preserves immutable body history");
  const pending=page.waitForResponse(r=>r.url().endsWith(`/bodies/${f.childId}/lifecycle-changes`)&&r.request().method()==="POST");await panel.getByRole("button",{name:"Propose body lifecycle change"}).click();const proposed=await pending;expect(proposed.status()).toBe(201);const id=(await proposed.json()).data.id as string,rid=await bodyChangeBallot(id,f);
  await identity(f.secretary.email);const change=panel.locator(`[data-body-change="${id}"]`);await change.getByLabel("Approved body-specific RESERVED_MATTER resolution ID").fill(rid);await change.getByLabel("Independent body lifecycle review note").fill("Independently apply this exact current superior mandate");
  let key:string|null=null;
  if(command==="SUSPEND"){
   const grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));await db.update(roleAssignments).set({effectiveTo:"2000-01-01"}).where(eq(roleAssignments.userId,f.secretary.userId));
   try{const denied=page.waitForResponse(r=>r.url().endsWith(`/lifecycle-changes/${id}`)&&r.request().method()==="POST");await change.getByRole("button",{name:"Apply independent body lifecycle decision"}).click();const r=await denied;expect(r.status()).toBe(403);key=await r.request().headerValue("idempotency-key");}finally{for(const g of grants)await db.update(roleAssignments).set({effectiveTo:g.effectiveTo}).where(eq(roleAssignments.id,g.id));}
  }
  const applied=page.waitForResponse(r=>r.url().endsWith(`/lifecycle-changes/${id}`)&&r.request().method()==="POST");await change.getByRole("button",{name:"Apply independent body lifecycle decision"}).click();const response=await applied;expect(response.status()).toBe(200);if(key)expect(await response.request().headerValue("idempotency-key")).toBe(key);
  const label=command==="SUSPEND"?"SUSPENDED":command==="RESUME"?"ACTIVE":command==="DISSOLVE"?"DISSOLVED":"ARCHIVED";await expect(panel.getByRole("heading")).toContainText(label);
 }
 await page.reload();await panel.locator("summary").click();await expect(panel.getByRole("heading")).toContainText("ARCHIVED");await expect(panel.getByRole("button",{name:"Propose body lifecycle change"})).toHaveCount(0);
 for(const command of ["SUSPEND","RESUME","DISSOLVE","ARCHIVE"])await expect(panel).toContainText(`${command} · APPLIED`);
 expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId)))[0].status).toBe("RETIRED");expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))).toEqual(f.members);
});
