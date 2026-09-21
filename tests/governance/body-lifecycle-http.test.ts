import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies,roleAssignments } from "../../src/db/schema";
import { bodyLifecycleFixture,bodyChangeBallot,cleanupBodyLifecycle } from "../helpers/body-lifecycle";
import { apiPost,login,serverAvailable } from "../helpers/http";
const available=await serverAvailable();let f:Awaited<ReturnType<typeof bodyLifecycleFixture>>,chair:string,secretary:string,candidate:string,id:string,resolutionId:string;
const path=()=>`/api/v1/governance/bodies/${f.childId}/lifecycle-changes`;
const proposal=(command="SUSPEND",expectedRevision=0)=>({command,expectedRevision,documentId:"DOC_D4",rationale:"Current independent body authority and retained history"});
type Result={data:{id:string;status:string;appliedByPartyId:string}};
describe.skipIf(!available)("body lifecycle actual HTTP boundary",()=>{
 beforeAll(async()=>{await cleanupBodyLifecycle("BODY_LIFE_HTTP");f=await bodyLifecycleFixture("BODY_LIFE_HTTP");chair=await login(f.chair.email);secretary=await login(f.secretary.email);candidate=await login(f.candidate.email);},120000);
 afterAll(()=>cleanupBodyLifecycle("BODY_LIFE_HTTP"));
 it("denies anonymous, child self-authority and caller-selected superior",async()=>{
  expect((await apiPost(path(),proposal())).status).toBe(401);
  expect((await apiPost(path(),proposal(),{cookie:candidate})).status).toBe(403);
  expect((await apiPost(path(),{...proposal(),authorityBodyId:f.childId},{cookie:chair})).status).toBe(422);
 });
 it("proposes without changing body state and replays exactly",async()=>{
  const key=crypto.randomUUID(),r=await apiPost<Result>(path(),proposal(),{cookie:chair,idempotencyKey:key});expect(r.status,JSON.stringify(r.body)).toBe(201);id=r.body.data.id;
  expect((await apiPost<Result>(path(),proposal(),{cookie:chair,idempotencyKey:key})).body.data.id).toBe(id);expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId)))[0].status).toBe("ACTIVE");resolutionId=await bodyChangeBallot(id,f);
  expect((await apiPost(`${path()}/${id}`,{resolutionId,note:"Proposer cannot apply their own body request"},{cookie:chair,idempotencyKey:crypto.randomUUID()})).status).toBe(403);
 });
 it("rechecks revoked authority, then applies/replays once with retained original identity",async()=>{
  const grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));await db.delete(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  const input={resolutionId,note:"Independently apply this exact body state decision"},key=crypto.randomUUID(),url=`${path()}/${id}`;
  try{expect((await apiPost(url,input,{cookie:secretary,idempotencyKey:key})).status).toBe(403);}finally{await db.insert(roleAssignments).values(grants);}
  const r=await apiPost<Result>(url,input,{cookie:secretary,idempotencyKey:key});expect(r.status,JSON.stringify(r.body)).toBe(200);expect(r.body.data.appliedByPartyId).toBe(f.secretary.partyId);expect((await apiPost<Result>(url,input,{cookie:secretary,idempotencyKey:key})).body.data).toEqual(r.body.data);
  expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId)))[0].status).toBe("SUSPENDED");
 });
 it("resumes, dissolves and archives through exact independent decisions",async()=>{
  for(const [i,command] of ["RESUME","DISSOLVE","ARCHIVE"].entries()){
   const r=await apiPost<Result>(path(),proposal(command,i+1),{cookie:chair,idempotencyKey:crypto.randomUUID()});expect(r.status,JSON.stringify(r.body)).toBe(201);const rid=await bodyChangeBallot(r.body.data.id,f);
   const applied=await apiPost(`${path()}/${r.body.data.id}`,{resolutionId:rid,note:"Independently apply a complete body lifecycle transition"},{cookie:secretary,idempotencyKey:crypto.randomUUID()});expect(applied.status,JSON.stringify(applied.body)).toBe(200);
  }
  expect((await apiPost(path(),proposal("RESUME",4),{cookie:chair,idempotencyKey:crypto.randomUUID()})).status).toBe(422);
  expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId)))[0].status).toBe("RETIRED");
 });
});
