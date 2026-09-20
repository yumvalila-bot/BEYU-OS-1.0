import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies, governanceMembers, governanceCharters, roleAssignments } from "../../src/db/schema";
import { apiPost, login, serverAvailable, baseUrl } from "../helpers/http";
import { bodyActivationFixture, activationBallot, cleanupBodyActivation } from "../helpers/body-activation";
const available=await serverAvailable();
let f:Awaited<ReturnType<typeof bodyActivationFixture>>,chair:string,secretary:string,candidate:string,id:string;
type Result={data:{id:string;status:string;revision:number}};
const path=()=>`/api/v1/governance/bodies/${f.childId}/activations`;
const input=()=>({nominationIds:f.nominations.map(n=>n.id),rationale:"Freeze this exact superior-approved and consented composition"});
const command=(command:string,expectedRevision:number, cookie=secretary, extra={},key=crypto.randomUUID())=>apiPost<Result>(`${path()}/${id}`,{command,expectedRevision,note:"Review current authority and immutable initial composition",...extra},{cookie,idempotencyKey:key});
describe.skipIf(!available)("whole body activation actual HTTP",()=>{
 beforeAll(async()=>{await cleanupBodyActivation("BODY_ACT_HTTP");f=await bodyActivationFixture("BODY_ACT_HTTP");chair=await login(f.chair.email);secretary=await login(f.secretary.email);candidate=await login(f.candidate.email);},120000);
 afterAll(()=>cleanupBodyActivation("BODY_ACT_HTTP"));
 it("denies anonymous, nonpresiding and caller-forged authority",async()=>{
  expect((await apiPost(path(),input())).status).toBe(401);
  expect((await apiPost(path(),input(),{cookie:candidate})).status).toBe(403);
  for(const extra of [{authorityBodyId:f.childId},{status:"ACTIVE"},{classification:"PUBLIC"}])expect((await apiPost(path(),{...input(),...extra},{cookie:chair})).status).toBe(422);
  expect((await fetch(`${baseUrl()}${path()}`,{method:"POST",headers:{cookie:chair,"content-type":"application/json"},body:"{"})).status).toBe(422);
 });
 it("freezes exact composition once and requires independent exact superior approval",async()=>{
  const key=crypto.randomUUID(),created=await apiPost<Result>(path(),input(),{cookie:chair,idempotencyKey:key});expect(created.status,JSON.stringify(created.body)).toBe(201);id=created.body.data.id;
  expect((await apiPost<Result>(path(),input(),{cookie:chair,idempotencyKey:key})).body.data.id).toBe(id);
  expect((await command("SUBMIT",1,chair)).status).toBe(200);
  const resolutionId=await activationBallot(id,f);
  expect((await command("APPROVE",2,chair,{resolutionId})).status).toBe(403);
  const approved=await command("APPROVE",2,secretary,{resolutionId});expect(approved.status,JSON.stringify(approved.body)).toBe(200);
 });
 it.each(["expired","revoked"])("denies %s live grants without membership side effects",async(kind)=>{
  const grants=await db.select().from(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  if(kind==="expired")await db.update(roleAssignments).set({effectiveTo:"2000-01-01"}).where(eq(roleAssignments.userId,f.secretary.userId));
  else await db.delete(roleAssignments).where(eq(roleAssignments.userId,f.secretary.userId));
  try{expect((await command("ACTIVATE",3)).status).toBe(403);expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))).toHaveLength(0);}
  finally{if(kind==="revoked")await db.insert(roleAssignments).values(grants);else for(const g of grants)await db.update(roleAssignments).set({effectiveTo:g.effectiveTo}).where(eq(roleAssignments.id,g.id));}
 });
 it("denies wrong body, then atomically activates and safely replays without duplicate membership",async()=>{
  expect((await apiPost(`/api/v1/governance/bodies/${f.bodyId}/activations/${id}`,{command:"ACTIVATE",expectedRevision:3,note:"Wrong governing body cannot supply authority"},{cookie:secretary,idempotencyKey:crypto.randomUUID()})).status).toBe(404);
  const key=crypto.randomUUID(),result=await command("ACTIVATE",3,secretary,{},key);expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.data.status).toBe("ACTIVE");
  const replay=await command("ACTIVATE",3,secretary,{},key);expect(replay.status,JSON.stringify(replay.body)).toBe(200);expect(replay.body.data).toEqual(result.body.data);
  expect((await command("ACTIVATE",3)).status).toBe(409);
  expect((await db.select().from(governanceBodies).where(eq(governanceBodies.id,f.childId)))[0].status).toBe("ACTIVE");
  expect((await db.select().from(governanceCharters).where(eq(governanceCharters.id,f.initialCharterId)))[0].status).toBe("ADOPTED");
  expect(await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))).toHaveLength(4);
 });
});
