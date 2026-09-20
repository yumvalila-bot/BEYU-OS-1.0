import { createGovernanceAction, commandGovernanceAction } from "../../src/lib/governance/action-service";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodyChanges, governanceMembers, resolutions, resolutionVotes } from "../../src/db/schema";
import { membershipFixture, cleanupMembership } from "./membership";
import { asAppointmentActor as as } from "./appointments";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
export const ctx={traceId:"BODY_LIFECYCLE_PROOF"};
export { membershipFixture };
export async function bodyChangeBallot(id:string,f:Awaited<ReturnType<typeof membershipFixture>>){
 const [change]=await db.select().from(governanceBodyChanges).where(eq(governanceBodyChanges.id,id));
 const resolutionId=`RES_${id}`;
 await db.insert(resolutions).values({id:resolutionId,reference:resolutionId,tenantId:f.chair.tenantId,bodyId:f.bodyId,title:"Exact body lifecycle request",category:"RESERVED_MATTER",summary:"Lifecycle proof",rationale:"Independent superior review",dataBasis:"Exact immutable member/change",consequences:"Membership is not RBAC or Finance capability",proposedBy:f.chair.userId,status:"TABLED",requiredMajority:"SIMPLE",classification:change.classification,linkedObjectType:"GOVERNANCE_BODY_CHANGE",linkedObjectId:id,votingOpensAt:new Date(0),votingClosesAt:new Date(1)});
 for(const m of await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId,f.bodyId)))await db.insert(resolutionVotes).values({id:`${resolutionId}_${m.id}`,resolutionId,memberId:m.id,vote:"FOR"});
 await as(f.chair,()=>decideResolutionClosure(f.chair,{resolutionId},ctx));return resolutionId;
}

export async function bodyLifecycleFixture(prefix:string){
 const f=await membershipFixture(prefix),historyId=`RES_${prefix}_HISTORY`;
 await db.insert(resolutions).values({id:historyId,reference:historyId,tenantId:f.chair.tenantId,bodyId:f.childId,title:"Original body decision history",category:"POLICY",summary:"Fixture",rationale:"Fixture",dataBasis:"Fixture",consequences:"No grants",proposedBy:f.candidate.userId,status:"TABLED",requiredMajority:"SIMPLE",classification:"PUBLIC",votingOpensAt:new Date(0),votingClosesAt:new Date(1)});
 for(const m of f.members)await db.insert(resolutionVotes).values({id:`${historyId}_${m.id}`,resolutionId:historyId,memberId:m.id,vote:"FOR"});
 await as(f.candidate,()=>decideResolutionClosure(f.candidate,{resolutionId:historyId},ctx));
 let action=await as(f.candidate,()=>createGovernanceAction(f.candidate,historyId,{title:"Historical closed body mandate",description:"Implementation and independent verification survive body dissolution",priority:"NORMAL",dueAt:"2030-12-31T00:00:00Z"},ctx));
 action=await as(f.candidate,()=>commandGovernanceAction(f.candidate,action.id,{command:"ASSIGN",expectedVersion:action.version,assigneeUserId:f.candidates[2].userId,note:"Assign a separately identified implementer"},ctx));
 action=await as(f.candidates[2],()=>commandGovernanceAction(f.candidates[2],action.id,{command:"START",expectedVersion:action.version,note:"Start the mandated implementation"},ctx));
 action=await as(f.candidates[2],()=>commandGovernanceAction(f.candidates[2],action.id,{command:"SUBMIT_EVIDENCE",expectedVersion:action.version,documentId:"DOC_D4",note:"Link immutable implementation evidence"},ctx));
 action=await as(f.candidates[2],()=>commandGovernanceAction(f.candidates[2],action.id,{command:"COMPLETE",expectedVersion:action.version,note:"Submit completed implementation for independent verification"},ctx));
 action=await as(f.candidates[1],()=>commandGovernanceAction(f.candidates[1],action.id,{command:"VERIFY",expectedVersion:action.version,note:"Independently verify the recorded implementation evidence"},ctx));
 action=await as(f.candidates[1],()=>commandGovernanceAction(f.candidates[1],action.id,{command:"CLOSE",expectedVersion:action.version,note:"Close this verified historical mandate"},ctx));
 return {...f,historyId,action};
}
export async function cleanupBodyLifecycle(prefix:string){
 await db.execute(sql`delete from governance_action_evidence where task_id in(select t.id from tasks t join resolutions r on r.id=t.source_resolution_id join governance_body_establishments e on e.body_id=r.body_id where e.parent_body_id=${`GOV_${prefix}`})`);
 await db.execute(sql`delete from tasks where source_resolution_id in(select r.id from resolutions r join governance_body_establishments e on e.body_id=r.body_id where e.parent_body_id=${`GOV_${prefix}`})`);
 await db.execute(sql`delete from governance_body_changes where body_id in(select body_id from governance_body_establishments where parent_body_id=${`GOV_${prefix}`})`);
 await cleanupMembership(prefix);
}
