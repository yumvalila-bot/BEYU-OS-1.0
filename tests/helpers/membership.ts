import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceMembers, governanceMembershipChanges, resolutions, resolutionVotes } from "../../src/db/schema";
import { bodyActivationFixture, activationBallot, cleanupBodyActivation, activationContext as ctx } from "./body-activation";
import { asAppointmentActor as as } from "./appointments";
import { proposeBodyActivation, commandBodyActivation } from "../../src/lib/governance/activation-service";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
export async function membershipFixture(prefix:string){
 const f=await bodyActivationFixture(prefix);
 const p=await as(f.chair,()=>proposeBodyActivation(f.chair,f.childId,{nominationIds:f.nominations.map(n=>n.id),rationale:"Activate consented initial members for lifecycle proof"},ctx));
 await as(f.chair,()=>commandBodyActivation(f.chair,f.childId,p.id,{command:"SUBMIT",expectedRevision:1,note:"Review complete initial membership"},ctx));
 const resolutionId=await activationBallot(p.id,f);
 await as(f.secretary,()=>commandBodyActivation(f.secretary,f.childId,p.id,{command:"APPROVE",expectedRevision:2,resolutionId,note:"Approve exact initial composition"},ctx));
 await as(f.secretary,()=>commandBodyActivation(f.secretary,f.childId,p.id,{command:"ACTIVATE",expectedRevision:3,note:"Activate exact canonical composition"},ctx));
 return {...f,members:await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.childId))};
}
export async function membershipBallot(id:string,f:Awaited<ReturnType<typeof membershipFixture>>){
 const [change]=await db.select().from(governanceMembershipChanges).where(eq(governanceMembershipChanges.id,id));
 const resolutionId=`RES_${id}`;
 await db.insert(resolutions).values({id:resolutionId,reference:resolutionId,tenantId:f.chair.tenantId,bodyId:f.bodyId,title:"Exact membership lifecycle request",category:"RESERVED_MATTER",summary:"Lifecycle proof",rationale:"Independent superior review",dataBasis:"Exact immutable member/change",consequences:"Membership is not RBAC or Finance capability",proposedBy:f.chair.userId,status:"TABLED",requiredMajority:"SIMPLE",classification:change.classification,linkedObjectType:"GOVERNANCE_MEMBERSHIP_CHANGE",linkedObjectId:id,votingOpensAt:new Date(0),votingClosesAt:new Date(1)});
 for(const m of await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.bodyId)))await db.insert(resolutionVotes).values({id:`${resolutionId}_${m.id}`,resolutionId,memberId:m.id,vote:"FOR"});
 await as(f.chair,()=>decideResolutionClosure(f.chair,{resolutionId},ctx));return resolutionId;
}
export async function cleanupMembership(prefix:string){await db.execute(sql`delete from governance_membership_changes where body_id in(select body_id from governance_body_establishments where parent_body_id=${`GOV_${prefix}`})`);await cleanupBodyActivation(prefix);}
