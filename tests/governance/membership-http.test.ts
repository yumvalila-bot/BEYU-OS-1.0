import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceMembers,roleAssignments } from "../../src/db/schema";
import { membershipFixture,membershipBallot,cleanupMembership } from "../helpers/membership";
import { apiPost,login,serverAvailable } from "../helpers/http";
const available=await serverAvailable();
let f:Awaited<ReturnType<typeof membershipFixture>>,chair:string,secretary:string,candidate:string,memberId:string,id:string,resolutionId:string;
type Result={data:{id:string;status:string}};
const path=()=>`/api/v1/governance/bodies/${f.childId}`;
const proposal=(command="SUSPEND",revision=0)=>({command,expectedRevision:revision,documentId:"DOC_D4",rationale:"Current independent authority and exact historical membership"});
describe.skipIf(!available)("membership lifecycle actual HTTP",()=>{
 beforeAll(async()=>{await cleanupMembership("MEMBER_HTTP");f=await membershipFixture("MEMBER_HTTP");memberId=f.members.find(m=>m.partyId===f.candidate.partyId)!.id;chair=await login(f.chair.email);secretary=await login(f.secretary.email);candidate=await login(f.candidate.email);},120000);
 afterAll(()=>cleanupMembership("MEMBER_HTTP"));
 it("denies anonymous, nonpresider, wrong-person resignation and caller-selected authority",async()=>{
  const url=`${path()}/members/${memberId}/changes`;
  expect((await apiPost(url,proposal())).status).toBe(401);
  expect((await apiPost(url,proposal(),{cookie:candidate})).status).toBe(403);
  expect((await apiPost(url,proposal("RESIGN"),{cookie:secretary})).status).toBe(403);
  expect((await apiPost(url,{...proposal(),authorityBodyId:f.childId},{cookie:chair})).status).toBe(422);
 });
 it("records a non-authorizing proposal with safe replay and exact independent mandate",async()=>{
  const key=crypto.randomUUID(),url=`${path()}/members/${memberId}/changes`;
  const r=await apiPost<Result>(url,proposal(),{cookie:chair,idempotencyKey:key});expect(r.status,JSON.stringify(r.body)).toBe(201);id=r.body.data.id;
  expect((await apiPost<Result>(url,proposal(),{cookie:chair,idempotencyKey:key})).body.data.id).toBe(id);resolutionId=await membershipBallot(id,f);
  expect((await apiPost(`${path()}/membership-changes/${id}`,{resolutionId,note:"Proposer cannot independently apply their own request"},{cookie:chair,idempotencyKey:crypto.randomUUID()})).status).toBe(403);
 });
 it("denies revoked grants then applies/replays once without changing roles or original dates",async()=>{
  const grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));await db.delete(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  const input={resolutionId,note:"Independent superior applies exact suspension evidence"},key=crypto.randomUUID(),url=`${path()}/membership-changes/${id}`;
  try{expect((await apiPost(url,input,{cookie:secretary,idempotencyKey:key})).status).toBe(403);}finally{await db.insert(roleAssignments).values(grants);}
  const r=await apiPost<Result>(url,input,{cookie:secretary,idempotencyKey:key});expect(r.status,JSON.stringify(r.body)).toBe(200);expect((await apiPost<Result>(url,input,{cookie:secretary,idempotencyKey:key})).body.data).toEqual(r.body.data);
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id,memberId)))[0]).toEqual({...f.members.find(m=>m.id===memberId),lifecycleStatus:"SUSPENDED",lifecycleRevision:1});
 });
 it("permits only the affected human's resignation, retains suspended and resigned history",async()=>{
  const r=await apiPost<Result>(`${path()}/members/${memberId}/changes`,proposal("RESIGN",1),{cookie:candidate,idempotencyKey:crypto.randomUUID()});expect(r.status,JSON.stringify(r.body)).toBe(201);expect(r.body.data.status).toBe("APPLIED");
  expect((await db.select().from(governanceMembers).where(eq(governanceMembers.id,memberId)))[0].lifecycleStatus).toBe("RESIGNED");
 });
});
